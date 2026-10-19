// 模块说明：大纲向导（按章节生成内容）。
// 关键职责：根据细纲拆出章节并触发 AI 创作。
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Book, Chapter } from '../../types';
import { useIsland } from '../common/Island';
import { electronAPI, safeConfirm } from '../../utils/electron';
import { parseJsonLoosely } from '../../utils/jsonParse';
import { estimateTextTokens } from '../../ai/adapters/helpers';

type QARound = {
 question: string;
 options: string[]; // 永远3条，第4条"自己填写"由UI固定添加
 chosen: string; // 用户最终选择的内容，自填时存用户输入
};

type WizardStep =
 | { kind: 'bubble' }
 | { kind: 'chapter-select' }
 | { kind: 'summary'; summaryText: string }
 | { kind: 'qa'; summaryText: string; round: number; history: QARound[] }
 | { kind: 'outline'; summaryText: string; history: QARound[]; outlineText: string; chapterName: string }
 | { kind: 'adjust-input'; summaryText: string; history: QARound[]; outlineText: string; chapterName: string }
 | { kind: 'closed' };

interface OutlineWizardProps {
 book: Book;
 chapter: Chapter;
 open?: boolean;
 onWriteOutline: (text: string, chapterName: string) => void;
 onDismiss: () => void;
}

const TOKEN_LEVEL_HIGH = 8000;
const TOKEN_LEVEL_VERY_HIGH = 20000;


import { normalizeEscapedNewlines } from '../../utils/editorUtils';

export function OutlineWizard({ book, chapter, open, onWriteOutline, onDismiss }: OutlineWizardProps) {
 const island = useIsland();
 const [step, setStep] = useState<WizardStep>(open ? { kind: 'bubble' } : { kind: 'closed' });
 const [loading, setLoading] = useState(false);
 const isMounted = useRef(true);

 // Chapter select states
 const [contextKeyword, setContextKeyword] = useState('');
 const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());
 const [contextSortOrder, setContextSortOrder] = useState<'asc' | 'desc'>('desc');

 // Input states for QA & Adjust
 const [customAnswer, setCustomAnswer] = useState('');
 const [showCustomInput, setShowCustomInput] = useState(false);
 const [adjustFeedback, setAdjustFeedback] = useState('');

 // Auto-select previous chapter by default
 const previousChapter = useMemo(() => {
 const index = book.chapters.findIndex((item) => item.id === chapter.id);
 if (index <= 0) return null;
 return book.chapters[index - 1] || null;
 }, [book.chapters, chapter.id]);

 useEffect(() => {
 if (open) setStep({ kind: 'bubble' });
 else setStep({ kind: 'closed' });
 }, [open]);

 useEffect(() => {
 if (previousChapter && step.kind === 'bubble') {
 setSelectedContextIds(new Set([previousChapter.id]));
 }
 }, [previousChapter, step.kind]);

 useEffect(() => {
 isMounted.current = true;
 return () => {
 isMounted.current = false;
 };
 }, []);

 const closeWizard = useCallback(() => {
 setStep({ kind: 'closed' });
 onDismiss();
 }, [onDismiss]);

 const contextChapterCandidates = useMemo(
 () =>
 book.chapters
 .map((item, index) => ({
 ...item,
 chapterNo: index + 1
 }))
 .filter((item) => item.id !== chapter.id),
 [book.chapters, chapter.id]
 );

 const sortedAndFilteredChapters = useMemo(() => {
 const key = contextKeyword.trim().toLowerCase();
 let result = key
 ? contextChapterCandidates.filter((item) => {
 const title = String(item.title || '').toLowerCase();
 return title.includes(key) || String(item.chapterNo).includes(key);
 })
 : [...contextChapterCandidates];

 if (contextSortOrder === 'desc') {
 result.reverse();
 }
 return result;
 }, [contextChapterCandidates, contextKeyword, contextSortOrder]);

 const selectedContextChapters = useMemo(
 () => contextChapterCandidates.filter((item) => selectedContextIds.has(item.id)),
 [contextChapterCandidates, selectedContextIds]
 );

 const contextText = useMemo(() => {
 const blocks = selectedContextChapters
 .map((item) => {
 const content = normalizeEscapedNewlines(String(item.content || '')).trim();
 if (!content) return '';
 const title = String(item.title || `第${item.chapterNo}章`);
 const words = Number(item.wordCount || 0);
 return `【第${item.chapterNo}章 ${title}（${words}字）】\n${content}`;
 })
 .filter(Boolean);
 return blocks.join('\n\n');
 }, [selectedContextChapters]);

 const estimatedPromptTokens = useMemo(() => estimateTextTokens(contextText || '无内容'), [contextText]);
 const tokenLevel = useMemo(() => {
 if (estimatedPromptTokens >= TOKEN_LEVEL_VERY_HIGH) return '很高';
 if (estimatedPromptTokens >= TOKEN_LEVEL_HIGH) return '较高';
 return '正常';
 }, [estimatedPromptTokens]);

 const toggleContextChapter = (chapterId: string) => {
  setSelectedContextIds((prev) => {
   const next = new Set(prev);
   if (next.has(chapterId)) next.delete(chapterId);
   else next.add(chapterId);
   return next;
  });
 };

 // 快捷选择最近 N 章
 const quickSelectRecentChapters = (count: number) => {
  const idx = book.chapters.findIndex((item) => item.id === chapter.id);
  const end = idx >= 0 ? idx : book.chapters.length;
  const recent = book.chapters.slice(Math.max(0, end - count), end);
  const next = new Set(recent.map((item) => item.id));
  if (next.size === 0 && previousChapter) next.add(previousChapter.id);
  setSelectedContextIds(next);
 };

 const handleStartSummary = async () => {
 if (selectedContextIds.size === 0) {
 island.show({ type: 'warning', message: '请至少选择一章作为参考内容' });
 return;
 }
  if (estimatedPromptTokens >= TOKEN_LEVEL_VERY_HIGH) {
  const confirmed = await safeConfirm(`当前预计输入约 ${estimatedPromptTokens.toLocaleString('zh-CN')} tokens（很高）。继续可能较慢且成本更高，仍要继续吗？`);
  if (!confirmed) return;
  }

 setLoading(true);
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在阅读前文并生成摘要...' });
 
 try {
 const prompt = `你是中文长篇小说分析助手。请阅读以下章节内容，用不超过200字总结当前故事状态。
重点包含三项：①当前故事所处阶段 ②核心矛盾或悬念 ③主要角色当前状态。
只输出摘要正文，不要标题，不要编号。

${contextText}`;

 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 messages: [{ role: 'user', content: prompt }]
 });

 if (!isMounted.current) return;
 const summaryText = String(response.text || '').trim();
 if (!summaryText) throw new Error('AI 返回摘要为空');

 setStep({ kind: 'summary', summaryText });
 } catch (error) {
 if (isMounted.current) {
 island.show({ type: 'error', message: '摘要生成失败', detail: String(error instanceof Error ? error.message : error), autoHideMs: 15000 });
 setStep({ kind: 'chapter-select' }); // Rollback to selection
 }
 } finally {
 if (isMounted.current) {
 setLoading(false);
 }
 island.finishTask(taskId);
 }
 };

 const requestQA = async (summaryText: string, history: QARound[]) => {
 setLoading(true);
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在分析下一节点...' });

 try {
 let prompt = `你是中文长篇小说大纲规划助手。
以下是前文内容摘要和原始章节：

【前文摘要】
${summaryText}

【参考章节】
${contextText}`;

 if (history.length > 0) {
 prompt += `\n\n【已确定的剧情方向】\n${history.map((r, i) => `第${i+1}步：${r.question} → 用户选择：${r.chosen}`).join('\n')}\n\n在此基础上，继续提出下一个关键叙事节点。`;
 } else {
 prompt += `\n\n请针对下一章的发展，提出一个最关键的叙事节点问题，并给出恰好3个方向选项。`;
 }

 prompt += `\n每个选项一句话，20字以内，直接描述剧情走向，不要加序号。\n严格按以下JSON格式输出，必须且只能输出纯文本的JSON对象，不要有额外的解释或 \`\`\`json 标记：\n{"question":"...","options":["...","...","..."]}`;

 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 messages: [{ role: 'user', content: prompt }]
 });

 if (!isMounted.current) return;
 
 const parsed = parseJsonLoosely<{ question?: string; options?: string[] }>(response.text);
 if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回的格式无效');
 
 const question = String(parsed.question || '接下来的剧情节点是什么？').trim();
 let rawOptions = Array.isArray(parsed.options) ? parsed.options.map(o => String(o || '').trim()).filter(Boolean) : [];
 
 // 防御处理 options，确保正好 3 条
 if (rawOptions.length > 3) {
 rawOptions = rawOptions.slice(0, 3);
 }
 while (rawOptions.length < 3) {
 rawOptions.push('（暂无方向）');
 }

 setStep({ kind: 'qa', summaryText, round: history.length + 1, history: [...history, { question, options: rawOptions, chosen: '' }] });
 setCustomAnswer('');
 setShowCustomInput(false);
 } catch (error) {
 if (isMounted.current) {
 island.show({ type: 'error', message: '问题生成失败', detail: String(error instanceof Error ? error.message : error), autoHideMs: 15000 });
 // Rollback strategy: if it's the first QA round, go back to summary. Otherwise, keep current history but allow retry of this round.
 if (history.length === 0) {
 setStep({ kind: 'summary', summaryText });
 } else {
 setStep({ kind: 'qa', summaryText, round: history.length, history });
 }
 }
 } finally {
 if (isMounted.current) {
 setLoading(false);
 }
 island.finishTask(taskId);
 }
 };

 const handleStartQA = (summaryText: string) => {
 void requestQA(summaryText, []);
 };

 const handleSelectOption = (summaryText: string, history: QARound[], roundIndex: number, chosenOption: string) => {
 if (chosenOption === '（暂无方向）') return;
 
 const updatedHistory = [...history];
 updatedHistory[roundIndex].chosen = chosenOption;
 
 if (roundIndex + 1 >= 5) {
 void requestOutlineGeneration(summaryText, updatedHistory);
 } else {
 void requestQA(summaryText, updatedHistory);
 }
 };

 const requestOutlineGeneration = async (summaryText: string, history: QARound[]) => {
 setLoading(true);
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在生成大纲...' });

 try {
 const prompt = `你是中文长篇小说大纲规划助手。
根据以下信息，为下一章生成一份完整大纲。

【前文摘要】
${summaryText}

【用户确定的剧情方向】
${history.map((r, i) => `第${i+1}步：${r.question} → ${r.chosen}`).join('\n')}

要求：
1. 大纲正文300字以内，分段落描述，涵盖主要情节转折、人物行动、场景氛围
2. 请为本章构思一个带有悬疑感或概括性的标题
3. 严格按以下JSON格式输出，必须且只能输出纯文本的JSON对象，不要有任何多余的文本或 markdown 代码块标记：
{"chapterName":"生成的本章标题","content":"大纲正文..."}`;

 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 messages: [{ role: 'user', content: prompt }]
 });

 // fallback if it completely fails JSON and returns plain text
 let parsedOutlineText = String(response.text || '').trim();
 let parsedName = '暂无生成标题';
 let obj = parseJsonLoosely<{ chapterName?: string; content?: string }>(response.text);
 
 if (obj && (obj.content || obj.chapterName)) {
 parsedName = String(obj.chapterName || parsedName).trim();
 parsedOutlineText = String(obj.content || parsedOutlineText).trim();
 }
 
 if (!parsedOutlineText) throw new Error('AI 返回大纲为空');

 setStep({ kind: 'outline', summaryText, history, outlineText: parsedOutlineText, chapterName: parsedName });
 } catch (error) {
 if (isMounted.current) {
 island.show({ type: 'error', message: '大纲生成失败', detail: String(error instanceof Error ? error.message : error), autoHideMs: 15000 });
 // Rollback to QA state so users can retry or change choices
 setStep({ kind: 'qa', summaryText, round: history.length, history });
 }
 } finally {
 if (isMounted.current) {
 setLoading(false);
 }
 island.finishTask(taskId);
 }
 };

 const submitAdjustment = async (summaryText: string, currentOutline: string) => {
 const feedback = adjustFeedback.trim();
 if (!feedback) {
 island.show({ type: 'warning', message: '请填写调整意见' });
 return;
 }
 
 // 在 await 之前捕获 step 快照，防止 AI 请求期间 step 变化导致闭包陈旧
 const stepSnapshot = step;
 
 setLoading(true);
 const taskId = island.startTask({ type: 'progress', status: 'thinking', message: 'AI 正在调整大纲...' });
 
 // 直接修改大纲，不重走5轮问答
 try {
 const prompt = `你是中文长篇小说大纲规划助手。
以下是前文信息与当前章节大纲草稿：

【前文摘要】
${summaryText}

【参考章节】
${contextText}

【当前大纲草稿】
${currentOutline}

【用户的调整意见】
${feedback}

请在保留原有故事方向和关键情节的基础上，根据用户的调整意见对大纲进行局部修改和优化。
不要推倒重来，只调整用户提到的部分。大纲正文300字以内，分段描述主要情节转折、人物行动、场景氛围。
同时可根据内容微调章节标题（如无需改动则保持原标题）。

严格按以下JSON格式输出，必须且只能输出纯文本的JSON对象，不要有任何多余的文本或 markdown 代码块标记：
{"chapterName":"章节标题","content":"调整后的大纲正文..."}`;

 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: chapter.id,
 disableRag: true,
 messages: [{ role: 'user', content: prompt }]
 });

 if (!isMounted.current) return;
 
 let newOutlineText = String(response.text || '').trim();
 let newChapterName = stepSnapshot.kind === 'adjust-input' ? stepSnapshot.chapterName : '暂无生成标题';

 const obj = parseJsonLoosely<{ chapterName?: string; content?: string }>(response.text);
 if (obj && (obj.content || obj.chapterName)) {
 newChapterName = String(obj.chapterName || newChapterName).trim();
 newOutlineText = String(obj.content || newOutlineText).trim();
 }

 if (!newOutlineText) throw new Error('AI 返回大纲为空');

 // 直接跳回 outline 步骤，展示调整后的大纲
 setStep({
 kind: 'outline',
 summaryText,
 history: stepSnapshot.kind === 'adjust-input' ? stepSnapshot.history : [],
 outlineText: newOutlineText,
 chapterName: newChapterName
 });
 setAdjustFeedback('');
 } catch (error) {
 if (isMounted.current) {
 island.show({ type: 'error', message: '重新构建问题失败', detail: String(error instanceof Error ? error.message : error), autoHideMs: 15000 });
 // Rollback to previous outline state while preserving existing history/chapterName
 setStep({ 
 kind: 'outline', 
 summaryText, 
 history: step.kind === 'adjust-input' ? step.history : [], 
 outlineText: currentOutline, 
 chapterName: step.kind === 'adjust-input' ? step.chapterName : '' 
 }); 
 }
 } finally {
 if (isMounted.current) {
 setLoading(false);
 }
 island.finishTask(taskId);
 }
 };

 const renderContent = () => {
 switch (step.kind) {
 case 'bubble':
 return (
 <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[100] flex">
 <div className="w-[280px] border border-[var(--border-color)] bg-[var(--surface)] p-4 shadow-2xl rounded-2xl flex flex-col gap-2">
 <div className="flex items-center justify-between">
 <div className="text-sm font-bold text-[var(--text-primary)]">✨ 新章节空白</div>
 <button onClick={closeWizard} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">✕</button>
 </div>
 <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
 本章似乎还没有内容。需要我帮你回顾前文，并一步步推演本章的大纲走向吗？
 </p>
 <div className="flex gap-2 mt-2">
 <button onClick={closeWizard} className="flex-1 rounded-xl bg-[var(--surface-strong)] py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors">
 不需要了
 </button>
 <button onClick={() => setStep({ kind: 'chapter-select' })} className="flex-1 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] py-1.5 text-xs font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:brightness-110 transition-colors">
 开始引导
 </button>
 </div>
 </div>
 </div>
 );

 case 'chapter-select':
 return createPortal(
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/50" onClick={closeWizard} />
 <div className="relative flex w-full max-h-[85vh] max-w-[750px] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex justify-between items-center rounded-t-2xl">
 <div>
 <div className="text-lg font-bold tracking-tight text-[var(--text-primary)] antialiased">选择参考章节</div>
 <div className="mt-1 text-xs text-[var(--text-secondary)] antialiased">AI 将参考你选中的章节内容进行续写，默认已选上一章。</div>
 </div>
 <button onClick={closeWizard} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">✕</button>
 </div>

 <div className="border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-6 py-2.5 flex gap-2 items-center">
 <div className="flex gap-1 shrink-0">
  <button onClick={() => quickSelectRecentChapters(1)} className="flex shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] rounded-lg transition-colors" disabled={loading}>最近1章</button>
  <button onClick={() => quickSelectRecentChapters(5)} className="flex shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] rounded-lg transition-colors" disabled={loading}>最近5章</button>
  <button onClick={() => quickSelectRecentChapters(10)} className="flex shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] rounded-lg transition-colors" disabled={loading}>最近10章</button>
 </div>
 <input
 value={contextKeyword}
 onChange={(e) => setContextKeyword(e.target.value)}
 placeholder="搜索章节序号或章节名..."
 className="flex-1 bg-transparent px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
 disabled={loading}
 />
 <button 
 onClick={() => setContextSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
 className="flex shrink-0 items-center justify-center border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] rounded-xl transition-colors"
 disabled={loading}
 >
 {contextSortOrder === 'asc' ? '正序' : '倒序'}
 </button>
 </div>

 <div className="custom-scrollbar min-h-0 flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
 {sortedAndFilteredChapters.length === 0 ? (
 <div className="py-8 text-center text-sm text-[var(--text-muted)]">没有匹配的章节</div>
 ) : (
 sortedAndFilteredChapters.map((item) => {
 const checked = selectedContextIds.has(item.id);
 return (
 <button
 key={item.id}
 disabled={loading}
 onClick={() => toggleContextChapter(item.id)}
 className={`flex w-full items-center justify-between px-4 py-1.5 rounded-xl text-left transition-all ${
 checked
 ? 'bg-[var(--accent)]/10 text-[var(--text-primary)]'
 : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
 }`}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${checked ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-color)] text-transparent hover:border-[var(--text-muted)]'}`}>
 {checked && <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>}
 </div>
 <div className={`truncate text-[13px] ${checked ? 'font-semibold' : ''}`}>{item.title || `第${item.chapterNo}章`}</div>
 </div>
 <div className="ml-3 shrink-0 text-xs text-[var(--text-muted)]">{Number(item.wordCount || 0).toLocaleString()} 字</div>
 </button>
 );
 })
 )}
 </div>

 <div className="shrink-0 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex items-center justify-between rounded-b-2xl antialiased">
 <div className="text-xs text-[var(--text-secondary)]">
 预计输入：<span className="font-mono font-bold text-[var(--text-primary)]">{estimatedPromptTokens.toLocaleString()} tokens</span>
 </div>
 <button
 disabled={loading || selectedContextIds.size === 0}
 onClick={() => void handleStartSummary()}
 className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-6 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:brightness-110 disabled:opacity-50 transition-colors"
 >
 {loading ? '处理中...' : '生成当前阶段摘要'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 );

 case 'summary':
 return createPortal(
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/50" onClick={closeWizard} />
 <div className="relative flex w-full max-w-[600px] flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 rounded-t-2xl">
 <div className="text-lg font-bold text-[var(--text-primary)] antialiased">前情摘要</div>
 </div>
 <div className="p-6 bg-transparent">
 <div className="bg-[var(--surface-strong)] border border-[var(--border-color)] rounded-xl p-4 text-[14px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap antialiased">
 {step.summaryText}
 </div>
 </div>
 <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex justify-end rounded-b-2xl">
 <button
 disabled={loading}
 onClick={() => handleStartQA(step.summaryText)}
 className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-6 py-2 text-sm font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:brightness-110 disabled:opacity-50 transition-colors"
 >
 {loading ? '分析中...' : '确认无误，开始推演'}
 </button>
 </div>
 </div>
 </div>,
 document.body
 );

 case 'qa': {
 const roundData = step.history[step.round - 1];
 return createPortal(
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/50" onClick={closeWizard} />
 <div className="relative flex w-full max-w-[600px] flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex justify-between items-center rounded-t-2xl">
 <div className="flex items-center gap-3">
 <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white antialiased">{step.round}/5</div>
 <div className="text-lg font-bold text-[var(--text-primary)] antialiased">推演节点</div>
 </div>
 <button onClick={closeWizard} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">✕</button>
 </div>
 <div className="p-6 flex flex-col gap-4">
 <div className="text-[16px] font-semibold leading-tight text-[var(--text-primary)] antialiased">
 {roundData.question}
 </div>
 <div className="flex flex-col gap-2">
 {roundData.options.map((opt, i) => {
 const isDisabled = loading || opt === '（暂无方向）';
 return (
 <button
 key={i}
 disabled={isDisabled}
 onClick={() => handleSelectOption(step.summaryText, step.history, step.round - 1, opt)}
 className="group flex items-center justify-between border border-[var(--border-color)] bg-[var(--surface-strong)] p-3 rounded-xl text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
 >
 <span className="text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] antialiased">{opt}</span>
 </button>
 );
 })}
 
 {showCustomInput ? (
 <div key={`custom-input-${step.kind === 'qa' ? step.round : 0}`} className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4 rounded-xl flex flex-col gap-3 transition-all">
 <input
 autoFocus
 value={customAnswer}
 onChange={(e) => setCustomAnswer(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && customAnswer.trim() && !loading && step.kind === 'qa') {
 handleSelectOption(step.summaryText, step.history, step.round - 1, customAnswer.trim());
 }
 }}
 placeholder="想写其他走向？在此输入..."
 className="w-full bg-transparent text-sm text-[var(--text-primary)] antialiased outline-none placeholder:text-[var(--text-muted)]"
 disabled={loading}
 />
 <div className="flex justify-end gap-2">
 <button
 disabled={loading}
 onClick={() => { setShowCustomInput(false); setCustomAnswer(''); }}
 className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all"
 >取消</button>
 <button
 disabled={loading || !customAnswer.trim()}
 onClick={() => handleSelectOption(step.summaryText, step.history, step.round - 1, customAnswer.trim())}
 className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-40 transition-all"
 >确定选择</button>
 </div>
 </div>
 ) : (
 <button
 disabled={loading}
 onClick={() => setShowCustomInput(true)}
 className="flex items-center justify-center border border-dashed border-[var(--border-color)] rounded-xl bg-transparent p-3 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)] disabled:opacity-50 transition-colors antialiased"
 >
 ✏️ 自己填写
 </button>
 )}
 </div>
 </div>
 </div>
 </div>,
 document.body
 );
 }

 case 'outline':
 case 'adjust-input': {
 const isAdjusting = step.kind === 'adjust-input';
 const outlineDisplay = step.outlineText;
 const curSummary = step.summaryText;
 const curHistory = step.history;
 const generatedTitle = step.chapterName;

 return createPortal(
 <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
 <div className="absolute inset-0 bg-black/50" onClick={closeWizard} />
 <div className="relative flex w-full max-h-[90vh] max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.7)]" onClick={e => e.stopPropagation()}>
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex justify-between items-center rounded-t-2xl">
 <div className="flex items-center gap-2 text-lg font-bold text-[var(--accent)] antialiased">
 ✓ <span className="text-[var(--text-primary)]">本章细纲已生成</span>
 </div>
 <button onClick={closeWizard} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg">✕</button>
 </div>

 <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-6 flex flex-col gap-5">
 <div>
 <div className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-2">生成章节名推荐（支持直接修改）</div>
 <input 
 className="w-full border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-base font-bold text-[var(--text-primary)] antialiased outline-none rounded-xl focus:border-[var(--accent)] transition-colors"
 value={generatedTitle}
 onChange={(e) => {
 if (step.kind === 'outline' || step.kind === 'adjust-input') {
 setStep({ ...step, chapterName: e.target.value });
 }
 }}
 />
 </div>
 
 <div>
 <div className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-2">详细大纲与正文走向</div>
 <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-secondary)] antialiased bg-[var(--surface-strong)] border border-[var(--border-color)] p-4 rounded-xl">
 {outlineDisplay}
 </div>
 </div>
 
 {isAdjusting && (
 <div className="border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 rounded-xl flex flex-col gap-2">
 <div className="text-sm font-bold text-[var(--accent)]">调整意见</div>
 <textarea
 key="adjust-feedback-textarea"
 autoFocus
 rows={3}
 value={adjustFeedback}
 onChange={(e) => setAdjustFeedback(e.target.value)}
 placeholder="例如：把节奏再放慢一点，重点突出角色的内心挣扎..."
 className="w-full resize-none bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-3 text-sm text-[var(--text-primary)] antialiased outline-none focus:border-[var(--accent)]"
 disabled={loading}
 />
 </div>
 )}
 </div>

 <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4 flex items-center justify-between rounded-b-2xl antialiased">
 {isAdjusting ? (
 <>
 <button
 disabled={loading}
 onClick={() => setStep({ kind: 'outline', summaryText: curSummary, history: curHistory, outlineText: outlineDisplay, chapterName: generatedTitle })}
 className="px-4 py-2 text-sm font-semibold rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition"
 >取消调整</button>
 <button
 disabled={loading || !adjustFeedback.trim()}
 onClick={() => void submitAdjustment(curSummary, outlineDisplay)}
 className="bg-[var(--accent)] px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg disabled:opacity-50 hover:brightness-110 transition"
 >
 {loading ? '调整中...' : '确认调整'}
 </button>
 </>
 ) : (
 <>
 <button
 disabled={loading}
 onClick={() => {
 setAdjustFeedback('');
 setStep({ kind: 'adjust-input', summaryText: curSummary, history: curHistory, outlineText: outlineDisplay, chapterName: generatedTitle });
 }}
 className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition"
 >不满此意，调整细节</button>
 <button
 disabled={loading}
 onClick={() => {
 onWriteOutline(outlineDisplay, generatedTitle);
 closeWizard();
 }}
 className="bg-emerald-500 px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 transition"
 >
 保存大纲并开始写作
 </button>
 </>
 )}
 </div>
 </div>
 </div>,
 document.body
 );
 }
 case 'closed':
 default:
 return null;
 }
};
return renderContent();
}
