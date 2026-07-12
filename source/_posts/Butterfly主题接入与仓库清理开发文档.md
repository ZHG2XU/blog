---
title: "Butterfly 主题接入与仓库清理开发文档"
date: "2026-07-03 18:00:00"
categories:
  - Hexo开发文档
tags:
  - Hexo
  - Butterfly
  - 主题定制
  - Git
  - 文档
toc_number: false
excerpt: "记录从添加 Butterfly 主题文件到清理主题目录 Git 缓存的接入过程，说明主题目录结构、仓库管理边界与后续自定义样式策略。"
---

> 项目: Blog-Hexo
> 阶段: Butterfly 主题接入
> 提交范围: `196591f` 至 `daedcd4`
> 核心目录: `themes/butterfly/`
> 目标: 将 Butterfly 主题纳入主仓库，并清理不应进入业务仓库的主题 Git 缓存。

---

## 目录

- 提交范围
- 背景目标
- 主题文件接入
- Git 缓存清理
- 目录结构说明
- 后续定制策略
- 风险与注意事项

---

## 提交范围

| 提交 | 日期 | 说明 |
| --- | --- | --- |
| `196591f` | 2026-07-03 | 添加 Butterfly 主题文件 |
| `daedcd4` | 2026-07-03 | 移除主题目录中的 Git 缓存 |

---

## 背景目标

博客从 Hexo 基础站点切换到 Butterfly 主题后，需要将主题文件纳入当前仓库，便于：

- 本地完整构建，不依赖外部主题目录。
- 后续可以基于 Butterfly 做配置和样式覆盖。
- 保证部署环境能够直接读取 `themes/butterfly/`。

主题接入后又发现主题目录中包含 `.git_disabled/` 缓存文件，这类文件属于主题上游仓库的 Git 元数据，不应该进入当前博客仓库，因此随后做了清理。

---

## 主题文件接入

### 1. 新增主题主体

提交 `196591f` 添加了完整的 Butterfly 主题目录：

```text
themes/butterfly/
├── _config.yml
├── languages/
├── layout/
├── scripts/
├── source/
├── package.json
├── plugins.yml
├── README.md
└── README_CN.md
```

### 2. 主要能力来源

Butterfly 主题提供以下基础能力：

| 能力 | 对应目录 |
| --- | --- |
| 页面模板 | `layout/` |
| 侧栏卡片 | `layout/includes/widget/` |
| 文章布局 | `layout/post.pug` |
| 首页列表 | `layout/includes/mixins/indexPostUI.pug` |
| 目录组件 | `layout/includes/widget/card_post_toc.pug` |
| 主题脚本 | `source/js/` |
| Stylus 样式源码 | `source/css/` |
| 配置默认值 | `scripts/common/default_config.js` |

### 3. 对项目的影响

主题接入后，博客的视觉和交互能力不再只依赖 Hexo 默认主题，而是由 Butterfly 提供：

- 首页 Hero 和文章列表。
- 文章页标题、元信息、目录。
- 侧栏作者卡片、最近文章、分类、标签。
- 右侧工具栏、搜索、返回顶部。
- 代码高亮、暗黑模式、响应式布局。

---

## Git 缓存清理

### 1. 问题来源

主题目录中出现了 `.git_disabled/`：

```text
themes/butterfly/.git_disabled/
```

该目录包含：

- `HEAD`
- `config`
- `objects/`
- `refs/`
- `logs/`
- Git hooks 示例文件

这些内容是主题上游仓库的 Git 元数据，不属于博客项目源码。

### 2. 清理提交

提交 `daedcd4` 删除了 `.git_disabled/` 下的缓存内容，并更新 `.gitignore`。

清理目标：

- 避免把上游主题仓库历史带入博客仓库。
- 减少仓库体积。
- 避免后续 Git 操作产生混淆。

### 3. 清理原则

主题代码可以进入仓库，但主题自己的 Git 元数据不应该进入仓库。

保留：

- `themes/butterfly/layout/`
- `themes/butterfly/source/`
- `themes/butterfly/scripts/`
- `themes/butterfly/_config.yml`

删除：

- `themes/butterfly/.git_disabled/`
- 主题上游仓库内部对象缓存

---

## 目录结构说明

### layout/

负责页面结构：

```text
layout/
├── index.pug
├── post.pug
├── page.pug
├── archive.pug
├── category.pug
└── includes/
```

后续目录跳转修复、侧栏卡片和文章页结构都依赖这套模板输出的 DOM。

### source/css/

Butterfly 原始 Stylus 样式目录：

```text
source/css/
├── _layout/
├── _page/
├── _highlight/
├── _mode/
└── index.styl
```

当前项目没有直接大量修改主题 Stylus，而是在 `source/css/modules/` 里做自定义 CSS 覆盖。

### source/js/

主题交互脚本目录：

```text
source/js/
├── main.js
├── utils.js
└── search/
```

后续目录锚点映射修复涉及 `themes/butterfly/source/js/main.js`。

---

## 后续定制策略

主题接入后，项目采用“少改主题源码，多用自定义 CSS 覆盖”的策略：

| 类型 | 策略 |
| --- | --- |
| 视觉主题 | 优先改 `source/css/modules/` |
| 站点配置 | 优先改 `_config.butterfly.yml` |
| 文章脚手架 | 改 `scaffolds/post.md` |
| 主题 JS Bug | 必要时改 `themes/butterfly/source/js/main.js` |
| 上游主题模板 | 尽量少改，避免升级困难 |

该策略的好处：

- 主题升级时冲突更少。
- 自定义样式边界清楚。
- 视觉改动可以通过模块化 CSS 管理。

---

## 风险与注意事项

### 1. 主题源码升级风险

如果后续重新拉取 Butterfly 上游版本，需要注意：

- `themes/butterfly/source/js/main.js` 已有本地修复。
- 主题默认配置可能与 `_config.butterfly.yml` 不一致。
- 主题 DOM 结构变化可能影响自定义 CSS 选择器。

### 2. 自定义覆盖顺序

自定义样式入口为：

```text
source/css/custom.css
```

它通过 `@import` 引入模块，因此模块顺序会影响覆盖结果。

### 3. 不建议修改的内容

除非必要，不建议直接修改：

- `themes/butterfly/layout/`
- `themes/butterfly/source/css/`
- `themes/butterfly/scripts/common/default_config.js`

这些文件属于主题核心，升级时最容易冲突。

---

## 结论

该阶段完成了 Butterfly 主题接入，并清理了主题目录中的 Git 缓存。后续所有视觉、排版、目录、代码块和移动端优化都建立在这个主题基础之上。

本阶段的核心价值不是视觉改造，而是建立主题运行基础和仓库边界。
