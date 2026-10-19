/**
 * 批量章节生成 Hook（VIP 功能）
 *
 * 流程：逐章执行 → 组装 prompt（写作风格 + 前10章智能整理 + 当前章细纲）
 * → AI 生成正文 → 写入章节 → 自动智能整理 → 下一章
 */
import { useCallback, useRef, useState } from 'react';
import type { Book, Chapter, ChapterMemory } from '../types';
import { electronAPI } from '../utils/electron';
import { getPromptSync } from '../utils/promptStore';
import { useBookStore } from '../store/useBookStore';
import { useConfigStore } from '../store/useConfigStore';
import { useIslandStore } from '../store/useIslandStore';
import { resolveStyleForBook, buildStyleSystemMessage } from '../utils/styleResolver';
import { splitAgentOutput } from '../Agent/stripAgentOutput';
import { buildSmartOrganizeRules, createChapterMemoryFromAnalysis, prepareChapterTextForOrganization } from '../components/modals/memory-bank/memoryBankLogic';
import { parseJsonLoosely } from '../utils/jsonParse';
import { stripHtml } from '../components/modals/memory-bank/utils';
import { escapeHtml } from '../utils/editor/helpers';

export type BatchStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface BatchGenerateState {
 status: BatchStatus;
 /** 待生成的章节 ID 列表 */
 queue: string[];
 /** 当前正在处理的章节索引 */
 currentIndex: number;
 /** 当前阶段：'generating' 生成正文 | 'analyzing' 智能整理 */
 phase: 'generating' | 'analyzing' | 'idle';
 /** 错误信息 */
 errorMsg?: string;
}

/**
 * 构建前 10 章智能整理的上下文文本
 */
function buildMemoryContext(book: Book, currentChapterIndex: number, memoryBank: ChapterMemory[]): string {
 const startIdx = Math.max(0, currentChapterIndex - 10);
 const prevChapters = book.chapters.slice(startIdx, currentChapterIndex);

 if (prevChapters.length === 0) return '';

 const lines: string[] = ['【前文剧情档案】'];
 for (const ch of prevChapters) {
 const memory = memoryBank.find((m) => m.chapterId === ch.id);
 if (!memory) continue;
 const summary = memory.summary || '';
 const plotSynopsis = (memory.plotAnalysis as any)?.plotSynopsis || '';
 const content = plotSynopsis || summary;
 if (content) {
 lines.push(`${ch.title}：${content}`);
 }
 }

 return lines.length > 1 ? lines.join('\n') : '';
}

export function useBatchGenerate(book: Book | undefined) {
 const [state, setState] = useState<BatchGenerateState>({
 status: 'idle',
 queue: [],
 currentIndex: 0,
 phase: 'idle',
 });

 const pauseRequestedRef = useRef(false);
 const abortRef = useRef(false);

 const show = useIslandStore((s) => s.show);

 /**
 * 开始批量生成
 * @param chapterIds 要生成的章节 ID 列表（按顺序）
 */
 const start = useCallback(async (chapterIds: string[]) => {
 if (!book || chapterIds.length === 0) return;

 pauseRequestedRef.current = false;
 abortRef.current = false;

 setState({
 status: 'running',
 queue: chapterIds,
 currentIndex: 0,
 phase: 'idle',
 });

 const config = useConfigStore.getState().config;
 if (!config) {
 setState((s) => ({ ...s, status: 'error', errorMsg: '配置未加载' }));
 return;
 }

 // 加载记忆库
 await useBookStore.getState().loadMemoryBank(book.id);

 for (let i = 0; i < chapterIds.length; i++) {
 // 检查暂停/中止
 if (pauseRequestedRef.current) {
 setState((s) => ({ ...s, status: 'paused', currentIndex: i }));
 show({ type: 'success', message: `批量生成已暂停（${i}/${chapterIds.length}）`, autoHideMs: 2000 });
 return;
 }
 if (abortRef.current) {
 setState((s) => ({ ...s, status: 'idle', currentIndex: 0, queue: [] }));
 return;
 }

 const chapterId = chapterIds[i];
 // 从 store 获取最新的 book 数据（细纲可能在生成前刚被填入）
 const latestBooksForOutline = useBookStore.getState().books;
 const latestBookForOutline = latestBooksForOutline.find((b) => b.id === book.id) || book;
 const chapter = latestBookForOutline.chapters.find((c) => c.id === chapterId);
 if (!chapter) continue;

 const chapterOutline = chapter.outline || '';
 if (!chapterOutline.trim()) continue; // 没有细纲的跳过

 // === 阶段1：生成正文 ===
 setState((s) => ({ ...s, currentIndex: i, phase: 'generating' }));
 show({
 type: 'progress',
 status: 'thinking',
 message: `正在生成第 ${i + 1}/${chapterIds.length} 章：${chapter.title}`,
 actions: [{ id: 'pause-batch', label: '暂停', onClick: () => { pauseRequestedRef.current = true; } }],
 });

 // 系统指令（从 Rust 获取，不在前端暴露）
 const batchPrompt = await (async () => {
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) return await internals.invoke('get_batch_generate_prompt') as string;
 } catch { /* fallback */ }
 return '';
 })();

 try {
 // 获取最新的 books 和 memoryBank
 const latestBooks = useBookStore.getState().books;
 const latestBook = latestBooks.find((b) => b.id === book.id) || book;
 const chapterIndex = latestBook.chapters.findIndex((c) => c.id === chapterId);

 // 获取记忆库数据
 const memoryBankRaw = (latestBook as any).memoryBank || [];
 const memoryBank: ChapterMemory[] = Array.isArray(memoryBankRaw) ? memoryBankRaw : [];

 // 构建上下文
 const memoryContext = buildMemoryContext(latestBook, chapterIndex, memoryBank);

 // 构建风格消息
 const style = resolveStyleForBook(book.id, config, latestBooks);
 const styleMsg = buildStyleSystemMessage(style.stylePresetId, style.styleInstruction);

 // 组装消息
 const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

 messages.push({
 role: 'system',
 content: batchPrompt || ''
 });

 // 写作风格
 if (styleMsg) {
 messages.push(styleMsg);
 }

 // 用户消息：前文档案 + 本章细纲
 let userContent = '';
 if (memoryContext) {
 userContent += memoryContext + '\n\n';
 }
 userContent += `【本章细纲】\n${chapterOutline}\n\n【输出要求】\n请根据细纲完整写出本章正文，写完后自然结束即可。`;

 messages.push({ role: 'user', content: userContent });

 // 调用 AI 生成
 const res = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId,
 disableRag: true,
 disableStyle: true, // 已手动注入风格
 messages,
 senderId: 'batch',
 });

 const generatedText = String(res?.text || '').trim();
 if (!generatedText) {
  show({ type: 'warning', message: `${chapter.title} 生成结果为空，已跳过`, autoHideMs: 2000 });
  continue;
 }
 // 剥离思考/前言：模型只输出思考时视为空，跳过（不把思考当正文写入）
 const genSplit = splitAgentOutput(generatedText);
 const bodyText = genSplit.hasBody ? genSplit.body.trim() : '';
 if (!bodyText) {
  show({ type: 'warning', message: `${chapter.title} 只返回了写作计划，已跳过`, autoHideMs: 2000 });
  continue;
 }

 // 写入章节（包裹为 HTML 段落）
 const htmlContent = `<h2>${escapeHtml(chapter.title)}</h2>` +
 bodyText.split('\n').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join('');

 await useBookStore.getState().setChapterContent(book.id, chapterId, htmlContent);

 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 // 重试一次
 show({ type: 'warning', message: `${chapter.title} 生成失败，正在重试...`, autoHideMs: 1500 });
 try {
 // 简化重试：同样的逻辑再来一次
 const latestBooks2 = useBookStore.getState().books;
 const latestBook2 = latestBooks2.find((b) => b.id === book.id) || book;
 const chapterIndex2 = latestBook2.chapters.findIndex((c) => c.id === chapterId);
 const memoryBank2: ChapterMemory[] = Array.isArray((latestBook2 as any).memoryBank) ? (latestBook2 as any).memoryBank : [];
 const memoryContext2 = buildMemoryContext(latestBook2, chapterIndex2, memoryBank2);
 const style2 = resolveStyleForBook(book.id, config, latestBooks2);
 const styleMsg2 = buildStyleSystemMessage(style2.stylePresetId, style2.styleInstruction);

 const msgs2: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
 { role: 'system', content: batchPrompt || '' },
 ];
 if (styleMsg2) msgs2.push(styleMsg2);
 let uc2 = '';
 if (memoryContext2) uc2 += memoryContext2 + '\n\n';
 uc2 += `【本章细纲】\n${chapterOutline}\n\n【输出要求】\n请根据细纲完整写出本章正文，写完后自然结束即可。`;
 msgs2.push({ role: 'user', content: uc2 });

 const res2 = await electronAPI.ai.chat({ stream: false, bookId: book.id, chapterId, disableRag: true, disableStyle: true, messages: msgs2, senderId: 'batch' });
 const text2raw = String(res2?.text || '').trim();
 const text2split = splitAgentOutput(text2raw);
 const text2 = text2split.hasBody ? text2split.body.trim() : '';
 if (text2) {
 const html2 = `<h2>${escapeHtml(chapter.title)}</h2>` + text2.split('\n').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
 await useBookStore.getState().setChapterContent(book.id, chapterId, html2);
 } else {
 show({ type: 'error', message: `${chapter.title} 重试仍失败，已跳过`, autoHideMs: 3000 });
 continue;
 }
 } catch {
 show({ type: 'error', message: `${chapter.title} 生成失败：${msg}`, autoHideMs: 3000 });
 setState((s) => ({ ...s, status: 'paused', errorMsg: msg }));
 return;
 }
 }

 // === 阶段2：智能整理 ===
 setState((s) => ({ ...s, phase: 'analyzing' }));
 show({
 type: 'progress',
 status: 'thinking',
 message: `正在整理第 ${i + 1}/${chapterIds.length} 章：${chapter.title}`,
 actions: [{ id: 'pause-batch', label: '暂停', onClick: () => { pauseRequestedRef.current = true; } }],
 });

 try {
 // 重新读取刚写入的章节内容
 const freshBooks = useBookStore.getState().books;
 const freshBook = freshBooks.find((b) => b.id === book.id);
 let freshChapter = freshBook?.chapters.find((c) => c.id === chapterId);
 if (freshChapter) {
 // F-fix: 懒加载下正文可能已从内存剔除，读不到就按需水合，避免静默跳过整理
 if (!stripHtml(freshChapter.content || '').trim()) {
 const hydrated = await useBookStore.getState().ensureChapterContent(book.id, chapterId);
 if (hydrated) freshChapter = { ...freshChapter, content: hydrated };
 }
 const plainText = stripHtml(freshChapter.content).trim();
 if (plainText.length >= 30) {
 const prompt = `请智能整理以下章节正文，提取剧情档案信息，并仅返回严格 JSON（不要 Markdown）：\n\n${prepareChapterTextForOrganization(plainText)}\n\n${buildSmartOrganizeRules({ disableRoleExtract: useConfigStore.getState().config?.ai?.disableAutoRoleExtract })}`;
 const analyzeRes = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId,
 disableRag: true,
 disableStyle: true,
 maxTokens: 16384,
 senderId: 'batch',
 messages: [
 { role: 'system', content: getPromptSync('smart_organize_system', '你是网文剧情档案整理助手，必须只输出严格 JSON。') },
 { role: 'user', content: prompt }
 ]
 });

 const rawText = String(analyzeRes?.text || '');
 const analysis = parseJsonLoosely<Record<string, unknown>>(rawText || '{}');
 if (analysis) {
 const memory = createChapterMemoryFromAnalysis(analysis, freshChapter, { disableRoleExtract: useConfigStore.getState().config?.ai?.disableAutoRoleExtract });
 // 保存到记忆库
 const currentBank: ChapterMemory[] = Array.isArray((freshBook as any).memoryBank) ? (freshBook as any).memoryBank : [];
 const merged = currentBank.filter((m) => m.chapterId !== chapterId).concat(memory);
 await useBookStore.getState().saveMemoryBank(book.id, merged);
 }
 }
 }
 } catch {
 // 整理失败不阻塞流程，继续下一章
 }
 }

 // 全部完成
 setState({ status: 'completed', queue: chapterIds, currentIndex: chapterIds.length, phase: 'idle' });
 show({ type: 'success', message: `批量生成完成！共 ${chapterIds.length} 章`, autoHideMs: 3000 });
 // 刷新 books store，确保 UI 显示最新数据
 await useBookStore.getState().loadBooks();
 }, [book, show]);

 /**
 * 暂停（等当前章完成后停止）
 */
 const pause = useCallback(() => {
 pauseRequestedRef.current = true;
 }, []);

 /**
 * 从暂停处继续
 */
 const resume = useCallback(() => {
 if (state.status !== 'paused' || !book) return;
 const remaining = state.queue.slice(state.currentIndex);
 if (remaining.length === 0) {
 setState((s) => ({ ...s, status: 'completed' }));
 return;
 }
 // 重新调用 start，从剩余章节开始
 void start(remaining);
 }, [state, book, start]);

 /**
 * 停止并重置
 */
 const stop = useCallback(() => {
 abortRef.current = true;
 pauseRequestedRef.current = true;
 setState({ status: 'idle', queue: [], currentIndex: 0, phase: 'idle' });
 }, []);

 return {
 state,
 start,
 pause,
 resume,
 stop,
 };
}
