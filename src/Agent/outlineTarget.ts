// 模块说明：章纲目标章解析（从 AgentChatPanel 抽出，供工具与面板共用）。
// 铁律：优先当前/后方空章，禁止从全书头误抓早期短章。

import type { Book, Chapter } from '../types';

export function resolveOutlineTargetChapter(
  book: Book,
  current: Chapter
): { chapter: Chapter; index: number; label: string } {
  const chapters = book.chapters || [];
  const fallback = current || chapters[chapters.length - 1];
  if (!chapters.length || !fallback) {
    return { chapter: current, index: 0, label: current?.title || '当前章' };
  }

  const plainLen = (ch: Chapter) =>
    String(ch.content || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, '').length;

  const isEmptyish = (ch: Chapter) => {
    const wc = Number(ch.wordCount || 0);
    return wc < 80 && plainLen(ch) < 80;
  };

  const labelOf = (ch: Chapter, index: number) => {
    const title = String(ch.title || '').trim();
    if (/第\s*\d+\s*章/.test(title)) return title;
    return `第${index + 1}章${title ? ` ${title}` : ''}`;
  };

  const curIdx = chapters.findIndex((c) => c.id === current.id);
  const start = curIdx >= 0 ? curIdx : Math.max(0, chapters.length - 1);

  if (curIdx >= 0 && isEmptyish(chapters[curIdx])) {
    const ch = chapters[curIdx];
    return { chapter: ch, index: curIdx, label: labelOf(ch, curIdx) };
  }

  for (let i = start + 1; i < chapters.length; i++) {
    if (isEmptyish(chapters[i])) {
      return { chapter: chapters[i], index: i, label: labelOf(chapters[i], i) };
    }
  }

  for (let i = chapters.length - 1; i >= 0; i--) {
    if (isEmptyish(chapters[i])) {
      return { chapter: chapters[i], index: i, label: labelOf(chapters[i], i) };
    }
  }

  if (curIdx >= 0) {
    const ch = chapters[curIdx];
    return { chapter: ch, index: curIdx, label: labelOf(ch, curIdx) };
  }

  const last = chapters[chapters.length - 1];
  const lastIdx = chapters.length - 1;
  return { chapter: last, index: lastIdx, label: labelOf(last, lastIdx) };
}
