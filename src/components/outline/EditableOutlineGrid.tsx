import React from 'react';
import { OutlineCard } from './plotDeductionHelpers';
import { LayoutGrid } from 'lucide-react';

export function EditableOutlineGrid({
	cards,
	onChange,
}: {
	cards: OutlineCard[];
	onChange: (cards: OutlineCard[]) => void;
}) {
	const updateCard = (index: number, field: keyof OutlineCard, value: string | string[]) => {
		const next = [...cards];
		next[index] = { ...next[index], [field]: value };
		onChange(next);
	};

	return (
		<div className="flex flex-col gap-4 mt-2 mb-6">
			<div className="flex items-center gap-2 px-2">
				<LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
				<h3 className="text-sm font-bold text-gray-200">智能提取节点 (直接点击编辑)</h3>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{cards.map((c, i) => (
					<div
						key={i}
						className="bg-[#1e1e22] border border-white/10 hover:border-[var(--accent)]/30 rounded-2xl p-4 flex flex-col gap-3 shadow-lg transition-colors group"
					>
						<input
							value={c.title}
							onChange={(e) => updateCard(i, 'title', e.target.value)}
							className="font-bold text-sm bg-transparent border-b border-transparent group-hover:border-white/10 focus:border-[var(--accent)]! outline-none text-[var(--accent-light)] w-full pb-1 transition-colors"
							placeholder="章节/节点名称"
						/>
						<textarea
							value={c.beats.join('\n')}
							onChange={(e) => updateCard(i, 'beats', e.target.value.split('\n'))}
							className="text-xs text-gray-400 bg-transparent resize-none flex-1 min-h-[120px] outline-none premium-scroll leading-relaxed"
							placeholder="情节要点（每行一项）..."
						/>
					</div>
				))}
			</div>
		</div>
	);
}
