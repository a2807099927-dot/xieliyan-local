// OutlineNode
import React, { memo, useCallback, useEffect, useState } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';
import { clsx } from 'clsx';
import type { OutlineNode as OutlineNodeData } from '../../types/ov';
import { useBookStore } from '../../store/useBookStore';
import { useAppStore } from '../../store/useAppStore';

function normalizeTitle(value: string | undefined): string {
 const next = (value || '').trim();
 return next || '新节点';
}

export const OutlineNode = memo(({ id, data, selected }: NodeProps<OutlineNodeData>) => {
 const { title, conflict, characters, targetWordCount, actualWordCount, type, pinned } = data;
 const isVirtual = Boolean((data as { virtual?: boolean })?.virtual);
 const bookId = useAppStore((s) => s.activeBookId);
 const addOutlineNode = useBookStore((s) => s.addOutlineNode);
 const deleteOutlineNode = useBookStore((s) => s.deleteOutlineNode);
 const updateOutlineNode = useBookStore((s) => s.updateOutlineNode);

 const [editingTitle, setEditingTitle] = useState(false);
 const [editingConflict, setEditingConflict] = useState(false);
 const [titleDraft, setTitleDraft] = useState(title || '');
 const [conflictDraft, setConflictDraft] = useState(conflict || '');

 useEffect(() => {
 if (!editingTitle) setTitleDraft(title || '');
 }, [editingTitle, title]);

 useEffect(() => {
 if (!editingConflict) setConflictDraft(conflict || '');
 }, [conflict, editingConflict]);

 const saveTitle = useCallback(async () => {
 if (!bookId) return;
 const next = normalizeTitle(titleDraft);
 if (next !== normalizeTitle(title)) {
 await updateOutlineNode(bookId, id, { title: next });
 }
 setEditingTitle(false);
 }, [bookId, id, title, titleDraft, updateOutlineNode]);

 const saveConflict = useCallback(async () => {
 if (!bookId) return;
 const next = conflictDraft.trim();
 const normalized = next ? next : undefined;
 if ((conflict || '') !== (normalized || '')) {
 await updateOutlineNode(bookId, id, { conflict: normalized });
 }
 setEditingConflict(false);
 }, [bookId, conflict, conflictDraft, id, updateOutlineNode]);

 const nodeKind = type === 'arc' ? '卷' : '节点';

 return (
 <div
 className={clsx(
 'wz-outline-node relative min-w-[220px] max-w-[320px] border border-white/20 p-5',
 selected ? 'ring-2 ring-indigo-500' : '',
 pinned ? 'border-amber-300/70' : ''
 )}
 style={{ background: 'rgba(30, 30, 45, 0.97)' }}
 >
 <div className="relative z-10 flex items-center justify-between gap-2">
 <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">{nodeKind}</span>
 {!isVirtual && (
 <div className="flex gap-1">
 <button
 onClick={(e) => {
 e.stopPropagation();
 if (bookId) void updateOutlineNode(bookId, id, { pinned: !pinned });
 }}
 className={clsx('text-white/35 hover:text-amber-300', pinned && 'text-amber-300')}
 title={pinned ? '取消固定' : '固定节点'}
 >
 <svg className="h-3 w-3"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.2">
 <path d="m14 3 7 7-4 1-3 3-4-4 3-3z"/>
 <path d="m5 14-2 7 7-2"/>
 </svg>
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 if (bookId) void addOutlineNode(bookId, id, { title: '新节点' });
 }}
 className="text-white/35 hover:text-indigo-300"
 title="新增子节点"
 >
 <svg className="h-3 w-3"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3">
 <path d="M12 5v14M5 12h14"/>
 </svg>
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 if (bookId && window.confirm('删除该节点及其所有子节点？')) {
 void deleteOutlineNode(bookId, id);
 }
 }}
 className="text-white/35 hover:text-red-400"
 title="删除"
 >
 <svg className="h-3 w-3"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3">
 <path d="M18 6 6 18M6 6l12 12"/>
 </svg>
 </button>
 </div>
 )}
 </div>

 <div className="relative z-10 mt-2 flex flex-col gap-2">
 {editingTitle && !isVirtual ? (
 <input
 autoFocus
 value={titleDraft}
 onChange={(e) => setTitleDraft(e.target.value)}
 onBlur={() => void saveTitle()}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 void saveTitle();
 }
 if (e.key === 'Escape') {
 e.preventDefault();
 setEditingTitle(false);
 }
 }}
 className="border border-indigo-300/50 bg-indigo-950/60 px-2 py-1 text-sm font-bold text-white outline-none"
 placeholder="节点标题"
 />
 ) : (
 <h4
 className={clsx('text-sm font-bold text-white/95', !isVirtual && 'cursor-text')}
 onDoubleClick={(e) => {
 if (isVirtual) return;
 e.stopPropagation();
 setEditingTitle(true);
 }}
 title="双击编辑"
 >
 {normalizeTitle(title)}
 </h4>
 )}

 {editingConflict && !isVirtual ? (
 <textarea
 autoFocus
 value={conflictDraft}
 onChange={(e) => setConflictDraft(e.target.value)}
 onBlur={() => void saveConflict()}
 onKeyDown={(e) => {
 if (e.key === 'Escape') {
 e.preventDefault();
 setEditingConflict(false);
 }
 }}
 className="min-h-[52px] resize-none border border-white/20 bg-white/5 px-2 py-1 text-[11px] leading-relaxed text-white/80 outline-none"
 placeholder="冲突或事件细节"
 />
 ) : conflict ? (
 <p
 className={clsx('border-l-2 border-white/10 pl-2 text-[11px] italic leading-relaxed text-white/65', !isVirtual && 'cursor-text')}
 onDoubleClick={(e) => {
 if (isVirtual) return;
 e.stopPropagation();
 setEditingConflict(true);
 }}
 >
 "{conflict}"
 </p>
 ) : (
 !isVirtual && (
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 setEditingConflict(true);
 }}
 className="self-start border border-dashed border-white/20 px-2 py-1 text-[10px] text-white/45 hover:border-white/40 hover:text-white/70"
 >
 添加冲突说明
 </button>
 )
 )}

 <div className="mt-1 text-[10px] text-white/45">
 {(actualWordCount || 0).toLocaleString()} / {(targetWordCount || 0).toLocaleString()} 字
 </div>

 {characters && characters.length > 0 && (
 <div className="mt-1 flex flex-wrap gap-1">
 {characters.slice(0, 3).map((char, i) => (
 <span key={i} className="bg-white/5 px-1.5 py-0.5 text-[9px] text-white/70">
 {char}
 </span>
 ))}
 {characters.length > 3 && <span className="text-[9px] text-white/35">...</span>}
 </div>
 )}
 </div>

 <Handle type="target"position={Position.Left} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="source"position={Position.Right} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="target"position={Position.Top} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="source"position={Position.Bottom} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 </div>
 );
});

OutlineNode.displayName = 'OutlineNode';

export const OutlineNodeLite = memo(({ id, data, selected }: NodeProps<OutlineNodeData>) => {
 const title = data?.title || '新节点';
 const conflict = data?.conflict || '';
 const type = data?.type || 'event';
 const isVirtual = Boolean((data as { virtual?: boolean })?.virtual);
 const bookId = useAppStore((s) => s.activeBookId);
 const deleteOutlineNode = useBookStore((s) => s.deleteOutlineNode);
 const updateOutlineNode = useBookStore((s) => s.updateOutlineNode);

 const [editing, setEditing] = useState(false);
 const [titleDraft, setTitleDraft] = useState(title);
 const [conflictDraft, setConflictDraft] = useState(conflict);

 useEffect(() => {
 if (!editing) {
 setTitleDraft(title);
 setConflictDraft(conflict);
 }
 }, [conflict, editing, title]);

 const saveLiteEdit = useCallback(async () => {
 if (!bookId || !id) return;
 const nextTitle = normalizeTitle(titleDraft);
 const nextConflict = (conflictDraft || '').trim();
 await updateOutlineNode(bookId, id, {
 title: nextTitle,
 conflict: nextConflict || undefined
 });
 setEditing(false);
 }, [bookId, conflictDraft, id, titleDraft, updateOutlineNode]);

 return (
 <>
 <div
 className={clsx(
 'wz-outline-node-lite-static min-w-[320px] max-w-[560px] border px-4 py-3',
 selected ? 'ring-1 ring-indigo-300 border-indigo-300/90' : 'border-indigo-200/55'
 )}
 style={{ background: 'rgba(34, 42, 68, 0.99)' }}
 title={title}
 >
 <div className="flex w-full items-center gap-2">
 <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-bold', type === 'arc' ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300')}>
 {type === 'arc' ? '卷' : '节点'}
 </span>
 {!editing ? (
 <span
 className="truncate text-sm font-semibold text-white"
 onDoubleClick={(e) => {
 if (isVirtual) return;
 e.stopPropagation();
 setEditing(true);
 }}
 title={conflict ? `${title}\n${conflict}` : title}
 >
 {title}
 </span>
 ) : (
 <input
 autoFocus
 value={titleDraft}
 onChange={(e) => setTitleDraft(e.target.value)}
 className="nodrag nowheel min-w-0 w-full flex-1 border border-indigo-300/50 bg-indigo-950/60 px-2 py-1 text-sm text-white outline-none"
 />
 )}
 {!isVirtual && !editing && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 setEditing(true);
 }}
 className="nodrag nowheel ml-auto bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20"
 >
 编辑
 </button>
 )}
 {!isVirtual && !editing && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 if (!bookId || !id) return;
 if (window.confirm('删除该节点及其所有子节点？')) {
 void deleteOutlineNode(bookId, id);
 }
 }}
 className="nodrag nowheel bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/30"
 >
 删除
 </button>
 )}
 </div>

 {editing ? (
 <div className="mt-3 space-y-2">
 <textarea
 value={conflictDraft}
 onChange={(e) => setConflictDraft(e.target.value)}
 className="nodrag nowheel h-24 w-full resize-none border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none"
 placeholder="冲突或事件细节"
 />
 <div className="flex justify-end gap-1">
 <button
 onClick={(e) => {
 e.stopPropagation();
 setEditing(false);
 }}
 className="nodrag nowheel bg-white/10 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/20"
 >
 取消
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 void saveLiteEdit();
 }}
 className="nodrag nowheel bg-indigo-500/70 px-2.5 py-1 text-[11px] text-white hover:bg-indigo-500/90"
 >
 保存
 </button>
 </div>
 </div>
 ) : conflict ? (
 <div className="mt-1 line-clamp-1 text-[10px] text-white/60">{conflict}</div>
 ) : null}
 </div>

 <Handle type="target"position={Position.Left} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="source"position={Position.Right} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="target"position={Position.Top} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 <Handle type="source"position={Position.Bottom} className="wz-outline-node-handle !h-2 !w-2 !border-none !bg-indigo-500"/>
 </>
 );
});

OutlineNodeLite.displayName = 'OutlineNodeLite';
