# dsh-mermaid-codex

[![插件生态](https://img.shields.io/badge/插件生态-topic%20dsh-4d6bfe)](https://github.com/topics/dsh)

**DSH 会话 Mermaid 图表渲染插件**：把对话里的 `mermaid` 代码块自动渲染成 **Codex 风格的图表卡片**，支持**全屏查看**、**滚轮缩放**、**PNG/SVG 导出**、**复制为图片**，深浅主题自适应。mermaid 引擎随包内联分发，完全离线、不依赖 CDN。

A DeepSeek Harness (DSH) web plugin that renders `mermaid` code blocks in the conversation as **Codex-style diagram cards**, with **fullscreen view**, **mouse-wheel zoom**, **PNG/SVG export**, **copy as image**, and full **light/dark theme** support. The mermaid engine is bundled inline — fully offline, no CDN.

## 功能 / Features

- **自动渲染**：`mermaid` 代码块自动变成图表卡片（flowchart、时序图、状态图、类图、甘特图、思维导图等 mermaid 全家桶）
- **Codex 式交互**：悬停图表右上角浮出 `⛶` 全屏 / `⋯` 更多菜单
- **深浅主题自适应**：自动检测 DSH 明暗主题并重绘图表与 UI；跟随系统主题切换
- **滚轮缩放**（光标锚点，指哪放哪）
  - 会话内：`Ctrl + 滚轮` 缩放，双击恢复 1:1，普通滚轮不干扰翻页；缩放比例胶囊实时显示
  - 全屏模式：滚轮直接缩放 + 按住拖拽平移，底部胶囊工具条（`−` `+` `100%` `适应` `下载 PNG`）
- **导出与复制**
  - **下载 PNG**：白底/透明可选，1x/2x/3x 分辨率可选（偏好跨会话记忆）
  - **下载 SVG**：矢量图
  - **复制为图片**：PNG 直接进剪贴板，聊天里粘贴即发
  - **复制为代码**：Mermaid 源码到剪贴板
- **快**：打开菜单即预生成 PNG（悬停也预热），点击下载基本零等待
- **错误兜底**：渲染失败显示优雅的错误横幅 + **重试**按钮，不吞内容
- **流式兼容**：内容稳定后渲染，源码变化自动重画；UI 升级自动重画旧块不残留
- **键盘可达**：菜单方向键导航 / Esc 关闭 / 全屏 `+ - 0` 缩放快捷键
- **中英双语**：界面文案随浏览器语言自动切换

## 安装 / Install

```bash
# 从 GitHub 安装
dsh plugin --profile <你的 profile> add github:Xiaolimeihao/dsh-mermaid-codex

# 或克隆到本地后 link 安装
git clone https://github.com/Xiaolimeihao/dsh-mermaid-codex.git
dsh plugin --profile <你的 profile> add link:<克隆路径>
```

装完刷新 DSH 窗口（必要时重启一次）即可。之后所有会话中出现的 mermaid 代码块都会自动渲染为图表。

管理：侧边栏「插件」页可启用/停用；卸载 `dsh plugin --profile <profile> remove dsh-mermaid-codex`。

## 开发 / Development

```
build/
  src/client-entry.js   源码（唯一手写文件）
  build.mjs             构建脚本（esbuild 打包为单 IIFE）
  run-tests.mjs         回归测试（无头 Chromium）
tests/                  测试页面
client.js               构建产物（发布物，无需构建即可安装）
```

```bash
cd build && pnpm install     # mermaid + esbuild（开发依赖）
npm run build                # 重新打包 client.js
npm test                     # 回归测试（本机 Edge/Chromium）
```

回归测试固化了三个已踩过的环境坑，升级 mermaid 后必须重跑：

1. 含 foreignObject 的 SVG 画入 canvas 会污染（`toBlob` 抛 SecurityError）→ PNG 导出用 `htmlLabels:false` 纯 SVG 重渲染
2. HTML 序列化的 `&nbsp;` / `<br>` 破坏 SVG XML 解析 → 必须用 `XMLSerializer`
3. 纯 SVG 可安全栅格化出图（校验非白像素数防"空白 PNG"）

### 实现要点（环境约束）

- 页面 CSP 禁止内联 `<style>`：所有样式走行内 style 属性 + JS 事件
- mermaid.render 往 body 塞临时测量节点：统一用 `position:fixed` 离屏容器防抖动
- 导出渲染与块渲染共用串行化队列（导出独占），`htmlLabels` 配置翻转无竞态

## License

[MIT](./LICENSE)
