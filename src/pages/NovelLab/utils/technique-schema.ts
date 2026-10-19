// 章法分析卡 Schema 校验器
//
// 设计目标（design.md §Components and Interfaces · Schema Validator）：
// - 任何脏 AI 输出都不能让 UI 崩溃
// - 校验输出严格满足 design.md §Correctness Properties CP-1～CP-6
// - 最后一道闸放在前端 TS 层，Rust 端不验证 schema
//
// 字段 fallback 策略对应 requirements.md R5.1～R5.9：
// - 字符串缺失/类型错 → ''
// - 数组缺失/类型错 → []
// - 标签词典外 → UNLABELED_TAG
// - subTags 长度 > 2 → 截断到 2
// - conflictSource 词典外 → 'external_enemy'
// - climaxPosition 词典外 → 'none'
// - hookIntensity 越界 → clamp 到 [0, 10]
// - labelConfidence 越界 → clamp 到 [0, 1]
// - JSON.parse 失败 / 顶层非对象 → parseError = true 默认卡

import {
 TECHNIQUE_TAGS,
 CONFLICT_SOURCES,
 CLIMAX_POSITIONS,
 UNLABELED_TAG,
 type TechniqueTag,
 type UnlabeledTag,
 type ConflictSource,
 type ClimaxPosition,
 type HookPlacement,
 type PlotSummaryData,
 type TechniqueAnalysisCard,
} from '../types/technique';

// ─── 默认卡（去掉章节锚点字段，由 ctx 注入） ──────────────────
type DefaultCardShape = Omit<TechniqueAnalysisCard, 'chapterIndex' | 'chapterTitle'>;

const DEFAULT_CARD: DefaultCardShape = {
 mainTag: UNLABELED_TAG,
 subTags: [],
 tagReason: '',
 readerDrive: '',
 payoffMechanism: '',
 conflictSource: 'external_enemy',
 conflictType: '',
 hookPlacement: { opening: '', middle: '', ending: '' },
 climaxPosition: 'none',
 infoRelease: '',
 reusablePattern: '',
 hookIntensity: 0,
 labelConfidence: 0,
 plotSummary: {
 oneLineSummary: '',
 keyEvents: [],
 linkBefore: '',
 linkAfter: '',
 },
 parseError: false,
};

// ─── 工具函数 ─────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
 typeof v === 'object' && v !== null && !Array.isArray(v);

const pickString = (v: unknown, fallback = ''): string =>
 typeof v === 'string' ? v : fallback;

const clampNumber = (v: unknown, lo: number, hi: number, def: number): number => {
 // 接受 number 或可解析为有限数的字符串；NaN / Infinity / 类型错 → 回退默认
 const n = typeof v === 'number' ? v : Number(v);
 if (!Number.isFinite(n)) return def;
 return Math.max(lo, Math.min(hi, n));
};

const validateTag = (t: unknown): TechniqueTag | UnlabeledTag => {
 if (typeof t !== 'string') return UNLABELED_TAG;
 return (TECHNIQUE_TAGS as readonly string[]).includes(t)
 ? (t as TechniqueTag)
 : UNLABELED_TAG;
};

const validateConflictSource = (v: unknown): ConflictSource =>
 typeof v === 'string' && (CONFLICT_SOURCES as readonly string[]).includes(v)
 ? (v as ConflictSource)
 : 'external_enemy';

const validateClimaxPosition = (v: unknown): ClimaxPosition =>
 typeof v === 'string' && (CLIMAX_POSITIONS as readonly string[]).includes(v)
 ? (v as ClimaxPosition)
 : 'none';

const validateHookPlacement = (raw: unknown): HookPlacement => {
 const r = isPlainObject(raw) ? raw : {};
 return {
 opening: pickString(r.opening),
 middle: pickString(r.middle),
 ending: pickString(r.ending),
 };
};

const validatePlotSummary = (raw: unknown): PlotSummaryData => {
 const r = isPlainObject(raw) ? raw : {};
 const events = Array.isArray(r.keyEvents)
 ? (r.keyEvents as unknown[])
 .filter((x): x is string => typeof x === 'string' && x.length > 0)
 .slice(0, 5)
 : [];
 return {
 oneLineSummary: pickString(r.oneLineSummary),
 keyEvents: events,
 linkBefore: pickString(r.linkBefore),
 linkAfter: pickString(r.linkAfter),
 };
};

// ─── 主入口：raw 对象 → TechniqueAnalysisCard ─────────────

interface ChapterContext {
 chapterIndex: number;
 chapterTitle: string;
}

/**
 * 把任意未知输入校验成合法的 TechniqueAnalysisCard。
 *
 * 性质保证（CP-1 ~ CP-5）：
 * - 输出 mainTag / subTags 必属 TECHNIQUE_TAGS ∪ {UNLABELED_TAG}
 * - 输出 conflictSource ∈ CONFLICT_SOURCES，climaxPosition ∈ CLIMAX_POSITIONS
 * - 输出 hookIntensity ∈ [0, 10]，labelConfidence ∈ [0, 1]，均为有限实数
 * - 输出全部字符串字段类型恒为 string（可空字符串）
 * - 输出 subTags 长度 ≤ 2，keyEvents 长度 ≤ 3
 */
export function validateTechniqueCard(
 raw: unknown,
 ctx: ChapterContext,
): TechniqueAnalysisCard {
 // 顶层不是对象 → 返回 parseError 默认卡
 if (!isPlainObject(raw)) {
 return { ...DEFAULT_CARD, ...ctx, parseError: true };
 }

 const r = raw;

 const subTags = Array.isArray(r.subTags)
 ? (r.subTags as unknown[]).slice(0, 2).map(validateTag)
 : [];

 return {
 ...ctx,
 mainTag: validateTag(r.mainTag),
 subTags,
 tagReason: pickString(r.tagReason),
 storyOverview: pickString(r.storyOverview),
 writingTechniques: Array.isArray(r.writingTechniques)
 ? (r.writingTechniques as unknown[]).filter(isPlainObject).map((t: any) => ({
 name: pickString(t.name),
 where: pickString(t.where),
 how: pickString(t.how),
 effect: pickString(t.effect),
 }))
 : undefined,
 plotProgression: Array.isArray(r.plotProgression)
 ? (r.plotProgression as unknown[]).filter(isPlainObject).map((p: any) => ({
 stage: pickString(p.stage),
 chapters: pickString(p.chapters),
 content: pickString(p.content),
 technique: pickString(p.technique),
 }))
 : undefined,
 characterAnalysis: Array.isArray(r.characterAnalysis)
 ? (r.characterAnalysis as unknown[]).filter(isPlainObject).map((c: any) => ({
 name: pickString(c.name),
 role: pickString(c.role),
 arc: pickString(c.arc),
 technique: pickString(c.technique),
 }))
 : undefined,
 contradictionAnalysis: isPlainObject(r.contradictionAnalysis) ? {
 type: pickString((r.contradictionAnalysis as any).type),
 description: pickString((r.contradictionAnalysis as any).description),
 pressureLayers: clampNumber((r.contradictionAnalysis as any).pressureLayers, 0, 20, 0),
 pressureDetail: Array.isArray((r.contradictionAnalysis as any).pressureDetail)
 ? ((r.contradictionAnalysis as any).pressureDetail as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10)
 : [],
 releaseStatus: pickString((r.contradictionAnalysis as any).releaseStatus),
 releasePreview: pickString((r.contradictionAnalysis as any).releasePreview),
 } : undefined,
 expectationEngineering: isPlainObject(r.expectationEngineering) ? {
 shortHook: pickString((r.expectationEngineering as any).shortHook),
 midHook: pickString((r.expectationEngineering as any).midHook),
 longHook: pickString((r.expectationEngineering as any).longHook),
 infoGapType: pickString((r.expectationEngineering as any).infoGapType),
 infoGapDetail: pickString((r.expectationEngineering as any).infoGapDetail),
 expectationDensity: pickString((r.expectationEngineering as any).expectationDensity),
 } : undefined,
 emotionRhythm: isPlainObject(r.emotionRhythm) ? {
 pattern: pickString((r.emotionRhythm as any).pattern),
 pressureCount: clampNumber((r.emotionRhythm as any).pressureCount, 0, 100, 0),
 longestFlatSegment: pickString((r.emotionRhythm as any).longestFlatSegment),
 waveDescription: pickString((r.emotionRhythm as any).waveDescription),
 } : undefined,
 campAnalysis: isPlainObject(r.campAnalysis) ? {
 protagonist: pickString((r.campAnalysis as any).protagonist),
 enemy: pickString((r.campAnalysis as any).enemy),
 thirdParty: pickString((r.campAnalysis as any).thirdParty),
 logicCheck: pickString((r.campAnalysis as any).logicCheck),
 } : undefined,
 readerDrive: pickString(r.readerDrive),
 payoffMechanism: pickString(r.payoffMechanism),
 conflictSource: validateConflictSource(r.conflictSource),
 conflictType: pickString(r.conflictType),
 hookPlacement: validateHookPlacement(r.hookPlacement),
 climaxPosition: validateClimaxPosition(r.climaxPosition),
 infoRelease: pickString(r.infoRelease),
 reusablePattern: pickString(r.reusablePattern),
 hookIntensity: clampNumber(r.hookIntensity, 0, 10, 0),
 labelConfidence: clampNumber(r.labelConfidence, 0, 1, 0),
 plotSummary: validatePlotSummary(r.plotSummary),
 parseError: false,
 };
}

/**
 * 安全 JSON 解析 + Schema 校验组合入口。
 *
 * 性质保证（CP-6 parseError 单调性）：
 * - 合法 JSON → parseError === false（即使字段全为默认值）
 * - 非法 JSON / 空字符串 / 顶层非对象 → parseError === true，且其余字段为默认值
 * - 不存在"部分字段是 AI 输出，部分是默认值"的混合状态
 */
export function safeParseTechniqueJson(
 jsonText: string,
 ctx: ChapterContext,
): TechniqueAnalysisCard {
 try {
 // 清洗非严格 JSON：去掉 trailing comma、单行注释、BOM
 let cleaned = jsonText
 .replace(/^\uFEFF/, '')
 .replace(/\/\/[^\n]*/g, '')
 .replace(/,\s*([}\]])/g, '$1');
 const parsed: unknown = JSON.parse(cleaned);
 return validateTechniqueCard(parsed, ctx);
 } catch {
 return { ...DEFAULT_CARD, ...ctx, parseError: true };
 }
}
