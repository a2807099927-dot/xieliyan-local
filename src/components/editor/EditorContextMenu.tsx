// 模块说明：编辑器右键菜单组件。
// 关键职责：聚合 AI 续写/改写/根据上下文写作等操作入口。
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useIsland } from '../common/Island';
import type { Book, Chapter } from '../../types';
import { useConfigStore } from '../../store/useConfigStore';
import { useBookStore } from '../../store/useBookStore';
import { requireFeatureAccess, requireLogin } from '../../utils/featureCheck';
import { resolveStyleForBook } from '../../utils/styleResolver';
import { BUILTIN_STYLE_PRESET_META } from '../../ai/stylePresetCatalog';
import { estimateTextTokens } from '../../ai/adapters/helpers';
import { electronAPI, safeConfirm } from '../../utils/electron';
import { getPromptSync } from '../../utils/promptStore';
import { buildSmartOrganizeRules, createChapterMemoryFromAnalysis, prepareChapterTextForOrganization } from '../modals/memory-bank/memoryBankLogic';
import { parseJsonLoosely } from '../../utils/jsonParse';
import { stripHtml } from '../modals/memory-bank/utils';
import { htmlToPlainWithBreaks } from '../../Agent/localSearch';
import { toSafeParagraphNodes } from '../../utils/editorUtils';
import {
  buildOutlineWritingContext,
  buildOutlineWritingSystemPrompt,
  getChapterOutlineText
} from '../../Agent/outlineWritingContext';
import { buildStoryCanonBlock } from '../../Agent/storyCanonCards';
import { splitAgentOutput } from '../../Agent/stripAgentOutput';
import { normalizeChinesePunctuation } from '../../Agent/useAgentSession';

interface EditorContextMenuProps {
 editor: Editor | null;
 book: Book;
 chapter: Chapter;
 hardConstraints?: {
 goal: string;
 tone: string;
 constraints: string;
 };
 x: number;
 y: number;
 onClose: () => void;
 lockedRange?: { from: number; to: number } | null;
 capturedSelection?: { from: number; to: number } | null;
 onSelectionProcessing?: (range: { from: number; to: number } | null) => void;
 onAiResult?: (range: { from: number; to: number }, text: string) => void;
 /** Agent 模式下的改写回调，存在时润色/改写走 Agent 通道 */
 onAgentRewrite?: (instruction: string) => void;
}

interface LockedSelection {
 from: number;
 to: number;
 text: string;
}

type ReviewMode = 'replace' | 'insert';
type Mode = 'menu' | 'loading' | 'review' | 'context';

const TOKEN_LEVEL_HIGH = 8000;
const TOKEN_LEVEL_VERY_HIGH = 20000;

import { normalizeEscapedNewlines, normalizeNovelOutput, normalizeAiErrorMessage } from '../../utils/editorUtils';

function readCssRgb(varName: string): [number, number, number] | null {
 if (typeof window === 'undefined') return null;
 const raw = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
 const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
 const rgb = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
 if (hex) {
 const full = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex;
 return [Number.parseInt(full.slice(0, 2), 16), Number.parseInt(full.slice(2, 4), 16), Number.parseInt(full.slice(4, 6), 16)];
 }
 if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
 return null;
}

function getRgbLuminance(channel: [number, number, number]): number {
 const [r, g, b] = channel.map((value) => value / 255);
 return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resolveReadableMenuTone(theme: string): 'light' | 'dark' {
 // 与原架构（Electron）保持一致：菜单默认深色（与主项目深色 UI 配色统一）
 // 仅当主题显式为浅色时切换到 light。
 const knownLightThemes = ['light', 'parchment', 'forest', 'ivory', 'warm', 'paper', 'cream'];
 if (knownLightThemes.includes(theme)) return 'light';

 // dataset/dataAttribute 主题名同样判定
 if (typeof document !== 'undefined') {
 const dataTheme = document.documentElement.getAttribute('data-theme') || '';
 if (knownLightThemes.includes(dataTheme)) return 'light';
 }

  // 其他一切情况（包括 dark/immersive/blue/custom/auto/未知）一律深色，
 // 避免 readCssRgb 在 :root.wz-has-wallpaper 嵌套 var() 解析失败时误判成 light。
 return 'dark';
}

async function writeTextToClipboard(text: string): Promise<boolean> {
 if (!text) return false;

 try {
 if (navigator.clipboard?.writeText) {
 await navigator.clipboard.writeText(text);
 return true;
 }
 } catch {
 // WebView2/Tauri can reject Clipboard API depending on focus/permission.
 }

 try {
 const textarea = document.createElement('textarea');
 textarea.value = text;
 textarea.setAttribute('readonly', '');
 textarea.style.position = 'fixed';
 textarea.style.left = '-9999px';
 textarea.style.top = '0';
 textarea.style.opacity = '0';
 document.body.appendChild(textarea);
 textarea.focus();
 textarea.select();
 const copied = document.execCommand('copy');
 document.body.removeChild(textarea);
 return copied;
 } catch {
 return false;
 }
}

export function EditorContextMenu({ editor, book, chapter, hardConstraints, x, y, onClose, lockedRange, capturedSelection, onSelectionProcessing, onAiResult, onAgentRewrite }: EditorContextMenuProps) {
 const island = useIsland();
 const aiConfig = useConfigStore((state) => state.config?.ai);
 const uiTheme = useConfigStore((state) => state.config?.ui?.theme);

 const [mode, setMode] = useState<Mode>('menu');
 // Deferred init: resolveSelection not available yet at top-level useState.
 const [reviewTitle, setReviewTitle] = useState('');
 const [reviewParagraphs, setReviewParagraphs] = useState<string[]>([]);
 const [reviewSelected, setReviewSelected] = useState<number[]>([]);
 const [reviewMode, setReviewMode] = useState<ReviewMode>('replace');
 const [timeTaken, setTimeTaken] = useState(0);
 const [contextKeyword, setContextKeyword] = useState('');
 const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());
 const [selectedContextModes, setSelectedContextModes] = useState<Record<string, 'full' | 'summary'>>({});
 const [contextSortOrder, setContextSortOrder] = useState<'asc' | 'desc'>('desc');
 const [previewChapterId, setPreviewChapterId] = useState<string | null>(null);
 const [previewLoading, setPreviewLoading] = useState(false);
 const [editingIndex, setEditingIndex] = useState<number | null>(null);

 const panelRef = useRef<HTMLDivElement>(null);
 const lockedSelectionRef = useRef<LockedSelection | null>(null);
 const insertAnchorRef = useRef<number | null>(null);
 const contextListRef = useRef<HTMLDivElement>(null);
 const miscListRef = useRef<HTMLDivElement>(null);
 const isMounted = useRef(true);

 useEffect(() => {
 isMounted.current = true;
 return () => {
 isMounted.current = false;
 };
 }, []);

 const miscChapterIds = useMemo(() => new Set(book.miscChapterIds || []), [book.miscChapterIds]);

 // 「上一章」不能落在作品相关条目上：设定不是承接对象
 const previousChapter = useMemo(() => {
 const index = book.chapters.findIndex((item) => item.id === chapter.id);
 if (index <= 0) return null;
 for (let i = index - 1; i >= 0; i -= 1) {
 const candidate = book.chapters[i];
 if (candidate && !miscChapterIds.has(candidate.id)) return candidate;
 }
 return null;
 }, [book.chapters, chapter.id, miscChapterIds]);

 const chapterCandidates = useMemo(
 () =>
 book.chapters
 .map((item, index) => ({ ...item, chapterNo: index + 1, isMisc: miscChapterIds.has(item.id) }))
 .filter((item) => item.id !== chapter.id),
 [book.chapters, chapter.id, miscChapterIds]
 );

 const filteredCandidates = useMemo(() => {
 const key = contextKeyword.trim().toLowerCase();
 let list = key
 ? chapterCandidates.filter((item) => String(item.title || '').toLowerCase().includes(key) || String(item.chapterNo).includes(key))
 : [...chapterCandidates];
 if (contextSortOrder === 'desc') list.reverse();
 return list;
 }, [chapterCandidates, contextKeyword, contextSortOrder]);

 // 正文章节与「作品相关」分两栏展示，设定类条目不再混在章节序号里
 const mainCandidates = useMemo(() => filteredCandidates.filter((item) => !item.isMisc), [filteredCandidates]);
 const miscCandidates = useMemo(() => filteredCandidates.filter((item) => item.isMisc), [filteredCandidates]);

 const selectedContextChapters = useMemo(
 () => chapterCandidates.filter((item) => selectedContextIds.has(item.id)),
 [chapterCandidates, selectedContextIds]
 );

 // 预览栏：显示该章「实际会进入提示词」的内容，而不是原始正文
 const previewChapter = useMemo(
 () => chapterCandidates.find((item) => item.id === previewChapterId) || null,
 [chapterCandidates, previewChapterId]
 );

 const previewMode = previewChapter ? selectedContextModes[previewChapter.id] || 'full' : 'full';

 const previewText = useMemo(() => {
 if (!previewChapter) return '';
 if (previewMode === 'summary') {
 const memBank: any[] = Array.isArray((book as any).memoryBank) ? (book as any).memoryBank : [];
 const mem = memBank.find((m: any) => m.chapterId === previewChapter.id);
 return String(mem?.plotAnalysis?.plotSynopsis || mem?.summary || '').trim();
 }
 return htmlToPlainWithBreaks(String(previewChapter.content || ''));
 }, [previewChapter, previewMode, book]);

 const previewTokens = useMemo(() => (previewText ? estimateTextTokens(previewText) : 0), [previewText]);

 const stylePromptHint = useMemo(() => {
 const config = useConfigStore.getState().config;
 const books = useBookStore.getState().books;
 const effectiveStyle = config ? resolveStyleForBook(book.id, config, books) : { stylePresetId: '', styleInstruction: '' };
 const presetId = effectiveStyle.stylePresetId;
 if (!presetId) return '未启用文风预设';
 if (presetId === 'custom') {
 const activeProfile = config?.ai.styleProfiles?.find((p) => p.id === config.ai.activeStyleProfileId);
 return activeProfile ? activeProfile.name : '自定义文风';
 }
 const preset = BUILTIN_STYLE_PRESET_META.find((p) => p.id === presetId);
 return preset?.label || presetId;
 }, [book.id]);

 const outlineText = useMemo(() => {
   const fromHard = normalizeEscapedNewlines(String(hardConstraints?.goal || '')).trim();
   if (fromHard) return fromHard;
   return getChapterOutlineText(chapter);
 }, [hardConstraints?.goal, chapter]);

 const continuationReferenceText = useMemo(() => {
 const memBank: any[] = Array.isArray((book as any).memoryBank) ? (book as any).memoryBank : [];
 const blocks = selectedContextChapters
 .map((item) => {
 const mode = selectedContextModes[item.id] || 'full';
 const title = String(item.title || `第${item.chapterNo}章`);
 const label = item.isMisc ? `作品相关·${title}` : `第${item.chapterNo}章 ${title}`;
 if (mode === 'summary') {
 const mem = memBank.find((m: any) => m.chapterId === item.id);
 const syn = mem?.plotAnalysis?.plotSynopsis || mem?.summary || '';
 if (!syn) return '';
 return `【${label}（智能整理摘要）】\n${syn}`;
 }
 const content = normalizeEscapedNewlines(String(item.content || '')).trim();
 if (!content) return '';
 const words = Number(item.wordCount || 0);
 return `【${label}（${words.toLocaleString('zh-CN')}字）】\n${content}`;
 })
 .filter(Boolean);
 return blocks.length > 0 ? blocks.join('\n\n') : '（未选择参考章节）';
 }, [selectedContextChapters, selectedContextModes, book]);

 const estimatedPromptTokens = useMemo(() => {
 const parts = [
 '请仅基于以下信息直接续写当前章节正文，不要引入未提供信息，不要复述提示词。',
 ...(continuationReferenceText && continuationReferenceText !== '（未选择参考章节）' ? [`【参考章节】\n${continuationReferenceText}`] : []),
 `【写作风格提示词】\n${stylePromptHint}`,
 `【本章细纲】\n${outlineText || '（未填写）'}`,
 '仅输出可直接落稿的小说正文。'
 ];
 return estimateTextTokens(parts.join('\n\n'));
 }, [continuationReferenceText, outlineText, stylePromptHint]);
 const tokenLevel = useMemo(() => {
 if (estimatedPromptTokens >= TOKEN_LEVEL_VERY_HIGH) return '很高';
 if (estimatedPromptTokens >= TOKEN_LEVEL_HIGH) return '较高';
 return '正常';
 }, [estimatedPromptTokens]);

 // Standalone helper: resolve selection synchronously from editor + props.
 function getResolvedSelection() {
 if (!editor) return { from: 0, to: 0, text: '' };
 try {
 const { from: nativeFrom, to: nativeTo } = editor.state.selection;
 const rawFrom = lockedRange?.from ?? capturedSelection?.from ?? nativeFrom;
 const rawTo = lockedRange?.to ?? capturedSelection?.to ?? nativeTo;
 // 裁剪到文档实际边界，防止过期位置越界导致 textBetween → nodeSize crash
 const docSize = editor.state.doc.content.size;
 const from = Math.max(0, Math.min(rawFrom, docSize));
 const to = Math.max(from, Math.min(rawTo, docSize));
 const text = from > 0 && to > from ? editor.state.doc.textBetween(from, to, '\n') : '';
 return { from, to, text };
 } catch {
 return { from: 0, to: 0, text: '' };
 }
 }


 // SYNC capture: get selection text on mount and whenever selection props change.
 const [selectedText, setSelectedText] = useState(() => getResolvedSelection().text);
 const [selectionRange, setSelectionRange] = useState(() => {
 const { from, to } = getResolvedSelection();
 return { from, to };
 });

 // Sync refs/state from latest selection inputs so actions always operate
 // on current range/text instead of initial snapshot.
 useEffect(() => {
 const { from, to, text } = getResolvedSelection();
 lockedSelectionRef.current = from > 0 && to > from ? { from, to, text } : null;
 setSelectedText(text);
 setSelectionRange({ from, to });
 if (to > 0) insertAnchorRef.current = to;
 }, [editor, lockedRange?.from, lockedRange?.to, capturedSelection?.from, capturedSelection?.to]);

 useEffect(() => {
 if (mode !== 'menu') return;
 const onPointer = (event: Event) => {
 if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
 };
 document.addEventListener('pointerdown', onPointer, { capture: true });
 document.addEventListener('mousedown', onPointer, { capture: true });
 document.addEventListener('click', onPointer, { capture: true });
 document.addEventListener('contextmenu', onPointer, { capture: true });
 return () => {
 document.removeEventListener('pointerdown', onPointer, { capture: true });
 document.removeEventListener('mousedown', onPointer, { capture: true });
 document.removeEventListener('click', onPointer, { capture: true });
 document.removeEventListener('contextmenu', onPointer, { capture: true });
 };
 }, [mode, onClose]);

 useEffect(() => {
 if (mode !== 'context') return;
 contextListRef.current?.scrollTo({ top: 0 });
 miscListRef.current?.scrollTo({ top: 0 });
 }, [mode, contextSortOrder]);

 const requestEditorSave = () => window.dispatchEvent(new CustomEvent('writerzen:force-save-current-editor'));
 const restoreEditorFocus = () => window.dispatchEvent(new CustomEvent('writerzen:restore-editor-focus'));

 const splitToParagraphs = useCallback((text: string): string[] => {
 const rows = normalizeNovelOutput(text).split(/\n{1,}/).map((line) => line.trim()).filter(Boolean);
 return rows.length > 0 ? rows : [String(text || '').trim()];
 }, []);

 const paragraphsToContent = useCallback(
 (paragraphs: string[]) =>
 paragraphs
 .map((line) => line.trim())
 .filter(Boolean)
 .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
 []
 );

 const applyResult = useCallback(
 (paragraphs: string[]) => {
 if (!editor) return;
 const content = paragraphsToContent(paragraphs);
 let applied = false;

 if (reviewMode === 'replace') {
 const locked = lockedSelectionRef.current;
 if (locked && locked.from < locked.to) {
 const currentText = editor.state.doc.textBetween(locked.from, locked.to, '\n');
 if (currentText !== locked.text) {
 island.show({ type: 'warning', message: '检测到选区内容已变化，已取消写回。' });
 onClose();
 return;
 }
 editor.chain().focus().insertContentAt({ from: locked.from, to: locked.to }, content).run();
 applied = true;
 } else if (selectionRange && selectionRange.from < selectionRange.to) {
 editor.chain().focus().insertContentAt({ from: selectionRange.from, to: selectionRange.to }, content).run();
 applied = true;
 }
 } else {
 const anchor = insertAnchorRef.current ?? editor.state.selection.to;
 editor.chain().focus().insertContentAt(anchor, content).run();
 applied = true;
 }

 if (applied) {
 requestEditorSave();
 restoreEditorFocus();
 island.show({ type: 'success', message: `已采纳 AI 结果，耗时 ${(timeTaken / 1000).toFixed(1)}s`, autoHideMs: 2000 });
 onClose();
 } else {
 island.show({ type: 'error', message: '由于无法定位选区位置，已取消写回。' });
 onClose();
 }
 },
 [editor, island, onClose, paragraphsToContent, reviewMode, selectionRange, timeTaken]
 );

 const openReview = (title: string, text: string, nextMode: ReviewMode) => {
 const paragraphs = splitToParagraphs(text);
 setReviewTitle(title);
 setReviewParagraphs(paragraphs);
 setReviewSelected(paragraphs.map((_, index) => index));
 setReviewMode(nextMode);
 setMode('review');
 };

 const requestAi = async (actionName: string, mode: 'polish' | 'rewrite') => {
 if (!requireLogin(`进行${actionName}`)) {
 onClose();
 return;
 }
 const processingRange = lockedSelectionRef.current ?? selectionRange;
 const latestSelectedText =
 editor && processingRange && processingRange.from < processingRange.to
 ? editor.state.doc.textBetween(processingRange.from, processingRange.to, '\n')
 : selectedText;
 if (!editor || !latestSelectedText.trim()) {
 island.show({ type: 'warning', message: '请先选中文本' });
 onClose();
 return;
 }
 // Agent 模式：只传简短意图指令，不把选区文本塞到 instruction（useEditorAgentMode 会自己从 editor 读选区）
 if (onAgentRewrite) {
 const instruction = mode === 'polish'
 ? '对选中的段落做词汇润色，保持原意、句式、长度不变。'
 : '重写选中的段落，保留核心情节与人设，提升表现力与阅读张力。';
 onAgentRewrite(instruction);
 onClose();
 return;
 }
 if (processingRange?.from && processingRange.from < processingRange.to) {
 onSelectionProcessing?.({ from: processingRange.from, to: processingRange.to });
 }
 setMode('loading');
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在处理中...' });
 const start = Date.now();
 try {
 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 // AI润色和重写不注入题材提示词
 disableStyle: true,
 messages: mode === 'rewrite'
 ? [
 {
 role: 'system',
 content:
 getPromptSync('rewrite_system', '你是中文小说重写助手。请保留核心情节与人物关系，但允许重组句式和段落结构，提升表现力与阅读张力。严格只重写用户消息中给出的文本，不要续写也不要额外创作。输出长度应与原文相近。不要输出解释，只返回可直接落稿的重写正文。')
 },
 { role: 'user', content: latestSelectedText }
 ]
 : [
 // 润色：单纯的词汇调整，不用系统提示词，避免模型过度发挥
 {
 role: 'user',
 content: `优化以下文本的遣词造句，只替换词汇让语言更生动，保持原意、句式、长度不变。直接输出结果，不要解释：\n\n${latestSelectedText}`
 }
 ]
 });
 const cleaned = normalizeNovelOutput(response?.text || '');
 if (!cleaned) throw new Error('AI 返回为空。');
 if (isMounted.current) {
 setTimeTaken(Date.now() - start);
 island.finishTask(taskId);
 if (onAiResult && processingRange && processingRange.from < processingRange.to) {
 onAiResult({ from: processingRange.from, to: processingRange.to }, cleaned);
 onClose();
 } else {
 openReview(`${actionName}结果`, cleaned, 'replace');
 }
 }
 } catch (error) {
 if (isMounted.current) {
 island.finishTask(taskId);
 island.show({ type: 'error', message: 'AI 请求失败', detail: normalizeAiErrorMessage(error) });
 setMode('menu'); // TASK-08: Rollback to menu instead of onClose
 }
 } finally {
 onSelectionProcessing?.(null);
 }
 };

 const requestContinuationWithSelectedContext = async () => {
  if (!editor) return;
  if (!outlineText) return island.show({ type: 'warning', message: '请先在“本章细纲”中填写内容。' });

   // 一点击「开始写作」就收起参考章节窗，进度交给灵动岛
   setMode('loading');

   // 先确保剧情档案已加载：memoryBank 存于独立 memory.json，编辑器路径不会自动加载，
   // 若直接用 book.memoryBank（空）判断，会把已整理的章节误判为「未整理」而反复提示一键整理。
   try {
    await useBookStore.getState().loadMemoryBank(book.id);
   } catch { /* ignore */ }
   const liveBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;

   // 检查选择"整理"模式但尚未整理的章节
   let memBank: any[] = Array.isArray((liveBook as any).memoryBank) ? (liveBook as any).memoryBank : [];
   let effectiveModes = { ...selectedContextModes };
  const unorganizedSummaryChapters = selectedContextChapters.filter((item) => {
  const mode = effectiveModes[item.id] || 'full';
  if (mode !== 'summary') return false;
  const mem = memBank.find((m: any) => m.chapterId === item.id);
  const syn = mem?.plotAnalysis?.plotSynopsis || mem?.summary || '';
  return !syn;
  });

  if (unorganizedSummaryChapters.length > 0) {
  const titles = unorganizedSummaryChapters.map((ch) => `《${ch.title || `第${ch.chapterNo}章`}》`).join('、');
  const confirmed = window.confirm(
  `以下 ${unorganizedSummaryChapters.length} 个章节选择发送智能整理，但尚未进行整理：\n${titles}\n\n是否一键整理？（选择"取消"将自动发送这些章节的正文）`
  );
  if (confirmed) {
  const organizeTaskId = island.startTask({ type: 'progress', status: 'thinking', message: `正在整理 ${unorganizedSummaryChapters[0]?.title || ''}...` });
  const { saveMemoryBank } = useBookStore.getState();
  try {
  for (let i = 0; i < unorganizedSummaryChapters.length; i++) {
  const ch = unorganizedSummaryChapters[i];
  island.updateTask(organizeTaskId, { message: `正在整理 ${ch.title || `第${ch.chapterNo}章`} (${i + 1}/${unorganizedSummaryChapters.length})...` });
  const plainText = stripHtml(await useBookStore.getState().ensureChapterContent(book.id, ch.id) || '').trim();
  if (plainText.length < 30) continue;
  const prompt = `请智能整理以下章节正文，提取剧情档案信息，并仅返回严格 JSON（不要 Markdown）：\n\n${prepareChapterTextForOrganization(plainText)}\n\n${buildSmartOrganizeRules({ disableRoleExtract: useConfigStore.getState().config?.ai?.disableAutoRoleExtract })}`;
  const res = await electronAPI.ai.chat({
  stream: false,
  bookId: book.id,
  chapterId: ch.id,
  disableRag: true,
  disableStyle: true,
  maxTokens: 16384,
  messages: [
  { role: 'system', content: getPromptSync('smart_organize_system', '你是网文剧情档案整理助手，必须只输出严格 JSON。') },
  { role: 'user', content: prompt }
  ]
  });
  const rawText = String(res?.text || '');
  const analysis = parseJsonLoosely<Record<string, unknown>>(rawText || '{}');
  const memory = createChapterMemoryFromAnalysis(analysis, ch, { disableRoleExtract: useConfigStore.getState().config?.ai?.disableAutoRoleExtract });
  memBank = memBank.filter((m) => m.chapterId !== ch.id).concat(memory);
  }
  await saveMemoryBank(book.id, memBank);
  island.finishTask(organizeTaskId);
  island.show({ type: 'success', message: `已整理 ${unorganizedSummaryChapters.length} 个章节`, autoHideMs: 2000 });
  } catch (organizeError) {
  island.finishTask(organizeTaskId);
  island.show({ type: 'error', message: '智能整理失败', detail: normalizeAiErrorMessage(organizeError) });
  for (const ch of unorganizedSummaryChapters) {
  effectiveModes[ch.id] = 'full';
  }
  setSelectedContextModes({ ...effectiveModes });
  const latestBooks = useBookStore.getState().books;
  const latestBook = latestBooks.find((b) => b.id === book.id);
  memBank = Array.isArray((latestBook as any)?.memoryBank) ? (latestBook as any).memoryBank : [];
  }
  } else {
  for (const ch of unorganizedSummaryChapters) {
  effectiveModes[ch.id] = 'full';
  }
  setSelectedContextModes({ ...effectiveModes });
  }
  }

  if (estimatedPromptTokens >= TOKEN_LEVEL_VERY_HIGH) {
  const confirmed = await safeConfirm(`当前预计输入约 ${estimatedPromptTokens.toLocaleString('zh-CN')} tokens（很高），仍继续吗？`);
  if (!confirmed) {
  // 用户取消高 token 确认：关掉右键菜单即可
  onClose();
  return;
  }
  }

  insertAnchorRef.current = editor.state.selection.to;
  const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在按细纲写作...' });
  const start = Date.now();
  try {
  // 使用最新的 memBank 和 effectiveModes 构建参考文本
  const finalBooks = useBookStore.getState().books;
  const finalBook = finalBooks.find((b) => b.id === book.id);
  const finalMemBank: any[] = Array.isArray((finalBook as any)?.memoryBank) ? (finalBook as any).memoryBank : [];

  const referenceBlocks = selectedContextChapters.map((item) => {
  const mode = effectiveModes[item.id] || 'full';
  const title = String(item.title || `第${item.chapterNo}章`);
  const label = item.isMisc ? `作品相关·${title}` : `第${item.chapterNo}章 ${title}`;
  if (mode === 'summary') {
  const mem = finalMemBank.find((m: any) => m.chapterId === item.id);
  const syn = mem?.plotAnalysis?.plotSynopsis || mem?.summary || '';
  if (!syn) return '';
  return `【${label}（智能整理摘要）】\n${syn}`;
  }
  const content = normalizeEscapedNewlines(String(item.content || '')).trim();
  if (!content) return '';
  const words = Number(item.wordCount || 0);
  return `【${label}（${words.toLocaleString('zh-CN')}字）】\n${content}`;
  }).filter(Boolean);

  // 与 Agent 共用：细纲 + 档案/正文上下文 + 写手 Skill + 设定/剧情卡
  const liveBooks = useBookStore.getState().books;
  const liveBook = liveBooks.find((b) => b.id === book.id) || finalBook || book;
  const liveChapter = (liveBook.chapters || []).find((c) => c.id === chapter.id) || chapter;
  const packed = buildOutlineWritingContext(liveBook, liveChapter, {
    archiveCount: 8,
    proseCount: 2,
    proseCharsEach: 1800,
    userInstruction: '请根据本章细纲撰写可直接落稿的正文。',
    fallbackOutline: outlineText
  });
  const actualReferenceText = referenceBlocks.length > 0 ? referenceBlocks.join('\n\n') : '';
  const userContent = [
    packed.userContent,
    actualReferenceText ? `【用户勾选参考章节】\n${actualReferenceText}` : '',
    buildStoryCanonBlock(liveBook, liveChapter)
  ].filter(Boolean).join('\n\n');
  const retryMessages = [
    { role: 'system' as const, content: buildOutlineWritingSystemPrompt(liveBook, liveChapter) },
    { role: 'user' as const, content: userContent }
  ];
  // 风格单入口（T1）：bundle（buildWriterSystemPrompt）已注入风格一次，不再手动 injectStyleToMessages 二次注入。
  const finalMessages = retryMessages;
  const response = await electronAPI.ai.chat({
    stream: false,
    disableRag: true,
    bookId: book.id,
    chapterId: chapter.id,
    messages: finalMessages
  });
  const rawOut = String(response?.text || '').trim();
  const split = splitAgentOutput(rawOut);
  if (!split.hasBody) {
    throw new Error('模型只返回了写作计划/思考过程，没有生成正文。请重试，或把细纲写得更具体。');
  }
  const text = normalizeNovelOutput(normalizeChinesePunctuation(split.body || ''));

  if (!text) throw new Error('AI 未返回可用续写内容。');
  const elapsedMs = Date.now() - start;
  setTimeTaken(elapsedMs);
  island.finishTask(taskId);
  const paragraphs = splitToParagraphs(text);
  try {
  await electronAPI.system.openContinuationWindow({
  source: 'outline',
  bookId: book.id,
  chapterId: chapter.id,
  insertFrom: insertAnchorRef.current ?? editor.state.selection.to,
  title: 'AI 细纲写作结果',
  elapsedMs,
  paragraphs,
  selected: paragraphs.map((_, index) => index),
  editingIndex: null,
  retryRequest: {
  messages: retryMessages,
  disableRag: true,
  disableStyle: false
  }
  });
  } catch (windowError) {
  throw new Error(`打开续写窗口失败：${normalizeAiErrorMessage(windowError)}`);
  }
  onClose();
  } catch (error) {
  if (isMounted.current) {
  island.finishTask(taskId);
  island.show({ type: 'error', message: 'AI 续写失败', detail: normalizeAiErrorMessage(error) });
  // loading 已关窗；失败时直接关掉右键层，避免卡在空白 loading
  onClose();
  }
  } finally {
 if (isMounted.current) {
 // any finally logic
 }
 }
 };

 const acceptSelected = () => {
 const picked = reviewSelected
 .slice()
 .sort((a, b) => a - b)
 .map((index) => reviewParagraphs[index])
 .filter(Boolean);
 if (picked.length === 0) return island.show({ type: 'warning', message: '请至少选择一段。' });
 applyResult(picked);
 };

 const acceptAll = () => {
 if (reviewParagraphs.length === 0) return island.show({ type: 'warning', message: '没有可采纳内容。' });
 applyResult(reviewParagraphs);
 };

 const rejectResult = () => {
 island.show({ type: 'warning', message: '已取消本次 AI 结果。', autoHideMs: 1200 });
 onClose();
 restoreEditorFocus();
 };

  // 取当前章之前最近的 N 个正文章节（跳过「作品相关」条目，设定不是承接对象）
  const recentProseChapters = (count: number) => {
   const chapters = Array.isArray(book.chapters) ? book.chapters : [];
   const idx = chapters.findIndex((c) => c.id === chapter.id);
   const before = (idx >= 0 ? chapters.slice(0, idx) : chapters).filter((c) => !miscChapterIds.has(c.id));
   return before.slice(Math.max(0, before.length - count));
  };

  // 勾选即回源正文：从未在编辑器打开过的章节 store 里没有 content，
  // 不预载会让参考内容（尤其是很少打开的作品相关）被静默丢掉。
  const preloadContextContents = (ids: Iterable<string>) => {
   for (const id of ids) {
    void useBookStore.getState().loadChapterIntoStore(book.id, id).catch(() => {});
   }
  };

  const openContextPreview = (chapterId: string) => {
   setPreviewChapterId(chapterId);
   setPreviewLoading(true);
   void useBookStore.getState()
    .loadChapterIntoStore(book.id, chapterId)
    .catch(() => {})
    .finally(() => {
     if (isMounted.current) setPreviewLoading(false);
    });
  };

  const openContextPicker = async () => {
  if (!(await requireFeatureAccess('outline_write'))) {
  onClose();
  return;
  }

  // 预载剧情档案：memoryBank 存于独立 memory.json，编辑器路径不自动加载；
  // 否则「整理」模式预览与未整理判定都看不到已有档案。
  try {
   await useBookStore.getState().loadMemoryBank(book.id);
  } catch { /* ignore */ }

   // 默认只预选最近 1 章正文(full)；用户可用下方「最近5章/最近10章」快捷按钮扩展，或手动勾选
  const next = new Set<string>();
  const modes: Record<string, 'full' | 'summary'> = {};
  recentProseChapters(1).forEach((ch) => {
   next.add(ch.id);
   modes[ch.id] = 'full';
  });
  // 若窗口为空，至少带上上一章
  if (next.size === 0 && previousChapter && previousChapter.id !== chapter.id) {
   next.add(previousChapter.id);
   modes[previousChapter.id] = 'full';
  }
  setSelectedContextIds(next);
  setSelectedContextModes((prev) => ({ ...prev, ...modes }));
  preloadContextContents(next);
  // 打开就预览默认带上的那一章，右侧不留空
  const firstPick = Array.from(next)[0] || null;
  if (firstPick) openContextPreview(firstPick);
  setContextKeyword('');
  setContextSortOrder('desc');
  setMode('context');
  };

  // 快捷选择最近 N 章（5/10）：倒序最近 N 章，近 1 章 full、其余 summary
  const quickSelectRecentChapters = (count: number) => {
   const windowChapters = recentProseChapters(count);
   const next = new Set<string>();
   const modes: Record<string, 'full' | 'summary'> = {};
   windowChapters.forEach((ch, i) => {
    next.add(ch.id);
    const fromEnd = windowChapters.length - 1 - i;
    modes[ch.id] = fromEnd < 1 ? 'full' : 'summary';
   });
   if (next.size === 0 && previousChapter && previousChapter.id !== chapter.id) {
    next.add(previousChapter.id);
    modes[previousChapter.id] = 'full';
   }
   setSelectedContextIds(next);
   setSelectedContextModes((prev) => ({ ...prev, ...modes }));
   preloadContextContents(next);
  };

 const toggleContextChapter = (chapterId: string) => {
  const willSelect = !selectedContextIds.has(chapterId);
  setSelectedContextIds((prev) => {
   const next = new Set(prev);
   if (next.has(chapterId)) next.delete(chapterId);
   else next.add(chapterId);
   return next;
  });
  if (willSelect) preloadContextContents([chapterId]);
 };

 const toggleContextMode = (chapterId: string) => {
 setSelectedContextModes((prev) => ({
 ...prev,
 [chapterId]: prev[chapterId] === 'summary' ? 'full' : 'summary'
 }));
 };

 // 参考章节行：正文章节栏与作品相关栏共用
 const renderCandidateRow = (item: (typeof mainCandidates)[number]) => {
 const checked = selectedContextIds.has(item.id);
 const mode = selectedContextModes[item.id] || 'full';
 return (
 <div key={item.id} className={`group flex items-center px-4 py-1.5 rounded-none transition-all ${checked ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>
 <button className="flex min-w-0 flex-1 items-center text-left" onClick={() => { toggleContextChapter(item.id); openContextPreview(item.id); }}>
 <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${checked ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-color)] text-transparent hover:border-[var(--text-muted)]'}`}>
 {checked && <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>}
 </div>
 <div className={`ml-4 truncate text-[13px] transition-colors ${checked ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>{item.title || `第${item.chapterNo}章`}</div>
 <div className="ml-auto pl-4 shrink-0 text-xs text-[var(--text-muted)]">{Number(item.wordCount || 0).toLocaleString('zh-CN')}字</div>
 </button>
 {checked && (
 <div className="ml-4 flex shrink-0 items-stretch border border-[var(--border-color)] rounded-none overflow-hidden h-[26px] bg-[var(--bg-primary)]">
 <button className={`px-2.5 text-xs whitespace-nowrap transition-colors border-r border-[var(--border-color)] ${mode === 'full' ? 'text-[var(--accent)] bg-[var(--accent)]/15 font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`} onClick={(e) => { e.stopPropagation(); if (mode !== 'full') toggleContextMode(item.id); }}>全文</button>
 <button className={`px-2.5 text-xs whitespace-nowrap transition-colors ${mode === 'summary' ? 'text-[var(--accent)] bg-[var(--accent)]/15 font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`} onClick={(e) => { e.stopPropagation(); if (mode !== 'summary') toggleContextMode(item.id); }}>整理</button>
 </div>
 )}
 </div>
 );
 };

 const deleteSelection = () => {
 if (!editor) return;
 const live = getResolvedSelection();
 const sel = (live.from < live.to ? { from: live.from, to: live.to } : null) ?? lockedSelectionRef.current ?? selectionRange;
 if (!sel || sel.from >= sel.to) return;
 // 选区若跨过章节标题：只删正文，避免标题被吃掉 / 删除事务被保护逻辑卡死
 const first = editor.state.doc.firstChild;
 const headingEnd = first?.type.name === 'heading' ? first.nodeSize : 0;
 let from = sel.from;
 let to = sel.to;
 if (headingEnd > 0 && from < headingEnd && to > headingEnd) {
  from = headingEnd;
 }
 if (from >= to) {
  onClose();
  return;
 }
 editor.chain().focus().deleteRange({ from, to }).run();
 requestEditorSave();
 onClose();
 };

 const copySelection = async () => {
 if (!editor) return;
 const live = getResolvedSelection();
 const sel = (live.from < live.to ? { from: live.from, to: live.to } : null) ?? lockedSelectionRef.current ?? selectionRange;
 if (!sel || sel.from >= sel.to) return;
 const text = editor.state.doc.textBetween(sel.from, sel.to, '\n');
 const copied = await writeTextToClipboard(text);
 if (!copied) {
 island.show({ type: 'error', message: '复制失败，请按 Ctrl+C 复制选中文本', autoHideMs: 1800 });
 return;
 }
 island.show({ type: 'success', message: '已复制选中文本', autoHideMs: 1200 });
 onClose();
 };

 const cutSelection = async () => {
 if (!editor) return;
 const live = getResolvedSelection();
 const sel = (live.from < live.to ? { from: live.from, to: live.to } : null) ?? lockedSelectionRef.current ?? selectionRange;
 if (!sel || sel.from >= sel.to) return;
 const text = editor.state.doc.textBetween(sel.from, sel.to, '\n');
 const copied = await writeTextToClipboard(text);
 if (!copied) {
 island.show({ type: 'error', message: '剪切失败，未删除原文', autoHideMs: 1800 });
 return;
 }
 {
  const first = editor.state.doc.firstChild;
  const headingEnd = first?.type.name === 'heading' ? first.nodeSize : 0;
  let from = sel.from;
  let to = sel.to;
  if (headingEnd > 0 && from < headingEnd && to > headingEnd) {
   from = headingEnd;
  }
  if (from < to) {
   editor.chain().focus().deleteRange({ from, to }).run();
   requestEditorSave();
  }
 }
 island.show({ type: 'success', message: '已剪切选中文本', autoHideMs: 1200 });
 onClose();
 };

 const pasteFromClipboard = () => {
 if (!editor) return;
 navigator.clipboard.readText().then((text) => {
 if (!text) return;
 // 右键粘贴：纯文本按行拆段；光标若在标题内则先落到正文再插，不接管系统 Ctrl+V
 const nodes = toSafeParagraphNodes(text);
 const first = editor.state.doc.firstChild;
 const headingEnd = first?.type.name === 'heading' ? first.nodeSize : 0;
 const sel = editor.state.selection;
 const chain = editor.chain().focus();
 if (headingEnd > 0 && sel.from < headingEnd) {
  const pos = Math.min(Math.max(headingEnd, 1), editor.state.doc.content.size);
  chain.setTextSelection(pos);
 }
 chain.insertContent(nodes).run();
 requestEditorSave();
 }).catch(() => {});
 onClose();
 };

 const menuLeft = x + 260 > window.innerWidth ? Math.max(10, x - 264) : x + 2;
 const menuTop = y + 330 > window.innerHeight ? Math.max(10, y - 334) : y + 2;
 const hasValidSelection = Boolean(selectionRange && selectionRange.from < selectionRange.to);
 const rootTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : '';
 const menuTone = resolveReadableMenuTone(String(uiTheme || rootTheme || ''));
 const menuSurfaceStyle = menuTone === 'light'
 ? { color: '#111111', background: 'rgba(255, 255, 255, 0.97)', borderColor: 'rgba(15, 23, 42, 0.14)' }
 : { color: 'rgba(248, 250, 252, 0.94)', background: 'rgba(12, 14, 20, 0.96)', borderColor: 'rgba(255, 255, 255, 0.16)' };
 const menuTextColor = menuTone === 'light' ? '#111111' : 'rgba(248, 250, 252, 0.94)';
 const menuDisabledColor = menuTone === 'light' ? 'rgba(17, 17, 17, 0.38)' : 'rgba(248, 250, 252, 0.34)';
 const menuDangerColor = menuTone === 'light' ? '#9f1239' : '#fda4af';
 const menuAiColor = menuTone === 'light' ? '#1e3a8a' : '#c7d2fe';
 const menuOutlineColor = menuTone === 'light' ? '#92400e' : '#fcd34d';

 if (mode === 'loading') return null;

 const panelBg = 'wz-context-menu';
	const dividerStyle = 'wz-ctx-divider';
	const itemBase = 'wz-ctx-item';
	const itemDisabledStyle = 'opacity-40';
	const itemDefaultColor = '';

 const content =
 mode === 'review' ? (
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/50" onClick={rejectResult} />
 <div className="relative flex w-full max-h-[85vh] max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.7)]">
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
 <div className="flex items-center justify-between gap-4">
 <div className="text-lg font-bold tracking-tight text-[var(--text-primary)]">{reviewTitle || 'AI 续写结果'}</div>
 <div className="text-[10px] font-mono font-bold tracking-[0.2em] text-[var(--text-muted)]">ELAPSED: {(timeTaken / 1000).toFixed(1)}s</div>
 </div>
 </div>
 <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-transparent px-6 py-5">
 {reviewParagraphs.map((paragraph, index) => {
 const picked = reviewSelected.includes(index);
 const isEditing = editingIndex === index;
 return (
 <div key={`review-${index}`} className={`border rounded-none p-4 transition-all duration-300 ${picked ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 shadow-[0_0_15px_rgba(99,102,241,0.08)]' : 'border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)]'}`}>
 <div className="mb-3 flex items-center justify-between">
 <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">段落 {index + 1}</div>
 <div className="flex gap-2">
 <button className="bg-[var(--surface-strong)] rounded-none border border-[var(--border-color)] px-3 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all" onClick={() => setEditingIndex(isEditing ? null : index)}>
 {isEditing ? '完成' : '编辑'}
 </button>
 <button className={`rounded-none px-3 py-1 text-[11px] font-bold transition-all ${picked ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20' : 'bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'}`} onClick={() => setReviewSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))}>
 {picked ? '已选择' : '选择'}
 </button>
 </div>
 </div>
 {isEditing ? (
 <textarea className="w-full min-h-[100px] resize-none bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-none p-3 text-[15px] font-medium leading-7 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" value={paragraph} onChange={(event) => setReviewParagraphs((prev) => prev.map((item, i) => (i === index ? event.target.value : item)))} />
 ) : (
 <div className="whitespace-pre-wrap text-[15px] font-medium leading-7 text-[var(--text-primary)]">{paragraph}</div>
 )}
 </div>
 );
 })}
 </div>
 <div className="flex justify-end gap-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
 <button className="rounded-none border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] px-5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all" onClick={rejectResult}>不采纳</button>
 <button className="rounded-none border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--accent)]/20 transition-all" onClick={acceptSelected}>采纳选中 ({reviewSelected.length})</button>
 <button className="rounded-none px-6 py-2 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] shadow-[var(--accent)]/10" onClick={acceptAll}>全部采纳</button>
 </div>
 </div>
 </div>
 ) : mode === 'context' ? (
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div
 className="absolute inset-0 bg-black/50 transition-opacity"
 onMouseDown={(e) => { (e.currentTarget as any).__downBackdrop = e.target === e.currentTarget; }}
 onMouseUp={(e) => {
 const wasDown = (e.currentTarget as any).__downBackdrop;
 (e.currentTarget as any).__downBackdrop = false;
 if (wasDown && e.target === e.currentTarget) onClose();
 }}
 />
 <div className="relative flex w-full max-h-[85vh] max-w-[1280px] flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.75)] overflow-hidden" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}>
 <div className="flex flex-col flex-1 min-h-0">
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
 <div className="text-[15px] font-bold text-[var(--text-primary)]">选择参考章节</div>
  <div className="mt-1 text-xs text-[var(--text-secondary)]">默认只参考最近 1 章；点击任意章节可在右侧预览它实际发送给模型的内容，「作品相关」单独成栏。</div>
 </div>
 
 <div className="border-b border-[var(--border-color)] flex items-stretch bg-[var(--bg-primary)]">
 <input value={contextKeyword} onChange={(event) => setContextKeyword(event.target.value)} placeholder="搜索章节序号或章节名..." className="flex-1 bg-transparent px-5 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]" />
 <div className="flex border-l border-[var(--border-color)]">
  <button className={`px-3 text-xs whitespace-nowrap transition-colors border-r border-[var(--border-color)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]`} onClick={() => quickSelectRecentChapters(1)}>最近1章</button>
  <button className={`px-3 text-xs whitespace-nowrap transition-colors border-r border-[var(--border-color)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]`} onClick={() => quickSelectRecentChapters(5)}>最近5章</button>
  <button className={`px-3 text-xs whitespace-nowrap transition-colors border-r border-[var(--border-color)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]`} onClick={() => quickSelectRecentChapters(10)}>最近10章</button>
  <button className={`px-3 text-xs whitespace-nowrap transition-colors border-r border-[var(--border-color)] ${contextSortOrder === 'desc' ? 'text-[var(--accent)] bg-[var(--accent)]/10 font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`} onClick={() => setContextSortOrder('desc')}>倒序</button>
  <button className={`px-3 text-xs whitespace-nowrap transition-colors ${contextSortOrder === 'asc' ? 'text-[var(--accent)] bg-[var(--accent)]/10 font-bold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`} onClick={() => setContextSortOrder('asc')}>正序</button>
 </div>
 </div>

 <div className={`grid min-h-0 flex-1 divide-x divide-[var(--border-color)] ${miscChapterIds.size > 0 ? 'grid-cols-[minmax(250px,1fr)_minmax(210px,0.8fr)_minmax(340px,1.3fr)]' : 'grid-cols-[minmax(300px,1fr)_minmax(360px,1.25fr)]'}`}>
 <div className="flex min-h-0 flex-col">
 <div className="shrink-0 px-4 pt-2.5 text-[10px] font-black tracking-[0.18em] text-[var(--text-muted)] uppercase">正文章节 · {mainCandidates.length}</div>
 <div ref={contextListRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
 {mainCandidates.length === 0 ? (
 <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">没有匹配章节</div>
 ) : mainCandidates.map(renderCandidateRow)}
 </div>
 </div>
 {miscChapterIds.size > 0 ? (
 <div className="flex min-h-0 flex-col">
 <div className="shrink-0 px-4 pt-2.5 text-[10px] font-black tracking-[0.18em] text-[var(--accent)]/70 uppercase">作品相关 · {miscCandidates.length}</div>
 <div ref={miscListRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
 {miscCandidates.length === 0 ? (
 <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">没有匹配条目</div>
 ) : miscCandidates.map(renderCandidateRow)}
 </div>
 </div>
 ) : null}
 <div className="flex min-h-0 flex-col bg-[var(--bg-primary)]">
 <div className="shrink-0 flex items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-2.5">
 <div className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--text-primary)]">{previewChapter ? (previewChapter.title || `第${previewChapter.chapterNo}章`) : '内容预览'}</div>
 {previewChapter ? (
 <span className={`shrink-0 text-[11px] font-semibold ${previewMode === 'summary' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{previewMode === 'summary' ? '整理摘要' : '全文'}</span>
 ) : null}
 </div>
 <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
 {!previewChapter ? (
 <div className="py-10 text-center text-sm text-[var(--text-muted)]">点击左侧章节即可预览</div>
 ) : previewText ? (
 <div className="whitespace-pre-wrap text-[13px] leading-7 text-[var(--text-secondary)]">{previewText}</div>
 ) : previewLoading ? (
 <div className="py-10 text-center text-sm text-[var(--text-muted)]">正在载入正文…</div>
 ) : (
 <div className="py-10 text-center text-sm text-[var(--text-muted)]">{previewMode === 'summary' ? '这一章还没有剧情档案，不会进入提示词。' : '这一章没有正文，不会进入提示词。'}</div>
 )}
 </div>
 <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-2 text-[11px] text-[var(--text-muted)]">
 {previewChapter
  ? `进入提示词约 ${previewTokens.toLocaleString('zh-CN')} tokens · ${previewText.length.toLocaleString('zh-CN')} 字`
  : '这里显示该章实际发送给模型的内容'}
 </div>
 </div>
 </div>

 <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="text-xs text-[var(--text-secondary)]">预计输入 <span className="text-[var(--text-primary)] font-mono font-bold ml-1">{estimatedPromptTokens.toLocaleString('zh-CN')}</span> tokens</div>
 </div>
 <div className="flex justify-end gap-3">
 <button className="rounded-none border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] px-5 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all" onClick={onClose}>取消</button>
 <button className="rounded-none bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-6 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:shadow-[var(--accent)]/20 transition-all hover:brightness-110 active:scale-95" onClick={() => void requestContinuationWithSelectedContext()}>开始写作</button>
 </div>
 </div>
 </div>
 </div>
 </div>
 ) : (
 <div
 ref={panelRef}
 className={`wz-context-menu fixed z-[99999] flex flex-col p-1.5 rounded-none border transition-all duration-200 ${panelBg}`}
 style={{ left: menuLeft, top: menuTop, minWidth: '240px' }}
 onClick={(event) => event.stopPropagation()}
 onMouseDownCapture={(event) => {
 event.preventDefault();
 event.stopPropagation();
 }}
 >
 <div className="flex flex-col">
  <button className={`${itemBase} ${hasValidSelection ? itemDefaultColor : `${itemDisabledStyle} pointer-events-none`}`} disabled={!hasValidSelection} onClick={cutSelection}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
  <span>剪切</span>
  </button>
  <button className={`${itemBase} ${hasValidSelection ? itemDefaultColor : `${itemDisabledStyle} pointer-events-none`}`} disabled={!hasValidSelection} onClick={copySelection}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  <span>复制</span>
  </button>
  <button className={`${itemBase} ${itemDefaultColor}`} onClick={pasteFromClipboard}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
  <span>粘贴</span>
  </button>
  <button className={`${itemBase} wz-ctx-danger ${hasValidSelection ? '' : `${itemDisabledStyle} pointer-events-none`}`} disabled={!hasValidSelection} onClick={deleteSelection}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  <span>删除</span>
  </button>
  </div>
 
  <div className={dividerStyle} />

  <div className="flex flex-col">
  <button className={`${itemBase} wz-ctx-ai ${hasValidSelection ? '' : `${itemDisabledStyle} pointer-events-none`}`} disabled={!hasValidSelection} onClick={() => void requestAi('AI 润色', 'polish')}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
  <span>AI 润色</span>
  </button>
  <button className={`${itemBase} wz-ctx-ai ${hasValidSelection ? '' : `${itemDisabledStyle} pointer-events-none`}`} disabled={!hasValidSelection} onClick={() => void requestAi('AI 重写', 'rewrite')}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
  <span>AI 重写</span>
  </button>
  <button className={`${itemBase} wz-ctx-outline`} onClick={() => void openContextPicker()}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  <span>根据本章细纲进行写作</span>
  </button>
  <button className={`${itemBase} wz-ctx-content`} onClick={async () => {
  const { requireLogin } = await import('../../utils/featureCheck');
  if (!requireLogin('根据上文写作')) return;
  window.dispatchEvent(new CustomEvent('reopen-guided-modal'));
  setTimeout(onClose, 0);
  }}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  <span>根据本章内容开始写作</span>
  </button>
  </div>

  <div className={dividerStyle} />

  <div className="flex flex-col">
  <button className={`${itemBase}`} onClick={() => {
  window.dispatchEvent(new CustomEvent('writerzen:open-send-to-aiweb'));
  setTimeout(onClose, 0);
  }}>
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
  <span>将小说发送至网页助手</span>
  </button>
  </div>
 </div>
 );

 return createPortal(content, document.body);
}
