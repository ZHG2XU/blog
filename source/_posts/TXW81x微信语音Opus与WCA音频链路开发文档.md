---
title: "TXW81x 微信语音 Opus 与 WCA 音频链路开发文档"
date: "2026-07-17 20:20:00"
categories:
  - [项目文档, TXW81x 可视对讲]
tags:
  - TXW81x
  - 微信语音
  - Opus
  - WCA
  - 音频编解码
  - RTOS
  - PSRAM
toc_number: false
excerpt: "梳理微信语音模块的 8 kHz Opus 参数、WCA 文件格式、录音编码、播放解码、音频 stream、任务状态与资源生命周期。"
---

> 项目: TXW81x 可视对讲 UI
> 音频适配: `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c`
> 编解码库: `sdk/lib/opus/`
> Opus 版本: `1.5.1`
> 提交范围: `6c55dda` 至 `2440a8e`
> 分析基线: `2440a8e`（2026-07-17）

---

## 1. 模块定位

`wechat_audio` 将项目音频 stream、Flash 文件和 Opus API 封装为单任务异步作业接口：

- `wechat_audio_record_start()`：开始录音并写入 WCA 文件；
- `wechat_audio_record_stop()`：协作停止录音；
- `wechat_audio_play_start()`：播放一个 WCA 文件；
- `wechat_audio_play_stop()`：协作停止播放；
- `wechat_audio_get_result()`：读取最近完成作业的结果。

同一时刻只允许一个录音或播放作业。业务服务持有 job ID，用它匹配命令、完成回调和结果。

基线版本的关键源码定位：

- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:58`：WCA 文件头；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:375`：单帧 Opus 编码；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:401`：录音作业；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:653`：播放作业；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:902`：encoder 参数；
- `sdk/lib/gui/intercom_ui/wechat_app/wechat_audio.c:925`：模块初始化；
- `sdk/lib/opus/opus_config.h:50`：fixed-point 配置；
- `sdk/lib/opus/opus_config.h:203`：Opus 版本。

## 2. Opus 编译配置

`sdk/lib/opus/opus_config.h` 的关键配置：

| 配置 | 值 | 含义 |
| --- | --- | --- |
| `PACKAGE_VERSION` | `1.5.1` | Opus 源码版本 |
| `FIXED_POINT` | `1` | 使用固定点实现 |
| `VAR_ARRAYS` | `1` | 允许 C99 变长数组 |
| `OPUS_BUILD` | enabled | 编译 Opus 库本体 |
| ARM/NEON 优化 | 未启用 | 当前以通用 C 路径为主 |
| `ENABLE_HARDENING` | 未启用 | 未开启额外 hardening |
| Deep PLC / DRED / OSCE | 未启用 | 新增增强能力未启用 |

固定点配置适合无高性能 FPU 的 MCU/SoC，但 Opus 内部调用深度和 VLA 会增加栈压力。本模块为音频任务单独分配了 30 KiB PSRAM 栈。

## 3. 微信语音编码参数

| 参数 | 当前值 |
| --- | ---: |
| 采样率 | 8000 Hz |
| 声道 | 单声道 |
| PCM 位深 | 16 bit |
| 每帧采样点 | 160 |
| 每帧时长 | 20 ms |
| 每帧 PCM 大小 | 320 B |
| 目标码率 | 8000 bit/s |
| 应用模式 | `OPUS_APPLICATION_VOIP` |
| 带宽 | `OPUS_BANDWIDTH_NARROWBAND` |
| VBR | 关闭，CBR |
| Complexity | 0 |
| In-band FEC | 关闭 |
| DTX | 关闭 |
| Packet loss percent | 0 |
| 最大 Opus 包缓存 | 256 B |
| 最大录音时长 | 60 s |

这是一套偏低算力、窄带语音的参数，目标是降低 CPU、存储和网络开销，而不是追求宽带语音质量。

理论上 8 kbit/s 的 20 ms CBR 帧约为 20 B 编码数据；WCA 每帧额外保存 2 B 长度字段。

## 4. WCA 文件格式

文件扩展名为 `.WCA`，magic 为 `WCA1`。文件由固定头和连续 Opus 帧组成。

```text
+-----------------------------+
| WCA header                  |
+-----------------------------+
| uint16 packet_len           |
| packet_len bytes Opus data  |
+-----------------------------+
| uint16 packet_len           |
| packet_len bytes Opus data  |
+-----------------------------+
| ...                         |
+-----------------------------+
```

### 4.1 文件头

`wechat_audio_file_header_s` 使用 packed 布局，共 28 B。

| 字段 | 类型 | 当前值/含义 |
| --- | --- | --- |
| `magic` | uint32 | `0x31414357`，在当前小端目标上对应字节串 `WCA1` |
| `version` | uint16 | 1 |
| `header_size` | uint16 | `sizeof(header)` |
| `sample_rate` | uint32 | 8000 |
| `channels` | uint16 | 1 |
| `frame_samples` | uint16 | 160 |
| `frame_count` | uint32 | Opus 帧数 |
| `duration_ms` | uint32 | `frame_count × 20` |
| `payload_size` | uint32 | 所有长度字段和 Opus 包的总字节数 |

录音开始时先写一个全零占位头；结束后回到文件起点写入最终元数据。

### 4.2 字节序

WCA 头和 `packet_len` 直接写入目标机本地二进制表示，没有转换为网络字节序。当前 UDP 层发送的是整个 WCA 文件原始字节，因此同构 TXW81x 设备之间可以使用；若未来由 PC、手机或不同端序芯片解析，应先明确并固定 WCA 的标准字节序。

## 5. 录音编码流程

```text
R_WECHAT_AUDIO stream
  -> recv_real_data()
  -> 聚合为 320 B / 160 samples
  -> opus_encode(..., 160, ..., 256)
  -> 写 uint16 packet_len
  -> 写 Opus packet
  -> 重复直到 STOP / ABORT / 60 s timeout
  -> 回写 WCA header
```

关键行为：

1. 录音 stream 名为 `R_WECHAT_AUDIO`，定义值为 `wechat-record-audio`。
2. 输入节点长度向下对齐到偶数，避免半个 16 bit 采样。
3. 输入节点可以大于或小于一帧，模块使用 320 B 栈内 PCM 帧进行聚合。
4. STOP、ABORT 和最大录音时长在循环顶部检查。
5. 少于一帧的尾部 PCM 不编码；至少要成功编码一帧，文件才有效。
6. 成功文件命名为 `FLASH:/OPUS/MSG<n>.WCA`。
7. `<n>` 通过扫描现有文件的最大索引再加一得到。

录音结果时长来自实际写入帧数，而不是按键按住时间：

```text
duration_ms  = frame_count * 20
duration_sec = ceil(duration_ms / 1000)
```

## 6. 播放解码流程

```text
打开 WCA
  -> 校验 header
  -> reset Opus decoder
  -> 创建 4 个播放节点，每个 1024 B
  -> 绑定 speaker stream
  -> DAC 切换到 8 kHz / SOUND_FILE
  -> 逐帧读取 packet_len 和 packet
  -> opus_decode(..., max 160 samples, FEC=0)
  -> 标记 16 bit PCM 长度并送入 stream
  -> 关闭 stream，恢复 DAC 配置
```

播放缓冲总大小为 4 KiB，分配在 PSRAM。单帧解码 PCM 为 320 B，小于单节点 1024 B。

播放前会检查：

- magic、version 和 header size；
- 采样率、声道和 frame samples 必须与当前固件一致；
- frame count 非零；
- payload size 不越过文件大小；
- frame count 与 payload 最小长度关系合理；
- 每帧 packet length 为 `1..256`。

## 7. 作业状态机

```text
UNINITIALIZED
    |
    v
IDLE
  | record_start          | play_start
  v                       v
RECORD_STARTING         PLAY_STARTING
  | stream ready           | stream ready
  v                       v
RECORDING               PLAYING
  | record_stop            | play_stop
  v                       v
RECORD_STOPPING         PLAY_STOPPING
  | finished               | finished
  +-----------+-----------+
              v
             IDLE
```

状态、当前 job ID、播放路径和最近结果由 `wechat_audio.lock` 保护。STOP/ABORT 使用 event flags，使停止 API 不必等待整个音频循环结束。

## 8. 完成原因与错误码

完成原因用于描述正常结束方式：

- completed；
- user stopped；
- timeout；
- aborted；
- error。

错误码用于描述具体失败点，例如：

- 文件打开或文件 I/O；
- stream 打开失败；
- encoder/decoder 初始化失败；
- Opus 编码/解码失败；
- 文件格式非法；
- 内存不足；
- 内部错误。

完成回调在音频工作任务上下文执行。回调不得操作 LVGL，也不应执行阻塞工作；当前服务回调只把 `(event, job_id)` 投递到服务队列。

## 9. 初始化与资源生命周期

初始化顺序：

1. 初始化 mutex；
2. 初始化 control event；
3. 初始化深度为 4 的 job queue；
4. 创建并配置 Opus encoder；
5. 创建 Opus decoder；
6. 从 PSRAM 申请 30 KiB task stack；
7. 创建常驻音频 worker；
8. 状态切换为 IDLE。

退出顺序：

1. 设置 STOP 与 ABORT；
2. 反复尝试投递 EXIT，直到 job queue 接受；
3. 等待 worker 设置 WORKER_STOPPED；
4. 销毁任务并释放 PSRAM 栈；
5. 销毁 decoder、encoder；
6. 删除 queue、event、mutex。

禁止在音频回调自身调用 deinit，否则会形成任务等待自身退出的问题；代码已显式拒绝这种调用。

## 10. 与实时对讲 Opus 链路的区别

| 维度 | 微信语音 | `intercom_opus.c` 实时对讲 |
| --- | --- | --- |
| 业务形态 | 录完后发送文件 | 边采集边发送、边收边播 |
| 网络对象 | WCA 文件分片 | 实时编码帧/环形缓冲 |
| 抖动处理 | 无 | 有缓存、丢包检查等逻辑 |
| PLC/FEC | FEC 关闭，不做丢包补偿 | 原链路包含 PLC 相关逻辑 |
| 存储 | Flash 持久文件 | 以内存流为主 |
| 调度 | 单 worker，录放互斥 | 多任务并发实时处理 |

因此，实时对讲中的丢包补偿、重传和同步策略不会自动作用于微信语音文件传输。

## 11. 风险与待确认项

### 11.1 完成事件可靠性

音频模块只保存最近一个完成结果。当前服务严格串行启动作业，因此正常情况下不会被覆盖；但如果 AUDIO_*_FINISHED 事件因服务队列已满而丢失，服务状态可能与音频模块的 IDLE 状态脱节。

### 11.2 播放尾部是否完全排空

最后一帧送入 stream 后代码立即进入 cleanup 并关闭 stream。是否会等待 speaker 端消费所有已排队节点，取决于 `close_stream()` 的底层语义，需要结合 stream 框架验证。若关闭不带 drain，可能截断尾部音频。

### 11.3 WCA 完整性

WCA 自身没有 CRC。网络接收时由外层语音传输 CRC32 保证整个文件完整，但本地 Flash 文件损坏只能通过头字段和逐帧长度发现，不能检测所有静默位翻转。

### 11.4 文件索引与容量管理

每次录音扫描目录并使用最大序号加一，没有回收策略、容量上限处理和序号溢出处理。长期运行时需要增加消息索引与存储清理策略。

### 11.5 Opus 栈与性能

当前使用通用 fixed-point C 路径、complexity 0 和 30 KiB PSRAM 栈。修改 Opus complexity、启用新算法、切换 frame size 或打开额外增强功能后，应重新测量：

- worker 最大栈深；
- 单帧 encode/decode 耗时；
- PSRAM 访问对实时性的影响；
- 录音 stream 是否出现积压；
- 播放节点是否出现欠载。

## 12. 参数修改检查表

如果修改采样率或 frame size，必须同步检查：

- encoder/decoder create 参数；
- `WECHAT_AUDIO_FRAME_SAMPLES`；
- `WECHAT_AUDIO_FRAME_BYTES`；
- Opus expert frame duration；
- WCA header 校验规则；
- `duration_ms` 计算，当前写死为每帧 20 ms；
- DAC 采样率切换；
- record stream 实际 PCM 格式；
- play node 容量；
- 对端固件兼容性。
