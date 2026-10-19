// 模块说明：大纲看板页面。
// 关键职责：卷/章结构可视化、细纲编辑、批量生成入口（VIP）、世界地图 Tab、世界观构建器。
import appIcon from '../assets/app-icon.png';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useBookStore } from '../store/useBookStore';
import { useIslandStore } from '../store/useIslandStore';
import { Island } from '../components/common/Island';
import { OutlineNode, OutlineVisionData, MasterOutlineData, OutlineSubItem } from '../types/ov';
import { electronAPI } from '../utils/electron';
import { getPromptSync } from '../utils/promptStore';
import { useBatchGenerate } from '../hooks/useBatchGenerate';
import { WorldBuilder } from '../components/outline/WorldBuilder';
import { MapPanel } from '../components/map/MapPanel';
import { AiMapPanel } from '../components/map/AiMapPanel';
import { PlotDeductionWorkspace } from '../components/outline/PlotDeductionWorkspace';
import { OUTLINE_TEMPLATES } from './outlineTemplates';



export default function OutlineBoard() {
 const params = useMemo(() => new URLSearchParams(window.location.search), []);
 const activeBookId = useAppStore?.((s) => s.activeBookId) || '';
 const bookId = params.get('bookId') || activeBookId || '';
 const isEmbedded = !params.get('outlineBoardDetached'); // 内嵌模式（非独立窗口）

 const { books, updateOutlineVision } = useBookStore((s) => ({
 books: s.books,
 updateOutlineVision: s.updateOutlineVision,
 }));

 const showIsland = useIslandStore((s) => s.show);

 const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

 // 档案读权威 memory.json，避免用 book.json 旧快照显示「已整理/未整理」徽章
 useEffect(() => {
  if (!bookId) return;
  void useBookStore.getState().loadMemoryBank(bookId);
 }, [bookId]);

 // 批量生成
 const batchGen = useBatchGenerate(book);
 const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());

 // Arc planner inline chat
 const [arcMessages, setArcMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; hasOutline?: boolean; outlineParsed?: import('../Agent/outlineParser').ParsedChapterOutline[] }>>([
 { role: 'assistant', content: '你好！我是剧情规划助手。告诉我你的故事方向，我来帮你规划章节细纲。\n\n输出大纲后可一键创建章节。' }
 ]);
 const [arcInput, setArcInput] = useState('');
 const [arcLoading, setArcLoading] = useState(false);
 const [arcWebSearch, setArcWebSearch] = useState(false);

 const handleArcSend = useCallback(async () => {
 const msg = arcInput.trim();
 if (!msg || arcLoading || !book) return;
 setArcInput('');
 setArcMessages(prev => [...prev, { role: 'user', content: msg }]);
 setArcLoading(true);
 try {
 const { buildArcPlanningMessages, ensureArcPromptsLoaded } = await import('../Agent/arcPlannerPrompt');
 const { hasOutlineMarker, parseOutlineFromResponse } = await import('../Agent/outlineParser');
 await ensureArcPromptsLoaded();
 const chapter = book.chapters[0] || { id: 'ch0', title: '第1章', content: '' };

 // 判断用户是否要求输出大纲
 const wantFinalize = /出.*[大细]纲|生成.*[大细]纲|输出.*[大细]纲|确定|就这样|开始吧/i.test(msg);

 const history = arcMessages
 .filter(m => m.content !== '你好！我是剧情规划助手。告诉我你的故事方向，我来帮你规划章节细纲。\n\n输出大纲后可一键创建章节。')
 .map(m => ({ role: m.role, content: m.content }));

 let messages: Array<{ role: string; content: string }>;

 // 联网模式 + 非出纲：用通用问答 prompt（不限制字数）
 if (arcWebSearch && !wantFinalize) {
 messages = [
 { role: 'system', content: getPromptSync('outline_board_system', '你是一位网文创作助手，擅长回答关于写作技巧、网络流行梗、角色设定、剧情灵感的问题。请结合搜索结果给出详细、有帮助的回答。使用简体中文。') },
 ];
 for (const turn of history) messages.push({ role: turn.role, content: turn.content });
 messages.push({ role: 'user', content: msg });
 } else {
 messages = buildArcPlanningMessages({
 book,
 chapter: chapter as any,
 recentMemories: [],
 conversationHistory: history,
 userMessage: msg,
 finalizeOutline: wantFinalize,
 });
 }

 // 联网搜索：开启时先搜索，把结果注入 context
 if (arcWebSearch && !wantFinalize) {
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) {
 const searchResult = await internals.invoke('web_search', { query: msg }) as string;
 if (searchResult && searchResult.length > 10) {
 // 注入到 messages 的第二条（system prompt 后面）
 messages.splice(1, 0, { role: 'system', content: searchResult });
 }
 }
 } catch { /* 搜索失败不阻塞主流程 */ }
 }

 const res = await electronAPI.ai.chat({ messages, stream: false, bookId: book.id, disableRag: true, disableStyle: true, senderId: 'batch' });
 const text = res.text || '（无回复）';

 // 检测是否包含可解析的大纲
 const hasOL = hasOutlineMarker(text);
 let parsed: import('../Agent/outlineParser').ParsedChapterOutline[] | undefined;
 if (hasOL) {
 const result = parseOutlineFromResponse(text);
 if (result.success) parsed = result.chapters;
 }

 setArcMessages(prev => [...prev, { role: 'assistant', content: text, hasOutline: hasOL, outlineParsed: parsed }]);
 } catch (err) {
 setArcMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err instanceof Error ? err.message : '请求失败'}` }]);
 } finally {
 setArcLoading(false);
 }
 }, [arcInput, arcLoading, arcMessages, book]);

 const handleApplyOutline = useCallback(async (parsed: import('../Agent/outlineParser').ParsedChapterOutline[]) => {
 if (!book || parsed.length === 0) return;
 const { buildBatchChapters } = await import('../Agent/batchChapterCreator');
 const { newChapters, outlines } = buildBatchChapters(book, parsed);
 const updateBook = useBookStore.getState().updateBook;
 const setChapterOutline = useBookStore.getState().setChapterOutline;

 await updateBook(book.id, (b) => ({
 ...b,
 chapters: [...b.chapters, ...newChapters],
 updatedAt: new Date().toISOString(),
 }));

 for (const ch of newChapters) {
 const ol = outlines.get(ch.id);
 if (ol) await setChapterOutline(book.id, ch.id, ol);
 }

 showIsland({ type: 'success', message: `已创建 ${newChapters.length} 个章节并填入细纲`, autoHideMs: 2500 });
 setArcMessages(prev => [...prev, { role: 'assistant', content: `✅ 已成功创建 ${newChapters.length} 个新章节，细纲已填入。` }]);
 }, [book, showIsland]);

 const handleBatchGenerate = useCallback(async () => {
 if (!book) { showIsland({ type: 'warning', message: '未找到书籍', autoHideMs: 1500 }); return; }
 const { requireFeatureAccess } = await import('../utils/featureCheck');
 if (!(await requireFeatureAccess('outline_gen'))) {
 return;
 }
 if (batchGen.state.status === 'running') {
 batchGen.pause();
 return;
 }
 if (batchGen.state.status === 'paused') {
 batchGen.resume();
 return;
 }
 // 使用勾选的章节，如果没有勾选则自动筛选有细纲无正文的
 let candidates: typeof book.chapters;
 if (batchSelectedIds.size > 0) {
 candidates = book.chapters.filter((ch) => batchSelectedIds.has(ch.id) && Boolean(ch.outline?.trim()));
 } else {
 candidates = book.chapters.filter((ch) => {
 const hasOutline = Boolean(ch.outline?.trim());
 const hasContent = (ch.wordCount || 0) >= 2000;
 return hasOutline && !hasContent;
 });
 }
 if (candidates.length === 0) {
 showIsland({ type: 'warning', message: '没有可生成的章节（需要有细纲）', autoHideMs: 2500 });
 return;
 }
 if (!window.confirm(`将为 ${candidates.length} 个章节自动生成正文并整理，确定开始？`)) return;
 void batchGen.start(candidates.map((c) => c.id));
 }, [book, batchGen, batchSelectedIds, showIsland]);

 const toggleBatchSelect = useCallback((chapterId: string) => {
 setBatchSelectedIds((prev) => {
 const next = new Set(prev);
 if (next.has(chapterId)) next.delete(chapterId);
 else next.add(chapterId);
 return next;
 });
 }, []);

 const selectAllForBatch = useCallback(() => {
 if (!book) return;
 const ids = book.chapters.filter((ch) => Boolean(ch.outline?.trim()) && (ch.wordCount || 0) < 2000).map((ch) => ch.id);
 setBatchSelectedIds(new Set(ids));
 }, [book]);

 const clearBatchSelection = useCallback(() => {
 setBatchSelectedIds(new Set());
 }, []);

 // Tab: 'master' (总纲) | 'board' (章纲看板) | 'deduction' (剧情推演) | 'map' (世界地图) | 'aimap' (AI地图)
 const [activeTab, setActiveTab] = useState<'master' | 'board' | 'deduction' | 'map' | 'aimap'>('master');

 // Master Outline Active Sub-item ID — 'world-builder' 为特殊 ID 表示显示世界构建器
 const [activeMasterSectionId, setActiveMasterSectionId] = useState<string>('settings-worldview');

 // Master Outline categories expanded state
 const [settingsExpanded, setSettingsExpanded] = useState<boolean>(true);
 const [mainlineExpanded, setMainlineExpanded] = useState<boolean>(true);

 // Context Menu State
 const [contextMenu, setContextMenu] = useState<{
 visible: boolean;
 x: number;
 y: number;
 type: 'sidebar' | 'editor';
 itemId?: string;
 groupType?: 'settings' | 'mainline';
 }>({
 visible: false,
 x: 0,
 y: 0,
 type: 'sidebar'
 });

 useEffect(() => {
 const handleGlobalClick = () => {
 setContextMenu(prev => prev.visible ? { ...prev, visible: false } : prev);
 };
 window.addEventListener('click', handleGlobalClick);
 return () => window.removeEventListener('click', handleGlobalClick);
 }, []);

 const handleSidebarContextMenu = (e: React.MouseEvent, itemId: string, groupType: 'settings' | 'mainline') => {
 e.preventDefault();
 e.stopPropagation();
 setContextMenu({
 visible: true,
 x: e.clientX,
 y: e.clientY,
 type: 'sidebar',
 itemId,
 groupType
 });
 };

 const handleSidebarGroupContextMenu = (e: React.MouseEvent, groupType: 'settings' | 'mainline') => {
 e.preventDefault();
 e.stopPropagation();
 setContextMenu({
 visible: true,
 x: e.clientX,
 y: e.clientY,
 type: 'sidebar',
 groupType
 });
 };

 const handleEditorContextMenu = (e: React.MouseEvent) => {
 e.preventDefault();
 e.stopPropagation();
 setContextMenu({
 visible: true,
 x: e.clientX,
 y: e.clientY,
 type: 'editor'
 });
 };

 // Inline sub-item creator state
 const [showAddSubItemFor, setShowAddSubItemFor] = useState<'settings' | 'mainline' | null>(null);
 const [newSubItemTitle, setNewSubItemTitle] = useState('');

 // Card selection for editing drawer (Chapter Outline Board tab)
 const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

 // Collapsible chapter card outline notes mapping
 const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

 // Sorting order: 'desc' (reverse, newest chapter first) | 'asc' (normal)
 const [chapterOrder, setChapterOrder] = useState<'desc' | 'asc'>('desc');

 // Active filter highlights
 const [highlightCharacter, setHighlightCharacter] = useState<string | null>(null);
 const [highlightLocation, setHighlightLocation] = useState<string | null>(null);
 const [highlightItem, setHighlightItem] = useState<string | null>(null);

 // Warehouse drawer state inside Board tab
 const [warehouseTab, setWarehouseTab] = useState<'characters' | 'locations' | 'items'>('characters');
 const [newLocationInput, setNewLocationInput] = useState('');
 const [newItemInput, setNewItemInput] = useState('');
 const [sessionLocations, setSessionLocations] = useState<string[]>([]);
 const [sessionItems, setSessionItems] = useState<string[]>([]);

 // Fetch Master Outline from Book
 const masterOutline = useMemo(() => {
 return book?.outlineVision?.masterOutline || {
 settings: '',
 mainline: ''
 };
 }, [book]);

 // Load Settings list with Fallbacks
 const settingsItems = useMemo(() => {
 const list = masterOutline.settingsItems;
 if (Array.isArray(list) && list.length > 0) return list;
 return [
 { id: 'settings-worldview', title: '世界观与背景', content: masterOutline.settings || '' },
 { id: 'settings-levels', title: '战力与等级', content: '' },
 { id: 'settings-factions', title: '主要势力与阵营', content: '' }
 ];
 }, [masterOutline]);

 // Load Mainline list with Fallbacks
 const mainlineItems = useMemo(() => {
 const list = masterOutline.mainlineItems;
 if (Array.isArray(list) && list.length > 0) return list;
 return [
 { id: 'mainline-summary', title: '核心冲突与概要', content: masterOutline.mainline || '' },
 { id: 'mainline-arcs', title: '分卷规划与大结局', content: '' }
 ];
 }, [masterOutline]);

 // Select currently active Sub-item
 const activeSubItem = useMemo(() => {
 const all = [...settingsItems, ...mainlineItems];
 return all.find(item => item.id === activeMasterSectionId) || all[0];
 }, [settingsItems, mainlineItems, activeMasterSectionId]);

 // Fetch characters from the book's customCharacterCategories
 const allCharacters = useMemo(() => {
 if (!book?.resourceIndex?.customCharacterCategories) return [];
 const list: Array<{ id: string; name: string; avatar?: string; categoryName: string; bio?: string }> = [];
 book.resourceIndex.customCharacterCategories.forEach((cat) => {
 if (Array.isArray(cat.children)) {
 cat.children.forEach((char: any) => {
 list.push({
 id: char.id || char.name,
 name: char.name,
 avatar: char.avatar,
 categoryName: cat.name,
 bio: char.description || char.bio || '',
 });
 });
 }
 });
 return list;
 }, [book]);

 // Sync: build outline nodes dynamically based on book.chapters
 const currentOutlineNodes = useMemo(() => {
 if (!book) return [];
 const catalogChapters = book.chapters || [];

 const existingNodesMap = new Map<string, OutlineNode>();
 const walk = (nodes: OutlineNode[]) => {
 nodes.forEach((node) => {
 if (node.chapterId) {
 existingNodesMap.set(node.chapterId, node);
 } else if (node.id.startsWith('chapter-') || node.type === 'event') {
 existingNodesMap.set(node.id, node);
 }
 if (Array.isArray(node.children)) {
 walk(node.children);
 }
 });
 };
 if (book.outlineVision?.nodes) {
 walk(book.outlineVision.nodes);
 }

 return catalogChapters.map((ch) => {
 const existing = existingNodesMap.get(ch.id) || existingNodesMap.get(`chapter-${ch.id}`);
 return {
 id: ch.id,
 title: ch.title,
 type: 'event' as const,
 conflict: existing?.conflict || '',
 notes: existing?.notes || ch.outline || '',
 characters: existing?.characters || [],
 locations: existing?.locations || [],
 items: existing?.items || [],
 targetWordCount: existing?.targetWordCount || 3000,
 actualWordCount: ch.wordCount || 0,
 chapterId: ch.id,
 };
 });
 }, [book]);

 // Extract bound locations & items
 const boundLocations = useMemo(() => {
 const set = new Set<string>();
 currentOutlineNodes.forEach((n) => {
 n.locations?.forEach((loc) => {
 if (loc.trim()) set.add(loc.trim());
 });
 });
 book?.worldBuilder?.forEach((wb) => {
 if (wb.category === '地理' && wb.name.trim()) {
 set.add(wb.name.trim());
 }
 });
 return Array.from(set);
 }, [currentOutlineNodes, book]);

 const boundItems = useMemo(() => {
 const set = new Set<string>();
 currentOutlineNodes.forEach((n) => {
 n.items?.forEach((itm) => {
 if (itm.trim()) set.add(itm.trim());
 });
 });
 book?.worldBuilder?.forEach((wb) => {
 if (wb.category === '其他' && wb.name.trim()) {
 set.add(wb.name.trim());
 }
 });
 return Array.from(set);
 }, [currentOutlineNodes, book]);

 const allLocations = useMemo(() => {
 const set = new Set([...boundLocations, ...sessionLocations]);
 return Array.from(set);
 }, [boundLocations, sessionLocations]);

 const allItems = useMemo(() => {
 const set = new Set([...boundItems, ...sessionItems]);
 return Array.from(set);
 }, [boundItems, sessionItems]);

 const sortedOutlineNodes = useMemo(() => {
 return chapterOrder === 'desc' 
 ? [...currentOutlineNodes].reverse() 
 : [...currentOutlineNodes];
 }, [currentOutlineNodes, chapterOrder]);

 const selectedNode = useMemo(() => {
 if (!selectedCardId) return null;
 return currentOutlineNodes.find((n) => n.id === selectedCardId) || null;
 }, [currentOutlineNodes, selectedCardId]);

 // Save changes helper
 const handleSave = async (flatNodes: OutlineNode[]) => {
 if (!bookId) return;
 try {
 await updateOutlineVision(bookId, {
 version: (book?.outlineVision?.version || 1) + 1,
 nodes: flatNodes,
 edges: book?.outlineVision?.edges || [],
 masterOutline: masterOutline,
 lastSyncedAt: new Date().toISOString()
 }, { persist: true });
 } catch (e) {
 console.error('Failed to save outline vision:', e);
 }
 };

 // CRUD/Save for Book Master Outline
 const handleUpdateMasterOutline = async (updatedFields: Partial<MasterOutlineData>) => {
 if (!bookId || !book) return;
 const nextMaster = {
 ...masterOutline,
 ...updatedFields
 };

 try {
 await updateOutlineVision(bookId, {
 version: (book?.outlineVision?.version || 1) + 1,
 nodes: book?.outlineVision?.nodes || [],
 edges: book?.outlineVision?.edges || [],
 masterOutline: nextMaster,
 lastSyncedAt: new Date().toISOString()
 }, { persist: true });
 } catch (e) {
 console.error('Failed to update master outline:', e);
 }
 };

 // 1. Create Sub Item Under Group
 const handleConfirmCreateSubItem = () => {
 const title = newSubItemTitle.trim();
 if (!title) return;
 if (!showAddSubItemFor) return;

 const newItem: OutlineSubItem = {
 id: crypto.randomUUID(),
 title,
 content: ''
 };

 if (showAddSubItemFor === 'settings') {
 const nextList = [...settingsItems, newItem];
 handleUpdateMasterOutline({ settingsItems: nextList });
 } else {
 const nextList = [...mainlineItems, newItem];
 handleUpdateMasterOutline({ mainlineItems: nextList });
 }

 setActiveMasterSectionId(newItem.id);
 setNewSubItemTitle('');
 setShowAddSubItemFor(null);
 showIsland({ type: 'success', message: `已新建项: ${title}`, autoHideMs: 800 });
 };

 // 2. Rename Sub Item
 const handleRenameSubItem = (id: string, newTitle: string) => {
 const inSettings = settingsItems.some(i => i.id === id);
 if (inSettings) {
 const nextList = settingsItems.map(item => 
 item.id === id ? { ...item, title: newTitle } : item
 );
 handleUpdateMasterOutline({ settingsItems: nextList });
 } else {
 const nextList = mainlineItems.map(item => 
 item.id === id ? { ...item, title: newTitle } : item
 );
 handleUpdateMasterOutline({ mainlineItems: nextList });
 }
 };

 // 3. Delete Sub Item
 const handleDeleteSubItem = (id: string, title: string) => {
 const ok = window.confirm(`确认删除“${title}”吗？此操作无法恢复！`);
 if (!ok) return;

 const inSettings = settingsItems.some(i => i.id === id);
 if (inSettings) {
 const nextList = settingsItems.filter(item => item.id !== id);
 handleUpdateMasterOutline({ settingsItems: nextList });
 if (activeMasterSectionId === id) {
 setActiveMasterSectionId('settings-worldview');
 }
 } else {
 const nextList = mainlineItems.filter(item => item.id !== id);
 handleUpdateMasterOutline({ mainlineItems: nextList });
 if (activeMasterSectionId === id) {
 setActiveMasterSectionId('mainline-summary');
 }
 }
 showIsland({ type: 'success', message: `已删除: ${title}`, autoHideMs: 800 });
 };

 // 4. Update Sub Item Content
 const handleActiveContentChange = (newVal: string) => {
 if (!activeSubItem) return;
 const inSettings = settingsItems.some(i => i.id === activeSubItem.id);
 if (inSettings) {
 const nextList = settingsItems.map(item => 
 item.id === activeSubItem.id ? { ...item, content: newVal } : item
 );
 handleUpdateMasterOutline({ settingsItems: nextList });
 } else {
 const nextList = mainlineItems.map(item => 
 item.id === activeSubItem.id ? { ...item, content: newVal } : item
 );
 handleUpdateMasterOutline({ mainlineItems: nextList });
 }
 };

 const handleApplyTemplate = (type: keyof typeof OUTLINE_TEMPLATES) => {
 const templateText = OUTLINE_TEMPLATES[type];
 const currentText = activeSubItem?.content || '';
 if (currentText.trim().length > 0) {
 const confirmText = '当前编辑区域已经有内容，应用模版将覆盖当前全部文本。是否确定覆盖？';
 if (!window.confirm(confirmText)) return;
 }
 handleActiveContentChange(templateText);
 showIsland({ type: 'success', message: '模版应用成功', autoHideMs: 1000 });
 };

 // Window Controls
 const handleMinimize = () => {
 try {
 void electronAPI.system.windowMinimize?.();
 } catch (err) {
 console.error(err);
 }
 };

 const handleMaximize = () => {
 try {
 void electronAPI.system.windowMaximize?.();
 } catch (err) {
 console.error(err);
 }
 };

 const handleClose = () => {
 try {
 void electronAPI.system.windowClose?.();
 } catch (err) {
 console.error(err);
 }
 };

 // Chapter CRUD
 const handleCreateChapter = async () => {
 if (!bookId || !book) return;
 try {
 const now = new Date().toISOString();
 const maxTitleNo = book.chapters.reduce((max, chapter) => {
 const match = chapter.title.match(/第\s*(\d+)\s*[章节回篇]/);
 const no = match ? Number(match[1]) : null;
 return no ? Math.max(max, no) : max;
 }, 0);
 const nextNo = Math.max(maxTitleNo + 1, book.chapters.length + 1);
 const title = `第${nextNo}章`;

 const newChapter = {
 id: crypto.randomUUID(),
 title,
 content: `<h2 style="text-align:center;">${title}</h2><p></p>`,
 wordCount: 0,
 createdAt: now,
 updatedAt: now
 };

 await useBookStore.getState().updateBook(bookId, (current) => ({
 ...current,
 chapters: [...current.chapters, newChapter],
 updatedAt: now
 }));

 const newOutlineNode: OutlineNode = {
 id: newChapter.id,
 title: newChapter.title,
 type: 'event',
 conflict: '',
 notes: '',
 characters: [],
 locations: [],
 items: [],
 targetWordCount: 3000,
 actualWordCount: 0,
 chapterId: newChapter.id
 };

 await handleSave([...currentOutlineNodes, newOutlineNode]);

 showIsland({ type: 'success', message: `已新建 ${title}`, autoHideMs: 1000 });
 setSelectedCardId(newChapter.id);
 } catch (err) {
 console.error(err);
 showIsland({ type: 'error', message: '新建章节失败', autoHideMs: 1500 });
 }
 };

 const handleDeleteChapter = async (chapterId: string) => {
 if (!book) return;
 if (book.chapters.length <= 1) {
 showIsland({ type: 'warning', message: '必须保留至少一个章节', autoHideMs: 1500 });
 return;
 }
 const ok = window.confirm('确认删除该章节？这将会把书籍目录中的对应章节一并删除，且不可恢复！');
 if (!ok) return;

 try {
 const now = new Date().toISOString();
 await useBookStore.getState().updateBook(book.id, (current) => ({
 ...current,
 chapters: current.chapters.filter((ch) => ch.id !== chapterId),
 updatedAt: now
 }));

 const flatNodes = currentOutlineNodes.filter((node) => node.id !== chapterId);
 await handleSave(flatNodes);

 if (selectedCardId === chapterId) {
 setSelectedCardId(null);
 }
 showIsland({ type: 'success', message: '章节已删除', autoHideMs: 1000 });
 } catch (e) {
 console.error(e);
 showIsland({ type: 'error', message: '删除失败', autoHideMs: 1500 });
 }
 };

 // 详情面板本地草稿：打字不立刻写 store，避免整板重渲染
 const [detailDraft, setDetailDraft] = useState<{
  id: string;
  title: string;
  notes: string;
  targetWordCount: number;
 } | null>(null);
 const detailFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => {
  if (!selectedNode) {
   setDetailDraft(null);
   return;
  }
  setDetailDraft({
   id: selectedNode.id,
   title: selectedNode.title || '',
   notes: selectedNode.notes || '',
   targetWordCount: selectedNode.targetWordCount || 0,
  });
 }, [selectedNode?.id]);

 const flushDetailField = useCallback(
  async (chapterId: string, field: keyof OutlineNode, value: any) => {
   if (!book) return;
   const flatNodes = currentOutlineNodes.map((node) =>
    node.id === chapterId ? { ...node, [field]: value } : node
   );
   await handleSave(flatNodes);
   if (field === 'notes') {
    await useBookStore.getState().setChapterOutline(book.id, chapterId, String(value || ''));
   } else if (field === 'title') {
    await useBookStore.getState().setChapterTitle(book.id, chapterId, String(value || ''));
   }
  },
  // handleSave/currentOutlineNodes 随 book 变
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [book?.id, currentOutlineNodes, masterOutline]
 );

 const handleUpdateChapterField = (chapterId: string, field: keyof OutlineNode, value: any) => {
  if (!book) return;
  // 本地立刻改
  setDetailDraft((prev) => {
   if (!prev || prev.id !== chapterId) return prev;
   if (field === 'title') return { ...prev, title: String(value || '') };
   if (field === 'notes') return { ...prev, notes: String(value || '') };
   if (field === 'targetWordCount') return { ...prev, targetWordCount: Number(value) || 0 };
   return prev;
  });
  // 防抖写盘 / store
  if (detailFlushTimer.current) clearTimeout(detailFlushTimer.current);
  detailFlushTimer.current = setTimeout(() => {
   void flushDetailField(chapterId, field, value);
  }, 400);
 };

 // Drag & Drop
 const [draggedItemType, setDraggedItemType] = useState<'character' | 'location' | 'item' | null>(null);
 const [draggedValue, setDraggedValue] = useState<string | null>(null);

 const handleDragStart = (e: React.DragEvent, type: 'character' | 'location' | 'item', val: string) => {
 e.dataTransfer.setData('text/plain', val);
 setDraggedItemType(type);
 setDraggedValue(val);
 };

 const handleDragOver = (e: React.DragEvent) => {
 e.preventDefault();
 };

 const handleDropOnChapter = (chapterId: string) => {
 if (!draggedItemType || !draggedValue) return;

 const node = currentOutlineNodes.find((n) => n.id === chapterId);
 if (!node) return;

 if (draggedItemType === 'character') {
 const current = node.characters || [];
 if (current.includes(draggedValue)) {
 showIsland({ type: 'warning', message: `角色 ${draggedValue} 已绑定该章`, autoHideMs: 1000 });
 return;
 }
 handleUpdateChapterField(chapterId, 'characters', [...current, draggedValue]);
 } else if (draggedItemType === 'location') {
 const current = node.locations || [];
 if (current.includes(draggedValue)) {
 showIsland({ type: 'warning', message: `地点 ${draggedValue} 已绑定该章`, autoHideMs: 1000 });
 return;
 }
 handleUpdateChapterField(chapterId, 'locations', [...current, draggedValue]);
 } else if (draggedItemType === 'item') {
 const current = node.items || [];
 if (current.includes(draggedValue)) {
 showIsland({ type: 'warning', message: `道具 ${draggedValue} 已绑定该章`, autoHideMs: 1000 });
 return;
 }
 handleUpdateChapterField(chapterId, 'items', [...current, draggedValue]);
 }

 setDraggedItemType(null);
 setDraggedValue(null);
 showIsland({ type: 'success', message: `已关联 ${draggedValue}`, autoHideMs: 800 });
 };

 const handleAddLocationToWarehouse = () => {
 const val = newLocationInput.trim();
 if (!val) return;
 if (allLocations.includes(val)) {
 showIsland({ type: 'warning', message: '该地点已存在', autoHideMs: 1000 });
 return;
 }
 setSessionLocations([...sessionLocations, val]);
 setNewLocationInput('');
 showIsland({ type: 'success', message: '已添加候选地点', autoHideMs: 800 });
 };

 const handleAddItemToWarehouse = () => {
 const val = newItemInput.trim();
 if (!val) return;
 if (allItems.includes(val)) {
 showIsland({ type: 'warning', message: '该道具已存在', autoHideMs: 1000 });
 return;
 }
 setSessionItems([...sessionItems, val]);
 setNewItemInput('');
 showIsland({ type: 'success', message: '已添加候选道具', autoHideMs: 800 });
 };

 // Determine if active item belongs to settings
 const isActiveInSettings = useMemo(() => {
 if (!activeSubItem) return true;
 return settingsItems.some(item => item.id === activeSubItem.id);
 }, [settingsItems, activeSubItem]);

 return (
 <div 
 className={`relative flex flex-col overflow-hidden select-none font-sans antialiased bg-[var(--bg-secondary)] text-[var(--text-primary)] transition-all duration-300 ${isEmbedded ? 'w-full h-full' : 'w-screen h-screen'}`}
 >
 
 {/* Glow Orbs matching accent colors */}
 <div 
 className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full blur-[120px] pointer-events-none z-0 transition-all duration-500" 
 style={{ backgroundColor: 'var(--accent-glow, rgba(129,140,248,0.04))' }}
 />
 <div 
 className="absolute bottom-1/3 right-1/4 w-[450px] h-[450px] rounded-full blur-[150px] pointer-events-none z-0 transition-all duration-500" 
 style={{ backgroundColor: 'var(--accent-glow, rgba(199,184,255,0.03))' }}
 />

 {/* Frame Header */}
 <div 
 className={`flex items-center justify-between px-4 ${isEmbedded ? 'h-12' : 'h-14'} border-b border-[var(--border-color)] bg-[var(--bg-secondary)] z-[900] shadow-sm`}
 style={isEmbedded ? undefined : { WebkitAppRegion: 'drag' } as any}
 >
 {isEmbedded ? (
 <div className="flex items-center gap-1.5 w-full">
 {(['master', 'board', 'deduction', 'map', 'aimap'] as const).map((tab) => {
 const labels = {
 master: '作品总纲',
 board: '章节细纲',
 deduction: '剧情推演',
 map: '世界地图',
 aimap: 'AI地图',
 };
 return (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`px-4 py-1.5 text-xs font-semibold tracking-wider rounded-full transition-all duration-300 transform active:scale-95 ${
 activeTab === tab 
 ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent-glow)]' 
 : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
 }`}
 >
 {labels[tab]}
 </button>
 );
 })}
 </div>
 ) : (
 <>
 <div className="flex items-center gap-2">
 <div className="wz-ob-brand-icon">
 <img src={appIcon} alt="写梨眼" draggable={false} />
 </div>
 <div className="flex items-baseline gap-2">
 <span className="text-xs font-bold tracking-wider text-[var(--text-primary)]">
 大纲细纲面板
 </span>
 <span className="text-[10px] text-[var(--accent)] uppercase font-mono tracking-widest px-1.5 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded">
 NOVELIST
 </span>
 <span className="text-[10px] text-[var(--text-muted)] border-l border-[var(--border-color)] pl-2">
 {book?.title || '未命名小说'}
 </span>
 </div>
 </div>

 {/* Segmented Options */}
 <div 
 className="flex items-center bg-[var(--surface)]/60 p-1.5 rounded-full border border-[var(--border-color)] shadow-inner gap-1 relative overflow-hidden" 
 style={{ WebkitAppRegion: 'no-drag' } as any}
 >
 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-transparent pointer-events-none rounded-full" />
 {(['master', 'board', 'deduction', 'map', 'aimap'] as const).map((tab) => {
 const labels = {
 master: '作品总纲',
 board: '章节细纲',
 deduction: '剧情推演',
 map: '世界地图',
 aimap: 'AI地图',
 };
 const icons = {
 master: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
 board: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
 deduction: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
 map: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>,
 aimap: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
 };
 const isSelected = activeTab === tab;
 return (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`relative flex items-center gap-2 px-5 py-1.5 text-xs font-bold tracking-wider rounded-full transition-all duration-300 transform active:scale-95 ${
 isSelected 
 ? 'text-white shadow-lg shadow-[var(--accent)]/30' 
 : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
 }`}
 >
 {isSelected && (
 <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent)] to-indigo-500 rounded-full opacity-100 transition-opacity" />
 )}
 <div className="relative z-10 flex items-center gap-2">
 {icons[tab]}
 {labels[tab]}
 </div>
 </button>
 );
 })}
 </div>

 {/* Premium Native Controls */}
 <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
 <button onClick={handleMinimize} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-all">
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
 <path d="M5 12h14" />
 </svg>
 </button>
 <button onClick={handleMaximize} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-all">
 <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
 <rect x="3" y="3" width="18" height="18" rx="0" ry="0" />
 </svg>
 </button>
 <button onClick={handleClose} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-rose-500/20 hover:text-rose-400 transition-all">
 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
 <path d="M18 6L6 18M6 6l12 12" />
 </svg>
 </button>
 </div>
 </>
 )}
 </div>

 {/* Main Area */}
 <div className="flex flex-1 w-full overflow-hidden relative bg-[var(--bg-secondary)] z-10">
 
 {/* 1. Book Master Outline View (作品总纲) */}
 {activeTab === 'master' && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out]">
 
 {/* Left Hierarchical Sidebar */}
 <div className={`${isEmbedded ? 'w-[180px]' : 'w-[240px]'} border-r border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col p-3 overflow-y-auto premium-scroll gap-4`}>
 
 {/* Group 1: Settings Collection */}
 <div 
 className="flex flex-col gap-1.5"
 onContextMenu={(e) => handleSidebarGroupContextMenu(e, 'settings')}
 >
 <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-mono">
 <button 
 onClick={() => setSettingsExpanded(!settingsExpanded)}
 className="flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors"
 >
 <svg 
 viewBox="0 0 24 24" 
 className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${settingsExpanded ? 'rotate-90' : ''}`}
 fill="none" 
 stroke="currentColor" 
 strokeWidth="2.5"
 >
 <polyline points="9 18 15 12 9 6" />
 </svg>
 <span>设定集</span>
 </button>
 <div className="flex items-center gap-1">
 <button 
 onClick={() => { setShowAddSubItemFor('settings'); setNewSubItemTitle(''); }}
 className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 bg-[var(--surface)] hover:bg-[var(--surface-strong)] px-1.5 py-0.5 rounded transition-all font-semibold"
 title="新建设定子项"
 >
 + 新建
 </button>
 <button 
 onClick={() => setActiveMasterSectionId('world-builder')}
 className="flex items-center gap-1 text-[9px] text-amber-500 hover:text-amber-450 border border-[var(--border-color)] hover:border-amber-500/30 bg-[var(--surface)] hover:bg-amber-500/10 px-1.5 py-0.5 rounded transition-all font-semibold"
 title="AI 世界观构建器"
 >
 <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
 <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity="0.15"/>
 <ellipse cx="12" cy="12" rx="7" ry="2.5"/>
 <ellipse cx="12" cy="12" rx="2.5" ry="7"/>
 <path d="M19 4l1 1 1-1-1-1-1 1z" fill="currentColor" stroke="none"/>
 <path d="M15 8l1 1 1-1-1-1-1 1z" fill="currentColor" stroke="none"/>
 </svg>
 AI
 </button>
 </div>
 </div>
 
 {settingsExpanded && (
 <div className="flex flex-col gap-1 pl-1 ml-2 mt-1">
 {settingsItems.map(item => (
 <div 
 key={item.id}
 onContextMenu={(e) => handleSidebarContextMenu(e, item.id, 'settings')}
 className={`group flex items-center justify-between border-l-2 transition-all duration-200 ${
 activeMasterSectionId === item.id
 ? 'border-[var(--accent)] bg-[var(--surface-strong)] text-[var(--text-primary)] font-bold'
 : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
 }`}
 >
 <button
 onClick={() => setActiveMasterSectionId(item.id)}
 className="flex-1 text-left px-3 py-2 text-xs overflow-hidden text-ellipsis whitespace-nowrap"
 >
 {item.title}
 </button>
 </div>
 ))}

 {/* Inline creator for Settings */}
 {showAddSubItemFor === 'settings' && (
 <div className="flex flex-col gap-2 p-2.5 bg-[var(--surface)] border border-[var(--border-color)] rounded-md mt-1 shadow-sm">
 <input
 type="text"
 placeholder="设定项名称(如：法宝)..."
 value={newSubItemTitle}
 onChange={(e) => setNewSubItemTitle(e.target.value)}
 className="bg-[var(--bg-primary)] border border-[var(--border-color)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded placeholder-[var(--text-muted)]/40"
 onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateSubItem()}
 autoFocus
 />
 <div className="flex gap-2 justify-end">
 <button 
 onClick={() => { setShowAddSubItemFor(null); setNewSubItemTitle(''); }}
 className="px-2 py-1 text-[10px] border border-[var(--border-color)] rounded hover:bg-[var(--surface-strong)] text-[var(--text-muted)]"
 >
 取消
 </button>
 <button 
 onClick={handleConfirmCreateSubItem}
 className="px-2 py-1 text-[10px] bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded text-[var(--accent)] hover:bg-[var(--accent)]/20 font-semibold"
 >
 添加
 </button>
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 {/* Group 2: Mainline Story */}
 <div 
 className="flex flex-col gap-1.5"
 onContextMenu={(e) => handleSidebarGroupContextMenu(e, 'mainline')}
 >
 <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider font-mono">
 <button 
 onClick={() => setMainlineExpanded(!mainlineExpanded)}
 className="flex items-center gap-1.5 hover:text-[var(--text-primary)] transition-colors"
 >
 <svg 
 viewBox="0 0 24 24" 
 className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${mainlineExpanded ? 'rotate-90' : ''}`}
 fill="none" 
 stroke="currentColor" 
 strokeWidth="2.5"
 >
 <polyline points="9 18 15 12 9 6" />
 </svg>
 <span>主线剧情</span>
 </button>
 <button 
 onClick={() => { setShowAddSubItemFor('mainline'); setNewSubItemTitle(''); }}
 className="text-[9px] text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border-color)] hover:border-[var(--accent)]/30 bg-[var(--surface)] hover:bg-[var(--surface-strong)] px-1.5 py-0.5 rounded transition-all font-semibold"
 title="新建主线子项"
 >
 + 新建
 </button>
 </div>
 
 {mainlineExpanded && (
 <div className="flex flex-col gap-1 pl-1 ml-2 mt-1">
 {mainlineItems.map(item => (
 <div 
 key={item.id}
 onContextMenu={(e) => handleSidebarContextMenu(e, item.id, 'mainline')}
 className={`group flex items-center justify-between border-l-2 transition-all duration-200 ${
 activeMasterSectionId === item.id
 ? 'border-[var(--accent)] bg-[var(--surface-strong)] text-[var(--text-primary)] font-bold'
 : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
 }`}
 >
 <button
 onClick={() => setActiveMasterSectionId(item.id)}
 className="flex-1 text-left px-3 py-2 text-xs overflow-hidden text-ellipsis whitespace-nowrap"
 >
 {item.title}
 </button>
 </div>
 ))}

 {/* Inline creator for Mainline */}
 {showAddSubItemFor === 'mainline' && (
 <div className="flex flex-col gap-2 p-2.5 bg-[var(--surface)] border border-[var(--border-color)] rounded-md mt-1 shadow-sm">
 <input
 type="text"
 placeholder="剧情卷/线名称..."
 value={newSubItemTitle}
 onChange={(e) => setNewSubItemTitle(e.target.value)}
 className="bg-[var(--bg-primary)] border border-[var(--border-color)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded placeholder-[var(--text-muted)]/40"
 onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateSubItem()}
 autoFocus
 />
 <div className="flex gap-2 justify-end">
 <button 
 onClick={() => { setShowAddSubItemFor(null); setNewSubItemTitle(''); }}
 className="px-2 py-1 text-[10px] border border-[var(--border-color)] rounded hover:bg-[var(--surface-strong)] text-[var(--text-muted)]"
 >
 取消
 </button>
 <button 
 onClick={handleConfirmCreateSubItem}
 className="px-2 py-1 text-[10px] bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded text-[var(--accent)] hover:bg-[var(--accent)]/20 font-semibold"
 >
 添加
 </button>
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 </div>

 {/* Right Editor Area */}
 <div className="flex-1 flex flex-col p-3 lg:p-4 pl-0 md:pl-2 bg-[var(--bg-secondary)] overflow-hidden">
 <div className="flex-1 flex flex-col p-6 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm overflow-hidden ring-0">
 
 {/* WorldBuilder 特殊视图 */}
 {activeMasterSectionId === 'world-builder' ? (
 <div className="flex-1 overflow-y-auto premium-scroll">
 <WorldBuilder
 bookId={bookId}
 existingSettings={settingsItems}
 onSettingsGenerated={(items) => {
 if (!book) return;
 const ov = book.outlineVision || { nodes: [], version: 1 };
 const master = ov.masterOutline || {};
 const existing = master.settingsItems || [];
 // 合并：如果已有同名项则覆盖内容，否则追加
 const merged = [...existing];
 for (const newItem of items) {
 const idx = merged.findIndex(e => e.title === newItem.title);
 if (idx >= 0) {
 merged[idx] = { ...merged[idx], content: newItem.content };
 } else {
 merged.push(newItem);
 }
 }
 updateOutlineVision(bookId, {
 ...ov,
 masterOutline: { ...master, settingsItems: merged },
 });
 // 切换到第一个生成的设定项
 if (items.length > 0) {
 const firstExisting = merged.find(m => m.title === items[0].title);
 if (firstExisting) setActiveMasterSectionId(firstExisting.id);
 }
 }}
 />
 </div>
 ) : (
 <>
 {/* Section Header */}
 <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 mb-4">
 <div className="flex-1 pr-4">
 {activeSubItem ? (
 <div className="flex items-center gap-2">
 <input
 type="text"
 value={activeSubItem.title}
 onChange={(e) => handleRenameSubItem(activeSubItem.id, e.target.value)}
 className="bg-transparent text-lg font-bold text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] outline-none py-1 w-64 transition-all"
 placeholder="重命名项名称"
 />
 </div>
 ) : (
 <h2 className="text-base font-bold text-[var(--text-primary)] tracking-wide">
 作品规划
 </h2>
 )}
 <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
 {isActiveInSettings 
 ? '建议记录世界观、主要角色关系、修炼体系境界等级划分以及故事核心规则背景。' 
 : '建议记录故事的主线目标、最终Boss、各阶段戏剧冲突，以及核心故事情节的发展走向。'}
 </p>
 </div>
 <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] bg-[var(--surface)] px-2.5 py-1 rounded-full border border-[var(--border-color)] shadow-sm font-medium">
 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
 <span>内容已同步</span>
 </div>
 </div>

 {/* Template Buttons */}
 <div className="mb-4 flex flex-wrap gap-2 items-center text-xs text-[var(--text-muted)]">
 <span className="font-semibold text-[var(--text-secondary)] mr-1">快速填充模板:</span>
 {isActiveInSettings ? (
 <>
 <button 
 onClick={() => handleApplyTemplate('settings_classic')}
 className="px-3.5 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-strong)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full transition-all duration-200"
 >
 经典世界观设定
 </button>
 <button 
 onClick={() => handleApplyTemplate('settings_xiuxian')}
 className="px-3.5 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-strong)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full transition-all duration-200"
 >
 修仙境界功法设定
 </button>
 </>
 ) : (
 <>
 <button 
 onClick={() => handleApplyTemplate('mainline_standard')}
 className="px-3.5 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-strong)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full transition-all duration-200"
 >
 经典主线模板
 </button>
 <button 
 onClick={() => handleApplyTemplate('mainline_three_act')}
 className="px-3.5 py-1.5 bg-[var(--surface)] hover:bg-[var(--surface-strong)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-full transition-all duration-200"
 >
 三幕式戏剧剧情
 </button>
 </>
 )}
 </div>

 {/* Text Area Editor */}
 <div className="flex-1 w-full relative">
 <textarea
 value={activeSubItem?.content || ''}
 onChange={(e) => handleActiveContentChange(e.target.value)}
 onContextMenu={handleEditorContextMenu}
 placeholder="在此处编写您的小说大纲规划..."
 className="w-full h-full p-6 bg-[var(--surface)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-all font-sans text-sm leading-relaxed resize-none premium-scroll placeholder-[var(--text-muted)]/40 shadow-sm"
 />
 </div>
 </>
 )}
 </div>
 </div>

 </div>
 )}

 {/* 2. Chapter Kanban Board (章纲) */}
 {activeTab === 'board' && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out] p-3 lg:p-4">
 <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm ring-0">
 <div className="flex flex-1 min-h-0 overflow-hidden">
 
 <div className={`flex-1 overflow-y-auto overflow-x-hidden p-5 grid ${isEmbedded ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]'} gap-5 content-start premium-scroll`}>
 
 {chapterOrder === 'desc' && (
 <button
 onClick={handleCreateChapter}
 className="w-full h-[220px] border-2 border-dashed border-[var(--border-color)] bg-[var(--surface)]/20 hover:bg-[var(--surface)]/40 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 group hover:border-[var(--accent)] rounded-lg"
 >
 <div className="w-11 h-11 rounded-full border border-dashed border-[var(--border-color)] flex items-center justify-center group-hover:border-[var(--accent)] group-hover:scale-105 transition-all bg-[var(--surface)]">
 <svg viewBox="0 0 24 24" className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5">
 <line x1="12" y1="5" x2="12" y2="19"/>
 <line x1="5" y1="12" x2="19" y2="12"/>
 </svg>
 </div>
 <span className="text-xs font-semibold tracking-wide text-[var(--text-primary)]">添加新章节</span>
 <span className="text-[10px] text-[var(--text-muted)] opacity-85">新建章节大纲并自动同步目录</span>
 </button>
 )}

 {sortedOutlineNodes.map((node) => {
 const isFilteredOut = 
 (highlightCharacter && !node.characters?.includes(highlightCharacter)) ||
 (highlightLocation && !node.locations?.includes(highlightLocation)) ||
 (highlightItem && !node.items?.includes(highlightItem));

 const isExpanded = !!expandedChapters[node.id];

 return (
 <div 
 key={node.id}
 onDragOver={handleDragOver}
 onDrop={() => handleDropOnChapter(node.id)}
 className={`w-full flex flex-col border bg-[var(--surface)] hover:bg-[var(--surface-strong)] transition-all duration-300 rounded-lg shadow-sm ${
 isExpanded ? 'h-[500px]' : 'h-[220px]'
 } ${
 isFilteredOut 
 ? 'opacity-20 hover:opacity-60 border-[var(--border-color)]' 
 : selectedCardId === node.id 
 ? 'border-[var(--accent)] shadow-[0_4px_20px_rgba(var(--accent-glow),0.15)] ring-1 ring-[var(--accent)]/30' 
 : 'border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:-translate-y-0.5'
 }`}
 >
 <div className="flex items-center justify-between p-3.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/30 rounded-t-lg">
 <div className="flex items-center gap-2.5">
 {/* 批量生成勾选框：已完成的不显示 */}
 {node.actualWordCount < 2000 ? (
 <input
 type="checkbox"
 checked={batchSelectedIds.has(node.id)}
 onChange={() => toggleBatchSelect(node.id)}
 onClick={(e) => e.stopPropagation()}
 className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent)] accent-[var(--accent)] cursor-pointer shrink-0"
 title="选中参与批量生成"
 />
 ) : <div className="w-4 shrink-0" />}
 <div className="flex flex-col gap-0.5">
 <div className="flex items-center gap-2">
 <span className="px-1.5 py-0.5 text-[9px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded">
 {node.title.split(' ')[0]}
 </span>
 <input
 type="text"
 value={node.title.includes(' ') ? node.title.slice(node.title.indexOf(' ') + 1) : node.title}
 onChange={(e) => {
 const prefix = node.title.split(' ')[0];
 const newTitle = node.title.includes(' ') ? `${prefix} ${e.target.value}` : e.target.value;
 handleUpdateChapterField(node.id, 'title', newTitle);
 }}
 className="bg-transparent text-xs font-bold text-[var(--text-primary)] border-b border-transparent focus:border-[var(--accent)] outline-none w-32 py-0.5 transition-all"
 placeholder="章节名字"
 onClick={(e) => e.stopPropagation()}
 />
 {/* 已完成标记 + 整理状态 */}
 {node.actualWordCount >= 2000 && (() => {
 const memBank = (book as any)?.memoryBank;
 const hasMemory = Array.isArray(memBank) && memBank.some((m: any) => m.chapterId === node.chapterId && m.summary);
 return (
 <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded border ${hasMemory ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20'}`}>
 {hasMemory ? '已整理' : '未整理'}
 </span>
 );
 })()}
 </div>
 <span className="text-[9px] text-[var(--text-muted)] font-mono">
 字数: <span className="font-semibold">{node.actualWordCount}</span> / {node.targetWordCount || 3000} 字
 </span>
 </div>
 </div>

 <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
 <button 
 onClick={() => setSelectedCardId(node.id)} 
 title="细化设置"
 className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors"
 >
 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
 </button>
 <button 
 onClick={() => handleDeleteChapter(node.id)} 
 title="删除本章"
 className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
 >
 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
 </button>
 </div>
 </div>

 <div 
 onClick={() => setSelectedCardId(node.id)}
 className="flex-1 p-3.5 flex flex-col justify-between overflow-hidden cursor-pointer"
 >
 <div className="flex-1 flex flex-col gap-1.5 overflow-hidden mb-1">
 {(() => {
 const memBank = (book as any)?.memoryBank;
 const memory = Array.isArray(memBank) ? memBank.find((m: any) => m.chapterId === node.chapterId && m.summary) : null;
 const isCompleted = node.actualWordCount >= 2000;
 const plotSynopsis = memory?.plotAnalysis?.plotSynopsis || memory?.summary || '';
 const displayText = (isCompleted && plotSynopsis) ? plotSynopsis : (node.notes || '');
 const label = (isCompleted && plotSynopsis) ? '章节剧情（智能整理）' : '细化提纲梗概';
 const labelColor = (isCompleted && plotSynopsis) ? 'text-emerald-500 font-semibold' : 'text-[var(--text-muted)]';

 return (
 <>
 <span className={`text-[9px] uppercase font-bold tracking-wider ${labelColor} flex items-center gap-1 font-mono`}>
 {label}
 </span>
 {displayText ? (
 <div className={`text-[11px] text-[var(--text-secondary)] leading-relaxed pr-1 whitespace-pre-wrap break-all overflow-hidden font-normal ${isExpanded ? 'overflow-y-auto flex-1 premium-scroll' : 'line-clamp-4'}`}>
 {displayText}
 </div>
 ) : (
 <span className="text-[11px] text-[var(--text-muted)]/60 italic font-normal">点击配置详细的本章提纲剧情走势...</span>
 )}
 </>
 );
 })()}
 </div>
 </div>

 {/* Bottom collapsible trigger */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 setExpandedChapters(prev => ({
 ...prev,
 [node.id]: !prev[node.id]
 }));
 }}
 className="w-full py-2 bg-[var(--bg-secondary)]/30 border-t border-[var(--border-color)] hover:bg-[var(--surface-strong)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1 transition-all rounded-b-lg"
 >
 <svg 
 viewBox="0 0 24 24" 
 className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
 fill="none" 
 stroke="currentColor" 
 strokeWidth="2.5"
 >
 <polyline points="6 9 12 15 18 9" />
 </svg>
 <span>{isExpanded ? '收起细化提纲' : '展开细化提纲'}</span>
 </button>
 </div>
 );
 })}

 {chapterOrder === 'asc' && (
 <button
 onClick={handleCreateChapter}
 className="w-full h-[220px] border-2 border-dashed border-[var(--border-color)] bg-[var(--surface)]/20 hover:bg-[var(--surface)]/40 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 group hover:border-[var(--accent)] rounded-lg"
 >
 <div className="w-11 h-11 rounded-full border border-dashed border-[var(--border-color)] flex items-center justify-center group-hover:border-[var(--accent)] group-hover:scale-105 transition-all bg-[var(--surface)]">
 <svg viewBox="0 0 24 24" className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5">
 <line x1="12" y1="5" x2="12" y2="19"/>
 <line x1="5" y1="12" x2="19" y2="12"/>
 </svg>
 </div>
 <span className="text-xs font-semibold tracking-wide text-[var(--text-primary)]">添加新章节</span>
 <span className="text-[10px] text-[var(--text-muted)] opacity-85">新建章节大纲并自动同步目录</span>
 </button>
 )}

 </div>

 {/* Float Option bar — 仅在有筛选高亮时显示 */}
 {(highlightCharacter || highlightLocation || highlightItem) && (
 <div className="absolute left-6 bottom-6 flex items-center gap-2 bg-[var(--bg-secondary)]/90 p-2 rounded-lg border border-[var(--border-color)] shadow-lg z-[800] animate-[fadeIn_0.15s_ease-out]">
 <span className="text-[10px] text-[var(--text-secondary)] font-medium px-1">正在筛选包含指定设定的章节</span>
 <button 
 onClick={() => {
 setHighlightCharacter(null);
 setHighlightLocation(null);
 setHighlightItem(null);
 }}
 className="px-2.5 py-1 text-[10px] font-semibold border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md transition-all"
 >
 重置过滤筛选
 </button>
 </div>
 )}

 {/* Warehouse Drawer panel */}
 <div className="w-64 border-l border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden">
 {/* 批量生成按钮 */}
 <div className="p-4 border-b border-[var(--border-color)]">
 <button
 onClick={() => void handleBatchGenerate()}
 className={`w-full px-3 py-2.5 text-xs font-semibold rounded-md transition duration-350 shadow-md ${
 batchGen.state.status === 'running'
 ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/10'
 : batchGen.state.status === 'paused'
 ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/10'
 : 'bg-[var(--accent)] text-white shadow-[var(--accent-glow)]'
 } hover:opacity-95 transform active:scale-[0.98]`}
 >
 {batchGen.state.status === 'running' ? '⏸ 暂停生成' : batchGen.state.status === 'paused' ? '▶ 继续生成' : '⚡ 批量生成'}
 </button>
 {batchGen.state.status === 'running' && (
 <div className="mt-2 text-[9px] text-[var(--text-muted)] text-center font-mono">
 正在生成第 {batchGen.state.currentIndex + 1}/{batchGen.state.queue.length} 章
 </div>
 )}
 {batchGen.state.status === 'idle' && (
 <div className="mt-2.5 flex items-center justify-between text-[10px]">
 <button onClick={selectAllForBatch} className="text-[var(--accent)] hover:underline font-medium transition">全选待生成</button>
 <span className="text-[var(--text-muted)] font-mono">{batchSelectedIds.size} 章已选</span>
 <button onClick={clearBatchSelection} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">清除</button>
 </div>
 )}
 </div>

 <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
 <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono pl-1">AI 剧情规划</span>
 <button onClick={() => setArcMessages([{ role: 'assistant', content: '你好！我是剧情规划助手。告诉我你的故事方向，我来帮你规划章节细纲。\n\n输出大纲后可一键创建章节。' }])} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">清空</button>
 </div>

 <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 premium-scroll">
 {arcMessages.map((msg, i) => (
 <div key={i} className="flex flex-col gap-1">
 <div className={`text-xs leading-relaxed p-2.5 rounded-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--text-primary)] ml-4' : 'bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-secondary)] mr-4'}`}>
 {msg.content}
 </div>
 {msg.hasOutline && msg.outlineParsed && msg.outlineParsed.length > 0 && (
 <div className="mr-4 p-2 rounded border border-emerald-500/20 bg-emerald-500/5">
 <div className="text-[10px] text-emerald-300 font-bold mb-1.5">📝 检测到 {msg.outlineParsed.length} 章大纲</div>
 <div className="flex flex-col gap-1 mb-2 max-h-[120px] overflow-auto">
 {msg.outlineParsed.map((ch, j) => (
 <div key={j} className="text-[10px] text-[var(--text-muted)] truncate">第{ch.chapterNumber}章 {ch.title}</div>
 ))}
 </div>
 <button
 onClick={() => void handleApplyOutline(msg.outlineParsed!)}
 className="w-full py-1.5 rounded border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 text-[10px] font-bold hover:bg-emerald-500/25 transition-all"
 >
 ✓ 创建章节并填入细纲
 </button>
 </div>
 )}
 </div>
 ))}
 {arcLoading && <div className="text-[10px] text-[var(--accent)] animate-pulse pl-2">AI 思考中...</div>}
 </div>

 <div className="p-3 border-t border-[var(--border-color)]">
 <div className="flex items-center gap-2 mb-2">
 <div
 role="button"
 onClick={() => setArcWebSearch(!arcWebSearch)}
 className="flex items-center gap-2 group cursor-pointer select-none"
 >
 <div
 className={`relative inline-flex h-[12px] w-[24px] shrink-0 items-center rounded-full border transition-all duration-300 ease-in-out ${
 arcWebSearch
 ? 'bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_6px_var(--accent)]'
 : 'bg-white/10 border-[var(--border-color)] group-hover:bg-white/20 group-hover:border-[var(--border-color)]'
 }`}
 >
 <span
 className="pointer-events-none inline-block h-[8px] w-[8px] rounded-full bg-white shadow-sm transition-all duration-300 ease-in-out"
 style={{
 transform: arcWebSearch ? 'translateX(14px)' : 'translateX(2px)'
 }}
 />
 </div>
 <span
 className={`text-[10px] tracking-wide transition-colors duration-300 flex items-center gap-0.5 ${
 arcWebSearch
 ? 'text-[var(--accent)] font-medium'
 : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
 }`}
 >
 🌐 联网搜索
 </span>
 </div>
 </div>
 <div className="flex gap-2">
 <input
 value={arcInput}
 onChange={(e) => setArcInput(e.target.value)}
 onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleArcSend(); } }}
 placeholder="讨论剧情走向..."
 className="flex-1 bg-[var(--surface)] border border-[var(--border-color)] rounded-md px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] placeholder-[var(--text-muted)]/50"
 disabled={arcLoading}
 />
 <button onClick={handleArcSend} disabled={arcLoading || !arcInput.trim()} className="px-3 rounded-md bg-[var(--accent)] text-white text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity">发送</button>
 </div>
 </div>
 </div>

 </div>
 </div>
 </div>
 )}

 {/* 4. Full Warehouse View — 已移除 */}
 {false && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out] p-3 lg:p-4">
 <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm ring-0 premium-scroll">
 <div className="border-b border-[var(--border-color)] pb-3">
 <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">设定数据及章节绑定汇总</h2>
 <p className="text-xs text-[var(--text-muted)] mt-1">汇总本书的所有角色、地点、道具以及其所关联的剧情章节范围</p>
 </div>

 <div className="flex flex-col gap-4">
 <h3 className="text-xs font-bold text-blue-500 border-l-4 border-blue-500 pl-3 font-semibold">角色出现及出场统计</h3>
 <div className={`grid ${isEmbedded ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
 {allCharacters.map((char) => {
 const associated = currentOutlineNodes.filter(n => n.characters?.includes(char.name));
 return (
 <div key={char.id} className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-strong)] transition-all duration-300 flex flex-col justify-between min-h-[140px] shadow-sm hover:shadow">
 <div>
 <div className="flex items-center gap-2 mb-2">
 <span className="text-xs font-bold text-[var(--text-primary)]">{char.name}</span>
 <span className="px-1.5 py-0.5 text-[9px] border border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-muted)] rounded">{char.categoryName}</span>
 </div>
 <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">{char.bio || '无详细设定背景'}</p>
 </div>
 <div className="text-[10px] text-[var(--text-muted)] flex justify-between items-center border-t border-[var(--border-color)] pt-3 mt-3">
 <span>关联章节: <span className="font-semibold text-[var(--text-primary)]">{associated.length}</span> 章</span>
 <div className="flex gap-1 overflow-hidden">
 {associated.slice(0, 3).map(ch => (
 <span key={ch.id} className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[9px] border border-[var(--accent)]/20 font-semibold font-mono">
 {ch.title.split(' ')[0]}
 </span>
 ))}
 {associated.length > 3 && <span className="text-[9px] text-[var(--text-muted)]">...</span>}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 <div className="flex flex-col gap-4 mt-4">
 <h3 className="text-xs font-bold text-emerald-500 border-l-4 border-emerald-500 pl-3 font-semibold">场景地点出现统计</h3>
 <div className={`grid ${isEmbedded ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
 {allLocations.map((loc) => {
 const associated = currentOutlineNodes.filter(n => n.locations?.includes(loc));
 return (
 <div key={loc} className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-strong)] transition-all duration-300 flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow">
 <div>
 <span className="text-xs font-bold text-emerald-500">{loc}</span>
 <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">在该地点发生的章节数与剧情明细</p>
 </div>
 <div className="text-[10px] text-[var(--text-muted)] flex justify-between items-center border-t border-[var(--border-color)] pt-3 mt-3">
 <span>关联章节: <span className="font-semibold text-[var(--text-primary)]">{associated.length}</span> 章</span>
 <div className="flex gap-1">
 {associated.slice(0, 3).map(ch => (
 <span key={ch.id} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] border border-emerald-500/20 font-semibold font-mono">
 {ch.title.split(' ')[0]}
 </span>
 ))}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 <div className="flex flex-col gap-4 mt-4">
 <h3 className="text-xs font-bold text-orange-500 border-l-4 border-orange-500 pl-3 font-semibold">道具及伏笔线索统计</h3>
 <div className={`grid ${isEmbedded ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
 {allItems.map((itm) => {
 const associated = currentOutlineNodes.filter(n => n.items?.includes(itm));
 return (
 <div key={itm} className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface)] hover:bg-[var(--surface-strong)] transition-all duration-300 flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow">
 <div>
 <span className="text-xs font-bold text-orange-500">{itm}</span>
 <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">携带、使用或提及该道具线索的章节明细</p>
 </div>
 <div className="text-[10px] text-[var(--text-muted)] flex justify-between items-center border-t border-[var(--border-color)] pt-3 mt-3">
 <span>关联章节: <span className="font-semibold text-[var(--text-primary)]">{associated.length}</span> 章</span>
 <div className="flex gap-1">
 {associated.slice(0, 3).map(ch => (
 <span key={ch.id} className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 text-[9px] border border-orange-500/20 font-semibold font-mono">
 {ch.title.split(' ')[0]}
 </span>
 ))}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>

 </div>
 </div>
 )}

 {/* 5. Chapter Detail sidebar drawer */}
 {selectedNode && (
 <div className="absolute top-0 right-0 bottom-0 w-[380px] bg-[var(--bg-secondary)] border-l border-[var(--border-color)] shadow-2xl flex flex-col z-[1000] animate-[slideIn_0.15s_ease-out] ">
 <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50">
 <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 tracking-wider uppercase">
 章节细化大纲设置
 </span>
 <button 
 onClick={() => setSelectedCardId(null)}
 className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] text-lg transition-colors"
 >
 &times;
 </button>
 </div>
 <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 premium-scroll bg-[var(--bg-primary)]">
 
 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-0.5">章节标题</label>
 <input
 type="text"
 value={detailDraft?.id === selectedNode.id ? detailDraft.title : selectedNode.title}
 onChange={(e) => handleUpdateChapterField(selectedNode.id, 'title', e.target.value)}
 onBlur={() => {
  if (detailFlushTimer.current) clearTimeout(detailFlushTimer.current);
  const v = detailDraft?.id === selectedNode.id ? detailDraft.title : selectedNode.title;
  void flushDetailField(selectedNode.id, 'title', v);
 }}
 className="bg-[var(--surface)] border border-[var(--border-color)] rounded-md p-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all font-semibold"
 />
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-0.5">目标字数</label>
 <input
 type="number"
 value={detailDraft?.id === selectedNode.id ? detailDraft.targetWordCount : (selectedNode.targetWordCount || 0)}
 onChange={(e) => handleUpdateChapterField(selectedNode.id, 'targetWordCount', Number(e.target.value))}
 onBlur={() => {
  if (detailFlushTimer.current) clearTimeout(detailFlushTimer.current);
  const v = detailDraft?.id === selectedNode.id ? detailDraft.targetWordCount : (selectedNode.targetWordCount || 0);
  void flushDetailField(selectedNode.id, 'targetWordCount', v);
 }}
 className="bg-[var(--surface)] border border-[var(--border-color)] rounded-md p-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all"
 />
 </div>
 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-0.5 font-mono">实际字数 (同步)</label>
 <div className="bg-[var(--surface-strong)] border border-[var(--border-color)] rounded-md p-2.5 text-xs text-[var(--text-muted)] font-semibold font-mono">
 {selectedNode.actualWordCount} 字
 </div>
 </div>
 </div>

 <div className="flex flex-col gap-1.5 flex-1">
 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-0.5">提纲大纲剧情细化</label>
 <textarea
 value={detailDraft?.id === selectedNode.id ? detailDraft.notes : (selectedNode.notes || '')}
 onChange={(e) => handleUpdateChapterField(selectedNode.id, 'notes', e.target.value)}
 onBlur={() => {
  if (detailFlushTimer.current) clearTimeout(detailFlushTimer.current);
  const v = detailDraft?.id === selectedNode.id ? detailDraft.notes : (selectedNode.notes || '');
  void flushDetailField(selectedNode.id, 'notes', v);
 }}
 placeholder="在此写下详细章节提纲..."
 className="bg-[var(--surface)] border border-[var(--border-color)] rounded-md p-2.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-all resize-none flex-1 min-h-[220px] leading-relaxed placeholder-[var(--text-muted)]/40 premium-scroll shadow-sm"
 />
 </div>

 <div className="flex flex-col gap-1.5">
 <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-0.5">出场角色映射</label>
 <div className="flex flex-col gap-1 max-h-48 overflow-y-auto bg-[var(--surface)] p-2 rounded-lg border border-[var(--border-color)] premium-scroll">
 {allCharacters.map((char) => {
 const isChecked = selectedNode.characters?.includes(char.name) || false;
 return (
 <label key={char.id} className="flex items-center justify-between cursor-pointer p-2 hover:bg-[var(--surface-strong)] rounded-md transition-colors">
 <div className="flex items-center gap-2">
 <input 
 type="checkbox"
 checked={isChecked}
 onChange={() => {
 const currentList = selectedNode.characters || [];
 const nextList = isChecked 
 ? currentList.filter((n) => n !== char.name) 
 : [...currentList, char.name];
 handleUpdateChapterField(selectedNode.id, 'characters', nextList);
 }}
 className="rounded border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--accent)] focus:ring-0 w-3.5 h-3.5 accent-[var(--accent)]"
 />
 <span className="text-xs text-[var(--text-secondary)] font-medium">
 {char.name}
 </span>
 </div>
 <span className="text-[9px] text-[var(--text-muted)] px-1.5 py-0.5 bg-[var(--surface-strong)] rounded border border-[var(--border-color)]">
 {char.categoryName}
 </span>
 </label>
 );
 })}
 {allCharacters.length === 0 && (
 <span className="text-xs text-[var(--text-muted)]/60 text-center py-4 font-medium">暂无可用角色</span>
 )}
 </div>
 </div>

 </div>

 <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50 flex gap-2">
 <button 
 onClick={() => setSelectedCardId(null)}
 className="w-full py-2.5 rounded-md bg-[var(--accent)] text-white text-xs font-semibold hover:brightness-110 shadow-md transition-all active:scale-[0.98]"
 >
 完成本章大纲配置
 </button>
 </div>
 </div>
 )}

 {/* 5. World Map View */}
 {activeTab === 'map' && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out]">
 <MapPanel bookId={bookId} />
 </div>
 )}

 {/* 6. AI Map View */}
 {activeTab === 'aimap' && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out]">
 <AiMapPanel />
 </div>
 )}

 {/* 7. Plot Deduction Workspace */}
 {activeTab === 'deduction' && book && (
 <div className="flex flex-1 overflow-hidden animate-[fadeIn_0.1s_ease-out]">
 <PlotDeductionWorkspace bookId={book.id} book={book} />
 </div>
 )}
 </div>

 <style>{`
 @keyframes slideIn {
 from { transform: translateX(100%); }
 to { transform: translateX(0); }
 }
 @keyframes fadeIn {
 from { opacity: 0; }
 to { opacity: 1; }
 }
 .scrollbar-hide::-webkit-scrollbar {
 display: none;
 }
 .premium-scroll::-webkit-scrollbar {
 width: 5px;
 height: 5px;
 }
 .premium-scroll::-webkit-scrollbar-track {
 background: transparent;
 }
 .premium-scroll::-webkit-scrollbar-thumb {
 background: var(--border-color);
 border-radius: 9999px;
 }
 .premium-scroll::-webkit-scrollbar-thumb:hover {
 background: var(--accent);
 }
 `}</style>
 
 <Island />

 {/* Custom Context Menu */}
 {contextMenu.visible && (
 <div 
 className="fixed z-[10000] min-w-[140px] bg-[var(--bg-secondary)] border border-[var(--border-color)] shadow-xl py-1 flex flex-col rounded-md"
 style={{ top: contextMenu.y, left: contextMenu.x }}
 onClick={(e) => e.stopPropagation()}
 >
 {contextMenu.type === 'sidebar' ? (
 <>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 if (contextMenu.groupType) {
 setShowAddSubItemFor(contextMenu.groupType);
 setNewSubItemTitle('');
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors font-semibold"
 >
 新建子项
 </button>
 
 {contextMenu.itemId && (
 <>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 if (contextMenu.itemId) {
 setActiveMasterSectionId(contextMenu.itemId);
 setTimeout(() => {
 const inputEl = document.querySelector('input[placeholder="重命名项名称"]') as HTMLInputElement;
 if (inputEl) {
 inputEl.focus();
 inputEl.select();
 }
 }, 50);
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors border-t border-[var(--border-color)] font-semibold"
 >
 重命名
 </button>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 if (contextMenu.itemId) {
 const target = settingsItems.find(i => i.id === contextMenu.itemId) || mainlineItems.find(i => i.id === contextMenu.itemId);
 if (target) {
 handleDeleteSubItem(contextMenu.itemId, target.title);
 }
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors border-t border-[var(--border-color)] font-semibold"
 >
 删除子项
 </button>
 </>
 )}
 </>
 ) : (
 <>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 const textarea = document.querySelector('textarea[placeholder="在此处编写您的小说大纲规划..."]') as HTMLTextAreaElement;
 if (textarea) {
 const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
 const textToCopy = selectedText || textarea.value;
 if (textToCopy) {
 navigator.clipboard.writeText(textToCopy);
 showIsland({ type: 'success', message: '已复制到剪贴板', autoHideMs: 800 });
 }
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors font-semibold"
 >
 复制
 </button>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 navigator.clipboard.readText().then((clipText) => {
 const textarea = document.querySelector('textarea[placeholder="在此处编写您的小说大纲规划..."]') as HTMLTextAreaElement;
 if (textarea) {
 const start = textarea.selectionStart;
 const end = textarea.selectionEnd;
 const text = textarea.value;
 const before = text.substring(0, start);
 const after = text.substring(end, text.length);
 const nextValue = before + clipText + after;
 handleActiveContentChange(nextValue);
 setTimeout(() => {
 textarea.focus();
 textarea.setSelectionRange(start + clipText.length, start + clipText.length);
 }, 50);
 }
 });
 }}
 className="w-full text-left px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors border-t border-[var(--border-color)] font-semibold"
 >
 粘贴
 </button>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 const textarea = document.querySelector('textarea[placeholder="在此处编写您的小说大纲规划..."]') as HTMLTextAreaElement;
 if (textarea) {
 textarea.focus();
 textarea.select();
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors border-t border-[var(--border-color)] font-semibold"
 >
 全选
 </button>
 <button 
 onClick={() => {
 setContextMenu(prev => ({ ...prev, visible: false }));
 const textarea = document.querySelector('textarea[placeholder="在此处编写您的小说大纲规划..."]') as HTMLTextAreaElement;
 if (textarea) {
 if (textarea.selectionStart !== textarea.selectionEnd) {
 const start = textarea.selectionStart;
 const end = textarea.selectionEnd;
 const text = textarea.value;
 const nextValue = text.substring(0, start) + text.substring(end, text.length);
 handleActiveContentChange(nextValue);
 setTimeout(() => {
 textarea.focus();
 textarea.setSelectionRange(start, start);
 }, 50);
 } else {
 if (window.confirm('确认清空当前所有内容吗？')) {
 handleActiveContentChange('');
 }
 }
 }
 }}
 className="w-full text-left px-4 py-2 text-xs text-rose-500 hover:text-rose-450 hover:bg-rose-500/10 transition-colors border-t border-[var(--border-color)] font-semibold"
 >
 清除 / 删除
 </button>
 </>
 )}
 </div>
 )}
 </div>
 );
}
