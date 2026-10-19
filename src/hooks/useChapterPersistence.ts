// useChapterPersistence 
import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { electronAPI } from '../utils/electron';
import { ensureChapterHeading } from '../utils/chapterTemplate';
import { cleanupOldHistory, createHistorySnapshot, shouldCreateSnapshot } from '../utils/editor/history';
import { flushChapterMetaDisk } from '../store/useBookStore';

const HISTORY_MIN_CHAR_DELTA = 100;
const historyLengthByChapter = new Map<string, number>();

interface UseChapterPersistenceParams {
 bookId: string;
 chapterTitle: string;
 editorInstanceRef: MutableRefObject<{ getHTML: () => string } | null>;
 flushQueuedSaveRef: MutableRefObject<(options?: { forceHistory?: boolean; html?: string }) => Promise<void>>;
 pendingSaveHtmlRef: MutableRefObject<string | null>;
 saveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
 onUserActivity?: () => void;
 onSaveStatusChange?: (status: 'saving' | 'saved' | 'failed') => void;
}

/**
 * Encapsulates editor persistence helpers, including:
 * - history snapshot write chain
 * - force-save trigger path bound to queued flush
 */
export function useChapterPersistence({
 bookId,
 chapterTitle,
 editorInstanceRef,
 flushQueuedSaveRef,
 pendingSaveHtmlRef,
 saveTimerRef,
 onUserActivity,
 onSaveStatusChange
}: UseChapterPersistenceParams): {
 pushHistorySnapshot: (chapterId: string, html: string, options?: { force?: boolean }) => Promise<void>;
 forcePersistCurrentEditor: (options?: { forceHistory?: boolean }) => void;
} {
 const pushHistorySnapshot = useCallback(
 async (chapterId: string, html: string, options?: { force?: boolean }): Promise<void> => {
 try {
 const cacheKey = `${bookId}:${chapterId}`;
 const nextLength = String(html || '')
 .replace(/<[^>]+>/g, '')
 .replace(/\s+/g, '').length;
 const latestFromCache = historyLengthByChapter.get(cacheKey);
 const baselineLength = Number.isFinite(latestFromCache) ? (latestFromCache as number) : 0;
 if (!shouldCreateSnapshot(baselineLength, nextLength, HISTORY_MIN_CHAR_DELTA, Boolean(options?.force))) return;
 const next = createHistorySnapshot(html);
 await electronAPI.fs.saveHistorySnapshot({ bookId, chapterId, snapshot: next });
 historyLengthByChapter.set(cacheKey, nextLength);
 cleanupOldHistory(historyLengthByChapter);
 } catch (err) {
 console.error('[History] Failed to push snapshot:', err);
 }
 },
 [bookId]
 );

 const forcePersistCurrentEditor = useCallback(
 (options?: { forceHistory?: boolean }) => {
 if (!editorInstanceRef.current) return;
 const html = ensureChapterHeading(editorInstanceRef.current.getHTML(), chapterTitle);
 pendingSaveHtmlRef.current = html;
 if (saveTimerRef.current) {
 clearTimeout(saveTimerRef.current);
 saveTimerRef.current = null;
 }
 onUserActivity?.();
 onSaveStatusChange?.('saving');
 void (async () => {
  await flushQueuedSaveRef.current({ forceHistory: options?.forceHistory, html });
  // 切章/强制保存时刷出防抖中的字数 meta，避免只改内存
  await flushChapterMetaDisk();
 })();
 },
 [chapterTitle, editorInstanceRef, flushQueuedSaveRef, onSaveStatusChange, onUserActivity, pendingSaveHtmlRef, saveTimerRef]
 );

 return {
 pushHistorySnapshot,
 forcePersistCurrentEditor
 };
}

