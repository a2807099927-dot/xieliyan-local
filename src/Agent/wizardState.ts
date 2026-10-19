// 模块说明：新书 wizard 多步确认状态机（P2-A1）。
// 职责：方向卡 → 档案 → 写法决策 → 剧情规划 → 大纲 → 大纲审查 共 6 步的推进/回退纯函数。
// 铁律：任一步可回退/修改，不丢已确认的先前决策；产出必须用户确认后才进下一步。
// 纯函数，不发请求、不碰 UI；UI 推进由调用方（AgentChatPanel）驱动。

import type { OpeningOption, StoryCoreArchive, WritingApproach } from './openingDirection';
import type { VolumePlan, ChapterOutlineItem, OutlineReviewResult } from './plotPlanning';

export const WIZARD_STEPS = ['direction', 'archive', 'approach', 'plot_plan', 'outline', 'outline_review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/** step 名 → AgentWizardState 字段名（archive 对应 coreArchive） */
const STEP_TO_FIELD: Record<WizardStep, keyof AgentWizardState> = {
  direction: 'direction',
  archive: 'coreArchive',
  approach: 'writingApproach',
  plot_plan: 'plotPlan',
  outline: 'outline',
  outline_review: 'outlineReview',
};

export interface AgentWizardState {
  mode: 'new_book_wizard';
  /** 1..6 对应 WIZARD_STEPS */
  step: number;
  direction?: OpeningOption;
  coreArchive?: StoryCoreArchive;
  writingApproach?: WritingApproach;
  plotPlan?: VolumePlan;
  outline?: ChapterOutlineItem[];
  outlineReview?: OutlineReviewResult;
  /** 用户最初的创作想法（一条） */
  userRequest: string;
}

export type WizardAction =
  | { type: 'init'; userRequest: string }
  | { type: 'confirm'; step: number; payload: unknown }
  | { type: 'rollback'; toStep: number };

/** 当前步骤名（1 基） */
export function wizardStepName(step: number): WizardStep | null {
  return step >= 1 && step <= WIZARD_STEP_COUNT ? WIZARD_STEPS[step - 1] : null;
}

/**
 * wizard 状态推进/回退纯函数。
 * - init：创建状态，step=1
 * - confirm：把 step N 的产出写入对应字段并推进到 N+1；重复确认同一步覆盖
 * - rollback：回退到任意已走过的步骤（不丢其它字段）
 */
export function wizardReducer(state: AgentWizardState | null, action: WizardAction): AgentWizardState | null {
  if (action.type === 'init') {
    return {
      mode: 'new_book_wizard',
      step: 1,
      userRequest: String(action.userRequest || '').trim(),
    };
  }
  if (!state) return state;
  if (action.type === 'rollback') {
    const target = Math.max(1, Math.min(action.toStep, state.step));
    if (target >= state.step) return state;
    return { ...state, step: target };
  }
  if (action.type === 'confirm') {
    const stepName = wizardStepName(action.step);
    if (!stepName) return state;
    const field = STEP_TO_FIELD[stepName];
    // 记录该步产出；推进到下一步。完成态 = step 超过 6。
    // 重复确认同一步：覆盖产出但不越步（用 max(state.step, action.step + 1) 保持单调）
    const nextStep = Math.min(WIZARD_STEP_COUNT + 1, Math.max(state.step, action.step + 1));
    const next = {
      ...state,
      [field]: action.payload,
      step: nextStep,
    } as AgentWizardState;
    return next;
  }
  return state;
}

/** 是否全部 6 步完成 */
export function isWizardComplete(state: AgentWizardState | null): boolean {
  return Boolean(state && state.step > WIZARD_STEP_COUNT);
}

/** 当前待确认步骤（1 基）；完成返回 null */
export function currentWizardStep(state: AgentWizardState | null): number | null {
  if (!state || isWizardComplete(state)) return null;
  return state.step;
}

/** 已确认结论 → 注入写正文的文本块（A5 用） */
export function formatWizardConclusions(state: AgentWizardState | null): string {
  if (!state) return '';
  const lines: string[] = [];
  if (state.direction) lines.push(`开局方向：${state.direction.title}（${state.direction.pitch}）`);
  if (state.coreArchive) {
    const a = state.coreArchive;
    const parts = [
      a.protagonist ? `主角：${a.protagonist}` : '',
      a.world ? `世界：${a.world}` : '',
      a.coreConflict ? `核心冲突：${a.coreConflict}` : '',
      a.longTermGoal ? `长线目标：${a.longTermGoal}` : '',
      a.satisfactionModel ? `爽点模型：${a.satisfactionModel}` : '',
    ].filter(Boolean);
    lines.push(`故事核心档案：${parts.join('；')}`);
  }
  if (state.writingApproach) {
    const w = state.writingApproach;
    const parts = [
      w.perspective ? `视角：${w.perspective}` : '',
      w.pacing ? `节奏：${w.pacing}` : '',
      w.differentiation ? `差异化：${w.differentiation}` : '',
    ].filter(Boolean);
    lines.push(`写法决策：${parts.join('；')}`);
  }
  if (state.plotPlan) lines.push(`卷规划：${state.plotPlan.volumeGoal}`);
  if (state.outline?.length) lines.push(`大纲：共 ${state.outline.length} 章，按审查后结论落细纲`);
  return lines.length ? ['【新书开局已确认结论（写正文必须遵守）】', ...lines].join('\n') : '';
}
