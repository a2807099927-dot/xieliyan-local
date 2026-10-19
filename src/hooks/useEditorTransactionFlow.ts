// 模块说明：编辑器事务流 Hook。
// 关键职责：监听 ProseMirror 事务，触发自动保存/段落扫描/高亮刷新。
import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { ensureChapterHeading } from '../utils/chapterTemplate';
import { isCloudDownloadGuardActive } from '../store/useBookStore';

function isEditorViewAlive(editor: any): boolean {
 return Boolean(editor && !editor.isDestroyed && editor.view?.docView);
}

interface UseEditorTransactionFlowParams {
 bookId: string;
 chapterId: string;
 chapterTitle: string;
 editor: any;
 keywords: string[];
 setChapterContent: (bookId: string, chapterId: string, content: string) => Promise<boolean | void>;
 showIsland: (payload: any) => void;
 pushHistorySnapshot: (chapterId: string, html: string, options?: { force?: boolean }) => Promise<void>;
 getCurrentParagraphKey: (state: any) => string | null;
 transactionInsertedMeaningfulCharCount: (transaction: any) => number;
 applyCharacterHighlights: (editor: any, keywords: string[], range?: { from?: number; to?: number }) => void;
 snapshotParagraphFromState: (state: any) => any;
 scheduleParagraphScan: (paragraph: any, delayMs?: number) => void;
 clearPendingOptimizationState: () => void;
 refs: {
 flushQueuedSaveRef: MutableRefObject<(options?: { forceHistory?: boolean; html?: string }) => Promise<void>>;
 pendingSaveHtmlRef: MutableRefObject<string | null>;
 saveInFlightRef: MutableRefObject<boolean>;
 saveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
 saveErrorShownRef: MutableRefObject<boolean>;
 /** 云保护窗重试计数，避免极端情况无限轮询 */
 saveRetryCountRef: MutableRefObject<number>;
 lastSavedHtmlRef: MutableRefObject<string>;
 chapterTitleRef: MutableRefObject<string>;
 onUserActivityRef: MutableRefObject<(() => void) | undefined>;
 onSaveStatusChangeRef: MutableRefObject<((status: 'saving' | 'saved' | 'failed') => void) | undefined>;
 onHistoryStateChangeRef: MutableRefObject<((state: { canUndo: boolean; canRedo: boolean }) => void) | undefined>;
 applyingHighlightRef: MutableRefObject<boolean>;
 highlightTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
 focusLineElementRef: MutableRefObject<HTMLElement | null>;
 scanTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
 isPendingOptimizationRef: MutableRefObject<boolean>;
 expectedNewParagraphKeyRef: MutableRefObject<string | null>;
 pendingTypedCharsRef: MutableRefObject<number>;
 pendingPreviousParagraphRef: MutableRefObject<any>;
 lastSelectionParagraphRef: MutableRefObject<any>;
 };
}

/**
 * Editor transaction main loop hook.
 *
 * Execution order intentionally mirrors original TiptapEditor implementation:
 * 1) `onUpdate` schedules queued save
 * 2) `onTransaction` processes Enter-state machine, history emission, highlight scheduling
 * 3) `onSelectionUpdate` keeps focus line + pending optimization guards in sync
 * 4) cleanup flushes pending save and unregisters listeners in original order
 */
export function useEditorTransactionFlow({
 bookId,
 chapterId,
 chapterTitle,
 editor,
 keywords,
 setChapterContent,
 showIsland,
 pushHistorySnapshot,
 getCurrentParagraphKey,
 transactionInsertedMeaningfulCharCount,
 applyCharacterHighlights,
 snapshotParagraphFromState,
 scheduleParagraphScan,
 clearPendingOptimizationState,
 refs
}: UseEditorTransactionFlowParams): void {
 useEffect(() => {
 if (!editor) return;

 // IME 组合状态跟踪：组合期间不触发高亮/立刻落盘，防止打断输入法。
 // 注意：组合过程中的 update 若直接丢弃且不排队，会出现「打完中文不存、再删一个字才存」。
 let isComposing = false;
 let dirtyDuringComposition = false;
 let composeSaveRetries = 0;

 // 先声明，便于 scheduleDebouncedSave 闭包引用（函数体在下方赋值）
 let flushQueuedSave: (options?: { forceHistory?: boolean; html?: string }) => Promise<void> = async () => {};

 const scheduleDebouncedSave = (delayMs = 400) => {
 if (refs.saveTimerRef.current) clearTimeout(refs.saveTimerRef.current);
 refs.saveTimerRef.current = setTimeout(() => {
  // 仍在组合中：有限次重试；compositionend 也会主动踢一次
  if (isComposing) {
   composeSaveRetries += 1;
   if (composeSaveRetries <= 25) {
    scheduleDebouncedSave(200);
   }
   return;
  }
  composeSaveRetries = 0;
  if (!isEditorViewAlive(editor)) return;
  refs.pendingSaveHtmlRef.current = editor.getHTML();
  void flushQueuedSave();
 }, delayMs);
 };

 const onCompositionStart = () => {
 isComposing = true;
 };
 const onCompositionEnd = () => {
 isComposing = false;
 composeSaveRetries = 0;
 // 组合结束后补一次高亮
 scheduleHighlight();
 // 组合结束：必须排队保存。多数中文输入的最后一次 update 发生在 isComposing=true 期间，
 // 若不在此处补存，磁盘会一直停在组合前，直到用户再敲/删一个非组合字符。
 // 即便没标脏也踢一次：部分 IME 只在 compositionend 后才稳定文档。
 const shouldFlush = dirtyDuringComposition;
 dirtyDuringComposition = false;
 if (shouldFlush) {
  refs.onUserActivityRef.current?.();
  refs.onSaveStatusChangeRef.current?.('saving');
 }
 // 稍延迟：确保浏览器已把最终汉字写入 DOM
 scheduleDebouncedSave(50);
 };
 const editorDom = editor.view?.dom as HTMLElement | undefined;
 editorDom?.addEventListener('compositionstart', onCompositionStart);
 editorDom?.addEventListener('compositionend', onCompositionEnd);

 const emitHistoryState = () => {
 refs.onHistoryStateChangeRef.current?.({
 canUndo: editor.can().undo(),
 canRedo: editor.can().redo()
 });
 };

 const scheduleHighlight = (from?: number, to?: number) => {
 if (refs.highlightTimerRef.current) clearTimeout(refs.highlightTimerRef.current);
 if (isComposing) return; // IME 组合期间不触发高亮
 refs.highlightTimerRef.current = setTimeout(() => {
 if (!isEditorViewAlive(editor) || refs.applyingHighlightRef.current || isComposing) return;
 refs.applyingHighlightRef.current = true;
 const docSize = editor.state.doc.content.size;
 const safeFrom = Math.max(1, Math.min(from ?? 1, docSize));
 const safeTo = Math.max(safeFrom, Math.min(to ?? docSize, docSize));

 if (docSize > 8000 && (safeTo - safeFrom) > 1000) {
 const cursorPos = editor.state.selection.from;
 const limitedFrom = Math.max(1, cursorPos - 1000);
 const limitedTo = Math.min(docSize, cursorPos + 1000);
 applyCharacterHighlights(editor, keywords, { from: limitedFrom, to: limitedTo });
 } else {
 applyCharacterHighlights(editor, keywords, { from: safeFrom, to: safeTo });
 }

 requestAnimationFrame(() => {
 refs.applyingHighlightRef.current = false;
 });
 }, 300);
 };

 const getChangedRange = (transaction: any) => {
 let from = Number.POSITIVE_INFINITY;
 let to = Number.NEGATIVE_INFINITY;
 const steps = Array.isArray(transaction?.steps) ? transaction.steps : [];
 for (const step of steps) {
 try {
 const map = step?.getMap?.();
 if (!map || typeof map.forEach !== 'function') continue;
 map.forEach((_oldStart: number, _oldEnd: number, newStart: number, newEnd: number) => {
 from = Math.min(from, newStart);
 to = Math.max(to, newEnd);
 });
 } catch {
 // ignore malformed step maps
 }
 }
 if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
 const docSize = editor.state.doc.content.size;
 let safeFrom = Math.max(1, Math.min(from, docSize));
 let safeTo = Math.max(1, Math.min(Math.max(from + 1, to), docSize));
 if (safeTo <= safeFrom) {
 safeFrom = Math.max(1, safeFrom - 1);
 safeTo = Math.min(docSize, safeFrom + 1);
 }
 return { from: safeFrom, to: safeTo };
 };

 const updateFocusLineVisual = () => {
 if (!isEditorViewAlive(editor)) return;
 if (!editor.state.selection.empty) return;
 const domSelection = window.getSelection();
 if (domSelection && !domSelection.isCollapsed) return;
 const root = editor.view.dom as HTMLElement;
 const { from } = editor.state.selection;
 const domNode = editor.view.nodeDOM(Math.max(0, from - 1)) as HTMLElement | null;
 const target = (domNode?.closest?.('p') as HTMLElement | null) || (root.querySelector('p') as HTMLElement | null);
 if (refs.focusLineElementRef.current === target) return;
 refs.focusLineElementRef.current?.classList.remove('wz-focus-line');
 target?.classList.add('wz-focus-line');
 refs.focusLineElementRef.current = target;
 };

 const onUpdate = ({ transaction }: { transaction?: { getMeta?: (key: string) => unknown } } = {}) => {
 if (transaction?.getMeta?.('dragSelection') === true) return;
 if (refs.applyingHighlightRef.current && transaction?.getMeta?.('addToHistory') === false) {
 return;
 }
 refs.onUserActivityRef.current?.();
 refs.onSaveStatusChangeRef.current?.('saving');
 // IME 组合期间：不立刻 getHTML 落盘（避免打断输入法），但标记脏数据并 debounce
 if (isComposing) {
  dirtyDuringComposition = true;
 }
 scheduleDebouncedSave();
 };

 flushQueuedSave = async (options?: { forceHistory?: boolean; html?: string }) => {
 if (options?.html) {
 refs.pendingSaveHtmlRef.current = options.html;
 }
 if (refs.saveInFlightRef.current) return;
 if (refs.pendingSaveHtmlRef.current === null) {
 refs.onSaveStatusChangeRef.current?.('saved');
 return;
 }
 // 云下载保护窗：不要清空 pending、不要假装已保存；稍后重试（重试次数上限在下方 refusedByGuard 分支控制）
 if (isCloudDownloadGuardActive() && !options?.forceHistory) {
  window.setTimeout(() => {
   if (refs.pendingSaveHtmlRef.current !== null) void flushQueuedSave(options);
  }, 600);
  return;
 }

 refs.saveInFlightRef.current = true;
 refs.onSaveStatusChangeRef.current?.('saving');
 let wroteSomething = false;
 let refusedByGuard = false;

 try {
 while (refs.pendingSaveHtmlRef.current !== null) {
 const html: string = refs.pendingSaveHtmlRef.current;
 refs.pendingSaveHtmlRef.current = null;

 // P0-FIX: 如果编辑器已经切到了别的章节，丢弃旧章节的 pending save
 if (!isEditorViewAlive(editor)) break;

 if (isCloudDownloadGuardActive() && !options?.forceHistory) {
  // 保留待写内容，等保护窗结束再存
  refs.pendingSaveHtmlRef.current = refs.pendingSaveHtmlRef.current ?? html;
  refusedByGuard = true;
  break;
 }

 const normalizedHtml = ensureChapterHeading(html, refs.chapterTitleRef.current);

 // 注意：这里曾经有一个"防误清空保护"（plainText < 10 且 prevPlain > 50 时跳过保存），
 // 但它会误伤正常的"删除整段内容"操作 — 用户删除后 UI 显示已保存、磁盘却没更新，
 // 切章节回来旧内容又回来了。属于严重的数据完整性 bug。
 // 现在依赖：① Tiptap 自带的 Ctrl+Z 即时撤销 ② 章节历史快照（最多 30 个，可一键恢复）
 // 来防止误删，不再静默拒绝保存。

 if (normalizedHtml === refs.lastSavedHtmlRef.current && !options?.forceHistory) {
 continue;
 }

 await pushHistorySnapshot(chapterId, normalizedHtml, { force: Boolean(options?.forceHistory) });

 try {
 const saved: boolean | void = await Promise.race([
 setChapterContent(bookId, chapterId, normalizedHtml),
 new Promise<never>((_, reject) => {
 window.setTimeout(() => reject(new Error('保存超时，请检查磁盘权限。')), 15000);
 })
 ]);
 // 被云保护拒绝时不要改 lastSavedHtml，否则 UI 以为已存、磁盘仍是旧正文
 if (saved === false) {
  refusedByGuard = true;
  refs.pendingSaveHtmlRef.current = refs.pendingSaveHtmlRef.current ?? html;
  continue;
 }
 refs.lastSavedHtmlRef.current = normalizedHtml;
 refs.saveErrorShownRef.current = false;
 wroteSomething = true;
 } catch (err) {
 refs.pendingSaveHtmlRef.current = refs.pendingSaveHtmlRef.current ?? html;
 throw err;
 }
 }
 if (refusedByGuard && !wroteSomething) {
  // 仍显示 saving，等保护窗后的重试；不谎称已保存
  refs.onSaveStatusChangeRef.current?.('saving');
  refs.saveRetryCountRef.current += 1;
  // 云保护窗重试上限：连续 5 次仍被挡则放弃，避免极端情况无限轮询
  if (refs.saveRetryCountRef.current > 5) {
   refs.saveRetryCountRef.current = 0;
   refs.pendingSaveHtmlRef.current = null;
   refs.onSaveStatusChangeRef.current?.('failed');
  } else {
   window.setTimeout(() => {
    if (refs.pendingSaveHtmlRef.current !== null) void flushQueuedSave(options);
   }, 600);
  }
 } else {
  refs.saveRetryCountRef.current = 0;
  refs.onSaveStatusChangeRef.current?.('saved');
 }
 } catch (error) {
 refs.onSaveStatusChangeRef.current?.('failed');
 if (!refs.saveErrorShownRef.current) {
 refs.saveErrorShownRef.current = true;
 showIsland({
 type: 'error',
 message: 'failed',
 detail: error instanceof Error ? error.message : String(error),
 autoHideMs: 2600
 });
 }
 } finally {
 refs.saveInFlightRef.current = false;
 if (refs.pendingSaveHtmlRef.current !== null && !refusedByGuard) {
 void flushQueuedSave(options);
 }
 }
 };
 refs.flushQueuedSaveRef.current = flushQueuedSave;

 const onTransaction = ({ transaction }: { transaction: any }) => {
 if (transaction?.getMeta?.('dragSelection') === true) return;
 if (refs.applyingHighlightRef.current && transaction?.getMeta?.('addToHistory') === false) {
 return;
 }
 if (transaction?.docChanged) {
 if (refs.isPendingOptimizationRef.current && !refs.expectedNewParagraphKeyRef.current) {
 refs.expectedNewParagraphKeyRef.current = getCurrentParagraphKey(editor.state as any);
 }
 if (refs.isPendingOptimizationRef.current) {
 const currentParagraphKey = getCurrentParagraphKey(editor.state as any);
 if (!refs.expectedNewParagraphKeyRef.current && currentParagraphKey) {
 refs.expectedNewParagraphKeyRef.current = currentParagraphKey;
 }
 const stillInExpectedParagraph =
 Boolean(refs.expectedNewParagraphKeyRef.current) &&
 currentParagraphKey === refs.expectedNewParagraphKeyRef.current;
 let insertedCharsThisTransaction = 0;
 if (!stillInExpectedParagraph) {
 clearPendingOptimizationState();
 } else {
 insertedCharsThisTransaction = transactionInsertedMeaningfulCharCount(transaction);
 if (insertedCharsThisTransaction > 0) {
 refs.pendingTypedCharsRef.current += insertedCharsThisTransaction;
 }
 }
 if (
 stillInExpectedParagraph &&
 insertedCharsThisTransaction > 0 &&
 refs.pendingTypedCharsRef.current >= 2
 ) {
 scheduleParagraphScan(refs.pendingPreviousParagraphRef.current, 0);
 clearPendingOptimizationState();
 }
 }
 emitHistoryState();
 const changed = getChangedRange(transaction);
 if (changed) {
 scheduleHighlight(changed.from, changed.to);
 } else {
 const cursorPos = editor.state.selection?.from ?? 1;
 const docSize = editor.state.doc.content.size;
 scheduleHighlight(Math.max(1, cursorPos - 500), Math.min(docSize, cursorPos + 500));
 }
 }
 };

 const onSelectionUpdate = () => {
 updateFocusLineVisual();
 if (refs.isPendingOptimizationRef.current) {
 const currentParagraphKey = getCurrentParagraphKey(editor.state as any);
 const expectedParagraphKey = refs.expectedNewParagraphKeyRef.current;
 if (expectedParagraphKey && currentParagraphKey !== expectedParagraphKey) {
 clearPendingOptimizationState();
 }
 }
 const current = snapshotParagraphFromState(editor.state as typeof editor.state);
 refs.lastSelectionParagraphRef.current = current;
 };

 editor.on('update', onUpdate);
 editor.on('transaction', onTransaction);
 editor.on('selectionUpdate', onSelectionUpdate);
 scheduleHighlight(1, editor.state.doc.content.size);
 updateFocusLineVisual();
 emitHistoryState();
 refs.lastSelectionParagraphRef.current = snapshotParagraphFromState(editor.state as typeof editor.state);

 return () => {
 const latestHtml = !isEditorViewAlive(editor) ? refs.pendingSaveHtmlRef.current : ensureChapterHeading(editor.getHTML(), chapterTitle);
 if (refs.saveTimerRef.current) {
 clearTimeout(refs.saveTimerRef.current);
 refs.saveTimerRef.current = null;
 }
 if (latestHtml && latestHtml !== refs.lastSavedHtmlRef.current) {
 refs.pendingSaveHtmlRef.current = latestHtml;
 void flushQueuedSave({ forceHistory: true, html: latestHtml });
 }
 refs.flushQueuedSaveRef.current = async () => {};
 editor.off('update', onUpdate);
 editor.off('transaction', onTransaction);
 editor.off('selectionUpdate', onSelectionUpdate);
 editorDom?.removeEventListener('compositionstart', onCompositionStart);
 editorDom?.removeEventListener('compositionend', onCompositionEnd);
 refs.focusLineElementRef.current?.classList.remove('wz-focus-line');
 refs.focusLineElementRef.current = null;
 if (refs.highlightTimerRef.current) clearTimeout(refs.highlightTimerRef.current);
 };
 }, [
 applyCharacterHighlights,
 bookId,
 chapterId,
 chapterTitle,
 clearPendingOptimizationState,
 editor,
 getCurrentParagraphKey,
 keywords,
 pushHistorySnapshot,
 refs,
 scheduleParagraphScan,
 setChapterContent,
 showIsland,
 snapshotParagraphFromState,
 transactionInsertedMeaningfulCharCount
 ]);
}
