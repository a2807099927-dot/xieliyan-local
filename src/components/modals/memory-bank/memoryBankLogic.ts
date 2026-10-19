// 模块说明：剧情档案逻辑层。
// 关键职责：批量整理章节、检测重复、合并并行线索。
import type { AgentChapterOutline, Chapter, ChapterMemory, StoryArchiveKind, StoryArchiveRecord } from '../../../types';
import {
 pickField,
 toInlineText,
 toSafePlotEvents,
 toSafePlotNodes,
 toSafeText
} from './inferenceEngine';

export type TabKey = 'plot' | 'inference';
export type PlotHistoryData = Pick<ChapterMemory, 'chapterId' | 'summary' | 'isAnalyzed' | 'plotAnalysis' | 'agentOutline' | 'archiveRecords'>;
export type BatchAnalyzeResult = { memories: ChapterMemory[]; model?: string; batchSummary?: string };
export type RecoveryPrompt = {
 title: string;
 detail: string;
 onResume: () => void;
};

export const SMART_ORGANIZE_BATCH_SIZE = 5;
export const INFERENCE_BATCH_SIZE = 5;
export const INFERENCE_MAX_CHAPTERS = 100;

/**
 * 整理长章节时保留开头、正文中段和结尾，避免旧逻辑只读取前 6000 字而漏掉结尾变化。
 * 第一版仍保持单次调用；超过 18000 字时压缩为三个有标记的片段。
 */
export function prepareChapterTextForOrganization(text: string, maxChars = 18000): string {
 const plain = String(text || '').trim();
 if (plain.length <= maxChars) return plain;
 const part = Math.floor((maxChars - 120) / 3);
 const middleStart = Math.max(0, Math.floor(plain.length / 2 - part / 2));
 return [
 `【章节开头】\n${plain.slice(0, part)}`,
 `【章节中段】\n${plain.slice(middleStart, middleStart + part)}`,
 `【章节结尾】\n${plain.slice(-part)}`
 ].join('\n\n');
}

export function chunkChapters(chapters: Chapter[], size = SMART_ORGANIZE_BATCH_SIZE): Chapter[][] {
 const chunks: Chapter[][] = [];
 for (let i = 0; i < chapters.length; i += size) {
 chunks.push(chapters.slice(i, i + size));
 }
 return chunks;
}

export function buildSmartOrganizeRules(options?: { disableRoleExtract?: boolean }): string {
  const disableRoleExtract = Boolean(options?.disableRoleExtract);
  const lines = [
  '请仅返回严格 JSON，不要输出 Markdown，不要补充解释，不要输出思考过程。',
  '直接以 { 开头，以 } 结尾。每个字段都必须填写，不能留空字符串。',
  '',
  '{',
  ' "summary": "本章一句话摘要（30字以内）",',
  ' "plotSynopsis": "本章完整剧情（300-500字，写清楚谁在哪做了什么、结果如何、留下什么影响）",',
  ' "narrativeChain": "剧情运镜链，用 -> 连接",',
  ' "keyNodes": [{"time":"开端|中段|结尾","action":"关键事件","nodeType":"背景铺垫|转折点|高潮点|其他","impactLevel":1}],',
  ' "agentOutline": {',
  ' "summary": "章节总述",',
  ' "chapterTarget": "本章目标",',
  ' "sceneBeats": ["3-6个桥段步骤"],',
  ' "locations": ["关键地点"],',
  ' "charactersInvolved": ["关键人物"],',
  ' "conflictNotes": ["冲突/矛盾"],',
  ' "gains": ["剧情收获"],',
  ' "relationshipChanges": ["关系变化"],',
  ' "endingState": "结尾状态",',
  ' "openLoops": ["未解决点/悬念"],',
  ' "tags": ["标签"]',
  ' },',
  ];
  if (!disableRoleExtract) {
  lines.push(' "archiveRecords": [{"kind":"character|item|skill|faction|relationship|foreshadow|event","title":"标题","subject":"人物/势力主体","target":"技能/物品/关系对象","detail":"本章确认的事实","status":"状态或变化","evidence":"正文中的简短依据","importance":1}],');
  }
  lines.push(' "roleStatus": [{"name":"角色名","status":"近期状态快照：当前境界/等级、当前目标或准备做的事、最近关键变化，一句话概括，没有则写无"}],');
  lines.push(
  ' "acquisitions": [{"time":"时间","subject":"人物","target":"获得物","detail":"事件","impactLevel":1}],',
  ' "alliances": [{"time":"时间","subject":"人物A","target":"人物B","detail":"变化","impactLevel":1}],',
  ' "relationProgress": [{"time":"时间","subject":"人物A","target":"人物B","detail":"变化","impactLevel":1}]',
  '}',
  '',
  '⚠️ 必须完整填写 plotSynopsis（300-500字），这是最重要的字段。',
  );
  if (!disableRoleExtract) {
  lines.push('⚠️ archiveRecords 不超过 12 条，只记录本章能够由正文确认的重要事实。');
  lines.push('⚠️ 字段语义：skill/item 的 subject 必须是获得它的角色，target 是技能/物品名；relationship 的 subject/target 都是人物；event/foreshadow 不得把章节标题或物品名当成人物。');
  }
  lines.push('⚠️ 如果某个数组字段本章没有相关内容，写空数组 []，不要省略字段。');
  return lines.join('\n');
}

function toStringList(value: unknown, max = 8): string[] {
 if (Array.isArray(value)) {
 return value
 .map((item) => toInlineText(item).trim())
 .filter(Boolean)
 .slice(0, max);
 }
 const single = toSafeText(value).trim();
 return single ? [single] : [];
}

function toAgentOutline(value: unknown): AgentChapterOutline | undefined {
 if (!value || typeof value !== 'object') return undefined;
 const row = value as Record<string, unknown>;
 const outline: AgentChapterOutline = {
 summary: toSafeText(pickField(row, ['summary', 'outlineSummary', '章节总述', '总述'])).trim(),
 chapterTarget: toSafeText(pickField(row, ['chapterTarget', 'goal', '本章目标', '章节目标'])).trim(),
 sceneBeats: toStringList(pickField(row, ['sceneBeats', 'beats', '场景节拍', '桥段步骤']), 8),
 locations: toStringList(pickField(row, ['locations', 'location', '地点', '关键地点']), 8),
 charactersInvolved: toStringList(pickField(row, ['charactersInvolved', 'characters', '关键人物', '人物']), 10),
 conflictNotes: toStringList(pickField(row, ['conflictNotes', 'conflicts', '冲突', '冲突注记']), 8),
 gains: toStringList(pickField(row, ['gains', 'rewards', '收获', '剧情收获']), 8),
 relationshipChanges: toStringList(pickField(row, ['relationshipChanges', 'relations', '关系变化', '人物关系变化']), 8),
 endingState: toSafeText(pickField(row, ['endingState', 'ending', '结尾状态', '章节结尾'])).trim(),
 openLoops: toStringList(pickField(row, ['openLoops', 'pendingThreads', '未解决点', '悬念']), 8),
 tags: toStringList(pickField(row, ['tags', 'labels', '标签']), 12)
 };

 const hasContent = Boolean(
 outline.summary ||
 outline.chapterTarget ||
 outline.sceneBeats.length ||
 outline.locations.length ||
 outline.charactersInvolved.length ||
 outline.conflictNotes.length ||
 outline.gains.length ||
 outline.relationshipChanges.length ||
 outline.endingState ||
 outline.openLoops.length ||
 outline.tags.length
 );

 return hasContent ? outline : undefined;
}

function toParallelThreads(value: unknown): Array<{ name: string; status: '已闭环' | '待推进' | '已埋伏笔' | '疑似伏笔' | '已回收' | '进行中'; progress: string; evidence?: string }> {
 if (!Array.isArray(value)) return [];
 const validStatuses = new Set(['已闭环', '待推进', '已埋伏笔', '疑似伏笔', '已回收', '进行中']);
 type ThreadStatus = '已闭环' | '待推进' | '已埋伏笔' | '疑似伏笔' | '已回收' | '进行中';
 return value
 .map((item) => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const name = toSafeText(pickField(row, ['name', '名称', '线索名'])).trim();
 const rawStatus = toSafeText(pickField(row, ['status', '状态'])).trim();
 const status: ThreadStatus = validStatuses.has(rawStatus) ? rawStatus as ThreadStatus : '待推进';
 const progress = toSafeText(pickField(row, ['progress', '进展', '描述'])).trim();
 if (!name || !progress) return null;
 const evidence = toSafeText(pickField(row, ['evidence', '证据', '依据'])).trim() || undefined;
 return { name, status, progress, evidence };
 })
 .filter((item): item is NonNullable<typeof item> => Boolean(item))
 .slice(0, 10);
}

function toPredictions(value: unknown): Array<{ direction: string; probability: string; suggestion: string }> {
 if (!Array.isArray(value)) return [];
 return value
 .map((item) => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const direction = toSafeText(pickField(row, ['direction', '方向', '发展方向'])).trim();
 const suggestion = toSafeText(pickField(row, ['suggestion', '建议', '写作建议'])).trim();
 if (!direction && !suggestion) return null;
 const probability = toSafeText(pickField(row, ['probability', '概率', '可能性'])).trim() || '中';
 return { direction: direction || suggestion, probability, suggestion: suggestion || direction };
 })
 .filter((item): item is NonNullable<typeof item> => Boolean(item))
 .slice(0, 8);
}

function normalizeArchiveKind(value: unknown): StoryArchiveKind {
 const raw = String(value || '').trim();
 if (
 raw === 'character' ||
 raw === 'item' ||
 raw === 'skill' ||
 raw === 'faction' ||
 raw === 'relationship' ||
 raw === 'foreshadow' ||
 raw === 'event'
 ) {
 return raw;
 }
 const cnMap: Record<string, StoryArchiveKind> = {
 角色: 'character',
 人物: 'character',
 道具: 'item',
 装备: 'item',
 技能: 'skill',
 势力: 'faction',
 关系: 'relationship',
 伏笔: 'foreshadow',
 事件: 'event'
 };
 return cnMap[raw] || 'event';
}

function toArchiveRecordsFromAi(value: unknown, chapter: Chapter): StoryArchiveRecord[] {
 if (!Array.isArray(value)) return [];
 const now = new Date().toISOString();
 return value
 .map((item, index): StoryArchiveRecord | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const kind = normalizeArchiveKind(row.kind);
 const subject = toInlineText(pickField(row, ['subject', '主体', '角色', 'name'])).trim();
 const detail = toSafeText(pickField(row, ['detail', '说明', '变化', '事件', 'summary'])).trim();
 const title = toInlineText(pickField(row, ['title', '标题'])).trim() || subject || detail.slice(0, 24);
 if (!subject || !detail) return null;
 const importance = Number(pickField(row, ['importance', 'impactLevel', '重要度']));
 return {
 id: `${chapter.id}-${kind}-${index}-${title}`.replace(/\s+/g, '-'),
 kind,
 title,
 subject,
 target: toInlineText(pickField(row, ['target', '对象', '客体'])).trim() || undefined,
 detail,
 status: toInlineText(pickField(row, ['status', '状态'])).trim() || undefined,
 chapterId: chapter.id,
 chapterTitle: chapter.title,
 sourceChapterIds: [chapter.id],
 evidence: toSafeText(pickField(row, ['evidence', '证据', '原文片段', 'contextQuote'])).trim() || undefined,
 tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 12) : undefined,
 importance: Number.isFinite(importance) ? Math.max(1, Math.min(5, Math.floor(importance))) : undefined,
 createdAt: now
 };
 })
 .filter((item): item is StoryArchiveRecord => Boolean(item));
}

function toRoleStatusRecords(value: unknown, chapter: Chapter): StoryArchiveRecord[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();
  return value
    .map((item, index): StoryArchiveRecord | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const subject = toInlineText(pickField(row, ['name', '角色', '角色名', 'subject', '主体'])).trim();
      const detail = toSafeText(pickField(row, ['status', '近期状态', 'recentStatus', 'detail', '状态'])).trim();
      if (!subject || !detail) return null;
      return {
        id: `${chapter.id}-recentstatus-${index}-${subject}`.replace(/\s+/g, '-'),
        kind: 'character',
        title: `${subject} 近期状态`,
        subject,
        detail,
        status: '__RECENT_STATUS__',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        sourceChapterIds: [chapter.id],
        createdAt: now
      };
    })
    .filter((item): item is StoryArchiveRecord => Boolean(item));
}

function deriveArchiveRecordsFromPlot(chapter: Chapter, memory: ChapterMemory): StoryArchiveRecord[] {
 const now = new Date().toISOString();
 const records: StoryArchiveRecord[] = [];
 const pushRecord = (record: Omit<StoryArchiveRecord, 'id' | 'chapterId' | 'chapterTitle' | 'sourceChapterIds' | 'createdAt'>) => {
 records.push({
 ...record,
 id: `${chapter.id}-${record.kind}-${records.length}-${record.title}`.replace(/\s+/g, '-'),
 chapterId: chapter.id,
 chapterTitle: chapter.title,
 sourceChapterIds: [chapter.id],
 createdAt: now
 });
 };

 for (const item of toSafePlotEvents(memory.plotAnalysis?.acquisitions)) {
 const target = item.target || '获得事件';
 pushRecord({
 kind: target.includes('技') ? 'skill' : 'item',
 title: `${item.subject}获得${target}`,
 subject: item.subject,
 target: item.target,
 detail: item.detail,
 evidence: item.evidence,
 importance: item.impactLevel
 });
 }
 for (const item of toSafePlotEvents(memory.plotAnalysis?.alliances)) {
 pushRecord({
 kind: 'relationship',
 title: `${item.subject}${item.target ? `与${item.target}` : ''}关系变化`,
 subject: item.subject,
 target: item.target,
 detail: item.detail,
 status: '关系变化',
 evidence: item.evidence,
 importance: item.impactLevel
 });
 }
 for (const item of toSafePlotEvents(memory.plotAnalysis?.relationProgress)) {
 pushRecord({
 kind: 'relationship',
 title: `${item.subject}${item.target ? `与${item.target}` : ''}关系进展`,
 subject: item.subject,
 target: item.target,
 detail: item.detail,
 status: '关系进展',
 evidence: item.evidence,
 importance: item.impactLevel
 });
 }
 for (const node of toSafePlotNodes(memory.plotAnalysis?.keyNodes)) {
 pushRecord({
 kind: 'event',
 title: node.action.slice(0, 32),
 subject: chapter.title,
 detail: node.time ? `${node.time}：${node.action}` : node.action,
 status: node.nodeType,
 importance: node.impactLevel
 });
 }
 return records;
}

export function createChapterMemoryFromAnalysis(analysis: Record<string, unknown>, chapter: Chapter, options?: { disableRoleExtract?: boolean }): ChapterMemory {
 const plotSynopsis = toSafeText(pickField(analysis, ['plotSynopsis', '章节剧情', '章节剧情梗概', 'functionSummary', '章节核心功能']));
 const agentOutline = toAgentOutline(pickField(analysis, ['agentOutline', '智能大纲', '章节大纲']));

 const nextMemory: ChapterMemory = {
 chapterId: chapter.id,
 summary: toSafeText(analysis.summary),
 isAnalyzed: true,
 plotAnalysis: {
 narrativeChain: toSafeText(analysis.narrativeChain),
 keyNodes: toSafePlotNodes(analysis.keyNodes) as any,
 plotSynopsis,
 functionSummary: plotSynopsis,
 acquisitions: toSafePlotEvents(pickField(analysis, ['acquisitions', '获得事件'])) as any,
 alliances: toSafePlotEvents(pickField(analysis, ['alliances', '结盟事件'])) as any,
 relationProgress: toSafePlotEvents(pickField(analysis, ['relationProgress', '关系进展'])) as any
 },
 agentOutline,
 aiInference: undefined
 };

 // 章节结构化事实始终保存；是否更新角色卡由后续提案确认决定。
 const aiArchiveRecords = toArchiveRecordsFromAi(pickField(analysis, ['archiveRecords', '档案记录']), chapter);
 const baseRecords = aiArchiveRecords.length > 0 ? aiArchiveRecords : deriveArchiveRecordsFromPlot(chapter, nextMemory);
 const statusRecords = toRoleStatusRecords(pickField(analysis, ['roleStatus', '角色状态', '角色近期状态']), chapter);
 nextMemory.archiveRecords = [...baseRecords, ...statusRecords];
 return nextMemory;
}

export function toPlotHistoryData(memory: ChapterMemory): PlotHistoryData {
 return {
 chapterId: memory.chapterId,
 summary: memory.summary,
 isAnalyzed: true,
 plotAnalysis: memory.plotAnalysis,
 agentOutline: memory.agentOutline,
 archiveRecords: memory.archiveRecords
 };
}

function hasPlotMemoryData(memory?: ChapterMemory): boolean {
 if (!memory) return false;
 const plot = memory.plotAnalysis;
 return Boolean(
 toSafeText(memory.summary).trim() ||
 toSafeText(plot?.narrativeChain).trim() ||
 toSafeText(plot?.plotSynopsis).trim() ||
 toSafeText(plot?.functionSummary).trim() ||
 toSafePlotNodes(plot?.keyNodes).length > 0 ||
 toSafePlotEvents(plot?.acquisitions).length > 0 ||
 toSafePlotEvents(plot?.alliances).length > 0 ||
 toSafePlotEvents(plot?.relationProgress).length > 0 ||
 Boolean(memory.agentOutline?.summary || memory.agentOutline?.chapterTarget || memory.agentOutline?.sceneBeats?.length) ||
 (memory.archiveRecords?.length || 0) > 0
 );
}

export function mergeMemoryKeepingExisting(prev: ChapterMemory | undefined, next: ChapterMemory): ChapterMemory {
 if (!prev) return next;
 const prevPlot = prev.plotAnalysis;
 const nextPlot = next.plotAnalysis;
 const mergedPlot = {
 narrativeChain: toSafeText(nextPlot?.narrativeChain).trim() || prevPlot?.narrativeChain || '',
 keyNodes: (toSafePlotNodes(nextPlot?.keyNodes).length > 0 ? toSafePlotNodes(nextPlot?.keyNodes) : toSafePlotNodes(prevPlot?.keyNodes)) as any,
 plotSynopsis:
 toSafeText(nextPlot?.plotSynopsis).trim() ||
 toSafeText(nextPlot?.functionSummary).trim() ||
 prevPlot?.plotSynopsis ||
 prevPlot?.functionSummary ||
 '',
 functionSummary:
 toSafeText(nextPlot?.plotSynopsis).trim() ||
 toSafeText(nextPlot?.functionSummary).trim() ||
 prevPlot?.plotSynopsis ||
 prevPlot?.functionSummary ||
 '',
 acquisitions: (toSafePlotEvents(nextPlot?.acquisitions).length > 0
 ? toSafePlotEvents(nextPlot?.acquisitions)
 : toSafePlotEvents(prevPlot?.acquisitions)) as any,
 alliances: (toSafePlotEvents(nextPlot?.alliances).length > 0
 ? toSafePlotEvents(nextPlot?.alliances)
 : toSafePlotEvents(prevPlot?.alliances)) as any,
 relationProgress: (toSafePlotEvents(nextPlot?.relationProgress).length > 0
 ? toSafePlotEvents(nextPlot?.relationProgress)
 : toSafePlotEvents(prevPlot?.relationProgress)) as any
 };

 return {
 ...prev,
 ...next,
 summary: toSafeText(next.summary).trim() || prev.summary,
 isAnalyzed: next.isAnalyzed || prev.isAnalyzed,
 plotAnalysis: hasPlotMemoryData(next) ? (mergedPlot as any) : prev.plotAnalysis,
 agentOutline:
 next.agentOutline && (
 next.agentOutline.summary ||
 next.agentOutline.chapterTarget ||
 next.agentOutline.sceneBeats.length ||
 next.agentOutline.locations.length ||
 next.agentOutline.charactersInvolved.length ||
 next.agentOutline.conflictNotes.length ||
 next.agentOutline.gains.length ||
 next.agentOutline.relationshipChanges.length ||
 next.agentOutline.endingState ||
 next.agentOutline.openLoops.length ||
 next.agentOutline.tags.length
 )
 ? next.agentOutline
 : prev.agentOutline,
 archiveRecords: next.archiveRecords?.length ? next.archiveRecords : prev.archiveRecords,
 aiInference: next.aiInference ?? prev.aiInference
 };
}

export function mergeMemories(base: ChapterMemory[], updates: ChapterMemory[]): ChapterMemory[] {
 const baseMap = new Map(base.map((item) => [item.chapterId, item]));
 const updateMap = new Map(
 updates.map((item) => [item.chapterId, mergeMemoryKeepingExisting(baseMap.get(item.chapterId), item)])
 );
 const kept = base.filter((item) => !updateMap.has(item.chapterId));
 return kept.concat(Array.from(updateMap.values()));
}

export function isFatalAiRequestError(error: unknown): boolean {
 const message = String(error instanceof Error ? error.message : error || '');
 return /鉴权失败|API Key|账号权限|余额不足|402|401|403|REQUEST_IN_PROGRESS|当前已有 AI 请求正在处理中|已有请求进行中/.test(message);
}
