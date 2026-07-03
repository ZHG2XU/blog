---
title: "Spook 图传模块分析文档"
date: 2026-07-03
categories:
  - 嵌入式开发
  - 项目文档
tags:
  - Spook
  - RTSP
  - RTP
  - JPEG
  - 音频
  - C语言
  - MSI
  - TXW82x
  - 嵌入式
  - Wi-Fi图传
toc_number: false
excerpt: "TXW82x 平台 Spook 图传模块分析文档。围绕 sdk/app/spook 目录，梳理实时 RTSP 图传主流程、stream 分发机制、RTSP 会话控制、RTP/JPEG 发包流程、音频辅助链路以及函数指针绑定关系。"
---

# Spook 图传模块分析文档

## 1. 文档范围

本文档分析 `sdk/app/spook/` 目录中与图传直接相关的实现，重点覆盖以下内容：

- `spook` 模块初始化
- 实时 RTSP 图传主流程
- `stream` 分发机制
- RTSP 会话建立与播放控制
- RTP/JPEG 实际发包流程
- 音频辅助链路
- 函数指针绑定关系

本文档主要针对实时预览链路 `/webcam`，同时补充 `/file` 文件回放链路与其复用关系。

---

## 2. 目录中与图传最相关的文件

### 2.1 核心入口

- `sdk/app/spook/spook.c`
- `sdk/app/spook/spook_config.h`

### 2.2 实时 RTSP 控制

- `sdk/app/spook/live.c`
- `sdk/app/spook/rtsp.c`
- `sdk/app/spook/rtsp_common.c`
- `sdk/app/spook/session.c`

### 2.3 帧和流分发

- `sdk/app/spook/frame.c`
- `sdk/app/spook/frame.h`
- `sdk/app/spook/stream.c`
- `sdk/app/spook/stream.h`

### 2.4 编码器输出层

- `sdk/app/spook/encoder-jpeg.c`
- `sdk/app/spook/encoder-audio.c`

### 2.5 RTP 媒体发送层

- `sdk/app/spook/rtp-jpeg.c`
- `sdk/app/spook/rtp-audio.c`
- `sdk/app/spook/rtp.c`
- `sdk/app/spook/rtp.h`
- `sdk/app/spook/rtp_media.h`

### 2.6 文件回放复用链路

- `sdk/app/spook/webfile.c`

---

## 3. 模块总体架构

`spook` 图传模块可以分成 5 层：

1. 初始化层  
   创建 JPEG/Audio 输出流，注册 RTSP 路径。

2. 取流层  
   从底层视频流和音频流中取出原始帧。

3. Stream 分发层  
   将取出的帧分发给所有订阅该 stream 的 destination。

4. RTSP 控制层  
   处理 `DESCRIBE`、`SETUP`、`PLAY`、`TEARDOWN`。

5. RTP 媒体层  
   将 JPEG/Audio 帧封装为 RTP 包，通过 UDP 发给客户端。

对实时图传来说，核心协议是：

- 控制协议：RTSP
- 传输协议：RTP/UDP
- 视频编码格式：MJPEG
- 视频 Payload Type：26
- 音频编码格式：L16

---

## 4. 初始化流程

入口在 `sdk/app/spook/spook.c` 的 `spook_init()`。

### 4.1 调用顺序

`spook_init()`
-> `spook_thread()`
-> `init_random()`
-> `global_init()`
-> `jpeg_init(&live_dvp)`
-> `rtp_audio_init_ret()`
-> `live_rtsp_init(&live_dvp)`
-> `webfile_rtsp_init(&webfile)`

### 4.2 关键配置

在 `spook.c` 中定义了两个重要 `rtp_name`：

#### 实时预览 `live_dvp`

- `jpg_name = "jpeg_dvp"`
- `audio_name = "audio"`
- `path = "/webcam"`

#### 文件回放 `webfile`

- `jpg_name = "jpeg_dvp"`
- `audio_name = "audio"`
- `path = "/file"`

### 4.3 初始化后的结果

初始化完成后，系统中会存在：

- 一个 JPEG 输出 stream：`jpeg_dvp`
- 一个音频输出 stream：`audio`
- 一个 RTSP 路径：`/webcam`
- 一个 RTSP 路径：`/file`

---

## 5. 实时图传主流程

实时图传的完整链路如下：

1. 客户端访问 `/webcam`
2. RTSP 完成 `DESCRIBE`
3. RTSP 完成 `SETUP`
4. `SETUP` 阶段创建实时取流线程
5. RTSP 完成 `PLAY`
6. track 进入 ready 状态
7. 实时线程不断从底层流中取出 JPEG 帧
8. JPEG 帧进入 `stream` 分发
9. RTSP track 收到帧后解析 JPEG
10. JPEG 被切分为多个 RTP/JPEG 包
11. 通过 UDP 向所有正在播放的 session 发送

---

## 6. 底层取流与帧注入流程

### 6.1 `live_rtsp_creat()`

实时线程是在 `sdk/app/spook/live.c` 的 `live_rtsp_creat()` 中创建的。

这个函数主要做三件事：

1. 分配 `struct rtsp_priv`
2. 调用 `creat_stream()` 打开底层视频流和音频流
3. 创建线程 `rtsp_live_thread`

线程入口为：

`rtsp_live_thread()`
-> `spook_send_thread_stream(r)`

### 6.2 `creat_stream()`

`sdk/app/spook/frame.c` 中的 `creat_stream()` 打开底层数据流：

- 视频：`open_stream(video_name, 0, 2, opcode_func, NULL)`
- 音频：`open_stream(audio_name, 0, 2, opcode_func, NULL)`

实时模式下传入的是：

- 视频流名：`R_RTP_JPEG`
- 音频流名：`R_RTP_AUDIO`

### 6.3 `spook_send_thread_stream()`

`sdk/app/spook/frame.c` 中的 `spook_send_thread_stream()` 是实时图传的“数据泵”。

它的职责是：

1. 从底层视频流 `GET_FRAME(s)` 取到 JPEG 帧
2. 把底层 frame 信息填入 `struct frame`
3. 将首段 JPEG 头部拷贝到 `scan_buf`
4. 调用 `ex->f(jpeg, ex->d)` 将帧交给 JPEG encoder 输出链路

对于音频也是类似逻辑：

1. `GET_FRAME(audio_s)`
2. 填充 `audio` frame
3. 调用 `audio_ex->f(audio, audio_ex->d)`

### 6.4 为什么先拷贝前 1024 字节

`spook_send_thread_stream()` 中：

- `jpeg->d = scan_buf`
- `jpeg->first_length = 1024`

这样做的目的，是给 `rtp-jpeg.c` 里的 JPEG marker 解析器一个可连续访问的头部区域，便于快速扫描：

- SOI
- DQT
- SOF0
- DHT
- DRI
- SOS

---

## 7. JPEG 输出流与 Stream 分发

### 7.1 `jpeg_init()`

`sdk/app/spook/encoder-jpeg.c` 的 `jpeg_init()` 会：

1. `start_block()`
2. `set_output("jpeg_dvp", en)`
3. `end_block(en)`

### 7.2 创建的对象

`set_output()` 中会调用：

`new_stream(name, FORMAT_JPEG, en)`

于是产生一个 stream：

- stream 名称：`jpeg_dvp`
- stream 格式：`FORMAT_JPEG`
- stream 私有指针：`jpeg_encoder *en`

### 7.3 JPEG stream 自带两个方法

`encoder-jpeg.c` 会给该 stream 绑定：

- `get_framerate = get_framerate`
- `set_running = set_running`

其中：

- `get_framerate()` 返回帧率基准
- `set_running()` 用于根据是否有人监听来开启或关闭发送状态

### 7.4 frame_exchanger 的作用

`end_block()` 中创建：

`en->ex = new_exchanger(EXCHANGER_SLOT_SIZE, get_back_frame, en)`

这里的 `frame_exchanger` 保存了：

- `jf`：当前 frame 容器
- `f`：frame 到达时的回调
- `d`：回调私有数据

对于视频来说，回调函数是 `get_back_frame()`。

### 7.5 `get_back_frame()`

`get_back_frame()` 很简单，只做一件事：

`deliver_frame_to_stream(f, en->output)`

也就是说：

实时线程取到 JPEG 帧
-> 填充 frame
-> 调 `get_back_frame()`
-> 交给 `stream` 分发层

---

## 8. Stream 分发机制

### 8.1 `connect_to_stream()`

RTSP track 会调用 `connect_to_stream("jpeg_dvp", rtsp_common_send, &track)` 接入 JPEG 输出 stream。

这样会创建一个 `stream_destination`：

- `dest->stream = jpeg_dvp`
- `dest->process_frame = rtsp_common_send`
- `dest->d = &source->track[t]`

### 8.2 `deliver_frame_to_stream()`

`sdk/app/spook/stream.c` 中：

`deliver_frame_to_stream(f, s)`

会遍历 `s->dest_list` 上的所有目的端：

1. 如果 `dest->waiting == 0`，则跳过
2. 如果 `dest->waiting == 1`，则调用
   `dest->process_frame(f, dest->d)`

对 RTSP 来说，这里的 `process_frame` 就是：

`rtsp_common_send()`

所以链路变成：

`deliver_frame_to_stream()`
-> `rtsp_common_send()`

### 8.3 waiting 的意义

只有当客户端真正 `PLAY` 之后，RTSP track 才会 `set_waiting(..., 1)`，这样 `deliver_frame_to_stream()` 才会把 frame 分发出去。

因此：

- `DESCRIBE` 不发视频
- `SETUP` 不发视频
- 只有 `PLAY` 后开始发视频

---

## 9. RTSP 路径注册与会话控制

### 9.1 注册 RTSP 路径

`sdk/app/spook/live.c` 的 `live_rtsp_init()` 做了以下事情：

1. `source = rtsp_start_block()`
2. `live_set_path(rtsp->path, source)`
3. `set_video_track(rtsp->jpg_name, source)`
4. `set_audio_track(rtsp->audio_name, source)`
5. `register_live_fn(source, live_rtsp_creat, live_rtsp_destory)`
6. `rtsp_end_block(source)`

也就是说，`/webcam` 对应一个 `rtsp_source` 对象。

### 9.2 `rtsp_source`

`rtsp_source` 可以理解为“一组 RTSP 资源描述”，里面有：

- session 链表
- track 数组
- live thread 句柄
- `live_node`
- create/release 回调

### 9.3 `rtsp_open()`

当客户端发起 `DESCRIBE` 或 `SETUP` 时，会调用 `loc->open(path, private)`。

对实时流来说：

`loc->open`
-> `live_rtsp_open()`
-> `rtsp_open(path, source)`

`rtsp_open()` 会创建 `struct session` 并绑定 RTSP 控制回调：

- `get_sdp`
- `setup`
- `play`
- `teardown`
- `closed`
- `select_close`

### 9.4 `live_rtsp_open()` 的覆盖

`live_rtsp_open()` 会把默认的 `sess->get_sdp` 覆盖为 `live_get_sdp()`。

所以实时流用的是 `live_get_sdp()`，不是默认的 `rtsp_get_sdp()`。

---

## 10. RTSP 命令时序

### 10.1 DESCRIBE

调用链：

`rtsp_handle_msg()`
-> `handle_DESCRIBE()`
-> `find_rtsp_location()`
-> `loc->open()`
-> `sess->get_sdp()`

返回 SDP 内容，其中视频轨使用：

`m=video <port> RTP/AVP 26`

### 10.2 SETUP

调用链：

`rtsp_handle_msg()`
-> `handle_SETUP()`
-> `s->setup(s, track)`
-> `rtsp_setup()`

`rtsp_setup()` 做两件关键事情：

1. 如果 live thread 还没有启动，则调用 `source->creat(source, path)`
2. 为该 track 创建 `rtp_endpoint`

在实时模式中：

- `source->creat = live_rtsp_creat`

所以 RTSP 的后台实时线程，是在 `SETUP` 时启动的，不是在 `DESCRIBE` 时启动。

### 10.3 PLAY

调用链：

`rtsp_handle_msg()`
-> `handle_PLAY()`
-> `sess->play(sess, ...)`
-> `rtsp_play()`

`rtsp_play()` 会：

1. `track->ready = 1`
2. `set_waiting(track->stream, 1)`

这一步之后，`deliver_frame_to_stream()` 才会开始把帧投递给 RTSP。

### 10.4 TEARDOWN

调用链：

`rtsp_handle_msg()`
-> `handle_TEARDOWN()`
-> `sess->closed(...)`

注意这里当前代码调用的是 `closed()`，而不是直接 `teardown()`。  
后续在 `rtsp_frame_end()` 或连接关闭流程中，会进一步进入 teardown 和资源释放。

---

## 11. Track 建立过程

### 11.1 `set_video_track()`

`sdk/app/spook/rtsp_common.c` 中的 `set_video_track()` 是视频图传最关键的绑定函数之一。

它主要做了四件事：

1. `connect_to_stream(name, rtsp_common_send, &source->track[t])`
2. `source->live_node.video_ex = get_video_ex(...)`
3. `disconnect_stream(..., rtsp_frame_end)`
4. `source->track[t].rtp = new_rtp_media_jpeg_stream(...)`

### 11.2 结果

执行完 `set_video_track("jpeg_dvp", source)` 后，建立了以下关系：

- RTSP track 订阅了 JPEG stream
- track 的 frame 回调是 `rtsp_common_send`
- track 的断开回调是 `rtsp_frame_end`
- track 的 RTP 媒体实现是 `rtp-jpeg.c`

### 11.3 `set_audio_track()`

音频轨做法完全类似，只是 RTP 媒体实现换成 `rtp-audio.c`。

---

## 12. 视频 RTP 媒体对象创建

### 12.1 `new_rtp_media_jpeg_stream()`

`sdk/app/spook/rtp-jpeg.c` 中：

1. 通过 `stream->get_framerate()` 获取帧率
2. 创建 `struct rtp_jpeg`
3. 创建 `struct rtp_media`
4. 绑定 JPEG 相关函数

### 12.2 绑定内容

视频 `rtp_media` 的函数绑定如下：

- `get_sdp` -> `jpeg_get_sdp`
- `get_payload` -> `jpeg_get_payload`
- `frame` -> `jpeg_process_frame`
- `send` -> `jpeg_send`
- `rtcp_send` -> `new_rtcp_send`
- `send_more` -> `jpeg_send_more`

并设置：

- `m->type = 0`
- `m->per_ms_incr = (25 * out->ts_incr) / 1000`

### 12.3 重要结论

当前视频真正使用的是：

- `frame = jpeg_process_frame`
- `send_more = jpeg_send_more`

虽然 `send = jpeg_send` 也被绑定了，但在 `rtsp_common_send()` 中原本直接调用 `send()` 的代码已经注释掉，所以视频主链路实际不走 `jpeg_send()`。

---

## 13. JPEG 解析流程

### 13.1 入口 `jpeg_process_frame()`

每一帧到达 `rtsp_common_send()` 后，首先执行：

`track->rtp->frame(f, track->rtp)`

对于视频 track，这里实际调用的是：

`jpeg_process_frame()`

### 13.2 解析逻辑

`jpeg_process_frame()` 会在 `f->d` 指向的 JPEG 头部区域中依次扫描 marker：

- `0xDB` -> `DQT`
- `0xC0` -> `SOF0`
- `0xC4` -> `DHT`
- `0xDD` -> `DRI`
- `0xDA` -> `SOS`

### 13.3 各子解析函数作用

#### `parse_DQT()`

解析量化表，并记录量化表相对偏移：

- `out->quant[table_id] = offset`

注意这里记录的不是裸地址，而是相对于 `out->d` 的偏移。  
这是为了兼容 PSRAM 和不同帧缓存布局。

#### `parse_SOF()`

解析图像基础信息：

- 宽度
- 高度
- 采样因子
- 亮度量化表
- 色度量化表

其中：

- `0x21` 表示 YUV422
- `0x22` 表示 YUV420

#### `parse_DHT()`

记录 Huffman 表位置和长度，用于扩展头部发送。

#### `parse_DRI()`

解析 JPEG Restart Interval。

#### `SOS`

遇到 `0xDA` 时说明已经到达 scan data：

- `out->scan_data = f->d + i + 14`
- `out->scan_data_len = ...`
- `out->offset = out->scan_data - f->d`

此时返回成功。

### 13.4 时间戳处理

`jpeg_process_frame()` 中：

`out->timestamp = per_ms_incr * f->timestamp`

其中 `per_ms_incr` 与 90kHz RTP 时钟有关，表示把系统时间戳转换成 RTP 视频时间戳。

---

## 14. 视频 RTP/JPEG 发包流程

### 14.1 发包入口

`rtsp_common_send()` 在调用完 `frame()` 后，如果 `send_more` 存在，则执行：

`track->rtp->send_more(loop_search_ep, ls, track, track->rtp->private)`

对视频来说，这里就是：

`jpeg_send_more()`

### 14.2 `jpeg_send_more()` 做了什么

这个函数是当前实时图传最核心的发包实现，它做了以下事情：

1. 取出当前 frame 对应的底层 JPEG buffer
2. 计算 scan data 长度
3. 构造 RTP/JPEG 专用头
4. 准备 quant table
5. 计算每个 RTP 分片的长度
6. 遍历 JPEG 链表节点
7. 为每个 session 的 endpoint 分别补 RTP 头
8. 发送 UDP 数据包

### 14.3 RTP/JPEG 头部构成

视频 RTP payload 头包括：

1. 12 字节标准 RTP 头
2. 8 或 12 字节 JPEG 专用头
3. 4 字节量化表头
4. 64 字节亮度量化表
5. 64 字节色度量化表
6. 可选扩展头和 Huffman 数据

### 14.4 分片策略

最大发送长度取自：

- `MAX_DATA_PACKET_SIZE = 1440`

再减去各类头部长度，得到本片允许承载的 JPEG 数据长度。

如果当前 JPEG scan data 超过可发送大小，就切成多片。

### 14.5 多 session 广播

`jpeg_send_more()` 并不是只发给一个客户端。  
它通过 `loop_search_ep()` 遍历所有正在播放、且该 track 有 endpoint 的 session：

- 如果 session 正在 `PLAY`
- 且 `track->ready == 1`
- 且 `sess->ep[track->index]` 非空

就发送给该客户端。

因此，同一帧 JPEG 可以广播给多个 RTSP 客户端。

### 14.6 真正的 RTP 头生成

每发给一个 endpoint 时，调用：

`set_send_rtp_packet_head(ep, v, count, timestamp, marker, send_buf)`

这个函数会：

- 写 RTP version
- 写 payload type
- 写 marker bit
- 写 sequence number
- 写 timestamp
- 写 SSRC

### 14.7 真正的发送动作

再调用：

`send_rtp_packet_more(ep, send_buf, send_total_len, 30)`

而 `send_rtp_packet_more()` 内部继续走：

`fd_send_data(ep->trans.udp.rtp_fd, sendbuf, sendLen, times)`

最终使用 UDP socket 发出。

### 14.8 `jpeg_send()` 现状

`rtp-jpeg.c` 中的 `jpeg_send()` 当前直接返回 `0`，没有实际发送逻辑。  
因为现在主链路已经迁移到 `jpeg_send_more()`。

---

## 15. 音频链路

音频链路与视频结构几乎一致，只是媒体格式不同。

### 15.1 音频输出流

`rtp_audio_init_ret()` 创建输出 stream：

- 名称：`audio`
- 格式：`FORMAT_AUDIO`

### 15.2 音频 RTP 媒体对象

`new_rtp_media_audio_stream()` 绑定：

- `get_sdp` -> `audio_get_sdp`
- `get_payload` -> `audio_get_payload`
- `frame` -> `audio_process_frame`
- `send` -> `audio_send`
- `rtcp_send` -> `new_rtcp_send`
- `send_more` -> `audio_send_more`

并设置：

- `sample_rate = 8000`
- `type = 1`

### 15.3 SDP

音频 SDP 格式为：

`m=audio <port> RTP/AVP 97`
`a=rtpmap:97 L16/<sample_rate>/1`

### 15.4 实际发送

音频和视频一样，当前主要也是走 `send_more` 路径，即：

`audio_send_more()`

不是依赖 `audio_send()`。

---

## 16. RTP Endpoint 建立流程

### 16.1 `new_rtp_endpoint()`

在 `SETUP` 时，为每个 track 创建一个 `rtp_endpoint`。

该结构中保存：

- payload type
- seqnum
- SSRC
- RTP timestamp
- UDP 或 Interleaved 传输信息

### 16.2 UDP 模式

当前主要使用 UDP 模式：

`connect_udp_endpoint()`

它会：

1. 创建 RTP socket
2. 创建 RTCP socket
3. 绑定本地端口
4. connect 到客户端端口
5. 在 event loop 中注册 RTP/RTCP 读事件

### 16.3 RTCP

`new_rtcp_send()` 周期性向客户端发送 RTCP Sender Report。  
该函数会填充：

- NTP 时间
- RTP 时间戳
- packet count
- octet count

---

## 17. 会话停止与资源释放

### 17.1 Track 停止发送

当 session 被 teardown 或 closed 后，`track_check_running()` 会检查是否还有其他 session 在播放该 track。

如果没有，则：

`set_waiting(source->track[t].stream, 0)`

这样 stream 不再继续向该 track 分发 frame。

### 17.2 endpoint 释放

`rtsp_teardown()` 中：

- 删除 `rtp_endpoint`
- 清空 `sess->ep[i]`

### 17.3 live 线程释放

当最后一个 session 离开后，会最终进入：

- `source->release(source)`

对于实时模式来说，对应：

- `live_rtsp_destory()`

这个函数会：

1. 关闭附加流
2. `destory_stream(r)`
3. 删除 live task
4. 释放 `rtsp_priv`

---

## 18. `/file` 文件回放链路

`sdk/app/spook/webfile.c` 注册了 `/file` 路径。

它与 `/webcam` 的区别主要只有两点：

1. create/release 回调不同
2. 数据源来自 AVI 文件回放，不是实时摄像头流

但它复用了完全相同的：

- RTSP 框架
- track 机制
- `rtsp_common_send()`
- `rtp-jpeg.c`
- `rtp-audio.c`
- `rtp.c`

因此可以把 `/file` 看成“更换数据源后的同一套图传框架”。

---

## 19. 关键函数指针绑定关系

本节只列图传最关键的函数指针最终指向。

### 19.1 `stream` 层

#### JPEG 输出 stream

- `stream->get_framerate` -> `encoder-jpeg.c:get_framerate`
- `stream->set_running` -> `encoder-jpeg.c:set_running`

#### Audio 输出 stream

- `stream->get_framerate` -> `encoder-audio.c:get_framerate`
- `stream->set_running` -> `encoder-audio.c:set_running`

### 19.2 `frame_exchanger`

#### 视频 exchanger

- `ex->f` -> `encoder-jpeg.c:get_back_frame`
- `ex->d` -> `jpeg_encoder *en`

#### 音频 exchanger

- `audio_ex->f` -> `encoder-audio.c:get_back_audio_frame`
- `audio_ex->d` -> `audio_encoder *en`

### 19.3 `stream_destination`

#### RTSP 视频/音频 track 接入 stream 时

- `dest->process_frame` -> `rtsp_common.c:rtsp_common_send`
- `dest->disconnect_frame` -> `rtsp_common.c:rtsp_frame_end`
- `dest->d` -> `struct rtsp_track *`

### 19.4 `session`

`rtsp_open()` 里绑定：

- `sess->get_sdp` -> `rtsp_get_sdp`
- `sess->setup` -> `rtsp_setup`
- `sess->play` -> `rtsp_play`
- `sess->teardown` -> `rtsp_teardown`
- `sess->closed` -> `rtsp_closed`
- `sess->select_close` -> `rtsp_select_close`

实时流 `live_rtsp_open()` 会进一步覆盖：

- `sess->get_sdp` -> `live_get_sdp`

### 19.5 `rtsp_source`

在 `register_live_fn()` 中绑定：

- `source->creat` -> `live_rtsp_creat`
- `source->release` -> `live_rtsp_destory`

文件回放模式中绑定为：

- `source->creat` -> `webfile_rtsp_creat`
- `source->release` -> `webfile_rtsp_destory`

### 19.6 视频 `rtp_media`

`new_rtp_media_jpeg_stream()` 中绑定：

- `rtp->get_sdp` -> `jpeg_get_sdp`
- `rtp->get_payload` -> `jpeg_get_payload`
- `rtp->frame` -> `jpeg_process_frame`
- `rtp->send` -> `jpeg_send`
- `rtp->send_more` -> `jpeg_send_more`
- `rtp->rtcp_send` -> `new_rtcp_send`

### 19.7 音频 `rtp_media`

`new_rtp_media_audio_stream()` 中绑定：

- `rtp->get_sdp` -> `audio_get_sdp`
- `rtp->get_payload` -> `audio_get_payload`
- `rtp->frame` -> `audio_process_frame`
- `rtp->send` -> `audio_send`
- `rtp->send_more` -> `audio_send_more`
- `rtp->rtcp_send` -> `new_rtcp_send`

---

## 20. 最重要的主调用链

下面给出实时视频图传的主调用链。

### 20.1 初始化阶段

`spook_init()`
-> `spook_thread()`
-> `jpeg_init(&live_dvp)`
-> `live_rtsp_init(&live_dvp)`

### 20.2 RTSP 建链阶段

`DESCRIBE`
-> `handle_DESCRIBE()`
-> `live_rtsp_open()`
-> `rtsp_open()`
-> `live_get_sdp()`

`SETUP`
-> `handle_SETUP()`
-> `rtsp_setup()`
-> `live_rtsp_creat()`
-> `creat_stream()`
-> `new_rtp_endpoint()`
-> `connect_udp_endpoint()`

`PLAY`
-> `handle_PLAY()`
-> `rtsp_play()`
-> `set_waiting(track->stream, 1)`

### 20.3 实时帧发送阶段

`spook_send_thread_stream()`
-> `GET_FRAME(video_stream)`
-> 填充 `struct frame`
-> `ex->f(jpeg, ex->d)`
-> `get_back_frame()`
-> `deliver_frame_to_stream()`
-> `rtsp_common_send()`
-> `track->rtp->frame(...)`
-> `jpeg_process_frame()`
-> `track->rtp->send_more(...)`
-> `jpeg_send_more()`
-> `set_send_rtp_packet_head()`
-> `send_rtp_packet_more()`
-> `fd_send_data()`

### 20.4 结束阶段

`TEARDOWN` 或连接关闭
-> `rtsp_closed()` / `rtsp_teardown()`
-> `del_rtp_endpoint()`
-> `track_check_running()`
-> `set_waiting(..., 0)`
-> 最后一个 session 结束时 `live_rtsp_destory()`

---

## 21. 关键实现结论

### 21.1 当前视频图传编码不是 H264，而是 MJPEG

证据：

- `jpeg_get_payload()` 固定返回 `26`
- SDP 中 `m=video ... RTP/AVP 26`

### 21.2 当前视频主发送逻辑走的是 `send_more`

`rtsp_common_send()` 中直接 `send()` 的代码已注释。  
因此当前视频主要依赖：

- `jpeg_process_frame()`
- `jpeg_send_more()`

### 21.3 `SETUP` 阶段才启动后台实时线程

不是在 `DESCRIBE` 阶段启动。

### 21.4 `PLAY` 之后才真正开始图传

必须等 `track->ready = 1` 且 `waiting = 1`。

### 21.5 同一帧支持广播给多个客户端

`jpeg_send_more()` 会遍历 session 链表，把同一帧发送给多个 `rtp_endpoint`。

### 21.6 `/file` 和 `/webcam` 复用同一套 RTP/RTSP 架构

区别主要只是底层数据源和 source 的 create/release 回调不同。

---

## 22. 建议后续继续关注的点

如果后续还要继续深入排查图传问题，建议重点看下面几个方向：

- `spook_send_thread_stream()` 中底层 JPEG buffer 的组织方式
- `stream_frame.h` / `GET_JPG_BUF()` / `GET_DATA_BUF()` 相关宏
- `jpeg_send_more()` 中链表节点拆包逻辑
- `fd_send_data()` 的重发与丢包处理
- RTCP 收包对 `rtp_speed` 的反馈调节逻辑

---

## 23. 关键源码索引

### 初始化与入口

- `sdk/app/spook/spook.c`
- `sdk/app/spook/spook_config.h`

### 实时 RTSP 入口

- `sdk/app/spook/live.c`

### Stream/Frame 分发

- `sdk/app/spook/frame.c`
- `sdk/app/spook/frame.h`
- `sdk/app/spook/stream.c`
- `sdk/app/spook/stream.h`

### RTSP 控制

- `sdk/app/spook/rtsp.c`
- `sdk/app/spook/rtsp_common.c`
- `sdk/app/spook/session.c`

### RTP/JPEG 与音频

- `sdk/app/spook/rtp-jpeg.c`
- `sdk/app/spook/rtp-audio.c`
- `sdk/app/spook/rtp.c`
- `sdk/app/spook/rtp.h`
- `sdk/app/spook/rtp_media.h`

### 文件回放

- `sdk/app/spook/webfile.c`
