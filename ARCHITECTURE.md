# 写梨眼 (XieLiYan) Tauri 2 — 项目架构文档

> 版本：2.1.14 | 更新日期：2026-10-16

## 概述

写梨眼是一款 AI 辅助小说写作桌面应用，基于 Tauri 2 构建。

**技术栈**：Tauri 2 (Rust) + React 18 + TypeScript + Vite + TailwindCSS + Zustand + TipTap

---

## 目录结构

```
tauri2/
├── src-tauri/              ← Rust 后端
│   ├── src/
│   │   ├── main.rs         — Windows 入口
│   │   ├── lib.rs          — 应用启动、命令注册、插件加载
│   │   ├── workspace.rs    — 工作区路径管理 + Electron→Tauri 迁移
│   │   ├── logger.rs       — 错误日志（7天自动清理）
│   │   ├── ai/             — AI 调用层
│   │   ├── commands/       — 所有 Tauri 命令（按功能模块拆分）
│   │   ├── prompts/        — 提示词注册表 + 加密提示词
│   │   ├── genre/          — 题材包注册表
│   │   └── protocols/      — 自定义 URI 协议
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/       — 权限配置
├── src/                    ← React 前端
│   ├── main.tsx            — React 入口 + 全局初始化
│   ├── App.tsx             — 路由 + 主题 + 壁纸 + 工作区
│   ├── pages/              — 页面组件
│   ├── components/         — UI 组件
│   ├── store/              — Zustand 状态管理
│   ├── hooks/              — React Hooks
│   ├── Agent/              — AI Agent 写作助手
│   ├── workshop/           — 自动开书工坊（编排器 + 分阶段面板）
│   ├── ai/                 — 前端 AI 适配层
│   ├── i18n/               — 文案与多语言
│   ├── utils/              — 工具函数（含 tauri-bridge 兼容层）
│   ├── types/              — TypeScript 类型
│   └── styles/             — 样式文件
├── tests/                  — vitest 用例
├── scripts/                — 打包与发布脚本
└── .github/workflows/      — CI/CD
```

---

## Rust 后端模块

### 核心

| 模块 | 职责 |
|------|------|
| `lib.rs` | 应用启动：注册 URI 协议、插件、状态管理、所有命令 |
| `workspace.rs` | 工作区路径解析、Electron 旧版数据自动迁移 |
| `logger.rs` | ERROR/WARN 日志落盘，7 天自动清理 |

### 命令模块 (`commands/`)

| 模块 | 文件数 | 职责 |
|------|--------|------|
| `fs/` | 9 | 文件系统：书籍 CRUD、章节读写、历史快照、记忆库、导出、导入、备份 |
| `ai/` | 13 | AI 调用：聊天、中断、验证、模型列表、文风、日志、灵感搜索、网页搜索、提示词 |
| `cloud/` | 5 | 阿里云盘：OAuth 登录、打包上传、下载 |
| `resources/` | 6 | 角色管理：增删改查、AI 提取、分类管理 |
| `windows/` | 10 | 多窗口：Agent/续写/大纲/小说实验室/AI网页/思维市场/工具箱 |
| `webdav/` | 5 | 云同步：坚果云 WebDAV 上传/下载/测试 |
| `embedded/` | 3 | 内嵌浏览器（child webview） |
| `novel_lab/` | 8 | 小说实验室：拆书/存档/分析 |
| 单文件模块 | — | `config`（配置加载/保存/重置）、`updater`（自动更新）、`scale`（UI 缩放）、`agent`（任务准备）、`legacy_auth`（旧版 token 恢复）、`logs`（日志查看/上报）、`pay`（VIP 支付）、`secrets`（keyring 密钥存取）、`token_store`（登录 token 持久化）、`system`（系统信息）、`http_fetch`（通用 HTTP，含 SSRF 防护）、`user_skill_store`（用户技能库） |

### AI 引擎 (`ai/`)

```
ai/
├── types.rs      — 数据结构（ChatMessage, AiConfig, ChatResponse）
├── manager.rs    — 路由层：根据 provider 分发到对应 adapter
└── adapters/
    ├── openai.rs     — OpenAI 兼容（含 DeepSeek/Grok/中转/本地）
    ├── anthropic.rs  — Anthropic Claude
    └── gemini.rs     — Google Gemini
```

### 自定义协议 (`protocols/`)

| 协议 | 用途 |
|------|------|
| `ly-asset://` | 从工作区加载壁纸/封面/字体等资源 |
| `nb-bridge://` | 小说实验室内嵌浏览器通信桥 |
| `aiweb-bridge://` | AI 网页面板通信桥 |

---

## 前端模块

### 页面

| 页面 | 路由/条件 | 职责 |
|------|-----------|------|
| `Bookshelf` | `route === 'bookshelf'` | 书架：书籍列表、创建、删除 |
| `Editor` | `route === 'editor'` | 编辑器：正文编辑、AI 续写、角色面板 |
| `NovelLab` | `?novelLabDetached=1` | 小说实验室（独立窗口） |
| `ContinuationDetached` | `?continuationDetached=1` | AI 续写结果（独立窗口） |

### 状态管理 (Zustand)

| Store | 职责 |
|-------|------|
| `useAppStore` | 路由、活跃书/章、编辑器 Tab、分屏 |
| `useBookStore` | 书籍数据 CRUD、章节内容、记忆库 |
| `useConfigStore` | 全局配置（AI/UI/网络/WebDAV） |
| `useUserStore` | 用户认证、VIP 状态 |
| `useIslandStore` | 浮动通知（Island 组件） |
| `useEditorBridgeStore` | 编辑器↔Agent 窗口通信 |

### Agent 写作助手

```
Agent/
├── AgentChatPanel.tsx    — Agent 聊天面板 UI
├── useAgentSession.ts    — Agent 会话状态 Hook
├── messageBuilder.ts     — AI 消息构建（含题材提示词）
├── bookContext.ts        — 书籍上下文组装
├── memoryRetrieval.ts    — 记忆库检索
├── roleExtractor.ts      — 角色信息提取
├── outlineParser.ts      — 大纲解析
├── taskSheet.ts          — 任务清单
└── ...
```

### 桥接层

```
utils/electron.ts     → 重导出 tauri-bridge（兼容层）
utils/tauri-bridge.ts → 所有 invoke 调用的统一入口
```

---

## 数据流

### AI 调用链路

```
前端 → electronAPI.ai.chat(messages)
  → tauri-bridge.ts → invoke('ai_chat', { request })
    → Rust: ai_chat() → config_load() → build_ai_config()
      → manager::chat() → match provider
        → openai::chat() / anthropic::chat() / gemini::chat()
          → reqwest HTTP 请求 → 返回 ChatResponse
    ← 前端收到结果
```

### 流式 AI

```
前端 → invoke('ai_chat', { stream: true })
  → Rust: manager::chat_stream()
    → SSE 逐块读取 → app.emit("ai:stream-chunk", chunk)
      → 前端 tauriListen("ai:stream-chunk") → 实时更新 UI
```

### 文件存储

```
workspace/
├── books/
│   ├── {bookId}/
│   │   ├── book.json        — 书籍元数据（章节列表、角色、记忆库）
│   │   ├── chapters/
│   │   │   ├── {chapterId}.html  — 章节正文
│   │   │   └── ...
│   │   └── backups/         — 自动备份
│   └── ...
└── settings.json            — 用户设置
```

### WebDAV 同步

```
上传：workspace/books/**/*.{json,html} → 坚果云 /写梨眼/books/
下载：坚果云 /写梨眼/books/ → workspace/books/
```

---

## 多窗口架构

| 窗口 | Label | 用途 |
|------|-------|------|
| 主窗口 | `main` | 书架 + 编辑器 |
| Agent | `agent-window` | AI 写作助手 |
| 续写结果 | `continuation-window` | AI 续写段落选择 |
| 大纲 | `outline-window` | 章节大纲树 |
| 小说实验室 | `novel-lab-window` | 拆书 + 分析 |
| AI 网页 | `aiweb-window` | 内嵌 AI 网页助手 |
| 思维市场 | `mind-market` | 外部思维市场页面 |

---

## 关键设计决策

1. **无边框窗口** — 所有窗口 `decorations: false`，自定义 TitleBar
2. **unstable feature** — 启用 Tauri 2 multi-webview（child webview 用于小说实验室内嵌浏览器）
3. **兼容层** — `electron.ts` 重导出 `tauri-bridge`，让从 Electron 迁移的代码零改动运行
4. **配置自动迁移** — 首次启动自动从 Electron 版 `xie-li-yan/` 目录克隆配置
5. **ly-asset 协议** — 解决 WebView2 无法直接加载本地文件的问题
6. **防误清空保护** — 编辑器自动保存时检测内容是否被意外清空
7. **WebView2 防黑屏** — 定时触发 DOM 操作防止渲染暂停

---

## 版本历史

本文只描述当前架构，不记录增量变更。逐版变更见 [`CHANGELOG.md`](./CHANGELOG.md)，按日期的实现过程见 [`DEV_LOG.md`](./DEV_LOG.md)。
