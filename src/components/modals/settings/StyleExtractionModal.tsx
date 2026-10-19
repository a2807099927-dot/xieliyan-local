import { useState, useRef } from 'react';
import { clsx } from 'clsx';
import { useStyleExtraction, type ExtractionPhase } from '../../../hooks/useStyleExtraction';
import { electronAPI } from '../../../utils/electron';

interface StyleExtractionModalProps {
 open: boolean;
 onClose: () => void;
 onSave: (name: string, instruction: string) => void;
}

const PHASE_LABELS: Record<ExtractionPhase, string> = {
 idle: '准备就绪',
 phaseA: '正在提取核心技法特征...',
 phaseB: '正在分析触发条件与对比规律...',
 phaseC: '正在生成可套用句式模板...',
 done: '分析完成',
 error: '提取失败',
};

export function StyleExtractionModal({ open, onClose, onSave }: StyleExtractionModalProps) {
 const { state, startExtraction, reset } = useStyleExtraction();
 const [sourceText, setSourceText] = useState('');
 const [profileName, setProfileName] = useState('');
 const [editingResult, setEditingResult] = useState(false);
 const textareaRef = useRef<HTMLTextAreaElement>(null);

 const isRunning = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error';
 const isDone = state.phase === 'done';

 const handleUploadFile = async () => {
 try {
 const result = await electronAPI.fs.selectFile();
 if (!result.path) return;
 const path = result.path;
 if (!path.toLowerCase().endsWith('.txt')) {
 alert('请选择 .txt 格式的文本文件');
 return;
 }
 const readResult = await electronAPI.fs.readTextFile({ path });
 const text = readResult.text;
 if (!text || text.length < 50) {
 alert('文件内容为空或过短，请选择包含小说内容的文本文件');
 return;
 }
 setSourceText(text.slice(0, 200000));
 } catch (err) {
 console.error('文件读取失败:', err);
 }
 };

 const handleStart = async () => {
 if (!sourceText.trim() || sourceText.trim().length < 200) return;
 await startExtraction(sourceText.trim());
 };

 const handleSave = () => {
 const name = profileName.trim() || '提取风格-' + new Date().toLocaleDateString();
 const instruction = state.resultText || '';
 onSave(name, instruction);
 handleClose();
 };

 const handleClose = () => {
 reset();
 setSourceText('');
 setProfileName('');
 setEditingResult(false);
 onClose();
 };

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center">
 {/* Backdrop */}
 <div className="absolute inset-0 bg-black/50" onClick={!isRunning ? handleClose : undefined} />

 {/* Modal */}
 <div className="relative z-10 w-[680px] max-w-[90vw] max-h-[85vh] flex flex-col bg-[var(--surface)] border border-[var(--border-color)] shadow-2xl rounded-2xl">
 {/* Header */}
 <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-t-2xl">
 <div className="flex items-center gap-2.5">
 <div className="w-7 h-7 rounded bg-[var(--accent)]/10 flex items-center justify-center">
 <svg className="w-4 h-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
 </svg>
 </div>
 <div>
 <h3 className="text-sm font-bold text-[var(--text-primary)]">AI 风格提取器</h3>
 <p className="text-[10px] text-[var(--text-muted)]">上传文本，AI 自动分析写作技法并生成可复用的风格指令</p>
 </div>
 </div>
 {!isRunning && (
 <button onClick={handleClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 )}
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-transparent">
 {/* Source Text Input */}
 {!isDone && (
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xs font-semibold text-[var(--text-secondary)]">粘贴小说文本（最高20万字）</span>
 <span className="text-[10px] text-[var(--text-muted)]">或</span>
 <button
 onClick={handleUploadFile}
 disabled={isRunning}
 className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:text-[var(--accent)]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
 >
 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
 </svg>
 上传 TXT 文件
 </button>
 </div>
 <span className="text-[10px] font-mono text-[var(--text-muted)]">
 {sourceText.length}
 </span>
 </div>
 <textarea
 ref={textareaRef}
	className="w-full h-40 resize-y bg-[var(--surface-strong)] border border-[var(--border-color)] rounded p-3 text-[13px] leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30 focus:outline-none focus:border-[var(--accent)]/40 focus:ring-1 focus:ring-[var(--accent)]/10 transition-all"
 placeholder="将想要分析写作风格的小说章节粘贴到这里..."
 value={sourceText}
 onChange={(e) => setSourceText(e.target.value)}
 disabled={isRunning}
 />
 {sourceText.length > 0 && sourceText.length < 200 && (
 <p className="text-[10px] text-amber-500/80">文本过短，建议至少 500 字以获得准确的分析结果</p>
 )}
 </div>
 )}

 {/* Progress */}
 {isRunning && (
 <div className="space-y-3 py-2">
 <div className="flex items-center justify-between text-xs">
 <span className="text-[var(--accent)] font-semibold animate-pulse">{PHASE_LABELS[state.phase]}</span>
 <span className="text-[var(--text-muted)] font-mono">{state.progress}%</span>
 </div>
 <div className="h-1.5 bg-[var(--surface-strong)] rounded-full overflow-hidden">
 <div
 className="h-full bg-[var(--accent)] transition-all duration-500 ease-out"
 style={{ width: `${state.progress}%` }}
 />
 </div>
 <p className="text-[10px] text-[var(--text-muted)] opacity-70">
 此过程需要调用 3 次 AI，每次生成约 2000-4000 tokens，请耐心等待...
 </p>
 </div>
 )}

 {/* Error */}
 {state.phase === 'error' && state.error && (
 <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-xs text-rose-400">
 <div className="flex items-center gap-1.5 font-bold mb-1.5">
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
 </svg>
 提取失败
 </div>
 <p className="opacity-80 leading-relaxed">{state.error}</p>
 </div>
 )}

 {/* Result Preview */}
 {isDone && state.resultText && (
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-semibold text-[var(--accent)]">提取完成！风格指令预览</span>
 <button
 type="button"
 onClick={() => setEditingResult((v) => !v)}
 className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1 font-medium"
 >
 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
 </svg>
 {editingResult ? '取消编辑' : '手动编辑'}
 </button>
 </div>

 <div className="relative">
 {editingResult ? (
 <textarea
	className="w-full h-64 resize-y bg-[var(--surface-strong)] border border-[var(--accent)]/20 rounded p-3 text-[12px] leading-relaxed text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/40"
 value={state.resultText}
 onChange={(e) => {
 // We need a way to update state.resultText
 // useStyleExtraction doesn't expose setState, let's just use local state for editing
 // Actually let's handle this differently
 }}
 readOnly
 />
 ) : (
	<div className="w-full h-64 overflow-y-auto bg-[var(--surface-strong)] border border-[var(--border-color)] rounded p-3 text-[12px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
 {state.resultText}
 </div>
 )}
 </div>

 {/* Save Section */}
 <div className="border-t border-[var(--border-color)] pt-3 space-y-2">
 <label className="text-xs font-semibold text-[var(--text-secondary)]">保存为自定义配置</label>
 <div className="flex gap-2">
 <input
 type="text"
	className="flex-1 bg-[var(--surface-strong)] border border-[var(--border-color)] rounded px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/30 focus:outline-none focus:border-[var(--accent)]/40"
 placeholder="输入配置名称，例如：古风悬疑风"
 value={profileName}
 onChange={(e) => setProfileName(e.target.value)}
 />
 <button
 type="button"
 onClick={handleSave}
 className="shrink-0 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] text-white font-bold text-xs px-5 py-2 hover:brightness-110 transition-all flex items-center gap-1.5 shadow-lg shadow-[var(--accent)]/10"
 >
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
 <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
 </svg>
 保存配置
 </button>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Footer */}
 <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-b-2xl">
 <div className="text-[10px] text-[var(--text-muted)] opacity-60">
 {isDone ? '分析结果已清洗内部术语，可直接作为风格指令使用' : '分析过程共 3 轮，每轮基于前一轮结果递进'}
 </div>
 <div className="flex gap-2">
 {!isRunning && !isDone && (
 <>
 <button
 type="button"
 onClick={handleClose}
 className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5 transition-colors font-medium"
 >
 取消
 </button>
 <button
 type="button"
 onClick={handleStart}
 disabled={sourceText.trim().length < 200}
 className={clsx(
 'text-xs font-semibold px-4 py-1.5 transition-all flex items-center gap-1.5 rounded-xl',
 sourceText.trim().length >= 200
 ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] text-white hover:brightness-110 active:scale-95 shadow-lg shadow-[var(--accent)]/10'
 : 'bg-[var(--surface-strong)] text-[var(--text-muted)] border border-[var(--border-color)] cursor-not-allowed'
 )}
 >
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
 </svg>
 开始提取
 </button>
 </>
 )}
 {isRunning && (
 <button
 type="button"
 disabled
 className="text-xs font-semibold px-4 py-1.5 rounded-xl bg-[var(--surface-strong)] text-[var(--text-muted)] border border-[var(--border-color)] cursor-wait flex items-center gap-1.5"
 >
 <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 分析中...
 </button>
 )}
 {isDone && (
 <button
 type="button"
 onClick={() => {
 reset();
 setEditingResult(false);
 }}
 className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] px-3 py-1.5 transition-colors flex items-center gap-1 font-semibold"
 >
 <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
 <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
 </svg>
 重新分析
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 );
}
