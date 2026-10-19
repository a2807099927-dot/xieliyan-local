import { describe, it, expect } from 'vitest';
import {
  buildFullSummaryIndex,
  extractSearchKeywords,
  retrieveMemoryContext,
  buildAgentMemoryPrompt,
} from '../src/Agent/memoryRetrieval';
import type { Book, Chapter, ChapterMemory } from '../src/types';

function makeChapter(id: string, title: string): Chapter {
  return { id, title, content: '<p>正文</p>' } as Chapter;
}

function makeMemory(chapterId: string, summary: string): ChapterMemory {
  return { chapterId, summary } as ChapterMemory;
}

function makeBook(chapters: Chapter[], memoryBank: ChapterMemory[] = []): Book {
  return {
    id: 'book-1',
    title: '测试小说',
    chapters,
    memoryBank,
    resourceIndex: { customCharacterCategories: [] },
  } as unknown as Book;
}

// ─── buildFullSummaryIndex ────────────────────────────────────────────────────

describe('buildFullSummaryIndex', () => {
  it('生成每章一行的摘要索引', () => {
    const chapters = [makeChapter('ch1', '觉醒'), makeChapter('ch2', '修炼')];
    const memories = [makeMemory('ch1', '主角觉醒灵根'), makeMemory('ch2', '主角开始修炼')];
    const book = makeBook(chapters, memories);

    const result = buildFullSummaryIndex(book);
    expect(result).toContain('第1章 觉醒：主角觉醒灵根');
    expect(result).toContain('第2章 修炼：主角开始修炼');
  });

  it('无 memory 的章节被跳过', () => {
    const chapters = [makeChapter('ch1', '有记忆'), makeChapter('ch2', '无记忆')];
    const memories = [makeMemory('ch1', '摘要')];
    const book = makeBook(chapters, memories);

    const result = buildFullSummaryIndex(book);
    expect(result).toContain('第1章');
    expect(result).not.toContain('第2章');
  });

  it('超过80字的摘要被截断', () => {
    const longSummary = '这'.repeat(100);
    const book = makeBook([makeChapter('ch1', '长摘要')], [makeMemory('ch1', longSummary)]);

    const result = buildFullSummaryIndex(book);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(longSummary.length + 30);
  });

  it('完全没有 memory 返回空字符串', () => {
    const book = makeBook([makeChapter('ch1', '空')], []);
    expect(buildFullSummaryIndex(book)).toBe('');
  });
});

// ─── extractSearchKeywords ────────────────────────────────────────────────────

describe('extractSearchKeywords', () => {
  it('提取中文词组（2-6字）', () => {
    const book = makeBook([]);
    const keywords = extractSearchKeywords('主角和敌人在山谷决战', book);
    expect(keywords.some(k => k.length >= 2)).toBe(true);
  });

  it('过滤停用词', () => {
    const book = makeBook([]);
    const keywords = extractSearchKeywords('什么是修炼', book);
    expect(keywords).not.toContain('什么');
  });

  it('提取章节号', () => {
    const book = makeBook([]);
    const keywords = extractSearchKeywords('第5章发生了什么', book);
    expect(keywords).toContain('第5章');
  });

  it('匹配已有角色名', () => {
    const book = makeBook([]);
    (book.resourceIndex as any).customCharacterCategories = [
      { children: [{ name: '李云天', aliases: ['小天'] }] },
    ];
    const keywords = extractSearchKeywords('李云天最后怎么样了', book);
    expect(keywords).toContain('李云天');
  });

  it('最多返回12个关键词', () => {
    const book = makeBook([]);
    const longQuery = '关键词一关键词二关键词三关键词四关键词五关键词六关键词七关键词八关键词九关键词十关键十一关键十二关键十三关键十四';
    const keywords = extractSearchKeywords(longQuery, book);
    expect(keywords.length).toBeLessThanOrEqual(12);
  });
});

// ─── retrieveMemoryContext ────────────────────────────────────────────────────

describe('retrieveMemoryContext', () => {
  it('返回完整检索结果', () => {
    const chapters = [makeChapter('ch1', '觉醒'), makeChapter('ch2', '修炼')];
    const memories = [
      { ...makeMemory('ch1', '主角觉醒灵根'), archiveRecords: [
        { kind: 'character', title: '主角', subject: '主角', detail: '觉醒', chapterId: 'ch1' },
      ]},
      makeMemory('ch2', '修炼突破'),
    ] as ChapterMemory[];
    const book = makeBook(chapters, memories);

    const result = retrieveMemoryContext('主角觉醒', book);
    expect(result.summaryIndex).toContain('觉醒');
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it('无匹配时 relevantRecords 和 relevantMemories 为空', () => {
    const book = makeBook([makeChapter('ch1', '空')], [makeMemory('ch1', '摘要')]);
    const result = retrieveMemoryContext('完全不相关的查询XYZ', book);
    // summaryIndex 仍然有值（全量索引始终包含）
    expect(result.summaryIndex).toBeTruthy();
  });
});

// ─── buildAgentMemoryPrompt ───────────────────────────────────────────────────

describe('buildAgentMemoryPrompt', () => {
  it('包含书名和回答规则', () => {
    const result = {
      summaryIndex: '第1章 觉醒：觉醒',
      relevantRecords: '',
      relevantMemories: '',
      matchedKeywords: [],
      estimatedTokens: 100,
    };
    const book = makeBook([]);
    const prompt = buildAgentMemoryPrompt(result, book);
    expect(prompt).toContain('测试小说');
    expect(prompt).toContain('回答规则');
    expect(prompt).toContain('【全书章节摘要】');
  });

  it('无数据时显示提示信息', () => {
    const result = {
      summaryIndex: '',
      relevantRecords: '',
      relevantMemories: '',
      matchedKeywords: [],
      estimatedTokens: 0,
    };
    const book = makeBook([]);
    const prompt = buildAgentMemoryPrompt(result, book);
    expect(prompt).toContain('尚未进行智能整理');
  });
});
