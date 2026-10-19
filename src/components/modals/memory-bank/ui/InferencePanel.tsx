// 模块说明：脱水推演结果展示面板。
// 关键职责：案展示推演结果的四种视图（结构树/时间线/并行居综/预测方向），以及与推演记录的忘式交互。
import { InferenceTreeView, type InferenceTreeNode } from './InferenceTreeView';
import { inferStatusColor, parseTimelineOrder, tabButtonClass } from '../utils';

export type InferenceView = 'tree' | 'timeline' | 'threads' | 'predict';

type InferenceTimelineEvent = {
 time?: string;
 location?: string;
 event: string;
 impact: number;
 phase?: string;
 chapter?: string;
 contextQuote?: string;
};

type InferenceParallelThread = {
 name: string;
 status: string;
 progress: string;
 evidence?: string;
};

type InferencePrediction = {
 direction: string;
 probability?: string;
 suggestion: string;
};

type SafeInferenceData = {
 structureTree?: InferenceTreeNode | null;
 timelineEvents?: InferenceTimelineEvent[];
 parallelThreads?: InferenceParallelThread[];
 predictions?: InferencePrediction[];
};

interface InferencePanelProps {
 activeInference: SafeInferenceData | null;
 inferView: InferenceView;
 onChangeInferView: (view: InferenceView) => void;
 collapsedTreePaths: Set<string>;
 onToggleTreePath: (path: string) => void;
 onResetTreeCollapse: () => void;
 inferenceHistoryOptions: Array<{ id: string; label: string }>;
 activeInferenceHistoryId: string | null;
 onSelectInferenceHistory: (id: string | null) => void;
 activeVersionLabel: string;
 inferenceRunning: boolean;
 onRerun: () => void;
 onClearCurrent: () => void;
 onClearAll: () => void;
 onExportJson: () => void;
 onExportMd: () => void;
}

export function InferencePanel({
 activeInference,
 inferView,
 onChangeInferView,
 collapsedTreePaths,
 onToggleTreePath,
 onResetTreeCollapse,
 inferenceHistoryOptions,
 activeInferenceHistoryId,
 onSelectInferenceHistory,
 activeVersionLabel,
 inferenceRunning,
 onRerun,
 onClearCurrent,
 onClearAll,
 onExportJson,
 onExportMd
}: InferencePanelProps) {
 const treeArcCount = activeInference?.structureTree?.children?.length || 0;
 const timelineCount = activeInference?.timelineEvents?.length || 0;
 const threadCount = activeInference?.parallelThreads?.length || 0;
 const predictionCount = activeInference?.predictions?.length || 0;

 const renderInferenceContent = () => {
 if (!activeInference) {
 return (
 <div className="flex min-h-[560px] items-center justify-center text-[var(--text-muted)]">
 <div className="text-center">
 <div className="mb-2 text-3xl">⛓</div>
 <div className="text-3xl font-semibold text-[var(--text-secondary)]">等待推演数据</div>
 <div className="mt-2 text-sm">请先在左侧选择章节范围，再点击底部按钮开启结构推演。</div>
 <div className="mt-3 text-xs text-[var(--text-muted)]">建议先完成智能整理，推演质量会更稳。</div>
 </div>
 </div>
 );
 }

 if (inferView === 'tree') {
 return (
 <div className="space-y-3">
 {activeInference.structureTree ? (
 <InferenceTreeView
 root={activeInference.structureTree}
 collapsedPaths={collapsedTreePaths}
 onTogglePath={onToggleTreePath}
 />
 ) : (
 <div className="text-[var(--text-muted)]">暂无结构树</div>
 )}
 </div>
 );
 }

 if (inferView === 'timeline') {
 const timelineItems = [...(activeInference.timelineEvents || [])].sort(
 (a, b) => parseTimelineOrder(a.time || '') - parseTimelineOrder(b.time || '')
 );
 return (
 <div className="space-y-3">
 {timelineItems.map((item, idx) => (
 <div
 key={`${item.time}-${idx}`}
 className="wz-insight-card border border-rose-300/85 bg-gradient-to-br from-rose-400/45 via-orange-300/34 to-amber-300/26 p-4 shadow-[0_12px_26px_-16px_rgba(244,63,94,0.85)]"
 >
 <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-primary)]/90">
 <span className="rounded-full border border-rose-200/90 bg-rose-300/35 px-2 py-0.5 text-[14px] text-[var(--text-primary)]">
 {item.phase || item.time || '未定时段'}
 </span>
 <span>{item.chapter || item.location || '当前章节'}</span>
 </div>
 <div className="wz-insight-text text-[15px] leading-7 text-[var(--text-primary)]">{item.event}</div>
 {item.contextQuote ? (
 <div className="mt-2 inline-flex max-w-full items-center rounded-full border border-rose-200/85 bg-rose-300/28 px-2 py-0.5 text-[12px] text-[var(--text-primary)]/95">
 锚点：{item.contextQuote}
 </div>
 ) : null}
 <div className="mt-2 text-[13px] text-[var(--text-primary)]/85">关键程度：{item.impact}</div>
 </div>
 ))}
 {timelineItems.length === 0 ? <div className="text-[var(--text-muted)]">暂无时空事件</div> : null}
 </div>
 );
 }

 if (inferView === 'threads') {
 return (
 <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
 {(activeInference.parallelThreads || []).map((item, idx) => (
 <div
 key={`${item.name}-${idx}`}
 className="wz-insight-card border border-violet-300/85 bg-gradient-to-br from-violet-400/45 via-indigo-400/34 to-sky-400/28 p-4 shadow-[0_12px_28px_-18px_rgba(139,92,246,0.9)]"
 >
 <div className="mb-1 flex items-center justify-between gap-2">
 <div className="wz-insight-title text-[24px] font-bold leading-tight text-[var(--text-primary)]">{item.name}</div>
 <span className={`rounded-full border px-3 py-0.5 text-xs ${inferStatusColor(item.status)}`}>{item.status}</span>
 </div>
 <div className="wz-insight-text text-[15px] text-[var(--text-primary)]/92">{item.progress}</div>
 {item.evidence ? <div className="mt-2 text-[13px] text-[var(--text-primary)]/82">证据：{item.evidence}</div> : null}
 </div>
 ))}
 {(activeInference.parallelThreads || []).length === 0 ? <div className="text-[var(--text-muted)]">暂无并行线索</div> : null}
 </div>
 );
 }

 return (
 <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
 {(activeInference.predictions || []).map((item, idx) => (
 <div
 key={`${item.direction}-${idx}`}
 className="wz-insight-card border border-emerald-300/85 bg-gradient-to-br from-emerald-400/45 via-teal-400/34 to-cyan-400/28 p-4 shadow-[0_12px_28px_-18px_rgba(16,185,129,0.9)]"
 >
 <div className="wz-insight-title mb-2 text-[24px] font-bold leading-tight text-[var(--text-primary)]">{item.direction}</div>
 <div className="wz-insight-text mb-4 text-[15px] leading-7 text-[var(--text-primary)]/92">{item.suggestion}</div>
 <div className="border border-emerald-200/80 bg-emerald-300/34 py-2 text-center text-[15px] font-semibold text-[var(--text-primary)]">
 概率：{item.probability || '中'}
 </div>
 </div>
 ))}
 {(activeInference.predictions || []).length === 0 ? <div className="text-[var(--text-muted)]">暂无预测结果</div> : null}
 </div>
 );
 };

 return (
 <div className="flex-1 overflow-y-auto bg-[var(--bg-secondary)]/55 p-4">
 <div className="border border-[var(--border-color)] bg-[var(--surface)]">
 <div className="border-b border-[var(--border-color)] px-4 py-3">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
 <div>
 <div className="text-lg font-bold text-[var(--text-primary)]">结构推演</div>
 <div className="text-xs text-[var(--text-muted)]">把所选章节压缩成剧情结构、时空事件、并行线索和后续建议。</div>
 </div>
 <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
 <label className="flex items-center gap-2">
 <span className="font-semibold text-[var(--text-secondary)]">推演总览</span>
 <select
 className="max-w-[360px] border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none hover:bg-[var(--surface-strong)] focus:border-[var(--accent)] disabled:opacity-60"
 value={activeInferenceHistoryId || ''}
 onChange={(event) => onSelectInferenceHistory(event.target.value || null)}
 disabled={inferenceHistoryOptions.length === 0}
 >
 <option value="">暂无推演总览</option>
 {inferenceHistoryOptions.map((entry) => (
 <option key={entry.id} value={entry.id}>
 {entry.label}
 </option>
 ))}
 </select>
 </label>
 {activeVersionLabel ? <span>{activeVersionLabel}</span> : null}
 </div>
 </div>

 <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
 {[
 ['主线/支线', treeArcCount],
 ['时空事件', timelineCount],
 ['并行线索', threadCount],
 ['预测建议', predictionCount]
 ].map(([label, value]) => (
 <div key={String(label)} className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
 <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
 <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
 </div>
 ))}
 </div>

 <div className="flex flex-wrap items-center gap-3 text-sm">
 <button
 className={`pb-1 ${tabButtonClass(inferView === 'tree')}`}
 onClick={() => {
 onChangeInferView('tree');
 onResetTreeCollapse();
 }}
 >
 结构树
 </button>
 <button className={`pb-1 ${tabButtonClass(inferView === 'timeline')}`} onClick={() => onChangeInferView('timeline')}>
 时空视图
 </button>
 <button className={`pb-1 ${tabButtonClass(inferView === 'threads')}`} onClick={() => onChangeInferView('threads')}>
 并行线索
 </button>
 <button className={`pb-1 ${tabButtonClass(inferView === 'predict')}`} onClick={() => onChangeInferView('predict')}>
 预测
 </button>
 <button
 className=" border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
 onClick={onRerun}
 disabled={inferenceRunning}
 >
 重新推演
 </button>
 <button className=" border border-red-400/45 px-2 py-1 text-xs text-red-300 hover:bg-red-500/12"onClick={onClearCurrent}>
 删除记录
 </button>
 <button className=" border border-red-400/45 px-2 py-1 text-xs text-red-300 hover:bg-red-500/12"onClick={onClearAll}>
 全部删除
 </button>
 <button className=" border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"onClick={onExportJson}>
 JSON
 </button>
 <button className=" border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"onClick={onExportMd}>
 MD
 </button>
 <button className=" border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)]"disabled>
 PDF
 </button>
 </div>
 </div>
 <div className="p-4">{renderInferenceContent()}</div>
 </div>
 </div>
 );
}
