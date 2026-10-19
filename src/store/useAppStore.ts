// useAppStore 
import { useBookStore } from './useBookStore';
import { create } from 'zustand';

export type AppRoute = 'bookshelf' | 'editor';
type RestorableBook = { id: string; chapters?: Array<{ id: string }> };
type LastSessionSnapshot = {
 route: AppRoute;
 activeBookId?: string;
 activeChapterId?: string;
 activeEditorTabId?: string;
 editorTabs?: EditorTab[];
 updatedAt: number;
};
export type SearchJumpPositionKind = 'doc' | 'text';
export type PendingSearchJump = {
 chapterId: string;
 from: number;
 to: number;
 positionKind?: SearchJumpPositionKind;
 text?: string;
  before?: string;
  after?: string;
 /** 命中所在段落上下文（搜索时记录，用于跳转时精确匹配） */
 context?: string;
};
export type EditorTab = {
 id: string;
 bookId: string;
 chapterId?: string;
};

interface AppState {
 route: AppRoute;
 activeBookId?: string;
 activeChapterId?: string;
 editorTabs: EditorTab[];
 activeEditorTabId?: string;
 splitEditorTabId?: string;
 pendingSearchJump?: PendingSearchJump | null;
 /** 全书搜索结果（FindReplacePanel「搜索全书」产出，ChapterList 目录栏浮层消费） */
  bookSearchResults?: { search: string; items: Array<{ chapterId: string; chapterTitle: string; from: number; to: number; positionKind?: SearchJumpPositionKind; text: string; context: string; before?: string; after?: string }> } | null;
 outlineVisionOpen: boolean;
 outlineVisionJumpTargetId: string | null;
 focusMode: boolean;
 findReplaceOpen: boolean;
 setRoute: (route: AppRoute) => void;
 setOutlineVisionOpen: (open: boolean) => void;
 setOutlineVisionJumpTargetId: (id: string | null) => void;
 setFindReplaceOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setPendingSearchJump: (jump: PendingSearchJump | null) => void;
  setBookSearchResults: (results: AppState['bookSearchResults']) => void;
 openEditor: (bookId: string, chapterId?: string) => void;
 activateEditorTab: (tabId: string) => void;
 closeEditorTab: (tabId: string) => void;
 setSplitEditorTab: (tabId: string | null) => void;
 backToBookshelf: () => void;
 restoreLastSession: (books: RestorableBook[]) => boolean;
 toggleFocusMode: () => void;
}

const LAST_SESSION_KEY = 'xly:last-editor-session';

// 章节级标签页：标签 id = bookId::chapterId，同一本书的不同章节各占一个标签。
// 未指定章节时退化为 bookId，作为“已打开但尚未选章”的占位标签。
const MAX_EDITOR_TABS = 12;

export function makeEditorTabId(bookId: string, chapterId?: string): string {
 return chapterId ? `${bookId}::${chapterId}` : bookId;
}

// 上限保护：标签溢出时按从旧到新丢弃，但永不丢弃当前激活标签与分屏标签。
function pruneEditorTabs(tabs: EditorTab[], keepId: string, splitId?: string): EditorTab[] {
 if (tabs.length <= MAX_EDITOR_TABS) return tabs;
 const dropIds = new Set(
  tabs
   .filter((tab) => tab.id !== keepId && tab.id !== splitId)
   .slice(0, tabs.length - MAX_EDITOR_TABS)
   .map((tab) => tab.id)
 );
 return tabs.filter((tab) => !dropIds.has(tab.id));
}

function persistLastSession(snapshot: Omit<LastSessionSnapshot, 'updatedAt'>) {
 if (typeof window === 'undefined') return;
 try {
 window.localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ ...snapshot, updatedAt: Date.now() }));
 } catch {
 // localStorage can be unavailable in unusual webview states.
 }
}

function readLastSession(): LastSessionSnapshot | null {
 if (typeof window === 'undefined') return null;
 try {
 const raw = window.localStorage.getItem(LAST_SESSION_KEY);
 if (!raw) return null;
 const parsed = JSON.parse(raw) as Partial<LastSessionSnapshot>;
 if (parsed.route !== 'bookshelf' && parsed.route !== 'editor') return null;
 return {
 route: parsed.route,
 activeBookId: typeof parsed.activeBookId === 'string' ? parsed.activeBookId : undefined,
 activeChapterId: typeof parsed.activeChapterId === 'string' ? parsed.activeChapterId : undefined,
 activeEditorTabId: typeof parsed.activeEditorTabId === 'string' ? parsed.activeEditorTabId : undefined,
 editorTabs: Array.isArray(parsed.editorTabs)
 ? parsed.editorTabs
 .filter((tab): tab is EditorTab => Boolean(tab && typeof tab.id === 'string' && typeof tab.bookId === 'string'))
 .map((tab) => ({ id: tab.id, bookId: tab.bookId, chapterId: typeof tab.chapterId === 'string' ? tab.chapterId : undefined }))
 : undefined,
 updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
 };
 } catch {
 return null;
 }
}

export const useAppStore = create<AppState>((set) => ({
 route: 'bookshelf',
 editorTabs: [],
 outlineVisionOpen: false,
 outlineVisionJumpTargetId: null,
 focusMode: false,
 findReplaceOpen: false,
 setRoute: (route) => {
 persistLastSession({ route });
 set({ route });
 },
 setOutlineVisionOpen: (open) => set({ outlineVisionOpen: open }),
 setOutlineVisionJumpTargetId: (id) => set({ outlineVisionJumpTargetId: id }),
 setFindReplaceOpen: (open) => set((state) => ({ findReplaceOpen: typeof open === 'function' ? (open as (prev: boolean) => boolean)(state.findReplaceOpen) : open })),
  setPendingSearchJump: (jump) => set({ pendingSearchJump: jump }),
  setBookSearchResults: (results) => set({ bookSearchResults: results }),
 toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  openEditor: (bookId, chapterId) => {
 set((state) => {
 // 未显式指定章节时，沿用该书最近一个标签记住的章节
 const bookTabs = state.editorTabs.filter((tab) => tab.bookId === bookId);
 const nextChapterId = chapterId ?? bookTabs[bookTabs.length - 1]?.chapterId;
 const tabId = makeEditorTabId(bookId, nextChapterId);
 const existing = state.editorTabs.some((tab) => tab.id === tabId);
 const nextTab: EditorTab = { id: tabId, bookId, chapterId: nextChapterId };
 let editorTabs = existing
 ? state.editorTabs.map((tab) => (tab.id === tabId ? nextTab : tab))
 : [...state.editorTabs, nextTab];
 // 选定具体章节后，清掉该书遗留的“未选章”占位标签
 if (nextChapterId) {
 editorTabs = editorTabs.filter((tab) => tab.id === tabId || !(tab.bookId === bookId && !tab.chapterId));
 }
 editorTabs = pruneEditorTabs(editorTabs, tabId, state.splitEditorTabId);
 persistLastSession({
 route: 'editor',
 activeBookId: bookId,
 activeChapterId: nextChapterId,
 activeEditorTabId: tabId,
 editorTabs
 });
 return {
 route: 'editor',
 activeBookId: bookId,
 activeChapterId: nextChapterId,
 activeEditorTabId: tabId,
 editorTabs
 };
 });
 try {
 // 开书主动体检（P3）：面板可监听 writerzen:proactive-health
 // 通过动态取 store，避免循环依赖
 // eslint-disable-next-line @typescript-eslint/no-var-requires
 const book = useBookStore.getState().books.find((b) => b.id === bookId);
 if (book) {
 window.dispatchEvent(new CustomEvent('writerzen:book-opened', { detail: { book } }));
 }
 } catch { /* ignore */ }
 },
 activateEditorTab: (tabId) =>
 set((state) => {
 const tab = state.editorTabs.find((item) => item.id === tabId);
 if (!tab) return {};
 persistLastSession({
 route: 'editor',
 activeBookId: tab.bookId,
 activeChapterId: tab.chapterId,
 activeEditorTabId: tab.id,
 editorTabs: state.editorTabs
 });
 return {
 route: 'editor',
 activeEditorTabId: tab.id,
 activeBookId: tab.bookId,
 activeChapterId: tab.chapterId
 };
 }),
 closeEditorTab: (tabId) =>
 set((state) => {
 const index = state.editorTabs.findIndex((tab) => tab.id === tabId);
 if (index < 0) return {};
 const editorTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
 if (state.activeEditorTabId !== tabId) {
 persistLastSession({
 route: state.route,
 activeBookId: state.activeBookId,
 activeChapterId: state.activeChapterId,
 activeEditorTabId: state.activeEditorTabId,
 editorTabs
 });
 return {
 editorTabs,
 splitEditorTabId: state.splitEditorTabId === tabId ? undefined : state.splitEditorTabId
 };
 }
 const nextTab = editorTabs[Math.max(0, index - 1)] ?? editorTabs[0];
 if (!nextTab) {
 persistLastSession({ route: 'bookshelf' });
 return {
 route: 'bookshelf',
 activeBookId: undefined,
 activeChapterId: undefined,
 activeEditorTabId: undefined,
 splitEditorTabId: undefined,
 editorTabs
 };
 }
 persistLastSession({
 route: 'editor',
 activeBookId: nextTab.bookId,
 activeChapterId: nextTab.chapterId,
 activeEditorTabId: nextTab.id,
 editorTabs
 });
 return {
 route: 'editor',
 activeBookId: nextTab.bookId,
 activeChapterId: nextTab.chapterId,
 activeEditorTabId: nextTab.id,
 splitEditorTabId: state.splitEditorTabId === tabId ? undefined : state.splitEditorTabId,
 editorTabs
 };
 }),
 setSplitEditorTab: (tabId) =>
 set((state) => ({
 splitEditorTabId: tabId && state.editorTabs.some((tab) => tab.id === tabId) ? tabId : undefined
 })),
  backToBookshelf: () => {
  set((state) => {
  persistLastSession({
   route: 'bookshelf',
   editorTabs: state.editorTabs,
   activeBookId: state.activeBookId,
   activeChapterId: state.activeChapterId,
   activeEditorTabId: state.activeEditorTabId
  });
  return { route: 'bookshelf' };
  });
  },
  restoreLastSession: (books) => {
  const snapshot = readLastSession();
  if (!snapshot) return false;
  if (snapshot.route === 'bookshelf') {
   set({ route: 'bookshelf' });
   // 先恢复 editorTabs，用户点开书籍时能回到上次阅读的章节
   if (snapshot.editorTabs) {
    const validTabs = (snapshot.editorTabs || [])
     .filter((tab) => {
      const tabBook = books.find((item) => item.id === tab.bookId);
      if (!tabBook) return false;
      if (!tab.chapterId) return true;
      return (tabBook.chapters || []).some((chapter) => chapter.id === tab.chapterId);
     });
    const seenTabIds = new Set<string>();
    const normalizedTabs = validTabs
     .map((tab) => ({ id: makeEditorTabId(tab.bookId, tab.chapterId), bookId: tab.bookId, chapterId: tab.chapterId }))
     .filter((tab) => (seenTabIds.has(tab.id) ? false : (seenTabIds.add(tab.id), true)));
    set({ editorTabs: normalizedTabs });
   }
   return false;
  }
 const book = books.find((item) => item.id === snapshot.activeBookId);
 if (!book) return false;
 const chapters = Array.isArray(book.chapters) ? book.chapters : [];
 const chapterExists = snapshot.activeChapterId ? chapters.some((chapter) => chapter.id === snapshot.activeChapterId) : true;
 const activeChapterId = chapterExists ? snapshot.activeChapterId : chapters[chapters.length - 1]?.id;
 const validTabs = (snapshot.editorTabs || [])
 .filter((tab) => {
 const tabBook = books.find((item) => item.id === tab.bookId);
 if (!tabBook) return false;
 if (!tab.chapterId) return true;
 return (tabBook.chapters || []).some((chapter) => chapter.id === tab.chapterId);
 });
 // 旧快照里每本书只有一个标签（id === bookId），这里统一迁移成章节级标签 id 并去重
 const seenTabIds = new Set<string>();
 const normalizedTabs = validTabs
  .map((tab) => ({ id: makeEditorTabId(tab.bookId, tab.chapterId), bookId: tab.bookId, chapterId: tab.chapterId }))
  .filter((tab) => (seenTabIds.has(tab.id) ? false : (seenTabIds.add(tab.id), true)));
 const activeEditorTabId = makeEditorTabId(book.id, activeChapterId);
 const editorTabs = normalizedTabs.some((tab) => tab.id === activeEditorTabId)
 ? normalizedTabs
 : [...normalizedTabs, { id: activeEditorTabId, bookId: book.id, chapterId: activeChapterId }];
 set({
 route: 'editor',
 activeBookId: book.id,
 activeChapterId,
 activeEditorTabId,
 editorTabs
 });
 return true;
 }
}));
