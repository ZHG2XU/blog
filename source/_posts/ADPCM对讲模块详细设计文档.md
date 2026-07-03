---
title: "ADPCM 对讲模块详细设计文档"
date: 2026-07-03
categories:
  - 嵌入式开发
  - 项目文档
tags:
  - ADPCM
  - 对讲
  - UDP
  - 音频
  - C语言
  - MSI
  - TXW82x
  - 嵌入式
toc_number: false
excerpt: "TXW82x 平台 ADPCM 对讲模块详细设计文档。梳理 intercom_adpcm.c 的模块职责、流和内存资源、初始化顺序、线程分工、编码发送、接收解码、播放链路以及关键回调函数绑定关系。"
---

# ADPCM 对讲模块详细设计文档

## 1. 文档目标

本文档说明 `sdk/app/intercom/intercom_adpcm.c` 的 ADPCM 对讲模块实现，重点讲清楚：

- 模块整体职责
- 依赖的流和内存资源
- 初始化顺序
- 线程之间的分工
- 编码、发送、接收、解码、播放链路
- 函数之间的调用关系
- 关键回调函数和函数指针绑定关系

本文档对应的核心文件：

- `sdk/app/intercom/intercom_adpcm.c`
- `sdk/app/intercom/intercom.h`
- `sdk/app/audio_app/bbm_audio_ad.c`
- `sdk/app/algorithm/stream_frame/stream_define.h`
- `project/main.c`

---

## 2. 模块定位

`intercom_adpcm.c` 实现的是一套基于 **UDP + ADPCM 编解码** 的对讲模块，不是 RTSP，也不是 RTP。

它完成的事情是：

1. 从本地麦克风流 `R_INTERCOM_AUDIO` 读取 PCM 音频
2. 使用 ADPCM 编码
3. 通过 UDP 发给对端
4. 接收对端发来的 ADPCM 包
5. 对丢包进行简单处理和重传请求
6. 解码为 PCM
7. 送入播放流，最终由 DAC 播放

---

## 3. 相关流名称

在 `stream_define.h` 中定义了与对讲相关的流：

- `R_INTERCOM_AUDIO = "INTERCOM_SEND"`
  - 含义：对讲发送输入流
  - 作用：麦克风采集出来的 PCM 音频会被送到这个流

- `S_INTERCOM_AUDIO = "INTERCOM_RECV"`
  - 含义：对讲接收输出流
  - 作用：接收到并解码后的 PCM 音频会送往这个流，再进入播放链路

- `R_SONIC_PROCESS`
  - 含义：Sonic 变速播放处理流
  - 作用：`intercom_opcode_func()` 会把 `S_INTERCOM_AUDIO` 绑定到这里

---

## 4. 上游音频输入从哪里来

在 `sdk/app/audio_app/bbm_audio_ad.c` 中，音频 ADC 流打开后会执行：

```c
streamSrc_bind_streamDest(s, R_INTERCOM_AUDIO);
```

这说明：

- 麦克风采集线程输出的 PCM 数据
- 会自动绑定到 `R_INTERCOM_AUDIO`
- 对讲模块只要打开 `R_INTERCOM_AUDIO`，就能拿到本地麦克风数据

所以，对讲模块不是自己驱动麦克风，而是消费音频采集模块已经产出的数据。

---

## 5. 启动入口

当前工程里，`project/main.c` 已经在 `CUSTOMER_ID == 8` 时，于网络初始化完成后调用：

```c
intercom_init();
```

这样 ADPCM 对讲会在系统网络起来后自动启动。

---

## 6. 顶层初始化流程

### 6.1 `intercom_init()`

入口函数：

```c
void intercom_init(void)
```

它做了 4 件事：

1. 分配 `TYPE_INTERCOM_STRUCT`
2. 调 `intercom_struct_init()` 初始化结构体字段
3. 调 `intercom_task_state_init()` 初始化运行状态
4. 打开 `R_INTERCOM_AUDIO` 流，并创建总控线程 `intercom_handle_init`

关键代码路径：

```c
intercom = INTERCOM_ZALLOC(...)
intercom_struct_init()
intercom_task_state_init()
intercom->stream_s = open_stream_available(R_INTERCOM_AUDIO, 8, 8, intercom_opcode_func, NULL)
OS_TASK_INIT(..., intercom_handle_init, ...)
```

### 6.2 这里的函数指针绑定关系

这一步有两个很重要的函数指针绑定：

#### 1. `open_stream_available(..., intercom_opcode_func, NULL)`

把流的回调函数指针绑定为：

- `opcode_func -> intercom_opcode_func`

也就是说，`R_INTERCOM_AUDIO` 这个流在打开、分配节点、释放节点时，会调用 `intercom_opcode_func()`。

#### 2. `OS_TASK_INIT(..., intercom_handle_init, ...)`

把线程入口函数指针绑定为：

- `task entry -> intercom_handle_init`

所以 `intercom_init()` 本身不直接做 socket 和任务创建，而是交给 `intercom_handle_init()` 线程继续完成。

---

## 7. `intercom_opcode_func()` 的作用

函数：

```c
static int intercom_opcode_func(stream *s, void *priv, int opcode)
```

这是 `R_INTERCOM_AUDIO` 流的回调函数。

### 7.1 `STREAM_OPEN_EXIT`

流真正打开成功后：

1. 为音频数据节点申请一块缓冲 `audio_buf`
2. 调 `stream_data_dis_mem_custom(s)`，让流节点使用这块自定义缓冲
3. 调 `streamSrc_bind_streamDest(s, R_SONIC_PROCESS)`
4. `enable_stream(s, 1)`

这里说明：

- 对讲接收播放流最终会继续进入 Sonic 处理链
- 后续 `send_to_stream()` 输出的 PCM 会送到这个流

### 7.2 `STREAM_DATA_DIS`

流分配节点时，会设置：

- `data->ops = &stream_sound_ops`
- `data->data = audio_buf + offset`

这里的 `stream_sound_ops` 里绑定了：

- `get_data_len -> get_sound_data_len`
- `set_data_len -> set_sound_data_len`

所以：

- 节点真实数据长度读写
- 是通过这两个函数指针完成的

### 7.3 这里的函数指针绑定关系

#### 1. `data->ops = &stream_sound_ops`

将节点的操作函数表绑定为：

- `get_data_len -> get_sound_data_len`
- `set_data_len -> set_sound_data_len`

#### 2. `streamSrc_bind_streamDest(s, R_SONIC_PROCESS)`

将本流输出进一步绑定到：

- `R_SONIC_PROCESS`

也就是说，解码后的 PCM 不是直接自己推到 DAC，而是先进 Sonic 处理流。

---

## 8. 总控线程 `intercom_handle_init()`

函数：

```c
void intercom_handle_init(void *d)
```

它是 ADPCM 对讲模块的总控初始化线程。

### 8.1 它做的事情

1. 如果当前是 STA，等待拿到 IP
2. 创建 UDP socket
3. 设置接收超时
4. 绑定本地端口 `5008/5009`
5. 根据 WiFi 模式设置对端 IP
6. 初始化内部缓冲池 `intercom_room_init()`
7. 创建 ADPCM 编码器和解码器
8. 初始化互斥锁、信号量、定时器
9. 创建 4 个关键工作线程

### 8.2 本地与对端地址规则

本地监听端口：

- `5008`
- `5009`

对端 IP：

- 如果 `wifi_mode == WIFI_MODE_STA`
  - 对端设为 `192.168.1.1`
- 否则
  - 对端设为 `192.168.1.100`

这就是为什么一台做 AP，一台做 STA 时，两边能互发。

### 8.3 这里创建了哪些线程

在这个函数中，使用 `csi_kernel_task_new()` 创建：

#### 1. 编码线程

- `task entry -> intercom_encoded_handle`

#### 2. 解码播放线程

- `task entry -> intercom_decoded_handle`

#### 3. 网络接收线程

- `task entry -> intercom_recv`

#### 4. 重传处理线程

- `task entry -> retransfer_check`

此外还启动了一个周期定时器：

- `timer callback -> decode_sem_up`

这个定时器每 `CODE_MODE` 周期触发一次，用来唤醒解码线程工作。

---

## 9. 内部房间和缓冲管理：`intercom_room_init()`

函数：

```c
int intercom_room_init(void)
```

这是对讲模块内部缓冲资源初始化函数。

它做了：

1. `ringbuf_Init(ENCODED_RINGBUF_LEN)`
   - 创建发送侧编码包环形缓冲
2. `sort_buf = INTERCOM_ZALLOC(SOFTBUF_LEN)`
   - 创建接收侧排序缓存
3. 初始化三个链表：
   - `srcList_head`
   - `checkList_head`
   - `useList_head`
4. 调 `srcList_init()`
   - 把 `sort_buf` 切成多个音频节点
5. 调 `sublist_init()`
   - 初始化接收排序子链表
6. 调 `ringbuf_manage_init()`
   - 初始化发送环形缓冲管理链表

### 9.1 三个链表的含义

- `srcList_head`
  - 空闲音频节点池
- `checkList_head`
  - 新收到但还没做丢包检查/排序的子链表
- `useList_head`
  - 已经排序好、可供解码播放的子链表

---

## 10. 发送链路总览

发送方向的主调用链如下：

```text
麦克风采集
-> bbm_audio_ad.c 绑定到 R_INTERCOM_AUDIO
-> intercom_init()
-> open_stream_available(R_INTERCOM_AUDIO, ..., intercom_opcode_func, ...)
-> intercom_encoded_handle()
-> adpcm_encode()
-> push_ringbuf_pre()
-> push_ringbuf()
-> intercom_send()
-> sendto()
```

---

## 11. 编码发送线程 `intercom_encoded_handle()`

函数：

```c
void intercom_encoded_handle(void *d)
```

### 11.1 它的主要职责

1. 从 `intercom->stream_s` 读取本地 PCM 音频
2. 调 `adpcm_encode()` 编码
3. 封装协议头
4. 写入发送环形缓冲
5. 调 `intercom_send()` 发送到对端

### 11.2 具体流程

#### 1. 读取本地音频

```c
get_f = recv_real_data(intercom->stream_s);
```

这里拿到的是 `R_INTERCOM_AUDIO` 上的 PCM 数据。

#### 2. 编码

```c
adpcm_encode(Enc_Inst, encoded_buf + RESERVE, &code_len, recv_stream_buf, DECODED_DATA_LEN, CODE_BPS);
```

#### 3. 填协议头

前 `RESERVE` 字节里写入：

- sequence
- status
- sort
- timestamp
- identify_num
- checksum

#### 4. 放入发送环形缓冲

```c
push_ringbuf_pre(ENCODED_BUF_BYTE);
push_ringbuf(encoded_ringbuf, encoded_buf, ENCODED_BUF_BYTE);
```

#### 5. 发送

```c
intercom_send(send_num);
```

### 11.3 特别说明

当编码不允许继续时，它会发送一个仅有头部的控制包：

- `encoded_buf[1] = 0`

正常音频包则：

- `encoded_buf[1] = 1`

---

## 12. `intercom_send()` 的作用

函数：

```c
void intercom_send(uint8_t num)
```

作用：

- 从发送环形缓冲中取出连续的编码包
- 拷贝到临时发送缓冲
- 调 `sendto()` 发给 `udp_remote_addr`

调用关系：

```text
intercom_encoded_handle()
-> intercom_send()
-> sendto()
```

这说明：

- 真正负责网络发包的是 `intercom_send()`
- `intercom_encoded_handle()` 负责生产待发编码包

---

## 13. 接收链路总览

接收方向的主调用链如下：

```text
UDP 收包
-> intercom_recv()
-> get_audio_sublist()
-> get_audio_node()
-> lose_packet_check()
-> insert_into_useList()
-> decode_sem_up()
-> intercom_decoded_handle()
-> send_to_stream()
-> adpcm_decode() / adpcm_decode_plc()
-> send_data_to_stream()
```

---

## 14. 网络接收线程 `intercom_recv()`

函数：

```c
void intercom_recv(void *d)
```

### 14.1 它的职责

1. 从 UDP socket 接收对端 ADPCM 包
2. 解析包头
3. 把音频有效载荷写入排序缓冲
4. 调 `lose_packet_check()` 做序号检查和缺包处理

### 14.2 核心步骤

#### 1. 收包

```c
rlen = recvfrom(intercom->udp_local_fd, recv_buf, ...)
```

#### 2. 校验包头

```c
check_sum != calulate_sum(...)
```

#### 3. 申请一个子链表

```c
sublist_l = get_audio_sublist(&intercom->checkList_head);
```

#### 4. 把音频数据拆进节点

```c
audio_n = get_audio_node(&(sublist_n->node_head), node_num);
```

#### 5. 做丢包检查

```c
lose_packet_check();
```

---

## 15. 丢包与重排：`lose_packet_check()`

函数：

```c
void lose_packet_check(void)
```

作用：

- 检查 sequence 是否连续
- 检查是不是重复包
- 如果有丢包，设置 `lose_packet` 位图
- 如果当前包有效，插入 `useList_head`
- 如果当前正在播放对讲，则通过 `ack_local_fd` 回发缺包位图

它会调用：

- `recv_repeat_check()`
- `insert_into_useList()`
- `sendto(intercom->ack_local_fd, ...)`

因此它既负责：

- 接收包排序
- 也负责生成重传请求

---

## 16. 重传处理线程 `retransfer_check()`

函数：

```c
void retransfer_check(void *d)
```

作用：

1. 监听 `ack_local_fd`
2. 收到对端缺包位图
3. 扫描发送环形缓冲管理表
4. 找到对应 sequence 的旧编码包
5. 调 `losePacket_retransfer()` 重发

调用关系：

```text
对端 lose_packet_check()
-> sendto(ack)
-> 本端 retransfer_check()
-> losePacket_retransfer()
-> sendto(data)
```

所以这套 ADPCM 对讲不是简单裸 UDP，而是带一条轻量重传链路。

---

## 17. 解码播放链路总览

播放方向的主调用链如下：

```text
decode_sem_up()
-> os_sema_up(&decode_sem)
-> intercom_decoded_handle()
-> send_to_stream()
-> get_src_data_f(intercom->stream_s)
-> adpcm_decode() / adpcm_decode_plc()
-> send_data_to_stream()
```

---

## 18. 周期唤醒：`decode_sem_up()`

函数：

```c
void decode_sem_up(uint32 *args)
```

作用很简单：

- 如果 `g_code_sema_init` 为真
- 就 `os_sema_up(&decode_sem)`

它不是自己解码，而是：

- 周期唤醒 `intercom_decoded_handle()`

函数指针绑定关系：

- `os_timer_init(..., decode_sem_up, ...)`
  - `timer callback -> decode_sem_up`

---

## 19. 解码线程 `intercom_decoded_handle()`

函数：

```c
void intercom_decoded_handle(void *d)
```

### 19.1 它的职责

1. 等待 `decode_sem`
2. 判断当前缓存数量
3. 决定是否开始播放
4. 调 `send_to_stream()` 逐帧输出 PCM

### 19.2 它做了什么

#### 1. 进入对讲播放模式

```c
former_dac_filter_type = get_audio_dac_set_filter_type();
audio_dac_set_filter_type(SOUND_INTERCOM);
```

#### 2. 等待信号量

```c
os_sema_down(sem, -1);
```

#### 3. 统计可播放缓存

```c
g_numofcached = get_audio_sublist_count(&intercom->useList_head);
```

#### 4. 满足阈值后开始播放

```c
if ((play_start_flag & BIT(0)) == 0 && (g_numofcached > playofwait ...)) {
    play_start_flag |= BIT(0);
}
```

#### 5. 调 `send_to_stream()`

```c
send_to_stream(g_numofcached);
```

---

## 20. 真正输出 PCM：`send_to_stream()`

函数：

```c
static int send_to_stream(uint32_t cached)
```

这是对讲播放链路里最关键的函数。

### 20.1 它的职责

1. 向 `intercom->stream_s` 申请一个输出节点
2. 从 `useList_head` 取最早的音频子链表
3. 提取编码数据
4. 调 `adpcm_decode()` 解码
5. 如果缺包则调 `adpcm_decode_plc()` 做 PLC
6. 把 PCM 写入流节点
7. `send_data_to_stream()` 发给下游播放链路

### 20.2 关键步骤

#### 1. 申请输出节点

```c
get_f = get_src_data_f(intercom->stream_s);
```

#### 2. 如果排序号正好匹配

```c
if (g_current_sort == new_sort) {
    adpcm_decode(...)
}
```

#### 3. 如果缺包

```c
adpcm_decode_plc(...)
```

#### 4. 设置输出节点属性

```c
set_sound_data_len(get_f, DECODED_DATA_LEN * 2);
get_f->type = SET_DATA_TYPE(SOUND, SOUND_INTERCOM);
set_stream_data_time(get_f, timestamp);
```

#### 5. 送到下游

```c
send_data_to_stream(get_f);
```

### 20.3 下游是谁

下游不是这里显式写死的 DAC，而是：

- 通过 `intercom_opcode_func()`
- `streamSrc_bind_streamDest(s, R_SONIC_PROCESS)`

先进入 Sonic 处理流，再走音频播放链路。

### 20.4 变速播放

如果 `CHANGE_PLAY_SPEED == 1`，这个函数还会根据缓存深度调节：

- `0.9x`
- `1.0x`
- `1.1x`

通过：

```c
set_sonic_speed(sonic_priv, play_speed);
```

这也是为什么工程里如果没把 Sonic 相关符号链接好，会出现 `sonic_priv` / `set_sonic_speed` 未定义错误。

---

## 21. 关键函数调用关系总表

## 21.1 启动链

```text
main.c
-> intercom_init()
   -> intercom_struct_init()
   -> intercom_task_state_init()
   -> open_stream_available(R_INTERCOM_AUDIO, ..., intercom_opcode_func, ...)
   -> OS_TASK_INIT(..., intercom_handle_init, ...)
```

## 21.2 总控初始化链

```text
intercom_handle_init()
-> socket()
-> bind()
-> intercom_room_init()
-> adpcm_encoder_create()
-> adpcm_decoder_create()
-> csi_kernel_task_new(..., intercom_encoded_handle, ...)
-> csi_kernel_task_new(..., intercom_decoded_handle, ...)
-> csi_kernel_task_new(..., intercom_recv, ...)
-> csi_kernel_task_new(..., retransfer_check, ...)
-> os_timer_init(..., decode_sem_up, ...)
```

## 21.3 发送链

```text
bbm_audio_ad.c
-> streamSrc_bind_streamDest(s, R_INTERCOM_AUDIO)

intercom_encoded_handle()
-> recv_real_data(intercom->stream_s)
-> adpcm_encode()
-> push_ringbuf_pre()
-> push_ringbuf()
-> intercom_send()
-> sendto()
```

## 21.4 接收链

```text
intercom_recv()
-> recvfrom()
-> get_audio_sublist()
-> get_audio_node()
-> lose_packet_check()
   -> recv_repeat_check()
   -> insert_into_useList()
   -> sendto(ack)
```

## 21.5 重传链

```text
retransfer_check()
-> recvfrom(ack_local_fd)
-> losePacket_retransfer()
-> sendto()
```

## 21.6 播放链

```text
decode_sem_up()
-> os_sema_up(&decode_sem)

intercom_decoded_handle()
-> get_audio_sublist_count()
-> send_to_stream()
   -> get_src_data_f(intercom->stream_s)
   -> adpcm_decode() / adpcm_decode_plc()
   -> set_sound_data_len()
   -> send_data_to_stream()
```

---

## 22. 函数指针与回调绑定总结

本模块里最重要的函数指针绑定如下：

### 22.1 流回调

```text
open_stream_available(R_INTERCOM_AUDIO, ..., intercom_opcode_func, ...)
```

- `opcode callback -> intercom_opcode_func`

### 22.2 节点长度操作函数表

```text
data->ops = &stream_sound_ops
```

- `get_data_len -> get_sound_data_len`
- `set_data_len -> set_sound_data_len`

### 22.3 总控线程入口

```text
OS_TASK_INIT(..., intercom_handle_init, ...)
```

- `task entry -> intercom_handle_init`

### 22.4 编码线程入口

```text
csi_kernel_task_new(..., intercom_encoded_handle, ...)
```

- `task entry -> intercom_encoded_handle`

### 22.5 解码线程入口

```text
csi_kernel_task_new(..., intercom_decoded_handle, ...)
```

- `task entry -> intercom_decoded_handle`

### 22.6 接收线程入口

```text
csi_kernel_task_new(..., intercom_recv, ...)
```

- `task entry -> intercom_recv`

### 22.7 重传线程入口

```text
csi_kernel_task_new(..., retransfer_check, ...)
```

- `task entry -> retransfer_check`

### 22.8 定时器回调

```text
os_timer_init(..., decode_sem_up, ...)
```

- `timer callback -> decode_sem_up`

---

## 23. 运行时的几个关键状态变量

- `send_start_flag`
  - 是否允许发送

- `play_start_flag`
  - bit0：是否开始播放
  - bit1：是否允许接收播放

- `intercom_encode_flag`
  - bit0：手动编码开关
  - bit1：软件编码开关

- `g_current_sort`
  - 当前期待播放的排序号

- `g_numofcached`
  - 当前可播放缓存帧数

- `g_s_identify_num`
  - 本轮发送会话 ID

---

## 24. 常见问题理解

### 24.1 为什么 `intercom_init()` 不是全部初始化的地方

因为它只负责：

- 建结构
- 开流
- 起总控线程

真正的 socket、缓冲池、编解码器、工作线程初始化，都在 `intercom_handle_init()` 里。

### 24.2 为什么会报 `sonic_priv` / `set_sonic_speed` 未定义

因为 `send_to_stream()` 中启用了：

```c
#define CHANGE_PLAY_SPEED 1
```

这样会依赖 Sonic 变速播放模块。

### 24.3 为什么会报 `err:intercom_handle_init 582`

因为这说明：

```text
intercom_room_init() == -1
```

也就是内部缓冲区初始化失败，通常和：

- `ringbuf_Init()`
- `sort_buf` 分配失败

有关。

---

## 25. 一句话总结

`intercom_adpcm.c` 的本质是一套：

**“麦克风 PCM -> ADPCM 编码 -> UDP 发送 -> UDP 接收 -> 丢包检查/重传 -> ADPCM 解码 -> PCM 播放”**

的完整对讲模块。

其中最核心的函数调用主链是：

```text
intercom_init()
-> intercom_handle_init()
-> intercom_encoded_handle() / intercom_recv() / intercom_decoded_handle() / retransfer_check()
```

如果要理解模块，优先抓住这 4 条线程链路即可。
