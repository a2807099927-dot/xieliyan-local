import { useState, useCallback, useRef } from 'react';
import { electronAPI } from '../utils/electron';
import type { ReviewResult, ReviewStatus } from '../types/review';
import { buildParagraphDiffs } from '../utils/editor/diff';
import { getPrompt, withBaseProse } from '../utils/promptStore';

const FULL_REVIEW_REWRITE_CHUNK_SIZE = 500;

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

export interface UseFullReviewReturn {
 status: ReviewStatus;
 result: ReviewResult | null;
 error: string | null;
 startReview: (chapterId: string, fullText: string, bookId?: string) => Promise<void>;
 clearReview: () => void;
 acceptDiff: (id: string) => void;
 rejectDiff: (id: string) => void;
}

export function useFullReview(): UseFullReviewReturn {
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
 const systemPromptText = withBaseProse(await getPrompt('full_rewrite_system'));
 const chunks = splitTextForRewrite(fullText);
 const rewrittenChunks: string[] = [];

 for (let index = 0; index < chunks.length; index += 1) {
 if (abortCtrl.signal.aborted) return;
 const chunk = chunks[index];
 const chunkContent = [
 `当前模式mode=C`,
 `当前为全文分段润色：第 ${index + 1} / ${chunks.length} 段。`,
 `你必须完整处理本段内每一句，不得只处理开头或结尾。`,
 `可优化则优化，无需优化则原样保留；禁止遗漏本段任何一句。`,
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

 rewrittenChunks.push(stripRewriteChunkWrapper(response.text || ''));
 }

 if (abortCtrl.signal.aborted) return;

 const rewrittenFullText = rewrittenChunks.filter(Boolean).join('\n\n');
 const paragraphDiffs = buildParagraphDiffs(fullText, rewrittenFullText);
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
