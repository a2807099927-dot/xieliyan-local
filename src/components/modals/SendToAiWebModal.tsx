// 模块说明：将本书章节打包成纯文本，发送到 AI 网页（ChatGPT / Gemini / AI Studio / Claude）的输入框。
// 关键职责：
// 1. 让用户选范围（全部 / 当前章及前 N 章 / 指定章节区间）
// 2. 让用户选目标 AI 站点
// 3. 把选中章节按 "## 第N章 标题\n\n正文\n\n" 格式拼接成纯文本
// 4. 触发全局事件 writerzen:aiweb-fill，由 AiWebPanel 接管：切 tab + 注入到输入框（不自动发送，留给用户加问题）
// 5. 同时把右侧面板切到 aiweb tab，强制 mount AiWebPanel
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { Book } from '../../types';
import { useBackdropClose } from '../../hooks/useBackdropClose';
import { useIslandStore } from '../../store/useIslandStore';
import { useBookStore } from '../../store/useBookStore';

type RangeMode = 'all' | 'recent' | 'custom';
type SiteId = 'chatgpt' | 'gemini' | 'aistudio' | 'claude';

interface Site {
 id: SiteId;
 label: string;
 color: string;
 /** 单次输入字数软上限（超过提示用户分批），按经验估算 */
 softLimit: number;
}

const SITES: Site[] = [
 { id: 'chatgpt', label: 'ChatGPT', color: '#10a37f', softLimit: 200_000 },
 { id: 'gemini', label: 'Gemini', color: '#4285f4', softLimit: 800_000 },
 { id: 'aistudio', label: 'AI Studio', color: '#1a73e8', softLimit: 800_000 },
 { id: 'claude', label: 'Claude', color: '#d97a47', softLimit: 200_000 },
];

interface Props {
 open: boolean;
 book: Book | null;
 /** 当前章节 id，用于"当前章及前 N 章"模式定位锚点 */
 currentChapterId?: string;
 onClose: () => void;
}

function stripHtml(html: string): string {
 return String(html || '')
 .replace(/<\s*br\s*\/?\s*>/gi, '\n')
 .replace(/<\/\s*p\s*>/gi, '\n\n')
 .replace(/<[^>]+>/g, '')
 .replace(/&nbsp;/g, ' ')
 .replace(/&lt;/g, '<')
 .replace(/&gt;/g, '>')
 .replace(/&amp;/g, '&')
 .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
 .replace(/[\u3000\u00A0]/g, ' ')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
}

export function SendToAiWebModal({ open, book, currentChapterId, onClose }: Props) {
 // P1: 章节正文懒加载——发送前需要全书正文，这里先水合；水合完成前禁用发送，避免导出空章节。
 const [hydrating, setHydrating] = useState(false);
 useEffect(() => {
 if (!open || !book?.id) return;
 let cancelled = false;
 setHydrating(true);
 void useBookStore.getState().ensureBookContentLoaded(book.id).finally(() => {
 if (!cancelled) setHydrating(false);
 });
 return () => { cancelled = true; };
 }, [open, book?.id]);
 const backdropProps = useBackdropClose(onClose);
 const showIsland = useIslandStore((s) => s.show);

 const chapters = book?.chapters ?? [];
 const totalChapters = chapters.length;
 const currentIndex = useMemo(() => {
 if (!currentChapterId) return -1;
 return chapters.findIndex((c) => c.id === currentChapterId);
 }, [chapters, currentChapterId]);

 const [rangeMode, setRangeMode] = useState<RangeMode>('all');
 const [recentCount, setRecentCount] = useState<number>(5);
 const [customFrom, setCustomFrom] = useState<number>(1);
 const [customTo, setCustomTo] = useState<number>(Math.max(1, totalChapters));
 const [siteId, setSiteId] = useState<SiteId>(() => {
 return (localStorage.getItem('xly_send_to_aiweb_site') as SiteId) || 'chatgpt';
 });

 // 关闭后重置（避免下次打开时残留旧值）
 // 打开时初始化输入框默认值（不依赖 rangeMode，避免切换模式时被重置）
 useEffect(() => {
 if (!open) return;
 setCustomFrom(1);
 setCustomTo(Math.max(1, totalChapters));
 setRecentCount(Math.min(5, totalChapters));
 // 不重置 rangeMode/siteId（让用户记忆）
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [open]);

 useEffect(() => {
 localStorage.setItem('xly_send_to_aiweb_site', siteId);
 }, [siteId]);

 // 计算选中的章节区间（基于 rangeMode）
 const selectedRange = useMemo(() => {
 if (totalChapters === 0) return { from: 0, to: -1 };
 if (rangeMode === 'all') {
 return { from: 0, to: totalChapters - 1 };
 }
 if (rangeMode === 'recent') {
 // 当前章及前 N-1 章；如果当前章不存在，回退为最后 N 章
 const anchor = currentIndex >= 0 ? currentIndex : totalChapters - 1;
 const count = Math.max(1, Math.min(recentCount, totalChapters));
 return { from: Math.max(0, anchor - count + 1), to: anchor };
 }
 // custom：1-based 输入框，转 0-based 数组下标
 const f = Math.max(1, Math.min(customFrom, totalChapters)) - 1;
 const t = Math.max(1, Math.min(customTo, totalChapters)) - 1;
 return { from: Math.min(f, t), to: Math.max(f, t) };
 }, [rangeMode, recentCount, customFrom, customTo, totalChapters, currentIndex]);

 const selectedChapters = useMemo(() => {
 if (selectedRange.to < selectedRange.from) return [];
 return chapters.slice(selectedRange.from, selectedRange.to + 1);
 }, [chapters, selectedRange]);

 const packed = useMemo(() => {
 if (selectedChapters.length === 0) return '';
 const lines: string[] = [];
 if (book?.title) lines.push(`# ${book.title}`, '');
 selectedChapters.forEach((ch, i) => {
 const chapterNo = selectedRange.from + i + 1;
 const title = ch.title?.trim() || `第${chapterNo}章`;
 lines.push(`## 第${chapterNo}章 ${title}`, '', stripHtml(ch.content || ''), '');
 });
 return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
 }, [selectedChapters, selectedRange.from, book?.title]);

 const totalChars = packed.length;
 const site = SITES.find((s) => s.id === siteId)!;
 const overSoftLimit = totalChars > site.softLimit;

 const handleSend = () => {
 if (!book) return;
 if (hydrating) {
 showIsland({ type: 'warning', message: '章节正文加载中，请稍候…', autoHideMs: 1500 });
 return;
 }
 if (selectedChapters.length === 0) {
 showIsland({ type: 'error', message: '请先选择至少一章', autoHideMs: 1500 });
 return;
 }
 if (overSoftLimit) {
 const ok = window.confirm(
 `已打包 ${totalChars.toLocaleString('zh-CN')} 字，超过 ${site.label} 单次输入软上限（${site.softLimit.toLocaleString('zh-CN')} 字）。\n\n继续可能被截断或拒绝。是否仍要发送？`
 );
 if (!ok) return;
 }
 // 生成文件名：书名_第N-M章.txt（去掉文件名非法字符）
 const safeTitle = (book.title || '小说').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
 const fromNo = selectedRange.from + 1;
 const toNo = selectedRange.to + 1;
 const filename = fromNo === toNo
 ? `${safeTitle}_第${fromNo}章.txt`
 : `${safeTitle}_第${fromNo}-${toNo}章.txt`;
 // 1. 让 Editor.tsx 把右侧面板切到 aiweb tab（强制 mount）
 window.dispatchEvent(new CustomEvent('writerzen:open-aiweb-tab', { detail: { siteId } }));
 // 2. 等切 tab 完成 + webview 就绪后塞文件（AiWebPanel 内部用 setTimeout 重试）
 window.setTimeout(() => {
 window.dispatchEvent(new CustomEvent('writerzen:aiweb-fill', { detail: { siteId, text: packed, filename } }));
 }, 50);
 showIsland({
 type: 'success',
 message: `已上传到 ${site.label}，请补充提问后发送`,
 autoHideMs: 2800,
 });
 onClose();
 };

 if (!open || !book) return null;

 return (
 <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4" {...backdropProps}>
 <div
 className="w-[min(720px,95vw)] max-h-[88vh] flex flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--surface)] shadow-2xl rounded-2xl"
 onClick={(e) => e.stopPropagation()}
 onMouseDown={(e) => e.stopPropagation()}
 onMouseUp={(e) => e.stopPropagation()}
 >
 <header className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-3.5">
 <div>
 <div className="text-[15px] font-bold text-[var(--text-primary)]">将小说发送至网页助手</div>
 <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">以 .txt 附件形式上传到 AI，由你补充问题后再发送</div>
 </div>
 <button onClick={onClose} className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
 <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
 </button>
 </header>

 <div className="flex-1 overflow-auto p-5 bg-transparent">
 {/* 范围选择 */}
 <section className="mb-4">
 <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">章节范围</div>
 <div className="flex flex-wrap gap-2">
 {([
 { id: 'all', label: '全部章节', hint: `共 ${totalChapters} 章` },
 { id: 'recent', label: '当前章及前 N 章', hint: currentIndex >= 0 ? `从第${Math.max(1, currentIndex - recentCount + 2)}章开始` : '需先打开章节' },
 { id: 'custom', label: '指定章节区间', hint: '手动输入起止' },
 ] as Array<{ id: RangeMode; label: string; hint: string }>).map((opt) => {
 const active = rangeMode === opt.id;
 return (
 <button
 key={opt.id}
 onClick={() => setRangeMode(opt.id)}
 className={clsx(
 'flex flex-col items-start border px-3 py-2 text-left transition-all rounded-xl',
 active
 ? 'border-[var(--accent)]/60 bg-[var(--accent)]/15 text-[var(--text-primary)]'
 : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-tertiary)]'
 )}
 >
 <span className="text-xs font-bold">{opt.label}</span>
 <span className="mt-0.5 text-[10px] text-[var(--text-muted)]">{opt.hint}</span>
 </button>
 );
 })}
 </div>

 {rangeMode === 'recent' && (
 <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
 <span>包含当前章在内的最近</span>
 <input
 type="number"
 min={1}
 max={totalChapters}
 value={recentCount}
 onChange={(e) => setRecentCount(Math.max(1, Math.min(totalChapters, Number(e.target.value) || 1)))}
 className="w-16 border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-center text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded-lg"
 />
 <span>章</span>
 </div>
 )}

 {rangeMode === 'custom' && (
 <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
 <span>从第</span>
 <input
 type="number"
 min={1}
 max={totalChapters}
 value={customFrom}
 onChange={(e) => setCustomFrom(Math.max(1, Math.min(totalChapters, Number(e.target.value) || 1)))}
 className="w-16 border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-center text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded-lg"
 />
 <span>章 至 第</span>
 <input
 type="number"
 min={1}
 max={totalChapters}
 value={customTo}
 onChange={(e) => setCustomTo(Math.max(1, Math.min(totalChapters, Number(e.target.value) || 1)))}
 className="w-16 border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-center text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded-lg"
 />
 <span>章</span>
 </div>
 )}
 </section>

 {/* 目标站点 */}
 <section className="mb-4">
 <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">目标 AI</div>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
 {SITES.map((s) => {
 const active = siteId === s.id;
 return (
 <button
 key={s.id}
 onClick={() => setSiteId(s.id)}
 className={clsx(
 'flex items-center justify-center gap-2 border px-3 py-2 text-xs font-bold transition-all rounded-xl',
 active ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)] font-bold' : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
 )}
 >
 <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
 {s.label}
 </button>
 );
 })}
 </div>
 </section>

 {/* 字数预览 */}
 <section className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 rounded-xl">
 <div className="flex items-center justify-between text-xs">
 <div className="text-[var(--text-secondary)]">
 已选 <span className="font-bold text-[var(--text-primary)]">{selectedChapters.length}</span> 章 ·
 共 <span className="font-bold text-[var(--text-primary)]">{totalChars.toLocaleString('zh-CN')}</span> 字
 </div>
 <div
 className={clsx(
 'px-2 py-0.5 text-[11px] font-bold rounded',
 overSoftLimit ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
 )}
 >
 {overSoftLimit ? `超过 ${site.label} 单次上限` : '在合理范围'}
 </div>
 </div>
 {overSoftLimit && (
 <div className="mt-2 text-[11px] text-amber-500/80">
 建议改用 Gemini / AI Studio（更长上下文），或缩小选区。
 </div>
 )}
 </section>
 </div>

 <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-3.5">
 <button onClick={onClose} className="border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all rounded-xl">
 取消
 </button>
 <button
 onClick={handleSend}
 disabled={selectedChapters.length === 0 || hydrating}
 className={clsx(
 'px-5 py-2 text-xs font-bold text-white shadow-lg transition-all rounded-xl',
 selectedChapters.length === 0
 ? 'cursor-not-allowed bg-[var(--surface-strong)] text-[var(--text-muted)] border border-[var(--border-color)]'
 : 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] shadow-[var(--accent)]/10 hover:brightness-110 active:scale-95'
 )}
 >
 {hydrating ? '正在加载章节…' : `发送至 ${site.label}`}
 </button>
 </footer>
 </div>
 </div>
 );
}
