// ContinuationDetached.tsx - Detached window for reviewing and accepting AI continuation paragraphs.
import { useEffect, useState } from 'react';
import { electronAPI } from '../utils/electron';
import { normalizeAiErrorMessage, normalizeNovelOutput } from '../utils/editorUtils';

type ContinuationViewState = {
 bookId: string;
 chapterId: string;
 title: string;
 elapsedMs: number;
 paragraphs: string[];
 selected: number[];
 editingIndex: number | null;
 retryRequest?: {
 messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
 maxTokens?: number;
 disableRag?: boolean;
 disableStyle?: boolean;
 };
};

export function ContinuationDetachedPage() {
 const [state, setState] = useState<ContinuationViewState | null>(null);
 const [retrying, setRetrying] = useState(false);

 useEffect(() => {
 let active = true;
 void electronAPI.system.getContinuationWindowState().then((res) => {
 if (!active) return;
 setState((res as any)?.state || null);
 });
 return () => {
 active = false;
 };
 }, []);

 if (!state) {
 return (
 <div className="flex h-screen w-screen items-center justify-center bg-[#111318] text-xs font-black uppercase tracking-widest text-white/40">
 Waiting for AI response...
 </div>
 );
 }

 const toggleSelected = (index: number) => {
 setState((prev) => {
 if (!prev) return prev;
 const selected = prev.selected.includes(index)
 ? prev.selected.filter((i) => i !== index)
 : [...prev.selected, index];
 return { ...prev, selected };
 });
 };

 const toggleEditing = (index: number) => {
 setState((prev) => (prev ? { ...prev, editingIndex: prev.editingIndex === index ? null : index } : prev));
 };

 const changeParagraph = (index: number, value: string) => {
 setState((prev) => {
 if (!prev) return prev;
 const paragraphs = [...prev.paragraphs];
 paragraphs[index] = value;
 return { ...prev, paragraphs };
 });
 };

 const submit = async (action: 'acceptSelected' | 'acceptAll' | 'discard') => {
 if (!state) return;
 await electronAPI.system.submitContinuationWindowAction({
 action,
 paragraphs: state.paragraphs,
 selected: state.selected,
 editingIndex: state.editingIndex
 });
 };

 const retryOnce = async () => {
 if (!state?.retryRequest || retrying) return;
 setRetrying(true);
 try {
 const startedAt = Date.now();
 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: state.bookId,
 chapterId: state.chapterId,
 disableRag: state.retryRequest.disableRag,
 disableStyle: state.retryRequest.disableStyle,
 maxTokens: state.retryRequest.maxTokens,
 messages: state.retryRequest.messages
 });
 const text = normalizeNovelOutput(response?.text || '');
 if (!text) throw new Error('AI 未返回可用内容');
 const paragraphs = text
 .replace(/\r\n/g, '\n')
 .split(/\n{1,}/)
 .map((item) => item.trim())
 .filter(Boolean);
 const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [text];
 setState((prev) =>
 prev
 ? {
 ...prev,
 elapsedMs: Date.now() - startedAt,
 paragraphs: normalizedParagraphs,
 selected: normalizedParagraphs.map((_, index) => index),
 editingIndex: null
 }
 : prev
 );
 } catch (error) {
 window.alert(`重试失败：${normalizeAiErrorMessage(error)}`);
 } finally {
 setRetrying(false);
 }
 };

 return (
 <div className="h-screen w-screen overflow-hidden bg-[#111318] p-3 text-slate-200 antialiased selection:bg-indigo-500/30">
 <section className="flex h-full w-full flex-col overflow-hidden border border-white/[0.06] bg-[#181a20] shadow-[0_40px_100px_rgba(0,0,0,0.8)]">
 <header
 className="flex items-center justify-between border-b border-white/[0.06] bg-[#1e2028] px-7 py-5"
 style={{ WebkitAppRegion: 'drag' } as any}
 >
 <div className="flex items-center gap-4">
 <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.6)]"/>
 <h1 className="text-base font-black uppercase tracking-tight text-white/90">{state.title || 'AI 续写结果'}</h1>
 </div>
 <div className="flex items-center gap-4 text-[10px] font-black tracking-[0.25em] text-white/20">
 <span>GENERATED IN {(state.elapsedMs / 1000).toFixed(1)}S</span>
 <div className="h-3 w-[1px] bg-white/10"/>
 <span>梨眼 AI 核心</span>
 </div>
 </header>

 <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#14161b] px-6 py-7">
 {state.paragraphs.map((paragraph, index) => {
 const selected = state.selected.includes(index);
 const editing = state.editingIndex === index;
 return (
 <article
 key={`cont-${index}`}
 className={`group relative border transition-all duration-500 ${
 selected
 ? 'border-indigo-400/30 bg-[#1c1f2a] shadow-[0_4px_24px_rgba(99,102,241,0.08)]'
 : 'border-white/[0.06] bg-[#1a1c22] hover:border-white/[0.1] hover:bg-[#1e2028]'
 } ${editing ? 'ring-2 ring-indigo-500/40 ring-offset-2 ring-offset-[#14161b]' : ''}`}
 >
 <div className="mb-4 flex items-center justify-between px-6 pt-5">
 <div className="flex items-center gap-3">
 <div
 className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all`}
 style={{ background: selected ? '#6366f1' : 'rgba(255,255,255,0.15)', color: selected ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
 >
 {index + 1}
 </div>
 <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${selected ? 'text-indigo-400' : 'text-white/20'}`}>
 段落摘要
 </div>
 </div>
 <div className="flex items-center gap-2 opacity-0 transition-all duration-300 group-hover:opacity-100">
 <button
 className="border border-white/10 px-3 py-1.5 text-[11px] font-bold transition-all hover:text-white"
 style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', WebkitAppRegion: 'no-drag' } as any}
 onClick={() => toggleEditing(index)}
 >
 {editing ? '完成' : '编辑内容'}
 </button>
 <button
 className="px-4 py-1.5 text-[11px] font-black tracking-widest transition-all"
 style={{ background: selected ? '#6366f1' : 'rgba(255,255,255,0.12)', color: selected ? '#ffffff' : 'rgba(255,255,255,0.7)', WebkitAppRegion: 'no-drag' } as any}
 onClick={() => toggleSelected(index)}
 >
 {selected ? '已采纳' : '采纳此段'}
 </button>
 </div>
 </div>
 <div className="px-6 pb-6">
 {editing ? (
 <textarea
 className="min-h-[140px] w-full resize-none border border-indigo-500/30 bg-black/40 p-4 text-[16px] leading-relaxed text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30"
 style={{ WebkitAppRegion: 'no-drag' } as any}
 value={paragraph}
 autoFocus
 onChange={(event) => changeParagraph(index, event.target.value)}
 />
 ) : (
 <div className="whitespace-pre-wrap break-words text-[17px] font-medium leading-[1.85] text-white/90 transition-colors group-hover:text-white">
 {paragraph}
 </div>
 )}
 </div>
 </article>
 );
 })}
 </div>

 <footer className="flex items-center justify-end gap-3 border-t border-white/[0.06] bg-[#1e2028] px-8 py-5">
 <button
 className="border border-white/10 bg-white/5 px-6 py-2.5 text-[13px] font-bold text-white/40 transition-all hover:bg-white/10 hover:text-white/80"
 style={{ WebkitAppRegion: 'no-drag' } as any}
 onClick={() => void submit('discard')}
 >
 放弃结果
 </button>
 <div className="mx-1 h-6 w-[1px] bg-white/10"/>
 <button
 className="border border-indigo-400/20 bg-indigo-500/10 px-6 py-2.5 text-[13px] font-bold text-indigo-300 transition-all hover:bg-indigo-500/20"
 style={{ WebkitAppRegion: 'no-drag' } as any}
 onClick={() => void submit('acceptSelected')}
 >
 采纳选中 ({state.selected.length})
 </button>
 <button
 className="px-7 py-2.5 text-[13px] font-black text-white shadow-xl transition-all hover:brightness-110 active:scale-95"
 style={{ background: '#6366f1', WebkitAppRegion: 'no-drag' } as any}
 onClick={() => void submit('acceptAll')}
 >
 全部采纳
 </button>
 <button
 className="ml-2 border border-emerald-400/20 bg-emerald-500/10 px-6 py-2.5 text-[13px] font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:opacity-30"
 style={{ WebkitAppRegion: 'no-drag' } as any}
 disabled={!state.retryRequest || retrying}
 onClick={() => void retryOnce()}
 >
 {retrying ? '正在重试...' : '再试一次'}
 </button>
 </footer>
 </section>
 </div>
 );
}
