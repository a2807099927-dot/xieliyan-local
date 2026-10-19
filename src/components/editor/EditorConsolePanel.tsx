// 模块说明：编辑器底部的 IDE 风格终端/控制台面板。
// 关键职责：
//  1) 展示 AI Agent / 智能润色 / 自动工坊 / 自动保存等关键事件的实时日志。
//  2) 视觉对齐 VS Code integrated terminal：深色背景 + 等宽字体 + 多色级别标签。
//  3) 可折叠（顶部按钮）、可清空、按级别筛选。
// 维护边界：
//  - 仅订阅 window 事件 'writerzen:console-log'（任意业务模块可推送）。
//  - 不在内部进行任何 API 调用，仅渲染。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { ChronoIcon } from '../common/ChronoIcon';

export type ConsoleLevel = 'info' | 'success' | 'warn' | 'error' | 'code' | 'ai';

export interface ConsoleLogEntry {
 id: string;
 ts: number;
 level: ConsoleLevel;
 source?: string;
 message: string;
}

const LEVEL_META: Record<ConsoleLevel, { label: string; color: string; bg: string }> = {
 info: { label: 'INFO', color: '#8b9bb4', bg: 'rgba(139,155,180,0.12)' },
 success: { label: 'OK', color: '#4ec9a0', bg: 'rgba(78,201,160,0.12)' },
 warn: { label: 'WARN', color: '#d7ba7d', bg: 'rgba(215,186,125,0.12)' },
 error: { label: 'ERR', color: '#f48771', bg: 'rgba(244,135,113,0.16)' },
 code: { label: 'FIX', color: '#569cd6', bg: 'rgba(86,156,214,0.14)' },
 ai: { label: 'AI', color: '#c586c0', bg: 'rgba(197,134,192,0.14)' }
};

const DEFAULT_FILTERS: ConsoleLevel[] = ['info', 'success', 'warn', 'error', 'code', 'ai'];

function formatTime(ts: number): string {
 const date = new Date(ts);
 const pad = (value: number) => String(value).padStart(2, '0');
 return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function makeId(): string {
 return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface EditorConsolePanelProps {
 className?: string;
 /** 起始是否展开（默认 true，可以被持久化覆盖） */
 defaultOpen?: boolean;
 /** 收起时高度（默认 28px） */
 collapsedHeight?: number;
 /** 展开时高度（默认 180px） */
 expandedHeight?: number;
}

export function EditorConsolePanel({
 className,
 defaultOpen = true,
 collapsedHeight = 28,
 expandedHeight = 180
}: EditorConsolePanelProps) {
 const [open, setOpen] = useState(defaultOpen);
 const [entries, setEntries] = useState<ConsoleLogEntry[]>(() => seedEntries());
 const [filters, setFilters] = useState<Set<ConsoleLevel>>(new Set(DEFAULT_FILTERS));
 const [autoFollow, setAutoFollow] = useState(true);
 const scrollRef = useRef<HTMLDivElement | null>(null);

 // 订阅外部 log 事件
 useEffect(() => {
 const onLog = (event: Event) => {
 const detail = (event as CustomEvent).detail || {};
 const entry: ConsoleLogEntry = {
 id: makeId(),
 ts: Date.now(),
 level: (detail.level as ConsoleLevel) || 'info',
 source: typeof detail.source === 'string' ? detail.source : undefined,
 message: typeof detail.message === 'string' ? detail.message : ''
 };
 if (!entry.message) return;
 setEntries(prev => {
 const next = [...prev, entry];
 // 最多保留 200 条，避免内存膨胀
 return next.length > 200 ? next.slice(next.length - 200) : next;
 });
 };
 window.addEventListener('writerzen:console-log', onLog as EventListener);
 return () => window.removeEventListener('writerzen:console-log', onLog as EventListener);
 }, []);

 // 自动跟随
 useEffect(() => {
 if (!autoFollow || !open) return;
 const el = scrollRef.current;
 if (el) el.scrollTop = el.scrollHeight;
 }, [entries, autoFollow, open]);

 const visibleEntries = useMemo(
 () => entries.filter(entry => filters.has(entry.level)),
 [entries, filters]
 );

 const toggleFilter = useCallback((level: ConsoleLevel) => {
 setFilters(prev => {
 const next = new Set(prev);
 if (next.has(level)) next.delete(level);
 else next.add(level);
 return next;
 });
 }, []);

 const clearAll = useCallback(() => setEntries([]), []);

 const stats = useMemo(() => {
 const counts: Record<ConsoleLevel, number> = {
 info: 0, success: 0, warn: 0, error: 0, code: 0, ai: 0
 };
 for (const e of entries) counts[e.level] += 1;
 return counts;
 }, [entries]);

 return (
 <div
 className={clsx('wz-ide-console', !open && 'is-collapsed', className)}
 style={{
 height: open ? expandedHeight : collapsedHeight
 }}
 >
 {/* Header */}
 <div className="wz-ide-console-header">
 <button
 type="button"
 className="wz-ide-console-toggle"
 onClick={() => setOpen(o => !o)}
 title={open ? '收起控制台' : '展开控制台'}
 >
 <ChronoIcon name={open ? 'chevron-down' : 'chevron-up'} size={11} />
 <span className="label">控制台</span>
 <span className="count">{entries.length}</span>
 </button>

 <div className="wz-ide-console-tabs">
 <TabButton label="问题" count={stats.error + stats.warn} dot="orange" />
 <TabButton label="输出" count={entries.length} dot="green" active />
 <TabButton label="终端" count={0} dot="muted" />
 <TabButton label="调试" count={stats.ai} dot="purple" />
 </div>

 <div className="wz-ide-console-actions">
 {DEFAULT_FILTERS.map(level => (
 <button
 key={level}
 type="button"
 onClick={() => toggleFilter(level)}
 className={clsx('wz-ide-console-filter', `is-${level}`, !filters.has(level) && 'off')}
 title={`切换 ${LEVEL_META[level].label} 过滤`}
 >
 <span className="dot" />
 <span className="text">{LEVEL_META[level].label}</span>
 {stats[level] > 0 ? <span className="n">{stats[level]}</span> : null}
 </button>
 ))}

 <button
 type="button"
 className="wz-ide-console-icon-btn"
 onClick={() => setAutoFollow(v => !v)}
 title={autoFollow ? '自动跟随：开' : '自动跟随：关'}
 >
 <ChronoIcon name="arrow-down" size={11} />
 </button>
 <button
 type="button"
 className="wz-ide-console-icon-btn"
 onClick={clearAll}
 title="清空"
 >
 <ChronoIcon name="trash" size={11} />
 </button>
 </div>
 </div>

 {/* Body */}
 {open && (
 <div ref={scrollRef} className="wz-ide-console-body custom-scrollbar">
 {visibleEntries.length === 0 ? (
 <div className="wz-ide-console-empty">
 {entries.length === 0 ? '反馈面板会在你保存、启动 Agent、智能润色、自动工坊时输出进度。' : '当前过滤下没有日志。'}
 </div>
 ) : (
 visibleEntries.map(entry => {
 const meta = LEVEL_META[entry.level];
 return (
 <div
 key={entry.id}
 className={clsx('wz-ide-console-line', `is-${entry.level}`)}
 style={{ background: meta.bg }}
 >
 <span className="ts">{formatTime(entry.ts)}</span>
 <span className="badge" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
 {entry.source ? <span className="src">[{entry.source}]</span> : null}
 <span className="msg">{entry.message}</span>
 </div>
 );
 })
 )}
 </div>
 )}
 </div>
 );
}

function TabButton({ label, count, dot, active }: { label: string; count: number; dot: 'green' | 'orange' | 'purple' | 'muted'; active?: boolean }) {
 const color = {
 green: '#4ec9a0',
 orange: '#d7ba7d',
 purple: '#c586c0',
 muted: '#5a5e6b'
 }[dot];
 return (
 <button type="button" className={clsx('wz-ide-console-tab', active && 'on')}>
 {dot !== 'muted' && <span className="dot" style={{ background: color }} />}
 <span className="label">{label}</span>
 {count > 0 ? <span className="count">{count}</span> : null}
 </button>
 );
}

function seedEntries(): ConsoleLogEntry[] {
 const now = Date.now();
 const items: Array<{ lv: ConsoleLevel; src: string; msg: string; ago: number }> = [
 { lv: 'info', src: '编辑器', msg: '加载章节内容…', ago: 60_000 },
 { lv: 'success', src: '存入', msg: '本章已保存至本地', ago: 30_000 },
 { lv: 'code', src: '代码修正', msg: '初始化自动保存任务', ago: 28_000 },
 { lv: 'ai', src: 'Agent', msg: 'read_chapter - 读取第 542 章', ago: 12_000 },
 { lv: 'ai', src: 'Agent', msg: 'search_memory - 从记忆库访问 3 条引用', ago: 10_000 },
 { lv: 'success', src: 'Agent', msg: '已返回为下一章做准备', ago: 8_000 }
 ];
 return items.map(item => ({
 id: makeId(),
 ts: now - item.ago,
 level: item.lv,
 source: item.src,
 message: item.msg
 }));
}

// 供其他模块主动推送日志的公共 API
export function pushConsoleLog(level: ConsoleLevel, message: string, source?: string): void {
 if (typeof window === 'undefined') return;
 window.dispatchEvent(new CustomEvent('writerzen:console-log', {
 detail: { level, message, source }
 }));
}
