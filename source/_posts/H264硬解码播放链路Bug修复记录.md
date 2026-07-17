---
title: "H.264 硬解码播放链路 Bug 修复记录"
date: 2026-06-22
categories:
  - Bug 修复
tags:
  - H.264
  - 硬件解码
  - MSI
  - framebuff
  - TXW82x
  - BugFix
toc_number: false
excerpt: "修复 H.264 文件播放链路中 3 个关键 Bug：start_len 未动态设置导致 start code 长度错误、fb->len 未赋值导致 memcpy 失败、解码端 dst/dst_len 计算依赖前两项正确性。"

---

# H.264 硬解码播放链路 Bug 修复记录

## 概述

在 TXW82x 平台 H.264 硬解码播放功能开发过程中，定位并修复了 H.264 文件解复用（`h264_file_msi`）与硬件解码（`h264_decode_msi`）链路上的 3 个关键 Bug。这些 Bug 共同导致解码输出花屏、解码器崩溃或完全不输出。

---

## 涉及文件

| 文件 | 路径 | 角色 |
|------|------|------|
| `h264_file_msi.c` | `sdk/app/h264_demux/` | H.264 文件解复用器，从 SD 卡读取 NAL 流，封装 framebuff 发出 |
| `h264_decode_msi.c` | `sdk/app/decode/` | H.264 硬件解码 MSI 组件，消费 framebuff 送入硬件解码 |
| `sample_h264_esplayer.c` | `project/app/` | H.264 ES 流播放 Sample，作为参考实现 |
| `stream_define.h` | `sdk/app/algorithm/stream_frame/` | `fb_h264_s` 结构定义 |

---

## Bug 1：`start_len` 未动态设置

### 现象

解码器在 `h264_decode_msi.c` 中通过以下代码计算 NAL 有效载荷的偏移和长度：

```c
uint32_t dst = (uint32_t) rfb->data + h264_priv->start_len;
uint32_t dst_len = rfb->len - h264_priv->start_len;
```

当 `start_len` 被硬编码为固定值（如 4）时，如果实际文件使用 3 字节起始码（`00 00 01`），则：
- `dst` 多偏移了 1 字节，指向错误位置
- `dst_len` 少算了 1 字节，长度不正确
- 后续 `h264_rom_memcpy()` 拷贝错误数据送入硬件解码器，导致花屏或解码器异常

### 根因

H.264 Annex-B 格式的起始码（start code）有两种长度：
- **3 字节**：`0x00 0x00 0x01`
- **4 字节**：`0x00 0x00 0x00 0x01`

`fb_h264_s.start_len` 字段用于记录起始码长度，告诉解码器需要跳过多少字节才能到达 NAL 单元的真实数据。之前代码中未根据实际扫描到的起始码动态赋值，而是使用了固定值。

### 修复

#### `h264_file_msi.c` — 帧发送路径

```c
// 旧：start_len 可能为固定值或未正确设置
// 新：使用实际扫描到的 start code 长度
node->priv.start_len = frame_info.frame_start_len;
```

其中 `frame_info.frame_start_len` 在扫描 NAL 边界时由 `h264_find_start_code()` 动态确定（返回 3 或 4）。

#### `sample_h264_esplayer.c` — Sample 参考实现

```c
// 旧：固定值或缺失
// 新：从实际 NAL 扫描中获取 start_len
h264_priv->start_len = code_len;
```

其中 `code_len` 在扫描起始码时根据字节序列动态判定。

#### `h264_parse_fb_priv()` 中的连带修复

该函数在解析内存中的 NAL 缓冲时，原先使用 `nal_header_offset` 赋值 `start_len`：

```c
// 旧：nal_header_offset = found_offset + start_len
// 当 found_offset != 0 时，start_len 值错误
priv->start_len = (uint8_t)nal_header_offset;

// 新：应使用实际的 start code 长度
priv->start_len = (uint8_t)start_len;
```

> **注：** `found_offset` 是起始码在缓冲中的偏移，`start_len`（局部变量）是起始码长度（3 或 4）。当缓冲头部无填充字节时（`found_offset == 0`），两者数值相同，Bug 不易暴露；但存在前导数据时则计算错误。

---

## Bug 2：`fb->len` 未设置导致 `memcpy` 失败

### 现象

解码器在 `h264_decode_msi.c` 中执行：

```c
h264_rom_memcpy(rom_ptr, (uint8_t *) dst, dst_len);
```

其中 `dst_len = rfb->len - h264_priv->start_len`。当 `fb->len` 为 0 或未赋值时，`dst_len` 计算为负值（类型隐式转换后为极大值），导致：
1. `h264_rom_memcpy` 拷贝超出实际数据范围的无效内存
2. 硬件解码器接收到错误的 NAL 数据
3. 解码超时或崩溃

### 根因

在创建 framebuff 时，`fb->len` 字段未被正确设置为 NAL 单元的实际长度。`fb->len` 是 MSI 管道中下游组件判断数据有效长度的唯一依据。

### 修复

#### `h264_file_msi.c` — 帧发送路径

```c
// 旧：fb->len 未赋值或赋值为 0
// 新：设置为 frame node 的实际数据长度
fb->len = node->len;
fb->data = node->data;   // data 也需同步指向正确缓存
```

#### `sample_h264_esplayer.c` — Sample 参考实现

```c
fb->data = STREAM_MALLOC(nal_size);
fb->len = nal_size;     // ← 关键修复：必须设置长度
```

---

## Bug 3：解码端 `dst` / `dst_len` 计算

### 现象

这是 Bug 1 和 Bug 2 的**消费端**表现。即使前两项已修复，如果 `start_len` 和 `fb->len` 正确，此计算本身是正确的。但该代码对输入的正确性高度敏感：

```c
uint32_t dst     = (uint32_t) rfb->data + h264_priv->start_len;
uint32_t dst_len = rfb->len - h264_priv->start_len;
```

### 逻辑说明

| 变量 | 含义 |
|------|------|
| `rfb->data` | framebuff 数据指针，指向包含起始码的完整 NAL 数据 |
| `rfb->len` | NAL 数据总长度（包含起始码） |
| `h264_priv->start_len` | 起始码长度（3 或 4），跳过起始码到达 NAL type 字节 |
| `dst` | 指向 NAL type 字节（即有效载荷起点） |
| `dst_len` | 剩余有效数据长度（NAL type + payload） |

### 数据流校验关系

```
rfb->data  ──▶ [00 00 00 01][67 XX YY ...]
                ├─ start_len=4 ─┤
                ├───────── rfb->len ─────────┤
                                  ├── dst_len ──┤
                dst ──────────────────▶
```

### 修复依赖

- ✅ Bug 1 修复后 → `start_len` 正确（3 或 4）
- ✅ Bug 2 修复后 → `rfb->len` 正确
- → 此计算自然正确

---

## 修复验证

### 测试条件

| 项目 | 值 |
|------|-----|
| 平台 | TXW82x (C-Sky CK804DF) |
| 测试文件 | H.264 基线编码文件，包含 I 帧 + P 帧 |
| 起始码类型 | 混合：部分文件使用 3 字节、部分使用 4 字节 |
| 输出分辨率 | 320×240 |
| 验证方式 | LCD 屏幕目测 + `os_printf` 日志 |

### 验证结果

| 测试项 | 修复前 | 修复后 |
|--------|--------|--------|
| 3 字节起始码文件 | 花屏/无输出 | 正常播放 |
| 4 字节起始码文件 | 偶发花屏 | 正常播放 |
| I 帧 + P 帧解码 | 首帧后卡死 | 连续播放 |
| 文件循环播放 | 第 2 轮崩溃 | 稳定循环 |
| 快速切换文件 | 内存拷贝错误 | 切换正常 |

---

## 经验总结

1. **`fb_h264_s.start_len` 是起始码长度，不是 NAL header 偏移。** 虽然在某些场景下两者数值相同，但语义必须准确，否则遇到变长起始码或缓冲前导数据时会出错。

2. **`fb->len` 是 MSI 管道的核心契约。** 上游生产者必须准确设置 framebuff 的数据长度，下游消费者依赖此值进行内存操作。遗漏设置会导致消费者读取越界或长度异常。

3. **H.264 Annex-B 起始码长度是动态的（3 或 4 字节）。** 所有涉及 NAL 数据扫描和传递的环节都必须感知这一动态性，硬编码 4 字节是最常见的隐蔽 Bug 来源。

4. **端到端校验：** 在 `h264_file_msi`（生产者）→ `jpg_decode_msg_msi`（帧解析）→ `h264_decode_msi`（解码器）→ `R_VIDEO_P0`（LCD 显示）的完整链路中，每个环节都应校验 `fb->len` 和 `start_len` 的合理性，避免异常数据传递到硬件层。
