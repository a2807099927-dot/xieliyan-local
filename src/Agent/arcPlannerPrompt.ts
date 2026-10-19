/**
 * 剧情规划师 Prompt 模块
 *
 * 职责：通过对话帮助作者规划剧情弧线，输出结构化分章大纲。
 * 不负责写正文，不带写手的文风/视角/角色描写规则。
 * 只带规划层面的创作法则（极限铺垫、信息差分层释放、连锁震惊反应）。
 */

import type { ChatMessagePayload } from '../hooks/useAiChat';
import type { Book, Chapter } from '../types';
import { withBaseProse } from '../utils/promptStore';
import { electronAPI } from '../utils/electron';

export interface ArcMemoryItem {
 chapterTitle: string;
 synopsis: string;
 endingState?: string;
 openLoops?: string[];
}

export interface BuildArcPlanningMessagesInput {
 book: Book;
 chapter: Chapter;
 recentMemories: ArcMemoryItem[];
 conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
 userMessage: string;
 finalizeOutline?: boolean;
 /** 自定义规划师 prompt（非空时替换内置 DISCUSSING/FINALIZE prompt） */
 customPlannerPrompt?: string;
 /** 当前选择的题材 */
 genre?: string;
}

// ─── Prompt 从 Rust 后端获取（安全：不暴露在 JS bundle 中）─────────────────────
async function getArcPrompt(phase: 'discussing' | 'finalize'): Promise<string> {
 const prompt = await electronAPI.ai.getArcPlannerPrompt(phase);
 return prompt || '';
}

// 兼容同步访问的缓存（首次调用后缓存）
let _cachedDiscussing = '';
let _cachedFinalize = '';

export async function ensureArcPromptsLoaded(): Promise<void> {
 if (!_cachedDiscussing) _cachedDiscussing = await getArcPrompt('discussing');
 if (!_cachedFinalize) _cachedFinalize = await getArcPrompt('finalize');
}

function getDiscussingPrompt(): string {
 return withBaseProse(_cachedDiscussing || '你是一位剧情规划师，帮助作者完善故事走向。\n\n三大规划法则：\n1. 极限铺垫：爽点前必须有多层压制\n2. 信息差分层释放：主角优势分层揭露\n3. 连锁震惊反应：事件发生后按层级描写反应\n\n回复方式：\n- 不超过 150 字，直接给建议\n- 使用简体中文');
}
function getFinalizePrompt(): string {
 return withBaseProse(_cachedFinalize || '你是一位剧情结构规划师。直接输出分章大纲。\n\n章数规则（严格执行）：\n- 默认生成 1 章\n\n输出格式：\n**【大纲】**\n【第N章】章节标题\n【细纲】3-5句描述【/细纲】\n**【/大纲】**\n\n使用简体中文。');
}

// ─── 构建消息 ────────────────────────────────────────────────────────────────

function formatMemorySummary(recentMemories: ArcMemoryItem[]): string {
 if (recentMemories.length === 0) {
 return '（暂无已整理的章节记忆，请根据用户描述进行规划）';
 }
 return recentMemories.map((m, i) => {
 const parts = [`${i + 1}. ${m.chapterTitle}：${m.synopsis}`];
 if (m.endingState) parts.push(` 结尾状态：${m.endingState}`);
 if (m.openLoops?.length) parts.push(` 未闭合线索：${m.openLoops.join('、')}`);
 return parts.join('\n');
 }).join('\n');
}

/**
 * 构建剧情弧线规划的消息列表。
 *
 * 两个阶段：
 * 1. 讨论阶段（finalizeOutline=false）：引导用户确定剧情弧线
 * 2. 输出阶段（finalizeOutline=true）：根据讨论结果输出结构化大纲
 */
export function buildArcPlanningMessages(input: BuildArcPlanningMessagesInput): ChatMessagePayload[] {
 const { book, chapter, recentMemories, conversationHistory, userMessage, finalizeOutline, customPlannerPrompt, genre } = input;

 // 自定义规划师 prompt：非空时替换内置 prompt
 const systemPrompt = customPlannerPrompt?.trim()
 ? customPlannerPrompt
 : (finalizeOutline ? getFinalizePrompt() : getDiscussingPrompt());

 const genreLabel = genre || '未指定';
 const contextBlock = [
 `书名：${book.title}`,
 `当前章节：${chapter.title}`,
 `题材：${genreLabel}`,
 '',
 '已有章节摘要（最近50章内有智能整理的部分）：',
 formatMemorySummary(recentMemories)
 ].join('\n');

 const messages: ChatMessagePayload[] = [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: contextBlock }
 ];

 // 注入对话历史
 for (const turn of conversationHistory) {
 messages.push({ role: turn.role, content: turn.content });
 }

 // 当前用户消息
 if (userMessage.trim()) {
 messages.push({ role: 'user', content: userMessage.trim() });
 }

 return messages;
}
