// 模块说明：新书 wizard 编排（P2-A2~A5）。
// 职责：封装「跑某一步 prompt → 解析结果 → 产出气泡卡内容」的纯函数编排，
//       供 AgentChatPanel 渲染确认卡并 dispatch wizard 状态机。
// 铁律：所有 prompt 只基于书内已填设定 + 题材打法；产出必须用户确认后才进下一步。

import type { Book } from '../types';
import type { AppConfig } from '../types/ai';
import {
  buildNewBookBaseBlocks,
  buildOpeningOptionsPrompt,
  parseOpeningOptions,
  buildStoryCoreArchivePrompt,
  parseStoryCoreArchive,
  buildWritingApproachPrompt,
  parseWritingApproach,
  type OpeningOption,
  type StoryCoreArchive,
  type WritingApproach,
  formatStoryCoreArchive,
  formatWritingApproach,
} from './openingDirection';
import {
  buildPlotPlanPrompt,
  parsePlotPlan,
  buildChapterOutlinePrompt,
  parseChapterOutline,
  buildOutlineReviewPrompt,
  parseOutlineReview,
  formatVolumePlan,
  formatChapterOutlineItem,
  formatOutlineReviewForUser,
  type VolumePlan,
  type ChapterOutlineItem,
  type OutlineReviewResult,
} from './plotPlanning';
import { buildResearchPrompt, parseResearchResult, formatResearchResult } from './researchPrompt';
import type { AgentWizardState } from './wizardState';

export type WizardChatFn = (messages: Array<{ role: string; content: string }>) => Promise<{ text: string }>;

export interface WizardCard {
  step: number;
  title: string;
  body: string;
  options?: Array<{
    key: string;
    title: string;
    body: string;
    /** 结构化原始数据（方向卡：完整 OpeningOption），选择时直接取用，不从渲染文本反解 */
    data?: unknown;
  }>;
  isFinal?: boolean;
}

export type WizardSearchFn = (query: string) => Promise<string>;

/** 第 4 步（剧情规划）前的同题材研究，可选；返回研究结论块或空（D1 闭环） */
async function runResearchIfWanted(
  book: Book,
  state: AgentWizardState,
  callChat: WizardChatFn,
  webSearch?: WizardSearchFn
): Promise<string> {
  // 有核心档案才研究；研究失败不阻塞
  if (!state.coreArchive) return '';
  const blocks = buildNewBookBaseBlocks(book);
  const coreBlock = formatStoryCoreArchive(state.coreArchive);
  try {
    // 真搜索：web_search（Bing 结果页，来源标注强制）；不可用则跳过
    let searchResults = '';
    if (webSearch) {
      const q = `${blocks.genre} ${state.coreArchive.satisfactionModel || state.coreArchive.coreConflict || ''} 经典 完本`;
      try {
        const r = await webSearch(q.trim());
        searchResults = String(r || '').slice(0, 3000);
      } catch { /* 搜索失败不阻塞 */ }
    }
    const research = await callChat(buildResearchPrompt({ book, searchResults, readTexts: [] }));
    const parsed = parseResearchResult(research.text);
    return parsed.findings ? formatResearchResult(parsed.findings) : '';
  } catch {
    return '';
  }
}

/**
 * 推进 wizard 一步：根据当前 state.step 跑对应 prompt，返回要渲染的气泡卡 + 该步产出。
 * 调用方拿到卡渲染给用户确认；确认后 dispatch({ type:'confirm', step, payload })。
 */
export async function runWizardStep(
  book: Book,
  state: AgentWizardState,
  callChat: WizardChatFn,
  webSearch?: WizardSearchFn,
  config?: AppConfig | null
): Promise<{ card: WizardCard; payload: unknown }> {
  const blocks = buildNewBookBaseBlocks(book);
  const plannerPrompt = String(config?.ai?.customPlannerPrompt || '').trim() || undefined;
  const editorPrompt = String(config?.ai?.customEditorPrompt || '').trim() || undefined;

  switch (state.step) {
    case 1: {
      const msgs = buildOpeningOptionsPrompt({
        book,
        settingBlock: blocks.settingBlock,
        genreBlock: blocks.genreBlock,
        userRequest: state.userRequest,
      });
      const res = await callChat(msgs);
      const parsed = parseOpeningOptions(res.text);
      if (!parsed.options.length) {
        return {
          card: { step: 1, title: '开局方向', body: '（模型未返回有效方向，请重试或换个想法）' },
          payload: null,
        };
      }
      return {
        card: {
          step: 1,
          title: '开局方向 · 请选一个',
          body: '基于你的想法与书内设定，我给出几个开局方向：',
          options: parsed.options.map((o) => ({
            key: o.title,
            title: o.title,
            body: `卖点：${o.pitch}\n走向：${o.outline}\n风险：${o.risk}`,
            data: o,
          })),
        },
        payload: parsed.options,
      };
    }
    case 2: {
      const chosen = state.direction;
      if (!chosen) {
        return { card: { step: 2, title: '故事核心档案', body: '（缺少选中的方向，请回退到第 1 步）' }, payload: null };
      }
      const msgs = buildStoryCoreArchivePrompt({ book, chosen, settingBlock: blocks.settingBlock });
      const res = await callChat(msgs);
      const archive = parseStoryCoreArchive(res.text);
      if (!archive) {
        return { card: { step: 2, title: '故事核心档案', body: '（解析失败，请重试）' }, payload: null };
      }
      return {
        card: { step: 2, title: '故事核心档案 · 请确认', body: formatStoryCoreArchive(archive) },
        payload: archive,
      };
    }
    case 3: {
      if (!state.coreArchive) {
        return { card: { step: 3, title: '写法决策', body: '（缺少核心档案，请回退）' }, payload: null };
      }
      const msgs = buildWritingApproachPrompt({
        book,
        archive: state.coreArchive,
        genreBlock: blocks.genreBlock,
        plannerPrompt,
      });
      const res = await callChat(msgs);
      const approach = parseWritingApproach(res.text);
      if (!approach) {
        return { card: { step: 3, title: '写法决策', body: '（解析失败，请重试）' }, payload: null };
      }
      return {
        card: { step: 3, title: '写法决策 · 请确认', body: formatWritingApproach(approach) },
        payload: approach,
      };
    }
    case 4: {
      if (!state.coreArchive || !state.writingApproach) {
        return { card: { step: 4, title: '剧情规划', body: '（缺少前置决策，请回退）' }, payload: null };
      }
      // 同题材研究（D1 闭环）：先研究再规划
      const researchBlock = await runResearchIfWanted(book, state, callChat, webSearch);
      const msgs = buildPlotPlanPrompt({
        book,
        coreArchiveBlock: formatStoryCoreArchive(state.coreArchive),
        writingApproachBlock: formatWritingApproach(state.writingApproach),
        researchBlock: researchBlock || undefined,
        plannerPrompt,
      });
      const res = await callChat(msgs);
      const plan = parsePlotPlan(res.text);
      if (!plan) {
        return { card: { step: 4, title: '剧情规划', body: '（解析失败，请重试）' }, payload: null };
      }
      return { card: { step: 4, title: '第一卷规划 · 请确认', body: formatVolumePlan(plan) }, payload: plan };
    }
    case 5: {
      if (!state.plotPlan) {
        return { card: { step: 5, title: '章节大纲', body: '（缺少卷规划，请回退）' }, payload: null };
      }
      const targetCount = 5; // 第一卷默认先出 5 章大纲
      const msgs = buildChapterOutlinePrompt({
        book,
        volumePlanBlock: formatVolumePlan(state.plotPlan),
        targetChapterCount: targetCount,
      });
      const res = await callChat(msgs);
      const parsed = parseChapterOutline(res.text);
      if (!parsed.chapters.length) {
        return { card: { step: 5, title: '章节大纲', body: '（解析失败，请重试）' }, payload: null };
      }
      return {
        card: {
          step: 5,
          title: '章节大纲 · 请确认',
          body: parsed.chapters.map(formatChapterOutlineItem).join('\n\n'),
        },
        payload: parsed.chapters,
      };
    }
    case 6: {
      if (!state.plotPlan || !state.outline) {
        return { card: { step: 6, title: '大纲审查', body: '（缺少大纲，请回退）' }, payload: null };
      }
      const msgs = buildOutlineReviewPrompt({
        book,
        volumePlanBlock: formatVolumePlan(state.plotPlan),
        outlineBlock: state.outline.map(formatChapterOutlineItem).join('\n'),
        editorPrompt,
      });
      const res = await callChat(msgs);
      const review = parseOutlineReview(res.text);
      if (!review.issues.length) {
        return { card: { step: 6, title: '大纲审查', body: '（解析失败，请重试）' }, payload: null };
      }
      const invalidCount = review.issues.filter((i) => i.verdict === 'invalid' || i.verdict === 'needs_rework').length;
      return {
        card: {
          step: 6,
          title: '大纲审查 · ' + (invalidCount ? `发现 ${invalidCount} 处需处理` : '全部有效'),
          body: formatOutlineReviewForUser(review),
          isFinal: true,
        },
        payload: review,
      };
    }
    default:
      throw new Error(`未知 wizard 步骤：${state.step}`);
  }
}
