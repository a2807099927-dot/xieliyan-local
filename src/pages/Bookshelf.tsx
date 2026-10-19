// Bookshelf.tsx - Bookshelf page for listing, importing, creating, editing, and deleting books.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useBookStore } from '../store/useBookStore';
import { useIslandStore } from '../store/useIslandStore';
import type { Book, Chapter, Volume } from '../types';
import { electronAPI } from '../utils/electron';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { buildDefaultChapterContent } from '../utils/chapterTemplate';
import { toAssetUrl } from '../utils/assetUrl';
import { IdeSvgLab, IdeSvgCompass, IdeSvgGlobe, IdeSvgKanban, IdeSvgChat, IdeSvgUsers } from '../components/common/IdeSvg';

function formatWordCountLabel(value: number): string {
 if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万字`;
 return `${value.toLocaleString('zh-CN')}字`;
}

function formatRelativeUpdate(iso: string): string {
 const ts = new Date(iso).getTime();
 if (!Number.isFinite(ts)) return '刚刚';
 const diff = Math.max(0, Date.now() - ts);
 const min = Math.floor(diff / 60000);
 if (min < 1) return '刚刚';
 if (min < 60) return `${min} 分钟前`;
 const hour = Math.floor(min / 60);
 if (hour < 24) return `${hour} 小时前`;
 const day = Math.floor(hour / 24);
 return `${day} 天前`;
}

function bookWords(book: Book): number {
 return book.chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0);
}

function createId(): string {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
 return crypto.randomUUID();
 }
 return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferBookTitleFromPath(filePath: string): string {
 const normalized = String(filePath || '').replace(/\\/g, '/');
 const base = normalized.split('/').pop() || '导入作品';
 return base.replace(/\.[^.]+$/, '') || '导入作品';
}

function latestChapterId(book: Book): string | undefined {
 if (!book.chapters.length) return undefined;
 return book.chapters[book.chapters.length - 1]?.id;
}

const QQ_GROUP_URL = 'https://qm.qq.com/q/LlZUAUnscu';

interface ToolItem {
  key: string;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: boolean;
}

function BookshelfTools() {
  const showIsland = useIslandStore((s) => s.show);
  const activeBookId = useAppStore((s) => s.activeBookId);
  const [aiWebOpen, setAiWebOpen] = useState(false);

  useEffect(() => {
    if (aiWebOpen) {
      const id = localStorage.getItem('xly_aiweb_active') || 'chatgpt';
      void electronAPI.system.aiwebOpen().then(() => electronAPI.system.aiwebShellAction?.(`switch:${id}`));
    } else {
      void electronAPI.system.aiwebHide();
    }
  }, [aiWebOpen]);
  useEffect(() => {
    const offAiweb = electronAPI.system.onAiwebHidden?.(() => setAiWebOpen(false));
    return () => { offAiweb?.(); };
  }, []);

  const openNovelLab = () => electronAPI.system.openNovelLabWindow().catch(() => showIsland({ type: 'error', message: '打开拆书神器失败', autoHideMs: 1800 }));
  const openBookSweeper = () => electronAPI.system.openBookSweeperWindow().catch(() => showIsland({ type: 'error', message: '打开网文风向标失败', autoHideMs: 1800 }));
  const openOutlineBoard = () => {
    if (!activeBookId) { showIsland({ type: 'warning', message: '请先在书架选一本作品，再打开大纲看板', autoHideMs: 2000 }); return; }
    electronAPI.system.openOutlineBoardWindow({ bookId: activeBookId }).catch(() => showIsland({ type: 'error', message: '打开大纲看板失败', autoHideMs: 1800 }));
  };

  const items: ToolItem[] = [
    { key: 'novellab', title: '拆书神器', icon: <IdeSvgLab size={18} />, onClick: openNovelLab },
    { key: 'booksweeper', title: '网文风向标', icon: <IdeSvgCompass size={18} />, onClick: openBookSweeper },
    { key: 'outline', title: '大纲看板', icon: <IdeSvgKanban size={18} />, onClick: openOutlineBoard },
    { key: 'aiweb', title: aiWebOpen ? '收起 AI 网页' : 'AI 网页', icon: <IdeSvgGlobe size={18} />, onClick: () => setAiWebOpen(v => !v), badge: aiWebOpen },
    { key: 'qq', title: 'QQ 交流群', icon: <IdeSvgChat size={17} />, onClick: () => window.open(QQ_GROUP_URL, '_blank', 'noopener,noreferrer') },
  ];

  const groups: { label: string; rows: ToolItem[] }[] = [
    { label: '工具', rows: items.slice(0, items.length - 1) },
    { label: '社区', rows: items.slice(items.length - 1) },
  ];

  return (
    <div className="mt-3 flex w-full flex-col gap-3">
      {groups.map(group => (
        <div key={group.label} className="flex flex-col gap-1">
          <div className="px-2.5 text-[10px] font-medium tracking-[0.16em] text-[var(--text-muted)]/70">{group.label}</div>
          <div className="flex flex-col gap-0.5">
            {group.rows.map(item => {
              const label = item.title.replace(/^收起/, '');
              return (
                <button
                  key={item.key}
                  type="button"
                  title={item.title}
                  onClick={item.onClick}
                  className="group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--text-secondary)] transition-[background,transform,color] duration-150 ease-out hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] hover:translate-x-0.5"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--text-muted)] transition-[background,color,transform] duration-150 ease-out group-hover:scale-105 group-hover:bg-[var(--accent)]/12 group-hover:text-[var(--accent)] ${item.badge ? 'ring-1 ring-[var(--accent)]/50' : ''}`}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  {item.badge ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_2px_var(--bg-secondary)]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Bookshelf() {
 const books = useBookStore((s) => s.books);
 const loading = useBookStore((s) => s.loading);
 const loadError = useBookStore((s) => s.error);
 const createBook = useBookStore((s) => s.createBook);
 const saveBook = useBookStore((s) => s.saveBook);
 const deleteBook = useBookStore((s) => s.deleteBook);
 const openEditor = useAppStore((s) => s.openEditor);
 const [newBookOpen, setNewBookOpen] = useState(false);
 const [newTitle, setNewTitle] = useState('新书1');
 const [newAuthor, setNewAuthor] = useState('佚名');
 const [creating, setCreating] = useState(false);
 const [createError, setCreateError] = useState('');
 const [importing, setImporting] = useState(false);
 const [importError, setImportError] = useState('');

 const [editingBook, setEditingBook] = useState<Book | null>(null);
 const [editTitle, setEditTitle] = useState('');
 const [editAuthor, setEditAuthor] = useState('');
 const [editDescription, setEditDescription] = useState('');
 const [editCover, setEditCover] = useState('');
 const [coverBusy, setCoverBusy] = useState(false);
 const [coverError, setCoverError] = useState('');
 const [savingEdit, setSavingEdit] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
 const [deleting, setDeleting] = useState(false);
 /** 书名旁三点菜单当前打开的书 id */
 const [menuBookId, setMenuBookId] = useState<string | null>(null);
 const menuRef = useRef<HTMLDivElement | null>(null);

 useEscapeKey(() => {
 if (menuBookId) setMenuBookId(null);
 else if (newBookOpen) setNewBookOpen(false);
 else if (editingBook) setEditingBook(null);
 else if (deleteTarget) setDeleteTarget(null);
 }, Boolean(menuBookId) || newBookOpen || Boolean(editingBook) || Boolean(deleteTarget));

 useEffect(() => {
 if (!menuBookId) return;
 const onDown = (e: MouseEvent) => {
 const el = menuRef.current;
 if (el && !el.contains(e.target as Node)) setMenuBookId(null);
 };
 document.addEventListener('mousedown', onDown);
 return () => document.removeEventListener('mousedown', onDown);
 }, [menuBookId]);

 const filtered = books;

 const handleCreateBook = async () => {
 if (creating) return;
 setCreating(true);
 setCreateError('');
 try {
 const book = await createBook(newTitle.trim() || '新书', newAuthor.trim() || '佚名');
 setNewBookOpen(false);
 openEditor(book.id, latestChapterId(book));
 } catch (error) {
 setCreateError(error instanceof Error ? error.message : String(error));
 } finally {
 setCreating(false);
 }
 };

 const handleImportBook = async () => {
 if (importing) return;
 setImporting(true);
 setImportError('');
 try {
 const selected = await electronAPI.fs.selectFile({
 title: '导入作品',
 filters: [
 { name: '常用作品文件', extensions: ['txt', 'docx', 'md', 'markdown'] },
 { name: 'Word 文档', extensions: ['docx'] },
 { name: '文本文件', extensions: ['txt'] },
 { name: 'Markdown', extensions: ['md', 'markdown'] },
 { name: '所有文件', extensions: ['*'] }
 ]
 });
 const filePath = selected?.path;
 if (!filePath) return;

 const imported = await electronAPI.fs.importTxt({ filePath });
 const now = new Date().toISOString();
 const rawChapters = Array.isArray(imported?.chapters) ? (imported.chapters as Chapter[]) : [];
 const rawVolumes = Array.isArray(imported?.volumes) ? (imported.volumes as Volume[]) : [];

 const chapters: Chapter[] =
 rawChapters.length > 0
 ? rawChapters.map((chapter, index) => ({
 id: chapter?.id || createId(),
 title: chapter?.title?.trim() || `第${index + 1}章`,
 content:
 typeof chapter?.content === 'string'
 ? chapter.content
 : buildDefaultChapterContent(chapter?.title?.trim() || `第${index + 1}章`),
 wordCount: Number.isFinite(chapter?.wordCount)
 ? Number(chapter.wordCount)
 : String(chapter?.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length,
 createdAt: chapter?.createdAt || now,
 updatedAt: chapter?.updatedAt || now
 }))
 : [
 {
 id: createId(),
 title: '第1章',
 content: buildDefaultChapterContent('第1章'),
 wordCount: 0,
 createdAt: now,
 updatedAt: now
 }
 ];

 const chapterIdSet = new Set(chapters.map((chapter) => chapter.id));
 const volumes: Volume[] = rawVolumes
 .map((volume, index) => ({
 id: volume?.id || createId(),
 title: volume?.title?.trim() || `第${index + 1}卷`,
 startChapterId: chapterIdSet.has(String(volume?.startChapterId || '')) ? String(volume?.startChapterId) : undefined,
 chapters: []
 }))
 .filter((volume) => Boolean(volume.startChapterId));

 const book: Book = {
 id: createId(),
 title: inferBookTitleFromPath(filePath),
 author: '佚名',
 chapters,
 volumes,
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

 await saveBook(book, { reload: true });
 openEditor(book.id, latestChapterId(book));
 } catch (error) {
 setImportError(error instanceof Error ? error.message : String(error));
 } finally {
 setImporting(false);
 }
 };

 const startEditBook = (book: Book) => {
 setEditingBook(book);
 setEditTitle(book.title || '');
 setEditAuthor(book.author || '');
 setEditDescription(book.description || '');
 setEditCover(book.cover || '');
 setCoverError('');
 };

 const handlePickCover = async () => {
 if (!editingBook || coverBusy) return;
 setCoverBusy(true);
 setCoverError('');
 try {
 const selected = await electronAPI.fs.selectFile({
 title: '选择作品封面',
 filters: [
 { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
 { name: '所有文件', extensions: ['*'] }
 ]
 });
 if (!selected?.path) return;
 const importBookCover = electronAPI.fs.importBookCover;
 if (typeof importBookCover !== 'function') {
 throw new Error('封面导入接口尚未加载，请重启应用后再试');
 }
 const result = await importBookCover({ bookId: editingBook.id, sourcePath: selected.path });
 setEditCover(result.path);
 } catch (error) {
 setCoverError(error instanceof Error ? error.message : String(error));
 } finally {
 setCoverBusy(false);
 }
 };

 const handleSaveEdit = async () => {
 if (!editingBook || savingEdit) return;
 setSavingEdit(true);
 try {
 await saveBook(
 {
 ...editingBook,
 title: editTitle.trim() || editingBook.title,
 author: editAuthor.trim(),
 cover: editCover.trim() || undefined,
 description: editDescription.trim(),
 updatedAt: new Date().toISOString()
 },
 { reload: true }
 );
 setEditingBook(null);
 } finally {
 setSavingEdit(false);
 }
 };

 const handleConfirmDelete = async () => {
 if (!deleteTarget || deleting) return;
 setDeleting(true);
 try {
 await deleteBook(deleteTarget.id);
 setDeleteTarget(null);
 } finally {
 setDeleting(false);
 }
 };

 return (
 <div className="flex h-full w-full overflow-hidden">
 {/* 左侧用户栏 */}
 <aside className="flex w-[176px] shrink-0 flex-col items-center justify-start bg-[var(--bg-secondary)] px-3 pt-6 pb-5">
 <BookshelfTools />
 </aside>
 {/* 右侧主内容 */}
 <div className="h-full flex-1 overflow-auto px-8 py-7">
 <div className="mx-auto max-w-[1320px]">
 <div className="mb-6 flex items-end justify-between gap-4">
 <div className="flex flex-col">
 <h1
 className="select-none text-6xl font-light leading-tight tracking-[0.22em] text-[var(--text-primary)]"
 style={{ fontFamily: 'var(--font-title)' }}
 >
 书架
 </h1>
 <p
 className="mt-2 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-[var(--text-muted)]"
 style={{ fontFamily: 'var(--font-display)' }}
 >
 IMMERSIVE <span className="h-[1px] w-6 bg-[var(--border-color)]"/> CREATION
 </p>
 </div>
 <div className="flex items-center gap-3">
 <button
 className="inline-flex h-11 items-center gap-2 border border-[var(--border-color)] bg-[var(--surface)] px-6 text-sm font-medium tracking-wider text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-60"
 style={{ fontFamily: 'var(--font-display)' }}
 onClick={() => void handleImportBook()}
 disabled={importing}
 >
 {importing ? '导入中...' : '导入作品'}
 </button>
 <button
 className="inline-flex h-11 items-center gap-2 bg-[var(--dz-primary)] px-6 text-sm font-semibold tracking-wider text-white shadow-lg shadow-indigo-500/10 transition hover:bg-[var(--dz-primary-strong)] hover:shadow-indigo-500/20"
 style={{ fontFamily: 'var(--font-display)' }}
 onClick={() => setNewBookOpen(true)}
 >
 <span className="text-lg">+</span> 新建作品
 </button>
 </div>
 </div>

 {importError ? (
 <div className="mb-5 border border-red-300/35 bg-red-500/15 px-3 py-2 text-sm text-red-200">导入失败：{importError}</div>
 ) : null}

 {loadError ? (
 <div className="mb-5 border border-red-300/35 bg-red-500/15 px-3 py-2 text-sm text-red-200">书架加载失败：{loadError}</div>
 ) : null}

 {loading ? (
 <div className="wz-crystal flex min-h-[220px] items-center justify-center border border-white/10 px-6 text-sm tracking-[0.18em] text-white/70">
 正在加载书架...
 </div>
 ) : filtered.length === 0 ? (
 <div className="wz-crystal flex min-h-[260px] flex-col items-center justify-center border border-white/10 px-6 text-center">
 <div className="text-xl font-light tracking-[0.16em] text-white/80">
 {books.length === 0 ? '暂无作品' : '没有匹配的作品'}
 </div>
 <div className="mt-3 text-sm tracking-[0.08em] text-white/45">
 {books.length === 0 ? '可以导入已有作品，或新建一本开始写。' : '换个关键词试试。'}
 </div>
 </div>
 ) : (

 <div className="grid auto-rows-[320px] grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5">
 {filtered.map((book) => {
 const total = bookWords(book);
 return (
 <article key={book.id} className="wz-book-perspective group">
            <div
              className="wz-book-3d-card relative h-full w-full"
              onClick={() => openEditor(book.id, undefined)}
            >
              {/* Inside Layer (内页：当封面旋转翻开时露出的作品信息) */}
              <div className="wz-book-inside">
                <div className="wz-book-inside-content flex flex-col justify-between h-full p-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] tracking-[0.1em] uppercase font-bold">Inside Pages</span>
                    <h4 className="text-base font-bold line-clamp-2 text-[var(--text-primary)] mt-1" style={{ fontFamily: 'var(--font-title)' }}>
                      {book.title}
                    </h4>
                    <p className="text-[12px] text-[var(--text-muted)] line-clamp-4 leading-relaxed mt-1.5">
                      {book.description || '暂无作品简介。可以在右侧菜单进入“书籍信息”添加简介与大纲设定。'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border-color)] pt-2">
                      最新章节: {book.chapters.length > 0 ? (
                        <span className="text-[var(--text-primary)] font-medium line-clamp-1 mt-0.5">
                          {book.chapters[book.chapters.length - 1].title}
                        </span>
                      ) : <span className="text-[var(--text-muted)]">暂无章节</span>}
                    </div>
                    <button 
                      type="button" 
                      className="w-full py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-semibold rounded-md shadow transition-colors flex items-center justify-center gap-1"
                    >
                      开始写作
                    </button>
                  </div>
                </div>
              </div>

              {/* Front Layer (书封面层) */}
              <div className="wz-book-front">
                {book.cover ? (
                  <img src={toAssetUrl(book.cover)} alt={book.title} className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="wz-book-cover-placeholder">
                    <span className="line-clamp-3 text-2xl font-light tracking-[0.18em]" style={{ fontFamily: 'var(--font-title)' }}>
                      {book.title}
                    </span>
                  </div>
                )}
                
                {/* 3D 书脊阴影与光效 overlay */}
                <div className="wz-book-spine-overlay" />
                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-18px_34px_rgba(0,0,0,0.42)]"/>

                <div className="wz-book-card-badge absolute bottom-3 right-3 px-2 py-1 text-[11px] ">
                  活跃于 {formatRelativeUpdate(book.updatedAt)} · {formatWordCountLabel(total)}
                </div>
              </div>

              {/* Pages Thickness Layer (3D 右侧书页厚度质感) */}
              <div className="wz-book-pages-thickness" />
            </div>


 <div className="mt-4 px-2">
 <div className="flex items-start gap-1">
 <h3
 className="min-w-0 flex-1 line-clamp-1 text-[17px] font-medium tracking-[0.02em] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]"
 style={{ fontFamily: 'var(--font-title)' }}
 title={book.title}
 >
 {book.title}
 </h3>
 <div
 className="relative shrink-0"
 ref={menuBookId === book.id ? menuRef : undefined}
 >
 <button
 type="button"
 className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] opacity-60 transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] hover:opacity-100 group-hover:opacity-100"
 title="更多操作"
 aria-label="更多操作"
 aria-expanded={menuBookId === book.id}
 onClick={(e) => {
 e.stopPropagation();
 setMenuBookId((id) => (id === book.id ? null : book.id));
 }}
 >
 <span className="flex flex-row items-center justify-center gap-[3px]" aria-hidden>
 <span className="block h-[3px] w-[3px] rounded-full bg-current" />
 <span className="block h-[3px] w-[3px] rounded-full bg-current" />
 <span className="block h-[3px] w-[3px] rounded-full bg-current" />
 </span>
 </button>
 {menuBookId === book.id ? (
 <div
 className="absolute right-0 top-full z-30 mt-1 min-w-[132px] overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] py-1 shadow-lg shadow-black/20"
 role="menu"
 onClick={(e) => e.stopPropagation()}
 >
 <button
 type="button"
 role="menuitem"
 className="flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
 onClick={() => {
 setMenuBookId(null);
 openEditor(book.id, latestChapterId(book));
 }}
 >
 打开编辑
 </button>
 <button
 type="button"
 role="menuitem"
 className="flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
 onClick={() => {
 setMenuBookId(null);
 startEditBook(book);
 }}
 >
 书籍信息
 </button>
 <div className="my-1 border-t border-[var(--border-color)]" />
 <button
 type="button"
 role="menuitem"
 className="flex w-full items-center px-3 py-2 text-left text-[13px] text-rose-500 transition hover:bg-rose-500/10"
 onClick={() => {
 setMenuBookId(null);
 setDeleteTarget(book);
 }}
 >
 删除作品
 </button>
 </div>
 ) : null}
 </div>
 </div>
 <div className="mt-1.5 flex items-center justify-between gap-2">
 <span
 className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]"
 style={{ fontFamily: 'var(--font-display)' }}
 >
 {book.author || '佚名'}
 </span>
 <span className="text-[10px] font-bold tracking-tight text-[var(--accent)]/60" style={{ fontFamily: 'var(--font-display)' }}>
 {formatWordCountLabel(total)}
 </span>
 </div>
 </div>
 </article>
 );
 })}
 </div>
 )}
 </div>

 {newBookOpen ? (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 ">
 <div className="wz-modal-enter wz-modal-glass w-[580px] max-w-full border border-[var(--border-color)] p-6">
 <h2 className="mb-2 border-b border-[var(--border-color)] pb-2 text-2xl font-normal tracking-wider text-[var(--text-primary)]"style={{ fontFamily: 'var(--font-title)' }}>
 新建作品
 </h2>
 <div className="mt-4 grid gap-3">
 <input
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
 placeholder="书名"
 value={newTitle}
 onChange={(e) => setNewTitle(e.target.value)}
 />
 <input
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
 placeholder="作者"
 value={newAuthor}
 onChange={(e) => setNewAuthor(e.target.value)}
 />
 {createError ? <div className="text-sm text-rose-300">{createError}</div> : null}
 </div>
 <div className="mt-5 flex justify-end gap-2">
 <button className="border border-[var(--border-color)] px-4 py-2 text-sm"onClick={() => setNewBookOpen(false)} disabled={creating}>
 取消
 </button>
 <button className="bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"onClick={() => void handleCreateBook()} disabled={creating}>
 {creating ? '创建中...' : '确认创建'}
 </button>
 </div>
 </div>
 </div>
 ) : null}

 {editingBook ? (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 ">
 <div className="wz-modal-enter wz-modal-glass w-[620px] max-w-full border border-[var(--border-color)] p-6">
 <h2 className="text-2xl font-bold text-[var(--text-primary)]">书籍信息</h2>
 <div className="mt-4 grid grid-cols-[150px_1fr] gap-4">
 <div>
 <div className="aspect-[3/4] overflow-hidden border border-[var(--border-color)] bg-[var(--surface)]">
 {editCover ? (
 <img src={toAssetUrl(editCover)} alt="作品封面"className="h-full w-full object-cover"draggable={false} />
 ) : (
 <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">暂无封面</div>
 )}
 </div>
 <div className="mt-3 grid gap-2">
 <button
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-strong)] disabled:opacity-60"
 onClick={() => void handlePickCover()}
 disabled={coverBusy}
 >
 {coverBusy ? '导入中...' : '选择封面'}
 </button>
 <button
 className="border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text-primary)] disabled:opacity-40"
 onClick={() => setEditCover('')}
 disabled={coverBusy || !editCover}
 >
 移除封面
 </button>
 </div>
 {coverError ? <div className="mt-2 text-xs text-rose-300">{coverError}</div> : null}
 </div>
 <div className="grid gap-3">
 <input
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
 placeholder="书名"
 value={editTitle}
 onChange={(e) => setEditTitle(e.target.value)}
 />
 <input
 className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
 placeholder="作者"
 value={editAuthor}
 onChange={(e) => setEditAuthor(e.target.value)}
 />
 <textarea
 className="min-h-40 border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)]"
 placeholder="简介"
 value={editDescription}
 onChange={(e) => setEditDescription(e.target.value)}
 />
 </div>
 </div>
 <div className="mt-5 flex justify-end gap-2">
 <button className="border border-[var(--border-color)] px-4 py-2 text-sm"onClick={() => setEditingBook(null)} disabled={savingEdit}>
 取消
 </button>
 <button className="bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"onClick={() => void handleSaveEdit()} disabled={savingEdit}>
 {savingEdit ? '保存中...' : '保存'}
 </button>
 </div>
 </div>
 </div>
 ) : null}

 {deleteTarget ? (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 ">
 <div className="wz-modal-enter wz-modal-glass w-[520px] max-w-full border border-[var(--border-color)] p-6">
 <h3 className="mb-2 text-xl font-normal tracking-wider text-[var(--text-primary)]"style={{ fontFamily: 'var(--font-title)' }}>
 确认删除作品
 </h3>
 <p className="mt-3 text-sm text-[var(--text-secondary)]">将删除《{deleteTarget.title}》及其全部章节，此操作不可撤销。</p>
 <div className="mt-5 flex justify-end gap-2">
 <button className="border border-[var(--border-color)] px-4 py-2 text-sm"onClick={() => setDeleteTarget(null)} disabled={deleting}>
 取消
 </button>
 <button className="bg-rose-500 px-4 py-2 text-sm font-semibold text-white"onClick={() => void handleConfirmDelete()} disabled={deleting}>
 {deleting ? '删除中...' : '确认删除'}
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 </div>
 );
}
