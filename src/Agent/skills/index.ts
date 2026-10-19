// 模块说明：技能注册入口。确保 unified loop 的 buildSystemPrompt / load_skill 可用。
// 惰性 import 各技能实现，避免注册表与实现文件的循环依赖。

import { agentSkillRegistry, type AgentSkillContext } from './registry';
import { inferAgentGenreFromBook } from '../bookContext';
import { loadReviewSkill, formatSkillChecklistForPrompt } from './loadReviewSkill';
import { loadGenrePlaySkill, formatGenrePlayForPrompt } from './loadGenrePlaySkill';

let _registered = false;

async function loadWritingSkill(ctx: AgentSkillContext): Promise<string> {
  const { buildWritingSkillBlock } = await import('./writingSkill');
  return buildWritingSkillBlock(ctx.book, ctx.config);
}

async function loadReviewSkillFull(ctx: AgentSkillContext): Promise<string> {
  const genre = inferAgentGenreFromBook(ctx.book);
  const skill = loadReviewSkill(genre);
  return formatSkillChecklistForPrompt(skill);
}

async function loadStoryCanonSkill(ctx: AgentSkillContext): Promise<string> {
  const { buildStoryCanonBlock } = await import('../storyCanonCards');
  return buildStoryCanonBlock(ctx.book, ctx.chapter || ctx.book.chapters[ctx.book.chapters.length - 1] || { id: '', title: '', content: '' } as any);
}

export function ensureAgentSkillsRegistered(): void {
  if (_registered) return;
  _registered = true;

  agentSkillRegistry.register({
    id: 'writing',
    name: 'writing',
    description: '写作方法论：规划师/写手/编辑三角色 prompt 与文风指令，写长内容前加载',
    category: 'writing',
    load: loadWritingSkill,
  });

  agentSkillRegistry.register({
    id: 'review',
    name: 'review',
    description: '题材审查清单：按当前书题材加载自检项，评价/找硬伤/质量分析前加载',
    category: 'review',
    load: loadReviewSkillFull,
  });

  agentSkillRegistry.register({
    id: 'story_canon',
    name: 'story_canon',
    description: '设定卡+近期剧情卡+角色卡构建，需对齐本书设定/承接时加载',
    category: 'reference',
    load: loadStoryCanonSkill,
  });

  agentSkillRegistry.register({
    id: 'genre_play',
    name: 'genre_play',
    description: '题材打法：按当前书题材给读者预期/爽点类型/节奏模板/雷区，写正文前加载',
    category: 'reference',
    load: async (ctx) => formatGenrePlayForPrompt(loadGenrePlaySkill(inferAgentGenreFromBook(ctx.book))),
  });
}
