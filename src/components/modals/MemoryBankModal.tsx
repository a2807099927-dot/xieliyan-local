// 模块说明：章节记忆库与脑图推演弹窗。
// 关键职责：对单章节/批量章节进行情节分析、档案记录生成、脱水推演与历史快照管理。
// 维护边界：所有 AI 分析请求坹必经此层郥触；分析结果通过 useBookStore.saveMemoryBank 永久化。
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useBookStore } from '../../store/useBookStore';
import type { Book, Chapter, ChapterMemory } from '../../types';
import { useConfigStore } from '../../store/useConfigStore';
import { useIslandStore } from '../../store/useIslandStore';
import type { MemoryHistoryEntry } from '../../utils/electron';
import { electronAPI } from '../../utils/electron';
import { getPromptSync } from '../../utils/promptStore';
import { ChapterSidebar } from './memory-bank/ui/ChapterSidebar';
import type { InferenceView } from './memory-bank/ui/InferencePanel';
import type { InferenceTreeNode } from './memory-bank/ui/InferenceTreeView';
import { RecoveryPromptDialog } from './memory-bank/ui/RecoveryPromptDialog';
import {
 asSafeInference,
 buildInferenceContext,
 buildInferenceMergeContext,
 buildInferenceMergePrompt,
 buildInferencePrompt,
 createInferenceDataFromAiResponse,
 isMemoryExtracted,
 parseJsonLoosely,
 pickField,
 toInlineText,
 toNarrativeSegments,
 toSafePlotEvents,
 toSafePlotNodes,
 toSafeText,
 type SafeAiInference
} from './memory-bank/inferenceEngine';
import { stripHtml } from './memory-bank/utils';
import { inspectOrganizationHealth, type OrganizationHealthReport } from '../../Agent/organizationHealth';
import { applyRoleUpdateProposals, buildRoleUpdateProposals, type RoleUpdateProposal } from '../../Agent/roleUpdateProposals';

import {
 INFERENCE_BATCH_SIZE,
 INFERENCE_MAX_CHAPTERS,
 SMART_ORGANIZE_BATCH_SIZE,
 buildSmartOrganizeRules,
 prepareChapterTextForOrganization,
 chunkChapters,
 createChapterMemoryFromAnalysis,
 isFatalAiRequestError,
 mergeMemories,
 mergeMemoryKeepingExisting,
 toPlotHistoryData,
 type BatchAnalyzeResult,
 type PlotHistoryData,
 type RecoveryPrompt,
 type TabKey
} from './memory-bank/memoryBankLogic';
export function MemoryBankModal({ book, open, onClose }: { book: Book; open: boolean; onClose: () => void }) {
 const loadMemoryBank = useBookStore((s) => s.loadMemoryBank);
 const saveMemoryBank = useBookStore((s) => s.saveMemoryBank);
 const updateBook = useBookStore((s) => s.updateBook);
 const config = useConfigStore((s) => s.config);
 const saveConfig = useConfigStore((s) => s.saveConfig);
 const islandShow = useIslandStore((s) => s.show);
 const memoryBankChapterOrder = config?.ui.memoryBankChapterOrder === 'desc' ? 'desc' : 'asc';

 const [tab, setTab] = useState<TabKey>('plot');
 const [inferView, setInferView] = useState<InferenceView>('tree');
 const ragEnabled = config?.ai.ragEnabled ?? true;
 const [analyzingStatus, setAnalyzingStatus] = useState<Record<string, 'analyzing' | 'done' | 'error'>>({});
 const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
 const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
 const [keyword, setKeyword] = useState('');
 const [inferenceRunning, setInferenceRunning] = useState(false);
 const [loadedMemoryBookId, setLoadedMemoryBookId] = useState<string | null>(null);
 const [plotHistoryEntries, setPlotHistoryEntries] = useState<MemoryHistoryEntry[]>([]);
 const [activePlotHistoryId, setActivePlotHistoryId] = useState<string | null>(null);
 const [inferenceHistoryEntries, setInferenceHistoryEntries] = useState<MemoryHistoryEntry[]>([]);
 const [activeInferenceHistoryId, setActiveInferenceHistoryId] = useState<string | null>(null);
 const [collapsedTreePaths, setCollapsedTreePaths] = useState<Set<string>>(new Set());
 const [recoveryPrompt, setRecoveryPrompt] = useState<RecoveryPrompt | null>(null);
 const [rangeStartInput, setRangeStartInput] = useState('');
 const [rangeEndInput, setRangeEndInput] = useState('');
 const [healthReport, setHealthReport] = useState<OrganizationHealthReport | null>(null);
 const [roleUpdateProposals, setRoleUpdateProposals] = useState<RoleUpdateProposal[]>([]);
 const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());
 const [proposalReviewOpen, setProposalReviewOpen] = useState(false);
 const abortRequestedRef = useRef(false);

 const queueRoleUpdateProposals = (memories: ChapterMemory[]) => {
 if (config?.ai?.disableAutoRoleExtract) return;
 const latestBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
 const proposals = buildRoleUpdateProposals(latestBook, memories.flatMap((memory) => memory.archiveRecords || []));
 if (!proposals.length) return;
 setRoleUpdateProposals((prev) => {
 const byId = new Map(prev.map((proposal) => [proposal.id, proposal]));
 proposals.forEach((proposal) => byId.set(proposal.id, proposal));
 return Array.from(byId.values());
 });
 setSelectedProposalIds((prev) => new Set([...prev, ...proposals.map((proposal) => proposal.id)]));
 };

 const applySelectedRoleUpdates = async () => {
 const selected = roleUpdateProposals.filter((proposal) => selectedProposalIds.has(proposal.id));
 if (!selected.length) return;
 const latestBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
 const categories = applyRoleUpdateProposals(latestBook.resourceIndex?.customCharacterCategories, selected);
 await updateBook(book.id, {
 resourceIndex: {
 customCharacterCategories: categories,
 customViewTabs: latestBook.resourceIndex?.customViewTabs,
 novelType: latestBook.resourceIndex?.novelType,
 characterScan: latestBook.resourceIndex?.characterScan,
 roleExtractState: latestBook.resourceIndex?.roleExtractState,
 storyArchiveIndex: latestBook.resourceIndex?.storyArchiveIndex,
 schemaVersion: latestBook.resourceIndex?.schemaVersion ?? 1
 }
 });
 const appliedIds = new Set(selected.map((proposal) => proposal.id));
 setRoleUpdateProposals((prev) => prev.filter((proposal) => !appliedIds.has(proposal.id)));
 setSelectedProposalIds(new Set());
 setProposalReviewOpen(false);
 islandShow({ type: 'success', message: `已应用 ${selected.length} 组角色卡更新`, autoHideMs: 2200 });
 };

 const [exportDialogOpen, setExportDialogOpen] = useState(false);
 const [exportRangeStart, setExportRangeStart] = useState('');
 const [exportRangeEnd, setExportRangeEnd] = useState('');
 useEffect(() => {
 if (!open || !book.id) return;
 if (loadedMemoryBookId === book.id) return;
 void loadMemoryBank(book.id);
 void useBookStore.getState().ensureBookContentLoaded(book.id);
 setLoadedMemoryBookId(book.id);
 }, [book.id, loadMemoryBank, loadedMemoryBookId, open]);

 useEffect(() => {
 if (!open || !book.id) return;
 void (async () => {
 try {
 const [plotRes, inferenceRes] = await Promise.all([
 electronAPI.fs.loadMemoryHistory({ bookId: book.id, kind: 'plot' }),
 electronAPI.fs.loadMemoryHistory({ bookId: book.id, kind: 'inference' })
 ]);

 const plotEntries = ((plotRes?.entries || []) as MemoryHistoryEntry[])
 .slice()
 .sort((a, b) => String(b.at).localeCompare(String(a.at)));
 setPlotHistoryEntries(plotEntries);
 setActivePlotHistoryId((prev) => (prev && plotEntries.some((item) => item.id === prev) ? prev : plotEntries[0]?.id || null));

 const inferenceEntries = ((inferenceRes?.entries || []) as MemoryHistoryEntry[])
 .slice()
 .sort((a, b) => String(b.at).localeCompare(String(a.at)));
 setInferenceHistoryEntries(inferenceEntries);
 setActiveInferenceHistoryId((prev) => (prev && inferenceEntries.some((item) => item.id === prev) ? prev : inferenceEntries[0]?.id || null));
 } catch (error) {
 islandShow({
 type: 'error',
 message: '加载历史记录失败',
 detail: error instanceof Error ? error.message : String(error),
 autoHideMs: 2800
 });
 }
 })();
 }, [book.id, open]);

 useEffect(() => {
 if (open) return;
 if (loadedMemoryBookId !== null) setLoadedMemoryBookId(null);
 }, [loadedMemoryBookId, open]);

 const memoryBank = useMemo(() => book.memoryBank || [], [book.memoryBank]);
 useEffect(() => {
 if (!open || config?.ai?.disableAutoRoleExtract) return;
 const latestBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
 const proposals = buildRoleUpdateProposals(latestBook, memoryBank.flatMap((memory) => memory.archiveRecords || []));
 setRoleUpdateProposals(proposals);
 setSelectedProposalIds(new Set(proposals.map((proposal) => proposal.id)));
 }, [book.id, book.resourceIndex?.customCharacterCategories, config?.ai?.disableAutoRoleExtract, memoryBank, open]);
 const memoryMap = useMemo(() => new Map(memoryBank.map((item) => [item.chapterId, item])), [memoryBank]);
 const chapterIdSet = useMemo(() => new Set(book.chapters.map((chapter) => chapter.id)), [book.chapters]);
 const chapterNumberMap = useMemo(() => {
 const map = new Map<string, number>();
 book.chapters.forEach((chapter, index) => map.set(chapter.id, index + 1));
 return map;
 }, [book.chapters]);

 const orderedChapters = useMemo(
 () => (memoryBankChapterOrder === 'asc' ? book.chapters : [...book.chapters].reverse()),
 [book.chapters, memoryBankChapterOrder]
 );

 const filteredChapters = useMemo(() => {
 const key = keyword.trim();
 if (!key) return orderedChapters;
 return orderedChapters.filter((chapter) => {
 const chapterNo = chapterNumberMap.get(chapter.id) || 0;
 return chapter.title.includes(key) || String(chapterNo).includes(key);
 });
 }, [chapterNumberMap, keyword, orderedChapters]);

 const visibleChapterIds = useMemo(() => filteredChapters.map((chapter) => chapter.id), [filteredChapters]);
 const extractedChapterIds = useMemo(() => {
 const output = new Set<string>();
 for (const item of memoryBank) {
 if (isMemoryExtracted(item)) output.add(item.chapterId);
 }
 return output;
 }, [memoryBank]);

 const initializedRef = useRef(false);
 useEffect(() => {
 if (!open) {
 initializedRef.current = false;
 return;
 }
 if (initializedRef.current) return;
 if (selectedChapterIds.size === 0) {
 const anchorIndex = activeChapterId ? book.chapters.findIndex((chapter) => chapter.id === activeChapterId) : book.chapters.length - 1;
 const safeAnchor = anchorIndex >= 0 ? anchorIndex : book.chapters.length - 1;
 const defaultStart = Math.max(0, safeAnchor - 4);
 const initial = book.chapters.slice(defaultStart, safeAnchor + 1);
 if (initial.length > 0) {
 setSelectedChapterIds(new Set(initial.map((chapter) => chapter.id)));
 const currentNo = safeAnchor + 1;
 const startNo = defaultStart + 1;
 setRangeStartInput(String(startNo));
 setRangeEndInput(String(currentNo));
 setActiveChapterId(book.chapters[safeAnchor]?.id || initial[initial.length - 1].id);
 }
 }
 initializedRef.current = true;
 }, [activeChapterId, book.chapters, open, selectedChapterIds.size]);

 const currentChapterId =
 (activeChapterId && chapterIdSet.has(activeChapterId) ? activeChapterId : null) ||
 Array.from(selectedChapterIds).find((id) => chapterIdSet.has(id)) ||
 null;
 const currentChapter = currentChapterId ? book.chapters.find((chapter) => chapter.id === currentChapterId) || null : null;
 const currentMemory = currentChapter ? memoryMap.get(currentChapter.id) : undefined;

 useEffect(() => {
 if (!currentChapter) return;
 const currentIndex = book.chapters.findIndex((chapter) => chapter.id === currentChapter.id);
 if (currentIndex < 0) return;
 const defaultStart = Math.max(0, currentIndex - 4);
 if (!rangeStartInput) setRangeStartInput(String(defaultStart + 1));
 if (!rangeEndInput) setRangeEndInput(String(currentIndex + 1));
 }, [book.chapters, currentChapter, rangeEndInput, rangeStartInput]);

 const toggleSelect = (chapterId: string) => {
 setSelectedChapterIds((prev) => {
 const next = new Set(prev);
 if (next.has(chapterId)) next.delete(chapterId);
 else next.add(chapterId);
 return next;
 });
 };

 const selectAll = () => {
 startTransition(() => {
 setSelectedChapterIds((prev) => {
 const allVisibleSelected = visibleChapterIds.every((id) => prev.has(id));
 const next = new Set(prev);
 if (allVisibleSelected) visibleChapterIds.forEach((id) => next.delete(id));
 else visibleChapterIds.forEach((id) => next.add(id));
 return next;
 });
 });
 };

 const selectAllFollowing = (chapterId: string) => {
 const index = filteredChapters.findIndex((chapter) => chapter.id === chapterId);
 if (index === -1) return;
 const followingIds = filteredChapters.slice(index).map((chapter) => chapter.id);
 startTransition(() => {
 setSelectedChapterIds((prev) => {
 const next = new Set(prev);
 followingIds.forEach((id) => next.add(id));
 return next;
 });
 });
 };

 const upsertMemory = async (chapterId: string, updater: (prev: ChapterMemory | undefined) => ChapterMemory) => {
 const current = memoryBank.find((item) => item.chapterId === chapterId);
 const next = mergeMemoryKeepingExisting(current, updater(current));
 const merged = memoryBank.filter((item) => item.chapterId !== chapterId).concat(next);
 await saveMemoryBank(book.id, merged);
 };

 const toggleMemoryBankChapterOrder = async () => {
 const nextOrder: 'asc' | 'desc' = memoryBankChapterOrder === 'asc' ? 'desc' : 'asc';
 if (!config) return;
 await saveConfig({
 ...config,
 ui: {
 ...config.ui,
 memoryBankChapterOrder: nextOrder
 }
 });
 };

 const applyInferenceRangeSelection = () => {
 const { show } = useIslandStore.getState();
 const total = book.chapters.length;
 if (total === 0) return;
 let start = Number(rangeStartInput);
 let end = Number(rangeEndInput);
 if (!Number.isFinite(start) || !Number.isFinite(end)) {
 show({ type: 'warning', message: '请输入有效的章节范围', autoHideMs: 2200 });
 return;
 }
 start = Math.max(1, Math.min(total, Math.floor(start)));
 end = Math.max(1, Math.min(total, Math.floor(end)));
 if (start > end) [start, end] = [end, start];
 const range = book.chapters.slice(start - 1, end);
 if (range.length === 0) {
 show({ type: 'warning', message: '当前范围没有章节', autoHideMs: 2200 });
 return;
 }
 setRangeStartInput(String(start));
 setRangeEndInput(String(end));
 setSelectedChapterIds(new Set(range.map((chapter) => chapter.id)));
 setActiveChapterId((prev) => (prev && range.some((chapter) => chapter.id === prev) ? prev : range[range.length - 1].id));
 show({ type: 'success', message: `已选中第 ${start} - ${end} 章`, autoHideMs: 1400 });
 };

 const showRecoveryPrompt = (prompt: RecoveryPrompt) => {
 setRecoveryPrompt(prompt);
 useIslandStore.getState().show({
 type: 'warning',
 status: 'feedback',
 message: prompt.title,
 detail: prompt.detail
 });
 };

 const formatHistoryTaskLabel = (entry: MemoryHistoryEntry, action: string): string => {
 const time = new Date(entry.at).toLocaleString();
 const count = entry.chapterIds?.length || entry.chapterTitles?.length || 0;
 const firstTitle = entry.chapterTitles?.[0] || '未标注章节';
 const lastTitle = entry.chapterTitles?.length ? entry.chapterTitles[entry.chapterTitles.length - 1] : '';
 const rangeLabel = count > 1 && lastTitle && lastTitle !== firstTitle ? `${firstTitle} 至 ${lastTitle}` : firstTitle;
 return `${time} ${action} ${count || 1}章 | ${rangeLabel}${entry.model ? ` | ${entry.model}` : ''}`;
 };

 const reloadPlotHistory = async (preferId?: string | null) => {
 const res = await electronAPI.fs.loadMemoryHistory({ bookId: book.id, kind: 'plot' });
 const entries = ((res?.entries || []) as MemoryHistoryEntry[])
 .slice()
 .sort((a, b) => String(b.at).localeCompare(String(a.at)));
 setPlotHistoryEntries(entries);
 setActivePlotHistoryId((prev) => {
 if (preferId && entries.some((item) => item.id === preferId)) return preferId;
 if (prev && entries.some((item) => item.id === prev)) return prev;
 return entries[0]?.id || null;
 });
 };

 const reloadInferenceHistory = async (preferId?: string | null) => {
 const res = await electronAPI.fs.loadMemoryHistory({ bookId: book.id, kind: 'inference' });
 const entries = ((res?.entries || []) as MemoryHistoryEntry[])
 .slice()
 .sort((a, b) => String(b.at).localeCompare(String(a.at)));
 setInferenceHistoryEntries(entries);
 setActiveInferenceHistoryId((prev) => {
 if (preferId && entries.some((item) => item.id === preferId)) return preferId;
 if (prev && entries.some((item) => item.id === prev)) return prev;
 return entries[0]?.id || null;
 });
 };

 const analyzeOneChapter = async (
 chapter: Chapter,
 options: { saveHistory?: boolean; persistMemory?: boolean } = {}
 ): Promise<ChapterMemory | null> => {
 const saveHistory = options.saveHistory ?? true;
 const persistMemory = options.persistMemory ?? true;
 // 空章节防御：标题占位、未写正文的章节直接拒绝整理，避免 LLM 凭标题"虚空生成"剧情
 const plainText = stripHtml(await useBookStore.getState().ensureChapterContent(book.id, chapter.id)).trim();
 if (plainText.length < 30) {
 const { show } = useIslandStore.getState();
 show({
 type: 'warning',
 message: `《${chapter.title}》正文为空或过短，已跳过整理`,
 detail: '请先写入正文（至少 30 字）后再尝试整理，避免 AI 凭标题虚空生成剧情。',
 autoHideMs: 4000
 });
 setAnalyzingStatus((prev) => {
 const copy = { ...prev };
 delete copy[chapter.id];
 return copy;
 });
 return null;
 }
 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'analyzing' }));
 const { show, hide } = useIslandStore.getState();
 show({ type: 'progress', status: 'thinking', message: `正在智能整理：${chapter.title}` });
 let rawText = '';
 try {
 const prompt = `请智能整理以下章节正文，提取剧情档案信息，并仅返回严格 JSON（不要 Markdown）：\n\n${prepareChapterTextForOrganization(plainText)}\n\n${buildSmartOrganizeRules({ disableRoleExtract: config?.ai?.disableAutoRoleExtract })}`;
 const res = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 disableStyle: true,
 maxTokens: 16384,
 messages: [
 { role: 'system', content: getPromptSync('smart_organize_system', '你是网文剧情档案整理助手，必须只输出严格 JSON。') },
 { role: 'user', content: prompt }
 ]
 });
 rawText = String(res?.text || '');
 const analysis = parseJsonLoosely<Record<string, unknown>>(rawText || '{}');
 const nextMemory = createChapterMemoryFromAnalysis(analysis, chapter, { disableRoleExtract: config?.ai?.disableAutoRoleExtract });

 if (persistMemory) {
 await upsertMemory(chapter.id, (prev) => ({ ...nextMemory, aiInference: prev?.aiInference }));
 queueRoleUpdateProposals([nextMemory]);
 }

 if (saveHistory) {
 const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
 const plotEntry: MemoryHistoryEntry = {
 id: entryId,
 at: new Date().toISOString(),
 model: `${res?.provider || ''} ${res?.model || ''}`.trim() || undefined,
 chapterIds: [chapter.id],
 chapterTitles: [chapter.title],
 data: toPlotHistoryData(nextMemory)
 };
 await electronAPI.fs.saveMemoryHistory({ bookId: book.id, kind: 'plot', entry: plotEntry });
 await reloadPlotHistory(entryId);
 }

 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'done' }));
 show({ type: 'success', message: `整理完成：${chapter.title}`, autoHideMs: 1200 });
 return nextMemory;
 } catch (error) {
 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'error' }));
 hide(); // 清除进度提示
 const reason = error instanceof Error ? error.message : String(error);
 show({
 type: 'error',
 message: `智能整理失败：${chapter.title}`,
 detail: `原因：${reason}\n\nAI返回前300字：${(rawText || '(空)').slice(0, 300)}`,
 autoHideMs: 12000
 });
 showRecoveryPrompt({
 title: '剧情脉络整理中断',
 detail: `中断在《${chapter.title}》。已完成内容已保存，可点击继续重试本章。\n原因：${reason}\n\nAI返回前300字：${(rawText || '(空)').slice(0, 300)}`,
 onResume: () => void analyzeOneChapter(chapter)
 });
 return null;
 }
 };

 const analyzeChapterBatch = async (chapters: Chapter[]): Promise<BatchAnalyzeResult> => {
 const { show, startTask, updateTask, finishTask } = useIslandStore.getState();
 const memories: ChapterMemory[] = [];
 let lastModel: string | undefined;
 const taskId = startTask({
 type: 'progress',
 status: 'thinking',
 message: `正在整理 ${chapters[0]?.title || ''}`,
 actions: [{ id: 'abort-organize', label: '中断', onClick: () => { abortRequestedRef.current = true; void electronAPI.ai.abort('main'); } }]
 });

 for (let i = 0; i < chapters.length; i++) {
 if (abortRequestedRef.current) {
 show({ type: 'warning', message: '已中断智能整理', autoHideMs: 2000 });
 break;
 }
 const chapter = chapters[i];
 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'analyzing' }));
 updateTask(taskId, { message: `正在整理 ${chapter.title}` });

 const content = prepareChapterTextForOrganization(stripHtml(await useBookStore.getState().ensureChapterContent(book.id, chapter.id)));
 if (content.trim().length < 30) {
 // 空章节/标题占位章节防御：避免 LLM 凭标题虚空生成
 setAnalyzingStatus((prev) => {
 const copy = { ...prev };
 delete copy[chapter.id];
 return copy;
 });
 continue;
 }

 const prompt = `请分析以下小说章节正文，提取剧情档案信息。输出严格的 JSON，不要 Markdown。\n\n${content}\n\n${buildSmartOrganizeRules({ disableRoleExtract: config?.ai?.disableAutoRoleExtract })}`;
 let rawAiResponse = '';
 try {
 const res = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 disableStyle: true,
 maxTokens: 16384,
 messages: [
 { role: 'system', content: getPromptSync('smart_organize_system', '你是小说的剧情档案分析助手，输出只能是严格的 JSON。') },
 { role: 'user', content: prompt }
 ]
 });
 rawAiResponse = String(res?.text || '').slice(0, 500);

 const parsed = parseJsonLoosely<Record<string, unknown>>(String(res?.text || '{}'));
 const memory = createChapterMemoryFromAnalysis(parsed, chapter, { disableRoleExtract: config?.ai?.disableAutoRoleExtract });
 memories.push(memory);
 lastModel = `${res?.provider || ''} ${res?.model || ''}`.trim() || undefined;
 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'done' }));
 } catch (chapterError) {
 // 单章解析失败不中断整批，标记为错误并继续
 setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'error' }));
 const errMsg = chapterError instanceof Error ? chapterError.message : String(chapterError);
 const detail = rawAiResponse
 ? `错误：${errMsg}\n\nAI原始返回（前500字）：\n${rawAiResponse}`
 : `错误：${errMsg}`;
 show({ type: 'warning', message: `${chapter.title} 整理失败，已跳过`, detail, autoHideMs: 8000 });
 }
 }

 finishTask(taskId);
 show({ type: 'success', message: `批量整理完成 ${memories.length} 章`, autoHideMs: 1200 });
 return {
 memories,
 model: lastModel,
 batchSummary: `已逐章整理 ${memories.length} 章`
 };
 };

 const handleBatchAnalyze = async (resumeChapterIds?: string[]) => {
 if (!resumeChapterIds && selectedChapterIds.size === 0) return;
 const resumeSet = resumeChapterIds ? new Set(resumeChapterIds) : selectedChapterIds;
 const targets = book.chapters.filter((chapter) => resumeSet.has(chapter.id));
 if (targets.length === 0) return;

 abortRequestedRef.current = false; // 重置中断标志
 const batches = chunkChapters(targets, SMART_ORGANIZE_BATCH_SIZE);
 let workingMemory = memoryBank;
 let latestEntryId: string | null = null;
 const taskMemories: ChapterMemory[] = [];
 const taskSummaries: string[] = [];
 let taskModel: string | undefined;
 const { show } = useIslandStore.getState();

 for (const batch of batches) {
 if (abortRequestedRef.current) break; // 外层循环也检查中断
 try {
 const result = await analyzeChapterBatch(batch);
 workingMemory = mergeMemories(workingMemory, result.memories);
 await saveMemoryBank(book.id, workingMemory);
 queueRoleUpdateProposals(result.memories);
 taskMemories.push(...result.memories);
 if (result.batchSummary) taskSummaries.push(result.batchSummary);
 taskModel = taskModel || result.model;

 batch.forEach((chapter) => setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'done' })));
 show({ type: 'success', message: `批量整理完成 ${batch.length} 章`, autoHideMs: 1200 });
 } catch (error) {
 if (isFatalAiRequestError(error)) {
 batch.forEach((chapter) => setAnalyzingStatus((prev) => ({ ...prev, [chapter.id]: 'error' })));
 const failedIndex = targets.findIndex((chapter) => chapter.id === batch[0]?.id);
 const remainingIds = targets.slice(Math.max(0, failedIndex)).map((chapter) => chapter.id);
 const reason = error instanceof Error ? error.message : String(error);
 show({
 type: 'error',
 message: '智能整理已停止',
 detail: reason,
 autoHideMs: 5200
 });
 showRecoveryPrompt({
 title: '剧情脉络整理中断',
 detail: `中断在《${batch[0]?.title || '当前批次'}》这一批，之前成功章节已保存。点击继续会从这一批重新开始。\n原因：${reason}`,
 onResume: () => void handleBatchAnalyze(remainingIds)
 });
 break;
 }

 show({
 type: 'warning',
 message: `批量整理失败，改用单章兜底：${batch[0]?.title || ''}`,
 detail: error instanceof Error ? error.message : String(error),
 autoHideMs: 3600
 });
 const fallbackMemories: ChapterMemory[] = [];
 for (const chapter of batch) {
 const fallbackMemory = await analyzeOneChapter(chapter, { saveHistory: false, persistMemory: false });
 if (fallbackMemory) fallbackMemories.push(fallbackMemory);
 }
 if (fallbackMemories.length > 0) {
 workingMemory = mergeMemories(workingMemory, fallbackMemories);
 await saveMemoryBank(book.id, workingMemory);
 queueRoleUpdateProposals(fallbackMemories);
 taskMemories.push(...fallbackMemories);
 taskSummaries.push('批量整理失败后由单章兜底合并生成');
 }
 }
 }

 if (taskMemories.length > 0) {
 const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
 latestEntryId = entryId;
 const taskChapterIds = taskMemories.map((memory) => memory.chapterId);
 const taskChapterTitles = taskChapterIds.map((chapterId) => book.chapters.find((chapter) => chapter.id === chapterId)?.title || chapterId);
 await electronAPI.fs.saveMemoryHistory({
 bookId: book.id,
 kind: 'plot',
 entry: {
 id: entryId,
 at: new Date().toISOString(),
 model: taskModel,
 chapterIds: taskChapterIds,
 chapterTitles: taskChapterTitles,
 data: {
 batchSummary: taskSummaries.filter(Boolean).join('\n') || `本次共整理 ${taskMemories.length} 章`,
 memories: taskMemories.map((memory) => toPlotHistoryData(memory))
 }
 }
 });
 }

 await reloadPlotHistory(latestEntryId);
 };

 const normalizePlotHistoryData = (value: unknown, preferChapterId?: string | null): PlotHistoryData | null => {
 if (!value || typeof value !== 'object') return null;
 const row = value as Record<string, unknown>;
 const memories = pickField<unknown[]>(row, ['memories', 'memoryBank', 'entries']);
 if (Array.isArray(memories) && memories.length > 0) {
 const pickedRaw =
 (preferChapterId
 ? memories.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).chapterId || '') === preferChapterId)
 : null) || memories[0];
 return normalizePlotHistoryData(pickedRaw, preferChapterId);
 }

 const chapterId = toInlineText(pickField(row, ['chapterId', 'chapter_id'])).trim() || (preferChapterId || '');
 const summary = toSafeText(pickField(row, ['summary', '摘要'])).trim();
 const narrativeChain = toSafeText(pickField(row, ['narrativeChain', '剧情脉络']));
 const keyNodes = toSafePlotNodes(pickField(row, ['keyNodes', '关键节点']));
 const plotSynopsis = toSafeText(pickField(row, ['plotSynopsis', '章节剧情', '章节剧情梗概', 'functionSummary', '章节核心功能']));
 const acquisitions = toSafePlotEvents(pickField(row, ['acquisitions', '获得事件']));
 const alliances = toSafePlotEvents(pickField(row, ['alliances', '结盟事件']));
 const relationProgress = toSafePlotEvents(pickField(row, ['relationProgress', '关系进展']));
 const nestedPlot = pickField<Record<string, unknown>>(row, ['plotAnalysis', 'plot', '剧情']);

 const plotAnalysis = nestedPlot
 ? {
 narrativeChain: toSafeText(pickField(nestedPlot, ['narrativeChain', '剧情脉络'])),
 keyNodes: toSafePlotNodes(pickField(nestedPlot, ['keyNodes', '关键节点'])) as any,
 plotSynopsis: toSafeText(pickField(nestedPlot, ['plotSynopsis', '章节剧情', '章节剧情梗概', 'functionSummary', '章节核心功能'])),
 functionSummary: toSafeText(pickField(nestedPlot, ['plotSynopsis', '章节剧情', '章节剧情梗概', 'functionSummary', '章节核心功能'])),
 acquisitions: toSafePlotEvents(pickField(nestedPlot, ['acquisitions', '获得事件'])) as any,
 alliances: toSafePlotEvents(pickField(nestedPlot, ['alliances', '结盟事件'])) as any,
 relationProgress: toSafePlotEvents(pickField(nestedPlot, ['relationProgress', '关系进展'])) as any
 }
 : {
 narrativeChain,
 keyNodes: keyNodes as any,
 plotSynopsis,
 functionSummary: plotSynopsis,
 acquisitions: acquisitions as any,
 alliances: alliances as any,
 relationProgress: relationProgress as any
 };

 if (
 !summary &&
 !plotAnalysis.narrativeChain &&
 plotAnalysis.keyNodes.length === 0 &&
 !toSafeText(plotAnalysis.plotSynopsis || plotAnalysis.functionSummary).trim() &&
 (plotAnalysis.acquisitions || []).length === 0 &&
 (plotAnalysis.alliances || []).length === 0 &&
 (plotAnalysis.relationProgress || []).length === 0
 ) {
 return null;
 }

 return {
 chapterId: chapterId || (preferChapterId || ''),
 summary,
 isAnalyzed: true,
 plotAnalysis
 };
 };

 const runInferenceForCurrent = async () => {
 if (!currentChapter) return;
 const { show } = useIslandStore.getState();
 setInferenceRunning(true);
 let effectiveTargets: Chapter[] = [];

 try {
 const selectedTargets = book.chapters.filter((chapter) => selectedChapterIds.has(chapter.id));
 if (selectedTargets.length > 0) {
 effectiveTargets = selectedTargets;
 } else {
 const currentIndex = book.chapters.findIndex((chapter) => chapter.id === currentChapter.id);
 const defaultStart = currentIndex >= 0 ? Math.max(0, currentIndex - 4) : 0;
 const defaultEnd = currentIndex >= 0 ? currentIndex : 0;
 effectiveTargets = book.chapters.slice(defaultStart, defaultEnd + 1);
 }

 effectiveTargets = effectiveTargets.slice().sort((a, b) => {
 const aIndex = book.chapters.findIndex((chapter) => chapter.id === a.id);
 const bIndex = book.chapters.findIndex((chapter) => chapter.id === b.id);
 return aIndex - bIndex;
 });

 if (effectiveTargets.length > INFERENCE_MAX_CHAPTERS) {
 effectiveTargets = effectiveTargets.slice(effectiveTargets.length - INFERENCE_MAX_CHAPTERS);
 show({
 type: 'warning',
 message: `已自动限制为最近 ${INFERENCE_MAX_CHAPTERS} 章进行推演`,
 autoHideMs: 1800
 });
 }

 // E-fix: 推理兑底会读章节正文，先整本水合一次，避免懒加载下拿到空正文
 await useBookStore.getState().ensureBookContentLoaded(book.id);
 const chunks = chunkChapters(effectiveTargets, INFERENCE_BATCH_SIZE);
 const batchInferences: SafeAiInference[] = [];

 for (let index = 0; index < chunks.length; index += 1) {
 const chunk = chunks[index];
 const freshBookForCtx = useBookStore.getState().books.find((b) => b.id === book.id);
 const chunkFresh = chunk.map((c) => freshBookForCtx?.chapters.find((x) => x.id === c.id) || c);
 const context = buildInferenceContext(chunkFresh, memoryMap);
 const prompt = buildInferencePrompt(context);
 show({
 type: 'progress',
 status: 'thinking',
 message: `结构推演批次 ${index + 1}/${chunks.length}（每批 ${INFERENCE_BATCH_SIZE} 章）`
 });

 const res = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: currentChapter.id,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: getPromptSync('smart_organize_system', '你是小说结构推演助手，必须只输出 JSON。') },
 { role: 'user', content: prompt }
 ]
 });

 batchInferences.push(createInferenceDataFromAiResponse(String(res?.text || ''), res?.provider, res?.model));
 }

 if (batchInferences.length === 0) throw new Error('未获得任何推演结果');

 let inferenceData: SafeAiInference;
 if (batchInferences.length === 1) {
 inferenceData = batchInferences[0];
 } else {
 const mergeContext = buildInferenceMergeContext(batchInferences.map((item) => item.rawText || ''));
 const mergePrompt = buildInferenceMergePrompt(mergeContext);
 show({ type: 'progress', status: 'thinking', message: '正在合并结构推演结果...' });
 const mergeRes = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: currentChapter.id,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: getPromptSync('smart_organize_system', '你是小说结构推演助手，必须只输出 JSON。') },
 { role: 'user', content: mergePrompt }
 ]
 });
 inferenceData = createInferenceDataFromAiResponse(String(mergeRes?.text || ''), mergeRes?.provider, mergeRes?.model);
 }

 await upsertMemory(currentChapter.id, (prev) => ({
 chapterId: currentChapter.id,
 summary: prev?.summary || '',
 isAnalyzed: prev?.isAnalyzed || false,
 plotAnalysis: prev?.plotAnalysis,
 aiInference: inferenceData
 }));

 const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
 const historyEntry: MemoryHistoryEntry = {
 id: entryId,
 at: new Date().toISOString(),
 model: inferenceData.providerModel,
 chapterIds: effectiveTargets.map((chapter) => chapter.id),
 chapterTitles: effectiveTargets.map((chapter) => chapter.title),
 data: inferenceData
 };
 await electronAPI.fs.saveMemoryHistory({ bookId: book.id, kind: 'inference', entry: historyEntry });
 await reloadInferenceHistory(entryId);
 applyDefaultTreeCollapse(inferenceData);
 show({ type: 'success', message: '结构推演完成', autoHideMs: 1500 });
 } catch (error) {
 const reason = error instanceof Error ? error.message : String(error);
 show({
 type: 'error',
 message: '结构推演失败',
 detail: reason,
 autoHideMs: 4200
 });
 showRecoveryPrompt({
 title: 'AI 结构推演中断',
 detail: `中断章节：${currentChapter.title}\n推演范围：${effectiveTargets.map((chapter) => chapter.title).join('、') || currentChapter.title}\n原因：${reason}`,
 onResume: () => void runInferenceForCurrent()
 });
 } finally {
 setInferenceRunning(false);
 }
 };

 const clearCurrentInference = async () => {
 if (activeInferenceHistoryId) {
 const target = inferenceHistoryEntries.find((entry) => entry.id === activeInferenceHistoryId);
 const label = target ? formatHistoryTaskLabel(target, '推演') : '当前推演记录';
 const confirmed = window.confirm(`确定删除这条结构推演记录吗？\n\n${label}\n\n只删除历史记录，不会清空章节正文或剧情档案。`);
 if (!confirmed) return;
 await electronAPI.fs.deleteMemoryHistory({ bookId: book.id, kind: 'inference', id: activeInferenceHistoryId });
 await reloadInferenceHistory(null);
 return;
 }
 if (!currentChapter) return;
 const confirmed = window.confirm(`确定清空《${currentChapter.title}》的当前结构推演结果吗？`);
 if (!confirmed) return;
 await upsertMemory(currentChapter.id, (prev) => ({
 chapterId: currentChapter.id,
 summary: prev?.summary || '',
 isAnalyzed: prev?.isAnalyzed || false,
 plotAnalysis: prev?.plotAnalysis,
 aiInference: undefined
 }));
 };

 const clearAllInference = async () => {
 const confirmed = window.confirm('确定删除全部结构推演记录，并清空所有章节的结构推演结果吗？');
 if (!confirmed) return;
 const next = memoryBank.map((item) => ({ ...item, aiInference: undefined }));
 await saveMemoryBank(book.id, next);
 await electronAPI.fs.clearMemoryHistory({ bookId: book.id, kind: 'inference' });
 setInferenceHistoryEntries([]);
 setActiveInferenceHistoryId(null);
 };

 const deleteActivePlotHistoryRecord = async () => {
 if (!activePlotHistoryId) return;
 const target = plotHistoryEntries.find((entry) => entry.id === activePlotHistoryId);
 const label = target ? formatHistoryTaskLabel(target, '提取') : '当前提取记录';
 const confirmed = window.confirm(`确定删除这条提取记录吗？\n\n${label}\n\n只删除历史记录，不会清空章节档案内容。`);
 if (!confirmed) return;
 await electronAPI.fs.deleteMemoryHistory({ bookId: book.id, kind: 'plot', id: activePlotHistoryId });
 await reloadPlotHistory(null);
 };

 const clearAllPlot = async () => {
 const confirmed = window.confirm('确定删除全部提取记录，并清空所有章节的剧情档案内容吗？');
 if (!confirmed) return;
 await electronAPI.fs.clearMemoryHistory({ bookId: book.id, kind: 'plot' });
 const next = memoryBank.map((item) => ({ ...item, summary: '', isAnalyzed: false, plotAnalysis: undefined, archiveRecords: undefined }));
 await saveMemoryBank(book.id, next);
 setPlotHistoryEntries([]);
 setActivePlotHistoryId(null);
 };

 // 删除单章的整理结果（从 memoryBank 中完全移除该章数据）
 const deleteChapterMemory = async (chapterId: string) => {
 const chapter = book.chapters.find((c) => c.id === chapterId);
 const confirmed = window.confirm(`确定删除「${chapter?.title || '该章节'}」的智能整理结果吗？\n\n删除后可以重新整理。`);
 if (!confirmed) return;
 const next = memoryBank.filter((item) => item.chapterId !== chapterId);
 await saveMemoryBank(book.id, next);
 setAnalyzingStatus((prev) => {
 const copy = { ...prev };
 delete copy[chapterId];
 return copy;
 });
 const { show } = useIslandStore.getState();
 show({ type: 'success', message: `已删除「${chapter?.title || '该章节'}」的整理结果`, autoHideMs: 1500 });
 };
 const exportInferenceJson = async () => {
 if (!activeInference) return;
 await navigator.clipboard.writeText(JSON.stringify(activeInference, null, 2));
 useIslandStore.getState().show({ type: 'success', message: '已复制 JSON', autoHideMs: 1200 });
 };

 const formatInferenceTreeMd = (node: InferenceTreeNode, depth = 0): string[] => {
 const indent = ' '.repeat(depth);
 const typeLabel = node.type === 'root' ? '总纲' : node.type === 'arc' ? '主线/支线' : node.type === 'event' ? '剧情段' : '变化点';
 const line = `${indent}- **${node.label}**（${typeLabel}）${node.desc ? `：${node.desc}` : ''}`;
 return [line, ...(node.children || []).flatMap((child) => formatInferenceTreeMd(child, depth + 1))];
 };

 const exportInferenceMd = async () => {
 if (!activeInference) return;
 const data = activeInference;
 const md = [
 `# ${currentChapter?.title || '当前章节'} - 结构推演`,
 '',
 '## 结构树',
 ...(data.structureTree ? formatInferenceTreeMd(data.structureTree as unknown as InferenceTreeNode) : ['- 暂无']),
 '',
 '## 时空视图',
 ...(data.timelineEvents || []).map(
 (item) => `- ${item.time || '未定时段'} @ ${item.location || '未定地点'}：${item.event}（影响${item.impact}）${item.contextQuote ? ` [锚点：${item.contextQuote}]` : ''}`
 ),
 '',
 '## 并行线索',
 ...(data.parallelThreads || []).map((item) => `- ${item.name} [${item.status}]：${item.progress}`),
 '',
 '## 预测',
 ...(data.predictions || []).map((item) => `- ${item.direction}（${item.probability || '中'}）：${item.suggestion}`)
 ].join('\n');
 await navigator.clipboard.writeText(md);
 useIslandStore.getState().show({ type: 'success', message: '已复制 Markdown', autoHideMs: 1200 });
 };

 // ── 导出智能整理 ────────────────────────────────────────────────
 const parseExportRange = (startStr: string, endStr: string, total: number): { start: number; end: number } | null => {
 const start = Number(startStr.trim());
 const end = Number(endStr.trim());
 if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
 if (start < 1 || end < 1 || start > total || end > total) return null;
 return { start: Math.min(start, end), end: Math.max(start, end) };
 };

 const buildChapterExportTxt = (chapter: Chapter, memory: ChapterMemory | undefined): string[] => {
 if (!memory?.plotAnalysis) {
 return [
 `【第${chapterNumberMap.get(chapter.id) || '?'}章】${chapter.title}`,
 '暂无智能整理结果\n'
 ];
 }
 const pa = memory.plotAnalysis;
 const segments = toNarrativeSegments(memory);
 const synopsis = toSafeText(pa.plotSynopsis || pa.functionSummary).trim();
 const keyNodes = toSafePlotNodes(pa.keyNodes);
 const acquisitions = toSafePlotEvents(pa.acquisitions);
 const alliances = toSafePlotEvents(pa.alliances);
 const relationProgress = toSafePlotEvents(pa.relationProgress);

 const lines: string[] = [
 `【第${chapterNumberMap.get(chapter.id) || '?'}章】${chapter.title}`,
 `字数：${chapter.wordCount || 0}`,
 ];

 if (segments.length > 0) {
 lines.push(`运镜链：${segments.join(' → ')}`);
 }
 if (synopsis) {
 lines.push(`剧情摘要：${synopsis}`);
 }
 lines.push('');

 if (keyNodes.length > 0) {
 lines.push('关键节点：');
 keyNodes.forEach((node, i) => {
 lines.push(`${i + 1}. [${node.nodeType}] ${node.action}${node.time ? `（时间：${node.time}）` : ''}${node.impactLevel ? ` — 冲击力：${node.impactLevel}` : ''}`);
 });
 lines.push('');
 }

 if (acquisitions.length > 0) {
 lines.push('获得事件：');
 acquisitions.forEach((item, i) => {
 lines.push(`${i + 1}. ${item.subject}${item.target ? ` 获得 ${item.target}` : ''}：${item.detail}`);
 });
 lines.push('');
 }

 if (alliances.length > 0) {
 lines.push('结盟事件：');
 alliances.forEach((item, i) => {
 lines.push(`${i + 1}. ${item.subject}${item.target ? ` ↔ ${item.target}` : ''}：${item.detail}`);
 });
 lines.push('');
 }

 if (relationProgress.length > 0) {
 lines.push('关系进展：');
 relationProgress.forEach((item, i) => {
 lines.push(`${i + 1}. ${item.subject}${item.target ? ` 与 ${item.target}` : ''}：${item.detail}`);
 });
 lines.push('');
 }

 return lines;
 };

 const handleExportSmartOrganize = async (mode: 'all' | 'range') => {
 const { requireLogin } = await import('../../utils/featureCheck');
 if (!requireLogin('使用剧情档案库')) {
 setExportDialogOpen(false);
 return;
 }

 const totalChapters = book.chapters.length;
 let targetChapters: Chapter[];

 if (mode === 'all') {
 targetChapters = book.chapters;
 } else {
 const range = parseExportRange(exportRangeStart, exportRangeEnd, totalChapters);
 if (!range) {
 useIslandStore.getState().show({ type: 'error', message: '范围输入无效', detail: `请输入 1-${totalChapters} 之间的数字`, autoHideMs: 3000 });
 return;
 }
 targetChapters = book.chapters.slice(range.start - 1, range.end);
 }

 if (targetChapters.length === 0) {
 useIslandStore.getState().show({ type: 'warning', message: '没有章节可导出', autoHideMs: 2000 });
 return;
 }

 const txtLines: string[] = [`《${book.title}》智能整理导出`, `共 ${targetChapters.length} 章\n`];

 for (const chapter of targetChapters) {
 const mem = memoryMap.get(chapter.id);
 txtLines.push(...buildChapterExportTxt(chapter, mem));
 }

 const finalTxt = txtLines.join('\n');

 // 让用户选择保存路径
 try {
 const { path } = await electronAPI.fs.selectSavePath({
 defaultPath: `《${book.title}》智能整理.txt`,
 title: '保存智能整理导出',
 });
 if (!path) {
 useIslandStore.getState().show({ type: 'warning', message: '已取消保存', autoHideMs: 1500 });
 return;
 }

 await electronAPI.fs.saveTextFile({ path, content: finalTxt });
 useIslandStore.getState().show({
 type: 'success',
 message: `已导出 ${targetChapters.length} 章整理内容`,
 detail: `保存到：${path}`,
 autoHideMs: 4000,
 });
 } catch (err) {
 useIslandStore.getState().show({
 type: 'error',
 message: '导出失败',
 detail: String((err as Error)?.message || err).slice(0, 200),
 autoHideMs: 6000,
 });
 }
 setExportDialogOpen(false);
 };

 const latestPlotHistoryByChapterId = useMemo(() => {
 const map = new Map<string, string>();
 for (const entry of plotHistoryEntries) {
 for (const chapterId of entry.chapterIds || []) {
 if (!map.has(chapterId)) map.set(chapterId, entry.id);
 }
 }
 return map;
 }, [plotHistoryEntries]);

 const latestInferenceHistoryByChapterId = useMemo(() => {
 const map = new Map<string, string>();
 for (const entry of inferenceHistoryEntries) {
 for (const chapterId of entry.chapterIds || []) {
 if (!map.has(chapterId)) map.set(chapterId, entry.id);
 }
 }
 return map;
 }, [inferenceHistoryEntries]);

 const handleActivateChapter = (chapterId: string) => {
 setActiveChapterId(chapterId);
 setActivePlotHistoryId(latestPlotHistoryByChapterId.get(chapterId) || null);
 setActiveInferenceHistoryId(latestInferenceHistoryByChapterId.get(chapterId) || null);
 const index = book.chapters.findIndex((chapter) => chapter.id === chapterId);
 if (index >= 0) {
 const start = Math.max(0, index - 4);
 setRangeStartInput(String(start + 1));
 setRangeEndInput(String(index + 1));
 }
 };

 const hasAnalyzing = Object.values(analyzingStatus).includes('analyzing');
 const activePlotHistoryEntry = plotHistoryEntries.find((item) => item.id === activePlotHistoryId);
 const activePlotMemory = normalizePlotHistoryData(activePlotHistoryEntry?.data, currentChapter?.id || null);
 const activeHistoryEntry = inferenceHistoryEntries.find((item) => item.id === activeInferenceHistoryId);
 const activeInference = asSafeInference(activeHistoryEntry?.data) || asSafeInference(currentMemory?.aiInference) || null;
 const activeVersionLabel = activeHistoryEntry
 ? `版本：${new Date(activeHistoryEntry.at).toLocaleString()} | ${activeHistoryEntry.model || 'local'}`
 : '';
 const plotHistoryOptions = useMemo(() => plotHistoryEntries, [plotHistoryEntries]);
 const inferenceHistoryOptions = useMemo(
 () => inferenceHistoryEntries.map((entry) => ({ id: entry.id, label: formatHistoryTaskLabel(entry, '推演') })),
 [inferenceHistoryEntries]
 );

 const activePlotMatchesCurrent = Boolean(
 activePlotMemory && currentChapter && activePlotMemory.chapterId && activePlotMemory.chapterId === currentChapter.id
 );
 const displayPlotMemory = (activePlotMatchesCurrent ? activePlotMemory : null) || currentMemory || activePlotMemory;
 const safeNarrativeSegments = toNarrativeSegments(displayPlotMemory);
 const safePlotSynopsis = toSafeText(displayPlotMemory?.plotAnalysis?.plotSynopsis || displayPlotMemory?.plotAnalysis?.functionSummary).trim();
 const safeKeyNodes = toSafePlotNodes(displayPlotMemory?.plotAnalysis?.keyNodes);
 const safeAcquisitions = toSafePlotEvents(displayPlotMemory?.plotAnalysis?.acquisitions);
 const safeAlliances = toSafePlotEvents(displayPlotMemory?.plotAnalysis?.alliances);
 const safeRelationProgress = toSafePlotEvents(displayPlotMemory?.plotAnalysis?.relationProgress);

 const collectDefaultCollapsedPaths = (node: InferenceTreeNode | null, base = '0', depth = 0): string[] => {
 if (!node) return [];
 const output: string[] = [];
 if (depth >= 2 && node.children?.length) output.push(base);
 (node.children || []).forEach((child, index) => {
 output.push(...collectDefaultCollapsedPaths(child, `${base}.${index}`, depth + 1));
 });
 return output;
 };

 const applyDefaultTreeCollapse = (inference: SafeAiInference | null) => {
 const defaults = collectDefaultCollapsedPaths((inference?.structureTree || null) as unknown as InferenceTreeNode | null);
 setCollapsedTreePaths(new Set(defaults));
 };

 const toggleTreePath = (path: string) => {
 setCollapsedTreePaths((prev) => {
 const next = new Set(prev);
 if (next.has(path)) next.delete(path);
 else next.add(path);
 return next;
 });
 };

 const renderPlotPanel = () => (
 <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)]/55 p-6">
 <div className="mx-auto max-w-5xl">
 <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
 <div className="text-4xl font-bold text-[var(--text-primary)]">{currentChapter?.title || '未选择章节'}</div>
 <div className="flex flex-wrap items-center gap-3">
 <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
 <span className="font-semibold text-[var(--text-secondary)]">提取总览</span>
 <select
 className="max-w-[360px] border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none hover:bg-[var(--surface-strong)] focus:border-[var(--accent)] disabled:opacity-60"
 value={activePlotHistoryId || ''}
 onChange={(event) => setActivePlotHistoryId(event.target.value || null)}
 disabled={plotHistoryOptions.length === 0}
 >
 <option value="">暂无提取总览</option>
 {plotHistoryOptions.map((entry) => (
 <option key={entry.id} value={entry.id}>
 {formatHistoryTaskLabel(entry, '提取')}
 </option>
 ))}
 </select>
 </label>
 <div className="text-sm text-[var(--text-muted)]">
 {activePlotHistoryEntry ? `版本：${new Date(activePlotHistoryEntry.at).toLocaleString()} | ` : ''}
 {safeKeyNodes.length} 个关键节点
 </div>
 <button
 className="rounded border border-red-400/45 px-2 py-1 text-xs text-red-300 hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={() => void deleteActivePlotHistoryRecord()}
 disabled={!activePlotHistoryId}
 >
 删除记录
 </button>
 <button
 className="rounded border border-red-400/45 px-2 py-1 text-xs text-red-300 hover:bg-red-500/12 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={() => void clearAllPlot()}
 disabled={plotHistoryEntries.length === 0}
 >
 全部删除
 </button>
 {currentChapter ? (
 <>
 <button
 className="rounded border border-red-400/45 px-2 py-1 text-xs text-red-300 hover:bg-red-500/12"
 onClick={() => void deleteChapterMemory(currentChapter.id)}
 >
 删除本章整理
 </button>
 <button
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
 onClick={() => void analyzeOneChapter(currentChapter)}
 >
 重新整理本章
 </button>
 </>
 ) : null}
 </div>
 </div>

 <div className="min-h-[520px] border border-[var(--border-color)] bg-[var(--surface)] p-6">
 {!currentChapter ? (
 <div className="flex h-[470px] items-center justify-center border border-dashed border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-muted)]">
 请先在左侧选择章节
 </div>
 ) : (
 <div className="space-y-5">
 <div className="border border-cyan-300/85 bg-gradient-to-br from-cyan-400/45 via-sky-400/34 to-blue-400/28 p-4 shadow-[0_12px_28px_-18px_rgba(34,211,238,0.9)]">
 <div className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">章节运镜链</div>
 {safeNarrativeSegments.length > 0 ? (
 <div className="flex flex-wrap items-center gap-2">
 {safeNarrativeSegments.map((segment, idx, arr) => (
 <div key={`${segment}-${idx}`} className="flex items-center gap-2">
 <span className="border border-white/55 bg-white/24 px-3 py-1.5 text-[15px] font-medium text-[var(--text-primary)]">{segment}</span>
 {idx < arr.length - 1 ? <span className="text-[var(--text-muted)]">→</span> : null}
 </div>
 ))}
 </div>
 ) : (
 <div className="text-[15px] text-[var(--text-primary)]/85">暂无运镜链分析</div>
 )}
 </div>

 <div className="border border-fuchsia-300/85 bg-gradient-to-br from-fuchsia-400/42 via-purple-400/32 to-pink-400/26 p-4 shadow-[0_12px_28px_-18px_rgba(217,70,239,0.9)]">
 <div className="mb-2 text-[16px] font-semibold text-[var(--text-primary)]">章节剧情</div>
 <div className="whitespace-pre-wrap text-[15px] leading-8 text-[var(--text-primary)]">{safePlotSynopsis || '暂无章节剧情'}</div>
 </div>

 <div className="border border-amber-300/85 bg-gradient-to-br from-amber-300/45 via-orange-300/34 to-yellow-300/28 p-4 shadow-[0_12px_28px_-18px_rgba(251,191,36,0.9)]">
 <div className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">关键情节点</div>
 {safeKeyNodes.length > 0 ? (
 <div className="space-y-2">
 {safeKeyNodes.map((node, index) => (
 <div key={`${node.action}-${index}`} className="border border-white/55 bg-white/26 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
 <div className="text-[15px] font-semibold text-[var(--text-primary)]">
 {index + 1}. [{node.nodeType}] {node.action}
 </div>
 <div className="mt-1 text-[13px] text-[var(--text-primary)]/85">
 {node.time ? `时间：${node.time} · ` : ''}
 冲击力等级：{node.impactLevel || 1}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="text-sm text-[var(--text-muted)]">暂无关键节点</div>
 )}
 </div>

 <div className="grid gap-3 md:grid-cols-3">
 <div className="border border-emerald-300/70 bg-emerald-300/15 p-3">
 <div className="mb-2 text-[15px] font-semibold text-[var(--text-primary)]">获得事件</div>
 {safeAcquisitions.length > 0 ? (
 <div className="space-y-2">
 {safeAcquisitions.map((item, index) => (
 <div key={`acq-${index}`} className="border border-white/35 bg-white/15 px-2 py-1.5 text-[13px] text-[var(--text-primary)]">
 {index + 1}. {item.subject}
 {item.target ? ` 获得 ${item.target}` : ''}：{item.detail}
 </div>
 ))}
 </div>
 ) : (
 <div className="text-xs text-[var(--text-muted)]">暂无获得事件</div>
 )}
 </div>
 <div className="border border-cyan-300/70 bg-cyan-300/15 p-3">
 <div className="mb-2 text-[15px] font-semibold text-[var(--text-primary)]">结盟事件</div>
 {safeAlliances.length > 0 ? (
 <div className="space-y-2">
 {safeAlliances.map((item, index) => (
 <div key={`ali-${index}`} className="border border-white/35 bg-white/15 px-2 py-1.5 text-[13px] text-[var(--text-primary)]">
 {index + 1}. {item.subject}
 {item.target ? ` ↔ ${item.target}` : ''}：{item.detail}
 </div>
 ))}
 </div>
 ) : (
 <div className="text-xs text-[var(--text-muted)]">暂无结盟事件</div>
 )}
 </div>
 <div className="border border-purple-300/70 bg-purple-300/15 p-3">
 <div className="mb-2 text-[15px] font-semibold text-[var(--text-primary)]">关系进展</div>
 {safeRelationProgress.length > 0 ? (
 <div className="space-y-2">
 {safeRelationProgress.map((item, index) => (
 <div key={`rel-${index}`} className="border border-white/35 bg-white/15 px-2 py-1.5 text-[13px] text-[var(--text-primary)]">
 {index + 1}. {item.subject}
 {item.target ? ` 与 ${item.target}` : ''}：{item.detail}
 </div>
 ))}
 </div>
 ) : (
 <div className="text-xs text-[var(--text-muted)]">暂无关系进展</div>
 )}
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );

 if (!open) return null;

 return (
 <div className="wz-memory-bank fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 p-4 ">
 {recoveryPrompt ? (
 <RecoveryPromptDialog
 prompt={recoveryPrompt}
 onDismiss={() => setRecoveryPrompt(null)}
 onResume={() => {
 const resume = recoveryPrompt.onResume;
 setRecoveryPrompt(null);
 resume();
 }}
 />
 ) : null}

 {healthReport ? (
 <div className="absolute inset-0 z-[20] flex items-center justify-center bg-black/65 p-6">
 <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#1d1f26] p-5 shadow-2xl">
 <div className="flex items-center justify-between"><h3 className="text-base font-bold text-white">作品整理体检</h3><button className="text-zinc-400 hover:text-white" onClick={() => setHealthReport(null)}>✕</button></div>
 <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
 <div className="rounded-lg bg-white/5 p-3">完整整理：<b className="text-emerald-400">{healthReport.completeChapters}</b></div>
 <div className="rounded-lg bg-white/5 p-3">未整理：<b className="text-amber-400">{healthReport.missingChapters.length}</b></div>
 <div className="rounded-lg bg-white/5 p-3">只有摘要：<b className="text-amber-400">{healthReport.summaryOnlyChapters.length}</b></div>
 <div className="rounded-lg bg-white/5 p-3">档案不完整：<b className="text-amber-400">{healthReport.incompleteArchiveChapters.length}</b></div>
 </div>
 <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/5 bg-black/20 p-3 text-xs text-zinc-300">
 {healthReport.recommendedChapterIds.length ? healthReport.missingChapters.concat(healthReport.summaryOnlyChapters, healthReport.incompleteArchiveChapters).slice(0, 60).map((item) => <div key={`${item.issue}-${item.chapterId}`} className="mb-2"><b>{item.chapterTitle}</b><div className="text-zinc-500">{item.reasons.join('；')}</div></div>) : <div className="text-emerald-400">当前章节整理结构完整。</div>}
 </div>
 <div className="mt-3 text-xs text-zinc-400">建议重新整理 {healthReport.recommendedChapterIds.length} 章，预计约 {healthReport.estimatedCalls} 次章节分析调用。</div>
 <div className="mt-4 flex justify-end gap-2"><button className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300" onClick={() => setHealthReport(null)}>关闭</button><button disabled={!healthReport.recommendedChapterIds.length} className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" onClick={() => { setSelectedChapterIds(new Set(healthReport.recommendedChapterIds)); setHealthReport(null); }}>选择建议章节</button></div>
 </div>
 </div>
 ) : null}

 {proposalReviewOpen ? (
 <div className="absolute inset-0 z-[20] flex items-center justify-center bg-black/65 p-6">
 <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#1d1f26] p-5 shadow-2xl">
 <div className="flex items-center justify-between"><div><h3 className="text-base font-bold text-white">角色卡更新建议</h3><p className="mt-1 text-xs text-zinc-400">章节档案已经保存；以下修改只有确认后才会写入角色卡。</p></div><button className="text-zinc-400 hover:text-white" onClick={() => setProposalReviewOpen(false)}>✕</button></div>
 <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
 {roleUpdateProposals.length ? roleUpdateProposals.map((proposal) => (
 <label key={proposal.id} className="flex cursor-pointer gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
 <input type="checkbox" className="mt-1" checked={selectedProposalIds.has(proposal.id)} onChange={(event) => setSelectedProposalIds((prev) => { const next = new Set(prev); if (event.target.checked) next.add(proposal.id); else next.delete(proposal.id); return next; })} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 text-sm font-semibold text-white"><span>{proposal.roleName}</span><span className={`rounded px-1.5 py-0.5 text-[10px] ${proposal.createIfMissing ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{proposal.createIfMissing ? '创建新角色' : `更新已有角色${proposal.matchedRoleName ? `：${proposal.matchedRoleName}` : ''}`}</span></div>
 <div className="mt-1 text-xs text-zinc-500">来源：{proposal.chapterTitles.join('、')}</div>
 <div className="mt-2 space-y-1">{proposal.mutations.map((mutation) => <div key={mutation.id} className="rounded bg-white/[0.03] px-2 py-1 text-[11px] text-indigo-200"><b>{mutation.label}</b><span className="ml-2 text-zinc-400">{mutation.reason}</span></div>)}</div>
 </div>
 </label>
 )) : <div className="py-8 text-center text-sm text-zinc-400">暂无待审查的角色卡更新。</div>}
 </div>
 <div className="mt-4 flex items-center justify-between"><button className="text-xs text-zinc-400 hover:text-white" onClick={() => setSelectedProposalIds(new Set(roleUpdateProposals.map((proposal) => proposal.id)))}>全选</button><div className="flex gap-2"><button className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300" onClick={() => setProposalReviewOpen(false)}>只保存章节档案</button><button disabled={!selectedProposalIds.size} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40" onClick={() => void applySelectedRoleUpdates()}>应用所选（{selectedProposalIds.size}）</button></div></div>
 </div>
 </div>
 ) : null}

 <div className="wz-dz-shell flex h-full w-full max-w-[1460px] flex-col overflow-hidden border border-white/[0.08] bg-[#15161b]/98 shadow-[0_24px_60px_rgba(0,0,0,0.8)] rounded-2xl animate-in zoom-in-95 duration-200">
 <div className="flex items-center justify-between border-b border-white/[0.06] bg-gradient-to-r from-white/[0.01] to-white/[0.03] px-6 py-4">
 <div className="flex items-center gap-4">
 <h2 className="text-xl font-bold tracking-tight text-white">剧情档案库</h2>
 <label className="flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all cursor-pointer">
 <input
 type="checkbox"
 className="h-4.5 w-4.5 rounded border-white/[0.15] bg-black/25 text-indigo-500 focus:ring-indigo-500/20"
 checked={ragEnabled}
 onChange={(event) => {
 if (!config) return;
 void saveConfig({ ...config, ai: { ...config.ai, ragEnabled: event.target.checked } });
 }}
 />
 <span>助手检索已启用</span>
 </label>
 <label className="flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all cursor-pointer" title="关闭后仍会生成章节档案，但不再生成角色卡更新建议">
 <input
 type="checkbox"
 className="h-4.5 w-4.5 rounded border-white/[0.15] bg-black/25 text-indigo-500 focus:ring-indigo-500/20"
 checked={!(config?.ai?.disableAutoRoleExtract)}
 onChange={(event) => {
 if (!config) return;
 void saveConfig({ ...config, ai: { ...config.ai, disableAutoRoleExtract: !event.target.checked } });
 }}
 />
 <span>角色更新建议</span>
 </label>
 </div>
 <button data-guide-target="memory-bank-close" className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all" onClick={onClose}>
 <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
 </button>
 </div>

 <div className="wz-memory-main-tabs flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-3">
 <button className="px-4 py-1.5 text-sm font-bold text-[var(--accent)] bg-[var(--accent)]/10 rounded-xl border border-[var(--accent)]/20">
 智能整理
 </button>
 <div className="flex items-center gap-2">
 <button className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.08] px-3.5 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/15" onClick={() => { const latest = useBookStore.getState().books.find((item) => item.id === book.id) || book; setHealthReport(inspectOrganizationHealth(latest)); }}>整理体检</button>
 <button className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15" onClick={() => setProposalReviewOpen(true)}>角色建议{roleUpdateProposals.length ? ` (${roleUpdateProposals.length})` : ''}</button>
 <button
 className="flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] hover:bg-amber-500/15 px-3.5 py-1.5 text-xs font-bold text-amber-400 transition-all active:scale-95"
 onClick={() => setExportDialogOpen(true)}
 title="导出智能整理内容"
 >
 <span>导出整理</span>
 </button>
 </div>
 </div>

 <div className="flex min-h-0 flex-1 overflow-hidden">
 <ChapterSidebar
 keyword={keyword}
 onKeywordChange={setKeyword}
 onToggleAllVisible={selectAll}
 chapterOrder={memoryBankChapterOrder}
 onToggleChapterOrder={() => void toggleMemoryBankChapterOrder()}
 chapters={filteredChapters}
 selectedChapterIds={selectedChapterIds}
 extractedChapterIds={extractedChapterIds}
 activeChapterId={currentChapter?.id || null}
 onToggleChapter={toggleSelect}
 onActivateChapter={handleActivateChapter}
 onSelectAllFollowing={selectAllFollowing}
 tab={'plot'}
 hasAnalyzing={hasAnalyzing}
 selectedCount={selectedChapterIds.size}
 inferenceRunning={false}
 hasCurrentChapter={Boolean(currentChapter)}
 rangeStartInput={rangeStartInput}
 rangeEndInput={rangeEndInput}
 onRangeStartInputChange={setRangeStartInput}
 onRangeEndInputChange={setRangeEndInput}
 onApplyInferenceRange={() => {}}
 onBatchAnalyze={() => void handleBatchAnalyze()}
 onRunInference={() => {}}
 />

 {renderPlotPanel()}
 </div>
 </div>

 {exportDialogOpen ? (
 <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200" onClick={() => setExportDialogOpen(false)}>
 <div className="wz-dz-shell flex w-full max-w-[420px] flex-col gap-5 border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl rounded-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <h3 className="text-[16px] font-bold text-white">导出智能整理</h3>
 <button
 className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
 onClick={() => setExportDialogOpen(false)}
 >
 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
 </button>
 </div>

 <div className="text-xs text-slate-400 leading-relaxed">
 选择要导出的章节范围，将弹出保存对话框供您选择导出位置。
 </div>

 <div className="flex items-center gap-2 bg-black/20 border border-white/[0.06] rounded-xl p-3">
 <label className="flex flex-1 items-center gap-1.5 bg-[var(--surface-strong)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 focus-within:border-[var(--accent)] transition-all">
 <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">起始</span>
 <input
 value={exportRangeStart}
 onChange={(e) => setExportRangeStart(e.target.value)}
 inputMode="numeric"
 className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none"
 placeholder="1"
 />
 </label>
 <span className="text-slate-500">-</span>
 <label className="flex flex-1 items-center gap-1.5 bg-[var(--surface-strong)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 focus-within:border-[var(--accent)] transition-all">
 <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">结束</span>
 <input
 value={exportRangeEnd}
 onChange={(e) => setExportRangeEnd(e.target.value)}
 inputMode="numeric"
 className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none"
 placeholder={`${book.chapters.length}`}
 />
 </label>
 <span className="text-xs text-slate-500 whitespace-nowrap">共 {book.chapters.length} 章</span>
 </div>

 <div className="flex flex-col gap-2 mt-2">
 <button
 className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:brightness-105 active:scale-95 transition-all"
 onClick={() => void handleExportSmartOrganize('range')}
 >
 导出选定范围
 </button>
 <button
 className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all active:scale-95"
 onClick={() => void handleExportSmartOrganize('all')}
 >
 导出全部 ({book.chapters.length} 章)
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 );
}
