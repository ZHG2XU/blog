---
title: "TXW81x 微信 UI、控制层与业务服务开发文档"
date: "2026-07-17 20:30:00"
categories:
  - [项目文档, TXW81x 可视对讲]
tags:
  - TXW81x
  - 微信消息
  - LVGL
  - UI架构
  - 业务服务
  - 状态机
  - 消息队列
  - RTOS
toc_number: false
excerpt: "记录 wechat_ui、wechat_ui_control 与 wechat_service 的职责边界、按键映射、队列桥接、录放音调度、页面生命周期和维护注意事项。"
---

> 项目: TXW81x 可视对讲 UI
> UI: `wechat_ui.c`
> 控制层: `wechat_ui_control.c`
> 服务层: `wechat_service.c`
> 提交范围: `e9a2fb5` 至 `2440a8e`
> 分析基线: `2440a8e`（2026-07-17）

---

## 1. 三层职责

### `wechat_ui.c`

- 创建入口按钮和聊天页面；
- 管理 LVGL 对象、group、焦点和 timer；
- 绘制本地/远端语音与表情气泡；
- 把控制动作转交 callbacks；
- 从 callback 拉取可显示消息。

### `wechat_ui_control.c`

- 识别 ESC、ENTER、语音按下和语音松开键；
- 根据当前焦点对象生成语义化 action；
- 记录 `speak_pressed`，过滤重复按下/松开；
- 不直接调用服务、网络和音频 API。

### `wechat_service.c`

- 实现 UI callbacks；
- 创建和销毁音频、UDP、服务任务；
- 把 UDP/音频回调转换为服务事件；
- 串行调度录音、播放和发送；
- 把业务结果转换为 UI 消息。

这种拆分使 `wechat_ui_create()` 可以注入其他 callbacks，UI 本身不依赖具体网络或音频实现。

基线版本的关键源码定位：

- `sdk/lib/gui/intercom_ui/wechat_ui_control.c:73`：按键事件映射；
- `sdk/lib/gui/intercom_ui/wechat_ui.c:350`：UI 消息 timer；
- `sdk/lib/gui/intercom_ui/wechat_ui.c:519`：UI action 分发；
- `sdk/lib/gui/intercom_ui/wechat_ui.c:687`：聊天页面打开；
- `sdk/lib/gui/intercom_ui/wechat_service.c:392`：UDP 回调桥接；
- `sdk/lib/gui/intercom_ui/wechat_service.c:415`：音频回调桥接；
- `sdk/lib/gui/intercom_ui/wechat_service.c:559`：服务任务事件循环；
- `sdk/lib/gui/intercom_ui/wechat_service.c:894`：服务 callbacks 绑定。

## 2. 页面入口和生命周期

`main_ui.c` 通过以下调用创建入口：

```c
wechat_service_create_ui(group, base_ui);
```

服务函数构造静态 callbacks，再调用 `wechat_ui_create()`。UI 为入口分配 `wechat_ui_s` 上下文，并向主列表加入 `wechat` 按钮。

用户进入页面时：

1. 先调用 callbacks.open，即 `wechat_service_init()`；
2. 服务成功后初始化控制层；
3. 隐藏 `base_ui`；
4. 创建全屏聊天 UI；
5. 创建独立 group 并接管 keypad；
6. 创建 30 ms UI 消息 timer。

用户退出页面时：

1. ESC 在表情面板打开时只关闭面板；
2. ESC 在正常聊天页中触发完整退出；
3. 删除 timer 和控制状态；
4. 调用 service deinit；
5. 恢复原 group 和主页面。

## 3. UI 布局

页面使用纵向 flex：

```text
+----------------------------------+
|           We Chat               | 20 px
+----------------------------------+
|                                  |
|       可滚动聊天消息列表          | flex grow
|                                  |
+----------------------------------+
| 隐藏/显示的 8 个表情选择按钮      | 40 px
+----------------------------------+
|    语音       拍照       表情     | 40 px
+----------------------------------+
```

语音气泡宽度按秒数增长：

```text
bubble_width = 65 + min(duration_sec, 30) * 3
```

本地消息右对齐，远端消息左对齐，并使用不同颜色的圆形 marker 区分双方。

## 4. 按键映射

| 键值 | 焦点对象 | Action | 行为 |
| --- | --- | --- | --- |
| `LV_KEY_ESC` | 任意 | exit | 关闭表情面板或退出页面 |
| `LV_KEY_ENTER` | 拍照按钮 | PHOTO_SELECTED | 当前无业务实现 |
| `LV_KEY_ENTER` | 表情按钮 | EMOJI_PANEL_TOGGLE | 打开/关闭表情面板 |
| `LV_KEY_ENTER` | 表情项 | EMOJI_SELECTED | 发送并显示表情 |
| `INTERCOM_KEY_SPEAK_PRESS` | 语音按钮 | VOICE_PRESS | 请求开始录音 |
| `INTERCOM_KEY_SPEAK_RELEASE` | 语音按钮 | VOICE_RELEASE | 请求停止录音 |

语音键只有在焦点位于语音按钮时生效。

## 5. 焦点组切换

正常工具栏状态下，group 包含：

```text
语音 -> 拍照 -> 表情
```

打开表情面板时：

1. 从 group 移除三个工具按钮；
2. 加入 8 个表情按钮；
3. 聚焦第一个表情。

关闭表情面板时执行反向操作，并将焦点恢复到表情工具按钮。

## 6. UI callback 接口

| Callback | 服务实现 | 线程上下文 | 作用 |
| --- | --- | --- | --- |
| `open` | `wechat_service_ui_open` | LVGL | 初始化全部业务资源 |
| `close` | `wechat_service_ui_close` | LVGL | 停止并释放全部业务资源 |
| `voice_start` | `wechat_service_ui_voice_start` | LVGL | 非阻塞投递 VOICE_START |
| `voice_stop` | `wechat_service_ui_voice_stop` | LVGL | 非阻塞投递 VOICE_STOP |
| `emoji_selected` | `wechat_service_ui_emoji_selected` | LVGL | 非阻塞投递 SEND_EMOJI |
| `get_message` | `wechat_service_ui_get_message` | LVGL timer | 非阻塞读取 UI 队列 |

UI 只在 callback 返回 `RET_OK` 后更新本地交互状态。例如表情事件成功进入服务队列后，立即创建本地表情气泡。

## 7. 两级消息队列

### 7.1 服务事件队列

深度 16，方向为“各生产者 -> 服务任务”。

生产者包括：

- LVGL：VOICE_START、VOICE_STOP、SEND_EMOJI；
- UDP RX：REMOTE_VOICE、REMOTE_EMOJI；
- 音频 worker：AUDIO_RECORD_FINISHED、AUDIO_PLAY_FINISHED。

每条消息压缩为 32 bit：

```text
uint16 cmd + uint16 data
```

### 7.2 UI 消息队列

深度 8，方向为“服务任务 -> LVGL timer”。

当前消息：

- 添加远端语音；
- 添加远端表情；
- 添加本地语音。

30 ms timer 每次触发时用 while 循环排空队列。

## 8. 服务任务事件处理

| 服务事件 | 核心处理 |
| --- | --- |
| VOICE_START | 标记录音请求；若正在播放则先停止播放，否则开始录音 |
| VOICE_STOP | 清除持续录音请求；若正在录音则发停止事件 |
| SEND_EMOJI | 调用 UDP 异步表情发送 |
| REMOTE_VOICE | 接纳已完成的接收文件，通知 UI，并尝试播放 |
| REMOTE_EMOJI | 写入 UI 队列 |
| AUDIO_RECORD_FINISHED | 读取结果、发送 WCA、通知 UI，再尝试播放待播语音 |
| AUDIO_PLAY_FINISHED | 清除播放 job；优先满足录音请求，否则播放下一条待播语音 |

## 9. 录音与播放仲裁

服务层使用以下字段表达业务状态：

| 字段 | 含义 |
| --- | --- |
| `record_requested` | 用户当前希望录音 |
| `record_job_id` | 正在启动或运行的录音作业 |
| `play_job_id` | 正在启动或运行的播放作业 |
| `pending_voice_valid` | 有一条远端语音等待播放 |
| `pending_voice_path` | 待播 WCA 路径 |

主要规则：

1. 录音和播放不能同时运行。
2. 用户按下语音键时，录音优先。
3. 若正在播放，先请求停止；收到 PLAY_FINISHED 后再启动录音。
4. 录音完成并发送后，才尝试播放远端待播语音。
5. 当前只保存一条 pending voice，无法积压多条远端语音。

## 10. 语音接收文件状态

`wechat_service_voice_rx_s` 管理一个活动传输：

| 字段 | 含义 |
| --- | --- |
| `file` | 当前 `.TMP` 文件句柄 |
| `transfer_id` | 当前传输 ID |
| `expected_size` | BEGIN 声明大小 |
| `received_size` | 已按序写入大小 |
| `crc32` | 增量 CRC 状态 |
| `last_packet_tick` | 最近数据时间 |
| `active` | 正在接收 |
| `ready` | `.WCA` 已校验并等待服务接纳 |

状态简图：

```text
idle
  -> BEGIN 合法，创建 TMP
active
  -> DATA 连续写入
  -> 错误：abort + 删除 TMP
  -> END 校验成功：rename
ready
  -> REMOTE_VOICE 事件
pending/play
```

## 11. 编译期开关

`wechat_service.h` 提供：

```c
WECHAT_SERVICE_VOICE_ENABLE
WECHAT_SERVICE_EMOJI_ENABLE
```

默认均为 1。关闭语音后，音频模块初始化、语音接收状态和相关 UI 消息映射会被条件编译移除；关闭表情后，表情网络事件和 callbacks 绑定会被移除。

UI 视觉控件本身目前仍在 `wechat_ui.c` 中创建，因此若希望彻底裁剪资源和交互入口，还需要同步在 UI 层增加条件编译或运行时隐藏。

## 12. 已确认的行为差异

### 12.1 本地表情是乐观显示

表情在服务事件入队成功后立即显示。后续 UDP TX 队列满或 `sendto()` 失败不会回滚气泡，也没有失败标记。

### 12.2 本地语音是发送成功后显示

语音气泡只有在录音成功且 `wechat_udp_send_voice_file()` 返回成功后才加入 UI 队列。这里的成功仍然只是本机 UDP 发送完成，不代表远端已确认接收。

### 12.3 远端语音气泡先于实际播放结果

接收文件通过 CRC 校验后就通知 UI 添加气泡，随后才尝试播放。播放失败不会移除气泡。

## 13. 并发与队列风险

### 高优先级：音频完成事件可能丢失

`wechat_service_audio_event()` 在音频 worker 中非阻塞投递完成事件，但没有处理返回失败。如果服务队列已满：

```text
audio 已回到 IDLE
service 仍保留 record_job_id/play_job_id
后续录音或播放可能一直无法启动
```

建议至少对完成事件采用可靠投递，或在服务任务中定期对比 `wechat_audio_get_state()` 做状态自愈。

### 中优先级：UI 消息丢失

UI 队列写入为非阻塞，队列满时消息会丢失。远端文件可能已经播放，但气泡没有显示；本地语音可能已经发送，但 UI 没有记录。

### 中优先级：只支持一个 pending voice

当 `pending_voice_valid` 已经为 1 时，新的 BEGIN 不被接受。远端连续发送多条语音时，必须等待上一条被服务接纳并开始播放后才能接收下一条。

### 低优先级：UI 上下文生命周期

`wechat_ui_s` 在创建入口时分配，并随入口长期存在；退出聊天页只删除 `now_ui`，不释放入口上下文。这符合入口常驻的当前用法，但如果未来动态删除和重建菜单入口，需要补充入口对象删除回调来释放上下文。

## 14. 扩展功能的推荐接入点

### 增加照片消息

1. 在 `WECHAT_UI_ACTION_PHOTO_SELECTED` 中调用新 callback；
2. 在 callbacks 和服务事件枚举中增加 photo 事件；
3. 复用语音的 transfer ID、offset、size、CRC 模型；
4. 文件落盘完成后再通知 UI；
5. 不要在 UDP RX 回调中做图片解码或 LVGL 操作。

### 增加语音气泡重播

1. UI 消息不能只携带 duration，需要增加稳定的 message ID；
2. 服务维护 message ID 到 WCA path 的映射；
3. 气泡点击事件向服务投递 PLAY_MESSAGE；
4. 服务继续使用现有录音优先仲裁规则。

### 增加发送状态

建议引入：queued、sending、sent、delivered、failed。表情和语音统一由服务生成 message ID，UI 根据状态消息更新气泡，而不是仅在创建时决定结果。

## 15. 调试入口

优先观察以下日志：

- `wechat udp initialized` / `deinitialized`；
- `wechat udp peer configured`；
- `wechat voice receive begin`；
- `wechat voice receive sequence error`；
- `wechat voice receive validation failed`；
- `wechat voice receive complete`；
- `wechat audio record start failed`；
- `wechat voice send failed`；
- `wechat audio play failed`。

出现“按键无反应”时，按以下顺序检查：

1. 焦点是否位于语音按钮；
2. PRESS/RELEASE 日志是否成对；
3. 服务事件队列是否成功入队；
4. audio state 是否为 IDLE；
5. `R_WECHAT_AUDIO` stream 是否有输入；
6. Flash 是否可创建 WCA；
7. 对端 IP、端口和 Wi-Fi 模式是否匹配。
