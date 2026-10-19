import { describe, expect, it } from 'vitest';
import {
  wizardReducer,
  isWizardComplete,
  currentWizardStep,
  formatWizardConclusions,
  WIZARD_STEP_COUNT,
} from '../wizardState';
import type { OpeningOption, StoryCoreArchive, WritingApproach } from '../openingDirection';
import type { VolumePlan, ChapterOutlineItem, OutlineReviewResult } from '../plotPlanning';

const direction: OpeningOption = { title: '穿越者', pitch: '开局觉醒系统', outline: '宗门崛起', risk: '套路旧' };
const archive: StoryCoreArchive = { protagonist: '林尘', world: '灵气复苏', coreConflict: '宗门之战', longTermGoal: '飞升', satisfactionModel: '打脸' };
const approach: WritingApproach = { perspective: '第三人称', pacing: '快节奏', differentiation: '系统流+权谋', readerPositioning: '男频爽文' };
const plotPlan: VolumePlan = { volumeGoal: '入宗站稳', conflictProgression: ['入门', '小比', '秘境'], characterArc: '从弱到强', volumeEndHook: '秘辛' };
const outline: ChapterOutlineItem[] = [{ chapterNo: 1, coreEvent: '穿越觉醒', beats: ['醒来', '获系统'], plotFunction: '开局' }];
const review: OutlineReviewResult = {
  issues: [{ chapterNo: 1, verdict: 'valid', reason: '推进主线', suggestion: '' }],
  summary: 'ok',
  rawText: '',
};

describe('wizardState 推进/回退', () => {
  it('init 后 step=1，按序确认推进到 6 步完成', () => {
    let s = wizardReducer(null, { type: 'init', userRequest: '玄幻穿越有系统' });
    expect(s?.step).toBe(1);
    expect(s?.userRequest).toBe('玄幻穿越有系统');
    expect(currentWizardStep(s)).toBe(1);

    s = wizardReducer(s, { type: 'confirm', step: 1, payload: direction });
    expect(s?.step).toBe(2);
    expect(s?.direction?.title).toBe('穿越者');

    s = wizardReducer(s, { type: 'confirm', step: 2, payload: archive });
    s = wizardReducer(s, { type: 'confirm', step: 3, payload: approach });
    s = wizardReducer(s, { type: 'confirm', step: 4, payload: plotPlan });
    s = wizardReducer(s, { type: 'confirm', step: 5, payload: outline });
    expect(isWizardComplete(s)).toBe(false);
    s = wizardReducer(s, { type: 'confirm', step: 6, payload: review });
    expect(isWizardComplete(s)).toBe(true);
    expect(currentWizardStep(s)).toBeNull();
  });

  it('回退到任意已走步骤不丢已确认的先前决策（硬项）', () => {
    let s = wizardReducer(null, { type: 'init', userRequest: 'x' });
    s = wizardReducer(s, { type: 'confirm', step: 1, payload: direction });
    s = wizardReducer(s, { type: 'confirm', step: 2, payload: archive });
    s = wizardReducer(s, { type: 'confirm', step: 3, payload: approach });
    expect(s?.step).toBe(4);

    // 回退到第 3 步改写法决策
    s = wizardReducer(s, { type: 'rollback', toStep: 3 });
    expect(s?.step).toBe(3);
    // 已确认的方向/档案仍在
    expect(s?.direction?.title).toBe('穿越者');
    expect(s?.coreArchive?.protagonist).toBe('林尘');

    // 改完重跑第 3 步并确认
    s = wizardReducer(s, { type: 'confirm', step: 3, payload: { ...approach, pacing: '极快' } });
    expect(s?.writingApproach?.pacing).toBe('极快');
    expect(s?.step).toBe(4);
  });

  it('重复确认同一步覆盖不越步', () => {
    let s = wizardReducer(null, { type: 'init', userRequest: 'x' });
    s = wizardReducer(s, { type: 'confirm', step: 1, payload: direction });
    s = wizardReducer(s, { type: 'confirm', step: 1, payload: { ...direction, title: '改了' } });
    expect(s?.direction?.title).toBe('改了');
    expect(s?.step).toBe(2);
  });

  it('rollback 超出范围被钳制，不会越界', () => {
    let s = wizardReducer(null, { type: 'init', userRequest: 'x' });
    s = wizardReducer(s, { type: 'rollback', toStep: 0 });
    expect(s?.step).toBe(1);
    s = wizardReducer(s, { type: 'rollback', toStep: 99 });
    expect(s?.step).toBe(1);
  });

  it('formatWizardConclusions 汇总已确认结论', () => {
    let s = wizardReducer(null, { type: 'init', userRequest: 'x' });
    s = wizardReducer(s, { type: 'confirm', step: 1, payload: direction });
    s = wizardReducer(s, { type: 'confirm', step: 2, payload: archive });
    const text = formatWizardConclusions(s);
    expect(text).toContain('新书开局已确认结论');
    expect(text).toContain('穿越者');
    expect(text).toContain('林尘');
    expect(WIZARD_STEP_COUNT).toBe(6);
  });
});
