// 模块说明：AI 改写对比卡片。
// 关键职责：双栏展示原文与 AI 改写结果，提供采纳/拒绝交互。
import React from 'react';
import { AIResultCard } from './AIResultCard';

export interface DiffCardData {
 original: string;
 result: string;
 analysis: string;
}

export interface DiffCardProps {
 /**
 * Floating card position.
 */
 position: { top: number; left: number };
 /**
 * Card dragging state, used to switch cursor style.
 */
 isDragging: boolean;
 /**
 * Diff analysis payload.
 */
 data: DiffCardData;
 /**
 * Drag start handler bound on card header.
 */
 onPointerDownHeader: (event: React.PointerEvent) => void;
 /**
 * Reset card position callback.
 */
 onResetPosition: () => void;
 /**
 * Close card callback.
 */
 onClose: () => void;
}

/**
 * Floating card used to display original/result/analysis blocks.
 */
export function DiffCard({
 position,
 isDragging,
 data,
 onPointerDownHeader,
 onResetPosition,
 onClose
}: DiffCardProps): JSX.Element {
 return (
 <div
 data-guide-target="inline-suggestion-card"
	className="pointer-events-auto fixed z-[99999] max-h-[60vh] w-[420px] overflow-hidden border border-[var(--accent)]/30 bg-[var(--surface-strong)] shadow-[0_20px_60px_rgba(0,0,0,0.35)] "
	style={{ top: position.top, left: position.left, cursor: isDragging ? 'grabbing' : 'default' }}
	>
	<div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-3"onPointerDown={onPointerDownHeader} style={{ cursor: 'grab', userSelect: 'none' }}>
	<span className="text-sm font-bold text-[var(--accent)]">调整对比分析</span>
	<div className="flex items-center gap-2">
	<button className="rounded p-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"title="重置位置"onClick={onResetPosition}>
	<svg className="h-3.5 w-3.5"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
	</button>
	<button className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"onClick={onClose}>
 <svg className="h-4 w-4"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
 </button>
 </div>
 </div>
 <div className="space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed"style={{ maxHeight: 'calc(60vh - 60px)' }}>
 <AIResultCard title="原文"content={data.original} tone="rose"/>
 <AIResultCard title="润色后"content={data.result} tone="indigo"/>
 <AIResultCard title="AI 分析要点"content={data.analysis} tone="amber"/>
 </div>
 </div>
 );
}

