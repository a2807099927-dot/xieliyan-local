// Schema Validator 单元测试
//
// 覆盖范围（对应 tasks.md §2.3）：
// - 合法路径 + 合法但字段为空（GPT 补充 1）
// - 18 条脏输出矩阵：缺字段 / 类型错 / 词典外 / 越界 / 顶层非对象 等
// - Correctness Properties CP-1 ～ CP-6 全部断言

import { describe, it, expect } from 'vitest';
import {
 validateTechniqueCard,
 safeParseTechniqueJson,
} from '../technique-schema';
import {
 TECHNIQUE_TAGS,
 CONFLICT_SOURCES,
 CLIMAX_POSITIONS,
 UNLABELED_TAG,
} from '../../types/technique';

const ctx = { chapterIndex: 1, chapterTitle: '第一章 旧土' };

const fullValid = {
 mainTag: 'foundation',
 subTags: ['hook'],
 tagReason: '本章用市井细节奠定主角的乡野身份。',
 readerDrive: '想知道少年是否真没灵根。',
 payoffMechanism: '认知差铺底，等待后续兑现。',
 conflictSource: 'misunderstanding',
 conflictType: '同龄人嘲笑主角天赋平庸',
 hookPlacement: {
 opening: '少年照常被嘲笑',
 middle: '',
 ending: '道人留下铜钱叮嘱七日后开',
 },
 climaxPosition: 'back',
 infoRelease: '展示主角处境，暂不解释天赋来源',
 reusablePattern: '先让旁观者低估主角，再用陌生权威留下伏笔',
 hookIntensity: 6,
 labelConfidence: 0.82,
 plotSummary: {
 oneLineSummary: '小镇少年被嘲讽后偶遇道人',
 keyEvents: ['少年被嘲笑', '道人路过', '留下铜钱'],
 linkBefore: '',
 linkAfter: '七日后铜钱将开',
 },
};

describe('validateTechniqueCard - 合法路径', () => {
 it('完整合法 JSON 字段原样保留 + parseError=false', () => {
 const card = validateTechniqueCard(fullValid, ctx);
 expect(card.parseError).toBe(false);
 expect(card.mainTag).toBe('foundation');
 expect(card.subTags).toEqual(['hook']);
 expect(card.hookIntensity).toBe(6);
 expect(card.labelConfidence).toBeCloseTo(0.82);
 expect(card.plotSummary.keyEvents).toHaveLength(3);
 });

 // GPT 补充 1：合法但字段为空
 it('所有字符串字段为空 + 数组为空 → parseError=false（不当错误对待）', () => {
 const empty = {
 mainTag: 'foundation',
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
 };
 const card = validateTechniqueCard(empty, ctx);
 expect(card.parseError).toBe(false);
 expect(card.tagReason).toBe('');
 expect(card.subTags).toEqual([]);
 expect(card.plotSummary.keyEvents).toEqual([]);
 expect(card.plotSummary.linkAfter).toBe('');
 });
});

describe('validateTechniqueCard - 标签词典封闭（CP-1）', () => {
 it('mainTag 缺失 → UNLABELED_TAG', () => {
 const card = validateTechniqueCard({ ...fullValid, mainTag: undefined }, ctx);
 expect(card.mainTag).toBe(UNLABELED_TAG);
 });

 it('mainTag 类型为数字 → UNLABELED_TAG', () => {
 const card = validateTechniqueCard({ ...fullValid, mainTag: 42 }, ctx);
 expect(card.mainTag).toBe(UNLABELED_TAG);
 });

 it('mainTag 词典外字符串 "abc" → UNLABELED_TAG', () => {
 const card = validateTechniqueCard({ ...fullValid, mainTag: 'abc' }, ctx);
 expect(card.mainTag).toBe(UNLABELED_TAG);
 });

 it('subTags 是字符串而非数组 → []', () => {
 const card = validateTechniqueCard({ ...fullValid, subTags: 'hook' }, ctx);
 expect(card.subTags).toEqual([]);
 });

 it('subTags 长度 5 → 截断到 2', () => {
 const card = validateTechniqueCard(
 { ...fullValid, subTags: ['hook', 'levelup', 'twist', 'facehit', 'climax'] },
 ctx,
 );
 expect(card.subTags).toHaveLength(2);
 expect(card.subTags).toEqual(['hook', 'levelup']);
 });

 it('subTags 包含词典外元素 → 该元素降级为 UNLABELED_TAG', () => {
 const card = validateTechniqueCard(
 { ...fullValid, subTags: ['hook', 'random_xyz'] },
 ctx,
 );
 expect(card.subTags).toEqual(['hook', UNLABELED_TAG]);
 });

 it('CP-1: 所有输出标签都在 TECHNIQUE_TAGS ∪ {UNLABELED_TAG}', () => {
 const card = validateTechniqueCard(
 { ...fullValid, mainTag: 'crap', subTags: [123, null, 'hook', 'oof'] },
 ctx,
 );
 const allowed = new Set<string>([...TECHNIQUE_TAGS, UNLABELED_TAG]);
 expect(allowed.has(card.mainTag)).toBe(true);
 for (const t of card.subTags) {
 expect(allowed.has(t)).toBe(true);
 }
 expect(card.subTags.length).toBeLessThanOrEqual(2);
 });
});

describe('validateTechniqueCard - 枚举封闭（CP-2）', () => {
 it('conflictSource 不在词典 → external_enemy', () => {
 const card = validateTechniqueCard(
 { ...fullValid, conflictSource: 'unknown_xxx' },
 ctx,
 );
 expect(card.conflictSource).toBe('external_enemy');
 });

 it('climaxPosition 字段缺失 → none', () => {
 const card = validateTechniqueCard(
 { ...fullValid, climaxPosition: undefined },
 ctx,
 );
 expect(card.climaxPosition).toBe('none');
 });

 it('CP-2: conflictSource & climaxPosition 永远在词典内', () => {
 const card = validateTechniqueCard(
 { ...fullValid, conflictSource: null, climaxPosition: 'random' },
 ctx,
 );
 expect((CONFLICT_SOURCES as readonly string[]).includes(card.conflictSource)).toBe(true);
 expect((CLIMAX_POSITIONS as readonly string[]).includes(card.climaxPosition)).toBe(true);
 });
});

describe('validateTechniqueCard - 数值范围封闭（CP-3）', () => {
 it('hookIntensity = -3 → 0', () => {
 const card = validateTechniqueCard({ ...fullValid, hookIntensity: -3 }, ctx);
 expect(card.hookIntensity).toBe(0);
 });

 it('hookIntensity = 15 → 10', () => {
 const card = validateTechniqueCard({ ...fullValid, hookIntensity: 15 }, ctx);
 expect(card.hookIntensity).toBe(10);
 });

 it('hookIntensity = NaN / "abc" → 0', () => {
 const c1 = validateTechniqueCard({ ...fullValid, hookIntensity: NaN }, ctx);
 const c2 = validateTechniqueCard({ ...fullValid, hookIntensity: 'abc' }, ctx);
 expect(c1.hookIntensity).toBe(0);
 expect(c2.hookIntensity).toBe(0);
 });

 it('labelConfidence = 1.5 → 1', () => {
 const card = validateTechniqueCard({ ...fullValid, labelConfidence: 1.5 }, ctx);
 expect(card.labelConfidence).toBe(1);
 });

 it('CP-3: 数值字段恒在范围内且为有限实数', () => {
 const cases = [-Infinity, Infinity, NaN, '12', null, undefined, true, {}, []];
 for (const v of cases) {
 const card = validateTechniqueCard(
 { ...fullValid, hookIntensity: v, labelConfidence: v },
 ctx,
 );
 expect(card.hookIntensity).toBeGreaterThanOrEqual(0);
 expect(card.hookIntensity).toBeLessThanOrEqual(10);
 expect(Number.isFinite(card.hookIntensity)).toBe(true);
 expect(card.labelConfidence).toBeGreaterThanOrEqual(0);
 expect(card.labelConfidence).toBeLessThanOrEqual(1);
 expect(Number.isFinite(card.labelConfidence)).toBe(true);
 }
 });
});

describe('validateTechniqueCard - hookPlacement / plotSummary 容错（CP-4, CP-5）', () => {
 it('hookPlacement.opening 为数字 → ""', () => {
 const card = validateTechniqueCard(
 { ...fullValid, hookPlacement: { opening: 123, middle: '', ending: '' } },
 ctx,
 );
 expect(card.hookPlacement.opening).toBe('');
 });

 it('hookPlacement 整体缺失 → 三段全为 ""', () => {
 const card = validateTechniqueCard(
 { ...fullValid, hookPlacement: undefined },
 ctx,
 );
 expect(card.hookPlacement).toEqual({ opening: '', middle: '', ending: '' });
 });

 it('plotSummary.keyEvents 包含 null / 数字元素 → 过滤掉', () => {
 const card = validateTechniqueCard(
 {
 ...fullValid,
 plotSummary: {
 ...fullValid.plotSummary,
 keyEvents: ['有效1', null, 42, '有效2', undefined],
 },
 },
 ctx,
 );
 expect(card.plotSummary.keyEvents).toEqual(['有效1', '有效2']);
 });

 it('plotSummary.keyEvents 长度 5 → 截断到 3', () => {
 const card = validateTechniqueCard(
 {
 ...fullValid,
 plotSummary: {
 ...fullValid.plotSummary,
 keyEvents: ['e1', 'e2', 'e3', 'e4', 'e5'],
 },
 },
 ctx,
 );
 expect(card.plotSummary.keyEvents).toHaveLength(5);
 });

 it('plotSummary 整体缺失 → 默认值', () => {
 const card = validateTechniqueCard(
 { ...fullValid, plotSummary: undefined },
 ctx,
 );
 expect(card.plotSummary.oneLineSummary).toBe('');
 expect(card.plotSummary.keyEvents).toEqual([]);
 expect(card.plotSummary.linkBefore).toBe('');
 expect(card.plotSummary.linkAfter).toBe('');
 });

 it('CP-4: 全部字符串字段类型恒为 string', () => {
 const card = validateTechniqueCard(
 {
 // 全部塞错类型
 mainTag: 'foundation',
 subTags: [],
 tagReason: 123,
 readerDrive: null,
 payoffMechanism: undefined,
 conflictSource: 'external_enemy',
 conflictType: {},
 hookPlacement: { opening: 1, middle: 2, ending: 3 },
 climaxPosition: 'none',
 infoRelease: [],
 reusablePattern: false,
 hookIntensity: 0,
 labelConfidence: 0,
 plotSummary: {
 oneLineSummary: 0,
 keyEvents: [],
 linkBefore: null,
 linkAfter: undefined,
 },
 },
 ctx,
 );
 expect(typeof card.tagReason).toBe('string');
 expect(typeof card.readerDrive).toBe('string');
 expect(typeof card.payoffMechanism).toBe('string');
 expect(typeof card.conflictType).toBe('string');
 expect(typeof card.hookPlacement.opening).toBe('string');
 expect(typeof card.hookPlacement.middle).toBe('string');
 expect(typeof card.hookPlacement.ending).toBe('string');
 expect(typeof card.infoRelease).toBe('string');
 expect(typeof card.reusablePattern).toBe('string');
 expect(typeof card.plotSummary.oneLineSummary).toBe('string');
 expect(typeof card.plotSummary.linkBefore).toBe('string');
 expect(typeof card.plotSummary.linkAfter).toBe('string');
 });

 it('CP-5: subTags 与 keyEvents 恒为数组且长度受限', () => {
 const card = validateTechniqueCard(
 {
 ...fullValid,
 subTags: 'oops',
 plotSummary: { ...fullValid.plotSummary, keyEvents: 'oops' },
 },
 ctx,
 );
 expect(Array.isArray(card.subTags)).toBe(true);
 expect(Array.isArray(card.plotSummary.keyEvents)).toBe(true);
 expect(card.subTags.length).toBeLessThanOrEqual(2);
 expect(card.plotSummary.keyEvents.length).toBeLessThanOrEqual(3);
 });
});

describe('validateTechniqueCard - 顶层非对象（parseError）', () => {
 it('顶层为字符串 → parseError=true 默认卡', () => {
 const card = validateTechniqueCard('not an object', ctx);
 expect(card.parseError).toBe(true);
 expect(card.mainTag).toBe(UNLABELED_TAG);
 expect(card.subTags).toEqual([]);
 });

 it('顶层为 null → parseError=true 默认卡', () => {
 const card = validateTechniqueCard(null, ctx);
 expect(card.parseError).toBe(true);
 });

 it('顶层为数组 → parseError=true 默认卡', () => {
 const card = validateTechniqueCard([1, 2, 3], ctx);
 expect(card.parseError).toBe(true);
 });
});

describe('safeParseTechniqueJson - JSON 字符串解析（CP-6 单调性）', () => {
 it('合法 JSON → parseError=false', () => {
 const card = safeParseTechniqueJson(JSON.stringify(fullValid), ctx);
 expect(card.parseError).toBe(false);
 expect(card.mainTag).toBe('foundation');
 });

 it('多余 Markdown 包裹的 JSON → parseError=true', () => {
 const broken = '```json\n' + JSON.stringify(fullValid) + '\n```';
 const card = safeParseTechniqueJson(broken, ctx);
 expect(card.parseError).toBe(true);
 });

 it('空字符串 → parseError=true', () => {
 const card = safeParseTechniqueJson('', ctx);
 expect(card.parseError).toBe(true);
 });

 it('非法 JSON 字符串 → parseError=true', () => {
 const card = safeParseTechniqueJson('{not really json', ctx);
 expect(card.parseError).toBe(true);
 });

 it('合法 JSON 但顶层为字符串 → parseError=true', () => {
 const card = safeParseTechniqueJson('"just a string"', ctx);
 expect(card.parseError).toBe(true);
 });

 // CP-6: parseError 单调性 — 没有"半 AI 半默认"混合状态
 it('CP-6: parseError=true 时其余字段都是默认值', () => {
 const card = safeParseTechniqueJson('garbage', ctx);
 expect(card.parseError).toBe(true);
 expect(card.tagReason).toBe('');
 expect(card.readerDrive).toBe('');
 expect(card.subTags).toEqual([]);
 expect(card.hookIntensity).toBe(0);
 expect(card.labelConfidence).toBe(0);
 expect(card.conflictSource).toBe('external_enemy');
 expect(card.climaxPosition).toBe('none');
 expect(card.plotSummary.keyEvents).toEqual([]);
 });
});
