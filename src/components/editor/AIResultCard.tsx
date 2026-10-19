// AIResultCard 
import React from 'react';

export interface AIResultCardProps {
 /**
 * Section title shown above content block.
 */
 title: string;
 /**
 * Text content to display.
 */
 content: string;
 /**
 * Visual tone for different result kinds.
 */
 tone?: 'rose' | 'indigo' | 'amber';
}

/**
 * Reusable result section used by AI comparison cards.
 */
export function AIResultCard({ title, content, tone = 'indigo' }: AIResultCardProps): JSX.Element {
	const theme =
	tone === 'rose'
	? {
	titleClass: 'text-rose-600/80',
	bodyClass: 'border-rose-500/15 bg-rose-500/5 text-[var(--text-secondary)]'
	}
	: tone === 'amber'
	? {
	titleClass: 'text-amber-600/80',
	bodyClass: 'border-amber-500/10 bg-amber-500/5 text-[var(--text-secondary)]'
	}
	: {
	titleClass: 'text-indigo-600/80',
	bodyClass: 'border-indigo-500/15 bg-indigo-500/5 text-[var(--text-secondary)]'
	};

 return (
 <div>
 <div className={`mb-1 text-[11px] font-semibold tracking-wide uppercase ${theme.titleClass}`}>{title}</div>
 <div className={` border px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${theme.bodyClass}`}>
 {content}
 </div>
 </div>
 );
}

