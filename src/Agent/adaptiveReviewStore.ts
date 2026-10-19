// 模块说明：自适应审查状态落库。

import type { AdaptiveReviewState, Book } from '../types';
import { useBookStore } from '../store/useBookStore';
import { readAdaptiveReviewState, updateAdaptiveReviewState } from './adaptiveReview';
import type { ReviewResult } from './writingReflection';

function getBook(bookId: string): Book | null {
  return useBookStore.getState().books.find((b) => b.id === bookId) || null;
}

export async function persistAdaptiveReviewState(bookId: string, state: AdaptiveReviewState): Promise<void> {
  await useBookStore.getState().updateBook(bookId, {
    adaptiveReviewState: state,
    updatedAt: new Date().toISOString()
  });
}

export async function recordReviewForAdaptation(bookId: string, review: ReviewResult): Promise<AdaptiveReviewState | null> {
  const book = getBook(bookId);
  if (!book) return null;
  const next = updateAdaptiveReviewState(readAdaptiveReviewState(book), review);
  await persistAdaptiveReviewState(bookId, next);
  return next;
}
