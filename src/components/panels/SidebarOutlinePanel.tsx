import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Book, Chapter } from '../../types';
import type { OutlineSubItem } from '../../types/ov';
import { useBookStore } from '../../store/useBookStore';
import { useDebounce } from '../../hooks/useDebounce';
import clsx from 'clsx';
import { exportSettings, importSettingsFromFile } from '../../utils/dataPortability';

// 设定库面板（主从布局）：右侧文件夹树 + 条目列表，左侧详情编辑区。
// 交互对齐角色档案：新建▼下拉、文件夹/条目右键菜单、拖拽移动。
// 数据源：book.outlineVision.masterOutline.settingsItems（条目附加可选 folder 字段，向后兼容）。

type SettingItem = OutlineSubItem & { folder?: string };

const DEFAULT_FOLDER = '背景设定';

interface SidebarOutlinePanelProps {
  book: Book;
  chapter?: Chapter;
}

type ContextMenuState =
  | { type: 'folder'; targetId: string; x: number; y: number }
  | { type: 'item'; targetId: string; targetName: string; x: number; y: number }
  | null;

function makeId(): string {
  return 'set_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function SidebarOutlinePanel({ book }: SidebarOutlinePanelProps) {
  const updateOutlineVision = useBookStore(s => s.updateOutlineVision);

  const items = useMemo<SettingItem[]>(
    () => ((book.outlineVision?.masterOutline?.settingsItems ?? []) as SettingItem[]),
    [book.outlineVision?.masterOutline?.settingsItems]
  );

  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [ioMenu, setIoMenu] = useState<'all' | null>(null);
  
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!folderDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [folderDropdownOpen]);

  type DialogState = {
    isOpen: boolean;
    title: string;
    message?: string;
    defaultValue?: string;
    isPrompt: boolean;
    onConfirm: (val?: string) => void;
  };
  const [dialog, setDialog] = useState<DialogState>({ isOpen: false, title: '', isPrompt: false, onConfirm: () => {} });

  const customPrompt = useCallback((title: string, defaultValue: string = '', onConfirm: (val: string) => void) => {
    setDialog({ isOpen: true, title, defaultValue, isPrompt: true, onConfirm: (val) => val !== undefined && onConfirm(val) });
  }, []);
  
  const customConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setDialog({ isOpen: true, title, message, isPrompt: false, onConfirm });
  }, []);

  const customAlert = useCallback((title: string, message: string) => {
    setDialog({ isOpen: true, title, message, isPrompt: false, onConfirm: () => {} });
  }, []);

  const folders = useMemo(() => {
    const set: string[] = [];
    for (const it of items) {
      const f = it.folder || DEFAULT_FOLDER;
      if (!set.includes(f)) set.push(f);
    }
    for (const f of extraFolders) if (!set.includes(f)) set.push(f);
    if (set.length === 0) set.push(DEFAULT_FOLDER);
    return set;
  }, [items, extraFolders]);

  useEffect(() => {
    if (selectedId && items.some(i => i.id === selectedId)) return;
    setSelectedId(items[0]?.id ?? null);
  }, [items, selectedId]);

  const selected = items.find(i => i.id === selectedId) || null;

  const persist = useCallback((nextItems: SettingItem[]) => {
    const vision = book.outlineVision ?? { nodes: [], version: 1 };
    const master = book.outlineVision?.masterOutline ?? {};
    void updateOutlineVision(
      book.id,
      { ...vision, masterOutline: { ...master, settingsItems: nextItems as unknown as OutlineSubItem[] } },
      { persist: true }
    );
  }, [book.id, book.outlineVision, updateOutlineVision]);

  // 详情草稿 + 防抖保存
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  useEffect(() => {
    setDraftTitle(selected?.title ?? '');
    setDraftContent(selected?.content ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const dTitle = useDebounce(draftTitle, 400);
  const dContent = useDebounce(draftContent, 400);
  useEffect(() => {
    if (!selected) return;
    if (dTitle === selected.title && dContent === selected.content) return;
    persist(items.map(i => (i.id === selected.id ? { ...i, title: dTitle, content: dContent } : i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dTitle, dContent]);

  // ── 操作 ─────────────────────────────────────────────────────────
  const handleExportSettings = async (format: 'json' | 'txt') => {
    try {
      const res = await exportSettings(book, format);
      if (res === 'saved') customAlert('导出成功', `已导出大纲与设定（${format.toUpperCase()}）。`);
    } catch (error) {
      customAlert('导出失败', error instanceof Error ? error.message : String(error));
    }
  };

  const handleImportSettings = async (format: 'json' | 'txt') => {
    try {
      const res = await importSettingsFromFile(book, format);
      if (res.cancelled) return;
      persist(res.items as SettingItem[]);
      customAlert('导入完成', `成功导入 ${res.stats.added} 条设定。`);
    } catch (error) {
      customAlert('导入失败', error instanceof Error ? error.message : String(error));
    }
  };

  const createItem = (folder?: string) => {
    const id = makeId();
    const target = folder || selected?.folder || folders[0] || DEFAULT_FOLDER;
    persist([...items, { id, title: '新设定', content: '', folder: target }]);
    setExtraFolders(f => f.filter(x => x !== target));
    setSelectedId(id);
  };

  const deleteItem = (id: string) => {
    customConfirm('删除设定', '确定删除这条设定吗？', () => {
      persist(items.filter(i => i.id !== id));
    });
  };

  const renameItem = (id: string) => {
    const cur = items.find(i => i.id === id);
    customPrompt('重命名设定', cur?.title || '', (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist(items.map(i => (i.id === id ? { ...i, title: trimmed } : i)));
    });
  };

  const moveItem = (id: string, folder: string) => {
    persist(items.map(i => (i.id === id ? { ...i, folder } : i)));
    setExtraFolders(f => f.filter(x => x !== folder));
  };

  const addFolder = () => {
    customPrompt('新建文件夹名称', '', (name) => {
      const trimmed = name.trim();
      if (!trimmed || folders.includes(trimmed)) return;
      setExtraFolders(f => [...f, trimmed]);
      setCollapsed(c => { const n = new Set(c); n.delete(trimmed); return n; });
    });
  };

  const renameFolder = (oldName: string) => {
    customPrompt(`重命名文件夹 “${oldName}”`, oldName, (name) => {
      const trimmed = name.trim();
      if (!trimmed || trimmed === oldName || folders.includes(trimmed)) return;
      persist(items.map(i => ((i.folder || DEFAULT_FOLDER) === oldName ? { ...i, folder: trimmed } : i)));
      setExtraFolders(f => f.map(x => (x === oldName ? trimmed : x)));
    });
  };

  const deleteFolder = (name: string) => {
    const count = items.filter(i => (i.folder || DEFAULT_FOLDER) === name).length;

    const msg = count > 0 ? `确定删除文件夹 “${name}” 及其包含的 ${count} 条设定吗？\n此操作不可恢复。` : `确定删除文件夹 “${name}” 吗？`;
    customConfirm('删除文件夹', msg, () => {
      if (count > 0) {
        persist(items.filter(i => (i.folder || DEFAULT_FOLDER) !== name));
      }
      setExtraFolders(f => f.filter(x => x !== name));
    });
  };

  const toggleFolder = (name: string) => {
    setCollapsed(c => { const n = new Set(c); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const q = search.trim().toLowerCase();
  const matches = (it: SettingItem) =>
    !q || it.title.toLowerCase().includes(q) || it.content.toLowerCase().includes(q);

  return (
    <div className="flex h-full w-full bg-[var(--bg-primary)]">
      {/* ── 左侧：详情编辑区 ────────────────────────────────────────── */}
      <div className="flex flex-1 min-w-0 flex-col border-r border-[var(--border-color)]">
        {selected ? (
          <>
            <div className="flex items-center gap-2 px-4 pt-4">
              <input
                className="flex-1 min-w-0 bg-transparent text-[22px] font-medium text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                placeholder="设定名称"
              />
              <button
                className="shrink-0 text-[var(--text-muted)] hover:text-rose-400 transition-colors"
                onClick={() => deleteItem(selected.id)}
                title="删除该设定"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>

            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="relative" ref={folderDropdownRef}>
                <button
                  type="button"
                  onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
                  className="flex items-center gap-1.5 rounded border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] active:scale-95 transition-all select-none cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-[#2d73ff]" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  <span className="max-w-[120px] truncate text-xs font-medium">
                    {selected.folder || DEFAULT_FOLDER}
                  </span>
                  <svg 
                    className={clsx(
                      "ml-0.5 h-3 w-3 shrink-0 text-zinc-400 transition-transform duration-200",
                      folderDropdownOpen && "rotate-180"
                    )} 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {folderDropdownOpen && (
                  <div className="absolute left-0 z-50 mt-1 w-[200px] overflow-hidden rounded border border-[var(--border-color)] bg-[var(--surface-strong)] py-1 shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                    {folders.map(f => {
                      const isSel = (selected.folder || DEFAULT_FOLDER) === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            moveItem(selected.id, f);
                            setFolderDropdownOpen(false);
                          }}
                          className={clsx(
                            "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-all duration-150 hover:bg-[var(--surface-hover)]",
                            isSel ? "text-[#2d73ff] bg-[#2d73ff]/[0.06] font-semibold" : "text-[var(--text-secondary)]"
                          )}
                        >
                          <span className="truncate pr-2">{f}</span>
                          {isSel && (
                            <svg className="h-3 w-3 shrink-0 text-[#2d73ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                    
                    <div className="my-1 border-t border-[var(--border-color)]" />
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFolderDropdownOpen(false);
                        customPrompt('新建文件夹名称', '', (name) => {
                          const trimmed = name.trim();
                          if (trimmed) moveItem(selected.id, trimmed);
                        });
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[#2d73ff] font-medium transition-all duration-150 hover:bg-[#2d73ff]/[0.08]"
                    >
                      <span className="text-xs font-bold">＋</span>
                      <span>新建文件夹…</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => persist(items.map(i => (i.id === selected.id ? { ...i, title: draftTitle, content: draftContent } : i)))}
                className="inline-flex shrink-0 items-center gap-1.5 rounded border border-[#2d73ff]/30 bg-[#2d73ff] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 active:bg-blue-700"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-8H7v8" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 3v5h8" /></svg>
                保存
              </button>
            </div>

            <div className="flex items-center gap-6 px-4 mt-2 border-b border-[var(--border-color)]">
              <button className="pb-2 text-[15px] font-bold border-b-[3px] transition-colors border-[#3b82f6] text-[#3b82f6]">
                设定
              </button>
            </div>

            <div className="flex-1 min-h-0 p-4">
              <textarea
                className="h-full w-full resize-none rounded border border-[var(--border-color)] bg-[var(--surface)] p-3 text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all custom-scrollbar"
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                placeholder="请输入，选中文字设置格式"
              />
            </div>

            <div className="px-3 pb-2 text-right shrink-0">
              <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-60">{draftContent.length} 字符</span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-[var(--text-muted)] opacity-40"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              <p className="text-xs text-[var(--text-muted)]">从右侧选择或新建一条设定</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 右侧：文件夹树 + 条目列表 ────────────────────────────── */}
      <div className="flex w-[160px] shrink-0 flex-col bg-[var(--bg-secondary)]">
        {/* 搜索与导入导出 */}
        <div className="px-2 pt-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="w-full rounded bg-white/60 dark:bg-black/20 border border-black/10 dark:border-white/10 pl-8 pr-3 py-1.5 text-xs text-[#374151] dark:text-gray-200 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-[#2d73ff]"
                placeholder="设定"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="relative shrink-0 flex items-center gap-0.5">
              <button
                onClick={() => setIoMenu((m) => (m === 'all' ? null : 'all'))}
                className="rounded border border-black/10 dark:border-white/10 p-1 text-[#4b5563] dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center shadow-sm bg-white dark:bg-zinc-800"
                title="导入/导出"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </button>
              {ioMenu === 'all' && (
                <>
                  <div className="fixed inset-0 z-[1000]" onClick={() => setIoMenu(null)} />
                  <div className="absolute right-0 top-full mt-1 w-max min-w-[7rem] rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 p-1 shadow-lg z-[1001]">
                    <div className="px-2 py-1 text-[10px] text-gray-400 font-bold select-none">导入</div>
                    <button onClick={() => { setIoMenu(null); void handleImportSettings('json'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-[#374151] dark:text-gray-200">JSON 文件</button>
                    <button onClick={() => { setIoMenu(null); void handleImportSettings('txt'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-[#374151] dark:text-gray-200">TXT 文件</button>
                    <div className="border-t border-black/5 dark:border-white/5 my-1" />
                    <div className="px-2 py-1 text-[10px] text-gray-400 font-bold select-none">导出</div>
                    <button onClick={() => { setIoMenu(null); void handleExportSettings('json'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-[#374151] dark:text-gray-200">JSON 文件</button>
                    <button onClick={() => { setIoMenu(null); void handleExportSettings('txt'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-[#374151] dark:text-gray-200">TXT 文件</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 新建 ▼ 下拉 */}
        <div className="relative px-2 pt-2 pb-1">
          <button
            onClick={e => { e.stopPropagation(); setShowNewMenu(v => !v); }}
            className="w-full rounded bg-[#2d73ff] py-1.5 text-xs font-bold text-white hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-1 cursor-pointer select-none"
          >
            新建 <span className="text-[9px] translate-y-[0.5px]">▼</span>
          </button>
          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-[1000]" onClick={() => setShowNewMenu(false)} />
              <div className="absolute left-2 right-2 top-full mt-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] p-1 shadow-2xl z-[1001]">
                <button
                  onClick={() => { createItem(); setShowNewMenu(false); }}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer"
                >新建设定</button>
                <button
                  onClick={() => { setShowNewMenu(false); addFolder(); }}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-md transition-colors cursor-pointer"
                >新建文件夹</button>
              </div>
            </>
          )}
        </div>

        {/* 列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 pb-2">
          {folders.map(folder => {
            const folderItems = items.filter(i => (i.folder || DEFAULT_FOLDER) === folder && matches(i));
            if (q && folderItems.length === 0) return null;
            const isCollapsed = collapsed.has(folder) && !q;
            const isDragTarget = dragOverFolder === folder;
            return (
              <div
                key={folder}
                className="mb-1"
                onDragOver={e => { e.preventDefault(); if (dragOverFolder !== folder) setDragOverFolder(folder); }}
                onDragLeave={() => setDragOverFolder(prev => (prev === folder ? null : prev))}
                onDrop={e => { e.preventDefault(); setDragOverFolder(null); if (dragItemId) moveItem(dragItemId, folder); setDragItemId(null); }}
              >
                <button
                  className={clsx(
                    'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[13px] font-medium transition-all',
                    isDragTarget ? 'bg-[#dbeafe] text-[#1d4ed8] ring-1 ring-[#2d73ff]/60 shadow-sm dark:bg-[#1d4ed8]/25 dark:text-blue-200' : 'text-[#4b5563] dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                  )}
                  onClick={() => toggleFolder(folder)}
                  onContextMenu={e => { e.preventDefault(); setContextMenu({ type: 'folder', targetId: folder, x: e.clientX, y: e.clientY }); }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className={clsx('shrink-0 text-[#2d73ff] transition-transform', isCollapsed ? '' : 'rotate-90')}><polyline points="9 18 15 12 9 6"/></svg>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[#2d73ff]"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span className="truncate">{folder}</span>
                  <span className="ml-auto text-[9px] text-[var(--text-muted)]">{items.filter(i => (i.folder || DEFAULT_FOLDER) === folder).length}</span>
                </button>
                <div className="mt-0.5 space-y-0.5 pl-4 pr-1 relative">
                  {!isCollapsed && folderItems.map(it => (
                    <button
                      key={it.id}
                      draggable
                      onDragStart={e => { setDragItemId(it.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragItemId(null); setDragOverFolder(null); }}
                      className={clsx(
                        'flex w-full items-center justify-between py-1.5 px-3 text-[13px] transition-all relative cursor-grab active:cursor-grabbing select-none',
                        it.id === selectedId 
                          ? 'bg-[#cce0f5] dark:bg-[#1e3a5f] text-[#1f2937] dark:text-gray-100 font-bold border-r-[4px] border-[#2d73ff]' 
                          : 'text-[#4b5563] dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 rounded',
                        dragItemId === it.id && 'opacity-50'
                      )}
                      onClick={() => setSelectedId(it.id)}
                      onContextMenu={e => { e.preventDefault(); setContextMenu({ type: 'item', targetId: it.id, targetName: it.title, x: e.clientX, y: e.clientY }); }}
                      title={it.title}
                    >
                      <span className="truncate">{it.title || '未命名设定'}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 右键菜单 ────────────────────────────────────────────────── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }} />
          <div className="fixed z-[1001] w-36 rounded-md border border-[var(--border-color)] bg-[var(--surface)] p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.type === 'folder' ? (
              <>
                <button onClick={() => { createItem(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-strong)] rounded">新建设定</button>
                <div className="h-px w-full bg-[var(--border-color)] my-1" />
                <button onClick={() => { renameFolder(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-strong)] rounded">重命名文件夹</button>
                <button onClick={() => { deleteFolder(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-rose-500 hover:bg-rose-500/10 rounded">删除文件夹</button>
              </>
            ) : (
              <>
                <button onClick={() => { renameItem(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--surface-strong)] rounded">重命名</button>
                <div className="h-px w-full bg-[var(--border-color)] my-1" />
                <div className="px-2 pt-0.5 pb-1 text-[9px] text-[var(--text-muted)]">移动到</div>
                <div className="max-h-32 overflow-y-auto custom-scrollbar">
                  {folders.map(f => (
                    <button key={f} onClick={() => { moveItem(contextMenu.targetId, f); setContextMenu(null); }} className="flex w-full items-center gap-1 px-2 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] rounded">
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-amber-500"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <span className="truncate">{f}</span>
                    </button>
                  ))}
                </div>
                <div className="h-px w-full bg-[var(--border-color)] my-1" />
                <button onClick={() => { deleteItem(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-rose-500 hover:bg-rose-500/10 rounded">删除</button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── 全局提示/确认弹窗 ────────────────────────────────────────── */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3">{dialog.title}</h3>
            {dialog.message && <p className="mb-4 text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">{dialog.message}</p>}
            {dialog.isPrompt && (
              <input
                autoFocus
                className="w-full rounded border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#2d73ff] focus:ring-1 focus:ring-[#2d73ff]"
                defaultValue={dialog.defaultValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dialog.onConfirm(e.currentTarget.value);
                    setDialog(prev => ({ ...prev, isOpen: false }));
                  } else if (e.key === 'Escape') {
                    setDialog(prev => ({ ...prev, isOpen: false }));
                  }
                }}
                id="dialog-prompt-input"
              />
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="rounded px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
              >
                取消
              </button>
              <button
                className="rounded bg-[#2d73ff] px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors"
                onClick={() => {
                  const val = dialog.isPrompt ? (document.getElementById('dialog-prompt-input') as HTMLInputElement)?.value : undefined;
                  dialog.onConfirm(val);
                  setDialog(prev => ({ ...prev, isOpen: false }));
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
