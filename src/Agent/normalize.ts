// 模块说明：Agent 输入输出规范化工具。
// 关键职责：统一文本编码、清洗 AI 返回的 markdown 残留、去除注水。
import { GENRE_ALIASES, PATTERN_TYPE_ALIASES } from './constants';
import type { AgentGenreId, CraftPatternType } from './types';

export function normalizeGenreId(value: unknown): AgentGenreId {
 const key = String(value || '')
 .trim()
 .toLowerCase()
 .replace(/[\s_-]+/g, '');
 return GENRE_ALIASES[key] ?? 'unknown';
}

export function normalizePatternType(value: unknown): CraftPatternType {
 const key = String(value || '').trim().toLowerCase();
 return PATTERN_TYPE_ALIASES[key] ?? 'other';
}

export function ensureStringArray(value: unknown): string[] {
 if (!Array.isArray(value)) return [];
 return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export function stringifySearchParts(parts: unknown[]): string {
 return parts
 .flatMap((part) => {
 if (part == null) return [];
 if (typeof part === 'string') return [part];
 if (Array.isArray(part)) return part.map((item) => String(item || ''));
 if (typeof part === 'object') return [JSON.stringify(part)];
 return [String(part)];
 })
 .join('\n');
}
