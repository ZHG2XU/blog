# CSS 结构说明

这套样式现在采用“一个入口文件 + 多个职责模块”的方式组织。

## 入口文件

- [custom.css](g:\blog-hexo\blog\source\css\custom.css:1)
  只负责 `@import`，不再直接写具体样式。
  以后新增模块，优先在这里接入。

## modules 目录

- [variables.css](g:\blog-hexo\blog\source\css\modules\variables.css:1)
  主题变量中心。
  管亮/暗主题下的颜色变量，比如卡片背景、文字颜色、代码高亮背景。

- [background.css](g:\blog-hexo\blog\source\css\modules\background.css:1)
  网站大背景图。
  现在已经按主题切换：
  亮色用 `/img/light-bg.png`
  暗色用 `/img/dark-bg.png`

- [base.css](g:\blog-hexo\blog\source\css\modules\base.css:1)
  很基础的全局小修正。
  目前只放了 `pre` 的圆角和外边距。

- [scrollbar.css](g:\blog-hexo\blog\source\css\modules\scrollbar.css:1)
  全站滚动条样式。
  如果你以后想让滚动条更细、更浅、更圆，就改这里。

- [cards.css](g:\blog-hexo\blog\source\css\modules\cards.css:1)
  卡片和浮层容器样式。
  包括首页卡片、侧边栏卡片、分页按钮、文章头部信息卡片。
  这个文件优先使用 `variables.css` 里的变量，不建议再写一套硬编码颜色。

- [navigation.css](g:\blog-hexo\blog\source\css\modules\navigation.css:1)
  导航栏文字、菜单、hover 状态。
  主要是亮色模式下的导航可读性修正。

- [code-highlight.css](g:\blog-hexo\blog\source\css\modules\code-highlight.css:1)
  代码高亮颜色规则。
  这里只保留“语法颜色”，高亮背景变量统一放到 `variables.css`。

- [tables.css](g:\blog-hexo\blog\source\css\modules\tables.css:1)
  文章表格样式。
  包括边框色、隔行背景、亮暗主题下的透明度。

- [typography.css](g:\blog-hexo\blog\source\css\modules\typography.css:1)
  正文排版相关。
  例如正文两端对齐、视频自适应、Mermaid 背景透明。

- [header-text.css](g:\blog-hexo\blog\source\css\modules\header-text.css:1)
  页头标题文字颜色。
  只管 `#page-header .page-title`。

- [footer.css](g:\blog-hexo\blog\source\css\modules\footer.css:1)
  页脚文字颜色和阴影清理。
  以后 footer 看不清、想换颜色，就改这里。

- [post-meta.css](g:\blog-hexo\blog\source\css\modules\post-meta.css:1)
  文章头部元信息、版权区、标签、分享图标、上一篇/下一篇信息的文字颜色。
  这是从原来的暗色修复文件里拆出来的“文章信息区”部分。

- [responsive.css](g:\blog-hexo\blog\source\css\modules\responsive.css:1)
  移动端样式。
  现在主要处理文章头部信息卡片在手机上的布局压缩。

## 你以后应该怎么改

可以按这个规则判断：

- 想改颜色体系：先看 `variables.css`
- 想改整站背景：看 `background.css`
- 想改卡片外观：看 `cards.css`
- 想改导航栏：看 `navigation.css`
- 想改代码高亮：看 `code-highlight.css`
- 想改文章正文排版：看 `typography.css`
- 想改手机端显示：看 `responsive.css`
- 想改页头、页脚、文章信息区文字颜色：看 `header-text.css`、`footer.css`、`post-meta.css`

## 当前整理思路

这次整理遵循两个原则：

- 入口文件尽量薄，只负责导入，不混业务样式
- 颜色尽量集中到变量里，减少同一套颜色在多个文件重复写

## 现在还可以继续优化的点

- `responsive.css` 目前只有一个断点，后面如果移动端样式多了，可以继续按模块拆，比如 `responsive-post.css`
- `navigation.css` 目前主要是亮色模式修正，如果以后暗色导航也要大量定制，可以拆成 `navigation-light.css` 和 `navigation-dark.css`
- `tables.css` 和 `code-highlight.css` 现在都比较清晰了，暂时不用再拆
