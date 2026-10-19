// useAnalysis
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisMode, Chapter, ChatMessage } from '../types';

export const BATCH_MESSAGE_PREFIX = '[batch]';

type AnalyzeRequest = {
  requestId?: string;
  chapterTitle: string;
  chapterContent: string;
  chapterCount?: number;
  mode: AnalysisMode;
  userQuestion?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

function formatAnalyzeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/quota|token-limit|exceeded your current quota|billing details/i.test(raw)) {
    return 'AI 调用失败：当前模型额度不足或套餐 token 已达上限。请在设置里切换可用模型/中转站，或检查对应平台余额与限额。';
  }
  if (/未配置 AI API Key|api key/i.test(raw)) {
    return 'AI 调用失败：尚未配置可用的 API Key，请先到设置里完成模型接入。';
  }
  if (/timeout|timed out|ECONNRESET|network/i.test(raw)) {
    return 'AI 调用失败：网络连接超时或被中断，请稍后重试。';
  }
  return `AI 调用失败：${raw}`;
}

// 每批合并后的最大字符数：超过则自动拆成多批、多次调用 AI 再合并结果
export const CHUNK_CHAR_LIMIT = 12000;
// 每批最多章节数：防止大量短章挤在一批导致输出被 max_tokens 截断
export const MAX_CHAPTERS_PER_BATCH = 6;

/** 把选中的章节按字数/数量上限拆分成多批（不拆分单个章节内部） */
export function chunkChapters(chapters: Chapter[], maxChars: number, maxCount: number): Chapter[][] {
  const batches: Chapter[][] = [];
  let cur: Chapter[] = [];
  let curLen = 0;
  for (const ch of chapters) {
    const len = ch.content?.length || 0;
    const overflow = cur.length > 0 && (curLen + len > maxChars || cur.length >= maxCount);
    if (overflow) {
      batches.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(ch);
    curLen += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function useAnalysis() {
  const cleanupRef = useRef<Array<() => void>>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeMode, setActiveMode] = useState<AnalysisMode>('full');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');
  const failedChaptersRef = useRef<Chapter[]>([]);
  // 分批分析时用于中途停止的标志
  const stopRef = useRef(false);

  const resetListeners = useCallback(() => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
  }, []);

  useEffect(() => () => resetListeners(), [resetListeners]);

  const runAnalyzeAsync = useCallback(
    (req: AnalyzeRequest, onChunk: (chunk: string) => void): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (!window.novelLab) return reject(new Error('novelLab API unavailable'));

        const requestId = req.requestId || `nl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const matchesRequest = (payload: unknown) => {
          if (!payload || typeof payload !== 'object' || !('requestId' in payload)) return true;
          return (payload as { requestId?: string }).requestId === requestId;
        };

        resetListeners();
        const removeChunk = window.novelLab.onAnalyzeChunk((payload) => {
          if (!matchesRequest(payload)) return;
          const text = typeof payload === 'string' ? payload : String(payload.text || '');
          if (text) onChunk(text);
        });
        const removeDone = window.novelLab.onAnalyzeDone((payload) => {
          if (!matchesRequest(payload)) return;
          resetListeners();
          resolve();
        });
        const removeErr = window.novelLab.onAnalyzeError((payload) => {
          if (!matchesRequest(payload)) return;
          const err = typeof payload === 'string' ? payload : String(payload.error || '分析失败');
          resetListeners();
          reject(new Error(err));
        });

        cleanupRef.current.push(removeChunk, removeDone, removeErr);
        window.novelLab.analyze({ ...req, requestId });
      });
    },
    [resetListeners]
  );

  // 用 ref 镜像 messages，避免 ask 依赖 messages 数组引用导致每次消息更新都重建函数
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const ask = useCallback(
    (chapter: Chapter, question: string) => {
      if (isAnalyzing) {
        // 分析进行中时给用户明确反馈，不静默丢弃
        window.dispatchEvent(new CustomEvent('writerzen:island-show', {
          detail: { type: 'warning', message: '分析进行中，请等待完成后再提问', autoHideMs: 1800 }
        }));
        return;
      }
      setIsAnalyzing(true);

      // 从 ref 读取最新 messages，不依赖闭包捕获的旧值
      const history = messagesRef.current.filter((m) => !m.isStreaming).map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '', isStreaming: true }]);

      let pendingChunks = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        flushTimer = null;
        if (!pendingChunks) return;
        const toFlush = pendingChunks;
        pendingChunks = '';
        setMessages((prev) => {
          const out = [...prev];
          const last = out[out.length - 1];
          if (last?.isStreaming) out[out.length - 1] = { ...last, content: last.content + toFlush };
          return out;
        });
      };

      runAnalyzeAsync(
        {
          chapterTitle: chapter.title,
          chapterContent: chapter.content || '',
          chapterCount: 1,
          mode: activeMode,
          userQuestion: question,
          conversationHistory: history
        },
        (chunk) => {
          pendingChunks += chunk;
          if (!flushTimer) flushTimer = setTimeout(flush, 100);
        }
      )
        .then(() => {
          if (flushTimer) clearTimeout(flushTimer);
          flush();
          setMessages((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last?.isStreaming) out[out.length - 1] = { ...last, isStreaming: false };
            return out;
          });
        })
        .catch((err) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: formatAnalyzeError(err) }]);
        })
        .finally(() => setIsAnalyzing(false));
    },
    [activeMode, isAnalyzing, runAnalyzeAsync]
  );

  const startBatchAnalysis = useCallback(
    async (chapters: Chapter[], mode: AnalysisMode) => {
      if (isAnalyzing || chapters.length === 0) return;

      const { requireFeatureAccess } = await import('../../../utils/featureCheck');
      if (!(await requireFeatureAccess('novel_lab'))) {
        return;
      }

      stopRef.current = false;
      setIsAnalyzing(true);
      setBatchStatus('');

      // 按字数/数量上限把选中章节拆成多批，逐批调用 AI 再合并结果
      const batches = chunkChapters(chapters, CHUNK_CHAR_LIMIT, MAX_CHAPTERS_PER_BATCH);
      const totalChars = chapters.reduce((acc, ch) => acc + (ch.content?.length || 0), 0);
      const overallLabel = chapters.length === 1
        ? (chapters[0].title || `第 ${chapters[0].index} 章`)
        : `${chapters.length} 章`;
      const headMsg = batches.length > 1
        ? `分析：${overallLabel}（共 ${totalChars} 字，自动分 ${batches.length} 批）`
        : `分析：${overallLabel}（共 ${totalChars} 字）`;

      setMessages([
        { role: 'user', content: headMsg },
        { role: 'assistant', content: BATCH_MESSAGE_PREFIX, isStreaming: true },
      ]);

      // 跨批累计的完整结果（各批产出的 [card] 块顺序拼接）
      let accumulated = '';

      try {
        for (let b = 0; b < batches.length; b += 1) {
          if (stopRef.current) break;
          const batch = batches[b];
          const batchLabel = batch.length === 1
            ? (batch[0].title || `第 ${batch[0].index} 章`)
            : `第 ${batch[0].index}~${batch[batch.length - 1].index} 章`;
          setBatchStatus(
            batches.length > 1
              ? `正在分析第 ${b + 1}/${batches.length} 批（${batchLabel}）...`
              : `正在分析 ${batchLabel}...`
          );

          const mergedContent = batch
            .map((ch) => `【${ch.title || `第 ${ch.index} 章`}】\n${ch.content || ''}`)
            .join('\n\n');

          let flushTimer: ReturnType<typeof setTimeout> | null = null;
          let pendingChunks = '';
          let batchResult = '';

          const flush = () => {
            flushTimer = null;
            if (!pendingChunks) return;
            pendingChunks = '';
            setMessages((prev) => {
              const out = [...prev];
              const last = out[out.length - 1];
              if (last?.isStreaming) out[out.length - 1] = { ...last, content: BATCH_MESSAGE_PREFIX + accumulated + batchResult };
              return out;
            });
          };

          try {
            await runAnalyzeAsync(
              {
                chapterTitle: batchLabel,
                chapterContent: mergedContent,
                chapterCount: batch.length,
                mode,
              },
              (chunk) => {
                batchResult += chunk;
                pendingChunks += chunk;
                if (!flushTimer) flushTimer = setTimeout(flush, 150);
              }
            );
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            accumulated += (accumulated && batchResult ? '\n' : '') + batchResult;
          } catch (err) {
            if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
            if (stopRef.current) break;
            accumulated += `${accumulated ? '\n' : ''}⚠️ 第 ${b + 1}/${batches.length} 批（${batchLabel}）分析失败：${formatAnalyzeError(err)}`;
          }

          // 固化本批结果到消息（保持 streaming 光标）
          setMessages((prev) => {
            const out = [...prev];
            const last = out[out.length - 1];
            if (last?.isStreaming) out[out.length - 1] = { ...last, content: BATCH_MESSAGE_PREFIX + accumulated };
            return out;
          });
        }

        // 全部批次结束：去掉 streaming 标记
        setMessages((prev) => {
          const out = [...prev];
          const last = out[out.length - 1];
          if (last?.isStreaming) out[out.length - 1] = { ...last, content: BATCH_MESSAGE_PREFIX + accumulated, isStreaming: false };
          return out;
        });
      } catch (err) {
        setMessages((prev) => {
          const out = prev.filter((m) => !m.isStreaming);
          return [...out, { role: 'assistant' as const, content: `⚠️ 分析失败：${err instanceof Error ? err.message : String(err)}` }];
        });
      } finally {
        setIsAnalyzing(false);
        setBatchStatus('');
      }
    },
    [isAnalyzing, runAnalyzeAsync]
  );

  const stop = useCallback(() => {
    stopRef.current = true;
    window.novelLab?.abortAnalyze();
    setIsAnalyzing(false);
    resetListeners();
    setBatchStatus('');
  }, [resetListeners]);

  /**
   * 单章重新分析（用于 LegacyChapterCard "重新分析"按钮）
   *
   * 行为（design.md §7.2，CP-8）：
   * - 使用当前 activeMode 跑一次单章 analyze，AI 走新 [card] schema
   * - 完成后把 messages 中"该章对应的 [batch] 消息"替换成新格式
   * - 用章号 + 标题在 user 消息中匹配（"i/N：title" 模式 OR 单纯标题）
   * - 把紧随其后的 assistant 消息内容换成 BATCH_MESSAGE_PREFIX + currentResult
   * - 失败时不动原消息，附加一条错误提示
   */
  const reanalyzeChapter = useCallback(
    async (chapter: Chapter) => {
      if (isAnalyzing) return;
      setIsAnalyzing(true);
      const label = chapter.title || `第 ${chapter.index} 章`;
      setBatchStatus(`重新分析：${label}`);

      try {
        let result = '';
        await runAnalyzeAsync(
          {
            chapterTitle: label,
            chapterContent: chapter.content || '',
            chapterCount: 1,
            mode: activeMode,
          },
          (chunk) => { result += chunk; },
        );

        // 找到该章对应的 user 消息（匹配标题），把它后面的 assistant 消息替换为新结果
        setMessages((prev) => {
          const out = [...prev];
          // 从后往前找 user 消息，命中则把下一条 assistant 消息替换
          for (let i = out.length - 1; i >= 0; i -= 1) {
            const m = out[i];
            if (m.role === 'user' && m.content.includes(label)) {
              const next = out[i + 1];
              if (next && next.role === 'assistant') {
                out[i + 1] = { ...next, content: BATCH_MESSAGE_PREFIX + result };
              }
              break;
            }
          }
          return out;
        });
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${label} 重新分析失败：${formatAnalyzeError(err)}` },
        ]);
      } finally {
        setIsAnalyzing(false);
        setBatchStatus('');
      }
    },
    [activeMode, isAnalyzing, runAnalyzeAsync],
  );

  const retryFailed = useCallback((specificChapter?: Chapter) => {
    if (isAnalyzing) return;
    // 单章重试模式
    const toRetry = specificChapter ? [specificChapter] : failedChaptersRef.current.splice(0, 1);
    if (toRetry.length === 0) return;
    const ch = toRetry[0];
    setIsAnalyzing(true);

    const label = ch.title || `第 ${ch.index} 章`;
    setBatchStatus(`重试中：${label}`);

    // 把错误消息替换为"重试中"
    setMessages((prev) => prev.map(m =>
      (m.role === 'assistant' && m.content.includes(label) && (m.content.includes('分析失败') || m.content.startsWith('⚠️')))
        ? { ...m, content: `⏳ ${label} 重试中...` }
        : m
    ));

    (async () => {
      try {
        let result = '';
        await runAnalyzeAsync({ chapterTitle: label, chapterContent: ch.content || '', chapterCount: 1, mode: activeMode }, (chunk) => { result += chunk; });
        setMessages((prev) => prev.map(m =>
          (m.role === 'assistant' && m.content === `⏳ ${label} 重试中...`)
            ? { ...m, content: BATCH_MESSAGE_PREFIX + result }
            : m
        ));
        // 从失败列表中移除
        failedChaptersRef.current = failedChaptersRef.current.filter(c => c.index !== ch.index);
      } catch (err) {
        setMessages((prev) => prev.map(m =>
          (m.role === 'assistant' && m.content === `⏳ ${label} 重试中...`)
            ? { ...m, content: `⚠️ ${label} 分析失败：${formatAnalyzeError(err)}` }
            : m
        ));
      }
      setIsAnalyzing(false);
      setBatchStatus('');
    })();
  }, [activeMode, isAnalyzing, runAnalyzeAsync]);

  return { messages, setMessages, activeMode, setActiveMode, isAnalyzing, batchStatus, startBatchAnalysis, ask, stop, retryFailed, reanalyzeChapter, hasFailedChapters: failedChaptersRef.current.length > 0 };
}
