// 模块说明：Agent 会话 React Hook。
// 关键职责：维护当前对话状态、流式更新、工具调用回调。
import { useCallback, useReducer, useState } from 'react';
import type { Book, Chapter } from '../types';
import { useAiChat, type ChatMessagePayload } from '../hooks/useAiChat';
import { useConfigStore } from '../store/useConfigStore';
import { useIslandStore } from '../store/useIslandStore';
import { electronAPI } from '../utils/electron';
import { collectAgentChapterReferences } from './bookContext';
import { buildAgentMessages, buildAgentPlanningMessages, buildAgentRewriteMessages, buildStoryPlanningMessages, buildArcPlanningMessages } from './messageBuilder';
import { prepareAgentTask } from './service';
import { createAgentTaskSheet, mergePlanningResultToTaskSheet, parsePlanningResult } from './taskSheet';
import type {
 AgentChapterReference,
 AgentGenreId,
 AgentPlanningResult,
 AgentReferenceBundle,
 AgentTaskSheet,
 AgentWorkspaceBridge
} from './types';
import {
 buildAgentConstraints,
 buildQuickReviewPrompt,
 buildRevisionPrompt,
 buildReviewPrompt,
 parseReviewResult,
 type AgentConstraint,
 type ReviewResult
} from './writingReflection';
import { saveSuggestedMemoryUpdates } from './agentMemoryStore';
import { recordReviewForAdaptation } from './adaptiveReviewStore';
import { stripPreAmble, splitAgentOutput } from './stripAgentOutput';
import {
 runPreWriteReflection,
 formatPreWriteDecisionForWriter,
 formatPreWriteDecisionForUser,
} from './preWriteReflection';
import { getChapterOutlineText } from './outlineWritingContext';
import { wizardReducer, type AgentWizardState, type WizardAction } from './wizardState';
export { stripPreAmble, splitAgentOutput } from './stripAgentOutput';

export interface AgentDraftMeta {
 totalTokens?: number;
 estimatedCost?: number;
 provider?: string;
 model?: string;
 durationMs?: number;
 generatedAt?: string;
 /** 最小反思闭环结果摘要（面板第二版再细展示） */
 reflection?: {
  ran: boolean;
  revised: boolean;
  finalPass: boolean;
  hardIssueCount: number;
  summary: string;
 };
}

export type AgentSessionStage = 'idle' | 'planning' | 'preparing-context' | 'retrieving' | 'generating' | 'reflecting' | 'reviewing' | 'error';

export interface AgentSessionDebug {
 planningApplied: boolean;
 planningError: string | null;
 planning: AgentPlanningResult | null;
 planningBeatCount: number;
 referenceCount: number;
}

export interface AgentSessionCallbacks {
 genre: AgentGenreId;
 creativity?: 'strict' | 'balanced' | 'free';
 instruction: string;
 book: Book;
 chapter: Chapter;
 bridge: AgentWorkspaceBridge;
 taskSheet: AgentTaskSheet | null;
 referenceBundle: AgentReferenceBundle | null;
 referenceReady: boolean;
 selectedChapterReferences: AgentChapterReference[];
 selectedReferenceIds?: string[];
 preferredReferenceId?: string;
 useLocalAgentPack: boolean;
 /** 跳过编辑角色的 planning 阶段，直接走写手（编辑器续写用） */
 skipPlanning?: boolean;
 onThought?: (thought: string, step: number) => void;
 onResult: (text: string) => void;
 onStreamChunk?: (chunk: string) => void;
 onGenerationComplete?: () => void;
 onDraftMeta: (meta: AgentDraftMeta) => void;
 onError: (message: string) => void;
 onBubble: (role: 'user' | 'assistant' | 'system', content: string) => void;
 onSelectionPreview?: (text: string) => void;
}

function emitThought(
  onThought: ((thought: string, step: number) => void) | undefined,
  thought: string,
  step: number
): void {
  try { onThought?.(thought, step); } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('writerzen:agent-thought', {
        detail: { thought, step, at: Date.now() }
      }));
    }
  } catch { /* ignore */ }
}

const DEFAULT_DEBUG: AgentSessionDebug = {
 planningApplied: false,
 planningError: null,
 planning: null,
 planningBeatCount: 0,
 referenceCount: 0
};

function taskSheetToInput(taskSheet: AgentTaskSheet) {
 return {
 genre: taskSheet.primaryGenre,
 userInstruction: taskSheet.userInstruction,
 plotIntent: taskSheet.plotIntent,
 tone: taskSheet.tone,
 requiredBeats: taskSheet.requiredBeats,
 emotionalArc: taskSheet.emotionalArc,
 forbiddenMoves: taskSheet.forbiddenMoves,
 contextHints: taskSheet.contextHints,
 referenceChapters: taskSheet.referenceChapters,
 requestedCapabilities: taskSheet.requestedCapabilities,
 styleOverrides: taskSheet.styleOverrides
 };
}

export function normalizeChinesePunctuation(text: string): string { if (!text.trim()) return text;
 return text
 // 英文双引号 → 中文双引号（成对替换，奇数个引号时保持原样）
 .replace(/"([^"]*)"/g, '\u201c$1\u201d')
 // 英文单引号（撇号）→ 中文单引号
 .replace(/'([^']*)'/g, '\u2018$1\u2019')
 // 英文省略号 ... → 中文省略号 ……
 .replace(/\.{3}/g, '\u2026\u2026')
 // 英文双连字符 -- → 逗号（小说正文不使用破折号）
 .replace(/--+/g, '，')
 // 中文破折号 ——（连续两个及以上）→ 逗号
 .replace(/\u2014{2,}/g, '，')
 // 单个中文破折号 — → 逗号
 .replace(/\u2014/g, '，');
}

export function useAgentSession() {
 const { chat, requestInFlight, status } = useAiChat();
 const addTokenUsage = useConfigStore((s) => s.addTokenUsage);
 const customPlannerPrompt = useConfigStore((s) => s.config?.ai.customPlannerPrompt ?? '');
 const showIsland = useIslandStore((s) => s.show);
 const hideIsland = useIslandStore((s) => s.hide);
 const [sessionStage, setSessionStage] = useState<AgentSessionStage>('idle');
 const [sessionDebug, setSessionDebug] = useState<AgentSessionDebug>(DEFAULT_DEBUG);
 // 新书 wizard 状态机（P2-A1）
 const [agentWizardState, wizardDispatch] = useReducer<React.Reducer<AgentWizardState | null, WizardAction>>(
  wizardReducer,
  null as AgentWizardState | null
 );

 const resetDebug = useCallback(() => {
 setSessionDebug(DEFAULT_DEBUG);
 }, []);

 const setPlanningDebug = useCallback((planning: AgentPlanningResult | null, planningApplied: boolean, planningError: string | null) => {
 setSessionDebug((current) => ({
 ...current,
 planningApplied,
 planningError,
 planning,
 planningBeatCount: planning?.requiredBeats?.length || 0
 }));
 }, []);

 const setReferenceDebug = useCallback((references: AgentChapterReference[]) => {
 setSessionDebug((current) => ({
 ...current,
 // MiniSearch 检索层已移除，不再统计检索 chunk 数
 referenceCount: references.length
 }));
 }, []);

 const prepareBundleForTaskSheet = useCallback(
 async (taskSheet: AgentTaskSheet, useLocalAgentPack: boolean): Promise<AgentReferenceBundle> => {
 // 开发版与安装版行为完全一致：统一走本地题材包装配（题材数据编译期内嵌，两端均可读）。
 // 不使用 import.meta.env.DEV 区分，避免安装版退化到后端占位命令。
 void useLocalAgentPack;
 return prepareAgentTask(taskSheetToInput(taskSheet)).referenceBundle;
 },
 []
 );

 const prepareBundleForInstruction = useCallback(
 async (
 genre: AgentGenreId,
 userInstruction: string,
 useLocalAgentPack: boolean
 ): Promise<AgentReferenceBundle> => {
 const tempTaskSheet = createAgentTaskSheet({ genre, userInstruction });
 return prepareBundleForTaskSheet(tempTaskSheet, useLocalAgentPack);
 },
 [prepareBundleForTaskSheet]
 );

 const runPlanning = useCallback(
 async (
  taskSheet: AgentTaskSheet,
  book: Book,
  chapter: Chapter,
  selectedText?: string,
  rewriteInstruction?: string,
  onThought?: (thought: string, step: number) => void
 ) => {
 // 门槛判断：以下情况跳过 planning，直接复用 taskSheet，节省一次模型调用。
 // 1. 用户指令过短（< 10 字），planning 几乎无法提炼出有价值的 beats/forbiddenMoves
 // 2. taskSheet 已经携带了足够的结构化约束（beats + forbiddenMoves 合计 >= 3 条）
 const instructionText = (rewriteInstruction ?? taskSheet.userInstruction).trim();
 const alreadyRich =
 taskSheet.requiredBeats.length + taskSheet.forbiddenMoves.length >= 3;
 const tooShort = instructionText.length < 10;

 if (tooShort || alreadyRich) {
 setPlanningDebug(null, false, tooShort ? 'SKIPPED_SHORT_INSTRUCTION' : 'SKIPPED_RICH_TASKSHEET');
 return taskSheet;
 }

 setSessionStage('planning');
 emitThought(onThought, '正在规划写作方案…', 0);
 try {
 const response = await chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableStyle: true,
 messages: buildAgentPlanningMessages({
 book,
 chapter,
 taskSheet,
 selectedText,
 rewriteInstruction
 })
 });

 const parsed = parsePlanningResult(response.text || '');
 if (!parsed.ok || !parsed.planning) {
 setPlanningDebug(null, false, parsed.error || 'PLANNING_PARSE_FAILED');
 return taskSheet;
 }

 const merged = mergePlanningResultToTaskSheet(taskSheet, parsed.planning);
 setPlanningDebug(parsed.planning, true, null);
 return merged;
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || 'PLANNING_FAILED');
 setPlanningDebug(null, false, message);
 return taskSheet;
 }
 },
 [chat, setPlanningDebug]
 );

 const resolveChapterReferences = useCallback(
 (
 book: Book,
 chapter: Chapter,
 taskSheet: AgentTaskSheet,
 selectedChapterReferences: AgentChapterReference[],
 selectedReferenceIds: string[] = [],
 preferredReferenceId = ''
 ) => {
 const derived = collectAgentChapterReferences(book, chapter, taskSheet);
 if (!derived.length) {
 return selectedChapterReferences;
 }

 const selectedIdSet = new Set(selectedReferenceIds);
 const filtered = selectedIdSet.size
 ? derived.filter((reference) => selectedIdSet.has(reference.id))
 : selectedChapterReferences.length
 ? derived.filter((reference) => selectedChapterReferences.some((item) => item.id === reference.id))
 : derived.slice(0, 3);

 const next = filtered.length ? filtered : derived.slice(0, 3);
 return next.sort((left, right) => {
 if (left.id === preferredReferenceId) return -1;
 if (right.id === preferredReferenceId) return 1;
 return right.chapterIndex - left.chapterIndex;
 });
 },
 []
 );

 const runAgent = useCallback(
 async (callbacks: AgentSessionCallbacks) => {
 const {
 book,
 chapter,
 taskSheet,
 referenceBundle,
 referenceReady,
 selectedChapterReferences,
 selectedReferenceIds,
 preferredReferenceId,
 useLocalAgentPack,
 onResult,
 onGenerationComplete,
 onDraftMeta,
 onError
 } = callbacks;

 if (!taskSheet || requestInFlight) {
 if (requestInFlight) onError('Agent 正在处理中，请等待完成后再试。');
 return;
 }

 onResult('');
 onError('');
 resetDebug();
 emitThought(callbacks.onThought, '正在思考…', 0);

 try {
 // skipPlanning: 编辑器续写只走写手，跳过编辑角色
 // shuangwen 模式也跳过 planning，避免模型把推理过程输出到正文
 const shouldSkipPlanning = callbacks.skipPlanning || taskSheet.primaryGenre === 'shuangwen';
 const plannedTaskSheet = shouldSkipPlanning
  ? taskSheet
  : await runPlanning(taskSheet, book, chapter, undefined, undefined, callbacks.onThought);

 setSessionStage('preparing-context');
 // 永远走 genre-pack bundle（自定义 Agent 模式已移除）
 const effectiveBundle =
 referenceBundle && referenceReady && plannedTaskSheet === taskSheet
 ? referenceBundle
 : await prepareBundleForTaskSheet(plannedTaskSheet, useLocalAgentPack);

 setSessionStage('retrieving');
 const resolvedReferences = resolveChapterReferences(
 book,
 chapter,
 plannedTaskSheet,
 selectedChapterReferences,
 selectedReferenceIds,
 preferredReferenceId
 );
 setReferenceDebug(resolvedReferences);

 setSessionStage('generating');

 // Agent 正文生成：使用非流式调用，确保完整输出后再做后处理（stripPreAmble、标点规范化）。
 // 注：早期版本曾尝试流式，但流式输出无法在完成前做 stripPreAmble，
 // 且大部分中转接口的流式支持不稳定，故统一改为非流式。
 let finalText = '';
 let totalTokens = 0;
 let estimatedCost = 0;
 let finalProvider = '';
 let finalModel = '';
 let finalDurationMs = 0;

 const isShuangwen = plannedTaskSheet.primaryGenre === 'shuangwen';
 const creativityLevel = callbacks.creativity || 'balanced';

  // 单次构建约束快照：Draft / Review / Revision 共用，避免两边各自提取不一致
  const sharedConstraints: AgentConstraint[] = buildAgentConstraints({
   book,
   chapter,
   taskSheet: plannedTaskSheet
  });

  // 写前复盘：动笔前先跑一次复盘（与 write_chapter_body 同一入口），决策注入写手 system
  let preWriteTokens = 0;
  const draftMessages = buildAgentMessages({
   book,
   chapter,
   taskSheet: plannedTaskSheet,
   referenceBundle: effectiveBundle,
   chapterReferences: resolvedReferences,
   creativity: creativityLevel,
   constraints: sharedConstraints
  });
  const reflect = await runPreWriteReflection(
   { book, chapter, taskSheet: plannedTaskSheet, outlineText: getChapterOutlineText(chapter) },
   async (msgs) => {
    const r = await chat({
     stream: false,
     bookId: book.id,
     chapterId: chapter.id,
     disableStyle: true,
     disableRag: true,
     messages: msgs as ChatMessagePayload[]
    });
    preWriteTokens = r.usage?.totalTokens ?? 0;
    return { text: r.text };
   }
  );
  if (reflect.decision) {
   // 决策紧跟写手 system（index 1），约束力强于插在最前
   draftMessages.splice(1, 0, { role: 'system', content: formatPreWriteDecisionForWriter(reflect.decision) });
   emitThought(callbacks.onThought, `写前复盘：${formatPreWriteDecisionForUser(reflect.decision).slice(0, 200)}`, 1);
  }

  emitThought(callbacks.onThought, '正在根据约束和参考章节生成正文…', 1);
  setSessionStage('generating');
  const response = await chat({
   stream: false,
   bookId: book.id,
   chapterId: chapter.id,
   disableStyle: true,
   shuangwenMode: isShuangwen,
   messages: draftMessages
  });

  // 从 response 取 meta
  finalText = response.text || finalText;
  totalTokens = response.usage?.totalTokens ?? 0;
  totalTokens += preWriteTokens;
 estimatedCost = response.usage?.estimatedCost ?? 0;
 finalProvider = response.provider ?? '';
 finalModel = response.model ?? '';
 finalDurationMs = response.durationMs ?? 0;

 // shuangwen 走独立通道，输出严格是正文，不做 stripPreAmble（避免第一人称内心 OS 被误删）
 // 其他题材：截掉正文前的分析/规划废话（DeepSeek 等模型会把思考过程输出）
 if (!isShuangwen) {
  const split = splitAgentOutput(finalText);
  // 模型只输出思考/计划时正文置空，不回退思考当正文（交给 UI 提示）
  finalText = split.hasBody ? split.body : '';
 }
 // 英文标点 → 中文标点
 finalText = normalizeChinesePunctuation(finalText);

 // 最小反思闭环（PocketFlow Judge）：Draft → Review checklist → fail 则 Revision 1 次 → QuickReview
 // shuangwen 跳过；决策卡 UI / memoryBank 反哺第二版再接。
 let reflectionMeta: NonNullable<AgentDraftMeta['reflection']> = {
 ran: false,
 revised: false,
 finalPass: true,
 hardIssueCount: 0,
 summary: 'skipped'
 };
 if (!isShuangwen && finalText.trim()) {
 try {
 setSessionStage('reviewing');
 emitThought(callbacks.onThought, '正在自查正文质量…', 2);
 const constraints = sharedConstraints;
 const reviewResp = await chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableStyle: true,
 disableRag: true,
 messages: buildReviewPrompt({
 taskSheet: plannedTaskSheet,
 constraints,
 draft: finalText,
 chapterTitle: chapter.title,
 book
 })
 });
 totalTokens += reviewResp.usage?.totalTokens ?? 0;
 estimatedCost += reviewResp.usage?.estimatedCost ?? 0;
 const review: ReviewResult = parseReviewResult(reviewResp.text || '');
 // suggestedMemoryUpdate → agentMemory（未确认），供后续 confirmMemoryUpdate
 if (review.suggestedMemoryUpdate?.length) {
 try {
 await saveSuggestedMemoryUpdates(book.id, review.suggestedMemoryUpdate);
 } catch {
 /* 记忆写入失败不阻断正文 */
 }
 }
 try {
 await recordReviewForAdaptation(book.id, review);
 } catch { /* 自适应统计失败不阻断 */ }
 reflectionMeta = {
 ran: true,
 revised: false,
 finalPass: review.pass,
 hardIssueCount: review.issues.filter((i) => i.severity === 'hard').length,
 summary: review.summary
 };
 if (review.pass) emitThought(callbacks.onThought, '自查通过', 3);

 if (!review.pass) {
 emitThought(callbacks.onThought, '发现问题，正在修订…', 3);
 setSessionStage('reflecting');
 const revisionResp = await chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableStyle: true,
 disableRag: true,
 messages: buildRevisionPrompt({
 taskSheet: plannedTaskSheet,
 constraints,
 draft: finalText,
 issues: review.issues,
 chapterTitle: chapter.title
 })
 });
 totalTokens += revisionResp.usage?.totalTokens ?? 0;
 estimatedCost += revisionResp.usage?.estimatedCost ?? 0;
 // 修订只取正文；模型只吐思考时保留原稿（不回退思考当修订稿）
 const revisedSplit = splitAgentOutput(String(revisionResp.text || '').trim());
 let revised = normalizeChinesePunctuation(revisedSplit.hasBody ? revisedSplit.body : '');
 if (revised) {
  finalText = revised;
  reflectionMeta.revised = true;
 }

 emitThought(callbacks.onThought, '复核修订结果…', 4);
 const review2Resp = await chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableStyle: true,
 disableRag: true,
 messages: buildQuickReviewPrompt({
 constraints,
 draft: finalText,
 previousHardIssues: review.issues.filter((i) => i.severity === 'hard')
 })
 });
 totalTokens += review2Resp.usage?.totalTokens ?? 0;
 estimatedCost += review2Resp.usage?.estimatedCost ?? 0;
 const review2 = parseReviewResult(review2Resp.text || '');
 reflectionMeta.finalPass = review2.pass;
 reflectionMeta.hardIssueCount = review2.issues.filter((i) => i.severity === 'hard').length;
 reflectionMeta.summary = review2.pass
 ? `revised_pass:${review.summary}`
 : `revised_still_fail:${review2.summary}`;
 }
 } catch (reflectionError) {
 const msg = reflectionError instanceof Error ? reflectionError.message : String(reflectionError || 'reflection failed');
 reflectionMeta = {
 ran: true,
 revised: false,
 finalPass: true,
 hardIssueCount: 0,
 summary: `reflection_error:${msg.slice(0, 120)}`
 };
 }
 }

 // 审查结束，避免 UI 长时间停在 reviewing/reflecting
 setSessionStage('generating');
 emitThought(callbacks.onThought, '正文已就绪', 5);
 onResult(finalText);
 try {
 window.dispatchEvent(new CustomEvent('writerzen:agent-draft-produced', {
 detail: { bookId: book.id, chapterId: chapter.id, draft: finalText, at: Date.now() }
 }));
 } catch { /* ignore */ }
 onDraftMeta({
 totalTokens,
 estimatedCost,
 provider: finalProvider,
 model: finalModel,
 durationMs: finalDurationMs,
 generatedAt: new Date().toISOString(),
 reflection: reflectionMeta
 });
 addTokenUsage(finalProvider || 'unknown', totalTokens, estimatedCost);
 setSessionStage('idle');
 showIsland({ type: 'success', status: 'feedback', message: '正文已生成', autoHideMs: 1500 });

 // 生成完成回调（用于触发规划提示）
 onGenerationComplete?.();
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || '生成失败');
 onError(message);
 setSessionStage('error');
 showIsland({ type: 'error', status: 'feedback', message: '生成失败', detail: message, autoHideMs: 1800 });
 }
 },
 [
 addTokenUsage,
 prepareBundleForTaskSheet,
 requestInFlight,
 resetDebug,
 resolveChapterReferences,
 runPlanning,
 setReferenceDebug,
 showIsland
 ]
 );

 const rewriteSelection = useCallback(
 async (rewriteInstruction: string | undefined, callbacks: AgentSessionCallbacks) => {
 const {
 genre,
 instruction,
 book,
 chapter,
 bridge,
 taskSheet,
 referenceBundle,
 referenceReady,
 selectedChapterReferences,
 selectedReferenceIds,
 preferredReferenceId,
 useLocalAgentPack,
 onDraftMeta,
 onError,
 onBubble,
 onSelectionPreview
 } = callbacks;

 const effectiveInstruction = (rewriteInstruction ?? instruction).trim();
 if (!effectiveInstruction || requestInFlight) {
 if (requestInFlight) {
 onError('Agent 正在处理中，请等待完成后再试。');
 onBubble('assistant', 'Agent 正在处理中，请等待完成后再试。');
 }
 return;
 }

 resetDebug();

 let selection;
 try {
  selection = await bridge.getSelection(chapter.id);
 } catch (e) {
  const msg = '无法读取编辑器选区';
  onError(msg);
  onBubble('assistant', msg);
  setSessionStage('error');
  showIsland({ type: 'error', status: 'feedback', message: msg, detail: e instanceof Error ? e.message : String(e), autoHideMs: 1800 });
  return;
 }
 const selText = selection?.text?.trim() || '';
 onSelectionPreview?.(selText ? selText.slice(0, 180) : '');

 if (!selection || !selText) {
 const message = '请先在正文编辑器中选中要改写的段落，再让 Agent 改写。';
 onError(message);
 onBubble('assistant', message);
 setSessionStage('error');
 showIsland({ type: 'warning', status: 'feedback', message, autoHideMs: 1600 });
 return;
 }

 const baseTaskSheet =
 taskSheet && taskSheet.userInstruction === instruction.trim()
 ? taskSheet
 : createAgentTaskSheet({
 genre,
 userInstruction: instruction.trim() || effectiveInstruction
 });

 try {
 // shuangwen 跳过 planning，避免模型把推理过程输出到正文
 const plannedTaskSheet = baseTaskSheet.primaryGenre === 'shuangwen'
 ? baseTaskSheet
 : await runPlanning(baseTaskSheet, book, chapter, selText, effectiveInstruction, callbacks.onThought);

 setSessionStage('preparing-context');
 const effectiveBundle =
 referenceBundle && referenceReady && plannedTaskSheet === baseTaskSheet
 ? referenceBundle
 : await prepareBundleForTaskSheet(plannedTaskSheet, useLocalAgentPack);

 setSessionStage('retrieving');
 const resolvedReferences = resolveChapterReferences(
 book,
 chapter,
 plannedTaskSheet,
 selectedChapterReferences,
 selectedReferenceIds,
 preferredReferenceId
 );
 setReferenceDebug(resolvedReferences);

  setSessionStage('generating');
  const isRewriteShuangwen = plannedTaskSheet.primaryGenre === 'shuangwen';
  const rewriteMessages = buildAgentRewriteMessages({
   book,
   chapter,
   taskSheet: plannedTaskSheet,
   referenceBundle: effectiveBundle,
   chapterReferences: resolvedReferences,
   selectedText: selText,
   rewriteInstruction: effectiveInstruction
  });

  // 写前复盘：改写前先对齐本章决策（与主路径同一入口）
  let preWriteTokens = 0;
  const reflect = await runPreWriteReflection(
   { book, chapter, taskSheet: plannedTaskSheet, outlineText: getChapterOutlineText(chapter) },
   async (msgs) => {
    const r = await chat({
     stream: false,
     bookId: book.id,
     chapterId: chapter.id,
     disableStyle: true,
     disableRag: true,
     messages: msgs as ChatMessagePayload[]
    });
    preWriteTokens = r.usage?.totalTokens ?? 0;
    return { text: r.text };
   }
  );
  if (reflect.decision) {
   // 决策紧跟写手 system（index 1），改写也要对齐本章决策
   rewriteMessages.splice(1, 0, { role: 'system', content: formatPreWriteDecisionForWriter(reflect.decision) });
   emitThought(callbacks.onThought, `写前复盘：${formatPreWriteDecisionForUser(reflect.decision).slice(0, 200)}`, 1);
  }

  const response = await chat({
   stream: false,
   bookId: book.id,
   chapterId: chapter.id,
   disableStyle: true,
   shuangwenMode: isRewriteShuangwen,
   messages: rewriteMessages
  });

 const rewritten = normalizeChinesePunctuation(String(response.text || '').trim());
 if (!rewritten) {
 const message = 'Agent 未返回有效的改写结果，请重试。';
 onError(message);
 onBubble('assistant', message);
 setSessionStage('error');
 return;
 }

 setSessionStage('reviewing');
 const ok = await bridge.reviewRewrite(chapter.id, { from: selection.from, to: selection.to }, rewritten);
 if (!ok) throw new Error('编辑器未能接收改写内容，请重试。');

  const totalUsed = (response.usage?.totalTokens ?? 0) + preWriteTokens;
  onDraftMeta({
   totalTokens: totalUsed,
   estimatedCost: response.usage?.estimatedCost,
   provider: response.provider,
   model: response.model,
   durationMs: response.durationMs,
   generatedAt: new Date().toISOString()
  });
  addTokenUsage(response.provider || 'unknown', totalUsed, response.usage?.estimatedCost ?? 0);
 onBubble(
 'assistant',
 `改写已提交审阅。\n\n预览： ${rewritten.slice(0, 120)}${rewritten.length > 120 ? '...' : ''}`
 );
 setSessionStage('idle');
 showIsland({ type: 'success', status: 'feedback', message: '改写已送审', autoHideMs: 1500 });
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || '改写失败');
 onError(message);
 onBubble('assistant', message);
 setSessionStage('error');
 showIsland({ type: 'error', status: 'feedback', message: '改写失败', detail: message, autoHideMs: 1800 });
 }
 },
 [
 addTokenUsage,
 chat,
 prepareBundleForTaskSheet,
 requestInFlight,
 resetDebug,
 resolveChapterReferences,
 runPlanning,
 setReferenceDebug,
 showIsland
 ]
 );

 const insertDraft = useCallback(
 async (
 content: string,
 chapter: { id: string },
 bridge: AgentWorkspaceBridge,
 onError: (message: string) => void
 ) => {
 if (!content.trim() || !bridge.applyDraft) return;
 try {
 setSessionStage('reviewing');
 const ok = await bridge.applyDraft(chapter.id, content, 'append');
 if (!ok) throw new Error('编辑器未响应追加操作，请重试。');
 setSessionStage('idle');
 showIsland({ type: 'success', status: 'feedback', message: '已追加到正文', autoHideMs: 1500 });
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || '追加失败');
 onError(message);
 setSessionStage('error');
 showIsland({ type: 'error', status: 'feedback', message: '追加失败', detail: message, autoHideMs: 1800 });
 }
 },
 [showIsland]
 );

 const runArcPlanning = useCallback(
 async (
 book: Book,
 chapter: Chapter,
 conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
 userMessage: string,
 finalizeOutline: boolean,
 onChunk: (chunk: string) => void,
 genre?: string
 ): Promise<void> => {
 // 读取最近50章有 memory 的摘要
 const memoryBank = Array.isArray(book.memoryBank) ? book.memoryBank : [];
 const chapters = Array.isArray(book.chapters) ? book.chapters : [];
 const currentIndex = chapters.findIndex((c) => c.id === chapter.id);

 const recentMemories = memoryBank
 .filter((m) => {
 const idx = chapters.findIndex((c) => c.id === m.chapterId);
 return idx >= 0 && idx <= currentIndex;
 })
 .sort((a, b) => {
 const ai = chapters.findIndex((c) => c.id === a.chapterId);
 const bi = chapters.findIndex((c) => c.id === b.chapterId);
 return ai - bi;
 })
 .slice(-50)
 .map((m) => {
 const ch = chapters.find((c) => c.id === m.chapterId);
 return {
 chapterTitle: ch?.title || m.chapterId,
 synopsis: m.plotAnalysis?.plotSynopsis || m.plotAnalysis?.functionSummary || m.summary || '',
 endingState: m.agentOutline?.endingState,
 openLoops: m.agentOutline?.openLoops?.slice(0, 3)
 };
 })
 .filter((m) => m.synopsis);

 const messages = buildArcPlanningMessages({
 book,
 chapter,
 recentMemories,
 conversationHistory,
 userMessage,
 finalizeOutline,
 customPlannerPrompt: customPlannerPrompt.trim() ? customPlannerPrompt : undefined,
 genre
 });

 // 直接调用 electronAPI，不走 useAiChat hook，避免与主流程状态互相干扰
 // 手动过滤 <think>...</think> 思维链标签，避免输出到对话框
 // 独立 sessionId + senderId：chunk 按 sessionId 过滤，且不与主流程共用 'main' 请求锁，
 // 修复并发流式请求互相串扰 / REQUEST_IN_PROGRESS 误拒的问题。
 const sessionId = `arc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
 let inThinkBlock = false;
 let thinkBuffer = '';

 const off = electronAPI.ai.onStreamChunkFor(sessionId, (chunk) => {
 if (!chunk.text) return;
 let text = chunk.text;

 // 过滤思维链
 if (inThinkBlock) {
 const combined = thinkBuffer + text;
 const endMatch = combined.match(/<\/think(?:ing)?>/i);
 if (endMatch) {
 inThinkBlock = false;
 thinkBuffer = '';
 text = combined.slice(endMatch.index! + endMatch[0].length);
 if (!text) return;
 } else {
 thinkBuffer = combined;
 return;
 }
 }

 const startMatch = text.match(/<think(?:ing)?>/i);
 if (startMatch) {
 const before = text.slice(0, startMatch.index);
 inThinkBlock = true;
 thinkBuffer = text.slice(startMatch.index! + startMatch[0].length);
 // 检查 buffer 里是否已有结束标签
 const endInBuffer = thinkBuffer.match(/<\/think(?:ing)?>/i);
 if (endInBuffer) {
 inThinkBlock = false;
 const after = thinkBuffer.slice(endInBuffer.index! + endInBuffer[0].length);
 thinkBuffer = '';
 if (before || after) onChunk((before || '') + (after || ''));
 } else if (before) {
 onChunk(before);
 }
 return;
 }

 onChunk(text);
 });

 try {
 await electronAPI.ai.chat({
 messages,
 stream: true,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 disableStyle: true,
 senderId: 'arc-planning',
 sessionId
 });
 } finally {
 off();
 }
 },
 [customPlannerPrompt]
 );

 const runStoryPlanning = useCallback(
 async (
 book: Book,
 chapter: Chapter,
 userHint: string,
 onChunk: (chunk: string, done: boolean) => void
 ) => {
 // 从 memoryBank 取最近8章摘要（不传正文，控制 token）
 const memoryBank = Array.isArray(book.memoryBank) ? book.memoryBank : [];
 const chapters = Array.isArray(book.chapters) ? book.chapters : [];
 const currentIndex = chapters.findIndex((c) => c.id === chapter.id);

 const recentMemories = memoryBank
 .filter((m) => {
 const idx = chapters.findIndex((c) => c.id === m.chapterId);
 return idx >= 0 && idx <= currentIndex;
 })
 .sort((a, b) => {
 const ai = chapters.findIndex((c) => c.id === a.chapterId);
 const bi = chapters.findIndex((c) => c.id === b.chapterId);
 return bi - ai;
 })
 .slice(0, 8)
 .reverse()
 .map((m) => {
 const ch = chapters.find((c) => c.id === m.chapterId);
 return {
 chapterTitle: ch?.title || m.chapterId,
 synopsis: m.plotAnalysis?.plotSynopsis || m.plotAnalysis?.functionSummary || m.summary || '',
 endingState: m.agentOutline?.endingState,
 openLoops: m.agentOutline?.openLoops?.slice(0, 2)
 };
 })
 .filter((m) => m.synopsis);

 const messages = buildStoryPlanningMessages({
 book,
 chapter,
 recentMemories,
 userHint: userHint.trim() || undefined
 });

 // 流式输出，兼容逆向WEB中转
 await chat({
 stream: true,
 bookId: book.id,
 chapterId: chapter.id,
 disableStyle: true,
 disableRag: true,
 messages,
 onChunk
 });
 },
 [chat]
 );

 return {
  chat,
  requestInFlight,
  status,
  sessionStage,
  sessionBusy: sessionStage !== 'idle' && sessionStage !== 'error',
  sessionDebug,
  hideIsland,
  prepareBundleForInstruction,
  runAgent,
  rewriteSelection,
  insertDraft,
  runStoryPlanning,
  runArcPlanning,
  // 新书 wizard（P2-A1）
  agentWizardState,
  wizardDispatch,
  };
}
