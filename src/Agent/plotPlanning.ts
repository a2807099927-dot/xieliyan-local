// 模块说明：新书模式的剧情规划（卷级）+ 章节大纲 + 大纲有效性审查。
// 职责：T6.0 buildPlotPlanPrompt、T6.1 buildChapterOutlinePrompt、T6.2 buildOutlineReviewPrompt 纯函数 prompt + 容错解析。
// 维护边界：不发 AI 请求、不碰 UI/store；调用方负责 chat 与确认流。
// 层级定位：卷级规划在 plotOutline 大纲体系之下、章节级大纲之上；不重复造 plotOutline。

import type { Book } from '../types';
import { withBaseProse } from '../utils/promptStore';
import { extractJsonObject } from './loopUtils';

// ─── T6.0 剧情规划（卷级） ─────────────────────────────────────────────────

export interface VolumePlan {
  volumeGoal: string;
  conflictProgression: string[];
  characterArc: string;
  volumeEndHook: string;
}

/** 剧情规划 prompt：输入核心档案 + 写法决策 + 研究结论，输出第一卷规划 */
export function buildPlotPlanPrompt(input: {
  book: Book;
  coreArchiveBlock: string;
  writingApproachBlock: string;
  researchBlock?: string;
  /** 用户 planner 自定义提示词（原样注入，最高优先级） */
  plannerPrompt?: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文卷级策划。基于故事核心档案与写法决策，规划第一卷。'
    + ' 本规划定位在 plotOutline 总纲之下、章节级大纲之上，与已有 plotOutline 衔接、不冲突、不重复造。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    input.coreArchiveBlock,
    '',
    input.writingApproachBlock,
    '',
    input.plannerPrompt ? `【用户对规划的要求（最高优先级）】\n${input.plannerPrompt}` : '',
    '',
    input.researchBlock ? `【同题材研究结论】\n${input.researchBlock}` : '',
    '',
    '请规划第一卷：',
    '- volumeGoal：本卷目标（一句话，主线推进到什么程度）',
    '- conflictProgression：冲突递进 3-5 个阶段（本卷从小到大怎么升级）',
    '- characterArc：主要角色弧线（本卷主要人物怎么变）',
    '- volumeEndHook：卷末钩子（留什么悬念接第二卷）',
    '',
    'JSON schema：{"volumeGoal":"","conflictProgression":["","",""],"characterArc":"","volumeEndHook":""}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parsePlotPlan(raw: string): VolumePlan | null {
  const parsed = extractJsonObject(String(raw || '').trim()) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const conflictProgression = Array.isArray(parsed.conflictProgression)
    ? (parsed.conflictProgression as Array<unknown>)
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const plan: VolumePlan = {
    volumeGoal: String(parsed.volumeGoal || '').trim(),
    conflictProgression,
    characterArc: String(parsed.characterArc || '').trim(),
    volumeEndHook: String(parsed.volumeEndHook || '').trim(),
  };
  return plan.volumeGoal || conflictProgression.length ? plan : null;
}

export function formatVolumePlan(plan: VolumePlan): string {
  const lines = ['【第一卷规划】'];
  if (plan.volumeGoal) lines.push(`卷目标：${plan.volumeGoal}`);
  if (plan.conflictProgression.length) {
    lines.push('冲突递进：' + plan.conflictProgression.map((c, i) => `${i + 1}) ${c}`).join('；'));
  }
  if (plan.characterArc) lines.push(`角色弧线：${plan.characterArc}`);
  if (plan.volumeEndHook) lines.push(`卷末钩子：${plan.volumeEndHook}`);
  return lines.join('\n');
}

// ─── T6.1 章节级大纲 ───────────────────────────────────────────────────────

export interface ChapterOutlineItem {
  chapterNo: number;
  coreEvent: string;
  beats: string[];
  plotFunction: string;
}

export interface ChapterOutlineResult {
  chapters: ChapterOutlineItem[];
  rawText: string;
}

/** 章节级大纲 prompt：基于剧情规划展开每章 */
export function buildChapterOutlinePrompt(input: {
  book: Book;
  volumePlanBlock: string;
  targetChapterCount: number;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文章节规划师。基于第一卷规划，把卷目标拆成逐章大纲。'
    + ' 每章必须有明确的核心事件与承担的剧情功能，不得注水。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    input.volumePlanBlock,
    '',
    `请生成 ${input.targetChapterCount} 章的大纲，每章包含：`,
    '- chapterNo：章号',
    '- coreEvent：核心事件（一句话）',
    '- beats：本章节拍（2-4 个，事件怎么走）',
    '- plotFunction：承担的剧情功能（推进主线/塑造人物/兑现爽点/制造冲突）',
    '',
    'JSON schema：{"chapters":[{"chapterNo":1,"coreEvent":"","beats":["",""],"plotFunction":""}]}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseChapterOutline(raw: string): ChapterOutlineResult {
  const rawText = String(raw || '').trim();
  const parsed = extractJsonObject(rawText) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return { chapters: [], rawText };
  const list = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const chapters = (list as Array<Record<string, unknown>>)
    .map((c) => ({
      chapterNo: Number(c?.chapterNo) || 0,
      coreEvent: String(c?.coreEvent || '').trim(),
      beats: Array.isArray(c?.beats)
        ? (c.beats as Array<unknown>).map((b) => String(b || '').trim()).filter(Boolean).slice(0, 4)
        : [],
      plotFunction: String(c?.plotFunction || '').trim(),
    }))
    .filter((c) => c.coreEvent)
    .slice(0, 120);
  return { chapters, rawText };
}

export function formatChapterOutlineItem(item: ChapterOutlineItem): string {
  return [
    `第${item.chapterNo}章`,
    `事件：${item.coreEvent}`,
    item.beats.length ? `节拍：${item.beats.join('；')}` : '',
    `功能：${item.plotFunction || '（未标注）'}`,
  ].filter(Boolean).join('\n');
}

// ─── T6.2 大纲有效性审查 ───────────────────────────────────────────────────

export interface OutlineReviewIssue {
  chapterNo: number;
  verdict: 'valid' | 'invalid' | 'needs_rework';
  reason: string;
  suggestion: string;
}

export interface OutlineReviewResult {
  issues: OutlineReviewIssue[];
  summary: string;
  rawText: string;
}

/** 大纲有效性审查 prompt：逐章判定有效/无效 */
export function buildOutlineReviewPrompt(input: {
  book: Book;
  volumePlanBlock: string;
  outlineBlock: string;
  /** 用户 editor 自定义提示词（原样注入，最高优先级） */
  editorPrompt?: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文大纲审查员。逐章判定大纲是否有效：有效 = 推进主线/塑造人物/兑现爽点/制造冲突；'
    + ' 无效 = 注水/重复/偏离目标。只做判定与建议，不要重写大纲。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    input.editorPrompt ? `【用户对审查的要求（最高优先级）】\n${input.editorPrompt}` : '',
    '',
    input.volumePlanBlock,
    '',
    '【待审查大纲】',
    input.outlineBlock,
    '',
    '请逐章判定，输出：',
    '- chapterNo：章号',
    '- verdict：valid（有效）/ invalid（无效需删改）/ needs_rework（可改但需优化）',
    '- reason：判定理由',
    '- suggestion：修改建议',
    '',
    'JSON schema：{"issues":[{"chapterNo":1,"verdict":"valid|invalid|needs_rework","reason":"","suggestion":""}],"summary":"一句话总评"}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseOutlineReview(raw: string): OutlineReviewResult {
  const rawText = String(raw || '').trim();
  const parsed = extractJsonObject(rawText) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return { issues: [], summary: '', rawText };
  const list = Array.isArray(parsed.issues) ? parsed.issues : [];
  const issues = (list as Array<Record<string, unknown>>)
    .map((i) => {
      const verdict = String(i?.verdict || 'valid').trim();
      return {
        chapterNo: Number(i?.chapterNo) || 0,
        verdict: (verdict === 'invalid' || verdict === 'needs_rework' ? verdict : 'valid') as OutlineReviewIssue['verdict'],
        reason: String(i?.reason || '').trim(),
        suggestion: String(i?.suggestion || '').trim(),
      };
    })
    .filter((i) => i.chapterNo > 0)
    .slice(0, 120);
  return {
    issues,
    summary: String(parsed.summary || '').trim(),
    rawText,
  };
}

/** 大纲中是否有需要用户处理的无效项 */
export function hasInvalidOutlineIssues(result: OutlineReviewResult): boolean {
  return result.issues.some((i) => i.verdict === 'invalid' || i.verdict === 'needs_rework');
}

export function formatOutlineReviewForUser(result: OutlineReviewResult): string {
  const lines = ['【大纲审查结果】'];
  if (result.summary) lines.push(`总评：${result.summary}`);
  for (const issue of result.issues) {
    if (issue.verdict === 'valid') continue;
    const label = issue.verdict === 'invalid' ? '无效' : '需优化';
    lines.push(`第${issue.chapterNo}章 [${label}]：${issue.reason}${issue.suggestion ? ` → ${issue.suggestion}` : ''}`);
  }
  return lines.join('\n');
}
