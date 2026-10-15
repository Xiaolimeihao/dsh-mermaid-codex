# dsh-mermaid-codex

[![插件生态](https://img.shields.io/badge/插件生态-topic%20dsh-4d6bfe)](https://github.com/topics/dsh)

**DSH 会话 Mermaid 图表渲染插件**：把对话里的 `mermaid` 代码块自动渲染成 **Codex 风格的图表卡片**，支持**全屏查看**和**滚轮缩放**。mermaid 引擎随包内联分发，完全离线、不依赖 CDN。

A DeepSeek Harness (DSH) web plugin that renders `mermaid` code blocks in the conversation as **Codex-style diagram cards**, with **fullscreen view** and **mouse-wheel zoom**. The mermaid engine is bundled inline — fully offline, no CDN.

## 功能 / Features

- **自动渲染**：`mermaid` / `mmd` 代码块自动变成图表卡片，支持 flowchart、时序图、状态图、类图、甘特图、思维导图等 mermaid 全家桶
- **Codex 式交互**：悬停图表右上角浮出 `⛶` 全屏 / `⋯` 更多菜单
- **滚轮缩放**（差异化能力）
  - 会话内：`Ctrl + 滚轮` 缩放（光标锚点，指哪放哪），双击恢复 1:1，普通滚轮不干扰翻页
  - 全屏模式：滚轮直接缩放 + 按住拖拽平移，双击复原
- **导出与复制**：`⋯` 菜单 → 复制为代码 / 下载图像（SVG）/ 显示源码 ⇄ 显示图表
- **流式兼容**：内容稳定后渲染，源码变化自动重画
- **失败兜底**：语法错误保留原始代码块，不吞内容
- **UI 版本戳**：插件升级后旧块自动重画，不残留旧界面

## 安装 / Install

```bash
# 从 GitHub 安装
dsh plugin --profile <你的 profile> add github:<your-github-name>/dsh-mermaid-codex

# 或克隆到本地后 link 安装
git clone https://github.com/<your-github-name>/dsh-mermaid-codex.git
dsh plugin --profile <你的 profile> add link:<克隆路径>
```

装完刷新 DSH 窗口（必要时重启一次）即可。之后所有会话中出现的 mermaid 代码块都会自动渲染为图表。

管理：侧边栏「插件」页可启用/停用；卸载 `dsh plugin --profile <profile> remove dsh-mermaid-codex`。

## 与 dsh-mermaid-render 的区别

社区已有 [dsh-mermaid-render](https://www.npmjs.com/package/dsh-mermaid-render)（by bsfeng），功能互补：

| | dsh-mermaid-render | dsh-mermaid-codex（本插件） |
| --- | --- | --- |
| 自动渲染 / 预览代码切换 | ✅ | ✅ |
| 全屏查看 | ❌（其已知限制） | ✅ |
| 滚轮缩放 / 拖拽平移 | ❌（其已知限制） | ✅ |
| 导出 | PNG + SVG | SVG |
| 深浅主题自适应 | ✅ | 计划中 |
| 提示词注入（引导模型画图） | ✅ | ❌ |
| 引擎加载 | 按需加载 | 全量内联（离线即用） |

两者可以按需选择，同时安装会有重复渲染，请只启用其一。

## 开发 / Development

```
build/                 构建工程（esbuild + mermaid）
  src/client-entry.js  源码
client.js              构建产物（发布物，无需构建即可安装）
```

修改源码后重新打包：

```bash
cd build
pnpm install           # mermaid + esbuild
node node_modules/esbuild/bin/esbuild src/client-entry.js \
  --bundle --format=iife --minify --target=es2021 \
  --outfile=../client.js
```

然后刷新 DSH 窗口查看效果。

## 已知限制 / Known limitations

- 样式使用行内 style（DSH 页面 CSP 禁止内联 `<style>`），暂为固定浅色主题，深色主题适配在路线图上
- 下载图像导出 SVG（mermaid 含 HTML 文本标签，画布栅格化 PNG 易失真）
- 流式期间"闭合"判定为启发式（内容稳定约 300ms 后渲染）

## License

[MIT](./LICENSE)
