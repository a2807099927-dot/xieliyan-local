// 模块说明：编辑器内嵌的迷你书架。
// 关键职责：在编辑视图侧边快速切换书籍。
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { Book } from '../../types';
import { toAssetUrl } from '../../utils/assetUrl';

interface MiniBookshelfProps {
	books: Book[];
	activeBookId?: string;
}

function fallbackLabel(title: string): string {
	return String(title || '书').trim().slice(0, 1) || '书';
}

function latestChapterId(book: Book): string | undefined {
	if (!book.chapters || !book.chapters.length) return undefined;
	return book.chapters[book.chapters.length - 1]?.id;
}

export function MiniBookshelf({ books, activeBookId }: MiniBookshelfProps) {
	const openEditor = useAppStore((s) => s.openEditor);
	const tabs = useAppStore((s) => s.editorTabs);

	const handleBookClick = (bookId: string, chapterId?: string) => {
		try {
			openEditor(bookId, chapterId);
		} catch (err) {
			console.error('[MiniBookshelf] openEditor failed:', err);
		}
	};

	return (
		<div className="mb-3 px-1 py-2 overflow-hidden">
			<div className="wz-mini-bookshelf-container flex min-w-0 items-center gap-3 overflow-x-auto overflow-y-hidden py-1.5 [scrollbar-width:none]">
				{books.map((book, index) => {
					const coverUrl = toAssetUrl(book.cover);
					// 章节级标签下，一本书可能对应多个标签，取最后一个（最近打开的），
					// 与 useAppStore.openEditor 内的默认行为保持一致，避免跳回旧章节
					const bookTabs = tabs.filter((item) => item.bookId === book.id);
					const tab = bookTabs[bookTabs.length - 1];
					const targetChapterId = tab?.chapterId ?? latestChapterId(book);
					const active = book.id === activeBookId;

					const activeIndex = books.findIndex((b) => b.id === activeBookId);
					const N = books.length;

					// 计算循环旋转门位置 (不重新排布 DOM 元素，实现完美滑动过渡)
					let diff = index - activeIndex;
					if (N > 0) {
						if (diff > N / 2) diff -= N;
						if (diff < -N / 2) diff += N;
					}

					const isVisible = Math.abs(diff) <= 2;

					let scale = '0.88';
					let rotateY = '0deg';
					let tx = '0px';
					let ty = '0px';
					let tz = '0px';
					let opacity = '0.6';
					let zIndex = 0;
					let pointerEvents = 'auto';

					if (!isVisible) {
						scale = '0';
						opacity = '0';
						zIndex = -1;
						pointerEvents = 'none';
					} else if (active) {
						scale = '1.08';
						rotateY = '0deg';
						tx = '0px';
						ty = '0px';
						tz = '10px';
						opacity = '1';
						zIndex = 10;
					} else if (diff < 0) {
						scale = '0.88';
						rotateY = '18deg';
						tx = '4px';
						ty = '0px';
						tz = '-15px';
						opacity = '0.65';
						zIndex = Math.max(1, 5 + diff);
					} else {
						scale = '0.88';
						rotateY = '-18deg';
						tx = '-4px';
						ty = '0px';
						tz = '-15px';
						opacity = '0.65';
						zIndex = Math.max(1, 5 - diff);
					}

					const slotOffset = `${diff * 58.5}px`;

					const style = {
						'--mb-scale': scale,
						'--mb-rotate-y': rotateY,
						'--mb-tx': tx,
						'--mb-ty': ty,
						'--mb-tz': tz,
						'--mb-opacity': opacity,
						'--mb-z-index': zIndex,
						'--mb-slot-offset': slotOffset,
						'--mb-pointer-events': pointerEvents,
					} as React.CSSProperties;

					return (
						<button
							key={book.id}
							style={style}
							className={clsx(
								'wz-mini-bookshelf-item group flex h-[62px] aspect-[3/4] shrink-0 items-center justify-center overflow-hidden border text-xs font-bold rounded-none shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]',
								active
									? 'wz-active border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
									: 'border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]'
							)}
							title={book.title}
							onClick={() => handleBookClick(book.id, targetChapterId)}
						>
							{coverUrl ? (
								<img
									src={coverUrl}
									alt=""
									className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									loading="lazy"
									draggable={false}
								/>
							) : (
								<span className="px-1 text-sm font-semibold">{fallbackLabel(book.title)}</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
