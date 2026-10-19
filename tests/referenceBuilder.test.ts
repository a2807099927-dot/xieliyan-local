import { describe, it, expect } from 'vitest';
import { buildAgentReferenceBundle } from '../src/Agent/referenceBuilder';
import type { AgentTaskSheet, GenrePack, PatternSelection, CraftPattern, AgentReflectorThreshold } from '../src/Agent/types';

function makeTaskSheet(overrides: Partial<AgentTaskSheet> = {}): AgentTaskSheet {
  return {
    version: '1.0',
    primaryGenre: 'dushi',
    userInstruction: '测试',
    plotIntent: '测试意图',
    tone: ['热血'],
    requiredBeats: [],
    emotionalArc: [],
    forbiddenMoves: [],
    contextHints: [],
    referenceChapters: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

function makeThreshold(): AgentReflectorThreshold {
  return {
    passTotal: 60,
    maxTotal: 100,
    keyDimensions: ['persona'],
    keyMinScore: 7,
    dimensions: {
      persona: {
        forbidden_behaviors: ['跪下求饶', '哭哭啼啼'],
      },
    },
  };
}

function makePack(overrides: Partial<GenrePack['profile']> = {}): GenrePack {
  return {
    genre: 'dushi',
    profile: {
      genre: 'dushi',
      displayName: '都市爽文',
      reflectorThreshold: makeThreshold(),
      styleProfile: {
        tone: '热血爽快',
        perspective: 'third_limited_protagonist',
        bannedWords: ['卧槽', '我靠'],
        bannedSceneTypes: ['无意义注水对话'],
        chapterStructure: {
          opening_types: { action: 0.6, dialogue: 0.3, description: 0.1 },
          ending_types: { cliffhanger: 0.7, resolution: 0.3 },
          climax_position_range: [0.6, 0.8],
        },
        conflictResolutionLogic: {
          '面对挑衅': '冷静应对后精准反击',
          '遭遇陷害': '收集证据后一击致命',
        },
        psychologyDepthRatio: {
          surface_level_thought: 0.3,
          direct_inner_monologue: 0.4,
          strategic_planning: 0.2,
          deep_emotional_reflection: 0.1,
        },
      },
      conflictSignals: {
        undercurrent: ['暗流', '不安'],
        open_conflict: ['冲突', '对峙'],
        explosion: ['爆发', '决裂'],
      },
      craftFingerprint: {
        dialogue_style: '对话风格：短促有力，信息密度高',
        rhythm_style: '节奏风格：张弛有度，战斗段落加速',
        psychology_style: '心理风格：内心吐槽为主',
        description_style: '描写风格：少即是多',
      },
      raw: {
        core_emotional_loop: '压制→反击→震惊→膜拜',
      },
      ...overrides,
    } as any,
    patterns: [],
  };
}

function makePattern(name: string, genre = 'dushi'): CraftPattern {
  return {
    id: `p-${name}`,
    genre: genre as any,
    patternType: 'dialogue',
    patternName: name,
    frequency: 'common',
    triggerConditions: [{ if: '角色对峙', because: '需要制造张力' }],
    templates: [{ template: '模板一' }, { template: '模板二' }],
    forbidden: ['禁忌行为一'],
    conflictSignals: {},
    examples: {},
    ruleSummary: '规则摘要',
    source: 'test',
    createdAt: Date.now(),
    tags: [],
    searchableText: '',
  };
}

function makeSelection(overrides: Partial<PatternSelection> = {}): PatternSelection {
  return {
    primaryGenre: 'dushi',
    primaryPatterns: [makePattern('对话开场')],
    borrowedPatterns: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

// ─── buildAgentReferenceBundle ────────────────────────────────────────────────

describe('buildAgentReferenceBundle', () => {
  it('返回完整的 bundle 结构', () => {
    const task = makeTaskSheet();
    const pack = makePack();
    const selection = makeSelection();
    const bundle = buildAgentReferenceBundle(task, pack, selection);

    expect(bundle.primaryGenre).toBe('dushi');
    expect(bundle.perspective).toBe('third_limited_protagonist');
    expect(bundle.selectedPatternIds).toContain('p-对话开场');
    expect(bundle.borrowedPatternIds).toHaveLength(0);
  });

  it('profileSnippet 包含题材名', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('都市爽文');
  });

  it('profileSnippet 包含基调', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('热血爽快');
  });

  it('profileSnippet 包含视角', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('第三人称限知');
  });

  it('profileSnippet 包含禁用词', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('卧槽');
  });

  it('profileSnippet 包含禁止场景类型', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('无意义注水对话');
  });

  it('profileSnippet 包含主角禁止行为', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('跪下求饶');
  });

  it('profileSnippet 包含心理描写深度', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('心理描写深度');
  });

  it('profileSnippet 包含冲突化解逻辑', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('面对挑衅');
    expect(bundle.profileSnippet).toContain('冷静应对后精准反击');
  });

  it('profileSnippet 包含冲突信号词', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('暗流');
  });

  it('profileSnippet 包含写作指纹', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('对话风格');
    expect(bundle.profileSnippet).toContain('节奏风格');
  });

  it('profileSnippet 包含核心情绪循环', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('压制→反击→震惊→膜拜');
  });

  it('profileSnippet 包含章节结构', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('章节开场类型');
    expect(bundle.profileSnippet).toContain('高潮位置');
  });

  it('patternSnippet 包含模式名和规则', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.patternSnippet).toContain('对话开场');
    expect(bundle.patternSnippet).toContain('规则摘要');
  });

  it('patternSnippet 包含触发条件', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.patternSnippet).toContain('角色对峙');
  });

  it('patternSnippet 包含模板', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.patternSnippet).toContain('模板一');
  });

  it('patternSnippet 包含禁忌', () => {
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), makeSelection());
    expect(bundle.patternSnippet).toContain('禁忌行为一');
  });

  it('有借用模式时标注来源', () => {
    const selection = makeSelection({
      borrowedPatterns: [makePattern('借用模式', 'youxi')],
    });
    const bundle = buildAgentReferenceBundle(makeTaskSheet(), makePack(), selection);
    expect(bundle.patternSnippet).toContain('借用:youxi');
    expect(bundle.borrowedPatternIds).toContain('p-借用模式');
  });

  it('styleOverrides.tone 会出现在 profileSnippet 中', () => {
    const task = makeTaskSheet({ styleOverrides: { tone: '阴郁压抑' } });
    const bundle = buildAgentReferenceBundle(task, makePack(), makeSelection());
    expect(bundle.profileSnippet).toContain('阴郁压抑');
  });
});
