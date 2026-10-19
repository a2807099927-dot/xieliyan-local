// Agent 循环公共工具
// 原 agentLoop.ts（只读查证）与 agentDecisionLoop.ts（自主决策）存在多段逐字重复的
// 解析/裁剪/证据选择逻辑。这里统一收敛，避免多处改漏产生行为分叉。
// agentDecisionLoop.ts 已被移除（autonomousMode 死代码，主路径走 agentUnifiedLoop）。

import type { AgentEvidence } from './tools/types';

/** 从模型输出里抽取一个可 JSON.parse 的外层对象。 */
export function extractJsonObject(raw: string): unknown | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?\b[^>]*>[\s\S]*$/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!cleaned) return null;

  // 从每一个 "{" 候选处做括号配平，优先返回可 JSON.parse 的外层对象。
  // 不要用 lastIndexOf('{')：会把 {"type":"tool_call","arguments":{"query":"..."}}
  // 截成内部 arguments 对象，导致解析不到 tool_call。
  for (let start = 0; start < cleaned.length; start += 1) {
    if (cleaned[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/** 序列化并裁剪工具返回，避免把超大 payload 塞回模型上下文。 */
export function trimToolPayload(value: unknown, limit = 12000): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= limit) return serialized;
  return `${serialized.slice(0, limit)}...<结果已截断>`;
}

/** 按 final 声明顺序选取证据；未声明时回退到已收集证据。 */
export function selectEvidence(ids: string[] | undefined, evidenceMap: Map<string, AgentEvidence>): AgentEvidence[] {
  const selected = (ids || [])
    .map((id) => evidenceMap.get(id))
    .filter((item): item is AgentEvidence => Boolean(item));
  if (selected.length) return selected.slice(0, 16);
  return Array.from(evidenceMap.values()).slice(0, 12);
}
