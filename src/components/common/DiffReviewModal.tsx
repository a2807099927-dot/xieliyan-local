// 模块说明：文本差异复核弹窗组件。
// 关键职责：展示差异明细并承载确认/回退等复核交互。
import { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';


interface Segment {
 id: string;
 original: string;
 suggested: string;
}

function splitParagraphs(input: string): string[] {
 return input
 .replace(/\r\n/g, '\n')
 .split('\n')
 .map((line) => line.trim())
 .filter(Boolean);
}

function buildSegments(originalText: string, suggestedText: string): Segment[] {
 const original = splitParagraphs(originalText);
 const suggested = splitParagraphs(suggestedText);
 const max = Math.max(original.length, suggested.length);
 const segments: Segment[] = [];
 for (let i = 0; i < max; i += 1) {
 const left = original[i] || '';
 const right = suggested[i] || '';
 if (left === right) continue;
 segments.push({
 id: `seg-${i}-${Math.random().toString(36).slice(2, 8)}`,
 original: left,
 suggested: right
 });
 }
 return segments;
}

function mergeSegments(originalText: string, suggestedText: string, acceptedIds: Set<string>): string {
 const original = splitParagraphs(originalText);
 const suggested = splitParagraphs(suggestedText);
 const max = Math.max(original.length, suggested.length);
 const segments = buildSegments(originalText, suggestedText);
 const byOrder = new Map<number, Segment>();
 segments.forEach((segment, idx) => byOrder.set(idx, segment));

 const merged: string[] = [];
 let diffCursor = 0;
 for (let i = 0; i < max; i += 1) {
 const left = original[i] || '';
 const right = suggested[i] || '';
 if (left === right) {
 if (left) merged.push(left);
 continue;
 }
 const segment = byOrder.get(diffCursor);
 if (segment && acceptedIds.has(segment.id)) {
 if (right) merged.push(right);
 } else if (left) {
 merged.push(left);
 }
 diffCursor += 1;
 }

 return merged.join('\n');
}

export function DiffReviewModal({
 open,
 title,
 originalText,
 suggestedText,
 onCancel,
 onApply
}: {
 open: boolean;
 title: string;
 originalText: string;
 suggestedText: string;
 onCancel: () => void;
 onApply: (mergedText: string) => void;
}) {
 const segments = useMemo(() => buildSegments(originalText, suggestedText), [originalText, suggestedText]);
 const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
 useEffect(() => {
 setAcceptedIds(new Set(segments.map((item) => item.id)));
 }, [segments]);

 useEscapeKey(onCancel, open);

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 "onClick={onCancel}>

 <div
	className="wz-dz-shell flex h-[min(760px,calc(100vh-40px))] w-[min(1180px,calc(100vw-40px))] flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--surface-strong)] shadow-2xl"
	onClick={(event) => event.stopPropagation()}
	>
	<div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
	<div>
	<div className="text-base font-bold text-[var(--text-primary)]">{title}</div>
	<div className="text-xs text-[var(--text-muted)]">左侧原文，右侧建议。勾选后采纳对应段落。</div>
	</div>
	<button className=" p-1 text-[var(--text-muted)] hover:bg-[var(--surface)]"onClick={onCancel}>×</button>
	</div>

	<div className="grid min-h-0 flex-1 grid-cols-[1fr_56px_1fr]">
	<div className="min-h-0 overflow-auto border-r border-[var(--border-color)] p-3">
	<div className="mb-2 text-xs font-semibold text-[var(--text-muted)]">原文</div>
	<div className="space-y-2">
	{segments.length === 0 ? <div className="text-sm text-[var(--text-muted)]">没有差异</div> : null}
	{segments.map((segment) => (
	<div key={`left-${segment.id}`} className="border border-[var(--border-color)] bg-[var(--surface)] p-2 text-sm text-[var(--text-secondary)]">
	{segment.original || <span className="text-[var(--text-muted)]">（空）</span>}
	</div>
	))}
	</div>
	</div>

	<div className="min-h-0 overflow-auto border-r border-[var(--border-color)] p-2">
	<div className="mb-2 text-center text-xs font-semibold text-[var(--text-muted)]">采纳</div>
	<div className="space-y-2">
	{segments.map((segment) => (
	<label key={`check-${segment.id}`} className="flex h-[58px] items-center justify-center border border-[var(--border-color)] bg-[var(--surface-strong)]">
	<input
	type="checkbox"
	checked={acceptedIds.has(segment.id)}
	onChange={(event) =>
	setAcceptedIds((prev) => {
	const next = new Set(prev);
	if (event.target.checked) next.add(segment.id);
	else next.delete(segment.id);
	return next;
	})
	}
	/>
	</label>
	))}
	</div>
	</div>

	<div className="min-h-0 overflow-auto p-3">
	<div className="mb-2 text-xs font-semibold text-[var(--text-muted)]">建议</div>
	<div className="space-y-2">
	{segments.length === 0 ? <div className="text-sm text-[var(--text-muted)]">没有差异</div> : null}
	{segments.map((segment) => (
	<div key={`right-${segment.id}`} className="border border-violet-300/40 bg-violet-500/10 p-2 text-sm text-[var(--text-secondary)]">
	{segment.suggested || <span className="text-[var(--text-muted)]">（删除该段）</span>}
	</div>
	))}
	</div>
	</div>
	</div>

	<div className="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3">
	<button className="border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"onClick={() => setAcceptedIds(new Set(segments.map((item) => item.id)))}>
	全选采纳
	</button>
	<div className="flex gap-2">
	<button className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface)]"onClick={onCancel}>
	取消
	</button>
 <button className="wz-dz-btn-primary px-3 py-1.5 text-xs"onClick={() => onApply(mergeSegments(originalText, suggestedText, acceptedIds))}>
 应用所选
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}

