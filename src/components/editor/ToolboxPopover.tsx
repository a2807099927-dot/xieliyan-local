// ToolboxPopover — 九宫格工具箱浮层
// 向右侧外框贴紧弹出，不被父容器裁切
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ToolItem {
 id: string;
 label: string;
 icon: React.ReactNode;
 active?: boolean;
 onClick: () => void;
}

interface ToolboxPopoverProps {
 open: boolean;
 onClose: () => void;
 items: ToolItem[];
 anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ToolboxPopover({ open, onClose, items, anchorRef }: ToolboxPopoverProps) {
 const ref = useRef<HTMLDivElement>(null);
 const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

 // 计算浮层位置：紧贴锚点按钮右侧弹出
 useEffect(() => {
 if (!open || !anchorRef?.current) return;
 const rect = anchorRef.current.getBoundingClientRect();
 setPos({
 top: rect.top - 8,
 left: rect.right + 4, // 紧贴侧边栏右侧边缘，留 4px 间距
 });
 }, [open, anchorRef]);

 useEffect(() => {
 if (!open) return;
 const handler = (e: MouseEvent) => {
 const target = e.target as HTMLElement;
 if (ref.current && ref.current.contains(target)) return;
 if (target.closest('[data-toolbox-trigger]')) return;
 onClose();
 };
 const keyHandler = (e: KeyboardEvent) => {
 if (e.key === 'Escape') onClose();
 };
 const timer = setTimeout(() => {
 document.addEventListener('mousedown', handler);
 document.addEventListener('keydown', keyHandler);
 }, 50);
 return () => {
 clearTimeout(timer);
 document.removeEventListener('mousedown', handler);
 document.removeEventListener('keydown', keyHandler);
 };
 }, [open, onClose]);

 if (!open || !pos) return null;

 return createPortal(
 <div
 ref={ref}
	className="fixed z-[9999] min-w-[240px] border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 shadow-2xl "
	style={{
	top: pos.top,
	left: pos.left,
	animation: 'fadeInScale 0.15s ease-out',
	}}
	onMouseDown={(e) => e.stopPropagation()}
	>
	<div className="mb-3 text-[10px] font-bold tracking-[0.15em] text-[var(--text-muted)] uppercase">工具箱</div>
	<div className="grid grid-cols-4 gap-3">
	{items.map((item) => (
	<button
	key={item.id}
	onClick={() => { item.onClick(); onClose(); }}
	className={`flex flex-col items-center gap-1.5 rounded-md p-2 transition-all ${
	item.active
	? 'bg-indigo-500/20 text-indigo-600'
	: 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
	}`}
 title={item.label}
 >
 <div className="flex h-8 w-8 items-center justify-center">
 {item.icon}
 </div>
 <span className="text-[9px] font-medium leading-tight text-center whitespace-nowrap">{item.label}</span>
 </button>
 ))}
 </div>
 </div>,
 document.body
 );
}
