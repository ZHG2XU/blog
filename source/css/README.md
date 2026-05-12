---
layout: false
---

# `source/css` 样式文档

> **项目**: Blog-Hexo (Butterfly 主题定制)  
> **入口文件**: `custom.css`  
> **模块目录**: `modules/`  
> **最后更新**: 2026-05-10

---

## 目录

- [架构概览](#架构概览)
- [文件分类](#文件分类)
- [模块详解](#模块详解)
  - [主题系统](#主题系统)
  - [全局样式](#全局样式)
  - [布局组件](#布局组件)
  - [内容排版](#内容排版)
  - [卡片与表面](#卡片与表面)
  - [页面专用](#页面专用)
  - [响应式设计](#响应式设计)
- [标签索引](#标签索引)

---

## 架构概览

```
source/css/
├── custom.css              ← 主入口（@import 聚合所有模块）
└── modules/
    ├── variables.css       ← 主题变量（Light/Dark CSS 自定义属性）
    ├── background.css      ← 网站背景图
    ├── base.css            ← 基础全局调整
    ├── scrollbar.css       ← 滚动条样式
    ├── cards.css           ← 卡片表面统一风格
    ├── navigation.css      ← 导航栏样式
    ├── code-highlight.css  ← 代码高亮（VSCode Dark+）
    ├── tables.css          ← 表格样式
    ├── typography.css      ← 排版、视频、Mermaid
    ├── about-page.css      ← 关于页面专属
    ├── header-text.css     ← 页头文字颜色
    ├── footer.css          ← 页脚文字颜色
    ├── post-meta.css       ← 文章元信息色彩
    └── responsive.css      ← 移动端适配
```

所有模块由 `custom.css` 通过 `@import url(...)` 统一引入，形成一条完整的样式链路。

---

## 文件分类

| 分类 | 标签 | 包含文件 |
|------|------|----------|
| **主题系统** | `theme`, `variable`, `light-mode`, `dark-mode` | `variables.css` |
| **全局样式** | `global`, `background`, `scrollbar`, `base` | `custom.css`, `background.css`, `base.css`, `scrollbar.css` |
| **布局组件** | `layout`, `component`, `navigation`, `header`, `footer` | `navigation.css`, `header-text.css`, `footer.css` |
| **内容排版** | `content`, `typography`, `code`, `highlight`, `table`, `meta` | `typography.css`, `tables.css`, `code-highlight.css`, `post-meta.css` |
| **卡片与表面** | `card`, `surface`, `shadow` | `cards.css` |
| **页面专用** | `page`, `about` | `about-page.css` |
| **响应式设计** | `responsive`, `mobile`, `media-query` | `responsive.css` |

---

## 模块详解

### 主题系统

#### `variables.css` &mdash; CSS 自定义属性

- **标签**: `#theme` `#variable` `#light-mode` `#dark-mode`
- **功能**: 定义明亮 / 暗黑两套主题的 CSS 变量。
- **变量清单**:

| 变量名 | 用途 | 明亮模式值 | 暗黑模式值 |
|--------|------|-----------|-----------|
| `--hl-bg` | 代码块背景 | `#f4f7fa` | `#0b0f19` |
| `--hltools-bg` | 代码块工具栏背景 | `#e9eef4` | `#111726` |
| `--hlnumber-bg` | 代码行号背景 | `#f4f7fa` | `#0b0f19` |
| `--hlnumber-color` | 代码行号颜色 | `#8da4bb` | `#5c6c7f` |
| `--hlscrollbar-bg` | 代码块滚动条 | `#dbe6f0` | `#1e293b` |
| `--hlexpand-bg` | 代码展开渐变 | `rgba(244,247,250,...)` | `rgba(11,15,25,...)` |
| `--primary-color` | 主题色 | `#49b1f5` | `#49b1f5` |
| `--hover-color` | 悬停色 | `#ff7142d2` | `#ff7142d2` |
| `--text-color` | 正文颜色 | `#2c3e50` | `#c9d1d9` |
| `--card-bg` | 卡片背景 | `rgba(255,255,255,0.85)` | `rgba(30,30,30,0.85)` |
| `--card-border` | 卡片边框 | `#e8e8e8` | `rgba(255,255,255,0.08)` |
| `--card-shadow` | 卡片阴影 | `0 8px 16px -4px ...` | `0 8px 16px -4px ...` |

- **选择器**: `html:not([data-theme="dark"])` / `html[data-theme="dark"]`

---

### 全局样式

#### `custom.css` &mdash; 主入口

- **标签**: `#entry` `#import` `#aggregator`
- **功能**: 聚合所有模块，自身不包含样式规则。
- **引用清单**:
  1. `variables.css`
  2. `background.css`
  3. `base.css`
  4. `scrollbar.css`
  5. `cards.css`
  6. `navigation.css`
  7. `code-highlight.css`
  8. `tables.css`
  9. `typography.css`
  10. `about-page.css`
  11. `header-text.css`
  12. `footer.css`
  13. `post-meta.css`
  14. `responsive.css`

#### `background.css` &mdash; 网站背景

- **标签**: `#background` `#light-mode` `#dark-mode`
- **功能**: 根据主题切换网站背景图片。
- **规则**:
  - 明亮模式 (`html:not([data-theme="dark"])`) → `/img/light-bg.png`
  - 暗黑模式 (`html[data-theme="dark"]`) → `/img/dark-bg.png`
- **目标元素**: `#web_bg`

#### `base.css` &mdash; 基础调整

- **标签**: `#base` `#global`
- **功能**: 对所有 `<pre>` 元素统一设置圆角和间距。
- **规则**:
  - `border-radius: 8px`
  - `margin: 1em 0`

#### `scrollbar.css` &mdash; 滚动条样式

- **标签**: `#scrollbar` `#global` `#light-mode` `#dark-mode`
- **功能**: 自定义 Webkit 滚动条外观。
- **规格**:
  - 宽度 / 高度: `8px`
  - 轨道圆角: `4px`
- **主题适配**:
  - 明亮: 轨道 `rgba(0,0,0,0.05)`，滑块 `rgba(0,0,0,0.2)`，悬停 `rgba(0,0,0,0.3)`
  - 暗黑: 轨道 `rgba(255,255,255,0.05)`，滑块 `rgba(255,255,255,0.2)`，悬停 `rgba(255,255,255,0.3)`

---

### 布局组件

#### `navigation.css` &mdash; 导航栏

- **标签**: `#navigation` `#component` `#layout` `#light-mode` `#dark-mode`
- **功能**: 导航栏颜色、链接悬停效果、滚动固定导航栏样式。
- **变量**: `--nav-fg` (前景色), `--nav-hover` (悬停色)
- **关键行为**:
  - 明亮默认: 前景 `#000000`，悬停 `#2f6fef`
  - 网站标题 (`#site-title`, `#site-name` …) 强制白色
  - 下拉菜单项悬停: 背景 `transparent`，文字变蓝色
  - 滚动 / 非顶图时 (`not-top-img` / `nav-fixed`):
    - 明亮: 白色半透明背景 + `backdrop-filter: blur(10px)` + 阴影
    - 暗黑: 深色半透明背景

#### `header-text.css` &mdash; 页头文字

- **标签**: `#header` `#component` `#layout` `#light-mode` `#dark-mode`
- **功能**: 页面标题 (`.page-title` inside `#page-header`) 的主题适配颜色。
- **规则**:
  - 明亮: 强制 `#2c3e50`
  - 暗黑: 使用 `var(--text-color)`

#### `footer.css` &mdash; 页脚

- **标签**: `#footer` `#component` `#layout` `#light-mode` `#dark-mode`
- **功能**: 页脚所有文字 (无论主题) 统一强制白色 (`#ffffff`)。

---

### 内容排版

#### `typography.css` &mdash; 排版

- **标签**: `#typography` `#content` `#video` `#mermaid`
- **功能**:
  - 普通页面标题 (`.page-title`) 居中
  - 文章正文 (`#article-container`) 两端对齐 (`text-align: justify`)
  - YouTube / Vimeo 视频 `<iframe>` 自适应宽度并保持 16:9 比例
  - Mermaid 图表强制透明背景

#### `tables.css` &mdash; 表格

- **标签**: `#table` `#content` `#light-mode` `#dark-mode`
- **功能**:
  - 表头 (`<th>`) 文字居中
  - 明亮模式: 半透明白底表格，边框 `#919191da`，偶数行 `rgba(240,244,248,0.5)`
  - 暗黑模式: 半透明深底表格，边框 `#5c6c7f`，偶数行 `rgba(30,36,44,0.5)`

#### `code-highlight.css` &mdash; 代码高亮

- **标签**: `#code` `#highlight` `#vscode` `#dark-mode` `#light-mode` `#inline`
- **功能**:
  - 代码块 (`figure.highlight`) 双主题 Token 配色: 明亮 (One Light 风格) / 暗黑 (VSCode Dark+ 风格)
  - 行内代码 (`.container code`) 双主题适配
- **明亮模式配色 (GitHub Primer 风格)**:

| Token 类型 | 颜色 |
|------------|------|
| 默认文字 | `#24292f` |
| 关键字 | `#cf222e` |
| 函数名 | `#8250df` |
| 字符串 | `#0a3069` |
| 注释 | `#656d76` (斜体) |
| 数字 | `#0550ae` |
| 类型 | `#953800` |
| 变量 | `#cf222e` |
| 内建函数 | `#8250df` |
| 宏 | `#bf3989` |

- **暗黑模式配色 (VSCode Dark+ Modern)**:

| Token 类型 | 颜色 | 对应 VSCode |
|------------|------|-------------|
| 默认文字 | `#d4d4d4` | editor.foreground |
| 关键字 | `#569cd6` | keyword |
| 字符串 | `#ce9178` | string |
| 注释 | `#6a9955` (斜体) | comment |
| 数字 | `#b5cea8` | number |
| 函数 | `#dcdcaa` | function |
| 类型 | `#4ec9b0` | type |
| 变量 | `#9cdcfe` | variable |
| 内建函数 | `#4ec9b0` | type |
| 宏 | `#c586c0` | — |

- **行内代码**:

| 主题 | 背景 | 文字颜色 |
|------|------|----------|
| 明亮 | `rgba(175,184,193,0.2)` | `#cf222e` |
| 暗黑 | `rgba(255,255,255,0.08)` | `#ce9178` |

> 共用: `padding: 2px 5px`, `border-radius: 3px`, 等宽字体栈

#### `post-meta.css` &mdash; 文章元信息

- **标签**: `#meta` `#content` `#copyright` `#light-mode` `#dark-mode`
- **功能**: 文章页 (`#post-info`) 的标题、元信息 (日期/分类/标签)、版权声明等文字颜色适配。
- **规则**:
  - 明亮: 强制 `#2c3e50`
  - 暗黑: 使用 `var(--text-color)`

---

### 卡片与表面

#### `cards.css` &mdash; 卡片表面

- **标签**: `#card` `#surface` `#shadow` `#pagination`
- **功能**: 统一博客中各类卡片容器的背景、边框、阴影风格。
- **影响范围**:
  - 文章卡片 (`#recent-posts` / `.recent-post-item`)
  - 侧边栏卡片 (`.card-widget`)
  - 布局第一子元素 (非文章列表)
  - 导航下拉菜单 (`.menus_item_child`)
  - 分页按钮 (`.page-number`, `.extend`)
  - 文章信息区 (`#post-info`)
- **共同属性**:
  - `background: var(--card-bg)`
  - `border: 1px solid var(--card-border)`
  - `box-shadow: var(--card-shadow)`
  - `transition` 平滑过渡
- **分页悬停**: 背景变为 `var(--hover-color)`，文字变白
- **TOC 文字**: 单行省略号截断

---

### 页面专用

#### `about-page.css` &mdash; 关于页面

- **标签**: `#about` `#page` `#hero` `#grid` `#responsive`
- **功能**: 完整的 "关于" 页面布局，包括英雄区、信息网格、社交链接。
- **布局结构**:

| 区块 | 选择器 | 说明 |
|------|--------|------|
| 英雄区 | `.about-hero` | 头像 (120×120) + 标题 + 简介，桌面端双列，移动端单列 |
| 标签徽章 | `.about-eyebrow` | 主题色胶囊徽章 |
| 信息网格 | `.about-grid` | 3 列网格 (含 `.about-section` → `.about-list`)，平板 2 列，手机 1 列 |
| 社交链接 | `.about-links` | 4 列网格，卡片风格，悬停上浮 + 主题色光晕 |

- **响应式断点**:
  - `≤900px`: 网格 / 链接降至 2 列
  - `≤768px`: 英雄区单列居中，标题缩小至 `1.8rem`
  - `≤560px`: 网格 / 链接降至 1 列

- **动画**: 链接 hover 时 `translateY(-3px)`，边框变主题色，附蓝色阴影

---

### 响应式设计

#### `responsive.css` &mdash; 移动端适配

- **标签**: `#responsive` `#mobile` `#media-query`
- **功能**: 在 `≤768px` 视口下优化文章信息区 (`#post-info`) 的显示。
- **调整**:
  - 内边距缩减至 `15px 20px`
  - 距底部距离调整为 `20px`
  - 隐藏元信息中非字数统计的 span 及分隔符
  - 文章标题改为两端对齐 (`text-align: justify`)

---

## 标签索引

| 标签 | 涉及文件 |
|------|----------|
| `#theme` | `variables.css` |
| `#variable` | `variables.css` |
| `#light-mode` | `variables.css`, `background.css`, `scrollbar.css`, `navigation.css`, `tables.css`, `header-text.css`, `footer.css`, `post-meta.css` |
| `#dark-mode` | `variables.css`, `background.css`, `scrollbar.css`, `code-highlight.css`, `navigation.css`, `tables.css`, `header-text.css`, `footer.css`, `post-meta.css` |
| `#global` | `custom.css`, `base.css`, `scrollbar.css` |
| `#background` | `background.css` |
| `#scrollbar` | `scrollbar.css` |
| `#base` | `base.css` |
| `#card` `#surface` `#shadow` | `cards.css` |
| `#pagination` | `cards.css` |
| `#navigation` | `navigation.css` |
| `#header` | `header-text.css` |
| `#footer` | `footer.css` |
| `#typography` | `typography.css` |
| `#video` | `typography.css` |
| `#mermaid` | `typography.css` |
| `#table` | `tables.css` |
| `#code` `#highlight` `#vscode` | `code-highlight.css` |
| `#meta` `#copyright` | `post-meta.css` |
| `#about` `#hero` `#grid` | `about-page.css` |
| `#responsive` `#mobile` | `about-page.css`, `responsive.css` |
| `#entry` `#import` `#aggregator` | `custom.css` |
| `#component` | `navigation.css`, `header-text.css`, `footer.css` |
| `#layout` | `navigation.css`, `header-text.css`, `footer.css` |
| `#content` | `typography.css`, `tables.css`, `code-highlight.css`, `post-meta.css` |
| `#page` | `about-page.css` |
| `#media-query` | `responsive.css`, `about-page.css` |