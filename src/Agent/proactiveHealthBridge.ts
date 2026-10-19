// 模块说明：开书主动体检桥接。打开书籍时派发建议事件，不自动改书。

import type { Book } from '../types';
import { formatProactiveSuggestions, inspectBookProactive, type ProactiveSuggestion } from './proactiveHealth';

const lastRun = new Map<string, number>();

export async function runProactiveHealthForBook(book: Book | null | undefined): Promise<ProactiveSuggestion[]> {
  if (!book?.id) return [];
  const now = Date.now();
  const prev = lastRun.get(book.id) || 0;
  // 同一本书 30 分钟内不重复刷屏
  if (now - prev < 30 * 60 * 1000) return [];
  lastRun.set(book.id, now);

  // 档案读权威 memory.json，避免用 book.json 旧快照做体检结论
  try {
    const { useBookStore } = await import('../store/useBookStore');
    await useBookStore.getState().loadMemoryBank(book.id);
  } catch { /* ignore */ }

  const suggestions = inspectBookProactive(book);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('writerzen:proactive-health', {
        detail: {
          bookId: book.id,
          suggestions,
          summary: formatProactiveSuggestions(suggestions)
        }
      })
    );
  }
  return suggestions;
}

export function installProactiveHealthOnBookOpen(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('writerzen:book-opened', ((ev: Event) => {
    const detail = (ev as CustomEvent).detail as { book?: Book } | undefined;
    if (detail?.book) {
      void runProactiveHealthForBook(detail.book);
    }
  }) as EventListener);
}

if (typeof window !== 'undefined') {
  installProactiveHealthOnBookOpen();
}
