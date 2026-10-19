/**
 * 记忆检索模块
 *
 * 职责：从用户输入中提取关键词，在 memoryBank / archiveRecords 中检索相关信息，
 * 组装成可注入 AI 上下文的文本。
 *
 * 检索策略：
 * 1. 全量章节摘要索引（每章一句话，始终注入）
 * 2. 按需检索：从用户问题提取关键词 → 搜索 archiveRecords → 补充详细记录
 */

import type { Book, Chapter, ChapterMemory, StoryArchiveBucket, StoryArchiveRecord } from '../types';
import { buildStoryArchiveIndex, searchStoryArchiveIndex, formatArchiveBucketForPrompt } from '../utils/storyArchiveIndex';
import { withBaseProse } from '../utils/promptStore';

// ─── 全量摘要索引 ─────────────────────────────────────────────────────────────

/**
 * 生成全量章节摘要索引文本。
 * 每章一行，格式：第N章 标题：摘要
 * 控制在合理 token 范围内（100章 ≈ 2000-3000 token）
 */
export function buildFullSummaryIndex(book: Book): string {
 const chapters = book.chapters || [];
 const memoryBank = book.memoryBank || [];
 const memoryMap = new Map(memoryBank.map(m => [m.chapterId, m]));

 const lines: string[] = [];
 for (let i = 0; i < chapters.length; i++) {
 const ch = chapters[i];
 const mem = memoryMap.get(ch.id);
 const summary = mem?.summary || mem?.plotAnalysis?.narrativeChain || '';
 if (!summary) continue;
 // 限制每行长度，避免单章摘要过长
 const trimmed = summary.length > 80 ? summary.slice(0, 78) + '…' : summary;
 lines.push(`第${i + 1}章 ${ch.title}：${trimmed}`);
 }

 if (lines.length === 0) return '';
 return lines.join('\n');
}

// ─── 关键词提取 ─────────────────────────────────────────────────────────────

/**
 * 从用户输入中提取可用于检索的关键词。
 * 策略：提取中文词组（2字以上）、英文单词、数字。
 * 同时匹配角色名（从 book 的角色档案中）。
 */
export function extractSearchKeywords(query: string, book: Book): string[] {
 const keywords: string[] = [];

 // 1. 从角色档案中匹配已知角色名
 const rolePool = (book.resourceIndex?.customCharacterCategories || [])
 .flatMap(cat => cat.children);
 for (const role of rolePool) {
 const names = [role.name, ...(role.aliases || [])].filter(Boolean);
 for (const name of names) {
 if (name.length >= 2 && query.includes(name)) {
 keywords.push(name);
 }
 }
 }

 // 2. 提取中文词组（2-6字连续汉字）
 const cnMatches = query.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
 for (const m of cnMatches) {
 // 过滤常见停用词
 if (!STOP_WORDS.has(m) && !keywords.includes(m)) {
 keywords.push(m);
 }
 }

 // 3. 提取英文单词（3字母以上）
 const enMatches = query.match(/[a-zA-Z]{3,}/g) || [];
 for (const m of enMatches) {
 if (!keywords.includes(m.toLowerCase())) {
 keywords.push(m.toLowerCase());
 }
 }

 // 4. 提取章节号
 const chapterNumMatch = query.match(/第(\d+)章/);
 if (chapterNumMatch) {
 keywords.push(`第${chapterNumMatch[1]}章`);
 }

 return keywords.slice(0, 12); // 最多12个关键词
}

const STOP_WORDS = new Set([
 '什么', '怎么', '为什么', '哪里', '哪个', '这个', '那个', '可以', '能不能',
 '是不是', '有没有', '还是', '或者', '但是', '然后', '所以', '因为', '如果',
 '已经', '现在', '之前', '之后', '上面', '下面', '里面', '外面', '一下',
 '一些', '一个', '我们', '他们', '你们', '自己', '大家', '知道', '觉得',
 '应该', '需要', '帮我', '告诉', '记得', '出现', '发生', '关于', '对于'
]);

// ─── 按需检索 ─────────────────────────────────────────────────────────────

export interface RetrievalResult {
 /** 全量摘要索引（始终包含） */
 summaryIndex: string;
 /** 检索到的相关档案记录（格式化后的文本） */
 relevantRecords: string;
 /** 检索到的相关章节详细记忆 */
 relevantMemories: string;
 /** 命中的关键词 */
 matchedKeywords: string[];
 /** 总 token 估算 */
 estimatedTokens: number;
}

/**
 * 执行完整的记忆检索。
 * 返回可直接注入 AI system prompt 的上下文文本。
 */
export function retrieveMemoryContext(query: string, book: Book): RetrievalResult {
 const summaryIndex = buildFullSummaryIndex(book);
 const keywords = extractSearchKeywords(query, book);
 const memoryBank = book.memoryBank || [];
 const chapters = book.chapters || [];

 // 1. 搜索 archive index
 const archiveIndex = buildStoryArchiveIndex(memoryBank);
 const matchedBuckets = keywords.length > 0
 ? searchStoryArchiveIndex(archiveIndex, keywords.join(' '), 10)
 : [];

 // 2. 格式化匹配的档案记录
 const relevantRecords = matchedBuckets
 .map(bucket => formatArchiveBucketForPrompt(bucket))
 .join('\n');

 // 3. 根据匹配的 bucket 找到相关章节的详细记忆
 const relatedChapterIds = new Set<string>();
 for (const bucket of matchedBuckets) {
 for (const chId of bucket.chapters) {
 if (chId) relatedChapterIds.add(chId);
 }
 }

 // 也通过关键词直接搜索 memory 的 summary/plotSynopsis
 const memoryMap = new Map(memoryBank.map(m => [m.chapterId, m]));
 for (const mem of memoryBank) {
 const haystack = [
 mem.summary,
 mem.plotAnalysis?.plotSynopsis,
 mem.plotAnalysis?.narrativeChain,
 mem.agentOutline?.endingState,
 ...(mem.agentOutline?.openLoops || []),
 ...(mem.agentOutline?.charactersInvolved || [])
 ].filter(Boolean).join(' ');

 for (const kw of keywords) {
 if (haystack.includes(kw)) {
 relatedChapterIds.add(mem.chapterId);
 break;
 }
 }
 }

 // 4. 取相关章节的详细记忆（限制数量，避免过长）
 const relevantMemoryLines: string[] = [];
 const sortedChapterIds = Array.from(relatedChapterIds)
 .map(id => ({ id, index: chapters.findIndex(ch => ch.id === id) }))
 .filter(item => item.index >= 0)
 .sort((a, b) => a.index - b.index)
 .slice(0, 15) // 最多15章详细记忆
 .map(item => item.id);

 for (const chId of sortedChapterIds) {
 const mem = memoryMap.get(chId);
 const ch = chapters.find(c => c.id === chId);
 if (!mem || !ch) continue;

 const parts: string[] = [`第${chapters.indexOf(ch) + 1}章 ${ch.title}`];
 if (mem.plotAnalysis?.plotSynopsis) {
 parts.push(mem.plotAnalysis.plotSynopsis.slice(0, 200));
 } else if (mem.summary) {
 parts.push(mem.summary);
 }
 if (mem.agentOutline?.endingState) {
 parts.push(`结尾状态：${mem.agentOutline.endingState}`);
 }
 if (mem.agentOutline?.openLoops?.length) {
 parts.push(`未闭合线索：${mem.agentOutline.openLoops.join('、')}`);
 }
 relevantMemoryLines.push(parts.join(' | '));
 }

 const relevantMemories = relevantMemoryLines.join('\n');

 // 估算 token（粗略：中文1字≈1.5token）
 const totalChars = summaryIndex.length + relevantRecords.length + relevantMemories.length;
 const estimatedTokens = Math.ceil(totalChars * 1.5);

 return {
 summaryIndex,
 relevantRecords,
 relevantMemories,
 matchedKeywords: keywords,
 estimatedTokens
 };
}

// ─── 组装 Agent 上下文 ─────────────────────────────────────────────────────

/**
 * 将检索结果组装成可注入 AI 的 system prompt 文本。
 */
export function buildAgentMemoryPrompt(result: RetrievalResult, book: Book): string {
 const sections: string[] = [];

  sections.push(
    withBaseProse(`你是「${book.title}」的写作助手。以下是这本书的记忆数据库，请基于这些信息回答用户的问题。`)
  );
 sections.push('');

 // 全量摘要
 if (result.summaryIndex) {
 sections.push('【全书章节摘要】');
 sections.push(result.summaryIndex);
 sections.push('');
 }

 // 相关档案记录
 if (result.relevantRecords) {
 sections.push('【相关档案记录】');
 sections.push(result.relevantRecords);
 sections.push('');
 }

 // 相关章节详细记忆
 if (result.relevantMemories) {
 sections.push('【相关章节详情】');
 sections.push(result.relevantMemories);
 sections.push('');
 }

 if (!result.summaryIndex && !result.relevantRecords && !result.relevantMemories) {
 sections.push('（本书尚未进行智能整理，暂无记忆数据。请先在记忆银行中整理章节。）');
 }

 sections.push('回答规则：');
 sections.push('- 只基于以上记忆数据回答，不要编造不存在的信息');
 sections.push('- 如果记忆中没有相关信息，明确告知用户"记忆中未找到相关记录"');
 sections.push('- 回答简洁直接，引用具体章节');
 sections.push('- 使用简体中文');

 return sections.join('\n');
}
