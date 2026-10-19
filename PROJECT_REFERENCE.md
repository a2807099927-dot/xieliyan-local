# 写梨眼 (XieLiYan) Tauri 2 — 项目功能清单与架构参考手册

> 版本：2.1.15（本地版）| 生成日期：2026-08-28 | 用途：新会话快速上下文

---

## 一、项目概况

| 属性 | 值 |
|------|------|
| 产品名 | 写梨眼 (XieLiYan) |
| 版本 | 2.1.15（本地版） |
| 定位 | AI 辅助小说写作桌面应用 |
| 前身 | Electron 42 版 → 全量迁移至 Tauri 2 |
| 标识符 | `com.xieliyan.app` |
| 打包目标 | Windows NSIS / macOS DMG |

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 (启用 `unstable` multi-webview) |
| 后端语言 | Rust (edition 2021) |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | TailwindCSS 3 + PostCSS |
| 状态管理 | Zustand 4 |
| 富文本编辑器 | TipTap 2 (基于 ProseMirror) |
| HTTP 客户端 | reqwest 0.12 (Rust) |
| 异步运行时 | Tokio 1 |
| 包管理 | npm (前端) / Cargo (Rust) |

---

## 二、目录结构总览

```
tauri2/
├── src-tauri/                  ← Rust 后端 (76 源文件)
│   ├── src/
│   │   ├── main.rs             — Windows 入口
│   │   ├── lib.rs              — 应用启动、命令注册、插件加载、状态管理
│   │   ├── workspace.rs        — 工作区路径管理 + Electron 旧版数据自动迁移
│   │   ├── logger.rs           — 错误日志落盘（7天自动清理）
│   │   ├── ai/                 — AI 引擎层 (适配器模式)
│   │   ├── commands/           — 所有 Tauri IPC 命令 (14 个子模块)
│   │   └── protocols/          — 自定义 URI 协议 (3个)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/           — 权限配置
│   ├── resources/              — 运行时资源 (runtime.dat / runtime.chk)
│   └── icons/                  — 应用图标
├── src/                        ← React 前端 (169 项)
│   ├── main.tsx                — React 入口 + 全局初始化
│   ├── App.tsx                 — 路由 + 主题 + 壁纸 + 工作区初始化
│   ├── pages/                  — 页面组件 (7个)
│   ├── components/             — UI 组件 (57项)
│   ├── store/                  — Zustand 状态管理 (7个 store)
│   ├── hooks/                  — React Hooks (14个)
│   ├── Agent/                  — AI Agent 写作助手 (23个文件)
│   ├── ai/                     — 前端 AI 适配层 (9个文件)
│   ├── utils/                  — 工具函数 (18个文件)
│   ├── types/                  — TypeScript 类型定义 (3个文件)
│   ├── styles/                 — 样式文件
│   ├── styles.css              — 全局 CSS (79KB)
│   ├── i18n/                   — 国际化
│   └── vendor/                 — 第三方库
├── tools/vector-lab/           — 向量检索实验室
├── scripts/                    — 构建/调试脚本 (17个)
├── ARCHITECTURE.md             — 架构文档
├── CHANGELOG.md                — 更新日志
└── MIGRATION_PLAN.md           — Electron→Tauri 迁移计划
```

---

## 三、功能模块清单

### 3.1 书架 (Bookshelf)

| 功能 | 前端 | 后端 |
|------|------|------|
| 书籍列表展示 | `pages/Bookshelf.tsx` | `commands/fs/books.rs` |
| 创建新书 | `pages/Bookshelf.tsx` | `commands/fs/books.rs` |
| 删除书籍 | `pages/Bookshelf.tsx` | `commands/fs/books.rs` |
| 封面管理 | `pages/Bookshelf.tsx` | `protocols/ly_asset.rs` |
| 书籍导入 | `components/modals/` | `commands/fs/imports.rs` |
| 书籍导出 (TXT/EPUB) | `components/modals/` | `commands/fs/exports.rs` |
| 备份/恢复 | — | `commands/fs/backup.rs` |

### 3.2 编辑器 (Editor)

| 功能 | 前端 | 后端 |
|------|------|------|
| TipTap 富文本编辑 | `components/editor/TiptapEditor.tsx` (57KB) | — |
| 章节列表 | `components/editor/ChapterList.tsx` | `commands/fs/books.rs` |
| 章节自动保存 | `hooks/useChapterPersistence.ts` | `commands/fs/books.rs` |
| 编辑器工具栏 | `components/editor/Toolbar.tsx` | — |
| 查找替换 | `components/editor/FindReplacePanel.tsx` | — |
| 右键菜单 | `components/editor/EditorContextMenu.tsx` | — |
| 角色高亮 | `components/editor/characterHighlight.ts` | — |
| 搜索高亮 | `components/editor/searchHighlight.ts` | — |
| 分屏编辑 | `store/useAppStore.ts` | — |
| 多书 Tab | `components/editor/EditorBookTabs.tsx` | — |
| 防误清空保护 | `components/editor/TiptapEditor.tsx` | — |
| 大纲向导 | `components/editor/OutlineWizard.tsx` | — |
| 工具箱弹窗 | `components/editor/ToolboxPopover.tsx` | — |
| Diff 对比卡片 | `components/editor/DiffCard.tsx` | — |
| Mini 书架 | `components/editor/MiniBookshelf.tsx` | — |

### 3.3 AI 续写 (Continuation)

| 功能 | 前端 | 后端 |
|------|------|------|
| 续写触发 | `hooks/useContinuationFlow.ts` | `commands/ai/chat.rs` |
| 流式输出 | `hooks/useAiChat.ts` | `ai/manager.rs` → SSE |
| 续写结果窗口 | `pages/ContinuationDetached.tsx` | `commands/windows/continuation.rs` |
| 引导式续写 | `components/modals/GuidedContinuationModal.tsx` | — |
| AI 结果卡片 | `components/editor/AIResultCard.tsx` | — |
| Diff 分析 | `hooks/useDiffAnalysisFlow.ts` | — |
| 中断请求 | — | `commands/ai/state.rs` |

### 3.4 AI Agent 写作助手

| 功能 | 文件 | 说明 |
|------|------|------|
| 聊天面板 UI | `Agent/AgentChatPanel.tsx` (40KB) | 独立窗口聊天界面 |
| 会话状态管理 | `Agent/useAgentSession.ts` (25KB) | 多轮对话 + 上下文维护 |
| 消息构建 | `Agent/messageBuilder.ts` (15KB) | 系统提示词 + 题材提示词组装 |
| 书籍上下文组装 | `Agent/bookContext.ts` (11KB) | 章节/大纲/设定打包 |
| 记忆库检索 | `Agent/memoryRetrieval.ts` (9KB) | 智能检索相关记忆 |
| 角色信息提取 | `Agent/roleExtractor.ts` (6KB) | 从文本中 AI 提取角色 |
| 大纲解析 | `Agent/outlineParser.ts` (9KB) | 解析 AI 生成的大纲 |
| 任务清单 | `Agent/taskSheet.ts` (6KB) | Agent 任务管理 |
| 弧线规划提示词 | `Agent/arcPlannerPrompt.ts` | 故事弧线规划 |
| 批量章节创建 | `Agent/batchChapterCreator.ts` | 批量建章 |
| 能力定义 | `Agent/capabilities.ts` | Agent 功能能力 |
| 题材包加载 | `Agent/genrePackLoader.ts` | 题材专用提示词 |
| 本地搜索 | `Agent/localSearch.ts` | 本地内容搜索 |
| 模式选择 | `Agent/patternSelector.ts` | 写作模式选择 |
| 参考构建 | `Agent/referenceBuilder.ts` (10KB) | 参考资料组装 |
| SQL 种子解析 | `Agent/sqlCraftSeedParser.ts` | 种子数据解析 |
| 编辑器 Agent 模式 | `Agent/useEditorAgentMode.ts` | 编辑器内 Agent 模式 |
| Pipeline | `Agent/pipeline.ts` | 处理管线 |
| 窗口管理 | `commands/windows/agent.rs` | Rust 端 Agent 窗口 |
| 任务准备 | `commands/agent.rs` | Rust 端任务准备 |

### 3.5 记忆库 (Memory Bank)

| 功能 | 文件 | 说明 |
|------|------|------|
| 记忆库面板 | `components/modals/MemoryBankModal.tsx` (49KB) | 章节分析/剧情推演/角色追踪 |
| 推理引擎 | `components/modals/memory-bank/inferenceEngine.ts` (27KB) | AI 推理 + 结构化分析 |
| 记忆逻辑 | `components/modals/memory-bank/memoryBankLogic.ts` (17KB) | 增删改查 + 状态管理 |
| 后端存储 | `commands/fs/memory.rs` | Rust 端记忆持久化 |

**记忆库数据模型** (`types/index.ts: ChapterMemory`):
- 章节摘要 (`summary`)
- 剧情分析 (`plotAnalysis`): 叙事链、关键节点、功能总结、获取物、联盟、关系进展
- Agent 大纲 (`agentOutline`): 场景节拍、冲突笔记、结局状态、开放伏笔
- AI 推理 (`aiInference`): 结构树、时间线事件、并行线程、预测
- 档案记录 (`archiveRecords`): 角色/物品/技能/势力/关系/伏笔/事件

### 3.6 角色管理 (Roles Panel)

| 功能 | 前端 | 后端 |
|------|------|------|
| 角色面板 | `components/panels/RolesPanel.tsx` (48KB) | — |
| 面板逻辑 | `components/panels/roles/rolePanelLogic.ts` (25KB) | — |
| 角色 CRUD | — | `commands/resources/roles.rs` |
| AI 角色提取 | — | `commands/resources/extract.rs` (24KB) |
| 分类管理 | — | `commands/resources/categories.rs` |
| 角色存储 | — | `commands/resources/storage.rs` |
| 角色清理 | — | `commands/resources/cleanup.rs` |
| 角色导入预览 | `components/modals/RoleImportPreviewModal.tsx` | — |

**角色数据模型** (`types/index.ts: RoleProfile`):
- 基础: 名字、别名、阵营、类型(主角/女主/配角/反派/龙套/NPC/势力/待分类)
- 能力: 境界、技能、装备、背包
- 剧情: 首次出场、出场章节、剧情进展
- 关系: 关系时间线事件列表
- 展示: 头像、自定义字段、备注

### 3.7 大纲看板 (Outline Board)

| 功能 | 前端 | 后端 |
|------|------|------|
| 大纲看板 (独立窗口) | `pages/OutlineBoard.tsx` (86KB) | `commands/windows/outline.rs` |
| 大纲节点 | `components/outline/OutlineNode.tsx` | — |
| 大纲树 | `components/outline/OutlineTree.tsx` (20KB) | — |
| 卷下拉 | `components/outline/VolumeDropdown.tsx` | — |

### 3.8 小说实验室 (Novel Lab)

| 功能 | 前端 | 后端 |
|------|------|------|
| 主入口 | `pages/NovelLab/index.tsx` | `commands/novel_lab/` |
| 分析面板 | `NovelLab/components/AnalysisPanel.tsx` (15KB) | `novel_lab/analysis.rs` (19KB) |
| 存档面板 | `NovelLab/components/ArchivePanel.tsx` | `novel_lab/archive.rs` |
| 浏览器面板 | `NovelLab/components/BrowserPanel.tsx` (21KB) | `commands/embedded/novel_browser.rs` |
| 爬虫面板 | `NovelLab/components/CrawlerPanel.tsx` | — |
| 章节卡片 | `NovelLab/components/ChapterCard.tsx` | `novel_lab/chapters.rs` |
| 技法分析 | `NovelLab/utils/technique-schema.ts` | — |
| 技法拆解 | `NovelLab/utils/technique-block-splitter.ts` | — |
| 冲突块 | `NovelLab/components/ConflictBlock.tsx` | — |
| 钩子布局 | `NovelLab/components/HookPlacementBlock.tsx` | — |
| 剧情摘要 | `NovelLab/components/PlotSummary.tsx` | — |
| 导入拆书 | — | `novel_lab/imports.rs` |
| 统一入口 | — | `novel_lab/unified.rs` |
| 窗口管理 | — | `commands/windows/novel_lab.rs` |

### 3.9 网文风向标 (Book Sweeper)

| 功能 | 前端 | 后端 |
|------|------|------|
| 风向标主页 | `pages/BookSweeper.tsx` (52KB) | `commands/windows/book_sweeper.rs` (17KB) |
| 起点排行榜 | — | 起点 PC/移动端 API |
| 起点三江推荐榜 | — | `m.qidian.com/sanjiang/` |
| 起点新书榜 | — | `m.qidian.com/rank/newbook/` |
| 起点收藏数并发提取 | — | futures join_all 并发 |
| 起点完整简介抓取 | — | `fetch_qidian_description` |
| 起点高清封面 | — | 阅文 CDN 规则拼装 |
| 番茄排行榜 (38分类) | — | 番茄 API 逆向 |
| 番茄在读人数 | — | `read_count` 字段 |
| 章节目录浏览 | — | 起点/番茄目录接口 |
| VIP 章节标识 | — | 起点 `sS===0` / 番茄 `needPay` |

### 3.10 AI 网页面板 (AI Web Panel)

| 功能 | 前端 | 后端 |
|------|------|------|
| AI 网页面板 | `components/panels/AiWebPanel.tsx` | `commands/windows/aiweb.rs` (18KB) |
| 注入脚本 | `components/panels/aiweb-injection.ts` (17KB) | — |
| 发送到 AI 网页 | `components/modals/SendToAiWebModal.tsx` (15KB) | — |
| 通信桥 | — | `protocols/aiweb_bridge.rs` |

### 3.11 设置系统 (Settings)

| 子面板 | 文件 | 配置内容 |
|--------|------|----------|
| AI 模型接入 | `settings/AiModelAccessTab.tsx` (13KB) | Provider/Key/端点/模型选择 |
| 文风设置 | `settings/StyleSettingsTab.tsx` | 文风预设/自定义 |
| 界面设置 | `settings/UiSettingsTab.tsx` (13KB) | 主题/壁纸/字体/缩放(50%-180%) |
| 写作习惯 | `settings/HabitSettingsTab.tsx` (11KB) | 自动保存/续写行为 |
| 存储设置 | `settings/StoreSettingsTab.tsx` (10KB) | WebDAV/备份 |
| AI 日志 | `settings/AiLogTab.tsx` | AI 调用记录查看 |
| 设置控制器 | `settings/useSettingsModalController.ts` (16KB) | 面板切换逻辑 |
| 后端配置 | `commands/config.rs` (8KB) | 加载/保存/重置 |

### 3.12 WebDAV 云同步

| 功能 | 文件 | 说明 |
|------|------|------|
| 同步逻辑 | `commands/webdav/sync.rs` (18KB) | zip 全量压缩上传/下载 |
| 协议实现 | `commands/webdav/protocol.rs` (13KB) | WebDAV PROPFIND/PUT/GET/MKCOL |
| URL 处理 | `commands/webdav/url.rs` | 路径拼接/防空斜杠 |
| XML 解析 | `commands/webdav/xml.rs` | WebDAV XML 响应解析 |
| 类型定义 | `commands/webdav/types.rs` | 数据结构 |

**同步策略**：本地 `books/**/*.{json,html}` → 内存 zip 压缩 → 坚果云 `/写梨眼/books/` 单次上传，规避频率限制。

### 3.13 多窗口管理

| 窗口 | Label | 后端文件 | 用途 |
|------|-------|----------|------|
| 主窗口 | `main` | — | 书架 + 编辑器 + 风向标 |
| Agent | `agent-window` | `windows/agent.rs` | AI 写作助手 |
| 续写结果 | `continuation-window` | `windows/continuation.rs` | AI 续写段落选择 |
| 大纲 | `outline-window` | `windows/outline.rs` | 章节大纲树 |
| 小说实验室 | `novel-lab-window` | `windows/novel_lab.rs` | 拆书 + 分析 |
| AI 网页 | `aiweb-window` | `windows/aiweb.rs` (18KB) | 内嵌 AI 网页助手 |
| 工具箱 | — | `windows/toolbox.rs` | 工具箱窗口 |
| 通用逻辑 | — | `windows/common.rs` | 窗口公共操作 |
| 窗口状态 | — | `windows/state.rs` | 窗口状态管理 |

### 3.14 UI 缩放

| 功能 | 文件 | 说明 |
|------|------|------|
| 缩放控制 | `commands/scale.rs` (6KB) | 50%-180%、5% 步长、多窗口联动 |
| 1K 屏幕自适应 | `commands/scale.rs` | 启动自动检测 → 默认 85%/75% |

### 3.15 灵感搜索

| 功能 | 文件 |
|------|------|
| 灵感搜索对话框 | `components/modals/InspirationSearchModal.tsx` (12KB) |
| 后端搜索 | `commands/ai/inspiration.rs` (6KB) |

### 3.16 其他功能

| 功能 | 文件 | 说明 |
|------|------|------|
| 自定义 TitleBar | `components/common/TitleBar.tsx` (35KB) | 所有窗口无边框自定义标题栏 |
| 浮动通知 (Island) | `components/common/Island.tsx` | Toast 风格通知系统 |
| 错误边界 | `components/common/ErrorBoundary.tsx` | React Error Boundary |
| 时间图标 | `components/common/ChronoIcon.tsx` | 时间相关图标组件 |
| Diff 审阅 | `components/common/DiffReviewModal.tsx` | Diff 审阅弹窗 |
| 日志查看/上报 | `commands/logs.rs` | 日志面板 |
| 系统信息 | `commands/system.rs` | 系统信息获取 |
| 侧边栏 | `components/GlobalSidebar.tsx` | 全局导航侧边栏 |

---

## 四、AI 引擎架构

### 4.1 Rust 后端 AI 层 (`src-tauri/src/ai/`)

```
ai/
├── types.rs        — ChatMessage, AiConfig, ChatResponse, Provider 枚举
├── manager.rs      — 路由层：根据 provider 分发到对应 adapter
├── mod.rs          — 模块导出
└── adapters/
    ├── mod.rs
    ├── openai.rs   — OpenAI 兼容 (含 DeepSeek/Grok/中转/本地) [17KB]
    ├── anthropic.rs — Anthropic Claude [7KB]
    └── gemini.rs   — Google Gemini [8KB]
```

**AI 命令模块** (`commands/ai/`):

| 文件 | 职责 |
|------|------|
| `chat.rs` | 聊天 + 流式调用入口 |
| `validate.rs` | API Key 验证 (多端点探测 + ping 回退) |
| `models.rs` | 可用模型列表获取 |
| `benchmark.rs` | 链路探测 + 延迟测试 |
| `inspiration.rs` | 灵感搜索 |
| `style.rs` | 文风分析 |
| `logs.rs` | AI 调用日志 |
| `state.rs` | 流式中断状态 |

### 4.2 前端 AI 层 (`src/ai/`)

```
ai/
├── manager.ts              — 前端 AI 调用管理器 (路由到各 adapter)
├── styleAnalyzer.ts        — 文风分析器 [12KB]
├── stylePresetCatalog.ts   — 文风预设目录
└── adapters/
    ├── base.ts             — Adapter 基类
    ├── openai.ts           — OpenAI 适配 [13KB]
    ├── anthropic.ts        — Anthropic 适配
    ├── gemini.ts           — Gemini 适配
    ├── compatibles.ts      — 兼容适配器 (中转站等)
    └── helpers.ts          — 公共辅助
```

### 4.3 AI 数据流

```
【非流式】
前端 → tauri-bridge.ts → invoke('ai_chat', {request})
  → Rust: ai_chat() → config_load() → build_ai_config()
    → manager::chat() → match provider
      → openai/anthropic/gemini adapter
        → reqwest HTTP (含系统代理 sysproxy)
          → 返回 ChatResponse → 前端

【流式】
前端 → invoke('ai_chat', {stream: true})
  → Rust: manager::chat_stream()
    → SSE 逐块读取 → app.emit("ai:stream-chunk", chunk)
      → 前端 tauriListen("ai:stream-chunk") → 实时更新 UI

【中断】
前端 → invoke('ai_abort') → Rust: 设置 abort flag → 流式循环检测退出
```

---

## 五、状态管理 (Zustand Stores)

| Store | 文件 | 主要状态 |
|-------|------|----------|
| `useAppStore` | `store/useAppStore.ts` (3KB) | 路由、活跃书ID、活跃章ID、编辑器Tab列表、分屏状态 |
| `useBookStore` | `store/useBookStore.ts` (36KB) | 书籍数据 CRUD、章节内容读写、记忆库操作、卷管理 |
| `useConfigStore` | `store/useConfigStore.ts` (12KB) | AI 配置、UI 配置、网络配置、WebDAV 配置 |
| `useIslandStore` | `store/useIslandStore.ts` (4KB) | 浮动通知队列、显示/隐藏 |
| `useEditorBridgeStore` | `store/useEditorBridgeStore.ts` (2KB) | 编辑器↔Agent 窗口通信桥数据 |
| `useEquipmentClipboard` | `store/useEquipmentClipboard.ts` (1KB) | 装备剪贴板 |

---

## 六、自定义协议

| 协议 | 文件 | 用途 |
|------|------|------|
| `ly-asset://` | `protocols/ly_asset.rs` (10KB) | 从工作区加载壁纸/封面/字体等本地资源 (解决 WebView2 限制) |
| `nb-bridge://` | `protocols/nb_bridge.rs` (4KB) | 小说实验室内嵌浏览器 ↔ 主应用通信桥 |
| `aiweb-bridge://` | `protocols/aiweb_bridge.rs` (3KB) | AI 网页面板 ↔ 主应用通信桥 |

---

## 七、数据模型与持久化

### 7.1 文件存储结构

```
workspace/
├── books/
│   └── {bookId}/
│       ├── book.json           — 书籍元数据
│       │   ├── id, title, author, cover, description
│       │   ├── chapters[]      — 章节元信息列表
│       │   ├── volumes[]       — 卷列表
│       │   ├── settings        — 书籍设置 (世界观/大纲/角色对话/主题/字体)
│       │   ├── resourceIndex   — 资源索引 (角色分类/档案/扫描状态)
│       │   ├── contextBasket[] — 上下文篮
│       │   ├── worldSettings[] — 世界设定 (知识库)
│       │   ├── worldBuilder[]  — 世界构建器
│       │   ├── memoryBank[]    — 记忆库 (章节分析)
│       │   └── outlineVision   — 大纲视觉数据
│       ├── chapters/
│       │   └── {chapterId}.html — 章节正文 (HTML)
│       └── backups/            — 自动备份
└── settings.json               — 全局用户设置
```

### 7.2 核心类型定义 (`src/types/index.ts`)

| 类型 | 用途 |
|------|------|
| `Book` | 书籍完整数据结构 |
| `Chapter` | 章节 (id/title/content/wordCount/notes/outline) |
| `Volume` | 卷 (包含章节列表) |
| `RoleProfile` | 角色档案 (名字/别名/阵营/类型/描述/技能/装备/关系) |
| `RoleCategory` | 角色分类 |
| `ChapterMemory` | 章节记忆 (摘要/剧情分析/AI推理) |
| `StoryArchiveRecord` | 档案记录 (7类: 角色/物品/技能/势力/关系/伏笔/事件) |
| `StoryArchiveBucket` | 档案桶 (聚合同一实体) |
| `StoryArchiveIndex` | 档案索引 |
| `ContextItem` | 上下文篮条目 |
| `LoreItem` | 知识库条目 |
| `WorldBuilderItem` | 世界构建条目 (5类: 世界观/地理/势力/人物/其他) |
| `AgentChapterOutline` | Agent 章节大纲 |
| `PlotNode` | 剧情节点 (4类: 背景铺垫/转折点/高潮点/其他) |
| `TokenUsage` | Token 用量统计 |

### 7.3 AI 类型 (`src/types/ai.ts`)

- `AiProvider`: 支持的 AI 提供商枚举
- `AiModel`: 模型信息
- `ChatMessage`: 聊天消息
- `ChatRequest`/`ChatResponse`: 请求/响应结构

---

## 八、IPC 桥接层

### 8.1 前端桥接

```
src/utils/electron.ts      → 重导出 tauri-bridge（Electron 兼容层，零改动迁移）
src/utils/tauri-bridge.ts   → 所有 invoke 调用的统一入口 [32KB]
```

`tauri-bridge.ts` 封装了所有 Rust 命令的 TypeScript 调用接口，按功能分组：
- **文件系统**: 书籍/章节/备份/导入/导出
- **AI**: 聊天/验证/模型/灵感搜索
- **配置**: 加载/保存/重置
- **角色**: CRUD/提取/分类
- **窗口**: 打开/关闭各子窗口
- **WebDAV**: 上传/下载/测试
- **缩放**: 获取/设置缩放
- **更新**: 检查/安装

---

## 九、Hooks 清单

| Hook | 文件 | 用途 |
|------|------|------|
| `useAiChat` | `hooks/useAiChat.ts` (9KB) | AI 聊天调用 + 流式处理 |
| `useAsyncAction` | `hooks/useAsyncAction.ts` | 异步操作封装 (loading/error) |
| `useBackdropClose` | `hooks/useBackdropClose.ts` | 点击背景关闭弹窗 |
| `useChapterPersistence` | `hooks/useChapterPersistence.ts` | 章节自动保存 |
| `useCharacterHoverCard` | `hooks/useCharacterHoverCard.ts` | 角色悬浮卡片 |
| `useContinuationFlow` | `hooks/useContinuationFlow.ts` (6KB) | AI 续写流程控制 |
| `useDiffAnalysisFlow` | `hooks/useDiffAnalysisFlow.ts` | Diff 分析流程 |
| `useDiffCardPosition` | `hooks/useDiffCardPosition.ts` | Diff 卡片定位 |
| `useEditorBridgeSync` | `hooks/useEditorBridgeSync.ts` (5KB) | 编辑器↔Agent 窗口同步 |
| `useEditorContextMenu` | `hooks/useEditorContextMenu.ts` | 编辑器右键菜单逻辑 |
| `useEditorTransactionFlow` | `hooks/useEditorTransactionFlow.ts` (13KB) | 编辑器事务流 |
| `useEscapeKey` | `hooks/useEscapeKey.ts` | ESC 键处理 |
| `useInlineSuggestionRailLayout` | `hooks/useInlineSuggestionRailLayout.ts` (5KB) | 行内建议布局 |
| `useWallpaperColor` | `hooks/useWallpaperColor.ts` | 壁纸主色提取 |

---

## 十、Rust 依赖清单

| Crate | 版本 | 用途 |
|-------|------|------|
| `tauri` | 2 (unstable) | 桌面框架 |
| `tauri-plugin-opener` | 2 | 打开外部链接 |
| `tauri-plugin-window-state` | 2 | 窗口状态持久化 |
| `tauri-plugin-dialog` | 2 | 原生对话框 |
| `tauri-plugin-fs` | 2 | 文件系统访问 |
| `serde` / `serde_json` | 1 | 序列化/反序列化 |
| `tokio` | 1 (full) | 异步运行时 |
| `reqwest` | 0.12 | HTTP 客户端 (json/stream/gzip/brotli) |
| `uuid` | 1 (v4) | UUID 生成 |
| `chrono` | 0.4 | 时间日期 |
| `sha2` | 0.10 | SHA256 哈希 |
| `base64` | 0.22 | Base64 编解码 |
| `regex` | 1 | 正则表达式 |
| `zip` | 2 | ZIP 压缩/解压 (WebDAV) |
| `anyhow` | 1 | 错误处理 |
| `image` | 0.25 | 图片处理 (封面缩略图) |
| `url` / `urlencoding` | 2 | URL 处理 |
| `encoding_rs` | 0.8 | 字符编码转换 |
| `sysproxy` | 0.3 | 系统代理探测 |
| `unicode-normalization` | 0.1 | Unicode NFC/NFD 标准化 |
| `futures-util` | 0.3 | 异步工具 (join_all 等) |
| `tokio-util` | 0.7 | Tokio 扩展 |

---

## 十一、构建与开发

### 命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | Tauri 开发模式 (前端 + Rust 热重载) |
| `npm run dev:frontend` | 仅前端 Vite 开发服务器 |
| `npm run build` | 完整构建 (TS 检查 + Vite 打包 + Rust 编译) |
| `npm run build:frontend` | 仅前端构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest 单元测试 |
| `npm run pack:win` | Windows 打包脚本 |

### 开发脚本 (`scripts/`)

| 脚本 | 用途 |
|------|------|
| `build-win.cjs` / `.ps1` | Windows 构建脚本 |
| `pack-tauri-legacy.mjs` | Tauri 旧版打包 |
| `code-stats.ps1` | 代码统计 |
| `inspect-books.ps1` | 检查书籍数据 |
| `inspect-config.ps1` | 检查配置数据 |
| `inspect-runtime.ps1` | 检查运行时资源 |
| `inspect-wallpaper.ps1` | 检查壁纸资源 |
| `tail-log.ps1` | 查看日志 |
| `gen-latest-yml.cjs` | 生成更新清单 |
| `generate-copyright-materials.mjs` | 生成版权材料 |

---

## 十二、关键设计决策

1. **无边框窗口** — 所有窗口 `decorations: false`，自定义 TitleBar (35KB 组件)
2. **Unstable Multi-Webview** — 启用 Tauri 2 unstable 特性，支持 child webview (小说实验室内嵌浏览器)
3. **Electron 兼容层** — `electron.ts` 重导出 `tauri-bridge`，旧代码零改动运行
4. **配置自动迁移** — 首次启动自动从 Electron 版 `xie-li-yan/` 目录克隆配置和数据
5. **ly-asset 协议** — 解决 WebView2 无法直接加载本地文件的限制
6. **防误清空保护** — 编辑器自动保存时检测内容是否被意外清空
7. **WebView2 防黑屏** — 定时触发 DOM 操作防止渲染暂停
8. **系统代理自动接管** — sysproxy 自动检测，所有 AI 服务开箱即用
9. **WebDAV zip 模式** — 单次上传/下载，规避坚果云频率限制
10. **Unicode NFC 标准化** — 解决 macOS NFD 编码与 WebDAV 服务端不匹配

---

## 十三、文件大小 Top 20（复杂度指标）

| 文件 | 大小 | 说明 |
|------|------|------|
| `pages/OutlineBoard.tsx` | 86KB | 大纲看板 |
| `styles.css` | 79KB | 全局样式 |
| `components/editor/TiptapEditor.tsx` | 57KB | 富文本编辑器核心 |
| `pages/BookSweeper.tsx` | 52KB | 网文风向标 |
| `components/modals/MemoryBankModal.tsx` | 49KB | 记忆库面板 |
| `components/panels/RolesPanel.tsx` | 48KB | 角色面板 |
| `Agent/AgentChatPanel.tsx` | 40KB | Agent 聊天 |
| `store/useBookStore.ts` | 36KB | 书籍 Store |
| `components/common/TitleBar.tsx` | 35KB | 标题栏 |
| `components/editor/EditorContextMenu.tsx` | 33KB | 编辑器右键菜单 |
| `utils/tauri-bridge.ts` | 32KB | IPC 桥接层 |
| `pages/Editor.tsx` | 32KB | 编辑器页面 |
| `components/editor/OutlineWizard.tsx` | 28KB | 大纲向导 |
| `memory-bank/inferenceEngine.ts` | 27KB | 记忆推理引擎 |
| `NovelLab/NovelLab.module.css` | 28KB | 小说实验室样式 |
| `Agent/useAgentSession.ts` | 25KB | Agent 会话 |
| `components/editor/FindReplacePanel.tsx` | 25KB | 查找替换 |
| `App.tsx` | 25KB | 应用根组件 |
| `commands/resources/extract.rs` | 24KB | 角色提取 |
| `components/editor/BrowserPanel.tsx` | 21KB | 浏览器面板 |

---

*本文档由 Cascade 自动生成，基于项目 v1.6.16 源码分析。*
