// 模块说明：AI 对话流程 Hook。
// 关键职责：单飞行锁、指数退避重试、流式 <think> 标签过滤、RTT/TTFT 指标采集、灵动岛状态联动。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiProvider } from '../types/ai';
import { electronAPI } from '../utils/electron';
import { useConfigStore } from '../store/useConfigStore';
import { useBookStore } from '../store/useBookStore';
import { resolveStyleForBook, injectStyleToMessages } from '../utils/styleResolver';
import { useIslandStore } from '../store/useIslandStore';

export type ChatRole = 'system' | 'user' | 'assistant';
export type AiChatStatus = 'idle' | 'connecting' | 'memoizing' | 'thinking' | 'streaming';

export interface ChatMessagePayload {
 role: ChatRole;
 content: string;
}

interface ChatRequest {
 messages?: ChatMessagePayload[];
 prepareMessages?: () => ChatMessagePayload[];
 stream?: boolean;
 bookId?: string;
 chapterId?: string;
 onChunk?: (text: string, done: boolean) => void;
 disableRag?: boolean;
 disableStyle?: boolean;
 /** 无脑爽文模式：通知主进程从加密包注入 system prompt，渲染进程不持有 prompt 内容 */
 shuangwenMode?: boolean;
}

interface UseAiChatOptions {
 onChunk?: (text: string, done: boolean) => void;
}

interface ChatResponse {
 text: string;
 durationMs?: number;
 provider: AiProvider;
 usage?: {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;
 };
 model?: string;
 tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
}

export interface AiChatMetrics {
 runId: number;
 startedAt: number;
 endedAt?: number;
 rttMs?: number;
 ttftMs?: number;
 avgLatencyMs?: number;
 totalMs?: number;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

function sleep(ms: number): Promise<void> {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成一次流式会话的唯一标识。
 * 随请求传给 Rust（ChatRequest.sessionId），chunk 事件会原样回填，
 * 前端 onStreamChunkFor 据此过滤，多个并发流式请求不再互相串扰。
 */
function makeStreamSessionId(): string {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
  return `ai-${crypto.randomUUID()}`;
 }
 return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isAbortLike(error: unknown): boolean {
 const message = error instanceof Error ? error.message : String(error ?? '');
 return /abort|aborted|cancel/i.test(message);
}

function isRetryable(error: unknown): boolean {
 const message = error instanceof Error ? error.message : String(error ?? '');
 if (isAbortLike(error)) return false;
 // Do not retry when main process reports an in-flight request lock.
 if (/REQUEST_IN_PROGRESS|already\s+has\s+request|in\s*progress/i.test(message)) return false;
 return /(429|5\d\d|timeout|timed out|network|fetch failed|net::ERR_|ECONN|ENOTFOUND|EAI_AGAIN|socket)/i.test(message);
}

function roundMetric(value: number | undefined): number | undefined {
 if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
 return Math.max(0, Math.round(value));
}

// useAiChat
export function useAiChat(options: UseAiChatOptions = {}) {
 const [requestInFlight, setRequestInFlight] = useState(false);
 const [status, setStatus] = useState<AiChatStatus>('idle');
 const [metrics, setMetrics] = useState<AiChatMetrics | null>(null);
 const offRef = useRef<null | (() => void)>(null);
 const stoppedRef = useRef(false);
 const runIdRef = useRef(0);
 const ownsActiveRequestRef = useRef(false);

const stop = useCallback(() => {
    stoppedRef.current = true;
    offRef.current?.();
    offRef.current = null;
    if (ownsActiveRequestRef.current) {
      void electronAPI.ai.abort('main').catch(() => undefined);
    }
    setRequestInFlight(false);
    setStatus('idle');
  }, []);

 const chat = useCallback(
 async (request: ChatRequest): Promise<ChatResponse> => {
 // Single-flight guard: this hook enforces one active request per editor context.
 if (requestInFlight) {
 throw new Error('REQUEST_IN_PROGRESS');
 }

 const runId = ++runIdRef.current;
 const sessionId = makeStreamSessionId();
 const startedAt = performance.now();
 let firstEventAt: number | null = null;
 let firstTokenAt: number | null = null;
 let lastTokenAt: number | null = null;
 let tokenGapSum = 0;
 let tokenGapCount = 0;

 setMetrics({ runId, startedAt });
 setRequestInFlight(true);
 setStatus('connecting');
 stoppedRef.current = false;
 ownsActiveRequestRef.current = true;

 // 灵动岛显示"AI 请求中" + 中止按钮，请求立刻发，按钮一直可用直到结束
 const { startTask, finishTask } = useIslandStore.getState();
 const islandTaskId = startTask({
 type: 'progress',
 status: 'connecting',
 message: 'AI 请求准备中...',
 actions: [{ id: 'abort-ai', label: '中止', onClick: () => { stop(); } }]
 });

 try {
 offRef.current?.();
 offRef.current = null;

 const chunkListener = request.onChunk ?? options.onChunk;
 if (request.stream && chunkListener) {
 // 思考链过滤状态机：过滤 <think>...</think> / <thinking>...</thinking> 标签内容
 let thinkBuffer = '';
 let inThinkBlock = false;

 const filterThinkTags = (text: string, done: boolean): void => {
 if (!text && !done) return;

 let output = '';
 let remaining = inThinkBlock ? '' : text;

 if (inThinkBlock) {
 // 在思考块内，寻找结束标签
 const combined = thinkBuffer + text;
 const endMatch = combined.match(/<\/think(?:ing)?>/i);
 if (endMatch) {
 inThinkBlock = false;
 thinkBuffer = '';
 remaining = combined.slice(endMatch.index! + endMatch[0].length);
 } else {
 thinkBuffer = combined;
 if (done) chunkListener('', true);
 return;
 }
 }

 // 在正常内容中，寻找开始标签
 const startMatch = remaining.match(/<think(?:ing)?>/i);
 if (startMatch) {
 output = remaining.slice(0, startMatch.index);
 inThinkBlock = true;
 thinkBuffer = remaining.slice(startMatch.index! + startMatch[0].length);
 // 递归处理 thinkBuffer 中可能已有结束标签的情况
 const endInBuffer = thinkBuffer.match(/<\/think(?:ing)?>/i);
 if (endInBuffer) {
 inThinkBlock = false;
 const afterEnd = thinkBuffer.slice(endInBuffer.index! + endInBuffer[0].length);
 thinkBuffer = '';
 output += afterEnd;
 }
 } else {
 output = remaining;
 }

 if (output || done) {
 chunkListener(output, done);
 }
 };

 offRef.current = electronAPI.ai.onStreamChunkFor(sessionId, (chunk) => {
 if (stoppedRef.current) return;
 const now = performance.now();
 if (firstEventAt === null) {
 firstEventAt = now;
 }

 if (chunk.text) {
 if (firstTokenAt === null) {
 firstTokenAt = now;
 setStatus('streaming');
 const rttMs = firstEventAt !== null ? firstEventAt - startedAt : undefined;
 const ttftMs = firstTokenAt !== null ? firstTokenAt - startedAt : undefined;
 setMetrics((prev) => {
 if (!prev || prev.runId !== runId) return prev;
 return {
 ...prev,
 rttMs: roundMetric(rttMs),
 ttftMs: roundMetric(ttftMs)
 };
 });
 }
 if (lastTokenAt !== null) {
 tokenGapSum += now - lastTokenAt;
 tokenGapCount += 1;
 }
 lastTokenAt = now;
 }

 filterThinkTags(chunk.text, chunk.done);
 });
 }

 setStatus('memoizing');
 const preparedMessages = request.prepareMessages ? request.prepareMessages() : request.messages;
 if (!preparedMessages || preparedMessages.length === 0) {
 throw new Error('发送消息不能为空');
 }

 let response: ChatResponse | null = null;
 let lastError: unknown = null;

 for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
 // Retry only on transient provider/network failures; abort and lock errors fail fast.
 if (stoppedRef.current) {
 throw new Error('请求已被用户取消');
 }

 try {
 setStatus('thinking');
 const config = useConfigStore.getState().config;
 const books = useBookStore.getState().books;
 const finalMessages = config
 ? injectStyleToMessages(preparedMessages, request.bookId, config, books, request.disableStyle)
 : preparedMessages;
 const next = await electronAPI.ai.chat({
 messages: finalMessages,
 stream: Boolean(request.stream),
 bookId: request.bookId,
 chapterId: request.chapterId,
 disableRag: request.disableRag,
 disableStyle: request.disableStyle,
 shuangwenMode: request.shuangwenMode,
 sessionId
 });
 response = next as ChatResponse;
 break;
 } catch (error) {
 lastError = error;
 if (!isRetryable(error) || attempt >= RETRY_DELAYS_MS.length || stoppedRef.current) {
 throw error;
 }
 await sleep(RETRY_DELAYS_MS[attempt]);
 }
 }

 if (!response) {
 throw (lastError instanceof Error ? lastError : new Error(String(lastError || 'AI request failed')));
 }

 return response;
 } finally {
 // 关闭灵动岛任务
 finishTask(islandTaskId);

 const endedAt = performance.now();
 const fallbackRtt = firstEventAt !== null ? firstEventAt - startedAt : undefined;
 const fallbackTtft = firstTokenAt !== null ? firstTokenAt - startedAt : undefined;
 const avgLatency = tokenGapCount > 0 ? tokenGapSum / tokenGapCount : undefined;

 setMetrics((prev) => {
 if (!prev || prev.runId !== runId) return prev;
 return {
 ...prev,
 endedAt,
 rttMs: roundMetric(prev.rttMs ?? fallbackRtt),
 ttftMs: roundMetric(prev.ttftMs ?? fallbackTtft),
 avgLatencyMs: roundMetric(avgLatency),
 totalMs: roundMetric(endedAt - startedAt)
 };
 });

 offRef.current?.();
 offRef.current = null;
 stoppedRef.current = false;
 ownsActiveRequestRef.current = false;
 setRequestInFlight(false);
 setStatus('idle');
 }
 },
 [options.onChunk, requestInFlight]
 );

 useEffect(
 () => () => {
 // 卸载时清理：取消本地流监听器 + 主动 abort 主进程的飞行请求，
 // 避免切换窗口/章节后 senderId 上的 AbortController 残留，导致下一次请求被 REQUEST_IN_PROGRESS 拒绝
 offRef.current?.();
 offRef.current = null;
 stoppedRef.current = true;
 // Fire-and-forget：主进程 abort 不需要等待确认
 void electronAPI.ai.abort('main').catch(() => {});
 },
 []
 );

 return { chat, stop, requestInFlight, status, metrics };
}

