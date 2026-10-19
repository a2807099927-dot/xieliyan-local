/**
 * 批量章节创建器
 *
 * 根据解析出的大纲数据，批量创建新章节并填入细纲。
 * 工坊增强：优先填入书中已有的「空壳章」（如新建书默认第1章），避免第1章空着却从第2章起建。
 */

import type { Book, Chapter } from '../types';
import { buildDefaultChapterContent } from '../utils/chapterTemplate';
import type { ParsedChapterOutline } from './outlineParser';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 推断下一个章节序号（基于现有章节标题中的最大序号）
 * 导出供自动工坊复用（设计方案 P1-7）。
 */
export function inferNextChapterNumber(chapters: Chapter[]): number {
  let maxNo = 0;
  for (const chapter of chapters) {
    const match = String(chapter.title || '').match(/第\s*(\d+)\s*[章节回篇]/);
    if (match) {
      const no = parseInt(match[1], 10);
      if (Number.isFinite(no) && no > maxNo) maxNo = no;
    }
  }
  return Math.max(maxNo + 1, chapters.length + 1);
}

/** 正文是否实质为空（仅标题/空白 HTML） */
export function isChapterBodyEmpty(chapter: Chapter): boolean {
  // ★ 懒加载：content 未水合时 wordCount 仍可信。有字数则绝不当空壳（防老书被整本删光）
  if (Number(chapter.wordCount || 0) >= 50) return false;

  const content = String(chapter.content || '');
  // content 空但 wordCount 在 1–49：仍视为「可能有正文未加载」，不当彻底空壳
  if (!content.trim() && Number(chapter.wordCount || 0) > 0) return false;

  let plain = '';
  try {
    plain = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, '');
  } catch {
    plain = content.replace(/\s+/g, '');
  }
  const title = String(chapter.title || '').replace(/\s+/g, '');
  if (plain.startsWith(title)) plain = plain.slice(title.length);
  return plain.length < 20;
}

/** 章是否应视为「有实质内容」（含仅有 wordCount 的懒加载章）——删章/空书判定专用 */
export function chapterLooksSubstantial(chapter: Chapter): boolean {
  if (Number(chapter.wordCount || 0) >= 50) return true;
  if (Number(chapter.wordCount || 0) > 0 && !String(chapter.content || '').trim()) return true;
  return !isChapterBodyEmpty(chapter);
}

/** 全书是否「没有任何实质正文」（仅空壳新书才为 true） */
export function bookHasNoSubstantialBody(chapters: Chapter[]): boolean {
  if (!Array.isArray(chapters) || chapters.length === 0) return true;
  return !chapters.some((c) => chapterLooksSubstantial(c));
}

/**
 * 可被工坊「填入」的空壳章：几乎无正文。
 * - 默认：无细纲才算空壳（保留已有细纲章）
 * - includeWithOutline：无正文也算空壳（用于全书无正文时复用旧细纲章，避免再叠 50 章变成 82 章）
 */
export function findReusableShellChapters(
  chapters: Chapter[],
  options?: { includeWithOutline?: boolean }
): Chapter[] {
  return chapters.filter((ch) => {
    if (!isChapterBodyEmpty(ch)) return false;
    if (options?.includeWithOutline) return true;
    return !String(ch.outline || '').trim();
  });
}

export interface BatchCreateResult {
  /** 新建的章节（不含复用空壳） */
  newChapters: Chapter[];
  /** 每个章节对应的细纲（key = chapterId，含复用空壳的 id） */
  outlines: Map<string, string>;
  /** 本批全部章节 id（先复用空壳，再新建），顺序与大纲一致 */
  batchChapterIds: string[];
  /** 需要写回书库的完整 chapters 数组 */
  nextChapters: Chapter[];
}

export type BuildBatchChaptersOptions = {
  /** 标题最大长度；工坊路径用 40，默认 20 保持 OutlineBoard 兼容 */
  maxTitleLength?: number;
  /**
   * 是否优先填入书中空壳章（默认 false，保持旧行为）。
   * 工坊应传 true：第1章空壳会被第1条大纲填满。
   */
  reuseEmptyShells?: boolean;
  /**
   * 无正文的章即使已有细纲也当作可复用空壳（覆盖细纲）。
   * 用于「全书无正文」时重新出纲，避免 32+50=82 章叠加。
   */
  reuseEmptyBodyEvenWithOutline?: boolean;
  /**
   * 落盘后删除未进入本批的「无正文」章，防止目录残留待补全/旧细纲空章。
   */
  dropUnusedEmptyBodyChapters?: boolean;
};

function buildFullOutlineText(parsed: ParsedChapterOutline): string {
  const outlineParts: string[] = [];
  if (parsed.outline) outlineParts.push(parsed.outline);
  // 兼容旧 AI 输出：可以解析 emotionNode，但不再写回「情绪节点」分析栏目
  if (parsed.endingHook) outlineParts.push(`\n下章钩子：${parsed.endingHook}`);
  return outlineParts.join('').trim();
}

function makeTitle(chapterNo: number, parsed: ParsedChapterOutline, maxTitleLength: number): string {
  // 若 AI 标题已带「第N章」前缀，避免重复
  const raw = String(parsed.title || '').trim();
  if (/^第\s*\d+\s*[章节回篇]/.test(raw)) {
    return raw.slice(0, maxTitleLength);
  }
  const composed = raw ? `第${chapterNo}章 ${raw}` : `第${chapterNo}章`;
  return composed.slice(0, maxTitleLength);
}

/**
 * 根据解析出的大纲数据生成/填入章节
 */
export function buildBatchChapters(
  book: Book,
  parsedOutlines: ParsedChapterOutline[],
  options?: BuildBatchChaptersOptions
): BatchCreateResult {
  const now = new Date().toISOString();
  const maxTitleLength = options?.maxTitleLength ?? 20;
  const reuse = options?.reuseEmptyShells === true;
  const reuseWithOutline = options?.reuseEmptyBodyEvenWithOutline === true;
  const dropUnused = options?.dropUnusedEmptyBodyChapters === true;

  const shells = reuse
    ? findReusableShellChapters(book.chapters, { includeWithOutline: reuseWithOutline })
    : [];
  const shellIds = new Set(shells.map((s) => s.id));

  const newChapters: Chapter[] = [];
  const outlines = new Map<string, string>();
  const batchChapterIds: string[] = [];
  const filledShells: Chapter[] = [];

  // 起始序号：若复用空壳，尽量从 1 或空壳标题号开始；否则从最大号+1
  let startNumber = 1;
  if (shells.length > 0) {
    const firstNo = String(shells[0].title || '').match(/第\s*(\d+)\s*[章节回篇]/);
    startNumber = firstNo ? parseInt(firstNo[1], 10) || 1 : 1;
  } else {
    startNumber = inferNextChapterNumber(book.chapters);
  }

  for (let i = 0; i < parsedOutlines.length; i++) {
    const parsed = parsedOutlines[i];
    const chapterNo = startNumber + i;
    const title = makeTitle(chapterNo, parsed, maxTitleLength);
    const fullOutline = buildFullOutlineText(parsed);

    if (i < shells.length) {
      // 填入已有空壳（含新建书默认第1章）
      const shell = shells[i];
      const updated: Chapter = {
        ...shell,
        title,
        content: buildDefaultChapterContent(title),
        outline: fullOutline || '',
        wordCount: 0,
        updatedAt: now,
      };
      filledShells.push(updated);
      batchChapterIds.push(shell.id);
      if (fullOutline) outlines.set(shell.id, fullOutline);
    } else {
      const id = createId();
      const chapter: Chapter = {
        id,
        title,
        content: buildDefaultChapterContent(title),
        wordCount: 0,
        outline: fullOutline || undefined,
        createdAt: now,
        updatedAt: now,
      };
      newChapters.push(chapter);
      batchChapterIds.push(id);
      if (fullOutline) outlines.set(id, fullOutline);
    }
  }

  const usedShellIds = new Set(batchChapterIds.filter((id) => shellIds.has(id)));
  let nextChapters = rebuildChapters(
    book.chapters,
    shells,
    filledShells,
    newChapters,
    usedShellIds
  );

  // 全书无实质正文时：删掉未进本批的空章，避免目录残留 待补全/旧细纲导致 80+ 章
  // ★ 使用 chapterLooksSubstantial：wordCount>0 的懒加载章绝不可删
  if (dropUnused) {
    const batch = new Set(batchChapterIds);
    nextChapters = nextChapters.filter((ch) => {
      if (batch.has(ch.id)) return true;
      return chapterLooksSubstantial(ch);
    });
  }

  return {
    newChapters,
    outlines,
    batchChapterIds,
    nextChapters,
  };
}

function rebuildChapters(
  original: Chapter[],
  shells: Chapter[],
  filledShells: Chapter[],
  newChapters: Chapter[],
  usedShellIds: Set<string>
): Chapter[] {
  const filledByOldId = new Map<string, Chapter>();
  for (let i = 0; i < shells.length; i++) {
    if (i < filledShells.length && usedShellIds.has(shells[i].id)) {
      filledByOldId.set(shells[i].id, filledShells[i]);
    }
  }
  const out: Chapter[] = [];
  for (const ch of original) {
    if (filledByOldId.has(ch.id)) {
      out.push(filledByOldId.get(ch.id)!);
    } else if (usedShellIds.has(ch.id)) {
      // 已作为空壳消耗，不 push 原壳
      continue;
    } else if (shells.some((s) => s.id === ch.id) && !usedShellIds.has(ch.id)) {
      // 未用到的空壳：后面 dropUnused 可能删掉；这里先保留
      out.push(ch);
    } else {
      out.push(ch);
    }
  }
  out.push(...newChapters);
  return out;
}
