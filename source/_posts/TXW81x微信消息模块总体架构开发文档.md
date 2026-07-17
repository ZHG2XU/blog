---
title: "TXW81x 微信消息模块总体架构开发文档"
date: "2026-07-17 20:00:00"
categories:
  - [项目文档, TXW81x 可视对讲]
tags:
  - TXW81x
  - 微信消息
  - 可视对讲
  - LVGL
  - UDP
  - Opus
  - RTOS
  - 软件架构
toc_number: false
excerpt: "梳理 TXW81x 可视对讲项目中微信式消息模块的 UI、服务、UDP、音频与 Opus 编解码分层，以及语音和表情消息的完整运行链路。"
---

> 项目: TXW81x 可视对讲 UI
> 模块: 微信式语音与表情消息
> 阶段: UI、业务服务、UDP 与 Opus 链路整合
> 提交范围: `e9a2fb5` 至 `2440a8e`
> 分析基线: `2440a8e`（2026-07-17）

---

## 1. 文档目标

本文给后续开发者建立模块级心智模型，重点说明以下问题：

- 微信入口从哪里创建，页面由谁管理；
- 按键事件如何转换为录音、发送、播放等业务动作；
- UDP 收发线程、服务线程和音频线程如何协作；
- Opus 在本项目中承担什么职责；
- 哪些路径已经实现，哪些仍是预留能力；
- 维护时需要优先关注哪些并发、队列和协议风险。

配套文档：

- `TXW81x微信消息UDP-v2协议开发文档.md`：UDP v2 包格式与语音文件传输协议；
- `TXW81x微信语音Opus与WCA音频链路开发文档.md`：Opus 参数、WCA 文件和录放音任务；
- `TXW81x微信UI控制层与业务服务开发文档.md`：LVGL 页面、控制层、服务状态与消息队列。

## 2. 代码范围

| 层级 | 主要文件 | 职责 |
| --- | --- | --- |
| 应用入口 | `sdk/app/ui/main_ui.c` | 调用 `wechat_service_create_ui()` 创建微信入口 |
| UI 展示 | `sdk/lib/gui/intercom_ui/wechat_ui.c` | 创建聊天页面、气泡、表情面板和 30 ms 消息轮询定时器 |
| 输入控制 | `sdk/lib/gui/intercom_ui/wechat_ui_control.c` | 将 LVGL 键值转换为语音按下/松开、表情选择等动作 |
| 业务服务 | `sdk/lib/gui/intercom_ui/wechat_service.c` | 初始化资源、串行化业务事件、调度录音/播放、桥接 UI 与网络 |
| 音频适配 | `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c` | 音频流、Opus 编解码、WCA 文件和异步作业状态机 |
| UDP 传输 | `sdk/app/wechat_udp/wechat_udp.c` | UDP socket、协议封包、接收解析、文件分片发送 |
| Opus 库 | `sdk/lib/opus/` | Opus 1.5.1 编解码实现，固定点配置 |

`sdk/app/intercom/intercom_opus.c` 是项目原有的实时对讲链路。微信语音模块没有直接复用它的实时网络抖动缓冲和重传逻辑，而是复用了底层音频 stream 与 Opus API，形成“先录制为文件，再通过 UDP 发送”的异步语音消息链路。

基线版本的关键入口：

- `sdk/app/ui/main_ui.c:85`：创建微信服务 UI；
- `sdk/lib/gui/intercom_ui/wechat_ui.c:818`：通用 UI 创建接口；
- `sdk/lib/gui/intercom_ui/wechat_service.c:642`：业务服务初始化；
- `sdk/app/wechat_udp/wechat_udp.c:365`：UDP 初始化；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:925`：音频与 Opus 初始化。

## 3. 总体分层

```text
main_ui.c
    |
    v
wechat_ui.c  <---- 30 ms 拉取 UI 消息 ----  wechat_service.c
    |                                          |       |
    | 按键动作                                 |       +--> wechat_udp.c
    v                                          |              |
wechat_ui_control.c                            |              +--> 对端 UDP 5010
                                               |
                                               +--> wechat_audio.c
                                                       |
                                                       +--> sdk/lib/opus/
                                                       +--> 音频 stream / DAC
                                                       +--> FLASH:/OPUS/*.WCA
```

设计上的核心边界如下：

1. UI 层不直接操作 socket、文件或 Opus。
2. UDP 接收任务不操作 LVGL 对象，只回调服务层。
3. 音频工作任务不操作 LVGL，只向服务队列投递完成事件。
4. 服务任务负责把跨线程事件串行化，并保证录音和播放互斥。
5. UI 通过独立 UI 队列获取可显示的消息，不直接读取服务内部状态。

## 4. 运行实体与资源

| 运行实体 | 创建位置 | 优先级 | 栈/队列 | 主要工作 |
| --- | --- | --- | --- | --- |
| LVGL 线程/定时器 | GUI 框架 | GUI 上下文 | 30 ms timer | 页面操作、消息气泡渲染 |
| `wechat_service` | `wechat_service_init()` | Normal | 栈 2048 B；事件队列 16 | 业务状态编排 |
| `wechat_udp_tx` | `wechat_udp_init()` | Normal | 栈 1024 B；发送队列 16 | 异步发送表情 |
| `wechat_udp_rx` | `wechat_udp_init()` | Normal | 栈 1024 B | 收包、校验、回调服务层 |
| `wechat_audio` | `wechat_audio_init()` | Normal | PSRAM 栈 30 KiB；作业队列 4 | 录音、编码、解码、播放 |

重要静态/动态资源：

- UDP 上下文包含 1209 B 接收缓冲区和 1208 B 发送缓冲区；
- 音频播放时从 PSRAM 申请 `4 × 1024 B` 节点数据区；
- 音频任务栈从 PSRAM 申请 30 KiB；
- Opus encoder、decoder 在服务打开时创建，在页面关闭时释放；
- 语音文件统一保存在 `FLASH:/OPUS`。

## 5. 初始化与退出顺序

### 5.1 打开页面

1. `main_ui.c` 创建微信菜单入口。
2. 用户短按入口，`wechat_ui_open()` 调用服务层 `open` 回调。
3. `wechat_service_init()` 依次创建互斥锁、停止信号量、UI 队列和服务队列。
4. 初始化 `wechat_audio`，创建 Opus encoder、decoder 和音频工作任务。
5. 初始化 `wechat_udp`，绑定本地 UDP 端口 `5010`，创建收发任务。
6. 根据 Wi-Fi 模式配置固定对端：
   - AP 模式：`192.168.1.100:5010`；
   - STA 模式：`192.168.1.1:5010`。
7. 创建 `wechat_service` 任务。
8. 服务初始化成功后，UI 才隐藏主页面并创建聊天页面、焦点组和消息 timer。

### 5.2 关闭页面

1. 删除 UI 消息 timer，停用输入控制。
2. 调用服务层 `close` 回调。
3. 服务任务收到 STOP 消息后发出停止信号。
4. 停止 UDP 收发任务。
5. 中止并销毁音频任务，释放 Opus 和 PSRAM 资源。
6. 清理未完成的接收文件、队列、锁和信号量。
7. 删除聊天页面，恢复原 LVGL group 和主页面。

## 6. 本地语音消息链路

```text
按住语音键
  -> UI action: VOICE_PRESS
  -> service queue: VOICE_START
  -> 创建 record job_id
  -> audio worker 打开 R_WECHAT_AUDIO
  -> 每 160 个采样点编码一个 20 ms Opus 帧
  -> 写入 FLASH:/OPUS/MSG<n>.WCA

松开语音键
  -> UI action: VOICE_RELEASE
  -> service queue: VOICE_STOP
  -> audio worker 协作停止并回报 RECORD_FINISHED
  -> service 读取真实录音结果
  -> UDP BEGIN + DATA... + END 发送整个 WCA 文件
  -> 发送成功后通知 UI 添加本地语音气泡
```

注意：UI 在松键时计算的秒数被放入 `VOICE_STOP` 事件，但当前服务逻辑只把它当作附带数据，并不用于最终发送。最终语音时长来自 WCA 文件的实际 Opus 帧数，即 `wechat_audio_result_t.duration_sec`。

## 7. 远端语音消息链路

1. UDP RX 任务收到 `WECHAT_UDP_MSG_VOICE`。
2. 服务回调按 `BEGIN / DATA / END` 子类型处理。
3. BEGIN 创建 `FLASH:/OPUS/RX<transfer_id>.TMP`。
4. DATA 要求 `offset` 严格等于当前已接收长度，并边写文件边计算 CRC32。
5. END 校验 transfer ID、文件长度和 CRC32。
6. 校验通过后将临时文件重命名为 `.WCA`。
7. 服务任务把它转为待播放语音并通知 UI 添加远端气泡。
8. 若当前没有录音或播放任务，立即创建播放 job。
9. 音频任务逐帧 Opus 解码，将 PCM 节点送往 speaker stream。

录音优先级高于远端播放：用户在播放期间按下语音键时，服务先停止当前播放，待播放完成事件返回后再开始录音。

## 8. 表情消息链路

### 8.1 本地发送

1. 用户打开表情面板并选择索引 `0..7`。
2. UI 调用 `emoji_selected` 回调。
3. 服务把 SEND_EMOJI 投递到服务队列。
4. UI 在投递成功后立即显示本地表情气泡。
5. 服务任务调用 `wechat_udp_send_emoji()`。
6. UDP TX 任务异步发送一个 1 B payload 的表情包。

这里采用乐观 UI：本地气泡表示业务事件成功入队，不表示 UDP 已确认送达。

### 8.2 远端接收

1. UDP RX 校验协议头和表情索引。
2. 服务回调投递 REMOTE_EMOJI 事件。
3. 服务任务写入 UI 队列。
4. LVGL timer 拉取消息并显示远端表情气泡。

## 9. 当前功能边界

已实现：

- 8 个固定表情的双向 UDP 消息；
- 8 kHz、单声道、20 ms 帧的 Opus 语音录制；
- WCA 文件保存、UDP 分片发送、CRC32 校验；
- 远端语音自动播放；
- 录音优先于播放的半双工业务调度；
- UI 与业务服务解耦；
- 语音、表情编译期开关。

尚未实现或仅预留：

- 拍照按钮动作为空；
- UDP 的 PHOTO_BEGIN、PHOTO_DATA、PHOTO_END 只有消息类型定义；
- ACK 类型尚未形成确认与重传机制；
- UI 语音气泡可点击但没有绑定重播事件；
- 聊天记录未持久化，重开页面不会恢复历史消息；
- 对端 IP 为固定配置，不支持发现、配对或动态切换。

## 10. 维护风险摘要

### 高优先级

1. 音频完成回调使用非阻塞方式投递服务队列，且当前忽略投递失败。若 16 深度的服务队列已满，服务层可能收不到完成事件，导致 `record_job_id` 或 `play_job_id` 无法清零。
2. UDP 协议没有 ACK、重传或乱序重组。任意一个语音 DATA 包丢失或乱序都会使接收端中止整个文件。

### 中优先级

1. UDP RX 回调内直接执行 Flash 文件创建、写入、重命名和 CRC 计算。Flash 延迟过高时可能拖慢后续收包。
2. 语音接收超时只在收到下一次 BEGIN 时检查。单次传输中途停止后，临时文件可能一直保持打开，直到新 BEGIN 或模块退出。
3. UI 队列深度为 8，写入采用非阻塞方式；突发远端消息可能被丢弃。
4. 接收端只校验来源 IP，没有校验来源 UDP 端口。

### 兼容性注意

1. UDP 多字节字段使用大端序，跨平台可解析。
2. WCA 文件头和每帧 `packet_len` 使用目标机本地字节序。当前文件以整体二进制形式传输并在同类设备上播放没有问题，但不应直接假定其跨端序兼容。
3. Opus 库配置为 fixed-point，且启用了 C99 VLA；音频工作任务的大栈需求需要持续关注。

## 11. 建议的后续演进顺序

1. 为服务队列完成事件增加可靠投递或兜底状态恢复。
2. 给语音协议增加 ACK、超时清理和重传策略。
3. 将 UDP RX 的文件写入移到专用接收任务或缓存队列。
4. 为消息增加 message ID、发送状态和失败提示，替代完全乐观的 UI。
5. 实现语音气泡重播与聊天记录索引。
6. 再扩展照片分片协议，复用 transfer ID、offset、size、CRC 的通用文件传输模型。
