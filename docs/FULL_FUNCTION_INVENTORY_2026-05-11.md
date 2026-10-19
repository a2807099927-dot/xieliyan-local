# 写梨眼项目功能总表（2026-05-11）

> 检查范围：`E:\梨眼\src`、`E:\梨眼\electron`、`E:\梨眼\preload`、`E:\梨眼\shared`、`E:\梨眼\scripts`  
> 说明：本表以“当前源码实际存在的文件”为准，侧重功能职责、模块边界、用户可见能力与关键数据流。

## 1. 项目定位

| 维度 | 内容 |
| --- | --- |
| 产品形态 | Electron 桌面应用 |
| 核心用途 | AI 小说写作、章节编辑、剧情整理、角色档案管理、实验室抓取与分析 |
| 前端技术 | React 18 + TypeScript + Vite + Tailwind + Zustand + TipTap + ReactFlow |
| 主进程职责 | 窗口管理、IPC、配置、文件系统、AI 调用、插件安装、备份 |
| 多窗口形态 | 主窗口、独立大纲窗口、独立续写窗口、独立 Agent 窗口、NovelLab 窗口 |

## 2. 用户可见功能总览

| 功能域 | 当前能力 |
| --- | --- |
| 工作区 | 首次启动要求选择工作区；所有书籍、配置、记忆库、封面、壁纸、备份均围绕工作区存储 |
| 书架 | 新建作品、导入作品、搜索、编辑作品信息、设置/移除封面、删除作品、进入编辑 |
| 编辑器 | 双栏布局、章节切换、作品 Tab、章节自动保存、撤销/重做、历史快照恢复、查找替换 |
| 导出 | 导出 PDF、Markdown、TXT |
| AI 助手 | 侧栏对话、流式输出、RAG 注入、风格提示注入、联网/本地模型接入、请求取消 |
| 续写 | 引导式续写、续写结果审阅、分段采纳、重试续写、独立续写窗口 |
| Agent | 独立 Agent 工作台、按题材写作、参考章节选择、整段生成、选区重写、草稿应用 |
| 角色档案 | 分类管理角色、AI 提取角色、角色详情编辑、关系图、残留高亮清理 |
| 记忆库 | 智能整理、结构推演、章节批量分析、推演历史、剧情档案索引 |
| 大纲视图 | 章节约束、可视化大纲树、节点增删改、导入文本/JSON/AI 结构 |
| 主题外观 | 多主题、自定义主题、壁纸/视频壁纸、字体上传、亮度对比度饱和度调节 |
| 插件 | 插件安装/卸载/列出/读取代码，运行时面板、工具栏按钮、NovelLab 扩展点 |
| NovelLab | 浏览/采集章节、保存归档、批量分析、分析会话存档、归档书籍回载 |
| 备份 | 单书备份、工作区整包备份、启动补偿备份、定时自动备份 |

## 3. 架构分层

| 层级 | 目录 | 职责 |
| --- | --- | --- |
| 主进程 | `electron` | 生命周期、窗口、IPC、配置、文件、日志、AI、插件宿主 |
| 预加载 | `preload` | `contextBridge` 安全桥接，向渲染层暴露有限能力 |
| 共享契约 | `shared` | IPC 通道常量与共享类型契约 |
| 渲染层 | `src` | 页面、组件、Hook、状态管理、AI 前端适配、插件运行时 |
| 打包脚本 | `scripts` | Agent 题材包构建、Windows 安装包打包 |

## 4. 入口与主流程

| 文件 | 职责 | 关键能力 |
| --- | --- | --- |
| `E:\梨眼\electron\main.ts` | Electron 主入口 | 注册 `ly-asset://`、初始化日志、窗口、IPC、自动备份、Agent 题材包加载 |
| `E:\梨眼\preload\index.ts` | 主窗口桥接入口 | 暴露 `ai/fs/config/logs/resources/system/agent` 等 API |
| `E:\梨眼\preload\novel-lab.preload.ts` | NovelLab 桥接入口 | 暴露实验室抓取、分析、归档、窗口控制 API |
| `E:\梨眼\src\main.tsx` | 主窗口前端入口 | 渲染 `App` |
| `E:\梨眼\src\App.tsx` | 主应用壳 | 工作区初始化、主题注入、壁纸、路由、独立窗口模式切换 |
| `E:\梨眼\src\novel-lab.tsx` | NovelLab 前端入口 | 渲染实验室页面 |
| `E:\梨眼\src\pages\NovelLab\index.tsx` | 实验室总编排 | 浏览器面板、抓取面板、分析面板、归档侧栏联动 |

## 5. 主进程模块清单

| 文件 | 模块职责 | 具体功能 |
| --- | --- | --- |
| `E:\梨眼\electron\windows.ts` | 主窗口工厂 | 主窗口创建、预加载路径解析、渲染 HTML 定位、主窗口尺寸持久化、窗口诊断 |
| `E:\梨眼\electron\novel-lab-window.ts` | NovelLab 窗口 | 创建实验室独立窗口，绑定对应 preload 与 renderer |
| `E:\梨眼\electron\workspace.ts` | 工作区解析 | 解析/返回当前工作区路径 |
| `E:\梨眼\electron\config.ts` | 配置中心 | 默认配置、配置文件读取/修复、Keytar API Key 存储、保存/重置配置 |
| `E:\梨眼\electron\logger.ts` | 通用日志 | 日志目录管理、日志文件落盘、读取日志内容 |
| `E:\梨眼\electron\ai-logger.ts` | AI 日志 | 记录 AI 会话、读取 AI 请求日志、清空 AI 日志 |
| `E:\梨眼\electron\aiManager.ts` | 主进程 AI 单例 | 基于配置生成可复用 `AiManager` 实例 |
| `E:\梨眼\electron\backup.ts` | 备份调度 | 启动补偿备份、定时备份启动/停止 |
| `E:\梨眼\electron\plugin-host.ts` | 插件宿主（安装侧） | 读取插件目录、校验 manifest、安装插件包、卸载插件、读取插件代码 |
| `E:\梨眼\electron\agent-loader.ts` | Agent 题材包加载器 | 解密/校验运行时题材包、装配参考 bundle、暴露 Agent 资源状态 |
| `E:\梨眼\electron\novel-crawler.ts` | 实验室归档读写 | 保存章节、保存书籍索引、保存分析会话、列出归档、加载归档书籍 |
| `E:\梨眼\electron\novel-analyzer.ts` | 实验室分析器 | 构造分析 prompt、按模式分析章节、输出流式结果 |
| `E:\梨眼\electron\prompts\stylePresets.ts` | 文风提示词 | 内置风格预设、按分类/ID 返回风格 prompt、拼接完整风格提示 |

## 6. IPC 模块清单

| 文件 | 模块职责 | 具体功能 |
| --- | --- | --- |
| `E:\梨眼\electron\ipc\fs.ts` | 文件系统 IPC | 工作区初始化、书籍读写、章节补丁、导入 txt/docx、导出 pdf/md/txt、封面/壁纸导入、历史快照、记忆库、工作区备份 |
| `E:\梨眼\electron\ipc\ai.ts` | AI IPC | 风格 prompt 查询、AI 请求/取消、RAG 注入、模型验证、模型列表探测、链路测速、AI 日志 |
| `E:\梨眼\electron\ipc\resources.ts` | 资源/角色 IPC | 当前书资源读取、角色增删改、角色 AI 提取导入、角色详情更新、清理角色高亮残留 |
| `E:\梨眼\electron\ipc\system.ts` | 系统 IPC | 配置读写、日志查看、窗口控制、外链打开、独立窗口创建、Agent 桥接、续写桥接、插件安装管理 |
| `E:\梨眼\electron\ipc\agent.ts` | Agent IPC | Agent 任务准备、Agent 资源状态查询 |
| `E:\梨眼\electron\ipc-handlers\novel-lab.ipc.ts` | NovelLab IPC | 保存路径选择、分析启动/中止/流式回调、归档列表、分析会话保存/加载 |
| `E:\梨眼\shared\ipc-contract.ts` | IPC 契约 | 统一声明 AI、FS、Resources、System、NovelLab、Agent 等通道名 |

## 7. 书架与编辑主页面

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\pages\Bookshelf.tsx` | 书架页 | 搜索作品、新建作品、导入 txt/docx/md、编辑书名作者简介、导入/移除封面、删除作品 |
| `E:\梨眼\src\pages\Editor.tsx` | 编辑页总编排 | 左侧章节栏、作品 Tab、主编辑器、右侧 AI/角色/插件面板、历史快照弹窗、设置/记忆库/章节大纲弹窗 |
| `E:\梨眼\src\pages\ContinuationDetached.tsx` | 独立续写页 | 展示分段续写结果、选择采纳段落、重试、回传主编辑器 |
| `E:\梨眼\src\components\GlobalSidebar.tsx` | 全局侧栏 | 主界面全局导航入口 |
| `E:\梨眼\src\components\common\TitleBar.tsx` | 自定义标题栏 | 最小化、最大化、关闭；支持主窗口与实验室窗口共用 |
| `E:\梨眼\src\components\common\Island.tsx` | 全局提示层 | success / warning / error / progress 任务提示 |
| `E:\梨眼\src\components\common\ErrorBoundary.tsx` | 错误兜底 | 防止组件崩溃导致整页白屏 |
| `E:\梨眼\src\components\common\PluginModalHost.tsx` | 插件弹窗宿主 | 承接插件运行时注入的 modal |
| `E:\梨眼\src\components\common\DiffReviewModal.tsx` | 审阅弹窗 | 用于 AI 改写差异审阅 |
| `E:\梨眼\src\components\common\ChronoIcon.tsx` | 图标组件 | 统一图标渲染 |

## 8. 编辑器子模块

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\editor\TiptapEditor.tsx` | 编辑器核心容器 | TipTap 初始化、内容同步、选区处理、AI 卡片、查找替换、角色高亮、历史快照恢复 |
| `E:\梨眼\src\components\editor\Toolbar.tsx` | 顶部工具栏 | 导出、记忆库、历史、查找替换、排版、切换写作模式、撤销/重做 |
| `E:\梨眼\src\components\editor\ChapterList.tsx` | 章节列表 | 新建章节/卷、排序、切换章节、章节分卷展示 |
| `E:\梨眼\src\components\editor\EditorBookTabs.tsx` | 作品 Tab | 多作品切换、关闭 Tab、分屏编辑切换 |
| `E:\梨眼\src\components\editor\MiniBookshelf.tsx` | 迷你书架 | 编辑器内快速切换作品 |
| `E:\梨眼\src\components\editor\FindReplacePanel.tsx` | 查找替换 | 正则/大小写匹配、逐项跳转、编辑器全文替换 |
| `E:\梨眼\src\components\editor\EditorContextMenu.tsx` | 右键菜单 | 选区续写、改写、AI 操作入口 |
| `E:\梨眼\src\components\editor\AIResultCard.tsx` | AI 结果卡片 | 承载 AI 输出、插入或替换正文 |
| `E:\梨眼\src\components\editor\DiffCard.tsx` | 差异卡片 | 展示改写前后差异 |
| `E:\梨眼\src\components\editor\OutlineWizard.tsx` | 章节大纲引导 | 辅助生成章节约束/写作目标 |
| `E:\梨眼\src\components\editor\CharacterTooltip.tsx` | 角色悬浮卡 | 悬停角色查看档案摘要 |
| `E:\梨眼\src\components\editor\characterHighlight.ts` | 角色高亮扩展 | 根据角色名/别名给正文打高亮 mark |
| `E:\梨眼\src\components\editor\searchHighlight.ts` | 搜索高亮扩展 | 编辑器内搜索结果高亮 |

## 9. AI、续写与右侧面板

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\panels\AiPanel.tsx` | AI 助手面板 | 聊天、流式输出、插入正文、归档写入确认、上下文透明度预算控制 |
| `E:\梨眼\src\hooks\useAiChat.ts` | AI 会话 Hook | 单飞请求控制、流式 chunk 监听、重试、指标统计、请求取消 |
| `E:\梨眼\src\hooks\useContinuationFlow.ts` | 续写流程 | 发起引导续写、构造重试消息、维护待审阅结果、采纳段落 |
| `E:\梨眼\src\hooks\useDiffAnalysisFlow.ts` | 差异分析 | 处理改写结果与 Diff 审阅流程 |
| `E:\梨眼\src\hooks\useEditorContextMenu.ts` | 右键流程 | 管理编辑器菜单打开/关闭及菜单动作 |
| `E:\梨眼\src\hooks\useChapterPersistence.ts` | 保存流程 | 章节自动保存、状态反馈、快照策略 |
| `E:\梨眼\src\hooks\useEditorTransactionFlow.ts` | 事务流 | 监听编辑器事务、历史、选择、浮层联动 |
| `E:\梨眼\src\hooks\useEditorBridgeSync.ts` | 编辑器桥接 | 将编辑器能力注册到跨组件桥接存储 |
| `E:\梨眼\src\hooks\useDiffCardPosition.ts` | 差异卡定位 | 计算悬浮卡位置 |
| `E:\梨眼\src\hooks\useInlineSuggestionRailLayout.ts` | 行内建议布局 | 安排建议卡轨道位置 |

## 10. 角色档案与资源模块

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\panels\RolesPanel.tsx` | 角色档案主面板 | 分类查看角色、操作对话框、关系图切换 |
| `E:\梨眼\src\components\panels\roles\rolePanelLogic.ts` | 角色面板逻辑 | 角色过滤、分组、关系数据整理 |
| `E:\梨眼\src\components\panels\roles\ui\RoleCards.tsx` | 角色卡列表 | 角色卡片展示与交互 |
| `E:\梨眼\src\components\panels\roles\ui\RolePanelDialogs.tsx` | 角色对话框 | 新增/编辑/删除/合并相关弹窗 |
| `E:\梨眼\src\components\panels\roles\ui\RolePanelHeader.tsx` | 角色头部控制 | 分类切换、搜索、批量操作入口 |
| `E:\梨眼\src\components\panels\roles\ui\RoleRelationGraph.tsx` | 关系图 | 使用 ReactFlow 展示人物关系 |
| `E:\梨眼\src\utils\roleArchiveBridge.ts` | 角色与剧情档案桥 | 默认角色分类、角色类型映射、角色档案与剧情档案互相转换/合并 |

## 11. 记忆库与剧情档案

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\modals\MemoryBankModal.tsx` | 记忆库主弹窗 | 智能整理、结构推演、章节筛选、历史版本、导出 |
| `E:\梨眼\src\components\modals\memory-bank\memoryBankLogic.ts` | 记忆库逻辑 | 批处理切章、AI 分析结果转 memory、memory 合并、历史数据整理 |
| `E:\梨眼\src\components\modals\memory-bank\inferenceEngine.ts` | 推演引擎 | 宽松 JSON 解析、结构树/时间线/并行线/预测提取、推演 prompt 构造 |
| `E:\梨眼\src\components\modals\memory-bank\utils.ts` | UI 工具 | stripHtml、时间顺序解析、伏笔判断、状态颜色 |
| `E:\梨眼\src\components\modals\memory-bank\ui\ChapterSidebar.tsx` | 章节侧栏 | 章节筛选、范围选择、排序 |
| `E:\梨眼\src\components\modals\memory-bank\ui\InferencePanel.tsx` | 推演面板 | 推演结果渲染、导出、历史查看 |
| `E:\梨眼\src\components\modals\memory-bank\ui\InferenceTreeView.tsx` | 树状视图 | 渲染结构推演树 |
| `E:\梨眼\src\components\modals\memory-bank\ui\RecoveryPromptDialog.tsx` | 恢复提示 | AI 批处理失败后的恢复提示 |
| `E:\梨眼\src\utils\storyArchiveIndex.ts` | 剧情档案索引 | 聚合剧情记录、建立搜索桶、全文检索、格式化为 prompt |

## 12. 大纲模块

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\outline\OutlineTree.tsx` | 大纲树容器 | 渲染整体大纲视图、节点树交互 |
| `E:\梨眼\src\components\outline\OutlineNode.tsx` | 单节点组件 | 标题、目标字数、实际字数、冲突信息展示与编辑 |
| `E:\梨眼\src\components\outline\VolumeDropdown.tsx` | 分卷切换 | 在卷之间快速切换 |
| `E:\梨眼\src\components\modals\ChapterOutlineModal.tsx` | 章节约束弹窗 | 编辑当前章节 outline 字段 |
| `E:\梨眼\src\utils\ovConverter.ts` | 大纲转换器 | AI 结构树转大纲节点、剧情片段打包成弧线/事件节点 |
| `E:\梨眼\src\types\ov.ts` | 大纲类型 | OutlineNode、边、视图数据类型 |

## 13. 设置中心

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\components\modals\SettingsModal.tsx` | 设置总容器 | 多 Tab 设置页切换 |
| `E:\梨眼\src\components\modals\settings\AiModelAccessTab.tsx` | 模型接入 | Provider 选择、模型拉取、连通性测试、token 使用展示 |
| `E:\梨眼\src\components\modals\settings\AiLogTab.tsx` | AI 日志 | 查看 AI 请求日志、状态、清空日志 |
| `E:\梨眼\src\components\modals\settings\HabitSettingsTab.tsx` | 写作习惯 | 正文字体、字号、字重、上传字体 |
| `E:\梨眼\src\components\modals\settings\PluginSettingsTab.tsx` | 插件管理 | 刷新插件、安装、卸载、查看插件代码 |
| `E:\梨眼\src\components\modals\settings\StoreSettingsTab.tsx` | 存储与备份 | 工作区备份、备份目录等配置 |
| `E:\梨眼\src\components\modals\settings\StyleSettingsTab.tsx` | 文风设置 | 文风预设、自定义风格提示、缓存开关 |
| `E:\梨眼\src\components\modals\settings\UiSettingsTab.tsx` | 界面设置 | 主题、壁纸、亮度、对比度、饱和度、窗口预设 |
| `E:\梨眼\src\components\modals\settings\constants.tsx` | 设置常量 | Provider 卡片、固定模型、主题列表、Tab 列表 |
| `E:\梨眼\src\components\modals\settings\types.ts` | 设置类型 | Tab、Provider 卡片等类型 |
| `E:\梨眼\src\components\modals\settings\useSettingsModalController.ts` | 设置控制器 | 草稿配置、代理配置归一化、保存控制 |

## 14. NovelLab 实验室

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\pages\NovelLab\components\BrowserPanel.tsx` | 浏览器采集面板 | 浏览目标网页、提取章节信息 |
| `E:\梨眼\src\pages\NovelLab\components\CrawlerPanel.tsx` | 抓取队列面板 | 维护章节队列、保存索引、保存章节 |
| `E:\梨眼\src\pages\NovelLab\components\AnalysisPanel.tsx` | 分析面板 | 单章/批量分析、分析模式切换、会话展示 |
| `E:\梨眼\src\pages\NovelLab\components\ArchivePanel.tsx` | 归档面板 | 列归档书、回载归档、列分析会话、恢复分析记录 |
| `E:\梨眼\src\pages\NovelLab\hooks\useCrawler.ts` | 抓取状态 | 维护抓取 session、自动保存章节、保存书籍索引 |
| `E:\梨眼\src\pages\NovelLab\hooks\useAnalysis.ts` | 分析状态 | 分析消息流、批量分析、分析中止 |
| `E:\梨眼\src\pages\NovelLab\hooks\useArchive.ts` | 归档状态 | 刷新归档列表、加载书籍、保存/加载分析会话 |
| `E:\梨眼\src\pages\NovelLab\types.ts` | 实验室类型 | 抓取 session、章节、分析消息类型 |

## 15. Agent 模块

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\Agent\AgentDetachedPage.tsx` | 独立窗口页 | 独立 Agent 页入口 |
| `E:\梨眼\src\Agent\AgentWorkspace.tsx` | Agent 工作台 | 题材选择、参考章节选择、多草稿 Tab、整段生成、聊天式选区重写、草稿插入 |
| `E:\梨眼\src\Agent\useAgentSession.ts` | Agent 会话引擎 | 规划、取参考、生成、反思、优化、重写选区、插入草稿 |
| `E:\梨眼\src\Agent\useEditorAgentMode.ts` | 编辑器 Agent 模式 | 编辑器内 Agent 相关状态桥接 |
| `E:\梨眼\src\Agent\bookContext.ts` | 参考上下文 | 记忆库章节引用、题材推断 |
| `E:\梨眼\src\Agent\taskSheet.ts` | 任务单 | 用户指令整理为 Agent task sheet |
| `E:\梨眼\src\Agent\referenceBuilder.ts` | 参考构建 | 参考 bundle 装配 |
| `E:\梨眼\src\Agent\messageBuilder.ts` | Prompt 构建 | 生成系统/用户消息 |
| `E:\梨眼\src\Agent\pipeline.ts` | Agent 题材流水线 | 题材库与生成流程组织 |
| `E:\梨眼\src\Agent\patternSelector.ts` | 模式选择 | 题材/风格匹配选择器 |
| `E:\梨眼\src\Agent\reflector.ts` | 结果反思器 | 对生成内容打分并触发优化动作 |
| `E:\梨眼\src\Agent\normalize.ts` | 数据归一化 | Agent 相关输入输出清洗 |
| `E:\梨眼\src\Agent\genrePackLoader.ts` | 本地题材包 | 读取/适配题材包 |
| `E:\梨眼\src\Agent\genreSources.ts` | 题材源 | 题材资料库访问入口 |
| `E:\梨眼\src\Agent\capabilities.ts` | 能力枚举 | Agent 可请求能力定义 |
| `E:\梨眼\src\Agent\constants.ts` | 常量 | Agent 默认常量 |
| `E:\梨眼\src\Agent\sqlCraftSeedParser.ts` | SQL 种子解析 | 解析题材种子数据 |
| `E:\梨眼\src\Agent\service.ts` | 服务层 | 组合 taskSheet 与 referenceBundle |
| `E:\梨眼\src\Agent\types.ts` | 类型定义 | AgentGenre、ReferenceBundle、DraftMeta 等 |

## 16. AI 适配层

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\ai\manager.ts` | 前端 AI 管理器 | provider 路由、RAG/style 注入、style cache、适配器调用 |
| `E:\梨眼\src\ai\stylePresets.ts` | 前端风格预设 | 预设文风选项与提示词 |
| `E:\梨眼\src\ai\adapters\base.ts` | 适配器基类 | 适配器契约定义 |
| `E:\梨眼\src\ai\adapters\openai.ts` | OpenAI 适配器 | OpenAI 文本完成/流式 |
| `E:\梨眼\src\ai\adapters\anthropic.ts` | Claude 适配器 | Anthropic 调用 |
| `E:\梨眼\src\ai\adapters\gemini.ts` | Gemini 适配器 | Gemini 调用 |
| `E:\梨眼\src\ai\adapters\compatibles.ts` | 兼容适配器集合 | `deepseek/grok/zhipu/sensenova/proxy/local/vertex_openai` 等 OpenAI 兼容端点 |
| `E:\梨眼\src\ai\adapters\helpers.ts` | 通用辅助 | 重试、错误处理等 |

## 17. 状态管理

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\store\useAppStore.ts` | 页面状态 | 路由、当前作品/章节、多作品 Tab、分屏编辑、搜索跳转 |
| `E:\梨眼\src\store\useBookStore.ts` | 领域状态核心 | 书籍加载、保存、删除、章节更新、记忆库落盘、大纲节点管理、角色档案同步 |
| `E:\梨眼\src\store\useConfigStore.ts` | 配置状态 | 配置迁移兜底、读取/保存配置、token 用量累加 |
| `E:\梨眼\src\store\useIslandStore.ts` | 通知状态 | Island 队列、自动隐藏、任务进度 |
| `E:\梨眼\src\store\usePluginStore.ts` | 插件状态 | 插件列表、运行时面板、运行时工具栏按钮、模态框、插件存储 |
| `E:\梨眼\src\store\useEditorBridgeStore.ts` | 编辑桥状态 | 注册编辑器实例能力、支持跨窗口/插件调用正文变更 |

## 18. 插件系统

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\plugins\api.ts` | 插件 API 契约 | editor/ai/data/ui/events/storage/novelLab 各命名空间定义 |
| `E:\梨眼\src\plugins\loader.ts` | 渲染层插件加载器 | 权限守卫、沙箱化执行、加载/卸载插件模块 |
| `E:\梨眼\src\plugins\runtime.ts` | 插件运行时 | 事件总线、宿主 API 注入、NovelLab snapshot、激活已安装插件 |

## 19. 底层工具与类型

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\src\types\index.ts` | 核心业务类型 | Book、Chapter、RoleProfile、Memory 等主模型 |
| `E:\梨眼\src\types\ai.ts` | AI 类型 | Provider、配置、消息、完成结果、AppConfig |
| `E:\梨眼\src\types\plugin.ts` | 插件类型 | manifest、权限、贡献点定义 |
| `E:\梨眼\src\utils\electron.ts` | 渲染桥接类型 | 从 `window.electronAPI` 读取类型化 API |
| `E:\梨眼\src\utils\chapterTemplate.ts` | 章节模板 | 默认章节 HTML、标题提取/补全 |
| `E:\梨眼\src\utils\editorUtils.ts` | 编辑辅助 | AI 错误归一化、续写文本归一化 |
| `E:\梨眼\src\utils\jsonParse.ts` | 宽松 JSON | 从 AI 文本中提取并解析 JSON |
| `E:\梨眼\src\utils\assetUrl.ts` | 资源 URL | 生成 `ly-asset://` 访问路径 |
| `E:\梨眼\src\utils\editor\helpers.ts` | 编辑器帮助函数 | 编辑器通用辅助 |
| `E:\梨眼\src\utils\editor\highlight.ts` | 高亮工具 | 编辑器高亮定位 |
| `E:\梨眼\src\utils\editor\history.ts` | 快照策略 | 是否创建快照、快照生成、清理旧历史 |
| `E:\梨眼\src\utils\editor\position.ts` | 浮层定位 | 浮动卡片安全位置计算 |
| `E:\梨眼\src\utils\editor\selection.ts` | 选区分析 | 当前段落、段落首尾、后续段落检测 |
| `E:\梨眼\src\utils\editor\text.ts` | 文本归一化 | 续写结果转小说文本、剔除章节标题行 |
| `E:\梨眼\src\vendor\minisearch.ts` | 轻量搜索 | token 化与本地搜索支持 |

## 20. 构建与运维脚本

| 文件 | 职责 | 关键功能 |
| --- | --- | --- |
| `E:\梨眼\scripts\build-agent-pack.mjs` | Agent 题材包构建 | 读取 `genre-packs`，压缩、加密、签名生成 `resources/runtime.dat` |
| `E:\梨眼\scripts\pack-win.mjs` | Windows 打包 | 清理旧产物、先构建 Agent 包、再构建 renderer/main、修剪未引用资源、调用 `electron-builder` |

## 21. 当前确认到的关键数据流

| 数据流 | 路径 |
| --- | --- |
| 作品读写 | `Bookshelf/Editor -> useBookStore -> preload electronAPI.fs -> electron/ipc/fs.ts -> workspace/books/<bookId>/book.json` |
| AI 对话 | `AiPanel/useAiChat -> preload electronAPI.ai -> electron/ipc/ai.ts -> electron/aiManager.ts -> src/ai/adapters/*` |
| 续写审阅 | `Editor/useContinuationFlow -> OPEN_CONTINUATION_WINDOW -> 独立续写窗口 -> SUBMIT_CONTINUATION_WINDOW_ACTION -> 主窗口编辑器` |
| Agent 改写 | `AgentWorkspace -> useAgentSession -> agent IPC / AI IPC -> 独立窗口桥接 -> 编辑器 apply/review` |
| 角色提取 | `RolesPanel -> resources.extractRoles -> electron/ipc/resources.ts -> aiManager.chatPrepared -> 导回 resourceIndex` |
| 记忆库存档 | `MemoryBankModal -> useBookStore.saveMemoryBank -> fs.saveMemoryBank -> memory.json + archive-index.json` |
| NovelLab 归档 | `Browser/Crawler -> novelLab preload -> electron/ipc-handlers/novel-lab.ipc.ts -> electron/novel-crawler.ts` |
| 插件运行 | `system.pluginList/pluginGetCode -> usePluginStore/runtime.ts -> loader.ts -> 运行时面板/按钮/NovelLab 扩展` |

## 22. 本次核对时顺手发现的状态说明

| 观察项 | 说明 |
| --- | --- |
| 现有模块文档 | 仓库已存在 `docs/FUNCTION_MODULES.md`，但内容与当前代码并非完全一一对应，本表按现状重整 |
| 编码状态 | 多个源码文件顶部中文注释存在乱码，推测历史编码不统一；功能逻辑不直接受影响，但维护体验较差 |
| 测试体系 | `package.json` 当前没有 `test` 脚本，仓库也未见明确单测目录 |
| IPC 设计 | 当前主链路较完整，且 `shared/ipc-contract.ts` 已作为主要通道契约源 |

