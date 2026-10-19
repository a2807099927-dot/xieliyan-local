// 模块说明：写作 Agent 的提示词适配层。
// 不另起一套体系：消费现有 Agent 三角色 prompt + 文风 profile + 本书设定。
// Planner=剧情规划/细纲；Writer=正文写作；Editor=审稿自检。

import type { Book, Chapter } from '../../types';
import type { AppConfig } from '../../types/ai';
import { useConfigStore } from '../../store/useConfigStore';
import { useBookStore } from '../../store/useBookStore';
import { resolveStyleForBook } from '../../utils/styleResolver';
import { getPromptSync, withBaseProse } from '../../utils/promptStore';
import { buildStoryCanonBlock } from '../storyCanonCards';

export type WritingSkillRole = 'planner' | 'writer' | 'editor';

export interface WritingPromptBundleOptions {
  /** 是否带角色自定义提示词（planner/writer/editor 三套） */
  withRolePrompt?: boolean;
  /** 是否带设定卡+近期剧情卡+角色卡（buildStoryCanonBlock 整块） */
  withStoryCanon?: boolean;
  /** 是否带本书 context（worldSettings/plotOutline/角色备注/设定条目） */
  withBookContext?: boolean;
  /** 是否带自定义文风/风格预设 */
  withStyle?: boolean;
}

export interface WritingPromptBundle {
  role: WritingSkillRole;
  rolePrompt: string;
  styleInstruction: string;
  stylePresetId: string;
  bookContext: string;
  fullBlock: string;
}

function text(value: unknown, max = 4000): string {
  const s = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}\n…（已截断）` : s;
}

function collectWorldLore(book: Book, limit = 12): string {
  const items = Array.isArray((book as any).worldSettings) ? (book as any).worldSettings : [];
  const lines: string[] = [];
  for (const item of items.slice(0, limit)) {
    const title = text(item?.title || item?.name, 40);
    const body = text(item?.content || item?.description || item?.text, 280);
    if (!title && !body) continue;
    lines.push(title ? `· ${title}${body ? `：${body}` : ''}` : `· ${body}`);
  }
  return lines.join('\n');
}

function resolveConfig(config?: AppConfig | null): AppConfig | null {
  return config || useConfigStore.getState().config || null;
}

function getRolePrompt(role: WritingSkillRole, config: AppConfig | null): string {
  const ai = config?.ai;
  if (role === 'planner') {
    return text(ai?.customPlannerPrompt, 5000) || getPromptSync('agent_outline_system', '');
  }
  if (role === 'writer') {
    // 写作风格单入口（T1/T3）：写手权威源 = styleProfiles[].styleInstruction（bundle 内处理）。
    // 本函数仅在风格未配置时作为兼容兜底读取 customWriterPrompt（旧迁移数据），
    // 两者都无则回退内置 agent_writing_system。customWriterPrompt 不再作为权威源。
    return text(ai?.customWriterPrompt, 6000) || getPromptSync('agent_writing_system', '');
  }
  return text(ai?.customEditorPrompt, 5000) || getPromptSync('full_review_strong', '');
}

function buildBookContext(book: Book): string {
  const settings = book.settings || ({} as Book['settings']);
  const worldSettings = text((settings as any)?.worldSettings, 2500);
  const plotOutline = text((settings as any)?.plotOutline, 2500);
  const characterChats = text((settings as any)?.characterChats, 1500);
  const lore = collectWorldLore(book);

  const parts: string[] = [];
  if (worldSettings) parts.push(`【本书世界/设定】\n${worldSettings}`);
  if (plotOutline) parts.push(`【本书总纲/主线】\n${plotOutline}`);
  if (characterChats) parts.push(`【角色备注】\n${characterChats}`);
  if (lore) parts.push(`【设定条目摘录】\n${lore}`);
  return parts.join('\n\n');
}

export function buildWritingPromptBundle(
  book: Book,
  role: WritingSkillRole,
  config?: AppConfig | null,
  anchorChapter?: Chapter | null,
  options?: WritingPromptBundleOptions
): WritingPromptBundle {
  const withRolePrompt = options?.withRolePrompt ?? true;
  const withStoryCanon = options?.withStoryCanon ?? true;
  const withBookContext = options?.withBookContext ?? true;
  const withStyle = options?.withStyle ?? true;

  const cfg = resolveConfig(config);
  const books = useBookStore.getState().books;
  const style = cfg ? resolveStyleForBook(book.id, cfg, books) : { stylePresetId: '', styleInstruction: '' };
  // 写手角色提示词收敛为单入口（T1）：风格配置 > customWriterPrompt 兜底 > 内置。
  // 用户改写作风格（styleProfiles[].styleInstruction）必须真实生效于写手 prompt，
  // customWriterPrompt 仅为旧迁移数据兼容，不再作为权威源。
  const styleInstructionRaw = text(style.styleInstruction, 6000);
  const writerStyleAsRole = role === 'writer' && Boolean(styleInstructionRaw);
  const rolePrompt = withRolePrompt
    ? role === 'writer'
      ? styleInstructionRaw || getRolePrompt('writer', cfg)
      : getRolePrompt(role, cfg)
    : '';
  // writer 已把风格作为 rolePrompt 注入时，不再重复拼「自定义文风」段
  const styleInstruction = withStyle && !writerStyleAsRole ? text(style.styleInstruction, 3500) : '';
  const bookContext = withBookContext ? buildBookContext(book) : '';
  const anchor =
    anchorChapter ||
    book.chapters?.[book.chapters.length - 1] ||
    ({ id: '', title: '当前章', content: '', wordCount: 0, createdAt: '', updatedAt: '' } as Chapter);
  const storyCanon = withStoryCanon ? buildStoryCanonBlock(book, anchor) : '';

  const roleTitle = role === 'planner' ? '剧情规划师' : role === 'writer' ? '写手' : '审稿编辑';
  const parts: string[] = [];
  if (rolePrompt) parts.push(`【${roleTitle}自定义提示词】\n${rolePrompt}`);
  // 设定卡 + 近期剧情卡优先，让模型先知道「这是本什么书、近况停在哪」
  if (storyCanon) parts.push(storyCanon);
  if (bookContext) parts.push(bookContext);
  if (styleInstruction) {
    parts.push(`【自定义文风/写作风格】\n${styleInstruction}`);
  } else if (withStyle && style.stylePresetId) {
    parts.push(`【文风预设】${style.stylePresetId}（内置预设细则由系统侧注入；此处只作为当前书籍风格标记）`);
  }

  return {
    role,
    rolePrompt,
    styleInstruction,
    stylePresetId: style.stylePresetId,
    bookContext: [storyCanon, bookContext].filter(Boolean).join('\n\n'),
    fullBlock: parts.length ? `【写作 Skill · ${roleTitle}】\n${parts.join('\n\n')}` : ''
  };
}

/** 兼容旧调用：默认返回 Writer 侧完整 Skill */
export function buildWritingSkillBlock(book: Book, config?: AppConfig | null): string {
  return buildWritingPromptBundle(book, 'writer', config).fullBlock;
}

/** 章纲概要：一整章「发生了什么」的故事板，不是分析表 */
export function buildChapterPlanDiscussSystemPrompt(args: {
  book: Book;
  targetLabel: string;
  memoryContext?: string;
  config?: AppConfig | null;
  /** 锚定章：用于近期剧情卡 */
  anchorChapter?: Chapter | null;
}): string {
  const bundle = buildWritingPromptBundle(args.book, 'planner', args.config, args.anchorChapter, {
    withRolePrompt: true,
    withStoryCanon: true,
    withBookContext: true,
    withStyle: false, // 规划不带文风（分层表）
  });
  const memory = text(args.memoryContext, 6000);
  return [
    bundle.fullBlock,
    `你正在为「${args.targetLabel}」和作者讨论整章剧情。`,
    '',
    '## 这次要输出什么',
    '输出一整章的大概剧情，像在给作者讲故事板：',
    '开场谁在哪、要干什么 → 中间发生什么冲突/转折 → 关键对白或动作大意 → 配角怎么搅局或帮忙 → 章末落到什么局面、甩什么具体钩子。',
    '',
    '篇幅要求：通常 600～1500 字，分 3～6 个自然段，把一章走完，不要只给几句摘要。',
    '',
    '## 严禁',
    '- 禁止输出「情绪节奏」「情绪落点」「信息差安排」「矛盾类型」这类分析栏目',
    '- 禁止 Markdown 粗体小标题堆成审稿表',
    '- 禁止用「升华主题」「情感共鸣」这种空泛词替代具体剧情',
    '- 禁止只写开头，不写中段和结尾',
    '- 禁止无视【小说设定卡】【近期剧情卡】：场景跳转必须符合本书规则（虚拟网游从游戏回现实必须先下线）',
    '',
    '## 输出方式',
    '- 用大白话、自然段讲清楚整章剧情',
    '- 可以概括关键对白，例如「苏柳青说……」「主角回……」',
    '- 人物、地点、道具必须来自前文档案、设定或用户本轮方向',
    '- 开场必须承接【近期剧情卡】的结尾状态与地点线',
    '',
    '优先级：用户本轮方向 > 小说设定卡/近期剧情卡 > 前文剧情档案 > Planner 提示词 > 文风补充。',
    memory ? `\n${memory}` : ''
  ].filter(Boolean).join('\n');
}

/** 正式细纲：可直接写入「本章细纲」栏，仍是剧情叙述，不是分析表 */
export function buildFormalChapterOutlineSystemPrompt(args: {
  book: Book;
  targetTitle: string;
  memoryContext?: string;
  config?: AppConfig | null;
  anchorChapter?: Chapter | null;
}): string {
  const bundle = buildWritingPromptBundle(args.book, 'planner', args.config, args.anchorChapter, {
    withRolePrompt: true,
    withStoryCanon: true,
    withBookContext: true,
    withStyle: false, // 正式细纲同样不带文风
  });
  const memory = text(args.memoryContext, 6000);
  return [
    bundle.fullBlock,
    `用户已确认章纲方向。现在为「${args.targetTitle}」输出可直接填入细纲栏的正式细纲。`,
    '',
    '## 输出形态',
    '写成完整一章的剧情细纲，按时间顺序讲清楚：',
    '1. 开场承接：地点、在场人物、承接上章的状态（必须对照近期剧情卡）',
    '2. 主角目标：主角具体要做什么，为什么现在做',
    '3. 推进阻碍：遇到什么麻烦、谁制造阻碍、信息如何变化',
    '4. 关键互动：谁说了什么大意，谁做了什么关键动作（3～8 个具体情节点）',
    '5. 转折/高潮：局势怎么被推高，主角如何应对',
    '6. 本章收束：人物关系、物品、线索、局势落到哪里',
    '7. 下章钩子：一句具体未完成的事，不要空喊悬念',
    '',
    '篇幅 800～2000 字，必须覆盖整章，不能只有开头。',
    '',
    '## 严禁',
    '- 禁止「情绪节奏压/升」「情绪落点」「信息差安排」「矛盾类型」等分析栏目',
    '- 禁止写成论文提纲、审稿意见或技法说明',
    '- 禁止复述用户确认稿却不展开具体剧情',
    '- 禁止场景瞬移：游戏广场/副本直接到现实家里；若跨线必须写上下线过程',
    '',
    '## 约束',
    '- 严格基于用户已确认的章纲概要展开，不跑题',
    '- 角色、地点、世界规则以【小说设定卡】【近期剧情卡】与前文为准',
    '- 若 Planner 自定义提示词与以上输出形态冲突，以以上输出形态为准',
    memory ? `\n${memory}` : ''
  ].filter(Boolean).join('\n');
}

/** 正文写作用 system prompt */
export function buildWriterSystemPrompt(args: {
  book: Book;
  chapterTitle: string;
  extraRules?: string[];
  config?: AppConfig | null;
  chapter?: Chapter | null;
}): string {
  const bundle = buildWritingPromptBundle(args.book, 'writer', args.config, args.chapter, {
    withRolePrompt: true,
    withStoryCanon: false, // 设定卡复盘时已看过，正文聚焦（T3 减负）
    withBookContext: true,
    withStyle: true, // 写作带文风
  });
  return [
    bundle.fullBlock,
    withBaseProse('你是写梨眼的正文写手。只输出可直接落稿的小说正文。'),
    '严格遵守本章细纲、【小说设定卡】【近期剧情卡】、前文档案、当前章已有正文和用户补充要求。',
    '场景跳转必须符合本书规则：虚拟网游从游戏内回现实必须先下线，禁止广场直接到家。',
    '禁止输出分析、计划、注释、Markdown、标题列表、情绪落点或信息差说明。',
    '禁止复述提示词或细纲，直接写正文。',
    `当前章节：${args.chapterTitle}`,
    ...(args.extraRules || [])
  ].filter(Boolean).join('\n');
}

/** 审稿自检用 system prompt */
export function buildEditorReviewSystemPrompt(book: Book, config?: AppConfig | null): string {
  const bundle = buildWritingPromptBundle(book, 'editor', config, null, {
    withRolePrompt: true,
    withStoryCanon: false, // 审查不需要设定卡全文
    withBookContext: false,
    withStyle: false, // 审查不带文风
  });
  return [
    bundle.fullBlock,
    withBaseProse('你是写梨眼的审稿编辑。检查正文是否能直接落稿，不要捧场。'),
    '重点检查：漏情节点、人设崩、前后矛盾、分析腔混进正文、复读注水、不能入章的问题。',
    '输出结构化 JSON：{"pass":boolean,"issues":[{"severity":"hard|soft","text":"问题","fix":"修法"}],"summary":"一句话"}。'
  ].filter(Boolean).join('\n');
}
