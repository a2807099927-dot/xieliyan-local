// 模块说明：新书模式的同题材研究结论 prompt（T4.2）。
// 职责：把 web_search 结果 + 实读章节文本 → 研究结论卡（同类开篇/爽点/套路/本书差异化）。
// 铁律：来源标注强制——引用实读内容或标注「基于训练知识，非实时」，不许无来源断言。

import type { Book } from '../types';
import { withBaseProse } from '../utils/promptStore';
import { extractJsonObject } from './loopUtils';

export interface ResearchFinding {
  openingPattern: string;
  satisfactionPatterns: string[];
  cliches: string[];
  differentiation: string;
  sources: string[];
}

export interface ResearchResult {
  findings: ResearchFinding | null;
  rawText: string;
}

/** 研究结论 prompt：输入搜索结果 + 实读章节文本，输出研究结论卡 */
export function buildResearchPrompt(input: {
  book: Book;
  searchResults: string;
  readTexts: string[];
  coreArchiveBlock?: string;
}): Array<{ role: string; content: string }> {
  const system = withBaseProse(
    '你是网文同题材研究助手。基于【联网搜索结果】与【实读章节文本】，总结同类书的开篇打法、爽点套路与雷区，'
    + ' 并落到本书的差异化。来源标注强制：凡结论必须有依据——引用实读内容，或明确标注「基于训练知识，非实时」。'
    + ' 严禁无来源断言「市场上流行 X」。只返回一个 JSON 对象，不要 Markdown 代码块，不要任何说明文字。'
  );
  const user = [
    `书名：《${input.book.title}》`,
    '',
    input.coreArchiveBlock ? `【本书故事核心档案】\n${input.coreArchiveBlock}` : '',
    '',
    '【联网搜索结果】',
    input.searchResults || '（无搜索结果）',
    '',
    '【实读章节文本】',
    (input.readTexts || []).filter(Boolean).slice(0, 3).map((t, i) => `--- 样本 ${i + 1} ---\n${t.slice(0, 2000)}`).join('\n\n') || '（无）',
    '',
    '请输出研究结论：',
    '- openingPattern：同类书常见的开篇模式（引用实读样本或标注训练知识）',
    '- satisfactionPatterns：高频爽点套路（2-4 条）',
    '- cliches：已被写烂的套路/雷区（2-4 条，本书应避开）',
    '- differentiation：本书的差异化打法（结合故事核心档案，落到本书具体怎么写）',
    '- sources：结论依据来源（实读链接/标题，或「基于训练知识，非实时」）',
    '',
    'JSON schema：{"openingPattern":"","satisfactionPatterns":[""],"cliches":[""],"differentiation":"","sources":[""]}',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function parseResearchResult(raw: string): ResearchResult {
  const rawText = String(raw || '').trim();
  const parsed = extractJsonObject(rawText) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') return { findings: null, rawText };
  const strList = (v: unknown, limit: number) =>
    Array.isArray(v) ? (v as Array<unknown>).map((s) => String(s || '').trim()).filter(Boolean).slice(0, limit) : [];
  const findings: ResearchFinding = {
    openingPattern: String(parsed.openingPattern || '').trim(),
    satisfactionPatterns: strList(parsed.satisfactionPatterns, 4),
    cliches: strList(parsed.cliches, 4),
    differentiation: String(parsed.differentiation || '').trim(),
    sources: strList(parsed.sources, 6),
  };
  if (!findings.openingPattern && !findings.differentiation && !findings.satisfactionPatterns.length) {
    return { findings: null, rawText };
  }
  return { findings, rawText };
}

export function formatResearchResult(findings: ResearchFinding): string {
  const lines = ['【同题材研究结论】'];
  if (findings.openingPattern) lines.push(`开篇模式：${findings.openingPattern}`);
  if (findings.satisfactionPatterns.length) lines.push(`爽点套路：${findings.satisfactionPatterns.join('；')}`);
  if (findings.cliches.length) lines.push(`雷区：${findings.cliches.join('；')}`);
  if (findings.differentiation) lines.push(`本书差异化：${findings.differentiation}`);
  if (findings.sources.length) lines.push(`来源：${findings.sources.join('；')}`);
  return lines.join('\n');
}
