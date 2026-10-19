// Escape /
import { useEffect } from 'react';

/**
 * Hook to handle Escape key press.
 * @param onEscape Callback to run when Escape is pressed.
 * @param active Whether the listener should be active (defaults to true).
 */
export function useEscapeKey(onEscape: () => void, active: boolean = true) {
 useEffect(() => {
 if (!active) return;

 const handleKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') {
 onEscape();
 }
 };

 window.addEventListener('keydown', handleKeyDown, { capture: true });
 return () => {
 window.removeEventListener('keydown', handleKeyDown, { capture: true });
 };
 }, [onEscape, active]);
}
