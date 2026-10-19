// 模块说明：Agent 任务清单数据结构。
// 关键职责：管理批量章节大纲、角色提取建议等多步任务。
import { normalizeGenreId } from './normalize';
import type {
 AgentGenreId,
 AgentPlanningParseResult,
 AgentPlanningResult,
 AgentStyleProfile,
 AgentTaskSheet
} from './types';

export interface AgentTaskInput {
 genre: string;
 userInstruction: string;
 plotIntent?: string;
 tone?: string[];
 requiredBeats?: string[];
 emotionalArc?: string[];
 forbiddenMoves?: string[];
 contextHints?: string[];
 referenceChapters?: string[];
 requestedCapabilities?: string[];
 styleOverrides?: Partial<AgentStyleProfile>;
}

function splitMeaningfulLines(value: string): string[] {
 return String(value || '')
 .split(/[\n,\uFF0C\u3002\uFF1B;\uFF01\uFF1F!?]/)
 .map((item) => item.trim())
 .filter((item) => item.length >= 2);
}

function normalizeStringArray(value: unknown): string[] {
 if (Array.isArray(value)) {
 return value.map((item) => String(item || '').trim()).filter(Boolean);
 }
 if (typeof value === 'string') {
 return splitMeaningfulLines(value);
 }
 return [];
}

function fallbackPlotIntent(userInstruction: string): string {
 const lines = splitMeaningfulLines(userInstruction);
 return lines[0] || '根据当前上下文完成本次写作任务。';
}

function extractReferenceChapters(userInstruction: string): string[] {
 const matches =
 userInstruction.match(/第[0-9零一二三四五六七八九十百千两]+章/g) || [];
 return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)));
}

function stripCodeFence(value: string): string {
 const trimmed = String(value || '').trim();
 if (!trimmed.startsWith('```')) return trimmed;
 return trimmed
 .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
 .replace(/\s*```$/, '')
 .trim();
}

function extractJsonObject(rawText: string): string {
 const stripped = stripCodeFence(rawText);
 const start = stripped.indexOf('{');
 const end = stripped.lastIndexOf('}');
 if (start < 0 || end <= start) return stripped;
 return stripped.slice(start, end + 1);
}

function coercePlanningResult(value: unknown): AgentPlanningResult {
 const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

 const intent = String(raw.intent || '').trim();
 return {
 intent: intent || undefined,
 tone: normalizeStringArray(raw.tone),
 emotionArc: normalizeStringArray(raw.emotionArc),
 requiredBeats: normalizeStringArray(raw.requiredBeats),
 forbiddenMoves: normalizeStringArray(raw.forbiddenMoves),
 contextHints: normalizeStringArray(raw.contextHints)
 };
}

function mergeArrayWithFallback(primary: string[] | undefined, fallback: string[]): string[] {
 const normalizedPrimary = normalizeStringArray(primary);
 const normalizedFallback = normalizeStringArray(fallback);
 if (!normalizedPrimary.length) return normalizedFallback;
 return Array.from(new Set([...normalizedPrimary, ...normalizedFallback]));
}

export function createAgentTaskSheet(input: AgentTaskInput): AgentTaskSheet {
 const primaryGenre = normalizeGenreId(input.genre) as AgentGenreId;
 const userInstruction = String(input.userInstruction || '').trim();
 const explicitReferences = normalizeStringArray(input.referenceChapters);
 const inferredReferences = extractReferenceChapters(userInstruction);

 return {
 version: '1.0',
 primaryGenre,
 userInstruction,
 plotIntent: String(input.plotIntent || '').trim() || fallbackPlotIntent(userInstruction),
 tone: normalizeStringArray(input.tone),
 requiredBeats: normalizeStringArray(input.requiredBeats),
 emotionalArc: normalizeStringArray(input.emotionalArc),
 forbiddenMoves: normalizeStringArray(input.forbiddenMoves),
 contextHints: normalizeStringArray(input.contextHints),
 referenceChapters: Array.from(new Set([...explicitReferences, ...inferredReferences])),
 requestedCapabilities: normalizeStringArray(input.requestedCapabilities),
 styleOverrides: input.styleOverrides
 };
}

export function parsePlanningResult(rawText: string): AgentPlanningParseResult {
 const source = String(rawText || '').trim();
 if (!source) {
 return {
 ok: false,
 planning: null,
 rawText: source,
 error: 'EMPTY_PLANNING_RESPONSE'
 };
 }

 try {
 const jsonText = extractJsonObject(source);
 const parsed = JSON.parse(jsonText) as unknown;
 const planning = coercePlanningResult(parsed);

 if (
 !planning.intent &&
 !planning.tone?.length &&
 !planning.emotionArc?.length &&
 !planning.requiredBeats?.length &&
 !planning.forbiddenMoves?.length &&
 !planning.contextHints?.length
 ) {
 return {
 ok: false,
 planning: null,
 rawText: source,
 error: 'PLANNING_FIELDS_EMPTY'
 };
 }

 return {
 ok: true,
 planning,
 rawText: source
 };
 } catch (error) {
 return {
 ok: false,
 planning: null,
 rawText: source,
 error: error instanceof Error ? error.message : String(error || 'PLANNING_PARSE_FAILED')
 };
 }
}

export function mergePlanningResultToTaskSheet(taskSheet: AgentTaskSheet, planning: AgentPlanningResult | null): AgentTaskSheet {
 if (!planning) return taskSheet;

 const nextPlotIntent = String(planning.intent || '').trim() || taskSheet.plotIntent;
 return {
 ...taskSheet,
 plotIntent: nextPlotIntent,
 tone: mergeArrayWithFallback(planning.tone, taskSheet.tone),
 emotionalArc: mergeArrayWithFallback(planning.emotionArc, taskSheet.emotionalArc),
 requiredBeats: mergeArrayWithFallback(planning.requiredBeats, taskSheet.requiredBeats),
 forbiddenMoves: mergeArrayWithFallback(planning.forbiddenMoves, taskSheet.forbiddenMoves),
 contextHints: mergeArrayWithFallback(planning.contextHints, taskSheet.contextHints)
 };
}
