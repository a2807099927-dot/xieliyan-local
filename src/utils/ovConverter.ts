// ovConverter.ts - Convert AI outline trees into normalized Outline Vision nodes.
import { OutlineNode, OutlineNodeType } from '../types/ov';

interface AiPoint {
 label: string;
 desc: string;
 order: number;
 chapterStart?: number;
 chapterEnd?: number;
}

interface Segment {
 chapterStart?: number;
 chapterEnd?: number;
 points: AiPoint[];
}

function mapType(raw: unknown): OutlineNodeType {
 const type = String(raw || '').trim();
 if (type === 'arc' || type === 'root') return 'arc';
 if (type === 'sub_plot') return 'sub_plot';
 return 'event';
}

function parseChapterRange(text: string): { start: number; end: number } | null {
 const source = String(text || '');
 const range =
 source.match(/第\s*(\d{1,5})\s*[-~—至到]\s*(\d{1,5})\s*[章节话回]?/) ||
 source.match(/(\d{1,5})\s*[-~—至到]\s*(\d{1,5})/);
 if (range) {
 const a = Number(range[1]);
 const b = Number(range[2]);
 if (Number.isFinite(a) && Number.isFinite(b)) {
 return { start: Math.min(a, b), end: Math.max(a, b) };
 }
 }

 const single = source.match(/第\s*(\d{1,5})\s*[章节话回]?/);
 if (single) {
 const n = Number(single[1]);
 if (Number.isFinite(n)) return { start: n, end: n };
 }
 return null;
}

function collectAiPoints(root: any): AiPoint[] {
 const points: AiPoint[] = [];
 let order = 0;

 const walk = (node: any) => {
 if (!node || typeof node !== 'object') return;
 const label = String(node.label || node.title || node.name || '').trim();
 const desc = String(node.desc || node.summary || '').trim();
 const children = Array.isArray(node.children) ? node.children : [];
 const type = String(node.type || '').trim();

 const isPointType = type === 'event' || type === 'sub_plot' || (!type && children.length === 0);
 if (isPointType && (label || desc)) {
 const hint = parseChapterRange(`${label} ${desc}`);
 points.push({
 label: label || `剧情点${order + 1}`,
 desc,
 order: order++,
 chapterStart: hint?.start,
 chapterEnd: hint?.end
 });
 }

 children.forEach((child: any) => walk(child));
 };

 if (root?.type === 'root' && Array.isArray(root.children)) {
 root.children.forEach((child: any) => walk(child));
 } else {
 walk(root);
 }

 return points;
}

function buildChapterRanges(totalChapters: number): Array<{ start: number; end: number }> {
 const ranges: Array<{ start: number; end: number }> = [];
 let cursor = 1;
 while (cursor <= totalChapters) {
 const remaining = totalChapters - cursor + 1;
 let span = 4;
 if (remaining <= 5 && remaining >= 2) {
 span = remaining;
 } else if (remaining === 1 && ranges.length > 0) {
 ranges[ranges.length - 1].end += 1;
 break;
 }
 span = Math.max(2, Math.min(5, span));
 ranges.push({ start: cursor, end: cursor + span - 1 });
 cursor += span;
 }
 return ranges;
}

function summarizePoints(points: AiPoint[]): string {
 const parts = points
 .slice(0, 2)
 .map((p) => (p.desc || p.label).trim())
 .filter(Boolean);
 return parts.join('；');
}

function toSegmentNode(segment: Segment, fallbackIndex: number): OutlineNode {
 const hasRange = typeof segment.chapterStart === 'number' && typeof segment.chapterEnd === 'number';
 const span = hasRange
 ? Math.max(1, (segment.chapterEnd as number) - (segment.chapterStart as number) + 1)
 : Math.max(2, Math.min(5, segment.points.length || 3));
 const title = hasRange
 ? segment.chapterStart === segment.chapterEnd
 ? `第${segment.chapterStart}章剧情推进`
 : `第${segment.chapterStart}-${segment.chapterEnd}章剧情推进`
 : `剧情段${fallbackIndex + 1}`;
 const summary = summarizePoints(segment.points);

 return {
 id: crypto.randomUUID(),
 title,
 type: 'event',
 conflict: summary || `承接第${fallbackIndex + 1}段关键剧情推进`,
 characters: [],
 targetWordCount: span * 3000,
 actualWordCount: 0,
 isAiGenerated: true
 };
}

function chunkBySize(points: AiPoint[], size = 3): AiPoint[][] {
 const chunks: AiPoint[][] = [];
 for (let i = 0; i < points.length; i += size) {
 chunks.push(points.slice(i, i + size));
 }
 if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) {
 const tail = chunks.pop() as AiPoint[];
 chunks[chunks.length - 1].push(tail[0]);
 }
 return chunks;
}

function classifyPhase(index: number, total: number): string {
 const ratio = total <= 1 ? 1 : index / Math.max(1, total - 1);
 if (ratio <= 0.2) return '开端铺垫';
 if (ratio <= 0.45) return '主线推进';
 if (ratio <= 0.7) return '矛盾升级';
 if (ratio <= 0.88) return '高潮爆发';
 return '收束与伏笔';
}

function classifyByContent(segment: OutlineNode, fallback: string): string {
 const text = `${segment.title || ''} ${segment.conflict || ''}`.toLowerCase();
 if (/感情|关系|情感|cp|爱慕|表白|误会/.test(text)) return '人物关系';
 if (/世界|设定|门派|势力|历史|规则|背景/.test(text)) return '世界设定';
 if (/战斗|对抗|冲突|追杀|boss|决战|伏击/.test(text)) return '冲突对抗';
 if (/线索|伏笔|悬疑|谜团|真相|暗线/.test(text)) return '伏笔悬疑';
 return fallback;
}

function packSegmentsIntoArcs(segmentNodes: OutlineNode[]): OutlineNode[] {
 if (segmentNodes.length === 0) return [];

 const segmentsPerArc = 10;
 const arcs: OutlineNode[] = [];

 for (let i = 0; i < segmentNodes.length; i += segmentsPerArc) {
 const chunk = segmentNodes.slice(i, i + segmentsPerArc);
 const arcIndex = Math.floor(i / segmentsPerArc) + 1;
 const firstTitle = chunk[0]?.title || '';
 const lastTitle = chunk[chunk.length - 1]?.title || '';
 const arcTitle =
 firstTitle && lastTitle && firstTitle !== lastTitle
 ? `第${arcIndex}卷（${firstTitle} - ${lastTitle}）`
 : `第${arcIndex}卷`;

 const byCategory = new Map<string, OutlineNode[]>();
 chunk.forEach((node, idx) => {
 const category = classifyByContent(node, classifyPhase(idx, chunk.length));
 const list = byCategory.get(category) || [];
 list.push(node);
 byCategory.set(category, list);
 });

 const categoryNodes: OutlineNode[] = Array.from(byCategory.entries()).map(([category, list]) => ({
 id: crypto.randomUUID(),
 title: category,
 type: 'arc',
 targetWordCount: list.reduce((sum, node) => sum + (node.targetWordCount || 0), 0),
 actualWordCount: 0,
 isAiGenerated: true,
 children: list
 }));

 arcs.push({
 id: crypto.randomUUID(),
 title: arcTitle,
 type: 'arc',
 targetWordCount: categoryNodes.reduce((sum, node) => sum + (node.targetWordCount || 0), 0),
 actualWordCount: 0,
 isAiGenerated: true,
 children: categoryNodes
 });
 }

 return arcs;
}

export function convertAiTreeToOutlineNodes(aiTree: any): OutlineNode[] {
 if (!aiTree) return [];

 const convertNode = (node: any): OutlineNode => ({
 id: crypto.randomUUID(),
 title: String(node.label || node.title || '未命名剧情点').trim() || '未命名剧情点',
 type: mapType(node.type),
 conflict: String(node.desc || '').trim() || undefined,
 characters: [],
 targetWordCount: 3000,
 actualWordCount: 0,
 isAiGenerated: true,
 children: Array.isArray(node.children) ? node.children.map(convertNode) : undefined
 });

 if (aiTree.type === 'root' && Array.isArray(aiTree.children)) {
 return aiTree.children.map(convertNode);
 }
 return [convertNode(aiTree)];
}

export function convertAiTreeToSegmentNodes(aiTree: any, chapterCount = 0): OutlineNode[] {
 const points = collectAiPoints(aiTree);
 if (points.length === 0) return convertAiTreeToOutlineNodes(aiTree);

 points.sort((a, b) => {
 const aKey = typeof a.chapterStart === 'number' ? a.chapterStart : 100000 + a.order;
 const bKey = typeof b.chapterStart === 'number' ? b.chapterStart : 100000 + b.order;
 return aKey - bKey || a.order - b.order;
 });

 const hintedMaxChapter = points.reduce((max, p) => Math.max(max, p.chapterEnd || 0), 0);
 const totalChapters = chapterCount > 0 ? chapterCount : hintedMaxChapter;

 let segments: Segment[] = [];
 if (totalChapters >= 2) {
 const ranges = buildChapterRanges(totalChapters);
 segments = ranges.map((r) => ({
 chapterStart: r.start,
 chapterEnd: r.end,
 points: points.filter((p) => {
 if (typeof p.chapterStart !== 'number' || typeof p.chapterEnd !== 'number') return false;
 return p.chapterEnd >= r.start && p.chapterStart <= r.end;
 })
 }));

 const unassigned = points.filter((p) => !segments.some((s) => s.points.includes(p)));
 for (const point of unassigned) {
 const target = segments.find((s) => (s.points.length || 0) < 3) || segments[segments.length - 1];
 target?.points.push(point);
 }
 } else {
 segments = chunkBySize(points, 3).map((chunk) => ({ points: chunk }));
 }

 const segmentNodes = segments
 .filter((s) => s.points.length > 0)
 .map((segment, idx) => toSegmentNode(segment, idx));

 if (segmentNodes.length === 0) {
 return convertAiTreeToOutlineNodes(aiTree);
 }

 return packSegmentsIntoArcs(segmentNodes);
}
