// 模块说明：老书「书的理解」模型组装（T8.1）。
// 职责：把 memoryBank 章梗概 + archiveRecords + roleCard + 风格分析器 组装成「书的理解」。
// 铁律：全部来自已有数据，0 额外模型调用，不重造；不读正文全文（控 token）。

import type { Book } from '../types';
import { buildNovelSettingCard } from './storyCanonCards';
import { loadLearnedConstraintsFromBook } from './agentMemory';

function clean(value: unknown, max = 200): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface BookUnderstanding {
  /** 世界规则（book.settings / worldSettings / 设定卡） */
  worldRules: string;
  /** 人物档案：roleCard 聚合 + 持久记忆 */
  characters: string;
  /** 剧情状态：memoryBank 章梗概（已发生/当前/未收线头） */
  plotState: string;
  /** 风格模型：风格分析器输出（若有） */
  style: string;
  /** 覆盖章节数（有 memory 的章） */
  coveredChapterCount: number;
}

/** 从 Book 组装「书的理解」（纯函数，0 模型调用） */
export function buildBookUnderstanding(book: Book): BookUnderstanding {
  const settingCard = buildNovelSettingCard(book);

  // 人物：角色卡聚合 + 已确认记忆
  const roles = (book.resourceIndex?.customCharacterCategories || []).flatMap((category) =>
    (category.children || []).map((role) => ({ role, category: category.name }))
  );
  const roleLines = roles.slice(0, 20).map(({ role, category }) => {
    const parts = [role.name, role.roleType, role.faction, role.realm, role.plotProgress].filter(Boolean);
    return parts.length ? `· ${parts.join(' / ')}（${category}）` : '';
  }).filter(Boolean);
  const learned = loadLearnedConstraintsFromBook(book)
    .map((e) => {
      const ent = clean(e.entity);
      return ent ? `· 角色「${ent}」${clean(e.fact)}` : `· ${clean(e.fact)}`;
    })
    .slice(0, 20);
  const characters = [...roleLines, ...learned].filter(Boolean).join('\n');

  // 剧情状态：memoryBank 章梗概
  const memoryBank = Array.isArray(book.memoryBank) ? book.memoryBank : [];
  const chapters = book.chapters || [];
  const plotLines: string[] = [];
  let openLoops: string[] = [];
  for (const mem of memoryBank) {
    const idx = chapters.findIndex((c) => c.id === mem.chapterId);
    const title = idx >= 0 ? (chapters[idx].title || `第${idx + 1}章`) : '未知章';
    const synopsis = clean(
      mem.plotAnalysis?.plotSynopsis || mem.plotAnalysis?.functionSummary || mem.summary || '', 160
    );
    if (synopsis) plotLines.push(`· ${title}：${synopsis}`);
    if (Array.isArray(mem.agentOutline?.openLoops)) {
      openLoops = openLoops.concat(
        mem.agentOutline!.openLoops!.map((x) => String(x || '')).filter(Boolean)
      );
    }
  }
  const coveredChapterCount = memoryBank.filter((m) => clean(m.summary) || clean(m.plotAnalysis?.plotSynopsis)).length;
  const openLoopLines = Array.from(new Set(openLoops)).slice(0, 8);
  const plotState = [
    plotLines.slice(-40).join('\n'),
    openLoopLines.length ? `未收线头：${openLoopLines.join('；')}` : '',
  ].filter(Boolean).join('\n');

  // 风格：风格分析器输出（优先最近一次）
  const styleProfiles = Array.isArray((book as any).styleProfiles) ? (book as any).styleProfiles : [];
  const styleLine = styleProfiles.length
    ? styleProfiles.map((p: any) => clean(p?.summary || p?.result || '', 200)).filter(Boolean).join('\n')
    : '';

  return {
    worldRules: settingCard || '（未填写设定）',
    characters: characters || '（无角色档案）',
    plotState: plotState || '（无剧情档案，建议先做智能整理）',
    style: styleLine || '（无风格分析记录）',
    coveredChapterCount,
  };
}

/** 书的理解 → 对齐卡片可读文本（用户确认用） */
export function formatBookUnderstanding(understanding: BookUnderstanding): string {
  const lines = [
    '我理解你的书目前状态如下：',
    '',
    '【世界规则】',
    understanding.worldRules,
    '',
    '【人物档案】',
    understanding.characters,
    '',
    '【剧情状态】',
    understanding.plotState,
    '',
    '【风格】',
    understanding.style,
  ];
  return lines.join('\n');
}

/** 书的理解 → 写前复盘/续写注入的紧凑块（不展示给用户，喂给模型） */
export function formatBookUnderstandingForWriter(understanding: BookUnderstanding): string {
  return [
    '【书的理解（已确认，续写必须遵守）】',
    `世界：${understanding.worldRules}`,
    `人物：${understanding.characters}`,
    `剧情：${understanding.plotState}`,
    `风格：${understanding.style}`,
  ].join('\n');
}

/** 判断是否需要重新对齐：书级标志位 + 覆盖章节数变化 */
export function shouldReconfirmUnderstanding(book: Book): boolean {
  const confirmed = Boolean((book as any).agentContextConfirmed);
  if (!confirmed) return true;
  // 有正文但 memoryBank 从未覆盖 → 从未真正理解过，仍要对齐
  return (book.memoryBank || []).filter((m) => clean(m.summary) || clean(m.plotAnalysis?.plotSynopsis)).length === 0;
}
