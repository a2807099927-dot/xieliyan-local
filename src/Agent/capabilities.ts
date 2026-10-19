// 模块说明：Agent 能力清单声明。
// 关键职责：定义 Agent 当前支持的工具调用接口（写章节/查档案/提取角色等）。
import { CAPABILITY_KEYWORDS } from './constants';
import type { AgentTaskSheet, CraftPattern } from './types';
import { ensureStringArray, stringifySearchParts } from './normalize';

function includesKeyword(haystack: string, keywords: string[]): boolean {
 return keywords.some((keyword) => haystack.includes(keyword));
}

export function deriveRequestedCapabilities(task: AgentTaskSheet): string[] {
 const explicit = ensureStringArray(task.requestedCapabilities);
 const searchText = stringifySearchParts([
 task.userInstruction,
 task.plotIntent,
 task.requiredBeats,
 task.emotionalArc,
 task.contextHints
 ]);

 const inferred = CAPABILITY_KEYWORDS.filter((entry) => includesKeyword(searchText, entry.keywords)).map(
 (entry) => entry.capability
 );

 return Array.from(new Set([...explicit, ...inferred]));
}

export function inferPatternTags(pattern: Pick<CraftPattern, 'patternType' | 'patternName' | 'ruleSummary' | 'searchableText'>): string[] {
 const tags = new Set<string>([pattern.patternType]);
 const text = `${pattern.patternName}\n${pattern.ruleSummary}\n${pattern.searchableText}`;

 for (const entry of CAPABILITY_KEYWORDS) {
 if (includesKeyword(text, entry.keywords)) tags.add(entry.capability);
 }

 if (pattern.patternType === 'dialogue') tags.add('dialogue');
 if (pattern.patternType === 'structure') tags.add('structure');
 if (pattern.patternType === 'psychology') tags.add('inner_monologue');
 if (pattern.patternType === 'rhythm') tags.add('rhythm_control');
 if (pattern.patternType === 'description') tags.add('description_focus');
 if (pattern.patternType === 'info_density') tags.add('info_density');

 return Array.from(tags);
}
