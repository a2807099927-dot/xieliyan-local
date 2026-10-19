// 模块说明：模态框遮罩点击关闭的安全 hook。
// 关键职责：避免用户在弹窗内 mousedown 拖拽选中文字、mouseup 落到遮罩时被误关闭。
// 仅当 mousedown 与 mouseup 都发生在遮罩本身（target === currentTarget）时才执行 onClose。
import { useRef, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

export function useBackdropClose(onClose: (() => void) | undefined) {
 const downOnBackdrop = useRef(false);

 const handleMouseDown = useCallback((event: ReactMouseEvent) => {
 downOnBackdrop.current = event.target === event.currentTarget;
 }, []);

 const handleMouseUp = useCallback(
 (event: ReactMouseEvent) => {
 const wasOnBackdrop = downOnBackdrop.current && event.target === event.currentTarget;
 downOnBackdrop.current = false;
 if (wasOnBackdrop) onClose?.();
 },
 [onClose]
 );

 return {
 onMouseDown: handleMouseDown,
 onMouseUp: handleMouseUp,
 } as const;
}
