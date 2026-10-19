import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildPreWritePrompt,
  buildPreWriteLightPrompt,
  parsePreWriteResult,
  formatPreWriteDecisionForWriter,
  formatPreWriteDecisionForUser,
  runPreWriteReflection,
  type PreWriteChatFn,
} from '../preWriteReflection';
import type { Book, Chapter } from '../../types';
import type { AgentTaskSheet } from '../types';
import { useConfigStore } from '../../store/useConfigStore';

function fakeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: '测试书',
    description: '',
    chapters: [
      {
        id: 'c1',
        title: '第1章',
        content: '',
        wordCount: 0,
        createdAt: '',
        updatedAt: '',
        outline: '本章细纲：主角修炼突破',
      } as Chapter,
    ],
    settings: {},
    resourceIndex: {},
    ...overrides,
  } as Book;
}

function fakeChapter(book: Book): Chapter {
  return book.chapters[0];
}

function fakeSheet(primaryGenre: AgentTaskSheet['primaryGenre'] = 'xuanhuan'): AgentTaskSheet {
  return {
    version: '1',
    primaryGenre,
    userInstruction: '按细纲写本章',
    plotIntent: '推进主线',
    tone: [],
    requiredBeats: [],
    emotionalArc: [],
    forbiddenMoves: [],
    contextHints: [],
    referenceChapters: [],
    requestedCapabilities: [],
  };
}

function decisionJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    continuation: '上一章停在山门，本章从练功房接',
    approach: '主线推进：修炼到突破临界点',
    rationale: '为下一场冲突蓄力',
    add: [{ what: '埋下玉佩线索', why: '回收伏笔' }],
    remove: [{ what: '重复的修炼过程', why: '避免拖节奏' }],
    pacing: { hook: '一开场就是突破异象', satisfaction: ['突破成功', '打脸同门'], endState: '境界提升，留新目标' },
    readability: '信息密度适中，别头重脚轻',
    ...extra,
  });
}

describe('parsePreWriteResult 容错解析', () => {
  it('纯 JSON 解析成功', () => {
    const d = parsePreWriteResult(decisionJson());
    expect(d).not.toBeNull();
    expect(d!.continuation).toContain('上一章');
    expect(d!.approach).toContain('修炼');
    expect(d!.pacing.satisfaction).toHaveLength(2);
    expect(d!.add[0].what).toBe('埋下玉佩线索');
  });

  it('fenced code block 内嵌 JSON 解析成功', () => {
    const raw = '```json\n' + decisionJson() + '\n```';
    const d = parsePreWriteResult(raw);
    expect(d?.continuation).toContain('上一章');
  });

  it('think 标签 + 前缀说明 + 截断 JSON 也能解析', () => {
    const raw = `<thinking>我先分析一下承接。</thinking>
好的，决策如下：
${decisionJson()}（后面还有被截断的说明）`;
    const d = parsePreWriteResult(raw);
    expect(d?.approach).toContain('修炼');
    expect(d?.pacing.satisfaction).toContain('突破成功');
  });

  it('垃圾输入返回 null 不抛错', () => {
    expect(parsePreWriteResult('')).toBeNull();
    expect(parsePreWriteResult('   ')).toBeNull();
    expect(parsePreWriteResult('not json at all')).toBeNull();
    expect(parsePreWriteResult('[]')).toBeNull();
  });

  it('satisfaction 最多保留 3 个，空串过滤', () => {
    const d = parsePreWriteResult(decisionJson({
      pacing: { hook: '钩子', satisfaction: ['a', '', 'b', 'c', 'd', 'e'], endState: '末' },
    }));
    expect(d!.pacing.satisfaction).toEqual(['a', 'b', 'c']);
  });

  it('add/remove 最多保留 6 条且过滤空 what', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ what: `加${i}`, why: `原因${i}` }));
    const d = parsePreWriteResult(decisionJson({
      add: [...many, { what: '', why: '空' }],
      remove: [{ what: '', why: '空' }, ...many],
    }));
    // slice(0,6) 先截断再过滤空 what：空项会占用截断前的槽位
    expect(d!.add).toHaveLength(6);
    expect(d!.add.every((a) => a.what)).toBe(true);
    expect(d!.remove).toHaveLength(5);
    expect(d!.remove.every((r) => r.what)).toBe(true);
  });
});

describe('buildPreWritePrompt / buildPreWriteLightPrompt', () => {
  const base = {
    book: fakeBook(),
    chapter: fakeChapter(fakeBook()),
    taskSheet: fakeSheet(),
    canonBlock: '设定卡内容',
    genreBlock: '题材打法内容',
  };

  it('full 版包含五问、schema、承接上下文与题材打法', () => {
    const msgs = buildPreWritePrompt(base);
    expect(msgs[0].role).toBe('system');
    const user = msgs[1].content;
    expect(user).toContain('请回答五问');
    expect(user).toContain('为什么这么写');
    expect(user).toContain('设定卡内容');
    expect(user).toContain('题材打法内容');
    expect(user).toContain('"continuation"');
  });

  it('传入 outlineText 时写进细纲段', () => {
    const msgs = buildPreWritePrompt({ ...base, outlineText: '本章细纲：主角修炼突破' });
    expect(msgs[1].content).toContain('本章细纲（正文必须严格按此写）');
    expect(msgs[1].content).toContain('主角修炼突破');
  });

  it('未传 outlineText 时细纲段标注（无）', () => {
    const msgs = buildPreWritePrompt(base);
    expect(msgs[1].content).toContain('【本章细纲】（无）');
  });

  it('轻量版只出爽点节奏，不含五问与为什么这么写', () => {
    const msgs = buildPreWriteLightPrompt(base);
    const user = msgs[1].content;
    expect(user).toContain('请只回答爽点与节奏');
    expect(user).toContain('开篇钩子');
    expect(user).not.toContain('请回答五问');
    expect(user).not.toContain('为什么这么写');
  });
});

describe('formatPreWriteDecisionForWriter / formatPreWriteDecisionForUser', () => {
  const decision = {
    continuation: '承接点',
    approach: '主线推进',
    rationale: '为什么',
    add: [{ what: '加A', why: '理由A' }],
    remove: [{ what: '少B', why: '理由B' }],
    pacing: { hook: '钩子', satisfaction: ['爽点1'], endState: '章末' },
    readability: '可读性',
  };

  it('写手注入版带「写手必须遵守」声明', () => {
    const text = formatPreWriteDecisionForWriter(decision);
    expect(text).toContain('【写前复盘决策（写手必须遵守）】');
    expect(text).toContain('承接点：承接点');
    expect(text).toContain('主动加：加A（理由A）');
    expect(text).toContain('本章爽点：爽点1');
  });

  it('用户展示版是人可读文本', () => {
    const text = formatPreWriteDecisionForUser(decision);
    expect(text).toContain('写前复盘：');
    expect(text).toContain('承接：承接点');
    expect(text).toContain('加：加A');
  });
});

describe('runPreWriteReflection 共享入口', () => {
  // 默认开启态：让聚焦「复盘逻辑本身」的用例能跑到 callChat；
  // 「默认关闭」单独用例会覆盖为 undefined / false。
  beforeEach(() => {
    useConfigStore.setState({
      config: { ai: {}, ui: {}, agent: { persona: 'casual', language: 'zh-CN', preWriteReflection: true }, workspace: {} } as any,
    });
  });
  afterEach(() => {
    useConfigStore.setState({ config: undefined });
  });

  const input = () => ({
    book: fakeBook(),
    chapter: fakeChapter(fakeBook()),
    taskSheet: fakeSheet(),
    outlineText: '细纲：主角修炼突破',
  });

  it('开关关闭时短路，不调用 callChat，返回空决策', async () => {
    useConfigStore.setState({
      config: { ai: {}, ui: {}, agent: { persona: 'casual', language: 'zh-CN', preWriteReflection: false }, workspace: {} } as any,
    });
    const callChat = vi.fn(async () => ({ text: decisionJson() }));
    const result = await runPreWriteReflection(input(), callChat);
    expect(result).toEqual({ decisionText: '', decision: null });
    expect(callChat).not.toHaveBeenCalled();
  });

  it('未配置时默认关闭（写作思考边界收敛后：正文纯执行）', async () => {
    useConfigStore.setState({ config: undefined }); // 覆盖为缺省
    const callChat = vi.fn(async () => ({ text: decisionJson() }));
    const result = await runPreWriteReflection(input(), callChat);
    expect(result).toEqual({ decisionText: '', decision: null });
    expect(callChat).not.toHaveBeenCalled();
  });

  it('显式开启时解析决策并把原文透传', async () => {
    useConfigStore.setState({
      config: { ai: {}, ui: {}, agent: { persona: 'casual', language: 'zh-CN', preWriteReflection: true }, workspace: {} } as any,
    });
    const raw = decisionJson();
    const callChat = vi.fn(async () => ({ text: raw }));
    const result = await runPreWriteReflection(input(), callChat);
    expect(callChat).toHaveBeenCalledTimes(1);
    expect(result.decisionText).toBe(raw);
    expect(result.decision?.approach).toContain('修炼');
  });

  it('把 outlineText 传入复盘 prompt', async () => {
    const callChat = vi.fn<PreWriteChatFn>(async () => ({ text: decisionJson() }));
    await runPreWriteReflection(input(), callChat);
    const user = String(callChat.mock.calls[0][0][1].content);
    expect(user).toContain('主角修炼突破');
  });

  it('解析失败不抛错：返回原文 + decision=null（降级）', async () => {
    const callChat = vi.fn(async () => ({ text: '这轮没输出 JSON，只给了两句文字' }));
    const result = await runPreWriteReflection(input(), callChat);
    expect(result.decision).toBeNull();
    expect(result.decisionText).toBe('这轮没输出 JSON，只给了两句文字');
  });

  it('callChat 抛错时降级为空决策，不向上抛', async () => {
    const callChat = vi.fn(async () => { throw new Error('网络错误'); });
    const result = await runPreWriteReflection(input(), callChat);
    expect(result).toEqual({ decisionText: '', decision: null });
  });

  it('shuangwen 走轻量版 prompt', async () => {
    const callChat = vi.fn<PreWriteChatFn>(async () => ({ text: decisionJson() }));
    await runPreWriteReflection({ ...input(), taskSheet: fakeSheet('shuangwen') }, callChat);
    const user = String(callChat.mock.calls[0][0][1].content);
    expect(user).toContain('请只回答爽点与节奏');
    expect(user).not.toContain('请回答五问');
  });
});
