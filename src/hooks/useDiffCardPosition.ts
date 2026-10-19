// 
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';
import { clampFloatingCardPos } from '../utils/editor/position';

const DIFF_CARD_STORAGE_KEY = 'xly-diff-card-pos';

type CardPos = { top: number; left: number };

interface UseDiffCardPositionParams {
 cardAnchorPos: CardPos | null;
 aiDiffAnalysisActive: boolean;
}

/**
 * Handles diff card position lifecycle:
 * load/save/reset persistence, dragging interaction, clamping and viewport resize correction.
 */
export function useDiffCardPosition({
 cardAnchorPos,
 aiDiffAnalysisActive
}: UseDiffCardPositionParams): {
 diffCardPos: CardPos | null;
 setDiffCardPos: Dispatch<SetStateAction<CardPos | null>>;
 displayPos: CardPos;
 defaultPos: CardPos;
 isDragging: boolean;
 onPointerDown: (event: ReactPointerEvent) => void;
 resetPosition: () => void;
 clearPosition: () => void;
} {
 const [diffCardPos, setDiffCardPos] = useState<CardPos | null>(null);
 const diffDragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

 const loadDiffCardPos = useCallback((): CardPos | null => {
 try {
 const raw = localStorage.getItem(DIFF_CARD_STORAGE_KEY);
 if (raw) return JSON.parse(raw) as CardPos;
 } catch {
 // ignore parse/storage errors
 }
 return null;
 }, []);

 const saveDiffCardPos = useCallback((pos: CardPos) => {
 try {
 localStorage.setItem(DIFF_CARD_STORAGE_KEY, JSON.stringify(pos));
 } catch {
 // ignore storage errors
 }
 }, []);

 const defaultPos = useMemo(
 () =>
 cardAnchorPos
 ? clampFloatingCardPos({ top: cardAnchorPos.top, left: cardAnchorPos.left }, 420, 420)
 : clampFloatingCardPos({ top: 80, left: window.innerWidth - 460 }, 420, 420),
 [cardAnchorPos]
 );

 useEffect(() => {
 if (!aiDiffAnalysisActive || diffCardPos) return;
 setDiffCardPos(loadDiffCardPos() ?? defaultPos);
 }, [aiDiffAnalysisActive, diffCardPos, loadDiffCardPos, defaultPos]);

 useEffect(() => {
 if (!aiDiffAnalysisActive || !diffCardPos) return;
 const clamped = clampFloatingCardPos(diffCardPos, 420, 420);
 if (clamped.top !== diffCardPos.top || clamped.left !== diffCardPos.left) {
 setDiffCardPos(clamped);
 }
 }, [aiDiffAnalysisActive, diffCardPos]);

 useEffect(() => {
 const handleViewportChange = () => {
 setDiffCardPos((prev) => (prev ? clampFloatingCardPos(prev, 420, 420) : prev));
 };
 window.addEventListener('resize', handleViewportChange);
 return () => {
 window.removeEventListener('resize', handleViewportChange);
 };
 }, []);

 const onPointerDown = useCallback(
 (event: ReactPointerEvent) => {
 if (!diffCardPos) return;
 event.preventDefault();
 diffDragRef.current = {
 startX: event.clientX,
 startY: event.clientY,
 startLeft: diffCardPos.left,
 startTop: diffCardPos.top
 };
 const onMove = (ev: PointerEvent) => {
 if (!diffDragRef.current) return;
 const dx = ev.clientX - diffDragRef.current.startX;
 const dy = ev.clientY - diffDragRef.current.startY;
 const nextPos = clampFloatingCardPos(
 { left: diffDragRef.current.startLeft + dx, top: diffDragRef.current.startTop + dy },
 420,
 120
 );
 setDiffCardPos(nextPos);
 };
 const onUp = () => {
 diffDragRef.current = null;
 window.removeEventListener('pointermove', onMove);
 window.removeEventListener('pointerup', onUp);
 setDiffCardPos((prev) => {
 if (prev) saveDiffCardPos(prev);
 return prev;
 });
 };
 window.addEventListener('pointermove', onMove);
 window.addEventListener('pointerup', onUp);
 },
 [diffCardPos, saveDiffCardPos]
 );

 const resetPosition = useCallback(() => {
 localStorage.removeItem(DIFF_CARD_STORAGE_KEY);
 setDiffCardPos(defaultPos);
 }, [defaultPos]);

 const clearPosition = useCallback(() => {
 setDiffCardPos(null);
 }, []);

 const displayPos = clampFloatingCardPos(diffCardPos ?? defaultPos, 420, 420);

 return {
 diffCardPos,
 setDiffCardPos,
 displayPos,
 defaultPos,
 isDragging: Boolean(diffDragRef.current),
 onPointerDown,
 resetPosition,
 clearPosition
 };
}
