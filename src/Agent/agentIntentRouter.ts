// 模块说明：Agent 统一意图路由。
// 模式：discuss（讨论）/ execute（执行）/ verify（查证）。
// 铁律：能讨论先讨论；明确写/改/插入才执行；只有要证据才查证。

export type AgentWorkMode = 'discuss' | 'execute' | 'verify';

export type AgentExecuteKind =
  | 'write_body'
  | 'rewrite'
  | 'plan_outline'
  | 'save_outline'
  | 'save_body'
  | 'create_role'
  | 'org_health'
  | 'role_plans'
  | 'generic';

export interface AgentIntentResult {
  mode: AgentWorkMode;
  /** execute 时的细类；discuss/verify 可为空 */
  executeKind?: AgentExecuteKind;
  /** 给 UI / 日志的短因 */
  reason: string;
  /** 置信：high 可直接走；low 可先短确认（当前先直接走，避免多弹窗） */
  confidence: 'high' | 'medium' | 'low';
}

function norm(input: string): string {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

/**
 * 取消/否定信号：用户说「先别写 / 不要写 / 不写了 / 先别保存」等时，
 * 绝不进入 execute，一律降级为讨论。
 * 设计原则：存疑时偏向不执行——误判为讨论只是多一轮对话；
 * 误判为执行会让 AI 直接改动用户数据，代价完全不同。
 */
const CANCELLATION_RE =
  /(?:先|暂时|现在|这轮|今天)?\s*(?:别|不要|莫|勿|先别|先不|不|不用|暂停|停下|算了|取消|打住|停一下)\s*(?:写|改写|润色|续写|重写|扩写|缩写|代写|生成|插入|动手|执行|保存|入章|落到)[了吧啦]?/;

/**
 * 疑问/征询语气：命中写作信号但同时是问句（"写一章怎么样？"）时，
 * 只讨论不执行。
 */
const QUERY_TONE_RE = /[？?]\s*$|怎么样|如何|要不要|好不好|行不行|可以吗|该不该|应不应该|能不能|能写|适合写|值得写/;

/**
 * 统一意图识别。
 * 顺序：取消信号 → 执行信号 → 查证信号 → 讨论信号 → 默认讨论（不再默认查证）。
 */
export function routeAgentIntent(rawInput: string): AgentIntentResult {
  const input = norm(rawInput);
  if (!input) {
    return { mode: 'discuss', reason: '空输入', confidence: 'low' };
  }

  // ── 0) 取消/否定：最高优先级，命中即不执行 ─────────────────────────
  if (CANCELLATION_RE.test(input)) {
    return { mode: 'discuss', reason: '检测到取消/否定信号，不执行', confidence: 'medium' };
  }

  // ── 1) 执行：明确要动手 ───────────────────────────────────────────
  if (/整理体检|整理状态|哪些章.*(?:未整理|缺档案)/.test(input)) {
    return { mode: 'execute', executeKind: 'org_health', reason: '整理体检', confidence: 'high' };
  }
  if (/角色(?:卡)?更新(?:建议|计划)|待更新角色/.test(input)) {
    return { mode: 'execute', executeKind: 'role_plans', reason: '角色更新计划', confidence: 'high' };
  }
  if (/创造角色|生成角色卡|新建角色/.test(input)) {
    return { mode: 'execute', executeKind: 'create_role', reason: '创造角色', confidence: 'high' };
  }
  if (/写入细纲|落细纲|保存细纲|填入细纲|把.*细纲.*写入|确认.*细纲/.test(input)) {
    return { mode: 'execute', executeKind: 'save_outline', reason: '保存细纲', confidence: 'high' };
  }
  if (/写入(?:空章|新章|当前章)|插入(?:章节|正文)|保存正文|入章|落到编辑器/.test(input)) {
    return { mode: 'execute', executeKind: 'save_body', reason: '正文入章', confidence: 'high' };
  }
  if (
    /续写|接着写|继续写|改写|润色|扩写|缩写|重写|代写|写一段|写一章|写新章|生成正文|只输出正文|试写|试着写|写开头|插入到|写入第|按细纲写|根据细纲写|按这个(?:思路)?写|按这个$|按刚才.*写|就这样写|直接写|开写|开始写|写给我看|写我看看/.test(
      input
    )
  ) {
    // 疑问/征询语气（"写一章怎么样？"）→ 先讨论不执行
    if (QUERY_TONE_RE.test(input)) {
      return { mode: 'discuss', executeKind: 'plan_outline', reason: '疑问/征询语气，先讨论', confidence: 'medium' };
    }
    if (/改写|润色|重写|优化这段|调整语气/.test(input)) {
      return { mode: 'execute', executeKind: 'rewrite', reason: '改写/润色', confidence: 'high' };
    }
    return { mode: 'execute', executeKind: 'write_body', reason: '写作执行', confidence: 'high' };
  }

  // 推演并产出大纲（执行向的规划产出）
  if (/推演下一章|给出.*细纲|生成.*细纲|输出.*细纲|正式细纲|章纲概要/.test(input)) {
    return { mode: 'execute', executeKind: 'plan_outline', reason: '产出大纲', confidence: 'high' };
  }

  // ── 2) 查证：只要证据 ─────────────────────────────────────────────
  // 必须较严，避免「讨论剧情」被当成查证
  const verifyHit =
    /搜索全书|全书搜索|全文搜索|全文检索|查找全书|出现在哪|哪些章节|哪几章出现|第几章出现|前后有没有矛盾|是否冲突|设定冲突|有没有写过|查一下.*出现|核实|出处在哪/.test(
      input
    ) ||
    (/为什么|原因|动机|何时|什么时候|到底有没有/.test(input) &&
      /正文|前文|档案|角色|伏笔|矛盾|冲突/.test(input));

  if (verifyHit) {
    return { mode: 'verify', reason: '需要证据查证', confidence: 'high' };
  }

  // ── 3) 讨论：方案、看法、大纲聊法 ─────────────────────────────────
  if (
    /细纲|章纲|大纲|推演|剧情走向|下一章|先讨论|讨论一下|我们先|换场景|切换到|章节安排|情节安排|怎么展开|怎么写|两线|现实线|游戏线|节奏|人设|冲突|钩子|方案|方向/.test(
      input
    )
  ) {
    return { mode: 'discuss', executeKind: 'plan_outline', reason: '讨论/规划', confidence: 'high' };
  }

  // 纯评价/观感：不要误触发下一章章纲
  if (/这章|本章|你的看法|觉得呢|怎么样|合适吗|评价|观感|写得如何|写得怎么样/.test(input)) {
    return { mode: 'discuss', reason: '讨论当前内容', confidence: 'high' };
  }

  // 短跟进：「然后呢」「继续这个」——偏讨论延续，不查证
  if (/^(然后呢|然后|继续|嗯|好的|可以|就这样|按这个|对|是的|嗯嗯)[.。!！？\s]*$/i.test(input)) {
    return { mode: 'discuss', reason: '短句延续讨论', confidence: 'medium' };
  }

  // ── 4) 默认：讨论，不再默认查证 ───────────────────────────────────
  return { mode: 'discuss', reason: '默认讨论', confidence: 'medium' };
}

/** 兼容旧 AgentMode 三档（逐步淘汰） */
export function intentToLegacyMode(intent: AgentIntentResult): 'query' | 'write' | 'outline' {
  if (intent.mode === 'execute') {
    if (intent.executeKind === 'write_body' || intent.executeKind === 'rewrite' || intent.executeKind === 'save_body') {
      return 'write';
    }
    if (intent.executeKind === 'plan_outline' || intent.executeKind === 'save_outline') {
      return 'outline';
    }
  }
  if (intent.mode === 'discuss') return 'outline';
  return 'query';
}
