// 模块说明：功能=章节目录与分卷管理；架构=章节结构控制与分卷边界分组。
// 关键职责：维护章节增删改排序、分卷边界与上下文菜单交互状态。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import { useBookStore } from '../../store/useBookStore';
import { useConfigStore } from '../../store/useConfigStore';
import { useIslandStore } from '../../store/useIslandStore';
import { zhCN } from '../../i18n/zh-CN';
import type { Book, Chapter, Volume, RecycledChapter } from '../../types';
import { buildDefaultChapterContent, replaceChapterHeading } from '../../utils/chapterTemplate';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { electronAPI, safeConfirm } from '../../utils/electron';
import { promptDialog } from '../../store/usePromptDialogStore';
import { MiniBookshelf } from './MiniBookshelf';
import { ExportRangeModal, type ExportRange } from '../modals/ExportRangeModal';
import { exportChapters, EXPORT_TITLE, type ExportFormat } from '../../utils/exportChapters';


interface ChapterListProps {
 book: Book;
}

function renderBookSearchContext(context: string, search: string) {
 const text = String(context || '');
 const term = String(search || '').trim();
 if (!term) return text;
 const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 let regex: RegExp;
 try { regex = new RegExp(escaped, 'gi'); } catch { return text; }
 const parts: ReactNode[] = [];
 let last = 0;
 let match = regex.exec(text);
 while (match) {
  if (match.index > last) parts.push(text.slice(last, match.index));
  parts.push(<mark key={`${match.index}-${match[0]}`} className="wz-search-highlight">{match[0]}</mark>);
  last = match.index + match[0].length;
  match = regex.exec(text);
 }
 if (last < text.length) parts.push(text.slice(last));
 return parts.length ? parts : text;
}

interface MenuState {
 chapterId: string;
 x: number;
 y: number;
}

interface VolumeSection {
 id: string;
 title: string;
 startIndex: number;
 endIndex: number;
 chapterCount: number;
}

function createId(): string {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
 return crypto.randomUUID();
 }
 return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseChapterNumber(title: string): number | null {
  const normalized = String(title || '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
  const match = normalized.match(/第\s*(\d+)\s*[章节回篇]/);
  if (!match) return null;
  const no = Number(match[1]);
  return Number.isFinite(no) && no > 0 ? no : null;
}

function updateChapterNumberInTitle(title: string, newNo: number): string {
  return title.replace(/第\s*(\d+)\s*([章节回篇])/, `第${newNo}$2`);
}

function inferNextChapterNumber(chapters: Chapter[]): number {
 // 章节可能被删除或从外部导入，不能只按数组长度推断下一章。
 const maxTitleNo = chapters.reduce((max, chapter) => {
 const no = parseChapterNumber(chapter.title);
 return no ? Math.max(max, no) : max;
 }, 0);
 return Math.max(maxTitleNo + 1, chapters.length + 1);
}

function nextChapterTitle(chapters: Chapter[]): string {
 return `第${inferNextChapterNumber(chapters)}章`;
}

function normalizeChapterTitle(title: string): string {
 return title.replace(/^\d+\s+/, '').trim();
}

function resolveVolumeStartId(volume: Volume): string | undefined {
 return typeof volume.startChapterId === 'string' && volume.startChapterId.trim() ? volume.startChapterId : undefined;
}

function buildVolumeSections(chapters: Chapter[], volumes: Volume[]): VolumeSection[] {
 // 按 startChapterId 将章节切成连续区间；每个区间代表一个分卷。
 if (chapters.length === 0) return [];
 if (volumes.length === 0) {
 return [
 {
 id: '__default__',
 title: '第1卷',
 startIndex: 0,
 endIndex: chapters.length - 1,
 chapterCount: chapters.length
 }
 ];
 }

 const chapterIndexMap = new Map<string, number>();
 chapters.forEach((chapter, index) => chapterIndexMap.set(chapter.id, index));

 const markers = volumes
 .map((volume, order) => {
 const startId = resolveVolumeStartId(volume);
 const index = startId ? chapterIndexMap.get(startId) : undefined;
 if (index === undefined) return null;
 return {
 id: volume.id,
 title: volume.title || `第${order + 1}卷`,
 startIndex: index,
 order
 };
 })
 .filter((item): item is { id: string; title: string; startIndex: number; order: number } => Boolean(item))
 .sort((a, b) => (a.startIndex === b.startIndex ? a.order - b.order : a.startIndex - b.startIndex));

 if (markers.length === 0) {
 return [
 {
 id: '__default__',
 title: '第1卷',
 startIndex: 0,
 endIndex: chapters.length - 1,
 chapterCount: chapters.length
 }
 ];
 }

 const sections: VolumeSection[] = [];

 if (markers[0].startIndex > 0) {
 sections.push({
 id: '__unassigned__',
 title: '未分卷',
 startIndex: 0,
 endIndex: markers[0].startIndex - 1,
 chapterCount: markers[0].startIndex
 });
 }

 for (let i = 0; i < markers.length; i += 1) {
 const current = markers[i];
 const next = markers[i + 1];
 const endIndex = next ? next.startIndex - 1 : chapters.length - 1;
 if (current.startIndex > endIndex) continue;
 sections.push({
 id: current.id,
 title: current.title,
 startIndex: current.startIndex,
 endIndex,
 chapterCount: endIndex - current.startIndex + 1
 });
 }

 return sections;
}

function inferNextVolumeNumber(volumes: Volume[], chaptersCount: number): number {
 // 优先从“第N卷”解析最大 N；解析失败时按现有分卷数量兜底。
 // 若还没有显式分卷但已有章节，说明“第1卷”已隐式存在，默认从第2卷开始。
 let maxNo = 0;
 for (const volume of volumes) {
 const match = String(volume.title || '').match(/第\s*(\d+)\s*卷/);
 if (!match) continue;
 const no = Number(match[1]);
 if (Number.isFinite(no)) {
 maxNo = Math.max(maxNo, no);
 }
 }
 if (maxNo > 0) return maxNo + 1;
 if (volumes.length > 0) return volumes.length + 1;
 return chaptersCount > 0 ? 2 : 1;
}

// P2: 章节列表虚拟化。当单卷章节数超过阈值时，只渲染可视区域 + overscan 的行，
// 避免上千章时创建上千个 DOM 节点。使用共享滚动容器（scrollParentRef），
// 通过 getBoundingClientRect 计算本分区在可视区内的行区间，因此与分卷、折叠兼容。
const CHAPTER_VIRTUALIZE_THRESHOLD = 80;
const CHAPTER_ROW_OVERSCAN = 8;
const DEFAULT_CHAPTER_ROW_HEIGHT = 30;

interface VirtualChapterListProps {
	chapters: Chapter[];
	scrollParentRef: { current: HTMLDivElement | null };
	activeChapterId: string | null;
	registerRef: (chapterId: string, node: HTMLButtonElement | null) => void;
	onOpen: (chapterId: string) => void;
	onContextMenu: (chapterId: string, x: number, y: number) => void;
	multiSelectActive: boolean;
	selectedIds: Set<string>;
	onToggleSelect: (chapterId: string) => void;
}

function VirtualChapterList({ chapters, scrollParentRef, activeChapterId, registerRef, onOpen, onContextMenu, multiSelectActive, selectedIds, onToggleSelect }: VirtualChapterListProps) {
 const wrapperRef = useRef<HTMLDivElement | null>(null);
 const [rowHeight, setRowHeight] = useState(DEFAULT_CHAPTER_ROW_HEIGHT);
 const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: Math.min(chapters.length, 40) });

 const recompute = useCallback(() => {
 const parent = scrollParentRef.current;
 const wrapper = wrapperRef.current;
 if (!parent || !wrapper) return;
 const parentRect = parent.getBoundingClientRect();
 const wrapperRect = wrapper.getBoundingClientRect();
 // 本分区顶部相对于滚动容器可视区顶部的偏移（负值表示已滚过）。
 const viewTop = parentRect.top - wrapperRect.top;
 const viewBottom = viewTop + parent.clientHeight;
 const start = Math.max(0, Math.floor(viewTop / rowHeight) - CHAPTER_ROW_OVERSCAN);
 const end = Math.min(chapters.length, Math.ceil(viewBottom / rowHeight) + CHAPTER_ROW_OVERSCAN);
 setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
 }, [scrollParentRef, rowHeight, chapters.length]);

 useLayoutEffect(() => {
 recompute();
 }, [recompute, chapters.length]);

 useEffect(() => {
 const parent = scrollParentRef.current;
 if (!parent) return;
 let raf = 0;
 const onScroll = () => {
 if (raf) return;
 raf = window.requestAnimationFrame(() => { raf = 0; recompute(); });
 };
 parent.addEventListener('scroll', onScroll, { passive: true });
 window.addEventListener('resize', onScroll);
 return () => {
 parent.removeEventListener('scroll', onScroll);
 window.removeEventListener('resize', onScroll);
 if (raf) window.cancelAnimationFrame(raf);
 };
 }, [scrollParentRef, recompute]);

 // 从首个已渲染行实测行高（含行间距），修正估值以保证滚动数学准确。
 const measuredRef = useRef(false);
 const measureRef = useCallback((node: HTMLDivElement | null) => {
 if (node && !measuredRef.current) {
 const isActive = node.getAttribute('data-active') === 'true';
 if (isActive) return; // 避免拿高亮的 active 项作为全局基准，其高度可能不同
 const h = node.offsetHeight;
 if (h > 0) {
 if (Math.abs(h - rowHeight) > 1) setRowHeight(h);
 measuredRef.current = true;
 }
 }
 }, [rowHeight]);

 const total = chapters.length * rowHeight;
 const activeIndex = activeChapterId ? chapters.findIndex((c) => c.id === activeChapterId) : -1;

 const indices: number[] = [];
 for (let i = range.start; i < range.end; i += 1) indices.push(i);
 // 总是渲染当前活动章节（即使不在窗口内），使父级的 scrollIntoView 定位依然生效。
 if (activeIndex >= 0 && (activeIndex < range.start || activeIndex >= range.end)) indices.push(activeIndex);

 const wrapperStyle = { position: 'relative' as const, height: total };
 const rowStyle = (index: number) => ({ position: 'absolute' as const, top: index * rowHeight, left: 0, right: 0, paddingBottom: 3 });
 return (
 <div ref={wrapperRef} className="mt-1" style={wrapperStyle}>
 {indices.map((index) => {
	const chapter = chapters[index];
	if (!chapter) return null;
	const active = chapter.id === activeChapterId;
	const selected = selectedIds.has(chapter.id);
	return (
	<div
	key={chapter.id}
	ref={index === range.start ? measureRef : undefined}
	style={rowStyle(index)} 
	data-active={active}
	>
	<button
	className={clsx('w-full text-left transition-all duration-200 flex items-center gap-2', active ? 'wz-chapter-item-active' : 'wz-chapter-item')}
	ref={(node) => registerRef(chapter.id, node)}
	onClick={() => { if (multiSelectActive) onToggleSelect(chapter.id); else onOpen(chapter.id); }}
	onContextMenu={(event) => { event.preventDefault(); onContextMenu(chapter.id, event.clientX, event.clientY); }}
	>
	{multiSelectActive && (
		<span className="flex shrink-0 items-center">
			<span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-all', selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-color)]')}>
				{selected && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 13l4 4L19 7"/></svg>}
			</span>
		</span>
	)}
	<span className="flex items-center justify-between w-full">
		<span className="truncate pr-2">{normalizeChapterTitle(chapter.title || zhCN.chapter.untitled)}</span>
		<span className={clsx('wz-ch-wc shrink-0', active && 'is-active')}>{chapter.wordCount || 0}字</span>
	</span>
	</button>
	</div>
	);
 })}
 </div>
 );
}

export function ChapterList({ book }: ChapterListProps) {
const openEditor = useAppStore((s) => s.openEditor);
	const bookSearchResults = useAppStore((s) => s.bookSearchResults);
	const setBookSearchResults = useAppStore((s) => s.setBookSearchResults);
	const setPendingSearchJump = useAppStore((s) => s.setPendingSearchJump);
	// 全书搜索浮层定位（fixed，跟随侧边栏主体容器，脱离布局不挤压）
	const [searchOverlayPos, setSearchOverlayPos] = useState<{ top: number; left: number; width: number } | null>(null);
	useEffect(() => {
		const measure = () => {
			const el = sidebarRootRef.current;
			if (!el) return;
			const r = el.getBoundingClientRect();
			setSearchOverlayPos({ top: r.top, left: r.left, width: r.width });
		};
		if (bookSearchResults) measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	}, [bookSearchResults]);
	const updateBook = useBookStore((s) => s.updateBook);
	const activeChapterId = useAppStore((s) => s.activeChapterId);
	const allBooks = useBookStore((s) => s.books);
	const setRoute = useAppStore((s) => s.setRoute);
 const config = useConfigStore((s) => s.config);
 const saveConfig = useConfigStore((s) => s.saveConfig);
 const scrollRef = useRef<HTMLDivElement | null>(null);
 const sidebarRootRef = useRef<HTMLDivElement | null>(null);
 const chapterSearchRef = useRef<HTMLInputElement | null>(null);
 const [chapterSearch, setChapterSearch] = useState('');
	const chapterButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const pendingCreatedChapterIdRef = useRef<string | null>(null);
	const creatingChapterRef = useRef(false);
	const recentlyCreatedIdsRef = useRef<Set<string>>(new Set());
	const centeredChapterKeyRef = useRef<string | null>(null);
	const prevCountRef = useRef(book.chapters.length);
	const latestBookRef = useRef(book);
	latestBookRef.current = book;

 const { run: runAsync } = useAsyncAction();
 const [menu, setMenu] = useState<MenuState | null>(null);
 const [volumeDialogOpen, setVolumeDialogOpen] = useState(false);
 const [newVolumeName, setNewVolumeName] = useState('');
 const [creatingVolume, setCreatingVolume] = useState(false);
 const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());
 const [deleteConfirmChapterId, setDeleteConfirmChapterId] = useState<string | null>(null);
 const [volumeMenu, setVolumeMenu] = useState<{ volumeId: string; x: number; y: number } | null>(null);
 const chapterOrderFromConfig = config?.ui.chapterListOrder;
 const [chapterOrder, setChapterOrder] = useState<'asc' | 'desc'>(chapterOrderFromConfig === 'desc' ? 'desc' : 'asc');
 const [recycleBinOpen, setRecycleBinOpen] = useState(false);
 const [exportMenuOpen, setExportMenuOpen] = useState(false);
 const [exportRangeFormat, setExportRangeFormat] = useState<ExportFormat | null>(null);
	const [isCreatingChapter, setIsCreatingChapter] = useState(false);
	const exportMenuRef = useRef<HTMLDivElement | null>(null);
	const [multiSelectActive, setMultiSelectActive] = useState(false);
	const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
	const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);

	useEscapeKey(() => {
		if (menu) setMenu(null);
		else if (volumeDialogOpen) setVolumeDialogOpen(false);
		else if (recycleBinOpen) setRecycleBinOpen(false);
		else if (batchDeleteConfirmOpen) setBatchDeleteConfirmOpen(false);
	}, Boolean(menu) || volumeDialogOpen || recycleBinOpen || batchDeleteConfirmOpen);

 useEffect(() => {
 if (chapterOrderFromConfig === 'asc' || chapterOrderFromConfig === 'desc') {
 setChapterOrder(chapterOrderFromConfig);
 }
 }, [chapterOrderFromConfig]);

 useEffect(() => {
 const focusSearch = () => { chapterSearchRef.current?.focus(); chapterSearchRef.current?.select(); };
 const onKey = (event: KeyboardEvent) => {
 if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); focusSearch(); }
 };
 window.addEventListener('writerzen:focus-chapter-search', focusSearch);
 window.addEventListener('keydown', onKey, true);
 return () => { window.removeEventListener('writerzen:focus-chapter-search', focusSearch); window.removeEventListener('keydown', onKey, true); };
 }, []);

 useEffect(() => {
 if (!exportMenuOpen) return;
 const close = (e: MouseEvent) => {
 if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
 setExportMenuOpen(false);
 }
 };
 document.addEventListener('mousedown', close);
 return () => document.removeEventListener('mousedown', close);
 }, [exportMenuOpen]);


  const MENU_WIDTH = 170;
  const MENU_HEIGHT = 300;

 const chapterIndexMap = useMemo(() => {
 const map = new Map<string, number>();
 book.chapters.forEach((chapter, index) => map.set(chapter.id, index));
 return map;
 }, [book.chapters]);

 const volumes = useMemo(() => (Array.isArray(book.volumes) ? book.volumes : []), [book.volumes]);
 const miscChapterIds = useMemo(() => new Set(book.miscChapterIds || []), [book.miscChapterIds]);
 const normalizedChapterSearch = chapterSearch.trim().toLocaleLowerCase('zh-CN');
 const matchesChapterSearch = useCallback((chapter: Chapter) => !normalizedChapterSearch || String(chapter.title || '').toLocaleLowerCase('zh-CN').includes(normalizedChapterSearch), [normalizedChapterSearch]);
 const miscChapters = useMemo(() => book.chapters.filter(ch => miscChapterIds.has(ch.id) && matchesChapterSearch(ch)), [book.chapters, miscChapterIds, matchesChapterSearch]);
 const mainChapters = useMemo(() => book.chapters.filter(ch => !miscChapterIds.has(ch.id) && matchesChapterSearch(ch)), [book.chapters, miscChapterIds, matchesChapterSearch]);
 const volumeSections = useMemo(() => buildVolumeSections(mainChapters, volumes), [mainChapters, volumes]);

 useEffect(() => {
 const pendingChapterId = pendingCreatedChapterIdRef.current;
  if (pendingChapterId) {
  if (activeChapterId === pendingChapterId) {
  const chapterId = pendingChapterId;
  setTimeout(() => {
  chapterButtonRefs.current[chapterId]?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  // 定位完成后解除最近创建标记，允许后续正常点击该章时走 smooth center
  recentlyCreatedIdsRef.current.delete(chapterId);
  }, 80);
  centeredChapterKeyRef.current = `${book.id}:${chapterId}:${chapterOrder}:${book.chapters.length}`;
  pendingCreatedChapterIdRef.current = null;
  }
  prevCountRef.current = book.chapters.length;
  return;
  }

  prevCountRef.current = book.chapters.length;

 }, [activeChapterId, book.chapters.length, chapterOrder]);

 useEffect(() => {
 if (!activeChapterId) return;
 // 最近连点新建的章节：定位交给 effect A（nearest），避免 smooth center 与最近新建互相抢滚动导致乱跳
 if (recentlyCreatedIdsRef.current.has(activeChapterId)) return;
 const key = `${book.id}:${activeChapterId}:${chapterOrder}:${book.chapters.length}`;
 if (centeredChapterKeyRef.current === key) return;
 centeredChapterKeyRef.current = key;
 window.setTimeout(() => {
 chapterButtonRefs.current[activeChapterId]?.scrollIntoView({
 block: 'center',
 behavior: 'smooth'
 });
 }, 120);
 }, [activeChapterId, book.id, book.chapters.length, chapterOrder]);

 useEffect(() => {
 if (!menu) return;
 const close = () => setMenu(null);
 window.addEventListener('click', close);
 return () => window.removeEventListener('click', close);
 }, [menu]);

 useEffect(() => {
 if (!volumeMenu) return;
 const close = () => setVolumeMenu(null);
 window.addEventListener('click', close);
 return () => window.removeEventListener('click', close);
 }, [volumeMenu]);

const createChapter = async () => {
	if (creatingChapterRef.current || isCreatingChapter) {
		// 连点保护：正在创建时不重复建章，给出轻提示避免用户误以为卡死
		useIslandStore.getState().show({ type: 'progress', message: '正在创建章节，请稍候…', autoHideMs: 800 });
		return;
	}
	creatingChapterRef.current = true;
	setIsCreatingChapter(true);
	try {
	// 标题在 updateBook 回调内基于实时 current 计算，避免连点时用旧快照生成重复章号
	let createdChapterId: string | null = null;
	await updateBook(book.id, (current) => {
	const title = nextChapterTitle(current.chapters);
	const now = new Date().toISOString();
	const newChapter: Chapter = {
	id: createId(),
	title,
	content: buildDefaultChapterContent(title),
	wordCount: 0,
	createdAt: now,
	updatedAt: now
	};
	createdChapterId = newChapter.id;
	pendingCreatedChapterIdRef.current = newChapter.id;
	return { ...current, chapters: [...current.chapters, newChapter], updatedAt: now };
	});
	if (!createdChapterId) return;
	recentlyCreatedIdsRef.current.add(createdChapterId);
	// 兜底清理：即使 pending 因连点被覆盖导致 effect A 未消费，也在 800ms 后解除标记
	window.setTimeout(() => { recentlyCreatedIdsRef.current.delete(createdChapterId!); }, 800);
	openEditor(book.id, createdChapterId);
	} catch (error) {
	window.alert(`新建数诡失败：${String(error)}`);
	} finally {
	creatingChapterRef.current = false;
	setIsCreatingChapter(false);
	}
	};

  const createChapterInVolume = async (section: VolumeSection) => {
  if (creatingChapterRef.current || isCreatingChapter) {
  useIslandStore.getState().show({ type: 'progress', message: '正在创建章节，请稍候…', autoHideMs: 800 });
  return;
  }
  creatingChapterRef.current = true;
  setIsCreatingChapter(true);
  try {
  // 标题与插入位置都在 updateBook 回调内基于实时 current 计算，避免连点错位/重复章号
  let createdChapterId: string | null = null;
  await updateBook(book.id, (current) => {
  const title = nextChapterTitle(current.chapters);
  const now = new Date().toISOString();
  const newChapter: Chapter = {
  id: createId(),
  title,
  content: buildDefaultChapterContent(title),
  wordCount: 0,
  createdAt: now,
  updatedAt: now
  };
  const insertIndex = Math.min(section.endIndex + 1, current.chapters.length);
  const chapters = [...current.chapters];
  chapters.splice(insertIndex, 0, newChapter);
  createdChapterId = newChapter.id;
  pendingCreatedChapterIdRef.current = newChapter.id;
  return { ...current, chapters, updatedAt: now };
  });
  if (!createdChapterId) return;
  recentlyCreatedIdsRef.current.add(createdChapterId);
  window.setTimeout(() => { recentlyCreatedIdsRef.current.delete(createdChapterId!); }, 800);
  openEditor(book.id, createdChapterId);
  } catch (error) {
  window.alert(`新建数诡失败：${String(error)}`);
  } finally {
  creatingChapterRef.current = false;
  setIsCreatingChapter(false);
  }
  };

  const renameVolume = async (volumeId: string) => {
 const current = volumes.find((v) => v.id === volumeId);
 if (!current) return;
 const raw = (await promptDialog({ title: '重命名分卷', defaultValue: current.title, placeholder: '请输入分卷名称', maxLength: 20 }))?.trim();
 if (!raw) return;
 const value = raw.slice(0, 20);
 const now = new Date().toISOString();
 await updateBook(book.id, (target) => ({
 ...target,
 volumes: (target.volumes || []).map((v) => (v.id === volumeId ? { ...v, title: value } : v)),
 updatedAt: now
 }));
 };

 const deleteVolume = async (volumeId: string) => {
 const confirmed = await safeConfirm('确定要删除该分卷吗？分卷内的章节不会被删除。');
 if (!confirmed) return;
 const now = new Date().toISOString();
 await updateBook(book.id, (target) => ({
 ...target,
 volumes: (target.volumes || []).filter((v) => v.id !== volumeId),
 updatedAt: now
 }));
 };

 const renameChapter = async (chapterId: string) => {
  const current = book.chapters.find((chapter) => chapter.id === chapterId);
  if (!current) return;
  const raw = (await promptDialog({ title: zhCN.chapter.placeholder, defaultValue: current.title, placeholder: zhCN.chapter.placeholder, maxLength: 20 }))?.trim();
  if (!raw) return;
  const value = raw.slice(0, 20); // 标题最多20字

  const now = new Date().toISOString();
  await updateBook(book.id, (target) => ({
  ...target,
  chapters: target.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, title: value, updatedAt: now } : chapter)),
  updatedAt: now
  }));

  // 同步正文首行标题：只改元数据会让编辑器里打开的章节仍显示旧标题
  try {
  await useBookStore.getState().loadChapterIntoStore(book.id, chapterId);
  // loadChapterIntoStore 会替换 books 数组，必须在 await 之后重新取 state
  const fresh = useBookStore.getState().books.find((item) => item.id === book.id)?.chapters.find((chapter) => chapter.id === chapterId);
  const content = String(fresh?.content || '');
  if (content.trim()) {
   const nextHtml = replaceChapterHeading(content, value);
   if (nextHtml !== content) {
   await useBookStore.getState().setChapterContent(book.id, chapterId, nextHtml);
   }
  }
  } catch { /* 正文标题同步失败不影响改名本身 */ }
  };
  // 分屏打开：把指定章节钉到右侧分屏栏，主编辑区保持不动（方便对照别的章节写作）
 const splitOpenChapter = (chapterId: string) => {
 const app = useAppStore.getState();
 const tabId = `${book.id}::${chapterId}`;
 const prevActiveTabId = app.activeEditorTabId;
 const needOpen = !app.editorTabs.some((tab) => tab.id === tabId);
 if (needOpen) openEditor(book.id, chapterId);
 useAppStore.getState().setSplitEditorTab(tabId);
 // 若为了让标签存在而临时切走了主编辑区，切回原章节，让分屏只影响右侧
 if (needOpen && prevActiveTabId && prevActiveTabId !== tabId) {
 useAppStore.getState().activateEditorTab(prevActiveTabId);
 }
 };

 const insertChapter = async (clickedChapterId: string) => {
    if (creatingChapterRef.current || isCreatingChapter) return;
    creatingChapterRef.current = true;
    setIsCreatingChapter(true);
    try {
      const now = new Date().toISOString();
      const newChapterId = createId();
      pendingCreatedChapterIdRef.current = newChapterId;

      await updateBook(book.id, (current) => {
        const chapters = [...current.chapters];
        const index = chapters.findIndex((c) => c.id === clickedChapterId);
        if (index === -1) return current;

        const clickedChapter = chapters[index];
        const clickedNo = parseChapterNumber(clickedChapter.title);

        let newNo = 1;
        let shouldShift = false;

        if (clickedNo !== null) {
          newNo = clickedNo + 1;
          const nextChapter = chapters[index + 1];
          if (nextChapter) {
            const nextNo = parseChapterNumber(nextChapter.title);
            if (nextNo !== null) {
              if (nextNo <= newNo) {
                shouldShift = true;
              }
            }
          }
        } else {
          // Find last numbered chapter
          let prevNo: number | null = null;
          for (let i = index - 1; i >= 0; i--) {
            const num = parseChapterNumber(chapters[i].title);
            if (num !== null) {
              prevNo = num;
              break;
            }
          }
          if (prevNo !== null) {
            newNo = prevNo + 1;
          } else {
            newNo = index + 2; // fallback
          }

          const nextChapter = chapters[index + 1];
          if (nextChapter) {
            const nextNo = parseChapterNumber(nextChapter.title);
            if (nextNo !== null && nextNo <= newNo) {
              shouldShift = true;
            }
          }
        }

        const newTitle = `第${newNo}章`;
        const newChapter: Chapter = {
          id: newChapterId,
          title: newTitle,
          content: buildDefaultChapterContent(newTitle),
          wordCount: 0,
          createdAt: now,
          updatedAt: now
        };

        // Insert new chapter after clickedChapter
        chapters.splice(index + 1, 0, newChapter);

        // If we need to shift, update subsequent chapters
        if (shouldShift) {
          let expectedNo = newNo + 1;
          for (let i = index + 2; i < chapters.length; i++) {
            const curNo = parseChapterNumber(chapters[i].title);

            if (curNo !== null) {
              if (curNo < expectedNo) {
                // Shift this chapter
                chapters[i] = {
                  ...chapters[i],
                  title: updateChapterNumberInTitle(chapters[i].title, expectedNo),
                  updatedAt: now
                };
                expectedNo++;
              } else {
                // No conflict, we can stop shifting
                break;
              }
            }
          }
        }

        return { ...current, chapters, updatedAt: now };
      });

      recentlyCreatedIdsRef.current.add(newChapterId);
      window.setTimeout(() => { recentlyCreatedIdsRef.current.delete(newChapterId); }, 800);
      openEditor(book.id, newChapterId);
    } catch (error) {
      window.alert(`插入章节失败：${String(error)}`);
    } finally {
      creatingChapterRef.current = false;
      setIsCreatingChapter(false);
    }
  };

 const moveChapter = async (chapterId: string, delta: -1 | 1) => {
 const index = chapterIndexMap.get(chapterId);
 if (index === undefined) return;
 const nextIndex = index + delta;
 if (nextIndex < 0 || nextIndex >= book.chapters.length) return;

 const now = new Date().toISOString();
 await updateBook(book.id, (target) => {
 const chapters = [...target.chapters];
 const [current] = chapters.splice(index, 1);
 chapters.splice(nextIndex, 0, current);
 return { ...target, chapters, updatedAt: now };
 });
 };

  const removeChapter = (chapterId: string) => {
  if (book.chapters.length <= 1) return;
  setMenu(null);
  if (multiSelectActive) {
  // 多选模式下删除所有选中章节；若右键章节未选中则先纳入
  setSelectedChapterIds((prev) => {
  const next = new Set(prev);
  next.add(chapterId);
  return next;
  });
  setBatchDeleteConfirmOpen(true);
  return;
  }
  setDeleteConfirmChapterId(chapterId);
  };

  const toggleMiscChapter = async (chapterId: string) => {
	const currentMisc = book.miscChapterIds || [];
	const nextMisc = currentMisc.includes(chapterId)
		? currentMisc.filter(id => id !== chapterId)
		: [...currentMisc, chapterId];
	await updateBook(book.id, (current) => ({
		...current,
		miscChapterIds: nextMisc,
		updatedAt: new Date().toISOString()
	}));
  };

	const toggleChapterSelection = (chapterId: string) => {
		setSelectedChapterIds((prev) => {
			const next = new Set(prev);
			if (next.has(chapterId)) next.delete(chapterId);
			else next.add(chapterId);
			return next;
		});
	};

	const toggleSelectAllChapters = () => {
		setSelectedChapterIds((prev) => {
			const visibleIds = book.chapters.filter((ch) => matchesChapterSearch(ch)).map((ch) => ch.id);
			const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
			if (allSelected) return new Set();
			return new Set(visibleIds);
		});
	};

	const clearChapterSelection = () => {
		setSelectedChapterIds(new Set());
	};

	const toggleMultiSelectMode = () => {
		const next = !multiSelectActive;
		setMultiSelectActive(next);
		if (!next) setSelectedChapterIds(new Set());
	};

	const batchDeleteSelected = async () => {
		const ids = [...selectedChapterIds];
		if (ids.length === 0 || book.chapters.length <= ids.length) return;
		setBatchDeleteConfirmOpen(false);
		// 智能选择删除范围外的最近章节作为跳转目标
		const remaining = book.chapters.filter((c) => !ids.includes(c.id));
		const nextChapter = remaining[0] ?? remaining[remaining.length - 1];
		if (nextChapter) openEditor(book.id, nextChapter.id);
		const now = new Date().toISOString();
		const idSet = new Set(ids);
		const deletedChapters = book.chapters.filter((c) => idSet.has(c.id));
		const recycled: RecycledChapter[] = deletedChapters.map((chapter) => ({ ...chapter, deletedAt: now }));
		await updateBook(book.id, (target) => ({
			...target,
			chapters: target.chapters.filter((chapter) => !idSet.has(chapter.id)),
			recycledChapters: [...(target.recycledChapters || []), ...recycled],
			updatedAt: now
		}));
		setSelectedChapterIds(new Set());
		setMultiSelectActive(false);
	};

	const batchToggleMisc = async (toMisc: boolean) => {
		const ids = [...selectedChapterIds];
		if (ids.length === 0) return;
		const idSet = new Set(ids);
		const currentMisc = book.miscChapterIds || [];
		let nextMisc: string[];
		if (toMisc) {
			nextMisc = [...new Set([...currentMisc, ...ids])];
		} else {
			nextMisc = currentMisc.filter((id) => !idSet.has(id));
		}
		await updateBook(book.id, (current) => ({
			...current,
			miscChapterIds: nextMisc,
			updatedAt: new Date().toISOString()
		}));
		setSelectedChapterIds(new Set());
		setMultiSelectActive(false);
	};

 const confirmDeleteChapter = async () => {
 const chapterId = deleteConfirmChapterId;
 setDeleteConfirmChapterId(null);
 if (!chapterId) return;
 if (book.chapters.length <= 1) return;
 const now = new Date().toISOString();
 const chapterToDelete = book.chapters.find((c) => c.id === chapterId);
 
 // 智能选择下一个章节：优先选择前一章，如果没有则选后一章
 const index = book.chapters.findIndex((c) => c.id === chapterId);
 let nextChapter: Chapter | undefined;
 if (index > 0) {
 nextChapter = book.chapters[index - 1];
 } else if (index < book.chapters.length - 1) {
 nextChapter = book.chapters[index + 1];
 }
 
 // 先跳转，让旧编辑器卸载后再删除，防止 autosave 写回被删章节内容
 if (nextChapter) openEditor(book.id, nextChapter.id);
 // 移到回收站而不是直接删除
 const recycled: RecycledChapter = { ...chapterToDelete!, deletedAt: now };
 await updateBook(book.id, (target) => ({
 ...target,
 chapters: target.chapters.filter((chapter) => chapter.id !== chapterId),
 recycledChapters: [...(target.recycledChapters || []), recycled],
 updatedAt: now
 }));
 };

 const cleanupExpiredRecycled = (target: Book): RecycledChapter[] => {
 const list = target.recycledChapters || [];
 const WEEK = 7 * 24 * 60 * 60 * 1000;
 const now = Date.now();
 return list.filter((rc) => now - new Date(rc.deletedAt).getTime() < WEEK);
 };

 const restoreRecycledChapter = async (chapterId: string) => {
 const now = new Date().toISOString();
 await updateBook(book.id, (target) => {
 const list = target.recycledChapters || [];
 const chapter = list.find((c) => c.id === chapterId);
 if (!chapter) return target;
 const { deletedAt, ...restored } = chapter;
 return {
 ...target,
 chapters: [...target.chapters, restored],
 recycledChapters: list.filter((c) => c.id !== chapterId),
 updatedAt: now
 };
 });
 };

 const permanentlyDeleteRecycled = async (chapterId: string) => {
 const now = new Date().toISOString();
 await updateBook(book.id, (target) => ({
 ...target,
 recycledChapters: (target.recycledChapters || []).filter((c) => c.id !== chapterId),
 updatedAt: now
 }));
 };

 const emptyRecycleBin = async () => {
 const now = new Date().toISOString();
 await updateBook(book.id, (target) => ({
 ...target,
 recycledChapters: [],
 updatedAt: now
 }));
 };

 const openCreateVolumeDialog = () => {
 const defaultTitle = `第${inferNextVolumeNumber(volumes, book.chapters.length)}卷`;
 setNewVolumeName(defaultTitle);
 setVolumeDialogOpen(true);
 };

 const toggleVolumeCollapse = (volumeId: string) => {
 setCollapsedVolumes((prev) => {
 const next = new Set(prev);
 if (next.has(volumeId)) {
 next.delete(volumeId);
 } else {
 next.add(volumeId);
 }
 return next;
 });
 };

 const confirmCreateVolume = async () => {
 const title = newVolumeName.trim();
 if (!title) {
 window.alert('请输入分卷名称');
 return;
 }
 if (creatingVolume) return;

 try {
 setCreatingVolume(true);
 const now = new Date().toISOString();
 const newChapterId = createId();
 const newChapterTitle = nextChapterTitle(book.chapters);
 // 新分卷默认创建一个首章，并把后续新章节自然归入该分卷，直到下一个分卷出现。
 const newChapter: Chapter = {
 id: newChapterId,
 title: newChapterTitle,
 content: buildDefaultChapterContent(newChapterTitle),
 wordCount: 0,
 createdAt: now,
 updatedAt: now
 };
 await updateBook(book.id, (target) => ({
 ...target,
 chapters: [...target.chapters, newChapter],
 volumes: [
 ...(Array.isArray(target.volumes) ? target.volumes : []),
 {
 id: createId(),
 title,
 startChapterId: newChapterId,
 chapters: []
 }
 ],
 updatedAt: now
 }));
 setVolumeDialogOpen(false);
 setNewVolumeName('');
 openEditor(book.id, newChapterId);
 } catch (error) {
 window.alert(`新建分卷失败：${error instanceof Error ? error.message : String(error)}`);
 } finally {
 setCreatingVolume(false);
 }
 };

 // 先选范围、再选保存路径：默认文件名带上范围，避免节选导出与全本同名互相覆盖
 const runExportWithRange = async (format: ExportFormat, range: ExportRange) => {
 setExportRangeFormat(null);
 await exportChapters({ bookId: book.id, bookTitle: book.title, format, range, run: runAsync });
 };

 const handleExportMarkdown = () => {
 setExportMenuOpen(false);
 setExportRangeFormat('markdown');
 };

 const handleExportPdf = () => {
 setExportMenuOpen(false);
 setExportRangeFormat('pdf');
 };

 const handleExportTxt = () => {
 setExportMenuOpen(false);
 setExportRangeFormat('txt');
 };

 const toggleChapterOrder = async () => {
 const nextOrder: 'asc' | 'desc' = chapterOrder === 'asc' ? 'desc' : 'asc';
 setChapterOrder(nextOrder);
 if (!config) return;
 if (config.ui.chapterListOrder === nextOrder) return;
 await saveConfig({
 ...config,
 ui: {
 ...config.ui,
 chapterListOrder: nextOrder
 }
 });
 };

   return (
  		<div ref={sidebarRootRef} className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border-color)]">
				<button
					type="button"
					onClick={() => setRoute('bookshelf')}
					title="返回书架"
					className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-strong)] transition-colors"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
					<span>书架</span>
				</button>
 			</div>
 			<MiniBookshelf books={allBooks} activeBookId={book.id} />

 			<div className="wz-sb-head">
				<span className="wz-sb-title">章节目录</span>
				<div className="wz-sb-tools">
					<button
						className="wz-sb-tool relative"
						onClick={() => setRecycleBinOpen(true)}
						title="回收站"
						type="button"
						data-sb-extra="1"
					>
						<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
						{(book.recycledChapters?.length || 0) > 0 && (
							<span className="badge absolute -right-0.5 -top-0.5">{book.recycledChapters!.length}</span>
						)}
					</button>
					<div className="relative" ref={exportMenuRef}>
						<button
							className="wz-sb-tool"
							onClick={() => setExportMenuOpen((prev) => !prev)}
							title="导出"
							type="button"
							data-sb-extra="1"
						>
							<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
						</button>
						{exportMenuOpen && (
							<div className="absolute right-0 top-full z-[110] mt-1.5 w-36 p-1 shadow-xl rounded-xl flex flex-col gap-0.5 border border-[var(--border-color)] bg-[var(--surface)] backdrop-blur-xl">
								<button className="w-full px-3 py-2 text-left text-xs rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all" onClick={() => void handleExportMarkdown()}>导出 Markdown</button>
								<button className="w-full px-3 py-2 text-left text-xs rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all" onClick={() => void handleExportPdf()}>导出 PDF</button>
								<button className="w-full px-3 py-2 text-left text-xs rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all" onClick={() => void handleExportTxt()}>导出 TXT</button>
							</div>
						)}
					</div>
					<button
						className="wz-sb-tool"
						onClick={() => void toggleChapterOrder()}
						type="button"
						title={chapterOrder === 'asc' ? '当前正序，点击切换倒序' : '当前倒序，点击切换正序'}
					>
						<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d={chapterOrder === 'asc' ? 'M8 7h12M8 12h8M8 17h4M4 7v10M4 17l-2-2M4 17l2-2' : 'M8 7h4M8 12h8M8 17h12M4 7v10M4 7l-2 2M4 7l2 2'}/>
						</svg>
						<span>{chapterOrder === 'asc' ? '正序' : '倒序'}</span>
					</button>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto pr-1" ref={scrollRef}>
				<div className="space-y-1.5">
					{/* 作品相关（序章/设定等非正文章节） */}
					<section className="wz-vol-section">
						<div className="wz-vol-head">
							<button
								className="wz-vol-toggle"
								type="button"
								onClick={() => setCollapsedVolumes(prev => { const next = new Set(prev); if (next.has('__misc__')) next.delete('__misc__'); else next.add('__misc__'); return next; })}
							>
								<svg className={clsx("wz-vol-chev", collapsedVolumes.has('__misc__') && "is-collapsed")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
									<path d="m6 9 6 6 6-6"/>
								</svg>
								<span className="wz-vol-title is-misc">作品相关</span>
								<span className="wz-vol-count">{miscChapters.length}章</span>
							</button>
						</div>
						{!collapsedVolumes.has('__misc__') && miscChapters.length > 0 && (
							<ul className="mt-1.5 space-y-1">
								{miscChapters.map((chapter) => {
									const active = chapter.id === activeChapterId;
									const selected = selectedChapterIds.has(chapter.id);
									return (
										<li key={chapter.id}>
											<button
												className={clsx('w-full text-left transition-all duration-200 flex items-center gap-2', active ? 'wz-chapter-item-active' : 'wz-chapter-item')}
												ref={(node) => { chapterButtonRefs.current[chapter.id] = node; }}
												onClick={() => { if (multiSelectActive) toggleChapterSelection(chapter.id); else openEditor(book.id, chapter.id); }}
												onContextMenu={(event) => { event.preventDefault(); setMenu({ chapterId: chapter.id, x: event.clientX, y: event.clientY }); }}
											>
												{multiSelectActive && (
													<span className="flex shrink-0 items-center">
														<span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-all', selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-color)]')}>
															{selected && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 13l4 4L19 7"/></svg>}
														</span>
													</span>
												)}
												<span className="flex items-center justify-between w-full">
													<span className="truncate pr-2">{normalizeChapterTitle(chapter.title || '未命名')}</span>
													<span className={clsx('wz-ch-wc shrink-0', active && 'is-active')}>{chapter.wordCount || 0}字</span>
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</section>

					{volumeSections.map((section) => {
						const collapsed = collapsedVolumes.has(section.id);
						const chapterItemsRaw = mainChapters.slice(section.startIndex, section.endIndex + 1);
						const chapterItems = chapterOrder === 'asc' ? chapterItemsRaw : [...chapterItemsRaw].reverse();
						return (
							<section key={section.id} className="wz-vol-section">
								<div className="wz-vol-head group/vol">
									<button
										className="wz-vol-toggle"
										type="button"
										onClick={() => toggleVolumeCollapse(section.id)}
									>
										<svg className={clsx("wz-vol-chev", collapsed && "is-collapsed")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
											<path d="m6 9 6 6 6-6"/>
										</svg>
										<span className="wz-vol-title">{section.title}</span>
										<span className="wz-vol-count">{section.chapterCount}章</span>
									</button>
									<div className="wz-vol-actions">
										<button
											className={clsx('wz-vol-action', isCreatingChapter && 'opacity-40 cursor-not-allowed')}
											type="button"
											title="在该卷末尾新建章节"
											disabled={isCreatingChapter}
											onClick={(e) => { e.stopPropagation(); void createChapterInVolume(section); }}
										>
											{isCreatingChapter ? (
												<svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
											) : (
												<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
											)}
										</button>
										<button
											className="wz-vol-action"
											type="button"
											title="更多操作"
											onClick={(e) => {
												e.stopPropagation();
												const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
												setVolumeMenu({ volumeId: section.id, x: rect.left, y: rect.bottom + 4 });
											}}
										>
											<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
										</button>
									</div>
								</div>

								{!collapsed ? (
									chapterItems.length > CHAPTER_VIRTUALIZE_THRESHOLD ? (
										<VirtualChapterList
											chapters={chapterItems}
											scrollParentRef={scrollRef}
											activeChapterId={activeChapterId ?? null}
											registerRef={(id, node) => { chapterButtonRefs.current[id] = node; }}
											onOpen={(id) => openEditor(book.id, id)}
											onContextMenu={(id, x, y) => setMenu({ chapterId: id, x, y })}
											multiSelectActive={multiSelectActive}
											selectedIds={selectedChapterIds}
											onToggleSelect={toggleChapterSelection}
										/>
									) : (
									<ul className="mt-1.5 space-y-1">
										{chapterItems.map((chapter) => {
											const active = chapter.id === activeChapterId;
											const selected = selectedChapterIds.has(chapter.id);
											return (
												<li key={chapter.id}>
													<button
														className={clsx(
															'w-full text-left transition-all duration-200 flex items-center gap-2',
															active ? 'wz-chapter-item-active' : 'wz-chapter-item'
														)}
														ref={(node) => {
															chapterButtonRefs.current[chapter.id] = node;
														}}
														onClick={() => { if (multiSelectActive) toggleChapterSelection(chapter.id); else openEditor(book.id, chapter.id); }}
														onContextMenu={(event) => {
															event.preventDefault();
															setMenu({ chapterId: chapter.id, x: event.clientX, y: event.clientY });
														}}
													>
														{multiSelectActive && (
															<span className="flex shrink-0 items-center">
																<span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-all', selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-color)]')}>
																	{selected && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 13l4 4L19 7"/></svg>}
																</span>
															</span>
														)}
														<span className="flex items-center justify-between w-full">
															<span className="truncate pr-2">{normalizeChapterTitle(chapter.title || zhCN.chapter.untitled)}</span>
															<span className={clsx('wz-ch-wc shrink-0', active && 'is-active')}>{chapter.wordCount || 0}字</span>
														</span>
													</button>
												</li>
											);
										})}
									</ul>
									)
								) : null}
							</section>
						);
					})}
				</div>
			</div>

			{multiSelectActive && (
				<div className="relative z-[120] border-t border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-semibold text-[var(--text-secondary)]">已选 {selectedChapterIds.size} 章</span>
						<div className="flex items-center gap-1">
							<button
								type="button"
								className="px-2 py-1 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
								onClick={toggleSelectAllChapters}
							>
								{(() => {
									const visibleIds = book.chapters.filter((ch) => matchesChapterSearch(ch)).map((ch) => ch.id);
									const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedChapterIds.has(id));
									return allSelected ? '取消全选' : '全选';
								})()}
							</button>
							<button
								type="button"
								className="px-2 py-1 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
								onClick={clearChapterSelection}
							>
								清空
							</button>
							<button
								type="button"
								className="px-2 py-1 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
								onClick={toggleMultiSelectMode}
							>
								完成
							</button>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={selectedChapterIds.size === 0}
							className="flex-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5"
							onClick={() => setBatchDeleteConfirmOpen(true)}
						>
							<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
							删除所选
						</button>
						<button
							type="button"
							disabled={selectedChapterIds.size === 0}
							className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors"
							onClick={() => void batchToggleMisc(true)}
						>
							移入作品相关
						</button>
						<button
							type="button"
							disabled={selectedChapterIds.size === 0}
							className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:pointer-events-none px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors"
							onClick={() => void batchToggleMisc(false)}
						>
							移出作品相关
						</button>
					</div>
				</div>
			)}


 {menu && typeof document !== 'undefined'
 ? createPortal(
 <div
 className="wz-context-menu fixed z-[10000] min-w-[190px] border border-[var(--border-color)] bg-[var(--surface)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] rounded-none flex flex-col gap-0.5"
 style={{
 left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)),
 top: Math.max(8, Math.min(menu.y, window.innerHeight - MENU_HEIGHT - 8))
 }}
 onClick={(event) => event.stopPropagation()}
 >
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void renameChapter(menu.chapterId); setMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
 <span>{zhCN.chapter.rename}</span></button>
											 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { splitOpenChapter(menu.chapterId); setMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
 <span>分屏打开</span></button>
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void insertChapter(menu.chapterId); setMenu(null); }}>
												<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
												<span>插入章节</span>
											</button>
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void moveChapter(menu.chapterId, -1); setMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><polyline points="18 15 12 9 6 15"/></svg>
 <span>{zhCN.chapter.moveUp}</span>
 </button>
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void moveChapter(menu.chapterId, 1); setMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><polyline points="6 9 12 15 18 9"/></svg>
 <span>{zhCN.chapter.moveDown}</span>
 </button>
  <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void toggleMiscChapter(menu.chapterId); setMenu(null); }}>
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  <span>{miscChapterIds.has(menu.chapterId) ? '移出作品相关' : '移入作品相关'}</span>
  </button>
  <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { setSelectedChapterIds(new Set([menu.chapterId])); setMultiSelectActive(true); setMenu(null); }}>
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/><path d="M9 12l2 2 4-4"/></svg>
  <span>多选</span>
  </button>
  <div className="wz-menu-divider my-1 h-px bg-[var(--border-color)] w-full" />
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all flex items-center gap-2" onClick={() => { removeChapter(menu.chapterId); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  <span>{multiSelectActive ? `删除所选（${selectedChapterIds.size}章）` : zhCN.chapter.remove}</span>
  </button>
  </div>,
  document.body
  )
 : null}

 {volumeMenu && typeof document !== 'undefined'
 ? (() => {
 const activeSection = volumeSections.find((s) => s.id === volumeMenu.volumeId);
 const volChapters = activeSection ? book.chapters.slice(activeSection.startIndex, activeSection.endIndex + 1) : [];
 const volWordCount = volChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
 return createPortal(
 <div
 className="wz-context-menu fixed z-[10000] min-w-[190px] border border-[var(--border-color)] bg-[var(--surface)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] rounded-none flex flex-col gap-0.5"
 style={{
 left: Math.max(8, Math.min(volumeMenu.x, window.innerWidth - 190 - 8)),
 top: Math.max(8, Math.min(volumeMenu.y, window.innerHeight - 200 - 8))
 }}
 onClick={(event) => event.stopPropagation()}
 >
 <div className="px-3 py-2 mb-1.5 border-b border-[var(--border-color)] rounded-none">
 <div className="text-xs font-bold text-[var(--text-primary)] truncate">{activeSection?.title || ''}</div>
 <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{activeSection?.chapterCount || 0}章 · {volWordCount.toLocaleString()}字</div>
 </div>
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2" onClick={() => { void renameVolume(volumeMenu.volumeId); setVolumeMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
 <span>重命名</span>
 </button>
 <button className={clsx('w-full px-3 py-1.8 text-left text-xs rounded-none transition-all flex items-center gap-2', isCreatingChapter ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]')} disabled={isCreatingChapter} onClick={() => { if (activeSection && !isCreatingChapter) void createChapterInVolume(activeSection); setVolumeMenu(null); }}>
  {isCreatingChapter ? (
   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
  ) : (
   <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  )}
  <span>新建章节</span>
 </button>
 <div className="wz-menu-divider my-1 h-px bg-[var(--border-color)] w-full" />
 <button className="w-full px-3 py-1.8 text-left text-xs rounded-none text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all flex items-center gap-2" onClick={() => { void deleteVolume(volumeMenu.volumeId); setVolumeMenu(null); }}>
 <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
 <span>删除本卷</span>
 </button>
 </div>,
 document.body
 );
 })()
 : null}

 {volumeDialogOpen ? (
<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50" onClick={() => setVolumeDialogOpen(false)}>
	<div
	className="wz-modal-enter w-[min(430px,calc(100vw-40px))] border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl rounded-2xl"
 onClick={(event) => event.stopPropagation()}
 >
 <div className="text-base font-bold text-[var(--text-primary)]">新建分卷</div>
 <div className="mt-4 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">分卷名称</div>
 <input
 className="mt-2 w-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2.5 rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-all placeholder-[var(--text-muted)]"
 value={newVolumeName}
 onChange={(event) => setNewVolumeName(event.target.value)}
 autoFocus
 onKeyDown={(event) => {
 if (event.key === 'Enter') {
 event.preventDefault();
 void confirmCreateVolume();
 }
 }}
 />

 <div className="mt-6 flex justify-end gap-3">
 <button
 className="border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
 onClick={() => setVolumeDialogOpen(false)}
 disabled={creatingVolume}
 >
 取消
 </button>
 <button
 className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:shadow-[var(--accent)]/20 transition-all hover:brightness-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
 onClick={() => void confirmCreateVolume()}
 disabled={!newVolumeName.trim() || creatingVolume}
 >
 {creatingVolume ? '创建中...' : '确认创建'}
 </button>
 </div>
 </div>
 </div>
 ) : null}

 {deleteConfirmChapterId ? (
<div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50" onClick={() => setDeleteConfirmChapterId(null)}>
	<div
	className="wz-modal-enter w-[min(380px,calc(100vw-40px))] border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl rounded-2xl"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="text-base font-bold text-[var(--text-primary)]">删除章节</div>
 <div className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">确定要删除该章节吗？删除后可在回收站恢复。</div>
 <div className="mt-6 flex justify-end gap-3">
 <button
 className="border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
 onClick={() => setDeleteConfirmChapterId(null)}
 >
 取消
 </button>
 <button
 className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/10 hover:shadow-rose-600/20 transition-all active:scale-95"
 onClick={() => void confirmDeleteChapter()}
 >
 确认删除
 </button>
 </div>
  </div>
  </div>
  ) : null}

  {batchDeleteConfirmOpen ? (
  <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50" onClick={() => setBatchDeleteConfirmOpen(false)}>
  <div
  className="wz-modal-enter w-[min(380px,calc(100vw-40px))] border border-[var(--border-color)] bg-[var(--surface)] p-6 shadow-2xl rounded-2xl"
  onClick={(e) => e.stopPropagation()}
  >
  <div className="text-base font-bold text-[var(--text-primary)]">删除所选章节</div>
  <div className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">确定要删除所选 {selectedChapterIds.size} 章吗？删除后可在回收站恢复。</div>
  <div className="mt-6 flex justify-end gap-3">
  <button
  className="border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
  onClick={() => setBatchDeleteConfirmOpen(false)}
  >
  取消
  </button>
  <button
  className="rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/10 hover:shadow-rose-600/20 transition-all active:scale-95"
  onClick={() => void batchDeleteSelected()}
  >
  确认删除
  </button>
  </div>
  </div>
  </div>
  ) : null}

  {recycleBinOpen ? createPortal(
 <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50" onClick={() => setRecycleBinOpen(false)}>
 <div
 className="wz-modal-enter w-[min(520px,calc(100vw-40px))] max-h-[80vh] flex flex-col border border-[var(--border-color)] bg-[var(--surface)] shadow-2xl rounded-2xl overflow-hidden"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
 <div className="text-base font-bold text-[var(--text-primary)]">回收站</div>
 <button
 className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
 onClick={() => setRecycleBinOpen(false)}
 >
 <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
 </button>
 </div>
 <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
 {(() => {
 const cleaned = cleanupExpiredRecycled(book);
 if (cleaned.length === 0) {
 return (
	<div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
	<svg className="h-12 w-12 mb-3 text-[var(--text-muted)] opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
 <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
 </svg>
 <span className="text-xs font-semibold">暂无内容</span>
 </div>
 );
 }
 return (
 <div className="space-y-2">
 {cleaned.map((chapter) => (
 <div
 key={chapter.id}
 className="flex items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-all"
 >
 <div className="min-w-0 flex-1">
 <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{chapter.title || '未命名章节'}</div>
	<div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono">
 <span>{chapter.wordCount || 0}字</span>
 <span>·</span>
 <span>{new Date(chapter.deletedAt).toLocaleDateString('zh-CN')}</span>
 </div>
 </div>
 <div className="ml-3 flex items-center gap-2 shrink-0">
 <button
 className="rounded-lg bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition-colors"
 onClick={() => void restoreRecycledChapter(chapter.id)}
 >
 恢复
 </button>
 <button
 className="rounded-lg bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors"
 onClick={() => void permanentlyDeleteRecycled(chapter.id)}
 >
 彻底删除
 </button>
 </div>
 </div>
 ))}
 </div>
 );
 })()}
 </div>
 {(() => {
 const cleaned = cleanupExpiredRecycled(book);
 return cleaned.length > 0 ? (
 <div className="flex items-center justify-end px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
 <button
 className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
 onClick={() => {
  void safeConfirm('确定要清空回收站吗？此操作不可撤销。').then((confirmed) => {
   if (confirmed) void emptyRecycleBin();
  });
 }}
 >
 清空回收站
 </button>
 </div>
 ) : null;
 })()}
  </div>
  </div>,
  document.body
  ) : null}
   {/* 全书搜索结果浮层：portal 到 body + fixed 定位，覆盖整个左侧目录栏（含顶部书架区），脱离布局，不挤压任何区域 */}
   {bookSearchResults && searchOverlayPos && createPortal(
    <div
     className="fixed z-[11000] flex flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl"
     style={{ top: searchOverlayPos.top, left: searchOverlayPos.left, width: searchOverlayPos.width, height: Math.max(120, window.innerHeight - searchOverlayPos.top), maxHeight: '100vh' }}
    >
     <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
      <span className="text-[11px] font-bold text-[var(--text-primary)]">全书搜索：{bookSearchResults.search}</span>
      <span className="text-[10px] text-[var(--text-muted)]">{bookSearchResults.items.length} 处</span>
     <button
      type="button"
      onClick={() => setBookSearchResults(null)}
      title="关闭搜索"
      className="ml-2 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
     >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
     </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
     {bookSearchResults.items.length === 0 ? (
      <div className="flex items-center justify-center p-6 text-[12px] text-[var(--text-muted)]">无命中</div>
     ) : (
      <div className="divide-y divide-[var(--border-color)]">
       {bookSearchResults.items.map((item, idx) => (
        <button
         key={`${item.chapterId}-${item.from}-${idx}`}
         type="button"
         onClick={() => {
           setPendingSearchJump({
            chapterId: item.chapterId,
            from: item.from,
            to: item.to,
            positionKind: item.positionKind,
            text: item.text,
            context: item.context,
            before: item.before,
            after: item.after
           });
          if (item.chapterId !== activeChapterId) {
           openEditor(book.id, item.chapterId);
          }
          // 不关闭浮层，方便继续选择
         }}
         className="block w-full px-3 py-2 text-left hover:bg-[var(--surface)]"
        >
         <div className="text-[10px] font-semibold text-[var(--text-muted)]">{item.chapterTitle}</div>
         <div className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-secondary)]">{renderBookSearchContext(item.context, bookSearchResults.search)}</div>
        </button>
       ))}
      </div>
     )}
    </div>
   </div>,
   document.body
  )}
  {exportRangeFormat ? (
   <ExportRangeModal
    book={book}
    title={EXPORT_TITLE[exportRangeFormat]}
    onClose={() => setExportRangeFormat(null)}
    onConfirm={(range) => void runExportWithRange(exportRangeFormat, range)}
   />
  ) : null}
  </div>
  );
}
