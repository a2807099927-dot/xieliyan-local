# 写梨眼（XieLiYan）· 本地版

AI 辅助小说写作桌面应用，Tauri 2 + React 18。这一份是我剥离出来的**纯本地版本**：
没有账号体系、没有云端会员门控、没有自动更新、没有任何服务端依赖。稿件只在自己的硬盘上。

- 所有 AI 能力都需要您自备 API Key（OpenAI 兼容端点、Anthropic、Gemini、DeepSeek、Grok、中转站、本地模型都可）
- 提示词词库内置在客户端（`src-tauri/src/prompts/`），本地解密，不联网取词
- 云备份走您自己配置的 WebDAV / 坚果云，不经过任何第三方服务器

## 快速开始

```bash
npm install
npm run dev            # tauri dev，会先由 beforeDevCommand 拉起 vite
```

出安装包（需先装好 Rust 工具链与 WebView2 / Xcode 依赖）：

```bash
npm run build          # tauri build，产物在 src-tauri/target/release/bundle/
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发运行（前端 + Rust） |
| `npm run dev:frontend` | 只起 Vite（浏览器预览，此时提示词走占位符） |
| `npm run build` | `tauri build`，出安装包 |
| `npm run build:frontend` | `tsc --noEmit` + `vite build` |
| `npm run typecheck` | 只做类型检查 |
| `npm run test` | vitest 跑 `tests/` |
| `npm run clean` | 清 `dist/` 与 release 产物 |

## 第一次运行

1. 顶栏 → 设置 → AI 模型，选一个服务商，填 API Key，点「测试连接」拉取模型列表。
2. 书架 → 新建作品，编辑器里就能用 Agent、续写、大纲看板、拆书神器等全部功能。
3. 想跨设备备份：设置 → 云同步，填您自己的 WebDAV 地址与账号。

## 技术栈

- **桌面壳**：Rust + Tauri 2（`src-tauri/`，命令按模块拆分在 `src-tauri/src/commands/`）
- **前端**：React 18 + TypeScript + Vite + TailwindCSS + Zustand + TipTap（`src/`）
- **WebView**：Windows 用 WebView2，macOS 用 WKWebView
- **AI 接入**：OpenAI 兼容 / Anthropic / Gemini，支持 SSE 流式与原生 `tools` 调用
- **多窗口**：主窗口 + Agent / 续写 / 大纲 / 小说实验室 / AI 网页 / 风向标等独立窗口，各自独立 JS 上下文

## 目录

```
├── src-tauri/         Rust 后端（commands/ 模块、ai/ 调用层、protocols/ 自定义 URI 协议、prompts/ 内置词库）
├── src/               React 前端（pages / components / store / Agent / ai / utils / hooks）
├── src-tauri/capabilities/  Tauri 权限声明
├── tests/             vitest 用例
├── scripts/           资源生成与工具脚本（地图数据、图标、词库加密）
└── docs/              设计与功能文档
```

## 数据落在哪里

工作区内按书组织，全部是可直接打开的文件：

```
workspace/books/{bookId}/
├── book.json          书目与章节元信息
├── chapters/*.html    章节正文
└── memory.json        剧情档案库
```


## 文档索引

| 文档 | 内容 |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 模块地图、数据流、多窗口与自定义协议 |
| [`PROJECT_REFERENCE.md`](./PROJECT_REFERENCE.md) | 功能清单与实现位置 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 版本变更（含被移除功能之前的历史） |
| [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) | Electron → Tauri 迁移记录（历史文档） |

## 交流

用法、Bug、功能建议都可以来 QQ 群聊：https://qm.qq.com/q/LlZUAUnscu

应用内也有入口：书架页左侧栏底部、以及编辑器最右侧图标条最下方的群图标。

## 许可

本程序是自由软件，在自由软件基金会发布的 **GNU 通用公共许可证第 3 版**（GPL-3.0）条款下重新分发和/或修改，详见 [`LICENSE`](./LICENSE)。

完整条款见 GPL-3.0；要点是：可以自由使用、研究、修改并再分发本代码，但**任何基于本代码的衍生作品（包括改一改就商用的）必须同样以 GPL-3.0 开源**，并保留版权声明。

Copyright © 2026 写梨眼团队
