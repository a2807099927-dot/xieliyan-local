import { describe, it, expect } from 'vitest';
import { buildArcPlanningMessages } from '../src/Agent/arcPlannerPrompt';
import type { BuildArcPlanningMessagesInput, ArcMemoryItem } from '../src/Agent/arcPlannerPrompt';
import type { Book, Chapter } from '../src/types';

function makeBook(title = '测试小说'): Book {
  return { id: 'b1', title, chapters: [], resourceIndex: { customCharacterCategories: [] } } as unknown as Book;
}

function makeChapter(title = '第十章 决战'): Chapter {
  return { id: 'ch10', title, content: '' } as Chapter;
}

function makeMemory(chapterTitle: string, synopsis: string, extra: Partial<ArcMemoryItem> = {}): ArcMemoryItem {
  return { chapterTitle, synopsis, ...extra };
}

// ─── buildArcPlanningMessages ─────────────────────────────────────────────────

describe('buildArcPlanningMessages — 讨论阶段', () => {
  it('返回至少 system + user 两条消息', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '帮我规划接下来的剧情',
    });
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });

  it('system prompt 包含三大规划法则', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '规划',
    });
    expect(msgs[0].content).toContain('极限铺垫');
    expect(msgs[0].content).toContain('信息差');
    expect(msgs[0].content).toContain('连锁震惊');
  });

  it('context 包含书名和章节标题', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook('龙王归来'),
      chapter: makeChapter('第五章 初露锋芒'),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '测试',
    });
    const contextMsg = msgs[1].content;
    expect(contextMsg).toContain('龙王归来');
    expect(contextMsg).toContain('第五章 初露锋芒');
  });

  it('包含记忆摘要', () => {
    const memories = [
      makeMemory('第一章', '主角入学', { endingState: '遇到导师', openLoops: ['神秘信物'] }),
      makeMemory('第二章', '初次冲突'),
    ];
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: memories,
      conversationHistory: [],
      userMessage: '继续',
    });
    const contextMsg = msgs[1].content;
    expect(contextMsg).toContain('主角入学');
    expect(contextMsg).toContain('遇到导师');
    expect(contextMsg).toContain('神秘信物');
    expect(contextMsg).toContain('初次冲突');
  });

  it('无记忆时显示提示文字', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '规划',
    });
    expect(msgs[1].content).toContain('暂无已整理的章节记忆');
  });

  it('注入对话历史', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [
        { role: 'user', content: '主角要觉醒' },
        { role: 'assistant', content: '建议分三步走' },
      ],
      userMessage: '就这样吧',
    });
    expect(msgs.length).toBe(5); // system + context + history(2) + userMessage
    expect(msgs[2].content).toBe('主角要觉醒');
    expect(msgs[3].content).toBe('建议分三步走');
    expect(msgs[4].content).toBe('就这样吧');
  });

  it('空 userMessage 不追加消息', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '   ',
    });
    expect(msgs.length).toBe(2); // system + context only
  });
});

describe('buildArcPlanningMessages — 输出大纲阶段', () => {
  it('finalizeOutline=true 使用输出大纲 prompt', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '输出大纲',
      finalizeOutline: true,
    });
    expect(msgs[0].content).toContain('【大纲】');
    expect(msgs[0].content).toContain('章数规则');
  });

  it('自定义 plannerPrompt 替换内置 prompt', () => {
    const custom = '你是一个自定义规划师，按我的要求来。';
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '测试',
      customPlannerPrompt: custom,
    });
    expect(msgs[0].content).toBe(custom);
  });

  it('genre 参数传入 context', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '规划',
      genre: 'xuanhuan',
    });
    expect(msgs[1].content).toContain('xuanhuan');
  });

  it('无 genre 时显示"未指定"', () => {
    const msgs = buildArcPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      conversationHistory: [],
      userMessage: '规划',
    });
    expect(msgs[1].content).toContain('未指定');
  });
});
