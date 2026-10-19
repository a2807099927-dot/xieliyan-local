// 模块说明：续写流程 Hook。
// 关键职责：组合上下文/调用 AI/采纳结果的完整链路。
import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { electronAPI } from '../utils/electron';
import { getPromptSync, withBaseProse } from '../utils/promptStore';
import { useConfigStore } from '../store/useConfigStore';
import { useBookStore } from '../store/useBookStore';
import { resolveStyleForBook, injectStyleToMessages } from '../utils/styleResolver';
import { normalizeAiErrorMessage, normalizeEscapedNewlines, normalizeNovelOutput } from '../utils/editorUtils';
import { splitAgentOutput } from '../Agent/stripAgentOutput';

export type ContinuationRetryRequest = {
 messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
 maxTokens?: number;
 disableRag?: boolean;
 disableStyle?: boolean;
};

export type PendingContinuationReview = {
 title: string;
 text: string;
 from: number;
 instruction: string;
 chapterId: string;
 elapsedMs: number;
 paragraphs: string[];
 selected: number[];
 editingIndex: number | null;
 retryRequest?: ContinuationRetryRequest;
};

interface UseContinuationFlowParams {
 editor: any;
 bookId: string;
 chapterId: string;
 island: {
 startTask: (payload: any) => string;
 finishTask: (id: string) => void;
 show: (payload: any) => void;
 };
 setShowGuidedModal: (open: boolean) => void;
 setGuidedInitialValue: (value: string | undefined) => void;
 forcePersistCurrentEditor: (options?: { forceHistory?: boolean }) => void;
 restoreEditorFocus: (preferredPos?: number) => void;
}

function buildGuidedRetryMessages(finalInstruction: string, contentUpToCursor: string) {
 return [
 {
 role: 'system' as const,
 content:
 withBaseProse(getPromptSync('continuation_system', '你是中文长篇小说续写助手。必须严格执行用户给出的当前章节任务，只续写当前章节光标之后内容。仅输出正文。'))
 },
 {
 role: 'user' as const,
 content: [
 `【当前任务】${finalInstruction}`,
 '',
 `【当前章节（光标前正文）】\n${contentUpToCursor || '（空）'}`,
 '',
 '要求：',
 '1) 严格执行当前任务，不跑题；',
 '2) 与当前章节光标前正文自然衔接；',
 '3) 仅输出可直接插入正文的小说内容，不要解释。'
 ].join('\n')
 }
 ];
}

/**
 * Encapsulates guided continuation request lifecycle and review/accept flow state.
 */
export function useContinuationFlow({
 editor,
 bookId,
 chapterId,
 island,
 setShowGuidedModal,
 setGuidedInitialValue,
 forcePersistCurrentEditor,
 restoreEditorFocus
}: UseContinuationFlowParams): {
 pendingContinuation: PendingContinuationReview | null;
 setPendingContinuation: Dispatch<SetStateAction<PendingContinuationReview | null>>;
 requestGuidedContinuation: (instruction: string, supplement?: string) => Promise<void>;
 acceptContinuation: (useAll?: boolean) => void;
} {
 const [pendingContinuation, setPendingContinuation] = useState<PendingContinuationReview | null>(null);

 const requestGuidedContinuation = useCallback(
 async (instruction: string, supplement?: string) => {
 if (!editor) return;
 setShowGuidedModal(false);

 const cursorPos = editor.state.selection.to;
 const contentUpToCursor = editor.state.doc.textBetween(1, cursorPos, '\n', '\n').trim().slice(-3500);

 const aiTaskId = island.startTask({
 type: 'progress',
 status: 'thinking',
 message: supplement ? '正在修正续写...' : 'AI 正在根据指令续写...'
 });
 const startedAt = Date.now();

 try {
 const finalInstruction = normalizeEscapedNewlines(
 supplement ? `原始指令：${instruction}\n补充修正：${supplement}` : instruction
 );
 const retryMessages = buildGuidedRetryMessages(finalInstruction, contentUpToCursor);

  const config = useConfigStore.getState().config;
  const books = useBookStore.getState().books;
  // 已知例外（编辑器风格单入口 T2）：本路径的 messages 来自 buildGuidedRetryMessages（裸调 continuation_system，
  // 不走 buildWritingPromptBundle），这里 injectStyleToMessages 是唯一风格注入，必须保留。
  const finalMessages = config
  ? injectStyleToMessages(retryMessages, bookId, config, books, false)
  : retryMessages;
 const response = await electronAPI.ai.chat({
  stream: false,
  bookId,
  chapterId,
  messages: finalMessages
  });

 // 剥离思考/计划：模型只输出思考时不把思考当正文（引导式续写路径）
 const continuationSplit = splitAgentOutput(String(response.text || '').trim());
 const text = normalizeNovelOutput(continuationSplit.hasBody ? continuationSplit.body : '');
 if (!text) throw new Error('AI 未返回内容（可能只输出了写作计划）。请重试。');

 const paragraphs = text
 .replace(/\r\n/g, '\n')
 .split(/\n{1,}/)
 .map((item) => item.trim())
 .filter(Boolean);
 const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [text];

 setPendingContinuation({
 title: supplement ? 'AI 修正续写结果' : 'AI 引导续写结果',
 text,
 from: cursorPos,
 instruction: supplement ? `${instruction}（补充：${supplement}）` : instruction,
 chapterId,
 elapsedMs: Date.now() - startedAt,
 paragraphs: normalizedParagraphs,
 selected: normalizedParagraphs.map((_, index) => index),
 editingIndex: null,
 retryRequest: {
 messages: retryMessages,
 disableRag: false,
 disableStyle: false
 }
 });

 island.show({ type: 'success', message: '已生成续写结果，请在弹窗中采纳。', autoHideMs: 1800 });
 island.finishTask(aiTaskId);
 } catch (error) {
 island.finishTask(aiTaskId);
 island.show({ type: 'error', message: '续写失败', detail: normalizeAiErrorMessage(error) });
 }
 },
 [bookId, chapterId, editor, island, setShowGuidedModal]
 );

 const acceptContinuation = useCallback(
 (useAll = false) => {
 if (!editor || !pendingContinuation) return;
 const selectedSet = new Set(pendingContinuation.selected);
 const picked = pendingContinuation.paragraphs
 .filter((_, index) => (useAll ? true : selectedSet.has(index)))
 .map((item) => item.trim())
 .filter(Boolean);
 if (picked.length === 0) {
 island.show({ type: 'warning', message: '请至少保留一段再采纳。' });
 return;
 }
 const nodes = picked.map((text) => ({
 type: 'paragraph',
 content: [{ type: 'text', text }]
 }));
 const insertPos = Math.min(Math.max(pendingContinuation.from, 1), editor.state.doc.content.size);
 editor.chain().focus().insertContentAt(insertPos, nodes).run();
 const nextCursorPos = editor.state.selection.to;
 forcePersistCurrentEditor({ forceHistory: true });
 island.show({ type: 'success', message: '续写内容已采纳。', autoHideMs: 1400 });
 setPendingContinuation(null);
 restoreEditorFocus(nextCursorPos);
 },
 [editor, forcePersistCurrentEditor, island, pendingContinuation, restoreEditorFocus]
 );

 useEffect(() => {
 const handleReopen = (event: any) => {
 setGuidedInitialValue(event.detail || undefined);
 setShowGuidedModal(true);
 };
 window.addEventListener('reopen-guided-modal', handleReopen);
 return () => window.removeEventListener('reopen-guided-modal', handleReopen);
 }, [setGuidedInitialValue, setShowGuidedModal]);

 return {
 pendingContinuation,
 setPendingContinuation,
 requestGuidedContinuation,
 acceptContinuation
 };
}
