// 模块说明：技法种子（SQL Craft Seed）解析器。
// 关键职责：把 INSERT 语句格式的写作技法库解析为内存对象供 Agent 检索。
import { parseJsonLoosely } from '../utils/jsonParse';
import { inferPatternTags } from './capabilities';
import { normalizeGenreId, normalizePatternType, stringifySearchParts } from './normalize';
import type { CraftPattern, CraftTemplate, CraftTriggerRule } from './types';

const INSERT_PREFIX = 'INSERT OR REPLACE INTO craft_patterns VALUES';

function parseSqlStringTuple(tuple: string): string[] {
 const values: string[] = [];
 let index = 0;

 while (index < tuple.length) {
 while (index < tuple.length && /[\s,()]/.test(tuple[index])) index += 1;
 if (index >= tuple.length) break;

 if (tuple[index] === "'") {
 index += 1;
 let value = '';
 while (index < tuple.length) {
 const ch = tuple[index];
 if (ch === "'") {
 if (tuple[index + 1] === "'") {
 value += "'";
 index += 2;
 continue;
 }
 index += 1;
 break;
 }
 value += ch;
 index += 1;
 }
 values.push(value);
 continue;
 }

 let raw = '';
 while (index < tuple.length && tuple[index] !== ',') {
 raw += tuple[index];
 index += 1;
 }
 values.push(raw.trim());
 }

 return values;
}

function readInsertBodies(sql: string): string[] {
 const bodies: string[] = [];
 let index = 0;

 while (index < sql.length) {
 const found = sql.indexOf(INSERT_PREFIX, index);
 if (found < 0) break;
 const start = sql.indexOf('(', found + INSERT_PREFIX.length);
 if (start < 0) break;

 let depth = 0;
 let inString = false;
 let body = '';

 for (let i = start; i < sql.length; i += 1) {
 const ch = sql[i];
 body += ch;

 if (inString) {
 if (ch === "'"&& sql[i + 1] === "'") {
 body += "'";
 i += 1;
 continue;
 }
 if (ch === "'") inString = false;
 continue;
 }

 if (ch === "'") {
 inString = true;
 continue;
 }

 if (ch === '(') depth += 1;
 if (ch === ')') {
 depth -= 1;
 if (depth === 0) {
 bodies.push(body);
 index = i + 1;
 break;
 }
 }
 }
 }

 return bodies;
}

function safeParseArray<T>(text: string, fallback: T[] = []): T[] {
 try {
 const parsed = parseJsonLoosely<unknown>(text);
 return Array.isArray(parsed) ? (parsed as T[]) : fallback;
 } catch {
 return fallback;
 }
}

function safeParseObject<T extends Record<string, unknown>>(text: string, fallback: T): T {
 try {
 const parsed = parseJsonLoosely<unknown>(text);
 return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback;
 } catch {
 return fallback;
 }
}

export function parseCraftPatternsFromSql(sql: string): CraftPattern[] {
 return readInsertBodies(sql)
 .map(parseSqlStringTuple)
 .filter((values) => values.length >= 13)
 .map((values) => {
 const triggerConditions = safeParseArray<CraftTriggerRule>(values[5]);
 const templates = safeParseArray<CraftTemplate>(values[6]);
 const forbidden = safeParseArray<string>(values[7]).map((item) => String(item || '').trim()).filter(Boolean);
 const conflictSignals = safeParseObject<Record<string, string[]>>(values[8], {});
 const examples = safeParseObject<Record<string, unknown>>(values[9], {});

 const searchableText = stringifySearchParts([
 values[3],
 values[10],
 triggerConditions,
 templates,
 forbidden,
 conflictSignals,
 examples
 ]);

 const pattern: CraftPattern = {
 id: values[0],
 genre: normalizeGenreId(values[1]),
 patternType: normalizePatternType(values[2]),
 patternName: values[3],
 frequency: values[4],
 triggerConditions,
 templates,
 forbidden,
 conflictSignals,
 examples,
 ruleSummary: values[10],
 source: values[11],
 createdAt: Number(values[12]) || 0,
 tags: [],
 searchableText
 };

 pattern.tags = inferPatternTags(pattern);
 return pattern;
 });
}
