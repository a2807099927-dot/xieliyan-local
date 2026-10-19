// 模块说明：上下文参考资料拼装器。
// 关键职责：为 AI 调用补齐角色卡、剧情档案、章节摘要等参考片段。
import type { AgentReferenceBundle, AgentTaskSheet, CraftPattern, GenrePack, PatternSelection } from './types';

function prettifyPerspective(perspective?: string): string {
 switch (perspective) {
 case 'third_limited_protagonist':
 case 'third_limited_protagonist_centric':
 case 'third_person_limited_protagonist_centric':
 return '第三人称限知（围绕主角）';
 case 'first_person_limited_protagonist':
 return '第一人称限知';
 default:
 return perspective || '';
 }
}

function formatConflictResolutionLogic(logic: Record<string, string> | undefined): string {
 if (!logic || Object.keys(logic).length === 0) return '';
 const lines = Object.entries(logic)
 .filter(([, v]) => v && typeof v === 'string')
 .map(([k, v]) => ` ${k}：${v}`);
 return lines.length ? `冲突化解逻辑：\n${lines.join('\n')}` : '';
}

function formatCraftFingerprint(fingerprint: Record<string, string> | undefined): string {
 if (!fingerprint || Object.keys(fingerprint).length === 0) return '';
 // 对话风格和节奏风格优先级最高，放在最前面
 const priorityKeys = ['dialogue_style', 'rhythm_style', 'psychology_style'];
 const entries = Object.entries(fingerprint).filter(([, v]) => v && typeof v === 'string');
 const sorted = [
 ...entries.filter(([k]) => priorityKeys.includes(k)),
 ...entries.filter(([k]) => !priorityKeys.includes(k))
 ];
 const lines = sorted.map(([, v]) => ` • ${v}`);
 return lines.length ? `写作指纹（核心风格规则，前三条优先级最高）：\n${lines.join('\n')}` : '';
}

function formatForbiddenBehaviors(behaviors: string[] | undefined): string {
 if (!Array.isArray(behaviors) || !behaviors.length) return '';
 return `主角绝对禁止行为（角色一致性硬约束）：\n${behaviors.map((b) => ` ✗ ${b}`).join('\n')}`;
}

function formatPsychologyDepth(ratio: Record<string, number> | undefined): string {
 if (!ratio || Object.keys(ratio).length === 0) return '';
 const labelMap: Record<string, string> = {
 surface_level_thought: '表层想法/即时反应',
 direct_inner_monologue: '直接内心独白/吐槽',
 strategic_planning: '策略性思考/盘算',
 deep_emotional_reflection: '深层情感反思',
 deep_subconscious: '深层潜意识',
 subconscious_metaphor: '潜意识隐喻'
 };
 const lines = Object.entries(ratio)
 .filter(([, v]) => typeof v === 'number' && v > 0)
 .sort(([, a], [, b]) => b - a)
 .map(([k, v]) => ` ${labelMap[k] || k}：${Math.round(v * 100)}%`);
 return lines.length ? `心理描写深度分布（严格遵守比例）：\n${lines.join('\n')}` : '';
}

function formatChapterStructure(structure: Record<string, unknown> | undefined): string {
 if (!structure) return '';
 const parts: string[] = [];

 // 开场类型
 const openingTypes = structure.opening_types as Record<string, number> | undefined;
 if (openingTypes) {
 const sorted = Object.entries(openingTypes)
 .filter(([, v]) => typeof v === 'number' && v > 0)
 .sort(([, a], [, b]) => b - a)
 .map(([k, v]) => `${k}(${Math.round((v as number) * 100)}%)`);
 if (sorted.length) parts.push(`章节开场类型偏好：${sorted.join(' > ')}`);
 }

 // 结尾类型
 const endingTypes = structure.ending_types as Record<string, number> | undefined;
 if (endingTypes) {
 const sorted = Object.entries(endingTypes)
 .filter(([, v]) => typeof v === 'number' && v > 0)
 .sort(([, a], [, b]) => b - a)
 .map(([k, v]) => `${k}(${Math.round((v as number) * 100)}%)`);
 if (sorted.length) parts.push(`章节结尾类型偏好：${sorted.join(' > ')}`);
 }

 // 高潮位置
 const climax = structure.climax_position_range as [number, number] | undefined;
 if (Array.isArray(climax) && climax.length === 2) {
 parts.push(`高潮位置：章节 ${Math.round(climax[0] * 100)}%–${Math.round(climax[1] * 100)}% 处`);
 }

 return parts.length ? `章节结构规范：\n${parts.map((p) => ` ${p}`).join('\n')}` : '';
}

function formatConflictSignals(signals: Record<string, string[]> | undefined): string {
 if (!signals || Object.keys(signals).length === 0) return '';
 const labelMap: Record<string, string> = {
 undercurrent: '暗流（冲突前兆）',
 open_conflict: '明争（冲突爆发）',
 explosion: '爆炸（极端冲突）'
 };
 const lines: string[] = [];
 for (const [level, words] of Object.entries(signals)) {
 if (Array.isArray(words) && words.length) {
 const label = labelMap[level] || level;
 lines.push(` ${label}：${words.slice(0, 6).join('、')}`);
 }
 }
 return lines.length ? `题材专属冲突信号词（按层级使用，不要混用）：\n${lines.join('\n')}` : '';
}

function summarizeStyle(pack: GenrePack, task: AgentTaskSheet): string {
 const style = pack.profile.styleProfile;
 const raw = pack.profile.raw as Record<string, unknown>;
 const pieces: string[] = [
 `主题材：${pack.profile.displayName}`,
 style.tone ? `基调：${style.tone}` : '',
 style.perspective ? `视角：${prettifyPerspective(style.perspective)}` : '',
 ];

 // 禁用词
 if (Array.isArray(style.bannedWords) && style.bannedWords.length) {
 pieces.push(`禁用词：${style.bannedWords.slice(0, 8).join('、')}`);
 }

 // 禁止场景类型（比禁用词约束力更强）
 if (Array.isArray(style.bannedSceneTypes) && style.bannedSceneTypes.length) {
 pieces.push(`禁止场景类型：\n${style.bannedSceneTypes.map((s) => ` ✗ ${s}`).join('\n')}`);
 }

 // 主角禁止行为（角色一致性硬约束，极高价值）
 const personaDim = pack.profile.reflectorThreshold.dimensions['persona'] as Record<string, unknown> | undefined;
 const forbiddenBehaviors = personaDim?.forbidden_behaviors as string[] | undefined;
 const forbiddenBlock = formatForbiddenBehaviors(forbiddenBehaviors);
 if (forbiddenBlock) pieces.push(forbiddenBlock);

 // 心理描写深度分布（决定内心戏比例）
 const psychoBlock = formatPsychologyDepth(style.psychologyDepthRatio as Record<string, number> | undefined);
 if (psychoBlock) pieces.push(psychoBlock);

 // 冲突化解逻辑（决定主角行为模式，极高价值）
 const conflictLogic = formatConflictResolutionLogic(style.conflictResolutionLogic);
 if (conflictLogic) pieces.push(conflictLogic);

 // 题材专属冲突信号词（三级层次，极高价值）
 const conflictSignals = formatConflictSignals(pack.profile.conflictSignals);
 if (conflictSignals) pieces.push(conflictSignals);

 // 章节结构规范（开场/结尾/高潮位置）
 const structureBlock = formatChapterStructure(style.chapterStructure as Record<string, unknown> | undefined);
 if (structureBlock) pieces.push(structureBlock);

 // 写作指纹（6条核心风格规则，对话/节奏/心理优先）
 const fingerprint = formatCraftFingerprint(pack.profile.craftFingerprint);
 if (fingerprint) pieces.push(fingerprint);

 // 核心情绪循环（定义爽感节奏，所有题材必须有）
 const coreLoop = typeof raw.core_emotional_loop === 'string' ? raw.core_emotional_loop.trim() : '';
 if (coreLoop) pieces.push(`核心情绪循环（每章必须体现这个节奏）：\n ${coreLoop}`);

 // 本次覆写基调
 if (task.styleOverrides?.tone) pieces.push(`本次覆写基调：${task.styleOverrides.tone}`);

 return pieces.filter(Boolean).join('\n\n');
}

function formatTriggerSummary(conditions: CraftPattern['triggerConditions']): string {
 if (!conditions.length) return '';
 // 只取前3条，每条只保留 if + because，不展开 example，控制 token
 return conditions
 .slice(0, 3)
 .map((c) => {
 const parts = [c.if ? `场景：${c.if}` : '', c.because ? `原因：${c.because}` : ''].filter(Boolean);
 return parts.join('，');
 })
 .filter(Boolean)
 .join('；');
}

function summarizePatterns(selection: PatternSelection): string {
 const lines: string[] = [];

 for (const pattern of selection.primaryPatterns) {
 lines.push(`[主题材] ${pattern.patternName} (${pattern.patternType})`);
 if (pattern.ruleSummary) lines.push(`规则：${pattern.ruleSummary}`);

 // 触发条件精简摘要
 const triggerSummary = formatTriggerSummary(pattern.triggerConditions);
 if (triggerSummary) lines.push(`触发：${triggerSummary}`);

 // 可用模板（保留前2个）
 const usableTemplates = pattern.templates.slice(0, 2).map((t) => t.template).filter(Boolean);
 if (usableTemplates.length) lines.push(`模板：${usableTemplates.join(' / ')}`);

 // 严禁使用（约束力最强的字段）
 if (pattern.forbidden.length) {
 lines.push(`严禁：${pattern.forbidden.slice(0, 3).join('；')}`);
 }
 }

 for (const pattern of selection.borrowedPatterns) {
 lines.push(`[借用:${pattern.genre}] ${pattern.patternName} (${pattern.patternType})`);
 if (pattern.ruleSummary) lines.push(`规则：${pattern.ruleSummary}`);
 if (pattern.forbidden.length) {
 lines.push(`严禁：${pattern.forbidden.slice(0, 2).join('；')}`);
 }
 }

 return lines.join('\n');
}

export function buildAgentReferenceBundle(
 task: AgentTaskSheet,
 primaryPack: GenrePack,
 selection: PatternSelection
): AgentReferenceBundle {
 return {
 primaryGenre: primaryPack.genre,
 profileSnippet: summarizeStyle(primaryPack, task),
 perspective: primaryPack.profile.styleProfile.perspective,
 patternSnippet: summarizePatterns(selection),
 selectedPatternIds: selection.primaryPatterns.map((pattern) => pattern.id),
 borrowedPatternIds: selection.borrowedPatterns.map((pattern) => pattern.id),
 requestedCapabilities: selection.requestedCapabilities
 };
}
