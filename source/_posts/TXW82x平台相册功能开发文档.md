---
title: "TXW82x 平台相册功能开发文档"
date: 2026-06-30
categories:
  - 嵌入式开发
  - 项目文档
tags:
  - LVGL
  - C语言
  - MSI
  - TXW82x
  - JPEG
  - 嵌入式
  - 硬件解码
  - UI组件
toc_number: false
excerpt: "TXW82x 平台基于 LVGL 和 MSI 媒体流管道的 JPEG 相册功能完整开发文档。涵盖缩略图网格浏览、全屏预览、MSI 流水线架构、JPEG 硬件解码、CSC 动态格式配置及焦点导航系统。适用于 TXW82x（CK810 CPU + 硬件JPEG解码 + CSC硬件）平台。"
---

# TXW82x 平台相册功能开发文档

> **项目：** TXW82x 相册功能
> **日期：** 2026-06-30
> **基于提交：** `72ce4df` (更新相册功能) + `eab804e` (添加照片选中功能)
> **技术栈：** LVGL 8.x / FatFS (SD卡) / MSI (Media Stream Interface) / 硬件JPEG解码 + CSC硬件

---

## 目录

1. [功能概述](#一功能概述)
2. [文件变更清单](#二文件变更清单)
3. [数据结构详解](#三数据结构详解)
4. [MSI 流水线架构](#四msi-流水线架构)
5. [核心函数逐分析](#五核心函数逐分析)
6. [UI 界面布局](#六ui-界面布局)
7. [按键系统与焦点导航](#七按键系统与焦点导航)
8. [全屏预览机制](#八全屏预览机制)
9. [CSC 动态格式配置](#九csc-动态格式配置)
10. [JPEG 解码器扩展](#十jpeg-解码器扩展)
11. [内存管理策略](#十一内存管理策略)
12. [数据流完整跟踪](#十二数据流完整跟踪)
13. [操作说明](#十三操作说明)
14. [内存泄漏修复回顾](#十四内存泄漏修复回顾)

---

## 一、功能概述

相册功能为 TXW82x 平台提供基于 SD 卡的 JPEG 图片浏览能力。整体包含两大功能模块：

### 第一版（提交 `72ce4df`）— 相册功能骨架

- 从 SD 卡 `IMG/` 目录扫描 `*.jpg` 文件
- 缩略图网格展示（自动根据屏幕分辨率计算网格行列数）
- 支持多页翻页（按键、触摸按钮、左右滑动手势）
- 点击缩略图进入全屏预览（使用 VIDEO_P1 硬件层）
- MSI 流水线：`S_LVGL_PHOTO → SR_OTHER_JPG → S_JPG_DECODE → R_CSC_MSI → R_RGB_MSI`
- CSC 硬件从固定 RGB565→YUV420P 改造为支持动态格式配置
- JPEG 解码器新增输出尺寸动态配置能力

### 第二版（提交 `eab804e`）— 焦点选中增强

- 方向键焦点导航（上/下/左/右移动选中框）
- 红色边框高亮当前聚焦缩略图
- 焦点移至网格边界时自动翻页
- 短按确认键进入预览、长按确认键退出相册
- 预览模式独立按键映射（AD_PRESS → ESC）
- 触摸点击时同步更新焦点状态，保证触摸与按键操作一致性

---

## 二、文件变更清单

### 2.1 新增文件

| # | 文件 | 行数 | 说明 |
|---|------|------|------|
| 1 | `sdk/app/ui/album_ui.c` | ~800 行 | 相册 UI 全部逻辑（新增） |

### 2.2 修改文件

| # | 文件 | 提交1变更 | 提交2变更 | 说明 |
|---|------|----------|----------|------|
| 1 | `sdk/app/video_app/video_app_csc_msi.c` | +168 / -20 行 | — | CSC 动态格式支持 |
| 2 | `sdk/app/decode/jpg_decode_msg_msi.c` | +16 行 | — | 新增 OUT_SIZE / STEP 命令 |
| 3 | `sdk/app/algorithm/stream_frame/stream_define.h` | +3 行 | — | 新增 R_RGB_MSI 和两个 MSI 命令枚举 |
| 4 | `sdk/include/lib/multimedia/framebuff.h` | +1 行 | — | 新增 FRAMEBUFF_SOURCE_JPG |
| 5 | `sdk/app/ui/lvgl_ui.h` | +1 行 | — | 声明 album_ui() |
| 6 | `sdk/app/ui/main_ui.c` | +1 行 | — | 注册相册入口按钮 |

---

## 三、数据结构详解

### 3.1 `struct album_ui_s` — 相册状态结构体

```c
struct album_ui_s
{
    /* ===== UI 导航相关 ===== */
    lv_group_t *last_group;     // 进入相册前上级界面的按键组（菜单页）
    lv_obj_t   *base_ui;        // 上级界面对象（主菜单列表）
    lv_group_t *now_group;      // 当前相册界面的按键组
    lv_obj_t   *now_ui;         // 当前相册主界面对象

    /* ===== MSI 流水线节点 ===== */
    struct msi *photo_s;        // S_LVGL_PHOTO      — JPEG 文件源
    struct msi *other_s;        // SR_OTHER_JPG      — JPEG 解码消息配置
    struct msi *decode_s;       // S_JPG_DECODE      — JPEG 硬件解码
    struct msi *csc_s;          // R_CSC_MSI         — 色彩空间转换硬件
    struct msi *rgb_s;          // R_RGB_MSI         — RGB 输出节点

    /* ===== 帧缓冲池 ===== */
    struct fbpool tx_pool;      // photo_s 的帧缓冲池，用于数据传递

    /* ===== 页面布局 ===== */
    uint32_t cols;              // 缩略图网格列数
    uint32_t rows;              // 缩略图网格行数
    uint32_t img_per_page;      // 每页最大缩略图数 (= cols × rows, ≤ 12)
    uint32_t img_loaded_cnt;    // 当前页实际成功加载的缩略图数
    uint32_t cur_page;          // 当前页码 (1-based)
    uint32_t total_files;       // SD 卡中总 JPEG 文件数

    /* ===== UI 对象引用 ===== */
    lv_obj_t   *title;          // 标题栏 "Album" 标签
    lv_obj_t   *page_label;     // 页码标签 "1/5"
    lv_obj_t   *img_cont;       // 缩略图容器（Flexbox 布局）
    lv_obj_t   *imgs[12];       // 缩略图 lv_img 对象数组 (ALBUM_MAX_IMG=12)

    /* ===== 图像数据 ===== */
    lv_img_dsc_t *img_dsc[12];  // 每个缩略图的 LVGL 图像描述符指针

    /* ===== 预览状态 ===== */
    lv_obj_t   *preview_obj;    // 全屏预览界面对象（非 NULL 表示正在预览）

    /* ===== 焦点导航（第二版新增） ===== */
    int32_t     focus_idx;      // 当前聚焦的缩略图索引 (-1 = 无焦点)
    lv_obj_t   *focus_img;      // 当前聚焦的 lv_img 对象指针

    /* ===== 资源生命周期 ===== */
    uint8_t     csc_need_destroy; // 退出时是否需要 msi_destroy 该 CSC
};
```

### 3.2 常量定义

```c
#define CHECK_DIR   "IMG"       // SD 卡上的图片目录名
#define EXT_NAME    "*jpg"      // 文件匹配模式
#define IMG_W       160         // 缩略图宽度 (像素)
#define IMG_H       120         // 缩略图高度 (像素)
#define IMG_GAP     20          // 缩略图间距 (像素)
#define ALBUM_MAX_IMG 12        // 每页最大缩略图数
```

### 3.3 内存分配宏

```c
// 大数据（如图像像素数据）→ PSRAM
#define STREAM_MALLOC     av_psram_malloc
#define STREAM_FREE       av_psram_free
#define STREAM_ZALLOC     av_psram_zalloc

// 小结构体 → SRAM
#define STREAM_LIBC_MALLOC av_malloc
#define STREAM_LIBC_FREE   av_free
#define STREAM_LIBC_ZALLOC av_zalloc
```

> **设计理由**：PSRAM 空间大但速度较慢，适合存放图像帧数据；SRAM 速度快但空间有限，适合存放管理结构体。

---

## 四、MSI 流水线架构

### 4.1 流水线拓扑

```
                        ┌──────────────────────────────────────────┐
                        │             缩略图流水线                   │
                        │  (album_load_page 时激活)                 │
                        │                                          │
SD卡 ──→ S_LVGL_PHOTO ──→ SR_OTHER_JPG ──→ S_JPG_DECODE ──→ R_CSC_MSI ──→ R_RGB_MSI ──→ LVGL
(JPEG)    (photo_s)       (other_s)         (decode_s)       (csc_s)       (rgb_s)      显示
                                                                                  
                        │                                          │
                        │             预览流水线                   │
                        │  (enter_photo_preview_ui 时激活)          │
                        │                                          │
SD卡 ──→ S_LVGL_PHOTO ──→ SR_OTHER_JPG ──→ S_JPG_DECODE ──→ R_VIDEO_P1 ──→ LCD 视频层
(JPEG)    (photo_s)       (other_s)         (decode_s)       (硬件视频层)
```

### 4.2 各 MSI 节点详解

#### `photo_s` — 图片源 (`S_LVGL_PHOTO`)

| 属性 | 值 |
|------|-----|
| 创建方式 | `msi_new(S_LVGL_PHOTO, 0, NULL)` |
| 输出目标 | `SR_OTHER_JPG` |
| 回调函数 | `album_photo_msi_action` |
| 私有数据 | 指向 `struct album_ui_s` |
| 帧缓冲池 | `ui_s->tx_pool` |

**职责**：从 SD 卡读取 JPEG 文件，包装为 `struct framebuff` 后喂入流水线。

**`album_photo_msi_action` 回调处理**：

| 命令 | 行为 |
|------|------|
| `MSI_CMD_PRE_DESTROY` | 空操作（预留） |
| `MSI_CMD_POST_DESTROY` | 销毁帧缓冲池 `fbpool_destroy` |
| `MSI_CMD_FREE_FB` | 释放 `fb->data` (PSRAM)，归还 `fb` 到池中 |

#### `other_s` — JPEG 解码消息配置 (`SR_OTHER_JPG`)

| 属性 | 值 |
|------|-----|
| 创建方式 | `jpg_decode_msg_msi(SR_OTHER_JPG, out_w, out_h, step_w, step_h, filter)` |
| 输出目标 | `S_JPG_DECODE` |

**职责**：配置 JPEG 硬件解码参数。通过 MSI 命令动态调整：

```c
// 设置解码输出分辨率为 160×120（缩略图模式）
msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG, MSI_JPEG_DECODE_OUT_SIZE,
           160 << 16 | 120);

// 设置解码输出分辨率为 320×240（全屏预览模式）
msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG, MSI_JPEG_DECODE_OUT_SIZE,
           320 << 16 | 240);
```

#### `decode_s` — JPEG 硬件解码 (`S_JPG_DECODE`)

| 属性 | 值 |
|------|-----|
| 创建方式 | `jpg_decode_msi(S_JPG_DECODE)` |
| 输出目标（缩略图）| `R_CSC_MSI` |
| 输出目标（预览）| `R_VIDEO_P1` (临时切换) |

#### `csc_s` — 色彩空间转换 (`R_CSC_MSI`)

| 属性 | 值 |
|------|-----|
| 创建方式 | `video_app_csc_msi_init()` 或 `msi_find()` 复用已有 |
| 生命周期管理 | `ui_s->csc_need_destroy` 标记是否由本模块创建 |

**复用逻辑**：

```c
ui_s->csc_s = msi_find(R_CSC_MSI, 1);  // 查找是否已存在
if (!ui_s->csc_s)
{
    // 不存在 → 新建，标记退出时销毁
    video_app_csc_msi_init(R_CSC_MSI, CSC_YUV420P, CSC_RGB565, IMG_W, IMG_H);
    ui_s->csc_s = msi_find(R_CSC_MSI, 1);
    ui_s->csc_need_destroy = 1;
}
else
{
    // 已存在（比如 VIDEO2 通路已经创建了）→ 复用，不销毁
    ui_s->csc_need_destroy = 0;
}
```

#### `rgb_s` — RGB 输出节点 (`R_RGB_MSI`)

| 属性 | 值 |
|------|-----|
| 创建方式 | `msi_new(R_RGB_MSI, 1, NULL)` |
| 输入源 | CSC 的输出连接到本节点 |

**职责**：作为 CSC 转换后的 RGB 数据消费者，LVGL 从这里 `msi_get_fb` 获取 RGB565 帧数据显示缩略图。

### 4.3 流水线的创建与销毁

**创建** (`album_msi_init` → 在 `enter_album_ui` 中调用)：

```
album_msi_init(ui_s)
  ├── msi_new(S_LVGL_PHOTO, 0, NULL)        → photo_s
  │     ├── fbpool_init(&tx_pool, img_per_page)
  │     ├── photo_s->action = album_photo_msi_action
  │     └── msi_add_output(photo_s → SR_OTHER_JPG)
  │
  ├── jpg_decode_msg_msi(SR_OTHER_JPG, ...)  → other_s
  │     └── msi_add_output(other_s → S_JPG_DECODE)
  │
  ├── jpg_decode_msi(S_JPG_DECODE)           → decode_s
  │     └── msi_add_output(decode_s → R_CSC_MSI)
  │
  ├── msi_find(R_CSC_MSI) → 检查是否存在    → csc_s
  │     └── 不存在则 video_app_csc_msi_init()
  │
  └── msi_new(R_RGB_MSI, 1, NULL)            → rgb_s
        └── msi_add_output(NULL → R_CSC_MSI → R_RGB_MSI)
```

**销毁** (`album_msi_destroy` → 在 `album_exit` 中调用)：

```
album_msi_destroy(ui_s)
  ├── msi_del_output(decode_s → R_CSC_MSI)    // 清理通路避免影响菜单
  ├── msi_del_output(NULL → R_CSC_MSI → R_RGB_MSI)
  ├── msi_destroy(photo_s)
  ├── msi_destroy(other_s)
  ├── msi_destroy(decode_s)
  ├── msi_destroy(rgb_s)
  ├── msi_put(csc_s)
  └── if (csc_need_destroy) msi_destroy(csc_s)
```

---

## 五、核心函数逐分析

### 5.1 `album_ui()` — 相册入口

```c
lv_obj_t *album_ui(lv_group_t *group, lv_obj_t *base_ui)
```

**调用时机**：主菜单初始化时调用，`main_pocket_camera_ui()` 中注册：

```c
btn = album_ui(group, base_ui);
```

**函数流程**：

```
album_ui(group, base_ui)
  ├── 参数检查 (group == NULL || base_ui == NULL → return NULL)
  ├── STREAM_LIBC_ZALLOC(sizeof(struct album_ui_s)) → ui_s  (SRAM分配)
  ├── ui_s->last_group = group      // 保存上级按键组
  ├── ui_s->base_ui = base_ui       // 保存上级界面
  ├── lv_list_add_btn(base_ui, NULL, "album") → btn
  │     └── 失败 → STREAM_LIBC_FREE(ui_s) → return NULL
  ├── lv_group_add_obj(group, btn)  // 按钮加入按键组
  ├── lv_obj_add_event_cb(btn, enter_album_ui, LV_EVENT_SHORT_CLICKED, ui_s)
  │     // 点击按钮 → enter_album_ui
  └── return btn
```

**设计要点**：
- `album_ui` 只负责创建入口按钮和分配 `ui_s` 结构体
- 实际进入相册的耗时操作（MSI 初始化、UI 创建、文件扫描）都延迟到 `enter_album_ui` 进行
- `ui_s` 一直存活到相册退出，`album_exit` 中通过 `lv_obj_del(now_ui)` 间接触发 LVGL 对象释放
- **注意**：`ui_s` 结构体本身在退出时没有显式释放——这是潜在的内存泄漏，因为 `album_exit` 没有 `STREAM_LIBC_FREE(ui_s)`

### 5.2 `enter_album_ui()` — 进入相册

```c
static void enter_album_ui(lv_event_t *e)
```

**触发条件**：用户点击主菜单中的 "album" 按钮。

**完整流程**：

```
enter_album_ui(e)
  │
  ├── 1. 按键注册
  │     set_lvgl_get_key_func(album_self_key)   // 接管按键事件
  │     lv_obj_add_flag(base_ui, LV_OBJ_FLAG_HIDDEN)  // 隐藏菜单
  │
  ├── 2. 布局计算
  │     album_calc_layout(ui_s)
  │     │   ├── lv_disp_get_hor_res() → 获取屏幕宽度
  │     │   ├── lv_disp_get_ver_res() → 获取屏幕高度 (-30px 标题栏)
  │     │   ├── cols = (avail_w + 20) / (160 + 20)  // 计算列数
  │     │   ├── rows = (avail_h + 20) / (120 + 20)  // 计算行数
  │     │   ├── img_per_page = cols × rows (≤ 12)
  │     │   └── os_printf 打印布局参数
  │     │
  │     ├── 以 800×480 屏幕为例：
  │     │   cols = (800 + 20) / 180 = 4
  │     │   rows = (450 + 20) / 140 = 3
  │     │   img_per_page = 4 × 3 = 12
  │     │
  │
  ├── 3. MSI 流水线初始化
  │     album_msi_init(ui_s)
  │     │   ├── 创建 photo_s (S_LVGL_PHOTO)
  │     │   ├── 创建 other_s (SR_OTHER_JPG, 参数: 160×120)
  │     │   ├── 创建/复用 csc_s (R_CSC_MSI, YUV420P→RGB565)
  │     │   ├── 创建 decode_s (S_JPG_DECODE)
  │     │   └── 创建 rgb_s (R_RGB_MSI)
  │     │
  │
  ├── 4. 创建 UI 界面
  │     │
  │     ├── 主界面: lv_obj_create(lv_scr_act())
  │     │     ├── 白色背景, 无边框, 全屏
  │     │     ├── 关闭可滚动, 关闭手势冒泡
  │     │     └── ui_s->now_ui = ui
  │     │
  │     ├── 顶部标题栏: lv_obj_create(ui)
  │     │     ├── 高度 30px, 白色背景
  │     │     ├── 左: "Album" 标签 (lv_label, font_28)
  │     │     ├── 中: 页码标签 ui_s->page_label
  │     │     ├── 右: ">" 下一页按钮 (lv_btn 40×28)
  │     │     └── 右二: "<" 上一页按钮
  │     │
  │     ├── 分割线: lv_obj, 高2px, 黑色
  │     │
  │     ├── 图片容器: lv_obj_create(ui)
  │     │     ├── 宽 = cols×160 + (cols-1)×20 + 20
  │     │     ├── 高 = rows×120 + (rows-1)×20 + 20
  │     │     ├── LV_ALIGN_TOP_MID, y偏移38 (标题栏下方)
  │     │     ├── Flexbox: LV_FLEX_FLOW_ROW_WRAP (自动换行)
  │     │     ├── pad_all = 10, pad_gap = 20
  │     │     └── ui_s->img_cont
  │     │
  │     ├── 按键组: lv_group_create()
  │     │     ├── lv_indev_set_group(indev_keypad, group)
  │     │     ├── lv_group_add_obj(group, ui)
  │     │     └── ui_s->now_group = group
  │     │
  │     └── 事件注册:
  │           ├── ui → LV_EVENT_KEY → album_key_handler
  │           └── now_ui → LV_EVENT_GESTURE → album_gesture_handler
  │
  └── 5. 加载第 1 页
        ui_s->cur_page = 1
        album_load_page(ui_s)
```

### 5.3 `album_load_page()` — 加载当前页面

```c
static void album_load_page(struct album_ui_s *ui_s)
```

**完整流程**：

```
album_load_page(ui_s)
  │
  ├── 1. 开启 RGB 节点
  │     if (ui_s->rgb_s) ui_s->rgb_s->enable = 1
  │
  ├── 2. 清除焦点状态
  │     ui_s->focus_idx = -1
  │     ui_s->focus_img = NULL
  │
  ├── 3. 清理旧页面
  │     ├── lv_obj_clean(ui_s->img_cont)  // LVGL 删除所有 img 对象
  │     │     └── 通过 LV_EVENT_DELETE 回调自动释放文件名副本
  │     │
  │     └── 手动释放 img_dsc 数据
  │           for i = 0 to img_loaded_cnt:
  │               if img_dsc[i]:
  │                   if img_dsc[i]->data: STREAM_FREE(data)   // PSRAM
  │                   STREAM_LIBC_FREE(img_dsc[i])              // SRAM
  │                   img_dsc[i] = NULL
  │               imgs[i] = NULL
  │           img_loaded_cnt = 0
  │
  ├── 4. 计算文件范围
  │     start = (cur_page - 1) × img_per_page
  │     end   = start + img_per_page
  │
  ├── 5. 单遍扫描 SD 卡
  │     f_findfirst(&dir, &finfo, "IMG", "*jpg")
  │     while (fr == FR_OK && finfo.fname[0] != 0):
  │     │   if file_idx ≥ start && file_idx < end && loaded < per_page:
  │     │   │   if album_show(finfo.fname, ui_s) == 0:
  │     │   │       img_loaded_cnt++
  │     │   file_idx++
  │     │   f_findnext(&dir, &finfo)
  │     f_closedir(&dir)
  │     total_files = file_idx
  │
  │     ★ 设计要点: 单遍扫描，同时计数文件和加载当前页图片
  │       避免了先扫描一遍计数再扫描一遍加载的两遍扫描开销。
  │
  ├── 6. 更新页码显示
  │     total_pages = (file_idx + per_page - 1) / per_page
  │     sprintf(buf, "%d/%d", cur_page, total_pages)
  │     lv_label_set_text(page_label, buf)
  │
  ├── 7. 关闭 RGB 节点
  │     if (ui_s->rgb_s) ui_s->rgb_s->enable = 0
  │
  ├── 8. 默认聚焦第一个缩略图
  │     if (img_loaded_cnt > 0):
  │         album_apply_focus(ui_s, 0)
  │
  └── 9. 日志输出
        os_printf("album page %d/%d, total files %d, loaded %d\r\n", ...)
```

### 5.4 `album_show()` — 显示单个缩略图

```c
static int album_show(const char *filename, struct album_ui_s *ui_s)
```

**返回值**：`0` 成功，`-1` 失败（调用者根据返回值决定是否递增 `img_loaded_cnt`）。

**流程**：

```
album_show(filename, ui_s)
  ├── idx = ui_s->img_loaded_cnt
  │
  ├── lv_img_create(img_cont) → img
  │     ├── lv_obj_set_size(img, 160, 120)
  │     ├── 边框: 灰色 #CCCCCC, 1px
  │     ├── LV_OBJ_FLAG_CLICKABLE     // 可点击
  │     └── 清除 LV_OBJ_FLAG_SCROLLABLE
  │
  ├── 文件名拷贝 → user_data
  │     name_copy = STREAM_LIBC_MALLOC(strlen+1)
  │     strcpy(name_copy, filename)
  │     lv_obj_set_user_data(img, name_copy)
  │     lv_obj_add_event_cb(img, album_img_cleanup, LV_EVENT_DELETE, NULL)
  │     // ★ LV_EVENT_DELETE → img 被删除时自动 free user_data
  │
  ├── 注册点击事件
  │     lv_obj_add_event_cb(img, enter_photo_preview_ui,
  │                         LV_EVENT_SHORT_CLICKED, ui_s)
  │
  ├── 创建缩略图
  │     dsc = album_thumbnail_create(filename, ui_s, img)
  │
  ├── 成功分支
  │     if dsc != NULL:
  │     │   ui_s->img_dsc[idx] = dsc
  │     │   ui_s->imgs[idx] = img
  │     │   return 0
  │
  └── 失败分支
        if dsc == NULL:
            lv_obj_del(img)    // 删除 LVGL 对象
            return -1
```

### 5.5 `album_thumbnail_create()` — 创建缩略图

```c
static lv_img_dsc_t *album_thumbnail_create(const char *filename,
                                            struct album_ui_s *ui_s,
                                            lv_obj_t *img)
```

**核心流程 — JPEG 解码 + CSC 转换 → LVGL 图像描述符**：

```
album_thumbnail_create(filename, ui_s, img)
  │
  ├── 1. 加载 JPEG 文件
  │     album_jpeg_file_load(filename, ui_s, FRAMEBUFF_SOURCE_JPG)
  │     │   ├── osal_fopen("0:IMG/xxx.jpg", "rb")
  │     │   ├── STREAM_MALLOC(filesize) → photo_buf
  │     │   ├── osal_fread(photo_buf, filesize)
  │     │   ├── fbpool_get → data_s (从 tx_pool 取一个 fb)
  │     │   ├── data_s->data = photo_buf
  │     │   ├── data_s->mtype = F_JPG
  │     │   ├── data_s->srcID = FRAMEBUFF_SOURCE_JPG  ★ 关键标记
  │     │   ├── msi_output_fb(photo_s, data_s)
  │     │   │     └── JPEG 数据进入流水线:
  │     │   │         photo_s → other_s → decode_s → csc_s → rgb_s
  │     │   └── osal_fclose(fp)
  │     │
  │     ├── 2. 获取 RGB 输出
  │     │     msi_get_fb(rgb_s, 100) → rgb_fb  (超时 100 ticks)
  │     │     │
  │     │     └── if rgb_fb != NULL && rgb_fb->data != NULL:
  │     │           │
  │     │           ├── 3. 创建 LVGL 图像描述符
  │     │           │     STREAM_LIBC_MALLOC(sizeof(lv_img_dsc_t)) → dsc
  │     │           │     dsc->header = { w:160, h:120, cf:TRUE_COLOR }
  │     │           │     dsc->data_size = 160 × 120 × 2 = 38400
  │     │           │     │
  │     │           │     ├── STREAM_MALLOC(38400) → dsc->data  (PSRAM)
  │     │           │     │
  │     │           │     ├── sys_dcache_invalid_range(rgb_fb->data, 38400)
  │     │           │     │     // DMA 写入的 buffer 需要刷新 cache
  │     │           │     │
  │     │           │     ├── memcpy(dsc->data, rgb_fb->data, 38400)
  │     │           │     │     // ★ 深拷贝！避免后续帧冲掉数据
  │     │           │     │
  │     │           │     └── lv_img_set_src(img, dsc)
  │     │           │
  │     │           └── msi_delete_fb(rgb_s, rgb_fb)  // 归还 fb
  │     │
  │     └── return dsc (or NULL on failure)
```

### 5.6 `album_jpeg_file_load()` — JPEG 文件加载

```c
static int album_jpeg_file_load(const char *filename, struct album_ui_s *ui_s,
                                 uint8_t srcID)
```

**参数**：
- `filename`: 文件名（不含路径）
- `ui_s`: 相册状态
- `srcID`: 帧来源标记 (`FRAMEBUFF_SOURCE_JPG`)

**返回值**：`0` 成功，`-1` 失败。

**详细流程**（含错误处理）：

```
album_jpeg_file_load(filename, ui_s, srcID)
  │
  ├── 构建路径 "0:IMG/xxx.jpg"
  │
  ├── photo_s == NULL → return -1
  │
  ├── fbpool_get(&tx_pool, 0, photo_s) → data_s
  │     └── 失败 → return -1
  │
  ├── data_s->data = NULL
  │
  ├── osal_fopen(path, "rb") → fp
  │     └── 失败 → msi_delete_fb + return -1
  │
  ├── osal_fsize(fp) → filesize
  │
  ├── STREAM_MALLOC(filesize) → photo_buf
  │     └── 失败 → msi_delete_fb + fclose + return -1
  │
  ├── osal_fread(photo_buf, 1, filesize, fp)
  │     └── 长度不符 → STREAM_FREE + msi_delete_fb + fclose + return -1
  │
  ├── 填充 framebuff
  │     data_s->data  = photo_buf     // JPEG 文件数据
  │     data_s->mtype = F_JPG         // 标记为 JPEG 类型
  │     data_s->stype = FSTYPE_YUV_P1 // YUV 平面1格式
  │     data_s->len   = filesize      // 数据长度
  │     data_s->srcID = srcID         // ★ srcID 传递给 CSC 判断逻辑
  │
  ├── msi_output_fb(photo_s, data_s)  // 喂入流水线！
  │
  ├── osal_fclose(fp)
  └── return 0
```

**错误处理覆盖**：本函数有 4 个失败路径，每种都正确释放已分配资源。

---

## 六、UI 界面布局

### 6.1 界面结构树

```
lv_scr_act()  (活动屏幕)
  │
  └── now_ui (lv_obj, 白色全屏背景)
        │
        ├── top_bar (lv_obj, 高度30px, 标题栏)
        │     ├── title (lv_label, "Album", font_28, 黑色)
        │     ├── page_label (lv_label, "1/3", font_28, 黑色)
        │     ├── prev_btn (lv_btn, 40×28, "<" 符号, 上一页)
        │     └── next_btn (lv_btn, 40×28, ">" 符号, 下一页)
        │
        ├── line (lv_obj, 高2px, 黑色分割线, y=32)
        │
        └── img_cont (lv_obj, 图片容器, Flexbox 布局)
              ├── img[0] (lv_img, 160×120)
              ├── img[1] (lv_img, 160×120)
              ├── ...
              └── img[N-1] (lv_img, 160×120)
```

### 6.2 网格布局计算

**公式**：

```c
// 可用宽度 = 屏幕宽度
// 可用高度 = 屏幕高度 - 30 (标题栏高度)
cols = (avail_w + IMG_GAP) / (IMG_W + IMG_GAP);
rows = (avail_h + IMG_GAP) / (IMG_H + IMG_GAP);
img_per_page = min(cols × rows, ALBUM_MAX_IMG);
```

**示例计算结果**：

| 屏幕分辨率 | cols | rows | img_per_page |
|-----------|------|------|-------------|
| 800×480 | 4 | 3 | 12 |
| 480×272 | 2 | 1 | 2 |
| 640×480 | 3 | 3 | 9 |

**容器尺寸**：

```c
cont_w = cols × 160 + (cols - 1) × 20 + 20;
cont_h = rows × 120 + (rows - 1) × 20 + 20;
```

例如 4×3 网格：`cont_w = 4×160 + 3×20 + 20 = 720`, `cont_h = 3×120 + 2×20 + 20 = 420`

### 6.3 缩略图外观

| 状态 | 边框颜色 | 边框宽度 |
|------|---------|---------|
| 默认（无焦点）| `#CCCCCC` (浅灰) | 1px |
| 聚焦选中 | `#FF0000` (红色) | 3px |

---

## 七、按键系统与焦点导航

### 7.1 按键映射

#### 相册模式 (`album_self_key`)

| 硬件按键 | 事件类型 | 映射值 | 操作 |
|---------|---------|--------|------|
| AD_UP | KEY_EVENT_SUP (短按) | `'u'` | 焦点上移 |
| AD_DOWN | KEY_EVENT_SUP (短按) | `'d'` | 焦点下移 |
| AD_LEFT | KEY_EVENT_SUP (短按) | `'l'` | 焦点左移 |
| AD_RIGHT | KEY_EVENT_SUP (短按) | `'r'` | 焦点右移 |
| AD_PRESS | KEY_EVENT_SUP (短按) | `'e'` | 确认 / 进入预览 |
| AD_PRESS | KEY_EVENT_LDOWN (长按) | `'q'` | 退出相册 |

> **按键映射设计说明**：
> - 第一版中 AD_LEFT='q'(退出), AD_UP='n'(下一页), AD_DOWN='p'(上一页)
> - 第二版重映射为方向键导航，长按 AD_PRESS 替代退出
> - 按键码通过 `(val & 0xff)` 获取事件类型，`(val >> 8)` 获取按键值

#### 预览模式 (`preview_self_key`)

| 硬件按键 | 事件类型 | 映射值 | 操作 |
|---------|---------|--------|------|
| AD_PRESS | KEY_EVENT_SUP (短按) | `0x1B` (ESC) | 退出预览 |

### 7.2 焦点导航算法

#### 焦点高亮 (`album_apply_focus`)

```c
album_apply_focus(ui_s, idx)
  ├── 有效性检查 (idx < 0 || idx >= loaded_cnt → return)
  │
  ├── 清除旧焦点高亮
  │     if focus_img != NULL:
  │         border_color = #CCCCCC  (灰色)
  │         border_width = 1
  │
  └── 设置新焦点高亮
        img = imgs[idx]
        if img != NULL:
            border_color = #FF0000  (红色)
            border_width = 3
            focus_img = img
            focus_idx = idx
```

#### 四方向移动 + 自动翻页

**上移** (`album_focus_up`)：

```
new_idx = focus_idx - cols

if new_idx >= 0:
    album_apply_focus(ui_s, new_idx)    // 正常上移
else:
    if cur_page > 1:
        cur_page--
        album_load_page(ui_s)           // 已到第一行 → 上翻一页
```

**下移** (`album_focus_down`)：

```
new_idx = focus_idx + cols

if new_idx < loaded_cnt:
    album_apply_focus(ui_s, new_idx)    // 正常下移
else:
    total_pages = ceil(total_files / per_page)
    if cur_page < total_pages:
        cur_page++
        album_load_page(ui_s)           // 已到最后一行 → 下翻一页
```

**左移** (`album_focus_left`)：

```
new_idx = focus_idx - 1

if new_idx >= 0:
    album_apply_focus(ui_s, new_idx)    // 正常左移
else:
    if cur_page > 1:
        cur_page--
        album_load_page(ui_s)           // 已在第一个 → 上翻一页
```

**右移** (`album_focus_right`)：

```
new_idx = focus_idx + 1

if new_idx < loaded_cnt:
    album_apply_focus(ui_s, new_idx)    // 正常右移
else:
    total_pages = ceil(total_files / per_page)
    if cur_page < total_pages:
        cur_page++
        album_load_page(ui_s)           // 已在最后一个 → 下翻一页
```

### 7.3 按键事件处理 (`album_key_handler`)

```c
album_key_handler(e)
  ├── c = *(int32_t *)lv_event_get_param(e)  // 获取按键码
  │
  ├── switch(c):
  │     case 'q': album_exit(ui_s)           // 退出相册
  │     case 'u': album_focus_up(ui_s)       // 焦点上移
  │     case 'd': album_focus_down(ui_s)     // 焦点下移
  │     case 'l': album_focus_left(ui_s)     // 焦点左移
  │     case 'r': album_focus_right(ui_s)    // 焦点右移
  │     case 'e':                             // 确认
  │         if (ui_s->focus_img):
  │             lv_event_send(focus_img, LV_EVENT_SHORT_CLICKED, NULL)
  │             // ★ 通过发送 LV_EVENT_SHORT_CLICKED 复用触摸进入预览的逻辑
  │
  └── default: break
```

### 7.4 手势翻页

```c
album_gesture_handler(e)
  ├── lv_indev_get_act() → indev
  ├── lv_indev_get_gesture_dir(indev) → dir
  │
  ├── switch(dir):
  │     case LV_DIR_LEFT:   cur_page++; album_load_page()  // 左滑→下一页
  │     case LV_DIR_RIGHT:  cur_page--; album_load_page()  // 右滑→上一页
  │     default: break
  │
  └── lv_indev_wait_release(indev)  // 等待手势释放
```

> **设计要点**：`now_ui` 设置了 `LV_OBJ_FLAG_GESTURE_BUBBLE` 清除，阻止手势冒泡。`img_cont` 设置了 `LV_OBJ_FLAG_GESTURE_BUBBLE` 让手势可以冒泡到 `now_ui` 处理。`top_bar` 也设置了 `LV_OBJ_FLAG_GESTURE_BUBBLE`。

---

## 八、全屏预览机制

### 8.1 进入预览 (`enter_photo_preview_ui`)

```
触发方式:
  1. 触摸点击缩略图 → LV_EVENT_SHORT_CLICKED
  2. 按键确认('e') → lv_event_send(focus_img, LV_EVENT_SHORT_CLICKED)

enter_photo_preview_ui(e)
  │
  ├── 0. 同步焦点（触摸时同步更新焦点高亮）
  │     for i = 0 to loaded_cnt:
  │         if imgs[i] == img:
  │             album_apply_focus(ui_s, i)
  │             break
  │
  ├── 1. 获取文件名
  │     filename = (char *)lv_obj_get_user_data(img)
  │     name_copy = STREAM_LIBC_MALLOC(strlen+1)  // 拷贝文件名
  │     strcpy(name_copy, filename)
  │
  ├── 2. 按键接管
  │     set_lvgl_get_key_func(preview_self_key)  // 预览按键映射
  │
  ├── 3. 创建预览界面
  │     preview = lv_obj_create(lv_scr_act())
  │     ├── 全屏 (100% × 100%)
  │     ├── 无边框, 无滚动条
  │     ├── LV_EVENT_CLICKED → exit_photo_preview_ui  (触摸退出)
  │     ├── LV_EVENT_KEY → exit_photo_preview_ui       (按键退出)
  │     ├── lv_group_add_obj(now_group, preview)       // 加入按键组
  │     ├── lv_group_focus_obj(preview)                 // 聚焦预览对象
  │     └── ui_s->preview_obj = preview
  │
  ├── 4. MSI 通路切换
  │     │
  │     ├── msi_add_output(decode_s → R_VIDEO_P1)    // 解码输出→视频层
  │     ├── msi_del_output(decode_s → R_CSC_MSI)      // 断开→CSC通路
  │     │     // ★ 避免预览帧通过 CSC 干扰 P2（菜单）显示
  │     │
  │     └── msi_cmd(R_VIDEO_P1, MSI_CMD_LCD_VIDEO, MSI_VIDEO_ENABLE, 1)
  │           // 开启 VIDEO_P1 硬件视频层显示
  │
  ├── 5. 设置预览分辨率 (320×240)
  │     msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG,
  │                MSI_JPEG_DECODE_OUT_SIZE, 320 << 16 | 240)
  │
  ├── 6. 执行预览
  │     album_preview_show(name_copy, ui_s)
  │     │   └── album_jpeg_file_load(filename, ui_s, FRAMEBUFF_SOURCE_JPG)
  │     │         └── JPEG → decode_s → R_VIDEO_P1 → LCD 显示
  │
  └── 7. 释放文件名副本
        STREAM_LIBC_FREE(name_copy)
```

### 8.2 退出预览 (`exit_photo_preview_ui`)

```
触发方式:
  1. 触摸任意位置 → LV_EVENT_CLICKED
  2. 按键 AD_PRESS(短按) → 0x1B(ESC) → LV_EVENT_KEY

exit_photo_preview_ui(e)
  │
  ├── 1. 恢复相册按键
  │     set_lvgl_get_key_func(album_self_key)
  │
  ├── 2. 删除预览界面
  │     lv_obj_del(preview_obj)
  │     preview_obj = NULL
  │
  ├── 3. 刷新 LVGL 显示
  │     lv_refr_now(NULL)
  │
  ├── 4. 关闭 VIDEO_P1
  │     msi_cmd(R_VIDEO_P1, MSI_CMD_LCD_VIDEO, MSI_VIDEO_ENABLE, 0)
  │
  ├── 5. 恢复 decode→CSC 通路（恢复菜单显示）
  │     msi_add_output(decode_s, NULL, R_CSC_MSI)
  │
  ├── 6. 将输出分辨率调回缩略图参数
  │     msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG,
  │                MSI_JPEG_DECODE_OUT_SIZE, 160 << 16 | 120)
  │
  └── 7. 删除 decode→VIDEO_P1 通路
        msi_del_output(decode_s, NULL, R_VIDEO_P1)
```

### 8.3 预览模式 MSI 通路切换图示

```
┌───────── 缩略图模式 ─────────┐
│                              │
│  decode_s ──→ R_CSC_MSI ──→ rgb_s ──→ LVGL显示  │
│       (连接)                 │
│                              │
│  decode_s     R_VIDEO_P1     │
│       (断开)                 │
└──────────────────────────────┘

┌───────── 预览模式 ───────────┐
│                              │
│  decode_s     R_CSC_MSI     │
│       (断开)                 │
│                              │
│  decode_s ──→ R_VIDEO_P1 ──→ LCD显示  │
│       (连接)                 │
└──────────────────────────────┘
```

> **关键设计**：解码后的 JPEG 帧在缩略图模式下经过 CSC 转换为 RGB565 供 LVGL 显示，在预览模式下直接输出到 VIDEO_P1 硬件视频层（不经 CSC），实现全屏显示。

---

## 九、CSC 动态格式配置

### 9.1 改造背景

原 `video_app_csc_msi.c` 固定将输入 `RGB565` 转换为输出 `YUV420P`，用于 VIDEO2 通路（LVGL 菜单→CSC→YUV→LCD P2 层）。相册功能需要反向转换（JPEG 解码的 `YUV420P` → `RGB565`），因此需要对 CSC 驱动进行泛化改造。

### 9.2 新增辅助函数

#### `csc_is_rgb_format()` — 判断是否为 RGB 格式

```c
static uint8_t csc_is_rgb_format(uint32_t fmt)
```

支持的 RGB 格式：`CSC_BGR565`, `CSC_RGB565`, `CSC_BGR888`, `CSC_RGB888`, `CSC_RGB888P`。

#### `csc_get_convert_type()` — 自动推导转换类型

```c
static uint8_t csc_get_convert_type(uint32_t input_fmt, uint32_t output_fmt)
```

| 输入 | 输出 | 返回值 | 含义 |
|------|------|--------|------|
| YUV | RGB | 0 | YUV→RGB |
| RGB | RGB 或 YUV→YUV | 1 | 同色域 |
| RGB | YUV | 2 | RGB→YUV |

#### `csc_get_plane_offsets()` — 计算平面偏移

```c
static void csc_get_plane_offsets(uint32_t fmt, uint32_t w, uint32_t h,
                                   uint32_t *off1, uint32_t *off2)
```

不同的颜色格式有不同的内存布局：

| 格式 | 平面1 (Y/luma) | 平面2 (U/Cb) | 平面3 (V/Cr) |
|------|---------------|-------------|-------------|
| RGB565 / YUYV422 / YUV444 (packed) | 基址 + 0 | 0 | 0 |
| YUV420P | 基址 + 0 | + w×h | + w×h + w×h/4 |
| YUV422P | 基址 + 0 | + w×h | + w×h + w×h/2 |
| YUV422SP | 基址 + 0 | + w×h | 0 (interleaved UV) |
| RGB888P / YUV444P | 基址 + 0 | + w×h | + w×h×2 |

#### `csc_set_input_addr_by_fmt()` / `csc_set_output_addr_by_fmt()`

根据格式自动计算三个平面地址并调用 `csc_set_input_addr(dev, y_addr, u_addr, v_addr)`。

#### `csc_output_buf_size()` — 计算缓冲区大小

```c
static uint32_t csc_output_buf_size(uint32_t w, uint32_t h, uint32_t fmt)
```

| 格式类 | 计算公式 |
|--------|---------|
| 16-bit packed (RGB565, YUYV422 等) | w × h × 2 |
| YUV422 planar/semi-planar | w × h × 2 |
| YUV420P | w × h × 3 / 2 |
| 24-bit packed (RGB888, YUV444 等) | w × h × 3 |
| 24-bit planar (RGB888P, YUV444P 等) | w × h × 3 |

### 9.3 CSC 工作线程动态分支

`video_app_csc_msi_work()` 中根据 `fb->srcID` 分支：

```c
switch (csc_priv->current_rx_fb->srcID)
{
    case FRAMEBUFF_SOURCE_JPG:
        // 相册缩略图路径
        in_fmt  = CSC_YUV420P;     // JPEG 解码输出 YUV420P
        out_fmt = CSC_RGB565;      // LVGL 需要 RGB565
        csc_w   = 160;             // 缩略图宽
        csc_h   = 120;             // 缩略图高
        // 输出 fb 类型: F_RGB / LVGL_RGB
        break;

    default:
        // VIDEO2 默认路径（菜单显示）
        in_fmt  = CSC_RGB565;      // LVGL 输出 RGB565
        out_fmt = CSC_YUV420P;     // LCD YUV 层需要 YUV420P
        csc_w   = csc_priv->width;  // 全屏宽
        csc_h   = csc_priv->height; // 全屏高
        // 输出 fb 类型: F_YUV / FSTYPE_YUV_P0
        break;
}
```

### 9.4 CSC 初始化改进

改造前（固定 YUV420P 输出缓冲区大小）：

```c
uint8_t *csc_output_addr = STREAM_MALLOC(width * height * 3 / 2);
FBPOOL_SET_INFO(&tx_pool, i, csc_output_addr, width * height * 3 / 2, yuv_msg);
```

改造后（根据输出格式计算）：

```c
uint32_t out_buf_size = csc_output_buf_size(width, height, output_format);
uint8_t *csc_output_addr = STREAM_MALLOC(out_buf_size);
FBPOOL_SET_INFO(&tx_pool, i, csc_output_addr, out_buf_size, yuv_msg);
```

### 9.5 `MSI_CMD_TRANS_FB` 增加对 JPG 源的支持

```c
case MSI_CMD_TRANS_FB:
{
    struct framebuff *fb = (struct framebuff *)param1;
    switch (fb->srcID)
    {
    case FRAMEBUFF_SOURCE_CSC:
    case FRAMEBUFF_SOURCE_JPG:  // ★ 新增：允许 JPG 源通过 CSC
        ret = RET_OK;
        break;
    default:
        ret = RET_OK + 1;       // 拒绝其他来源
        break;
    }
}
```

---

## 十、JPEG 解码器扩展

### 10.1 新增 MSI 命令

在 `jpg_decode_msg_msi.c` 中新增两个 MSI 命令处理：

```c
// 配置输出分辨率
case MSI_JPEG_DECODE_OUT_SIZE:
    decode_msg->out_w = arg >> 16;     // 高16位 = 宽度
    decode_msg->out_h = arg & 0xffff;   // 低16位 = 高度
    break;

// 配置步进（解码时的步进尺寸）
case MSI_JPEG_DECODE_STEP:
    decode_msg->step_w = arg >> 16;    // 高16位 = 步进宽度
    decode_msg->step_h = arg & 0xffff;  // 低16位 = 步进高度
    break;
```

### 10.2 `stream_define.h` 新增定义

```c
// 新增 MSI 资源名称
#define R_RGB_MSI  "rgb_msi"

// 新增 JPEG 解码 MSI 命令枚举
enum MSI_JPEG_DECODE_MSG
{
    MSI_JPEG_DECODE_X_Y,
    MSI_JPEG_DECODE_FORCE_TYPE,
    MSI_JPEG_DECODE_MAGIC,
    MSI_JPEG_DECODE_OUT_SIZE,   // ★ 新增
    MSI_JPEG_DECODE_STEP,       // ★ 新增
};
```

### 10.3 使用方式

```c
// 设置缩略图解码尺寸 (160×120)
msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG,
           MSI_JPEG_DECODE_OUT_SIZE, 160 << 16 | 120);

// 设置预览解码尺寸 (320×240)
msi_do_cmd(other_s, MSI_CMD_DECODE_JPEG_MSG,
           MSI_JPEG_DECODE_OUT_SIZE, 320 << 16 | 240);
```

> **参数编码**：宽高编码在单个 uint32_t 中，高16位=宽度，低16位=高度。

---

## 十一、内存管理策略

### 11.1 内存分区

```
PSRAM (大容量, 稍慢)          SRAM (小容量, 快速)
────────────────────────      ────────────────────────
JPEG 文件数据 (photo_buf)     lv_img_dsc_t 结构体
RGB565 像素数据 (dsc->data)   文件名副本 (name_copy)
CSC 输出缓冲池                 ui_s 结构体
                              yuv_arg_s 结构体
```

### 11.2 各资源生命周期

| 资源 | 分配函数 | 分配位置 | 释放时机 | 释放函数 |
|------|---------|---------|---------|---------|
| `ui_s` 结构体 | `STREAM_LIBC_ZALLOC` | `album_ui()` | 退出相册 (`album_exit`) | **（遗漏）** |
| JPEG 文件 buffer | `STREAM_MALLOC` | `album_jpeg_file_load()` | MSI FreeFB 回调 | `STREAM_FREE` |
| LVGL 图像描述符 | `STREAM_LIBC_MALLOC` | `album_thumbnail_create()` | 翻页/退出 | `STREAM_LIBC_FREE` |
| 描述符内 RGB 数据 | `STREAM_MALLOC` | `album_thumbnail_create()` | 翻页/退出 | `STREAM_FREE` |
| 文件名副本 (user_data) | `STREAM_LIBC_MALLOC` | `album_show()` | `LV_EVENT_DELETE` → `album_img_cleanup` | `STREAM_LIBC_FREE` |
| 预览文件名副本 | `STREAM_LIBC_MALLOC` | `enter_photo_preview_ui()` | 函数末尾立即释放 | `STREAM_LIBC_FREE` |
| CSC tx_pool buffer | `STREAM_MALLOC` | `video_app_csc_msi_init()` | MSI POST_DESTROY | `STREAM_FREE` |
| CSC yuv_arg_s | `STREAM_LIBC_ZALLOC` | `video_app_csc_msi_init()` | MSI POST_DESTROY | `STREAM_LIBC_FREE` |
| CSC priv 结构体 | `STREAM_LIBC_ZALLOC` | `video_app_csc_msi_init()` | MSI POST_DESTROY | `STREAM_LIBC_FREE` |

### 11.3 关键内存管理设计

**1. 深拷贝 RGB 数据**

```c
// album_thumbnail_create 中
dsc->data = STREAM_MALLOC(IMG_W * IMG_H * 2);
memcpy((void *)dsc->data, rgb_fb->data, IMG_W * IMG_H * 2);
```

- 不从 CSC 输出 buffer 直接引用数据，而是拷贝一份
- 原因：CSC 输出 buffer 会被后续帧覆盖，深拷贝保证缩略图数据持久有效

**2. LV_EVENT_DELETE 自动释放**

```c
// album_show 中注册
lv_obj_add_event_cb(img, album_img_cleanup, LV_EVENT_DELETE, NULL);

// album_img_cleanup 回调
static void album_img_cleanup(lv_event_t *e)
{
    lv_obj_t *img = lv_event_get_target(e);
    void *user_data = lv_obj_get_user_data(img);
    if (user_data)
    {
        lv_obj_set_user_data(img, NULL);
        STREAM_LIBC_FREE(user_data);  // 释放文件名副本
    }
}
```

- 翻页时 `lv_obj_clean(img_cont)` 批量删除 img 对象
- LVGL 在删除对象时会发送 `LV_EVENT_DELETE`，触发自动释放
- 防止翻页时文件名泄漏

**3. photo_s MSI_CMD_FREE_FB 回调**

```c
case MSI_CMD_FREE_FB:
{
    struct framebuff *fb = (struct framebuff *)param1;
    if (fb->data)
    {
        STREAM_FREE(fb->data);   // 释放 JPEG 文件数据 (PSRAM)
        fb->data = NULL;
    }
    fbpool_put(&ui_s->tx_pool, fb);  // 归还 fb 到池中复用
    ret = RET_OK + 1;  // 阻止框架层再次释放
}
```

- `RET_OK + 1` 阻止 MSI 框架层重复释放 fb->data
- fb 归还到 tx_pool 供下次使用

**4. 翻页时内存清理顺序**

```
lv_obj_clean(img_cont)       // 第1步：删除 LVGL 对象（触发 DELETE 回调释放文件名）
    ↓
手动释放 img_dsc[]           // 第2步：释放图像描述符和数据
    ↓
重置计数器                   // 第3步：img_loaded_cnt = 0
```

> **重要**：必须先删除 LVGL 对象再释放 dsc，因为 LVGL 对象还在引用 dsc。如果先释放 dsc 再删除对象，会导致 LVGL 访问已释放的内存。

**5. 退出相册时的完整清理**

`album_exit()` 中：

```c
// 1. 还原 UI 状态
lv_indev_set_group(indev_keypad, last_group);
lv_group_del(now_group);
lv_obj_del(now_ui);

// 2. 销毁 MSI 流水线 (包括 CSC 输出 buffer)
album_msi_destroy(ui_s);

// 3. 释放缩略图数据
for (i = 0; i < img_loaded_cnt; i++)
{
    if (img_dsc[i])
    {
        if (img_dsc[i]->data) STREAM_FREE(data);
        STREAM_LIBC_FREE(img_dsc[i]);
    }
}
```

### 11.4 已知问题

> **`ui_s` 结构体泄漏**：`album_ui()` 中分配的 `struct album_ui_s` 在 `album_exit()` 中没有释放。虽然整个结构体很小（SRAM 中几十字节），但理论上存在内存泄漏。修复方法：在 `album_exit()` 末尾增加 `STREAM_LIBC_FREE(ui_s)`。

---

## 十二、数据流完整跟踪

### 12.1 缩略图加载数据流

以加载 `IMG/photo001.jpg` 为例：

```
Step 1: album_load_page()
  └── album_show("photo001.jpg", ui_s)
        └── album_thumbnail_create("photo001.jpg", ui_s, img)

Step 2: album_jpeg_file_load("photo001.jpg", ui_s, FRAMEBUFF_SOURCE_JPG)
  ├── 打开文件: osal_fopen("0:IMG/photo001.jpg", "rb")
  ├── 获取大小: osal_fsize() → 例如 25600 bytes
  ├── 分配内存: STREAM_MALLOC(25600) → photo_buf (PSRAM地址 0x6xxxxxxx)
  ├── 读取文件: osal_fread(photo_buf, 25600)
  ├── 获取 fb:  fbpool_get(&tx_pool, 0, photo_s) → data_s
  ├── 填充属性:
  │     data_s->data  = photo_buf       (0x6xxxxxxx)
  │     data_s->mtype = F_JPG
  │     data_s->stype = FSTYPE_YUV_P1
  │     data_s->len   = 25600
  │     data_s->srcID = FRAMEBUFF_SOURCE_JPG
  │
  └── 喂入流水线: msi_output_fb(photo_s, data_s)

Step 3: MSI 流水线处理 (异步)
  photo_s → SR_OTHER_JPG → S_JPG_DECODE → R_CSC_MSI → R_RGB_MSI
  │         │              │              │              │
  │         │              │              │              └─ rgb_s 收到 RGB565 帧
  │         │              │              │                  (160×120×2 = 38400 bytes)
  │         │              │              │
  │         │              │              └─ CSC 硬件: YUV420P → RGB565
  │         │              │                  输入: JPEG 解码的 YUV420P (160×120×1.5)
  │         │              │                  输出: RGB565 (160×120×2)
  │         │              │
  │         │              └─ jpg_decode_msi: 硬件解码 JPEG → YUV420P
  │         │                  输入: JPEG 文件数据 (25600 bytes)
  │         │                  输出: YUV420P 图像 (160×120×1.5 = 28800 bytes)
  │         │
  │         └─ jpg_decode_msg_msi: 配置解码参数
  │              输出宽高: 160×120
  │              步进宽高: 160×120
  │              过滤器: FSTYPE_YUV_P1
  │
  └─ photo_s: 数据已送出, 等待 FreeFB 回调释放 photo_buf

Step 4: msi_get_fb(rgb_s, 100) → rgb_fb (等待 RGB 输出)
  ├── rgb_fb != NULL && rgb_fb->data != NULL
  │
  ├── STREAM_LIBC_MALLOC(sizeof(lv_img_dsc_t)) → dsc (SRAM 0x1xxxxxxx)
  ├── dsc->header = { w:160, h:120, cf:LV_IMG_CF_TRUE_COLOR }
  ├── dsc->data_size = 38400
  ├── STREAM_MALLOC(38400) → dsc->data (PSRAM 0x6xxxxxxx)
  │
  ├── sys_dcache_invalid_range(rgb_fb->data, 38400)  // cache 刷新
  ├── memcpy(dsc->data, rgb_fb->data, 38400)          // 深拷贝
  │
  ├── lv_img_set_src(img, dsc)   // 设置 LVGL 图像源
  │
  └── msi_delete_fb(rgb_s, rgb_fb)  // 归还 rgb fb

Step 5: 返回 album_show
  ├── ui_s->img_dsc[idx] = dsc
  ├── ui_s->imgs[idx] = img
  └── return 0

Step 6: 异步释放 JPEG buffer
  MSI 框架调用 album_photo_msi_action(MSI_CMD_FREE_FB)
  └── STREAM_FREE(photo_buf)    // 释放 PSRAM
  └── fbpool_put(&tx_pool, fb)  // 归还 fb
```

### 12.2 全屏预览数据流

```
enter_photo_preview_ui(e)
  │
  ├── 通路切换
  │     decode_s → R_VIDEO_P1  (连接)
  │     decode_s → R_CSC_MSI   (断开)
  │     VIDEO_P1 ENABLE = 1
  │
  ├── 分辨率配置: OUT_SIZE = 320×240
  │
  └── album_preview_show("photo001.jpg", ui_s)
        │
        └── album_jpeg_file_load("photo001.jpg", ui_s, FRAMEBUFF_SOURCE_JPG)
              │
              └── msi_output_fb(photo_s, data_s)  // srcID = FRAMEBUFF_SOURCE_JPG
                    │
                    └── photo_s → other_s → decode_s → R_VIDEO_P1 → LCD
                          (配置320×240)   (硬件解码)    (视频层显示)
```

### 12.3 CSC 格式选择流程图

```
msi_get_fb(csc_s) 触发 CSC 工作线程
  │
  └── csc_priv->current_rx_fb->srcID
        │
        ├── FRAMEBUFF_SOURCE_JPG ──→ in_fmt = YUV420P
        │                            out_fmt = RGB565
        │                            size = 160×120
        │                            tx_fb->mtype = F_RGB
        │                            tx_fb->stype = LVGL_RGB
        │
        └── default ──→ in_fmt = RGB565
                         out_fmt = YUV420P
                         size = csc_priv->width × csc_priv->height
                         tx_fb->mtype = F_YUV
                         tx_fb->stype = FSTYPE_YUV_P0
```

---

## 十三、操作说明

### 13.1 缩略图浏览模式

| 操作方式 | 操作 | 功能 |
|---------|------|------|
| 按键 | ↑ (AD_UP) | 焦点上移；已在第一行则上翻一页 |
| 按键 | ↓ (AD_DOWN) | 焦点下移；已在最后一行则下翻一页 |
| 按键 | ← (AD_LEFT) | 焦点左移；已在第一个则上翻一页 |
| 按键 | → (AD_RIGHT) | 焦点右移；已在最后一个则下翻一页 |
| 按键 | 短按确认 (AD_PRESS) | 进入当前聚焦缩略图的预览 |
| 按键 | 长按确认 (AD_PRESS) | 退出相册返回主菜单 |
| 触摸 | 点击缩略图 | 进入该图片预览 |
| 触摸 | 点按 "<" 按钮 | 上一页 |
| 触摸 | 点按 ">" 按钮 | 下一页 |
| 触摸 | 左右滑动 | 左滑→下一页，右滑→上一页 |

### 13.2 全屏预览模式

| 操作方式 | 操作 | 功能 |
|---------|------|------|
| 按键 | 短按确认 (AD_PRESS) | 退出预览返回缩略图 |
| 触摸 | 点击任意位置 | 退出预览返回缩略图 |

---

## 十四、内存泄漏修复回顾

> 以下记录来自 `/memories/repo/album_ui_leaks.md`，是相册功能开发过程中的历史修复记录。

### 14.1 view_photo_ctx 双重释放 / Use-After-Free

- **症状**: 多次点击同一缩略图后系统卡死
- **根因**: `view_photo()` 中释放了 `view_photo_ctx`，但 img 对象的点击回调仍持有悬空指针。再次点击触发 use-after-free + double-free，堆损坏后 `av_free`/`av_malloc` 死锁
- **修复**: 移除 `view_photo_ctx` 结构体。文件名直接挂在 img user_data 上，事件 user_data 传 `ui_s`

### 14.2 翻页时文件名泄漏

- **根因**: `album_load_page` → `lv_obj_clean(img_cont)` 删除 img 对象时，LVGL 不会自动释放 user_data
- **修复**: 注册 `LV_EVENT_DELETE` 回调 (`album_img_cleanup`)，img 被删除时自动释放文件名副本

### 14.3 rgb_fb 泄漏

- **根因**: `msi_get_fb` 返回的 `rgb_fb` 非 NULL 但 `rgb_fb->data` 为 NULL 时，跳过了 `msi_delete_fb` 调用
- **修复**: 确保 `msi_delete_fb` 在任何分支都能被执行到

### 14.4 缺少防重入保护

- **根因**: 快速重复点击 "album" 按钮可能重复创建 MSI pipeline
- **修复**: 在 `enter_album_ui` 开头增加防重入检查 (`if (now_ui) return;`)

### 14.5 退出清理不彻底

- **修复**: `lv_obj_del(now_ui)` 后增加 `now_ui = NULL`

---

## 附录

### A. commit 信息

```
commit 72ce4df71923913fe6b60683ce1f61fdbbdb3529
Author: zhongxu <z18568601031@gmail.com>
Date:   Mon Jun 29 15:54:16 2026 +0800
    更新相册功能
Files: 7 files changed, 1000 insertions(+), 20 deletions(-)

commit eab804e36ea504b5cb5760e6b46fb8978108aae6
Author: zhongxu <z18568601031@gmail.com>
Date:   Mon Jun 29 20:23:14 2026 +0800
    添加照片选中功能
Files: 1 file changed, 260 insertions(+), 66 deletions(-)
```

### B. 关键文件路径

| 文件 | 路径 |
|------|------|
| 相册 UI | `sdk/app/ui/album_ui.c` |
| CSC 驱动 | `sdk/app/video_app/video_app_csc_msi.c` |
| JPEG 解码消息 | `sdk/app/decode/jpg_decode_msg_msi.c` |
| 流定义 | `sdk/app/algorithm/stream_frame/stream_define.h` |
| Framebuff 定义 | `sdk/include/lib/multimedia/framebuff.h` |
| LVGL UI 头文件 | `sdk/app/ui/lvgl_ui.h` |
| 主菜单 UI | `sdk/app/ui/main_ui.c` |
