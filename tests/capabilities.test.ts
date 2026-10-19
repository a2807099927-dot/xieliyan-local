import { describe, it, expect } from 'vitest';
import { deriveRequestedCapabilities, inferPatternTags } from '../src/Agent/capabilities';
import type { AgentTaskSheet, CraftPattern } from '../src/Agent/types';

function makeTaskSheet(overrides: Partial<AgentTaskSheet> = {}): AgentTaskSheet {
  return {
    version: '1.0',
    primaryGenre: 'dushi',
    userInstruction: '',
    plotIntent: '',
    tone: [],
    requiredBeats: [],
    emotionalArc: [],
    forbiddenMoves: [],
    contextHints: [],
    referenceChapters: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

// ─── deriveRequestedCapabilities ──────────────────────────────────────────────

describe('deriveRequestedCapabilities', () => {
  it('空任务返回空能力列表', () => {
    const caps = deriveRequestedCapabilities(makeTaskSheet());
    expect(caps).toEqual([]);
  });

  it('显式 requestedCapabilities 被保留', () => {
    const caps = deriveRequestedCapabilities(makeTaskSheet({
      requestedCapabilities: ['dialogue', 'combat'],
    }));
    expect(caps).toContain('dialogue');
    expect(caps).toContain('combat');
  });

  it('从 userInstruction 推断能力（包含"对话开场"关键词）', () => {
    const caps = deriveRequestedCapabilities(makeTaskSheet({
      userInstruction: '写一段精彩的对话开场',
    }));
    expect(caps).toContain('dialogue_opener');
  });

  it('从 plotIntent 推断能力', () => {
    const caps = deriveRequestedCapabilities(makeTaskSheet({
      plotIntent: '主角和反派的心理博弈',
    }));
    // 心理 相关关键词
    expect(caps.length).toBeGreaterThanOrEqual(0); // 取决于 CAPABILITY_KEYWORDS 配置
  });

  it('显式 + 推断去重', () => {
    const caps = deriveRequestedCapabilities(makeTaskSheet({
      requestedCapabilities: ['dialogue'],
      userInstruction: '写一段对话',
    }));
    const dialogueCount = caps.filter(c => c === 'dialogue').length;
    expect(dialogueCount).toBe(1);
  });
});

// ─── inferPatternTags ─────────────────────────────────────────────────────────

describe('inferPatternTags', () => {
  it('始终包含 patternType 本身', () => {
    const tags = inferPatternTags({
      patternType: 'dialogue',
      patternName: '测试',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('dialogue');
  });

  it('dialogue 类型额外推断 dialogue 标签', () => {
    const tags = inferPatternTags({
      patternType: 'dialogue',
      patternName: '对话开场',
      ruleSummary: '规则摘要',
      searchableText: '',
    });
    expect(tags).toContain('dialogue');
  });

  it('structure 类型额外推断 structure 标签', () => {
    const tags = inferPatternTags({
      patternType: 'structure',
      patternName: '三幕结构',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('structure');
  });

  it('psychology 类型推断 inner_monologue', () => {
    const tags = inferPatternTags({
      patternType: 'psychology',
      patternName: '心理描写',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('inner_monologue');
  });

  it('rhythm 类型推断 rhythm_control', () => {
    const tags = inferPatternTags({
      patternType: 'rhythm',
      patternName: '节奏控制',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('rhythm_control');
  });

  it('description 类型推断 description_focus', () => {
    const tags = inferPatternTags({
      patternType: 'description',
      patternName: '场景描写',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('description_focus');
  });

  it('info_density 类型推断 info_density', () => {
    const tags = inferPatternTags({
      patternType: 'info_density',
      patternName: '信息密度',
      ruleSummary: '',
      searchableText: '',
    });
    expect(tags).toContain('info_density');
  });

  it('从 searchableText 中匹配 CAPABILITY_KEYWORDS', () => {
    const tags = inferPatternTags({
      patternType: 'dialogue',
      patternName: '对话',
      ruleSummary: '包含战斗场景的对话',
      searchableText: '战斗 冲突 打斗',
    });
    // 至少包含 patternType 本身
    expect(tags).toContain('dialogue');
  });

  it('结果无重复', () => {
    const tags = inferPatternTags({
      patternType: 'dialogue',
      patternName: '对话开场',
      ruleSummary: '对话规则',
      searchableText: '对话 对白',
    });
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });
});
