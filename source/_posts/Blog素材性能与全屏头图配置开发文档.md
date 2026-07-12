---
title: "Blog 素材性能与全屏头图配置开发文档"
date: "2026-07-11 18:00:00"
categories:
  - Hexo开发文档
tags:
  - Hexo
  - Butterfly
  - 性能优化
  - 主题定制
  - 图片
  - 前端
  - 文档
toc_number: false
excerpt: "记录博客视觉素材压缩、首页全屏透明头图、文章自定义头图、文章脚手架与样式文档同步更新。"
---

> 项目: Blog-Hexo (Butterfly 主题定制)
> 阶段: 素材性能与头图体验
> 提交范围: `4b68bdb` 至 `3f39d93`
> 关键文件: `_config.butterfly.yml` / `header-text.css` / `scaffolds/post.md` / `source/img/`

---

## 目录

- 提交范围
- 优化目标
- 视觉素材压缩
- 首页全屏透明头图
- 文章自定义头图
- 脚手架更新
- 文档同步
- 验证要点

---

## 提交范围

| 提交 | 日期 | 说明 |
| --- | --- | --- |
| `4b68bdb` | 2026-07-11 | 压缩视觉素材并完成界面细节收尾 |
| `3f39d93` | 2026-07-12 | 全屏透明首页并支持文章自定义头图 |

---

## 优化目标

本阶段主要解决两个问题：

- 首页和侧栏使用的视觉素材体积较大，影响加载速度。
- 首页头图和文章头图需要更清楚地区分，首页负责沉浸感，文章页负责阅读入口。

---

## 视觉素材压缩

涉及提交：

- `4b68bdb`

涉及文件：

- `source/img/avatar.jpeg`
- `source/img/avatar.webp`
- `source/img/dark-bg.png`
- `source/img/dark-bg.webp`
- `source/img/light-bg.png`
- `source/img/light-bg.webp`

### 1. 图片格式迁移

原图片：

```text
source/img/avatar.jpeg
source/img/dark-bg.png
source/img/light-bg.png
```

新图片：

```text
source/img/avatar.webp
source/img/dark-bg.webp
source/img/light-bg.webp
```

### 2. 迁移原因

WebP 相比 PNG/JPEG 更适合网页场景：

- 文件体积更小。
- 视觉质量保持较好。
- 浏览器支持度足够。
- 首页背景图和头像加载更快。

### 3. 配套引用更新

图片格式变更后，同步更新：

- `_config.butterfly.yml`
- `source/about/index.html`
- `source/css/modules/header-text.css`
- `source/css/README.md`
- `source/_posts/样式文档.md`

确保页面和文档中不再指向旧图片。

---

## 首页全屏透明头图

涉及提交：

- `3f39d93`

涉及文件：

- `_config.butterfly.yml`
- `source/css/modules/header-text.css`

### 1. 首页头图透明配置

配置中将首页头图交给自定义 CSS 控制：

```yaml
index_img: transparent
```

这样可以避免 Butterfly 默认头图干扰自定义背景图。

### 2. 自定义 CSS 接管首页 Hero

`header-text.css` 负责首页背景：

```css
#page-header.full_page {
    background-image:
        linear-gradient(...),
        url('/img/light-bg.webp') !important;
}
```

暗黑模式使用：

```css
html[data-theme="dark"] #page-header.full_page {
    background-image:
        linear-gradient(...),
        url('/img/dark-bg.webp') !important;
}
```

### 3. 首页与内页分离

首页：

- 使用个人壁纸。
- 保持全屏。
- 用站点名和副标题建立第一印象。

文章页：

- 使用文章头图或深色渐变。
- 强化标题和文章元信息。
- 不抢正文阅读注意力。

---

## 文章自定义头图

涉及提交：

- `3f39d93`

### 1. Front Matter 支持

文章可以通过 Front Matter 设置头图：

```yaml
top_img: /img/your-image.webp
```

### 2. 使用场景

适合：

- 项目复盘文章。
- 架构文档。
- 带有明确视觉素材的专题文章。

不适合：

- 纯代码记录。
- Bug 修复短文。
- 无明确视觉主题的文档。

---

## 脚手架更新

涉及文件：

- `scaffolds/post.md`

新增字段：

```yaml
top_img:
```

目的：

- 新建文章时自动保留头图配置位。
- 避免每次手动补 Front Matter。
- 让文章头图能力成为标准写作流程的一部分。

---

## 文档同步

涉及文件：

- `source/css/README.md`
- `source/_posts/样式文档.md`

同步内容：

- 图片路径从 PNG/JPEG 更新到 WebP。
- 补充首页 Hero 图片说明。
- 补充文章自定义头图说明。
- 更新模块说明，避免文档落后于实现。

---

## 验证要点

### 1. 图片路径

需要确认：

- `/img/avatar.webp` 正常显示。
- `/img/light-bg.webp` 正常显示。
- `/img/dark-bg.webp` 在暗黑模式下正常显示。

### 2. 首页 Hero

需要确认：

- 首页保持全屏。
- 背景由 CSS 控制。
- 标题和副标题可读。

### 3. 文章头图

需要确认：

- 未设置 `top_img` 的文章仍有默认头图表现。
- 设置 `top_img` 的文章可以覆盖默认头图。

---

## 结论

本阶段把视觉素材从“能显示”推进到“适合网页加载”，同时建立了首页头图和文章头图的职责边界。

首页继续承担品牌和氛围，文章页则支持按内容配置头图。后续视觉动画和阅读体验优化，都是在这套资源与头图策略上继续展开。
