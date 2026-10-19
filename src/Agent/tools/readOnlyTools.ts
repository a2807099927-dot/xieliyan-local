import type { StoryArchiveKind } from '../../types';
import { useBookStore } from '../../store/useBookStore';
import { inspectOrganizationHealth } from '../organizationHealth';
import { buildRoleUpdateProposals } from '../roleUpdateProposals';
import { searchLocalArchive, searchLocalRoles } from '../localReadTools';
import { htmlToPlainWithBreaks, searchInBook } from '../localSearch';
import { agentToolRegistry } from './registry';
import type { AgentEvidence, AgentToolContext, AgentToolResult } from './types';

function text(value: unknown): string {
 return String(value || '').trim();
}

function stringArray(value: unknown, limit = 6): string[] {
 const source = Array.isArray(value) ? value : [value];
 return Array.from(new Set(source.map(text).filter((item) => item.length >= 2))).slice(0, limit);
}

function evidenceId(source: string, chapterId: string, from: number | undefined, index: number): string {
 return `${source}:${chapterId}:${from ?? 'chapter'}:${index}`;
}

function excerptAround(plain: string, focus: string, maxChars: number): { body: string; from: number; to: number } {
 const index = focus ? plain.indexOf(focus) : -1;
 if (index < 0) return { body: plain.slice(0, maxChars), from: 0, to: Math.min(plain.length, maxChars) };
 const start = Math.max(0, index - Math.floor(maxChars * 0.4));
 const end = Math.min(plain.length, start + maxChars);
 return { body: plain.slice(start, end), from: start, to: end };
}

export function registerReadOnlyAgentTools(): void {

 agentToolRegistry.register({
 name: 'search_book',
 description: '在整本书的章节正文中搜索一个或多个精确关键词，返回命中章节、上下文片段和可跳转位置。适合先定位人物、台词、事件或物品。',
 inputSchema: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 6 } }, required: ['queries'] },
 readOnly: true,
 execute(input: { queries?: unknown }, context: AgentToolContext) {
 const queries = stringArray(input?.queries, 6);
 const results = queries.map((query) => searchInBook(context.book, query));
 const compact = results.map((result) => ({
 keyword: result.keyword,
 totalHits: result.totalHits,
 hits: result.hits.slice(0, 16).map((hit) => ({
 chapterId: hit.chapterId,
 chapterIndex: hit.chapterIndex,
 chapterTitle: hit.chapterTitle,
 count: hit.count,
 occurrences: hit.occurrences.slice(0, 5)
 }))
 }));
 const evidence: AgentEvidence[] = compact.flatMap((result) => result.hits.flatMap((hit) =>
 hit.occurrences.map((occurrence, index) => ({
 id: evidenceId('search_book', hit.chapterId, occurrence.from, index),
 source: 'search_book' as const,
 chapterId: hit.chapterId,
 chapterTitle: hit.chapterTitle,
 from: occurrence.from,
 to: occurrence.to,
 text: occurrence.text,
 snippet: occurrence.snippet
 }))
 )).slice(0, 60);
 const hitCount = compact.reduce((sum, result) => sum + result.totalHits, 0);
 return { summary: `全文搜索 ${queries.join('、') || '空关键词'}：共 ${hitCount} 处命中。`, data: compact, evidence };
 }
 });

 agentToolRegistry.register({
 name: 'search_roles',
 description: '查询当前作品的结构化角色档案，包括别名、身份、阵营、能力、装备、剧情进展及正文出现位置。',
 inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
 readOnly: true,
 execute(input: { query?: unknown }, context: AgentToolContext) {
 const query = text(input?.query);
 const roles = searchLocalRoles(context.book, query).slice(0, 8);
 const data = roles.map((role) => ({ ...role, chapterHits: role.chapterHits.slice(0, 12).map((hit) => ({ ...hit, occurrences: hit.occurrences.slice(0, 3) })) }));
 const evidence: AgentEvidence[] = data.flatMap((role) => role.chapterHits.flatMap((hit) =>
 hit.occurrences.map((occurrence, index) => ({
 id: evidenceId('search_roles', hit.chapterId, occurrence.from, index),
 source: 'search_roles' as const,
 chapterId: hit.chapterId,
 chapterTitle: hit.chapterTitle,
 from: occurrence.from,
 to: occurrence.to,
 text: occurrence.text,
 snippet: occurrence.snippet
 }))
 )).slice(0, 50);
 return { summary: `角色档案查询“${query}”：找到 ${roles.length} 个角色。`, data, evidence };
 }
 });

 agentToolRegistry.register({
 name: 'search_archive',
 description: '查询结构化剧情档案，可查人物事件、关系变化、物品、技能、势力、伏笔和事件记录。结果必须与查询实体或指定类型相关。',
 inputSchema: {
 type: 'object',
 properties: {
 query: { type: 'string' },
 kinds: { type: 'array', items: { enum: ['character', 'item', 'skill', 'faction', 'relationship', 'foreshadow', 'event'] } }
 },
 required: ['query']
 },
 readOnly: true,
 execute(input: { query?: unknown; kinds?: unknown }, context: AgentToolContext) {
 const query = text(input?.query);
 const kinds = stringArray(input?.kinds, 7) as StoryArchiveKind[];
 let archives = searchLocalArchive(context.book, query);
 if (kinds.length) archives = archives.filter((archive) => kinds.includes(archive.kind));
 archives = archives.slice(0, 10).map((archive) => ({ ...archive, records: archive.records.slice(0, 8) }));
 const evidence: AgentEvidence[] = archives.flatMap((archive) => archive.records.map((record, index) => ({
 id: evidenceId('search_archive', record.chapterId, record.jump?.from, index),
 source: 'search_archive' as const,
 chapterId: record.chapterIndex >= 0 ? record.chapterId : undefined,
 chapterTitle: record.chapterTitle,
 from: record.jump?.from,
 to: record.jump?.to,
 text: record.jump?.text,
 snippet: record.evidence || record.detail
 }))).slice(0, 60);
 return { summary: `剧情档案查询“${query}”：找到 ${archives.length} 组相关记录。`, data: archives, evidence };
 }
 });

 agentToolRegistry.register({
 name: 'read_chapter',
 description: '读取指定章节正文。默认读取整章；只有用户要求局部核对时才传 focus/maxChars 读取片段。用于评价某章、分析剧情、续写前必须先完整阅读目标章。',
 inputSchema: {
 type: 'object',
 properties: {
 chapterId: { type: 'string' },
 focus: { type: 'string' },
 maxChars: { type: 'number', minimum: 800, maximum: 50000, description: '可选。默认整章；仅需局部片段时再限制字数。' }
 },
 required: ['chapterId']
 },
 readOnly: true,
 async execute(input: { chapterId?: unknown; focus?: unknown; maxChars?: unknown }, context: AgentToolContext) {
 const chapterId = text(input?.chapterId);
 const focus = text(input?.focus);
 const store = useBookStore.getState();
 let latestBook = store.books.find((item) => item.id === context.book.id) || context.book;
 let chapter = latestBook.chapters.find((item) => item.id === chapterId);
 if (!chapter) throw new Error(`找不到章节：${chapterId}`);
 // 强制从章节正文文件/缓存读取目标章，避免 Agent 只看到列表里的旧摘要或空 content。
 const loadedContent = await store.ensureChapterContent(context.book.id, chapterId);
 latestBook = useBookStore.getState().books.find((item) => item.id === context.book.id) || latestBook;
 chapter = latestBook.chapters.find((item) => item.id === chapterId) || chapter;
 const html = loadedContent && loadedContent.trim().length > 0 ? loadedContent : chapter.content;
 const plain = htmlToPlainWithBreaks(html);
 const requested = Number(input?.maxChars);
 const maxChars = Number.isFinite(requested) ? Math.max(800, Math.min(50000, Math.floor(requested))) : Math.min(plain.length, 50000);
 const excerpt = focus ? excerptAround(plain, focus, maxChars) : { body: plain.slice(0, maxChars), from: 0, to: Math.min(plain.length, maxChars) };
 const focusFrom = focus ? plain.indexOf(focus) : -1;
 const evidenceFrom = focusFrom >= 0 ? focusFrom : excerpt.from;
 const evidenceText = focusFrom >= 0 ? focus : plain.slice(evidenceFrom, Math.min(plain.length, evidenceFrom + 24));
 const evidence: AgentEvidence[] = [{
 id: evidenceId('read_chapter', chapter.id, evidenceFrom, 0),
 source: 'read_chapter',
 chapterId: chapter.id,
 chapterTitle: chapter.title,
 from: evidenceFrom,
 to: evidenceFrom + evidenceText.length,
 text: evidenceText,
 snippet: excerpt.body
 }];
 return {
 summary: `已读取《${chapter.title}》${focus ? `中“${focus}”附近` : ''}的 ${excerpt.body.length}/${plain.length} 字原文${excerpt.body.length < plain.length ? '（仍有未读部分）' : '（整章）'}。`,
 data: { chapterId: chapter.id, chapterTitle: chapter.title, from: excerpt.from, to: excerpt.to, totalChars: plain.length, fullyRead: excerpt.body.length >= plain.length, focus, content: excerpt.body },
 evidence
 };
 }
 });

 agentToolRegistry.register({
 name: 'inspect_organization',
 description: '零 Token 检查作品整理完整度，返回未整理章节、只有摘要的章节、档案不完整章节和预计整理调用次数。',
 inputSchema: { type: 'object', properties: {} },
 readOnly: true,
 execute(_input: Record<string, never>, context: AgentToolContext) {
 const report = inspectOrganizationHealth(context.book);
 const data = {
 totalChapters: report.totalChapters,
 completeChapters: report.completeChapters,
 missingCount: report.missingChapters.length,
 summaryOnlyCount: report.summaryOnlyChapters.length,
 incompleteArchiveCount: report.incompleteArchiveChapters.length,
 estimatedCalls: report.estimatedCalls,
 recommendedChapterIds: report.recommendedChapterIds,
 chapters: report.missingChapters.concat(report.summaryOnlyChapters, report.incompleteArchiveChapters).slice(0, 80)
 };
 return { summary: `整理体检完成：建议处理 ${report.recommendedChapterIds.length} 章，预计 ${report.estimatedCalls} 次章节分析。`, data, evidence: [], artifacts: [{ type: 'organization_health' as const, data }] };
 }
 });

 agentToolRegistry.register({
 name: 'get_role_update_plans',
 description: '从已经保存的 archiveRecords 生成按角色分组的角色卡更新计划，只做预览，不修改角色卡。',
 inputSchema: { type: 'object', properties: { chapterId: { type: 'string', description: '可选，只查看指定章节产生的角色计划' } } },
 readOnly: true,
 execute(input: { chapterId?: unknown }, context: AgentToolContext) {
 const chapterId = text(input?.chapterId);
 const records = (context.book.memoryBank || []).flatMap((memory) => memory.archiveRecords || []).filter((record) => !chapterId || record.chapterId === chapterId);
 const plans = buildRoleUpdateProposals(context.book, records);
 const compact = plans.slice(0, 40).map((plan) => ({
 id: plan.id, roleName: plan.roleName, matchedRoleId: plan.matchedRoleId, matchedRoleName: plan.matchedRoleName,
 createIfMissing: plan.createIfMissing, chapterIds: plan.chapterIds, chapterTitles: plan.chapterTitles,
 mutations: plan.mutations.map((mutation) => ({ id: mutation.id, action: mutation.action, label: mutation.label, proposedValue: mutation.proposedValue, reason: mutation.reason }))
 }));
 const data = { totalPlans: plans.length, totalMutations: plans.reduce((sum, plan) => sum + plan.mutations.length, 0), plans: compact };
 return { summary: `角色计划检查完成：${plans.length} 名角色，共 ${data.totalMutations} 项待审查更新。`, data, evidence: [], artifacts: [{ type: 'role_update_plans' as const, data }] };
 }
 });

 agentToolRegistry.register({
 name: 'find_chapter',
 description: '根据章节号、标题关键词或特殊标记（"当前章""最新章""第一章"）查找章节。返回章节 ID、序号、标题，找到后可用 read_chapter 读内容。',
 inputSchema: {
 type: 'object',
 properties: {
   query: { type: 'string', description: '章节号（如"545"）、标题关键词、或"当前章"/"最新章"/"第一章"' }
 },
 required: ['query']
 },
 readOnly: true,
 execute(input: unknown, context: AgentToolContext) {
   const inp = input as { query?: unknown };
   const q = text(inp?.query);
   const normalized = q.replace(/\s+/g, '');
   const lower = normalized.toLowerCase();
   if (!lower) return { summary: '请提供章节号或关键词。', data: { chapters: [] as Array<{ id: string; index: number; title: string; wordCount: number }> }, evidence: [] as AgentEvidence[] };
    const chapters = context.book.chapters;
    const currentAliases = new Set(['当前章', '本章', '这章', '当前章节', '本章节']);
    const lastAliases = new Set(['最新章', '最后一章', '最后章', '末章', '最新章节']);
    const firstAliases = new Set(['第一章', '第1章', '1章', '首章']);
    const chapterNoMatch = lower.match(/^第?(\d+)章?$/);
    const chapterNo = chapterNoMatch?.[1];
    const found: Array<{ id: string; index: number; title: string; wordCount: number }> = (() => {
      if (currentAliases.has(lower)) {
        const idx = Math.max(0, chapters.findIndex(c => c.id === context.currentChapter.id));
        return [{ id: context.currentChapter.id, index: idx, title: context.currentChapter.title, wordCount: context.currentChapter.wordCount || 0 }];
      }
      if (lastAliases.has(lower)) {
        const last = chapters[chapters.length - 1];
        return last ? [{ id: last.id, index: chapters.length - 1, title: last.title, wordCount: last.wordCount || 0 }] : [];
      }
      if (firstAliases.has(lower)) {
        const first = chapters[0];
        return first ? [{ id: first.id, index: 0, title: first.title, wordCount: first.wordCount || 0 }] : [];
      }
       const num = chapterNo ? parseInt(chapterNo, 10) : parseInt(lower, 10);
       if (!isNaN(num) && num > 0 && num <= chapters.length) {
         const ch = chapters[num - 1];
         return [{ id: ch.id, index: num - 1, title: ch.title, wordCount: ch.wordCount || 0 }];
       }
       return chapters
         .map((c, index) => ({ c, index }))
         .filter(({ c }) => c.title.toLowerCase().includes(lower))
         .slice(0, 10)
         .map(({ c, index }) => ({ id: c.id, index, title: c.title, wordCount: c.wordCount || 0 }));
    })();
     if (!found.length) return { summary: `未找到匹配“${q}”的章节。全书共 ${chapters.length} 章。`, data: { chapters: found }, evidence: [] as AgentEvidence[] };
     // 数字/别名精确命中时，明确标记目标章，避免模型从多章列表里误选
     const exactHit = (chapterNo !== undefined && found.length === 1 && Number(chapterNo) === found[0].index + 1)
       || (lower === '当前章' || lower === '最新章' || lower === '第一章' || firstAliases.has(lower) || lastAliases.has(lower) || currentAliases.has(lower));
    const list = found.map(c => `#${c.index + 1}《${c.title}》(id=${c.id},${c.wordCount}字)`).join('；');
    const summary = exactHit
      ? `目标章节：${list}（这是你要找的章节，直接 read_chapter 读取 id=${found[0].id}）`
      : `找到 ${found.length} 个匹配章节：${list}；请用其中的 id 调 read_chapter 读取。`;
    return { summary, data: { chapters: found }, evidence: [] as AgentEvidence[] };
 }
 });

 }
