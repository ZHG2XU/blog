---
title: "Blog 视觉与阅读体验追加优化开发文档"
date: "2026-07-12 14:30:00"
categories:
  - Hexo开发文档
tags:
  - CSS
  - 样式
  - 主题定制
  - Butterfly
  - Hexo
  - 前端
  - 文档
toc_number: false
excerpt: "记录 10e4a3a 之后工作区追加的首页 Hero、文章卡片、侧栏目录、文章排版、代码块、移动端适配与交互动效优化。"
---

> 项目: Blog-Hexo (Butterfly 主题定制)
> 阶段: 工作区追加优化
> 基准提交: `10e4a3a` 之后
> 优化周期: 2026-07-11 至 2026-07-12
> 样式入口: `source/css/custom.css`
> 模块目录: `source/css/modules/`
> 主要目标: 提升首页视觉表现、文章阅读体验、长文目录可用性与移动端可读性。

---

## 目录

- 优化目标
- 文件分类
- 优化总览
- 模块详解
  - 首页 Hero 与头图
  - 导航栏
  - 首页文章卡片
  - 侧栏与目录
  - 文章正文排版
  - 代码块与行内代码
  - 移动端适配
  - 主题变量
- 验证记录
- 后续优化建议

---

## 优化目标

本次优化围绕博客的实际内容形态展开。站点以嵌入式开发、系统设计、工程文档和问题记录为主，因此视觉风格需要同时满足两个方向：

- 首页保持个人主页的沉浸感，保留全屏壁纸与明确的个人识别。
- 文章页优先服务长文阅读，目录、代码块、正文层级和移动端换行必须清晰稳定。

最终取向是：少一点装饰性干扰，多一点信息层级、阅读节奏和交互反馈。

---

## 文件分类

| 分类 | 标签 | 涉及文件 |
| --- | --- | --- |
| 站点配置 | config / subtitle / home | `_config.butterfly.yml` |
| 主题系统 | theme / variable / radius | `variables.css` |
| 布局组件 | hero / header / navigation | `header-text.css` / `navigation.css` |
| 卡片与侧栏 | card / sidebar / toc / surface | `cards.css` / `post-meta.css` |
| 内容排版 | typography / article / heading | `typography.css` |
| 代码阅读 | code / highlight / inline-code | `code-highlight.css` |
| 响应式设计 | responsive / mobile | `responsive.css` |

---

## 优化总览

| 优化项 | 目标 | 结果 |
| --- | --- | --- |
| 首页滚动文字英文化 | 统一首页 Hero 的视觉语言 | 首页打字文案改为英文短句 |
| 全屏 Hero 保留 | 保留个人主页沉浸感 | `full_page` 维持 `100vh / 100svh` |
| Hero 动效 | 增加轻量生命感 | 标题、字幕、社交图标、滚动按钮加入入场与呼吸动画 |
| 导航栏对比度 | 避免白字压在亮图上不清楚 | 首屏顶部添加暗色渐变，滚动后恢复浅色毛玻璃 |
| 首页文章卡片 | 降低信息密度 | 摘要缩短，圆角收敛，hover 反馈更清楚 |
| 目录正常显示 | 去掉目录虚化/磨砂感 | `#card-toc` 和 `.toc-content` 改为实底显示 |
| 文章正文层级 | 减弱重复标题压迫感 | 正文首个 H1 降级为更克制的视觉尺寸 |
| 移动端行内代码 | 避免长路径撑破布局 | 行内代码允许正常折行 |
| 代码交互反馈 | 提升技术文章细节体验 | 行内代码 hover 增加轻量边框与阴影反馈 |

---

## 模块详解

### 首页 Hero 与头图

涉及文件:

- `source/css/modules/header-text.css`
- `_config.butterfly.yml`

#### 1. 首页英文滚动文案

将首页 `subtitle.sub` 从中文短句调整为英文短句：

```yaml
sub:
  - Turn complex systems into clear notes
  - Embedded development, system design, and engineering practice
  - Build carefully, document honestly, improve continuously
```

目的:

- 首页 Hero 中英文更适合短句打字效果。
- 减少中文长句在移动端换行时的拥挤感。
- 强化站点“工程记录 / 系统设计 / 持续构建”的定位。

#### 2. 保留全屏壁纸

首页 Hero 最终保持全屏：

```css
#page-header.full_page {
    min-height: 100vh;
    min-height: 100svh;
    height: 100vh;
    height: 100svh;
}
```

说明:

- 曾尝试将 Hero 调整为 `92svh`，让首屏露出文章区。
- 最终确认首页应保留完整壁纸沉浸感，因此恢复为 `100svh`。

#### 3. Hero 入场动画

新增动画:

- `hero-copy-in`
- `hero-title-in`
- `hero-subtitle-in`
- `hero-social-in`
- `scroll-button-float`

对应元素:

- `#site-info`
- `#site-title`
- `#site-subtitle`
- `#site_social_icons`
- `#scroll-down .scroll-down-effects`

设计原则:

- 动画时间短，避免影响阅读。
- 不使用大幅度移动。
- 不对内容做持续闪烁。
- 滚动按钮只保留轻微呼吸/浮动提示。

---

### 导航栏

涉及文件:

- `source/css/modules/navigation.css`

#### 1. 首屏导航增强对比度

首屏 Hero 背景图局部较亮，白色导航文字容易丢失，因此增加顶部暗色渐变：

```css
#page-header.full_page:not(.nav-fixed) #nav {
    background: linear-gradient(180deg, rgba(2, 6, 23, 0.42), rgba(2, 6, 23, 0.08)) !important;
}
```

#### 2. 滚动后恢复正常导航

选择器限制在 `:not(.nav-fixed)`，避免滚动到文章列表后仍保留 Hero 的暗色渐变。

验证结果:

- 首屏导航文字对比度更稳。
- 滚动后导航恢复浅色实用状态。
- 未产生横向溢出。

---

### 首页文章卡片

涉及文件:

- `source/css/modules/cards.css`
- `source/css/modules/variables.css`

#### 1. 圆角收敛

将全局大圆角变量从 `24px` 调整为 `18px`：

```css
--ui-radius-lg: 18px;
```

目的:

- 降低卡片的装饰感。
- 让技术博客界面更偏工具型、文档型。

#### 2. 摘要密度调整

桌面端文章摘要从 3 行改为 2 行：

```css
#recent-posts .recent-post-item .content {
    line-height: 1.78;
    -webkit-line-clamp: 2;
}
```

移动端保留 3 行：

```css
@media screen and (max-width: 768px) {
    #recent-posts .recent-post-item .content {
        -webkit-line-clamp: 3;
    }
}
```

#### 3. 卡片交互

增加轻量 hover：

```css
#recent-posts > .recent-post-items > .recent-post-item:hover {
    border-color: var(--ui-border-strong);
    box-shadow: var(--ui-shadow-md);
    transform: translateY(-6px);
}
```

滚动出现动画只保留透明度变化，避免虚化：

```css
@keyframes surface-reveal {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}
```

---

### 侧栏与目录

涉及文件:

- `source/css/modules/cards.css`
- `source/css/modules/post-meta.css`

#### 1. 目录关闭虚化

目录卡片最终改为正常实底显示：

```css
#aside-content .sticky_layout:has(#card-toc),
#aside-content #card-toc,
#aside-content #card-toc .toc-content {
    background: var(--ui-surface-solid) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
```

目录内容区也单独覆盖：

```css
#card-toc .toc-content {
    background: var(--ui-surface-solid) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
}
```

目的:

- 目录作为长文导航工具，必须清晰。
- 避免半透明/磨砂效果影响条目识别。
- 让目录和正文形成稳定阅读辅助关系。

#### 2. 目录内部滚动

长文目录内容很多，因此限制目录高度并允许内部滚动：

```css
#card-toc .toc-content {
    overflow-y: auto;
    max-height: calc(100vh - 180px);
    scrollbar-width: thin;
}
```

#### 3. 目录当前项反馈

当前项与 hover 项增加轻微横向反馈：

```css
#card-toc .toc-link:hover {
    transform: translateX(2px);
}

#card-toc .toc-link.active {
    transform: translateX(3px);
}
```

---

### 文章正文排版

涉及文件:

- `source/css/modules/typography.css`

#### 1. 正文首个 H1 降级

文章页顶部已经有 Hero 标题，正文再次出现同名 H1 时容易显得重复。因此正文首个 H1 调整为更克制的尺寸：

```css
#article-container > h1:first-child {
    margin-top: 0;
    font-size: clamp(1.55rem, 3vw, 1.95rem);
}
```

#### 2. 正文换行策略

全局正文从 `overflow-wrap: anywhere` 调整为 `break-word`：

```css
#article-container {
    overflow-wrap: break-word;
}
```

目的:

- 避免普通中文、英文段落过度碎裂。
- 行内代码在移动端由单独规则处理。

---

### 代码块与行内代码

涉及文件:

- `source/css/modules/code-highlight.css`
- `source/css/modules/responsive.css`

#### 1. 行内代码 hover 反馈

行内代码增加轻量过渡与 hover 状态：

```css
#article-container :not(pre) > code {
    transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease,
        box-shadow 0.18s ease;
}

#article-container :not(pre) > code:hover {
    border-color: var(--ui-border-strong);
    box-shadow: 0 0 0 3px var(--ui-accent-soft);
}
```

#### 2. 移动端长路径折行

移动端行内代码允许正常折行：

```css
@media screen and (max-width: 768px) {
    #article-container :not(pre) > code {
        max-width: 100%;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
    }
}
```

解决的问题:

- `sdk/app/intercom/intercom_adpcm.c` 这类路径过长。
- 移动端正文宽度有限。
- 不处理会导致行内代码撑破或换行很难看。

---

### 移动端适配

涉及文件:

- `source/css/modules/header-text.css`
- `source/css/modules/responsive.css`

#### 1. 移动端 Hero 取景

移动端调整背景位置：

```css
@media screen and (max-width: 768px) {
    #page-header.full_page {
        background-position: 47% center !important;
    }
}
```

#### 2. 移动端 Hero 信息位置

移动端将站点信息下移：

```css
#page-header.full_page #site-info {
    top: 70%;
}
```

目的:

- 避免标题压在人物眼部区域。
- 保留壁纸主体。
- 社交图标以底条形式出现，视觉更稳定。

#### 3. 移动端文章页内边距

文章页移动端内边距调整：

```css
#post {
    padding: 26px 20px;
}
```

---

### 主题变量

涉及文件:

- `source/css/modules/variables.css`

本次主要调整：

```css
--ui-radius-lg: 18px;
```

影响范围:

- 首页文章卡片
- 侧栏卡片
- 页面容器
- 相关文章卡片

设计原因:

- 原 `24px` 更偏柔和、装饰性。
- `18px` 更适合技术文档站点，保留现代感但不过度圆润。

---

## 验证记录

### 构建验证

执行命令：

```bash
npm run build
```

结果：

- Hexo 构建通过。
- CSS 模块正常生成到 `public/css/modules/`。
- 文章、分类、标签、归档页面正常生成。

### Chrome 视觉验证

检查页面：

- `http://localhost:4000/`
- `http://localhost:4000/2026/07/03/ADPCM对讲模块详细设计文档/`

检查项：

- 首页 Hero 是否保持全屏。
- 首页英文打字文案是否正常。
- 滚动后导航栏是否恢复正常浅色状态。
- 首页卡片是否无横向溢出。
- 文章页目录是否正常实底显示。
- 移动端文章页行内代码是否正常折行。

截图记录目录：

```text
.codex-screenshots/
```

---

## 后续优化建议

#### 1. 目录层级继续增强

当前目录已经可用，后续可以优化：

- 二级/三级标题缩进更明确。
- 当前章节左侧增加细线。
- 长标题截断策略更稳定。

#### 2. 代码块工具栏优化

技术文章代码较多，后续可继续优化：

- 复制按钮成功状态。
- 代码语言标签位置。
- 横向滚动条样式。
- 移动端代码块阅读宽度。

#### 3. 首页卡片元信息结构化

当前文章卡片已经收敛摘要，但还可以继续：

- 日期、分类、标签视觉弱化。
- 标题和摘要之间拉开层级。
- 分类标签改为更小的 metadata 样式。

#### 4. 首屏资源优化

首页壁纸是核心视觉资源，后续可考虑：

- 为 Hero 图增加 preload。
- 针对移动端使用更小尺寸图片。
- 避免弱网下首屏空白时间过长。

---

## 结论

本轮优化完成后，站点视觉方向更加明确：

- 首页负责第一印象，保留全屏壁纸与轻量动画。
- 首页列表负责内容入口，降低摘要密度并增强卡片反馈。
- 文章页负责长文阅读，目录正常实底显示，正文层级更克制。
- 移动端优先保证可读性，尤其是技术路径和行内代码换行。

整体风格从“偏装饰的主题定制”进一步收敛到“适合工程文档阅读的个人技术博客”。

