// 模块说明：功能=AI 诊断日志视图标签页；架构=当前会话 AI 请求/响应日志展示层。
import { useEffect, useState, useRef } from 'react';
import { clsx } from 'clsx';
import { electronAPI } from '../../../utils/electron';

interface AiLogEntry {
 id: string;
 timestamp: string;
 type: 'request' | 'response' | 'error';
 content: any;
 provider?: string;
 model?: string;
}

function normalizeLogState(log: AiLogEntry): {
 label: string;
 badgeClass: string;
 shortCode: string;
} {
 const content = typeof log.content === 'string' ? log.content : '';
 if (content.includes('REQUEST_ABORTED')) {
 return {
 label: '请求已取消',
 badgeClass: 'bg-amber-500/20 text-amber-400',
 shortCode: 'CAN'
 };
 }
 if (content.includes('REQUEST_IN_PROGRESS')) {
 return {
 label: '请求被拦截',
 badgeClass: 'bg-orange-500/20 text-orange-400',
 shortCode: 'BUS'
 };
 }
 if (log.type === 'request') {
 return {
 label: '发送请求',
 badgeClass: 'bg-blue-500/20 text-blue-400',
 shortCode: 'REQ'
 };
 }
 if (log.type === 'response') {
 return {
 label: '成功收到',
 badgeClass: 'bg-emerald-500/20 text-emerald-400',
 shortCode: 'RES'
 };
 }
 return {
 label: '调用错误',
 badgeClass: 'bg-rose-500/20 text-rose-400',
 shortCode: 'ERR'
 };
}

export function AiLogTab() {
 const [logs, setLogs] = useState<AiLogEntry[]>([]);
 const [loading, setLoading] = useState(true);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const scrollRef = useRef<HTMLDivElement>(null);

 const fetchLogs = async () => {
 try {
 const data = await electronAPI.ai.getLogs();
 setLogs(data);
 } catch (err) {
 console.error('Failed to fetch logs:', err);
 } finally {
 setLoading(false);
 }
 };

 const clearLogs = async () => {
 if (!window.confirm('确定要清空当前的 AI 日志吗？')) return;
 try {
 await electronAPI.ai.clearLogs();
 setLogs([]);
 } catch (err) {
 console.error('Failed to clear logs:', err);
 }
 };

 useEffect(() => {
 void fetchLogs();
 const timer = setInterval(fetchLogs, 3000); // Auto refresh every 3s
 return () => clearInterval(timer);
 }, []);

 const formatContent = (content: any) => {
 if (typeof content === 'string') {
 try {
 const parsed = JSON.parse(content);
 return JSON.stringify(parsed, null, 2);
 } catch {
 return content;
 }
 }
 return JSON.stringify(content, null, 2);
 };

 return (
 <div className="flex flex-col h-full space-y-4">
 <div className="flex items-center justify-between">
 <div className="flex flex-col border-l-2 border-[var(--accent)] pl-3">
 <span className="text-sm font-black tracking-widest text-[var(--accent)] uppercase">Session Diagnostics</span>
 <span className="text-xs text-[var(--text-muted)] mt-0.5">仅记录当前会话内容，重启软件后即刻销毁</span>
 </div>
 <button 
 onClick={() => void clearLogs()}
	className="flex items-center gap-2 border border-[var(--border-color)] bg-[var(--surface)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] transition-all hover:bg-rose-500/20 hover:text-rose-600 hover:border-rose-500/30"
 >
 <svg className="w-4 h-4"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2.5">
 <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
 </svg>
 清空当前日志
 </button>
 </div>

 <div 
 ref={scrollRef}
	className="flex-1 overflow-auto border border-[var(--border-color)] bg-[var(--surface)] p-2 custom-scrollbar space-y-2 min-h-[400px]"
 >
 {loading && logs.length === 0 ? (
 <div className="flex h-full items-center justify-center text-[var(--text-muted)] text-sm italic">
 正在读取日志文件...
 </div>
 ) : logs.length === 0 ? (
 <div className="flex h-full flex-col items-center justify-center space-y-3 py-20 opacity-30">
 <svg className="w-12 h-12 text-[var(--text-muted)]"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1">
 <rect x="2"y="3"width="20"height="18"rx="2"ry="2"/>
 <line x1="16"y1="8"x2="8"y2="8"/><line x1="16"y1="12"x2="8"y2="12"/><line x1="16"y1="16"x2="8"y2="16"/>
 </svg>
 <span className="text-sm font-medium">暂无 AI 活动记录</span>
 </div>
 ) : (
 logs.map((log) => (
 <div 
 key={log.id} 
 className={clsx(
 "border transition-all duration-300 overflow-hidden",
	expandedId === log.id 
	? "bg-[var(--surface-strong)] border-[var(--accent)]/30 shadow-xl"
	: "bg-[var(--surface)] border-[var(--border-color)] hover:border-[var(--accent)]/25 hover:bg-[var(--surface-strong)]"
 )}
 >
 {(() => {
 const state = normalizeLogState(log);
 return (
 <button 
 className="flex w-full items-center gap-3 p-3 text-left"
 onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
 >
 <div className={clsx(
 "flex h-9 w-9 items-center justify-center text-xs font-black uppercase",
 state.badgeClass
 )}>
 {state.shortCode}
 </div>
 <div className="flex flex-col flex-1 overflow-hidden">
 <div className="flex items-center gap-2">
 <span className="text-sm font-bold text-[var(--text-primary)]">
 {state.label}
 </span>
 <span className="text-xs font-medium text-[var(--text-muted)] opacity-60">
 {new Date(log.timestamp).toLocaleTimeString()}
 </span>
 </div>
 <div className="truncate text-xs text-[var(--text-secondary)] opacity-60">
 {log.provider ? `[${log.provider}] ` : ''}{log.model ? `${log.model}: ` : ''}
 {typeof log.content === 'string' ? log.content.slice(0, 150) : JSON.stringify(log.content).slice(0, 150)}
 </div>
 </div>
	<svg className={clsx("w-4 h-4 text-[var(--text-muted)] transition-transform", expandedId === log.id && "rotate-180")} viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
	<path d="M6 9l6 6 6-6"/>
	</svg>
 </button>
 );
 })()}

 {expandedId === log.id && (
	<div className="border-t border-[var(--border-color)] bg-[var(--surface-strong)] p-4">
	<pre className="whitespace-pre-wrap text-[13px] font-mono leading-relaxed text-[var(--text-secondary)] selection:bg-indigo-500/30">
	{formatContent(log.content)}
	</pre>
	</div>
 )}
 </div>
 )).reverse()
 )}
 </div>
 </div>
 );
}
