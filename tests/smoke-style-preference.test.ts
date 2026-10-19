import { describe, it, expect } from 'vitest';
// ════════════════════════════════════════════════════════════════════
// 写梨眼 改稿学习偏好数据层冒烟测试
// 覆盖：diff 提炼 → 落库(confirmed=false) → 确认/拒绝 → 注入 taskSheet / prompt 块
// ════════════════════════════════════════════════════════════════════

import {
  diffOriginalAndUserEdit,
  extractStylePreferences,
} from '../src/Agent/styleLearner';
import {
  readStylePreferencesFromBook,
  stylePreferenceFromExtracted,
  mergeStylePreference,
  applyConfirmStylePreference,
  applyRejectStylePreference,
  loadConfirmedStylePreferences,
  applyPreferencesToTaskSheet,
  formatStylePreferencesBlock,
  buildPreferenceConfirmationQuestion,
} from '../src/Agent/userPreference';
import type { Book } from '../src/types';

function makeBook(): Book {
  return {
    id: 'b1',
    title: '测试书',
    chapters: [],
    settings: {} as any,
  };
}

describe('styleLearner diff → 偏好提炼', () => {
  it('明显缩短句子能提炼出 shorten 偏好', () => {
    const original = '林雪缓缓转过身来，目光落在窗外的暮色里，久久没有说话，仿佛在回忆什么陈年旧事。';
    const edited = '林雪转身。她看着窗外。没有说话。';
    const diffs = diffOriginalAndUserEdit(original, edited);
    expect(diffs.length).toBeGreaterThan(0);
    const prefs = extractStylePreferences(diffs);
    expect(prefs.some((p) => p.type === 'sentence_length' && p.direction === 'shorten')).toBe(true);
  });

  it('原文与修改相同返回空', () => {
    const text = '完全一样的文本';
    expect(diffOriginalAndUserEdit(text, text)).toEqual([]);
  });

  it('偏好含 evidence 与 confidence', () => {
    const original = '他快步走进房间，扫视四周，然后坐在桌边，开始翻阅桌上的文件。';
    const edited = '他快步走进房间，扫视四周，然后坐在桌边，开始翻阅桌上的文件。他的动作很干脆。';
    const prefs = extractStylePreferences(diffOriginalAndUserEdit(original, edited));
    for (const p of prefs) {
      expect(typeof p.evidence).toBe('string');
      expect(typeof p.confidence).toBe('number');
    }
  });
});

describe('userPreference 落库与确认', () => {
  it('stylePreferenceFromExtracted 生成未确认偏好', () => {
    const pref = stylePreferenceFromExtracted({
      type: 'dialogue', direction: 'increase', evidence: '改稿增加对白', confidence: 0.7,
    }, false);
    expect(pref.confirmed).toBe(false);
    expect(pref.id).toBeTruthy();
    expect(pref.direction).toBe('increase');
  });

  it('mergeStylePreference 同类型同方向合并、保留原 id', () => {
    const a = stylePreferenceFromExtracted({ type: 'sentence', direction: 'shorten', evidence: 'a', confidence: 0.5 }, false);
    const b = stylePreferenceFromExtracted({ type: 'sentence', direction: 'shorten', evidence: 'b', confidence: 0.8 }, false);
    const merged = mergeStylePreference([a], b);
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe(a.id);
    expect(merged[0].confidence).toBe(0.8);
  });

  it('confirmStylePreference 置 confirmed，reject 删除', () => {
    const pref = stylePreferenceFromExtracted({ type: 'length', direction: 'decrease', evidence: 'e', confidence: 0.6 }, false);
    const book = makeBook();
    const confirmed = applyConfirmStylePreference([pref], pref.id);
    expect(confirmed![0].confirmed).toBe(true);
    expect(loadConfirmedStylePreferences({ ...book, userStylePreferences: confirmed! }).length).toBe(1);
    const afterReject = applyRejectStylePreference(confirmed!, pref.id);
    expect(afterReject).toEqual([]);
  });

  it('reject 不存在的 id 返回 null', () => {
    expect(applyRejectStylePreference([], 'nonexistent')).toBeNull();
  });

  it('未确认的偏好不进入 confirmed 列表', () => {
    const pref = stylePreferenceFromExtracted({ type: 'sentence', direction: 'shorten', evidence: 'e', confidence: 0.5 }, false);
    expect(loadConfirmedStylePreferences(makeBook()).length).toBe(0);
    expect(loadConfirmedStylePreferences({ ...makeBook(), userStylePreferences: [pref] }).length).toBe(0);
  });
});

describe('偏好注入', () => {
  it('confirmed 偏好注入 taskSheet contextHints', () => {
    const pref = stylePreferenceFromExtracted({ type: 'dialogue', direction: 'increase', evidence: '改稿增加了对话', confidence: 0.7 }, true);
    const taskSheet = { contextHints: [], forbiddenMoves: [] } as any;
    const next = applyPreferencesToTaskSheet(taskSheet, [pref]);
    expect(next.contextHints.some((h: string) => h.includes('用户风格偏好'))).toBe(true);
  });

  it('avoid 方向进 forbiddenMoves', () => {
    const pref = stylePreferenceFromExtracted({ type: 'sentence', direction: 'avoid', evidence: '用户删掉了长句', confidence: 0.7 }, true);
    const next = applyPreferencesToTaskSheet({ contextHints: [], forbiddenMoves: [] } as any, [pref]);
    expect(next.forbiddenMoves.some((h: string) => h.includes('用户风格偏好'))).toBe(true);
    expect(next.contextHints.length).toBe(0);
  });

  it('未确认偏好不注入', () => {
    const pref = stylePreferenceFromExtracted({ type: 'sentence', direction: 'shorten', evidence: 'e', confidence: 0.5 }, false);
    const next = applyPreferencesToTaskSheet({ contextHints: [], forbiddenMoves: [] } as any, [pref]);
    expect(next.contextHints.length).toBe(0);
  });

  it('formatStylePreferencesBlock 生成 prompt 段，空偏好返回空串', () => {
    expect(formatStylePreferencesBlock([])).toBe('');
    const pref = stylePreferenceFromExtracted({ type: 'dialogue', direction: 'increase', evidence: 'e', confidence: 0.6 }, true);
    const block = formatStylePreferencesBlock([pref]);
    expect(block).toContain('USER STYLE PREFERENCES');
    expect(block).toContain('increase');
  });

  it('buildPreferenceConfirmationQuestion 包含依据', () => {
    const q = buildPreferenceConfirmationQuestion(stylePreferenceFromExtracted({ type: 'sentence', direction: 'shorten', evidence: '你习惯用短句', confidence: 0.8 }, false));
    expect(q).toContain('短句');
    expect(q).toContain('你习惯');
  });
});
