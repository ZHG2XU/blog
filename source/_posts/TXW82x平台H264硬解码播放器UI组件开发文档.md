---
title: "TXW82x 平台 H.264 硬解码播放器 UI 组件开发文档"
date: 2026-06-22
categories:
  - [项目文档, TXW82x H.264 播放器]
tags:
  - LVGL
  - C语言
  - MSI
  - H.264
  - 硬件解码
  - 嵌入式
  - UI组件
  - TXW82x
toc_number: false
excerpt: "基于 LVGL 和 MSI 媒体流管道的 H.264 硬件解码播放器 UI 组件完整开发文档。涵盖 MSI 管道拓扑（file_msi → h264_decode_msg_msi → h264_decode_msi → R_VIDEO_P0）、按键映射系统、LVGL 事件驱动架构、内存管理策略及 13 个内部函数的详细 API 参考。适用于 TXW82x WiFi 摄像头 SoC（C-Sky CK804DF 内核）平台。"
---

# H264 Player UI 组件开发文档

## 1. 概述

`h264_player_ui.c` 是基于 **LVGL** 图形框架和 **MSI**（Media Stream Interface）媒体流管道实现的 H.264 硬解码播放器 UI 组件。运行于 TXW82x WiFi 摄像头 SoC（C-Sky CK804DF 内核）平台。

**功能：**

- 在 LCD 上创建 H.264 文件播放器的菜单入口
- 遍历文件系统中 `H264/` 目录下的 `*.h264` 文件并展示文件列表
- 选择文件后，通过 MSI 管道完成硬件解码并在 LCD 视频层（`R_VIDEO_P0`）显示
- 支持播放/暂停控制
- 支持退出播放并回到主菜单

---

## 2. 架构与数据流

### 2.1 MSI 管道拓扑

在进入播放界面时，组件建立如下 MSI 数据流管道：

```
SD 卡 H.264 文件 (*.h264)
     │
     ▼
h264_file_msi (文件解复用器)
     │  MSI_CMD_VIDEO_DEMUX_CTRL → START/STOP/PAUSE
     │  输出: F_H264 类型 framebuff
     ▼
p0_decode_msg_msi (SR_OTHER_JPG, 帧信息解析)
     │  强制输出类型: FSTYPE_YUV_P0
     │  输出: F_JPG_DECODE_MSG
     ▼
decode_msi ("h264_decode", H264 硬件解码)
     │  H264 硬件解码 + Scale2 缩放
     │  输出: F_YUV, stype=FSTYPE_YUV_P0
     ▼
R_VIDEO_P0 (LCD 视频层 P0)
     │  MSI_CMD_LCD_VIDEO → MSI_VIDEO_ENABLE 控制开关
     ▼
LCD 屏幕显示
```

### 2.2 UI 层次结构

```
lv_scr_act (当前活动屏幕)
   ├── base_ui (主菜单列表, 由调用方传入)
   │     └── "h264_player" 按钮 → 点击进入播放器
   │
   └── now_ui (播放器界面, 全屏)
         ├── 视频显示层 (通过 MSI → R_VIDEO_P0 渲染)
         ├── label_time ("00:00" 时间标签, 顶部居中)
         └── 文件列表弹窗 (按 'e' 键触发)
               ├── "exit" 按钮 → 返回播放器
               └── 每个 *.h264 文件按钮 → 点击开始播放
```

---

## 3. 关键数据结构

### 3.1 `struct h264_player_ui_s` — 播放器控制块

| 字段 | 类型 | 说明 |
|------|------|------|
| `last_group` | `lv_group_t *` | 上一级界面的 LVGL 组，退出时恢复 |
| `base_ui` | `lv_obj_t *` | 主菜单列表对象，退出时取消隐藏 |
| `w`, `h` | `uint16_t` | 视频解码输出宽高 |
| `now_group` | `lv_group_t *` | 当前播放器界面的 LVGL 组 |
| `now_ui` | `lv_obj_t *` | 当前播放器界面对象 |
| `timer` | `lv_timer_t *` | 100ms 周期定时器（用于更新时间显示） |
| `label_time` | `lv_obj_t *` | 时间标签控件 |
| `p0_decode_msg_msi` | `struct msi *` | 解码帧信息 MSI 组件 (`h264_decode_msg_msi`) |
| `decode_msi` | `struct msi *` | H264 硬件解码 MSI 组件 (`h264_decode_msi`) |
| `file_msi` | `struct msi *` | 文件解复用 MSI 组件 (`h264_file_msi`) |
| `play_name` | `uint8_t *` | 当前播放流的名称（PSRAM 分配） |
| `playing` | `uint8_t:1` | 播放状态标志 |

### 3.2 `struct h264_list_param` — 文件列表参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `group` | `lv_group_t *` | 文件列表的 LVGL 组 |
| `ui` | `lv_obj_t *` | 文件列表的 LVGL list 对象 |
| `ui_s` | `h264_player_ui_s *` | 指向播放器控制块的指针 |

---

## 4. 外部依赖与声明

### 4.1 外部 MSI 组件函数

```c
// 创建解码帧信息 MSI 组件（实现在 jpg_decode_msg_msi.c）
extern struct msi *h264_decode_msg_msi(const char *name, uint16_t out_w, uint16_t out_h,
                                        uint16_t step_w, uint16_t step_h, uint32_t filter);

// 创建 H264 硬件解码 MSI 组件（实现在 h264_decode_msi.c）
// only_I_H264: 0=解码 I+P 帧, 1=只解码 I 帧
extern struct msi *h264_decode_msi(const char *name, uint8_t only_I_H264);

// 创建文件解复用 MSI 组件（实现在 h264_file_msi.c）
extern struct msi *h264_file_msi_init(const char *msi_name, const char *filename);

// H264 硬件驱动初始化
extern void h264_drv_init(void);
```

### 4.2 外部全局变量

```c
extern lv_style_t  g_style;       // 全局 LVGL 样式
extern lv_indev_t *indev_keypad;  // 全局键盘输入设备
```

### 4.3 引用的头文件

| 头文件 | 路径 | 用途 |
|--------|------|------|
| `lvgl/lvgl.h` | SDK 内 | LVGL 图形库核心 |
| `lvgl_ui.h` | `sdk/app/ui/` | UI 组件声明、MSI 组件 extern 声明 |
| `keyWork.h` | `sdk/lib/key/` | 按键回调工作队列 |
| `keyScan.h` | `sdk/lib/key/` | 按键扫描、键值定义（`AD_UP`, `AD_DOWN` 等） |
| `av_heap.h` | `lib/heap/` | 普通堆内存分配 |
| `av_psram_heap.h` | `lib/heap/` | PSRAM 堆内存分配 |
| `avi_player_msi.h` | `sdk/app/playback/` | AVI 播放器 MSI 接口 |
| `audio_code_ctrl.h` | `audio_media_ctrl/` | 音频编解码控制 |
| `osal_file.h` | `fs/fatfs/` | 文件系统接口 |
| `stream_define.h` | `sdk/app/algorithm/stream_frame/` | 流名称和 MSI 命令常量定义 |

---

## 5. 宏定义

```c
#define CHECK_DIR            "H264"     // 扫描目录名
#define EXT_NAME             "*h264"    // 文件名匹配模式
#define PLAY_STREAM_NAME_LEN (64)       // 播放流名称缓冲区大小
#define STREAM_MALLOC        av_psram_malloc   // 大块内存分配（PSRAM）
#define STREAM_FREE          av_psram_free     // 大块内存释放
#define STREAM_LIBC_ZALLOC   av_zalloc         // 零初始化分配
```

---

## 6. 按键映射

函数 `self_key()` 将硬件按键事件映射为 LVGL 逻辑按键：

| 硬件按键 | LVGL 映射值 | 用途 |
|----------|-------------|------|
| `AD_UP` | `'q'` | 返回/退出 |
| `AD_DOWN` | `'e'` | 展开文件列表 |
| `AD_LEFT` | `'a'` | 定位控制（预留） |
| `AD_RIGHT` | `'d'` | 定位控制（预留） |
| `AD_PRESS` | `LV_KEY_ENTER` | 确认选择 |

按键过滤器通过 `set_lvgl_get_key_func(self_key)` 设置，退出时通过 `set_lvgl_get_key_func(NULL)` 清除。

---

## 7. 函数参考

### 7.1 公开 API

#### `h264_player_ui()`

```c
lv_obj_t *h264_player_ui(lv_group_t *group, lv_obj_t *base_ui, uint16_t w, uint16_t h);
```

**说明：** 在主菜单列表中添加一个名为 `"h264_player"` 的按钮入口。

**参数：**
- `group` — 主菜单的 LVGL 组
- `base_ui` — 主菜单的 LVGL list 对象
- `w`, `h` — 视频解码输出宽度和高度

**返回值：** 创建的按钮对象指针，失败返回 `NULL`。

**调用示例（`main_ui.c`）：**
```c
btn = h264_player_ui(group, base_ui, 320, 240);
```

### 7.2 内部函数

#### `self_key()` — 按键映射

```c
static uint32_t self_key(uint32_t val);
```

将硬件 `AD_*` 键值 + `KEY_EVENT_SUP`（短按释放）事件映射为 LVGL 可识别的字符键值。仅在播放器活跃时生效。

#### `h264_player_stop_file()` — 停止播放

```c
static void h264_player_stop_file(struct h264_player_ui_s *ui_s);
```

停止文件解复用器（发送 `MSI_VIDEO_DEMUX_STOP`），销毁 `file_msi` 组件，关闭 LCD 视频层，释放 `play_name` 缓冲区。

#### `enter_player_ui()` — 进入播放器界面

```c
static void enter_player_ui(lv_event_t *e);
```

**事件：** `LV_EVENT_SHORT_CLICKED`（点击主菜单的 "h264_player" 按钮）

**流程：**
1. 设置按键过滤器 `self_key`
2. 调用 `h264_drv_init()` 初始化 H264 硬件
3. 隐藏主菜单（`base_ui`），创建全屏播放器界面（`now_ui`）
4. 创建 MSI 管道：
   - `p0_decode_msg_msi` = `h264_decode_msg_msi(SR_OTHER_JPG, ...)` → 帧信息解析
   - `decode_msi` = `h264_decode_msi("h264_decode", 0)` → 硬件解码
   - 连接：`p0_decode_msg_msi → decode_msi → R_VIDEO_P0`
5. 创建时间标签 `label_time`（初始显示 "00:00"）和 100ms 定时器
6. 创建新的 LVGL 组并注册事件回调

#### `exit_player_ui()` — 退出播放器界面

```c
static void exit_player_ui(lv_event_t *e);
```

**事件：** `LV_EVENT_KEY`，键值 `'q'`

**流程：**
1. 删除定时器
2. 恢复键盘输入组到上一级
3. 显示主菜单（清除 `base_ui` 的隐藏标志）
4. 销毁当前 LVGL 组、MSI 管道（`p0_decode_msg_msi`, `decode_msi`）
5. 调用 `h264_player_stop_file()` 停止文件播放
6. 删除当前界面对象，清除按键过滤器

#### `show_filelist()` — 显示文件列表

```c
static void show_filelist(lv_event_t *e);
```

**事件：** `LV_EVENT_KEY`，键值 `'e'`

**流程：**
1. 清除按键过滤器
2. 在当前界面创建全屏 LVGL list
3. 添加 "exit" 返回按钮
4. 调用 `each_read_file()` 扫描 `H264/` 目录，为每个 `*.h264` 文件添加列表项
5. 为每个文件按钮注册 `enter_playback` 事件

#### `enter_playback()` — 开始文件播放

```c
static void enter_playback(lv_event_t *e);
```

**事件：** `LV_EVENT_CLICKED`（点击文件列表中的文件项）

**流程：**
1. 停止当前（如有）正在播放的文件
2. 获取文件名，构造路径 `"0:H264/<filename>"`
3. 使用 `STREAM_MALLOC(av_psram_malloc)` 分配 `play_name` 缓冲区
4. 调用 `h264_file_msi_init()` 创建文件解复用器
5. 成功：使能 LCD 视频层，连接 `file_msi → p0_decode_msg_msi`，发送 `MSI_VIDEO_DEMUX_START`
6. 失败：清理资源，退出文件列表

#### `player_ctrl_ui()` — 播放/暂停控制

```c
static void player_ctrl_ui(lv_event_t *e);
```

**事件：** `LV_EVENT_SHORT_CLICKED`（点击播放器界面空白区域）

**行为：** 切换 `playing` 状态。从播放→暂停时发送 `MSI_VIDEO_DEMUX_PAUSE`，从暂停→播放时发送 `MSI_VIDEO_DEMUX_START` 并重新使能 LCD 视频层。

#### `player_locate_ctrl_ui()` — 定位控制（预留）

```c
static void player_locate_ctrl_ui(lv_event_t *e);
```

**事件：** `LV_EVENT_KEY`，键值 `'a'` / `'d'`

当前仅捕获事件，未实现具体逻辑（switch case 为空）。可用于实现快退/快进功能。

#### `player_ui_timer()` — 定时器回调（预留）

```c
static void player_ui_timer(lv_timer_t *t);
```

100ms 周期定时器。当前框架已创建，函数体为空。可用于实现播放时间更新显示。

#### `h264_list_show()` — 单个列表项创建回调

```c
static int h264_list_show(const char *filename, void *data);
```

为每个 `*.h264` 文件在列表中添加一个按钮，绑定 `enter_playback` 事件。

#### `each_read_file()` — 文件系统遍历

```c
static int each_read_file(create_h264_list_ui fn, void *param);
```

使用 FatFS API 遍历 `H264/` 目录下匹配 `*h264` 的文件，对每个文件调用回调函数 `fn`。

#### `exit_show_filelist()` — 退出文件列表

```c
static void exit_show_filelist(lv_event_t *e);
```

恢复按键过滤器，恢复键盘输入组，延迟删除列表对象。

#### `clear_list_group_ui()` — 列表销毁时清理组

```c
static void clear_list_group_ui(lv_event_t *e);
```

在 LVGL list 对象被删除时，自动释放关联的 LVGL 组。

---

## 8. 关键事件注册汇总

| LVGL 事件 | 对象 | 回调函数 | 说明 |
|-----------|------|----------|------|
| `LV_EVENT_SHORT_CLICKED` | "h264_player" 按钮 | `enter_player_ui` | 进入播放器 |
| `LV_EVENT_KEY` | 播放器界面 (`now_ui`) | `exit_player_ui` | 按 `'q'` 退出 |
| `LV_EVENT_KEY` | 播放器界面 (`now_ui`) | `player_locate_ctrl_ui` | 按 `'a'`/`'d'` 定位 |
| `LV_EVENT_KEY` | 播放器界面 (`now_ui`) | `show_filelist` | 按 `'e'` 显示文件列表 |
| `LV_EVENT_SHORT_CLICKED` | 播放器界面 (`now_ui`) | `player_ctrl_ui` | 短按切换播放/暂停 |
| `LV_EVENT_SHORT_CLICKED` | 文件列表中的 "exit" 按钮 | `exit_show_filelist` | 返回播放器 |
| `LV_EVENT_CLICKED` | 文件列表中的文件名按钮 | `enter_playback` | 开始播放该文件 |
| `LV_EVENT_DELETE` | 文件列表对象 | `clear_list_group_ui` | 释放 LVGL 组 |

---

## 9. MSI 命令使用汇总

| 命令 | 目标 | 用途 |
|------|------|------|
| `MSI_CMD_VIDEO_DEMUX_CTRL` / `MSI_VIDEO_DEMUX_START` | `file_msi` | 开始解复用（播放） |
| `MSI_CMD_VIDEO_DEMUX_CTRL` / `MSI_VIDEO_DEMUX_STOP` | `file_msi` | 停止解复用 |
| `MSI_CMD_VIDEO_DEMUX_CTRL` / `MSI_VIDEO_DEMUX_PAUSE` | `file_msi` | 暂停解复用 |
| `MSI_CMD_LCD_VIDEO` / `MSI_VIDEO_ENABLE=1` | `R_VIDEO_P0` | 使能 LCD 视频层 P0 |
| `MSI_CMD_LCD_VIDEO` / `MSI_VIDEO_ENABLE=0` | `R_VIDEO_P0` | 关闭 LCD 视频层 P0 |
| `MSI_CMD_DECODE_JPEG_MSG` / `MSI_JPEG_DECODE_FORCE_TYPE` | `p0_decode_msg_msi` | 强制解码输出类型为 `FSTYPE_YUV_P0` |

---

## 10. 内存管理

| 分配点 | 分配函数 | 堆类型 | 释放点 |
|--------|----------|--------|--------|
| `h264_player_ui_s` 控制块 | `av_zalloc` | 系统堆（SRAM） | 当前未显式释放（TODO） |
| `play_name` 缓冲区 | `av_psram_malloc` | PSRAM | `h264_player_stop_file()` |
| `file_msi` 组件 | MSI 框架内部 | 视组件实现 | `msi_destroy()` |
| `p0_decode_msg_msi` | MSI 框架内部 | 视组件实现 | `msi_destroy()` |
| `decode_msi` | MSI 框架内部 | 视组件实现 | `msi_destroy()` |

> **注意：** 控制块 `ui_s` 在退出播放器时未显式释放（`STREAM_FREE`），因为 `h264_player_ui()` 只调用一次且控制块需要在整个应用生命周期内保持。如需动态创建/销毁，应在 `exit_player_ui` 或 `h264_player_stop_file` 中添加 `STREAM_FREE(ui_s)` 并置空指针。

---

## 11. 调用链路

### 11.1 入口注册（在 `main_ui.c` 中）

```c
// main_pocket_camera_ui():
btn = h264_player_ui(group, base_ui, 320, 240);
//     ↓
// h264_player_ui():
//   1. av_zalloc(sizeof(h264_player_ui_s)) → ui_s
//   2. lv_list_add_btn(base_ui, NULL, "h264_player") → btn
//   3. lv_obj_add_event_cb(btn, enter_player_ui, LV_EVENT_SHORT_CLICKED, ui_s)
```

### 11.2 完整用户操作流

```
主菜单列表
  │  选择 "h264_player" → 短按确认
  ▼
enter_player_ui()        ← 创建播放器界面 + MSI 管道
  │  按 'e' 键
  ▼
show_filelist()          ← 弹出文件列表
  │  选择文件 → 点击
  ▼
enter_playback()         ← 创建 file_msi，开始播放
  │  (视频通过 MSI 管道自动渲染到 LCD)
  │  短按屏幕 → 暂停/恢复
  │  按 'q' 键 → 回到文件列表
  ▼
exit_show_filelist()     ← 返回播放器界面
  │  在播放器界面按 'q' 键
  ▼
exit_player_ui()         ← 销毁 MSI 管道，回到主菜单
```

---

## 12. 待完善/预留功能

1. **播放时间更新：** `player_ui_timer()` 函数体为空，`label_time` 始终显示 "00:00"。需要从 `file_msi` 或 `p0_decode_msg_msi` 获取当前播放进度更新标签。

2. **快进/快退：** `player_locate_ctrl_ui()` 已注册 `'a'` / `'d'` 按键事件，但 switch case 为空。可根据需要调用 `MSI_VIDEO_DEMUX_FORWARD_TIME` / `MSI_VIDEO_DEMUX_REWIND_TIME` 命令实现。

3. **控制块生命周期：** `h264_player_ui_s` 对象在 `h264_player_ui()` 中分配后未释放。如果多次进入/退出播放器，应增加销毁逻辑。

4. **文件列表刷新：** 当前每次按 `'e'` 都会重新扫描文件系统并创建新的列表，但旧的列表对象会在 `exit_show_filelist` 中通过 `lv_obj_del_async` 延迟删除，可能有短暂的重叠。

---

## 13. 依赖的文件

| 文件 | 路径 | 关系 |
|------|------|------|
| `h264_player_ui.c` | `sdk/app/ui/` | 本组件源文件 |
| `lvgl_ui.h` | `sdk/app/ui/` | 公开 API 声明 |
| `main_ui.c` | `sdk/app/ui/` | 调用 `h264_player_ui()` 注册入口 |
| `h264_file_msi.c` | `sdk/app/h264_demux/` | 文件解复用 MSI 组件 |
| `jpg_decode_msg_msi.c` | SDK 内 | H264 帧信息解析 MSI 组件 |
| `h264_decode_msi.c` | SDK 内 | H264 硬件解码 MSI 组件 |
| `stream_define.h` | `sdk/app/algorithm/stream_frame/` | 流名称常量 (`R_VIDEO_P0`, `SR_OTHER_JPG`) |
| `msi.h` | `sdk/include/lib/multimedia/` | MSI 核心接口 |
| `framebuff.h` | `sdk/include/lib/multimedia/` | Framebuff 类型定义 (`FSTYPE_YUV_P0`) |
| `keyWork.h` / `keyScan.h` | `sdk/lib/key/` | 按键系统 |

---

## 14. 注意事项

- **内存：** 视频帧数据量大，`STREAM_MALLOC` 使用 PSRAM（`av_psram_malloc`），轻量对象使用 SRAM（`av_zalloc`）。
- **MSI 管道生命周期：** `p0_decode_msg_msi` 和 `decode_msi` 在 `enter_player_ui()` 中创建、在 `exit_player_ui()` 中销毁。`file_msi` 在每次选择文件播放时创建、在停止播放或切换文件时销毁。
- **LCD 视频层竞争：** `R_VIDEO_P0` 是全局 LCD 视频层 P0 通道，确保在进入播放器时使能、退出时关闭，避免影响其他 UI 组件。
- **文件系统路径：** 文件路径格式为 `"0:H264/<filename>"`，其中 `"0:"` 是 FatFS 驱动号。
