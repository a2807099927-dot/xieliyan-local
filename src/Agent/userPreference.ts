// 模块说明：用户风格偏好纯数据层（book.userStylePreferences）。
// 落库请用 userPreferenceStore.ts。

import type { Book, UserStylePreference } from '../types';
import type { StylePreference } from './styleLearner';
import type { AgentTaskSheet } from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function clean(v: unknown): string {
  return String(v || '').replace(/\s+/g, ' ').trim();
}

function makeId(): string {
  return `usp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function readStylePreferencesFromBook(book: Book | null | undefined): UserStylePreference[] {
  if (!book || !Array.isArray(book.userStylePreferences)) return [];
  return book.userStylePreferences.filter((p) => p && p.type && p.direction);
}

export function loadConfirmedStylePreferences(book: Book | null | undefined): UserStylePreference[] {
  return readStylePreferencesFromBook(book).filter((p) => p.confirmed);
}

export function stylePreferenceFromExtracted(pref: StylePreference, confirmed = false): UserStylePreference {
  return {
    id: makeId(),
    type: pref.type,
    direction: pref.direction,
    evidence: clean(pref.evidence),
    confidence: Math.max(0, Math.min(1, Number(pref.confidence) || 0)),
    confirmed,
    createdAt: nowIso(),
    lastUsedAt: nowIso(),
    label: clean(pref.label) || undefined
  };
}

export function mergeStylePreference(
  existing: UserStylePreference[] | null | undefined,
  pref: UserStylePreference
): UserStylePreference[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const idx = list.findIndex((p) => p.type === pref.type && p.direction === pref.direction);
  if (idx >= 0) {
    const cur = list[idx];
    list[idx] = {
      ...cur,
      ...pref,
      id: cur.id,
      createdAt: cur.createdAt,
      confidence: Math.max(cur.confidence, pref.confidence),
      confirmed: pref.confirmed || cur.confirmed,
      lastUsedAt: nowIso()
    };
    return list.slice(-80);
  }
  return [...list, pref].slice(-80);
}

export function applyConfirmStylePreference(
  existing: UserStylePreference[] | null | undefined,
  id: string
): UserStylePreference[] | null {
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((p) => p.id === id)) return null;
  return list.map((p) => (p.id === id ? { ...p, confirmed: true, lastUsedAt: nowIso() } : p));
}

export function applyRejectStylePreference(
  existing: UserStylePreference[] | null | undefined,
  id: string
): UserStylePreference[] | null {
  const list = Array.isArray(existing) ? existing : [];
  if (!list.some((p) => p.id === id)) return null;
  return list.filter((p) => p.id !== id);
}

/** 将已确认偏好注入 taskSheet.contextHints / forbiddenMoves（不覆盖原有） */
export function applyPreferencesToTaskSheet(
  taskSheet: AgentTaskSheet,
  preferences: UserStylePreference[]
): AgentTaskSheet {
  const confirmed = preferences.filter((p) => p.confirmed);
  if (!confirmed.length) return taskSheet;

  const hints = [...(taskSheet.contextHints || [])];
  const forbidden = [...(taskSheet.forbiddenMoves || [])];

  for (const p of confirmed) {
    const label = p.label || `${p.type}:${p.direction}`;
    const line = `用户风格偏好：${label}（依据：${p.evidence.slice(0, 60)}）`;
    if (p.direction === 'avoid') {
      if (!forbidden.includes(line)) forbidden.push(line);
    } else if (!hints.includes(line)) {
      hints.push(line);
    }
  }

  return {
    ...taskSheet,
    contextHints: hints.slice(0, 24),
    forbiddenMoves: forbidden.slice(0, 24)
  };
}

export function formatStylePreferencesBlock(preferences: UserStylePreference[]): string {
  const confirmed = preferences.filter((p) => p.confirmed);
  if (!confirmed.length) return '';
  const lines = ['USER STYLE PREFERENCES（用户确认的文风偏好，尽量遵守）：'];
  for (const p of confirmed.slice(0, 12)) {
    lines.push(`- ${p.label || p.type} / ${p.direction}｜${p.evidence.slice(0, 80)}`);
  }
  return lines.join('\n');
}

export function buildPreferenceConfirmationQuestion(pref: UserStylePreference | StylePreference): string {
  const label = 'label' in pref && pref.label ? pref.label : `${(pref as any).type}`;
  const evidence = pref.evidence || '';
  return `我注意到你习惯「${label}」。\n依据：${evidence}\n以后要我默认这样写吗？`;
}
