// 模块说明：Agent 持久记忆层（book.json.agentMemory）纯数据拼装。
// 设计参考：OpenViking 分层 + cognee 事实落库。
// 维护边界：不调用 useBookStore；落库请用 agentMemoryStore.ts。

import type { AgentMemoryEntry, Book } from '../types';

function nowIso(): string {
  return new Date().toISOString();
}

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeId(prefix = 'amem'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 从 Book 对象读取记忆（纯函数） */
export function readAgentMemoryFromBook(book: Book | null | undefined): AgentMemoryEntry[] {
  if (!book || !Array.isArray(book.agentMemory)) return [];
  return book.agentMemory.filter((e) => e && clean(e.fact));
}

/** 从 Book 读取已确认记忆（纯函数，约束构建推荐路径） */
export function loadLearnedConstraintsFromBook(book: Book | null | undefined): AgentMemoryEntry[] {
  return readAgentMemoryFromBook(book).filter((e) => e.confirmed);
}

/** 待确认建议（纯函数） */
export function loadPendingMemorySuggestionsFromBook(
  book: Book | null | undefined
): AgentMemoryEntry[] {
  return readAgentMemoryFromBook(book).filter((e) => !e.confirmed);
}

/**
 * 合并单条记忆到列表（纯函数）。
 * - 同 fact 去重更新
 * - 上限 200
 */
export function mergeLearnedConstraint(
  existing: AgentMemoryEntry[] | null | undefined,
  entry: Partial<AgentMemoryEntry> & { fact: string }
): { nextList: AgentMemoryEntry[]; entry: AgentMemoryEntry | null } {
  const fact = clean(entry.fact);
  if (!fact) return { nextList: Array.isArray(existing) ? [...existing] : [], entry: null };

  const list = Array.isArray(existing) ? [...existing] : [];
  const dup = list.find((e) => clean(e.fact) === fact);
  const nextEntry: AgentMemoryEntry = dup
    ? {
        ...dup,
        source: clean(entry.source) || dup.source,
        entity: clean(entry.entity) || dup.entity,
        reason: clean(entry.reason) || dup.reason,
        confirmed: typeof entry.confirmed === 'boolean' ? entry.confirmed : dup.confirmed,
        lastUsedAt: nowIso()
      }
    : {
        id: clean(entry.id) || makeId(),
        fact,
        source: clean(entry.source) || 'agent.learn',
        confirmed: Boolean(entry.confirmed),
        createdAt: clean(entry.createdAt) || nowIso(),
        lastUsedAt: nowIso(),
        entity: clean(entry.entity) || undefined,
        reason: clean(entry.reason) || undefined
      };

  const nextList = dup
    ? list.map((e) => (e.id === dup.id ? nextEntry : e))
    : [...list, nextEntry].slice(-200);

  return { nextList, entry: nextEntry };
}

/** 批量合并 suggestedMemoryUpdate（默认未确认） */
export function mergeSuggestedMemoryUpdates(
  existing: AgentMemoryEntry[] | null | undefined,
  suggestions: Array<{ entity?: string; fact: string; reason?: string; source?: string }>
): { nextList: AgentMemoryEntry[]; saved: AgentMemoryEntry[] } {
  let nextList = Array.isArray(existing) ? [...existing] : [];
  const saved: AgentMemoryEntry[] = [];
  for (const s of suggestions || []) {
    const fact = clean(s.fact);
    if (!fact) continue;
    const merged = mergeLearnedConstraint(nextList, {
      fact,
      entity: s.entity,
      reason: s.reason,
      source: s.source || 'review.suggestedMemoryUpdate',
      confirmed: false
    });
    nextList = merged.nextList;
    if (merged.entry) saved.push(merged.entry);
  }
  return { nextList, saved };
}

/** 确认一条记忆（纯函数，返回新列表） */
export function applyConfirmMemoryUpdate(
  existing: AgentMemoryEntry[] | null | undefined,
  entryId: string
): AgentMemoryEntry[] | null {
  const list = Array.isArray(existing) ? existing : [];
  if (!entryId || !list.some((e) => e.id === entryId)) return null;
  return list.map((e) => (e.id === entryId ? { ...e, confirmed: true, lastUsedAt: nowIso() } : e));
}

/** 拒绝/删除一条记忆（纯函数） */
export function applyRejectMemoryUpdate(
  existing: AgentMemoryEntry[] | null | undefined,
  entryId: string
): AgentMemoryEntry[] | null {
  const list = Array.isArray(existing) ? existing : [];
  if (!entryId || !list.some((e) => e.id === entryId)) return null;
  return list.filter((e) => e.id !== entryId);
}

/** 标记使用（纯函数） */
export function applyTouchMemoryUsage(
  existing: AgentMemoryEntry[] | null | undefined,
  entryIds: string[]
): AgentMemoryEntry[] | null {
  if (!entryIds.length) return null;
  const list = Array.isArray(existing) ? existing : [];
  const idSet = new Set(entryIds);
  let changed = false;
  const next = list.map((e) => {
    if (!idSet.has(e.id)) return e;
    changed = true;
    return { ...e, lastUsedAt: nowIso() };
  });
  return changed ? next : null;
}

/** 已确认记忆 → 约束文本行 */
export function learnedMemoryToConstraintLines(entries: AgentMemoryEntry[]): string[] {
  return entries
    .filter((e) => e.confirmed && clean(e.fact))
    .map((e) => {
      const ent = clean(e.entity);
      const fact = clean(e.fact);
      return ent
        ? `角色「${ent}」${fact}（来源：agentMemory.${e.source}）`
        : `${fact}（来源：agentMemory.${e.source}）`;
    });
}

/** @deprecated 使用 loadLearnedConstraintsFromBook(book) */
export function loadLearnedConstraints(book: Book | null | undefined): AgentMemoryEntry[] {
  return loadLearnedConstraintsFromBook(book);
}
