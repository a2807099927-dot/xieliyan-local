// 模块说明：自适应审查清单（P2）—— 按历史 hard-issue 维度升降级检查项。
// 纯函数 + 状态合并；落库经 adaptiveReviewStore / updateBook。

import type { AdaptiveReviewState, Book, ReviewDimensionStat } from '../types';
import type { ReviewIssue, ReviewResult } from './writingReflection';

const HARD_STREAK_ADD = 3;
const PASS_STREAK_SOFTEN = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function emptyState(): AdaptiveReviewState {
  return { stats: [], extraChecks: [], softDimensions: [], updatedAt: nowIso() };
}

export function readAdaptiveReviewState(book: Book | null | undefined): AdaptiveReviewState {
  const s = book?.adaptiveReviewState;
  if (!s) return emptyState();
  return {
    stats: Array.isArray(s.stats) ? s.stats : [],
    extraChecks: Array.isArray(s.extraChecks) ? s.extraChecks : [],
    softDimensions: Array.isArray(s.softDimensions) ? s.softDimensions : [],
    updatedAt: s.updatedAt
  };
}

function upsertStat(stats: ReviewDimensionStat[], dimension: string, hard: boolean): ReviewDimensionStat[] {
  const list = [...stats];
  const idx = list.findIndex((x) => x.dimension === dimension);
  const cur: ReviewDimensionStat =
    idx >= 0
      ? { ...list[idx] }
      : { dimension, hardFailStreak: 0, passStreak: 0, totalHard: 0, totalPass: 0 };

  if (hard) {
    cur.hardFailStreak += 1;
    cur.passStreak = 0;
    cur.totalHard += 1;
  } else {
    cur.passStreak += 1;
    cur.hardFailStreak = 0;
    cur.totalPass += 1;
  }
  cur.lastAt = nowIso();

  if (idx >= 0) list[idx] = cur;
  else list.push(cur);
  return list;
}

const DIMENSION_CHECK_TEMPLATES: Record<string, string> = {
  character: '追加检查：角色姓名/境界/势力是否与 HARD CONSTRAINTS 及已确认记忆一致',
  continuity: '追加检查：是否与前文基线/openLoops/档案事实冲突或跳戏',
  forbidden: '追加检查：是否触碰 forbiddenMoves 或用户禁令',
  beat: '追加检查：requiredBeats / must_include 是否完整落地',
  padding: '追加检查：是否存在空喊、复读、无信息注水段',
  other: '追加检查：是否偏离用户指令主目标'
};

/** 根据一次 ReviewResult 更新自适应状态 */
export function updateAdaptiveReviewState(
  prev: AdaptiveReviewState | null | undefined,
  review: ReviewResult
): AdaptiveReviewState {
  let state = prev ? { ...prev, stats: [...(prev.stats || [])], extraChecks: [...(prev.extraChecks || [])], softDimensions: [...(prev.softDimensions || [])] } : emptyState();

  const hardDims = new Set<string>(
    (review.issues || []).filter((i) => i.severity === 'hard').map((i) => String(i.dimension || 'other'))
  );
  const allDims = new Set<string>([
    'character',
    'continuity',
    'forbidden',
    'beat',
    'padding',
    'other',
    ...hardDims
  ]);

  for (const dim of allDims) {
    state.stats = upsertStat(state.stats, dim, hardDims.has(dim));
  }

  const extra = new Set(state.extraChecks);
  const soft = new Set(state.softDimensions);

  for (const st of state.stats) {
    if (st.hardFailStreak >= HARD_STREAK_ADD) {
      const line = DIMENSION_CHECK_TEMPLATES[st.dimension] || DIMENSION_CHECK_TEMPLATES.other;
      extra.add(line);
      soft.delete(st.dimension);
    }
    if (st.passStreak >= PASS_STREAK_SOFTEN) {
      soft.add(st.dimension);
      const line = DIMENSION_CHECK_TEMPLATES[st.dimension];
      if (line) extra.delete(line);
    }
  }

  return {
    stats: state.stats,
    extraChecks: Array.from(extra).slice(0, 12),
    softDimensions: Array.from(soft),
    updatedAt: nowIso()
  };
}

export function formatAdaptiveChecklist(state: AdaptiveReviewState | null | undefined): string {
  if (!state) return '';
  const lines: string[] = [];
  if (state.extraChecks?.length) {
    lines.push('【自适应追加检查】');
    state.extraChecks.forEach((c, i) => lines.push(`${i + 1}. ${c}`));
  }
  if (state.softDimensions?.length) {
    lines.push(`【降级为 soft 关注的维度】${state.softDimensions.join('、')}`);
  }
  return lines.join('\n');
}

/** 供 UI 手动编辑 extraChecks */
export function setManualExtraChecks(
  prev: AdaptiveReviewState | null | undefined,
  extraChecks: string[]
): AdaptiveReviewState {
  const base = readAdaptiveReviewState({ adaptiveReviewState: prev } as Book);
  return {
    ...base,
    extraChecks: (extraChecks || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 20),
    updatedAt: nowIso()
  };
}
