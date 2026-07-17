---
title: "TXW81x 微信消息 UDP v2 协议开发文档"
date: "2026-07-17 20:10:00"
categories:
  - [项目文档, TXW81x 可视对讲]
tags:
  - TXW81x
  - 微信消息
  - UDP
  - 网络协议
  - 语音传输
  - CRC32
toc_number: false
excerpt: "记录 wechat_udp 的 UDP v2 通用包头、表情消息、WCA 语音文件分片协议、收发线程、校验规则与可靠性边界。"
---

> 项目: TXW81x 可视对讲 UI
> 模块: `sdk/app/wechat_udp/`
> 协议版本: 2
> 默认端口: `5010/UDP`
> 提交范围: `febc4f7` 至 `2440a8e`
> 分析基线: `2440a8e`（2026-07-17）

---

## 1. 模块定位

`wechat_udp` 是微信消息功能的网络传输层，当前负责：

- 创建并绑定 UDP socket；
- 管理固定对端地址；
- 生成和解析统一 v2 包头；
- 异步发送表情消息；
- 同步分片发送 WCA 语音文件；
- 在 RX 任务中校验数据包并回调上层服务。

模块不负责 UI、Opus 编解码、业务状态和远端语音文件落盘。

基线版本的关键源码定位：

- `sdk/app/wechat_udp/wechat_udp.c:145`：生成通用包头；
- `sdk/app/wechat_udp/wechat_udp.c:255`：解析通用包头；
- `sdk/app/wechat_udp/wechat_udp.c:309`：UDP RX 任务；
- `sdk/app/wechat_udp/wechat_udp.c:365`：socket 与任务初始化；
- `sdk/app/wechat_udp/wechat_udp.c:579`：语音文件分片发送；
- `sdk/lib/gui/intercom_ui/wechat_service.c:206`：语音 BEGIN 接收；
- `sdk/lib/gui/intercom_ui/wechat_service.c:274`：语音 DATA 接收；
- `sdk/lib/gui/intercom_ui/wechat_service.c:308`：语音 END 校验。

## 2. 通用数据包格式

固定包头长度为 8 B，最大 payload 为 1200 B，最大 UDP 应用数据长度为 1208 B。

| 偏移 | 长度 | 字段 | 编码 | 说明 |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | Magic 0 | ASCII | 固定为 `W` |
| 1 | 1 | Magic 1 | ASCII | 固定为 `X` |
| 2 | 1 | Version | uint8 | 当前为 `2` |
| 3 | 1 | Type | uint8 | 消息类型 |
| 4 | 2 | Sequence | uint16 BE | 发送包序号，自然回绕 |
| 6 | 2 | Payload length | uint16 BE | `0..1200` |
| 8 | N | Payload | bytes | 长度必须与包头完全一致 |

接收端拒绝以下数据包：

- 长度小于 8 B 或大于 1208 B；
- Magic 或版本不匹配；
- payload 长度大于 1200 B；
- UDP 实际长度不等于 `8 + payload_len`。

## 3. 通用消息类型

| Type | 枚举 | 当前状态 |
| ---: | --- | --- |
| 1 | `WECHAT_UDP_MSG_EMOJI` | 已实现收发 |
| 2 | `WECHAT_UDP_MSG_VOICE` | 已实现 WCA 文件收发 |
| 3 | `WECHAT_UDP_MSG_PHOTO_BEGIN` | 预留 |
| 4 | `WECHAT_UDP_MSG_PHOTO_DATA` | 预留 |
| 5 | `WECHAT_UDP_MSG_PHOTO_END` | 预留 |
| 6 | `WECHAT_UDP_MSG_ACK` | 预留，尚未使用 |

`sequence` 当前只由发送端递增并传给接收回调，上层没有据此执行去重、丢包判断或重排。

## 4. 表情消息

表情 payload 固定为 1 B：

| 偏移 | 长度 | 字段 | 约束 |
| ---: | ---: | --- | --- |
| 0 | 1 | `emoji_index` | `0..7` |

发送 API `wechat_udp_send_emoji()` 只负责把索引投递到深度为 16 的 TX 队列。真正的 `sendto()` 在 `wechat_udp_tx` 任务中执行，因此 API 返回成功仅表示消息已入队。

## 5. 语音文件传输

语音使用一个通用消息类型 `WECHAT_UDP_MSG_VOICE`，payload 第 1 B 再区分子类型。

### 5.1 BEGIN

payload 固定 9 B。

| 偏移 | 长度 | 字段 | 编码 | 说明 |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | subtype | uint8 | `WECHAT_UDP_VOICE_BEGIN = 1` |
| 1 | 2 | transfer ID | uint16 BE | 0 为非法值 |
| 3 | 4 | file size | uint32 BE | 当前限制 `1..128 KiB` |
| 7 | 2 | duration | uint16 BE | 秒，必须大于 0 |

### 5.2 DATA

固定头 7 B，后接最多 1193 B 文件内容。

| 偏移 | 长度 | 字段 | 编码 | 说明 |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | subtype | uint8 | `WECHAT_UDP_VOICE_DATA = 2` |
| 1 | 2 | transfer ID | uint16 BE | 必须与 BEGIN 一致 |
| 3 | 4 | offset | uint32 BE | 当前数据在文件内的字节偏移 |
| 7 | N | data | bytes | `1..1193` B |

接收端要求：

```text
transfer_id == active transfer_id
offset      == received_size
data_len    <= expected_size - received_size
```

这意味着协议当前只接受严格有序、无重复、无缺口的数据流。

### 5.3 END

payload 固定 11 B。

| 偏移 | 长度 | 字段 | 编码 | 说明 |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | subtype | uint8 | `WECHAT_UDP_VOICE_END = 3` |
| 1 | 2 | transfer ID | uint16 BE | 必须与 BEGIN 一致 |
| 3 | 4 | file size | uint32 BE | 必须与 BEGIN 和累计长度一致 |
| 7 | 4 | CRC32 | uint32 BE | 整个 WCA 文件的 CRC32 |

CRC 参数：

- 初始值：`0xffffffff`；
- 多项式反射形式：`0xedb88320`；
- 最终异或：`0xffffffff`；
- 覆盖范围：所有 DATA 中的文件内容，不含 UDP 和语音子协议头。

## 6. 发送流程

`wechat_udp_send_voice_file()` 在调用者线程中同步完成整个文件发送：

1. 校验模块状态、对端、路径和时长。
2. 打开文件并检查大小不超过 128 KiB。
3. 持有 `tx_lock`，防止表情包插入语音文件传输中间。
4. 分配非零 transfer ID。
5. 发送 BEGIN。
6. 每次读取最多 1193 B，生成 offset 并发送 DATA。
7. 每个 DATA 后等待 5 ms，降低突发发送压力。
8. 完成 CRC32 后发送 END。
9. 释放 `tx_lock` 并关闭文件。

在当前业务中，这个函数由 `wechat_service` 任务在录音完成后调用，因此语音发送期间服务事件处理会暂停。

## 7. 接收流程

`wechat_udp_rx` 使用 100 ms socket 接收超时，以便退出时能够观察 `rx_running = 0`。

```text
recvfrom
  -> 可选来源 IP 过滤
  -> v2 包头解析
  -> 表情合法性检查 / 通用消息分发
  -> recv_cb(type, payload, length, sequence, user_data)
  -> wechat_service_udp_recv()
```

回调中的 `payload` 指向 UDP 模块内部 RX 缓冲区，只在本次回调期间有效。上层若需要延后处理，必须复制数据。

## 8. 对端配置

`wechat_udp_set_peer()` 保存 IPv4 地址与端口。服务层当前按 Wi-Fi 模式使用固定地址：

| 本机模式 | 对端地址 |
| --- | --- |
| AP | `192.168.1.100:5010` |
| STA | `192.168.1.1:5010` |

RX 过滤只比较来源 IPv4 地址，没有比较来源端口。

## 9. 线程与锁

| 资源 | 访问者 | 保护方式 |
| --- | --- | --- |
| `tx_buffer`、发送 sequence | TX 任务、服务任务 | `tx_lock` |
| TX 消息 | UI/服务调用者、TX 任务 | `tx_msgq` |
| RX buffer | RX 任务 | 单任务独占，回调期间借用 |
| socket | TX、RX、deinit | 生命周期状态 + 退出信号量 |
| peer 地址 | 初始化流程、TX/RX | 当前假定运行期间不动态修改 |

TX 与 RX 任务在退出点先发信号量，然后停留在休眠循环，最终由 deinit 调用 `os_task_destroy()` 回收。

## 10. 错误和丢包行为

| 情况 | 当前行为 |
| --- | --- |
| 表情 TX 队列满 | `wechat_udp_send_emoji()` 返回失败 |
| `sendto()` 失败 | 打印日志，不重试 |
| 非法包头/长度 | 丢弃并打印日志 |
| 未知消息类型 | 丢弃并打印日志 |
| 来源 IP 不匹配 | 静默丢弃 |
| DATA 丢失、重复或乱序 | 服务层中止接收并删除临时文件 |
| END 长度或 CRC 错误 | 中止并删除临时文件 |
| 传输中途停止 | 保持 active，直到新 BEGIN 触发超时检查或模块退出 |

## 11. 已确认的限制与改进建议

### 11.1 没有可靠传输闭环

虽然定义了 ACK 类型和 sequence 字段，但尚无确认、重传、窗口或去重实现。语音消息的成功发送日志只代表本机所有 `sendto()` 调用成功，不代表对端完整落盘。

建议最小升级方案：

1. END 校验成功后返回包含 transfer ID、size、CRC 的 ACK；
2. 发送端等待 ACK 超时，至少支持整文件重发；
3. 再逐步增加分片位图或缺失 offset 列表，实现选择性重传。

### 11.2 RX 回调执行 Flash I/O

当前 DATA 在 UDP RX 任务回调内直接写 Flash。若单次写入延迟接近或超过包到达间隔，后续 UDP 包可能因 socket 缓冲不足而丢失。

建议将 RX 任务限定为“解析 + 复制 + 入队”，由文件接收任务负责落盘和 CRC。

### 11.3 超时清理不主动

`WECHAT_SERVICE_VOICE_RX_TIMEOUT_MS = 3000` 只在处理新的 BEGIN 时生效。建议增加周期 timer 或在 RX receive timeout 分支中驱动接收状态超时清理。

### 11.4 安全边界

协议没有鉴权和加密，只依赖固定 IP 过滤。它适合受控局域网和开发联调，不应直接暴露到不可信网络。

## 12. 联调检查表

- 两端协议版本均为 2；
- AP/STA 地址与端口配置方向正确；
- 表情索引严格为 `0..7`；
- 抓包确认多字节字段采用大端序；
- DATA offset 连续递增，单片不超过 1193 B；
- BEGIN/END 的 file size 一致；
- CRC32 覆盖原始 WCA 全文件；
- 语音文件大于 0 且不超过 128 KiB；
- 丢一个 DATA 包时，预期结果应为整段语音接收失败；
- 退出页面时 RX 最长约等待一个 100 ms socket timeout。
