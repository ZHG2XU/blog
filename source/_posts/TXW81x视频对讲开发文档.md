---
title: "TXW81x 视频对讲开发实战：JPEG over UDP 传输、双通道显示与 LVGL 页面联动"
date: 2026-07-10
categories:
  - [项目文档, TXW81x 可视对讲]
tags:
  - TXW81x
  - LVGL
  - C语言
  - UDP
  - JPEG
  - 视频对讲
  - 流媒体
  - 双画面
  - 嵌入式
toc_number: false
excerpt: "基于 TXW81x SDK 的视频对讲方案开发文档：梳理本地摄像头 JPEG 编码、UDP 分片发送、远端乱序重组、JPEG 解码、LCD P0/P1 双通道合成，以及 LVGL 四种显示页面之间的完整调用链。"
---

# 1. 项目概述

本文面向 `81x_intercom_ui` 工程，重点说明以下两个模块：

- `sdk/app/video_intercom/`：负责 JPEG 视频帧的获取、UDP 分片发送、网络接收、帧重组和远端 JPEG 投递。
- `sdk/lib/gui/81x_demo_ui/`：负责启动画面、按键翻页、本地/远端画面模式切换，以及 LCD P0/P1 双视频通道布局。

当前方案采用双端对等结构。每台设备既是发送端，也是接收端：本地摄像头画面编码成 JPEG 后通过 UDP 发给对端，同时接收对端 JPEG 并解码显示。

系统中的两路显示通道约定如下：

| 通道 | 数据来源 | 用途 |
| --- | --- | --- |
| LCD P0 / `R_VIDEO_P0` | 本地摄像头缩放流 | 本地预览 |
| LCD P1 / `R_VIDEO_P1` | 网络接收后解码的远端 JPEG | 远端画面 |

# 2. 总体架构

```text
本机摄像头
    │
    ▼
DVP / VPP_DATA1
    │
    ▼
JPEG0 编码器
    │
    ▼
视频流框架 R_RTP_JPEG
    │
    ▼
bbm_video_tx_thread
    │  JPEG 提取、1300 Byte 分片、UDP:11011
    ▼
======================== Wi-Fi ========================
    ▼
bbm_video_rx_thread
    │  包校验、乱序重组、超时丢帧
    ▼
S_BBM_REMOTE_JPG_SRC
    │
    ▼
SR_OTHER_JPG_REMOTE
    │  设置远端输出尺寸
    ▼
S_JPG_DECODE
    │
    ▼
LCD R_VIDEO_P1 ─────┐
                    ├── LCDC 合成 ── 屏幕
本地缩放流 P0 ──────┘

LVGL OSD：页面名称、启动 Logo、按键事件
```

这里的 LVGL 主要承担 OSD 和交互控制，不直接绘制实时视频像素。视频由 LCDC 的 P0/P1 硬件通道输出，LVGL 页面使用透明背景叠加在视频层之上。

# 3. 目录与文件职责

## 3.1 视频传输模块

| 文件 | 职责 |
| --- | --- |
| `sdk/app/video_intercom/video_intercom.c` | UDP socket、发送/接收任务、协议封包、JPEG 分片与重组、远端解码流初始化 |
| `sdk/app/video_intercom/video_intercom.h` | 视频传输控制 API，与 `sdk/include/bbm_protocol.h` 暴露的接口一致 |
| `sdk/include/bbm_protocol.h` | UI、音频对讲等模块使用的公共协议头文件 |

## 3.2 LVGL UI 模块

| 文件 | 职责 |
| --- | --- |
| `sdk/lib/gui/81x_demo_ui/81x_demo_ui.c` | UI 主控制器、页面状态、视频布局、按键组、启动 Logo |
| `sdk/lib/gui/81x_demo_ui/81x_demo_ui.h` | 页面枚举、视频模式枚举、对外切换 API |
| `generated/gui_guider.c` | GUI Guider 生成的页面初始化、屏幕加载和动画辅助函数 |
| `generated/setup_scr_screen.c` | 创建 320×240 透明主屏幕 |
| `generated/events_init.c` | GUI Guider 事件初始化入口，当前无业务事件 |
| `custom/custom.c` | 用户自定义初始化入口，当前为空实现 |
| `ui_res/ui_bgLogo.c` | 320×240 JPEG 启动 Logo 数据 |

## 3.3 关联模块

| 文件 | 与本功能的关系 |
| --- | --- |
| `project/main.c` | 初始化摄像头、JPEG、LCD/LVGL，并在网络就绪后调用 `user_protocol()` |
| `sdk/app/video_app/video_app.c` | 将 JPEG 编码结果绑定到 `R_RTP_JPEG` |
| `sdk/app/other_jpg_show/other_jpg_show_stream.c` | 接收远端 JPEG，配置解码输出尺寸 |
| `sdk/app/app_lcd/app_lcd.c` | 控制 P0/P1 使能、坐标和上下层关系 |
| `sdk/app/interface_management/interface_mgnt.c` | 初始化 LVGL 并调用 `ui_81x_demo_display()` |
| `sdk/app/intercom/intercom_adpcm.c` | 音频对讲复用已学习到的对端 IP |

# 4. 系统启动调用链

## 4.1 硬件与视频源初始化

`project/main.c::hardware_init()` 完成流框架、按键、JPEG、摄像头和 LCD/LVGL 初始化。

当 `BBM_DEMO == 1` 时，JPEG0 使用 `VPP_DATA1`：

```c
jpg_cfg(HG_JPG0_DEVID, VPP_DATA1);
```

对应的编码尺寸也必须读取 `photo_msg.out1_w/out1_h`。工程已经在以下两处做了配套处理：

- `video_app.c` 中使用 `get_jpg_default_dpi(1)`。
- `jpg_v2.c::jpg_start()` 中使用 `photo_msg.out1_h/out1_w`。

该约束非常重要。如果数据源使用 `VPP_DATA1`，却按 `VPP_DATA0` 的 640×480 尺寸读取一个实际为 320×240 的缓冲区，会出现 2×2 重复画面和绿色色度块。

## 4.2 UI 初始化

UI 启动链如下：

```text
hardware_init()
  └─ lvgl_init(w, h, rotate)
      ├─ lv_init()
      ├─ lv_port_disp_init()
      ├─ lv_port_indev_init()
      ├─ ui_81x_demo_display()
      │   ├─ ui_81x_demo_show_boot_logo()
      │   └─ 创建 3000 ms 单次定时器
      └─ 创建 gui_thread，运行 lvgl_run()

定时器到期
  └─ ui_81x_demo_boot_timer_cb()
      └─ ui_81x_demo_start_main_ui()
          ├─ setup_ui(&guider_ui)
          ├─ events_init(&guider_ui)
          ├─ custom_init(&guider_ui)
          ├─ ui_81x_demo_create_osd()
          ├─ ui_81x_demo_init_keypad()
          └─ ui_81x_demo_switch_page(LOCAL)
```

主屏幕在 `setup_scr_screen.c` 中创建，尺寸为 320×240，背景透明。`ui_81x_demo_apply_osd_key_bg()` 又将显示器和屏幕底色设置为黑色，用于视频通道暂时无帧或关闭时的背景填充。

## 4.3 网络协议初始化

网络服务初始化完成后，`project/main.c::app_network_init()` 调用 `user_protocol()`。本模块提供强符号实现：

```text
user_protocol()
  └─ bbm_protocol_start()
      ├─ bbm_video_stream_init()
      ├─ usr_protocol_create(11011)
      ├─ bind(INADDR_ANY:11011)
      ├─ 创建 video2_rx 任务
      └─ 创建 video2_tx 任务
```

`protocol_client_init()` 和 `protocol_server_init()` 最终也调用同一个 `bbm_protocol_start()`。`bbm_protocol_started` 保证初始化幂等，因此 AP 和 STA 两种角色共用同一套传输代码。

# 5. 本地视频发送链路

## 5.1 JPEG 数据来源

`video_app.c` 创建 JPEG 视频流后，将编码结果绑定到多个目的流，其中包括：

```c
streamSrc_bind_streamDest(s, R_RTP_JPEG);
```

发送任务通过以下调用订阅该流：

```c
open_stream_available(R_RTP_JPEG, 0, 8, bbm_tx_stream_op, NULL);
start_jpeg();
```

这里的 `8` 是目的端缓存节点数量。任务循环调用 `recv_real_data()` 获取编码帧，处理完成后必须调用 `free_data(frame)` 归还流框架。

## 5.2 兼容两种 JPEG 存储形式

`bbm_copy_encoded_jpeg()` 同时支持：

- `JPEG_FULL`：完整 JPEG 位于连续内存，直接复制。
- 分段 JPEG：数据由 `stream_jpeg_data_s` 链表保存，逐节点复制到连续发送缓冲区。

复制完成后，`bbm_find_jpeg()` 搜索 JPEG SOI `FF D8` 和 EOI `FF D9`，只发送有效 JPEG 区间，避免把编码缓冲区中的前后填充数据发到网络。

## 5.3 分片发送

单帧最大值和 UDP 负载定义如下：

```c
#define BBM_FRAGMENT_PAYLOAD  1300
#define BBM_JPEG_MAX_SIZE     (30 * 1024)
```

每帧最多 24 个分片。`bbm_send_frame()` 逐片调用 `bbm_send_packet()`，每包最多重试 3 次，重试和相邻分片之间均有 1 ms 让步。

发送主调用链：

```text
bbm_video_tx_thread()
  ├─ recv_real_data(R_RTP_JPEG)
  ├─ bbm_copy_encoded_jpeg()
  ├─ bbm_find_jpeg()
  ├─ bbm_send_frame()
  │   └─ bbm_send_packet()
  │       └─ sendto(MSG_DONTWAIT)
  └─ free_data(frame)
```

发送条件包括：

- `bbm_tx_enable == 1`；
- STA 模式下 Wi-Fi 已连接；
- 能够取得有效对端 IP。

# 6. UDP 私有协议

协议版本为 2，端口为 UDP `11011`，协议头固定 28 字节。多字节字段统一使用网络字节序。

| 偏移 | 字段 | 类型 | 说明 |
| ---: | --- | --- | --- |
| 0 | `magic` | `uint32_t` | 固定值 `0x42424D32`，ASCII 近似为 `BBM2` |
| 4 | `frame_id` | `uint32_t` | 帧序号，发送端逐帧递增，允许 32 位回绕 |
| 8 | `frame_len` | `uint32_t` | 完整 JPEG 长度，最大 30 KiB |
| 12 | `frame_time` | `uint32_t` | 发送端 `os_jiffies()` 时间戳 |
| 16 | `version` | `uint16_t` | 当前版本 `2` |
| 18 | `header_size` | `uint16_t` | 当前固定为 `28` |
| 20 | `fragment_index` | `uint16_t` | 当前分片编号，从 0 开始 |
| 22 | `fragment_count` | `uint16_t` | 本帧分片总数，最大 24 |
| 24 | `payload_len` | `uint16_t` | 当前 UDP 负载长度，最大 1300 |
| 26 | `flags` | `uint16_t` | bit0 为首片，bit1 为尾片 |

协议启动时会检查 `sizeof(struct bbm_wire_header) == 28`，用于发现编译器对齐策略变化。但结构体没有显式 `packed` 属性，因此移植到不同 ABI 或编译器时，仍应优先改为字段级序列化，而不是直接依赖结构体布局。

# 7. 远端接收与帧重组

## 7.1 接收任务

`bbm_video_rx_thread()` 在同一个 UDP socket 上调用 `recvfrom()`，接收超时为 20 ms。收到任意有效长度的数据包后，首先通过源地址学习对端 IP，再根据 `bbm_rx_enable` 决定是否解析视频包。

接收调用链：

```text
bbm_video_rx_thread()
  ├─ recvfrom()
  ├─ bbm_learn_peer()
  ├─ bbm_parse_packet()
  │   └─ bbm_rx_accept_packet()
  │       ├─ bbm_rx_start_frame()
  │       ├─ 将 payload 复制到 bbm_rx_jpeg[offset]
  │       ├─ received_map 标记分片
  │       ├─ bbm_find_jpeg()
  │       └─ bbm_submit_remote_jpeg()
  ├─ 检查 150 ms 帧超时
  └─ 检查 2000 ms 对端超时
```

## 7.2 数据包校验

`bbm_parse_packet()` 校验：

- 包长度至少为 28 字节；
- `magic` 和 `version` 正确；
- `header_size` 等于本地协议头大小；
- `payload_len` 位于 1～1300；
- UDP 实际长度等于协议头长度加负载长度。

`bbm_rx_accept_packet()` 进一步校验：

- 分片索引小于分片总数；
- 分片总数不超过 24；
- `offset` 未越过帧长度；
- 每片长度与它在整帧中的位置严格匹配；
- 写入范围不超过 30 KiB 接收缓冲区。

## 7.3 乱序、重复和新旧帧处理

`bbm_rx_assembler` 保存当前正在组装的帧：

```c
struct bbm_rx_assembler {
    uint32_t frame_id;
    uint32_t frame_len;
    uint32_t frame_time;
    uint32_t received_map;
    uint32_t last_packet_time;
    uint16_t fragment_count;
    uint16_t received_count;
    uint8_t active;
};
```

实现使用 32 位位图记录分片，能够接收乱序包并忽略重复包。新帧到达时：

- 若帧号比当前帧旧，记为 `old_packet` 并忽略；
- 若帧号更新，丢弃未完成旧帧并开始组装新帧；
- 帧号比较使用有符号差值，可正确处理 `uint32_t` 回绕附近的常见情况。

一帧超过 150 ms 未收齐时，接收任务复位组帧状态并增加 `frame_timeout`。

## 7.4 投递到解码链路

完整 JPEG 通过固定槽位源流进入解码系统：

```text
S_BBM_REMOTE_JPG_SRC
  └─ SR_OTHER_JPG_REMOTE
      └─ S_JPG_DECODE
          └─ R_VIDEO_P1
```

初始化顺序位于 `bbm_video_stream_init()`：

1. 创建 JPEG 解码流，绑定到 LCD P1。
2. 创建远端 `other_jpg` 流，绑定到 JPEG 解码器。
3. 创建 4 槽位远端 JPEG 源流。

每个源槽位按需申请 30 KiB PSRAM，并在槽位归还时保留内存复用，只在 `STREAM_DATA_DESTORY` 时释放。因此稳定运行后的源槽位池最多占用约 120 KiB PSRAM。

`bbm_submit_remote_jpeg()` 的所有权规则是：

1. `get_src_data_f()` 取得一个空闲 `data_structure`。
2. 将 JPEG 复制到该槽位自己的 PSRAM 缓冲区。
3. 设置 `JPEG_FULL`、真实长度和帧时间。
4. `send_data_to_stream()` 成功后，所有权交给流框架。
5. 发送失败时调用 `force_del_data()` 回收槽位。

# 8. LVGL 页面与视频布局

UI 定义四个可循环切换的页面：

| 页面 | 页面文字 | P0 本地 | P1 远端 | 顶层通道 | 远端解码 |
| --- | --- | --- | --- | --- | --- |
| `UI_81X_DEMO_PAGE_LOCAL` | `LOCAL` | 320×240，坐标 (0,0) | 关闭 | P0 | 关闭 |
| `UI_81X_DEMO_PAGE_REMOTE` | `REMOTE` | 关闭 | 320×240，坐标 (0,0) | P1 | 开启 |
| `UI_81X_DEMO_PAGE_LOCAL_BIG_REMOTE_SMALL` | `LOCAL BIG` | 320×240，坐标 (0,0) | 120×90，右上角 | P1 | 开启 |
| `UI_81X_DEMO_PAGE_REMOTE_BIG_LOCAL_SMALL` | `REMOTE BIG` | 120×90，右上角 | 320×240，坐标 (0,0) | P0 | 开启 |

右上角小窗横坐标计算公式：

```c
SCALE_WIDTH - 120 - 6
```

在 320×240 屏幕上即为 `(194, 6)`。

## 8.1 页面切换调用链

```text
LVGL 按键事件
  ├─ LV_KEY_PREV ──────────────┐
  ├─ LV_KEY_NEXT / ENTER ──────┤
  └─ group edge callback ──────┘
                 │
                 ▼
ui_81x_demo_next_page() / prev_page()
                 │
                 ▼
ui_81x_demo_switch_page()
                 │
                 ▼
ui_81x_demo_apply_page()
                 │
                 ▼
ui_81x_demo_set_video_mode()
                 ├─ lcd_stream_set_video_enable()
                 ├─ lcd_stream_set_video_layout()
                 ├─ bbm_protocol_set_remote_display_size()
                 ├─ ui_81x_demo_open/close_local_stream()
                 └─ bbm_protocol_set_remote_display_enable()
```

## 8.2 本地预览流

本地画面不是直接使用编码 JPEG，而是创建缩放流：

```c
scale3_stream_not_bind(
    "S_81X_LOCAL_DISPLAY",
    input_w, input_h,
    output_w, output_h,
    YUV_P0);
```

随后绑定到 `R_VIDEO_P0`。每次改变本地显示尺寸时，代码会关闭旧流并按新尺寸重新创建，确保全屏和小窗模式使用正确的缩放参数。

## 8.3 远端显示尺寸

UI 通过以下接口设置远端 JPEG 解码输出尺寸：

```c
bbm_protocol_set_remote_display_size(width, height);
```

该函数把宽高编码到一个 32 位参数中：

```c
((uint32_t)width << 16) | height
```

然后通过 `SET_LVGL_VIDEO_ARG` 发给 `other_jpg` 流。`other_jpg_cmd_func()` 在关中断区间更新 `out_w/out_h/step_w/step_h`，避免解码工作与页面切换同时读写尺寸参数。

## 8.4 LCD 布局更新

`lcd_stream_set_video_enable()` 和 `lcd_stream_set_video_layout()` 都在关中断区间更新 `app_lcd_s` 状态：

- `video_p0_enable`、`video_p1_enable`：控制两路视频是否输出；
- `p0_x/y`、`p1_x/y`：控制两路画面坐标；
- `p0_up`：控制 P0/P1 的叠放顺序；
- `layout_pending`：通知 LCD 线程应用新布局；
- `clear_p0_pending/clear_p1_pending`：关闭通道时请求清理旧画面。

# 9. 对端 IP 学习与音视频联动

默认对端地址由 Wi-Fi 角色决定：

| 本机模式 | 默认对端 IP |
| --- | --- |
| STA | `192.168.1.1` |
| AP | `192.168.1.100` |

接收任务收到 UDP 包后，以 `recvfrom()` 返回的源 IP 更新 `bbm_peer_ip`，同时设置 `bbm_peer_ready`。音频对讲模块 `intercom_adpcm.c` 也调用 `bbm_protocol_get_peer_ip()`，因此视频链路学到的 IP 可以被音频链路复用；反过来，音频 ACK 或 UDP 包也会调用 `bbm_protocol_set_peer_ip()` 更新同一个对端地址。

连续 2000 ms 未收到视频包时，接收任务清除：

- `bbm_peer_ready`；
- `bbm_remote_frame_ready`；
- 动态学习到的 `bbm_peer_ip`。

之后发送端会重新退回 AP/STA 对应的默认地址。

# 10. 任务、并发与内存

## 10.1 任务配置

| 任务 | 入口 | 优先级 | 栈大小 | 主要阻塞点 |
| --- | --- | ---: | ---: | --- |
| `video2_rx` | `bbm_video_rx_thread()` | 15 | 2048 | `recvfrom()`，20 ms 超时 |
| `video2_tx` | `bbm_video_tx_thread()` | 15 | 2048 | 轮询视频流，失败时短暂 sleep |
| `gui_thread` | `lvgl_run()` | NORMAL | 4096 | LVGL 主循环 |
| `lcd_thread` | `lcd_thread()` | NORMAL | 1024 | LCD 输出与布局更新 |

视频任务均为永久循环，目前没有停止和销毁路径。

## 10.2 主要缓冲区

| 缓冲区 | 大小 | 存储区域 | 用途 |
| --- | ---: | --- | --- |
| `bbm_tx_packet` | 1328 B | 静态内存，4 字节对齐 | UDP 发送包 |
| `bbm_rx_packet` | 1328 B | 静态内存，4 字节对齐 | UDP 接收包 |
| `bbm_tx_jpeg` | 30 KiB | `.psram.src` | 连续化后的本地 JPEG |
| `bbm_rx_jpeg` | 30 KiB | `.psram.src` | 远端帧重组 |
| 远端源槽位池 | 最多 4 × 30 KiB | 动态 PSRAM | 向解码流投递完整 JPEG |

仅视频对讲模块稳定运行时，JPEG 大缓冲区的 PSRAM 上限约为 180 KiB，未包含流框架节点、JPEG 解码器和 LCD 帧缓冲。

## 10.3 并发模型

- TX 任务独占 `bbm_tx_packet` 和 `bbm_tx_jpeg`。
- RX 任务独占 `bbm_rx_packet`、`bbm_rx_jpeg` 和 `bbm_rx_frame`。
- UI/LVGL 任务写 `bbm_tx_enable`、`bbm_rx_enable`、`bbm_displaydecode_run`。
- 音频、RX 和 TX 任务可能同时访问对端状态变量。
- 这些简单状态使用 `volatile`，但没有互斥锁或原子操作。当前目标平台对自然对齐的 8/32 位访问通常是单次操作，但 `volatile` 不提供跨核同步、复合操作原子性或内存屏障保证。

# 11. 对外 API

## 11.1 视频协议控制 API

| API | 作用 |
| --- | --- |
| `bbm_protocol_set_tx_enable(enable)` | 开关本机 JPEG 网络发送 |
| `bbm_protocol_get_tx_enable()` | 查询发送状态 |
| `bbm_protocol_set_rx_enable(enable)` | 开关收到包后的协议解析 |
| `bbm_protocol_get_rx_enable()` | 查询接收状态 |
| `bbm_protocol_set_remote_display_enable(enable)` | 开关完整远端帧向解码流投递 |
| `bbm_protocol_get_remote_display_enable()` | 查询远端显示门控 |
| `bbm_protocol_set_remote_display_size(w, h)` | 设置远端解码输出尺寸 |
| `bbm_protocol_set_peer_ip(ip)` | 设置/学习对端 IPv4 地址，参数使用网络字节序 |
| `bbm_protocol_get_peer_ip()` | 获取动态地址；未学习时返回默认地址 |
| `bbm_protocol_is_peer_ready()` | 是否已收到对端数据并进入 ready 状态 |
| `bbm_protocol_has_remote_frame()` | 是否至少成功投递过一帧远端 JPEG |
| `bbm_protocol_clear_peer_ready()` | 清除对端和远端首帧状态 |

## 11.2 UI 控制 API

| API | 作用 |
| --- | --- |
| `ui_81x_demo_display()` | 显示启动 Logo，并在 3 秒后进入主界面 |
| `ui_81x_demo_set_video_mode(mode)` | 直接设置视频显示模式 |
| `ui_81x_demo_switch_page(page)` | 切换到指定页面 |
| `ui_81x_demo_next_page()` | 循环切换到下一页 |
| `ui_81x_demo_prev_page()` | 循环切换到上一页 |
| `ui_81x_demo_show_remote_full()` | 只显示远端全屏 |
| `ui_81x_demo_show_local_full()` | 只显示本地全屏 |
| `ui_81x_demo_show_local_big_remote_small()` | 本地全屏、远端右上小窗 |
| `ui_81x_demo_show_remote_big_local_small()` | 远端全屏、本地右上小窗 |
| `ui_81x_demo_hide_video()` | 关闭 P0/P1 视频显示 |

# 12. 调试日志说明

发送端每秒打印一次：

```text
video2_tx peer:... frame:... drop:... pkt:... fail:... empty:... speed:...KB/s fd:...
```

| 字段 | 含义 |
| --- | --- |
| `frame` | 成功发送的完整 JPEG 帧数 |
| `drop` | JPEG 提取失败或任一分片发送失败的帧数 |
| `pkt` | 成功发送的 UDP 分片数 |
| `fail` | 经过 3 次重试仍失败的分片数 |
| `empty` | 本次轮询未取得 JPEG 帧的次数 |
| `speed` | 本秒发送协议数据量，单位 KiB/s |

接收端每秒打印一次：

```text
video2_rx en:... pkt:... invalid:... old:... dup:...
frame:start/complete drop:... timeout:... gated:...
stream:... busy:... mem:... route:... speed:... state:... id:... got:.../...
```

重点字段：

| 字段 | 含义及排查方向 |
| --- | --- |
| `invalid` | 协议头、长度或分片参数非法；检查版本、端口和数据损坏 |
| `old` | 收到比当前组装帧更旧的分片；通常由网络乱序或延迟引起 |
| `dup` | 重复 UDP 分片 |
| `drop` | 新帧到达时旧帧仍未完成 |
| `timeout` | 150 ms 内未收齐一帧 |
| `gated` | 已收齐，但当前 UI 不需要显示远端画面 |
| `stream` | 成功投递到远端 JPEG 解码流的帧数 |
| `busy` | 4 个远端源槽位全部占用，解码链路消费不及时 |
| `mem` | 源槽位 PSRAM 申请失败 |
| `route` | `send_data_to_stream()` 失败 |
| `got x/y` | 当前帧已收到分片数/总分片数 |

# 13. 常见问题定位

## 13.1 本地画面正常，远端黑屏

按以下顺序检查：

1. `video2_rx pkt` 是否增长。
2. `invalid` 是否持续增长。
3. `frame_complete` 是否增长。
4. 当前页面的 `en` 是否为 1；本地全屏页会主动关闭远端投递。
5. `stream` 是否增长，`busy/mem/route` 是否异常。
6. `lcd_stream_set_video_enable()` 是否已开启 P1。
7. `SET_LVGL_VIDEO_ARG` 的输出尺寸是否与当前页面一致。

## 13.2 远端画面卡顿或马赛克

- `timeout/drop` 高：Wi-Fi 丢包、单帧分片过多或 150 ms 超时太短。
- `fail` 高：发送 socket 繁忙，当前非阻塞发送重试仍不足。
- `busy` 高：JPEG 解码或 LCD 消费速度低于网络输入速度。
- JPEG 超过 30 KiB：发送端会整帧丢弃，可降低分辨率/质量或提高上限。

当前协议没有校验和、FEC、NACK 或关键帧重传。UDP 包丢失会导致整帧在超时或新帧到达时被丢弃，但不会污染下一帧。

## 13.3 画面出现 2×2 重复或绿色块

优先检查 JPEG0 的源和尺寸是否匹配：

- `jpg_cfg(HG_JPG0_DEVID, VPP_DATA1)`；
- `get_jpg_default_dpi(1)`；
- `jpg_start()` 使用 `photo_msg.out1_w/out1_h`。

这三处必须保持一致。

## 13.4 页面切换后残留旧画面

检查 `lcd_stream_set_video_enable()` 是否触发 `clear_p0_pending` 或 `clear_p1_pending`，以及 LCD 线程是否消费这些标志。布局函数只更新坐标与层级，不负责关闭旧通道。

# 14. 二次开发指南

## 14.1 新增一种布局

1. 在 `ui_81x_demo_video_mode_t` 中增加模式。
2. 如需成为可翻页页面，在 `ui_81x_demo_page_t` 中增加页面。
3. 在 `ui_81x_demo_page_name()` 中增加 OSD 名称。
4. 编写布局函数，设置 P0/P1 使能、远端尺寸、坐标和本地缩放尺寸。
5. 在 `ui_81x_demo_set_video_mode()` 中增加分支。
6. 在 `ui_81x_demo_apply_page()` 中建立页面到视频模式的映射。
7. 验证 PIP 坐标没有超出 `SCALE_WIDTH/SCALE_HIGH`。

## 14.2 修改分辨率

需要同步检查：

- 摄像头输入 `photo_msg.in_w/in_h`；
- VPP DATA0/DATA1 输出尺寸；
- JPEG0 编码源和默认 DPI；
- `BBM_JPEG_MAX_SIZE` 是否容纳新 JPEG；
- LCD P0 本地缩放输出；
- P1 远端解码输出；
- UI 主屏幕和 PIP 坐标；
- PSRAM 总占用。

## 14.3 修改 UDP 分片大小

双方必须同时修改 `BBM_FRAGMENT_PAYLOAD`。还要同步评估：

- `bbm_tx_packet`、`bbm_rx_packet` 大小；
- `BBM_MAX_FRAGMENTS`；
- `received_map` 位数；
- Wi-Fi MTU，避免 IP 层再次分片；
- 发送间隔和帧超时。

当前 1300 字节负载加 28 字节私有头、8 字节 UDP 头和 20 字节 IPv4 头，总计约 1356 字节，低于常见 1500 字节 MTU。

## 14.4 增加协议可靠性

推荐按兼容性从低到高逐步扩展：

1. 在协议头尾部增加 CRC32，并升级 `BBM_WIRE_VERSION`。
2. 增加会话 ID，避免设备重启后旧包与新帧号混淆。
3. 增加接收端丢片统计和周期性反馈。
4. 对关键帧或低分片数帧增加选择性重传。
5. 网络较差时动态降低 JPEG 质量或帧率。

# 15. 已知风险与改进建议

以下项目不会阻止当前功能运行，但在产品化前值得处理：

1. **任务创建返回值未检查。** `csi_kernel_task_new()` 失败后仍会把协议标记为已启动，且没有回滚 socket 和流资源。
2. **部分初始化失败没有统一清理。** 解码流成功而后续源流失败时，已创建资源保持打开。
3. **没有停止/重启接口。** 两个任务永久循环，socket、流和 PSRAM 槽位仅适合一次性启动模型。
4. **协议结构依赖 ABI。** 虽然检查了 28 字节大小，但更稳妥的做法是显式序列化各字段。
5. **共享状态只使用 `volatile`。** 多任务并发更新对端状态时缺少明确同步机制。
6. **对端学习接受任意 UDP 源。** 在解析协议头之前就更新 peer IP，局域网内发往 11011 端口的任意数据都可能改变发送目标。建议至少在 magic/version 校验后再学习，产品环境可增加配对标识或鉴权。
7. **未校验 FIRST/LAST 标志。** 当前主要依赖 index/count，标志字段被发送但接收端没有验证。
8. **无数据完整性校验。** UDP 校验和之外没有帧级 CRC，错误载荷可能进入 JPEG 解码器。
9. **UI 重入清理不完整。** `ui_81x_demo_display()` 若被多次调用，旧定时器、按键组和页面对象的生命周期需要额外确认。
10. **公共声明存在重复。** `video_intercom.h` 与 `sdk/include/bbm_protocol.h` 维护同一组 API，后续容易发生声明不一致，建议保留单一公共头文件。

# 16. 构建与集成检查清单

工程的 `project/fpv_app_umac4.mk` 已包含：

- `sdk/app/video_intercom/video_intercom.c`；
- `sdk/lib/gui/81x_demo_ui/81x_demo_ui.c`；
- `generated/` 下的 GUI Guider 源文件；
- `custom/custom.c`；
- `ui_res/ui_bgLogo.c`。

编译前确认：

- `BBM_DEMO == 1`；
- `JPG_EN == 1`；
- `DVP_EN == 1`；
- `LCD_EN == 1`；
- `LVGL_STREAM_ENABLE` 与目标 LVGL 显示路径一致；
- `KEY_MODULE_EN == 1` 时按键输入已注册；
- 工程中只保留一个强符号 `user_protocol()` 实现，避免与旧版 `babyprotocol.c` 同时链接产生冲突或选错协议实现；
- 链接脚本存在 `.psram.src` 段，并且 PSRAM 容量足够。

# 17. 核心流程总结

这套视频对讲方案的关键设计可以概括为三层：

1. **媒体层**：JPEG0 从 `VPP_DATA1` 编码，本地 YUV 通过 P0 预览，远端 JPEG 通过 P1 解码显示。
2. **传输层**：单帧 JPEG 按 1300 字节切分，通过 UDP 11011 双向传输；接收端支持乱序、重复包过滤、新旧帧判断和 150 ms 超时丢帧。
3. **交互层**：LVGL 提供启动 Logo、页面名称和按键事件，页面状态机统一控制本地/远端通道使能、尺寸、位置和层级。

开发和调试时应始终沿着以下顺序定位问题：

```text
摄像头/VPP → JPEG 编码 → R_RTP_JPEG → UDP 发送
→ UDP 接收 → 分片重组 → other_jpg → JPEG 解码
→ LCD P1 → P0/P1 布局 → LVGL 页面控制
```

只要明确每一层的数据格式、缓冲区所有权和开关状态，就能快速区分问题究竟发生在编码、网络、解码、LCD 合成还是 UI 控制环节。
