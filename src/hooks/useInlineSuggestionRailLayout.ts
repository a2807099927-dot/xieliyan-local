// /
import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

function isEditorViewAlive(editor: any): boolean {
 return Boolean(editor && !editor.isDestroyed && editor.view?.docView);
}

interface UseInlineSuggestionRailLayoutParams {
 chapterId: string;
 editor: any;
 shellRef: MutableRefObject<HTMLDivElement | null>;
 hasSuggestionRail: boolean;
 pendingSuggestions: Array<{ id: string; from: number }>;
 suggestionCardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
 findLiveRangeBySuggestion: (item: any) => { from: number; to: number } | null;
 setSuggestionAnchorMap: Dispatch<SetStateAction<Record<string, { top: number; left: number }>>>;
 setSuggestionSpacerHeight: Dispatch<SetStateAction<number>>;
 viewportLockRef: MutableRefObject<{
 active: boolean;
 paragraphHash: string | null;
 scrollTop: number;
 expiresAt: number;
 }>;
 viewportLockByCodeRef: MutableRefObject<boolean>;
 maybeEnforceViewportLock: (reasonParagraphHash?: string | null) => void;
}

/**
 * Calculates inline suggestion rail card positions, spacer height,
 * and keeps scroll/resize/transaction recalc synchronized.
 */
export function useInlineSuggestionRailLayout({
 chapterId,
 editor,
 shellRef,
 hasSuggestionRail,
 pendingSuggestions,
 suggestionCardRefs,
 findLiveRangeBySuggestion,
 setSuggestionAnchorMap,
 setSuggestionSpacerHeight,
 viewportLockRef,
 viewportLockByCodeRef,
 maybeEnforceViewportLock
}: UseInlineSuggestionRailLayoutParams): void {
 useEffect(() => {
 if (!isEditorViewAlive(editor) || !hasSuggestionRail) {
 setSuggestionAnchorMap((prev) => (Object.keys(prev).length > 0 ? {} : prev));
 setSuggestionSpacerHeight((prev) => (prev !== 0 ? 0 : prev));
 viewportLockRef.current.active = false;
 return;
 }
 const shell = shellRef.current;
 if (!shell) return;
 let frame: number | null = null;

 const scheduleRecalc = () => {
 if (frame !== null) cancelAnimationFrame(frame);
 frame = requestAnimationFrame(() => {
 frame = null;
 if (!isEditorViewAlive(editor)) return;
 const shellRect = shell.getBoundingClientRect();
 const defaultCardHeight = 152;
 const minGap = 8;
 const minTop = 18;
 const fixedColumnLeft = 0;

 const getAnchorTopByPos = (pos: number): number | null => {
 try {
 const safePos = Math.max(1, Math.min(pos, editor.state.doc.content.size - 1));
 const coords = editor.view.coordsAtPos(safePos);
 return coords.top - shellRect.top + shell.scrollTop;
 } catch {
 return null;
 }
 };

 const raw = pendingSuggestions.map((item, index) => {
 const range = findLiveRangeBySuggestion(item);
 const anchorPos = range?.from ?? item.from;
 const anchorTop = getAnchorTopByPos(anchorPos);
 const fallbackTop = 56 + index * (defaultCardHeight + minGap);
 const top = anchorTop === null ? fallbackTop : anchorTop - 6;
 return { id: item.id, top };
 });

 raw.sort((a, b) => a.top - b.top);
 let nextAvailableTop = minTop - minGap;
 const nextMap: Record<string, { top: number; left: number }> = {};
 let maxCardBottom = 0;
 for (const item of raw) {
 const cardHeight = suggestionCardRefs.current[item.id]?.offsetHeight || defaultCardHeight;
 const clampedTop = Math.max(minTop, item.top);
 const finalTop = Math.max(clampedTop, nextAvailableTop + minGap);
 nextMap[item.id] = { top: finalTop, left: fixedColumnLeft };
 nextAvailableTop = finalTop + cardHeight;
 maxCardBottom = Math.max(maxCardBottom, finalTop + cardHeight);
 }
 const editorHost = editor.view.dom as HTMLElement;
 const contentBottom = editorHost.offsetTop + editorHost.offsetHeight;
 const requiredSpacer = Math.max(0, Math.ceil(maxCardBottom - contentBottom + 18));
 setSuggestionSpacerHeight((prev) => (Math.abs(prev - requiredSpacer) > 1 ? requiredSpacer : prev));
 maybeEnforceViewportLock();

 setSuggestionAnchorMap((prev) => {
 const prevKeys = Object.keys(prev);
 const nextKeys = Object.keys(nextMap);
 if (prevKeys.length !== nextKeys.length) return nextMap;
 for (const key of nextKeys) {
 const prevTop = prev[key]?.top ?? -99999;
 const prevLeft = prev[key]?.left ?? -99999;
 if (Math.abs(prevTop - nextMap[key].top) > 1 || Math.abs(prevLeft - nextMap[key].left) > 1) {
 return nextMap;
 }
 }
 return prev;
 });
 });
 };

 scheduleRecalc();
 const onShellScroll = () => {
 if (viewportLockRef.current.active && !viewportLockByCodeRef.current) {
 viewportLockRef.current.active = false;
 }
 scheduleRecalc();
 };
 shell.addEventListener('scroll', onShellScroll, { passive: true });
 window.addEventListener('resize', scheduleRecalc);
 editor.on('transaction', scheduleRecalc);

 return () => {
 if (frame !== null) cancelAnimationFrame(frame);
 shell.removeEventListener('scroll', onShellScroll);
 window.removeEventListener('resize', scheduleRecalc);
 editor.off('transaction', scheduleRecalc);
 };
 }, [
 chapterId,
 editor,
 findLiveRangeBySuggestion,
 hasSuggestionRail,
 maybeEnforceViewportLock,
 pendingSuggestions,
 setSuggestionAnchorMap,
 setSuggestionSpacerHeight,
 shellRef,
 suggestionCardRefs,
 viewportLockByCodeRef,
 viewportLockRef
 ]);
}
