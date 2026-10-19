/**
 * useEditorAgentMode
 *
 * 编辑器内 Agent 模式的统一入口。
 * 当用户切换到 Agent 写作通道时，编辑器里的续写、润色、改写
 * 全部通过此 hook 走 Agent 的 genre/craft 体系，与普通文风通道完全隔离。
 *
 * 使用方式：
 * const agentMode = useEditorAgentMode({ book, chapter, editorInstanceRef, handleInlineAiResult, forcePersistCurrentEditor });
 * if (isAgentMode) agentMode.rewrite('把这段改得更有张力');
 * if (isAgentMode) agentMode.continue('继续写下一段');
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Editor } from '@tiptap/core';
import type { Book, Chapter } from '../types';
import { useConfigStore } from '../store/useConfigStore';
import { useIslandStore } from '../store/useIslandStore';
import { useBookStore } from '../store/useBookStore';
import { inferAgentGenreFromBook } from './bookContext';
import { collectAgentChapterReferences } from './bookContext';
import { createAgentTaskSheet } from './taskSheet';
import { useAgentSession } from './useAgentSession';
import type { AgentGenreId, AgentWorkspaceBridge } from './types';
import { toSafeParagraphNodes } from '../utils/editorUtils';

interface UseEditorAgentModeParams {
 book: Book;
 chapter: Chapter;
 editorInstanceRef: MutableRefObject<Editor | null>;
 handleInlineAiResult: (range: { from: number; to: number }, text: string) => void;
 forcePersistCurrentEditor: (options?: { forceHistory?: boolean }) => void;
}

export interface EditorAgentModeApi {
 /** 用 Agent 改写当前选区 */
 rewrite: (instruction: string) => Promise<void>;
 /** 用 Agent 续写（在光标位置追加） */
 continue: (instruction: string) => Promise<void>;
 /** 当前是否正在处理 */
 busy: boolean;
 /** 最近一次错误 */
 lastError: string;
}

export function useEditorAgentMode({
 book,
 chapter,
 editorInstanceRef,
 handleInlineAiResult,
 forcePersistCurrentEditor
}: UseEditorAgentModeParams): EditorAgentModeApi {
 const showIsland = useIslandStore((s) => s.show);
 const [lastError, setLastError] = useState('');

 const {
 runAgent,
 rewriteSelection,
 sessionBusy,
 prepareBundleForInstruction
 } = useAgentSession();

  // 优先使用设置里手动指定的题材，没有则从书籍信息自动推断
 const configGenre = useConfigStore((s) => s.config?.ai.agentGenre);
 const inferredGenre = useMemo(() => inferAgentGenreFromBook(book) as AgentGenreId, [book]);
 const genre = configGenre ?? inferredGenre;

 // 参考章节：取上一章（如果有）
 const chapterReferences = useMemo(
 () => collectAgentChapterReferences(book, chapter),
 [book, chapter]
 );

 // 构造 bridge：直接操作当前编辑器实例，不走 IPC
 const bridge = useMemo<AgentWorkspaceBridge>(() => ({
 getSelection: (chapterId: string) => {
 if (chapterId !== chapter.id) return null;
 const ed = editorInstanceRef.current;
 if (!ed || ed.isDestroyed) return null;
 const { from, to } = ed.state.selection;
 if (from >= to) return null;
 return { from, to, text: ed.state.doc.textBetween(from, to, '\n') };
 },
 reviewRewrite: async (chapterId: string, range: { from: number; to: number }, rewritten: string) => {
 if (chapterId !== chapter.id) return false;
 handleInlineAiResult(range, rewritten);
 return true;
 },
 applyDraft: async (chapterId: string, content: string, mode: 'replace' | 'append') => {
 if (chapterId !== chapter.id) return false;
 const ed = editorInstanceRef.current;
 if (!ed || ed.isDestroyed) return false;
 const nodes = toSafeParagraphNodes(content);
 if (mode === 'replace') {
 ed.chain().focus().selectAll().insertContent(nodes).run();
 } else {
 const end = ed.state.doc.content.size;
 ed.chain().focus().setTextSelection(end).insertContent(nodes).run();
 }
 forcePersistCurrentEditor({ forceHistory: true });
 return true;
 }
 }), [chapter.id, editorInstanceRef, forcePersistCurrentEditor, handleInlineAiResult]);

 // 预加载 referenceBundle（懒加载，按 genre 缓存，genre 变化时自动失效）
 const bundleRef = useRef<{ genre: string; bundle: Awaited<ReturnType<typeof prepareBundleForInstruction>> | null; ready: boolean }>({
 genre: '',
 bundle: null,
 ready: false
 });

 const ensureBundle = useCallback(async (instruction: string) => {
 // genre 变化时使缓存失效
 if (bundleRef.current.ready && bundleRef.current.bundle && bundleRef.current.genre === genre) {
 return bundleRef.current.bundle;
 }
 try {
 const bundle = await prepareBundleForInstruction(genre, instruction, true);
 bundleRef.current = { genre, bundle, ready: true };
 return bundle;
 } catch {
 bundleRef.current = { genre: '', bundle: null, ready: false };
 return null;
 }
 }, [genre, prepareBundleForInstruction]);

 const rewrite = useCallback(async (instruction: string) => {
 if (sessionBusy) {
 showIsland({ type: 'warning', message: 'Agent 正在处理中，请稍候', autoHideMs: 1500 });
 return;
 }
 setLastError('');

 const ed = editorInstanceRef.current;
 if (!ed || ed.isDestroyed) return;
 const { from, to } = ed.state.selection;
 if (from >= to) {
 showIsland({ type: 'warning', message: '请先选中要改写的文本', autoHideMs: 1500 });
 return;
 }

  const taskSheet = createAgentTaskSheet({ genre, userInstruction: instruction });
  const referenceBundle = await ensureBundle(instruction);

  // 档案读权威 memory.json，避免用 book.json 旧快照
  try { await useBookStore.getState().loadMemoryBank(book.id); } catch { /* ignore */ }

  await rewriteSelection(instruction, {
 genre,
 instruction,
 book,
 chapter,
 bridge,
 taskSheet,
 referenceBundle,
 referenceReady: Boolean(referenceBundle),
 selectedChapterReferences: chapterReferences,
 selectedReferenceIds: chapterReferences.map((r) => r.id),
 preferredReferenceId: chapterReferences[0]?.id ?? '',
 useLocalAgentPack: true,
 onResult: () => {},
 onDraftMeta: () => {},
 onError: setLastError,
 onBubble: () => {}
 });
 }, [book, bridge, chapter, chapterReferences, editorInstanceRef, ensureBundle, genre, rewriteSelection, sessionBusy, showIsland]);

 const continueWriting = useCallback(async (instruction: string) => {
 if (sessionBusy) {
 showIsland({ type: 'warning', message: 'Agent 正在处理中，请稍候', autoHideMs: 1500 });
 return;
 }
 setLastError('');

  // 编辑器续写只走写手通道（跳过编辑角色的 planning 阶段）
  const taskSheet = createAgentTaskSheet({ genre, userInstruction: instruction });
  const referenceBundle = await ensureBundle(instruction);

  // 档案读权威 memory.json，避免用 book.json 旧快照
  try { await useBookStore.getState().loadMemoryBank(book.id); } catch { /* ignore */ }

  await runAgent({
 genre,
 instruction,
 book,
 chapter,
 bridge,
 taskSheet,
 referenceBundle,
 referenceReady: Boolean(referenceBundle),
 selectedChapterReferences: chapterReferences,
 selectedReferenceIds: chapterReferences.map((r) => r.id),
 preferredReferenceId: chapterReferences[0]?.id ?? '',
 useLocalAgentPack: true,
 skipPlanning: true, // 跳过编辑角色，直接走写手
 onResult: (text) => {
 if (!text.trim()) return;
 bridge.applyDraft?.(chapter.id, text, 'append');
 },
 onDraftMeta: () => {},
 onError: setLastError,
 onBubble: () => {}
 });
 }, [book, bridge, chapter, chapterReferences, ensureBundle, genre, runAgent, sessionBusy, showIsland]);

 return {
 rewrite,
 continue: continueWriting,
 busy: sessionBusy,
 lastError
 };
}
