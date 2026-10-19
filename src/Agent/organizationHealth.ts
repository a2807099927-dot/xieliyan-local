import type { Book, ChapterMemory } from '../types';

export type ChapterOrganizationIssue = 'missing' | 'summary_only' | 'incomplete_archive';

export interface ChapterOrganizationHealthItem {
 chapterId: string;
 chapterTitle: string;
 issue: ChapterOrganizationIssue;
 reasons: string[];
}

export interface OrganizationHealthReport {
 totalChapters: number;
 completeChapters: number;
 missingChapters: ChapterOrganizationHealthItem[];
 summaryOnlyChapters: ChapterOrganizationHealthItem[];
 incompleteArchiveChapters: ChapterOrganizationHealthItem[];
 recommendedChapterIds: string[];
 estimatedCalls: number;
}

function archiveKinds(memory: ChapterMemory): Set<string> {
 return new Set((memory.archiveRecords || []).map((record) => record.kind));
}

export function inspectOrganizationHealth(book: Book): OrganizationHealthReport {
 const memoryByChapter = new Map((book.memoryBank || []).map((memory) => [memory.chapterId, memory]));
 const missingChapters: ChapterOrganizationHealthItem[] = [];
 const summaryOnlyChapters: ChapterOrganizationHealthItem[] = [];
 const incompleteArchiveChapters: ChapterOrganizationHealthItem[] = [];
 let completeChapters = 0;

 for (const chapter of book.chapters) {
 const memory = memoryByChapter.get(chapter.id);
 if (!memory || !memory.isAnalyzed) {
 missingChapters.push({ chapterId: chapter.id, chapterTitle: chapter.title, issue: 'missing', reasons: ['尚未进行智能整理'] });
 continue;
 }
 const records = memory.archiveRecords || [];
 if (records.length === 0) {
 summaryOnlyChapters.push({ chapterId: chapter.id, chapterTitle: chapter.title, issue: 'summary_only', reasons: ['已有摘要，但没有结构化档案记录'] });
 continue;
 }

 const kinds = archiveKinds(memory);
 const reasons: string[] = [];
 const outline = memory.agentOutline;
 if ((outline?.charactersInvolved?.length || 0) > 0 && !kinds.has('character')) reasons.push('关键人物存在，但缺少人物状态记录');
 if ((outline?.relationshipChanges?.length || 0) > 0 && !kinds.has('relationship')) reasons.push('检测到关系变化，但缺少关系档案');
 if ((outline?.openLoops?.length || 0) > 0 && !kinds.has('foreshadow')) reasons.push('存在未解决点，但缺少伏笔档案');
 if ((memory.plotAnalysis?.acquisitions?.length || 0) > 0 && !kinds.has('item') && !kinds.has('skill')) reasons.push('存在获得事件，但缺少物品或技能档案');
 if (reasons.length) incompleteArchiveChapters.push({ chapterId: chapter.id, chapterTitle: chapter.title, issue: 'incomplete_archive', reasons });
 else completeChapters += 1;
 }

 const recommendedChapterIds = Array.from(new Set([
 ...missingChapters.map((item) => item.chapterId),
 ...summaryOnlyChapters.map((item) => item.chapterId),
 ...incompleteArchiveChapters.map((item) => item.chapterId)
 ]));
 return {
 totalChapters: book.chapters.length,
 completeChapters,
 missingChapters,
 summaryOnlyChapters,
 incompleteArchiveChapters,
 recommendedChapterIds,
 estimatedCalls: recommendedChapterIds.length
 };
}
