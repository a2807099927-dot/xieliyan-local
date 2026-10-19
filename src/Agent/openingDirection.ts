// 模块说明：新书创作模式的写前决策模块。
// 职责：方向卡（T3.1）、故事核心档案（T3.3）、写法决策（T3.4）三个纯函数 prompt + 容错解析。
// 维护边界：不发 AI 请求、不碰 UI/store；调用方负责 chat、确认流与 wizard 状态推进。
// 铁律：只基于书内已填设定（设定卡/角色卡/题材打法），不编造新设定。

import type { Book } from '../types';
import { withBaseProse } from '../utils/promptStore';
import { extractJsonObject } from './loopUtils';
import { buildNovelSettingCard } from './storyCanonCards';
import { inferAgentGenreFromBook } from './bookContext';
import { loadGenrePlaySkill, formatGenrePlayForPrompt } from './skills/loadGenrePlaySkill';

// ─── 方向卡 ───────────────────────────────────────────────────────────────

export interface OpeningOption {
  title: string;
  pitch: string;
  outline: string;
  risk: string;
}

export interface OpeningOptionsResult {
  options: OpeningOption[];
  rawText: string;
}

/** 方向卡 prompt：输入设定卡 + 题材打法，输出 2-3 个开局方向 */
export function buildOpeningOptionsPrompt(input: {
  book: Book;
  settingBlock: string;
  genreBlock: string;
  userRequest?: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文开局策划。用户只有一个模糊想法，你要基于书内已填设定，给出 2-3 个跨章开局方向供用户选择。'
    + ' 只基于【设定卡】里已有的信息发散，严禁编造新的世界规则、角色或金手指。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    input.userRequest ? `用户想法：${input.userRequest}` : '',
    '',
    '【设定卡】',
    input.settingBlock || '（未填写，只能按通用题材方法给方向，不能编造具体设定）',
    '',
    '【题材打法】',
    input.genreBlock || '（无）',
    '',
    '请给 2-3 个开局方向，每个方向包含：',
    '- title：一句话卖点/标题感',
    '- pitch：开局核心设定与冲突（2-3 句）',
    '- outline：前 5-10 章的走向轮廓',
    '- risk：这个方向最大的崩盘风险',
    '',
    'JSON schema：{"options":[{"title":"","pitch":"","outline":"","risk":""}]}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** 容错解析方向卡 JSON */
export function parseOpeningOptions(raw: string): OpeningOptionsResult {
  const rawText = String(raw || '').trim();
  const parsed = extractJsonObject(rawText) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return { options: [], rawText };
  const list = Array.isArray(parsed.options) ? parsed.options : [];
  const options = (list as Array<Record<string, unknown>>)
    .map((o) => ({
      title: String(o?.title || '').trim(),
      pitch: String(o?.pitch || '').trim(),
      outline: String(o?.outline || '').trim(),
      risk: String(o?.risk || '').trim(),
    }))
    .filter((o) => o.title || o.pitch)
    .slice(0, 3);
  return { options, rawText };
}

// ─── 故事核心档案 ─────────────────────────────────────────────────────────

export interface StoryCoreArchive {
  protagonist: string;
  world: string;
  coreConflict: string;
  longTermGoal: string;
  satisfactionModel: string;
}

/** 故事核心档案 prompt：把选中的方向固化为五要素 */
export function buildStoryCoreArchivePrompt(input: {
  book: Book;
  chosen: OpeningOption;
  settingBlock: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是故事架构师。用户已选定一个开局方向，你要把它固化为一本书的核心档案（五要素）。'
    + ' 只能基于用户选定的方向与设定卡，不能另起炉灶、不能添加方向里没有的新设定。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    '【用户选定的方向】',
    `卖点：${input.chosen.title}`,
    `开局：${input.chosen.pitch}`,
    `走向：${input.chosen.outline}`,
    `风险：${input.chosen.risk}`,
    '',
    '【设定卡】',
    input.settingBlock || '（无）',
    '',
    '请固化五要素：',
    '- protagonist：主角（身份/性格锚点/开局状态，只填方向里明确的）',
    '- world：世界（规则/格局，只填设定卡已给的）',
    '- coreConflict：核心冲突（本书长期冲突一句话）',
    '- longTermGoal：长线目标（主角跨卷要达成的）',
    '- satisfactionModel：爽点模型（读者最核心的爽点来源）',
    '',
    'JSON schema：{"protagonist":"","world":"","coreConflict":"","longTermGoal":"","satisfactionModel":""}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseStoryCoreArchive(raw: string): StoryCoreArchive | null {
  const parsed = extractJsonObject(String(raw || '').trim()) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const archive: StoryCoreArchive = {
    protagonist: String(parsed.protagonist || '').trim(),
    world: String(parsed.world || '').trim(),
    coreConflict: String(parsed.coreConflict || '').trim(),
    longTermGoal: String(parsed.longTermGoal || '').trim(),
    satisfactionModel: String(parsed.satisfactionModel || '').trim(),
  };
  return archive.protagonist || archive.world || archive.coreConflict ? archive : null;
}

/** 核心档案 → 后续规划可引用的文本块 */
export function formatStoryCoreArchive(archive: StoryCoreArchive): string {
  const lines = ['【故事核心档案】'];
  if (archive.protagonist) lines.push(`主角：${archive.protagonist}`);
  if (archive.world) lines.push(`世界：${archive.world}`);
  if (archive.coreConflict) lines.push(`核心冲突：${archive.coreConflict}`);
  if (archive.longTermGoal) lines.push(`长线目标：${archive.longTermGoal}`);
  if (archive.satisfactionModel) lines.push(`爽点模型：${archive.satisfactionModel}`);
  return lines.join('\n');
}

// ─── 写法决策 ─────────────────────────────────────────────────────────────

export interface WritingApproach {
  perspective: string;
  pacing: string;
  differentiation: string;
  readerPositioning: string;
}

/** 写法决策 prompt：叙事视角 / 节奏基调 / 差异化打法 / 读者定位 */
export function buildWritingApproachPrompt(input: {
  book: Book;
  archive: StoryCoreArchive;
  genreBlock: string;
  /** 用户 planner 自定义提示词（原样注入，不改写） */
  plannerPrompt?: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文写法顾问。基于已固化的故事核心档案，确定这本书的写法决策（视角/节奏/差异化/读者定位）。'
    + ' 决策必须与核心档案一致，不得互相冲突。'
    + ' 只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    formatStoryCoreArchive(input.archive),
    '',
    input.plannerPrompt ? `【用户对这本书怎么写的偏好（最高优先级）】\n${input.plannerPrompt}` : '',
    '',
    '【题材打法】',
    input.genreBlock || '（无）',
    '',
    '请给出写法决策：',
    '- perspective：叙事视角（第一/第三人称、视角锚定对象）',
    '- pacing：节奏基调（快/慢、爽点密度）',
    '- differentiation：差异化打法（这本书和同类书最大不同点）',
    '- readerPositioning：读者定位（给谁看、期待什么）',
    '',
    'JSON schema：{"perspective":"","pacing":"","differentiation":"","readerPositioning":""}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseWritingApproach(raw: string): WritingApproach | null {
  const parsed = extractJsonObject(String(raw || '').trim()) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const approach: WritingApproach = {
    perspective: String(parsed.perspective || '').trim(),
    pacing: String(parsed.pacing || '').trim(),
    differentiation: String(parsed.differentiation || '').trim(),
    readerPositioning: String(parsed.readerPositioning || '').trim(),
  };
  return approach.perspective || approach.pacing || approach.differentiation ? approach : null;
}

export function formatWritingApproach(approach: WritingApproach): string {
  const lines = ['【写法决策】'];
  if (approach.perspective) lines.push(`视角：${approach.perspective}`);
  if (approach.pacing) lines.push(`节奏：${approach.pacing}`);
  if (approach.differentiation) lines.push(`差异化：${approach.differentiation}`);
  if (approach.readerPositioning) lines.push(`读者定位：${approach.readerPositioning}`);
  return lines.join('\n');
}

// ─── 共享组装入口（纯函数，不调模型） ─────────────────────────────────────

/** 新书写前决策的设定底座：设定卡 + 题材打法块（多次 prompt 共用，避免重复计算） */
export function buildNewBookBaseBlocks(book: Book): {
  settingBlock: string;
  genreBlock: string;
  genre: string;
} {
  const settingBlock = buildNovelSettingCard(book);
  const genre = inferAgentGenreFromBook(book);
  const genreBlock = formatGenrePlayForPrompt(loadGenrePlaySkill(genre));
  return { settingBlock, genreBlock, genre };
}
