// 模块说明：写前复盘（pre-write reflection）。
// 职责：动笔前形成可解释的写作决策（承接点 / 怎么写 / 为什么 / 加什么少什么 / 爽点节奏），
// 产出「决策文本 + 结构化 JSON」；决策喂给正文生成，决策文本展示给用户。
// 与 writingReflection（写后 review）职责分开：复盘是计划，review 是验收。
// 纯函数 + 一个共享执行入口，不碰 UI。

import type { Book, Chapter } from '../types';
import type { AgentTaskSheet } from './types';
import { withBaseProse } from '../utils/promptStore';
import { extractJsonObject } from './loopUtils';
import { inferAgentGenreFromBook } from './bookContext';
import { buildStoryCanonBlock } from './storyCanonCards';
import { loadGenrePlaySkill, formatGenrePlayForPrompt } from './skills/loadGenrePlaySkill';
import { bookHasNoSubstantialBody } from './batchChapterCreator';
import { useConfigStore } from '../store/useConfigStore';

export interface PreWriteDecision {
  /** 承接点：上一章结尾停在哪，本章从哪接（一句话） */
  continuation: string;
  /** 本章主线怎么推进：主要做什么、冲突是什么（2-3 句） */
  approach: string;
  /** 为什么这么写：与承接点的因果、与伏笔/长线的关系（2-3 句） */
  rationale: string;
  /** 主动加的东西：这章要埋的线头、要登场的关系、要推进的状态 */
  add: Array<{ what: string; why: string }>;
  /** 主动少写/不写的东西：避免拖节奏、避免重复 */
  remove: Array<{ what: string; why: string }>;
  /** 爽点与节奏（意图声明，不是验收） */
  pacing: {
    hook: string;
    satisfaction: string[];
    endState: string;
  };
  /** 可读性注意：信息密度是否过高、是否头重脚轻（一句话） */
  readability: string;
}

export type PreWriteReflectionInput = {
  book: Book;
  chapter: Chapter;
  taskSheet: AgentTaskSheet;
  /** 本章细纲（正文生成严格按细纲写，复盘必须看到细纲才能对齐决策） */
  outlineText?: string;
};

export type PreWriteChatFn = (messages: Array<{ role: string; content: string }>) => Promise<{ text: string }>;

export interface PreWriteReflectionResult {
  decisionText: string;
  decision: PreWriteDecision | null;
}

const EMPTY_DECISION: PreWriteDecision = {
  continuation: '',
  approach: '',
  rationale: '',
  add: [],
  remove: [],
  pacing: { hook: '', satisfaction: [], endState: '' },
  readability: '',
};

function taskSheetSummary(taskSheet: AgentTaskSheet): string {
  const parts: string[] = [];
  const ui = String(taskSheet.userInstruction || '').trim();
  if (ui) parts.push(`用户指令：${ui}`);
  if (taskSheet.requiredBeats?.length) {
    parts.push(`必含节拍：${taskSheet.requiredBeats.join('；')}`);
  }
  if (taskSheet.forbiddenMoves?.length) {
    parts.push(`禁止动作：${taskSheet.forbiddenMoves.join('；')}`);
  }
  return parts.join('\n') || '（无额外约束）';
}

const SCHEMA_DOC = `输出一个 JSON 对象，schema：
{
  "continuation": "承接点一句话",
  "approach": "主线推进 2-3 句",
  "rationale": "为什么这么写 2-3 句",
  "add": [{"what":"要加的东西","why":"为什么加"}],
  "remove": [{"what":"要少写的东西","why":"为什么少写"}],
  "pacing": {"hook":"开篇钩子一句话","satisfaction":["爽点1","爽点2","爽点3"],"endState":"章末状态一句话"},
  "readability": "可读性注意一句话"
}`;

/** 完整版复盘 prompt（全五问） */
export function buildPreWritePrompt(input: {
  book: Book;
  chapter: Chapter;
  taskSheet: AgentTaskSheet;
  canonBlock: string;
  genreBlock: string;
  outlineText?: string;
  /** 新书（无实质正文）：承接上下文以设定卡 + 开局方向为依据，而非「已有正文」 */
  isNewBook?: boolean;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是写前规划者，不是写手。动笔之前，先想清楚这一章怎么打、为什么这么打，让写手拿到明确方向。'
    + ' 只返回 JSON，不要 Markdown 代码块，不要任何说明文字。'
  );
  const continuationFallback = input.isNewBook
    ? '（本书无前文，以设定卡 + 开局方向为承接依据，不要臆造「上一章停在哪」）'
    : '（无设定卡，按已有正文承接）';
  const user = [
    `当前作品：《${input.book.title}》`,
    `本章：${input.chapter.title || '未命名'}`,
    '',
    '【写前约束】',
    taskSheetSummary(input.taskSheet),
    '',
    input.outlineText ? `【本章细纲（正文必须严格按此写）】\n${input.outlineText}` : '【本章细纲】（无）',
    '',
    '【承接上下文】',
    input.canonBlock || continuationFallback,
    '',
    '【题材打法】',
    input.genreBlock || '（无题材打法，按通用网文方法）',
    '',
    '请回答五问，形成本章写作决策（决策必须与本章细纲对齐，不能脱离细纲另起炉灶）：',
    '1) 承接点：上文停在哪？本章从哪接？（基于承接上下文）',
    '2) 怎么写：主线怎么推进、冲突是什么？（对照细纲）',
    '3) 为什么这么写：与承接的因果、与伏笔/长线的关系？',
    '4) 加什么/少什么：主动加哪些线头/关系/状态，主动少写哪些拖节奏或重复的内容？',
    '5) 爽点+可读性：开篇钩子、本章爽点（限 1-3 个）、章末钩子、信息密度是否过高？',
    '',
    SCHEMA_DOC,
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** 轻量版复盘 prompt（shuangwen：只出爽点节奏，其他四项省略） */
export function buildPreWriteLightPrompt(input: {
  book: Book;
  chapter: Chapter;
  taskSheet: AgentTaskSheet;
  canonBlock: string;
  genreBlock: string;
  outlineText?: string;
  /** 新书（无实质正文）：承接上下文以设定卡 + 开局方向为依据 */
  isNewBook?: boolean;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是无脑爽文的写前规划者。这本要快、要爽、不憋屈。只输出爽点与节奏规划，'
    + ' 只返回 JSON，不要 Markdown 代码块，不要说明文字。'
  );
  const continuationFallback = input.isNewBook
    ? '（本书无前文，以设定卡 + 开局方向为承接依据，不要臆造「上一章停在哪」）'
    : '（无设定卡，按已有正文承接）';
  const user = [
    `当前作品：《${input.book.title}》`,
    `本章：${input.chapter.title || '未命名'}`,
    '',
    '【写前约束】',
    taskSheetSummary(input.taskSheet),
    '',
    input.outlineText ? `【本章细纲（正文必须严格按此写）】\n${input.outlineText}` : '【本章细纲】（无）',
    '',
    '【承接上下文】',
    input.canonBlock || continuationFallback,
    '',
    '【题材打法】',
    input.genreBlock || '（无题材打法，按通用爽文方法）',
    '',
    '请只回答爽点与节奏（决策必须与本章细纲对齐）：',
    '1) 开篇钩子：第一屏抓住读者；',
    '2) 本章爽点：限 1-3 个，密集、及时兑现、不憋屈；',
    '3) 章末状态：留什么钩子；',
    '4) 可读性：别信息过载、别头重脚轻。',
    '',
    '输出 JSON schema：{"continuation":"","approach":"","rationale":"","add":[],"remove":[],"pacing":{"hook":"","satisfaction":["",""],"endState":""},"readability":""}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** 容错解析复盘 JSON（纯 JSON / 代码块 / 截断） */
export function parsePreWriteResult(text: string): PreWriteDecision | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;

  const pacingRaw = (parsed.pacing || {}) as Record<string, unknown>;
  const satisfaction = Array.isArray(pacingRaw.satisfaction)
    ? pacingRaw.satisfaction.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3)
    : [];

  return {
    continuation: String(parsed.continuation || '').trim(),
    approach: String(parsed.approach || '').trim(),
    rationale: String(parsed.rationale || '').trim(),
    add: Array.isArray(parsed.add)
      ? (parsed.add as Array<Record<string, unknown>>).slice(0, 6).map((a) => ({
        what: String(a?.what || '').trim(),
        why: String(a?.why || '').trim(),
      })).filter((a) => a.what)
      : [],
    remove: Array.isArray(parsed.remove)
      ? (parsed.remove as Array<Record<string, unknown>>).slice(0, 6).map((r) => ({
        what: String(r?.what || '').trim(),
        why: String(r?.why || '').trim(),
      })).filter((r) => r.what)
      : [],
    pacing: {
      hook: String(pacingRaw.hook || '').trim(),
      satisfaction,
      endState: String(pacingRaw.endState || '').trim(),
    },
    readability: String(parsed.readability || '').trim(),
  };
}

/** 决策 JSON → 给写手 system 注入的文本（写手必须遵守） */
export function formatPreWriteDecisionForWriter(decision: PreWriteDecision): string {
  const lines: string[] = ['【写前复盘决策（写手必须遵守）】'];
  if (decision.continuation) lines.push(`承接点：${decision.continuation}`);
  if (decision.approach) lines.push(`主线推进：${decision.approach}`);
  if (decision.rationale) lines.push(`为什么这么写：${decision.rationale}`);
  if (decision.add?.length) {
    lines.push('主动加：' + decision.add.map((a) => `${a.what}（${a.why}）`).join('；'));
  }
  if (decision.remove?.length) {
    lines.push('主动少写：' + decision.remove.map((r) => `${r.what}（${r.why}）`).join('；'));
  }
  const p = decision.pacing || EMPTY_DECISION.pacing;
  if (p.hook) lines.push(`开篇钩子：${p.hook}`);
  if (p.satisfaction?.length) lines.push(`本章爽点：${p.satisfaction.join('；')}`);
  if (p.endState) lines.push(`章末状态：${p.endState}`);
  if (decision.readability) lines.push(`可读性：${decision.readability}`);
  return lines.join('\n');
}

/** 决策 JSON → 展示给用户的文本（人可读，非 JSON） */
export function formatPreWriteDecisionForUser(decision: PreWriteDecision): string {
  const lines: string[] = ['写前复盘：'];
  if (decision.continuation) lines.push(`承接：${decision.continuation}`);
  if (decision.approach) lines.push(`怎么写：${decision.approach}`);
  if (decision.rationale) lines.push(`为什么：${decision.rationale}`);
  if (decision.add?.length) lines.push(`加：${decision.add.map((a) => a.what).join('、')}`);
  if (decision.remove?.length) lines.push(`少写：${decision.remove.map((r) => r.what).join('、')}`);
  const p = decision.pacing || EMPTY_DECISION.pacing;
  if (p.hook) lines.push(`钩子：${p.hook}`);
  if (p.satisfaction?.length) lines.push(`爽点：${p.satisfaction.join('、')}`);
  if (p.endState) lines.push(`章末：${p.endState}`);
  if (decision.readability) lines.push(`可读性：${decision.readability}`);
  return lines.join('\n');
}

/** 判断写前复盘是否开启（写作思考边界收敛后默认关，用户显式开才跑） */
export function isPreWriteReflectionEnabled(): boolean {
  const cfg = useConfigStore.getState().config;
  return cfg?.agent?.preWriteReflection === true;
}

/**
 * 共享执行入口：加载承接上下文 + 题材打法 → 构建复盘 prompt → callChat → 解析。
 * - 开关关闭时直接返回空决策（短路，不产生副作用）
 * - shuangwen 走轻量版（只出爽点节奏）
 * - 解析失败不抛错：返回 decisionText 原文 + decision=null（降级）
 */
export async function runPreWriteReflection(
  input: PreWriteReflectionInput,
  callChat: PreWriteChatFn
): Promise<PreWriteReflectionResult> {
  if (!isPreWriteReflectionEnabled()) {
    return { decisionText: '', decision: null };
  }

  const { book, chapter, taskSheet, outlineText } = input;
  const canonBlock = buildStoryCanonBlock(book, chapter);
  const genre = inferAgentGenreFromBook(book);
  const genreBlock = formatGenrePlayForPrompt(loadGenrePlaySkill(genre));
  const isNewBook = bookHasNoSubstantialBody(book.chapters);

  const isLight = taskSheet.primaryGenre === 'shuangwen';
  const messages = isLight
    ? buildPreWriteLightPrompt({ book, chapter, taskSheet, canonBlock, genreBlock, outlineText, isNewBook })
    : buildPreWritePrompt({ book, chapter, taskSheet, canonBlock, genreBlock, outlineText, isNewBook });

  try {
    const res = await callChat(messages);
    const decisionText = String(res?.text || '').trim();
    const decision = parsePreWriteResult(decisionText);
    return { decisionText, decision };
  } catch {
    // 复盘失败不阻塞正文：返回空决策，正文生成照常
    return { decisionText: '', decision: null };
  }
}
