// 模块说明：Agent 服务层。
// 架构定位：暴露给前端的统一调用入口，把“任务单构建 + 题材参考资料组装”封装为一次准备动作。
// 关键职责：prepareAgentTask —— 由输入生成 AgentTaskSheet，并结合题材库产出 AgentReferenceBundle。
// 改造点（T6）：移除原先的 `as any`，改为强类型题材库 + 合法的 AgentReferenceBundle 形态
// （旧代码返回的 {genre, patterns, craftSeeds, referenceChapters} 与类型定义并不匹配，此处一并修正）。

import { getAgentGenreLibrary } from './genreSources';
import { createAgentTaskSheet, type AgentTaskInput } from './taskSheet';
import type { AgentReferenceBundle, AgentTaskSheet, GenrePack } from './types';

// 结构：一次任务准备的产物——任务单 + 参考资料包。
export interface PreparedAgentTask {
 taskSheet: AgentTaskSheet;
 referenceBundle: AgentReferenceBundle;
}

// 功能：把题材包装配成合法的 AgentReferenceBundle；无题材数据时返回“空题材”兜底。
function buildReferenceBundle(pack: GenrePack | null): AgentReferenceBundle {
 if (!pack) {
 // 兜底：题材数据未就绪时，主流程按“unknown”题材的默认纪律运行。
 return {
 primaryGenre: 'unknown',
 profileSnippet: '',
 patternSnippet: '',
 selectedPatternIds: [],
 borrowedPatternIds: [],
 requestedCapabilities: [],
 };
 }
 return {
 primaryGenre: pack.profile.genre,
 profileSnippet: pack.profile.displayName,
 patternSnippet: '',
 selectedPatternIds: pack.patterns.map((pattern) => pattern.id),
 borrowedPatternIds: [],
 requestedCapabilities: [],
 shuangwenPrompt: pack.profile.shuangwenPrompt,
 };
}

// 功能：准备一次 Agent 任务。生成任务单，并从缓存题材库挑选题材包组装参考资料。
export function prepareAgentTask(input: AgentTaskInput): PreparedAgentTask {
 const taskSheet = createAgentTaskSheet(input);
 // 题材库由 genreStore 预热进缓存；当前无数据时为空数组，参考资料退化为空题材 bundle。
 const library = getAgentGenreLibrary();
 // 按任务题材精确选包（T9 强化：7 套题材 1:1 独立生效；未命中再回退到库首项）。
 const activePack: GenrePack | null =
 library.find((pack) => pack.genre === taskSheet.primaryGenre) ?? library[0] ?? null;
 const referenceBundle = buildReferenceBundle(activePack);
 return {
 taskSheet,
 referenceBundle,
 };
}
