import type { Book, RoleProfile, StoryArchiveBucket, StoryArchiveIndex, StoryArchiveKind } from '../types';
import { buildStoryArchiveIndexWithRoles, searchStoryArchiveIndex } from '../utils/storyArchiveIndex';
import { searchInBook, searchInChapter, type LocalSearchHit } from './localSearch';

export interface LocalRoleResult {
 id: string;
 name: string;
 aliases: string[];
 category: string;
 faction: string;
 roleType: string;
 description: string;
 firstAppearance: string;
 realm?: string;
 abilities: string[];
 equipment: string[];
 plotProgress?: string;
 note?: string;
 chapterHits: LocalSearchHit[];
}

export interface LocalArchiveRecordResult {
 id: string;
 chapterId: string;
 chapterIndex: number;
 chapterTitle: string;
 detail: string;
 status?: string;
 evidence?: string;
 jump?: { from: number; to: number; text: string };
}

export interface LocalArchiveResult {
 key: string;
 kind: StoryArchiveKind;
 title: string;
 aliases: string[];
 summary: string;
 latestStatus?: string;
 records: LocalArchiveRecordResult[];
}

const ROLE_INTENT = /角色|人物|谁是|档案|资料|身份|阵营|能力|境界|装备|关系|别名|查询|查一下|看看/;
const ARCHIVE_INTENT = /剧情档案|剧情记录|剧情资料|伏笔|线索|事件|关系变化|人物关系|档案记录|世界事件|发生过什么|经历过什么/;
const GENERIC_QUERY_WORDS = new Set([
 '查询角色', '查询人物', '角色档案', '人物档案', '剧情档案', '剧情记录', '查一下', '看看', '告诉我',
 '是什么', '怎么样', '有哪些', '有没有', '关于', '相关', '当前', '现在', '信息', '资料', '记录'
]);

function normalize(value: unknown): string {
 return String(value || '').replace(/\s+/g, ' ').trim();
}

function getRolePool(book: Book): Array<{ role: RoleProfile; category: string }> {
 return (book.resourceIndex?.customCharacterCategories || []).flatMap((category) =>
 (category.children || []).map((role) => ({ role, category: category.name }))
 );
}

function extractUsefulTokens(query: string): string[] {
 const cleaned = normalize(query)
 .replace(/请|帮我|一下|查找|查询|搜索|看看|告诉我|全书|本书|里面|中的|关于/g, ' ')
 .replace(/[，。！？、：；,.!?;:()（）【】\[\]“”"']/g, ' ');
 const tokens = cleaned
 .split(/\s+/)
 .flatMap((part) => part.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,}/g) || [])
 .filter((token) => !GENERIC_QUERY_WORDS.has(token));
 return Array.from(new Set(tokens)).slice(0, 8);
}

export function detectLocalReadIntent(query: string, book: Book): 'role' | 'archive' | null {
 const input = normalize(query);
 const roles = getRolePool(book);
 const mentionsKnownRole = roles.some(({ role }) =>
 [role.name, ...(role.aliases || [])].filter(Boolean).some((name) => input.includes(name))
 );
 if (mentionsKnownRole && ROLE_INTENT.test(input)) return 'role';
 if (ARCHIVE_INTENT.test(input)) return 'archive';
 if (/角色档案|人物档案|查询角色|查角色/.test(input)) return 'role';
 return null;
}

function roleSearchScore(role: RoleProfile, category: string, query: string, tokens: string[]): number {
 const names = [role.name, ...(role.aliases || [])].filter(Boolean);
 let score = names.some((name) => query.includes(name)) ? 100 : 0;
 const haystack = normalize([
 role.name,
 ...(role.aliases || []),
 category,
 role.faction,
 role.roleType,
 role.description,
 role.realm,
 ...(role.abilities || []),
 ...(role.equipment || []),
 role.plotProgress,
 role.note
 ].filter(Boolean).join(' '));
 for (const token of tokens) if (haystack.includes(token)) score += 10;
 return score;
}

export function searchLocalRoles(book: Book, query: string): LocalRoleResult[] {
 const tokens = extractUsefulTokens(query);
 const input = normalize(query);
 return getRolePool(book)
 .map(({ role, category }) => ({ role, category, score: roleSearchScore(role, category, input, tokens) }))
 .filter((item) => item.score > 0 || (tokens.length === 0 && /角色档案|人物档案/.test(input)))
 .sort((a, b) => b.score - a.score)
 .slice(0, 12)
 .map(({ role, category }) => {
 const chapterHits = searchInBook(book, role.name).hits.slice(0, 20);
 return {
 id: role.id,
 name: role.name,
 aliases: role.aliases || [],
 category,
 faction: role.faction || '未记录',
 roleType: role.roleType || '待分类',
 description: role.description || '',
 firstAppearance: role.firstAppearance || '',
 realm: role.realm,
 abilities: role.abilities || [],
 equipment: role.equipment || [],
 plotProgress: role.plotProgress,
 note: role.note,
 chapterHits
 };
 });
}

function getArchiveQuery(index: StoryArchiveIndex, query: string): string {
 // 优先从当前作品的档案标题和别名中提取实体，避免中文长句被整体过滤。
 const input = normalize(query);
 const knownEntities = Object.values(index.buckets)
 .flat()
 .flatMap((bucket) => [bucket.title, ...(bucket.aliases || [])])
 .map(normalize)
 .filter((name) => name.length >= 2 && input.includes(name))
 .sort((a, b) => b.length - a.length);
 if (knownEntities.length) return Array.from(new Set(knownEntities)).slice(0, 6).join(' ');

 return extractUsefulTokens(query)
 .filter((token) => !/剧情档案|剧情记录|伏笔|线索|事件|关系变化|人物关系/.test(token))
 .join(' ');
}

function mapArchiveBucket(book: Book, bucket: StoryArchiveBucket): LocalArchiveResult {
 const records = bucket.records.slice().reverse().slice(0, 20).map((record) => {
 const chapterIndex = book.chapters.findIndex((chapter) => chapter.id === record.chapterId);
 const chapter = chapterIndex >= 0 ? book.chapters[chapterIndex] : undefined;
 const candidates = [record.evidence, record.subject, record.target, record.title]
 .map(normalize)
 .filter((value) => value.length >= 2);
 let jump: LocalArchiveRecordResult['jump'];
 if (chapter) {
 for (const candidate of candidates) {
 const hit = searchInChapter(chapter, chapterIndex, candidate, true);
 const occurrence = hit?.occurrences[0];
 if (occurrence) {
 jump = { from: occurrence.from, to: occurrence.to, text: occurrence.text };
 break;
 }
 }
 }
 return {
 id: record.id,
 chapterId: record.chapterId,
 chapterIndex,
 chapterTitle: record.chapterTitle || chapter?.title || '未知章节',
 detail: record.detail || record.title,
 status: record.status,
 evidence: record.evidence,
 jump
 };
 });
 return {
 key: `${bucket.kind}:${bucket.key}`,
 kind: bucket.kind,
 title: bucket.title,
 aliases: bucket.aliases || [],
 summary: bucket.summary,
 latestStatus: bucket.latestStatus,
 records
 };
}

export function searchLocalArchive(book: Book, query: string): LocalArchiveResult[] {
 const index = buildStoryArchiveIndexWithRoles(book.memoryBank, book.resourceIndex?.customCharacterCategories);
 const archiveQuery = getArchiveQuery(index, query);
 const asksForOverview = /全部|所有|列出|总览|有哪些档案/.test(query);
 const asksForKindOnly = /伏笔|线索|事件|关系/.test(query) && !archiveQuery;
 // 实体提取失败时不再用索引前 12 项凑结果；只有明确总览或类型查询才允许空关键词。
 if (!archiveQuery && !asksForOverview && !asksForKindOnly) return [];
 let buckets = searchStoryArchiveIndex(index, archiveQuery, 12);
 if (/伏笔|线索/.test(query)) buckets = buckets.filter((bucket) => bucket.kind === 'foreshadow');
 if (/事件/.test(query)) buckets = buckets.filter((bucket) => bucket.kind === 'event');
 if (/关系/.test(query)) buckets = buckets.filter((bucket) => bucket.kind === 'relationship');
 return buckets.map((bucket) => mapArchiveBucket(book, bucket));
}
