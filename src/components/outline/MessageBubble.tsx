import React, { useMemo, useState } from 'react';

interface Props {
	role: 'user' | 'system' | 'assistant';
	content: string;
}

interface TimelineItem {
	title: string;
	desc: string;
}

interface ParsedContent {
	items: TimelineItem[]; // 解析出的时间线节点
	text: string; // 去掉时间线后剩余的正文
}

// ── 选项行判定：A./B、：等，带 /i 与 dynamicOptions 对齐 ──
const isOptionLine = (line: string): boolean =>
	/^(?:[\-\*]\s*)?\*{0,2}[A-F][.、：:]/i.test(line.trim());

// ── 时间线节点判定：支持 “1. 标题：描述” / “1、标题 — 描述” / “→ 标题：描述” ──
const parseTimeline = (content: string): ParsedContent => {
	const lines = content.split('\n');
	const items: TimelineItem[] = [];
	const restLines: string[] = [];

	const nodeRe = /^(?:\d+[.、)]\s*|[→➤▶]\s*)(.+)$/;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			restLines.push(raw);
			continue;
		}
		// 选项行不当作时间线节点
		if (isOptionLine(line)) {
			restLines.push(raw);
			continue;
		}
		const m = line.match(nodeRe);
		if (m) {
			const body = m[1].replace(/\*\*/g, '').trim();
			// 用首个 ：/:/—/- 分隔标题与描述
			const sep = body.search(/[：:—-]/);
			if (sep > 0) {
				const title = body.slice(0, sep).trim();
				const desc = body.slice(sep + 1).trim();
				if (title) {
					items.push({ title, desc });
					continue;
				}
			} else {
				items.push({ title: body, desc: '' });
				continue;
			}
		}
		restLines.push(raw);
	}

	// 至少 2 个节点才视作时间线，否则当普通文本
	if (items.length < 2) {
		return { items: [], text: content };
	}
	return { items, text: restLines.join('\n').trim() };
};

// ── 轻量富文本渲染：加粗 + 选项行高亮 ──
const renderRichLine = (line: string, key: number) => {
	const trimmed = line.trim();
	if (!trimmed) return <div key={key} className="h-2" />;

	const option = isOptionLine(trimmed);
	const segments = trimmed.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

	return (
		<div
			key={key}
			className={
				option
					? 'my-1 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-3 py-2 text-[var(--accent-light)] text-sm'
					: 'text-sm text-gray-200 leading-relaxed'
			}
		>
			{segments.map((seg, i) =>
				seg.startsWith('**') && seg.endsWith('**') ? (
					<strong key={i} className="font-semibold text-white">
						{seg.slice(2, -2)}
					</strong>
				) : (
					<span key={i}>{seg}</span>
				),
			)}
		</div>
	);
};

// ── 时间线可视化 ──
const Timeline: React.FC<{ items: TimelineItem[] }> = ({ items }) => {
	const [hovered, setHovered] = useState<number | null>(null);
	const isCrowded = items.length > 5; // 超过 5 个节点 → 横向滚动

	return (
		<div className={`mb-3 ${isCrowded ? 'overflow-x-auto premium-scroll pb-2' : ''}`}>
			<div className="flex items-start">
				{items.map((item, i) => {
					// tooltip 向内弹，避免被气泡边界裁切
					const tooltipPos =
						i === 0
							? 'left-0'
							: i === items.length - 1
							? 'right-0'
							: 'left-1/2 -translate-x-1/2';

					return (
						<div
							key={i}
							className={`relative flex flex-col items-center ${
								isCrowded ? 'min-w-[120px] shrink-0' : 'flex-1 min-w-0'
							}`}
							onMouseEnter={() => setHovered(i)}
							onMouseLeave={() => setHovered(null)}
						>
							{/* 连线 */}
							<div className="flex items-center w-full">
								<div className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : 'bg-[var(--accent)]/40'}`} />
								<div className="w-3 h-3 rounded-full bg-[var(--accent)] shadow-md shadow-[var(--accent)]/40 shrink-0" />
								<div
									className={`h-0.5 flex-1 ${i === items.length - 1 ? 'bg-transparent' : 'bg-[var(--accent)]/40'}`}
								/>
							</div>

							{/* 标题 */}
							<div className="mt-2 px-1 text-center">
								<div className="text-xs font-semibold text-[var(--ide-t1)] truncate max-w-[140px]">
									{item.title}
								</div>
							</div>

							{/* tooltip：悬浮显示描述 */}
							{hovered === i && item.desc && (
								<div
									className={`absolute top-full mt-1 z-20 w-56 ${tooltipPos} rounded-lg bg-[var(--ide-pn-bg)] border border-[var(--ide-border)] px-3 py-2 text-[11px] text-[var(--ide-t2)] leading-relaxed shadow-xl`}
								>
									{item.desc}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export const MessageBubble: React.FC<Props> = ({ role, content }) => {
	const isUser = role === 'user';
	const parsed = useMemo(() => (isUser ? { items: [], text: content } : parseTimeline(content)), [content, isUser]);

	if (isUser) {
		return (
			<div className="flex justify-end">
				<div className="max-w-[80%] bg-[#2a2a30] border border-white/5 text-gray-200 rounded-2xl rounded-br-none px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-md">
					{content}
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="max-w-[88%] bg-[#1e1e22] border border-white/5 rounded-2xl rounded-bl-none px-5 py-3.5 shadow-md">
				{parsed.items.length > 0 && <Timeline items={parsed.items} />}
				<div className="flex flex-col gap-0.5">
					{parsed.text.split('\n').map((line, i) => renderRichLine(line, i))}
				</div>
			</div>
		</div>
	);
};
