// 正文编辑器组件：承载 Tiptap 编辑能力、内容同步与编辑器事件桥接。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import 'tippy.js/dist/tippy.css';
import type { Book, Chapter, RoleProfile } from '../../types';
import { ISSUE_TYPE_COLOR, type ReviewAnnotation } from '../../types/review';
import { useBookStore } from '../../store/useBookStore';
import { electronAPI } from '../../utils/electron';
import { getPromptSync } from '../../utils/promptStore';
import { CharacterHighlightMark, applyCharacterHighlights } from './characterHighlight';
import { SearchHighlightMark } from './searchHighlight';
import { ReviewDiffMark } from './reviewDiffMark';
import { DiffWidgetNode } from './extensions/DiffWidget';
import { CustomDivider } from './extensions/CustomDivider';
import { useEditorBridgeStore } from '../../store/useEditorBridgeStore';
import { useConfigStore } from '../../store/useConfigStore';
import { useIslandStore } from '../../store/useIslandStore';
import { FindReplacePanel } from './FindReplacePanel';
import { GuidedContinuationModal } from '../modals/GuidedContinuationModal';
import { EditorContextMenu } from './EditorContextMenu';
import { DiffCard } from './DiffCard';
import { createCharacterTooltipElement } from './CharacterTooltip';
import { useCharacterHoverCard } from '../../hooks/useCharacterHoverCard';
import { useDiffCardPosition } from '../../hooks/useDiffCardPosition';
import { useEditorContextMenu } from '../../hooks/useEditorContextMenu';
import { useChapterPersistence } from '../../hooks/useChapterPersistence';
import { useContinuationFlow } from '../../hooks/useContinuationFlow';
import { useDiffAnalysisFlow } from '../../hooks/useDiffAnalysisFlow';
import { useInlineSuggestionRailLayout } from '../../hooks/useInlineSuggestionRailLayout';
import { useEditorBridgeSync } from '../../hooks/useEditorBridgeSync';
import { useEditorTransactionFlow } from '../../hooks/useEditorTransactionFlow';
import { useAppStore } from '../../store/useAppStore';
import { ensureChapterHeading } from '../../utils/chapterTemplate';
import { OutlineWizard } from './OutlineWizard';
import { getCurrentParagraphKey, hasNonEmptyParagraphAfter } from '../../utils/editor/selection';
import {
 clampSuggestionText,
 cleanCharacterTooltipText,
 createId,
 escapeHtml,
 findIndexInRawParagraph,
 getPosFromTextOffset,
 hashText,
 normalizeParagraphForScan,
 pickSuggestionField,
 shouldPreferBodyFont,
 transactionInsertedMeaningfulCharCount
} from '../../utils/editor/helpers';
import { useEditorAgentMode } from '../../Agent/useEditorAgentMode';
import { buildParagraphDiffs, buildInlineDiffHtml } from '../../utils/editor/diff';
import { INLINE_SUGGESTION_COLORS, isEditorViewAlive, safeDispatch } from './TiptapEditor.internals';
interface InlineSuggestion {
 id: string;
 chapterId: string;
 paragraphHash: string;
 paragraphText: string;
 from: number;
 to: number;
 original: string;
 suggestion: string;
 reason: string;
 kind: 'wording' | 'order' | 'description';
 status: 'pending' | 'applied' | 'dismissed';
 color: string;
}

type SavedAiRewriteReview = {
 range: { from: number; to: number };
 original: string;
 rewritten: string;
};

interface TiptapEditorProps {
 bookId: string;
 book: Book;
 chapter: Chapter;
 keywords: string[];
 roleLookup: Record<string, RoleProfile>;
 hardConstraints?: { goal: string; tone: string; constraints: string };
 findReplaceSignal?: number;
 quickFormatSignal?: number;
 contentMaxWidth?: number;
 onHistoryActionBind?: (actions: { undo: () => void; redo: () => void }) => void;
 onHistoryStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
 onSaveStatusChange?: (status: 'saving' | 'saved' | 'failed') => void;
 forceOutlineWizardOpen?: boolean;
 onOutlineWizardClose?: () => void;
 layout?: 'main' | 'split';
 enableEditorBridge?: boolean;
 enableInlineAnalysis?: boolean;
 reviewAnnotations?: ReviewAnnotation[];
 /** false 时禁止编辑（工坊生成中章只读） */
 editable?: boolean;
}

const INLINE_SUGGESTION_PLUGIN_KEY = new PluginKey('inlineSuggestionDecoration');
const REVIEW_ANNOTATION_PLUGIN_KEY = new PluginKey('reviewAnnotationDecoration');
const HEADING_PROTECTION_PLUGIN_KEY = new PluginKey('chapterHeadingProtection');
const LOCKED_TEXT_SELECTION_PLUGIN_KEY = new PluginKey('lockedTextSelectionDecoration');
const AI_PROCESSING_DECORATION_KEY = new PluginKey('aiProcessingDecoration');
const SEARCH_JUMP_FOCUS_DECORATION_KEY = new PluginKey('searchJumpFocusDecoration');
// 说明：内联建议色板、编辑器存活探测与安全事务派发已抽离至 TiptapEditor.internals.ts

/** 把 HTML 或纯文本归一化为可比较的字符序列（去标签、去空白、统一 HTML 实体） */
function normalizeContentText(input: string): string {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, '')
    .trim();
}

export function TiptapEditor({
 bookId,
 book,
 chapter,
 keywords,
 roleLookup,
 hardConstraints,
 findReplaceSignal,
 quickFormatSignal,
 contentMaxWidth,
 onHistoryActionBind,
 onHistoryStateChange,
 onSaveStatusChange,
 forceOutlineWizardOpen,
 onOutlineWizardClose,
 layout = 'main',
 enableEditorBridge = true,
 enableInlineAnalysis = true,
 reviewAnnotations = [],
 editable = true,
}: TiptapEditorProps) {
 const showIsland = useIslandStore((s) => s.show);
 const setChapterContent = useBookStore((s) => s.setChapterContent);
 const config = useConfigStore((s) => s.config);
 const pendingSearchJump = useAppStore((s) => s.pendingSearchJump);
 const setPendingSearchJump = useAppStore((s) => s.setPendingSearchJump);
 const findReplaceOpen = useAppStore((s) => s.findReplaceOpen);
 const setFindReplaceOpen = useAppStore((s) => s.setFindReplaceOpen);
 const registerEditor = useEditorBridgeStore((s) => s.register);
 const unregisterEditor = useEditorBridgeStore((s) => s.unregister);

 const editorFontFamily = config?.ui.editorFontFamily ?? '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';
 const editorFontColor = config?.ui.editorFontColor ?? 'var(--text-primary)';
 const editorFontWeight = config?.ui.editorFontWeight ?? 400;
 const editorTextBrightness = config?.ui.editorTextBrightness ?? 1;
 const editorFontSize = config?.ui.editorFontSize ?? 16.5;
 const editorLineHeight = config?.ui.editorLineHeight ?? 2.05;
 // 默认不再用窄书页宽；用户若在设置里配了 editorMaxWidth 仍可覆盖。
  const editorMaxWidthCfg = config?.ui.editorMaxWidth ?? 1080;
 const tFontStyle = shouldPreferBodyFont(editorFontFamily)
 ? 'var(--font-body)'
 : `'WZ-CJK-Punctuation', ${editorFontFamily}`;
 const tFontWeight = editorFontWeight;
 const tTextBrightness = editorTextBrightness;
 const tFontSize = editorFontSize;
 const tLineHeight = editorLineHeight;
 const focusModeActive = useAppStore((s) => s.focusMode);
 const tMaxWidth = contentMaxWidth || editorMaxWidthCfg;
 const tFontColor = editorFontColor;
 const editorPaddingClass = layout === 'split' ? 'px-5' : 'px-8';
 const editorMinHeight = layout === 'split' ? '100%' : 'calc(100vh - 160px)';

 const shellRef = useRef<HTMLDivElement | null>(null);
 const viewportLockRef = useRef<{ active: boolean; paragraphHash: string | null; scrollTop: number; expiresAt: number }>({
 active: false, paragraphHash: null, scrollTop: 0, expiresAt: 0
 });
 const viewportLockByCodeRef = useRef(false);
 const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const flushQueuedSaveRef = useRef<(options?: { forceHistory?: boolean; html?: string }) => Promise<void>>(async () => {});
 const editorInstanceRef = useRef<Editor | null>(null);
 // 记录用户最后一次在编辑器内的有效光标位置（即使焦点跳到 webview 也保留）
 const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

 const pendingSaveHtmlRef = useRef<string | null>(null);
 const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 const { pushHistorySnapshot, forcePersistCurrentEditor } = useChapterPersistence({
 bookId, chapterTitle: chapter.title,
 editorInstanceRef, flushQueuedSaveRef,
 pendingSaveHtmlRef,
 saveTimerRef,
 onUserActivity: undefined, onSaveStatusChange
 });

 const startTask = useIslandStore((s) => s.startTask);
 const finishTask = useIslandStore((s) => s.finishTask);
 const island = useMemo(() => ({
 show: showIsland,
 startTask,
 finishTask
 }), [showIsland, startTask, finishTask]);

 const [isPendingOptimization, setIsPendingOptimization] = useState(false);
 const [pendingPreviousParagraph, setPendingPreviousParagraph] = useState('');
 const pendingPreviousParagraphRef = useRef<any>(null);
 const isPendingOptimizationRef = useRef(false);
 const expectedNewParagraphKeyRef = useRef<string | null>(null);
 const pendingTypedCharsRef = useRef(0);
 const deferredScanParagraphRef = useRef<any>(null);
 // BUG-01 fix: 稳定 ref，不能在 hook 参数对象里行内 useRef
 const quickFormatSignalRef = useRef<number | undefined>(undefined);
 const onUserActivityRef = useRef<(() => void) | undefined>(undefined);

 const clearPendingOptimizationState = useCallback(() => {
 setPendingPreviousParagraph('');
 setIsPendingOptimization(false);
 pendingPreviousParagraphRef.current = null;
 isPendingOptimizationRef.current = false;
 expectedNewParagraphKeyRef.current = null;
 pendingTypedCharsRef.current = 0;
 deferredScanParagraphRef.current = null;
 }, []);

 const setPendingOptimizationState = useCallback((paragraph: { text: string; hash: string; rawText: string; from: number; to: number } | null) => {
 if (!paragraph) { clearPendingOptimizationState(); return; }
 setPendingPreviousParagraph(paragraph.text);
 setIsPendingOptimization(true);
 pendingPreviousParagraphRef.current = paragraph;
 isPendingOptimizationRef.current = true;
 expectedNewParagraphKeyRef.current = null;
 pendingTypedCharsRef.current = 0;
 deferredScanParagraphRef.current = paragraph;
 }, [clearPendingOptimizationState]);

 useEffect(() => { isPendingOptimizationRef.current = isPendingOptimization; }, [isPendingOptimization]);
 useEffect(() => {
 if (!isPendingOptimization) return;
 if (!pendingPreviousParagraph.trim()) clearPendingOptimizationState();
 }, [isPendingOptimization, pendingPreviousParagraph, clearPendingOptimizationState]);

 const snapshotParagraphFromState = useCallback((state: any) => {
 const $from = state.selection.$from;
 const rawText = String($from.parent.textContent || '');
 const text = normalizeParagraphForScan(rawText);
 if (!text) return null;
 return { hash: hashText(text), rawText, text, from: $from.start(), to: $from.end() };
 }, []);

 const scanningParagraphRef = useRef<Set<string>>(new Set());
 const scanningParagraphsRef = useRef<Array<{ chapterId: string; from: number; to: number }>>([]);
 const pendingParagraphRef = useRef<any>(null);
 const lastSelectionParagraphRef = useRef<any>(null);

 const queueParagraphScan = useCallback(() => {
 if (!enableInlineAnalysis) return;
 if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
 const paragraph = pendingParagraphRef.current;
 if (!paragraph || !editorInstanceRef.current) return;
 const editor = editorInstanceRef.current;
 const chapterId = chapter.id;
 const doc = editor.state.doc;
 if (paragraph.from < 1 || paragraph.to > doc.content.size || paragraph.from >= paragraph.to) return;
 const key = `${chapterId}:${paragraph.from}`;
 if (scanningParagraphRef.current.has(key)) return;
 scanningParagraphRef.current.add(key);
 scanningParagraphsRef.current.push({ chapterId, from: paragraph.from, to: paragraph.to });
 const originalText = doc.textBetween(paragraph.from, paragraph.to, '\n', '\n');
 const normalized = normalizeParagraphForScan(originalText);
 if (!normalized || normalized.length < 2) return;
 const processParagraph = async () => {
 try {
 const response = await electronAPI.ai.chat({
 stream: false, bookId, chapterId: chapter.id, disableRag: true, disableStyle: true,
 messages: [
 { role: 'system', content: getPromptSync('inline_suggestion_system', '你是中文小说文本优化助手。分析以下段落，给出不超过3条可执行建议。每条建议包含：from（原文片段）、to（建议改法）、reason（原因）、kind（wording|order|description）。只返回 JSON 数组，不要解释。') },
 { role: 'user', content: normalized.slice(0, 2000) }
 ]
 });
 const text = response?.text || '';
 const jsonMatch = text.match(/\[[\s\S]*\]/);
 if (!jsonMatch) return;
 const items = JSON.parse(jsonMatch[0]) as Array<{ from: string; to: string; reason: string; kind: 'wording' | 'order' | 'description' }>;
 if (!Array.isArray(items) || items.length === 0) return;
 const newItems: InlineSuggestion[] = [];
 for (const item of items) {
 const cleanFrom = clampSuggestionText(item.from);
 const cleanTo = clampSuggestionText(item.to);
 if (!cleanFrom || !cleanTo || cleanFrom === cleanTo) continue;
 const fromIndex = findIndexInRawParagraph(paragraph.rawText, paragraph.text, cleanFrom);
 const toEnd = fromIndex + cleanFrom.length;
 if (fromIndex < 0) continue;
 const color = INLINE_SUGGESTION_COLORS[colorIndexRef.current % INLINE_SUGGESTION_COLORS.length];
 colorIndexRef.current += 1;
 newItems.push({
 id: createId(), chapterId: chapter.id,
 paragraphHash: paragraph.hash,
 paragraphText: paragraph.text,
 from: paragraph.from + fromIndex,
 to: paragraph.from + toEnd,
 original: cleanFrom, suggestion: cleanTo,
 reason: item.reason, kind: item.kind || 'wording',
 status: 'pending', color
 });
 }
 if (newItems.length > 0) {
 setInlineSuggestions((prev) => {
 const next = [...prev, ...newItems];
 // 最多保留50条建议，超出时丢弃最旧的
 return next.length > 50 ? next.slice(next.length - 50) : next;
 });
 suggestionsRef.current = [...suggestionsRef.current, ...newItems].slice(-50);
 safeDispatch(editor, editor.state.tr.setMeta(INLINE_SUGGESTION_PLUGIN_KEY, { refresh: true }));
 }
 } catch (err) { console.warn('[ParagraphScan] failed:', err); }
 finally {
 scanningParagraphRef.current.delete(key);
 scanningParagraphsRef.current = scanningParagraphsRef.current.filter((s) => !(s.chapterId === chapterId && s.from === paragraph.from));
 }
 };
 processParagraph();
 }, [bookId, chapter.id, enableInlineAnalysis]);

 const scheduleParagraphScan = useCallback((paragraph: any, delayMs = 0) => {
 if (!paragraph) return;
 pendingParagraphRef.current = paragraph;
 if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
 scanTimerRef.current = setTimeout(queueParagraphScan, Math.max(0, delayMs));
 }, [queueParagraphScan]);

 const maybeEnforceViewportLock = useCallback((reasonParagraphHash?: string | null) => {
 const shell = shellRef.current;
 const lock = viewportLockRef.current;
 if (!shell || !lock.active) return;
 if (reasonParagraphHash && lock.paragraphHash && reasonParagraphHash !== lock.paragraphHash) return;
 if (Date.now() > lock.expiresAt) { lock.active = false; return; }
 shell.scrollTop = lock.scrollTop;
 }, []);

 const [inlineSuggestions, setInlineSuggestions] = useState<InlineSuggestion[]>([]);
 const suggestionsRef = useRef<InlineSuggestion[]>([]);
 const reviewAnnotationsRef = useRef<ReviewAnnotation[]>([]);
 const colorIndexRef = useRef(0);

 useEffect(() => {
 reviewAnnotationsRef.current = reviewAnnotations;
 const ed = editorInstanceRef.current;
 if (isEditorViewAlive(ed)) {
 safeDispatch(ed, ed.state.tr.setMeta(REVIEW_ANNOTATION_PLUGIN_KEY, { refresh: true }).setMeta('addToHistory', false));
 }
 }, [reviewAnnotations]);

 // 切章节时清理非当前章节的建议，避免内存累积和跨章污染
 useEffect(() => {
 setInlineSuggestions((prev) => {
 const kept = prev.filter((s) => s.chapterId === chapter.id);
 if (kept.length === prev.length) return prev;
 suggestionsRef.current = kept;
 return kept;
 });
 }, [chapter.id]);

 const applySuggestion = useCallback((id: string) => {
 const editor = editorInstanceRef.current;
 if (!isEditorViewAlive(editor)) return;
 const item = suggestionsRef.current.find((s) => s.id === id);
 if (!item) return;
 editor.chain().focus().setTextSelection({ from: item.from, to: item.to }).insertContent(item.suggestion).run();
 setInlineSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'applied' } : s));
 suggestionsRef.current = suggestionsRef.current.map((s) => s.id === id ? { ...s, status: 'applied' } : s);
 safeDispatch(editor, editor.state.tr.setMeta(INLINE_SUGGESTION_PLUGIN_KEY, { refresh: true }));
 forcePersistCurrentEditor({ forceHistory: true });
 }, [forcePersistCurrentEditor]);

 const dismissSuggestion = useCallback((id: string) => {
 setInlineSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status: 'dismissed' } : s));
 suggestionsRef.current = suggestionsRef.current.map((s) => s.id === id ? { ...s, status: 'dismissed' } : s);
 const ed = editorInstanceRef.current;
 if (isEditorViewAlive(ed)) {
 safeDispatch(ed, ed.state.tr.setMeta(INLINE_SUGGESTION_PLUGIN_KEY, { refresh: true }));
 }
 }, []);

 const findLiveRangeBySuggestion = useCallback((
 suggestion: InlineSuggestion, docOverride?: PMNode
 ): { from: number; to: number } | null => {
 const editor = editorInstanceRef.current;
 if (!editor) return null;
 const doc = docOverride || editor.state.doc;
 const tryRange = (from: number, to: number) => {
 if (from < 1 || to > doc.content.size || from >= to) return null;
 const text = doc.textBetween(from, to, '\n', '\n');
 return text === suggestion.original ? { from, to } : null;
 };
 const direct = tryRange(suggestion.from, suggestion.to);
 if (direct) return direct;
 const localFrom = Math.max(1, suggestion.from - 200);
 const localTo = Math.min(doc.content.size, suggestion.to + 200);
 let best: { from: number; to: number } | null = null;
 doc.nodesBetween(localFrom, localTo, (node, pos) => {
 if (node.type.name === 'paragraph' && node.textContent) {
 const idx = node.textContent.indexOf(suggestion.original);
 if (idx >= 0) {
 const absFrom = pos + 1 + idx;
 best = { from: absFrom, to: absFrom + suggestion.original.length };
 return false;
 }
 }
 });
 return best;
 }, []);

 const findLiveRangeByReviewAnnotation = useCallback((
 annotation: ReviewAnnotation,
 docOverride?: PMNode
 ): { from: number; to: number } | null => {
 const editor = editorInstanceRef.current;
 if (!editor) return null;
 const doc = docOverride || editor.state.doc;
 const original = String(annotation.original || '').trim();
 if (!original) return null;

 const tryRange = (from: number, to: number) => {
 if (from < 1 || to > doc.content.size || from >= to) return null;
 const text = doc.textBetween(from, to, '\n', '\n');
 return text === original ? { from, to } : null;
 };

 const direct = tryRange(annotation.from, annotation.to);
 if (direct) return direct;

 const docText = doc.textBetween(0, doc.content.size, '\n', '\n');
 const candidateOffsets: number[] = [];
 let searchFrom = 0;
 while (searchFrom <= docText.length) {
 const idx = docText.indexOf(original, searchFrom);
 if (idx < 0) break;
 candidateOffsets.push(idx);
 searchFrom = idx + Math.max(1, original.length);
 }
 if (candidateOffsets.length === 0) return null;

 const targetOffset = Number.isFinite(annotation.from) ? annotation.from : candidateOffsets[0];
 const bestOffset = candidateOffsets.reduce((best, current) => (
 Math.abs(current - targetOffset) < Math.abs(best - targetOffset) ? current : best
 ), candidateOffsets[0]);
 const from = getPosFromTextOffset(doc, bestOffset);
 const to = getPosFromTextOffset(doc, bestOffset + original.length);
 return tryRange(from, to) || (from < to ? { from, to } : null);
 }, []);

 const [showGuidedModal, setShowGuidedModal] = useState(false);
 const [guidedInitialValue, setGuidedInitialValue] = useState<string | undefined>(undefined);
 const [cardAnchorPos, setCardAnchorPos] = useState<{ top: number; left: number } | null>(null);
 const [aiDiffAnalysis, setAiDiffAnalysis] = useState<{ original: string; result: string; analysis: string } | null>(null);

 const { clearPosition: clearDiffCardPosition } = useDiffCardPosition({ cardAnchorPos, aiDiffAnalysis } as any);

 // Inline AI Result now uses the inline diff UI
 const handleInlineAiResult = useCallback((range: { from: number; to: number }, rewritten: string) => {
 const editor = editorInstanceRef.current;
 if (!editor) return;
 const from = Math.max(1, Math.min(range.from, editor.state.doc.content.size));
 const to = Math.max(from, Math.min(range.to, editor.state.doc.content.size));
 const original = editor.state.doc.textBetween(from, to, '\n', '\n');
 
 // Generate inline diff HTML
 const diffs = buildParagraphDiffs(original, rewritten);
 const html = buildInlineDiffHtml(diffs);
 
 // Insert diff HTML into the editor replacing the original text
 editor.chain().focus().insertContentAt({ from, to }, html).run();
 forcePersistCurrentEditor({ forceHistory: true });
 }, [forcePersistCurrentEditor]);

 // Handle Diff Actions for inline polish
 const processInlineDiffAction = useCallback((diffId: string, action: 'accept' | 'reject') => {
 const editor = editorInstanceRef.current;
 if (!editor) return;
 
 const { state, view } = editor;
 const { doc, tr } = state;
 
 let hasChanges = false;
 
 // Find all marks and nodes with this diffId (iterate backwards)
 const marksToRemove: { from: number, to: number, kind: string }[] = [];
 const actionNodesToRemove: { from: number, to: number }[] = [];
 
 doc.descendants((node, pos) => {
 if ((node.type.name === 'reviewAction' || node.type.name === 'diffWidget') && node.attrs.diffId === diffId) {
 actionNodesToRemove.push({ from: pos, to: pos + node.nodeSize });
 }
 
 const reviewMark = node.marks.find(m => m.type.name === 'reviewDiff' && m.attrs.diffId === diffId);
 if (reviewMark) {
 marksToRemove.push({ from: pos, to: pos + node.nodeSize, kind: reviewMark.attrs.kind });
 }
 });
 
 for (let i = actionNodesToRemove.length - 1; i >= 0; i--) {
 const range = actionNodesToRemove[i];
 tr.delete(range.from, range.to);
 hasChanges = true;
 }
 
 for (let i = marksToRemove.length - 1; i >= 0; i--) {
 const { from, to, kind } = marksToRemove[i];
 if ((action === 'accept' && kind === 'strikethrough') || (action === 'reject' && kind === 'changed')) {
 tr.delete(from, to);
 } else {
 tr.removeMark(from, to, state.schema.marks.reviewDiff);
 }
 hasChanges = true;
 }
 
 if (hasChanges) {
 safeDispatch(editor, tr);
 forcePersistCurrentEditor({ forceHistory: true });
 }
 }, [forcePersistCurrentEditor]);

 useEffect(() => {
 const handleDiffAction = (e: CustomEvent) => {
 const { action, id } = e.detail;
 // Since useFullReview runs at the page level, we can let it handle its own diffs.
 // But we process ANY diffId we find locally in the editor.
 processInlineDiffAction(id, action);
 };
 window.addEventListener('writerzen:diff-action', handleDiffAction as EventListener);
 return () => window.removeEventListener('writerzen:diff-action', handleDiffAction as EventListener);
 }, [processInlineDiffAction]);

 useDiffAnalysisFlow({ bookId, chapterId: chapter.id, island, setAiDiffAnalysis });

 useEffect(() => { if (!aiDiffAnalysis) editorInstanceRef.current?.view.focus(); }, [aiDiffAnalysis]);

 const findSignalRef = useRef<number | undefined>(undefined);
 const openFindReplaceRef = useRef<() => void>(() => setFindReplaceOpen((prev) => !prev));

 useEffect(() => {
 if (findReplaceSignal === undefined) return;
 if (findSignalRef.current === undefined) { findSignalRef.current = findReplaceSignal; return; }
 if (findReplaceSignal === findSignalRef.current) return;
 findSignalRef.current = findReplaceSignal;
 setFindReplaceOpen(true);
 }, [findReplaceSignal]);

 // Agent 跳转搜索：打开查找面板并预填关键词
 useEffect(() => {
 const handleSearchInEditor = (e: Event) => {
 const keyword = (e as CustomEvent)?.detail?.keyword;
 if (keyword && typeof keyword === 'string') {
 setFindReplaceOpen(true);
 // 通过事件通知 FindReplacePanel 预填关键词
 setTimeout(() => {
 window.dispatchEvent(new CustomEvent('writerzen:prefill-find-keyword', { detail: { keyword } }));
 }, 150);
 }
 };
 window.addEventListener('writerzen:search-in-editor', handleSearchInEditor);
 return () => window.removeEventListener('writerzen:search-in-editor', handleSearchInEditor);
 }, []);

 // 全局 Ctrl+F 统一由 App.tsx 在 capture 阶段拦截并 dispatch 此事件
 useEffect(() => {
 const handler = () => setFindReplaceOpen(!findReplaceOpen);
 window.addEventListener('writerzen:toggle-find-replace', handler);
 return () => window.removeEventListener('writerzen:toggle-find-replace', handler);
 }, [findReplaceOpen]);

 // 响应一键替换（来自审查面板）
 useEffect(() => {
 const handleReplaceText = (e: Event) => {
 const { original, replacement, annotationId } = (e as CustomEvent).detail || {};
 if (!original || !replacement || !isEditorViewAlive(editorInstanceRef.current)) return;
 
 const editor = editorInstanceRef.current;
 const { state, view } = editor;
 const { doc, tr } = state;
 const annotation = reviewAnnotationsRef.current.find((item) => item.id === annotationId);
 const liveRange = annotation ? findLiveRangeByReviewAnnotation(annotation, doc) : null;
 if (liveRange) {
 tr.insertText(replacement, liveRange.from, liveRange.to);
 safeDispatch(editor, tr);
 forcePersistCurrentEditor({ forceHistory: true });
 return;
 }
 let pos = -1;
 
 doc.descendants((node, p) => {
 if (pos !== -1) return false;
 if (node.type.name === 'paragraph' && node.textContent.includes(original)) {
 const offset = node.textContent.indexOf(original);
 pos = p + 1 + offset;
 return false;
 }
 });
 
 if (pos !== -1) {
 tr.insertText(replacement, pos, pos + original.length);
 safeDispatch(editor, tr);
 forcePersistCurrentEditor({ forceHistory: true });
 } else {
 // 兜底方案：如果找不到，就在整个纯文本里找
 const fullText = doc.textBetween(0, doc.content.size, '\n', '\n');
 if (fullText.includes(original)) {
 const newText = fullText.replace(original, replacement);
 // 保留原始段落结构，简单替换
 const html = newText.split('\n').filter(Boolean).map(line => `<p>${line.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c] || c))}</p>`).join('');
 if (isEditorViewAlive(editor)) editor.commands.setContent(html);
 forcePersistCurrentEditor({ forceHistory: true });
 }
 }
 };
 window.addEventListener('writerzen:replace-text', handleReplaceText);
 return () => window.removeEventListener('writerzen:replace-text', handleReplaceText);
 }, [findLiveRangeByReviewAnnotation, forcePersistCurrentEditor]);

 const editor = useEditor({
 shouldRerenderOnTransaction: false,
 editable,
 extensions: [
 StarterKit.configure({ horizontalRule: false }), CustomDivider, Underline,
 Placeholder.configure({ placeholder: '开始写作...' }),
 CharacterHighlightMark, SearchHighlightMark, ReviewDiffMark, DiffWidgetNode
 ],
 content: ensureChapterHeading(chapter.content || '<p></p>', chapter.title),
 editorProps: {
 attributes: {
 class: `focus:outline-none ${editorPaddingClass} text-[var(--text-primary)]`,
 style: [
 `font-family: ${tFontStyle}`, `font-weight: ${tFontWeight}`,
 `font-size: ${tFontSize}px`, `line-height: ${tLineHeight}`,
             `min-height: ${editorMinHeight}`, `color: ${tFontColor}`,
             `filter: brightness(${tTextBrightness})`,
             layout === 'split' ? 'padding-top: 24px' : 'padding-top: 64px',
             layout === 'split' ? 'padding-bottom: 24px' : 'padding-bottom: 64px',
             'padding-left: 2em',
                          'padding-right: 2em'
 ].filter(Boolean).join('; ')
 },
 // 粘贴清洗：只做轻量去壳，绝不接管粘贴事务。
 // 旧实现把 div 全改成 p、无标签就包 <p>，会把段中粘贴/系统剪贴板整段弄坏，表现为「不能粘贴」。
 transformPastedHTML(html: string) {
  return String(html || '')
   .replace(/\r\n/g, '\n')
   .replace(/<!--[\s\S]*?-->/g, '')
   // 去掉 Word/WPS 字体壳，保留内部文字与原有块结构
   .replace(/<\/?(?:span|font|o:p)(?:\s[^>]*)?>/gi, '')
   .replace(/\sstyle="[^"]*"/gi, '')
   .replace(/\sclass="Mso[^"]*"/gi, '');
 },
 transformPastedText(text: string) {
  // 纯文本：只统一换行，拆段交给 ProseMirror 默认逻辑
  return String(text || '').replace(/\r\n/g, '\n');
 },
 // 仅当光标/选区碰到章节标题时，把选区夹到正文后再走默认粘贴。
 // 禁止 preventDefault + 手写 insert（失败会吞掉整次粘贴）。
 handlePaste: (view) => {
  try {
   const { selection, doc } = view.state;
   const firstNode = doc.firstChild;
   if (!firstNode || firstNode.type.name !== 'heading') return false;
   const headingEnd = firstNode.nodeSize;
   if (headingEnd <= 1) return false;
   const selFrom = Math.min(selection.from, selection.to);
   const selTo = Math.max(selection.from, selection.to);
   // 已在正文：完全放行默认粘贴
   if (selFrom >= headingEnd) return false;
   // 碰到标题：选区夹到标题后（正文起点），绝不 preventDefault
   const from = Math.min(headingEnd, doc.content.size);
   const to = Math.min(Math.max(headingEnd, selTo), doc.content.size);
   const $from = doc.resolve(from);
   const $to = doc.resolve(to);
   view.dispatch(view.state.tr.setSelection(new TextSelection($from, $to)));
   return false;
  } catch {
   return false;
  }
 },
 handleKeyDown: (view, event) => {
 try {
 const { selection, doc } = view.state;
 const $from = selection.$from;
 const firstNode = doc.firstChild;
 const isInFirstNode = firstNode && $from.pos <= firstNode.nodeSize;
 if ((event.key === 'Backspace' || event.key === 'Delete') && isPendingOptimizationRef.current) {
 clearPendingOptimizationState();
 }
 if ((event.key === 'Backspace' || event.key === 'Delete') && !selection.empty) {
 const headingEnd = firstNode?.type.name === 'heading' ? firstNode.nodeSize : 0;
 const selFrom = Math.min(selection.from, selection.to);
 const selTo = Math.max(selection.from, selection.to);
 // 选区跨越标题和正文：只删正文部分，标题不动
 if (headingEnd > 0 && selFrom < headingEnd && selTo > headingEnd) {
 event.preventDefault();
 view.dispatch(view.state.tr.delete(headingEnd, selTo));
 view.focus();
 return true;
 }
 // 选区完全在正文：明确放行（含 Ctrl+A 后由上面分支处理）
 // 选区完全在标题内：放行字符级删除
 } else if (event.key === 'Backspace' && isInFirstNode && $from.parentOffset === 0 && selection.empty) {
 event.preventDefault(); return true;
 } else if (event.key === 'Delete' && isInFirstNode && $from.parentOffset === $from.parent.content.size && selection.empty) {
 event.preventDefault(); return true;
 }
 if (event.key === 'Enter' && !event.shiftKey && isInFirstNode) {
 event.preventDefault();
 view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, Math.min(firstNode.nodeSize + 1, doc.content.size))));
 view.focus();
 return true;
 }
 const currentParagraphRawText = String($from.parent?.textContent || '');
 const currentParagraphEffectiveLen = currentParagraphRawText.replace(/\s+/g, '').length;
 const isValidEnterArm = enableInlineAnalysis && event.key === 'Enter' && !event.shiftKey && !isInFirstNode &&
 selection.empty && $from.parent.type.name === 'paragraph' &&
 $from.parentOffset === $from.parent.content.size &&
 currentParagraphEffectiveLen >= 2 && !hasNonEmptyParagraphAfter(view.state);
 if (isValidEnterArm) {
 setPendingOptimizationState(snapshotParagraphFromState(view.state as any));
 } else if (isPendingOptimizationRef.current) {
 if (event.isComposing || event.key === 'Process') return false;
 const cancelKeys = new Set(['Backspace','Delete','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Escape','Home','End','PageUp','PageDown']);
 if (cancelKeys.has(event.key) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() !== 'v')) {
 clearPendingOptimizationState();
 }
 } else if (event.key !== 'Unidentified') {
 clearPendingOptimizationState();
 }
 if ((event.key === 'Backspace') && selection.empty && $from.parentOffset === 0 && firstNode?.type.name === 'heading' && $from.index(0) === 1) {
 event.preventDefault(); return true;
 }
 return false;
 } catch { return false; }
 }
 },
 onUpdate: ({ editor: ed }) => { editorInstanceRef.current = ed as Editor; },
 onCreate: ({ editor: ed }) => { editorInstanceRef.current = ed as Editor; },
 onSelectionUpdate: ({ editor: ed }) => {
 // 记录最后一次有效光标，焦点跳走后转入正文时仍能定位到这里
 const sel = (ed as Editor).state.selection;
 lastSelectionRef.current = { from: sel.from, to: sel.to };
 // 专注模式打字机效果：光标行居中
 if (useAppStore.getState().focusMode) {
 requestAnimationFrame(() => {
 if (!isEditorViewAlive(ed as Editor)) return;
 const coords = (ed as Editor).view.coordsAtPos(sel.from);
 const editorEl = (ed as Editor).view.dom.closest('.wz-editor-shell');
 if (coords && editorEl) {
 const rect = editorEl.getBoundingClientRect();
 const cursorY = coords.top - rect.top + editorEl.scrollTop;
 const targetScroll = cursorY - rect.height / 2;
 editorEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
 }
 });
 }
 },
 onDestroy: () => { editorInstanceRef.current = null; }
 });

 // 工坊生成中：只读锁定当前章，防止与 setChapterContent 竞态
 useEffect(() => {
 if (!editor) return;
 editor.setEditable(editable !== false);
 }, [editor, editable]);

 useEffect(() => {
 editorInstanceRef.current = editor;
 if (!editor) return;
 const handler = (e: Event) => {
 const html = (e as CustomEvent).detail as string;
 const ed = editorInstanceRef.current;
  if (html && isEditorViewAlive(ed)) {
  isRestoringRef.current = true;
  ed.commands.setContent(html, true);
  if (isEditorViewAlive(ed)) {
   ed.view.dispatch(ed.state.tr);
   requestAnimationFrame(() => {
    if (isEditorViewAlive(ed)) ed.view.updateState(ed.state);
   });
  }
  ed.view.focus();
  // BUG-02 fix: 保存完成后再清除标志，防止 chapter.content 更新时用旧数据覆写
  void flushQueuedSaveRef.current({ forceHistory: true, html: ed.getHTML() }).finally(() => {
  isRestoringRef.current = false;
  });
  }
 };
 const forceSaveHandler = () => {
 const ed = editorInstanceRef.current;
 const finish = () => {
  try {
   window.dispatchEvent(new CustomEvent('writerzen:force-save-done'));
  } catch { /* ignore */ }
 };
 if (!isEditorViewAlive(ed)) {
  finish();
  return;
 }
 // 必须 await 落盘，否则云同步打包会漏掉「当前正在写的最新章」.html
 void (async () => {
  try {
   await flushQueuedSaveRef.current({ forceHistory: true, html: ed.getHTML() });
   try {
    const { flushChapterMetaDisk } = await import('../../store/useBookStore');
    await flushChapterMetaDisk();
   } catch { /* ignore */ }
  } finally {
   finish();
  }
 })();
 };
 const insertAtCursorHandler = (e: Event) => {
 const detail = (e as CustomEvent).detail as { text?: string } | undefined;
 const text = (detail?.text || '').trim();
 const ed = editorInstanceRef.current;
 if (!text || !isEditorViewAlive(ed)) return;

 // 1) 解析光标位置：优先用 lastSelectionRef（用户最后一次在编辑器里的位置），失效则用文档末尾
 const docSize = ed.state.doc.content.size;
 // 跳过首段（章节标题 H1），保护标题不被覆盖
 const firstNodeSize = ed.state.doc.firstChild ? ed.state.doc.firstChild.nodeSize : 1;
 const minPos = firstNodeSize + 1; // 标题之后才允许插入

 let from = lastSelectionRef.current?.from ?? -1;
 let to = lastSelectionRef.current?.to ?? -1;

 // 防御：位置超出文档范围、落在标题里、或没记录 → 用文档末尾
 if (from < 0 || to < 0 || from > docSize || to > docSize || from < minPos) {
 from = docSize;
 to = docSize;
 }

 // 2) 把文本按段落转为 ProseMirror 节点
 const html = text.split(/\n{2,}/).map((para) => {
 const inner = para.split(/\n/).map((line) => line.replace(/[<>&]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c] || c))).join('<br/>');
 return `<p>${inner}</p>`;
 }).join('');

 ed.chain()
 .focus()
 .setTextSelection({ from, to })
 .insertContent(html)
 .run();

 // 4) 更新 lastSelection 到插入后的位置
 const newSel = ed.state.selection;
 lastSelectionRef.current = { from: newSel.from, to: newSel.to };
 };
 window.addEventListener('writerzen:restore-snapshot', handler);
 window.addEventListener('writerzen:force-save-current-editor', forceSaveHandler);
 window.addEventListener('writerzen:insert-at-cursor', insertAtCursorHandler);
 return () => {
 window.removeEventListener('writerzen:restore-snapshot', handler);
 window.removeEventListener('writerzen:force-save-current-editor', forceSaveHandler);
 window.removeEventListener('writerzen:insert-at-cursor', insertAtCursorHandler);
 };
 }, [editor]);

 // 标题保护：不再用 filterTransaction 拦删除（旧逻辑会误拦正文删除，导致「粘贴后删不掉」）。
 // 改为 appendTransaction 事后兜底：保证首节点是 h2，且至少有一段正文可编辑。
 const headingProtectionPlugin = useMemo(() => new Plugin({
 key: HEADING_PROTECTION_PLUGIN_KEY,
 appendTransaction: (transactions, oldState, newState) => {
 try {
 if (!transactions.some((tr) => tr.docChanged)) return null;
 const { doc, schema } = newState;
 if (!doc) return null;

 let tr = newState.tr;
 let modified = false;

 const firstNode = doc.firstChild;
 const headingType = schema.nodes.heading;
 const paragraphType = schema.nodes.paragraph;
 if (!headingType || !paragraphType) return null;

 // 1) 首节点缺失或不是 h2 → 恢复标题（优先沿用旧标题文案）
 if (!firstNode || firstNode.type.name !== 'heading' || firstNode.attrs?.level !== 2) {
  const oldFirst = oldState.doc.firstChild;
  const titleText = String(
   (oldFirst?.type.name === 'heading' ? oldFirst.textContent : '') || '第1章'
  ).trim() || '第1章';
  const headingNode = headingType.create({ level: 2 }, schema.text(titleText));

  if (!firstNode) {
   tr = tr.insert(0, headingNode);
  } else if (firstNode.type.name === 'heading') {
   // 仅 level 不对：改 markup
   tr = tr.setNodeMarkup(0, headingType, { ...firstNode.attrs, level: 2 });
  } else {
   // 首节点被改成段落等：在文档最前插入 h2（不吞掉用户正文）
   tr = tr.insert(0, headingNode);
  }
  modified = true;
 }

 // 2) 仅有标题、没有正文段落 → 补一个空段，保证可继续输入/删除
 const liveDoc = tr.doc;
 const liveFirst = liveDoc.firstChild;
 if (liveFirst && liveDoc.childCount <= 1) {
  tr = tr.insert(liveFirst.nodeSize, paragraphType.create());
  modified = true;
 }

 if (!modified) return null;
 tr.setMeta('addToHistory', false);
 return tr;
 } catch { return null; }
 }
 }), []); // 无外部依赖

 // BUG-03 fix: 内联建议装饰插件
 const inlineSuggestionPlugin = useMemo(() => new Plugin({
 key: INLINE_SUGGESTION_PLUGIN_KEY,
 state: {
 init: () => DecorationSet.empty,
 apply: (tr, old, _oldState, newState) => {
 if (!tr.docChanged && !tr.getMeta(INLINE_SUGGESTION_PLUGIN_KEY)) return old;
 const pending = suggestionsRef.current.filter((item) => item.status === 'pending' && item.chapterId === chapter.id);
 const scanning = scanningParagraphsRef.current.filter((item) => item.chapterId === chapter.id);
 const decorations: Decoration[] = [];
 for (const item of scanning) {
 if (item.from < 1 || item.to > newState.doc.content.size || item.from >= item.to) continue;
 decorations.push(Decoration.inline(item.from, item.to, { class: 'wz-inline-scan-highlight' }));
 }
 for (const item of pending) {
 let liveRange: { from: number; to: number } | null = null;
 if (tr.docChanged) {
 const mappedFrom = tr.mapping.map(item.from, -1);
 const mappedTo = tr.mapping.map(item.to, 1);
 const sf = Math.max(1, Math.min(mappedFrom, newState.doc.content.size));
 const st = Math.max(1, Math.min(mappedTo, newState.doc.content.size));
 if (sf < st) {
 const mappedText = newState.doc.textBetween(sf, st, '\n', '\n');
 if (mappedText === item.original) liveRange = { from: sf, to: st };
 }
 }
 const range = liveRange || findLiveRangeBySuggestion(item, newState.doc);
 if (range) {
 decorations.push(Decoration.inline(range.from, range.to, { class: 'wz-inline-suggestion-highlight', 'data-suggestion-id': item.id } as any));
 }
 }
 return DecorationSet.create(newState.doc, decorations);
 }
 },
 props: {
 decorations(state) { return this.getState(state); }
 }
 }), [chapter.id, findLiveRangeBySuggestion]);

 const reviewAnnotationPlugin = useMemo(() => new Plugin({
 key: REVIEW_ANNOTATION_PLUGIN_KEY,
 state: {
 init: () => DecorationSet.empty,
 apply: (tr, old, _oldState, newState) => {
 if (!tr.docChanged && !tr.getMeta(REVIEW_ANNOTATION_PLUGIN_KEY)) return old;
 const pending = reviewAnnotationsRef.current.filter((item) => item.status === 'pending' && item.original);
 const decorations: Decoration[] = [];
 for (const item of pending) {
 const range = findLiveRangeByReviewAnnotation(item, newState.doc);
 if (!range) continue;
 decorations.push(Decoration.inline(range.from, range.to, {
 class: 'wz-review-annotation-highlight',
 style: `--wz-review-color: ${ISSUE_TYPE_COLOR[item.issueType] || 'var(--accent)'}`,
 'data-review-id': item.id
 } as any));
 }
 return DecorationSet.create(newState.doc, decorations);
 }
 },
 props: {
 decorations(state) { return this.getState(state); }
 }
 }), [chapter.id, findLiveRangeByReviewAnnotation]);

 // BUG-03 fix
 const aiProcessingPlugin = useMemo(() => new Plugin<{ from: number; to: number } | null>({
 key: AI_PROCESSING_DECORATION_KEY,
 state: {
 init: () => null,
 apply: (tr, value) => {
 const meta = tr.getMeta(AI_PROCESSING_DECORATION_KEY) as { from: number; to: number } | null | undefined;
 if (meta !== undefined) return meta && meta.from !== meta.to ? meta : null;
 if (!value) return null;
 if (!tr.docChanged) return value;
 const from = tr.mapping.map(value.from);
 const to = tr.mapping.map(value.to);
 const docSize = tr.doc.content.size;
 const sf = Math.max(1, Math.min(from, docSize));
 const st = Math.max(1, Math.min(to, docSize));
 return sf < st ? { from: sf, to: st } : null;
 }
 },
 props: {
 decorations(state) {
 const range = this.getState(state);
 if (!range) return DecorationSet.empty;
 return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: 'wz-ai-processing-glow' })]);
 }
 }
 }), []);

 // BUG-03 fix
 const lockedSelectionPlugin = useMemo(() => new Plugin<{ from: number; to: number } | null>({
 key: LOCKED_TEXT_SELECTION_PLUGIN_KEY,
 state: {
 init: () => null,
 apply: (tr, value) => {
 const meta = tr.getMeta(LOCKED_TEXT_SELECTION_PLUGIN_KEY);
 if (meta !== undefined) return meta && meta.from !== meta.to ? meta : null;
 if (tr.docChanged) return null;
 if (!value) return null;
 return value;
 }
 },
 props: {
 decorations(state) {
 const range = this.getState(state);
 if (!range) return DecorationSet.empty;
 return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: 'wz-locked-text-selection' })]);
 }
 }
 }), []);

 const searchJumpFocusPlugin = useMemo(() => new Plugin<{ from: number; to: number } | null>({
 key: SEARCH_JUMP_FOCUS_DECORATION_KEY,
 state: {
 init: () => null,
 apply: (tr, value) => {
 const meta = tr.getMeta(SEARCH_JUMP_FOCUS_DECORATION_KEY) as { from: number; to: number } | null | undefined;
 if (meta !== undefined) return meta && meta.from < meta.to ? meta : null;
 if (!value) return null;
 if (!tr.docChanged) return value;
 const from = tr.mapping.map(value.from);
 const to = tr.mapping.map(value.to);
 const docSize = tr.doc.content.size;
 const sf = Math.max(1, Math.min(from, docSize));
 const st = Math.max(1, Math.min(to, docSize));
 return sf < st ? { from: sf, to: st } : null;
 }
 },
 props: {
 decorations(state) {
 const range = this.getState(state);
 if (!range) return DecorationSet.empty;
 try {
 const pos = Math.max(1, Math.min(range.from, state.doc.content.size));
 const $pos = state.doc.resolve(pos);
 for (let depth = $pos.depth; depth > 0; depth -= 1) {
 const node = $pos.node(depth);
 if (node.type.name !== 'paragraph') continue;
 const from = $pos.before(depth);
 return DecorationSet.create(state.doc, [Decoration.node(from, from + node.nodeSize, { class: 'wz-search-jump-focus' })]);
 }
 } catch {
 // Fall back to an inline marker if the position cannot resolve to a block.
 }
 return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: 'wz-search-jump-focus' })]);
 }
 }
 }), []);

 useEffect(() => {
 // 关键守卫：编辑器视图可能已销毁（切章/卸载）。
 // registerPlugin -> view.updateState 会访问 docView.matchesNode，视图销毁后 docView
 // 为 null 会报错（null is not an object）。因此仅在视图存活时注册。
 if (!isEditorViewAlive(editor)) return;
 editor.registerPlugin(headingProtectionPlugin);
 editor.registerPlugin(inlineSuggestionPlugin);
 editor.registerPlugin(reviewAnnotationPlugin);
 editor.registerPlugin(lockedSelectionPlugin);
 editor.registerPlugin(aiProcessingPlugin);
 editor.registerPlugin(searchJumpFocusPlugin);
 return () => {
 // 卸载前再次校验：视图已销毁时无需（也不能安全地）反注册插件。
 if (isEditorViewAlive(editor)) {
  editor.unregisterPlugin(HEADING_PROTECTION_PLUGIN_KEY);
  editor.unregisterPlugin(INLINE_SUGGESTION_PLUGIN_KEY);
  editor.unregisterPlugin(REVIEW_ANNOTATION_PLUGIN_KEY);
  editor.unregisterPlugin(LOCKED_TEXT_SELECTION_PLUGIN_KEY);
  editor.unregisterPlugin(AI_PROCESSING_DECORATION_KEY);
  editor.unregisterPlugin(SEARCH_JUMP_FOCUS_DECORATION_KEY);
 }
 if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
 };
 }, [chapter.id, editor, findLiveRangeBySuggestion, reviewAnnotationPlugin, searchJumpFocusPlugin]);

 const initializedChapterIdRef = useRef<string | null>(null);
 const lastSavedHtmlRef = useRef('');
 const lastLoadedChapterIdRef = useRef<string | null>(null);
 const lastLoadedChapterTitleRef = useRef(chapter.title);
 const saveInFlightRef = useRef(false);
 const saveErrorShownRef = useRef(false);
 const saveRetryCountRef = useRef(0);
 const applyingHighlightRef = useRef(false);
 const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const focusLineElementRef = useRef<HTMLElement | null>(null);
 const onHistoryStateChangeRef = useRef(onHistoryStateChange);
 onHistoryStateChangeRef.current = onHistoryStateChange;
 const onSaveStatusChangeRef = useRef(onSaveStatusChange);
 onSaveStatusChangeRef.current = onSaveStatusChange;

 const isRestoringRef = useRef(false);
 const continuationWindowOpenedRef = useRef(false);

 // 云下载完成后：丢弃排队保存 + 从磁盘重载当前章（禁止用 store 空 content 冲掉）
 useEffect(() => {
 const handler = () => {
 if (saveTimerRef.current) {
 clearTimeout(saveTimerRef.current);
 saveTimerRef.current = null;
 }
 pendingSaveHtmlRef.current = null;
 saveInFlightRef.current = false;
 isRestoringRef.current = true;
 const chapterId = chapter.id;
 if (!bookId || !chapterId || !editor) {
 isRestoringRef.current = false;
 return;
 }
 void (async () => {
 try {
 const {
 useBookStore,
 invalidateChapterContentCache,
 beginCloudDownloadGuard,
 } = await import('../../store/useBookStore');
 beginCloudDownloadGuard(10000);
 invalidateChapterContentCache(bookId, chapterId);
 await useBookStore.getState().loadChapterIntoStore(bookId, chapterId);
 const loaded =
 useBookStore
 .getState()
 .books.find((b) => b.id === bookId)
 ?.chapters.find((c) => c.id === chapterId)?.content || '';
 const html = ensureChapterHeading(loaded || '<p></p>', chapter.title);
 if (isEditorViewAlive(editor)) {
 editor.commands.setContent(html, false);
 }
 initializedChapterIdRef.current = chapterId;
 lastSavedHtmlRef.current = html;
 lastLoadedChapterIdRef.current = chapterId;
 pendingSaveHtmlRef.current = null;
 onSaveStatusChangeRef.current?.('saved');
 } catch (e) {
 console.warn('[TiptapEditor] reload after cloud download failed', e);
 } finally {
 // 稍后再允许 content effect / autosave，避免空 store 回写
 window.setTimeout(() => {
 isRestoringRef.current = false;
 }, 800);
 }
 })();
 };
  window.addEventListener('writerzen:webdav-downloaded', handler);
  return () => window.removeEventListener('writerzen:webdav-downloaded', handler);
  }, [bookId, chapter.id, chapter.title, editor, pendingSaveHtmlRef, saveTimerRef]);

  // 外部写入当前章（Agent 入章/工坊回写）后强制重载，避免编辑器停留在旧正文。
  // 场景：Agent「写入当前章」完成，chapterId 未变，key 不重挂载、content effect 因
  // lastSavedHtmlRef 已等于新值而跳过 → 正文空白/旧内容，切走再切回才正常。这里强制刷新。
  useEffect(() => {
   const handler = async () => {
    if (isRestoringRef.current) return;
    try {
     const {
      useBookStore,
      invalidateChapterContentCache,
     } = await import('../../store/useBookStore');
     isRestoringRef.current = true;
     invalidateChapterContentCache(bookId, chapter.id);
     await useBookStore.getState().loadChapterIntoStore(bookId, chapter.id);
     const loaded =
      useBookStore
       .getState()
       .books.find((b) => b.id === bookId)
       ?.chapters.find((c) => c.id === chapter.id)?.content || '';
     const html = ensureChapterHeading(loaded || '<p></p>', chapter.title);
     if (isEditorViewAlive(editor)) {
      editor.commands.setContent(html, false);
      editor.view.dispatch(editor.state.tr);
      requestAnimationFrame(() => {
       if (isEditorViewAlive(editor)) editor.view.updateState(editor.state);
      });
     }
     lastSavedHtmlRef.current = html;
     pendingSaveHtmlRef.current = null;
     saveInFlightRef.current = false;
     lastLoadedChapterIdRef.current = chapter.id;
     lastLoadedChapterTitleRef.current = chapter.title;
     onSaveStatusChangeRef.current?.('saved');
    } catch { /* ignore */ } finally {
     isRestoringRef.current = false;
    }
   };
   window.addEventListener('writerzen:reload-current-chapter', handler);
   return () => window.removeEventListener('writerzen:reload-current-chapter', handler);
  }, [bookId, chapter.id, chapter.title, editor, pendingSaveHtmlRef, saveTimerRef]);

 useEffect(() => {
 if (!editor) return;
 if (isRestoringRef.current) {
 return;
 }
 // 懒加载：store content 为空不代表磁盘为空。wordCount>0 时禁止用空串 setContent，否则会闪一下又空，并触发 autosave 写坏磁盘。
 const storeEmpty = !String(chapter.content || '').trim();
 const metaWc = Number((chapter as { wordCount?: number }).wordCount || 0);
 if (storeEmpty && metaWc > 0) {
 void (async () => {
 try {
 const { useBookStore } = await import('../../store/useBookStore');
 await useBookStore.getState().loadChapterIntoStore(bookId, chapter.id);
 } catch { /* ignore */ }
 })();
 return;
 }

 const normalizedChapterHtml = ensureChapterHeading(chapter.content || '<p></p>', chapter.title);
 const firstInit = initializedChapterIdRef.current !== chapter.id;
  if (firstInit) {
   const current = editor.getHTML();
   if (current !== normalizedChapterHtml && isEditorViewAlive(editor)) {
    // 只在文本真的不同时才重设内容（HTML 结构差异不算变化）
    const editorText = normalizeContentText(editor.getText());
    const storeText = normalizeContentText(chapter.content);
    if (editorText !== storeText) {
     editor.commands.setContent(normalizedChapterHtml, false);
     if (isEditorViewAlive(editor)) {
      editor.view.dispatch(editor.state.tr);
      // 强制 ProseMirror 在下一帧重新绘制 DOM，避免「内容在 state 里但界面空白」
      requestAnimationFrame(() => {
       if (isEditorViewAlive(editor)) editor.view.updateState(editor.state);
      });
     }
    }
   }

		initializedChapterIdRef.current = chapter.id;
		pendingSaveHtmlRef.current = null;
		saveInFlightRef.current = false;
		lastSavedHtmlRef.current = normalizedChapterHtml;
		lastLoadedChapterIdRef.current = chapter.id;
		lastLoadedChapterTitleRef.current = chapter.title;
		saveErrorShownRef.current = false;
		onSaveStatusChange?.('saved');
		requestAnimationFrame(() => {
			if (!isEditorViewAlive(editor)) return;
			const doc = editor.state.doc;
			const firstNodeSize = doc.firstChild ? doc.firstChild.nodeSize : 0;
			const targetPos = Math.min(firstNodeSize + 1, doc.content.size);
			if (!isEditorViewAlive(editor)) return;
			editor.commands.setTextSelection(targetPos);
			editor.view.focus();
		});
 } else {
 if (normalizedChapterHtml === lastSavedHtmlRef.current) return;
 // 保存进行中：禁止 store 回灌，否则会把「刚删空、尚未 lastSaved」的编辑器盖回旧正文
 if (saveInFlightRef.current || pendingSaveHtmlRef.current) {
 return;
 }
 // 禁止用更「空」的外部 content 覆盖编辑器里已有正文
 const editorPlain = String(editor.getHTML() || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
 const nextPlain = String(normalizedChapterHtml || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
 if (nextPlain < 40 && editorPlain > 80) {
 return;
 }
 // 禁止用 store 里仍很长的旧 content 盖掉用户已清空的编辑器
 // （删空后 400ms 内 store 尚未更新时，wordCount/title 等其它依赖触发 effect 会误恢复）
 if (editorPlain < 40 && nextPlain > 80) {
 return;
 }
  const currentEditorHtml = ensureChapterHeading(editor.getHTML(), chapter.title);
  if (currentEditorHtml !== normalizedChapterHtml) {
   // Only sync when text content actually differs (ignore HTML structure drift)
   const editorText = normalizeContentText(editor.getText());
   const storeText = normalizeContentText(chapter.content);
   if (editorText !== storeText) {
   if (isEditorViewAlive(editor)) {
   const scrollParents: { node: HTMLElement; scrollTop: number }[] = [];
   let node = editor.view.dom.parentElement;
   while (node) {
    if (node.scrollTop > 0) scrollParents.push({ node, scrollTop: node.scrollTop });
    node = node.parentElement;
   }
  editor.commands.setContent(normalizedChapterHtml, false);
   if (isEditorViewAlive(editor)) {
    editor.view.dispatch(editor.state.tr);
    requestAnimationFrame(() => {
     if (isEditorViewAlive(editor)) editor.view.updateState(editor.state);
    });
   }
   scrollParents.forEach(({ node, scrollTop }) => { node.scrollTop = scrollTop; });
   }
   }
  }

 if (!saveInFlightRef.current && !pendingSaveHtmlRef.current) {
 lastSavedHtmlRef.current = normalizedChapterHtml;
 onSaveStatusChange?.('saved');
 }
 }
 lastLoadedChapterTitleRef.current = chapter.title;
 }, [bookId, chapter.id, chapter.content, chapter.title, chapter.wordCount, editor, onSaveStatusChange]);

 useEffect(() => {
 if (!editor || !pendingSearchJump) return;
 if (pendingSearchJump.chapterId !== chapter.id) return;
  const timer = window.setTimeout(() => {
  if (!isEditorViewAlive(editor)) return;
  const { doc } = editor.state;
  const docSize = doc.content.size;
  const docText = doc.textBetween(0, docSize, '\n', '\n');
  const targetText = String(pendingSearchJump.text || '').trim();

  // 优先用匹配文本在文档中精确定位，避免 htmlToPlainWithBreaks 与
  // doc.textBetween 文本表示不一致（&nbsp;、换行合并、标题等）导致的偏移错位。
  let from = -1;
  let to = -1;
  if (targetText) {
  // 1) 先用命中前后的锚点区分同一段落内的多个相同字。
  // 仅用段落上下文会永远落到该段的第一个“我/的/他”。
  const normalizeAnchor = (value: string) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  const before = normalizeAnchor(String(pendingSearchJump.before || ''));
  const after = normalizeAnchor(String(pendingSearchJump.after || ''));
  if (before || after) {
  let bestStart = -1;
  let bestScore = -1;
  let searchFrom = 0;
  while (searchFrom <= docText.length) {
  const candidate = docText.indexOf(targetText, searchFrom);
  if (candidate < 0) break;
  const candidateBefore = normalizeAnchor(docText.slice(Math.max(0, candidate - before.length), candidate));
  const candidateAfter = normalizeAnchor(docText.slice(candidate + targetText.length, candidate + targetText.length + after.length));
  let score = 0;
  if (before) {
  let i = 1;
  while (i <= Math.min(before.length, candidateBefore.length) && before[before.length - i] === candidateBefore[candidateBefore.length - i]) i += 1;
  score += i - 1;
  }
  if (after) {
  let i = 0;
  while (i < Math.min(after.length, candidateAfter.length) && after[i] === candidateAfter[i]) i += 1;
  score += i;
  }
  if (score > bestScore) { bestScore = score; bestStart = candidate; }
  searchFrom = candidate + Math.max(1, targetText.length);
  }
  if (bestStart >= 0 && bestScore > 0) {
  from = getPosFromTextOffset(doc, bestStart);
  to = getPosFromTextOffset(doc, bestStart + targetText.length);
  }
  }

  // 2) 若锚点无法匹配，再用段落上下文定位。
  const context = String(pendingSearchJump.context || '').trim();
  if (from < 0 && context) {
  const ctxCandidates: Array<{ para: string; paraStart: number }> = [];
  const paras = docText.split('\n');
  let acc = 0;
  for (const para of paras) {
  ctxCandidates.push({ para, paraStart: acc });
  acc += para.length + 1;
  }
  // 优先选择包含目标文本、且与上下文相似度最高的段落
  let bestPara = -1;
  let bestSim = -1;
  for (const c of ctxCandidates) {
  if (!c.para.includes(targetText)) continue;
  // 相似度：上下文里去掉省略号与空白后，看是否作为段落的子串或段落作为上下文的子串
  const ctxCore = context.replace(/[…]/g, '').trim();
  const paraCompact = c.para.replace(/\s+/g, ' ').trim();
  const ctxCompact = ctxCore.replace(/\s+/g, ' ').trim();
  let sim = 0;
  if (ctxCompact && paraCompact) {
  if (ctxCompact.includes(paraCompact) || paraCompact.includes(ctxCompact)) sim = 1;
  }
  // 兜底：按字符交集评估相似度
  if (sim < 1 && ctxCompact && paraCompact) {
  const maxLen = Math.max(ctxCompact.length, paraCompact.length);
  let common = 0;
  const short = ctxCompact.length <= paraCompact.length ? ctxCompact : paraCompact;
  const long = short === ctxCompact ? paraCompact : ctxCompact;
  let k = 0;
  for (let i = 0; i < short.length && k < long.length; i++) {
  const idx = long.indexOf(short[i], k);
  if (idx >= 0) { common++; k = idx + 1; }
  }
  sim = maxLen > 0 ? common / maxLen : 0;
  }
  if (sim > bestSim) { bestSim = sim; bestPara = ctxCandidates.indexOf(c); }
  }
  if (bestPara >= 0) {
  const paraStart = ctxCandidates[bestPara].paraStart;
  const inPara = paraStart + ctxCandidates[bestPara].para.indexOf(targetText);
  from = getPosFromTextOffset(doc, inPara);
  to = getPosFromTextOffset(doc, inPara + targetText.length);
  }
  }

  // 3) 兜底：若上下文匹配失败，取文档中所有出现位置，选与偏移最接近的
  if (from < 0) {
  let bestTextStart = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let searchFrom = 0;
  while (searchFrom <= docText.length) {
  const textStart = docText.indexOf(targetText, searchFrom);
  if (textStart < 0) break;
  const distance = Math.abs(textStart - pendingSearchJump.from);
  if (distance < bestDistance) {
  bestTextStart = textStart;
  bestDistance = distance;
  }
  searchFrom = textStart + Math.max(1, targetText.length);
  }
  if (bestTextStart >= 0) {
  from = getPosFromTextOffset(doc, bestTextStart);
  to = getPosFromTextOffset(doc, bestTextStart + targetText.length);
  }
  }
  }

  // 4) 无可用定位信息时回退到偏移映射
  if (from < 0) {
  from = pendingSearchJump.positionKind === 'text'
  ? getPosFromTextOffset(doc, pendingSearchJump.from)
  : pendingSearchJump.from;
  to = pendingSearchJump.positionKind === 'text'
  ? getPosFromTextOffset(doc, pendingSearchJump.to)
  : pendingSearchJump.to;
  }

 const safeFrom = Math.max(1, Math.min(from, docSize));
 const safeTo = Math.max(safeFrom + 1, Math.min(to, docSize));
 const tr = editor.state.tr
 .setSelection(TextSelection.create(doc, safeFrom, safeTo))
 .scrollIntoView()
 .setMeta(SEARCH_JUMP_FOCUS_DECORATION_KEY, { from: safeFrom, to: safeTo })
 .setMeta('addToHistory', false);
 safeDispatch(editor, tr);
 window.requestAnimationFrame(() => {
 const shell = shellRef.current;
 if (!shell || !isEditorViewAlive(editor)) return;
 const focusedBlock = shell.querySelector<HTMLElement>('.wz-search-jump-focus');
 if (focusedBlock) {
 focusedBlock.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
 return;
 }

 if (!isEditorViewAlive(editor)) return;
 const coords = editor.view.coordsAtPos(safeFrom);
 const shellRect = shell.getBoundingClientRect();
 const targetTop = shell.scrollTop + coords.top - shellRect.top - shell.clientHeight / 2;
 shell.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
 });
 if (isEditorViewAlive(editor)) editor.view.focus();
 setPendingSearchJump(null);

 window.setTimeout(() => {
 if (isEditorViewAlive(editor)) {
 const clearTr = editor.state.tr
 .setMeta(SEARCH_JUMP_FOCUS_DECORATION_KEY, null)
 .setMeta('addToHistory', false);
 safeDispatch(editor, clearTr);
 }
 }, 3200);
 }, 30);
 return () => window.clearTimeout(timer);
 }, [chapter.id, chapter.content, editor, pendingSearchJump, setPendingSearchJump]);

 const { requestGuidedContinuation: requestContinuation, acceptContinuation, pendingContinuation, setPendingContinuation } = useContinuationFlow({
 editor: editor as any, bookId, chapterId: chapter.id, island: island as any, setShowGuidedModal, setGuidedInitialValue,
 forcePersistCurrentEditor: forcePersistCurrentEditor as any, restoreEditorFocus: () => {}
 });

 // Agent 模式下的编辑器 AI 功能
 const editorAgentMode = useEditorAgentMode({
 book,
 chapter,
 editorInstanceRef,
 handleInlineAiResult,
 forcePersistCurrentEditor: forcePersistCurrentEditor as any
 });

 // 续写走 useContinuationFlow 通道（结果在独立窗口分段展示）
 const handleGuidedContinuation = useCallback(async (instruction: string, supplement?: string) => {
 await requestContinuation(instruction, supplement);
 }, [requestContinuation]);

 useEffect(() => {
  // 只在「从无到有」时打开续写窗口；子窗口编辑回传（更新 paragraphs/selected）不重开，
  // 避免「子窗编辑→父级 setState→重开窗口」的反馈循环
  if (!pendingContinuation) {
   continuationWindowOpenedRef.current = false;
   return;
  }
  if (continuationWindowOpenedRef.current) return;
  continuationWindowOpenedRef.current = true;
  void electronAPI.system.openContinuationWindow({
  source: 'guided',
  bookId,
  chapterId: chapter.id,
  insertFrom: pendingContinuation.from,
  title: pendingContinuation.title,
  elapsedMs: pendingContinuation.elapsedMs,
  paragraphs: pendingContinuation.paragraphs,
  selected: pendingContinuation.selected,
  editingIndex: pendingContinuation.editingIndex,
  retryRequest: pendingContinuation.retryRequest
  });
  }, [bookId, chapter.id, pendingContinuation]);

 useEffect(() => {
 const off = electronAPI.system.onContinuationWindowAction((payload: any) => {
 const action = String(payload?.action || '');
 const source = String(payload?.source || 'guided');
 const insertFrom = Number(payload?.insertFrom);
 const paragraphs = Array.isArray(payload?.paragraphs) ? payload.paragraphs.map((p: unknown) => String(p)) : [];
 const selected = Array.isArray(payload?.selected) ? payload.selected.map((n: unknown) => Number(n)).filter(Number.isFinite) : [];
 const editingIndex = typeof payload?.editingIndex === 'number' ? payload.editingIndex : null;

 if (source === 'guided') {
 setPendingContinuation((prev: any) => {
 if (!prev) return prev;
 return { ...prev, paragraphs, selected, editingIndex };
 });
 }

 if (action === 'discard') {
 if (source === 'guided') setPendingContinuation(null);
 return;
 }
 if (source === 'outline') {
 const picked = (action === 'acceptAll'
 ? paragraphs
 : paragraphs.filter((_: string, index: number) => selected.includes(index))
 ).map((item: string) => item.trim()).filter(Boolean);
 if (picked.length === 0) return;
 const nodes = picked.map((text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] }));
 const editor = editorInstanceRef.current;
 if (!editor) return;
 const basePos = Number.isFinite(insertFrom) ? insertFrom : editor.state.selection.to;
 const pos = Math.min(Math.max(basePos, 1), editor.state.doc.content.size);
 editor.chain().focus().insertContentAt(pos, nodes).run();
 forcePersistCurrentEditor({ forceHistory: true });
 showIsland({ type: 'success', message: '细纲写作内容已采纳', autoHideMs: 1400 });
 return;
 }
 // guided 模式：直接用传过来的 paragraphs（包含用户编辑后的内容），不依赖 pendingContinuation state
 if (source === 'guided') {
 const picked = (action === 'acceptAll'
 ? paragraphs
 : paragraphs.filter((_: string, index: number) => selected.includes(index))
 ).map((item: string) => item.trim()).filter(Boolean);
 if (picked.length === 0) return;
 const nodes = picked.map((text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] }));
 const editor = editorInstanceRef.current;
 if (!editor) return;
 const pendingFrom = pendingContinuation?.from;
 const basePos = Number.isFinite(insertFrom) ? insertFrom : (Number.isFinite(pendingFrom) ? pendingFrom! : editor.state.selection.to);
 const pos = Math.min(Math.max(basePos, 1), editor.state.doc.content.size);
 editor.chain().focus().insertContentAt(pos, nodes).run();
 forcePersistCurrentEditor({ forceHistory: true });
 setPendingContinuation(null);
 showIsland({ type: 'success', message: '续写内容已采纳', autoHideMs: 1400 });
 return;
 }
 });
 return off;
 }, [acceptContinuation, setPendingContinuation]);

 useEditorBridgeSync({
 chapterId: chapter.id, chapterTitle: chapter.title, editor, quickFormatSignal,
 quickFormatSignalRef, // BUG-01 fix: 使用顶部声明的稳定 ref
 onHistoryActionBind, onHistoryStateChange,
 registerEditor: enableEditorBridge ? registerEditor : () => {},
 unregisterEditor: enableEditorBridge ? unregisterEditor : () => {},
 forcePersistCurrentEditor, showIsland, escapeHtml, onAiResult: handleInlineAiResult
 });

 // BUG-04 fix: 所有成员均为 useRef 创建的稳定引用，空依赖数组安全
  const stableTransactionRefs = useMemo(() => ({
  flushQueuedSaveRef, pendingSaveHtmlRef, saveInFlightRef, saveTimerRef, saveErrorShownRef, saveRetryCountRef,
  lastSavedHtmlRef, chapterTitleRef: lastLoadedChapterTitleRef,
 onUserActivityRef, onSaveStatusChangeRef, onHistoryStateChangeRef,
 applyingHighlightRef, highlightTimerRef, focusLineElementRef,
 scanTimerRef, isPendingOptimizationRef, expectedNewParagraphKeyRef,
 pendingTypedCharsRef, pendingPreviousParagraphRef, lastSelectionParagraphRef,
 }), []);

 useEditorTransactionFlow({
 bookId, chapterId: chapter.id, chapterTitle: chapter.title, editor, keywords,
 setChapterContent, showIsland, pushHistorySnapshot, getCurrentParagraphKey,
 transactionInsertedMeaningfulCharCount, applyCharacterHighlights,
 snapshotParagraphFromState, scheduleParagraphScan, clearPendingOptimizationState,
 refs: stableTransactionRefs // BUG-04 fix: 使用稳定引用
 });

 const [suggestionAnchorMap, setSuggestionAnchorMap] = useState<Record<string, { top: number; left: number }>>({});
 const [suggestionSpacerHeight, setSuggestionSpacerHeight] = useState(0);
 const suggestionCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
 const resolveSuggestionLine = (item: InlineSuggestion) => ({
 fromText: pickSuggestionField({ original: item.original, suggestion: item.suggestion } as any, ['original', 'suggestion']),
 toText: pickSuggestionField({ original: item.original, suggestion: item.suggestion } as any, ['suggestion', 'original'])
 });

 useInlineSuggestionRailLayout({
 chapterId: chapter.id, editor, shellRef,
 hasSuggestionRail: useMemo(() => inlineSuggestions.filter((s) => s.chapterId === chapter.id && s.status === 'pending').length > 0, [chapter.id, inlineSuggestions]),
 pendingSuggestions: inlineSuggestions.filter((s) => s.chapterId === chapter.id && s.status === 'pending'),
 suggestionCardRefs, findLiveRangeBySuggestion,
 setSuggestionAnchorMap, setSuggestionSpacerHeight,
 viewportLockRef, viewportLockByCodeRef, maybeEnforceViewportLock
 });

 const { contextMenuState, closeContextMenu, capturedSelection } = useEditorContextMenu({ editor: editor as any });

 // Agent 改写通道：右键菜单「AI 润色/AI 重写」在有 Agent 能力时改走 Agent（带文风/craft 体系）。
 // 先把右键时捕获的选区恢复到编辑器 selection（Agent rewrite 从 editor.state.selection 读取），再执行。
 const handleAgentRewrite = useCallback((instruction: string) => {
  const ed = editorInstanceRef.current;
  if (!ed || ed.isDestroyed) return;
  const range = capturedSelection && capturedSelection.from < capturedSelection.to
   ? capturedSelection
   : (ed.state.selection.from < ed.state.selection.to ? { from: ed.state.selection.from, to: ed.state.selection.to } : null);
  if (!range) {
   useIslandStore.getState().show({ type: 'warning', message: '请先选中要改写的文本', autoHideMs: 1500 });
   return;
  }
  const docSize = ed.state.doc.content.size;
  const from = Math.max(1, Math.min(range.from, docSize));
  const to = Math.max(from, Math.min(range.to, docSize));
  if (from < to) {
   ed.chain().focus().setTextSelection({ from, to }).run();
  }
  void editorAgentMode.rewrite(instruction);
 }, [capturedSelection, editorAgentMode]);

 useEffect(() => {
 if (!editor) return;
 const shell = shellRef.current;
 if (!shell) return;

 let dragStartedInEditor = false;
 let dragMoved = false;
 let startX = 0;
 let startY = 0;
 let suppressTrailingClick = false;
 let lastDragSelection: { from: number; to: number } | null = null;

 const isEditorTarget = (target: EventTarget | null) => {
 const element = target instanceof HTMLElement
 ? target
 : target instanceof Text
 ? target.parentElement
 : null;
 return Boolean(element?.closest('.ProseMirror'));
 };

 const captureCurrentSelection = () => {
 if (editor.isDestroyed) return null;
 const { from, to } = editor.state.selection;
 if (from < to) return { from, to };

 const domSelection = window.getSelection();
 if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) return null;
 const { anchorNode, anchorOffset, focusNode, focusOffset } = domSelection;
 if (!anchorNode || !focusNode) return null;
 if (!editor.view.dom.contains(anchorNode) || !editor.view.dom.contains(focusNode)) return null;

 try {
 const anchorPos = editor.view.posAtDOM(anchorNode, anchorOffset);
 const focusPos = editor.view.posAtDOM(focusNode, focusOffset);
 const safeFrom = Math.max(1, Math.min(anchorPos, focusPos));
 const safeTo = Math.min(editor.state.doc.content.size, Math.max(anchorPos, focusPos));
 return safeFrom < safeTo ? { from: safeFrom, to: safeTo } : null;
 } catch {
 return null;
 }
 };

 const restoreLastDragSelection = (range = lastDragSelection) => {
 if (!range || !isEditorViewAlive(editor)) return;
 const { from, to } = range;
 const max = editor.state.doc.content.size;
 if (from < 0 || to > max || from >= to) return;
 safeDispatch(editor,
 editor.state.tr
 .setSelection(TextSelection.create(editor.state.doc, from, to))
 .setMeta('addToHistory', false)
 );
 };

 const handleMouseDown = (event: MouseEvent) => {
 if (event.button !== 0) return;
 dragStartedInEditor = isEditorTarget(event.target);
 dragMoved = false;
 suppressTrailingClick = false;
 startX = event.clientX;
 startY = event.clientY;
 if (!dragStartedInEditor) lastDragSelection = null;
 };

 const handleMouseMove = (event: MouseEvent) => {
 if (!dragStartedInEditor || (event.buttons & 1) !== 1) return;
 if (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) {
 dragMoved = true;
 suppressTrailingClick = true;
 // 安全网：500ms 后自动重置，防止状态泄漏导致编辑器无法点击
 setTimeout(() => { suppressTrailingClick = false; }, 500);
 }
 };

 const handleMouseUp = () => {
 if (!dragStartedInEditor || !dragMoved) {
 dragStartedInEditor = false;
 dragMoved = false;
 suppressTrailingClick = false;
 return;
 }

 lastDragSelection = captureCurrentSelection();

 dragStartedInEditor = false;
 dragMoved = false;
 };

 const handleClickCapture = (event: MouseEvent) => {
 if (!suppressTrailingClick) return;
 suppressTrailingClick = false;
 if (!isEditorTarget(event.target)) {
 lastDragSelection = null;
 return;
 }

 // A drag selection is followed by a synthetic click in Chromium. Letting
 // that click reach ProseMirror collapses the real selection immediately.
 event.preventDefault();
 event.stopPropagation();
 requestAnimationFrame(() => {
 const latestRange = captureCurrentSelection() ?? lastDragSelection;
 if (latestRange) {
 lastDragSelection = latestRange;
 restoreLastDragSelection(latestRange);
 }
 });
 };

 shell.addEventListener('mousedown', handleMouseDown, true);
 window.addEventListener('mousemove', handleMouseMove, true);
 window.addEventListener('mouseup', handleMouseUp, true);
 document.addEventListener('click', handleClickCapture, true);

 const handleEditorClick = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 if (target.closest('.wz-review-accept')) {
 const diffId = target.closest('.wz-review-actions')?.getAttribute('data-diff-id');
 if (diffId) window.dispatchEvent(new CustomEvent('writerzen:diff-action', { detail: { action: 'accept', id: diffId } }));
 } else if (target.closest('.wz-review-reject')) {
 const diffId = target.closest('.wz-review-actions')?.getAttribute('data-diff-id');
 if (diffId) window.dispatchEvent(new CustomEvent('writerzen:diff-action', { detail: { action: 'reject', id: diffId } }));
 }
 };
 editor.view.dom.addEventListener('click', handleEditorClick);

 return () => {
 shell.removeEventListener('mousedown', handleMouseDown, true);
 shell.removeEventListener('mousemove', handleMouseMove, true);
 shell.removeEventListener('mouseup', handleMouseUp, true);
 document.removeEventListener('click', handleClickCapture, true);
 editor.view.dom.removeEventListener('click', handleEditorClick);
 };
 }, [chapter.id, editor]);

 const buildCharacterHoverCard = useCallback(
 (name: string) =>
 createCharacterTooltipElement({
 name,
 roleLookup,
 cleanText: cleanCharacterTooltipText,
 escapeHtml
 }),
 [roleLookup]
 );

 useCharacterHoverCard({
 editor,
 buildCard: buildCharacterHoverCard
 });
 const pendingSuggestions = useMemo(
 () => inlineSuggestions.filter((item) => item.chapterId === chapter.id && item.status === 'pending'),
 [chapter.id, inlineSuggestions]
 );
 const hasSuggestionRail = pendingSuggestions.length > 0;

 return (
 <div
 ref={shellRef}
 className={`wz-editor-focus wz-grid-line-${config?.ui.editorGridLine ?? 'none'} relative h-full overflow-auto bg-[var(--editor-paper-bg)] ${layout === 'split' ? 'wz-editor-focus-split' : ''} ${hasSuggestionRail ? 'wz-inline-suggestion-rail-open' : ''} ${focusModeActive ? 'wz-focus-mode' : ''}`}
 style={{
   '--editor-line-height': tLineHeight,
   '--editor-font-size': `${tFontSize}px`
 } as React.CSSProperties}
 >
 <EditorContent editor={editor} />
 {hasSuggestionRail ? (
 <aside className="wz-inline-suggestion-rail">
 {pendingSuggestions.map((item) => (
 <div key={item.id} ref={(node) => { suggestionCardRefs.current[item.id] = node; }}
 data-guide-target="inline-suggestion-card"
 className="wz-inline-suggestion-card"
 style={{ '--wz-sug-color': item.color, top: `${suggestionAnchorMap[item.id]?.top ?? 20}px`, left: `${suggestionAnchorMap[item.id]?.left ?? 20}px` } as React.CSSProperties}>
 <div className="wz-inline-suggestion-kind">{item.kind === 'wording' ? '用词建议' : item.kind === 'order' ? '语序建议' : '描写建议'}</div>
 <div className="wz-inline-suggestion-line">
 <span className="wz-inline-suggestion-from">{resolveSuggestionLine(item).fromText}</span>
 <span className="wz-inline-suggestion-arrow">→</span>
 <span className="wz-inline-suggestion-to">{resolveSuggestionLine(item).toText}</span>
 </div>
 <div className="wz-inline-suggestion-reason">{item.reason}</div>
 <div className="mt-2 flex gap-2">
 <button className="wz-inline-suggestion-btn-primary"onClick={() => applySuggestion(item.id)}>一键替换</button>
 <button className="wz-inline-suggestion-btn-ghost"onClick={() => dismissSuggestion(item.id)}>忽略</button>
 </div>
 </div>
 ))}
 <div style={{ height: `${suggestionSpacerHeight}px` }} />
 </aside>
 ) : null}
 {findReplaceOpen ? (
 <FindReplacePanel {...{ editor, book, chapterId: chapter.id, onClose: () => setFindReplaceOpen(false) } as any} />
 ) : null}
 {cardAnchorPos && aiDiffAnalysis ? (
 <DiffCard {...{ diffAnalysis: aiDiffAnalysis, anchorPos: cardAnchorPos,
 onClose: () => { setAiDiffAnalysis(null); setCardAnchorPos(null); clearDiffCardPosition(); editor?.view.focus(); } } as any} />
 ) : null}
 {contextMenuState ? (
 <EditorContextMenu
 editor={editor} book={book} chapter={chapter} hardConstraints={hardConstraints}
 x={contextMenuState.x} y={contextMenuState.y} onClose={closeContextMenu}
 lockedRange={null} capturedSelection={capturedSelection}
 onSelectionProcessing={(range) => {
 if (!editor) return;
 if (!isEditorViewAlive(editor)) return;
 const tr = editor.state.tr.setMeta(AI_PROCESSING_DECORATION_KEY, range);
 tr.setMeta('addToHistory', false); safeDispatch(editor, tr);
 }}
  onAiResult={(range, text) => handleInlineAiResult(range, text)}
  onAgentRewrite={handleAgentRewrite}
  />
 ) : null}
 <GuidedContinuationModal open={showGuidedModal} initialValue={guidedInitialValue}
 onClose={() => setShowGuidedModal(false)} onSubmit={handleGuidedContinuation} />
 <OutlineWizard open={forceOutlineWizardOpen} chapter={chapter} book={book} onWriteOutline={() => {}} onDismiss={() => onOutlineWizardClose?.()} />

 </div>
 );
}
