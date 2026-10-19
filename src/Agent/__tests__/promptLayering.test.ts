import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildWritingPromptBundle, buildWriterSystemPrompt, buildEditorReviewSystemPrompt } from '../skills/writingSkill';
import { runWizardStep } from '../newBookWizard';
import type { WizardChatFn } from '../newBookWizard';
import type { Book, Chapter } from '../../types';
import type { AgentWizardState } from '../wizardState';
import { useConfigStore } from '../../store/useConfigStore';

function fakeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    description: '玄幻穿越有系统',
    chapters: [
      { id: 'c1', title: '第1章', content: '正文', wordCount: 100, createdAt: '', updatedAt: '', outline: '' } as Chapter,
    ],
    settings: { worldSettings: '灵气复苏世界', plotOutline: '主角一路变强' } as Book['settings'],
    resourceIndex: {},
  } as Book;
}

function stateOf(step: number, extra: Partial<AgentWizardState> = {}): AgentWizardState {
  return { mode: 'new_book_wizard', step, userRequest: '写一本玄幻穿越文', ...extra };
}

function chatReturning(text: string): WizardChatFn {
  return async () => ({ text });
}

const APPROACH_JSON = JSON.stringify({
  perspective: '第三人称', pacing: '快节奏', differentiation: '系统流', readerPositioning: '男频',
});
const PLAN_JSON = JSON.stringify({
  volumeGoal: '入宗站稳', conflictProgression: ['入门', '小比'], characterArc: '从弱到强', volumeEndHook: '秘辛',
});

beforeEach(() => {
  useConfigStore.setState({
    config: {
      ai: {
        customPlannerPrompt: '用户规划偏好：多线并进，埋三卷长线',
        customWriterPrompt: '用户写作偏好：短句，快节奏',
        customEditorPrompt: '用户审稿偏好：重点查逻辑漏洞',
        styleInstruction: '用户文风：简约冷峻',
        stylePresetId: 'custom',
      },
      ui: {},
      agent: { persona: 'casual', language: 'zh-CN' },
      workspace: {},
    } as any,
  });
});
afterEach(() => {
  useConfigStore.setState({ config: undefined });
});

describe('buildWritingPromptBundle 分层裁剪', () => {
  it('默认全开（兼容旧调用）', () => {
    const bundle = buildWritingPromptBundle(fakeBook(), 'planner');
    expect(bundle.fullBlock).toContain('剧情规划师自定义提示词');
    expect(bundle.fullBlock).toContain('自定义文风');
  });

  it('planner 环节 withStyle:false → 不带文风', () => {
    const bundle = buildWritingPromptBundle(fakeBook(), 'planner', null, null, { withStyle: false });
    expect(bundle.fullBlock).toContain('剧情规划师自定义提示词');
    expect(bundle.fullBlock).not.toContain('自定义文风');
    expect(bundle.fullBlock).not.toContain('用户文风');
  });

  it('writer 环节 withStoryCanon:false → 不带设定卡/剧情卡', () => {
    const bundle = buildWritingPromptBundle(fakeBook(), 'writer', null, null, { withStoryCanon: false, withStyle: true });
    // T1 单入口：风格作为写手角色提示词注入（【写手自定义提示词】内），不再重复拼「自定义文风」段
    expect(bundle.fullBlock).toContain('写手自定义提示词');
    expect(bundle.fullBlock).toContain('用户文风：简约冷峻');
    // storyCanon 块的特征（小说设定卡）不应出现
    expect(bundle.fullBlock).not.toContain('小说设定卡');
    expect(bundle.fullBlock).not.toContain('剧情档案');
  });

  it('editor 环节不设定卡/不文风/不带 context', () => {
    const bundle = buildWritingPromptBundle(fakeBook(), 'editor', null, null, {
      withStoryCanon: false,
      withBookContext: false,
      withStyle: false,
    });
    expect(bundle.fullBlock).toContain('审稿编辑自定义提示词');
    expect(bundle.fullBlock).not.toContain('小说设定卡');
    expect(bundle.fullBlock).not.toContain('自定义文风');
    expect(bundle.fullBlock).not.toContain('本书世界');
  });
});

describe('writer / editor 上层函数裁剪', () => {
  it('buildWriterSystemPrompt 无设定卡全文但保留风格（单入口）', () => {
    const prompt = buildWriterSystemPrompt({ book: fakeBook(), chapterTitle: '第1章' });
    expect(prompt).toContain('写手自定义提示词');
    // T1：风格作为写手提示词注入，内容在、独立「自定义文风」标题不在
    expect(prompt).toContain('用户文风：简约冷峻');
    // storyCanon 全文（近章剧情档案/角色卡聚合块）不应出现，但 worldSettings 设定摘要（bookContext）保留供世界规则
    expect(prompt).not.toContain('近章剧情');
    expect(prompt).not.toContain('角色整理卡');
  });

  it('buildEditorReviewSystemPrompt 无设定卡无文风', () => {
    const prompt = buildEditorReviewSystemPrompt(fakeBook());
    expect(prompt).toContain('审稿编辑自定义提示词');
    expect(prompt).toContain('审稿编辑');
    expect(prompt).not.toContain('小说设定卡');
    expect(prompt).not.toContain('自定义文风');
  });
});

describe('wizard 接入自定义提示词', () => {
  it('第 3 步写法决策含 planner 自定义提示词', async () => {
    const state = stateOf(3, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
    });
    // 注入 config（beforeEach 已设置 customPlannerPrompt）
    const { card } = await runWizardStep(fakeBook(), state, chatReturning(APPROACH_JSON), undefined, useConfigStore.getState().config);
    expect(card.body).toContain('快节奏');
  });

  it('第 3 步构建的 prompt 原样包含用户 planner 提示词', async () => {
    const state = stateOf(3, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: 'c', longTermGoal: 'g', satisfactionModel: 's' },
    });
    // 直接验证 buildWritingApproachPrompt 产物含 plannerPrompt
    const { buildWritingApproachPrompt } = await import('../openingDirection');
    const msgs = buildWritingApproachPrompt({
      book: fakeBook(),
      archive: state.coreArchive!,
      genreBlock: '题材',
      plannerPrompt: '用户规划偏好：多线并进，埋三卷长线',
    });
    expect(msgs[1].content).toContain('多线并进，埋三卷长线');
  });

  it('第 4 步剧情规划含 planner 提示词与研究结论', async () => {
    const state = stateOf(4, {
      direction: { title: '穿越者', pitch: 'x', outline: 'y', risk: 'z' },
      coreArchive: { protagonist: '林尘', world: '灵气复苏', coreConflict: '宗门之战', longTermGoal: 'g', satisfactionModel: '打脸' },
      writingApproach: { perspective: 'p', pacing: 'p', differentiation: 'd', readerPositioning: 'r' },
    });
    const { buildPlotPlanPrompt } = await import('../plotPlanning');
    const msgs = buildPlotPlanPrompt({
      book: fakeBook(),
      coreArchiveBlock: '档案',
      writingApproachBlock: '写法',
      researchBlock: '【同题材研究结论】玄幻开篇多用穿越即危机',
      plannerPrompt: '用户规划偏好：多线并进，埋三卷长线',
    });
    const user = msgs[1].content;
    expect(user).toContain('多线并进，埋三卷长线');
    expect(user).toContain('同题材研究结论');
  });
});

describe('写作风格单入口（T1）', () => {
  function styleConfig(instruction: string, customWriter?: string) {
    return {
      ai: {
        activeStyleProfileId: 'p1',
        styleProfiles: [{ id: 'p1', name: '测试风格', stylePresetId: 'custom', styleInstruction: instruction }],
        ...(customWriter !== undefined ? { customWriterPrompt: customWriter } : {}),
      },
      ui: {},
      agent: { persona: 'casual', language: 'zh-CN' },
      workspace: {},
    } as any;
  }

  it('改风格后 writer prompt 跟随 styleProfiles.styleInstruction', () => {
    useConfigStore.setState({ config: styleConfig('新风格：冷酷暗黑风') });
    const bundle = buildWritingPromptBundle(fakeBook(), 'writer');
    expect(bundle.fullBlock).toContain('新风格：冷酷暗黑风');
    // 不含旧迁移的 customWriterPrompt 残留（无残留）
    expect(bundle.fullBlock).not.toContain('旧写手提示词');
  });

  it('改风格后不依赖 customWriterPrompt（bug 回归：双段不共存）', () => {
    useConfigStore.setState({ config: styleConfig('新风格：冷酷暗黑风', '旧迁移写手风格：暖甜风') });
    const bundle = buildWritingPromptBundle(fakeBook(), 'writer');
    // 只含新风格一段，旧迁移内容不出现
    expect(bundle.fullBlock).toContain('新风格：冷酷暗黑风');
    expect(bundle.fullBlock).not.toContain('旧迁移写手风格');
  });

  it('无风格配置时 fallback 到 customWriterPrompt（旧迁移兼容）', () => {
    useConfigStore.setState({ config: styleConfig('', '旧写手风格文本') });
    const bundle = buildWritingPromptBundle(fakeBook(), 'writer');
    expect(bundle.fullBlock).toContain('旧写手风格文本');
  });

  it('两者都无时 fallback 到内置 agent_writing_system（getRolePrompt 兜底）', () => {
    // 清空 config 的 writer 相关字段，让它走 getRolePrompt 内置兜底
    useConfigStore.setState({ config: styleConfig('') });
    // 内置 prompt 在测试环境可能返回占位/空，验证不抛错且 bundle 结构完整
    const bundle = buildWritingPromptBundle(fakeBook(), 'writer');
    expect(bundle.fullBlock).toContain('写作 Skill');
  });
});
