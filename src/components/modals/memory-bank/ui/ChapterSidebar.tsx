// 模块说明：记忆库弹窗章节側边栏。
// 关键职责：展示章节列表、分析标记、批量选择与关键词搜索，为 MemoryBankModal 提供章节导航支撑。
import type { Chapter } from '../../../../types';

type TabKey = 'plot' | 'inference';

interface ChapterSidebarProps {
 keyword: string;
 onKeywordChange: (value: string) => void;
 onToggleAllVisible: () => void;
 chapterOrder: 'asc' | 'desc';
 onToggleChapterOrder: () => void;
 chapters: Chapter[];
 selectedChapterIds: Set<string>;
 extractedChapterIds: Set<string>;
 activeChapterId: string | null;
 onToggleChapter: (chapterId: string) => void;
 onActivateChapter: (chapterId: string) => void;
 onSelectAllFollowing: (chapterId: string) => void;
 tab: TabKey;
 hasAnalyzing: boolean;
 selectedCount: number;
 inferenceRunning: boolean;
 hasCurrentChapter: boolean;
 rangeStartInput: string;
 rangeEndInput: string;
 onRangeStartInputChange: (value: string) => void;
 onRangeEndInputChange: (value: string) => void;
 onApplyInferenceRange: () => void;
 onBatchAnalyze: () => void;
 onRunInference: () => void;
}

function ChapterRow({
 chapter,
 checked,
 active,
 hasExtracted,
 onToggleChapter,
 onActivateChapter,
 onSelectAllFollowing
}: {
 chapter: Chapter;
 checked: boolean;
 active: boolean;
 hasExtracted: boolean;
 onToggleChapter: (chapterId: string) => void;
 onActivateChapter: (chapterId: string) => void;
 onSelectAllFollowing: (chapterId: string) => void;
}) {
 return (
 <div
 className={`wz-memory-chapter-row group relative flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-sm ${
 active ? 'is-active text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]'
 } ${checked ? 'is-checked bg-[color-mix(in_oklab,var(--accent)_20%,transparent)]' : ''}`}
 onClick={() => onActivateChapter(chapter.id)}
 >
 <button
 type="button"
 className={`wz-memory-select-box h-4 w-4 shrink-0 rounded border ${
 checked ? 'is-checked border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-color)] bg-[var(--surface)]'
 }`}
 onClick={(event) => {
 event.stopPropagation();
 onToggleChapter(chapter.id);
 }}
 title="勾选章节"
 >
 <span className={`block text-[10px] leading-none text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`}>✓</span>
 </button>

 <button
 type="button"
 className="min-w-0 flex-1 truncate text-left"
 onClick={(event) => {
 event.stopPropagation();
 onActivateChapter(chapter.id);
 }}
 title={chapter.title}
 >
 {chapter.title}
 </button>

 <button
 className="text-[10px] text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
 onClick={(event) => {
 event.stopPropagation();
 onSelectAllFollowing(chapter.id);
 }}
 title="全选该章及后续章节"
 >
 全选后续
 </button>

 {hasExtracted ? <span className="text-xs text-[var(--accent)]">✓</span> : null}
 </div>
 );
}

export function ChapterSidebar({
 keyword,
 onKeywordChange,
 onToggleAllVisible,
 chapterOrder,
 onToggleChapterOrder,
 chapters,
 selectedChapterIds,
 extractedChapterIds,
 activeChapterId,
 onToggleChapter,
 onActivateChapter,
 onSelectAllFollowing,
 tab,
 hasAnalyzing,
 selectedCount,
 inferenceRunning,
 hasCurrentChapter,
 rangeStartInput,
 rangeEndInput,
 onRangeStartInputChange,
 onRangeEndInputChange,
 onApplyInferenceRange,
 onBatchAnalyze,
 onRunInference
}: ChapterSidebarProps) {
 return (
 <div
 className="flex shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--surface)]"
 style={{ width: 'min(340px, 29vw)', minWidth: '240px' }}
 >
 <div className="border-b border-[var(--border-color)] p-3">
 <input
 value={keyword}
 onChange={(event) => onKeywordChange(event.target.value)}
 placeholder="搜索章节标题..."
 className="w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
 />
 <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
 <span>勾选章节可批量整理或推演</span>
 <div className="flex items-center gap-2">
 <button
 className="rounded border border-[var(--border-color)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
 onClick={onToggleChapterOrder}
 >
 {chapterOrder === 'asc' ? '正序' : '倒序'}
 </button>
 <button className="text-[var(--accent)] hover:brightness-110"onClick={onToggleAllVisible}>
 全选
 </button>
 </div>
 </div>
 </div>

 <div className="flex-1 space-y-1 overflow-y-auto p-2">
 {chapters.map((chapter) => (
 <ChapterRow
 key={chapter.id}
 chapter={chapter}
 checked={selectedChapterIds.has(chapter.id)}
 active={activeChapterId === chapter.id}
 hasExtracted={extractedChapterIds.has(chapter.id)}
 onToggleChapter={onToggleChapter}
 onActivateChapter={onActivateChapter}
 onSelectAllFollowing={onSelectAllFollowing}
 />
 ))}
 </div>

 <div className="border-t border-[var(--border-color)] p-3">
 {tab === 'plot' ? (
 <button
 data-guide-target="memory-bank-generate"
 className="w-full bg-[var(--accent)] py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
 disabled={selectedCount === 0 || hasAnalyzing}
 onClick={onBatchAnalyze}
 >
 {hasAnalyzing ? '智能整理中...' : `智能整理（${selectedCount}章）`}
 </button>
 ) : null}

 {tab === 'inference' ? (
 <>
 <div className="mb-2 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
 结构推演支持手动输入起始章和结束章，系统按每 5 章一批请求并最终合并结果。
 </div>

 <div className="mb-2 grid grid-cols-2 gap-1.5">
 <label className="flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1">
 <span className="text-[10px] text-[var(--text-muted)]">起始</span>
 <input
 value={rangeStartInput}
 onChange={(event) => onRangeStartInputChange(event.target.value)}
 inputMode="numeric"
 className="w-full min-w-0 bg-transparent text-xs text-[var(--text-primary)] outline-none"
 placeholder="1"
 />
 </label>
 <label className="flex items-center gap-1 rounded border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1">
 <span className="text-[10px] text-[var(--text-muted)]">结束</span>
 <input
 value={rangeEndInput}
 onChange={(event) => onRangeEndInputChange(event.target.value)}
 inputMode="numeric"
 className="w-full min-w-0 bg-transparent text-xs text-[var(--text-primary)] outline-none"
 placeholder="10"
 />
 </label>
 </div>

 <button
 className="mb-2 w-full rounded border border-[var(--border-color)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-60"
 onClick={onApplyInferenceRange}
 disabled={!hasCurrentChapter || inferenceRunning}
 >
 应用章节范围
 </button>

 <button
 className="w-full bg-[var(--accent)] py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
 disabled={!hasCurrentChapter || selectedCount === 0 || inferenceRunning}
 onClick={onRunInference}
 >
 {inferenceRunning ? '结构推演中...' : `开启结构推演（${selectedCount}章）`}
 </button>
 </>
 ) : null}
 </div>
 </div>
 );
}
