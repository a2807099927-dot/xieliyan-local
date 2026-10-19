// NovelLab 章法分析卡数据契约
//
// 本文件是 §章法曲线 spec 第一阶段的数据基线，对应：
// - requirements.md: R1.1–R1.11、R1.5、R1.6、R1.7、R1.9、R1.10、R2.1、R2.2
// - design.md : §Components and Interfaces · Data Models
// - design.md : §Correctness Properties CP-1, CP-2, CP-3, CP-4, CP-5
//
// 设计约束：
// 1) 12 个章法标签固定枚举，词典外字符串一律降级为 UNLABELED_TAG
// 2) 9 个冲突来源固定枚举，词典外回退到 'external_enemy'
// 3) 5 个高潮位置固定枚举，词典外回退到 'none'
// 4) 三段钩子位置(opening/middle/ending)缺内容时输出空字符串而不得编造
// 5) hookIntensity 限定 0–10 区间整数，labelConfidence 限定 0–1 区间浮点
//
// 本文件不引用 React / Tauri，纯 TypeScript 类型描述。

// ─── 章法标签（12 个） ─────────────────────────────────────
export const TECHNIQUE_TAGS = [
 'foundation', // 铺垫
 'hook', // 钩子
 'building', // 蓄势
 'reveal', // 释放信息
 'levelup', // 升级
 'twist', // 反转
 'facehit', // 打脸
 'climax', // 高潮
 'transition', // 承接
 'newseed', // 新的铺垫
 'payoff', // 收束兑现
 'dialogue', // 对话博弈
] as const;

export type TechniqueTag = typeof TECHNIQUE_TAGS[number];

// 词典外 / Schema 校验失败时的占位标签
// （注意：UNLABELED_TAG 不属于 TECHNIQUE_TAGS，类型上单独导出）
export const UNLABELED_TAG = 'unlabeled';
export type UnlabeledTag = typeof UNLABELED_TAG;

// ─── 冲突来源枚举（9 个） ─────────────────────────────────
export const CONFLICT_SOURCES = [
 'external_enemy', // 外部敌人
 'rule_pressure', // 规则压力
 'resource_competition', // 资源竞争
 'misunderstanding', // 误解质疑
 'time_limit', // 时间限制
 'power_gap', // 实力差距
 'identity_constraint', // 身份约束
 'inner_choice', // 内心抉择
 'relationship', // 情感亏欠
] as const;

export type ConflictSource = typeof CONFLICT_SOURCES[number];

// ─── 高潮位置枚举（5 个） ─────────────────────────────────
export const CLIMAX_POSITIONS = [
 'front', // 前置高潮
 'middle', // 中置高潮
 'back', // 后置高潮
 'multi', // 多段小高潮
 'none', // 无明显高潮
] as const;

export type ClimaxPosition = typeof CLIMAX_POSITIONS[number];

// ─── 钩子分配 ───────────────────────────────────────────
// 三段钩子任一段无内容时，对应字段输出空字符串而不得编造（R1.7、R1.8）
export interface HookPlacement {
 opening: string;
 middle: string;
 ending: string;
}

// ─── 剧情速览（折叠区数据） ──────────────────────────────
// 与章法分析卡同时产出，但默认折叠展示，权重低于章法卡（R3.3）
export interface PlotSummaryData {
 oneLineSummary: string;
 /** 0–3 条关键事件（R2.2） */
 keyEvents: string[];
 /** 与上章衔接，无则空字符串（R2.3） */
 linkBefore: string;
 /** 指向下章的悬念/钩子，无则空字符串（R2.4） */
 linkAfter: string;
}

// ─── 章法分析卡（核心数据契约） ────────────────────────────
// 字段顺序按 design.md §Components and Interfaces 的展示顺序：
// 章节锚点 → 标签 → 章法字段 → 节奏指标 → 剧情速览 → 校验状态
export interface TechniqueAnalysisCard {
 // 章节锚点
 chapterIndex: number;
 chapterTitle: string;

 // 故事概述（多章整体分析时填充）
 storyOverview?: string;

 // 标签 + 理由（R1.2、R1.3、R1.4）
 mainTag: TechniqueTag | UnlabeledTag;
 /** 长度 0–2，元素属于 TECHNIQUE_TAGS ∪ {UNLABELED_TAG} */
 subTags: Array<TechniqueTag | UnlabeledTag>;
 /** 不超过 80 个汉字的一句话理由 */
 tagReason: string;

 // 写作技法详解（多章整体分析时填充）
 writingTechniques?: Array<{
 name: string;
 where: string;
 how: string;
 effect: string;
 }>;

 // 剧情推进阶段（多章整体分析时填充）
 plotProgression?: Array<{
 stage: string;
 chapters: string;
 content: string;
 technique: string;
 }>;

 // 角色分析（多章整体分析时填充）
 characterAnalysis?: Array<{
 name: string;
 role: string;
 arc: string;
 technique: string;
 }>;

 // 章法字段（R1.11）
 readerDrive: string;
 payoffMechanism: string;
 conflictSource: ConflictSource; // R1.5
 conflictType: string; // 自由文本，对枚举的口语化说明
 hookPlacement: HookPlacement; // R1.7、R1.8
 climaxPosition: ClimaxPosition; // R1.6
 infoRelease: string;
 reusablePattern: string;

 // 深度分析嵌套字段（AI 输出的扩展分析模块）
 contradictionAnalysis?: {
 type: string;
 description: string;
 pressureLayers: number;
 pressureDetail: string[];
 releaseStatus: string;
 releasePreview: string;
 };
 expectationEngineering?: {
 shortHook: string;
 midHook: string;
 longHook: string;
 infoGapType: string;
 infoGapDetail: string;
 expectationDensity: string;
 };
 emotionRhythm?: {
 pattern: string;
 pressureCount: number;
 longestFlatSegment: string;
 waveDescription: string;
 };
 campAnalysis?: {
 protagonist: string;
 enemy: string;
 thirdParty: string;
 logicCheck: string;
 };

 // 节奏指标
 /** 0–10 整数，本章读者继续读的冲动强度（R1.9） */
 hookIntensity: number;
 /** 0–1 浮点数，对主副标签的把握程度；< 0.5 时 UI 提示标签可能不稳（R1.10、R3.5） */
 labelConfidence: number;

 // 剧情速览（R2.1）
 plotSummary: PlotSummaryData;

 // 校验状态
 /** 整体 JSON 解析失败时为 true，UI 顶部显示"AI 输出格式异常"横幅（R5.9、R5.10） */
 parseError: boolean;
}

// ─── 旧六宫格章节卡（兼容存档） ──────────────────────────
// 仅由 detectFormat='legacy-markdown' 路径产出，永远不会进入 schema 校验
// 因此不带 parseError 字段（R6.1、R6.4，CP-8）
export interface LegacyChapterCard {
 chapterIndex: number;
 chapterTitle: string;
 legacy: true;
 /** 旧六宫格的原始解析结果，用于在折叠区呈现旧数据 */
 rawSections: Array<{
 key: string;
 label: string;
 tone: string;
 points: string[];
 }>;
}

// ─── 章节卡判别联合类型 ───────────────────────────────────
// `legacy: true` 用作判别字段；`TechniqueAnalysisCard` 上不出现 `legacy` 字段
export type ChapterCardData = TechniqueAnalysisCard | LegacyChapterCard;

// ─── 类型守卫 ────────────────────────────────────────────
export function isLegacyChapterCard(card: ChapterCardData): card is LegacyChapterCard {
 return (card as LegacyChapterCard).legacy === true;
}

export function isTechniqueAnalysisCard(card: ChapterCardData): card is TechniqueAnalysisCard {
 return (card as LegacyChapterCard).legacy !== true;
}
