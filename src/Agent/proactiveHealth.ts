// 模块说明：开书主动体检（P3）—— 只读分析，不自动改书。

import type { Book, ChapterMemory, StoryArchiveRecord } from '../types';

export type ProactiveSuggestionKind =
  | 'missing_body_analysis'
  | 'unresolved_foreshadow'
  | 'long_absent_role'
  | 'empty_chapter';

export interface ProactiveSuggestion {
  id: string;
  kind: ProactiveSuggestionKind;
  title: string;
  detail: string;
  chapterId?: string;
  roleName?: string;
  severity: 'info' | 'warn';
}

function plainLen(html: string): number {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length;
}

function memByChapter(book: Book): Map<string, ChapterMemory> {
  const m = new Map<string, ChapterMemory>();
  for (const item of book.memoryBank || []) {
    if (item?.chapterId) m.set(item.chapterId, item);
  }
  return m;
}

/** 打开书时的只读体检建议 */
export function inspectBookProactive(book: Book): ProactiveSuggestion[] {
  const out: ProactiveSuggestion[] = [];
  const memories = memByChapter(book);
  const chapters = book.chapters || [];

  // 1) 有正文但缺分析 / 只有摘要
  let missingAnalysis = 0;
  for (const ch of chapters) {
    const words = ch.wordCount || plainLen(ch.content || '');
    if (words < 80) {
      if (words > 0) {
        out.push({
          id: `empty-${ch.id}`,
          kind: 'empty_chapter',
          title: `章节正文过短：${ch.title}`,
          detail: `「${ch.title}」正文约 ${words} 字，可能尚未完成。`,
          chapterId: ch.id,
          severity: 'info'
        });
      }
      continue;
    }
    const mem = memories.get(ch.id);
    const hasAnalysis = Boolean(mem?.isAnalyzed || mem?.plotAnalysis?.plotSynopsis || mem?.summary);
    if (!hasAnalysis) {
      missingAnalysis += 1;
      if (missingAnalysis <= 12) {
        out.push({
          id: `miss-analysis-${ch.id}`,
          kind: 'missing_body_analysis',
          title: `缺剧情分析：${ch.title}`,
          detail: `「${ch.title}」已有正文，但 memoryBank 中缺少分析/摘要，影响查证与连贯约束。`,
          chapterId: ch.id,
          severity: 'warn'
        });
      }
    }
  }
  if (missingAnalysis > 12) {
    out.push({
      id: 'miss-analysis-more',
      kind: 'missing_body_analysis',
      title: `另有 ${missingAnalysis - 12} 章缺分析`,
      detail: '建议批量整理体检或分批生成剧情档案。',
      severity: 'info'
    });
  }

  // 2) 伏笔未回收
  const foreshadows: StoryArchiveRecord[] = [];
  for (const mem of book.memoryBank || []) {
    for (const rec of mem.archiveRecords || []) {
      if (rec?.kind === 'foreshadow') foreshadows.push(rec);
    }
  }
  for (const f of foreshadows.slice(0, 30)) {
    const status = String(f.status || '').toLowerCase();
    const open = !status || /未|open|pending|悬|待/.test(status) || !/已回收|closed|resolved|完成/.test(status);
    if (!open) continue;
    out.push({
      id: `fs-${f.id || f.title}`,
      kind: 'unresolved_foreshadow',
      title: `未回收伏笔：${f.title || f.subject || '未命名'}`,
      detail: `${f.detail || f.status || '状态未标记为已回收'}（记录于 ${f.chapterTitle || f.chapterId || '未知章'}）`,
      chapterId: f.chapterId,
      severity: 'warn'
    });
  }

  // 3) 角色长期未出场：用近 N 章正文/档案粗检
  const roles = (book.resourceIndex?.customCharacterCategories || []).flatMap((c) =>
    (c.children || []).map((r) => ({ name: r.name, aliases: r.aliases || [], roleType: r.roleType }))
  );
  const recent = chapters.slice(-12);
  const recentText = recent
    .map((c) => `${c.title}\n${String(c.content || '').replace(/<[^>]+>/g, '').slice(0, 2500)}`)
    .join('\n');
  const important = roles.filter((r) => r.roleType === '主角' || r.roleType === '女主' || r.roleType === '配角').slice(0, 40);
  for (const r of important) {
    const names = [r.name, ...r.aliases].filter(Boolean);
    const hit = names.some((n) => recentText.includes(n));
    if (!hit && names[0]) {
      out.push({
        id: `absent-${r.name}`,
        kind: 'long_absent_role',
        title: `长期未出场：${r.name}`,
        detail: `在最近 ${recent.length} 章正文片段中未检索到「${names.join('/')}」。若非刻意退场，可考虑补戏或更新角色近况。`,
        roleName: r.name,
        severity: 'info'
      });
    }
  }

  // 去重限幅
  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  }).slice(0, 40);
}

export function formatProactiveSuggestions(list: ProactiveSuggestion[]): string {
  if (!list.length) return '体检完成：未发现需要立刻处理的问题。';
  const lines = [`整理体检：发现 ${list.length} 项建议`, ''];
  list.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.severity}] ${s.title}`);
    lines.push(`   ${s.detail}`);
  });
  lines.push('', '可选择：帮我处理（打开对应章/档案）或忽略。');
  return lines.join('\n');
}
