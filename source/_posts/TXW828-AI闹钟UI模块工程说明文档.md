---
title: "TXW828 AI 闹钟 — UI 模块工程说明文档"
date: 2026-05-09
categories:
  - 嵌入式开发
  - 项目文档
tags:
  - LVGL
  - UI架构
  - 代码移交
  - 嵌入式
  - 项目文档
excerpt: "TXW828 AI 闹钟项目的 UI 模块完整工程说明文档，涵盖架构设计、模块职责、数据流、接口说明和二次开发指南，适用于代码移交和新人上手。"
---

# TXW828 AI 闹钟 — UI 模块工程说明文档

> **适用对象：** 接手此项目的开发者、团队成员
> **最后更新：** 2026-05-09
> **LVGL 版本：** LVGL 8.x（见 `sdk/lib/lvgl/`）
> **硬件平台：** TXW828（C-SKY 架构）

---

## 目录

1. [模块概览](#一模块概览)
2. [目录结构](#二目录结构)
3. [核心架构](#三核心架构)
4. [各模块详细说明](#四各模块详细说明)
5. [数据流与刷新机制](#五数据流与刷新机制)
6. [公共 API 参考](#六公共-api-参考)
7. [添加新页面的步骤](#七添加新页面的步骤)
8. [依赖关系](#八依赖关系)
9. [已知限制与注意事项](#九已知限制与注意事项)
10. [编译与调试](#十编译与调试)

---

## 一、模块概览

### 1.1 这个项目是什么

这是一个基于 **TXW828 芯片**的 **AI 闹钟**产品的 UI 界面。设备配备一个小尺寸 LCD 屏幕（约 320×240），用户通过**左右滑动**切换功能页面，**点击**进入各功能的详情界面。

### 1.2 UI 包含哪些功能页面

| 页面 | 功能 | 代码路径 |
|------|------|----------|
| **Home（主页）** | 显示时间、日期、天气、WiFi 状态、电量 | `home/` |
| **Plan List（计划列表）** | 日期选择条 + 待办事项管理 | `plan_list/` |
| **AI Q&A（AI 问答）** | AI 对话入口页面 | `ai_qa/` |
| **Timing（计时器）** | 倒计时 / 秒表 / 番茄钟选择器 | `timing/` |
| **Calendar（日历）** | 月历视图 + 年月选择器 | `calendar/` |
| **Settings（设置）** | WiFi、蓝牙、亮度等 11 项设置 | `settings/` |

### 1.3 技术栈

- **GUI 框架：** LVGL 8.x
- **语言：** C99
- **RTOS：** AliOS（通过 `ohos/kernel/`）
- **服务层：** 自定义 service 层（`project/service/`）
- **构建工具：** CDK（`project/txw82xApp.cdkproj`）

---

## 二、目录结构

```
project/ui/
│
├── ui_theme.h                  ── [基础] 统一颜色、字体、尺寸常量
├── ui_back_button.h/.c         ── [基础] 可复用返回按钮组件
├── ui_menu_detail_page.h/.c    ── [基础] 菜单→详情导航框架
├── ui_manager.h/.c             ── [核心] UI 管理器（页面注册、导航、生命周期）
├── ui_screen_ids.h             ── [核心] 屏幕 ID 枚举定义
│
├── menu/
│   ├── menu_view.h             ── 菜单图片视图接口
│   └── menu_view.c             ── 菜单图片显示 + 点击事件
│
├── home/
│   ├── home_view.h             ── 主页视图接口
│   ├── home_view.c             ── 主页 UI 布局（时间、日期、天气、电量）
│   ├── home_refresh.h          ── 主页数据刷新接口
│   └── home_refresh.c          ── 定时刷新逻辑（1s/10s/60s/1800s 周期）
│
├── ai_qa/
│   ├── ai_qa_screen.h          ── AI 问答页面接口
│   └── ai_qa_screen.c          ── AI 问答页面实现
│
├── timing/
│   ├── timing_screen.h         ── 计时器页面接口
│   └── timing_screen.c         ── 计时器页面（倒计时/秒表/番茄钟）
│
├── calendar/
│   ├── calendar_screen.h       ── 日历页面接口
│   └── calendar_screen.c       ── 日历页面（月历 + 年月选择器）
│
├── plan_list/
│   ├── plan_list_screen.h      ── 计划列表页面接口
│   └── plan_list_screen.c      ── 计划列表页面（日期条 + 待办）
│
├── settings/
│   ├── settings_screen.h       ── 设置页面接口
│   ├── settings_screen.c       ── 设置页面入口
│   ├── settings_manager.h/.c   ── 设置项管理器（11 项设置 + 子页面路由）
│   ├── settings_common_styles.h/.c ── 设置页面通用样式（标题栏、body）
│   ├── settings_detail/        ── 设置列表视图
│   ├── setting_brightness/     ── 亮度调节子页面
│   └── setting_wifi/           ── WiFi 连接子页面
│
```

---

## 三、核心架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         ui_manager                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    lv_tileview                           ││
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐││
│  │  │ HOME │ │PLAN  │ │AI_QA │ │TIMING│ │CALEN │ │SETTIN│││
│  │  │      │ │LIST  │ │      │ │      │ │DAR   │ │GS    │││
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌───────────────────┐    ┌──────────────────────────────┐  │
│  │  home_refresh     │    │  ui_menu_detail_page (框架)   │  │
│  │  (定时器 1s)       │    │  ┌─────────┐ ┌────────────┐ │  │
│  │  → home_view      │    │  │menu_page│→│detail_page │ │  │
│  └───────────────────┘    │  │(图片)   │ │(回调创建)  │ │  │
│                           │  └─────────┘ └────────────┘ │  │
│                           └──────────────────────────────┘  │
│                                                             │
│  ┌───────────────────┐    ┌──────────────────────────────┐  │
│  │  ui_theme.h       │    │  ui_back_button              │  │
│  │  (颜色/字体/尺寸)  │    │  (返回按钮组件)               │  │
│  └───────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐    ┌──────────────────────┐
│  service 层      │    │  LVGL 8.x            │
│  time_service    │    │  (渲染、事件、输入)    │
│  weather_service │    └──────────────────────┘
│  system_status   │
│  wifi_service    │
└─────────────────┘
```

### 3.2 导航模型

UI 使用 LVGL 的 `lv_tileview` 作为顶层导航容器，每个功能页面对应一个 **tile**。用户水平滑动切换 tile。

```
  ← 滑动 →
┌────────┬────────┬────────┬────────┬────────┬────────┐
│  HOME  │ PLAN   │ AI_QA  │ TIMING │ CALEND │ SETTING│
│  (0)   │ (1)    │ (2)    │ (3)    │ (4)    │ (5)    │
└────────┴────────┴────────┴────────┴────────┴────────┘
```

除 Home 页面外，其他页面点击菜单图片后进入 **detail page**（覆盖在 tile 上），此时水平滑动被禁用，点击返回按钮回到菜单页。

### 3.3 页面生命周期

```
  ┌──────────┐
  │  create  │  ← ui_manager_create_root() 时一次性创建所有 tile
  └────┬─────┘
       │
       ▼
  ┌──────────┐
  │  active  │  ← 用户滑动到该 tile 时
  └────┬─────┘
       │
       ├── 点击菜单图片 → 进入 detail page（禁用滑动）
       │                    │
       │                    ├── detail_create_cb() 回调创建页面
       │                    │
       │                    └── 点击返回 → show_menu() 销毁 detail，恢复滑动
       │
       └── 滑动离开 → tile 失焦（home 定时器暂停）
```

---

## 四、各模块详细说明

### 4.1 ui_manager — UI 管理器

**职责：**
- 创建 root screen 和 tileview
- 注册所有屏幕页面到 tile
- 处理 tile 切换事件
- 管理 Home 页面刷新定时器的启动/暂停
- 提供页面跳转 API（`ui_manager_show_xxx_screen()`）
- 提供 tile 滑动方向控制（`ui_manager_set_tile_swipe_enabled()`）

**关键实现细节：**

```c
// 屏幕配置表（ui_manager.c 内部）
static const ui_screen_config_t g_ui_manager_screens[UI_SCREEN_ID_COUNT] = {
    [UI_SCREEN_ID_HOME]      = { .name = "home",      .image_path = NULL,              .create = ... },
    [UI_SCREEN_ID_PLAN_LIST] = { .name = "plan_list",  .image_path = "F:/jihuaqingdan.png", .create = ... },
    [UI_SCREEN_ID_AI_QA]     = { .name = "ai_qa",     .image_path = "F:/aiduihua.png",     .create = ... },
    // ... 共 6 个页面
};
```

**tile 切换时的自动行为：**
1. 恢复水平滑动方向（安全保护）
2. 切换到 Home → 恢复 `home_refresh_timer`
3. 切换到其他页面 → 暂停 `home_refresh_timer`

### 4.2 ui_theme — 主题系统

纯头文件，只包含 `#define` 常量，**无运行时开销**。

| 分类 | 常量数量 | 示例 |
|------|----------|------|
| 颜色 | 16 个 | `UI_COLOR_PRIMARY` (0xffd54a) |
| 字体 | 8 个 | `UI_FONT_TITLE` (&lv_font_montserrat_20) |
| 尺寸 | 5 个 | `UI_HEADER_HEIGHT` (35) |

### 4.3 ui_menu_detail_page — 菜单→详情导航框架

**解决的问题：** 5 个页面（AI QA、Timing、Calendar、Plan List、Settings）都有完全相同的菜单→详情切换逻辑，原来每个页面重复实现 50-80 行样板代码。

**核心数据结构：**
```c
typedef struct {
    lv_obj_t *screen;                    // tile 容器（不可销毁）
    lv_obj_t *menu_page;                 // 菜单页面（带图片，可隐藏/显示）
    lv_obj_t *detail_page;               // 详情页面（可创建/销毁）
    ui_detail_create_cb_t detail_create_cb;   // 详情创建回调
    ui_detail_destroy_cb_t detail_destroy_cb; // 详情销毁回调
    void *user_data;                     // 传递给回调的用户数据
    ui_menu_view_action_t menu_action;   // 存储在结构体内（避免悬空指针）
    bool detail_created;
} ui_menu_detail_page_t;
```

**⚠️ 关键约束（二次开发时必须遵守）：**

1. `detail_create_cb` 回调内必须：
   - 在 `parent`（即 `ctx->screen` = tile）上创建 `page = lv_obj_create(parent)`
   - 创建完成后设置 `ctx->detail_page = page`
   - 否则 `show_detail()` 会因为 `detail_page == NULL` 而返回，导致页面不显示

2. `menu_action` 必须存储在结构体内（不能是局部变量），因为 `ui_menu_view_create` 只保存了指针引用。

### 4.4 ui_back_button — 返回按钮组件

```c
lv_obj_t *ui_back_button_create(lv_obj_t *parent, lv_event_cb_t click_cb);
```

创建一个 30×30 圆形透明按钮，带 `LV_SYMBOL_LEFT` 图标。被以下模块使用：
- `ui_menu_detail_page_create_detail_header()` — 通用标题栏
- `settings_common_styles.c` — 设置页面标题栏

### 4.5 home — 主页模块

**组成：** `home_view.c`（UI 布局） + `home_refresh.c`（数据刷新）

**home_view 暴露的接口：**
```c
void ui_home_view_create(lv_obj_t *parent);
void ui_home_view_set_time(int hour, int minute);
void ui_home_view_set_date(int weekday, int year, int month, int day);
void ui_home_view_set_weather(int temperature, const char *weather_text);
void ui_home_view_set_wifi(int connected, int level);
void ui_home_view_set_battery(int percent, int charging);
void ui_home_view_refresh(const ui_home_view_model_t *view_model);
```

**home_refresh 的刷新策略：**

| 周期 | 操作 |
|------|------|
| 每 1 秒 | 刷新时间显示 |
| 每 10 秒 | 刷新 WiFi + 电量状态 |
| 每 60 秒 | 刷新日期 + 天气显示 |
| 每 1800 秒 | 调用 `weather_service_refresh()` 重新请求天气 API |

**优化点：** `home_refresh_timer` 在用户滑离 Home 页面时自动暂停，返回时恢复。

### 4.6 menu — 菜单视图

```c
void ui_menu_view_create(lv_obj_t *parent, const char *image_path, const ui_menu_view_action_t *view_action);
```

**行为：**
1. 如果 `image_path` 指向的文件存在 → 显示图片（`lv_img`）
2. 如果文件不存在 → 显示 `LV_SYMBOL_IMAGE` 占位符图标
3. 如果 `view_action` 有回调 → 图片可点击，点击触发回调

**注意：** 图片路径格式为 `"F:/xxx.png"`，其中 `F:` 对应设备 Flash 存储的文件系统挂载点。

### 4.7 settings — 设置模块（最复杂的子系统）

Settings 使用**三级导航结构**：

```
┌─────────────┐     点击图片      ┌─────────────┐     点击设置项     ┌─────────────┐
│  menu_page  │ ────────────────→ │ detail_page │ ────────────────→ │  sub_page   │
│  (菜单图片)  │                   │ (11项设置列表)│                   │ (具体设置界面)│
└─────────────┘ ←──────────────── └─────────────┘ ←──────────────── └─────────────┘
                    返回按钮                           返回按钮
```

**11 个设置项：**

| ID | 名称 | 子页面 |
|----|------|--------|
| 0 | Wi-Fi | ✅ 已实现（`setting_wifi/`） |
| 1 | Bluetooth | ❌ NULL（未实现） |
| 2 | Brightness | ✅ 已实现（`setting_brightness/`） |
| 3 | Sleep Timer | ❌ NULL |
| 4 | Baidu Netdisk | ❌ NULL |
| 5 | Volume | ❌ NULL |
| 6 | Do Not Disturb | ❌ NULL |
| 7 | Night Screen Off | ❌ NULL |
| 8 | WeChat Binding | ❌ NULL |
| 9 | System Update | ❌ NULL |
| 10 | Factory Reset | ❌ NULL |

**⚠️ 注意：** `settings_manager` 内部管理了 sub_page 的创建/销毁，与 `ui_menu_detail_page` 框架独立。back_event_cb 由 `settings_screen.c` 提供，用于从 detail 返回到 menu。

### 4.8 WiFi 设置子页面（setting_wifi）

这是设置模块中最复杂的子页面，包含：
- WiFi 扫描（定时器驱动，300ms 周期）
- AP 列表展示（信号强度、SSID、加密状态、连接状态）
- 密码输入页面（textarea + keyboard）
- 自动排序（已连接 AP 优先，然后按信号强度）

**⚠️ 注意：** WiFi 子页面使用 `malloc` 分配 SSID 副本（`ssid_copy = malloc(MAX_SSID_LEN)`），需要在事件回调中 `free`。

---

## 五、数据流与刷新机制

### 5.1 数据流向

```
┌──────────────────────┐
│     service 层        │
│  ┌────────────────┐  │
│  │ time_service    │──┼──→ home_view_set_time()
│  │ weather_service │──┼──→ home_view_set_weather()
│  │ system_status   │──┼──→ home_view_set_wifi()
│  │                 │──┼──→ home_view_set_battery()
│  └────────────────┘  │
└──────────────────────┘
```

Home 页面是**唯一**有定时刷新的页面。其他页面的数据在创建时获取一次，后续更新依赖用户交互（如 WiFi 扫描定时器）。

### 5.2 事件流

```
用户触摸事件
    │
    ▼
LVGL 输入设备驱动（触摸屏）
    │
    ▼
lv_tileview 事件处理
    │
    ├── 滑动 → LV_EVENT_VALUE_CHANGED → ui_manager_handle_tile_change()
    │
    └── 点击 → LV_EVENT_CLICKED
                │
                ├── menu_view: ui_menu_view_handle_click()
                │       → ui_menu_detail_page_show_detail()
                │           → detail_create_cb() [首次]
                │           → 禁用滑动 + 隐藏 menu + 显示 detail
                │
                └── back_button: xxx_on_back_click()
                        → ui_menu_detail_page_show_menu()
                            → lv_obj_del(detail_page)
                            → 启用滑动 + 显示 menu
```

---

## 六、公共 API 参考

### 6.1 ui_manager.h

```c
void ui_manager_init(void);                           // 初始化 UI（首次调用）
void ui_manager_go_back(void);                        // 返回 Home
const char *ui_manager_get_menu_image_path(ui_screen_id_t screen_id);  // 获取菜单图片路径

// 页面跳转
void ui_manager_show_home_screen(void);
void ui_manager_show_plan_list_screen(void);
void ui_manager_show_ai_qa_screen(void);
void ui_manager_show_timing_screen(void);
void ui_manager_show_calendar_screen(void);
void ui_manager_show_settings_screen(void);

// 滑动控制
void ui_manager_set_tile_swipe_enabled(bool enabled);
```

### 6.2 ui_menu_detail_page.h

```c
void ui_menu_detail_page_init(
    ui_menu_detail_page_t *ctx,
    lv_obj_t *screen,
    uint32_t bg_color,
    const char *menu_image_path,
    ui_detail_create_cb_t detail_create_cb,
    ui_detail_destroy_cb_t detail_destroy_cb,
    void *user_data
);

void ui_menu_detail_page_show_menu(ui_menu_detail_page_t *ctx);
void ui_menu_detail_page_show_detail(ui_menu_detail_page_t *ctx);

lv_obj_t *ui_menu_detail_page_create_detail_header(
    lv_obj_t *parent,
    const char *title,
    lv_event_cb_t back_click_cb
);
```

### 6.3 ui_back_button.h

```c
lv_obj_t *ui_back_button_create(lv_obj_t *parent, lv_event_cb_t click_cb);
```

### 6.4 home_view.h

```c
typedef struct {
    int year, hour, minute, weekday, month, day;
    int temperature;
    const char *weather_text;
    int wifi_connected, wifi_level;
    int battery_percent, battery_charging;
} ui_home_view_model_t;

void ui_home_view_create(lv_obj_t *parent);
void ui_home_view_set_time(int hour, int minute);
void ui_home_view_set_date(int weekday, int year, int month, int day);
void ui_home_view_set_weather(int temperature, const char *weather_text);
void ui_home_view_set_wifi(int connected, int level);
void ui_home_view_set_battery(int percent, int charging);
void ui_home_view_refresh(const ui_home_view_model_t *view_model);
```

### 6.5 ui_screen_ids.h

```c
typedef enum {
    UI_SCREEN_ID_NONE = -1,
    UI_SCREEN_ID_HOME = 0,
    UI_SCREEN_ID_PLAN_LIST,
    UI_SCREEN_ID_AI_QA,
    UI_SCREEN_ID_TIMING,
    UI_SCREEN_ID_CALENDAR,
    UI_SCREEN_ID_SETTINGS,
    UI_SCREEN_ID_COUNT       // = 6
} ui_screen_id_t;
```

---

## 七、添加新页面的步骤

### 步骤 1：创建文件

```
project/ui/my_feature/
├── my_feature_screen.h
└── my_feature_screen.c
```

### 步骤 2：实现代码（模板）

```c
/* my_feature_screen.h */
#ifndef UI_MY_FEATURE_SCREEN_H
#define UI_MY_FEATURE_SCREEN_H
#include "lvgl/lvgl.h"
void ui_my_feature_screen_create(lv_obj_t *screen);
#endif

/* my_feature_screen.c */
#include "my_feature_screen.h"
#include "../ui_manager.h"
#include "../ui_menu_detail_page.h"
#include "../ui_theme.h"

typedef struct {
    ui_menu_detail_page_t base;
    /* 你的页面状态 */
} ui_my_feature_state_t;

static ui_my_feature_state_t g_ui;

static void on_back(lv_event_t *e) {
    (void)e;
    ui_menu_detail_page_show_menu(&g_ui.base);
}

static void create_detail(lv_obj_t *parent, void *ud) {
    (void)ud;
    lv_obj_t *page = lv_obj_create(parent);
    lv_obj_remove_style_all(page);
    lv_obj_set_size(page, LV_PCT(100), LV_PCT(100));
    lv_obj_center(page);
    lv_obj_set_style_bg_color(page, lv_color_hex(UI_COLOR_BG_DETAIL), 0);
    lv_obj_set_style_bg_opa(page, LV_OPA_COVER, 0);
    lv_obj_clear_flag(page, LV_OBJ_FLAG_SCROLLABLE);

    g_ui.base.detail_page = page;  /* ⚠️ 必须设置 */

    ui_menu_detail_page_create_detail_header(page, "My Feature", on_back);
    /* 在 page 上创建你的内容 */
}

void ui_my_feature_screen_create(lv_obj_t *screen) {
    ui_menu_detail_page_init(&g_ui.base, screen, UI_COLOR_BG_DETAIL,
        ui_manager_get_menu_image_path(UI_SCREEN_ID_MY_FEATURE),
        create_detail, NULL, NULL);
}
```

### 步骤 3：注册到 ui_manager

1. **`ui_screen_ids.h`** — 在 `UI_SCREEN_ID_SETTINGS` 后添加 `UI_SCREEN_ID_MY_FEATURE`

2. **`ui_manager.c`** — 添加：
   ```c
   #include "my_feature/my_feature_screen.h"
   static void ui_manager_create_my_feature_screen(lv_obj_t *screen) {
       ui_my_feature_screen_create(screen);
   }
   // 在 g_ui_manager_screens 数组中添加：
   [UI_SCREEN_ID_MY_FEATURE] = {
       .name = "my_feature",
       .image_path = "F:/myicon.png",
       .create = ui_manager_create_my_feature_screen
   },
   ```

3. **`ui_manager.h`** — 添加 `void ui_manager_show_my_feature_screen(void);`

4. **`txw82xApp.cdkproj`** — 在 `<VirtualFolder Name="ui">` 下添加新 .c 文件引用

### 步骤 4：准备菜单图片

将 240×240 或适当尺寸的 PNG 图片放入设备 Flash，路径与 `image_path` 一致（如 `"F:/myicon.png"`）。

---

## 八、依赖关系

### 8.1 头文件依赖图

```
ui_theme.h ◄─────────────────────────────────────────────────────┐
    ▲                                                             │
    │ (所有文件都 include)                                         │
    │                                                             │
ui_back_button.h ◄── ui_menu_detail_page.h ◄── 各 screen.c       │
    ▲                   ▲                                        │
    │                   │                                        │
    │         menu/menu_view.h ◄──────────────────────────────────┘
    │
    └── settings_common_styles.h ◄── settings 子模块
```

### 8.2 service 层依赖

| UI 模块 | 依赖的 service | 调用的函数 |
|---------|---------------|-----------|
| home_refresh | `time_service` | `time_service_get_datetime()` |
| home_refresh | `weather_service` | `weather_service_get_data()`, `weather_service_refresh()` |
| home_refresh | `system_status_service` | `system_status_service_get_data()` |
| calendar_screen | `time_service` | `time_service_get_datetime()` |
| plan_list_screen | `time_service` | `time_service_get_datetime()` |
| setting_wifi | `wifi_service` | `wifi_service_init()`, `wifi_service_scan()`, `wifi_service_connect()` 等 |

### 8.3 LVGL 组件使用统计

| LVGL 组件 | 使用页面 |
|-----------|----------|
| `lv_obj` | 所有页面（通用容器） |
| `lv_label` | 所有页面（文本显示） |
| `lv_btn` | timing, plan_list, calendar, settings |
| `lv_img` | menu（菜单图片） |
| `lv_slider` | brightness（亮度调节） |
| `lv_textarea` | wifi（密码输入） |
| `lv_keyboard` | wifi（密码输入） |
| `lv_calendar` | calendar（月历） |
| `lv_roller` | calendar（年月选择器） |
| `lv_tileview` | ui_manager（顶层导航） |

---

## 九、已知限制与注意事项

### 9.1 内存限制

- 所有 6 个 tile 在 `ui_manager_create_root()` 时**一次性全部创建**，不支持懒加载
- 每个 tile 创建后即使不可见也占用 LVGL 内存
- `ui_home_create_flower()` 创建 11 个 LVGL 对象绘制一朵花，可优化为 Canvas 或图片

### 9.2 图片资源

- 菜单图片存储在设备 Flash（路径 `F:/xxx.png`）
- 图片不存在时显示占位图标（`LV_SYMBOL_IMAGE`）
- 需要确保 `menu_view.c` 中 `lv_fs_open` 的文件系统驱动已正确注册

### 9.3 WiFi 子页面

- 使用 `malloc/free` 管理 SSID 字符串副本
- WiFi 扫描定时器有 9 秒超时限制（300ms × 30 次）
- 密码输入要求最少 8 字符

### 9.4 Settings 三级导航

- Settings 的 `detail_page` 由 `settings_manager` 内部管理，与 `ui_menu_detail_page` 框架的 `detail_page` 概念不同
- `settings_manager` 内部还有 `sub_page` 层级
- 添加新设置项需要修改 `settings_manager.c` 中的 `g_ui_settings_page_configs` 数组

### 9.5 字体

- 使用 LVGL 内置的 Montserrat 字体（10/12/14/16/18/20/22/48）
- 仅支持英文 + 数字 + 特殊符号
- 不支持中文显示（如需中文，需添加自定义字库）

### 9.6 硬编码的文件路径

所有图片路径硬编码为 `"F:/xxx.png"`，如需修改文件系统挂载点，需全局替换 `ui_manager.c` 中的 `image_path` 字段。

---

## 十、编译与调试

### 10.1 编译

使用 CDK IDE 打开 `project/txw82xApp.cdkproj`，确保所有新增的 `.c` 文件已添加到工程的 `ui` 虚拟文件夹中。

### 10.2 添加新文件到工程

在 `txw82xApp.cdkproj` 的 `<VirtualFolder Name="ui">` 下添加：
```xml
<File Name="ui/my_feature/my_feature_screen.c">
  <FileOption/>
</File>
```

### 10.3 调试技巧

1. **查看 LVGL 对象数量：** 在调试器中查看 `lv_obj_count` 确认对象是否正确销毁
2. **检查 tile 切换：** 在 `ui_manager_handle_tile_change` 中设断点，确认 `screen_id` 正确
3. **WiFi 调试：** `menu_view.c` 中的文件存在检查可临时恢复 `printf` 语句
4. **内存不足：** 如果页面创建失败，检查 `lv_mem_monitor` 确认可用内存

### 10.4 常见问题排查

| 现象 | 可能原因 | 排查方法 |
|------|----------|----------|
| 页面不显示 | `detail_page` 未设置 | 检查 callback 中是否有 `g_xxx.base.detail_page = page` |
| 无法滑动 | swipe 被禁用未恢复 | 检查 `show_menu` 是否正确调用 |
| 进入详情死机 | 对象创建过多 | 检查 LVGL 对象数量限制 |
| 菜单图片不显示 | Flash 文件不存在 | 检查 `F:/` 下的图片文件 |
| 中文乱码 | 字体不支持中文 | 需要添加中文字库 |

---

## 附录：文件变更记录

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-05-09 | 新增 `ui_theme.h` | 统一主题系统 |
| 2026-05-09 | 新增 `ui_back_button.h/.c` | 可复用返回按钮 |
| 2026-05-09 | 新增 `ui_menu_detail_page.h/.c` | 菜单→详情导航框架 |
| 2026-05-09 | 重构 5 个 screen 文件 | 使用新框架消除样板代码 |
| 2026-05-09 | 修复 home_view.c | 花朵位置 bug |
| 2026-05-09 | 优化 ui_manager.c | Home 定时器按需暂停 |
| 2026-05-09 | 清理 menu_view.c | 移除 debug printf |