import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { RoleWithCategory } from '../rolePanelLogic';
import { promptDialog } from '../../../../store/usePromptDialogStore';

interface RolesTreeProps {
  roles: RoleWithCategory[];
  categories: string[];
  selectedRoleId: string | null;
  onSelectRole: (role: RoleWithCategory) => void;
  onMoveRole: (roleId: string, targetCategory: string) => void;
  onNewRole: (category: string) => void;
  onRenameCategory?: (category: string, newName: string) => void;
  onDeleteCategory?: (category: string) => void;
  onAddCategory?: (name: string) => void;
  onHighlightCategory?: (category: string, color: string) => void;
  onDeleteRole?: (roleId: string, roleName: string) => void;
  onExtract: (mode: 'list' | 'bio') => void;
  onReorder?: (category: string, orderedRoleIds: string[]) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchMove?: (ids: string[], category: string) => void;
  onDeleteAllRoles?: () => void;
  onExportRoles?: (format: 'json' | 'txt') => void;
  onImportRoles?: (format: 'json' | 'txt') => void;
  }

export function RolesTree({
  roles,
  categories,
  selectedRoleId,
  onSelectRole,
  onMoveRole,
  onNewRole,
  onRenameCategory,
  onDeleteCategory,
  onAddCategory,
  onHighlightCategory,
  onDeleteRole,
  onExtract,
  onReorder,
  onBatchDelete,
  onBatchMove,
  onDeleteAllRoles,
  onExportRoles,
  onImportRoles
  }: RolesTreeProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['主要角色', '次要角色']));
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState('');
  const [ioMenu, setIoMenu] = useState<'imp' | 'exp' | 'all' | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    type: 'category' | 'role';
    targetId: string;
    targetName?: string;
    x: number;
    y: number;
  } | null>(null);

  const toggleExpand = (cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const groupedRoles = useMemo(() => {
    const map = new Map<string, RoleWithCategory[]>();
    categories.forEach(c => map.set(c, []));
    
    roles.forEach(r => {
      if (!r.role.name.toLowerCase().includes(search.toLowerCase())) return;
      const eff = ((r.role.customFields && r.role.customFields.category) || '').trim() || r.categoryName;
      const cat = categories.includes(eff) ? eff : '其他角色';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    });
    map.forEach((arr) => arr.sort((a, b) => {
      const oa = Number(a.role.customFields?.sortOrder);
      const ob = Number(b.role.customFields?.sortOrder);
      const va = Number.isFinite(oa) ? oa : Number.MAX_SAFE_INTEGER;
      const vb = Number.isFinite(ob) ? ob : Number.MAX_SAFE_INTEGER;
      if (va !== vb) return va - vb;
      return a.role.name.localeCompare(b.role.name, 'zh-CN');
    }));
    return map;
  }, [roles, categories, search]);

  const handleDragStart = (e: React.DragEvent, roleId: string) => {
    e.dataTransfer.setData('text/plain', roleId);
    setDraggedRoleId(roleId);
  };

  const handleDragOver = (e: React.DragEvent, category: string) => {
    e.preventDefault();
    if (dragOverCategory !== category) {
      setDragOverCategory(category);
    }
  };

  const handleDrop = (e: React.DragEvent, category: string) => {
    e.preventDefault();
    setDragOverCategory(null);
    const roleId = e.dataTransfer.getData('text/plain');
    if (roleId) {
      onMoveRole(roleId, category);
    }
    setDraggedRoleId(null);
  };

  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const pointerDragRef = useRef<{
    roleId: string;
    roleName: string;
    sourceCategory: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag) return;
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (!drag.active && distance < 4) return;

      drag.active = true;
      suppressClickRef.current = true;
      setDraggedRoleId(drag.roleId);
      setDragPreview({
        name: drag.roleName,
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
        width: drag.width,
        height: drag.height
      });

      const element = document.elementFromPoint(event.clientX, event.clientY);
      const category = element?.closest<HTMLElement>('[data-role-category]')?.dataset.roleCategory || null;
      setDragOverCategory(category);
      event.preventDefault();
    };

    const finishPointerDrag = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag) return;
      pointerDragRef.current = null;

      const wasActive = drag.active;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const category = element?.closest<HTMLElement>('[data-role-category]')?.dataset.roleCategory || null;

      setDraggedRoleId(null);
      setDragOverCategory(null);
      setDragPreview(null);

      if (wasActive && category && category !== drag.sourceCategory) {
        onMoveRole(drag.roleId, category);
      }

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointerDrag);
    window.addEventListener('pointercancel', finishPointerDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointerDrag);
      window.removeEventListener('pointercancel', finishPointerDrag);
    };
  }, [onMoveRole]);

  const builtInCategories = new Set(['主角', '女主', '配角', '反派', 'NPC', '龙套', '势力', '其他角色']);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--panel-bg)]">
      {/* Search and Action Buttons */}
      <div className="px-3 pt-1 pb-3 shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input 
              className="w-full rounded bg-white/60 dark:bg-black/20 border border-black/10 dark:border-white/10 pl-8 pr-3 py-1.5 text-xs text-[#374151] dark:text-gray-200 placeholder-zinc-400 outline-none focus:ring-1 focus:ring-[#2d73ff]"
              placeholder="角色"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                  <button onClick={() => { setIoMenu(null); onImportRoles?.('json'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5">JSON 文件</button>
                  <button onClick={() => { setIoMenu(null); onImportRoles?.('txt'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5">TXT 文件</button>
                  <div className="border-t border-black/5 dark:border-white/5 my-1" />
                  <div className="px-2 py-1 text-[10px] text-gray-400 font-bold select-none">导出</div>
                  <button onClick={() => { setIoMenu(null); onExportRoles?.('json'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5">JSON 文件</button>
                  <button onClick={() => { setIoMenu(null); onExportRoles?.('txt'); }} className="block w-full px-2 py-1.5 text-left text-xs whitespace-nowrap rounded hover:bg-black/5 dark:hover:bg-white/5">TXT 文件</button>
                </div>
              </>
            )}
            {onDeleteAllRoles && (
              <button
                onClick={onDeleteAllRoles}
                className="rounded border border-black/10 dark:border-white/10 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center justify-center shadow-sm bg-white dark:bg-zinc-800"
                title="清空角色"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowNewMenu(!showNewMenu); }}
              className="w-full whitespace-nowrap rounded bg-[#2d73ff] py-1.5 text-xs font-bold text-white hover:bg-blue-600 transition-colors shadow-sm flex items-center justify-center gap-1"
            >
              新建 <span className="text-[9px] translate-y-[0.5px]">▼</span>
            </button>
            {showNewMenu && (
              <>
                <div className="fixed inset-0 z-[1000]" onClick={() => setShowNewMenu(false)} />
                <div className="absolute left-0 top-full mt-1 w-32 rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 p-1 shadow-lg z-[1001]">
                  <button 
                    onClick={() => { onNewRole('主要角色'); setShowNewMenu(false); }}
                    className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded"
                  >
                    新建角色
                  </button>
                  <button 
                    onClick={async () => {
                      setShowNewMenu(false);
                      const name = await promptDialog({ title: '新建分类', placeholder: '请输入新分类名称' });
                      if (name && name.trim()) {
                        onAddCategory?.(name.trim());
                      }
                    }}
                    className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded"
                  >
                    新建分类
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative flex-1">
            <button 
              onClick={() => onExtract('list')}
              className="w-full whitespace-nowrap flex items-center justify-center gap-1 rounded bg-white dark:bg-zinc-800 border border-black/10 dark:border-zinc-700 py-1.5 text-[11px] font-bold text-[#374151] dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors shadow-sm relative"
            >
              提取
              <span className="absolute -top-1.5 -right-1.5 rounded bg-indigo-500 px-1 text-[8px] text-white">新</span>
            </button>
          </div>
        </div>
      </div>


      {/* Accordion Tree */}
      <div className="flex-1 overflow-y-auto px-1 custom-scrollbar pb-10">
        {categories.map(cat => {
          const catRoles = groupedRoles.get(cat) || [];
          const isExpanded = expanded.has(cat);
          const isDragTarget = dragOverCategory === cat;

          return (
            <div key={cat} className="mb-1"
                 data-role-category={cat}
                 onDragOver={(e) => handleDragOver(e, cat)}
                 onDragLeave={() => setDragOverCategory(null)}
                 onDrop={(e) => handleDrop(e, cat)}
            >
              <div 
                className={clsx(
                  "group flex items-center justify-between rounded px-2 py-1.5 text-xs font-medium cursor-pointer transition-all",
                  isDragTarget
                    ? "bg-[#dbeafe] text-[#1d4ed8] ring-1 ring-[#2d73ff]/60 shadow-sm dark:bg-[#1d4ed8]/25 dark:text-blue-200"
                    : "text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                )}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ type: 'category', targetId: cat, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="flex items-center gap-1.5 flex-1" onClick={() => toggleExpand(cat)}>
                  {isExpanded ? (
                    <svg className="h-4 w-4 text-[#2d73ff]" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                  ) : (
                    <svg className="h-4 w-4 text-[#2d73ff]" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  )}
                  <span className="text-[13px] font-medium text-[#4b5563] dark:text-gray-300">{cat}</span>
                </div>
              </div>

              {isExpanded && (
                catRoles.length > 0 ? (
                  <div className="mt-0.5 space-y-0.5 pl-4 pr-1 relative">
                    {catRoles.map(r => (
                      <div 
                        key={r.role.id}
                        draggable={false}
                        onDragStart={(e) => handleDragStart(e, r.role.id)}
                        onPointerDown={(e) => {
                          if (batchMode || e.button !== 0) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          pointerDragRef.current = {
                            roleId: r.role.id,
                            roleName: r.role.name || '未命名角色',
                            sourceCategory: cat,
                            startX: e.clientX,
                            startY: e.clientY,
                            offsetX: e.clientX - rect.left,
                            offsetY: e.clientY - rect.top,
                            width: rect.width,
                            height: rect.height,
                            active: false,
                            pointerId: e.pointerId
                          };
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const draggedId = e.dataTransfer.getData('text/plain');
                          setDraggedRoleId(null);
                          setDragOverCategory(null);
                          if (!draggedId || draggedId === r.role.id) return;
                          const ids = catRoles.map((x) => x.role.id);
                          const from = ids.indexOf(draggedId);
                          if (from === -1) { onMoveRole(draggedId, cat); return; }
                          ids.splice(from, 1);
                          const insertAt = ids.indexOf(r.role.id);
                          ids.splice(insertAt, 0, draggedId);
                          onReorder?.(cat, ids);
                        }}
                        onClick={() => {
                          if (suppressClickRef.current) return;
                          if (batchMode) {
                            setSelectedIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(r.role.id)) n.delete(r.role.id); else n.add(r.role.id);
                              return n;
                            });
                          } else {
                            onSelectRole(r);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ type: 'role', targetId: r.role.id, targetName: r.role.name, x: e.clientX, y: e.clientY });
                        }}
                        className={clsx(
                          "group flex items-center justify-between py-1.5 px-3 text-[13px] transition-all relative cursor-grab active:cursor-grabbing select-none",
                          selectedRoleId === r.role.id 
                            ? "bg-[#cce0f5] dark:bg-[#1e3a5f] text-[#1f2937] dark:text-gray-100 font-bold border-r-[4px] border-[#2d73ff]"
                            : "text-[#4b5563] dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5",
                          draggedRoleId === r.role.id && "opacity-50"
                        )}
                      >
                        {batchMode && (
                          <input type="checkbox" readOnly checked={selectedIds.has(r.role.id)} className="mr-2 shrink-0" />
                        )}
                        <div className="flex items-center flex-1 min-w-0">
                          {!batchMode && (
                            <div className="w-4 h-4 mr-1 opacity-0 group-hover:opacity-40 transition-opacity flex items-center justify-center shrink-0">
                              <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/></svg>
                            </div>
                          )}
                          <span className="truncate">{r.role.name || '未命名'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-2 pl-9 text-[11px] text-zinc-400 dark:text-zinc-500 italic select-none">
                    暂无角色
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div 
            className="fixed z-[1001] w-40 rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 p-1 shadow-xl"
            style={{ 
              top: Math.min(contextMenu.y, window.innerHeight - 150), 
              left: Math.min(contextMenu.x, window.innerWidth - 180) 
            }}
          >
            {contextMenu.type === 'category' ? (
              <>
                <button onClick={() => { onNewRole(contextMenu.targetId); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded">新建角色</button>
                {!builtInCategories.has(contextMenu.targetId) && (
                  <>
                    <button
                      onClick={async () => {
                        const targetId = contextMenu.targetId;
                        setContextMenu(null);
                        const newName = await promptDialog({ title: `重命名分类「${targetId}」`, defaultValue: targetId, placeholder: '请输入新名称' });
                        if (newName && newName.trim() && newName.trim() !== targetId) {
                          onRenameCategory?.(targetId, newName.trim());
                        }
                      }}
                      className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded"
                    >
                      重命名分类
                    </button>
                    <div className="h-px w-full bg-black/5 dark:bg-white/5 my-1" />
                    <div className="px-2 py-1 text-[10px] text-red-400 font-bold select-none">危险操作</div>
                    <button
                      onClick={() => {
                        const catName = contextMenu.targetId;
                        onDeleteCategory?.(catName);
                        setContextMenu(null);
                      }}
                      className="block w-full px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
                    >
                      删除分类
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {!batchMode ? (
                  <>
                    <button onClick={() => { setBatchMode(true); setSelectedIds(new Set([contextMenu.targetId])); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded">多选...</button>
                    <div className="h-px w-full bg-black/5 dark:bg-white/5 my-1" />
                    <button onClick={() => { onDeleteRole?.(contextMenu.targetId, contextMenu.targetName || ''); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded">删除角色</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setBatchMode(false); setSelectedIds(new Set()); setContextMenu(null); }} className="block w-full px-2 py-1.5 text-left text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 rounded">退出多选</button>
                    <div className="h-px w-full bg-black/5 dark:bg-white/5 my-1" />
                    <button 
                      onClick={() => { 
                        if (selectedIds.size) { 
                          if (window.confirm(`确认删除已选择的 ${selectedIds.size} 个角色吗？此操作不可恢复。`)) {
                            onBatchDelete?.(Array.from(selectedIds)); 
                            setSelectedIds(new Set()); 
                            setBatchMode(false); 
                          }
                        } 
                        setContextMenu(null); 
                      }} 
                      className="block w-full px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
                    >
                      删除已选 ({selectedIds.size})
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {dragPreview && (
        <div
          className="pointer-events-none fixed z-[10000] flex items-center rounded border border-[#2d73ff] bg-[#dbeafe]/95 px-3 text-[13px] font-semibold text-[#1f2937] shadow-[0_10px_24px_rgba(45,115,255,0.24)] dark:bg-[#1d4ed8]/30 dark:text-blue-100"
          style={{
            left: dragPreview.x,
            top: dragPreview.y,
            width: dragPreview.width,
            height: dragPreview.height
          }}
        >
          <span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-[#2d73ff]" />
          <span className="ml-2 block min-w-0 truncate">{dragPreview.name}</span>
        </div>
      )}
    </div>
  );
}
