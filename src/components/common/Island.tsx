// Island.tsx - Floating status island component for async task feedback.
import { clsx } from 'clsx';
import { zhCN } from '../../i18n/zh-CN';
import { IslandEntry, useIslandStore } from '../../store/useIslandStore';

function getTone(type: IslandEntry['type']) {
 return {
 progress: 'border-cyan-400/25 bg-[var(--surface-strong)] text-[var(--text-primary)]',
 success: 'border-emerald-400/35 bg-emerald-500/[0.10] text-emerald-700',
 warning: 'border-amber-400/35 bg-amber-500/[0.10] text-amber-700',
 error: 'border-rose-400/35 bg-rose-500/[0.10] text-rose-700',
 save: 'border-indigo-400/35 bg-indigo-500/[0.10] text-indigo-700'
 }[type];
}

function getDynamicLabel(entry: IslandEntry) {
 const direct = (entry.message || '').trim();
 if (direct) return direct;

 const packs = {
 connecting: ['正在发送请求...', '正在建立连接...', '正在唤醒 AI...'],
 memoizing: ['正在检索记忆...', '正在锁定剧情...', '正在装载档案...'],
 thinking: ['AI 正在思考...', '正在组织结构...', '正在梳理逻辑...'],
 streaming: ['AI 正在生成...', '文本流式返回中...', '正在落笔成文...'],
 writing: ['正在捕捉信息...', '正在检索内容...', '正在生成回复...'],
 feedback: {
 success: ['处理完成', '已经就绪', '操作成功'],
 warning: ['请留意细节', '建议检查结果', '请确认后继续'],
 error: ['链路异常', '请求受阻', '请重试'],
 default: ['状态更新', '操作回传', '处理结束']
 },
 idle: ['灵动岛待命', '准备就绪', '随时可用']
 } as const;

 const seed = `${entry.type}-${entry.status}-${entry.detail || ''}`.length;
 if (entry.status === 'connecting') return packs.connecting[seed % packs.connecting.length];
 if (entry.status === 'memoizing') return packs.memoizing[seed % packs.memoizing.length];
 if (entry.status === 'thinking') return packs.thinking[seed % packs.thinking.length];
 if (entry.status === 'streaming') return packs.streaming[seed % packs.streaming.length];
 if (entry.status === 'writing') return packs.writing[seed % packs.writing.length];
 if (entry.status === 'feedback') {
 if (entry.type === 'success') return packs.feedback.success[seed % packs.feedback.success.length];
 if (entry.type === 'warning') return packs.feedback.warning[seed % packs.feedback.warning.length];
 if (entry.type === 'error') return packs.feedback.error[seed % packs.feedback.error.length];
 return packs.feedback.default[seed % packs.feedback.default.length];
 }
 return packs.idle[seed % packs.idle.length] || zhCN.island.idle;
}

function IslandCard({ entry, onHide }: { entry: IslandEntry; onHide: (id: string) => void }) {
 const isActive = entry.status !== 'idle' && entry.status !== 'feedback';
 const safeDetail = (entry.detail || '').trim();
 const label = getDynamicLabel(entry);

 return (
 <div
 className={clsx(
 'wz-island-card pointer-events-auto relative flex min-h-[42px] max-w-[min(600px,90vw)] items-center gap-3 rounded-[22px] border px-4 py-1.5 transition-all duration-300 ease-out',
 entry.status === 'idle' ? 'min-w-[140px]' : 'min-w-[220px]',
 isActive ? 'wz-island-card-active border-cyan-300/30 bg-[var(--surface-strong)]' : 'border-[var(--border-color)] bg-[var(--surface-strong)]',
 !isActive && getTone(entry.type)
 )}
 >
 {/* 轻霓虹描边：不抢戏，但比纯黑球醒目 */}
 <div className="wz-island-neon-ring" aria-hidden />
 <div className="absolute inset-0 -z-10 overflow-hidden rounded-[21px]">
 {isActive ? <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/[0.07] via-violet-400/[0.05] to-fuchsia-400/[0.06]" /> : null}
	<div className="absolute inset-[1px] rounded-[20px] bg-gradient-to-b from-[var(--surface-strong)] to-transparent" />
 </div>

 <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
 {entry.status === 'thinking' || entry.status === 'memoizing' ? (
 <div className="wz-island-spinner absolute inset-0 animate-spin rounded-full border-[2.5px] border-transparent border-t-cyan-300 border-r-violet-300/80" />
 ) : (
 <div
 className={clsx(
 'h-2.5 w-2.5 rounded-full',
 isActive ? 'wz-island-dot-active' : 'wz-island-dot'
 )}
 />
 )}
 </div>

 <div className="min-w-0 flex-1 py-0.5 wz-sharp-label">
 <div className="truncate text-[13px] font-semibold tracking-wide text-[var(--text-primary)]">{label}</div>
 {safeDetail && entry.status !== 'idle' ? <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-[var(--text-secondary)]/85">{safeDetail.slice(0, 120)}</div> : null}
 </div>

 {entry.actions && entry.actions.length > 0 ? (
 <div className="ml-2 flex shrink-0 items-center gap-1.5">
 {entry.actions.map((action) => (
 <button
 key={action.id}
 className="border border-cyan-500/30 bg-cyan-500/[0.10] px-2.5 py-1 text-[10px] font-bold text-cyan-700 transition-all hover:scale-105 hover:border-cyan-500/45 hover:bg-cyan-500/20 active:scale-95"
 onClick={() => action.onClick()}
 >
 {action.label}
 </button>
 ))}
 </div>
 ) : null}

 {!entry.locked ? (
 <button className="ml-3 shrink-0 rounded-full bg-[var(--surface)] p-1.5 text-[var(--text-muted)] transition-all hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] active:scale-90" onClick={() => onHide(entry.id)}>
 <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
 <path d="M18 6 6 18M6 6l12 12" />
 </svg>
 </button>
 ) : null}
 </div>
 );
}

export function Island() {
 const { entries, visible, hide } = useIslandStore((s) => ({
 entries: s.entries,
 visible: s.visible,
 hide: s.hide
 }));
 if (!visible || entries.length === 0) return null;

 return (
 <div className="pointer-events-none fixed left-1/2 top-6 z-[9999] flex flex-col gap-2" style={{ transform: 'translate3d(-50%, 0, 0)' }}>
 {entries.map((entry) => (
 <IslandCard key={entry.id} entry={entry} onHide={hide} />
 ))}
 </div>
 );
}

export function useIsland() {
 const show = useIslandStore((s) => s.show);
 const hide = useIslandStore((s) => s.hide);
 const startTask = useIslandStore((s) => s.startTask);
 const updateTask = useIslandStore((s) => s.updateTask);
 const finishTask = useIslandStore((s) => s.finishTask);
 return { show, hide, startTask, updateTask, finishTask };
}
