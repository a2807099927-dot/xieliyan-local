// 模块说明：Agent 记忆落库封装（唯一允许触碰 useBookStore 的记忆写入口）。
// 纯数据逻辑在 agentMemory.ts；本文件只做 bookId → updateBook。

import type { AgentMemoryEntry, Book } from '../types';
import { useBookStore } from '../store/useBookStore';
import {
  applyConfirmMemoryUpdate,
  applyRejectMemoryUpdate,
  applyTouchMemoryUsage,
  loadLearnedConstraintsFromBook,
  loadPendingMemorySuggestionsFromBook,
  mergeLearnedConstraint,
  mergeSuggestedMemoryUpdates,
  readAgentMemoryFromBook
} from './agentMemory';

function getBook(bookId: string): Book | null {
  return useBookStore.getState().books.find((b) => b.id === bookId) || null;
}

async function persistAgentMemory(bookId: string, nextList: AgentMemoryEntry[]): Promise<void> {
  // updateBook 接受 Partial<Book>；agentMemory 为 Book 可选字段，走元数据补丁路径
  await useBookStore.getState().updateBook(bookId, {
    agentMemory: nextList,
    updatedAt: new Date().toISOString()
  });
}

/** 兼容旧 API：按 bookId 读取已确认记忆 */
export function loadLearnedConstraints(bookId: string): AgentMemoryEntry[] {
  return loadLearnedConstraintsFromBook(getBook(bookId));
}

export function loadPendingMemorySuggestions(bookId: string): AgentMemoryEntry[] {
  return loadPendingMemorySuggestionsFromBook(getBook(bookId));
}

export async function saveLearnedConstraint(
  bookId: string,
  entry: Partial<AgentMemoryEntry> & { fact: string }
): Promise<AgentMemoryEntry | null> {
  const book = getBook(bookId);
  if (!book) return null;
  const { nextList, entry: saved } = mergeLearnedConstraint(readAgentMemoryFromBook(book), entry);
  if (!saved) return null;
  await persistAgentMemory(bookId, nextList);
  return saved;
}

export async function saveSuggestedMemoryUpdates(
  bookId: string,
  suggestions: Array<{ entity?: string; fact: string; reason?: string; source?: string }>
): Promise<AgentMemoryEntry[]> {
  const book = getBook(bookId);
  if (!book) return [];
  const { nextList, saved } = mergeSuggestedMemoryUpdates(readAgentMemoryFromBook(book), suggestions);
  if (!saved.length) return [];
  await persistAgentMemory(bookId, nextList);
  return saved;
}

export async function confirmMemoryUpdate(bookId: string, entryId: string): Promise<boolean> {
  const book = getBook(bookId);
  if (!book) return false;
  const next = applyConfirmMemoryUpdate(readAgentMemoryFromBook(book), entryId);
  if (!next) return false;
  await persistAgentMemory(bookId, next);
  return true;
}

export async function rejectMemoryUpdate(bookId: string, entryId: string): Promise<boolean> {
  const book = getBook(bookId);
  if (!book) return false;
  const next = applyRejectMemoryUpdate(readAgentMemoryFromBook(book), entryId);
  if (!next) return false;
  await persistAgentMemory(bookId, next);
  return true;
}

export async function touchMemoryUsage(bookId: string, entryIds: string[]): Promise<void> {
  const book = getBook(bookId);
  if (!book) return;
  const next = applyTouchMemoryUsage(readAgentMemoryFromBook(book), entryIds);
  if (!next) return;
  await persistAgentMemory(bookId, next);
}
