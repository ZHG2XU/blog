---
title: "source/css 样式文档"
date: "2026-05-10 12:25:45"
tags:
  - CSS
  - 样式
  - 主题定制
  - Butterfly
  - Hexo
  - 前端
  - 文档
categories:
  - 开发文档
---

> 项目: Blog-Hexo (Butterfly 主题定制)
> 入口文件: custom.css
> 模块目录: modules/
> 最后更新: 2026-05-10

---

## 目录

* 架构概览
* 文件分类
* 模块详解

  * 主题系统
  * 全局样式
  * 布局组件
  * 内容排版
  * 卡片与表面
  * 页面专用
  * 响应式设计
* 标签索引

---

## 架构概览

```
source/css/
├── custom.css
└── modules/
    ├── variables.css
    ├── background.css
    ├── base.css
    ├── scrollbar.css
    ├── cards.css
    ├── navigation.css
    ├── code-highlight.css
    ├── tables.css
    ├── typography.css
    ├── about-page.css
    ├── header-text.css
    ├── footer.css
    ├── post-meta.css
    └── responsive.css
```

所有模块由 custom.css 通过 @import url(...) 统一引入，形成完整样式链路。

---

## 文件分类

| 分类    | 标签                                                     | 包含文件                                                             |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| 主题系统  | theme / variable / light-mode / dark-mode              | variables.css                                                    |
| 全局样式  | global / background / scrollbar / base                 | custom.css / background.css / base.css / scrollbar.css           |
| 布局组件  | layout / component / navigation / header / footer      | navigation.css / header-text.css / footer.css                    |
| 内容排版  | content / typography / code / highlight / table / meta | typography.css / tables.css / code-highlight.css / post-meta.css |
| 卡片与表面 | card / surface / shadow                                | cards.css                                                        |
| 页面专用  | page / about                                           | about-page.css                                                   |
| 响应式设计 | responsive / mobile / media-query                      | responsive.css                                                   |

---

## 模块详解

### 主题系统

### variables.css - CSS 自定义属性

* 标签:

  * #theme
  * #variable
  * #light-mode
  * #dark-mode

* 功能:
  定义明亮模式与暗黑模式的 CSS 变量。

* 主要变量:

| 变量名             | 用途    |
| --------------- | ----- |
| --hl-bg         | 代码块背景 |
| --primary-color | 主题色   |
| --hover-color   | 悬停颜色  |
| --text-color    | 正文颜色  |
| --card-bg       | 卡片背景  |
| --card-border   | 卡片边框  |
| --card-shadow   | 卡片阴影  |

* 主题选择器:

  html:not([data-theme="dark"])
  html[data-theme="dark"]

---

## 全局样式

### custom.css - 主入口

* 标签:

  * #entry
  * #import
  * #aggregator

* 功能:
  聚合所有 CSS 模块。

* 引入顺序:

1. variables.css
2. background.css
3. base.css
4. scrollbar.css
5. cards.css
6. navigation.css
7. code-highlight.css
8. tables.css
9. typography.css
10. about-page.css
11. header-text.css
12. footer.css
13. post-meta.css
14. responsive.css

---

### background.css - 网站背景

* 标签:

  * #background
  * #light-mode
  * #dark-mode

* 功能:
  根据主题切换背景图。

* 背景图:

| 模式   | 图片                |
| ---- | ----------------- |
| 明亮模式 | /img/light-bg.png |
| 暗黑模式 | /img/dark-bg.png  |

* 目标元素:

  #web_bg

---

### base.css - 基础调整

* 标签:

  * #base
  * #global

* 功能:
  对 pre 元素统一设置圆角与间距。

* 规则:

  border-radius: 8px
  margin: 1em 0

---

### scrollbar.css - 滚动条样式

* 标签:

  * #scrollbar
  * #global

* 功能:
  自定义 Webkit 滚动条。

* 规格:

| 属性 | 数值  |
| -- | --- |
| 宽度 | 8px |
| 高度 | 8px |
| 圆角 | 4px |

---

## 布局组件

### navigation.css - 导航栏

* 标签:

  * #navigation
  * #component
  * #layout

* 功能:
  控制导航栏颜色、悬停效果与固定导航栏样式。

* 特性:

  * 标题强制白色
  * 下拉菜单悬停变蓝
  * 固定导航栏支持毛玻璃效果

---

### header-text.css - 页头文字

* 功能:
  控制页面标题颜色。

---

### footer.css - 页脚

* 功能:
  页脚文字统一白色。

---

## 内容排版

### typography.css - 排版

* 标签:

  * #typography
  * #content

* 功能:

  * 页面标题居中
  * 正文两端对齐
  * 视频自适应
  * Mermaid 透明背景

---

### tables.css - 表格

* 功能:
  定义明亮与暗黑模式下的表格样式。

---

### code-highlight.css - 代码高亮

* 标签:

  * #code
  * #highlight
  * #vscode
  * #dark-mode
  * #light-mode
  * #inline

* 功能:

  * 代码块 (`figure.highlight`) 双主题 Token 配色：明亮 (GitHub Primer 风格) / 暗黑 (VSCode Dark+ Modern)
  * 行内代码 (`.container code`) 双主题适配：明亮 `#cf222e` / 暗黑 `#ce9178`

---

### post-meta.css - 文章元信息

* 功能:
  控制文章标题、日期、标签等颜色。

---

## 卡片与表面

### cards.css - 卡片表面

* 标签:

  * #card
  * #surface
  * #shadow

* 功能:
  统一所有卡片容器样式。

* 包含:

  * 文章卡片
  * 侧边栏
  * 分页按钮
  * 导航菜单
  * TOC

---

## 页面专用

### about-page.css - 关于页面

* 标签:

  * #about
  * #page
  * #hero
  * #grid

* 功能:
  构建完整 About 页面布局。

* 模块:

  * Hero 区域
  * 信息网格
  * 社交链接
  * 响应式布局

---

## 响应式设计

### responsive.css - 移动端适配

* 标签:

  * #responsive
  * #mobile

* 功能:
  优化移动端文章信息区布局。

* 调整:

  * 缩减 padding
  * 隐藏部分 meta
  * 标题两端对齐

---

## 标签索引

| 标签          | 涉及文件               |
| ----------- | ------------------ |
| #theme      | variables.css      |
| #background | background.css     |
| #scrollbar  | scrollbar.css      |
| #navigation | navigation.css     |
| #header     | header-text.css    |
| #footer     | footer.css         |
| #typography | typography.css     |
| #table      | tables.css         |
| #code       | code-highlight.css |
| #highlight  | code-highlight.css |
| #vscode     | code-highlight.css |
| #inline     | code-highlight.css |
| #meta       | post-meta.css      |
| #card       | cards.css          |
| #about      | about-page.css     |
| #responsive | responsive.css     |
