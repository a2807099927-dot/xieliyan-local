# 功能模块清单（Tauri 2 架构 · v1.8.2）

> 范围：`tauri2/` 目录下所有参与功能的模块。  
> 更新时间：2026-05-31

---

## 1) Rust 后端（src-tauri/src/）

### 核心入口
- `lib.rs`：Tauri 应用初始化、命令注册、插件加载、窗口 clamp
- `main.rs`：程序入口
- `workspace.rs`：工作区路径解析（books_dir / config_dir）
- `logger.rs`：日志系统

### AI 模块（ai/）
- `ai/adapters/openai.rs`：OpenAI / 兼容协议适配器（含 normalize_endpoint、reasoning_content 支持、系统代理探测）
- `ai/adapters/gemini.rs`：Gemini 适配器
- `ai/adapters/anthropic.rs`：Anthropic Claude 适配器
- `ai/adapters/mod.rs`：适配器统一入口

### 命令层（commands/）

#### AI 命令（commands/ai/）
- `chat.rs`：AI 聊天主命令（流式 + 非流式、日志记录）
- `validate.rs`：API Key 验证（多端点探测 + ping 回退）
- `models.rs`：模型列表获取
- `benchmark.rs`：API 链路测速
- `logs.rs`：AI 日志环形缓冲区（100 条）
- `state.rs`：AI 模块共享状态
- `style.rs`：风格分析命令
- `style_extraction_prompt.rs`：三步风格提取提示词（编译进二进制）
- `technique_prompt.rs`：章法技法分析提示词（编译进二进制）
- `arc_planner_prompt.rs`：弧线规划提示词（编译进二进制）
- `writing_prompts.rs`：批量生成 + 故事规划提示词（编译进二进制）
- `inspiration.rs`：灵感搜索（预留）

#### 文件系统命令（commands/fs/）
- `books.rs`：书籍 CRUD、章节读写、hydrate_chapter_contents、patch_chapter
- `exports.rs`：TXT / Markdown / PDF 导出（含 strip_leading_title 去重）
- `imports.rs`：TXT / DOCX / Markdown 导入
- `memory.rs`：剧情档案库读写
- `backup.rs`：工作区备份
- `dialog.rs`：系统文件对话框
- `settings.rs`：配置读写
- `workspace.rs`：工作区初始化
- `util.rs`：strip_html / html_escape 工具

#### 窗口管理（commands/windows/）
- `novel_lab.rs`：小说实验室窗口（prevent_close + hide 模式、label 冲突防御）
- `aiweb.rs`：AI 网页窗口（DPI 修复、CloseRequested 拦截）
- `mind.rs`：思维市场窗口
- `book_sweeper.rs`：网文风向标窗口
- `outline.rs`：大纲看板窗口
- `toolbox.rs`：工具箱窗口
- `agent.rs`：Agent 独立窗口
- `continuation.rs`：续写独立窗口
- `common.rs`：窗口通用工具（focus、bounds 持久化、逻辑像素转换）
- `state.rs`：窗口状态常量与共享 Mutex

#### 内嵌浏览器（commands/embedded/）
- `novel_browser.rs`：小说实验室内嵌 child webview（创建、导航、位置同步、JS 执行、关闭）
- `state.rs`：内嵌 webview 状态管理

#### WebDAV 同步（commands/webdav/）
- `sync.rs`：zip 全量压缩上传/下载、坚果云兼容（中文路径替换、NFC/NFD、User-Agent）
- `protocol.rs`：WebDAV 协议实现
- `url.rs`：URL 路径拼接工具
- `types.rs`：同步类型定义

#### 小说实验室后端（commands/novel_lab/）
- `chapters.rs`：章节内容提取
- `imports.rs`：TXT 导入
- `analysis.rs`：AI 分析引擎（含整体拆书 prompt，编译进二进制）
- `archive.rs`：归档管理
- `paths.rs` / `paths_cfg.rs`：路径配置
- `unified.rs`：统一命令入口

#### 其他命令
- `config.rs`：应用配置命令
- `system.rs`：系统命令（窗口控制、路径打开、更新检查）
- `scale.rs`：全局缩放
- `updater.rs`：自动更新
- `legacy_auth.rs`：账号认证桥接
- `logs.rs`：通用日志
- `agent.rs`：Agent 桥接命令

### 协议（protocols/）
- `nb_bridge.rs`：nb-bridge:// 协议（小说实验室 child webview 回调通道）

---

## 2) 前端入口与壳

- `src/main.tsx`：前端入口
- `src/App.tsx`：应用根组件（主题注入、路由切换、全局缩放、Island、UpdateDialog）
- `src/pages/Bookshelf.tsx`：书架页（创建/导入/编辑/删除作品）
- `src/pages/Editor.tsx`：编辑页主编排（章节列表、编辑器、AI 面板、角色面板、底部状态栏）
- `src/pages/NovelLab/index.tsx`：小说实验室工作台

---

## 3) AI 模块（前端）

- `src/ai/manager.ts`：前端 AI 管理器（provider/model 选择、适配器调用）
- `src/ai/styleAnalyzer.ts`：三步递进式风格提取器
- `src/ai/stylePresetCatalog.ts`：文风预设目录
- `src/ai/adapters/`：前端适配器（OpenAI / Gemini / Anthropic / Vertex / 兼容协议）

---

## 4) Agent 模块

- `src/Agent/service.ts`：Agent 服务核心
- `src/Agent/pipeline.ts`：Agent 管线
- `src/Agent/AgentChatPanel.tsx`：Agent 聊天面板
- `src/Agent/useAgentSession.ts`：Agent 会话 Hook
- `src/Agent/useEditorAgentMode.ts`：编辑器 Agent 模式
- `src/Agent/messageBuilder.ts`：消息构建器
- `src/Agent/bookContext.ts`：书籍上下文提取
- `src/Agent/referenceBuilder.ts`：参考章节构建
- `src/Agent/memoryRetrieval.ts`：记忆检索
- `src/Agent/outlineParser.ts`：大纲解析
- `src/Agent/patternSelector.ts`：模式选择器
- `src/Agent/roleExtractor.ts`：角色提取
- `src/Agent/arcPlannerPrompt.ts`：弧线规划提示词
- `src/Agent/batchChapterCreator.ts`：批量章节创建
- `src/Agent/genrePackLoader.ts`：类型包加载器
- `src/Agent/genreSources.ts`：类型包数据源
- `src/Agent/localSearch.ts`：本地搜索
- `src/Agent/taskSheet.ts`：任务表
- `src/Agent/capabilities.ts`：能力声明
- `src/Agent/normalize.ts`：文本规范化
- `src/Agent/sqlCraftSeedParser.ts`：SQL 种子解析
- `src/Agent/constants.ts`：常量
- `src/Agent/types.ts`：类型定义

---

## 5) 编辑器与写作交互

- `src/components/editor/TiptapEditor.tsx`：核心富文本编辑器
- `src/components/editor/Toolbar.tsx`：编辑工具栏
- `src/components/editor/ChapterList.tsx`：章节导航（含回收站、导出菜单、目录胶囊）
- `src/components/editor/EditorBookTabs.tsx`：多书 Tab 栏（强制单行）
- `src/components/editor/EditorContextMenu.tsx`：编辑器右键菜单
- `src/components/editor/FindReplacePanel.tsx`：查找替换
- `src/components/editor/MiniBookshelf.tsx`：迷你书架
- `src/components/editor/ToolboxPopover.tsx`：工具箱浮层

---

## 6) 面板与通用组件

- `src/components/panels/RolesPanel.tsx`：角色档案管理面板
- `src/components/panels/roles/ui/RoleCards.tsx`：角色卡片（含装备/技能/关系）
- `src/components/GlobalSidebar.tsx`：全局侧边导航（含 hover 账号悬浮卡片、账号设置面板）
- `src/components/common/TitleBar.tsx`：自定义标题栏（含登录/注册弹窗、云同步下拉）
- `src/components/common/Island.tsx`：灵动岛通知
- `src/components/common/ChronoIcon.tsx`：统一图标集
- `src/components/common/ErrorBoundary.tsx`：错误边界
- `src/components/common/ManualUpdateButton.tsx`：手动更新按钮
- `src/components/common/UpdateDialog.tsx`：更新对话框

---

## 7) 弹窗系统

- `src/components/modals/SettingsModal.tsx`：设置中心
- `src/components/modals/MemoryBankModal.tsx`：剧情档案库（智能整理 + 导出）
- `src/components/modals/ChapterOutlineModal.tsx`：章节大纲编辑
- `src/components/modals/RoleImportPreviewModal.tsx`：角色导入预览
- `src/components/modals/SendToAiWebModal.tsx`：发送小说至网页助手
- `src/components/modals/settings/AiModelAccessTab.tsx`：AI 模型接入设置
- `src/components/modals/settings/StyleSettingsTab.tsx`：文风与设定
- `src/components/modals/settings/StyleExtractionModal.tsx`：AI 风格提取弹窗
- `src/components/modals/settings/UiSettingsTab.tsx`：界面与外观
- `src/components/modals/settings/HabitSettingsTab.tsx`：写作习惯
- `src/components/modals/settings/StoreSettingsTab.tsx`：存储与备份
- `src/components/modals/settings/AiLogTab.tsx`：AI 日志
- `src/components/modals/settings/PromptMarketModal.tsx`：提示词市场

---

## 8) Hooks（流程编排）

- `useAiChat.ts`：AI 对话流程（单飞行锁、重试、流式 think 标签过滤、指标采集）
- `useContinuationFlow.ts`：引导续写流程（光标定位、段落拆分、采纳/拒绝）
- `useBatchGenerate.ts`：批量章节生成（VIP 专属，逐章生成 + 自动智能整理）
- `useDiffAnalysisFlow.ts`：差异分析流程
- `useEditorTransactionFlow.ts`：编辑器事务同步（IME 组合保护、自动保存防抖）
- `useChapterPersistence.ts`：章节自动保存
- `useCharacterHoverCard.ts`：角色 hover 卡片
- `useBackdropClose.ts`：弹窗背景点击关闭
- `useAsyncAction.ts`：异步动作反馈
- `useEscapeKey.ts`：ESC 快捷关闭
- `useDiffCardPosition.ts`：差异卡定位

---

## 9) 状态管理（Zustand）

- `useAppStore.ts`：应用路由、编辑器 Tab、活动书籍
- `useBookStore.ts`：书籍/章节/角色/记忆库 CRUD 与持久化
- `useConfigStore.ts`：配置加载与保存（含 chapterWordGoal backfill）
- `useIslandStore.ts`：灵动岛通知队列
- `useUserStore.ts`：当前登录用户状态（含 VIP、inviteCode）

---

## 10) 小说实验室（NovelLab / 拆书神器）

- `src/pages/NovelLab/index.tsx`：工作台主页面（含左侧章节目录栏）
- `src/pages/NovelLab/components/BrowserPanel.tsx`：内嵌浏览器面板（child webview 位置同步、窗口恢复重建、广告链接过滤）
- `src/pages/NovelLab/components/CrawlerPanel.tsx`：抓取控制台（批量选择/删除、导入 TXT）
- `src/pages/NovelLab/components/AnalysisPanel.tsx`：分析控制台（全面分析/剧情脉络/角色分析/写作技法/章节价值、流式显示、Markdown 渲染）
- `src/pages/NovelLab/components/ArchivePanel.tsx`：归档控制台
- `src/pages/NovelLab/components/ChapterCard.tsx`：章法分析卡容器
- `src/pages/NovelLab/components/TechniqueCard.tsx`：章法卡渲染（含故事概述、剧情推进、写作技法、角色分析）
- `src/pages/NovelLab/components/PlotSummary.tsx`：剧情速览折叠区
- `src/pages/NovelLab/components/LegacyChapterCard.tsx`：旧六宫格兼容卡
- `src/pages/NovelLab/hooks/useCrawler.ts`：抓取流程
- `src/pages/NovelLab/hooks/useArchive.ts`：归档流程
- `src/pages/NovelLab/hooks/useAnalysis.ts`：分析流程（多章合并、流式、VIP 限制）
- `src/pages/NovelLab/utils/technique-schema.ts`：章法卡 JSON Schema 校验器
- `src/pages/NovelLab/utils/technique-block-splitter.ts`：[card] 块切分器
- `src/pages/NovelLab/types/technique.ts`：章法卡数据契约

---

## 11) 网文风向标（BookSweeper）

- 独立窗口，起点/番茄双平台排行榜
- 起点：月票榜、畅销榜、新书榜、三江推荐榜、签约榜、新锐人气、推荐榜
- 番茄：38 个细分类别全量接入
- 章节阅读 + AI 技法分析
- 高清封面 + 收藏数/在读人数展示

---

## 12) 思维市场（Mind Market）

- 独立窗口，贴靠主窗口右侧
- 10+ 写作桥段模板（穿越初醒、金手指觉醒、拜师、收宠、副本、古墓、瓶颈突破、闭关、宗门大比、救美引线）
- 模板包含：要点、节拍、变体、示例、可复制摘要

---

## 13) 服务端（site/）

- `site/worker-latest.js`：Cloudflare Worker 源码（API 后端）
  - 账号系统（注册/登录/改密/邮箱验证/邀请码/封禁）
  - VIP 体系（卡密兑换/状态查询/管理后台/批量赠送/剥夺）
  - 邀请奖励系统（生成链接/验证/双向奖励/上限 3 人 30 天）
  - 提示词市场（提交/审核/排行）
  - 云同步配置（WebDAV 凭据 AES-GCM 加密存储）
  - HMAC 签名验证 + tokenVersion 强制失效
  - 管理后台 Passkey（Windows Hello）二次验证
- `site-deploy/`：Cloudflare Pages 部署文件（官网/提示词市场/管理后台/思维市场/密码重置）
- `site-no-upload/worker-latest.js`：Worker 开发副本

---

## 14) 类型包（genre-packs/）

- `xuanhuan/`：玄幻
- `urban/`：都市
- `lishi/`：历史
- `lishishuangwen/`：历史爽文
- `shuangwen/`：爽文
- `wenyi/`：文娱
- `youxi/`：游戏

每个类型包含 `*_craft_seed_v*.sql`（写作种子）+ `*_genre_profile_v*.json`（类型画像）

---

## 15) 工程脚本（scripts/）

- `gen-latest-yml.cjs`：生成自动更新清单（SHA512 + 更新公告）
- `pack-win.mjs`：Windows 打包脚本
- `build-agent-pack.mjs`：Agent 包构建
- `add-headers.cjs`：文件头注入
- `gen-webdav-key.cjs`：WebDAV 加密密钥生成
- `convert-icon.py`：图标转换
- `obfuscate.cjs`：混淆脚本（已弃用，破坏 MapLibre Workers）

---

## 16) 地图模块

- `src/components/map/MapCanvas.tsx`：世界地图（MapLibre GL + CCTS 历史朝代瓦片，14 朝代切换）
- `src/components/map/MapPanel.tsx`：世界地图面板容器（登录即用）
- `src/components/map/AiMapPanel.tsx`：AI 地图（FMG iframe + 外部工具栏 + 图层预设 + 存档管理，VIP 专属）
- `public/fmg/`：Fantasy Map Generator 本地部署（含 charges/heightmaps/images 资源）
- `public/fmg/modules/map-ai-bridge.js`：AI 绘制桥接（Pointer Events → FMG Rivers API）

---

## 17) 测试覆盖（tests/）

- `messageBuilder.test.ts`：Agent 消息装配（续写/重写/规划/爽文模式）
- `arcPlannerPrompt.test.ts`：弧线规划 prompt 构建
- `memoryRetrieval.test.ts`：记忆检索
- `aiManager.test.ts`：AI 管理器（消息准备/风格注入/RAG/缓存/适配器路由）
- `editorInteraction.test.ts`：编辑器交互（废话过滤/标点修正/段落节点/错误消息）
- `continuationFlow.test.ts`：续写文本处理（换行/HTML/格式化/标题去重）
- `styleResolver.test.ts`：风格解析与注入
- `novelLabAnalysis.test.ts`：拆书分析（card 切分/格式检测/schema 校验含新字段）
- `jsonParse.test.ts`：宽松 JSON 解析
- `batchGenerate.test.ts`：批量生成上下文构建
- `mapData.test.ts`：地图数据完整性（图层预设/朝代配置/CCTS 编号）
- `technique-schema.test.ts`：章法卡 schema 校验（CP-1~CP-6）
- `technique-block-splitter.test.ts`：[card] 块切分器
- `agentSession.test.ts`：Agent 会话状态
- `bookContext.test.ts`：书籍上下文
- `capabilities.test.ts`：能力检测
- `editorText.test.ts`：编辑器文本工具
- `inferenceEngine.test.ts`：推理引擎
- `outlineParser.test.ts`：大纲解析
- `ovConverter.test.ts`：OV 格式转换
- `patternSelector.test.ts`：模式选择器
- `referenceBuilder.test.ts`：参考资料构建
- `roleExtractor.test.ts`：角色提取
- `storyArchiveIndex.test.ts`：故事存档索引
- `styleAnalyzerAndLoader.test.ts`：风格分析与加载
- `taskSheet.test.ts`：任务单构建

共 26 个测试文件，429 个测试用例。

---

## 18) 配置与构建

- `package.json`：依赖、脚本、版本（v1.8.2）
- `src-tauri/Cargo.toml`：Rust 依赖与版本
- `src-tauri/tauri.conf.json`：Tauri 配置（窗口、CSP、NSIS、更新器）
- `src-tauri/custom_installer.nsh`：NSIS 自定义安装脚本（进程终结、只读清除、路径继承）
- `src-tauri/capabilities/default.json`：权限声明
- `vite.config` / `postcss.config.js` / `tailwindcss`：前端构建链
- `.github/workflows/build-macos.yml`：macOS CI 构建

---

## 19) 已退役功能

- ❌ 插件系统（v1.6.1 退役，零用户/零插件/安全风险）
- ❌ 灵感搜索（v1.7.6 移除入口，等向量检索方案确定后重新上线）
- ❌ 书封生成（v1.7.4 移除，AI 网页已覆盖）
- ❌ 旧 Electron 架构（v1.7.6 彻底删除）
