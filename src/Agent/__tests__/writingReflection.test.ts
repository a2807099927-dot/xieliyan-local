import { describe, expect, it } from 'vitest';
import {
  buildAgentConstraints,
  formatHardConstraintsBlock,
  parseReviewResult
} from '../writingReflection';
import type { Book, Chapter } from '../../types';
import type { AgentTaskSheet } from '../types';

function fakeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    chapters: [{ id: 'c1', title: '第1章', content: '', wordCount: 0, createdAt: '', updatedAt: '' } as Chapter],
    resourceIndex: {
      customCharacterCategories: [
        {
          name: '主角',
          children: [
            {
              id: 'r1',
              name: '林雪',
              aliases: ['雪儿'],
              roleType: '主角',
              faction: '青云门',
              realm: '筑基中期',
              abilities: [],
              equipment: [],
              customFields: { recentStatus: '正在寻找蓝色玉佩' }
            } as any
          ]
        }
      ]
    }
  } as any;
}

function fakeSheet(): AgentTaskSheet {
  return {
    version: '1',
    primaryGenre: 'xuanhuan',
    userInstruction: '必须包含蓝色玉佩的回应，不能让林雪死在这里，严禁提前揭秘身份',
    plotIntent: '回收玉佩伏笔',
    tone: [],
    requiredBeats: ['回应蓝色玉佩'],
    emotionalArc: [],
    forbiddenMoves: ['林雪死亡'],
    contextHints: ['前文提到玉佩发光'],
    referenceChapters: [],
    requestedCapabilities: []
  };
}

describe('writingReflection', () => {
  it('buildAgentConstraints extracts hard rules', () => {
    const constraints = buildAgentConstraints({
      book: fakeBook(),
      chapter: fakeBook().chapters[0],
      taskSheet: fakeSheet()
    });
    const block = formatHardConstraintsBlock(constraints);
    expect(block).toContain('HARD CONSTRAINTS');
    expect(block).toContain('林雪');
    expect(block).toContain('筑基中期');
    expect(block).toContain('蓝色玉佩');
    expect(constraints.some((c) => c.type === 'forbidden_move')).toBe(true);
    expect(constraints.some((c) => c.type === 'must_include')).toBe(true);
  });

  it('parseReviewResult forces fail when hard issues exist', () => {
    const raw = JSON.stringify({
      pass: true,
      summary: 'should still fail',
      issues: [
        {
          id: '1',
          severity: 'hard',
          dimension: 'character',
          evidence: '写成了金丹',
          fixInstruction: '改回筑基中期'
        }
      ]
    });
    const result = parseReviewResult(raw);
    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('parseReviewResult handles fenced json and soft-only pass', () => {
    const raw = '```json\n' + JSON.stringify({
      pass: true,
      summary: 'ok',
      issues: [
        {
          id: 's1',
          severity: 'soft',
          dimension: 'padding',
          evidence: '有一句空话',
          fixInstruction: '删掉空话'
        }
      ]
    }) + '\n```';
    const result = parseReviewResult(raw);
    expect(result.pass).toBe(true);
    expect(result.issues[0].severity).toBe('soft');
  });

  it('parseReviewResult fails closed on garbage', () => {
    const result = parseReviewResult('not-json at all');
    expect(result.pass).toBe(false);
    expect(result.issues[0].id).toBe('parse_error');
  });
});
