// 模块说明：按细纲写作的上下文装配（右键细纲写作 / Agent 续写共用）。
// 策略：本章细纲（或对话里刚定的方案）+ 前 9 章剧情档案 + 近 1 章正文。
// 控 token，不走查证；空章细纲可从近期对话方案回填。

import type { Book, Chapter } from '../types';
import { buildWriterSystemPrompt } from './skills/writingSkill';

export interface OutlineWritingContextOptions {
  archiveCount?: number;
  proseCount?: number;
  proseCharsEach?: number;
  /** 额外用户指令（Agent 对话里的续写要求） */
  userInstruction?: string;
  /**
   * 本章 outline 字段为空时，用对话里刚确认的方案当细纲。
   * 例如上一轮 Agent 给出的「下一章两线展开」全文。
   */
  fallbackOutline?: string;
}

function plainChapterText(content: unknown): string {
  return String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function memoryForChapter(book: Book, chapterId: string): any | undefined {
  const memBank: any[] = Array.isArray((book as any).memoryBank) ? (book as any).memoryBank : [];
  return memBank.find((m) => m && m.chapterId === chapterId);
}

function chapterNo(book: Book, chapter: Chapter, fallbackIndex: number): number {
  const idx = book.chapters.findIndex((c) => c.id === chapter.id);
  return (idx >= 0 ? idx : fallbackIndex) + 1;
}

function formatArchiveLine(book: Book, chapter: Chapter, index: number): string {
  const mem = memoryForChapter(book, chapter.id);
  const no = chapterNo(book, chapter, index);
  const title = chapter.title || `第${no}章`;
  if (!mem) {
    const plain = plainChapterText(chapter.content);
    if (!plain) return `第${no}章 ${title}：（无档案，正文为空）`;
    return `第${no}章 ${title}：（无档案）正文摘录：${plain.slice(-160)}`;
  }
  const synopsis = String(
    mem.plotAnalysis?.plotSynopsis
      || mem.plotAnalysis?.functionSummary
      || mem.summary
      || mem.agentOutline?.summary
      || ''
  ).trim();
  const ending = String(mem.agentOutline?.endingState || '').trim();
  const loops = Array.isArray(mem.agentOutline?.openLoops)
    ? mem.agentOutline.openLoops.map((x: unknown) => String(x || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  const chars = Array.isArray(mem.agentOutline?.charactersInvolved)
    ? mem.agentOutline.charactersInvolved.map((x: unknown) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  const parts = [
    synopsis ? `概要：${synopsis.slice(0, 220)}` : '',
    ending ? `结尾状态：${ending.slice(0, 120)}` : '',
    loops.length ? `未收束：${loops.join('；')}` : '',
    chars.length ? `在场：${chars.join('、')}` : ''
  ].filter(Boolean);
  return parts.length ? `第${no}章 ${title}：${parts.join(' ｜ ')}` : `第${no}章 ${title}：（档案较空）`;
}

export function getChapterOutlineText(chapter: Chapter): string {
  return String((chapter as any).outline || '').replace(/\\n/g, '\n').trim();
}

/** 一段文本是否像「章纲/写作方案」（而不是纯小说正文或短句闲聊） */
export function looksLikeChapterPlan(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 60) return false;
  // 明显小说正文：大段对白
  const dialogueHits = (t.match(/[「」""\u201c\u201d]/g) || []).length;
  if (dialogueHits >= 6 && /说道|问道|抬起|转身/.test(t)) return false;
  const score =
    (/下一章|第\d+章|本章|开篇|章末|钩子/.test(t) ? 2 : 0) +
    (/现实线|游戏线|主线|支线|情感线|生活线/.test(t) ? 3 : 0) +
    (/场景|冲突|节拍|分工|推进|埋下|伏笔|承接|展开/.test(t) ? 2 : 0) +
    (/^[-•*]\s|^\d+[\.、]/m.test(t) ? 1 : 0) +
    (t.length > 200 ? 1 : 0);
  return score >= 3;
}

/**
 * 从近期对话里捞「刚定好的写作方案」当临时细纲。
 * 优先最近一条像章纲的助手回复。
 */
export function harvestOutlineFromConversation(
  turns: Array<{ role: string; content: string }>,
  options?: { maxChars?: number }
): string {
  const maxChars = options?.maxChars ?? 3500;
  const list = Array.isArray(turns) ? turns : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const turn = list[i];
    if (!turn || turn.role !== 'assistant') continue;
    const content = String(turn.content || '').trim();
    if (!looksLikeChapterPlan(content)) continue;
    return content.length > maxChars ? content.slice(0, maxChars) : content;
  }
  // 用户自己粘贴的方案
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const turn = list[i];
    if (!turn || turn.role !== 'user') continue;
    const content = String(turn.content || '').trim();
    if (!looksLikeChapterPlan(content)) continue;
    return content.length > maxChars ? content.slice(0, maxChars) : content;
  }
  return '';
}

/**
 * 组装「按细纲写作」上下文。
 * - 前 archiveCount 章：剧情档案
 * - 近 proseCount 章：正文尾部
 * - 细纲：本章 outline 优先；空则用 fallbackOutline（对话方案）
 */
export function buildOutlineWritingContext(
  book: Book,
  chapter: Chapter,
  options?: OutlineWritingContextOptions
): {
  outlineText: string;
  contextText: string;
  userContent: string;
  hasOutline: boolean;
  outlineSource: 'chapter' | 'conversation' | 'none';
  archiveUsed: number;
  proseUsed: number;
} {
  const archiveCount = options?.archiveCount ?? 8;
  const proseCount = options?.proseCount ?? 2;
  const proseCharsEach = options?.proseCharsEach ?? 1800;
  const chapterOutline = getChapterOutlineText(chapter);
  const fallback = String(options?.fallbackOutline || '').trim();
  const outlineSource: 'chapter' | 'conversation' | 'none' = chapterOutline
    ? 'chapter'
    : fallback
      ? 'conversation'
      : 'none';
  const outlineText = chapterOutline || fallback;

  const chapters = book.chapters || [];
  const idx = chapters.findIndex((c) => c.id === chapter.id);
  const cursor = idx >= 0 ? idx : chapters.length;
  const endExclusive = Math.max(0, cursor);
  const archiveStart = Math.max(0, endExclusive - (archiveCount + proseCount));
  const proseStart = Math.max(0, endExclusive - proseCount);

  const archiveChapters = chapters.slice(archiveStart, proseStart);
  const proseChapters = chapters.slice(proseStart, endExclusive);

  const archiveLines = archiveChapters.map((ch, i) => formatArchiveLine(book, ch, archiveStart + i));
  const proseBlocks: string[] = [];
  for (let i = 0; i < proseChapters.length; i++) {
    const ch = proseChapters[i];
    const no = chapterNo(book, ch, proseStart + i);
    const title = ch.title || `第${no}章`;
    const plain = plainChapterText(ch.content);
    if (!plain) {
      proseBlocks.push(`【第${no}章 ${title}·正文】（空）`);
      continue;
    }
    const slice = plain.length > proseCharsEach ? plain.slice(-proseCharsEach) : plain;
    proseBlocks.push(`【第${no}章 ${title}·正文】\n${slice}`);
  }

  const currentPlain = plainChapterText(chapter.content);
  if (currentPlain && currentPlain.length >= 20) {
    const slice = currentPlain.length > 900 ? currentPlain.slice(-900) : currentPlain;
    proseBlocks.push(`【${chapter.title || '当前章'}·已有正文（续写请承接）】\n${slice}`);
  }

  const sections = [
    archiveLines.length ? `【前序剧情档案·${archiveLines.length}章】\n${archiveLines.join('\n')}` : '',
    proseBlocks.length ? `【近章正文·${Math.min(proseCount, proseBlocks.length)}章】\n${proseBlocks.join('\n\n')}` : ''
  ].filter(Boolean);

  const contextText = sections.join('\n\n');
  const userInstruction = String(options?.userInstruction || '').trim();
  const outlineLabel =
    outlineSource === 'conversation'
      ? '【本章细纲（来自刚才对话方案，尚未写入细纲栏）】'
      : '【本章细纲】';

  const contentParts = [
    '请仅基于以下信息直接续写当前章节正文，不要引入未提供信息，不要复述提示词。',
    contextText ? `【参考上下文】\n${contextText}` : '',
    `${outlineLabel}\n${outlineText || '（未填写细纲）'}`,
    userInstruction ? `【用户补充要求】\n${userInstruction}` : '',
    '【输出要求】\n请根据细纲完整写完相关情节点，写完后自然结束即可，不限制字数。',
    '仅输出可直接落稿的小说正文。不要输出写作计划、分析、自我解释。'
  ].filter(Boolean);

  return {
    outlineText,
    contextText,
    userContent: contentParts.join('\n\n'),
    hasOutline: Boolean(outlineText),
    outlineSource,
    archiveUsed: archiveLines.length,
    proseUsed: proseChapters.length
  };
}

export function buildOutlineWritingSystemPrompt(book: Book, chapter: Chapter): string {
  return buildWriterSystemPrompt({
    book,
    chapterTitle: chapter.title || '当前章',
    chapter,
    extraRules: [
      '必须严格依据【本章细纲】推进剧情，并结合【参考上下文】保持人物与前文连贯。',
      '若细纲标注「来自刚才对话方案」，说明用户已口头确认该方案，直接按该方案写正文，不要再问要不要写。',
      '上下文策略：前 9 章看剧情档案，近 1 章看正文。禁止查证搜索，禁止复述档案。',
      '使用中文标点。',
      `当前书名：《${book.title}》`
    ]
  });
}
