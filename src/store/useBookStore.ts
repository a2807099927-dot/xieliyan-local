// 模块说明：书籍/章节/角色/记忆库的全局状态管理。
// 关键职责：CRUD 操作、持久化到本地文件系统（通过 electronAPI.fs）、记忆库加载与保存。
import { create } from 'zustand';
import type { AgentChapterOutline, Book, Chapter, ChapterMemory, ContextItem, LoreItem, WorldBuilderItem, RoleProfile, StoryArchiveKind, InspirationNote } from '../types';
import type { OutlineNode, OutlineVisionData } from '../types/ov';
import { electronAPI } from '../utils/electron';
import { buildDefaultChapterContent, ensureChapterHeading, extractChapterHeading } from '../utils/chapterTemplate';
import { convertAiTreeToSegmentNodes } from '../utils/ovConverter';
import { parseJsonLoosely } from '../utils/jsonParse';

const SYNC_CHANNEL_NAME = 'xly_book_sync';

// -- 跨窗口状态同步 (Multi-window sync) --
if (typeof BroadcastChannel !== 'undefined') {
	try {
		const syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
		syncChannel.onmessage = (e) => {
			if (e.data === 'sync_books') {
				if (!import.meta.env.PROD) console.debug('[useBookStore] cross-window sync event received, reloading books...');
				// Use a small delay to ensure disk write from the other window has fully completed
				setTimeout(() => {
					useBookStore.getState().loadBooks().catch(console.error);
				}, 150);
			}
		};
	} catch (err) {
		console.warn('BroadcastChannel not supported or failed', err);
	}
}

function notifyBookSync() {
	if (typeof BroadcastChannel !== 'undefined') {
		try {
			new BroadcastChannel(SYNC_CHANNEL_NAME).postMessage('sync_books');
		} catch (err) {}
	}
}

type SafeAiInference = NonNullable<ChapterMemory['aiInference']>;

interface BookState {
	ensureChapterContent: (bookId: string, chapterId: string) => Promise<string>;
	ensureBookContentLoaded: (bookId: string) => Promise<void>;
	loadChapterIntoStore: (bookId: string, chapterId: string) => Promise<void>;
 books: Book[];
 loading: boolean;
 error?: string;
 /** preferDisk: 云同步下载后用磁盘真相，清空正文缓存且不用内存旧 content 覆盖 */
 loadBooks: (options?: { preferDisk?: boolean }) => Promise<void>;
 saveBook: (book: Book, options?: { reload?: boolean }) => Promise<void>;
 deleteBook: (bookId: string) => Promise<void>;
 createBook: (title: string, author: string) => Promise<Book>;
 /** @returns false 表示被保护策略拒绝落盘（如云下载窗内近空覆盖） */
 setChapterContent: (bookId: string, chapterId: string, content: string) => Promise<boolean>;
 updateBook: (bookId: string, updater: Partial<Book> | ((book: Book) => Partial<Book>)) => Promise<void>;
 setChapterOutline: (bookId: string, chapterId: string, outline: string) => Promise<void>;
 /** 仅改当前章标题（内存立刻 + 磁盘防抖 patch），禁止整本 saveBook */
 setChapterTitle: (bookId: string, chapterId: string, title: string) => Promise<void>;
 updateOutlineVision: (bookId: string, data: OutlineVisionData, options?: { persist?: boolean }) => Promise<void>;
 syncOutlineProgress: (bookId: string) => Promise<void>;
 updateRoleProfile: (bookId: string, profile: RoleProfile) => Promise<void>;
 setContextBasket: (bookId: string, items: ContextItem[]) => Promise<void>;
 setLore: (bookId: string, items: LoreItem[]) => Promise<void>;
 setWorldBuilder: (bookId: string, items: WorldBuilderItem[]) => Promise<void>;
 loadMemoryBank: (bookId: string) => Promise<void>;
 saveMemoryBank: (bookId: string, memoryBank: unknown[], skipMerge?: boolean) => Promise<void>;
 addOutlineNode: (bookId: string, parentId: string | null, data: Partial<import('../types/ov').OutlineNode>) => Promise<void>;
 deleteOutlineNode: (bookId: string, nodeId: string) => Promise<void>;
 updateOutlineNode: (bookId: string, nodeId: string, data: Partial<import('../types/ov').OutlineNode>) => Promise<void>;
 importOutlineFromText: (bookId: string, text: string) => Promise<void>;

 addInspirationNote: (bookId: string, content: string) => void;
 updateInspirationNote: (bookId: string, noteId: string, updates: Partial<InspirationNote>) => void;
 deleteInspirationNote: (bookId: string, noteId: string) => void;
 reorderInspirationNotes: (bookId: string, noteIds: string[]) => void;
}

function nextBooksById(books: Book[], bookId: string, updater: (book: Book) => Book): Book[] {
 return books.map((book) => (book.id === bookId ? updater(book) : book));
}

function toSafeText(value: unknown): string {
 if (typeof value === 'string') return value;
 if (Array.isArray(value)) {
 return value
 .map((item) => toSafeText(item).trim())
 .filter(Boolean)
 .join(' -> ');
 }
 if (value && typeof value === 'object') {
 return Object.entries(value as Record<string, unknown>)
 .map(([key, val]) => {
 const text = toSafeText(val).trim();
 if (!text) return '';
 if (/[a-zA-Z]/.test(key)) return text;
 return `${key}: ${text}`;
 })
 .filter(Boolean)
 .join('; ');
 }
 return '';
}
function sanitizePlotNodes(value: unknown): ChapterMemory['plotAnalysis'] extends { keyNodes: infer T } ? T : never {
 // AI UI 
 if (!Array.isArray(value)) return [] as never;
 return value
 .map((item) => {
 if (!item || typeof item !== 'object') return null;
 const node = item as Record<string, unknown>;
 const action = String(node.action || '').trim();
 if (!action) return null;
 const nodeTypeRaw = String(node.nodeType || '其他').trim();
 const nodeType = (['背景铺垫', '转折点', '高潮点', '其他'].includes(nodeTypeRaw) ? nodeTypeRaw : '其他') as
 | '背景铺垫'
 | '转折点'
 | '高潮点'
 | '其他';
 const impact = Number(node.impactLevel);
 return {
 time: String(node.time || '').trim() || undefined,
 action,
 nodeType,
 impactLevel: Number.isFinite(impact) ? Math.max(1, Math.min(5, Math.floor(impact))) : undefined
 };
 })
 .filter(Boolean) as never;
}

function sanitizeStoryArchiveRecords(value: unknown, chapterId: string): NonNullable<ChapterMemory['archiveRecords']> {
 if (!Array.isArray(value)) return [];
 const allowedKinds = new Set<StoryArchiveKind>(['character', 'item', 'skill', 'faction', 'relationship', 'foreshadow', 'event']);
 return value
 .map((item): NonNullable<ChapterMemory['archiveRecords']>[number] | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const kindRaw = String(row.kind || '').trim() as StoryArchiveKind;
 const kind = allowedKinds.has(kindRaw) ? kindRaw : 'event';
 const subject = toSafeText(row.subject).trim();
 const detail = toSafeText(row.detail).trim();
 const title = toSafeText(row.title).trim() || subject || detail.slice(0, 24);
 if (!title || !subject || !detail) return null;
 const importance = Number(row.importance);
 const sourceChapterIds = Array.isArray(row.sourceChapterIds)
 ? row.sourceChapterIds.map((id) => String(id || '').trim()).filter(Boolean)
 : undefined;
 const tags = Array.isArray(row.tags)
 ? row.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 12)
 : undefined;
 return {
 id: String(row.id || `${chapterId}-${kind}-${title}-${detail}`).trim(),
 kind,
 title,
 subject,
 detail,
 chapterId: toSafeText(row.chapterId).trim() || chapterId,
 createdAt: toSafeText(row.createdAt).trim() || new Date().toISOString(),
 ...(toSafeText(row.target).trim() ? { target: toSafeText(row.target).trim() } : {}),
 ...(toSafeText(row.status).trim() ? { status: toSafeText(row.status).trim() } : {}),
 ...(toSafeText(row.chapterTitle).trim() ? { chapterTitle: toSafeText(row.chapterTitle).trim() } : {}),
 ...(sourceChapterIds && sourceChapterIds.length > 0 ? { sourceChapterIds } : {}),
 ...(toSafeText(row.evidence).trim() ? { evidence: toSafeText(row.evidence).trim() } : {}),
 ...(tags && tags.length > 0 ? { tags } : {}),
 ...(Number.isFinite(importance) ? { importance: Math.max(1, Math.min(5, Math.floor(importance))) } : {}),
 ...(toSafeText(row.updatedAt).trim() ? { updatedAt: toSafeText(row.updatedAt).trim() } : {})
 };
 })
 .filter((item): item is NonNullable<ChapterMemory['archiveRecords']>[number] => Boolean(item));
}

function sanitizeStringList(value: unknown, max = 12): string[] {
 if (!Array.isArray(value)) return [];
 return value.map((item) => toSafeText(item).trim()).filter(Boolean).slice(0, max);
}

function sanitizeAgentOutline(value: unknown): AgentChapterOutline | undefined {
 if (!value || typeof value !== 'object') return undefined;
 const row = value as Record<string, unknown>;
 const outline: AgentChapterOutline = {
 summary: toSafeText(row.summary),
 chapterTarget: toSafeText(row.chapterTarget),
 sceneBeats: sanitizeStringList(row.sceneBeats, 8),
 locations: sanitizeStringList(row.locations, 8),
 charactersInvolved: sanitizeStringList(row.charactersInvolved, 10),
 conflictNotes: sanitizeStringList(row.conflictNotes, 8),
 gains: sanitizeStringList(row.gains, 8),
 relationshipChanges: sanitizeStringList(row.relationshipChanges, 8),
 endingState: toSafeText(row.endingState),
 openLoops: sanitizeStringList(row.openLoops, 8),
 tags: sanitizeStringList(row.tags, 12)
 };

 const hasContent = Boolean(
 outline.summary ||
 outline.chapterTarget ||
 outline.sceneBeats.length ||
 outline.locations.length ||
 outline.charactersInvolved.length ||
 outline.conflictNotes.length ||
 outline.gains.length ||
 outline.relationshipChanges.length ||
 outline.endingState ||
 outline.openLoops.length ||
 outline.tags.length
 );

 return hasContent ? outline : undefined;
}

function sanitizeMemoryItem(item: unknown): ChapterMemory | null {
 if (!item || typeof item !== 'object') return null;
 const record = item as Record<string, unknown>;
 const chapterId = String(record.chapterId || '').trim();
 if (!chapterId) return null;
 const plot = record.plotAnalysis && typeof record.plotAnalysis === 'object'
 ? (record.plotAnalysis as Record<string, unknown>)
 : null;
 const inf = record.aiInference && typeof record.aiInference === 'object'
 ? (record.aiInference as Record<string, unknown>)
 : null;
 const structureTree = inf?.structureTree && typeof inf.structureTree === 'object'
 ? (inf.structureTree as SafeAiInference['structureTree'])
 : null;
 const timelineEvents: SafeAiInference['timelineEvents'] = Array.isArray(inf?.timelineEvents)
 ? inf?.timelineEvents
 .map((event) => {
 if (!event || typeof event !== 'object') return null;
 const row = event as Record<string, unknown>;
 return {
 time: toSafeText(row.time),
 location: toSafeText(row.location),
 event: toSafeText(row.event),
 impact: Math.max(1, Math.min(5, Number(row.impact) || 1))
 };
 })
 .filter((event): event is NonNullable<SafeAiInference['timelineEvents']>[number] => Boolean(event))
 : [];
 const parallelThreads: SafeAiInference['parallelThreads'] = Array.isArray(inf?.parallelThreads)
 ? inf?.parallelThreads
 .map((thread) => {
 if (!thread || typeof thread !== 'object') return null;
 const row = thread as Record<string, unknown>;
 const statusRaw = toSafeText(row.status);
 const status: NonNullable<SafeAiInference['parallelThreads']>[number]['status'] =
 statusRaw === '已闭环' ||
 statusRaw === '待推进' ||
 statusRaw === '已埋伏笔' ||
 statusRaw === '疑似伏笔' ||
 statusRaw === '已回收'
 ? (statusRaw as NonNullable<SafeAiInference['parallelThreads']>[number]['status'])
 : ('进行中' as NonNullable<SafeAiInference['parallelThreads']>[number]['status']);
 return {
 name: toSafeText(row.name),
 status,
 progress: toSafeText(row.progress)
 };
 })
 .filter((thread): thread is NonNullable<typeof thread> => Boolean(thread && thread.name))
 : [];
 const predictions = Array.isArray(inf?.predictions)
 ? inf?.predictions
 .map((prediction) => {
 if (!prediction || typeof prediction !== 'object') return null;
 const row = prediction as Record<string, unknown>;
 return {
 direction: toSafeText(row.direction),
 probability: toSafeText(row.probability),
 suggestion: toSafeText(row.suggestion)
 };
 })
 .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction && prediction.direction))
 : [];
 return {
 chapterId,
 summary: toSafeText(record.summary),
 isAnalyzed: Boolean(record.isAnalyzed),
 plotAnalysis: plot
 ? {
 narrativeChain: toSafeText(plot.narrativeChain),
 keyNodes: sanitizePlotNodes(plot.keyNodes),
 plotSynopsis: toSafeText(plot.plotSynopsis) || toSafeText(plot.functionSummary),
 functionSummary: toSafeText(plot.plotSynopsis) || toSafeText(plot.functionSummary),
 acquisitions: sanitizePlotEvents(plot.acquisitions),
 alliances: sanitizePlotEvents(plot.alliances),
 relationProgress: sanitizePlotEvents(plot.relationProgress)
 }
 : undefined,
 agentOutline: sanitizeAgentOutline(record.agentOutline),
 archiveRecords: sanitizeStoryArchiveRecords(record.archiveRecords, chapterId),
 aiInference: inf
 ? {
 generatedAt: toSafeText(inf.generatedAt) || new Date().toISOString(),
 providerModel: toSafeText(inf.providerModel),
 structureTree,
 timelineEvents,
 parallelThreads,
 predictions,
 rawText: toSafeText(inf.rawText)
 }
 : undefined
 };
}

function sanitizeMemoryBank(chapters: Chapter[], memoryBank: unknown): ChapterMemory[] {
 if (!Array.isArray(memoryBank)) return [];
 const chapterIds = new Set(chapters.map((chapter) => chapter.id));
 return memoryBank
 .map((item) => sanitizeMemoryItem(item))
 .filter((item): item is ChapterMemory => Boolean(item && chapterIds.has(item.chapterId)));
}

function dedupeChapters(chapters: Chapter[]): Chapter[] {
 const byId = new Map<string, Chapter>();
 for (const chapter of chapters) {
 const id = String(chapter?.id || '').trim();
 if (!id) continue;
 const prev = byId.get(id);
 if (!prev) {
 byId.set(id, chapter);
 continue;
 }
 const prevAt = Date.parse(String(prev.updatedAt || prev.createdAt || ''));
 const nextAt = Date.parse(String(chapter.updatedAt || chapter.createdAt || ''));
 if (Number.isFinite(nextAt) && (!Number.isFinite(prevAt) || nextAt >= prevAt)) {
 byId.set(id, chapter);
 }
 }
 return Array.from(byId.values());
}

function dedupeChapterContent(chapters: Chapter[]): Chapter[] {
 const seen = new Set<string>();
 const out: Chapter[] = [];
 for (const chapter of chapters) {
 const title = String(chapter?.title || '').trim();
 const content = String(chapter?.content || '').trim();
 const normalizedText = content
 .replace(/<[^>]+>/g, '')
 .replace(/&nbsp;/gi, ' ')
 .replace(/\s+/g, '')
 .trim();
 const wordCount = Number(chapter?.wordCount || 0);
 if (!title || !normalizedText) {
 out.push(chapter);
 continue;
 }
 // 修复：以章节 id 作为去重主键，避免不同章节因标题/字数/正文恰好相同而被静默删除。
 const chapterKeyId = String(chapter?.id || '').trim();
 const key = `${chapterKeyId}__${title}__${wordCount}__${normalizedText}`;
 if (seen.has(key)) continue;
 seen.add(key);
 out.push(chapter);
 }
 return out;
}

function sanitizeVolumes(chapters: Chapter[], volumes: Book['volumes']): Book['volumes'] {
 const list = Array.isArray(volumes) ? volumes : [];
 if (list.length === 0) return [];
 const chapterIdSet = new Set(chapters.map((chapter) => String(chapter.id || '').trim()).filter(Boolean));
 const seenStarts = new Set<string>();
 const out = list
 .map((volume) => {
 const startChapterId = String(volume?.startChapterId || '').trim();
 if (!startChapterId || !chapterIdSet.has(startChapterId)) return null;
 if (seenStarts.has(startChapterId)) return null;
 seenStarts.add(startChapterId);
 return {
 ...volume,
 chapters: [],
 startChapterId
 };
 })
 .filter((item): item is NonNullable<typeof item> => Boolean(item));
 return out;
}

function computeChapterWordCount(content: string, title: string): number {
 	// Robust DOM-based word count calculation
	let plainText = '';
	try {
		plainText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';
	} catch (e) {
		plainText = content.replace(/<[^>]+>/g, '');
	}
	let normalizedPlain = plainText.replace(/[\s\u00a0\u200b-\u200d\u2060\u2028\u2029\ufeff]/g, '');
	const cleanTitle = title.replace(/[\s\u00a0\u200b-\u200d\u2060\u2028\u2029\ufeff]/g, '');
	if (normalizedPlain.startsWith(cleanTitle)) {
		normalizedPlain = normalizedPlain.slice(cleanTitle.length);
	}
	return normalizedPlain.length;
}

function recomputeWordCounts(chapters: Chapter[]): Chapter[] {
 return chapters.map((chapter) => {
 if (chapter.wordCount > 0 || !chapter.content) return chapter;
 const plain = computeChapterWordCount(chapter.content, chapter.title);
 if (plain === 0) return chapter;
 return { ...chapter, wordCount: plain };
 });
}

function sanitizeBook(book: Book): Book {
 const chaptersRaw = Array.isArray(book.chapters) ? book.chapters : [];
 const chapters = recomputeWordCounts(dedupeChapterContent(dedupeChapters(chaptersRaw)));
 const nextMemory = sanitizeMemoryBank(chapters, book.memoryBank);
 return {
 ...book,
 chapters,
 volumes: sanitizeVolumes(chapters, book.volumes),
 memoryBank: nextMemory
 };
}

function normalizeOutlineNode(value: unknown): OutlineNode | null {
 if (!value || typeof value !== 'object') return null;
 const record = value as Record<string, unknown>;
 const title = String(record.title || record.label || record.name || '').trim();
 if (!title) return null;

 const typeRaw = String(record.type || 'event').trim();
 const type: OutlineNode['type'] =
 typeRaw === 'arc' || typeRaw === 'sub_plot' || typeRaw === 'placeholder' ? typeRaw : 'event';

 const targetWordCountRaw = Number(record.targetWordCount);
 const actualWordCountRaw = Number(record.actualWordCount);
 const childrenRaw = Array.isArray(record.children) ? record.children : [];
 const children = childrenRaw
 .map((item) => normalizeOutlineNode(item))
 .filter((item): item is OutlineNode => Boolean(item));
 const characters = Array.isArray(record.characters)
 ? record.characters.map((item) => String(item || '').trim()).filter(Boolean)
 : undefined;
 const locations = Array.isArray(record.locations)
 ? record.locations.map((item) => String(item || '').trim()).filter(Boolean)
 : undefined;
 const items = Array.isArray(record.items)
 ? record.items.map((item) => String(item || '').trim()).filter(Boolean)
 : undefined;

 return {
 id: typeof record.id === 'string' && record.id.trim().length > 0 ? record.id : crypto.randomUUID(),
 title,
 type,
 conflict: typeof record.conflict === 'string' ? record.conflict : undefined,
 characters,
 locations,
 items,
 targetWordCount: Number.isFinite(targetWordCountRaw) && targetWordCountRaw > 0 ? Math.floor(targetWordCountRaw) : 3000,
 actualWordCount: Number.isFinite(actualWordCountRaw) && actualWordCountRaw >= 0 ? Math.floor(actualWordCountRaw) : 0,
 chapterId: typeof record.chapterId === 'string' ? record.chapterId : undefined,
 isAiGenerated: typeof record.isAiGenerated === 'boolean' ? record.isAiGenerated : false,
 notes: typeof record.notes === 'string' ? record.notes : undefined,
 pinned: typeof record.pinned === 'boolean' ? record.pinned : false,
 position:
 record.position && typeof record.position === 'object'
 ? {
 x: Number.isFinite(Number((record.position as Record<string, unknown>).x))
 ? Math.round(Number((record.position as Record<string, unknown>).x))
 : 0,
 y: Number.isFinite(Number((record.position as Record<string, unknown>).y))
 ? Math.round(Number((record.position as Record<string, unknown>).y))
 : 0
 }
 : undefined,
 children: children.length > 0 ? children : undefined
 };
}

function sanitizePlotEvents(value: unknown): import('../types').PlotEventRecord[] {
 // Accept legacy/loosely-typed event payloads and normalize to strict plot event records.
 if (!Array.isArray(value)) return [];
 return value
 .map((item) => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const subject = String(row.subject || '').trim();
 const detail = String(row.detail || '').trim();
 if (!subject || !detail) return null;
 const impact = parseInt(String(row.impactLevel || '1'), 10);
 return {
 time: String(row.time || '').trim() || undefined,
 subject,
 target: String(row.target || '').trim() || undefined,
 detail,
 chapter: String(row.chapter || '').trim() || undefined,
 evidence: String(row.evidence || '').trim() || undefined,
 impactLevel: Number.isFinite(impact) ? Math.max(1, Math.min(5, Math.floor(impact))) : 1
 } as import('../types').PlotEventRecord;
 })
 .filter((item): item is import('../types').PlotEventRecord => item !== null);
}

function normalizeImportedOutlineNodes(payload: unknown, chapterCount = 0): OutlineNode[] {
 // Import pipeline: parse external outline trees and convert to editor-safe node schema.
 if (Array.isArray(payload)) {
 return payload
 .map((item) => normalizeOutlineNode(item))
 .filter((item): item is OutlineNode => Boolean(item));
 }
 if (!payload || typeof payload !== 'object') return [];

 const record = payload as Record<string, unknown>;
 if (Array.isArray(record.nodes)) {
 return record.nodes
 .map((item) => normalizeOutlineNode(item))
 .filter((item): item is OutlineNode => Boolean(item));
 }
 if (record.structureTree && typeof record.structureTree === 'object') {
 return convertAiTreeToSegmentNodes(record.structureTree, chapterCount);
 }
 if (record.type && (record.label || record.title || record.name)) {
 return convertAiTreeToSegmentNodes(record, chapterCount);
 }
 return [];
}

const MASTER_ROOT_TITLE = '总纲';
const MASTER_ROOT_POSITION = { x: 120, y: 120 };

function isMasterRootNode(node: Pick<OutlineNode, 'title'>): boolean {
 return String(node.title || '').trim() === MASTER_ROOT_TITLE;
}

function createMasterRootNode(): OutlineNode {
 return {
 id: crypto.randomUUID(),
 title: MASTER_ROOT_TITLE,
 type: 'arc',
 targetWordCount: 0,
 actualWordCount: 0,
 pinned: true,
 position: { ...MASTER_ROOT_POSITION },
 children: []
 };
}

function ensureMasterRoot(nodes: OutlineNode[] | undefined): OutlineNode[] {
 const list = Array.isArray(nodes) ? [...nodes] : [];
 const index = list.findIndex((item) => isMasterRootNode(item));
 if (index === -1) {
 const root = createMasterRootNode();
 return [{ ...root, children: list }];
 }

 const root = list[index];
 const extraRoots = list.filter((_, idx) => idx !== index);
 const mergedChildren = [...(root.children || []), ...extraRoots];
 
 // TASK-13 Optimization: Force alignment for Master Root
 const rootPos = root.position || { ...MASTER_ROOT_POSITION };
 const nextRoot: OutlineNode = {
 ...root,
 type: 'arc',
 pinned: true,
 title: MASTER_ROOT_TITLE,
 position: {
 x: Math.round(rootPos.x),
 y: Math.round(rootPos.y)
 },
 children: mergedChildren
 };

 return [nextRoot];
}

// ===== P1: 章节正文懒加载缓存（LRU）。内存默认只存元数据，正文按需从磁盘读取并缓存最近若干章。 =====
const CHAPTER_CONTENT_CACHE_LIMIT = 24;
const chapterContentCache = new Map<string, string>();
function chapterCacheKey(bookId: string, chapterId: string): string { return `${bookId}:${chapterId}`; }
function cacheGet(key: string): string | undefined {
 const v = chapterContentCache.get(key);
 if (v !== undefined) { chapterContentCache.delete(key); chapterContentCache.set(key, v); }
 return v;
}
function cacheSet(key: string, value: string): void {
 if (chapterContentCache.has(key)) chapterContentCache.delete(key);
 chapterContentCache.set(key, value);
 while (chapterContentCache.size > CHAPTER_CONTENT_CACHE_LIMIT) {
 const oldest = chapterContentCache.keys().next().value;
 if (oldest === undefined) break;
 chapterContentCache.delete(oldest);
 }
}
export function invalidateChapterContentCache(bookId?: string, chapterId?: string): void {
 if (!bookId) { chapterContentCache.clear(); return; }
 if (!chapterId) {
 for (const k of Array.from(chapterContentCache.keys())) { if (k.startsWith(`${bookId}:`)) chapterContentCache.delete(k); }
 return;
 }
 chapterContentCache.delete(chapterCacheKey(bookId, chapterId));
}

// ===== 云同步下载保护窗：禁止用「空 content」回写磁盘 / 冲掉编辑器 =====
// 下载后 loadBooks(preferDisk) 会把内存 content 置空（懒加载模型），若编辑器 effect
// 把空串 setContent 再 autosave，会把刚下载的 .html 盖成空——表现为「闪一下又空了」。
let cloudDownloadGuardUntil = 0;
export function beginCloudDownloadGuard(ms = 8000): void {
 cloudDownloadGuardUntil = Date.now() + Math.max(1000, ms);
}
export function isCloudDownloadGuardActive(): boolean {
 return Date.now() < cloudDownloadGuardUntil;
}
function plainTextLen(html: string): number {
 return String(html || '')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, '').length;
}

/**
 * 云下载后的统一恢复：清缓存 → 以磁盘为准重载书架 → 通知编辑器重灌正文。
 * 调用方不要在此前后再胡乱 dispatch 多次 webdav-downloaded。
 */
export async function afterCloudDownload(): Promise<void> {
	beginCloudDownloadGuard(10000);
	invalidateChapterContentCache();
	await useBookStore.getState().loadBooks({ preferDisk: true });
	// 再通知编辑器：此时 guard 已开，不会把空 content 写回磁盘
	window.dispatchEvent(new CustomEvent('writerzen:webdav-downloaded'));
}

// ===== 结构变更落盘合并队列：连续增删章等结构变更只做一次整本 saveBook =====
// 大书 saveBook 会逐章回填 .html（几百个文件），连点新建时若每点一次都整本写盘，
// 会让 WebView 锁住（creatingChapterRef 一直占用）并造成点击被吞。这里把同一本书的
// 多次结构变更合并成一次保存：先同步更新内存（新章立即出现），磁盘保存排队 trailing 合并。
type StructuralSave = { book: Book; timer: ReturnType<typeof setTimeout> | null };
const pendingStructuralSaves = new Map<string, StructuralSave>();
const STRUCTURAL_SAVE_DEBOUNCE_MS = 300;

/** 排一次结构保存；若同书已有排队，则用最新 book 覆盖，避免旧快照覆盖新变更 */
export async function flushStructuralSave(bookId: string): Promise<void> {
	const entry = pendingStructuralSaves.get(bookId);
	if (!entry) return;
	pendingStructuralSaves.delete(bookId);
	if (entry.timer) {
		clearTimeout(entry.timer);
		entry.timer = null;
	}
	try {
		const sanitized = sanitizeBook(entry.book);
		await electronAPI.fs.saveBook({ book: sanitized });
		notifyBookSync();
	} catch (err) {
		console.warn('[flushStructuralSave] failed', bookId, err);
	}
}

function queueStructuralSave(bookId: string, book: Book): Promise<void> {
	const prev = pendingStructuralSaves.get(bookId);
	if (prev?.timer) {
		clearTimeout(prev.timer);
	}
	pendingStructuralSaves.set(bookId, {
		book,
		timer: setTimeout(() => {
			const cur = pendingStructuralSaves.get(bookId);
			if (!cur) return;
			// 标记 timer 已消费，entry 由 flushStructuralSave 负责删除
			cur.timer = null;
			void flushStructuralSave(bookId);
		}, STRUCTURAL_SAVE_DEBOUNCE_MS),
	});
	// 不阻塞调用方：内存已同步更新，磁盘保存由 flushStructuralSave 合并完成。
	return Promise.resolve();
}


// ===== 章节元数据 / 细纲延迟落盘：打字时绝不整本 saveBook =====
// 正文 → chapters/{id}.html；字数/细纲先改内存，空闲或切章再 patch 当前章。
type ChapterMetaDiskPatch = {
	bookId: string;
	chapterId: string;
	title?: string;
	wordCount?: number;
	outline?: string;
	updatedAt: string;
};
const pendingChapterMetaDisk = new Map<string, ChapterMetaDiskPatch>();
let chapterMetaDiskTimer: ReturnType<typeof setTimeout> | null = null;
/** 长时间连打不停切章时的兜底；刻意拉长，避免 30MB book.json 成为输入热路径 */
const CHAPTER_META_IDLE_FLUSH_MS = 12000;

function queueChapterMetaDisk(patch: ChapterMetaDiskPatch): void {
	const key = `${patch.bookId}:${patch.chapterId}`;
	const prev = pendingChapterMetaDisk.get(key);
	pendingChapterMetaDisk.set(key, {
		bookId: patch.bookId,
		chapterId: patch.chapterId,
		// 注意：wordCount 可能为 0（删空正文），不能用 || 合并，否则 0 会被旧字数盖掉
		title: patch.title !== undefined ? patch.title : prev?.title,
		wordCount: patch.wordCount !== undefined ? patch.wordCount : prev?.wordCount,
		outline: patch.outline !== undefined ? patch.outline : prev?.outline,
		updatedAt: patch.updatedAt,
	});
	if (chapterMetaDiskTimer) clearTimeout(chapterMetaDiskTimer);
	chapterMetaDiskTimer = setTimeout(() => {
		chapterMetaDiskTimer = null;
		void flushChapterMetaDisk();
	}, CHAPTER_META_IDLE_FLUSH_MS);
}

/** 切章 / 关窗 / 锁定前刷出待写字数与细纲，避免只改内存未落盘 */
export async function flushChapterMetaDisk(): Promise<void> {
	if (chapterMetaDiskTimer) {
		clearTimeout(chapterMetaDiskTimer);
		chapterMetaDiskTimer = null;
	}
	const items = [...pendingChapterMetaDisk.values()];
	pendingChapterMetaDisk.clear();
	await Promise.all(
		items.map((p) =>
			electronAPI.fs.patchChapter({
				bookId: p.bookId,
				chapterId: p.chapterId,
				title: p.title,
				wordCount: p.wordCount,
				outline: p.outline,
				updatedAt: p.updatedAt,
			})
		)
	);
}

// ===== book.json 元数据防抖：灵感笔记 / 大纲看板 / 设定等，禁止打字时整本 saveBook+回填正文 =====
const pendingBookMetaPatches = new Map<string, Record<string, unknown>>();
let bookMetaDiskTimer: ReturnType<typeof setTimeout> | null = null;
const BOOK_META_DISK_DEBOUNCE_MS = 700;

function queueBookMetaPatch(bookId: string, patch: Record<string, unknown>): void {
	if (!bookId) return;
	const prev = pendingBookMetaPatches.get(bookId) || {};
	const next: Record<string, unknown> = { ...prev, ...patch };
	// settings 浅合并，避免连续 patch 互相覆盖
	if (prev.settings || patch.settings) {
		next.settings = {
			...((prev.settings as object) || {}),
			...((patch.settings as object) || {}),
		};
	}
	pendingBookMetaPatches.set(bookId, next);
	if (bookMetaDiskTimer) clearTimeout(bookMetaDiskTimer);
	bookMetaDiskTimer = setTimeout(() => {
		bookMetaDiskTimer = null;
		void flushBookMetaPatches();
	}, BOOK_META_DISK_DEBOUNCE_MS);
}

/** 关窗 / 切书前刷出待写元数据 */
export async function flushBookMetaPatches(): Promise<void> {
	if (bookMetaDiskTimer) {
		clearTimeout(bookMetaDiskTimer);
		bookMetaDiskTimer = null;
	}
	// 顺带刷出排队中的结构保存，避免切章/切书/关窗时丢排队变更
	for (const bookId of pendingStructuralSaves.keys()) {
		void flushStructuralSave(bookId);
	}
	const entries = [...pendingBookMetaPatches.entries()];
	pendingBookMetaPatches.clear();
	const patchApi = (electronAPI as any)?.fs?.patchBookMeta;
	await Promise.all(
		entries.map(async ([bookId, patch]) => {
			try {
				if (typeof patchApi === 'function') {
					await patchApi({ bookId, patch });
				} else {
					// 无 patch API 时退回整本（极少）
					const book = useBookStore.getState().books.find((b) => b.id === bookId);
					if (book) await electronAPI.fs.saveBook({ book });
				}
			} catch (err) {
				console.warn('[flushBookMetaPatches] failed', bookId, err);
			}
		})
	);
}

if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', () => {
		void flushChapterMetaDisk();
		void flushBookMetaPatches();
	});
}

export const useBookStore = create<BookState>((set, get) => ({
 books: [],
 loading: false,
 error: undefined,
	loadBooks: async (options) => {
		const preferDisk = Boolean(options?.preferDisk);
		set({ loading: true, error: undefined });
		try {
			// 云同步下载后必须丢弃正文缓存，否则目录字数新了、编辑器仍读到旧空缓存
			if (preferDisk) {
				invalidateChapterContentCache();
			}
			const result = await electronAPI.fs.loadBooks();
			const currentBooks = get().books;
			const books = Array.isArray(result.books) ? result.books.map((book) => {
				const sanitized = sanitizeBook(book as Book);
				// A-fix: 普通重载时保留内存正文，避免误清编辑器
				// preferDisk（云下载覆盖）时禁用：必须以磁盘 .html / book.json 为准
				if (!preferDisk) {
					const existingBook = currentBooks.find(b => b.id === sanitized.id);
					if (existingBook) {
						sanitized.chapters = sanitized.chapters.map(ch => {
							const existingCh = existingBook.chapters.find(ec => ec.id === ch.id);
							if ((!ch.content || ch.content.trim() === '') && existingCh?.content) {
								return { ...ch, content: existingCh.content };
							}
							return ch;
						});
					}
				} else {
					// 强制 content 为空，触发后续 loadChapterIntoStore 从磁盘懒加载
					sanitized.chapters = sanitized.chapters.map((ch) => ({
						...ch,
						content: '',
					}));
				}
				return sanitized;
			}) : [];
			console.warn('[useBookStore.loadBooks] received', books.length, 'books, ids:', books.map(b => b.id).join(','));
			for (let i = 0; i < books.length; i += 1) {
				const raw = (result.books as Book[])[i];
				const sanitized = books[i];
				const rawCount = Array.isArray(raw?.chapters) ? raw.chapters.length : 0;
				const safeCount = Array.isArray(sanitized?.chapters) ? sanitized.chapters.length : 0;
				if (safeCount < rawCount) {
					// 修复：加载书籍属于只读操作，不应在加载阶段静默改写磁盘。
					// 旧逻辑会在去重删章后自动 saveBook，导致仅打开应用就可能丢章节并落盘。
					console.warn('[useBookStore.loadBooks] 加载时章节数变化(可能因去重)，已跳过自动写盘:', sanitized.id, rawCount, '->', safeCount);
				}
			}
			set({ books, loading: false, error: undefined });
			console.warn('[useBookStore.loadBooks] state set, total books in store:', books.length);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('[useBookStore.loadBooks] error:', message);
			set((state) => ({ books: state.books, loading: false, error: message || '加载书籍列表失败' }));
		}
	},

 saveBook: async (book, options) => {
 const sanitized = sanitizeBook(book);
 await electronAPI.fs.saveBook({ book: sanitized });
 notifyBookSync();
 if (options?.reload ?? false) {
 await get().loadBooks();
 }
 },

 deleteBook: async (bookId) => {
 await electronAPI.fs.deleteBook({ bookId });
 notifyBookSync();
 await get().loadBooks();
 },

 createBook: async (title, author) => {
 const now = new Date().toISOString();
 const firstChapter: Chapter = {
 id: crypto.randomUUID(),
 title: '第1章',
 content: buildDefaultChapterContent('第1章'),
 wordCount: 0,
 createdAt: now,
 updatedAt: now
 };

 const book: Book = {
 id: crypto.randomUUID(),
 title,
 author,
 chapters: [firstChapter],
 settings: {},
 resourceIndex: {
 customCharacterCategories: [],
 novelType: 'virtual_mmo',
 schemaVersion: 1
 },
 contextBasket: [],
 worldSettings: [],
 worldBuilder: [],
 createdAt: now,
 updatedAt: now
 };

 await electronAPI.fs.saveBook({ book });
 notifyBookSync();
 await get().loadBooks();
 return book;
 },

 ensureChapterContent: async (bookId, chapterId) => {
 const key = chapterCacheKey(bookId, chapterId);
 const cached = cacheGet(key);
 if (cached !== undefined) return cached;
 const inStore = get().books.find((b) => b.id === bookId)?.chapters.find((c) => c.id === chapterId)?.content;
 if (inStore && inStore.trim().length > 0) { cacheSet(key, inStore); return inStore; }
 try {
 const res = await electronAPI.fs.loadChapterContent({ bookId, chapterId });
 const loaded = (res && (res as { content?: string }).content) || '';
 cacheSet(key, loaded);
 return loaded;
 } catch (err) {
 console.error('[ensureChapterContent] 载入章节正文失败', bookId, chapterId, err);
 return inStore || '';
 }
 },
 ensureBookContentLoaded: async (bookId) => {
 const book = get().books.find((b) => b.id === bookId);
 if (!book) return;
 // P1: 限制并发，避免章节上千时一次性发起海量 IPC/文件读导致 UI 卡死、内存尖峰。
 // 结果按 chapterId 收集（而非数组下标），即使加载期间章节增删也不会错位覆盖。
 const CONCURRENCY = 8;
 const chapters = book.chapters;
 const loadedById = new Map<string, string>();
 let cursor = 0;
 const worker = async () => {
 while (cursor < chapters.length) {
 const i = cursor;
 cursor += 1;
 const ch = chapters[i];
 if (!ch) continue;
 if (ch.content && ch.content.trim().length > 0) continue;
 const loaded = await get().ensureChapterContent(bookId, ch.id);
 if (loaded && loaded !== ch.content) loadedById.set(ch.id, loaded);
 }
 };
 await Promise.all(
 Array.from({ length: Math.min(CONCURRENCY, chapters.length) }, () => worker())
 );
 if (loadedById.size > 0) {
 set({
 books: nextBooksById(get().books, bookId, (b) => ({
 ...b,
 chapters: b.chapters.map((c) => {
 const loaded = loadedById.get(c.id);
 return loaded != null && loaded !== c.content ? { ...c, content: loaded } : c;
 }),
 })),
 });
 }
 },
 loadChapterIntoStore: async (bookId, chapterId) => {
 const loaded = await get().ensureChapterContent(bookId, chapterId);
 const book = get().books.find((b) => b.id === bookId);
 const ch = book?.chapters.find((c) => c.id === chapterId);
 if (!book || !ch) return;
 if ((ch.content || '') === loaded) return;
 set({
 books: nextBooksById(get().books, bookId, (b) => ({
 ...b,
 chapters: b.chapters.map((c) => (c.id === chapterId ? { ...c, content: loaded } : c)),
 })),
 });
 },

 setChapterContent: async (bookId, chapterId, content) => {
 // 打字热路径：只微调「当前章」。
 // - 正文 → chapters/{id}.html（绝不为每键重写 30MB book.json）
 // - 标题/字数 → 内存立刻改 UI；字数落盘防抖；标题少见可立即写 meta
 const target = get().books.find((b) => b.id === bookId);
 if (!target) return false;
 const chapterMeta = target.chapters.find((chapter) => chapter.id === chapterId);
 if (!chapterMeta) return false;

 const cacheKey = chapterCacheKey(bookId, chapterId);
 const prevCached = cacheGet(cacheKey);
 const prevContent =
  typeof chapterMeta.content === 'string' && chapterMeta.content.length > 0
   ? chapterMeta.content
   : prevCached ?? '';

 const normalizedContent = ensureChapterHeading(content, chapterMeta.title);
 const nextPlain = plainTextLen(normalizedContent);
 const prevPlain = plainTextLen(prevContent);
 const metaWc = Number(chapterMeta.wordCount || 0);

 // 仅在「云下载保护窗」内拒绝近空覆盖，防止下载后空编辑器把磁盘盖坏。
 // 旧逻辑还带 prevPlain > nextPlain*3，会把用户正常删空/大段删除也静默拒绝：
 // 界面已空、状态「已保存」，字数不降，切章回来正文又从磁盘冒出来。
 if (
  isCloudDownloadGuardActive() &&
  nextPlain < 40 &&
  (prevPlain > 80 || metaWc > 80)
 ) {
  console.warn(
   '[setChapterContent] refuse empty/short overwrite (cloud guard)',
   { bookId, chapterId, nextPlain, prevPlain, metaWc }
  );
  return false;
 }

 cacheSet(cacheKey, normalizedContent);
 const headingTitle = extractChapterHeading(normalizedContent);
 const nextTitle = headingTitle || chapterMeta.title;
 const nextWordCount = computeChapterWordCount(normalizedContent, nextTitle);
 const now = new Date().toISOString();

 const titleChanged = nextTitle !== chapterMeta.title;
 const wordCountChanged = nextWordCount !== chapterMeta.wordCount;
 const contentChanged = normalizedContent !== prevContent;
 // 改稿学习：无论内容是否变化都派发一次，让 styleLearnBridge 对比最近 Agent 草稿。
 // （旧实现只在"未变化"分支派发，用户真实改稿反而拿不到，学习闭环永远断。）
 try {
  if (typeof window !== 'undefined') {
   window.dispatchEvent(new CustomEvent('writerzen:chapter-edit-learn', {
    detail: { bookId, chapterId, content: normalizedContent }
   }));
  }
 } catch { /* ignore */ }
 if (!titleChanged && !wordCountChanged && !contentChanged) {
  return true;
 }

 // 内存：标题或字数变了就更新侧栏；正文 content 有变也写入，避免切章又读到旧 HTML
 if (titleChanged || wordCountChanged || contentChanged) {
  set({
   books: nextBooksById(get().books, bookId, (b) => ({
    ...b,
    chapters: b.chapters.map((chapter) =>
     chapter.id === chapterId
      ? {
         ...chapter,
         title: nextTitle,
         wordCount: nextWordCount,
         updatedAt: now,
         content: normalizedContent,
        }
      : chapter
    ),
    updatedAt: now,
   })),
  });
 }

  // 磁盘正文：只写当前章 .html
  if (contentChanged) {
   // 关键变更重置（P2-B2）：章节内容「从空到有」（新写第一段 / 空壳章补正文）→ 重置书的理解确认标志
   if (!prevContent.trim()) {
    const b = get().books.find((x) => x.id === bookId);
    if (b && b.agentContextConfirmed) {
     set({ books: nextBooksById(get().books, bookId, (x) => ({ ...x, agentContextConfirmed: false, updatedAt: now })) });
     void queueBookMetaPatch(bookId, { agentContextConfirmed: false, updatedAt: now });
    }
   }
   await electronAPI.fs.patchChapter({
    bookId,
    chapterId,
    content: normalizedContent,
    updatedAt: now,
   });
  }

 // 磁盘 meta：禁止每键带 title+wordCount 触发整本 book.json 重写
 if (titleChanged) {
  await electronAPI.fs.patchChapter({
   bookId,
   chapterId,
   title: nextTitle,
   wordCount: nextWordCount,
   updatedAt: now,
  });
 } else if (wordCountChanged) {
  // 只排队；切章 forcePersist / 空闲 / beforeunload 再写 book.json
  queueChapterMetaDisk({
   bookId,
   chapterId,
   wordCount: nextWordCount,
   updatedAt: now,
  });
 }
 return true;
 },

 	updateBook: async (bookId, updater) => {
		// 写闸门：
		// - 改 chapters/volumes/回收站 → 整本 sanitize + saveBook（结构变更）
		// - 仅设定/笔记/看板等元数据 → 内存浅合并 + 防抖 patch_book_meta（无正文回填）
		const current = get().books.find((book) => book.id === bookId);
		if (!current) return;

		const partial = typeof updater === 'function' ? (updater as (b: Book) => Partial<Book>)(current) : updater;
		const now = new Date().toISOString();
		// 注意：调用方常写 `{ ...book, field }`，chapters 引用未变时绝不能当成结构变更去整本 saveBook
		const structural =
			(Object.prototype.hasOwnProperty.call(partial, 'chapters') &&
				partial.chapters !== current.chapters) ||
			(Object.prototype.hasOwnProperty.call(partial, 'volumes') &&
				partial.volumes !== current.volumes) ||
			(Object.prototype.hasOwnProperty.call(partial, 'recycledChapters') &&
				partial.recycledChapters !== current.recycledChapters) ||
			(Object.prototype.hasOwnProperty.call(partial, 'memoryBank') &&
				partial.memoryBank !== current.memoryBank);

		if (structural) {
			const next = sanitizeBook({ ...current, ...partial, updatedAt: now });
			set({ books: nextBooksById(get().books, bookId, () => next) });
			await queueStructuralSave(bookId, next);
			return;
		}

		// 轻量元数据路径：禁止 sanitizeBook 遍历全书、禁止 saveBook 回填数百章 .html
		const next = { ...current, ...partial, updatedAt: now } as Book;
		set({ books: nextBooksById(get().books, bookId, () => next) });
		// 只把「相对 current 有变化」的顶层键写入 patch，避免无意义整对象
		const metaPatch: Record<string, unknown> = { updatedAt: now };
		for (const key of Object.keys(partial) as (keyof Book)[]) {
			if (
				key === 'chapters' ||
				key === 'volumes' ||
				key === 'recycledChapters' ||
				key === 'memoryBank' ||
				key === 'id'
			) {
				continue;
			}
			if ((partial as any)[key] !== (current as any)[key]) {
				metaPatch[key as string] = (partial as any)[key];
			}
		}
		// 关键变更重置（P2-B2）：角色卡（resourceIndex）/ 设定（settings，含 plotOutline）更新 → 重新对齐
		const keyChanged =
			Object.prototype.hasOwnProperty.call(partial, 'resourceIndex') ||
			Object.prototype.hasOwnProperty.call(partial, 'settings');
		if (keyChanged && current.agentContextConfirmed) {
			next.agentContextConfirmed = false;
			metaPatch.agentContextConfirmed = false;
			// 已有 set 写入了 next；重新覆盖一次确保内存同步
			set({ books: nextBooksById(get().books, bookId, () => next) });
		}
		if (Object.keys(metaPatch).length > 1) {
			queueBookMetaPatch(bookId, metaPatch);
		}
	},

 setContextBasket: async (bookId, items) => {
 await get().updateBook(bookId, {
 contextBasket: items,
 updatedAt: new Date().toISOString()
 });
 },

 setLore: async (bookId, items) => {
 await get().updateBook(bookId, {
 worldSettings: items,
 updatedAt: new Date().toISOString()
 });
 },

 setWorldBuilder: async (bookId, items) => {
 await get().updateBook(bookId, {
 worldBuilder: items,
 updatedAt: new Date().toISOString()
 });
 },

 loadMemoryBank: async (bookId) => {
 const res = await electronAPI.fs.loadMemoryBank({ bookId });
 set((state) => ({
 books: nextBooksById(state.books, bookId, (book) => ({
 ...book,
 memoryBank: sanitizeMemoryBank(book.chapters, res.memoryBank)
 }))
 }));
 },

 saveMemoryBank: async (bookId, memoryBank, _skipMerge?: boolean) => {
 // 章节整理只保存 memoryBank/archiveRecords；角色卡更新必须通过提案确认后单独应用。
 const book = get().books.find((item) => item.id === bookId);
 const sanitized = sanitizeMemoryBank(book?.chapters || [], memoryBank);
 await electronAPI.fs.saveMemoryBank({ bookId, memoryBank: sanitized });
 set((state) => ({
  books: nextBooksById(state.books, bookId, (current) => ({
   ...current,
   memoryBank: sanitized,
   // 关键变更重置（P2-B2）：记忆/档案更新 → 重新对齐书的理解
   ...(current.agentContextConfirmed ? { agentContextConfirmed: false } : {}),
  }))
 }));
 if (book?.agentContextConfirmed) {
  void queueBookMetaPatch(bookId, { agentContextConfirmed: false });
 }
 },
 setChapterOutline: async (bookId, chapterId, outline) => {
 // 细纲热路径：只改当前章内存字段；磁盘防抖 patch，禁止 sanitizeBook + 整本 saveBook（老书 30MB 会卡死打字）
 const target = get().books.find((book) => book.id === bookId);
 if (!target) return;
 const chapterMeta = target.chapters.find((chapter) => chapter.id === chapterId);
 if (!chapterMeta) return;
 if (String(chapterMeta.outline || '') === String(outline || '')) return;

 const now = new Date().toISOString();
 set({
  books: nextBooksById(get().books, bookId, (b) => ({
   ...b,
   chapters: b.chapters.map((chapter) =>
    chapter.id === chapterId ? { ...chapter, outline, updatedAt: now } : chapter
   ),
   updatedAt: now,
  })),
 });
 queueChapterMetaDisk({ bookId, chapterId, outline, updatedAt: now });
 },

 setChapterTitle: async (bookId, chapterId, title) => {
 const target = get().books.find((book) => book.id === bookId);
 if (!target) return;
 const chapterMeta = target.chapters.find((chapter) => chapter.id === chapterId);
 if (!chapterMeta) return;
 if (String(chapterMeta.title || '') === String(title || '')) return;

 const now = new Date().toISOString();
 set({
  books: nextBooksById(get().books, bookId, (b) => ({
   ...b,
   chapters: b.chapters.map((chapter) =>
    chapter.id === chapterId ? { ...chapter, title, updatedAt: now } : chapter
   ),
   updatedAt: now,
  })),
 });
 queueChapterMetaDisk({ bookId, chapterId, title, updatedAt: now });
 },

 updateOutlineVision: async (bookId, data, options) => {
 const { books } = get();
 const index = books.findIndex((b) => b.id === bookId);
 if (index !== -1) {
 const normalizedNodes = ensureMasterRoot(data.nodes);
 const validNodeIds = new Set<string>();
 const walkNode = (items: OutlineNode[]) => {
 items.forEach((item) => {
 validNodeIds.add(item.id);
 if (Array.isArray(item.children) && item.children.length > 0) {
 walkNode(item.children);
 }
 });
 };
 walkNode(normalizedNodes);
 const outlineVision: OutlineVisionData = {
 ...data,
 nodes: normalizedNodes,
 edges: Array.isArray(data.edges)
 ? data.edges
 .filter(
 (edge) =>
 edge &&
 typeof edge.source === 'string' &&
 typeof edge.target === 'string' &&
 validNodeIds.has(edge.source) &&
 validNodeIds.has(edge.target)
 )
 .map((edge) => ({
 id: typeof edge.id === 'string' && edge.id.trim() ? edge.id : crypto.randomUUID(),
 source: edge.source,
 target: edge.target,
 type: (edge.type === 'straight' || edge.type === 'bezier' ? edge.type : 'smoothstep') as
  | 'straight'
  | 'bezier'
  | 'smoothstep',
 }))
 : undefined,
 };
 const nextBooks = [...books];
 const updatedAt = new Date().toISOString();
 nextBooks[index] = {
 ...nextBooks[index],
 outlineVision,
 updatedAt,
 };
 set({ books: nextBooks });
 // 大纲看板打字热路径：只 patch outlineVision，禁止整本 saveBook
 if (options?.persist !== false) {
  queueBookMetaPatch(bookId, { outlineVision, updatedAt });
 }
 }
 },

 syncOutlineProgress: async (bookId) => {
 const book = get().books.find((b) => b.id === bookId);
 if (!book || !book.outlineVision) return;

 const chaptersMap = new Map(book.chapters.map((c) => [c.id, c.wordCount]));
 let hasAnyChange = false;

 // actualWordCount
 const updateNode = (node: OutlineNode): OutlineNode => {
 let nextChildren = node.children;
 let childrenWordCount = 0;
 let childChanged = false;

 if (Array.isArray(node.children) && node.children.length > 0) {
 const mappedChildren = node.children.map((child: OutlineNode) => updateNode(child));
 childChanged = mappedChildren.some((child: OutlineNode, index: number) => child !== node.children![index]);
 nextChildren = childChanged ? mappedChildren : node.children;
 childrenWordCount = mappedChildren.reduce(
 (sum: number, child: OutlineNode) => sum + (child.actualWordCount || 0),
 0
 );
 }

 const chapterWords = node.chapterId ? Number(chaptersMap.get(node.chapterId) || 0) : 0;
 const nextActual = chapterWords + Number(childrenWordCount || 0);
 const actualChanged = (node.actualWordCount || 0) !== nextActual;

 if (!actualChanged && !childChanged) {
 return node;
 }

 hasAnyChange = true;
 return {
 ...node,
 actualWordCount: nextActual,
 children: nextChildren
 };
 };

 const nextNodes = book.outlineVision.nodes.map((node) => updateNode(node));
 if (!hasAnyChange) return;
 await get().updateOutlineVision(bookId, { ...book.outlineVision, nodes: nextNodes }, { persist: false });
 },

 updateRoleProfile: async (bookId, profile) => {
 await get().updateBook(bookId, (book) => {
 const categories = book.resourceIndex?.customCharacterCategories || [];
 const nextCategories = categories.map((cat) => ({
 ...cat,
 children: cat.children.map((role) => (role.id === profile.id ? profile : role))
 }));
 return {
 ...book,
 resourceIndex: {
 ...book.resourceIndex!,
 customCharacterCategories: nextCategories
 },
 updatedAt: new Date().toISOString()
 };
 });
 },

 addOutlineNode: async (bookId, parentId, data) => {
 const book = get().books.find((b) => b.id === bookId);
 if (!book) return;
 const vision = book.outlineVision || { nodes: [], version: 1 };
 const X_STEP = 360;
 const Y_STEP = 200;

 const withPosition = (node: import('../types/ov').OutlineNode): import('../types/ov').OutlineNode => {
 if (data.position) return node;
 return {
 ...node,
 position: node.position || { x: 120, y: 120 }
 };
 };

 const createNode = (position: { x: number; y: number }): import('../types/ov').OutlineNode =>
 withPosition({
 id: crypto.randomUUID(),
 title: data.title || '新剧情点',
 type: data.type || 'event',
 targetWordCount: data.targetWordCount || 2000,
 actualWordCount: 0,
 ...data,
 position
 });

 const findById = (items: import('../types/ov').OutlineNode[], id: string): import('../types/ov').OutlineNode | null => {
 for (const item of items) {
 if (item.id === id) return item;
 const child = Array.isArray(item.children) ? findById(item.children, id) : null;
 if (child) return child;
 }
 return null;
 };

 const nextNodes = ensureMasterRoot(vision.nodes);
 const resolvedParentId =
 parentId ??
 nextNodes.find((node) => isMasterRootNode(node))?.id ??
 null;

 if (resolvedParentId === null) return;

 const parent = findById(nextNodes, resolvedParentId);
 const siblings = parent?.children || [];
 const lastSibling = siblings[siblings.length - 1];
 const parentX = parent?.position?.x ?? 120;
 const parentY = parent?.position?.y ?? 120;
 const position = lastSibling?.position
 ? { x: lastSibling.position.x, y: lastSibling.position.y + Y_STEP }
 : { x: parentX + X_STEP, y: parentY };

 const newNode = createNode(position);

 const insertChild = (
 items: import('../types/ov').OutlineNode[]
 ): { list: import('../types/ov').OutlineNode[]; inserted: boolean } => {
 let inserted = false;
 const list = items.map((item) => {
 if (item.id === resolvedParentId) {
 inserted = true;
 return {
 ...item,
 children: [...(item.children || []), newNode]
 };
 }
 if (Array.isArray(item.children) && item.children.length > 0) {
 const childResult = insertChild(item.children);
 if (childResult.inserted) {
 inserted = true;
 return { ...item, children: childResult.list };
 }
 }
 return item;
 });
 return { list, inserted };
 };

 const inserted = insertChild(nextNodes);
 await get().updateOutlineVision(bookId, { ...vision, nodes: inserted.inserted ? inserted.list : nextNodes });
 },

 deleteOutlineNode: async (bookId, nodeId) => {
 const book = get().books.find((b) => b.id === bookId);
 if (!book || !book.outlineVision) return;
 const targetRoot = book.outlineVision.nodes.find((node) => node.id === nodeId);
 if (targetRoot && isMasterRootNode(targetRoot)) return;
 // nodeId 
 const deleteDeep = (items: OutlineNode[]): OutlineNode[] => {
 return items
 .filter((item) => item.id !== nodeId)
 .map((item) => ({
 ...item,
 children: item.children ? deleteDeep(item.children) : undefined
 }));
 };
 const nextNodes = deleteDeep(book.outlineVision.nodes);
 await get().updateOutlineVision(bookId, { ...book.outlineVision, nodes: nextNodes });
 },

 updateOutlineNode: async (bookId, nodeId, data) => {
 const book = get().books.find((b) => b.id === bookId);
 if (!book || !book.outlineVision) return;
 // nodeId 
 const updateDeep = (items: OutlineNode[]): OutlineNode[] => {
 return items.map((item) => {
 if (item.id === nodeId) return { ...item, ...data };
 return {
 ...item,
 children: item.children ? updateDeep(item.children) : undefined
 };
 });
 };
 const nextNodes = updateDeep(book.outlineVision.nodes);
 await get().updateOutlineVision(bookId, { ...book.outlineVision, nodes: nextNodes });
 },

 importOutlineFromText: async (bookId, text) => {
 // Supports multiple outline text/json formats and falls back to resilient loose-json parsing.
 const book = get().books.find((b) => b.id === bookId);
 if (!book) return;
 const sourceText = String(text || '').trim();
 if (!sourceText) {
 throw new Error('导入内容为空，请上传有效文本');
 }

 const vision = book.outlineVision || { nodes: [], version: 0 };

 // 1) JSON /
 try {
 const parsed = parseJsonLoosely<unknown>(sourceText);
 const detectedNodes = normalizeImportedOutlineNodes(parsed, book.chapters.length);
 if (detectedNodes.length > 0) {
 await get().updateOutlineVision(bookId, {
 nodes: [...vision.nodes, ...detectedNodes],
 edges: vision.edges,
 version: vision.version + 1,
 lastSyncedAt: new Date().toISOString()
 });
 return;
 }
 } catch {
 // JSON AI 
 }

 const prompt = `
请分析以下细纲文本，并只输出严格 JSON（不要 Markdown，不要解释）。

核心规则（必须遵守）：
1. 按“剧情段”分组，而不是简单按单章拆分。
2. 每个剧情段覆盖 2-5 章，优先 3 章一段。
3. 不要把同一章节拆成多个 event 节点。
4. title 必须写出章节范围，例如：“第3-4章剧情推进”。
5. targetWordCount 按范围估算：每章约 3000 字。

返回格式（严格按此结构）：
[
 {
 "title": "第3-4章剧情推进",
 "type": "event",
 "targetWordCount": 9000,
 "conflict": "核心冲突与推进",
 "characters": ["角色A", "角色B"]
 }
]

细纲文本：
${sourceText.slice(0, 15000)}
`;

 const res = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 messages: [
 { role: 'system', content: '你是专业网文结构分析助手。仅返回合法 JSON。' },
 { role: 'user', content: prompt }
 ]
 });

 try {
 const parsed = parseJsonLoosely<unknown>(String(res?.text || '[]'));
 const detectedNodes = normalizeImportedOutlineNodes(parsed, book.chapters.length);
 if (detectedNodes.length === 0) {
 throw new Error('AI 未返回可识别的大纲结果');
 }
 await get().updateOutlineVision(bookId, {
 nodes: [...vision.nodes, ...detectedNodes],
 edges: vision.edges,
 version: vision.version + 1,
 lastSyncedAt: new Date().toISOString()
 });
 } catch (e) {
 console.error('Failed to parse AI outline:', e);
 throw new Error('导入失败：无法识别有效大纲，请检查文本后重试');
 }
 },

 addInspirationNote: (bookId, content) => {
 const text = content.trim();
 if (!text) return;
 const now = new Date().toISOString();
 let nextNotes: InspirationNote[] = [];
 set((state) => ({
 books: nextBooksById(state.books, bookId, (book) => {
 const notes = book.inspirationNotes ?? [];
 const maxOrder = notes.reduce((max, n) => Math.max(max, n.order ?? 0), 0);
 const newNote: InspirationNote = {
 id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
 ? crypto.randomUUID()
 : `note_${Date.now()}_${Math.random().toString(36).slice(2)}`,
 content: text,
 type: '未定',
 order: maxOrder + 1,
 createdAt: now,
 updatedAt: now,
 };
 nextNotes = [...notes, newNote];
 return { ...book, inspirationNotes: nextNotes, updatedAt: now };
 }),
 }));
 queueBookMetaPatch(bookId, { inspirationNotes: nextNotes, updatedAt: now });
	},

 updateInspirationNote: (bookId, noteId, updates) => {
 const now = new Date().toISOString();
 let nextNotes: InspirationNote[] = [];
 set((state) => ({
 books: nextBooksById(state.books, bookId, (book) => {
 nextNotes = (book.inspirationNotes ?? []).map((n) =>
 n.id === noteId ? { ...n, ...updates, updatedAt: now } : n
 );
 return { ...book, inspirationNotes: nextNotes, updatedAt: now };
 }),
 }));
 queueBookMetaPatch(bookId, { inspirationNotes: nextNotes, updatedAt: now });
	},

 deleteInspirationNote: (bookId, noteId) => {
 const now = new Date().toISOString();
 let nextNotes: InspirationNote[] = [];
 set((state) => ({
 books: nextBooksById(state.books, bookId, (book) => {
 nextNotes = (book.inspirationNotes ?? []).filter((n) => n.id !== noteId);
 return { ...book, inspirationNotes: nextNotes, updatedAt: now };
 }),
 }));
 queueBookMetaPatch(bookId, { inspirationNotes: nextNotes, updatedAt: now });
	},

 reorderInspirationNotes: (bookId, noteIds) => {
 const now = new Date().toISOString();
 let nextNotes: InspirationNote[] = [];
 set((state) => ({
 books: nextBooksById(state.books, bookId, (book) => {
 const orderMap = new Map<string, number>(noteIds.map((id: string, idx: number) => [id, idx + 1]));
 nextNotes = (book.inspirationNotes ?? []).map((n): InspirationNote =>
 orderMap.has(n.id) ? { ...n, order: Number(orderMap.get(n.id) || 0), updatedAt: now } : n
 );
 return { ...book, inspirationNotes: nextNotes, updatedAt: now };
 }),
 }));
 queueBookMetaPatch(bookId, { inspirationNotes: nextNotes, updatedAt: now });
		}
}));
