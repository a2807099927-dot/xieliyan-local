// 模块说明：强力润色（full_review_strong）独立管线，锁定剧情/对白/地点/人物，重构描写与叙述。与标准润色 useFullReview 完全分离。
import { useState, useCallback, useRef } from 'react';
import { electronAPI } from '../utils/electron';
import type { ReviewResult, ReviewStatus, ParagraphDiff } from '../types/review';
// 强力润色使用下方按块逐段配对生成 diff，不依赖全局 LCS。
import { getPrompt, withBaseProse } from '../utils/promptStore';

const FULL_REVIEW_REWRITE_CHUNK_SIZE = 500;

// 段数保险：统计文本的非空段落数（按换行切分），用于校验润色前后段落数是否一致。
function countParas(text: string): number {
 return text.replace(/\r\n/g, '\n').split(/\n+/).map((s) => s.trim()).filter(Boolean).length;
}

function splitTextForRewrite(text: string, maxChars = FULL_REVIEW_REWRITE_CHUNK_SIZE): string[] {
 const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
 const paragraphs = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
 if (paragraphs.length === 0) return [];

 const chunks: string[] = [];
 let current: string[] = [];
 let currentLength = 0;

 const flush = () => {
 if (current.length === 0) return;
 chunks.push(current.join('\n'));
 current = [];
 currentLength = 0;
 };

 for (const paragraph of paragraphs) {
 if (paragraph.length > maxChars * 1.4) {
 flush();
 for (let start = 0; start < paragraph.length; start += maxChars) {
 chunks.push(paragraph.slice(start, start + maxChars));
 }
 continue;
 }

 const nextLength = currentLength + paragraph.length + (current.length > 0 ? 1 : 0);
 if (current.length > 0 && nextLength > maxChars) {
 flush();
 }
 current.push(paragraph);
 currentLength += paragraph.length + (current.length > 1 ? 1 : 0);
 }

 flush();
 return chunks;
}

function stripRewriteChunkWrapper(text: string): string {
 return text
 .replace(/^\s*```(?:\w+)?\s*/i, '')
 .replace(/\s*```\s*$/i, '')
 .replace(/^\s*(?:第\s*\d+\s*段|分段\s*\d+|片段\s*\d+|chunk\s*\d+)\s*[:：]\s*/i, '')
 .trim();
}

export interface UseStrongReviewReturn {
 status: ReviewStatus;
 result: ReviewResult | null;
 error: string | null;
 startReview: (chapterId: string, fullText: string, bookId?: string) => Promise<void>;
 clearReview: () => void;
 acceptDiff: (id: string) => void;
 rejectDiff: (id: string) => void;
}

// 段落切分：按换行拆分并去空白空行（trim 会顺带吃掉 CRLF 的 \r），与 countParas 的计数口径一致。
function splitStrongParas(text: string): string[] {
 return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

// 按块逐段配对生成段落 diff：原段[i] ↔ 润色段[i]。段数保险已保证每块「原文段数 = 润色段数」
// （不一致会回退为原段，仍然相等），因此配对永远对齐；即便某块异常，错位也被限制在该块内部，
// 绝不会像全局 LCS 那样从某一段开始雪崩式错位、把后续整片段落判成删除。
function buildChunkAlignedDiffs(originalChunks: string[], rewrittenChunks: string[]): ParagraphDiff[] {
 const results: ParagraphDiff[] = [];
 let seq = 0;
 for (let c = 0; c < originalChunks.length; c += 1) {
 const oParas = splitStrongParas(originalChunks[c] || '');
 const rParas = splitStrongParas(rewrittenChunks[c] || '');
 const count = Math.max(oParas.length, rParas.length);
 for (let i = 0; i < count; i += 1) {
 const original = oParas[i] || '';
 const rewritten = rParas[i] || '';
 if (!original && !rewritten) continue;
 results.push({
 id: `diff-${Date.now()}-${seq++}`,
 original,
 rewritten,
 status: original === rewritten ? 'accepted' : 'pending',
 });
 }
 }
 return results;
}

export function useStrongReview(): UseStrongReviewReturn {
 const [status, setStatus] = useState<ReviewStatus>('idle');
 const [result, setResult] = useState<ReviewResult | null>(null);
 const [error, setError] = useState<string | null>(null);
 const abortControllerRef = useRef<AbortController | null>(null);

 const clearReview = useCallback(() => {
 if (abortControllerRef.current) {
 abortControllerRef.current.abort();
 abortControllerRef.current = null;
 }
 setStatus('idle');
 setResult(null);
 setError(null);
 }, []);

 const startReview = useCallback(async (chapterId: string, fullText: string, bookId?: string) => {
 clearReview();
 if (!fullText.trim()) return;

 const { requireFeatureAccess } = await import('../utils/featureCheck');
 if (!(await requireFeatureAccess('full_review'))) {
 return;
 }

 setStatus('scanning');
 setError(null);
 const abortCtrl = new AbortController();
 abortControllerRef.current = abortCtrl;

 try {
 const systemPromptText = withBaseProse(await getPrompt('full_review_strong'));
 const chunks = splitTextForRewrite(fullText);
 const rewrittenChunks: string[] = [];

 for (let index = 0; index < chunks.length; index += 1) {
 if (abortCtrl.signal.aborted) return;
 const chunk = chunks[index];
 const chunkContent = [
 `当前模式mode=C`,
 `当前为全文分段强力润色：第 ${index + 1} / ${chunks.length} 段。`,
 `你必须完整处理本段内每一句，不得只处理开头或结尾。`,
 `只输出本段润色后的正文，不要输出段号、说明、标题或 Markdown。`,
 ``,
 `【正文分段】`,
 chunk
 ].join('\n');

 const response = await electronAPI.ai.chat({
 messages: [
 { role: 'system', content: systemPromptText },
 { role: 'user', content: chunkContent }
 ],
 stream: false,
 bookId,
 chapterId,
 disableRag: true,
 disableStyle: true, // Let frontend handle style injection as resolved above
 });

 let rewritten = stripRewriteChunkWrapper(response.text || '');
 // 段数保险：润色后段数必须与原段一致，否则 diff 会全局错位。不一致则重试一次，仍不一致回退原段（该段显示为未改动）。
 if (countParas(rewritten) !== countParas(chunk)) {
 const retryResponse = await electronAPI.ai.chat({
 messages: [
 { role: 'system', content: systemPromptText },
 { role: 'user', content: `${chunkContent}\n\n【严格要求】上一次输出的段落数量与原文不一致。必须与原文逐段一一对应，原文有几段就输出几段，绝不拆段、并段或增删空行。` }
 ],
 stream: false,
 bookId,
 chapterId,
 disableRag: true,
 disableStyle: true,
 });
 const retried = stripRewriteChunkWrapper(retryResponse.text || '');
 rewritten = countParas(retried) === countParas(chunk) ? retried : chunk;
 }
 rewrittenChunks.push(rewritten);
 }

 if (abortCtrl.signal.aborted) return;

 const rewrittenFullText = rewrittenChunks.filter(Boolean).join('\n\n');
 const paragraphDiffs = buildChunkAlignedDiffs(chunks, rewrittenChunks);
 setResult({
 chapterId,
 createdAt: Date.now(),
 rewrittenFullText,
 originalFullText: fullText,
 paragraphDiffs
 });
 setStatus('done');
 } catch (err: any) {
 if (abortCtrl.signal.aborted) return;
 setStatus('error');
 setError(err.message || '审查请求失败');
 } finally {
 if (abortControllerRef.current === abortCtrl) {
 abortControllerRef.current = null;
 }
 }
 }, [clearReview]);

 const acceptDiff = useCallback((id: string) => {
 setResult(prev => {
 if (!prev || !prev.paragraphDiffs) return prev;
 return {
 ...prev,
 paragraphDiffs: prev.paragraphDiffs.map(d => d.id === id ? { ...d, status: 'accepted' as const } : d)
 };
 });
 }, []);

 const rejectDiff = useCallback((id: string) => {
 setResult(prev => {
 if (!prev || !prev.paragraphDiffs) return prev;
 return {
 ...prev,
 paragraphDiffs: prev.paragraphDiffs.map(d => d.id === id ? { ...d, status: 'rejected' as const } : d)
 };
 });
 }, []);

 return {
 status,
 result,
 error,
 startReview,
 clearReview,
 acceptDiff,
 rejectDiff
 };
}
