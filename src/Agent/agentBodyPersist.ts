// 模块说明：Agent 正文入章，对齐自动工坊 chapterBodyRunner 落盘路径。
// 流程：剥 OS → 转 HTML（h2+段落）→ setChapterContent。
// 「写入新章节」优先填最近空章，没有空章才新建。

import type { Book, Chapter } from '../types';
import { flushChapterMetaDisk, useBookStore } from '../store/useBookStore';
import { buildDefaultChapterContent } from '../utils/chapterTemplate';
import { escapeHtml } from '../utils/editor/helpers';
import { stripAiOsFromBody, isAiOsLine } from '../utils/aiTextCleanup';
import { splitAgentOutput } from './stripAgentOutput';

export type BodyWriteMode = 'current' | 'new_chapter';

export interface PersistAgentBodyResult {
  ok: boolean;
  chapterId: string;
  title: string;
  wordCount: number;
  mode: BodyWriteMode;
  createdChapter: boolean;
  reusedEmptyChapter?: boolean;
  error?: string;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `ch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function plainLen(htmlOrText: string): number {
  return String(htmlOrText || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '')
    .length;
}

/** 与工坊一致：标题 h2 + 段落 p */
export function proseToChapterHtml(title: string, bodyText: string): string {
  // 只取正文；模型输出纯思考时剥离为空（下方走 default 内容，不回退思考当正文）
  const split = splitAgentOutput(bodyText);
  const cleaned = stripAiOsFromBody(split.hasBody ? split.body : '');
  const paragraphs = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isAiOsLine(p));
  if (paragraphs.length === 0) {
    return buildDefaultChapterContent(title);
  }
  return (
    `<h2>${escapeHtml(title)}</h2>` +
    paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')
  );
}

export function countProseWords(title: string, bodyText: string): number {
  const html = proseToChapterHtml(title, bodyText);
  return plainLen(html);
}

function nextChapterTitle(chapters: Chapter[]): string {
  let max = 0;
  for (const ch of chapters) {
    const m = String(ch.title || '').match(/第\s*(\d+)\s*章/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `第${max + 1}章`;
}

/** 找最近的空章：优先当前章，再找末尾往前的空章 */
export function findLatestEmptyChapter(
  book: Book,
  preferredChapterId?: string
): Chapter | undefined {
  const chapters = book.chapters || [];
  if (!chapters.length) return undefined;

  const isEmpty = (ch: Chapter) => {
    const wc = Number(ch.wordCount || 0);
    const plain = plainLen(ch.content || '');
    // 仅标题/空壳也算空
    return wc < 30 && plain < 40;
  };

  if (preferredChapterId) {
    const preferred = chapters.find((c) => c.id === preferredChapterId);
    if (preferred && isEmpty(preferred)) return preferred;
  }

  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    const ch = chapters[i];
    if (ch && isEmpty(ch)) return ch;
  }
  return undefined;
}

/**
 * 将 Agent 生成的小说正文写入章节。
 * - current：写入当前章（有长文时默认拒绝静默覆盖，需 overwrite=true）
 * - new_chapter：优先填最近空章；没有空章才新建
 */
export async function persistAgentBodyToChapter(input: {
  bookId: string;
  chapterId: string;
  bodyText: string;
  mode: BodyWriteMode;
  /** 新建章时的标题；默认自动第 N+1 章 */
  newTitle?: string;
  /** 当前章已有正文时是否覆盖 */
  overwrite?: boolean;
  /** 当前章已有正文时是否追加（与 overwrite 互斥优先 append） */
  append?: boolean;
}): Promise<PersistAgentBodyResult> {
  const store = useBookStore.getState();
  const book = store.books.find((b) => b.id === input.bookId);
  if (!book) {
    return {
      ok: false,
      chapterId: input.chapterId,
      title: '',
      wordCount: 0,
      mode: input.mode,
      createdChapter: false,
      error: '书籍不存在'
    };
  }

  const rawBody = String(input.bodyText || '').trim();
  if (plainLen(rawBody) < 20) {
    return {
      ok: false,
      chapterId: input.chapterId,
      title: '',
      wordCount: 0,
      mode: input.mode,
      createdChapter: false,
      error: '正文过短，未写入'
    };
  }

  let target: Chapter | undefined;
  let createdChapter = false;
  let reusedEmptyChapter = false;

  if (input.mode === 'new_chapter') {
    // 先填最近空章（544/545…），别一上来就新建 546
    const empty = findLatestEmptyChapter(book, input.chapterId);
    if (empty) {
      target = empty;
      reusedEmptyChapter = true;
      createdChapter = false;
    } else {
      const now = new Date().toISOString();
      const title = String(input.newTitle || '').trim() || nextChapterTitle(book.chapters);
      const newChapter: Chapter = {
        id: createId(),
        title,
        content: buildDefaultChapterContent(title),
        wordCount: 0,
        createdAt: now,
        updatedAt: now
      };
      await store.updateBook(book.id, (current) => ({
        ...current,
        chapters: [...current.chapters, newChapter],
        updatedAt: now
      }));
      target = newChapter;
      createdChapter = true;
    }
  } else {
    target = book.chapters.find((c) => c.id === input.chapterId);
    if (!target) {
      return {
        ok: false,
        chapterId: input.chapterId,
        title: '',
        wordCount: 0,
        mode: input.mode,
        createdChapter: false,
        error: '当前章节不存在'
      };
    }
  }

  // 确保读到最新正文长度（新建章可跳过，避免把刚写入的空壳再读一遍干扰）
  if (!createdChapter) {
    try {
      await store.ensureChapterContent(book.id, target.id);
    } catch {
      /* ignore */
    }
  }
  if (!target) {
    return {
      ok: false,
      chapterId: input.chapterId,
      title: '',
      wordCount: 0,
      mode: input.mode,
      createdChapter,
      reusedEmptyChapter,
      error: '目标章节不存在'
    };
  }
  const targetId = target.id;
  const freshBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
  const targetChapter = freshBook.chapters.find((c) => c.id === targetId) || target;

  const existingPlain = plainLen(targetChapter.content || '');
  let finalBody = rawBody;

  if (input.mode === 'current' && existingPlain >= 80) {
    if (input.append) {
      const existingText = String(targetChapter.content || '')
        .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim();
      finalBody = `${existingText}\n\n${rawBody}`.trim();
    } else if (!input.overwrite) {
      return {
        ok: false,
        chapterId: targetChapter.id,
        title: targetChapter.title,
        wordCount: existingPlain,
        mode: input.mode,
        createdChapter: false,
        error: '当前章已有正文，请选择覆盖或追加'
      };
    }
  }

  // 复用空章写入时强制覆盖空壳
  const html = proseToChapterHtml(targetChapter.title, finalBody);
  const wordCount = plainLen(html);
  const ok = await useBookStore.getState().setChapterContent(book.id, targetChapter.id, html);
  if (!ok) {
    return {
      ok: false,
      chapterId: targetChapter.id,
      title: targetChapter.title,
      wordCount,
      mode: input.mode,
      createdChapter,
      reusedEmptyChapter,
      error: '写入被拦截（可能是云保护或空覆盖保护）'
    };
  }

  // 立即刷字数 meta，侧栏别一直显示 0
  try {
    await flushChapterMetaDisk();
  } catch {
    /* ignore */
  }

  // 再读一次确认内存字数
  const after = useBookStore.getState().books
    .find((b) => b.id === book.id)
    ?.chapters.find((c) => c.id === targetChapter.id);
  const finalWc = Number(after?.wordCount || wordCount);

  return {
    ok: true,
    chapterId: targetChapter.id,
    title: after?.title || targetChapter.title,
    wordCount: finalWc,
    mode: input.mode,
    createdChapter,
    reusedEmptyChapter
  };
}

/** 判断气泡文本是否像可入章的小说正文（而非纯问答） */
export function looksLikeInsertableProse(text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 80) return false;
  if (/^(正在|已创建|已合并|请求失败|这一章还没有细纲)/.test(t)) return false;
  if (/[「」""\u201c\u201d]/.test(t) || /说道|问道|抬起|转身|忽然|只见|心中/.test(t)) return true;
  return t.length >= 200 && !/^(好的|用户|我需要|首先)/.test(t);
}
