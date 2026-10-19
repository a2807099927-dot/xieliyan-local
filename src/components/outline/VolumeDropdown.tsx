// 模块说明：分卷下拉选择器。
// 关键职责：在大纲面板切换/新建卷。
import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ChronoIcon } from '../common/ChronoIcon';
import { useAppStore } from '../../store/useAppStore';
import { useBookStore } from '../../store/useBookStore';

export function VolumeDropdown() {
 const [isOpen, setIsOpen] = useState(false);
 const dropdownRef = useRef<HTMLDivElement>(null);

 const bookId = useAppStore((s) => s.activeBookId);
 const setJumpTargetId = useAppStore((s) => s.setOutlineVisionJumpTargetId);
 const books = useBookStore((s) => s.books);
 const addOutlineNode = useBookStore((s) => s.addOutlineNode);

 const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);
 const arcs = useMemo(() => book?.outlineVision?.nodes.filter((n) => n.type === 'arc') || [], [book?.outlineVision?.nodes]);

 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
 setIsOpen(false);
 }
 };
 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 const handleAddVolume = async () => {
 if (!bookId) return;
 await addOutlineNode(bookId, null, {
 title: `第${arcs.length + 1}卷`,
 type: 'arc',
 targetWordCount: 50000
 });
 setIsOpen(false);
 };

 return (
 <div className="relative"ref={dropdownRef}>
 <button
 onClick={() => setIsOpen((v) => !v)}
 className={clsx(
 'flex items-center gap-2 border border-white/15 bg-white/15 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-white/25',
 isOpen && 'ring-2 ring-indigo-500/45'
 )}
 >
 <ChronoIcon name="vision"size={14} />
 <span>分卷切换</span>
 <svg className={clsx('h-3 w-3 text-white/60 transition-transform', isOpen && 'rotate-180')} viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3">
 <path d="m6 9 6 6 6-6"/>
 </svg>
 </button>

 {isOpen ? (
 <div className="absolute right-0 z-[240] mt-2 w-72 overflow-hidden border border-white/20 bg-[#1a1e2c]/95 shadow-2xl ">
 <div className="max-h-72 space-y-1 overflow-y-auto p-2">
 {arcs.length === 0 ? (
 <div className="px-3 py-4 text-center text-[11px] text-white/40">暂无分卷，先创建一个</div>
 ) : (
 arcs.map((arc, index) => (
 <button
 key={arc.id}
 onClick={() => {
 setJumpTargetId(arc.id);
 setIsOpen(false);
 }}
 className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/10"
 >
 <span className="truncate text-xs font-semibold text-white/90">{arc.title || `第${index + 1}卷`}</span>
 <span className="text-[10px] text-white/50">{arc.children?.length || 0} 节点</span>
 </button>
 ))
 )}
 </div>

 <div className="border-t border-white/10 bg-white/5 p-2">
 <button
 onClick={handleAddVolume}
 className="flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-indigo-300 transition-colors hover:bg-indigo-500/15"
 >
 <svg className="h-3 w-3"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="3">
 <path d="M12 5v14M5 12h14"/>
 </svg>
 新建分卷
 </button>
 </div>
 </div>
 ) : null}
 </div>
 );
}
