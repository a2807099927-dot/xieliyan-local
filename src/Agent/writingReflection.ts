// 模块说明：写作反思层（最小 Judge 闭环）。
// 关键职责：纯函数构建 Review/Revision prompt，并解析 checklist JSON。
// 设计参考：PocketFlow Judge = Generate → Evaluate → Rewrite（不引入框架）。
// 维护边界：不发 AI 请求、不碰 UI/store；调用方负责 chat 与次数控制。

import type { ChatMessagePayload } from '../hooks/useAiChat';
import type { Book, Chapter } from '../types';
import type { AgentTaskSheet } from './types';
import { loadLearnedConstraintsFromBook } from './agentMemory';
import { formatSkillChecklistForPrompt, loadReviewSkill } from './skills/loadReviewSkill';
import { formatAdaptiveChecklist, readAdaptiveReviewState } from './adaptiveReview';
import { withBaseProse } from '../utils/promptStore';

export type AgentConstraint =
  | { type: 'character_fact'; entity: string; fact: string; source: string; priority: 'hard' | 'soft' }
  | { type: 'forbidden_move'; description: string; source: string; priority: 'hard' }
  | { type: 'must_include'; description: string; source: string; priority: 'hard' | 'soft' }
  | { type: 'continuity_rule'; description: string; source: string; priority: 'hard' | 'soft' };

export type ReviewIssueSeverity = 'hard' | 'soft';

export interface ReviewIssue {
  id: string;
  severity: ReviewIssueSeverity;
  dimension: 'character' | 'continuity' | 'forbidden' | 'beat' | 'padding' | 'other';
  evidence: string;
  fixInstruction: string;
}

export interface ReviewResult {
  pass: boolean;
  issues: ReviewIssue[];
  summary: string;
  rawText: string;
  /** Review 提取的事实建议；由 useAgentSession 写入 agentMemory(confirmed=false)，待 confirmMemoryUpdate */
  suggestedMemoryUpdate?: Array<{ entity?: string; fact: string; reason: string }>;
}

function cleanLine(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqConstraints(items: AgentConstraint[]): AgentConstraint[] {
  const seen = new Set<string>();
  const out: AgentConstraint[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 从 taskSheet + 书内角色/指令提取硬约束。
 * 目标：把“参考上下文”压成“不可违反规则”。
 */
export function buildAgentConstraints(input: {
  book: Book;
  chapter: Chapter;
  taskSheet: AgentTaskSheet;
}): AgentConstraint[] {
  const { book, chapter, taskSheet } = input;
  const constraints: AgentConstraint[] = [];

  for (const move of taskSheet.forbiddenMoves || []) {
    const description = cleanLine(move);
    if (!description) continue;
    constraints.push({
      type: 'forbidden_move',
      description,
      source: 'planner.forbiddenMoves',
      priority: 'hard'
    });
  }

  for (const beat of taskSheet.requiredBeats || []) {
    const description = cleanLine(beat);
    if (!description) continue;
    constraints.push({
      type: 'must_include',
      description,
      source: 'planner.requiredBeats',
      priority: 'hard'
    });
  }

  for (const hint of taskSheet.contextHints || []) {
    const description = cleanLine(hint);
    if (!description) continue;
    constraints.push({
      type: 'continuity_rule',
      description,
      source: 'planner.contextHints',
      priority: 'soft'
    });
  }

  const instruction = cleanLine(taskSheet.userInstruction);
  if (instruction) {
    // 覆盖常见中文禁令/必做说法；要求至少 4 字，降低“别写”这类过短误匹配
    const banMatches =
      instruction.match(/(?:不要|禁止|不得|别让|别再|别|不能让|不能|不许|不准|严禁|切忌|避免)[^。；;！!？?\n]{4,48}/g) || [];
    for (const m of banMatches.slice(0, 8)) {
      constraints.push({
        type: 'forbidden_move',
        description: cleanLine(m),
        source: 'user.instruction',
        priority: 'hard'
      });
    }
    const mustMatches =
      instruction.match(/(?:必须|一定要|务必|需要|得把|记得)[^。；;！!？?\n]{4,48}/g) || [];
    for (const m of mustMatches.slice(0, 8)) {
      constraints.push({
        type: 'must_include',
        description: cleanLine(m),
        source: 'user.instruction',
        priority: 'hard'
      });
    }
  }

  // 本章 memoryBank 摘要 / 开放线头：让 chapter 真正参与约束，而不只是死参数
  const memories = Array.isArray(book.memoryBank) ? book.memoryBank : [];
  const currentMemory = memories.find((item: any) => item?.chapterId === chapter.id);
  const chapterSummary = cleanLine(
    currentMemory?.plotAnalysis?.plotSynopsis || currentMemory?.summary || ''
  );
  if (chapterSummary) {
    constraints.push({
      type: 'continuity_rule',
      description: `本章已有剧情基线（勿无故推翻）：${chapterSummary.slice(0, 120)}`,
      source: `memoryBank.${chapter.id}`,
      priority: 'soft'
    });
  }
  const openLoops = Array.isArray(currentMemory?.agentOutline?.openLoops)
    ? currentMemory.agentOutline.openLoops.map(cleanLine).filter(Boolean).slice(0, 4)
    : [];
  for (const loop of openLoops) {
    constraints.push({
      type: 'continuity_rule',
      description: `关注未回收线头：${loop.slice(0, 80)}`,
      source: `memoryBank.openLoops.${chapter.id}`,
      priority: 'soft'
    });
  }
  // 邻近章节里与当前指令相关的档案记录（轻量，不做完整 agentLoop）
  const hay = `${taskSheet.userInstruction}\n${taskSheet.plotIntent}\n${chapter.title}`;
  const archiveHits: AgentConstraint[] = [];
  for (const mem of memories.slice(-30)) {
    const records = Array.isArray(mem?.archiveRecords) ? mem.archiveRecords : [];
    for (const rec of records) {
      const title = cleanLine(rec?.title);
      const detail = cleanLine(rec?.detail);
      const subject = cleanLine(rec?.subject);
      const blob = `${title} ${subject} ${detail}`;
      if (!blob.trim()) continue;
      const related = [title, subject].filter(Boolean).some((x) => x && hay.includes(x));
      if (!related && !(detail && detail.length >= 8 && hay.includes(detail.slice(0, 8)))) continue;
      archiveHits.push({
        type: 'continuity_rule',
        description: cleanLine(`${title || subject || '档案'}: ${detail || rec?.status || ''}`.slice(0, 100)),
        source: `archive.${mem.chapterId || chapter.id}`,
        priority: 'soft'
      });
      if (archiveHits.length >= 6) break;
    }
    if (archiveHits.length >= 6) break;
  }
  constraints.push(...archiveHits);

  const roles = (book.resourceIndex?.customCharacterCategories || []).flatMap((category) =>
    (category.children || []).map((role) => ({ role, category: category.name }))
  );

  const roleHay = `${taskSheet.userInstruction}\n${taskSheet.plotIntent}\n${chapter.title}\n${chapterSummary}`;
  const related = roles
    .filter(({ role }) => {
      const names = [role.name, ...(role.aliases || [])].filter(Boolean);
      return names.some((name) => roleHay.includes(name));
    })
    .slice(0, 12);

  const pick = related.length ? related : roles.slice(0, 8);
  for (const { role, category } of pick) {
    const entity = cleanLine(role.name);
    if (!entity) continue;
    if (role.realm) {
      constraints.push({
        type: 'character_fact',
        entity,
        fact: `当前境界/状态=${cleanLine(role.realm)}`,
        source: `roleCard.${category}`,
        priority: 'hard'
      });
    }
    if (role.faction) {
      constraints.push({
        type: 'character_fact',
        entity,
        fact: `所属势力=${cleanLine(role.faction)}`,
        source: `roleCard.${category}`,
        priority: 'hard'
      });
    }
    if (role.roleType) {
      constraints.push({
        type: 'character_fact',
        entity,
        fact: `身份定位=${cleanLine(role.roleType)}`,
        source: `roleCard.${category}`,
        priority: 'soft'
      });
    }
    const recent = cleanLine(role.customFields?.recentStatus || role.plotProgress || '');
    if (recent) {
      constraints.push({
        type: 'character_fact',
        entity,
        fact: `近况=${recent.slice(0, 80)}`,
        source: `roleCard.${category}`,
        priority: 'soft'
      });
    }
  }

  // 持久记忆层：仅注入用户已确认的 learned facts
  const learned = loadLearnedConstraintsFromBook(book);
  for (const mem of learned.slice(0, 20)) {
    const fact = cleanLine(mem.fact);
    if (!fact) continue;
    const entity = cleanLine(mem.entity);
    if (entity) {
      constraints.push({
        type: 'character_fact',
        entity,
        fact,
        source: `agentMemory.${mem.source || mem.id}`,
        priority: 'hard'
      });
    } else {
      constraints.push({
        type: 'continuity_rule',
        description: fact,
        source: `agentMemory.${mem.source || mem.id}`,
        priority: 'hard'
      });
    }
  }

  return uniqConstraints(constraints).slice(0, 36);
}

export function formatHardConstraintsBlock(constraints: AgentConstraint[]): string {
  const hard = constraints.filter((c) => c.priority === 'hard');
  const soft = constraints.filter((c) => c.priority === 'soft');
  const lines: string[] = ['HARD CONSTRAINTS（不可违反）:'];

  if (!hard.length && !soft.length) {
    lines.push('- (none extracted)');
    return lines.join('\n');
  }

  for (const c of hard) {
    if (c.type === 'character_fact') {
      lines.push(`- 角色「${c.entity}」${c.fact}（来源：${c.source}）`);
    } else if (c.type === 'forbidden_move') {
      lines.push(`- 禁止：${c.description}（来源：${c.source}）`);
    } else if (c.type === 'must_include') {
      lines.push(`- 必须包含：${c.description}（来源：${c.source}）`);
    } else {
      lines.push(`- 连贯性：${c.description}（来源：${c.source}）`);
    }
  }

  if (soft.length) {
    lines.push('SOFT CONSTRAINTS - prefer to keep:');
    for (const c of soft.slice(0, 10)) {
      if (c.type === 'character_fact') {
        lines.push(`- 角色「${c.entity}」${c.fact}（来源：${c.source}）`);
      } else if (c.type === 'must_include') {
        lines.push(`- 尽量包含：${c.description}（来源：${c.source}）`);
      } else if (c.type === 'continuity_rule') {
        lines.push(`- 连贯提示：${c.description}（来源：${c.source}）`);
      } else {
        lines.push(`- ${'description' in c ? c.description : ''}（来源：${c.source}）`);
      }
    }
  }

  return lines.join('\n');
}

export function buildReviewPrompt(input: {
  taskSheet: AgentTaskSheet;
  constraints: AgentConstraint[];
  draft: string;
  chapterTitle?: string;
  book?: Book;
}): ChatMessagePayload[] {
  const { taskSheet, constraints, draft, chapterTitle, book } = input;
  const constraintBlock = formatHardConstraintsBlock(constraints);
  const reviewSkill = loadReviewSkill(taskSheet.primaryGenre);
  const skillChecklist = formatSkillChecklistForPrompt(reviewSkill);
  const adaptiveBlock = formatAdaptiveChecklist(readAdaptiveReviewState(book));

  const system = [
    withBaseProse('你是严格的网文连贯性审查员，不是捧场编辑。'),
    '只按清单审查 DRAFT，不要重写正文，不要空泛夸文笔。',
    '同模型自审容易护短：必须用“证据 + 清单项”对抗护短。',
    '只返回一个 JSON 对象。不要 Markdown 代码块，不要 JSON 外的解释。',
    'Schema：',
    '{"pass":boolean,"summary":"string","issues":[{"id":"string","severity":"hard|soft","dimension":"character|continuity|forbidden|beat|padding|other","evidence":"原文摘录或具体缺失","fixInstruction":"如何修改"}],"suggestedMemoryUpdate":[{"entity":"可选","fact":"string","reason":"string"}]}',
    '规则：',
    '- 只有不存在任何 hard issue 时，pass 才能为 true；',
    '- 仅有 soft issue 时 pass 仍可为 true；',
    '- 每个 hard 失败都必须给出证据（正文摘录或明确缺失项）；',
    '- issues 控制在 0-6 条，要具体可执行；',
    '- suggestedMemoryUpdate 可选，仅用于事实类连贯信息（将进入待确认记忆），不写文采评价。'
  ].join('\n');

  const baseChecklist = [
    '通用审查清单（无证据不得判 fail）：',
    '1) 角色事实：姓名/别名/境界/势力是否与 HARD CONSTRAINTS 冲突；',
    '2) 禁止项：是否触碰 forbidden；',
    '3) 必含节拍：required/must_include 是否缺失；',
    '4) 连贯性：是否与已给 continuity 规则明显矛盾或跳戏；',
    '5) 注水：空喊、复读、无信息段落；',
    '6) 指令忠实：是否忽略用户明确的必须/禁止要求。'
  ].join('\n');
    const checklist = [baseChecklist, skillChecklist, adaptiveBlock].filter(Boolean).join('\n\n');

const user = [
    chapterTitle ? `章节：${chapterTitle}` : '',
    `用户指令：${taskSheet.userInstruction || '（无）'}`,
    `剧情意图：${taskSheet.plotIntent || '（无）'}`,
    '',
    constraintBlock,
    '',
    checklist,
    '',
    '--- DRAFT START ---',
    draft,
    '--- DRAFT END ---'
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

export function buildQuickReviewPrompt(input: {
  constraints: AgentConstraint[];
  draft: string;
  previousHardIssues: ReviewIssue[];
}): ChatMessagePayload[] {
  const { constraints, draft, previousHardIssues } = input;
  const system = [
    withBaseProse('你是修订稿的严格复核员。'),
    '只检查：1) 此前 HARD 问题是否已修复；2) 是否引入新的 HARD 违规。',
    '只返回与完整审查相同 schema 的 JSON。',
    '仅当不存在 hard issue 时 pass=true。'
  ].join('\n');

  const prev = previousHardIssues.length
    ? previousHardIssues.map((i, idx) => `${idx + 1}. [${i.dimension}] ${i.fixInstruction} | 证据: ${i.evidence}`).join('\n')
    : '（无）';

  const user = [
    formatHardConstraintsBlock(constraints),
    '',
    '需要复核的 HARD 问题：',
    prev,
    '',
    '--- REVISED DRAFT START ---',
    draft,
    '--- REVISED DRAFT END ---'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

export function buildRevisionPrompt(input: {
  taskSheet: AgentTaskSheet;
  constraints: AgentConstraint[];
  draft: string;
  issues: ReviewIssue[];
  chapterTitle?: string;
}): ChatMessagePayload[] {
  const { taskSheet, constraints, draft, issues, chapterTitle } = input;
  const hardIssues = issues.filter((i) => i.severity === 'hard');
  const softIssues = issues.filter((i) => i.severity === 'soft');

  const system = [
    withBaseProse('你是谨慎的网文修订写手。'),
    '在保留有效剧情推进的前提下，按问题列表修订草稿。',
    '保持与原文相同语言（通常是中文网文正文）。',
    '不要解释，不要输出标题/分析，只输出修订后的正文。',
    '不得违反 HARD CONSTRAINTS。',
    '优先做最小必要修改；仅当 hard 问题要求时才大段重写。'
  ].join('\n');

  const issueLines = [
    '必须修复的 HARD 问题：',
    ...(hardIssues.length
      ? hardIssues.map((i, idx) => `${idx + 1}. (${i.dimension}) ${i.fixInstruction}\n   证据: ${i.evidence}`)
      : ['- 无']),
    '可选优化的 SOFT 问题：',
    ...(softIssues.length
      ? softIssues.map((i, idx) => `${idx + 1}. (${i.dimension}) ${i.fixInstruction}`)
      : ['- 无'])
  ].join('\n');

  const user = [
    chapterTitle ? `章节：${chapterTitle}` : '',
    `用户指令：${taskSheet.userInstruction || '（无）'}`,
    `剧情意图：${taskSheet.plotIntent || '（无）'}`,
    '',
    formatHardConstraintsBlock(constraints),
    '',
    issueLines,
    '',
    '--- ORIGINAL DRAFT START ---',
    draft,
    '--- ORIGINAL DRAFT END ---',
    '',
    '只返回修订后的小说正文。'
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function extractJsonObject(raw: string): unknown | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* continue */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeIssue(raw: any, index: number): ReviewIssue | null {
  if (!raw || typeof raw !== 'object') return null;
  const evidence = cleanLine(raw.evidence || raw.quote || '');
  const fixInstruction = cleanLine(raw.fixInstruction || raw.fix || raw.suggestion || '');
  if (!evidence && !fixInstruction) return null;
  const severityRaw = cleanLine(raw.severity || raw.level || 'hard').toLowerCase();
  const severity: ReviewIssueSeverity = severityRaw === 'soft' ? 'soft' : 'hard';
  const dimRaw = cleanLine(raw.dimension || raw.type || 'other').toLowerCase();
  const dimension: ReviewIssue['dimension'] =
    dimRaw.includes('char') || dimRaw.includes('角色')
      ? 'character'
      : dimRaw.includes('contin') || dimRaw.includes('连贯')
        ? 'continuity'
        : dimRaw.includes('forbid') || dimRaw.includes('禁止')
          ? 'forbidden'
          : dimRaw.includes('beat') || dimRaw.includes('节拍')
            ? 'beat'
            : dimRaw.includes('pad') || dimRaw.includes('空话') || dimRaw.includes('重复')
              ? 'padding'
              : 'other';
  return {
    id: cleanLine(raw.id) || `issue_${index + 1}`,
    severity,
    dimension,
    evidence: evidence || '(no evidence provided)',
    fixInstruction: fixInstruction || '请根据证据修正对应问题。'
  };
}

/**
 * 解析模型 Review JSON。解析失败时保守处理：不自动判定通过。
 */
export function parseReviewResult(raw: string): ReviewResult {
  const rawText = String(raw || '');
  const parsed = extractJsonObject(rawText) as any;
  if (!parsed || typeof parsed !== 'object') {
    return {
      pass: false,
      issues: [
        {
          id: 'parse_error',
          severity: 'hard',
          dimension: 'other',
          evidence: rawText.slice(0, 180) || '(empty review output)',
          fixInstruction: 'Review 输出无法解析为 JSON，请保守重写并严格遵守硬约束。'
        }
      ],
      summary: 'review_parse_failed',
      rawText
    };
  }

  const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
    .map((item: any, index: number) => normalizeIssue(item, index))
    .filter(Boolean) as ReviewIssue[];

  const hardCount = issues.filter((i) => i.severity === 'hard').length;
  const passFlag = typeof parsed.pass === 'boolean' ? parsed.pass : hardCount === 0;
  // 硬规则：只要存在 hard issue，强制 fail
  const pass = passFlag && hardCount === 0;

  const suggestedMemoryUpdate = Array.isArray(parsed.suggestedMemoryUpdate)
    ? parsed.suggestedMemoryUpdate
        .map((item: any) => ({
          entity: cleanLine(item?.entity) || undefined,
          fact: cleanLine(item?.fact),
          reason: cleanLine(item?.reason)
        }))
        .filter((item: { fact: string }) => Boolean(item.fact))
        .slice(0, 8)
    : undefined;

  return {
    pass,
    issues,
    summary: cleanLine(parsed.summary) || (pass ? 'pass' : `fail:${hardCount}_hard`),
    rawText,
    suggestedMemoryUpdate
  };
}

export function hasHardIssues(result: ReviewResult): boolean {
  return result.issues.some((i) => i.severity === 'hard');
}
