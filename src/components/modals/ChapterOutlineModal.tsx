// 模块说明：功能=本章细纲编辑弹窗；架构=基于章节持久化的细纲输入与生命周期管理。
import { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ChapterOutlineModalProps {
 open: boolean;
 initialOutline: string;
 onCancel: () => void;
 onSave: (finalOutline: string) => void;
 onClear: () => void;
}

export function ChapterOutlineModal({ open, initialOutline, onCancel, onSave, onClear }: ChapterOutlineModalProps) {
 const [outline, setOutline] = useState(initialOutline || '');
 const [confirmClear, setConfirmClear] = useState(false);
 const textareaRef = useRef<HTMLTextAreaElement | null>(null);

 useEffect(() => {
 if (!open) return;
 setOutline(initialOutline || '');
 setConfirmClear(false);
 // 只在打开瞬间读取外部细纲，避免打开期间的异步刷新把正在编辑的草稿覆盖为空。
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [open]);

 useEffect(() => {
 if (!open) return;
 const frame = requestAnimationFrame(() => {
 const textarea = textareaRef.current;
 if (!textarea) return;
 const end = textarea.value.length;
 textarea.focus();
 textarea.setSelectionRange(end, end);
 textarea.scrollTop = textarea.scrollHeight;
 });
 return () => cancelAnimationFrame(frame);
 }, [open]);

 const handleSave = () => {
 onSave(outline.trim());
 };

 const handleClear = () => {
 setConfirmClear(false);
 setOutline('');
 onClear();
 };

 useEscapeKey(onCancel, open);

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
 <section
  className="flex w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-2xl"
 onClick={(event) => event.stopPropagation()}
 >
 <header className="flex h-16 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6">
 <div className="flex items-center gap-3">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
 <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
 </div>
 <div className="flex flex-col">
 <h3 className="text-[15px] font-bold tracking-wide text-[var(--text-primary)]">本章细纲写作</h3>
 <span className="text-[11px] font-medium text-[var(--text-muted)]">AI 续写与剧情推演的核心骨架</span>
 </div>
 </div>
 <button 
 className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
 onClick={onCancel}
 >
 <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
 </button>
 </header>

 <div className="relative flex flex-col px-6 py-5 bg-transparent">
 <textarea
 ref={textareaRef}
 className="min-h-[420px] w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-5 py-4 text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] shadow-inner transition-all"
 value={outline}
 onChange={(event) => setOutline(event.target.value)}
 placeholder={`💡 细纲写作提示：\n\n1. 核心转折：写下本章的情节高潮或转折点。\n2. 人物登场：标注需要出现的角色及其关键表现。\n3. 本章目标：设定本章结束时主角必须达成的状态或获得的线索。`}
 />
 <div className="absolute bottom-8 right-10 pointer-events-none text-[10px] font-mono text-[var(--text-muted)] opacity-50">
 {outline.length} 字符
 </div>
 </div>

 <footer className="flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
 {confirmClear ? (
  <div className="flex w-full items-center justify-between">
 <div className="flex items-center gap-2 text-sm font-bold text-rose-500">
 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
 确定清空本章细纲吗？此操作无法撤销。
 </div>
 <div className="flex gap-3">
 <button
 className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] px-5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
 onClick={() => setConfirmClear(false)}
 >
 取消
 </button>
 <button
 className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/10 hover:shadow-rose-600/20 transition-all hover:bg-rose-500 active:scale-95"
 onClick={handleClear}
 >
 确认清空
 </button>
 </div>
 </div>
 ) : (
 <>
 <button
 className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] transition-colors hover:text-rose-500"
 onClick={() => setConfirmClear(true)}
 >
 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
 清空细纲
 </button>
 <div className="flex gap-3">
 <button
 className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-8 py-2.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[var(--accent)]/15 transition-all hover:brightness-110 active:scale-95"
 onClick={handleSave}
 >
 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
 保存并完成
 </button>
 </div>
 </>
 )}
 </footer>
 </section>
 </div>
 );
}
