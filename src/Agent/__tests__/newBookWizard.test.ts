import { describe, expect, it, vi } from 'vitest';
import { runWizardStep, type WizardChatFn, type WizardSearchFn } from '../newBookWizard';
import type { Book, Chapter } from '../../types';
import type { AgentWizardState } from '../wizardState';

function fakeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    description: '玄幻穿越有系统',
    chapters: [
      { id: 'c1', title: '第1章', content: '', wordCount: 0, createdAt: '', updatedAt: '', outline: '' } as Chapter,
    ],
    settings: { worldSettings: '灵气复苏世界' } as Book['settings'],
    resourceIndex: {},
  } as Book;
}

function stateOf(step: number, extra: Partial<AgentWizardState> = {}): AgentWizardState {
  return { mode: 'new_book_wizard', step, userRequest: '写一本玄幻穿越文', ...extra };
}

function chatReturning(text: string): WizardChatFn {
  return async () => ({ text });
}

const DIRECTION_JSON = JSON.stringify({
  options: [
    { title: '穿越者', pitch: '开局觉醒系统', outline: '宗门崛起', risk: '套路旧' },
    { title: '废柴逆袭', pitch: '被打压后觉醒', outline: '一路打脸', risk: '憋屈' },
  ],
});
const ARCHIVE_JSON = JSON.stringify({
  protagonist: '林尘', world: '灵气复苏', coreConflict: '宗门之战', longTermGoal: '飞升', satisfactionModel: '打脸',
});
const APPROACH_JSON = JSON.stringify({
  perspective: '第三人称', pacing: '快节奏', differentiation: '系统流', readerPositioning: '男频',
});
const PLAN_JSON = JSON.stringify({
  volumeGoal: '入宗站稳', conflictProgression: ['入门', '小比'], characterArc: '从弱到强', volumeEndHook: '秘辛',
});
const OUTLINE_JSON = JSON.stringify({
  chapters: [{ chapterNo: 1, coreEvent: '穿越觉醒', beats: ['醒来', '获系统'], plotFunction: '开局' }],
});
const REVIEW_JSON = JSON.stringify({
  issues: [{ chapterNo: 1, verdict: 'valid', reason: '推进主线', suggestion: '' }],
  summary: 'ok',
});

describe('runWizardStep 各步卡产出', () => {
  it('第 1 步方向卡：产出 2-3 个可选项', async () => {
    const { card, payload } = await runWizardStep(fakeBook(), stateOf(1), chatReturning(DIRECTION_JSON));
    expect(card.step).toBe(1);
    expect(card.options?.length).toBe(2);
    expect(card.options?.[0].key).toBe('穿越者');
    expect(Array.isArray(payload)).toBe(true);
  });

  it('第 2 步档案卡：解析五要素', async () => {
    const state = stateOf(2, { direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' } });
    const { card, payload } = await runWizardStep(fakeBook(), state, chatReturning(ARCHIVE_JSON));
    expect(card.title).toContain('故事核心档案');
    expect(card.body).toContain('林尘');
    expect((payload as any).protagonist).toBe('林尘');
  });

  it('第 3 步写法决策卡', async () => {
    const state = stateOf(3, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
    });
    const { card } = await runWizardStep(fakeBook(), state, chatReturning(APPROACH_JSON));
    expect(card.title).toContain('写法决策');
    expect(card.body).toContain('第三人称');
  });

  it('第 4 步剧情规划卡：研究失败不阻塞', async () => {
    const state = stateOf(4, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
      writingApproach: { perspective: '第三人称', pacing: '快', differentiation: 'd', readerPositioning: 'r' },
    });
    const failingSearch: WizardSearchFn = async () => { throw new Error('search fail'); };
    const { card } = await runWizardStep(fakeBook(), state, chatReturning(PLAN_JSON), failingSearch);
    expect(card.title).toContain('第一卷规划');
    expect(card.body).toContain('入宗站稳');
  });

  it('第 4 步会调 web_search 拿到结果注入研究', async () => {
    const state = stateOf(4, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: '宗门之战', longTermGoal: 'g', satisfactionModel: '打脸' },
      writingApproach: { perspective: '第三人称', pacing: '快', differentiation: 'd', readerPositioning: 'r' },
    });
    const search = vi.fn<WizardSearchFn>(async () => '【联网搜索结果（Bing）：玄幻 打脸 经典 完本】...');
    const chat = vi.fn(chatReturning(PLAN_JSON));
    await runWizardStep(fakeBook(), state, chat, search);
    expect(search).toHaveBeenCalled();
    expect(search.mock.calls[0][0]).toContain('打脸');
    expect(search.mock.calls[0][0]).toContain('经典');
  });

  it('第 5 步章节大纲卡', async () => {
    const state = stateOf(5, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
      writingApproach: { perspective: 'p', pacing: 'p', differentiation: 'd', readerPositioning: 'r' },
      plotPlan: { volumeGoal: '入宗', conflictProgression: ['入门'], characterArc: 'a', volumeEndHook: 'h' },
    });
    const { card } = await runWizardStep(fakeBook(), state, chatReturning(OUTLINE_JSON));
    expect(card.title).toContain('章节大纲');
    expect(card.body).toContain('穿越觉醒');
  });

  it('第 6 步大纲审查：isFinal=true', async () => {
    const state = stateOf(6, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
      writingApproach: { perspective: 'p', pacing: 'p', differentiation: 'd', readerPositioning: 'r' },
      plotPlan: { volumeGoal: '入宗', conflictProgression: ['入门'], characterArc: 'a', volumeEndHook: 'h' },
      outline: [{ chapterNo: 1, coreEvent: '穿越', beats: ['b'], plotFunction: 'f' }],
    });
    const { card } = await runWizardStep(fakeBook(), state, chatReturning(REVIEW_JSON));
    expect(card.isFinal).toBe(true);
    expect(card.title).toContain('全部有效');
  });

  it('解析失败返回错误提示不抛错', async () => {
    const { card } = await runWizardStep(fakeBook(), stateOf(1), chatReturning('not json'));
    expect(card.body).toContain('模型未返回有效方向');
  });
});
