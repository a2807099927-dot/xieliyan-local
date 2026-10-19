// 模块说明：Agent 对话消息装配器。
// 关键职责：按当前模式（询问剧情/润色代写）拼出标准 OpenAI Chat 消息序列。
import type { ChatMessagePayload } from '../hooks/useAiChat';
import type { Book, Chapter, RoleProfile } from '../types';
import type { AgentChapterReference, AgentPlanningResult, AgentReferenceBundle, AgentTaskSheet } from './types';
import { withBaseProse } from '../utils/promptStore';
import { buildAgentConstraints, formatHardConstraintsBlock, type AgentConstraint } from './writingReflection';
import { formatStylePreferencesBlock, loadConfirmedStylePreferences, applyPreferencesToTaskSheet } from './userPreference';

// 故事规划 prompt 缓存（从 Rust IPC 获取）
let _cachedStoryPlanningPrompt = '';
export async function ensureStoryPlanningPromptLoaded(): Promise<void> {
 if (_cachedStoryPlanningPrompt) return;
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) {
 _cachedStoryPlanningPrompt = await internals.invoke('get_story_planning_prompt') as string;
 }
 } catch { /* use empty fallback */ }
}

export interface BuildAgentMessagesInput {
 book: Book;
 chapter: Chapter;
 taskSheet: AgentTaskSheet;
 referenceBundle: AgentReferenceBundle;
 chapterReferences: AgentChapterReference[];
 /** 创作自由度 */
 creativity?: 'strict' | 'balanced' | 'free';
 /** 结构化硬约束；缺省时由 taskSheet+角色卡自动提取 */
 constraints?: AgentConstraint[];
}

export interface BuildAgentRewriteMessagesInput extends BuildAgentMessagesInput {
 selectedText: string;
 rewriteInstruction: string;
}

export interface BuildAgentPlanningMessagesInput {
 book: Book;
 chapter: Chapter;
 taskSheet: AgentTaskSheet;
 selectedText?: string;
 rewriteInstruction?: string;
}

function formatList(title: string, items: string[]): string {
 return `${title}: ${items.length ? items.join(' / ') : 'none'}`;
}

function describePerspective(perspective?: string): string {
 switch (perspective) {
 case 'third_limited_protagonist':
 case 'third_limited_protagonist_centric':
 case 'third_person_limited_protagonist_centric':
 return 'Use a third-person limited perspective centered on the protagonist.';
 case 'first_person_limited_protagonist':
 return 'Use a first-person limited perspective.';
 default:
 return perspective ? `Perspective constraint: ${perspective}` : 'Default to third-person limited perspective.';
 }
}

function findPrimaryProtagonist(book: Book): RoleProfile | null {
 const categories = book.resourceIndex?.customCharacterCategories ?? [];
 const allRoles = categories.flatMap((category) => category.children ?? []);

 return (
 allRoles.find((role) => role.roleType === '主角') ||
 allRoles.find((role) => (role.customFields?.category || '').trim() === '主角') ||
 allRoles.find((role) => role.roleType === '女主') ||
 null
 );
}

function formatProtagonistAnchor(book: Book): string[] {
 const protagonist = findPrimaryProtagonist(book);
 if (!protagonist) {
 return [
 'Protagonist anchor: no explicit protagonist is locked in the resource index. Infer a single narrative anchor from the current chapter and references.',
 'Narration rule: unless it is direct dialogue, avoid switching into first-person narration.'
 ];
 }

 const aliases = protagonist.aliases?.filter(Boolean) ?? [];
 const aliasText = aliases.length ? ` (aliases: ${aliases.join(' / ')})` : '';
 const roleType = protagonist.roleType ? `, role: ${protagonist.roleType}` : '';

 return [
 `Protagonist anchor: center the scene on "${protagonist.name}"${aliasText}${roleType}.`,
 `Narration rule: unless it is direct dialogue, keep the prose in third-person limited around "${protagonist.name}".`
 ];
}

function formatChunkReferences(reference: AgentChapterReference): string {
 // excerpt 已经在 bookContext 里做了 memory + chunks 的融合，直接使用。
 // 不再单独拆开渲染 reference.chunks，避免绕过融合逻辑。
 return reference.excerpt;
}

function formatChapterReferences(references: AgentChapterReference[]): string {
 if (!references.length) return 'No additional local references were selected.';

 return references
 .map((reference, index) => {
 const reasonLabel =
 reference.reason === 'explicit'
 ? 'user-requested chapter'
 : reference.reason === 'previous'
 ? 'previous chapter continuity'
 : reference.reason === 'current'
 ? 'current chapter context'
 : 'retrieved supporting chapter';
 const priorityLabel = index === 0 ? 'primary reference' : 'supporting reference';
 const content = formatChunkReferences(reference);
 return `[${priorityLabel}] ${reference.title} (${reasonLabel})\n${content}`;
 })
 .join('\n\n');
}

// ─── 无脑爽文模式：system prompt 从加密的 runtime.dat 里读取，不硬编码在 bundle 里 ──
// 渲染进程只传占位符，主进程收到 shuangwenMode=true 后从加密包里注入真实 prompt
const SHUANGWEN_PROMPT_PLACEHOLDER = '__SHUANGWEN_PROMPT_INJECTED_BY_MAIN_PROCESS__';

function getShuangwenSystemPrompt(_bundle: AgentReferenceBundle): string {
 // 渲染进程永远只返回占位符，真实 prompt 由主进程注入
 return SHUANGWEN_PROMPT_PLACEHOLDER;
}

function buildSystemPrompt(book: Book, referenceBundle: AgentReferenceBundle): string {
 const perspectiveHint = describePerspective(referenceBundle.perspective);
 const protagonistLines = formatProtagonistAnchor(book);

 // Agent 的 system prompt 现在只负责动态生成的部分（角色锚定 + 视角提示）。
 // 静态写作技法（极限铺垫、期待感管理、连锁震惊、角色描写、视角硬约束、优先级裁决）
 // 已全部合并到文风预设提示词（electron/prompts/genres/baseRules.ts + 各题材文件），
 // 通过 stylePresetId 通道注入，不再在 Agent 管道里重复。
  return withBaseProse([
  'You are the WriterZen Agent writing assistant.',
  'Write only final prose that can be inserted into the novel draft.',
  'Do not explain your reasoning or mention internal rules.',
  perspectiveHint,
  ...protagonistLines
  ]
  .filter(Boolean)
  .join('\n'));
}

function formatPlanningSection(taskSheet: AgentTaskSheet): string[] {
 return [
 formatList('Intent', [taskSheet.plotIntent]),
 formatList('Tone', taskSheet.tone),
 formatList('Required beats', taskSheet.requiredBeats),
 formatList('Emotion arc', taskSheet.emotionalArc),
 formatList('Forbidden moves', taskSheet.forbiddenMoves),
 formatList('Context hints', taskSheet.contextHints)
 ];
}

export function buildAgentPlanningMessages(input: BuildAgentPlanningMessagesInput): ChatMessagePayload[] {
 const { book, chapter, taskSheet, selectedText, rewriteInstruction } = input;
 const isRewrite = Boolean(selectedText && rewriteInstruction);

 const systemPrompt = [
 'You are the planning stage of WriterZen Agent.',
 'Analyze the writing request and output only one JSON object.',
 'Do not output prose, markdown, code fences, commentary, headings, or examples.',
 'Use this exact schema:',
 '{"intent":"string","tone":["string"],"emotionArc":["string"],"requiredBeats":["string"],"forbiddenMoves":["string"],"contextHints":["string"]}',
 'All fields are optional, but keep a stable JSON object shape.',
 'requiredBeats should list concrete must-hit scene beats.',
 'forbiddenMoves should list specific things the generation must avoid.',
 'contextHints should list facts or continuity cues worth retrieving from the local book context.'
 ].join('\n');

 const userPrompt = [
 `Book: ${book.title}`,
 `Current chapter: ${chapter.title}`,
 isRewrite ? 'Mode: targeted rewrite' : 'Mode: forward generation',
 '',
 'Current task sheet:',
 ...formatPlanningSection(taskSheet),
 '',
 'Original user instruction:',
 taskSheet.userInstruction,
 isRewrite && rewriteInstruction ? `Rewrite goal:\n${rewriteInstruction}` : '',
 isRewrite && selectedText ? `Selected text to rewrite:\n${selectedText}` : ''
 ]
 .filter(Boolean)
 .join('\n');

 return [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt }
 ];
}


function resolveConstraintsBlock(input: {
  book: Book;
  chapter: Chapter;
  taskSheet: AgentTaskSheet;
  constraints?: AgentConstraint[];
}): string {
  const list = input.constraints && input.constraints.length
    ? input.constraints
    : buildAgentConstraints({ book: input.book, chapter: input.chapter, taskSheet: input.taskSheet });
  return formatHardConstraintsBlock(list);
}

export function buildAgentMessages(input: BuildAgentMessagesInput): ChatMessagePayload[] {
 const { book, chapter, taskSheet, referenceBundle, chapterReferences, creativity, constraints } = input;
 const stylePrefs = loadConfirmedStylePreferences(book);
 const effectiveTaskSheet = applyPreferencesToTaskSheet(taskSheet, stylePrefs);
 const hardConstraintsBlock = resolveConstraintsBlock({ book, chapter, taskSheet: effectiveTaskSheet, constraints });
 const stylePrefBlock = formatStylePreferencesBlock(stylePrefs);

 // 根据创作自由度生成额外指令
 const creativityInstruction = creativity === 'free'
 ? '\n\n--- Creativity mode: FREE ---\nThe outline is only a direction reference. You have full creative freedom on pacing, details, dialogue, and minor plot additions. Surprise the reader with unexpected but logical twists and vivid scenes. Do not limit your output length — write as much as the scene naturally requires.'
 : creativity === 'strict'
 ? '' // 严格模式不加额外指令，完全按约束走
 : '\n\n--- Creativity mode: BALANCED ---\nFollow the outline closely, but you may add 1-2 small details, reactions, or dialogue exchanges not explicitly in the outline, as long as they serve the scene and do not contradict established facts.';

 // ── 无脑爽文模式：完全独立通道，不注入任何 genre-pack 内容 ──────────────────
 if (referenceBundle.primaryGenre === 'shuangwen') {
 const userPrompt = [
 `书名：${book.title}`,
 `当前章节：${chapter.title}`,
 taskSheet.userInstruction ? `用户指令：${taskSheet.userInstruction}` : '',
 taskSheet.plotIntent ? `剧情意图：${taskSheet.plotIntent}` : '',
 chapterReferences.length > 0 ? `\n上文参考：\n${formatChapterReferences(chapterReferences)}` : ''
 ].filter(Boolean).join('\n');

 return [
 { role: 'system', content: getShuangwenSystemPrompt(referenceBundle) },
 { role: 'user', content: userPrompt }
 ];
 }

 const systemPrompt = buildSystemPrompt(book, referenceBundle);
 const userPrompt = [
 `Book: ${book.title}`,
 `Current chapter: ${chapter.title}`,
 '',
 // Planner constraints 单独分区，明确标注为高优先级约束
 '--- HARD CONSTRAINTS (binding, priority 0, must not violate) ---',
 hardConstraintsBlock,
 '',
 ...(stylePrefBlock ? ['--- USER STYLE PREFERENCES (confirmed) ---', stylePrefBlock, ''] : []),
 '--- Planner constraints (binding, priority 2) ---',
 ...formatPlanningSection(effectiveTaskSheet),
 '',
 // 原始指令降级，只作为补充参考
 '--- Original request (nuance only, priority 4) ---',
 taskSheet.userInstruction,
 '',
 '--- Genre profile (style reference, priority 3) ---',
 referenceBundle.profileSnippet,
 '',
 '--- Matched craft patterns (style reference, priority 3) ---',
 referenceBundle.patternSnippet || 'No extra craft pattern was matched. Follow the genre default discipline.',
 '',
 '--- Local retrieved evidence (facts, priority 1) ---',
 'These snippets are retrieved from local novel content. Their facts, names, relationships, sequence, and continuity are inviolable.',
 formatChapterReferences(chapterReferences),
 creativityInstruction
 ].join('\n');

 return [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt }
 ];
}

export function buildAgentRewriteMessages(input: BuildAgentRewriteMessagesInput): ChatMessagePayload[] {
 const { book, chapter, taskSheet, referenceBundle, chapterReferences, selectedText, rewriteInstruction, constraints } = input;
 const stylePrefs = loadConfirmedStylePreferences(book);
 const effectiveTaskSheet = applyPreferencesToTaskSheet(taskSheet, stylePrefs);
 const hardConstraintsBlock = resolveConstraintsBlock({ book, chapter, taskSheet: effectiveTaskSheet, constraints });
 const stylePrefBlock = formatStylePreferencesBlock(stylePrefs);

 // ── 无脑爽文模式：完全独立通道 ──────────────────────────────────────────────
 if (referenceBundle.primaryGenre === 'shuangwen') {
 const userPrompt = [
 `书名：${book.title}`,
 `当前章节：${chapter.title}`,
 `改写目标：${rewriteInstruction}`,
 `需要改写的段落：\n${selectedText}`,
  chapterReferences.length > 0 ? `\n上文参考：\n${formatChapterReferences(chapterReferences)}` : '',
  '\n请按照四大法则改写上面的段落，只输出改写后的正文。'
  ].filter(Boolean).join('\n');

 return [
 { role: 'system', content: getShuangwenSystemPrompt(referenceBundle) },
 { role: 'user', content: userPrompt }
 ];
 }

 const systemPrompt = buildSystemPrompt(book, referenceBundle);
 const userPrompt = [
 `Book: ${book.title}`,
 `Current chapter: ${chapter.title}`,
 '',
 // Planner constraints 单独分区，明确标注为高优先级约束
 '--- HARD CONSTRAINTS (binding, priority 0, must not violate) ---',
 hardConstraintsBlock,
 '',
 ...(stylePrefBlock ? ['--- USER STYLE PREFERENCES (confirmed) ---', stylePrefBlock, ''] : []),
 '--- Planner constraints (binding, priority 2) ---',
 ...formatPlanningSection(effectiveTaskSheet),
 '',
 // 改写目标和原始指令都降级，只作为补充参考
 '--- Original request (nuance only, priority 4) ---',
 taskSheet.userInstruction,
 '',
 `--- Rewrite goal (nuance only, priority 4) ---`,
 rewriteInstruction,
 '',
 '--- Selected text to rewrite ---',
 selectedText,
 '',
 '--- Genre profile (style reference, priority 3) ---',
 referenceBundle.profileSnippet,
 '',
 '--- Matched craft patterns (style reference, priority 3) ---',
 referenceBundle.patternSnippet || 'No extra craft pattern was matched. Follow the genre default discipline.',
 '',
 '--- Local retrieved evidence (facts, priority 1) ---',
 'These snippets come from local novel retrieval. Their facts are inviolable. Improve wording, rhythm, and tension without changing core setting details.',
 formatChapterReferences(chapterReferences),
 '',
 'Return only the rewritten prose. Do not add explanations or headings.'
 ].join('\n');

 return [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt }
 ];
}

// ─── 故事走向规划 ─────────────────────────────────────────────────────────────

export interface BuildStoryPlanningMessagesInput {
 book: Book;
 chapter: Chapter;
 recentMemories: Array<{
 chapterTitle: string;
 synopsis: string;
 endingState?: string;
 openLoops?: string[];
 }>;
 userHint?: string;
}

/**
 * 构建"接下来5章走向规划"的 prompt。
 * 使用流式输出，兼容逆向WEB中转。
 * token 控制：只取最近5-8章摘要，不传正文。
 */
export function buildStoryPlanningMessages(input: BuildStoryPlanningMessagesInput): ChatMessagePayload[] {
 const { book, chapter, recentMemories, userHint } = input;

 // system prompt 从 Rust 获取，此处使用缓存或空字符串占位
 // 实际调用时由 getStoryPlanningPrompt() 提前加载
 const systemPrompt = withBaseProse(_cachedStoryPlanningPrompt || '');

 const memorySummary = recentMemories.length > 0
 ? recentMemories.map((m, i) => {
 const parts = [`${i + 1}. ${m.chapterTitle}：${m.synopsis}`];
 if (m.endingState) parts.push(` 结尾：${m.endingState}`);
 if (m.openLoops?.length) parts.push(` 悬念：${m.openLoops.slice(0, 2).join('、')}`);
 return parts.join('\n');
 }).join('\n')
 : '（暂无已整理的章节记忆）';

 const userPrompt = [
 `书名：${book.title}`,
 `当前章节：${chapter.title}`,
 '',
 '最近章节摘要：',
 memorySummary,
 '',
 userHint ? `用户意图：${userHint}` : '',
 '',
 '请规划接下来5章的故事走向：'
 ].filter(Boolean).join('\n');

 return [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt }
 ];
}

// ─── 剧情弧线规划（已拆分到 arcPlannerPrompt.ts）────────────────────────────
// 从独立模块重新导出，保持外部 import 兼容
export { buildArcPlanningMessages } from './arcPlannerPrompt';
export type { ArcMemoryItem, BuildArcPlanningMessagesInput } from './arcPlannerPrompt';

