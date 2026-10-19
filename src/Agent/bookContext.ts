// 模块说明：从书籍数据中提取 Agent 可用的上下文（角色/剧情/章节摘要）。
// 关键职责：将本地存档转换为 Agent 调用 AI 时的 system 上下文片段。
import type { Book, Chapter, ChapterMemory } from '../types';
import { normalizeGenreId } from './normalize';
import type {
 AgentChapterReference,
 AgentGenreId,
 AgentTaskSheet
} from './types';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function normalizeText(value: string | undefined | null): string {
 return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeChapterLookupToken(value: string): string {
 return String(value || '')
 .trim()
 .toLowerCase()
 .replace(/\s+/g, '');
}

function truncateList(items: string[] | undefined, max: number): string[] {
 return (Array.isArray(items) ? items : [])
 .map((item) => normalizeText(item))
 .filter(Boolean)
 .slice(0, max);
}

function formatListBlock(title: string, items: string[]): string {
 if (!items.length) return '';
 return `${title}:\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
}

// ─── Memory 摘要 ─────────────────────────────────────────────────────────────

function buildMemoryExcerpt(memory: ChapterMemory | undefined): string {
 if (!memory) return 'No structured memory is available for this chapter.';

 const outline = memory.agentOutline;
 const sections: string[] = [];

 // 1. 章节剧情概要 — 知道这章发生了什么（最重要）
 const plotSynopsis = normalizeText(memory.plotAnalysis?.plotSynopsis || memory.plotAnalysis?.functionSummary);
 if (plotSynopsis) sections.push(`Chapter synopsis: ${plotSynopsis}`);

 // 2. 结尾状态 — 知道上章停在哪，续写衔接用
 if (outline?.endingState) sections.push(`Ending state: ${normalizeText(outline.endingState)}`);

 // 3. 未闭合线索 — 知道留了什么悬念，避免遗漏
 const openLoops = truncateList(outline?.openLoops, 3);
 if (openLoops.length > 0) sections.push(formatListBlock('Open loops', openLoops));

 // 4. 关键节拍 — 知道本章结构节奏（压缩到 3 条）
 const sceneBeats = truncateList(outline?.sceneBeats, 3);
 if (sceneBeats.length > 0) sections.push(formatListBlock('Scene beats', sceneBeats));

 // 5. 在场人物 — 知道谁在场（压缩到 5 个）
 const characters = truncateList(outline?.charactersInvolved, 5);
 if (characters.length > 0) sections.push(`Characters: ${characters.join(' / ')}`);

 // 6. 未爆发冲突 — openLoops 偏向悬念，conflicts 偏向矛盾，两者互补（2条）
 const conflicts = truncateList(outline?.conflictNotes, 2);
 if (conflicts.length > 0) sections.push(formatListBlock('Conflict notes', conflicts));

 return sections.join('\n\n') || 'No structured memory is available for this chapter.';
}

function hasMeaningfulMemory(memory: ChapterMemory | undefined): boolean {
 if (!memory) return false;
 return Boolean(
 normalizeText(memory.plotAnalysis?.plotSynopsis || memory.plotAnalysis?.functionSummary) ||
 normalizeText(memory.agentOutline?.summary) ||
 normalizeText(memory.agentOutline?.chapterTarget) ||
 normalizeText(memory.agentOutline?.endingState) ||
 truncateList(memory.agentOutline?.sceneBeats, 1).length > 0 ||
 truncateList(memory.agentOutline?.locations, 1).length > 0 ||
 truncateList(memory.agentOutline?.charactersInvolved, 1).length > 0 ||
 truncateList(memory.agentOutline?.conflictNotes, 1).length > 0 ||
 truncateList(memory.agentOutline?.openLoops, 1).length > 0 ||
 (memory.plotAnalysis?.keyNodes?.length || 0) > 0 ||
 (memory.plotAnalysis?.acquisitions?.length || 0) > 0 ||
 (memory.plotAnalysis?.relationProgress?.length || 0) > 0 ||
 (memory.archiveRecords?.length || 0) > 0
 );
}

// ─── 章节查找 ────────────────────────────────────────────────────────────────

function collectExplicitChapterCandidates(task?: AgentTaskSheet | null): string[] {
 if (!task) return [];

 const tokens = new Set<string>();
 for (const item of task.referenceChapters) {
 const token = normalizeChapterLookupToken(item);
 if (token) tokens.add(token);
 }

 const matches = task.userInstruction.match(/第[0-9零一二三四五六七八九十百千两]+章/g) || [];
 for (const match of matches) {
 tokens.add(normalizeChapterLookupToken(match));
 }

 return Array.from(tokens);
}

function findChapterByToken(chapters: Chapter[], token: string): Chapter | undefined {
 if (!token) return undefined;
 return chapters.find((chapter) => normalizeChapterLookupToken(chapter.title).includes(token));
}

function getChapterMemoryMap(book: Book): Map<string, ChapterMemory> {
 return new Map((Array.isArray(book.memoryBank) ? book.memoryBank : []).map((memory) => [memory.chapterId, memory]));
}

// ─── 题材推断 ────────────────────────────────────────────────────────────────

export function inferAgentGenreFromBook(book: Book): AgentGenreId {
 const normalized = normalizeGenreId(book.resourceIndex?.novelType || '');
 if (normalized !== 'unknown') return normalized;

 const lowerText = `${book.title} ${book.description || ''}`.toLowerCase();

 // 历史爽文优先于历史（关键词重叠，爽文特征更具体）
 if (/穿越|重生|现代人|带着系统|回到古代|古代金手指/.test(lowerText) && /历史|古代|朝堂|王朝|皇帝|侯府/.test(lowerText)) return 'lishishuangwen';
 // 玄幻 / 修仙 / 奇幻 / 武侠 / 仙侠 / 诸天 / 轻小说 —— 归入玄幻包
 if (/玄幻|修仙|宗门|灵根|秘境|修炼|丹药|法宝|灵力/.test(lowerText)) return 'xuanhuan';
 if (/奇幻|魔法|精灵|龙族|巨龙|种族|骑士|魔王/.test(lowerText)) return 'xuanhuan';
 if (/武侠|江湖|武林|剑法|武功|掌门|镖局|侠客/.test(lowerText)) return 'xuanhuan';
 if (/仙侠|飞升|仙界|渡劫|仙人|道心|仙法|三界/.test(lowerText)) return 'xuanhuan';
 if (/诸天|无限|穿越世界|副本世界|万界|位面/.test(lowerText)) return 'xuanhuan';
 if (/轻小说|后宫|异世界|勇者|冒险者|公会/.test(lowerText)) return 'xuanhuan';
 // 游戏 / 电竞
 if (/电竞|游戏|网游|副本|系统|玩家|boss|技能|装备/.test(lowerText)) return 'youxi';
 // 文娱（娱乐圈 / 影视 / 综艺）
 if (/娱乐圈|明星|影视|导演|综艺|选秀|偶像|演员|歌手|剧组/.test(lowerText)) return 'wenyi';
 // 历史（朝堂正剧）
 if (/历史|朝堂|王朝|侯府|皇帝|古代|将军|丞相|太子/.test(lowerText)) return 'lishi';
 // 都市 / 现实 / 体育 / 科幻 / 悬疑 —— 现代向题材归入都市包
 if (/体育|奥运|比赛|训练|教练|冠军|运动员|金牌/.test(lowerText)) return 'urban';
 if (/科幻|星际|宇宙|外星|机甲|飞船|文明|星球/.test(lowerText)) return 'urban';
 if (/悬疑|推理|侦探|案件|凶手|密室|破案/.test(lowerText)) return 'urban';
 if (/现实|职场|打工|中年|社会|阶层|奋斗/.test(lowerText)) return 'urban';
 if (/都市|总裁|豪门|商战|富二代|逆袭/.test(lowerText)) return 'urban';
 return 'urban';
}

// ─── 章节引用收集（无 MiniSearch，仅依赖 memory 摘要 + 用户指令）────────────

/**
 * 返回书中所有有 memory 的章节引用，供 UI 展示供用户勾选。
 * 不做任何自动筛选，只要有 memory 就列出来。
 * reason 统一标为 'library'，UI 层会根据用户勾选决定哪些真正传给 Agent。
 */
export function getAllMemorizedChapterReferences(
 book: Book,
 currentChapter: Chapter
): AgentChapterReference[] {
 const memoryMap = getChapterMemoryMap(book);
 const currentIndex = book.chapters.findIndex((item) => item.id === currentChapter.id);

 const result: AgentChapterReference[] = [];
 book.chapters.forEach((chapter, index) => {
 // 跳过没有实际内容的章节（标题只是序号、没有正文的空章节）
 const hasContent = (chapter.wordCount || 0) > 3;
 const hasTitle = chapter.title && !/^第?\d+章?$/.test(chapter.title.trim()) && chapter.title.trim().length > 0;
 if (!hasContent && !hasTitle) return;

 const memory = memoryMap.get(chapter.id);
 const reason: AgentChapterReference['reason'] =
 chapter.id === currentChapter.id
 ? 'current'
 : index === currentIndex - 1
 ? 'previous'
 : 'library';
 result.push({
 id: chapter.id,
 title: chapter.title || `第 ${index + 1} 章`,
 reason,
 excerpt: buildMemoryExcerpt(memory),
 chapterIndex: index
 });
 });
 return result;
}

/**
 * 收集 Agent 写作所需的章节引用。
 *
 * 来源优先级：
 * 1. previous — 上一章（续写衔接必需）
 * 2. explicit — 用户在指令或 referenceChapters 中点名的章节
 * 3. current — 当前章（提供当前上下文）
 *
 * 没有 memory 的章节直接跳过，不再降级用原文 chunks。
 * 这样可以保证 token 可控，同时避免 MiniSearch 误伤（如早期章节的专有名词
 * 被检索命中后持续污染后续章节的生成上下文）。
 */
export function collectAgentChapterReferences(
 book: Book,
 currentChapter: Chapter,
 task?: AgentTaskSheet | null
): AgentChapterReference[] {
 const references: AgentChapterReference[] = [];
 const seen = new Set<string>();
 const memoryMap = getChapterMemoryMap(book);
 const currentIndex = book.chapters.findIndex((item) => item.id === currentChapter.id);

 const pushChapter = (chapter: Chapter | undefined, reason: AgentChapterReference['reason']) => {
 if (!chapter || seen.has(chapter.id)) return;
 const memory = memoryMap.get(chapter.id);

 // 没有有效 memory 的章节直接跳过，不降级
 if (!hasMeaningfulMemory(memory)) return;

 const chapterIndex = book.chapters.findIndex((item) => item.id === chapter.id);
 seen.add(chapter.id);

 references.push({
 id: chapter.id,
 title: chapter.title,
 reason,
 excerpt: buildMemoryExcerpt(memory),
 chapterIndex
 });
 };

 // 1. 上一章
 if (currentIndex > 0) {
 pushChapter(book.chapters[currentIndex - 1], 'previous');
 }

 // 2. 用户点名的章节
 for (const token of collectExplicitChapterCandidates(task)) {
 pushChapter(findChapterByToken(book.chapters, token), 'explicit');
 }

 // 3. 当前章
 pushChapter(currentChapter, 'current');

 return references;
}
