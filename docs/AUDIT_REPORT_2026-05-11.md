# 项目全面检查报告（2026-05-11）

范围：`src/`、`electron/`、`preload/`、`shared/`、`scripts/`、`electron-builder.yml`、`package.json`、`docs/`。

版本信息（来自 `package.json`）：
- app: `xie-li-yan`
- version: `1.3.9`（`buildDisplayVersion: 1.3.9.1`）
- 技术栈：Electron + React + Vite + TypeScript + Tailwind + Zustand + TipTap/ProseMirror + ReactFlow

## 1. 架构与模块边界（你现在的系统长什么样）

主进程（Electron，`electron/`）：
- 负责应用生命周期、窗口管理、配置/密钥、日志、备份、插件安装/读取、小说实验室抓取与分析、以及全部 IPC handler 注册。
- 注册自定义协议 `ly-asset://`，用来在渲染层安全访问「工作区/用户数据/受允许的用户资源（壁纸、字体等）」。

预加载层（`preload/`）：
- 通过 `contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露能力给渲染层。
- 暴露的能力大致包含：AI、FS、Config、Resources、System、Plugin、窗口控制与事件订阅等。

渲染层（React，`src/`）：
- 主要页面：书架（Bookshelf）、编辑器（Editor）、独立续写页（ContinuationDetached）、独立大纲窗口、Agent 独立页、小说实验室（NovelLab）。
- 领域状态：`useBookStore`（书/章/角色/记忆库/持久化）、`useConfigStore`（配置）、`useAppStore`（路由/窗口态）、`usePluginStore`（插件贡献点）、`useEditorBridgeStore`（编辑器桥）、`useIslandStore`（通知）。

IPC 契约（`shared/ipc-contract.ts`）：
- 定义通道名常量与类型；主进程 handler 与预加载桥应该与其保持一致。

## 2. 功能清单（用户可见 + 小功能都列出来）

下面按「用户能感知到的功能」拆分，尽量细到按钮/入口/侧栏/弹窗层级。

### 2.1 应用壳与通用体验
- 自定义无边框标题栏：最小化/最大化/关闭（`src/components/common/TitleBar.tsx` -> `electron/ipc/system.ts`）。
- 全局通知/提示（Island）：成功/警告/错误提示、可自动隐藏（`src/components/common/Island.tsx`，`useIslandStore`）。
- 全局错误边界：避免单点崩溃把整个 UI 拉死（`src/components/common/ErrorBoundary.tsx`）。
- 工作区初始化与选择：
  - 首次/缺失工作区时弹出“初始化工作区”遮罩，并可选择目录（`src/App.tsx` -> `electron/ipc/fs.ts` 的 `FS_SELECT_FOLDER`/`FS_INIT_WORKSPACE`）。
  - 工作区用于保存：书籍、章节文件、历史快照、记忆库、角色档案索引、壁纸/封面资产等。
- 主题系统：
  - 内置主题 + 自定义主题（渐变、主次色、亮度/对比度/饱和度、字体等）。
  - 自定义主题深浅色判断与文本色自动适配（`App.tsx`、`SettingsModal.tsx`）。
- 壁纸系统：
  - 支持图片壁纸与视频壁纸（`App.tsx`）。
  - 壁纸存在时为 UI 额外加 class（`wz-has-wallpaper` 等）并调整面板背景策略。
- 字体系统：
  - 支持用户上传字体并在主题中引用（`App.tsx` 中对 `uploadedFonts` 的处理；配置由设置页维护）。
- DevTools 开关入口（`App.tsx` 调用 `electronAPI.system.toggleDevTools()`）。

### 2.2 书架（作品管理）
入口：`src/pages/Bookshelf.tsx`
- 作品列表展示：
  - 书名/作者/封面展示（封面走 `ly-asset://`）。
  - 最近更新时间的相对时间展示（刚刚/分钟/小时/天）。
  - 字数统计（>= 10000 显示 “x.x 万字”）。
- 搜索/筛选：
  - 按「书名 + 作者」的包含匹配过滤。
- 新建作品：
  - 输入：书名、作者（有默认值“新书1/佚名”）。
  - 创建后自动打开编辑器，并定位到最新章节（若存在）。
- 导入作品：
  - 选择文件（txt/docx/md/markdown/任意）；
  - 导入后生成作品结构（至少会生成书籍与章节），并进入编辑器。
  - 目前导入入口命名为 `importTxt`（实现位于主进程 FS IPC）。
- 编辑作品信息：
  - 修改书名/作者/简介；
  - 选择/移除封面（封面导入通过 FS IPC 存到工作区资产目录）。
- 删除作品：
  - 二次确认弹窗；
  - 删除作品及其全部章节（不可撤销）。
- ESC 统一关闭弹窗：新建弹窗/编辑弹窗/删除确认弹窗。

### 2.3 编辑器主界面（写作/管理中枢）
入口：`src/pages/Editor.tsx`
- 顶部/布局：
  - 返回书架；
  - 编辑区最大宽度（可配置 `ui.editorMaxWidth`）；
  - 右侧面板宽度（可配置 `ui.rightPanelWidth`）；
  - 窄屏自适应缩放（`layoutScale` 逻辑，最低 0.7）。
- 书籍/章节导航：
  - 书籍 Tab（`EditorBookTabs`）；
  - 章节列表（`ChapterList`）：章节切换、（通常会包含新增/重命名/排序/删除等能力，具体以组件实现为准）；
  - 迷你书架（`MiniBookshelf`）：编辑器内快速切换作品。
- 富文本编辑：
  - TipTap 编辑器（`TiptapEditor.tsx`）：事务、选区、扩展、与保存桥接；
  - 编辑器工具栏（`Toolbar.tsx`）：导出、查找替换、历史、设置、续写等入口（详见组件实现）。
- 自动保存与保存状态：
  - 保存状态：`saving/saved/failed`；
  - 章节内容持久化：`useBookStore` -> `electron/ipc/fs.ts`（`FS_SAVE_CHAPTER_CONTENT`/`FS_PATCH_CHAPTER` 等）。
- 查找替换：
  - `FindReplacePanel.tsx`（全局面板形态）。
- 章节历史快照：
  - 打开“章节历史”弹窗；
  - 列表查看历史快照；
  - 一键恢复某个快照（触发 `writerzen:restore-snapshot` 事件并提示“正在保存...”）。
  - 快照落盘：`electron/ipc/fs.ts` `FS_SAVE_HISTORY_SNAPSHOT` / `FS_LOAD_HISTORY_SNAPSHOTS`。
- 章节大纲/约束编辑：
  - `ChapterOutlineModal`（Editor 中命名为 `plotConstraintOpen`）；
  - 保存后写回该章节的 outline（`useBookStore.setChapterOutline` -> `FS_PATCH_CHAPTER`）。
- 右侧面板（分 Tab）：
  - “助手面板”（AiPanel）
  - “角色档案”（RolesPanel）
  - 以及插件注入的 runtimePanels（`usePluginStore.runtimePanels`）。
- 独立窗口入口：
  - 小说实验室窗口（`OPEN_NOVEL_LAB_WINDOW`）；
  - 独立大纲窗口（`OPEN_OUTLINE_WINDOW`）；
  - Agent 独立窗口（`OPEN_AGENT_WINDOW`，用于更大工作台式改写/生成）。

### 2.4 AI 助手（侧栏对话 + 本地档案检索 + 结果落盘）
入口：`src/components/panels/AiPanel.tsx` + `src/hooks/useAiChat.ts` + `electron/ipc/ai.ts`
- 消息列表（用户/助手），带耗时与 token 元信息（若返回）。
- 在线/本地模式提示：
  - 在线可用时显示“自动模式”，否则退化到“本地模式”（仅本地检索，不调模型）。
- 上下文注入：
  - 基于“剧情档案索引 + 角色索引 + 章节上下文”构造 prompt（`buildStoryArchiveIndexWithRoles` 等）。
  - 有预算/条目数量控制：最大消息数、最大 scope items、最大字符数等。
- 智能意图识别（正则）：
  - 判断“需要在线推理/写作”的意图；
  - 判断“本地事实检索”的意图；
  - 判断“写入档案”的意图（触发写入确认）。
- 剧情档案写入确认（PendingArchiveWrite）：
  - 助手提出写入内容后，先弹出确认卡；
  - 用户确认后才真正写入（写入落盘由 store/FS IPC 完成）。
- 流式输出：
  - 主进程通过 `AI_STREAM_CHUNK` 推 chunk；
  - 渲染层订阅 chunk 并拼接显示。
- AI 终止/取消：
  - `AI_ABORT` 取消当前请求（主进程 AbortController）。
- 模型与 provider 能力：
  - Provider：openai / anthropic / gemini / grok / deepseek / zhipu / vertex_ai（从 `electron/ipc/ai.ts` 探测与请求中可见）。
  - 模型列表拉取：本地/远端两类（`AI_GET_LOCAL_MODELS` / `AI_GET_PROVIDER_MODELS`）。
  - 链路探测：对各 provider 的 models endpoint 做 reachability/latency 测试（`AI_BENCHMARK_LINKS`）。
- AI 日志：
  - 读取 AI 会话日志、清空日志（`AI_GET_LOGS` / `AI_CLEAR_LOGS`）。

### 2.5 续写（独立续写窗口 + Editor 触发）
入口：`src/pages/ContinuationDetached.tsx` + `electron/ipc/system.ts` + Editor 内相关入口
- 打开独立续写窗口：`OPEN_CONTINUATION_WINDOW`
- 续写窗口状态持久化：
  - 窗口 bounds 落盘到 `userData/continuation-window-state.json`
  - 下次打开可恢复位置与尺寸。
- 续写动作回传到主窗口：
  - 子窗口提交 action（acceptSelected/acceptAll/discard/retry）
  - 主进程 `mainWindow.webContents.send(CONTINUATION_WINDOW_ACTION, payload)`
  - 主窗口按 payload 执行插入/替换等逻辑（实现位于渲染层相关 hook/bridge）。

### 2.6 角色档案（角色库/分类/合并/关系图）
入口：`src/components/panels/RolesPanel.tsx` + `electron/ipc/resources.ts`
- 角色分类（按类型 view）：主角/配角/NPC/势力/全部等（以 `rolePanelLogic` 为准）。
- 势力分组视图：支持折叠、以及势力内选择某个角色卡片展开详情。
- 角色编辑：
  - 基础信息：姓名、别名、阵营/势力、类型、描述、首次登场等；
  - 扩展字段：技能/装备/道具/职业等（部分字段在资源层会归一化进 `customFields`）。
- 角色删除：
  - 删除单个角色（确认对话框）；
  - 一键清空所有角色（确认对话框）。
- 角色合并：
  - 选择主卡/副卡合并；
  - 或进入多选合并模式。
- AI 提取角色：
  - 从书籍章节范围（起止章）提取角色；
  - 结果写入 `book.resourceIndex.customCharacterCategories`；
  - 提取过程中有 recoveryPrompt（失败可继续/重试）。
- 关系图谱：
  - 角色关系网络（`RoleRelationGraph.tsx` 使用 ReactFlow）；
  - 支持选择边/查看关系细节（`selectedEdgeId` 等状态）。
- “清理残留标记”：
  - `RESOURCES_CLEANUP_RESIDUE`：从章节 content 和章节 html 文件中清除角色标记残留（可指定 roleName）。

### 2.7 剧情档案库（记忆库 + 智能整理 + 结构推演 + 历史版本）
入口：`src/components/modals/MemoryBankModal.tsx` + `electron/ipc/fs.ts`
- 总体定位：针对单章/多章做剧情分析、记忆条目生成、结构推演（树/列表）、并提供历史版本管理与导出。
- Tab：
  - “智能整理”（plot）：批量分析、生成剧情节点/摘要/关键事件等；
  - “结构推演”（inference）：把剧情与角色关系等结构化成树状推演结果（支持 tree / 其它 view）。
- RAG 开关：
  - `config.ai.ragEnabled`，UI 勾选即写回配置。
- 章节侧栏：
  - 章节筛选（keyword）；
  - 顺序切换（asc/desc，`ui.memoryBankChapterOrder`）；
  - 选择章节集合、全选可见、选择“之后全部”、按范围选择；
  - 一键批量分析；
  - 对当前章运行推演。
- 推演/分析过程：
  - 批量拆分与批大小控制（`INFERENCE_BATCH_SIZE`/`SMART_ORGANIZE_BATCH_SIZE` 等）；
  - 失败识别与恢复提示（recoveryPrompt）。
- 历史版本：
  - plot history / inference history 各自维护；
  - 加载/保存/删除条目、清空历史（`FS_LOAD_MEMORY_HISTORY` / `FS_SAVE_MEMORY_HISTORY` / `FS_DELETE_MEMORY_HISTORY` / `FS_CLEAR_MEMORY_HISTORY`）。
  - 历史 JSON 自修复：针对“缺引号”等常见损坏做 repair 并回写（`electron/ipc/fs.ts`）。
- 导出：
  - 推演结果导出 JSON / Markdown（从 `InferencePanel` 调用 FS 导出能力或渲染层下载能力，具体见实现）。
- 书籍记忆库持久化：
  - `FS_LOAD_MEMORY_BANK` / `FS_SAVE_MEMORY_BANK`。

### 2.8 小说实验室（NovelLab：抓取/浏览/分析/归档）
入口：`src/pages/NovelLab/*` + `electron/ipc-handlers/novel-lab.ipc.ts` + `electron/novel-crawler.ts` + `electron/novel-analyzer.ts`
- 作为独立窗口打开（`OPEN_NOVEL_LAB_WINDOW`）。
- 面板：
  - BrowserPanel：网页浏览/采集；
  - CrawlerPanel：抓取控制（章节列表、批量抓取、清空等）；
  - AnalysisPanel：对抓取内容运行分析（流式 chunk + done/error 事件）；
  - ArchivePanel：将抓取结果归档到指定目录，或加载已归档书籍。
- 归档与加载：
  - 选择保存目录（`NOVEL_LAB_SELECT_SAVE_PATH`）；
  - 保存单章（`NOVEL_LAB_SAVE_CHAPTER`）；
  - 保存书籍索引（`NOVEL_LAB_SAVE_BOOK_INDEX`）；
  - 列出已归档书籍（`NOVEL_LAB_LIST_ARCHIVES`）；
  - 从文件夹加载书籍（`NOVEL_LAB_LOAD_BOOK`，需要 `_index.json`）。
- 分析会话：
  - 保存分析记录（`NOVEL_LAB_SAVE_ANALYSIS`）；
  - 列出/加载分析记录（`NOVEL_LAB_LIST_ANALYSES` / `NOVEL_LAB_LOAD_ANALYSIS`）。
- 分析过程事件：
  - `NOVEL_LAB_ANALYZE`（ipcMain.on，流式）
  - `NOVEL_LAB_ANALYZE_CHUNK` / `DONE` / `ERROR`
  - `NOVEL_LAB_ANALYZE_ABORT` 取消分析。
- 配置：
  - 记录 NovelLab 的 savePath 与 lastBookPath（`CONFIG_SET_NOVEL_LAB_PATH`）。

### 2.9 Agent 工作台（大段生成/选区改写）
入口：`src/Agent/*` + `electron/ipc/agent.ts` + `electron/agent-loader.ts`
- Agent 独立窗口（大屏工作台式）：
  - 读取当前章节选区；
  - 用户用“对话”方式描述不满意点；
  - Agent 只重写选区内容（而不是整章）。
- 体裁/题材支持：
  - `urban/xuanhuan/wenyi/youxi/lishi/lishishuangwen`；
  - 对应 `src/Agent/genre-packs/*` 的 profile 与 craft seed（SQL/JSON）；
  - 根据书籍信息推断题材（`inferAgentGenreFromBook`）。
- 引用与上下文：
  - 自动收集参考章节片段（当前章/上一章/用户点名/补充参考）；
  - 构造系统提示词与用户提示词（`messageBuilder.ts`）。
- 任务准备与状态：
  - `agent.prepareTask`（IPC）用于生成 taskSheet/referenceBundle；
  - 主进程有 agent pack 的加载与状态查询（`AGENT_STATUS`）。
- 结果元信息：
  - tokens、耗时、provider/model 等（用于 UI 展示）。
- 工作区状态本地持久化：
  - 以 `writerzen:agent-workspace:${bookId}:${chapterId}` key 存储（localStorage/或其它 storage，见实现）。

### 2.10 插件系统（安装/管理/运行时贡献点）
主进程：`electron/plugin-host.ts` + IPC `PLUGIN_INSTALL/UNINSTALL/LIST/GET_CODE`
渲染层：`src/plugins/*` + `usePluginStore`
- 插件安装：
  - 从 plugin package path 安装；
  - 主进程存放插件并维护 manifest；
- 插件列表与卸载：
  - 设置页插件 tab 可刷新/安装/卸载/查看代码（`PluginSettingsTab`）。
- 插件加载与沙箱执行：
  - 渲染层 `pluginLoader.loadFromCode(manifest, code, api)`；
  - 运行时 eventBus 管理订阅；
  - 插件卸载时清理订阅与 runtime contributions。
- 插件 API（宿主能力）：
  - editor：getContent/setContent/insertText/replaceSelection（当前实现都是 append 语义，selection 尚未真正接入）；
  - ai：chat/stream；
  - data：getCurrentBook/getRoles/getConfig；
  - ui：notify/showModal/closeModal/addPanel/addToolbarButton；
  - events：on/off/emit（包含 editor/novelLab/book/app 等事件名）；
  - storage：插件隔离 KV 存储；
  - novelLab：getSession/registerAnalysisMode/registerResultPanel。

### 2.11 文件系统/导入导出/备份
主进程 FS IPC：`electron/ipc/fs.ts`
- 工作区目录管理：
  - 初始化工作区目录结构；
  - 强制路径在 workspace 内（`ensureInsideWorkspace`/`ensureWritablePath`）。
- 书籍落盘格式（按实现推断）：
  - `workspace/books/<bookId>/book.json`
  - `workspace/books/<bookId>/chapters/*.html`（章节文件也可能存在，resources 清理残留时会扫描）
- 导出：
  - 导出 PDF/MD/TXT（`FS_EXPORT_PDF/MD/TXT`）；
  - 保存任意文本文件（`FS_SAVE_TEXT_FILE`）；
  - 选择保存路径（`FS_SELECT_SAVE_PATH`）。
- 导入：
  - 导入 TXT（以及 Bookshelf 端允许选择 docx/md，但最终走 `importTxt` 入口，具体支持格式取决于 FS 实现）。
- 封面/壁纸资产管理：
  - 导入壁纸（`FS_IMPORT_WALLPAPER`）；
  - 导入书籍封面（`FS_IMPORT_BOOK_COVER`）；
  - 资产目录：`.xieliyan-assets/wallpapers`、`.xieliyan-assets/covers`。
- 书籍备份：
  - 单书备份（`FS_BACKUP_BOOK`）；
  - 工作区整包备份（`FS_BACKUP_WORKSPACE`）：扫描文件、过滤 node_modules/dist，打包为 gz（`.wzbak.gz`），并记录 `workspace.lastBackupAt`。
- 自动备份任务：
  - 启动补偿备份 + 定时自动备份（`electron/backup.ts`，由 `electron/main.ts` 启动/停止）。

## 3. IPC/能力接口总表（按契约 + 实现归类）

通道常量定义：`E:\梨眼\shared\ipc-contract.ts`

AI：
- `ai-chat` / `ai-abort` / `ai-stream-chunk` / `ai-validate`
- `ai-get-local-models` / `ai-get-provider-models`
- `ai-get-style-prompt` / `ai-benchmark-links`
- `ai-get-logs` / `ai-clear-logs`

FS：
- 选择路径：`fs-select-folder` / `fs-select-file` / `fs-select-save-path`
- 工作区：`fs-init-workspace`
- 书籍：`fs-load-books` / `fs-save-book` / `fs-delete-book`
- 章节：`fs-save-chapter-content` / `fs-patch-chapter`
- 设置：`fs-load-settings` / `fs-save-settings`
- 导入导出：`fs-export-pdf` / `fs-export-md` / `fs-export-txt` / `fs-import-txt`
- 资产：`fs-import-wallpaper` / `fs-import-book-cover`
- 记忆库：`fs-load-memory-bank` / `fs-save-memory-bank`
- 记忆历史：`fs-load-memory-history` / `fs-save-memory-history` / `fs-delete-memory-history` / `fs-clear-memory-history`
- 历史快照：`fs-save-history-snapshot` / `fs-load-history-snapshots`
- 备份：`fs-backup-book` / `fs-backup-workspace`

Config：
- `config-load` / `config-save` / `config-reset` / `config-get-api-key`
- NovelLab path：`config:set-novel-lab-path` / `config:get-novel-lab-path`

Resources（角色/资源索引）：
- `resources-get-current-book` / `resources-scan-current-book` / `resources-query-current-book`
- `resources-update-character`
- category：`add/delete/rename`
- role：`add/delete/update/import/extract/get-detail/update-detail`
- `resources-cleanup-residue`

System/Window：
- `set-window-size` / `open-external` / `open-path`
- `open-outline-window` / `open-agent-window` / `open-continuation-window` / `open-novel-lab-window`
- 子窗口桥接：`submit-agent-window-bridge-request/response` + `agent-window-bridge-request`
- continuation state：`get-continuation-window-state` + `submit-continuation-window-action` + `continuation-window-action`
- 插件：`plugin-install` / `plugin-uninstall` / `plugin-list` / `plugin-get-code`
- devtools：`toggle-devtools`
- 窗口控制：`window-minimize` / `window-maximize` / `window-close`

NovelLab：
- `novel-lab:select-save-path` / `save-chapter` / `save-book-index`
- `novel-lab:analyze` / `analyze-abort` / `analyze-chunk` / `analyze-done` / `analyze-error`
- `novel-lab:list-archives` / `load-book`
- `novel-lab:save-analysis` / `list-analyses` / `load-analysis`

Agent：
- `aux-prepare` / `aux-status`（主进程 `electron/ipc/agent.ts`）

## 4. 代码检查清单（现状核对 + 风险点 + 建议）

### 4.1 高优先级风险/不一致（建议优先处理）
- IPC 契约不一致风险（严重）：
  - `shared/ipc-contract.ts` 中 `AGENT_PREPARE_TASK = 'aux-prepare'`、`AGENT_STATUS = 'aux-status'`
  - 但 `preload/index.ts` 里暴露的 `IPC_CHANNELS.AGENT_PREPARE_TASK = 'agent-prepare-task'`、`AGENT_STATUS = 'agent-status'`
  - 这会导致渲染层通过 preload 调用 agent IPC 时“找不到 handler / 走错通道”的隐性故障（除非渲染层从不走 preload 的 agent 通道，而是另有实现）。
  - 建议：统一以 `shared/ipc-contract.ts` 为单一真相，preload 也从 shared 引入常量，避免多处魔法字符串漂移。
- 预加载层通道表与契约表漂移风险：
  - preload 自己维护了一份 `IPC_CHANNELS`，同时 shared 也维护一份；
  - 两份列表目前已出现差异（Agent/NovelLab/Config 部分字段等），长期会越来越难维护。

### 4.2 安全性检查
- `ly-asset://` 协议做了 allowRoots 限制，并显式拒绝 `..`：整体方向正确。
- FS IPC 内部对落盘路径使用 `ensureInsideWorkspace`：能有效防止 path traversal。
- 建议补充：
  - `ly-asset://` 的 `allowedUserAssets` 里把 `uploadedFonts` 的 `dataUrl` 当作路径 resolve：如果该字段实际是 data URL（`data:...`），`path.resolve` 会产生奇怪结果；建议明确该字段语义（路径 or data URL），并分支处理。
  - 对外链 `openExternal` 相关 handler（在 `system.ts`）建议对白名单协议做约束（http/https/mailto 等），避免意外调用其它协议。

### 4.3 数据一致性与并发
- 书籍写入做了写队列（`resources.ts` 的 `bookWriteQueue`、`fs.ts` 的 `flushQueue` 等）：能降低并发写互相覆盖风险。
- 历史快照/记忆历史写入采用 tmp 文件 + rename：具备原子性，抗崩溃。
- 记忆历史 JSON 自修复：对“断引号”等损坏有修复策略，实用性高。
- 建议补充：
  - 部分写入路径存在“读-改-写”窗口期，尽量都走单队列串行化（目前大部分关键路径已经这样做了）。

### 4.4 可维护性
- 已有较清晰的边界注释与模块拆分（尤其是 Editor/AiPanel/MemoryBank/NovelLab/Plugins 分区明显）。
- 风险点：
  - 很多文件在顶部出现乱码注释（看起来像编码问题）；`package.json` 的 `description/author` 也存在明显乱码。建议统一文件编码为 UTF-8（不带 BOM）并排查构建链是否在某处错误转码。

### 4.5 性能与体验
- 大文件编辑（TipTap）与 ReactFlow（关系图）对 GPU/驱动有要求：主进程提供了 `WRITERZEN_DISABLE_GPU=1` 的兜底开关，这是很好的“救火阀”。
- `AiPanel` 做了消息数与上下文大小限制：能避免 prompt 过大导致卡顿与费用暴涨。
- Editor 做了窄屏缩放：能避免小窗口 UI 爆炸。

### 4.6 测试与工程化（现状观察）
- 仓库内未看到单元测试/集成测试目录与脚本（`package.json` 也没有 `test` 脚本，README 里写的 `npm test` 目前不匹配）。
- 建议：
  - 至少给 IPC 的关键纯函数（例如：path 校验、history repair、角色归一化）补一些单测；
  - 给 preload <-> IPC contract 的一致性做一个“静态校验脚本”（CI 里跑），防止再漂移。

## 5. 汇报清单（我建议你用这份做验收/排期）

1. 功能面：按上面的 2.x 逐条对照 UI 做一次人工走查（书架、编辑器、AI、角色、记忆库、续写、Agent、NovelLab、设置、插件、备份）。
2. 契约面：统一 IPC_CHANNELS（shared 为准），清理 preload 内的重复定义。
3. 稳定性面：补齐关键错误处理与用户提示（AI 网络/鉴权/超时等已做了部分脱敏与中文提示，继续收口）。
4. 数据安全面：确认所有外部路径输入都经过 workspace 约束或协议白名单约束。
5. 工程面：补 `npm test` 或删 README 中的 test 指令；加最小测试集与一个 IPC 契约漂移校验。

