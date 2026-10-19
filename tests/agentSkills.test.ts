import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// 写梨眼 Agent 技能注册表冒烟测试
// 覆盖：register/get/list/indexLines、review 技能按书 genre 加载对应清单、
//       writing / story_canon 技能加载返回非空内容。
// ════════════════════════════════════════════════════════════════════

import { agentSkillRegistry } from '../src/Agent/skills/registry';
import { ensureAgentSkillsRegistered } from '../src/Agent/skills';
import { loadReviewSkill, formatSkillChecklistForPrompt } from '../src/Agent/skills/loadReviewSkill';
import { inferAgentGenreFromBook } from '../src/Agent/bookContext';
import type { Book } from '../src/types';

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: '测试书',
    description: '',
    chapters: [
      { id: 'c1', title: '第1章 开端', content: '<p>正文</p>', wordCount: 100, createdAt: '', updatedAt: '' },
    ],
    settings: {},
    resourceIndex: {},
    ...overrides,
  } as Book;
}

describe('agentSkillRegistry 注册表', () => {
  beforeEach(() => {
    agentSkillRegistry.list().forEach((s) => (agentSkillRegistry as any).skills.delete(s.id));
  });

  it('register / get / list / indexLines 正常', () => {
    const skill = {
      id: 'writing',
      name: 'writing',
      description: '写作方法论',
      load: () => '全文',
    };
    agentSkillRegistry.register(skill as any);
    expect(agentSkillRegistry.get('writing')).toBeDefined();
    expect(agentSkillRegistry.list().length).toBe(1);
    const lines = agentSkillRegistry.indexLines();
    expect(lines[0]).toContain('writing — 写作方法论');
  });

  it('ensureAgentSkillsRegistered 注册四个技能（幂等）', () => {
    ensureAgentSkillsRegistered();
    ensureAgentSkillsRegistered();
    const ids = agentSkillRegistry.list().map((s) => s.id).sort();
    expect(ids).toEqual(['genre_play', 'review', 'story_canon', 'writing']);
  });
});

describe('review 技能按书 genre 加载', () => {
  it('玄幻书 → 玄幻审查清单', () => {
    const book = makeBook({ resourceIndex: { novelType: 'xuanhuan' } as any });
    expect(inferAgentGenreFromBook(book)).toBe('xuanhuan');
    const skill = loadReviewSkill('xuanhuan');
    const block = formatSkillChecklistForPrompt(skill);
    expect(block).toContain('review-xuanhuan');
    expect(block).toContain('境界体系');
  });

  it('都市书 → 都市审查清单', () => {
    const book = makeBook({ resourceIndex: { novelType: 'urban' } as any });
    expect(inferAgentGenreFromBook(book)).toBe('urban');
    const skill = loadReviewSkill('urban');
    const block = formatSkillChecklistForPrompt(skill);
    expect(block).toContain('review-urban');
    expect(block).toContain('身份职业');
  });

  it('未知题材 → 通用清单兜底', () => {
    const skill = loadReviewSkill('unknown');
    const block = formatSkillChecklistForPrompt(skill);
    expect(block).toContain('review-default');
    expect(block).toContain('角色一致性');
  });
});

describe('技能加载函数', () => {
  it('writing 技能加载返回写作方法论非空', async () => {
    ensureAgentSkillsRegistered();
    const skill = agentSkillRegistry.get('writing')!;
    const content = await skill.load({ book: makeBook() });
    expect(content.length).toBeGreaterThan(50);
  });

  it('review 技能通过注册表加载时按书 genre 出清单', async () => {
    ensureAgentSkillsRegistered();
    const skill = agentSkillRegistry.get('review')!;
    const content = await skill.load({ book: makeBook({ resourceIndex: { novelType: 'youxi' } as any }) });
    expect(content).toContain('review-youxi');
    expect(content).toContain('数值成长');
  });

  it('story_canon 技能加载返回设定卡非空', async () => {
    ensureAgentSkillsRegistered();
    const skill = agentSkillRegistry.get('story_canon')!;
    const content = await skill.load({ book: makeBook() });
    expect(content.length).toBeGreaterThan(0);
  });

  it('索引行包含四个技能名（供 buildSystemPrompt 注入）', () => {
    ensureAgentSkillsRegistered();
    const lines = agentSkillRegistry.indexLines().join('\n');
    expect(lines).toContain('writing');
    expect(lines).toContain('review');
    expect(lines).toContain('story_canon');
    expect(lines).toContain('genre_play');
  });
});
