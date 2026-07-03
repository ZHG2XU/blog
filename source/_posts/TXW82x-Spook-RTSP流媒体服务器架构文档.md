---
title: "TXW82x Spook RTSP 流媒体服务器架构文档"
date: 2026-06-30
categories:
  - 嵌入式开发
  - 项目文档
tags:
  - RTSP
  - RTP
  - C语言
  - MSI
  - TXW82x
  - JPEG
  - H.264
  - 嵌入式
  - 流媒体
  - Wi-Fi图传
toc_number: false
excerpt: "TXW82x 平台基于 Spook 开源框架的 RTSP 流媒体服务器完整架构文档。涵盖 MJPEG/H.264 硬件编码、RTP 封包、RTSP 协议交互、MSI 管道流水线、Stream 发布-订阅模型及完整调用链分析。适用于 TXW82x（CK810 CPU + 硬件JPEG/H264编码器 + lwIP协议栈）平台的 Wi-Fi 图传（FPV）开发。"
---

# TXW82x Spook RTSP 流媒体服务器架构文档

## 1. 概述

Spook 是一个运行在 TXW82x 嵌入式芯片上的轻量级 **RTSP 流媒体服务器**，通过 Wi-Fi 将摄像头采集的视频以 RTSP 协议推送给手机/电脑等客户端。最初由 Nathan Lutchansky 于 2004 年开发的开源项目，后被移植到 TXW82x 平台（CK810 CPU + lwIP 协议栈）。

### 1.1 核心能力

| 能力 | 说明 |
|------|------|
| 视频编码 | MJPEG (硬件 JPEG 编码器)、H.264 (硬件 H.264 编码器) |
| 音频编码 | AAC (硬件音频编码器) |
| 传输协议 | RTP/AVP over UDP、RTP/AVP over TCP (RTSP 交织) |
| 默认端口 | 554 |
| 多路流 | 同时注册多个 RTSP 路径，独立推流 |
| 录像回放 | 支持通过 RTSP 回放 SD 卡中的 MP4/AVI 文件 |
| 并发客户端 | 多客户端同时连接同一路流 |

### 1.2 硬件平台

| 组件 | 说明 |
|------|------|
| CPU | CK810 (C-SKY 架构) |
| 视频编码 | 硬件 JPEG 编码器 + 硬件 H.264 编码器 |
| 音频编码 | 硬件 AAC 编码器 |
| 网络 | Wi-Fi (AP 模式，默认 IP 192.168.169.1) |
| 内存 | SRAM + PSRAM 混合堆 |

---

## 2. 软件架构

### 2.1 模块层次图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         应用层 (app_fpv.c)                            │
│     spook_init() → 初始化基础设施                                      │
│     rtsp_mjpeg_live_init() → 注册 /webcam 路径                        │
│     rtsp_h264_live_init()  → 注册 /h264 路径                          │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────────┐
│  Spook RTSP Server 内核                                                │
│                                                                       │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐  │
│  │  spook.c     │   │  rtsp_common.c   │   │  tcp.c               │  │
│  │  模块入口     │   │  RTSP协议层      │   │  TCP连接管理         │  │
│  │  随机数工具   │   │  路径注册/会话管理 │   │  事件驱动I/O         │  │
│  └──────────────┘   └────────┬─────────┘   └──────────────────────┘  │
│                              │                                        │
│  ┌───────────────────────────┼────────────────────────────────────┐   │
│  │   RTSP 路径注册            按需调用                              │   │
│  │                                                               │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐            │   │
│  │  │ rtsp_mjpeg_live.c   │  │ rtsp_h264_live.c    │            │   │
│  │  │ /webcam (MJPEG)     │  │ /h264 (H.264)       │            │   │
│  │  └─────────┬───────────┘  └─────────┬───────────┘            │   │
│  │            │                        │                        │   │
│  │  ┌─────────▼───────────┐  ┌─────────▼───────────┐           │   │
│  │  │ custom_rtsp_jpg.c   │  │ webfile.c            │           │   │
│  │  │ /custom (动态源)    │  │ /file (文件回放)     │           │   │
│  │  └─────────────────────┘  └─────────────────────┘           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │  rtp.c       │   │  rtp-jpeg.c  │   │  rtp-h264.c          │   │
│  │  RTP协议层    │   │  JPEG分包     │   │  H.264 FU-A分片     │   │
│  └──────────────┘   └──────────────┘   └──────────────────────┘   │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │  session.c   │   │  stream.c    │   │  frame.c             │   │
│  │  会话管理     │   │  流管道      │   │  帧管理/MSI接口      │   │
│  └──────────────┘   └──────────────┘   └──────────────────────┘   │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │  encoder-    │   │  encoder-    │   │  encoder-            │   │
│  │  jpeg.c/h    │   │  h264.c      │   │  audio.c/h           │   │
│  │  JPEG适配    │   │  H264适配    │   │  音频适配             │   │
│  └──────────────┘   └──────────────┘   └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────────┐
│  SDK 底层依赖                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐  │
│  │ lwIP     │ │ csi_     │ │  MSI     │ │ video_app  │ │audio   │  │
│  │ TCP/IP   │ │ kernel   │ │ 多媒体   │ │ 视频应用   │ │媒体    │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ └────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  硬件层: 摄像头(CSI/DVP) → ISP → JPEG/H264编码器 → Wi-Fi     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| **spook.c** | ~145 | 模块入口：`spook_init()`，随机数工具，`rtp_name` 定义 |
| **spook.h** | ~10 | 对外接口声明 |
| **spook_config.h** | ~70 | 全局配置宏、编码器名称、`rtp_name` 结构体 |
| **rtsp.c** | - | RTSP 协议解析器 |
| **rtsp_common.c** | ~500+ | 路径注册、轨道设置、SDP 生成、会话管理 |
| **rtsp_common.h** | ~70 | `rtsp_source`、`rtsp_session`、`rtsp_track` 定义 |
| **rtsp_mjpeg_live.c** | ~180 | `/webcam` — MJPEG 实时预览路径实现 |
| **rtsp_h264_live.c** | ~260 | `/h264` — H.264 实时流 + `/loop/RECA/` 回放 |
| **custom_rtsp_jpg.c** | ~160 | `/custom` — 自定义视频源路径 |
| **webfile.c** | ~230 | `/file` — SD 卡文件回放(已注释) |
| **rtp.h** | - | RTP 核心结构体定义 |
| **rtp.c** | ~700 | RTP 包收发、UDP/TCP 传输、RTCP |
| **rtp-jpeg.c** | ~560 | JPEG RTP 封包(RFC 2435) |
| **rtp-h264.c** | ~320 | H.264 RTP 封包(RFC 3984, FU-A) |
| **rtp-audio.c** | - | AAC RTP 封包 |
| **stream.c** | ~120 | Stream 发布-订阅管道 |
| **stream.h** | ~40 | Stream 结构体定义 |
| **frame.h** | ~160 | Frame 结构体、FrameExchanger、回调函数类型 |
| **frame.c** | ~410 | 帧管理、MSI 接口、**主发送线程** |
| **session.c** | ~60 | RTP 媒体会话管理 |
| **session.h** | ~10 | 会话接口声明 |
| **rtp_media.h** | ~50 | RTP 媒体接口定义 |
| **encoder-jpeg.c** | ~150 | JPEG 编码器适配 |
| **encoder-jpeg.h** | ~25 | JPEG 编码器结构体 |
| **encoder-h264.c** | ~140 | H.264 编码器适配 |
| **encoder-audio.c** | ~145 | AAC 音频编码器适配 |
| **encoder-audio.h** | ~15 | 音频编码器结构体 |
| **event.h** | - | 事件驱动框架(基于 eloop) |
| **tcp.c** | - | TCP 连接管理 |
| **pmsg.h/c** | - | HTTP/RTSP 协议消息解析 |
| **log.h** | - | 日志宏(已注释禁用) |
| **access_log.c** | - | 访问日志 |
| **ephoto.c** | - | 测试 JPEG 图片数据 |

---

## 3. 核心数据结构

### 3.1 `rtp_name` — 路径描述符

定义于 `spook_config.h`，描述一条 RTSP 流所需的编码器和路径信息。

```c
typedef struct {
    const char *video_encode_name;   // 视频编码器 stream 名称 (如 "jpg_encoder")
    const char *audio_encode_name;   // 音频编码器 stream 名称 (如 "audio_aac_encoder")
    const char *path;                // RTSP URL 路径 (如 "/webcam")
} rtp_name;
```

使用示例：

```c
const rtp_name live_dvp = {
    .video_encode_name = JPG_ENCODER_NAME,       // "jpg_encoder"
    .audio_encode_name = AUDIO_AAC_ENCODER_NAME,  // "audio_aac_encoder"
    .path              = "/webcam",
};
```

### 3.2 `rtsp_source` — RTSP 源

定义于 `rtsp_common.h`，代表一个 RTSP 路径的完整状态。

```c
struct rtsp_source {
    struct rtsp_session *sess_list;         // 当前连接的 session 链表
    struct rtsp_track track[MAX_TRACKS];    // 轨道数组 (MAX_TRACKS=4)
    struct os_task handle;                  // 发送线程句柄
    void *signal;
    struct rtp_node live_node;              // video_ex / audio_ex 指针
    int head_len;
    rtsp_creat creat;                       // 创建回调 → self_creat()
    rtsp_release release;                   // 释放回调 → self_destory()
    rtsp_play_fn play;                      // 播放回调
    void *priv;                             // 私有数据 → rtsp_priv
};
```

### 3.3 `rtsp_track` — 轨道

```c
struct rtsp_track {
    int index;                          // 轨道索引 (0=视频, 1=音频)
    struct rtsp_source *source;         // 所属 source
    struct stream_destination *stream;  // 连接到编码器 stream 的消费者
    int ready;                          // PLAY 后置 1
    struct rtp_media *rtp;              // RTP 媒体处理接口
};
```

### 3.4 `rtp_media` — RTP 媒体接口

定义于 `rtp_media.h`，纯函数指针结构体，定义了对一种媒体类型的全部操作。

```c
struct rtp_media {
    rtp_media_get_sdp_func get_sdp;          // 生成 SDP 描述行
    rtp_media_get_payload_func get_payload;  // 获取 RTP payload 类型号
    rtp_media_frame_func frame;              // 处理视频帧 (解析头)
    rtp_media_send_func send;                // 已废弃
    rtp_media_send_more_func send_more;      // 发送给所有连接客户端
    rtp_media_send_func rtcp_send;           // RTCP 发送
    void *private;                           // 私有数据 (如 rtp_jpeg *)
    int per_ms_incr;                         // 每毫秒时间戳增量
    uint32_t sample_rate;                    // 采样率
    uint8_t type;                            // 0=视频, 1=音频
};
```

### 3.5 `frame_exchanger` — 帧交换器

定义于 `frame.h`，单 slot 的帧转发器，是编码器输出和 stream 管道之间的桥梁。

```c
struct frame_exchanger {
    int ready;                        // 是否就绪
    int scan_ready;                   // 编码器是否运行
    frame_deliver_func f;             // 帧递送回调 (get_back_frame)
    struct frame *jf;                 // 单 slot 帧指针
    void *d;                          // 回调参数 (jpeg_encoder *)
};
```

### 3.6 `rtp_node` — 音视频出口节点

```c
struct rtp_node {
    void *video_ex;     // → frame_exchanger * (jpeg_encoder->ex)
    void *audio_ex;     // → frame_exchanger * (audio_encoder->ex)
    void *priv;
};
```

### 3.7 `rtsp_priv` — 路径私有数据

```c
struct rtsp_priv {
    struct rtp_node *live_node;
    stream *webfile_s;
    struct msi *video_msi;       // 视频编码器 MSI (如 AUTO_JPG)
    struct msi *audio_msi;       // 音频编码器 MSI
    struct msi *v_msi;           // RTSP 接收 MSI (如 R_RTP_JPEG)
    struct msi *a_msi;           // RTSP 音频接收 MSI
};
```

### 3.8 `rtp_endpoint` — RTP 端点

```c
struct rtp_endpoint {
    struct session *session;     // 所属 RTSP session
    int payload;                 // RTP payload 类型 (26=MJPEG, 96=H264)
    int max_data_size;           // 最大数据包大小 (1440)
    unsigned int ssrc;           // 同步源标识 (随机生成)
    unsigned int start_timestamp;
    unsigned int last_timestamp;
    int seqnum;                  // 序列号 (从随机值开始递增)
    int packet_count;
    int octet_count;
    int sendEnable;              // 是否允许发送
    int trans_type;              // RTP_TRANS_UDP 或 RTP_TRANS_INTER(TCP)
    union {
        struct { /* UDP: fd, port, event */ } udp;
        struct { /* TCP: conn, channel */ } inter;
    } trans;
};
```

---

## 4. 完整 MJPEG 流调用链

### 4.1 初始化阶段

#### 阶段流程图

```
main() → fpv_app_init() → user_protocol()
  │
  └─ spook_init()                              [spook.c]
       │
       └─ spook_thread()
            │
            ├─ init_random()
            │    └─ random_key = 0x12345678
            │
            ├─ global_init()
            │    └─ config_port(554)           [spook.c]
            │
            ├─ jpeg_encode_init("jpg_encoder") [encoder-jpeg.c]
            │    ├─ start_block()
            │    │    └─ malloc(jpeg_encoder)   ← 分配编码器结构体
            │    ├─ set_output("jpg_encoder", en)
            │    │    └─ new_stream("jpg_encoder", FORMAT_JPEG, en)
            │    │       └─ 创建 stream 节点，挂入全局链表
            │    └─ end_block(en)
            │         └─ new_exchanger(16, get_back_frame, en)
            │            └─ 创建 frame_exchanger，回调=get_back_frame
            │
            ├─ h264_encode_init("h264_encoder") [encoder-h264.c]
            │    └─ 同上，创建 "h264_encoder" stream
            │
            ├─ rtsp_audio_encode_init("audio_aac_encoder")  [encoder-audio.c]
            │    └─ 创建 "audio_aac_encoder" stream
            │
            ├─ rtsp_audio_encode_init("audio_aac_encoder2")
            │    └─ 创建 "audio_aac_encoder2" stream
            │
            ├─ rtsp_mjpeg_live_init(&live_dvp) [rtsp_mjpeg_live.c]
            │    ├─ rtsp_start_block()
            │    │    └─ malloc(rtsp_source)
            │    ├─ rtsp_set_path("/webcam", source, self_rtsp_open)
            │    ├─ set_video_track("jpg_encoder", source)
            │    │    ├─ connect_to_stream("jpg_encoder", rtsp_common_send, &track)
            │    │    │   → 查找已存在的 stream("jpg_encoder")
            │    │    │   → 创建 stream_destination，注册回调 rtsp_common_send
            │    │    ├─ source->live_node.video_ex = get_video_ex(en)
            │    │    │   → en->ex (jpeg_encoder 的 frame_exchanger)
            │    │    └─ track->rtp = new_rtp_media_jpeg_stream(stream)
            │    │        → 创建 rtp_media {
            │    │            .frame     = jpeg_process_frame,
            │    │            .send_more = jpeg_send_more,
            │    │            .get_sdp   = jpeg_get_sdp
            │    │          }
            │    │
            │    ├─ set_audio_track("audio_aac_encoder", source)
            │    │    └─ 同上，音频轨道
            │    ├─ register_live_fn(source, self_creat, self_destory, NULL)
            │    └─ rtsp_end_block(source)
            │
            ├─ rtsp_h264_live_init(&live_h264)        ← 注册 /h264
            ├─ custom_rtsp_jpeg_init(&live_custom)    ← 注册 /custom
            └─ rtsp_h264_live_init(&live_h264_2)      ← 注册 /loop/RECA/
```

#### 初始化后内存结构

```
stream 全局链表
  ├─ "jpg_encoder" (FORMAT_JPEG)
  │    ├─ private → jpeg_encoder
  │    │              ├─ output → stream("jpg_encoder") 自指
  │    │              └─ ex → frame_exchanger
  │    │                      ├─ f = get_back_frame
  │    │                      ├─ d = jpeg_encoder
  │    │                      └─ jf = frame *
  │    └─ dest_list
  │         └─ stream_destination [video track of /webcam]
  │              ├─ process_frame = rtsp_common_send
  │              └─ d = &rtsp_source.track[0]
  │
  ├─ "h264_encoder" (FORMAT_H264)
  ├─ "audio_aac_encoder" (FORMAT_AUDIO)
  └─ "audio_aac_encoder2" (FORMAT_AUDIO)

RTSP 路径注册表
  ├─ "/webcam" → rtsp_source
  │    ├─ track[0]: video → rtp_media(jpeg_process_frame)
  │    ├─ track[1]: audio → rtp_media(audio_send)
  │    └─ live_node.video_ex → frame_exchanger(get_back_frame)
  │
  ├─ "/h264" → rtsp_source
  ├─ "/custom" → rtsp_source
  └─ "/loop/RECA/" → rtsp_source
```

### 4.2 客户端连接阶段

#### RTSP 协议交互

```
客户端 (VLC/ffplay)             服务器 (端口 554)
      │                                │
      │  ── TCP connect ──►            │  tcp.c: accept → conn
      │                                │
      │  ── OPTIONS ──►                │  rtsp.c: 回复支持方法
      │  ◄── 200 OK ──                │
      │                                │
      │  ── DESCRIBE /webcam ──►       │
      │                                │  → 查找路径 "/webcam"
      │                                │  → self_rtsp_open()
      │                                │  → rtsp_open() 创建 session
      │  ◄── SDP ──                    │
      │    m=video 0 RTP/AVP 26       │  track0: MJPEG
      │    m=audio 0 RTP/AVP 97       │  track1: AAC
      │                                │
      │  ── SETUP track0 ──►           │  ★ 首次 SETUP 触发重量级初始化
      │                                │  rtsp_setup(s, t=0)
      │                                │    └─ source->creat(source, path)
      │                                │       → self_creat() [rtsp_mjpeg_live.c]
      │                                │         ├─ os_zalloc(rtsp_priv)
      │                                │         ├─ r->video_msi = msi_find(AUTO_JPG,1)
      │                                │         ├─ r->v_msi = rtsp_msi_init(...)
      │                                │         ├─ msi_add_output(video_msi, NULL, R_RTP_JPEG)
      │                                │         └─ OS_TASK_INIT("live_rtsp_mjpeg", ...)
      │                                │  → new_rtp_endpoint(26)
      │  ◄── 200 OK (channel 0-1) ──   │
      │                                │
      │  ── SETUP track1 ──►           │  (线程已存在，不再创建)
      │  ◄── 200 OK (channel 2-3) ──   │
      │                                │
      │  ── PLAY ──►                   │
      │                                │  rtsp_play(s, start)
      │                                │    ├─ ls->playing = 1
      │                                │    ├─ track->ready = 1
      │                                │    └─ set_waiting(stream, 1)
      │                                │       → jpeg_encoder->running = 1
      │                                │       → ex->scan_ready = 1
      │  ◄── 200 OK ──                │
      │                                │
      │  ◄══ RTP 数据流 ══►           │  发送线程开始推流
      │    $ (interleaved data)        │  TCP 交织通道 0-1 持续发送
```

### 4.3 数据发送阶段

#### 核心发送线程 `spook_send_thread_stream()`

定义于 `frame.c:316`，是整个流媒体服务的**心脏**。

```c
void spook_send_thread_stream(struct rtsp_priv *r)
{
    while (1)
    {
        // ── [可选] 音频处理 ──
        if (audio_rtsp) {
            audio_fb = msi_get_fb(audio_rtsp->msi, 0);   // 取音频帧
            if (audio_fb) {
                audio_ex->f(audio, audio_ex->d);          // → 发送音频
            }
        }

        // ── [核心] 视频处理 ──
        fb = msi_get_fb(jpg_rtsp->msi, 0);                // ① 取视频帧(MSI队列)

        if (fb) {
            jpeg = ex->jf;                                 // ② 取 frame slot
            jpeg->get_f = fb;                              // ③ 绑定 framebuff
            jpeg->d      = fb->data;
            jpeg->length = fb->len;
            jpeg->timestamp = fb->time;

            ex->f(jpeg, ex->d);                            // ④ 送入 stream 管道
        }

        // ── 无帧时休眠 ──
        if (!fb && !audio_fb) {
            os_sleep_ms(1);                                // 等 1ms
            if (超时>1000ms) ex->f(NULL, ex->d);            // 空帧保活
            continue;
        }
    }
}
```

#### 帧处理完整调用链

```
① msi_get_fb(v_msi, 0)     ← 从 MSI 队列取帧 (缓冲区 28 帧)
      │
      ▼
② 填充 frame 结构体
      │
      ▼
③ ex->f(jpeg, ex->d)
   │  ex->f = get_back_frame    [encoder-jpeg.c]
   │  ex->d = jpeg_encoder *
      │
      ▼
④ get_back_frame(f, en)       [encoder-jpeg.c]
      │
      ▼
⑤ deliver_frame_to_stream(f, en->output)  [stream.c]
      │  en->output = stream("jpg_encoder")
      │
      ▼  [遍历 stream 的 dest_list]
      │
⑥ dest->process_frame(f, &track[t])
   │  = rtsp_common_send(f, track)          [rtsp_common.c]
      │
      ├─ [6a] JPEG 头解析 ──────────────────────────────────┐
      │  track->rtp->frame(f, track->rtp)                   │
      │  = jpeg_process_frame(f, rtp)     [rtp-jpeg.c]      │
      │    │                                                 │
      │    ├─ 遍历 JPEG 标记:                                │
      │    │  0xFFD8 SOI (图像起始)                          │
      │    │  0xFFDB DQT → parse_DQT()  解析量化表           │
      │    │  0xFFC0 SOF → parse_SOF()  解析宽/高/采样       │
      │    │  0xFFC4 DHT → parse_DHT()  解析哈夫曼表         │
      │    │  0xFFDD DRI → parse_DRI()  解析重置间隔         │
      │    │  0xFFDA SOS → 找到扫描数据起始位置              │
      │    │                                                  │
      │    ├─ out->scan_data = f->d + offset                 │
      │    ├─ out->scan_data_len = data_length               │
      │    ├─ out->init_done = 1                             │
      │    └─ return 1 (解析完成)                            │
      └─────────────────────────────────────────────────────┘
              │
              ▼
      └─ [6b] RTP 分包发送 ─────────────────────────────────┐
         track->rtp->send_more(loop_search_ep,              │
             ls, track, track->rtp->private)                │
         = jpeg_send_more(...)           [rtp-jpeg.c]       │
           │                                                │
           └─ 遍历所有连接的客户端 session:                   │
                │                                           │
                ▼                                           │
              jpeg_send_frame_to_endpoint(ep, out, fb)      │
                │                                           │
                ├─ 构建 RTP 固定头 (12字节)                  │
                │  V=2, P=0, PT=26, sequence++, timestamp   │
                │                                           │
                ├─ 构建 JPEG 特定头 (8或12字节)              │
                │  type, width/8, height/8, quant tables    │
                │                                           │
                ├─ 附加量化表 (128字节)                      │
                │                                           │
                ├─ [可选] 扩展头 (EXTHDR)                    │
                │  Huffman 表 + DRI 信息                     │
                │                                           │
                └─ 循环分包:                                │
                     while i < scan_data_len:               │
                       ├─ max_size = rtp_get_payload_size() │
                       ├─ 构建数据分片 (32字节对齐)           │
                       └─ rtp_sendmsg(ep, v, ...)           │
                            ├─ UDP: sendto() + 重试×30      │
                            └─ TCP: send() 交织通道          │
      └─────────────────────────────────────────────────────┘
```

---

## 5. Stream 发布-订阅模型

Stream 管道是 Spook 实现**编码器与消费者解耦**的核心设计。

### 5.1 模型

```
生产者 (编码器)                         消费者 (RTSP/HTTP)
    │                                       │
    │  new_stream("jpg_encoder", ...)        │
    │  └─ 创建命名的 stream 节点             │
    │                                       │
    │                                       │  connect_to_stream("jpg_encoder", cb, d)
    │                                       │  └─ 创建 stream_destination
    │                                       │     ├─ process_frame = 回调函数
    │                                       │     └─ d = 回调参数
    │                                       │
    │  deliver_frame_to_stream(f, stream)    │
    │  └─ 遍历 stream->dest_list             │
    │      └─ dest->process_frame(f, d) ──► │  收到帧
    │                                       │
    │                                       │  connect_to_stream("jpg_encoder", cb2, d2)
    │                                       │  └─ 第二个消费者加入
    │                                       │
    │  deliver_frame_to_stream(f, stream)    │
    │  └─ 遍历 dest_list                    │
    │      ├─ dest->process_frame(f, d) ──► │  消费者1收到
    │      └─ dest->process_frame(f, d) ──► │  消费者2也收到
```

### 5.2 关键 API

```c
// 生产者接口
struct stream *new_stream(const char *name, int format, void *d);
void deliver_frame_to_stream(struct frame *f, void *d);  // d = stream指针

// 消费者接口
struct stream_destination *connect_to_stream(const char *name,
    frame_deliver_func process_frame, void *d);
void set_waiting(struct stream_destination *dest, int waiting);
void disconnect_stream(struct stream_destination *dest, ...);
```

### 5.3 在 MJPEG 流中的应用

```
jpeg_encode_init("jpg_encoder")    ← 生产者
  └─ new_stream("jpg_encoder")     ← 创建管道

set_video_track("jpg_encoder",...) ← 消费者 (RTSP)
  └─ connect_to_stream("jpg_encoder", rtsp_common_send, &track)
                                   ← 注册回调

get_back_frame(f, en)              ← 帧到达
  └─ deliver_frame_to_stream(f, en->output)
       └─ rtsp_common_send(f, &track)
            └─ jpeg_process_frame + jpeg_send_more
```

---

## 6. 关键配置参数

### 6.1 `spook_config.h`

| 宏 | 默认值 | 说明 |
|----|--------|------|
| `SPOOK_PORT` | 554 | RTSP 服务端口号 |
| `MAX_DATA_PACKET_SIZE` | 1440 | RTP 最大数据包大小 (MTU 限制) |
| `EXCHANGER_SLOT_SIZE` | 16 | FrameExchanger 的 slot 数量 |
| `JPEG_FRAMEINC` | 1 | JPEG 帧率分子 |
| `H264_FRAMEINC` | 1 | H.264 帧率分子 |
| `SCAN_DATA_OFFSET` | 0x253 | JPEG 扫描数据偏移量 |
| `SPOOK_CACHE_BUF_LEN` | 1600 | TCP 发送缓存大小 |

### 6.2 `frame.c` 内部配置

| 宏 | 默认值 | 说明 |
|----|--------|------|
| `MAX_RTSP_JPG_RECV` | 28 | JPEG MSI 接收缓冲区深度 |
| `MAX_RTSP_AUDIO_RECV` | 10 | 音频 MSI 接收缓冲区深度 |

### 6.3 编码器名称宏

| 宏 | 值 | 用途 |
|----|-----|------|
| `JPG_ENCODER_NAME` | `"jpg_encoder"` | MJPEG 编码器 stream 名 |
| `H264_ENCODER_NAME` | `"h264_encoder"` | H.264 编码器 stream 名 |
| `AUDIO_AAC_ENCODER_NAME` | `"audio_aac_encoder"` | 音频 stream 名 (用于 /webcam) |
| `AUDIO_AAC_ENCODER_NAME2` | `"audio_aac_encoder2"` | 音频 stream 名2 (用于 /h264) |

---

## 7. RTSP 路径一览

| 路径 | 变量名 | 视频编码 | 音频编码 | 功能 |
|------|--------|---------|---------|------|
| `/webcam` | `live_dvp` | MJPEG | AAC | 实时预览 (FPV 图传) |
| `/h264` | `live_h264` | H.264 | AAC | H.264 高清实时流 |
| `/custom` | `live_custom` | MJPEG | AAC | 自定义视频源 |
| `/loop/RECA/` | `live_h264_2` | H.264 | AAC | MP4 录像文件回放 |
| `/file` | `webfile` | JPEG | - | SD 卡文件播放 (已注释) |

---

## 8. 完整 RTSP 协议交互示例

```
→ OPTIONS rtsp://192.168.169.1:554/webcam RTSP/1.0
  CSeq: 1
  User-Agent: VLC/3.0.20

← RTSP/1.0 200 OK
  CSeq: 1
  Public: DESCRIBE, SETUP, TEARDOWN, PLAY, PAUSE, OPTIONS

→ DESCRIBE rtsp://192.168.169.1:554/webcam RTSP/1.0
  CSeq: 2

← RTSP/1.0 200 OK
  CSeq: 2
  Content-Type: application/sdp
  Content-Length: 123

  v=0
  o=- 1 1 IN IP4 127.0.0.1
  s=Test
  a=type:broadcast
  t=0 0
  c=IN IP4 0.0.0.0
  m=video 0 RTP/AVP 26
  a=control:track0
  m=audio 0 RTP/AVP 97
  a=rtpmap:97 mpeg4-generic/8000
  a=control:track1

→ SETUP rtsp://192.168.169.1:554/webcam/track0 RTSP/1.0
  CSeq: 3
  Transport: RTP/AVP/TCP;interleaved=0-1

← RTSP/1.0 200 OK
  CSeq: 3
  Session: A1B2C3D4
  Transport: RTP/AVP/TCP;interleaved=0-1

→ SETUP rtsp://192.168.169.1:554/webcam/track1 RTSP/1.0
  CSeq: 4
  Session: A1B2C3D4
  Transport: RTP/AVP/TCP;interleaved=2-3

← RTSP/1.0 200 OK
  CSeq: 4
  Session: A1B2C3D4
  Transport: RTP/AVP/TCP;interleaved=2-3

→ PLAY rtsp://192.168.169.1:554/webcam RTSP/1.0
  CSeq: 5
  Session: A1B2C3D4

← RTSP/1.0 200 OK
  CSeq: 5
  Session: A1B2C3D4
  RTP-Info: url=rtsp://192.168.169.1:554/webcam/track0;
            seq=45678;rtptime=12345

  (RTP 数据通过 TCP 交织通道 0-1 持续发送)
  $ (interleaved binary data)...

→ TEARDOWN rtsp://192.168.169.1:554/webcam RTSP/1.0
  CSeq: 6
  Session: A1B2C3D4

← RTSP/1.0 200 OK
  CSeq: 6
```

---

## 9. 事件驱动与并发模型

```
┌──────────────────────────────────────────────────────────┐
│  CPU0 (CK810)                                              │
│                                                            │
│  [eloop 事件循环线程]                [发送线程 per path]     │
│  ┌──────────────────────┐          ┌──────────────────┐   │
│  │  TCP listen          │          │  spook_send_     │   │
│  │  → accept conn       │          │  thread_stream() │   │
│  │  → read RTSP req     │          │                  │   │
│  │  → parse & respond   │          │  while(1) {      │   │
│  │  → setup/play/       │          │    msi_get_fb()  │   │
│  │    teardown          │          │    ex->f()       │   │
│  │                      │          │    rtp_sendmsg() │   │
│  │  [FD事件]            │          │  }               │   │
│  │  [定时器]→RTCP       │          └──────────────────┘   │
│  └──────────────────────┘                                 │
│                                                            │
│  [硬件编码器线程]                                         │
│  ┌──────────────────────┐                                  │
│  │  JPEG/H264 编码器     │  →  framebuff                   │
│  │  → 写入 MSI 管道      │  →  msi_get_fb() ← 发送线程    │
│  └──────────────────────┘                                  │
└──────────────────────────────────────────────────────────┘
```

---

## 10. 延迟分析与优化

### 10.1 延迟分布

```
数据路径延迟 (MJPEG 720P, ~25fps, 每帧40ms):

摄像头采集 ──┬── ISP处理 ──┬── JPEG编码 ──┬── MSI队列 ──┬── 发送线程 ──┬── RTP发送 ──┬── Wi-Fi
            │ (1-2ms)   │ (5-15ms)   │ (0-28帧)  │ (0-1ms)    │ (1-3ms)    │ (1-5ms)
            │           │            │ ≈1.1s!   │            │            │
```

### 10.2 延迟来源与优化

| 延迟源 | 代码位置 | 典型值 | 优化方案 |
|--------|---------|--------|---------|
| **MSI 队列缓冲** | `frame.c:MAX_RTSP_JPG_RECV=28` | **0~1.1s** | 改为 3~5，大幅降低延迟 |
| RTP 重试 | `rtp-jpeg.c:505` retries=30 | 0~300ms | 改为 0，丢包不重传 |
| 无主动丢帧 | `spook_send_thread_stream` | 持续累积 | 发送前丢弃队列中旧帧 |
| JPEG 头重复解析 | `rtp-jpeg.c:jpeg_process_frame` | 每帧1次 | 同分辨率只解析一次(已有init_done) |
| 音视频同线程 | `frame.c:spook_send_thread_stream` | 相互阻塞 | 音频分离线程 |
| 空闲休眠 1ms | `frame.c` `os_sleep_ms(1)` | 1ms | 改用事件唤醒 |

### 10.3 推荐优化措施

**最简优化**（改 3 处即可显著降低延迟）：

1. `frame.c` — 减小 MSI 缓冲深度：
   ```c
   #define MAX_RTSP_JPG_RECV 3   // 28 → 3
   ```

2. `frame.c` — 发送前丢弃旧帧，只保留最新帧：
   ```c
   // 在 msi_get_fb 后添加：
   while (msi_peek_fb(jpg_rtsp->msi)) {
       msi_get_fb(jpg_rtsp->msi, 0);  // 丢弃旧帧
       msi_delete_fb(NULL, fb);
   }
   ```

3. `rtp-jpeg.c` — 关闭 UDP 重试：
   ```c
   rtp_sendmsg(ep, v, vcnt+1, out->timestamp,
       plen + i == out->scan_data_len, 0);  // retries: 30 → 0
   ```

---

## 11. 常见问题与排查

### Q: 客户端连不上 RTSP 服务器？

```
检查清单:
□ 设备 Wi-Fi 是否启动 (AT+WIFIMODE? → 应为 AP)
□ 手机/电脑是否连接到设备的 Wi-Fi (SSID: 82X_XXXXXX)
□ IP 是否正确 (默认 192.168.169.1，或 AT+NETIP? 查看)
□ 端口是否正确 (默认 554，Windows 需管理员权限)
□ 防火墙是否阻止了端口
□ 串口日志是否有 accept/connection 打印
```

### Q: 视频流卡顿或延迟高？

```
检查清单:
□ 帧率统计: 串口打印 "cnt_num:xx" 是否 ≈ 25
□ 发送时间: 串口打印 "time:xx" 是否 < 50ms
□ MSI 队列深度: MAX_RTSP_JPG_RECV 是否过大
□ Wi-Fi 信号强度: rssi 值
□ 编码器分辨率是否过高 (建议 720P 或以下)
```

### Q: 画面花屏或无法解码？

```
可能原因:
□ JPEG 数据损坏: 检查 DQT/SOF/DHT 解析是否正常
□ 量化表偏移错误: 检查 rtp-jpeg.c parse_DQT 中 quant 偏移计算
□ 分包边界未对齐: 检查 32 字节对齐逻辑
□ 网络丢包: UDP 模式下丢包导致花屏，建议使用 TCP 模式
```

---

## 12. 开发指南

### 12.1 添加新的 RTSP 路径

参考 `/webcam` 的实现，新增路径需要：

1. 创建新文件 `rtsp_xxx.c`，实现：
   - `self_creat()` — 客户端首次 SETUP 时调用，创建 MSI 管道和线程
   - `self_destory()` — TEARDOWN 时调用，清理资源
   - `self_rtsp_open()` — DESCRIBE 时调用，设置 SDP 回调

2. 在 `spook_thread()` 中注册：
   ```c
   const rtp_name live_xxx = {
       .video_encode_name = ENCODER_NAME,
       .audio_encode_name = AUDIO_NAME,
       .path = "/xxx",
   };
   rtsp_xxx_live_init(&live_xxx);
   ```

3. 确保对应的编码器 stream 已通过 `xxx_encode_init()` 创建。

### 12.2 播放器兼容性

| 播放器 | RTSP over TCP | RTSP over UDP | 测试状态 |
|--------|---------------|---------------|---------|
| VLC | ✅ | ✅ | 推荐 |
| PotPlayer | ✅ | ✅ | 可用 |
| ffplay | ✅ | ✅ | 命令行测试 |
| 手机 VLC | ✅ | ✅ | iOS/Android 均可 |
| Windows Media Player | ❌ | ❌ | 不支持 RTSP |

---

## 附录 A: 关键函数调用关系

```
spook_init()
  └─ spook_thread()
       ├─ init_random()
       ├─ global_init() → config_port(554)
       ├─ jpeg_encode_init()  [encoder-jpeg.c]
       │    └─ new_stream() + new_exchanger()
       ├─ h264_encode_init()  [encoder-h264.c]
       ├─ rtsp_audio_encode_init() [encoder-audio.c]
       ├─ rtsp_mjpeg_live_init()   [rtsp_mjpeg_live.c]
       │    ├─ rtsp_start_block()
       │    ├─ rtsp_set_path()
       │    ├─ set_video_track()
       │    │    ├─ connect_to_stream() [stream.c]
       │    │    └─ new_rtp_media_jpeg_stream() [rtp-jpeg.c]
       │    ├─ set_audio_track()
       │    ├─ register_live_fn()
       │    └─ rtsp_end_block()
       ├─ rtsp_h264_live_init()    [rtsp_h264_live.c]
       ├─ custom_rtsp_jpeg_init()  [custom_rtsp_jpg.c]
       └─ rtsp_h264_live_init()    [/loop/RECA/]

-- 客户端连接后 --

self_creat()  [rtsp_mjpeg_live.c]
  ├─ msi_find(AUTO_JPG, 1)    ← 找到 JPEG 编码器 MSI
  ├─ rtsp_msi_init()          ← 创建接收 MSI
  ├─ msi_add_output()         ← 连接编码器→接收器
  └─ OS_TASK_INIT(self_thread) ← 创建发送线程

spook_send_thread_stream()  [frame.c]
  └─ ex->f()
       └─ get_back_frame()  [encoder-jpeg.c]
            └─ deliver_frame_to_stream()  [stream.c]
                 └─ rtsp_common_send()  [rtsp_common.c]
                      ├─ jpeg_process_frame()  [rtp-jpeg.c]
                      │    └─ parse_DQT/SOF/DHT/DRI
                      └─ jpeg_send_more()  [rtp-jpeg.c]
                           └─ jpeg_send_frame_to_endpoint()
                                └─ rtp_sendmsg()  [rtp.c]
                                     ├─ rtp_send_udp()
                                     └─ rtp_send_tcp()
```

## 附录 B: 版本信息

| 项 | 内容 |
|----|------|
| 项目名称 | Spook (轻量级 RTSP 服务器) |
| 原作者 | Nathan Lutchansky <lutchann@litech.org> |
| 许可证 | GPL v2 |
| 移植平台 | TXW82x (C-SKY CK810 + lwIP) |
| 文档版本 | 1.0 |
| 文档日期 | 2026-06-30 |

