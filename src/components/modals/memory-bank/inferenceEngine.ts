// 模块说明：脱水推演引擎。
// 关键职责： AI 返回 JSON 解析、推演值结构化、时间线节点/并行居综/预测方向历史数据归一化。
// 维护边界：推演 Prompt 构建请在 MemoryBankModal 中实现；本模块只负责数据转换与解析逻辑，不包含 UI 渲染。
import type { Chapter, ChapterMemory } from '../../../types';
import type { InferenceTreeNode } from './ui/InferenceTreeView';
import { isForeshadowLike, parseTimelineOrder, stripHtml } from './utils';

export type SafeAiInference = NonNullable<ChapterMemory['aiInference']>;
export type PlotMemoryLike = Pick<ChapterMemory, 'summary' | 'plotAnalysis' | 'archiveRecords'>;

type InferenceTimelineEvent = {
 time?: string;
 location?: string;
 event: string;
 impact: number;
 phase?: string;
 chapter?: string;
 contextQuote?: string;
};

type InferenceParallelThread = {
 name: string;
 status: string;
 progress: string;
 evidence?: string;
};

type InferencePrediction = {
 direction: string;
 probability?: string;
 suggestion: string;
};

type InferencePayload = {
 structureTree: InferenceTreeNode | null;
 timelineEvents: InferenceTimelineEvent[];
 parallelThreads: InferenceParallelThread[];
 predictions: InferencePrediction[];
};

type PlotNodeSafe = {
 time?: string;
 action: string;
 nodeType: '背景铺垫' | '转折点' | '高潮点' | '其他';
 impactLevel?: number;
};

export type PlotEventSafe = {
 time?: string;
 subject: string;
 target?: string;
 detail: string;
 chapter?: string;
 evidence?: string;
 impactLevel?: number;
};

function sanitizeAiResponse(input: string): string {
 let text = String(input || '')
 .replace(/^\uFEFF/, '')
 .replace(/<think>[\s\S]*?<\/think>/gi, '') // DeepSeek 思维链（带标签）
 .replace(/^```json\s*/i, '')
 .replace(/^```\s*/i, '')
 .replace(/```\s*$/i, '')
 .replace(/[\u0000-\u001F\u007F]/g, '')
 .trim();

 // DeepSeek 有时不用 <think> 标签，而是在 JSON 前输出一段中文解释
 // 策略：如果文本不以 { 开头，尝试找到第一个 { 并截取
 if (text.length > 0 && text[0] !== '{' && text[0] !== '[') {
 const firstBrace = text.indexOf('{');
 if (firstBrace > 0 && firstBrace < 2000) {
 // 确认 { 之前的内容不是 JSON 的一部分（不包含 " 开头的 key）
 const prefix = text.slice(0, firstBrace);
 if (!/^\s*"/.test(prefix)) {
 text = text.slice(firstBrace);
 }
 }
 }

 return text;
}

function extractBalancedJson(text: string): string | null {
 const source = sanitizeAiResponse(text);
 const starts: number[] = [];
 for (let i = 0; i < source.length; i += 1) {
 const ch = source[i];
 if (ch === '{' || ch === '[') starts.push(i);
 }

 for (const start of starts) {
 const open = source[start];
 const close = open === '{' ? '}' : ']';
 let depth = 0;
 let inString = false;
 let escaped = false;

 for (let i = start; i < source.length; i += 1) {
 const ch = source[i];
 if (inString) {
 if (escaped) {
 escaped = false;
 continue;
 }
 if (ch === '\\') {
 escaped = true;
 continue;
 }
 if (ch === '"') inString = false;
 continue;
 }

 if (ch === '"') {
 inString = true;
 continue;
 }

 if (ch === open) depth += 1;
 if (ch === close) {
 depth -= 1;
 if (depth === 0) return source.slice(start, i + 1);
 }
 }
 }

 return null;
}

function parseTopLevelPartialObject(text: string): Record<string, unknown> | null {
 const source = sanitizeAiResponse(text);
 const start = source.indexOf('{');
 if (start < 0) return null;

 const pairs: string[] = [];
 let i = start + 1;
 const len = source.length;

 const skipWs = () => {
 while (i < len && /\s/.test(source[i])) i += 1;
 };

 const readQuoted = (): string | null => {
 if (i >= len || source[i] !== '"') return null;
 let j = i + 1;
 let escaped = false;
 for (; j < len; j += 1) {
 const ch = source[j];
 if (escaped) {
 escaped = false;
 continue;
 }
 if (ch === '\\') {
 escaped = true;
 continue;
 }
 if (ch === '"') {
 const out = source.slice(i, j + 1);
 i = j + 1;
 return out;
 }
 }
 // 截断的字符串：取到末尾并强制闭合
 const truncated = source.slice(i, len).replace(/\\*$/, '') + '"';
 i = len;
 return truncated;
 };

 const readValue = (): string | null => {
 skipWs();
 if (i >= len) return null;
 const ch = source[i];
 if (ch === '"') return readQuoted();

 if (ch === '{' || ch === '[') {
 const open = ch;
 const close = ch === '{' ? '}' : ']';
 const begin = i;
 let depth = 0;
 let inString = false;
 let escaped = false;
 for (; i < len; i += 1) {
 const curr = source[i];
 if (inString) {
 if (escaped) {
 escaped = false;
 continue;
 }
 if (curr === '\\') {
 escaped = true;
 continue;
 }
 if (curr === '"') inString = false;
 continue;
 }
 if (curr === '"') {
 inString = true;
 continue;
 }
 if (curr === open) depth += 1;
 if (curr === close) {
 depth -= 1;
 if (depth === 0) {
 const out = source.slice(begin, i + 1);
 i += 1;
 return out;
 }
 }
 }
 return null;
 }

 const begin = i;
 while (i < len && source[i] !== ',' && source[i] !== '}') i += 1;
 const out = source.slice(begin, i).trim();
 return out || null;
 };

 while (i < len) {
 skipWs();
 if (i >= len || source[i] === '}') break;
 const key = readQuoted();
 if (!key) break;
 skipWs();
 if (i >= len || source[i] !== ':') break;
 i += 1;
 const value = readValue();
 if (!value) break;
 pairs.push(`${key}:${value}`);
 skipWs();
 if (i < len && source[i] === ',') {
 i += 1;
 continue;
 }
 if (i < len && source[i] === '}') break;
 }

 if (pairs.length === 0) return null;
 try {
 return JSON.parse(`{${pairs.join(',')}}`) as Record<string, unknown>;
 } catch {
 return null;
 }
}

export function parseJsonLoosely<T>(text: string): T {
 const raw = sanitizeAiResponse(text);
 try {
 return JSON.parse(raw) as T;
 } catch {
 const jsonSlice = extractBalancedJson(raw);
 if (jsonSlice) {
 try {
 return JSON.parse(jsonSlice) as T;
 } catch {
 // ignore and continue
 }
 }
 const partial = parseTopLevelPartialObject(raw);
 if (partial) return partial as T;
 throw new Error('AI 返回的内容不是有效 JSON');
 }
}

export function pickField<T = unknown>(obj: Record<string, unknown>, keys: string[]): T | undefined {
 for (const key of keys) {
 if (obj[key] !== undefined && obj[key] !== null) return obj[key] as T;
 }
 return undefined;
}

export function toSafeText(value: unknown): string {
 if (typeof value === 'string') return value;
 if (Array.isArray(value)) return value.map((item) => toSafeText(item).trim()).filter(Boolean).join('；');
 if (value && typeof value === 'object') return toInlineText(value);
 return '';
}

export function toInlineText(value: unknown): string {
 const keyMap: Record<string, string> = {
 characterization: '人物塑造',
 relationshipBuilding: '关系推进',
 atmosphereCreation: '氛围营造',
 plotInitiation: '剧情启动',
 conflictSeed: '冲突铺垫',
 emotionalShift: '情绪变化',
 turningPoint: '转折点',
 foreshadow: '伏笔',
 summary: '摘要',
 narrativeChain: '脉络链',
 functionSummary: '章节剧情'
 };
 if (typeof value === 'string') return value;
 if (Array.isArray(value)) return value.map((item) => toInlineText(item).trim()).filter(Boolean).join('；');
 if (value && typeof value === 'object') {
 return Object.entries(value as Record<string, unknown>)
 .map(([key, val]) => {
 const text = toInlineText(val).trim();
 if (!text) return '';
 const mapped = keyMap[key] || '';
 if (!mapped && /[a-zA-Z]/.test(key)) return text;
 const label = mapped || key;
 return `${label}：${text}`;
 })
 .filter(Boolean)
 .join('；');
 }
 return '';
}

export function toSafePlotNodes(value: unknown): PlotNodeSafe[] {
 if (!Array.isArray(value)) return [];
 const typeMap: Record<string, PlotNodeSafe['nodeType']> = {
 背景铺垫: '背景铺垫',
 转折点: '转折点',
 高潮点: '高潮点',
 其他: '其他'
 };
 return value
 .map((item): PlotNodeSafe | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const action = toInlineText(pickField(row, ['action', 'event', 'detail', '内容'])).trim();
 if (!action) return null;
 const rawType = toInlineText(pickField(row, ['nodeType', 'type', '节点类型'])).trim();
 const impact = Number(pickField(row, ['impactLevel', 'impact', '冲击力']));
 return {
 time: toInlineText(pickField(row, ['time', '时间'])).trim() || undefined,
 action,
 nodeType: typeMap[rawType] || '其他',
 impactLevel: Number.isFinite(impact) ? Math.max(1, Math.min(5, Math.floor(impact))) : undefined
 };
 })
 .filter((item): item is PlotNodeSafe => Boolean(item));
}

export function toSafePlotEvents(value: unknown): PlotEventSafe[] {
 if (!Array.isArray(value)) return [];
 return value
 .map((item): PlotEventSafe | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Record<string, unknown>;
 const subject = toInlineText(pickField(row, ['subject', '角色', '主体', 'who'])).trim();
 const detail = toInlineText(pickField(row, ['detail', '事件', '说明', '变化', 'action'])).trim();
 if (!subject || !detail) return null;
 const impact = Number(pickField(row, ['impactLevel', 'impact', '冲击力']));
 return {
 time: toInlineText(pickField(row, ['time', '时间'])).trim() || undefined,
 subject,
 target: toInlineText(pickField(row, ['target', '对象', '客体'])).trim() || undefined,
 detail,
 chapter: toInlineText(pickField(row, ['chapter', '章节'])).trim() || undefined,
 evidence: toInlineText(pickField(row, ['evidence', '证据', 'contextQuote', '原文片段'])).trim() || undefined,
 impactLevel: Number.isFinite(impact) ? Math.max(1, Math.min(5, Math.floor(impact))) : undefined
 };
 })
 .filter((item): item is PlotEventSafe => Boolean(item));
}

function normalizeTreeNode(value: unknown): InferenceTreeNode | null {
 if (!value || typeof value !== 'object') return null;
 const row = value as Record<string, unknown>;
 const label = toInlineText(pickField(row, ['label', 'name', 'title', '节点名'])).trim();
 if (!label) return null;
 const typeRaw = toInlineText(pickField(row, ['type', 'kind'])).trim();
 const type = (['root', 'arc', 'event', 'sub_plot'].includes(typeRaw) ? typeRaw : 'event') as InferenceTreeNode['type'];
 const childrenRaw = pickField(row, ['children', 'nodes', 'subNodes', '子节点', '事件']);
 const children = Array.isArray(childrenRaw)
 ? (childrenRaw.map((child) => normalizeTreeNode(child)).filter(Boolean) as InferenceTreeNode[])
 : [];
 return {
 label,
 type,
 desc: toInlineText(pickField(row, ['desc', 'summary', 'description', '说明', '关键事件'])).trim() || undefined,
 children: children.length > 0 ? children : undefined
 };
}

function flattenTree(root: InferenceTreeNode | null): InferenceTreeNode[] {
 if (!root) return [];
 const output: InferenceTreeNode[] = [];
 const walk = (node: InferenceTreeNode) => {
 output.push(node);
 (node.children || []).forEach(walk);
 };
 walk(root);
 return output;
}

function deriveFallbackViewsFromTree(tree: InferenceTreeNode | null): {
 timelineEvents: InferenceTimelineEvent[];
 parallelThreads: InferenceParallelThread[];
 predictions: InferencePrediction[];
} {
 const flat = flattenTree(tree);
 const source = flat.length > 1 ? flat.slice(1) : flat;
 const safeSource = source.length > 0 ? source : [{ label: '待补全章节', type: 'event' as const, desc: '请重新推演以补全结构' }];
 const phasePool = ['清晨', '上午', '中午', '下午', '傍晚', '夜晚', '深夜'];
 const chapterPool = ['当前章节', '前序章节', '主线段落'];

 const timelineEvents: InferenceTimelineEvent[] = Array.from({ length: Math.max(4, Math.min(8, safeSource.length + 1)) }).map((_, index) => {
 const node = safeSource[index % safeSource.length];
 return {
 time: phasePool[index % phasePool.length],
 location: chapterPool[index % chapterPool.length],
 event: node.desc ? `${node.label}：${node.desc}` : node.label,
 impact: node.type === 'arc' || node.type === 'sub_plot' ? 4 : 3,
 phase: phasePool[index % phasePool.length],
 contextQuote: (node.desc || node.label).slice(0, 30)
 };
 });

 const threadSource = safeSource.filter((node) => node.type === 'sub_plot');
 const parallelThreads: InferenceParallelThread[] = threadSource.slice(0, 4).map((node) => ({
 name: node.label,
 status: '疑似伏笔',
 progress: node.desc || '当前章节出现可回收线索，建议后续持续观察。',
 evidence: '来自结构推导'
 }));

 const predictions: InferencePrediction[] = Array.from({ length: Math.max(3, Math.min(6, safeSource.length + 1)) }).map((_, index) => {
 const node = safeSource[index % safeSource.length];
 return {
 direction: node.label,
 probability: node.type === 'arc' ? '高' : '中',
 suggestion: node.desc || '建议作为后续章节重点推进方向。'
 };
 });

 return { timelineEvents, parallelThreads, predictions };
}

function parseInferencePayload(value: Record<string, unknown>): InferencePayload {
 const views = pickField<Record<string, unknown>>(value, ['views', 'view', 'data']) || {};
 const structureRaw =
 pickField(value, ['structureTree', 'structure_tree', 'structure', 'tree', 'story_tree', 'outline']) ||
 pickField(views, ['structureTree', 'structure_tree', 'structure', 'tree', 'outline']);
 const timelineRaw =
 pickField<unknown[]>(value, ['timelineEvents', 'timeline_events', 'timeline', 'time_view']) ||
 pickField<unknown[]>(views, ['timelineEvents', 'timeline_events', 'timeline', 'time_view']) ||
 [];
 const threadsRaw =
 pickField<unknown[]>(value, ['parallelThreads', 'parallel_threads', 'parallel_clues', 'threads']) ||
 pickField<unknown[]>(views, ['parallelThreads', 'parallel_threads', 'parallel_clues', 'threads']) ||
 [];
 const predictionsRaw =
 pickField<unknown[]>(value, ['predictions', 'prediction', 'forecast']) ||
 pickField<unknown[]>(views, ['predictions', 'prediction', 'forecast']) ||
 [];

 let structureTree = normalizeTreeNode(structureRaw);
 if (!structureTree) structureTree = normalizeTreeNode(value);

 let timelineEvents: InferenceTimelineEvent[] = Array.isArray(timelineRaw)
 ? timelineRaw.reduce<InferenceTimelineEvent[]>((acc, row) => {
 if (!row || typeof row !== 'object') return acc;
 const item = row as Record<string, unknown>;
 const eventText = toInlineText(pickField(item, ['event', '内容', '事件'])).trim();
 if (!eventText) return acc;
 const impact = Number(pickField(item, ['impact', 'impactLevel', '冲击力']));
 acc.push({
 time: toInlineText(pickField(item, ['time', '时间'])).trim() || toInlineText(pickField(item, ['phase', '时段'])).trim() || '未定时段',
 location: toInlineText(pickField(item, ['location', '地点'])).trim() || undefined,
 event: eventText,
 impact: Number.isFinite(impact) ? Math.max(1, Math.min(5, Math.floor(impact))) : 3,
 phase: toInlineText(pickField(item, ['phase', '时段'])).trim() || undefined,
 chapter: toInlineText(pickField(item, ['chapter', '章节'])).trim() || undefined,
 contextQuote: toInlineText(pickField(item, ['contextQuote', 'quote', '原文片段', '锚点片段'])).trim() || undefined
 });
 return acc;
 }, [])
 : [];

 let parallelThreads: InferenceParallelThread[] = Array.isArray(threadsRaw)
 ? threadsRaw.reduce<InferenceParallelThread[]>((acc, row) => {
 if (!row || typeof row !== 'object') return acc;
 const item = row as Record<string, unknown>;
 const name = toInlineText(pickField(item, ['name', '线索', '名称'])).trim();
 const progress = toInlineText(pickField(item, ['progress', '进度', '说明'])).trim();
 const evidence = toInlineText(pickField(item, ['evidence', '证据', '出处'])).trim();
 const mergedText = `${name} ${progress} ${evidence}`.trim();
 if (!name || !isForeshadowLike(mergedText)) return acc;
 const statusRaw = toInlineText(pickField(item, ['status', 'state'])).trim();
 const allowed = ['进行中', '已闭环', '待推进', '已埋伏笔', '疑似伏笔', '已回收'];
 const status = allowed.includes(statusRaw) ? statusRaw : '疑似伏笔';
 acc.push({ name, status, progress, evidence: evidence || undefined });
 return acc;
 }, [])
 : [];

 let predictions: InferencePrediction[] = Array.isArray(predictionsRaw)
 ? predictionsRaw.reduce<InferencePrediction[]>((acc, row) => {
 if (!row || typeof row !== 'object') return acc;
 const item = row as Record<string, unknown>;
 const direction = toInlineText(pickField(item, ['direction', '方向'])).trim();
 if (!direction) return acc;
 acc.push({
 direction,
 probability: toInlineText(pickField(item, ['probability', '概率'])).trim() || '中',
 suggestion: toInlineText(pickField(item, ['suggestion', '建议', '说明'])).trim() || ''
 });
 return acc;
 }, [])
 : [];

 timelineEvents = timelineEvents
 .filter((item, index, arr) => arr.findIndex((it) => it.event === item.event && it.time === item.time) === index)
 .sort((a, b) => parseTimelineOrder(a.time || '') - parseTimelineOrder(b.time || ''));
 parallelThreads = parallelThreads.filter((item, index, arr) => arr.findIndex((it) => it.name === item.name) === index);
 predictions = predictions.filter((item, index, arr) => arr.findIndex((it) => it.direction === item.direction) === index);

 const needDerive = Boolean(structureTree) && timelineEvents.length === 0 && parallelThreads.length === 0 && predictions.length === 0;
 if (needDerive) {
 const derived = deriveFallbackViewsFromTree(structureTree);
 return { structureTree, ...derived };
 }

 if (structureTree) {
 const derived = deriveFallbackViewsFromTree(structureTree);
 if (timelineEvents.length === 0) timelineEvents = derived.timelineEvents;
 if (parallelThreads.length === 0) parallelThreads = derived.parallelThreads;
 if (predictions.length === 0) predictions = derived.predictions;
 }

 return { structureTree, timelineEvents, parallelThreads, predictions };
}

function unwrapInferenceSource(value: unknown, depth = 0): Record<string, unknown> | null {
 if (depth > 4 || value === null || value === undefined) return null;
 if (typeof value === 'string') {
 const raw = value.trim();
 if (!raw) return null;
 try {
 const parsed = parseJsonLoosely<unknown>(raw);
 return unwrapInferenceSource(parsed, depth + 1);
 } catch {
 return null;
 }
 }
 if (typeof value !== 'object') return null;
 const row = value as Record<string, unknown>;
 const nested =
 pickField(row, ['data', 'payload', 'result', 'inference', 'aiInference', 'content', 'response']) ||
 pickField(row, ['body']);
 if (nested && nested !== value) {
 const unwrapped = unwrapInferenceSource(nested, depth + 1);
 if (unwrapped) return unwrapped;
 }
 return row;
}

export function asSafeInference(value: unknown): SafeAiInference | null {
 const row = unwrapInferenceSource(value);
 if (!row) return null;
 let parsedPayload = parseInferencePayload(row);
 const maybeRawText = toInlineText(pickField(row, ['rawText', 'raw_text'])).trim();

 const hasStructuredData =
 Boolean(parsedPayload.structureTree) ||
 parsedPayload.timelineEvents.length > 0 ||
 parsedPayload.parallelThreads.length > 0 ||
 parsedPayload.predictions.length > 0;

 if (!hasStructuredData && maybeRawText) {
 try {
 parsedPayload = parseInferencePayload(parseJsonLoosely<Record<string, unknown>>(maybeRawText));
 } catch {
 return null;
 }
 }

 return {
 generatedAt: toInlineText(pickField(row, ['generatedAt', 'generated_at'])).trim() || new Date().toISOString(),
 providerModel: toInlineText(pickField(row, ['providerModel', 'provider_model', 'model'])).trim() || undefined,
 structureTree: parsedPayload.structureTree as any,
 timelineEvents: parsedPayload.timelineEvents as any,
 parallelThreads: parsedPayload.parallelThreads as any,
 predictions: parsedPayload.predictions as any,
 rawText: toInlineText(pickField(row, ['rawText', 'raw_text'])).trim() || undefined
 } as SafeAiInference;
}

export function isMemoryExtracted(memory?: ChapterMemory): boolean {
 if (!memory) return false;
 if (memory.isAnalyzed) return true;
 if (memory.summary?.trim()) return true;
 if (!memory.plotAnalysis) return false;
 return Boolean(
 toSafeText(memory.plotAnalysis.narrativeChain).trim() ||
 toSafeText(memory.plotAnalysis.functionSummary).trim() ||
 toSafePlotNodes(memory.plotAnalysis.keyNodes).length > 0 ||
 toSafePlotEvents(memory.plotAnalysis.acquisitions).length > 0 ||
 toSafePlotEvents(memory.plotAnalysis.alliances).length > 0 ||
 toSafePlotEvents(memory.plotAnalysis.relationProgress).length > 0
 );
}

function buildPlotText(memory?: PlotMemoryLike | null): string {
 if (!memory?.plotAnalysis) return '';
 const chain = toSafeText(memory.plotAnalysis.narrativeChain).trim();
 const func = toSafeText(memory.plotAnalysis.functionSummary).trim();
 const keyNodes = toSafePlotNodes(memory.plotAnalysis.keyNodes)
 .map((node, index) => `${index + 1}. [${node.nodeType}] ${node.action}${node.time ? ` (${node.time})` : ''}`)
 .join('；');
 const acquisitions = toSafePlotEvents(memory.plotAnalysis.acquisitions)
 .map((row, index) => `${index + 1}. ${row.subject}${row.target ? ` 获得 ${row.target}` : ''}：${row.detail}`)
 .join('；');
 const alliances = toSafePlotEvents(memory.plotAnalysis.alliances)
 .map((row, index) => `${index + 1}. ${row.subject}${row.target ? ` ↔ ${row.target}` : ''}：${row.detail}`)
 .join('；');
 const relationProgress = toSafePlotEvents(memory.plotAnalysis.relationProgress)
 .map((row, index) => `${index + 1}. ${row.subject}${row.target ? ` 与 ${row.target}` : ''}：${row.detail}`)
 .join('；');
 const archiveRecords = Array.isArray(memory.archiveRecords)
 ? memory.archiveRecords
 .slice(0, 12)
 .map((row, index) => {
 const target = row.target ? ` -> ${row.target}` : '';
 const status = row.status ? ` [${row.status}]` : '';
 return `${index + 1}. ${row.kind}/${row.title}${status}：${row.subject}${target}，${row.detail}`;
 })
 .join('；')
 : '';
 return [
 chain ? `整体剧情脉络：\n${chain}` : '',
 keyNodes ? `关键情节点：\n${keyNodes}` : '',
 func ? `章节剧情：\n${func}` : '',
 acquisitions ? `获得事件：\n${acquisitions}` : '',
 alliances ? `结盟事件：\n${alliances}` : '',
 relationProgress ? `关系进展：\n${relationProgress}` : '',
 archiveRecords ? `结构化档案：\n${archiveRecords}` : ''
 ]
 .filter(Boolean)
 .join('\n\n');
}

export function toNarrativeSegments(memory?: PlotMemoryLike | null): string[] {
 if (!memory?.plotAnalysis) return [];
 const raw = memory.plotAnalysis.narrativeChain;
 if (Array.isArray(raw)) {
 return raw.map((item) => toInlineText(item).trim()).filter(Boolean);
 }
 if (typeof raw === 'string') {
 const base = raw.trim();
 if (!base) return [];
 const split = base
 .split(/(?:->|=>|~|\||；|;|\n|→)/g)
 .map((item) => item.trim())
 .filter(Boolean);
 return split.length > 0 ? split : [base];
 }
 const flat = toInlineText(raw).trim();
 if (!flat) return [];
 return flat
 .split(/(?:->|=>|~|\||；|;|\n|→)/g)
 .map((item) => item.trim())
 .filter(Boolean);
}

export function buildInferenceContext(targets: Chapter[], memoryMap: Map<string, ChapterMemory>): string {
 return targets
 .map((chapter) => {
 const memory = memoryMap.get(chapter.id);
 const plotText = buildPlotText(memory);
 const fallback = stripHtml(chapter.content).slice(0, 1000);
 return `【${chapter.title}】\n${plotText || memory?.summary || fallback}`;
 })
 .join('\n\n');
}

export function buildInferencePrompt(context: string): string {
 return [
 '请基于以下章节内容输出严格 JSON（不要 Markdown，不要解释）。',
 '输出结构：',
 '{',
 ' "structureTree": { "label": "", "type": "root|arc|event|sub_plot", "desc": "", "children": [] },',
 ' "timelineEvents": [{ "time": "", "location": "", "event": "", "impact": 3, "phase": "", "chapter": "", "contextQuote": ""}],',
 ' "parallelThreads": [{ "name": "", "status": "疑似伏笔|已埋伏笔|待推进|已回收|已闭环", "progress": "", "evidence": ""}],',
 ' "predictions": [{ "direction": "", "probability": "高|中|低", "suggestion": ""}]',
 '}',
 '',
 '生成约束：',
 '1. structureTree 必须是“总纲 -> 主线/支线 -> 剧情段 -> 关键变化”的层级结构；',
 '2. timelineEvents 只保留真实影响后续的关键事件，并按时间顺序组织；',
 '3. parallelThreads 只保留伏笔、暗线、待回收线索；',
 '4. predictions 必须是可执行写作建议，3-8 条；',
 '5. 不要输出空泛套话。',
 '',
 context
 ].join('\n');
}

export function buildInferenceMergeContext(batchResults: string[]): string {
 return batchResults
 .map((item, index) => `【批次${index + 1}】\n${String(item || '').trim()}`)
 .filter((item) => item.trim().length > 0)
 .join('\n\n');
}

export function buildInferenceMergePrompt(context: string): string {
 return [
 '你会收到多批章节推演 JSON，请合并为一份最终 JSON。',
 '只输出严格 JSON，不要 Markdown，不要解释。',
 '输出结构：',
 '{',
 ' "structureTree": { "label": "", "type": "root|arc|event|sub_plot", "desc": "", "children": [] },',
 ' "timelineEvents": [{ "time": "", "location": "", "event": "", "impact": 3, "phase": "", "chapter": "", "contextQuote": ""}],',
 ' "parallelThreads": [{ "name": "", "status": "疑似伏笔|已埋伏笔|待推进|已回收|已闭环", "progress": "", "evidence": ""}],',
 ' "predictions": [{ "direction": "", "probability": "高|中|低", "suggestion": ""}]',
 '}',
 '',
 '合并规则：',
 '1. 去重同义节点，保留信息更完整的一条；',
 '2. 时间线合并后按先后排序；',
 '3. 并行线索合并同名条目并更新状态；',
 '4. predictions 保留 3-8 条，避免重复。',
 '',
 context
 ].join('\n');
}

export function createInferenceDataFromAiResponse(rawText: string, provider?: string, model?: string): SafeAiInference {
 const parsed = parseJsonLoosely<Record<string, unknown>>(String(rawText || '{}'));
 const payload = parseInferencePayload(parsed);
 return {
 generatedAt: new Date().toISOString(),
 providerModel: `${provider || ''} ${model || ''}`.trim() || undefined,
 structureTree: payload.structureTree as any,
 timelineEvents: payload.timelineEvents as any,
 parallelThreads: payload.parallelThreads as any,
 predictions: payload.predictions as any,
 rawText: String(rawText || '')
 } as SafeAiInference;
}
