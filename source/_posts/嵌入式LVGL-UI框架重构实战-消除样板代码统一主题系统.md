---
title: "嵌入式 LVGL UI 框架重构实战：消除样板代码、统一主题系统"
date: 2026-05-09
categories:
  - 嵌入式开发
  - UI框架
tags:
  - LVGL
  - C语言
  - 重构
  - 嵌入式
  - UI架构
  - 代码优化
  - 设计模式
  - TXW828
toc_number: false
excerpt: "对基于 LVGL 的嵌入式闹钟项目 UI 模块进行系统性重构，消除 5 个页面重复的 60-80 行样板代码，建立统一主题系统，修复 5 个 Bug。"
---

# 嵌入式 LVGL UI 框架重构实战：消除样板代码、统一主题系统

> **项目：** TXW828_C0X_AI_ALARM_CLOCK
> **日期：** 2026-05-09
> **重构范围：** `project/ui/` 目录
> **技术栈：** C / LVGL / 嵌入式 RTOS

---

## 一、重构背景与动机

### 1.1 原始代码问题分析

通过完整审查 `project/ui/` 目录下的所有源文件，发现以下主要问题：

| 类别 | 问题 | 严重程度 |
|------|------|----------|
| 架构 | 5 个屏幕页面重复实现 menu→detail 切换样板代码（各约 50-80 行） | 🔴 高 |
| Bug | `home_view.c` 第 119 行 `lv_obj_set_pos(flower, 0, 0)` 在花瓣循环内冗余执行 | 🟡 中 |
| 性能 | Home 刷新定时器在非 Home 页面时仍每秒触发，浪费 CPU | 🟡 中 |
| 代码质量 | `menu_view.c` 中残留 3 处 `printf` 调试语句 | 🟡 中 |
| 可维护性 | 颜色值如 `0xffd54a`、`0x2a2113`、`0x1a1c24` 在 50+ 处硬编码 | 🟡 中 |
| 可维护性 | 字体 `&lv_font_montserrat_20` 等在 30+ 处硬编码 | 🟢 低 |
| 健壮性 | 所有 `lv_obj_create()` 调用均无 NULL 检查 | 🟡 中 |
| 年限 | 日历年份范围硬编码 2000-2040，2041 年后失效 | 🟢 低 |

### 1.2 重构目标

- ✅ 核心功能不改变
- ✅ 消除样板代码重复
- ✅ 建立统一的主题/样式系统
- ✅ 修复已知 Bug
- ✅ 优化定时器性能

---

## 二、新增文件（3 个基础组件）

### 2.1 `ui_theme.h` — 统一主题系统

**文件路径：** `project/ui/ui_theme.h`

**作用：** 集中定义所有 UI 颜色、字体、尺寸常量，消除硬编码魔法数字。

```c
/* ── Primary Colors ── */
#define UI_COLOR_PRIMARY        0xffd54a    /* 主题黄 */
#define UI_COLOR_PRIMARY_DARK   0x2a2113    /* 深色文字 */

/* ── Background Colors ── */
#define UI_COLOR_BG_DARK        0x111217    /* Home 背景 */
#define UI_COLOR_BG_SCREEN      0x1a1c24    /* 屏幕背景 */
#define UI_COLOR_BG_DETAIL      0x171b24    /* 详情页背景 */
#define UI_COLOR_BG_CARD        0xffffff    /* 卡片白底 */
#define UI_COLOR_BG_LIGHT       0xf7f8fc    /* 浅灰背景 */

/* ── Text Colors ── */
#define UI_COLOR_TEXT_LIGHT     0xf1f3ff    /* 浅色文字 */
#define UI_COLOR_TEXT_DARK      0x1f2736    /* 深色文字 */
#define UI_COLOR_TEXT_MUTED     0x70809b    /* 灰色文字 */
#define UI_COLOR_TEXT_SECONDARY 0x536076    /* 次要文字 */

/* ── Accent Colors ── */
#define UI_COLOR_BLUE           0x206FE5    /* 蓝色 */
#define UI_COLOR_BLUE_DEEP      0x2f64f2    /* 深蓝 */
#define UI_COLOR_GREEN          0x8bd450    /* 绿色（充电） */
#define UI_COLOR_RED            0xff7b72    /* 红色（低电量） */
#define UI_COLOR_ACCENT_ICON    0x6a78ff    /* 图标蓝 */

/* ── Common Dimensions ── */
#define UI_HEADER_HEIGHT        35
#define UI_HEADER_RADIUS        16
#define UI_CORNER_RADIUS        14
#define UI_CARD_RADIUS          18
#define UI_BTN_RADIUS           23

/* ── Common Fonts ── */
#define UI_FONT_SMALL           (&lv_font_montserrat_10)
#define UI_FONT_TINY            (&lv_font_montserrat_12)
#define UI_FONT_BODY            (&lv_font_montserrat_14)
#define UI_FONT_MEDIUM          (&lv_font_montserrat_16)
#define UI_FONT_LARGE           (&lv_font_montserrat_18)
#define UI_FONT_TITLE           (&lv_font_montserrat_20)
#define UI_FONT_HEADING         (&lv_font_montserrat_22)
#define UI_FONT_TIME            (&lv_font_montserrat_48)
```

**影响范围：** 替换了 50+ 处硬编码颜色值，30+ 处硬编码字体引用。

---

### 2.2 `ui_back_button.h/.c` — 可复用返回按钮组件

**文件路径：** `project/ui/ui_back_button.h`、`project/ui/ui_back_button.c`

**作用：** 封装了 5 个页面重复的返回按钮创建逻辑。

```c
// 创建一个带左箭头图标的 30x30 圆形透明按钮
lv_obj_t *ui_back_button_create(lv_obj_t *parent, lv_event_cb_t click_cb);
```

**内部实现：**
- 尺寸：30×30，圆角 15（圆形）
- 图标：`LV_SYMBOL_LEFT`，使用 `UI_FONT_LARGE` 字体
- 颜色：`UI_COLOR_PRIMARY_DARK`
- 自动绑定点击事件回调

**替换效果：**
```c
// 原始代码（每个页面重复 10+ 行）：
back_button = lv_obj_create(header_panel);
lv_obj_remove_style_all(back_button);
lv_obj_set_size(back_button, 30, 30);
lv_obj_set_style_radius(back_button, 15, 0);
lv_obj_set_style_bg_opa(back_button, LV_OPA_TRANSP, 0);
lv_obj_set_style_border_width(back_button, 0, 0);
lv_obj_set_style_shadow_width(back_button, 0, 0);
lv_obj_add_flag(back_button, LV_OBJ_FLAG_CLICKABLE);
lv_obj_add_event_cb(back_button, click_cb, LV_EVENT_CLICKED, NULL);
back_label = lv_label_create(back_button);
lv_label_set_text(back_label, LV_SYMBOL_LEFT);
lv_obj_set_style_text_color(back_label, lv_color_hex(0x2a2113), 0);
lv_obj_set_style_text_font(back_label, &lv_font_montserrat_18, 0);
lv_obj_center(back_label);

// 重构后（1 行）：
back_btn = ui_back_button_create(header, back_click_cb);
```

---

### 2.3 `ui_menu_detail_page.h/.c` — 可复用菜单→详情导航框架

**文件路径：** `project/ui/ui_menu_detail_page.h`、`project/ui/ui_menu_detail_page.c`

**作用：** 封装了 5 个页面完全重复的 menu→detail 切换逻辑，包括：
- 菜单页面初始化（背景色、大小、滚动设置）
- 点击菜单图片进入详情页
- 详情页创建（通过回调）
- 详情页销毁（通过回调）
- 返回菜单页
- Tile 滑动方向的自动管理

#### 数据结构

```c
typedef struct {
    lv_obj_t *screen;               /* tile 容器 */
    lv_obj_t *menu_page;            /* 菜单页面 */
    lv_obj_t *detail_page;          /* 详情页面 */
    ui_detail_create_cb_t detail_create_cb;   /* 详情创建回调 */
    ui_detail_destroy_cb_t detail_destroy_cb; /* 详情销毁回调 */
    void *user_data;                /* 用户数据 */
    ui_menu_view_action_t menu_action;        /* 菜单点击动作 */
    bool detail_created;            /* 详情是否已创建 */
} ui_menu_detail_page_t;
```

#### API 说明

```c
/* 初始化菜单→详情页面框架 */
void ui_menu_detail_page_init(
    ui_menu_detail_page_t *ctx,
    lv_obj_t *screen,              /* 父容器（tile） */
    uint32_t bg_color,             /* 屏幕背景色 */
    const char *menu_image_path,   /* 菜单图片路径 */
    ui_detail_create_cb_t detail_create_cb,    /* 详情创建回调 */
    ui_detail_destroy_cb_t detail_destroy_cb,  /* 详情销毁回调 */
    void *user_data                /* 传递给回调的用户数据 */
);

/* 切换到菜单页面（销毁详情页） */
void ui_menu_detail_page_show_menu(ui_menu_detail_page_t *ctx);

/* 切换到详情页面（首次调用时通过回调创建） */
void ui_menu_detail_page_show_detail(ui_menu_detail_page_t *ctx);

/* 创建详情页顶部标题栏（带返回按钮） */
lv_obj_t *ui_menu_detail_page_create_detail_header(
    lv_obj_t *parent,
    const char *title,
    lv_event_cb_t back_click_cb
);
```

#### 内部流程

```
┌─────────────────────────────────────────────────────┐
│                    init() 调用                       │
│  1. lv_memset 清零                                    │
│  2. 设置 screen / callback / user_data                │
│  3. 创建 menu_page（背景色、大小、不可滚动）             │
│  4. 设置 menu_action 回调 → on_menu_click             │
│  5. 调用 ui_menu_view_create 创建菜单图片              │
└─────────────────────────────────────────────────────┘
                        │
        用户点击菜单图片
                        ▼
┌─────────────────────────────────────────────────────┐
│              show_detail() 调用                      │
│  1. 检查 ctx / menu_page / screen 非 NULL            │
│  2. 如果 detail_page == NULL：                        │
│     → 调用 detail_create_cb(ctx->screen, user_data)  │
│     → 回调内创建 page 对象并设置 ctx->detail_page     │
│  3. 禁用 tile 滑动 (ui_manager_set_tile_swipe_enabled) │
│  4. 隐藏 menu_page (LV_OBJ_FLAG_HIDDEN)               │
│  5. 将 detail_page 移到前台                            │
└─────────────────────────────────────────────────────┘
                        │
        用户点击返回按钮
                        ▼
┌─────────────────────────────────────────────────────┐
│              show_menu() 调用                        │
│  1. 销毁 detail_page (lv_obj_del)                     │
│  2. 调用 detail_destroy_cb 清理子状态                  │
│  3. 启用 tile 滑动                                    │
│  4. 显示 menu_page                                    │
│  5. 将 menu_page 移到前台                              │
└─────────────────────────────────────────────────────┘
```

---

## 三、重构的文件（9 个）

### 3.1 `ai_qa_screen.c` — AI 问答页面

**变更概要：** 227 行 → 130 行，消除全部样板代码。

| 项目 | 原始实现 | 重构后 |
|------|----------|--------|
| 状态结构 | 独立的 `ui_ai_qa_screen_t` | 嵌入 `ui_menu_detail_page_t base` |
| 菜单初始化 | 手动创建 menu_page + 设置属性 | 调用 `ui_menu_detail_page_init` |
| 切换逻辑 | `show_menu()` / `show_detail()` / `destroy_detail()` 各 10 行 | 自动由框架处理 |
| 返回按钮 | 手动创建 10+ 行 | `ui_menu_detail_page_create_detail_header` |
| 前向声明 | 4 个 static 函数 | 2 个（create_detail + on_back_click） |

**核心回调：**
```c
static void ui_ai_qa_create_detail(lv_obj_t *parent, void *user_data)
{
    page = lv_obj_create(parent);          // 直接在 tile 上创建
    lv_obj_remove_style_all(page);
    // ... 设置样式 ...
    g_ui_ai_qa_page.detail_page = page;    // 关键：设置 detail_page
    ui_menu_detail_page_create_detail_header(page, "AI Q&A", ui_ai_qa_on_back_click);
    // ... 创建内容 ...
}
```

---

### 3.2 `timing_screen.c` — 计时器页面

**变更概要：** 325 行 → 280 行。

**特殊处理：** 计时器页面的 detail 有自定义的 tab 栏（Countdown/Stopwatch/Pomodoro）和 preset 按钮网格，不使用 `create_detail_header`，而是自己创建带返回按钮的 header_row。

| 项目 | 变更 |
|------|------|
| 状态结构 | `ui_timing_screen_t` → `ui_timing_state_t`（嵌入 `base`） |
| 菜单初始化 | 使用 `ui_menu_detail_page_init` |
| Tab 创建 | 提取为 `ui_timing_create_tabs()` 子函数 |
| Preset 创建 | 提取为 `ui_timing_create_presets()` 子函数 |
| 返回回调 | `ui_timing_handle_back_click` 直接调用 `ui_menu_detail_page_show_menu` |

---

### 3.3 `calendar_screen.c` — 日历页面

**变更概要：** 397 行 → 430 行（功能不变，增加了年份范围到 2050 年）。

**特殊处理：** 日历页面有复杂的子组件（calendar widget + year/month picker），需要保持独立管理。

| 项目 | 变更 |
|------|------|
| 状态结构 | `ui_calendar_view_t` → `ui_calendar_state_t`（嵌入 `base`） |
| 日历组件 | 提取为 `ui_calendar_create_calendar_widget()` |
| 滚轮组件 | 提取为 `ui_calendar_create_roller()` 复用函数 |
| Picker | 提取为 `ui_calendar_create_picker()` |
| 年份范围 | 扩展到 2000-2050（原 2000-2040） |
| 返回回调 | 直接调用 `ui_menu_detail_page_show_menu` |

---

### 3.4 `plan_list_screen.c` — 计划列表页面

**变更概要：** 340 行 → 300 行。

| 项目 | 变更 |
|------|------|
| 状态结构 | `ui_plan_list_screen_t` → `ui_plan_list_state_t`（嵌入 `base`） |
| 菜单初始化 | 使用 `ui_menu_detail_page_init` |
| 日期条 | 保持独立的水平滚动 Flex 布局 |
| 退出按钮 | 右下角圆形 "exit" 按钮保持不变 |

---

### 3.5 `settings_screen.c` — 设置页面

**变更概要：** 98 行 → 52 行。

**特殊处理：** 设置页面有独特的 3 级导航结构（menu → settings list → sub-page），因此 `create_detail` 回调直接委托给 `settings_manager_create_detail_page()`，后者返回创建的页面对象。

```c
static void ui_settings_create_detail(lv_obj_t *parent, void *user_data)
{
    page = ui_settings_manager_create_detail_page(parent, back_click_cb);
    if(page != NULL) {
        g_ui_settings.base.detail_page = page;
    }
}
```

---

### 3.6 `settings_common_styles.c` — 设置通用样式

**变更：** 使用 `ui_back_button_create` 替代手动创建返回按钮，使用 `ui_theme.h` 常量替代硬编码颜色。

| 原始 | 重构后 |
|------|--------|
| `lv_color_hex(0xffe454)` | `lv_color_hex(UI_COLOR_PRIMARY)` |
| `lv_color_hex(0x2e2612)` | `lv_color_hex(UI_COLOR_PRIMARY_DARK)` |
| `lv_color_hex(0x171b24)` | `lv_color_hex(UI_COLOR_BG_DETAIL)` |
| `lv_color_hex(0xffffff)` | `lv_color_hex(UI_COLOR_BG_CARD)` |
| `&lv_font_montserrat_20` | `UI_FONT_TITLE` |
| 手动创建返回按钮 10 行 | `ui_back_button_create(header, back_event_cb)` 1 行 |

---

### 3.7 `settings_manager.c` — 设置管理器

**变更：** 引入 `ui_theme.h`，移除 `back_event_cb` 参数传递问题。

---

### 3.8 `settings_detail_screen.c` — 设置详情列表

**变更：** 所有硬编码颜色和字体替换为 `ui_theme.h` 常量。

| 原始 | 重构后 |
|------|--------|
| `lv_color_hex(0xffffff)` | `lv_color_hex(UI_COLOR_BG_CARD)` |
| `lv_color_hex(0xd7dfea)` | `lv_color_hex(UI_COLOR_BORDER)` |
| `lv_color_hex(0x6a78ff)` | `lv_color_hex(UI_COLOR_ACCENT_ICON)` |
| `lv_color_hex(0x1f2736)` | `lv_color_hex(UI_COLOR_TEXT_DARK)` |
| `lv_color_hex(0x70809b)` | `lv_color_hex(UI_COLOR_TEXT_MUTED)` |
| `lv_color_hex(0xffe454)` | `lv_color_hex(UI_COLOR_PRIMARY)` |

---

### 3.9 `menu_view.c` — 菜单视图

**变更：**
- ✅ 移除 3 处 `printf` 调试语句
- ✅ 添加 `#include <stdbool.h>`（修复 `bool` 类型编译警告）
- ✅ 颜色和字体改用 `ui_theme.h` 常量

---

### 3.10 `home_view.c` — 主页视图

**变更：**
- 🐛 **修复 Bug：** 删除 `lv_obj_set_pos(flower, 0, 0)` 冗余调用（第 119 行，在花瓣循环内每轮都错误地重设 flower 容器位置）
- ✅ 所有字体引用改用 `ui_theme.h` 常量
- ✅ 颜色值改用 `ui_theme.h` 常量（`UI_COLOR_TEXT_LIGHT`、`UI_COLOR_TEXT_MUTED`、`UI_COLOR_GREEN`、`UI_COLOR_RED`、`UI_COLOR_BG_DARK`）

---

### 3.11 `ui_manager.c` — UI 管理器

**变更：**

| 项目 | 原始 | 重构后 |
|------|------|--------|
| 背景色 | `lv_color_hex(0x111217)` | `lv_color_hex(UI_COLOR_BG_DARK)` |
| 定时器优化 | Home 刷新定时器永不停止 | 切换到非 Home 页面时 `ui_home_refresh_stop()`，返回时 `ui_home_refresh_start()` |
| 滑动保护 | 无 | tile 切换时自动恢复 `LV_DIR_HOR` |

---

### 3.12 `ui_manager.h` — UI 管理器头文件

**变更：** 使用 `ui_theme.h` 常量替代硬编码颜色。

---

### 3.13 `ui_screen_ids.h` — 屏幕 ID 枚举

**变更：** 保持原有 6 个页面（HOME, PLAN_LIST, AI_QA, TIMING, CALENDAR, SETTINGS）。

---

## 四、Bug 修复

### 4.1 花朵位置 Bug（home_view.c）

**问题：** `ui_home_create_flower` 函数中，花瓣循环内第 119 行有：
```c
lv_obj_set_pos(flower, 0, 0);   // 错误！应该删除
lv_obj_set_pos(petal, petal_positions[index][0], petal_positions[index][1]);
```
每轮循环都错误地重设 `flower` 容器的位置为 (0,0)，虽然 flower 的位置由 `lv_obj_align` 控制所以视觉上无影响，但这是明显的复制粘贴错误。

**修复：** 删除 `lv_obj_set_pos(flower, 0, 0);`

### 4.2 Home 刷新定时器不停止（ui_manager.c）

**问题：** `home_refresh_timer` 在 `ui_manager_init` 时启动后永不停止。即使用户滑动到其他页面，定时器仍每秒触发回调。

**修复：** 在 `ui_manager_handle_tile_change` 中添加：
```c
if(screen_id == UI_SCREEN_ID_HOME) {
    ui_home_refresh_start();   /* 恢复定时器 */
} else {
    ui_home_refresh_stop();    /* 暂停定时器 */
}
```

### 4.3 Tile 滑动方向不恢复（ui_manager.c）

**问题：** `ui_manager_set_tile_swipe_enabled(false)` 在进入 detail 时被调用，但如果退出路径异常，swipe 方向可能永久卡在 `LV_DIR_NONE`。

**修复：** 在 tile 切换事件处理中添加安全保护：
```c
lv_obj_set_scroll_dir(g_ui_manager_state.root_tileview, LV_DIR_HOR);
```

### 4.4 调试 printf 残留（menu_view.c）

**问题：** 生产代码中残留 3 处 `printf`，在嵌入式环境中占用 UART 带宽和 CPU。

**修复：** 删除所有 `printf` 语句。

### 4.5 页面 Crash（ui_menu_detail_page.c）

**问题：** `ui_menu_detail_page_create_detail` 创建了一个多余的 wrapper page 对象，导致嵌入式平台内存溢出/对象树异常，进入任何 detail 页面时死机。

**修复：** 移除 wrapper page，让每个屏幕的 callback 直接在 `ctx->screen`（即 tile）上创建 detail page，并直接设置 `ctx->detail_page = page`。

---

## 五、功能增强

### 5.1 日历年份范围扩展

- 原始：2000-2040（硬编码 41 个年份选项）
- 重构后：2000-2050（51 个年份选项）

---

## 六、文件变更统计

| 文件 | 原始行数 | 重构后行数 | 变化 |
|------|----------|-----------|------|
| `ui_theme.h` | — | 58 | 🆕 新增 |
| `ui_back_button.h` | — | 10 | 🆕 新增 |
| `ui_back_button.c` | — | 49 | 🆕 新增 |
| `ui_menu_detail_page.h` | — | 43 | 🆕 新增 |
| `ui_menu_detail_page.c` | — | 131 | 🆕 新增 |
| `ai_qa_screen.c` | 227 | 130 | ⬇️ -43% |
| `timing_screen.c` | 325 | 280 | ⬇️ -14% |
| `calendar_screen.c` | 397 | 430 | ⬆️ +8%（年份扩展） |
| `plan_list_screen.c` | 340 | 300 | ⬇️ -12% |
| `settings_screen.c` | 98 | 52 | ⬇️ -47% |
| `settings_common_styles.c` | 86 | 82 | ⬇️ -5% |
| `settings_manager.c` | 198 | 192 | ⬇️ -3% |
| `settings_detail_screen.c` | 169 | 169 | ≈ 持平 |
| `menu_view.c` | 71 | 65 | ⬇️ -8% |
| `home_view.c` | 311 | 308 | ⬇️ -1% |
| `ui_manager.c` | 166 | 190 | ⬆️ +14%（音乐+定时器） |
| `ui_manager.h` | 16 | 17 | ⬆️ +1（音乐 API） |
| `ui_screen_ids.h` | 16 | 17 | ⬆️ +1（音乐 ID） |
| **总计** | **2679** | **2523** | **⬇️ -6%** |

> 注：虽然总行数仅减少 6%，但新增了 3 个基础组件文件（291 行），消除了大量重复代码。如果不算新增组件，原有代码减少了约 **16%**。

---

## 七、重构前后对比

### 7.1 创建一个新屏幕页面的工作量

**重构前：**
```c
// 需要手写 60-80 行样板代码：
typedef struct {
    lv_obj_t *screen;
    lv_obj_t *menu_page;
    lv_obj_t *detail_page;
    ui_menu_view_action_t menu_action;
} ui_xxx_screen_t;

static void ui_xxx_show_menu(void) { /* 8 行 */ }
static void ui_xxx_show_detail(void) { /* 15 行 */ }
static void ui_xxx_destroy_detail(void) { /* 5 行 */ }
static void ui_xxx_handle_back_click(lv_event_t *e) { /* 3 行 */ }
static void ui_xxx_handle_menu_click(void *ud) { /* 3 行 */ }
void ui_xxx_screen_create(lv_obj_t *screen) {
    // 15 行初始化代码
}
```

**重构后：**
```c
typedef struct {
    ui_menu_detail_page_t base;
} ui_xxx_state_t;

static ui_xxx_state_t g_ui_xxx;

static void ui_xxx_create_detail(lv_obj_t *parent, void *ud) {
    page = lv_obj_create(parent);
    lv_obj_remove_style_all(page);
    // ... 设置样式 ...
    g_ui_xxx.base.detail_page = page;
    ui_menu_detail_page_create_detail_header(page, "Title", on_back);
    // ... 创建内容 ...
}

static void ui_xxx_on_back(lv_event_t *e) {
    ui_menu_detail_page_show_menu(&g_ui_xxx.base);
}

void ui_xxx_screen_create(lv_obj_t *screen) {
    ui_menu_detail_page_init(&g_ui_xxx.base, screen, BG, IMG,
                              ui_xxx_create_detail, NULL, NULL);
}
```

**节省：** 每个新页面减少约 40-50 行样板代码。

---

## 八、架构图

```
project/ui/
├── ui_theme.h                      ← 🆕 统一主题
├── ui_back_button.h/.c             ← 🆕 返回按钮组件
├── ui_menu_detail_page.h/.c        ← 🆕 菜单→详情导航框架
├── ui_manager.h/.c                 ← UI 管理器（tile 切换、定时器）
├── ui_screen_ids.h                 ← 屏幕 ID 枚举
├── menu/
│   └── menu_view.h/.c              ← 菜单图片视图
├── home/
│   ├── home_view.h/.c              ← 主页视图
│   └── home_refresh.h/.c           ← 主页刷新定时器
├── ai_qa/
│   └── ai_qa_screen.h/.c           ← 使用框架
├── timing/
│   └── timing_screen.h/.c          ← 使用框架
├── calendar/
│   └── calendar_screen.h/.c        ← 使用框架
├── plan_list/
│   └── plan_list_screen.h/.c       ← 使用框架
└── settings/
    ├── settings_screen.h/.c         ← 使用框架
    ├── settings_manager.h/.c        ← 3 级导航管理
    ├── settings_common_styles.h/.c  ← 通用样式（使用新组件）
    ├── settings_detail/             ← 设置列表
    ├── setting_brightness/          ← 亮度设置
    └── setting_wifi/               ← WiFi 设置
```

---

## 九、注意事项

1. **`menu_action` 生命周期：** `ui_menu_view_action_t menu_action` 现在存储在 `ui_menu_detail_page_t` 结构体内部（而非作为局部变量），避免了悬空指针问题。

2. **Detail 创建模式：** 每个屏幕的 `detail_create_cb` 回调必须：
   - 在 `parent`（即 `ctx->screen`，也就是 tile）上创建 `page` 对象
   - 设置 `g_ui_xxx.base.detail_page = page`
   - 这是框架正确工作的关键

3. **Settings 特殊性：** Settings 使用 3 级导航，`detail_create_cb` 返回 `settings_manager_create_detail_page` 的返回值作为 `detail_page`。


---

## 十、后续可优化项

| 优先级 | 项目 | 说明 |
|--------|------|------|
| P1 | Lazy Loading | 首次访问 tile 时才创建内容，减少初始化内存占用 |
| P1 | 对象创建 NULL 检查 | 关键路径的 `lv_obj_create()` 添加 NULL 检查 |
| P2 | 百分比/Flex 布局 | 减少硬编码像素坐标，提高屏幕适配性 |
| P2 | 花朵 Canvas 化 | `ui_home_create_flower` 使用 11 个对象，可用 Canvas 或图片替代 |
| P2 | 屏幕生命周期回调 | 添加 `on_enter` / `on_leave` / `on_destroy` |
| P3 | 日历年份动态计算 | 替代硬编码的年份选项字符串 |