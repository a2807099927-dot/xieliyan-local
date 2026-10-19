import type { Book, Chapter } from '../types';
import { electronAPI } from '../utils/electron';
import { withBaseProse } from '../utils/promptStore';
import { buildAgentContext } from './buildAgentContext';
import { agentToolRegistry } from './tools/registry';
import { registerReadOnlyAgentTools } from './tools/readOnlyTools';
import { registerProductionAgentTools } from './tools/productionTools';
import { registerCreativeAgentTools } from './tools/creativeTools';
import type {
  AgentArtifact,
  AgentEvidence,
  AgentToolRun,
  ReadOnlyAgentLoopResult,
  ReadOnlyAgentToolName
} from './tools/types';
import { extractJsonObject, selectEvidence, trimToolPayload } from './loopUtils';

interface ToolCallDecision {
 type: 'tool_call';
 tool: ReadOnlyAgentToolName;
 arguments: Record<string, unknown>;
 reason?: string;
}

interface FinalDecision {
 type: 'final';
 answer: string;
 evidenceIds?: string[];
}

type AgentDecision = ToolCallDecision | FinalDecision;

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export type AgentWorkflow = 'general' | 'chapter_close' | 'continuity' | 'foreshadow';

export interface RunReadOnlyAgentLoopOptions {
 book: Book;
 currentChapter: Chapter;
 query: string;
 workflow?: AgentWorkflow;
 conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
 onToolRuns?: (runs: AgentToolRun[]) => void;
}

const MAX_TOOL_STEPS = 5;
const MAX_TOOL_RESULT_CHARS = 3_500;
const VALID_TOOLS = new Set<ReadOnlyAgentToolName>([
  'search_book',
  'search_roles',
  'search_archive',
  'find_chapter',
  'read_chapter',
  'inspect_organization',
  'get_role_update_plans',
  'list_recent_context',
  'prepare_outline_write',
  'find_empty_chapter'
]);

const WORKFLOW_TOOLS: Record<AgentWorkflow, ReadOnlyAgentToolName[]> = {
  general: Array.from(VALID_TOOLS),
  chapter_close: ['inspect_organization', 'get_role_update_plans', 'search_archive', 'find_chapter', 'read_chapter', 'list_recent_context'],
  continuity: ['search_roles', 'search_archive', 'search_book', 'find_chapter', 'read_chapter', 'list_recent_context'],
  foreshadow: ['search_archive', 'search_book', 'find_chapter', 'read_chapter', 'list_recent_context']
};
const WORKFLOW_INSTRUCTION: Record<AgentWorkflow, string> = {
 general: '按用户问题自由选择工具。',
 chapter_close: '这是章节收尾检查：先检查整理完整度和当前章角色更新计划；本阶段只预览，不直接修改作品。',
 continuity: '这是角色与剧情一致性检查：优先对照角色卡、剧情档案，再读取正文核实冲突。',
 foreshadow: '这是伏笔追踪：优先查询 foreshadow 档案，再定位首次出现、推进和回收章节。'
};

function parseDecision(raw: string): AgentDecision | null {
  const value = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!value) {
    // 模型直接吐自然语言答案时，当作 final（避免整轮白死）
    const plain = String(raw || '')
      .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim();
    if (plain.length >= 20 && !/^\s*\{/.test(plain) && !/"type"\s*:/.test(plain)) {
      return { type: 'final', answer: plain, evidenceIds: [] };
    }
    return null;
  }
  try {
    // 兼容模型偶尔把 final 写成 answer 字段嵌套
    if (value.type === 'final' || value.action === 'answer' || typeof value.answer === 'string') {
      const answer =
        typeof value.answer === 'string'
          ? value.answer
          : typeof value.content === 'string'
            ? value.content
            : '';
      if (answer.trim()) {
        return {
          type: 'final',
          answer: answer.trim(),
          evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.map(String) : []
        };
      }
    }
    const toolName = typeof value.tool === 'string'
      ? value.tool
      : typeof value.name === 'string'
        ? value.name
        : '';
    let argsRaw = value.arguments ?? value.args ?? value.input;
    // arguments 有时是 JSON 字符串
    if (typeof argsRaw === 'string') {
      try {
        argsRaw = JSON.parse(argsRaw);
      } catch {
        argsRaw = { query: argsRaw };
      }
    }
    // 缺 arguments 时用其余字段凑
    if (!argsRaw || typeof argsRaw !== 'object' || Array.isArray(argsRaw)) {
      const { type: _t, tool: _tool, name: _n, reason: _r, thought: _th, ...rest } = value;
      if (Object.keys(rest).length) argsRaw = rest;
      else argsRaw = {};
    }
    if (
      (value.type === 'tool_call' || value.type === 'tool' || toolName)
      && toolName
      && VALID_TOOLS.has(toolName as ReadOnlyAgentToolName)
    ) {
      return {
        type: 'tool_call',
        tool: toolName as ReadOnlyAgentToolName,
        arguments: argsRaw as Record<string, unknown>,
        reason: typeof value.reason === 'string'
          ? value.reason
          : typeof value.thought === 'string'
            ? value.thought
            : undefined
      };
    }
    return null;
  } catch {
    return null;
  }
}

function compactContextForPrompt(context: ReturnType<typeof buildAgentContext>): string {
  const compact = {
    book: context.book,
    currentChapter: context.currentChapter,
    relevantCharacters: (context.relevantCharacters || []).slice(0, 8),
    relevantRecords: (context.relevantRecords || []).slice(0, 10),
    relevantChapterSummaries: (context.relevantChapterSummaries || []).slice(0, 8)
  };
  const text = JSON.stringify(compact);
  if (text.length <= 2800) return text;
  return `${text.slice(0, 2800)}...<上下文已截断>`;
}

function estimateTokensFromText(text: string): number {
  // 中文约 1.5 字/token，英文约 4 字/token；给保守估算
  const s = String(text || '');
  if (!s) return 0;
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = Math.max(0, s.length - cjk);
  return Math.ceil(cjk / 1.5 + other / 4);
}

function extractUsageTokens(usage: unknown): { total: number; prompt?: number; completion?: number; source: 'api' | 'estimate' | 'none' } {
  const u = (usage || {}) as Record<string, unknown>;
  const prompt = Number(u.promptTokens ?? u.prompt_tokens ?? 0) || 0;
  const completion = Number(u.completionTokens ?? u.completion_tokens ?? 0) || 0;
  const total = Number(u.totalTokens ?? u.total_tokens ?? 0) || (prompt + completion) || 0;
  if (total > 0) return { total, prompt: prompt || undefined, completion: completion || undefined, source: 'api' };
  return { total: 0, source: 'none' };
}

function buildSystemPrompt(book: Book, currentChapter: Chapter, query: string, workflow: AgentWorkflow): string {
 const allowed = new Set(WORKFLOW_TOOLS[workflow]);
 const tools = agentToolRegistry
  .describeForModel({ allowWrites: false })
  .filter((tool) => allowed.has(tool.name as ReadOnlyAgentToolName));
 const context = buildAgentContext(book, query, currentChapter.id);
 const currentPlain = String(currentChapter.content || '').replace(/<[^>]+>/g, '').trim();
 const currentIsEmpty = currentPlain.length < 20;
 return withBaseProse(`你是写梨眼的只读查证子模块。仅在需要「证据/出处/是否出现过/矛盾核实」时工作。讨论大纲或写作请由上层路由处理，不要把讨论当成查证。优先 list_recent_context，不要一上来 search_book 扫全书。

当前预设工作流：${workflow}
${WORKFLOW_INSTRUCTION[workflow]}

工作规则：
1. 先判断需要什么证据，再选择一个工具。
2. 工具结果会返回给你；证据不足时继续调用其他工具或换关键词。
3. 全文搜索只负责定位，涉及原因、动机和细节时应继续读取相关章节原文。
4. 不得捏造正文、章节或档案。没有找到就明确说明。
5. 每次只能调用一个工具。最多调用 ${MAX_TOOL_STEPS} 次。
6. 工具返回的 evidence 带有 id。最终回答只能引用实际返回的 evidence id。
7. 只能输出一个 JSON 对象，禁止 Markdown 代码块和额外说明。
8. 当前章节可能是空白新章。空白不是错误，而是待写章节。
9. 若用户问“下一章/下章/接下来写什么/具体流程”，优先基于当前进度、上一章内容和已整理记忆推演，不要把空白下一章当成“缺少内容的失败”。
10. 不要因为下一章空白就调用 inspect_organization 做全书整理体检，除非用户明确要求“整理体检/检查整理完整度”。
11. 当前章节「${currentChapter.title}」${currentIsEmpty ? '目前为空（待写）' : '已有正文'}。

调用工具：
{"type":"tool_call","tool":"search_book","arguments":{"queries":["关键词"]},"reason":"为什么先查这个"}

完成回答：
{"type":"final","answer":"基于证据的回答","evidenceIds":["证据ID"]}

可用工具：
${JSON.stringify(tools)}

作品事实地图（精简）：
 ${compactContextForPrompt(context)}`);
}


async function callPlanner(
 messages: Message[],
 book: Book,
 currentChapter: Chapter,
 maxTokens: number
): Promise<{ text: string; tokens: number; source: 'api' | 'estimate' | 'none' }> {
 const response = await electronAPI.ai.chat({
 stream: false,
 bookId: book.id,
 chapterId: currentChapter.id,
 disableRag: true,
 disableStyle: true,
 maxTokens,
 senderId: 'agent-read-loop',
 messages
 });
 const text = String(response?.text || '').trim();
 if (!text) throw new Error('Agent 规划器返回为空');
 const usage = extractUsageTokens(response?.usage);
 if (usage.total > 0) return { text, tokens: usage.total, source: 'api' };
 // API 没回 usage 时，用输入+输出做保守估算，并标记为 estimate
 const inputChars = messages.reduce((sum, m) => sum + String(m.content || '').length, 0);
 const estimated = estimateTokensFromText(`${'x'.repeat(inputChars)}${text}`);
 return { text, tokens: estimated, source: estimated > 0 ? 'estimate' : 'none' };
}


function isRawToolPayload(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^\s*\{[\s\S]*"type"\s*:\s*"tool_call"/.test(t)) return true;
  if (/^\s*\{[\s\S]*"tool"\s*:\s*"\w+"/.test(t) && /"arguments"\s*:/.test(t)) return true;
  return false;
}

function humanizeLoopAnswer(
  raw: string,
  evidenceMap: Map<string, AgentEvidence>,
  toolRuns: AgentToolRun[]
): string {
  const cleaned = String(raw || '')
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .trim();
  if (cleaned && !isRawToolPayload(cleaned)) return cleaned;

  const evidence = Array.from(evidenceMap.values());
  if (evidence.length > 0) {
    const lines = evidence.slice(0, 6).map((e, i) => {
      const anyE = e as any;
      const title = anyE.chapterTitle || anyE.source || `证据${i + 1}`;
      const snip = String(anyE.snippet || anyE.text || anyE.summary || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      return snip ? `${i + 1}. 【${title}】${snip}` : `${i + 1}. 【${title}】`;
    });
    return [
      '我已查到一些相关线索，但刚才没整理成完整回复。先把要点列在这里：',
      '',
      lines.join('\n'),
      '',
      '你可以直接说「按这个方向写细纲/正文」，我继续。'
    ].join('\n');
  }
  if (toolRuns.length > 0) {
    const tools = toolRuns.map((r) => r.tool).filter(Boolean);
    const uniq = Array.from(new Set(tools));
    return `已调用工具（${uniq.join('、') || '本地检索'}），但模型没有给出可读结论。请换个问法，或直接说你想讨论大纲 / 写正文。`;
  }
  return '这一轮没有拿到足够证据，暂时没法把回答整理得可靠。你可以换个问法，或明确说要我查哪部分前文 / 角色 / 设定。';
}

export async function runReadOnlyAgentLoop(
 options: RunReadOnlyAgentLoopOptions
): Promise<ReadOnlyAgentLoopResult> {
 registerReadOnlyAgentTools();
 registerProductionAgentTools();
 registerCreativeAgentTools();
 const { book, currentChapter, query, onToolRuns } = options;
 const workflow = options.workflow || 'general';
 const messages: Message[] = [
 { role: 'system', content: buildSystemPrompt(book, currentChapter, query, workflow) },
 ...(options.conversation || []).slice(-6),
 { role: 'user', content: query }
 ];
 const toolRuns: AgentToolRun[] = [];
 const evidenceMap = new Map<string, AgentEvidence>();
 const artifacts: AgentArtifact[] = [];
 const callCounts = new Map<string, number>();
 let totalTokens = 0;
 let tokenSource: 'api' | 'estimate' | 'none' = 'none';
 let formatRetries = 0;

 for (let step = 1; step <= MAX_TOOL_STEPS; step += 1) {
 const planned = await callPlanner(messages, book, currentChapter, 900);
 totalTokens += planned.tokens;
 if (planned.source === 'api') tokenSource = 'api';
 else if (planned.source === 'estimate' && tokenSource !== 'api') tokenSource = 'estimate';
 const decision = parseDecision(planned.text);
 if (!decision) {
 formatRetries += 1;
 // 已有证据时：把这段当最终回答，别整轮报死
 if (formatRetries > 2) {
  const fallback = String(planned.text || '')
   .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
   .trim();
  if (evidenceMap.size > 0 || artifacts.length > 0 || toolRuns.length > 0 || fallback.length >= 20) {
   return {
    answer: humanizeLoopAnswer(fallback, evidenceMap, toolRuns),
    evidence: Array.from(evidenceMap.values()),
    artifacts,
    toolRuns,
    totalTokens,
    tokenSource
   };
  }
  throw new Error('Agent 连续返回了无法解析的工具指令');
 }
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({
  role: 'user',
  content: '你的输出不是有效的规定 JSON。请只输出一个 JSON 对象，不要 Markdown，不要解释。格式只能是：{"type":"tool_call","tool":"search_roles","arguments":{"query":"林雪"},"reason":"..."} 或 {"type":"final","answer":"...","evidenceIds":[]}。'
 });
 step -= 1;
 continue;
 }
 formatRetries = 0;

 if (decision.type === 'final') {
 // 作品事实问题至少要实际获得一条本地证据；禁止模型不查证就直接作答。
 if (evidenceMap.size === 0 && artifacts.length === 0) {
 if (toolRuns.length === 0 && step < MAX_TOOL_STEPS) {
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({ role: 'user', content: '你还没有调用任何本地工具，不能直接回答作品事实。请先选择最合适的工具查证。' });
 continue;
 }
 return { answer: '没有在当前正文、角色档案或剧情档案中找到足够证据回答这个问题。', evidence: [], artifacts, toolRuns, totalTokens, tokenSource };
 }
 return {
 answer: humanizeLoopAnswer(decision.answer || '', evidenceMap, toolRuns) || '没有找到足够证据回答这个问题。',
 evidence: selectEvidence(decision.evidenceIds, evidenceMap),
 artifacts,
 toolRuns,
 totalTokens,
 tokenSource
 };
 }

 if (!WORKFLOW_TOOLS[workflow].includes(decision.tool)) {
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({ role: 'user', content: `[TOOL_RESULT]\n${JSON.stringify({ tool: decision.tool, error: `当前 ${workflow} 工作流不允许这个工具，请从系统列出的工具中重新选择。` })}` });
 continue;
 }

 const signature = `${decision.tool}:${JSON.stringify(decision.arguments)}`;
 const repeated = (callCounts.get(signature) || 0) + 1;
 callCounts.set(signature, repeated);
 if (repeated > 1) {
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({ role: 'user', content: `[TOOL_RESULT]\n${JSON.stringify({ tool: decision.tool, error: '完全相同的调用已经执行过，请换关键词、换工具或直接回答。' })}` });
 continue;
 }

 const run: AgentToolRun = {
 id: `tool-${Date.now()}-${step}`,
 step,
 tool: decision.tool,
 reason: decision.reason || '继续收集证据',
 summary: '正在执行…',
 status: 'running'
 };
 toolRuns.push(run);
 onToolRuns?.(toolRuns.map((item) => ({ ...item })));

 try {
 const result = await agentToolRegistry.execute(decision.tool, decision.arguments, { book, currentChapter });
 run.status = 'done';
 run.summary = result.summary;
 for (const evidence of result.evidence) evidenceMap.set(evidence.id, evidence);
 if (result.artifacts?.length) artifacts.push(...result.artifacts);
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({
 role: 'user',
 content: `[TOOL_RESULT]\n${trimToolPayload({
  tool: decision.tool,
  summary: result.summary,
  data: result.data,
  evidence: result.evidence
  }, MAX_TOOL_RESULT_CHARS)}`
 });
 } catch (error) {
 run.status = 'error';
 run.summary = error instanceof Error ? error.message : String(error);
 messages.push({ role: 'assistant', content: planned.text });
 messages.push({ role: 'user', content: `[TOOL_RESULT]\n${JSON.stringify({ tool: decision.tool, error: run.summary })}` });
 }
 onToolRuns?.(toolRuns.map((item) => ({ ...item })));
 }

 messages.push({
 role: 'user',
 content: '已经达到工具调用上限。请停止调用工具，基于已有证据输出 final JSON；证据不足时明确说明，不得编造。'
 });
 const finalResponse = await callPlanner(messages, book, currentChapter, 1400);
 totalTokens += finalResponse.tokens;
 if (finalResponse.source === 'api') tokenSource = 'api';
 else if (finalResponse.source === 'estimate' && tokenSource !== 'api') tokenSource = 'estimate';
 const finalDecision = parseDecision(finalResponse.text);
 if (finalDecision?.type === 'final') {
 return {
 answer: humanizeLoopAnswer(finalDecision.answer || '', evidenceMap, toolRuns) || '没有找到足够证据回答这个问题。',
 evidence: selectEvidence(finalDecision.evidenceIds, evidenceMap),
 artifacts,
 toolRuns,
 totalTokens,
 tokenSource
 };
 }
 // 上限后仍解析失败：有证据就交证据，禁止 tool_call JSON 当答案
 const fallbackText = String(finalResponse.text || '')
  .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
  .trim();
 if (evidenceMap.size > 0 || toolRuns.length > 0 || fallbackText.length >= 20) {
  return {
   answer: humanizeLoopAnswer(fallbackText, evidenceMap, toolRuns),
   evidence: Array.from(evidenceMap.values()),
   artifacts,
   toolRuns,
   totalTokens,
   tokenSource
  };
 }
throw new Error('Agent 达到查询上限后仍未生成有效结论');
}
