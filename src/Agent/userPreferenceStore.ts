// 模块说明：用户风格偏好落库（book.userStylePreferences）。

import type { Book, UserStylePreference } from '../types';
import { useBookStore } from '../store/useBookStore';
import {
  applyConfirmStylePreference,
  applyRejectStylePreference,
  mergeStylePreference,
  readStylePreferencesFromBook,
  stylePreferenceFromExtracted
} from './userPreference';
import type { StylePreference } from './styleLearner';

function getBook(bookId: string): Book | null {
  return useBookStore.getState().books.find((b) => b.id === bookId) || null;
}

async function persist(bookId: string, next: UserStylePreference[]): Promise<void> {
  await useBookStore.getState().updateBook(bookId, {
    userStylePreferences: next,
    updatedAt: new Date().toISOString()
  });
}

export function loadStylePreferences(bookId: string): UserStylePreference[] {
  return readStylePreferencesFromBook(getBook(bookId));
}

export async function saveStylePreference(
  bookId: string,
  preference: StylePreference | UserStylePreference,
  confirmed = false
): Promise<UserStylePreference | null> {
  const book = getBook(bookId);
  if (!book) return null;
  const entry: UserStylePreference =
    'id' in preference && (preference as UserStylePreference).id
      ? ({ ...(preference as UserStylePreference), confirmed: confirmed || (preference as UserStylePreference).confirmed })
      : stylePreferenceFromExtracted(preference as StylePreference, confirmed);
  const next = mergeStylePreference(readStylePreferencesFromBook(book), entry);
  await persist(bookId, next);
  return next.find((p) => p.type === entry.type && p.direction === entry.direction) || entry;
}

export async function confirmStylePreference(bookId: string, id: string): Promise<boolean> {
  const book = getBook(bookId);
  if (!book) return false;
  const next = applyConfirmStylePreference(readStylePreferencesFromBook(book), id);
  if (!next) return false;
  await persist(bookId, next);
  return true;
}

export async function rejectStylePreference(bookId: string, id: string): Promise<boolean> {
  const book = getBook(bookId);
  if (!book) return false;
  const next = applyRejectStylePreference(readStylePreferencesFromBook(book), id);
  if (!next) return false;
  await persist(bookId, next);
  return true;
}

/** 从改稿 diff 提取并写入待确认偏好 */
export async function learnFromUserEdit(
  bookId: string,
  original: string,
  edited: string
): Promise<UserStylePreference[]> {
  const { diffOriginalAndUserEdit, extractStylePreferences } = await import('./styleLearner');
  const diffs = diffOriginalAndUserEdit(original, edited);
  const extracted = extractStylePreferences(diffs);
  const saved: UserStylePreference[] = [];
  for (const pref of extracted) {
    const row = await saveStylePreference(bookId, pref, false);
    if (row) saved.push(row);
  }
  return saved;
}
