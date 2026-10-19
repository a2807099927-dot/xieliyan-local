import { describe, it, expect } from 'vitest';
import {
  inferAgentGenreFromBook,
  collectAgentChapterReferences,
  getAllMemorizedChapterReferences,
} from '../src/Agent/bookContext';
import type { Book, Chapter, ChapterMemory } from '../src/types';

function makeChapter(id: string, title: string, content = '<p>有效正文内容足够长度超过十个字</p>'): Chapter {
  return { id, title, content } as Chapter;
}

function makeMemory(chapterId: string, summary = '章节摘要'): ChapterMemory {
  return {
    chapterId,
    summary,
    isAnalyzed: true,
    plotAnalysis: { functionSummary: '剧情概要' },
    agentOutline: {
      endingState: '主角离开',
      openLoops: ['伏笔A'],
      sceneBeats: ['节拍1'],
      charactersInvolved: ['主角'],
    },
  } as ChapterMemory;
}

function makeBook(chapters: Chapter[], memoryBank: ChapterMemory[] = []): Book {
  return {
    id: 'book-1',
    title: '测试小说',
    description: '',
    chapters,
    memoryBank,
    resourceIndex: { novelType: '' },
  } as unknown as Book;
}

// ─── inferAgentGenreFromBook ──────────────────────────────────────────────────

describe('inferAgentGenreFromBook', () => {
  it('从 novelType 直接识别', () => {
    const book = makeBook([]);
    (book.resourceIndex as any).novelType = 'youxi';
    expect(inferAgentGenreFromBook(book)).toBe('youxi');
  });

  it('从标题/描述关键词推断 — 玄幻', () => {
    const book = makeBook([]);
    book.title = '修仙之路';
    expect(inferAgentGenreFromBook(book)).toBe('xuanhuan');
  });

  it('从资源包预设推断', () => {
    const book = makeBook([]);
    book.resourceIndex = { novelType: '都市', novelTags: [] };
    expect(inferAgentGenreFromBook(book)).toBe('urban');
  });

  it('无法推断时默认 urban', () => {
    const book = makeBook([]);
    book.title = '无标签小说';
    expect(inferAgentGenreFromBook(book)).toBe('urban');
  });
});

// ─── collectAgentChapterReferences ────────────────────────────────────────────

describe('collectAgentChapterReferences', () => {
  it('自动收集上一章 + 当前章', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const ch2 = makeChapter('ch2', '第二章');
    const ch3 = makeChapter('ch3', '第三章');
    const mem1 = makeMemory('ch1');
    const mem2 = makeMemory('ch2');
    const mem3 = makeMemory('ch3');
    const book = makeBook([ch1, ch2, ch3], [mem1, mem2, mem3]);

    const refs = collectAgentChapterReferences(book, ch3);
    const reasons = refs.map(r => r.reason);
    expect(reasons).toContain('previous');
    expect(reasons).toContain('current');
  });

  it('第一章时没有 previous', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const mem1 = makeMemory('ch1');
    const book = makeBook([ch1], [mem1]);

    const refs = collectAgentChapterReferences(book, ch1);
    expect(refs.every(r => r.reason !== 'previous')).toBe(true);
  });

  it('没有 memory 的章节被跳过', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const ch2 = makeChapter('ch2', '第二章');
    // ch1 没有 memory
    const mem2 = makeMemory('ch2');
    const book = makeBook([ch1, ch2], [mem2]);

    const refs = collectAgentChapterReferences(book, ch2);
    expect(refs.find(r => r.id === 'ch1')).toBeUndefined();
  });

  it('引用不重复', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const ch2 = makeChapter('ch2', '第二章');
    const mem1 = makeMemory('ch1');
    const mem2 = makeMemory('ch2');
    const book = makeBook([ch1, ch2], [mem1, mem2]);

    const refs = collectAgentChapterReferences(book, ch2);
    const ids = refs.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── getAllMemorizedChapterReferences ──────────────────────────────────────────

describe('getAllMemorizedChapterReferences', () => {
  it('列出所有有内容的章节', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const ch2 = makeChapter('ch2', '第二章');
    const ch3 = makeChapter('ch3', '第三章');
    const book = makeBook([ch1, ch2, ch3], [makeMemory('ch1'), makeMemory('ch2')]);

    const refs = getAllMemorizedChapterReferences(book, ch2);
    expect(refs.length).toBe(3); // 所有有内容/标题的章节都列出
  });

  it('当前章标记为 current，前一章标记为 previous', () => {
    const ch1 = makeChapter('ch1', '第一章');
    const ch2 = makeChapter('ch2', '第二章');
    const book = makeBook([ch1, ch2], []);

    const refs = getAllMemorizedChapterReferences(book, ch2);
    expect(refs.find(r => r.id === 'ch1')?.reason).toBe('previous');
    expect(refs.find(r => r.id === 'ch2')?.reason).toBe('current');
  });

  it('空内容 + 纯数字标题的章节被过滤', () => {
    const ch1 = makeChapter('ch1', '1', '');
    const ch2 = makeChapter('ch2', '第二章有标题');
    const book = makeBook([ch1, ch2], []);

    const refs = getAllMemorizedChapterReferences(book, ch2);
    expect(refs.find(r => r.id === 'ch1')).toBeUndefined();
  });
});
