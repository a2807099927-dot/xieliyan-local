import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';

const PANEL_WIDTH = 380;

/**
 * 面板开 → 窗口右扩 PANEL_WIDTH；面板关 → 还原。
 * 编辑器（flex-1）宽度因此保持不变。
 */
export function usePanelWindowGrow(isOpen: boolean) {
 // 记录“无面板时”的基准宽度，作为还原依据
 const baseWidthRef = useRef<number | null>(null);
 // 记录当前是否已经处于“已扩宽”状态，防止快速切换重复加宽
 const grownRef = useRef(false);
 // 返回是否需要降级为浮层覆盖模式（例如窗口已最大化或放不下）
 const [fallbackOverlay, setFallbackOverlay] = useState(false);

 useEffect(() => {
 const win = getCurrentWindow();
 let cancelled = false;

 ;(async () => {
 const factor = await win.scaleFactor();
 const cur = (await win.outerSize()).toLogical(factor);

 if (isOpen && !grownRef.current) {
 if (await win.isMaximized()) {
 if (!cancelled) setFallbackOverlay(true);
 return;
 }

 baseWidthRef.current = cur.width;
 let targetW = cur.width + PANEL_WIDTH;

 		// 屏幕右侧空间不够时，先把窗口左移
		const winAny = win as any;
		const mon = await (winAny.currentMonitor ? winAny.currentMonitor() : winAny.monitor?.current?.());
		if (mon) {
 const monLogical = mon.size.toLogical(mon.scaleFactor);
 const pos = (await win.outerPosition()).toLogical(factor);
 if (pos.x + targetW > monLogical.width) {
 const newX = monLogical.width - targetW;
 // 如果左移后还是超出屏幕边界（newX < 0），说明屏幕比面板加窗口还小，降级为浮层
 if (newX < 0) {
 if (!cancelled) setFallbackOverlay(true);
 return;
 }
 await win.setPosition({ type: 'Logical', x: newX, y: pos.y } as any);
 }
 }

 if (cancelled) return;
 await win.setSize(new LogicalSize(targetW, cur.height));
 
 // 验证 OS 是否真正允许了调整大小（例如 Windows 靠边吸附状态会拒绝 resize）
 setTimeout(async () => {
 if (cancelled) return;
 const checkFactor = await win.scaleFactor();
 const newOuter = (await win.outerSize()).toLogical(checkFactor);
 if (Math.abs(newOuter.width - targetW) > 10) {
 // 调整大小失败，降级为浮层
 setFallbackOverlay(true);
 // 还原状态
 grownRef.current = false;
 baseWidthRef.current = null;
 } else {
 grownRef.current = true;
 setFallbackOverlay(false);
 }
 }, 100);
 }

 if (!isOpen && grownRef.current && baseWidthRef.current != null) {
 await win.setSize(new LogicalSize(baseWidthRef.current, cur.height));
 grownRef.current = false;
 baseWidthRef.current = null;
 setFallbackOverlay(false);
 } else if (!isOpen) {
 setFallbackOverlay(false);
 }
 })();

 return () => {
 cancelled = true;
 };
 }, [isOpen]);

 // 组件卸载兜底：若仍处于扩宽状态，强制还原，避免窗口越开越宽
 useEffect(() => {
 return () => {
 if (grownRef.current && baseWidthRef.current != null) {
 const win = getCurrentWindow();
 win.scaleFactor().then((f) =>
 win.outerSize().then((s) => {
 const h = s.toLogical(f).height;
 win.setSize(new LogicalSize(baseWidthRef.current!, h));
 grownRef.current = false;
 }),
 );
 }
 };
 }, []);

 return fallbackOverlay;
}
