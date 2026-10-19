// GuidedContinuationModal
import { useEffect, useRef, useState } from 'react';
import { useBackdropClose } from '../../hooks/useBackdropClose';

interface GuidedContinuationModalProps {
 open: boolean;
 initialValue?: string;
 onClose: () => void;
 onSubmit: (instruction: string, supplement?: string) => void;
}

const QUICK_TAGS = [
 { label: '动作场景', value: '请写一段紧张有张力的动作场面，动作轨迹清晰，包含环境反馈与人物即时反应。' },
 { label: '自然过渡', value: '请自然衔接到下一段剧情，并交代清楚时间、地点、人物状态的变化。' },
 { label: '深度对白', value: '请强化人物对白层次，通过潜台词展现动机、冲突与关系变化。' },
 { label: '氛围强化', value: '请增强环境氛围，结合天气、光线、声音与细节描写，匹配当前情绪。' },
 { label: '意外转折', value: '请加入一个合理但出人意料的事件，推动剧情方向发生变化。' }
];

export function GuidedContinuationModal({ open, initialValue, onClose, onSubmit }: GuidedContinuationModalProps) {
 const [instruction, setInstruction] = useState('');
 const [supplement, setSupplement] = useState('');
 const instructionRef = useRef<HTMLTextAreaElement | null>(null);
 const backdropProps = useBackdropClose(onClose);

 useEffect(() => {
 if (!open) return;
 setInstruction(initialValue || '');
 setSupplement('');
 const timer = window.setTimeout(() => instructionRef.current?.focus(), 30);
 return () => window.clearTimeout(timer);
 }, [initialValue, open]);

 if (!open) return null;

 const submit = () => {
 const text = instruction.trim();
 if (!text) return;
 onSubmit(text, supplement.trim() || undefined);
 onClose();
 };

 return (
 <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-4" {...backdropProps}>
 <div
	className="w-full max-w-2xl border border-[var(--border-color)] bg-[var(--surface-strong)] p-5 text-[var(--text-primary)] shadow-2xl"
	onClick={(e) => e.stopPropagation()}
	onMouseDown={(e) => e.stopPropagation()}
	onMouseUp={(e) => e.stopPropagation()}
	>
	<div className="mb-3 flex items-center justify-between">
	<h3 className="text-base font-semibold">根据本章内容开始写作</h3>
	<button className=" px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface)]"onClick={onClose}>
	关闭
	</button>
	</div>

	<div className="mb-3 flex flex-wrap gap-2">
	{QUICK_TAGS.map((tag) => (
	<button
	key={tag.label}
	type="button"
	className="rounded-full border border-[var(--border-color)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface)]"
	onClick={() => setInstruction((prev) => (prev ? `${prev}\n${tag.value}` : tag.value))}
	>
	{tag.label}
	</button>
	))}
	</div>

	<label className="mb-1 block text-xs text-[var(--text-muted)]">写作要求</label>
	<textarea
	ref={instructionRef}
	value={instruction}
	onChange={(e) => setInstruction(e.target.value)}
	className="mb-3 h-36 w-full resize-none border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
	placeholder="请描述这一段续写想要的方向、风格和重点。"
	/>

	<label className="mb-1 block text-xs text-[var(--text-muted)]">补充约束（可选）</label>
	<textarea
	value={supplement}
	onChange={(e) => setSupplement(e.target.value)}
	className="h-24 w-full resize-none border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
	placeholder="可补充语气、禁忌、人物关系、剧情边界等要求。"
	/>

	<div className="mt-4 flex justify-end gap-2">
	<button className="border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface)]"onClick={onClose}>
	取消
	</button>
 <button
 className="bg-indigo-500 px-3 py-1.5 text-sm text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
 disabled={!instruction.trim()}
 onClick={submit}
 >
 开始写作
 </button>
 </div>
 </div>
 </div>
 );
}
