import type { Book, StoryArchiveRecord } from '../types';

export interface AgentContextSnapshot {
 book: { title: string; chapterCount: number; analyzedChapterCount: number };
 currentChapter?: { id: string; title: string; summary?: string };
 relevantCharacters: Array<Record<string, unknown>>;
 relevantRecords: Array<Record<string, unknown>>;
 relevantChapterSummaries: Array<{ chapterId: string; title: string; summary: string }>;
}

const MAX_CONTEXT_CHARS = 5000;

function normalizeList(value: unknown): string[] {
 if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
 return String(value || '').split(/[、,，;；\n]/).map((item) => item.trim()).filter(Boolean);
}

function includesQuery(value: unknown, query: string): boolean {
 const text = String(value || '').toLowerCase();
 const normalized = query.toLowerCase().trim();
 return Boolean(normalized && text.includes(normalized));
}

function recordScore(record: StoryArchiveRecord, query: string, entities: string[]): number {
 let score = Number(record.importance || 0);
 const fields = [record.title, record.subject, record.target, record.detail, record.status, ...(record.tags || [])];
 if (fields.some((field) => includesQuery(field, query))) score += 100;
 if (entities.some((entity) => fields.some((field) => String(field || '').includes(entity)))) score += 60;
 if (record.evidence) score += 4;
 return score;
}

export function buildAgentContext(book: Book, query: string, currentChapterId?: string): AgentContextSnapshot {
 const memories = book.memoryBank || [];
 const chapterById = new Map(book.chapters.map((chapter) => [chapter.id, chapter]));
 const roles = (book.resourceIndex?.customCharacterCategories || []).flatMap((category) =>
 (category.children || []).map((role) => ({ role, category: category.name }))
 );
 const matchedEntities = roles
 .filter(({ role }) => [role.name, ...(role.aliases || [])].some((name) => query.includes(name)))
 .map(({ role }) => role.name);

 const relevantCharacters = roles
 .map(({ role, category }) => {
 const custom = role.customFields || {};
 const score = [role.name, ...(role.aliases || [])].some((name) => query.includes(name)) ? 100 : 0;
 return {
 score,
 value: {
 name: role.name,
 aliases: role.aliases || [],
 category,
 roleType: role.roleType,
 faction: role.faction || undefined,
 realm: role.realm || undefined,
 abilities: Array.from(new Set([...(role.abilities || []), ...normalizeList(custom.skills)])),
 equipment: Array.from(new Set([...(role.equipment || []), ...normalizeList(custom.equipment)])),
 recentStatus: custom.recentStatus || undefined,
 plotProgress: role.plotProgress || custom.recentPlot || undefined
 }
 };
 })
 .sort((a, b) => b.score - a.score)
 .slice(0, matchedEntities.length ? 16 : 24)
 .map((item) => item.value);

 const records = memories.flatMap((memory) => memory.archiveRecords || []);
 const relevantRecords = records
 .map((record) => ({ record, score: recordScore(record, query, matchedEntities) }))
 .sort((a, b) => b.score - a.score || String(b.record.createdAt || '').localeCompare(String(a.record.createdAt || '')))
 .slice(0, matchedEntities.length ? 40 : 28)
 .map(({ record }) => ({
 kind: record.kind,
 title: record.title,
 subject: record.subject,
 target: record.target,
 detail: record.detail,
 status: record.status,
 chapterId: record.chapterId,
 chapterTitle: record.chapterTitle || chapterById.get(record.chapterId)?.title,
 evidence: record.evidence,
 importance: record.importance
 }));

 const relevantChapterIds = new Set<string>([
 ...(currentChapterId ? [currentChapterId] : []),
 ...relevantRecords.map((record) => String(record.chapterId || '')).filter(Boolean)
 ]);
 const relevantChapterSummaries = memories
 .filter((memory) => relevantChapterIds.has(memory.chapterId) || includesQuery(memory.summary, query) || includesQuery(memory.plotAnalysis?.plotSynopsis, query))
 .slice(-24)
 .map((memory) => ({
 chapterId: memory.chapterId,
 title: chapterById.get(memory.chapterId)?.title || memory.chapterId,
 summary: String(memory.plotAnalysis?.plotSynopsis || memory.summary || '').slice(0, 420)
 }))
 .filter((item) => item.summary);

 const currentMemory = currentChapterId ? memories.find((memory) => memory.chapterId === currentChapterId) : undefined;
 const snapshot: AgentContextSnapshot = {
 book: {
 title: book.title,
 chapterCount: book.chapters.length,
 analyzedChapterCount: memories.filter((memory) => memory.isAnalyzed).length
 },
 currentChapter: currentChapterId ? {
 id: currentChapterId,
 title: chapterById.get(currentChapterId)?.title || currentChapterId,
 summary: String(currentMemory?.plotAnalysis?.plotSynopsis || currentMemory?.summary || '').slice(0, 500) || undefined
 } : undefined,
 relevantCharacters,
 relevantRecords,
 relevantChapterSummaries
 };

 // 第一版只在内存中裁剪，不新建分片文件。优先保留角色和档案，再裁剪章节摘要。
 while (JSON.stringify(snapshot).length > MAX_CONTEXT_CHARS && snapshot.relevantChapterSummaries.length > 2) snapshot.relevantChapterSummaries.pop();
 while (JSON.stringify(snapshot).length > MAX_CONTEXT_CHARS && snapshot.relevantRecords.length > 8) snapshot.relevantRecords.pop();
 while (JSON.stringify(snapshot).length > MAX_CONTEXT_CHARS && snapshot.relevantCharacters.length > 4) snapshot.relevantCharacters.pop();
 return snapshot;
}
