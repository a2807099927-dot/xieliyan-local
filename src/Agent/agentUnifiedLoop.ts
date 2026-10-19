// 写梨眼统一 Agent 循环
// 参照 Hermes Agent 的 while 循环模式，用 TypeScript 实现。
// 模型决定是否调工具、调哪个、调几次——不是先分类再执行。

import { agentToolRegistry } from './tools/registry';
import { registerProductionAgentTools } from './tools/productionTools';
import { withBaseProse } from '../utils/promptStore';
import { registerCreativeAgentTools } from './tools/creativeTools';
import { registerReadOnlyAgentTools } from './tools/readOnlyTools';
import { registerWriteAgentTools } from './tools/writeTools';
import { agentSkillRegistry } from './skills/registry';
import { ensureAgentSkillsRegistered } from './skills';
import { registerWebpageAgentTools } from './tools/webpageTools';
import { useConfigStore } from '../store/useConfigStore';
import type { Book, Chapter } from '../types';
import { electronAPI } from '../utils/electron';
import { splitAgentOutput } from './stripAgentOutput';
import type { AgentArtifact } from './tools/types';

// ─── 一次性注册所有工具 ──────────────────────────────────────
let _toolsRegistered = false;
function ensureTools() {
  if (_toolsRegistered) return;
  registerReadOnlyAgentTools();
  registerProductionAgentTools();
  registerCreativeAgentTools();
  try { registerWebpageAgentTools(); } catch { /* ok */ }
  try { registerWriteAgentTools(); } catch { /* ok */ }
  ensureAgentSkillsRegistered();
  _toolsRegistered = true;
}

// ─── 把写梨眼工具转成模型可见的文本 schema ──────────────────
function buildToolSchemaText(options?: { allowWrites?: boolean }): string {
  ensureTools();
  const tools = agentToolRegistry.listForMode({ allowWrites: Boolean(options?.allowWrites) });
  if (!tools.length) return '';

  const lines: string[] = ['## 可用工具', ''];
  for (const tool of tools) {
    const params = tool.inputSchema?.properties
      ? Object.entries(tool.inputSchema.properties as Record<string, { type: string; description: string }>)
          .map(([k, v]) => `  ${k}: ${v.type} — ${v.description}`)
          .join('\n')
      : '  无参数';
    lines.push(`### ${tool.name}`);
    lines.push(`${tool.description}`);
    lines.push(`参数:\n${params}`);
    lines.push(`只读: ${tool.readOnly ? '是' : '否'}`);
    lines.push('');
  }
  return lines.join('\n');
}


// ─── 自修正 / 网页读取工具 ──────────────────────────────────
// 这些工具不在 agentToolRegistry 里，由统一循环直接处理

async function executeSelfTool(name: string, args: Record<string, unknown>): Promise<{ summary: string; data: any }> {
  switch (name) {
    case 'read_url': {
      let url = String(args.url || '').trim();
      if (!url) return { summary: '缺少 url 参数', data: {} };
      if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
        url = url.replace('http://', 'https://');
      }
      if (url.includes('github.com/') && !url.includes('raw.githubusercontent.com')) {
        url = url.replace('github.com/', 'raw.githubusercontent.com/').replace('/blob/', '/');
      }
      try {
        const text = await electronAPI.ai.httpFetch(url);
        if (!text) return { summary: 'HTTP 返回为空', data: { url } };
        return { summary: `已读取（${text.length} 字）`, data: { content: text.slice(0, 8000), url } };
      } catch (e: any) {
        return { summary: `读取失败：${e?.message || String(e)}`, data: { url } };
      }
    }
    case 'web_search': {
      const query = String(args.query || '').trim();
      if (!query) return { summary: '缺少 query 参数', data: {} };
      try {
        const text = await electronAPI.ai.webSearch(query);
        if (!text) return { summary: '搜索无返回', data: { query } };
        return {
          summary: `已搜索「${query}」（${text.length} 字）`,
          data: { content: text.slice(0, 6000), query, source: 'Bing' },
        };
      } catch (e: any) {
        return { summary: `搜索失败：${e?.message || String(e)}`, data: { query } };
      }
    }
    default:
      return { summary: `未知或未授权自修工具：${name}`, data: {} };
  }
}

function buildSelfToolSchemaText() {
  return [
    '## 网页工具',
    '',
    '### read_url',
    '读取网页内容（用于看文档、资料或用户给出的链接）。会自动将 HTTP 升级为 HTTPS，GitHub 链接会自动转 raw 源文件。',
    '参数:',
    '  url: string — 要读取的网址（支持 HTTPS URL）',
    '只读: 是',
    '',
    '### web_search',
    '联网搜索同题材网文（Bing 结果页，无需 API Key）。用于新书模式的同题材研究：先搜「题材+关键词 经典/完本」，再用 read_url 深化。',
    '参数:',
    '  query: string — 搜索词（建议含题材+关键词）',
    '只读: 是',
    '',
    '## 技能工具',
    '',
    '### load_skill',
    '加载技能库中的技能全文（写作方法论 / 题材审查清单 / 设定卡构建 / 题材打法 / 写前复盘）。遇到对应场景必须先加载再执行。',
    '参数:',
    '  id: string — 技能 id：writing / review / story_canon',
    '只读: 是',
    '',
  ].join('\n');
}

// ─── System Prompt（精简，工具走原生 tools 参数）───────────
function buildSystemPrompt(extra?: string, options?: { allowWrites?: boolean }): string {
  return [
    withBaseProse('你是写梨眼的写作 Agent。你直接操作这个写作软件——能读章节、搜角色、查档案、续写正文、读网页。'),
    '',
    '操作软件的方法（必须遵守）：',
    '- 用户提到章节号或"当前章""最新章" → 第一步只调用 find_chapter 拿到章节 ID',
    '- 拿到 ID 后 → 用 read_chapter 读完整章节；评价/分析某章时必须基于 read_chapter 返回的 content，不得只看摘要',
    '- 用户提到角色/设定 → 用 search_roles/search_archive 查',
    '- 用户要给建议/评价 → 先用 list_recent_context 看近章上下文',
    '- 用户给链接 → 用 read_url 读网页',
    '',
    '检索工具分工（必须遵守）：',
    '- search_book：在章节正文里搜精确关键词（人物台词、事件、物品），适合定位"某句/某件事出现在哪"',
    '- search_roles：查结构化角色档案（别名/身份/阵营/能力/剧情进展），适合"某某是什么人"',
    '- search_archive：查剧情档案（事件/关系/伏笔/势力/物品），适合"某某设定/伏笔/关系"',
    '- 用户问剧情合理性、剧情走向、前后矛盾、伏笔、某角色某设定是否存在 → 必须先 search_book 或 search_archive 查证后再答，不要凭印象下结论',
    '- 查不到 → 换更短/不同的关键词再搜一次，或换一个检索工具；仍查不到就明确说"未找到相关记录"，不要编造',
    '',
    '技能库（遇到对应场景必须先 load_skill 加载技能全文再执行）：',
    ...agentSkillRegistry.indexLines().map((line) => `- ${line}`),
    '- 用户要求写长内容/续写/按细纲写 → 先 load_skill("writing") 再写（工具内部会自动跑写前复盘，你不需要手动触发）',
    '- 用户要求评价/自检/找硬伤/质量分析 → 先 load_skill("review") 再按清单逐项检查（这与 write 后自动调用的 review_draft 工具不同：review_draft 是产出后自动自检，load_skill("review") 是用户明确要求人工审查时先加载题材清单）',
    '- 写正文前（续写/按细纲写）→ 先 load_skill("genre_play") 加载题材打法、load_skill("story_canon") 加载本书设定与承接',
    '',
    '如果模型接口不支持原生 tools，你必须用下面的文本格式请求工具：',
    '<tool>{"name":"find_chapter","args":{"query":"当前章"}}</tool>',
    '<tool>{"name":"load_skill","args":{"id":"review"}}</tool>',
    '工具返回后再继续思考；最终回答不要包含 <tool> 标签。',
    '',
    '重要规则：',
    '- 每次只调必要工具，查到就停，不要反复调同一个工具',
    '- 读完章节后，先确认工具结果里的 fullyRead=true 或 content 已覆盖整章，再给出分析；如果只读了片段，必须继续读取剩余部分或说明未读全',
    '- 写正文时，先用 write_chapter_body 生成正文；如拿到正文草稿，最终回答必须保留正文，不要只总结。',
    '- 回答用中文，不要客服套话',
    '',
    buildToolSchemaText({ allowWrites: Boolean(options?.allowWrites) }),
    buildSelfToolSchemaText(),
    extra || '',
  ].join('\n');
}

// ─── 把 agentToolRegistry 转成 OpenAI tools 数组 ───────────
function buildOpenAITools(options?: { allowWrites?: boolean }): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  ensureTools();
  const tools = agentToolRegistry.listForMode({ allowWrites: Boolean(options?.allowWrites) });
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.inputSchema?.properties || {},
        required: t.inputSchema?.required || [],
      },
    },
  }));
}

// 自修工具也加入 tools 数组（它们不在 registry 里）
function buildAllTools(options?: { allowWrites?: boolean }): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  const allowWrites = Boolean(options?.allowWrites);
  return [
    ...buildOpenAITools({ allowWrites }),
    { type: 'function', function: { name: 'read_url', description: '读取网页内容。参数：url（网址）', parameters: { type: 'object', properties: { url: { type: 'string', description: '要读取的网址' } }, required: ['url'] } } },
    { type: 'function', function: { name: 'web_search', description: '联网搜索同题材网文（Bing 结果页），用于同题材研究。参数：query（搜索词，建议含题材+关键词）', parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索词，如「玄幻 穿越 系统 经典 完本」' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'load_skill', description: '加载技能库中的技能全文（写作方法论 / 题材审查清单 / 设定卡构建 / 题材打法）。遇到对应场景必须先加载再执行。参数：id（技能 id：writing / review / story_canon / genre_play）', parameters: { type: 'object', properties: { id: { type: 'string', description: '技能 id：writing / review / story_canon / genre_play' } }, required: ['id'] } } },
  ];
}

// ─── 解析模型响应中的工具调用 ───────────────────────────────
type UnifiedToolCall = { id: string; type?: string; function: { name: string; arguments: string } };
type UnifiedChatMessage = { role: string; content?: string | null; tool_calls?: UnifiedToolCall[]; tool_call_id?: string };

interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  const re = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) calls.push(parsed);
    } catch { /* skip malformed json */ }
  }
  return calls;
}

// ─── 主体：Agent 循环 ────────────────────────────────────────
export interface AgentLoopOptions {
  book: Book;
  chapter: Chapter;
  userMessage: string;
  systemExtra?: string;
  conversation?: Array<{ role: string; content: string }>;
  maxIterations?: number;
  signal?: AbortSignal;
  allowWrites?: boolean;
  onThought?: (text: string, step: number) => void;
  onToolStart?: (name: string, reason: string) => void;
  onToolEnd?: (name: string, summary: string) => void;
}

function compactToolData(data: Record<string, unknown>, limit = 30000): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (typeof value === 'string') {
      out[key] = value.length > limit ? `${value.slice(0, limit)}...<已截断>` : value;
    } else if (typeof value === 'boolean' || typeof value === 'number' || value === null) {
      out[key] = value;
    } else if (Array.isArray(value) || (value && typeof value === 'object')) {
      const serialized = JSON.stringify(value);
      out[key] = serialized.length > limit ? `${serialized.slice(0, limit)}...<已截断>` : value;
    }
  }
  return out;
}

function shouldReturnToolData(name: string): boolean {
  return [
    'read_chapter',
    'find_chapter',
    'search_book',
    'search_roles',
    'search_archive',
    'list_recent_context',
    'build_story_canon',
    'write_chapter_body',
    'review_draft',
    'plan_chapter_outline',
    'formalize_chapter_outline',
    'load_skill'
  ].includes(name);
}

export interface AgentLogEntry {
  ts: number;
  step: number;
  type: 'system' | 'api' | 'tool' | 'result' | 'error';
  detail: string;
}

// ─── 轻量重试（对齐 useAiChat 的可靠性策略）──────────────────
// runAgentLoop 直连 electronAPI.ai.chat，之前没有重试：面板 Agent 遇到
// 429/5xx/网络抖动会直接失败，而编辑器走 useAiChat 会自动重试，
// 同一模块两条入口可靠性不一致。这里补上相同的重试策略。
const CHAT_RETRY_DELAYS_MS = [1000, 2000] as const;

function isRetryableChatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/abort|aborted|cancel/i.test(message)) return false;
  // 主进程报告飞行请求锁时不重试（重试也只会再次被拒）
  if (/REQUEST_IN_PROGRESS|already\s+has\s+request|in\s*progress/i.test(message)) return false;
  return /(429|5\d\d|timeout|timed out|network|fetch failed|net::ERR_|ECONN|ENOTFOUND|EAI_AGAIN|socket)/i.test(message);
}

async function chatWithRetry(
  payload: Parameters<typeof electronAPI.ai.chat>[0]
): Promise<Awaited<ReturnType<typeof electronAPI.ai.chat>>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= CHAT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await electronAPI.ai.chat(payload);
    } catch (error) {
      lastError = error;
      if (!isRetryableChatError(error) || attempt >= CHAT_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, CHAT_RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

export interface AgentLoopResult {
  answer: string;
  toolCalls: number;
  totalTokens: number;
  iterations: number;
  log: AgentLogEntry[];
  draftText?: string;
  outlineDraft?: string;
  artifacts?: AgentArtifact[];
  /** 本次调用的技能类工具汇总（供「存入技能库」按钮使用，非自动弹卡） */
  skillUsage?: AgentSkillUsageSummary;
}

async function runUnifiedToolCall(args: {
  name: string;
  toolArgs: Record<string, unknown>;
  book: Book;
  chapter: Chapter;
  allowWrites: boolean;
}): Promise<{ summary: string; data: Record<string, unknown>; artifacts?: AgentArtifact[] }> {
  const regTool = agentToolRegistry.get(args.name as any);
  if (regTool) {
    const result = await agentToolRegistry.execute(args.name as any, args.toolArgs, {
      book: args.book,
      currentChapter: args.chapter,
      allowWrites: args.allowWrites,
    });
    return {
      summary: String(result.summary || '完成'),
      data: (result.data || {}) as Record<string, unknown>,
      artifacts: result.artifacts,
    };
  }
  if (args.name === 'read_url') {
    const result = await executeSelfTool(args.name, args.toolArgs);
    return { summary: String(result.summary || '完成'), data: (result.data || {}) as Record<string, unknown> };
  }
  if (args.name === 'load_skill') {
    const id = String((args.toolArgs as { id?: unknown })?.id || '').trim();
    const skill = agentSkillRegistry.get(id);
    if (!skill) return { summary: `未知技能：${id}`, data: { ok: false } };
    const content = await skill.load({ book: args.book, chapter: args.chapter, config: useConfigStore.getState().config });
    return { summary: `已加载技能 ${skill.name}`, data: { content, id } };
  }
  return { summary: `未知或未授权工具：${args.name}`, data: { ok: false } };
}

/**
 * 汇总本次调用的技能类工具（供「存入技能库」按钮组装候选；不再自动弹卡）。
 */
function summarizeSkillUsage(
  usages: Array<{ name: string; id?: string }>,
  draftText: string
): { didWrite: boolean; didReview: boolean; loadedSkill: string | null; draftExcerpt: string } {
  const unique = Array.from(new Map(usages.map((u) => [u.name, u])).values());
  const loadedSkill = unique.find((u) => u.name === 'load_skill' && u.id)?.id || null;
  return {
    didWrite: unique.some((u) => u.name === 'write_chapter_body'),
    didReview: unique.some((u) => u.name === 'review_draft'),
    loadedSkill,
    draftExcerpt: draftText ? draftText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '',
  };
}

export interface AgentSkillUsageSummary {
  didWrite: boolean;
  didReview: boolean;
  loadedSkill: string | null;
  draftExcerpt: string;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  ensureTools();
  const maxIter = options.maxIterations || 20;
  const log: AgentLogEntry[] = [];
  const addLog = (type: AgentLogEntry['type'], detail: string) => {
    log.push({ ts: Date.now(), step: log.length + 1, type, detail });
  };
  addLog('system', `开始：userMessage=${options.userMessage.slice(0, 100)}`);
  const messages: UnifiedChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(options.systemExtra, { allowWrites: Boolean(options.allowWrites) }) },
  ];

  // 加载对话历史（最近 12 轮）
  if (options.conversation) {
    for (const turn of options.conversation.slice(-12)) {
      if (turn.role === 'user' || turn.role === 'assistant') {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
  }
  messages.push({ role: 'user', content: options.userMessage });

  let totalTokens = 0;
  let toolCalls = 0;
  let latestDraftText = '';
  let latestOutlineDraft = '';
  const artifacts: AgentArtifact[] = [];
  // 记录本次任务用到的技能类工具（收尾时用于生成用户技能候选，节制：只有成功且用过才生成）
  const skillToolUsages: Array<{ name: string; id?: string }> = [];

  for (let iteration = 0; iteration < maxIter; iteration++) {
    if (options.signal?.aborted) { addLog('error', '用户停止'); return { answer: '已停止。', toolCalls, totalTokens, iterations: iteration + 1, log, draftText: latestDraftText || undefined, outlineDraft: latestOutlineDraft || undefined, artifacts, skillUsage: summarizeSkillUsage(skillToolUsages, latestDraftText) }; }
    // 调 AI（非流，带原生 tools 参数——Hermes 方式）
    const allTools = buildAllTools({ allowWrites: Boolean(options.allowWrites) });
    addLog('api', `第${iteration + 1}轮 API 调用，消息数=${messages.length}，工具数=${allTools.length}`);
    const response = await chatWithRetry({
      messages,
      stream: false,
      tools: allTools,
      tool_choice: 'auto',
      bookId: options.book.id,
      chapterId: options.chapter.id,
      disableRag: true,
      disableStyle: true,
      senderId: 'agent-unified-loop',
    });

    const rawText = String(response?.text || '').trim();
    if (!rawText) { addLog('error', 'API 返回为空'); return { answer: latestDraftText || latestOutlineDraft || 'AI 返回为空，请重试或换个问法。', toolCalls, totalTokens, iterations: iteration + 1, log, draftText: latestDraftText || undefined, outlineDraft: latestOutlineDraft || undefined, artifacts, skillUsage: summarizeSkillUsage(skillToolUsages, latestDraftText) }; }
    totalTokens += response?.usage?.totalTokens || 0;

    // 尝试解析原生 OpenAI tool_calls（如果有）
    const nativeToolCalls = response?.tool_calls;

    if (nativeToolCalls && nativeToolCalls.length > 0) {
      // 追加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: nativeToolCalls,
      });

      for (const tc of nativeToolCalls) {
        toolCalls++;
        const name = String(tc?.function?.name || '');
        addLog('tool', `调用 ${name}（第${toolCalls}次）`);
        let args: Record<string, unknown> = {};
        const rawArgs = tc?.function?.arguments;
        if (typeof rawArgs === 'string') {
          try {
            args = JSON.parse(rawArgs) || {};
          } catch {
            // 模型输出坏 JSON：兜底尝试括号配平，仍失败则空参数（不中断循环）
            const start = rawArgs.indexOf('{');
            const end = rawArgs.lastIndexOf('}');
            if (start >= 0 && end > start) {
              try { args = JSON.parse(rawArgs.slice(start, end + 1)) || {}; } catch { args = {}; }
            }
          }
        } else if (rawArgs && typeof rawArgs === 'object') {
          args = rawArgs as Record<string, unknown>;
        }
        options.onToolStart?.(name, `调用 ${name}`);

        try {
          const result = await runUnifiedToolCall({
            name,
            toolArgs: args,
            book: options.book,
            chapter: options.chapter,
            allowWrites: Boolean(options.allowWrites),
          });
          const summary = String(result?.summary || '完成');
          const data = (result?.data || {}) as Record<string, unknown>;
          if (name === 'load_skill') {
            skillToolUsages.push({ name, id: String((data as { id?: unknown })?.id || '') });
          } else if (name === 'write_chapter_body' || name === 'review_draft') {
            skillToolUsages.push({ name });
          }
          if (typeof data.bodyText === 'string' && data.bodyText.trim()) latestDraftText = data.bodyText.trim();
          if (typeof data.outlineDraft === 'string' && data.outlineDraft.trim()) latestOutlineDraft = data.outlineDraft.trim();
          if (typeof data.formalOutline === 'string' && data.formalOutline.trim()) latestOutlineDraft = data.formalOutline.trim();
          if (Array.isArray(result.artifacts)) artifacts.push(...result.artifacts);
          options.onToolEnd?.(name, summary);
          addLog('result', `${name} → ${summary}`);
          // 创作类工具必须把产物交回模型，否则模型只看见 summary，会丢正文/细纲。
          const toolContent = shouldReturnToolData(name)
            ? JSON.stringify({ summary, data: compactToolData(data, name === 'read_chapter' ? 50000 : 30000) })
            : summary;
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || '',
            content: toolContent,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          addLog('error', `${name} 失败：${errMsg}`);
          options.onToolEnd?.(name, `错误：${errMsg}`);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || '',
            content: JSON.stringify({ error: errMsg }),
          });
        }
      }
      options.onThought?.(`已完成 ${toolCalls} 次工具调用，继续思考…`, iteration + 1);
      continue;
    }

    const textualToolCalls = parseToolCalls(rawText);
    if (textualToolCalls.length > 0) {
      messages.push({ role: 'assistant', content: rawText });
      for (const call of textualToolCalls.slice(0, 3)) {
        toolCalls++;
        const name = String(call.name || '');
        addLog('tool', `文本工具调用 ${name}（第${toolCalls}次）`);
        options.onToolStart?.(name, `调用 ${name}`);
        try {
          const result = await runUnifiedToolCall({
            name,
            toolArgs: call.args || {},
            book: options.book,
            chapter: options.chapter,
            allowWrites: Boolean(options.allowWrites),
          });
          const summary = String(result.summary || '完成');
          const data = (result.data || {}) as Record<string, unknown>;
          if (name === 'load_skill') {
            skillToolUsages.push({ name, id: String((data as { id?: unknown })?.id || '') });
          } else if (name === 'write_chapter_body' || name === 'review_draft') {
            skillToolUsages.push({ name });
          }
          if (typeof data.bodyText === 'string' && data.bodyText.trim()) latestDraftText = data.bodyText.trim();
          if (typeof data.outlineDraft === 'string' && data.outlineDraft.trim()) latestOutlineDraft = data.outlineDraft.trim();
          if (typeof data.formalOutline === 'string' && data.formalOutline.trim()) latestOutlineDraft = data.formalOutline.trim();
          if (Array.isArray(result.artifacts)) artifacts.push(...result.artifacts);
          options.onToolEnd?.(name, summary);
          addLog('result', `${name} → ${summary}`);
          const toolContent = shouldReturnToolData(name)
            ? JSON.stringify({ summary, data: compactToolData(data, name === 'read_chapter' ? 50000 : 30000) })
            : summary;
          messages.push({ role: 'user', content: `[TOOL_RESULT:${name}]\n${toolContent}` });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          addLog('error', `${name} 失败：${errMsg}`);
          options.onToolEnd?.(name, `错误：${errMsg}`);
          messages.push({ role: 'user', content: `[TOOL_RESULT:${name}]\n${JSON.stringify({ error: errMsg })}` });
        }
      }
      options.onThought?.(`已完成 ${toolCalls} 次工具调用，继续思考…`, iteration + 1);
      continue;
    }

    // 无工具调用 → 最终回答
    addLog('result', `最终回答，${toolCalls}次工具调用，${totalTokens} token`);
    const splitOut = splitAgentOutput(rawText);
    // 模型只输出思考/计划（无正文）时不回退原文当回答
    const finalAnswer = splitOut.hasBody ? splitOut.body.trim() : (splitOut.thinking.trim() ? '' : rawText);
    const shouldUseDraft = latestDraftText && (!finalAnswer.trim() || finalAnswer.length < Math.min(300, latestDraftText.length * 0.2));
    const answer = shouldUseDraft ? latestDraftText : finalAnswer;
    const skillUsage = summarizeSkillUsage(skillToolUsages, latestDraftText);
    return {
      answer,
      toolCalls,
      totalTokens,
      iterations: iteration + 1,
      log,
      draftText: latestDraftText || undefined,
      outlineDraft: latestOutlineDraft || undefined,
      artifacts,
      skillUsage
    };
  }

  addLog('error', '达到最大循环次数');
  return {
    answer: latestDraftText || latestOutlineDraft || '任务未完成——工具调用次数已达上限。可能是搜索条件不准确，换个说法试试。',
    toolCalls,
    totalTokens,
    iterations: maxIter,
    log,
    draftText: latestDraftText || undefined,
    outlineDraft: latestOutlineDraft || undefined,
    artifacts,
    skillUsage: summarizeSkillUsage(skillToolUsages, latestDraftText)
  };
}
