import { describe, it, expect } from 'vitest';
import {
  buildAgentMessages,
  buildAgentRewriteMessages,
  buildAgentPlanningMessages,
  buildStoryPlanningMessages,
} from '../src/Agent/messageBuilder';
import type { BuildAgentMessagesInput, BuildAgentRewriteMessagesInput, BuildAgentPlanningMessagesInput, BuildStoryPlanningMessagesInput } from '../src/Agent/messageBuilder';
import type { Book, Chapter } from '../src/types';
import type { AgentTaskSheet, AgentReferenceBundle, AgentChapterReference } from '../src/Agent/types';

function makeBook(title = '测试小说'): Book {
  return {
    id: 'b1',
    title,
    chapters: [],
    resourceIndex: { customCharacterCategories: [] },
  } as unknown as Book;
}

function makeChapter(title = '第一章'): Chapter {
  return { id: 'ch1', title, content: '' } as Chapter;
}

function makeTaskSheet(overrides: Partial<AgentTaskSheet> = {}): AgentTaskSheet {
  return {
    version: '1.0',
    primaryGenre: 'dushi',
    userInstruction: '写一段战斗场景',
    plotIntent: '主角击败对手',
    tone: ['热血'],
    requiredBeats: ['正面交锋'],
    emotionalArc: ['压抑→爆发'],
    forbiddenMoves: ['不要杀死配角'],
    contextHints: ['第5章伏笔'],
    referenceChapters: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

function makeBundle(overrides: Partial<AgentReferenceBundle> = {}): AgentReferenceBundle {
  return {
    primaryGenre: 'dushi',
    profileSnippet: '主题材：都市\n基调：热血',
    perspective: 'third_limited_protagonist',
    patternSnippet: '[主题材] 对话模板',
    selectedPatternIds: ['p1'],
    borrowedPatternIds: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

function makeRef(id: string, reason: AgentChapterReference['reason'] = 'previous'): AgentChapterReference {
  return { id, title: `章节${id}`, reason, excerpt: '摘要内容', chapterIndex: 0 };
}

// ─── buildAgentMessages ───────────────────────────────────────────────────────

describe('buildAgentMessages', () => {
  it('返回 system + user 两条消息', () => {
    const input: BuildAgentMessagesInput = {
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: [makeRef('ch0')],
    };
    const msgs = buildAgentMessages(input);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
  });

  it('system prompt 包含 WriterZen Agent 标识', () => {
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: [],
    });
    expect(msgs[0].content).toContain('WriterZen Agent');
  });

  it('user prompt 包含书名、章节标题、剧情意图', () => {
    const msgs = buildAgentMessages({
      book: makeBook('我的小说'),
      chapter: makeChapter('决战之章'),
      taskSheet: makeTaskSheet({ plotIntent: '最终对决' }),
      referenceBundle: makeBundle(),
      chapterReferences: [],
    });
    const user = msgs[1].content;
    expect(user).toContain('我的小说');
    expect(user).toContain('决战之章');
    expect(user).toContain('最终对决');
  });

  it('章节引用按 reason 标注', () => {
    const refs = [makeRef('prev', 'previous'), makeRef('exp', 'explicit'), makeRef('cur', 'current')];
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: refs,
    });
    const user = msgs[1].content;
    expect(user).toContain('previous chapter continuity');
    expect(user).toContain('user-requested chapter');
    expect(user).toContain('current chapter context');
  });

  it('视角描述正确 — 第三人称限知', () => {
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle({ perspective: 'third_limited_protagonist' }),
      chapterReferences: [],
    });
    expect(msgs[0].content).toContain('third-person limited');
  });

  it('无脑爽文模式使用独立通道', () => {
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle({ primaryGenre: 'shuangwen' }),
      chapterReferences: [],
    });
    expect(msgs[0].content).toContain('SHUANGWEN');
    expect(msgs[1].content).toContain('书名');
  });

  it('creativity=free 包含自由模式提示', () => {
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: [],
      creativity: 'free',
    });
    expect(msgs[1].content).toContain('FREE');
  });

  it('creativity=balanced 包含平衡模式提示', () => {
    const msgs = buildAgentMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: [],
      creativity: 'balanced',
    });
    expect(msgs[1].content).toContain('BALANCED');
  });
});

// ─── buildAgentRewriteMessages ────────────────────────────────────────────────

describe('buildAgentRewriteMessages', () => {
  it('包含选中文本和改写目标', () => {
    const input: BuildAgentRewriteMessagesInput = {
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle(),
      chapterReferences: [],
      selectedText: '这段需要改写的文本。',
      rewriteInstruction: '增加心理描写',
    };
    const msgs = buildAgentRewriteMessages(input);
    expect(msgs[1].content).toContain('这段需要改写的文本');
    expect(msgs[1].content).toContain('增加心理描写');
  });

  it('无脑爽文改写使用独立通道', () => {
    const msgs = buildAgentRewriteMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      referenceBundle: makeBundle({ primaryGenre: 'shuangwen' }),
      chapterReferences: [],
      selectedText: '原文',
      rewriteInstruction: '改写',
    });
    expect(msgs[0].content).toContain('SHUANGWEN');
    expect(msgs[1].content).toContain('改写目标');
  });
});

// ─── buildAgentPlanningMessages ───────────────────────────────────────────────

describe('buildAgentPlanningMessages', () => {
  it('返回规划阶段的 system + user', () => {
    const input: BuildAgentPlanningMessagesInput = {
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
    };
    const msgs = buildAgentPlanningMessages(input);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain('planning stage');
    expect(msgs[0].content).toContain('JSON');
    expect(msgs[1].content).toContain('Intent');
  });

  it('改写模式包含选中文本', () => {
    const msgs = buildAgentPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      taskSheet: makeTaskSheet(),
      selectedText: '需要改的段落',
      rewriteInstruction: '增加细节',
    });
    expect(msgs[1].content).toContain('targeted rewrite');
    expect(msgs[1].content).toContain('需要改的段落');
  });
});

// ─── buildStoryPlanningMessages ───────────────────────────────────────────────

describe('buildStoryPlanningMessages', () => {
  it('生成故事规划 prompt', () => {
    const input: BuildStoryPlanningMessagesInput = {
      book: makeBook('我的小说'),
      chapter: makeChapter('当前章'),
      recentMemories: [
        { chapterTitle: '第一章', synopsis: '主角出场', endingState: '遇到危险', openLoops: ['伏笔A'] },
      ],
    };
    const msgs = buildStoryPlanningMessages(input);
    expect(msgs).toHaveLength(2);
    // system prompt 从 Rust IPC 获取，测试环境下为空字符串（无 Tauri runtime）
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].content).toContain('我的小说');
    expect(msgs[1].content).toContain('主角出场');
    expect(msgs[1].content).toContain('遇到危险');
    expect(msgs[1].content).toContain('伏笔A');
  });

  it('无记忆时显示提示', () => {
    const msgs = buildStoryPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
    });
    expect(msgs[1].content).toContain('暂无已整理的章节记忆');
  });

  it('用户意图注入', () => {
    const msgs = buildStoryPlanningMessages({
      book: makeBook(),
      chapter: makeChapter(),
      recentMemories: [],
      userHint: '希望主角突破',
    });
    expect(msgs[1].content).toContain('希望主角突破');
  });
});
