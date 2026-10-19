/**
 * 本地全文搜索模块
 *
 * 职责：在所有章节正文中搜索关键词，返回按章节折叠的命中位置与上下文。
 * 全程只读取本地数据，不调用模型、不消耗 token。
 */

import type { Book, Chapter } from '../types';

export interface LocalSearchOccurrence {
 /** 纯文本偏移；交给 pendingSearchJump 后由编辑器换算为 ProseMirror 位置。 */
 from: number;
 to: number;
 text: string;
 snippet: string;
}

export interface LocalSearchHit {
 chapterId: string;
 chapterIndex: number;
 chapterTitle: string;
 count: number;
 snippet: string;
 isAnalyzed: boolean;
 occurrences: LocalSearchOccurrence[];
}

export interface LocalSearchResult {
 keyword: string;
 totalHits: number;
 hits: LocalSearchHit[];
}

/**
 * 与全局查找替换使用相同思路：保留段落换行，确保 text offset 能被编辑器准确还原。
 */
export function htmlToPlainWithBreaks(html: string): string {
 return String(html || '')
 .replace(/\r\n/g, '\n')
 .replace(/<\s*br\s*\/?\s*>/gi, '\n')
 .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote|section|article)\s*>/gi, '\n')
 .replace(/<\s*(p|div|h[1-6]|li|tr|blockquote|section|article)(\s[^>]*)?>/gi, '\n')
 .replace(/<[^>]+>/g, '')
 .replace(/&nbsp;/gi, ' ')
 .replace(/&#160;/g, ' ')
 .replace(/&lt;/g, '<')
 .replace(/&gt;/g, '>')
 .replace(/&amp;/g, '&')
 .replace(/&quot;/g, '"')
 .replace(/&#39;/g, "'")
 .replace(/[ \t]+\n/g, '\n')
 .replace(/\n[ \t]+/g, '\n')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
}

function extractOccurrenceSnippet(text: string, from: number, keywordLength: number): string {
 let start = Math.max(0, from - 38);
 let end = Math.min(text.length, from + keywordLength + 58);
 const leftBreak = text.lastIndexOf('\n', from);
 const rightBreak = text.indexOf('\n', from + keywordLength);
 if (leftBreak >= 0 && from - leftBreak < 80) start = leftBreak + 1;
 if (rightBreak >= 0 && rightBreak - from < 120) end = rightBreak;
 const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
 return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

export function searchInChapter(
 chapter: Chapter,
 chapterIndex: number,
 keyword: string,
 isAnalyzed = false
): LocalSearchHit | null {
 const normalizedKeyword = keyword.trim();
 if (!normalizedKeyword || normalizedKeyword.length < 2) return null;
 const plainText = htmlToPlainWithBreaks(chapter.content);
 if (!plainText) return null;

 const occurrences: LocalSearchOccurrence[] = [];
 let totalCount = 0;
 let searchFrom = 0;
 while (searchFrom <= plainText.length) {
 const index = plainText.indexOf(normalizedKeyword, searchFrom);
 if (index < 0) break;
 totalCount += 1;
 // 单章最多保留 30 个可跳转位置，避免极端重复词撑爆会话记录。
 if (occurrences.length < 30) {
 occurrences.push({
 from: index,
 to: index + normalizedKeyword.length,
 text: normalizedKeyword,
 snippet: extractOccurrenceSnippet(plainText, index, normalizedKeyword.length)
 });
 }
 searchFrom = index + Math.max(1, normalizedKeyword.length);
 }
 if (totalCount === 0) return null;

 return {
 chapterId: chapter.id,
 chapterIndex,
 chapterTitle: chapter.title || `第${chapterIndex + 1}章`,
 count: totalCount,
 snippet: occurrences[0]?.snippet || normalizedKeyword,
 isAnalyzed,
 occurrences
 };
}

export function searchInBook(book: Book, keyword: string): LocalSearchResult {
 const normalizedKeyword = keyword.trim();
 if (!normalizedKeyword || normalizedKeyword.length < 2) {
 return { keyword: normalizedKeyword, totalHits: 0, hits: [] };
 }

 const memoryMap = new Map((book.memoryBank || []).map((memory) => [memory.chapterId, memory]));
 const hits = (book.chapters || [])
 .map((chapter, index) => searchInChapter(chapter, index, normalizedKeyword, Boolean(memoryMap.get(chapter.id)?.isAnalyzed)))
 .filter((hit): hit is LocalSearchHit => Boolean(hit));

 return {
 keyword: normalizedKeyword,
 totalHits: hits.reduce((sum, hit) => sum + hit.count, 0),
 hits
 };
}

export function formatSearchResultForAgent(result: LocalSearchResult): string {
 if (result.hits.length === 0) return `在全书中未找到“${result.keyword}”。`;
 return `“${result.keyword}”共出现 ${result.totalHits} 次，分布在 ${result.hits.length} 个章节。点击章节展开，再点击具体段落即可跳转。`;
}
