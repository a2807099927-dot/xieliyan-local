// position.ts - Floating panel position clamping utilities.
/**
 * Clamps a floating panel position to keep it fully visible inside the viewport.
 *
 * @param pos Desired panel position in viewport coordinates.
 * @param cardWidth Floating panel width in pixels.
 * @param cardHeight Floating panel height in pixels.
 * @returns A safe `{ top, left }` position that stays within viewport bounds.
 *
 * @remarks
 * - Applies an 8px safe margin on all sides.
 * - Prevents negative coordinates.
 * - Handles small viewport edge-cases by collapsing max bounds to the safe margin.
 */
export function clampFloatingCardPos(
 pos: { top: number; left: number },
 cardWidth: number,
 cardHeight: number
): { top: number; left: number } {
 const maxLeft = Math.max(8, window.innerWidth - cardWidth - 8);
 const maxTop = Math.max(8, window.innerHeight - cardHeight - 8);
 return {
 left: Math.max(8, Math.min(pos.left, maxLeft)),
 top: Math.max(8, Math.min(pos.top, maxTop))
 };
}

