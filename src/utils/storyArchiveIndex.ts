// 模块说明：剧情档案索引构造器。
// 关键职责：基于 memoryBank + 角色分类生成只读索引文件 archive-index.json。
import type {
 ChapterMemory,
 RoleCategory,
 StoryArchiveBucket,
 StoryArchiveIndex,
 StoryArchiveKind,
 StoryArchiveRecord
} from '../types';
import { roleCategoriesToArchiveRecords } from './roleArchiveBridge';

const KIND_TO_BUCKET: Record<StoryArchiveKind, keyof StoryArchiveIndex['buckets']> = {
 character: 'characters',
 item: 'items',
 skill: 'skills',
 faction: 'factions',
 relationship: 'relationships',
 foreshadow: 'foreshadows',
 event: 'events'
};

function normalizeKey(value: string): string {
 return String(value || '')
 .toLowerCase()
 .replace(/[\s\p{P}\p{S}]+/gu, '')
 .trim();
}

function relationKey(record: StoryArchiveRecord): string {
 const left = normalizeKey(record.subject);
 const right = normalizeKey(record.target || '');
 if (!right) return left;
 return [left, right].sort().join('__');
}

function recordKey(record: StoryArchiveRecord): string {
 if (record.kind === 'relationship') return relationKey(record);
 if (record.kind === 'event' || record.kind === 'foreshadow') {
 return normalizeKey(record.title || record.detail);
 }
 return normalizeKey(record.subject || record.title);
}

function compactRecord(record: StoryArchiveRecord): string {
 const chapter = record.chapterTitle || record.chapterId;
 const target = record.target ? ` -> ${record.target}` : '';
 const status = record.status ? ` [${record.status}]` : '';
 return `${chapter} | ${record.subject}${target}${status} | ${record.detail}`;
}

function summarizeRecords(records: StoryArchiveRecord[], maxItems = 4): string {
 return records
 .slice()
 .sort((a, b) => String(a.chapterTitle || a.chapterId).localeCompare(String(b.chapterTitle || b.chapterId)))
 .slice(-maxItems)
 .map(compactRecord)
 .join('；');
}

function buildBucket(kind: StoryArchiveKind, key: string, records: StoryArchiveRecord[]): StoryArchiveBucket {
 const sorted = records
 .slice()
 .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

 const latest = sorted[sorted.length - 1];
 const titles = Array.from(
 new Set(sorted.flatMap((item) => [item.title, item.subject, item.target].filter(Boolean) as string[]))
 );
 const chapters = Array.from(
 new Set(sorted.flatMap((item) => (item.sourceChapterIds?.length ? item.sourceChapterIds : [item.chapterId])))
 ).filter(Boolean);
 const maxImportance = sorted.reduce((max, item) => Math.max(max, item.importance || 0), 0);

 return {
 key,
 kind,
 title: titles[0] || latest?.title || key,
 aliases: titles.slice(1, 8),
 records: sorted,
 chapters,
 summary: summarizeRecords(sorted),
 latestStatus: latest?.status,
 importance: maxImportance || undefined,
 updatedAt: latest?.updatedAt || latest?.createdAt || new Date().toISOString()
 };
}

export function collectStoryArchiveRecords(
 memoryBank?: ChapterMemory[],
 extraRecords: StoryArchiveRecord[] = []
): StoryArchiveRecord[] {
 const memoryRecords = Array.isArray(memoryBank)
 ? memoryBank.flatMap((memory) => memory.archiveRecords || [])
 : [];
 return [...memoryRecords, ...extraRecords];
}

export function buildStoryArchiveIndex(
 memoryBank?: ChapterMemory[],
 extraRecords: StoryArchiveRecord[] = []
): StoryArchiveIndex {
 const records = collectStoryArchiveRecords(memoryBank, extraRecords);
 const groups = new Map<string, StoryArchiveRecord[]>();

 for (const record of records) {
 const key = `${record.kind}:${recordKey(record)}`;
 if (!groups.has(key)) groups.set(key, []);
 groups.get(key)?.push(record);
 }

 const index: StoryArchiveIndex = {
 generatedAt: new Date().toISOString(),
 sourceRecordCount: records.length,
 buckets: {
 characters: [],
 items: [],
 skills: [],
 factions: [],
 relationships: [],
 foreshadows: [],
 events: []
 }
 };

 for (const [compoundKey, groupedRecords] of groups.entries()) {
 // 只分割第一个冒号，key 本身可能包含冒号（如时间戳、URL）
 const colonIndex = compoundKey.indexOf(':');
 if (colonIndex < 0) continue;
 const kindRaw = compoundKey.slice(0, colonIndex);
 const key = compoundKey.slice(colonIndex + 1);
 const kind = kindRaw as StoryArchiveKind;
 const bucketName = KIND_TO_BUCKET[kind];
 if (!bucketName) continue;
 index.buckets[bucketName].push(buildBucket(kind, key, groupedRecords));
 }

 for (const bucketName of Object.keys(index.buckets) as Array<keyof StoryArchiveIndex['buckets']>) {
 index.buckets[bucketName].sort((a, b) => {
 const importanceDelta = (b.importance || 0) - (a.importance || 0);
 if (importanceDelta !== 0) return importanceDelta;
 return b.records.length - a.records.length;
 });
 }

 return index;
}

export function buildStoryArchiveIndexWithRoles(
 memoryBank?: ChapterMemory[],
 roleCategories?: RoleCategory[]
): StoryArchiveIndex {
 return buildStoryArchiveIndex(memoryBank, roleCategoriesToArchiveRecords(roleCategories));
}

export function searchStoryArchiveIndex(index: StoryArchiveIndex, query: string, limit = 8): StoryArchiveBucket[] {
 const tokens = normalizeKey(query).match(/[\u4e00-\u9fa5a-z0-9]{2,}/g) || [];
 const buckets = Object.values(index.buckets).flat();
 if (tokens.length === 0) return buckets.slice(0, limit);

 return buckets
 .map((bucket) => {
 const haystack = normalizeKey(
 [bucket.title, bucket.aliases?.join(' '), bucket.summary, bucket.latestStatus]
 .filter(Boolean)
 .join(' ')
 );
 const keywordScore = tokens.reduce(
 (sum, token) => sum + (haystack.includes(token) ? 10 : 0),
 0
 );
 // 记录数量只能用于命中后的排序，不能让完全无关的档案混入结果。
 const score = keywordScore > 0 ? keywordScore + Math.min(bucket.records.length, 5) : 0;
 return { bucket, score };
 })
 .filter((item) => item.score > 0)
 .sort((a, b) => b.score - a.score)
 .slice(0, limit)
 .map((item) => item.bucket);
}

export function formatArchiveBucketForPrompt(bucket: StoryArchiveBucket): string {
 const aliases = bucket.aliases?.length ? `；别名：${bucket.aliases.join('、')}` : '';
 const status = bucket.latestStatus ? `；状态：${bucket.latestStatus}` : '';
 const chapters = bucket.chapters.join('、') || '暂无';
 return `【${bucket.kind}】${bucket.title}${aliases}${status}；章节：${chapters}；摘要：${bucket.summary}`;
}
