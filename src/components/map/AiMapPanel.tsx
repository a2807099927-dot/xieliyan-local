// AiMapPanel.tsx — FMG 地图 + 完整外部工具栏 + 右键菜单
import { useState, useRef, useCallback, useEffect } from 'react';
import { useIslandStore } from '../../store/useIslandStore';

const FMG_URL = '/fmg/index.html';
const SAVES_KEY = 'xly-map-saves';

interface MapSave {
 id: string;
 name: string;
 savedAt: string;
}

interface ContextMenuState {
 visible: boolean;
 x: number;
 y: number;
 entity: any;
}

const LAYER_PRESETS = [
 { id: '行政区域图', label: '🏛 行政图', desc: '国家与边界' },
 { id: '文化', label: '🎭 文化图', desc: '文化分布' },
 { id: '宗教', label: '⛩ 宗教图', desc: '宗教分布' },
 { id: '省份', label: '📜 省份图', desc: '行政省份' },
 { id: '生物群', label: '🌿 生物群', desc: '气候生物' },
 { id: '高程图', label: '⛰ 地形图', desc: '海拔高度' },
 { id: '自然', label: '🏞 自然图', desc: '物理特征' },
 { id: '兴趣点', label: '📍 兴趣点', desc: '标记景点' },
 { id: '军事', label: '⚔ 军事图', desc: '军队部署' },
];

function getSaves(): MapSave[] {
 try { return JSON.parse(localStorage.getItem(SAVES_KEY) || '[]'); } catch { return []; }
}
function setSaves(saves: MapSave[]) {
 localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
}

export function AiMapPanel() {
 const showIsland = useIslandStore((s) => s.show);

 const [loaded, setLoaded] = useState(false);
 const [saves, setSavesState] = useState<MapSave[]>(getSaves);
 const [showSaves, setShowSaves] = useState(false);
 const [showSaveDialog, setShowSaveDialog] = useState(false);
 const [saveNameInput, setSaveNameInput] = useState('');
 const [showLayers, setShowLayers] = useState(false);
 const [currentPreset, setCurrentPreset] = useState('行政区域图');
 const [brushMode, setBrushMode] = useState<null | { type: 'expand' | 'shrink'; sourceStateId: number; targetStateId: number }>(null);
 const [showTargetPicker, setShowTargetPicker] = useState<null | { sourceStateId: number }>(null);
 const [brushRadius, setBrushRadius] = useState(15);
 const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, entity: null });
 const [showRenameDialog, setShowRenameDialog] = useState<{ type: 'state' | 'burg' | 'river'; id: number; oldName: string } | null>(null);
 const [renameInput, setRenameInput] = useState('');
 const [drawMode, setDrawMode] = useState<null | string>(null);
 const [showDrawPicker, setShowDrawPicker] = useState(false);
 const [drawRadius, setDrawRadius] = useState(15);

 const iframeRef = useRef<HTMLIFrameElement>(null);

 const getBridge = useCallback(() => (iframeRef.current?.contentWindow as any)?._fmgBridge, []);

 // 监听 FMG 的 mapReady 消息，地图生成完成后自动适配视口
 useEffect(() => {
 const onMessage = (e: MessageEvent) => {
 if (e.data?.source === 'xly-map-ai-response' && e.data?.type === 'mapReady') {
 setTimeout(() => { try { getBridge()?.resetView(); } catch {} }, 300);
 }
 };
 window.addEventListener('message', onMessage);
 return () => window.removeEventListener('message', onMessage);
 }, [getBridge]);

 // 监听容器大小变化，强制触发 iframe 内部的 resize 事件，并同步海洋底色，防止 FMG 画布出现黑边
 useEffect(() => {
 const container = iframeRef.current?.parentElement;
 if (!container) return;
 
 let resizeTimer: any;
 const observer = new ResizeObserver(() => {
 if (!loaded) return;
 try {
 const iframeWin = iframeRef.current?.contentWindow;
 if (iframeWin) {
 iframeWin.dispatchEvent(new Event('resize'));
 // 尺寸变化后，稍微延迟让 FMG 处理完 resize 事件，再强制重置视角使其充满全屏
 clearTimeout(resizeTimer);
 resizeTimer = setTimeout(() => {
 try { getBridge()?.resetView(); } catch {}
 }, 150);
 }
 } catch { /* cross-origin */ }
 });
 
 observer.observe(container);
 return () => {
 observer.disconnect();
 clearTimeout(resizeTimer);
 };
 }, [loaded, getBridge]);

 // 定期同步 FMG 的海洋颜色到容器背景，实现完美的“无界地图”视觉效果
 useEffect(() => {
 if (!loaded) return;
 const container = iframeRef.current?.parentElement;
 if (!container) return;

 const syncOceanBg = () => {
 try {
 const iframeWin = iframeRef.current?.contentWindow;
 if (!iframeWin) return;
 const ocean = iframeWin.document.getElementById('ocean');
 if (ocean) {
 const fill = ocean.getAttribute('fill');
 if (fill && fill !== 'none' && !fill.startsWith('url')) {
 container.style.backgroundColor = fill;
 iframeWin.document.body.style.backgroundColor = fill;
 }
 }
 } catch { /* cross-origin */ }
 };

 // 每秒同步一次，以捕捉用户切换地图风格（图层预设）时的颜色变化
 const timer = setInterval(syncOceanBg, 1000);
 // 立即执行一次
 syncOceanBg();
 
 return () => clearInterval(timer);
 }, [loaded]);

 // 当加载完成时，主动触发几次 resize 和 resetView，解决初始黑框（Flexbox 尚未稳定导致 FMG 画布尺寸计算错误）
 useEffect(() => {
 if (!loaded) return;
 const fixInitRender = () => {
 try {
 const iframeWin = iframeRef.current?.contentWindow;
 if (iframeWin) iframeWin.dispatchEvent(new Event('resize'));
 getBridge()?.resetView();
 } catch {}
 };
 
 // 连续触发几次，确保 FMG 彻底读取到容器的最终 Flex 尺寸
 const t1 = setTimeout(fixInitRender, 300);
 const t2 = setTimeout(fixInitRender, 800);
 const t3 = setTimeout(fixInitRender, 1500);
 
 return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
 }, [loaded, getBridge]);

 // 随机生成
 const handleRandomGenerate = useCallback(async () => {
 const { requireFeatureAccess } = await import('../../utils/featureCheck');
 if (!(await requireFeatureAccess('ai_map'))) return;
 if (iframeRef.current) {
 // 移除 FMG 的 beforeunload 弹窗，避免"是否离开网站"提示
 try { (iframeRef.current.contentWindow as any).onbeforeunload = null; } catch { /* cross-origin */ }
 iframeRef.current.src = `${FMG_URL}?seed=${Math.random().toString(36).slice(2, 10)}`;
 setLoaded(false);
 }
 }, []);

 // 保存
 const handleSave = useCallback(() => {
 if (!getBridge()?.saveMapToSlot) {
 showIsland({ type: 'warning', message: '地图未就绪', autoHideMs: 2000 });
 return;
 }
 setSaveNameInput(`地图 ${saves.length + 1}`);
 setShowSaveDialog(true);
 }, [saves, showIsland, getBridge]);

 const confirmSave = useCallback(async () => {
 const name = saveNameInput.trim();
 if (!name) return;
 setShowSaveDialog(false);
 const bridge = getBridge();
 if (!bridge?.saveMapToSlot) return;
 try {
 const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
 const result = await bridge.saveMapToSlot(id);
 if (!result.ok) { showIsland({ type: 'error', message: result.error, autoHideMs: 3000 }); return; }
 const newSave: MapSave = { id, name, savedAt: new Date().toISOString() };
 const updated = [newSave, ...saves];
 setSaves(updated); setSavesState(updated);
 showIsland({ type: 'success', message: `✅ "${name}" 已保存`, autoHideMs: 2000 });
 } catch (e: any) {
 showIsland({ type: 'error', message: `保存失败: ${e.message}`, autoHideMs: 3000 });
 }
 }, [saveNameInput, saves, showIsland, getBridge]);

 const handleLoad = useCallback((save: MapSave) => {
 const bridge = getBridge();
 if (!bridge?.loadMapFromSlot) return;
 bridge.loadMapFromSlot(save.id).then((r: any) => {
 if (r.ok) { showIsland({ type: 'success', message: `已加载 "${save.name}"`, autoHideMs: 2000 }); setShowSaves(false); }
 else showIsland({ type: 'error', message: r.error || '加载失败', autoHideMs: 2000 });
 });
 }, [showIsland, getBridge]);

 const handleDelete = useCallback((save: MapSave) => {
 getBridge()?.deleteMapSlot(save.id);
 const updated = saves.filter(s => s.id !== save.id);
 setSaves(updated); setSavesState(updated);
 showIsland({ type: 'success', message: '已删除', autoHideMs: 1500 });
 }, [saves, showIsland, getBridge]);

 // 撤销/重做
 const handleUndo = useCallback(() => {
 const bridge = getBridge();
 const r = bridge?.undo();
 if (!r?.ok) showIsland({ type: 'warning', message: '没有可撤销的操作', autoHideMs: 1500 });
 }, [showIsland, getBridge]);

 const handleRedo = useCallback(() => {
 const bridge = getBridge();
 const r = bridge?.redo();
 if (!r?.ok) showIsland({ type: 'warning', message: '没有可重做的操作', autoHideMs: 1500 });
 }, [showIsland, getBridge]);

 // 切换图层预设
 const handleSetPreset = useCallback((preset: string) => {
 const bridge = getBridge();
 if (!bridge?.executeCommand) return;
 bridge.executeCommand({ action: 'setLayerPreset', preset });
 setCurrentPreset(preset);
 setShowLayers(false);
 }, [getBridge]);

 // 进入"扩张领土"模式
 const handleStartExpand = useCallback(() => {
 const e = contextMenu.entity;
 if (!e?.state) return;
 const bridge = getBridge();
 bridge?.snapshot?.();
 bridge?.setBrushMode(true, e.state.id, brushRadius);
 setBrushMode({ type: 'expand', sourceStateId: e.state.id, targetStateId: e.state.id });
 setContextMenu(prev => ({ ...prev, visible: false }));
 showIsland({ type: 'success', message: `🖌️ 拖动鼠标扩张 "${e.state.name}" 的领土，按 ESC 完成`, autoHideMs: 3000 });
 }, [contextMenu.entity, brushRadius, getBridge, showIsland]);

 // 进入"失去领土"模式 - 先选目标国家
 const handleStartShrink = useCallback(() => {
 const e = contextMenu.entity;
 if (!e?.state) return;
 setShowTargetPicker({ sourceStateId: e.state.id });
 setContextMenu(prev => ({ ...prev, visible: false }));
 }, [contextMenu.entity]);

 // 选完目标国家，正式进入笔刷模式
 const handlePickTarget = useCallback((targetStateId: number) => {
 if (!showTargetPicker) return;
 const sourceStateId = showTargetPicker.sourceStateId;
 const bridge = getBridge();
 bridge?.snapshot?.();
 bridge?.setBrushMode(true, targetStateId, brushRadius, sourceStateId);
 setBrushMode({ type: 'shrink', sourceStateId, targetStateId });
 setShowTargetPicker(null);
 showIsland({ type: 'success', message: `🖌️ 拖动鼠标把领土划给目标国，按 ESC 完成`, autoHideMs: 3000 });
 }, [showTargetPicker, brushRadius, getBridge, showIsland]);

 // 退出笔刷
 const exitBrush = useCallback(() => {
 const bridge = getBridge();
 bridge?.setBrushMode(false, 0, brushRadius);
 bridge?.snapshot?.();
 setBrushMode(null);
 // 自动保存到 lastMap
 if (bridge?.saveMapToSlot) {
 bridge.saveMapToSlot('_autosave').then(() => {
 showIsland({ type: 'success', message: '✅ 编辑已保存', autoHideMs: 1500 });
 });
 }
 }, [brushRadius, getBridge, showIsland]);

 // ESC 退出
 useEffect(() => {
 if (!brushMode) return;
 const onKey = (e: KeyboardEvent) => {
 if (e.key === 'Escape') exitBrush();
 };
 window.addEventListener('keydown', onKey);
 // iframe 跨域时无法访问 contentWindow.document，用 try-catch 保护
 let iframeDoc: Document | null = null;
 try { iframeDoc = iframeRef.current?.contentWindow?.document ?? null; } catch { /* cross-origin */ }
 iframeDoc?.addEventListener('keydown', onKey as any);
 return () => {
 window.removeEventListener('keydown', onKey);
 try { iframeDoc?.removeEventListener('keydown', onKey as any); } catch { /* cross-origin */ }
 };
 }, [brushMode, exitBrush]);

 // 重置缩放
 const handleResetView = useCallback(() => {
 getBridge()?.resetView();
 }, [getBridge]);

 // 导出 PNG
 const handleExportPNG = useCallback(async () => {
 const bridge = getBridge();
 if (!bridge?.exportPNG) return;
 const dataUrl = await bridge.exportPNG(1);
 if (!dataUrl) { showIsland({ type: 'error', message: '导出失败', autoHideMs: 2000 }); return; }
 const a = document.createElement('a');
 a.href = dataUrl;
 a.download = `map-${Date.now()}.png`;
 a.click();
 showIsland({ type: 'success', message: '已导出 PNG', autoHideMs: 1500 });
 }, [showIsland, getBridge]);

 // 导出 SVG
 const handleExportSVG = useCallback(() => {
 const bridge = getBridge();
 if (!bridge?.exportSVG) return;
 const dataUrl = bridge.exportSVG();
 if (!dataUrl) return;
 const a = document.createElement('a');
 a.href = dataUrl;
 a.download = `map-${Date.now()}.svg`;
 a.click();
 showIsland({ type: 'success', message: '已导出 SVG', autoHideMs: 1500 });
 }, [showIsland, getBridge]);

 // 右键菜单
 useEffect(() => {
 if (!loaded) return;
 let doc: Document | null = null;
 try { doc = iframeRef.current?.contentWindow?.document ?? null; } catch { /* cross-origin */ }
 if (!doc) return;

 function handleContextMenu(e: MouseEvent) {
 e.preventDefault();
 e.stopPropagation();
 const bridge = getBridge();
 if (!bridge?.getEntityAtScreen) return;

 const entity = bridge.getEntityAtScreen(e.clientX, e.clientY);
 if (!entity) return;

 const iframeRect = iframeRef.current!.getBoundingClientRect();
 setContextMenu({
 visible: true,
 x: e.clientX + iframeRect.left,
 y: e.clientY + iframeRect.top,
 entity,
 });
 }

 doc.addEventListener('contextmenu', handleContextMenu);
 return () => { doc?.removeEventListener('contextmenu', handleContextMenu); };
 }, [loaded, getBridge]);

 // 国家笔刷：拖动由 iframe 内部的 d3.drag 处理
 // React 端只在松开鼠标时提交重绘 + 快照
 useEffect(() => {
 if (!brushMode || !loaded) return;
 let doc: Document | null = null;
 try { doc = (iframeRef.current?.contentWindow as any)?.document ?? null; } catch { /* cross-origin */ }
 if (!doc) return;

 function onMouseUp() {
 getBridge()?.flushBrushRedraw();
 getBridge()?.snapshot?.();
 }

 doc.addEventListener('mouseup', onMouseUp);
 return () => {
 doc?.removeEventListener('mouseup', onMouseUp);
 };
 }, [brushMode, loaded, getBridge]);

 // 关闭右键菜单（点击外部，包括 iframe 内）
 useEffect(() => {
 if (!contextMenu.visible) return;
 const close = () => setContextMenu(prev => ({ ...prev, visible: false }));
 window.addEventListener('click', close);
 let iframeDoc: Document | null = null;
 try { iframeDoc = iframeRef.current?.contentWindow?.document ?? null; } catch { /* cross-origin */ }
 iframeDoc?.addEventListener('click', close);
 iframeDoc?.addEventListener('mousedown', close);
 return () => {
 window.removeEventListener('click', close);
 try {
 iframeDoc?.removeEventListener('click', close);
 iframeDoc?.removeEventListener('mousedown', close);
 } catch { /* cross-origin */ }
 };
 }, [contextMenu.visible]);

 // 右键操作
 const handleContextRename = useCallback((type: 'state' | 'burg' | 'river') => {
 const e = contextMenu.entity;
 if (!e) return;
 const target = type === 'state' ? e.state : type === 'burg' ? e.burg : e.river;
 if (!target) return;
 setShowRenameDialog({ type, id: target.id, oldName: target.name || '' });
 setRenameInput(target.name || '');
 setContextMenu(prev => ({ ...prev, visible: false }));
 }, [contextMenu.entity]);

 const confirmRename = useCallback(() => {
 if (!showRenameDialog) return;
 const bridge = getBridge();
 if (!bridge?.executeCommand) return;
 const action = showRenameDialog.type === 'state' ? 'renameState' : showRenameDialog.type === 'burg' ? 'renameBurg' : 'renameRiver';
 bridge.snapshot?.();
 bridge.executeCommand({ action, id: showRenameDialog.id, name: renameInput, fullName: renameInput });
 setShowRenameDialog(null);
 // 自动保存
 bridge.saveMapToSlot?.('_autosave');
 showIsland({ type: 'success', message: '已重命名', autoHideMs: 1500 });
 }, [showRenameDialog, renameInput, showIsland, getBridge]);

 const handleContextDelete = useCallback((type: 'state' | 'burg' | 'river') => {
 const e = contextMenu.entity;
 if (!e) return;
 const target = type === 'state' ? e.state : type === 'burg' ? e.burg : e.river;
 if (!target) return;
 const bridge = getBridge();
 if (!bridge?.executeCommand) return;
 const action = type === 'state' ? 'removeState' : type === 'burg' ? 'removeBurg' : 'removeRiver';
 bridge.snapshot?.();
 bridge.executeCommand({ action, id: target.id });
 setContextMenu(prev => ({ ...prev, visible: false }));
 // 自动保存
 bridge.saveMapToSlot?.('_autosave');
 showIsland({ type: 'success', message: '已删除', autoHideMs: 1500 });
 }, [contextMenu.entity, showIsland, getBridge]);

 // 绘制模式
 const handleStartDraw = useCallback((type: string) => {
 const bridge = getBridge();
 if (!bridge?.setTerrainPaintMode) return;
 bridge.snapshot?.();
 bridge.setTerrainPaintMode(true, type, drawRadius);
 setDrawMode(type);
 setShowDrawPicker(false);
 setContextMenu(prev => ({ ...prev, visible: false }));
 showIsland({ type: 'success', message: `🎨 绘制模式：长按左键拖动绘制，松开完成一笔，按 ESC 退出`, autoHideMs: 3000 });
 }, [getBridge, showIsland, drawRadius]);

 const exitDraw = useCallback(() => {
 const bridge = getBridge();
 bridge?.finishTerrainPaint();
 bridge?.snapshot?.();
 bridge?.saveMapToSlot?.('_autosave');
 setDrawMode(null);
 showIsland({ type: 'success', message: '✅ 绘制完成', autoHideMs: 1500 });
 }, [getBridge, showIsland]);

 // 绘制模式：拖动由 iframe 内部的 d3.drag 处理，React 端只负责 ESC 退出
 useEffect(() => {
 if (!drawMode || !loaded) return;

 function onKey(e: KeyboardEvent) { if (e.key === 'Escape') exitDraw(); }

 let iframeDoc: Document | null = null;
 try { iframeDoc = (iframeRef.current?.contentWindow as any)?.document ?? null; } catch { /* cross-origin */ }
 iframeDoc?.addEventListener('keydown', onKey);
 window.addEventListener('keydown', onKey);
 return () => {
 try { iframeDoc?.removeEventListener('keydown', onKey); } catch { /* cross-origin */ }
 window.removeEventListener('keydown', onKey);
 };
 }, [drawMode, loaded, exitDraw]);

 const icons = {
 random: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/><circle cx="8.5" cy="15.5" r="1.5"/></svg>,
 save: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
 folder: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
 undo: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>,
 redo: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>,
 layers: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>,
 download: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
 zoom: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
 edit: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
 plus: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
 minus: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
 trash: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
 paint: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
 };

 const Btn: React.FC<{ onClick?: () => void; disabled?: boolean; active?: boolean; title?: string; icon?: React.ReactNode; children?: React.ReactNode }> = ({ onClick, disabled, active, title, icon, children }) => (
 <button onClick={onClick} disabled={disabled} title={title}
 className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 disabled:opacity-40 border shrink-0 whitespace-nowrap ${
 active 
 ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-md shadow-[var(--accent)]/20' 
 : 'bg-[#18181b] text-gray-300 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 hover:shadow-sm'
 }`}>
 {icon && <span className={active ? "opacity-100" : "opacity-70"}>{icon}</span>}
 {children}
 </button>
 );

 return (
 <div className="flex flex-1 flex-col overflow-hidden relative" style={{ backgroundColor: '#09090b' }}>
 {/* Toolbar */}
 <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 shrink-0 bg-[#121214]/80 overflow-x-auto [&::-webkit-scrollbar]:hidden shadow-xl z-20 relative">
 {/* 地图操作 */}
 <button onClick={handleRandomGenerate} className="flex items-center shrink-0 whitespace-nowrap gap-1.5 px-3 py-1.5 text-xs font-bold bg-[var(--accent)] text-white hover:brightness-110 rounded-lg transition-all shadow-md shadow-[var(--accent)]/20">
 {icons.random}
 随机生成
 </button>
 <Btn onClick={handleSave} disabled={!loaded} title="保存当前地图" icon={icons.save}>保存</Btn>
 <Btn onClick={() => setShowSaves(!showSaves)} active={showSaves} title="存档列表" icon={icons.folder}>{saves.length}</Btn>

 <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

 {/* 编辑工具 */}
 <Btn onClick={handleUndo} disabled={!loaded} title="撤销" icon={icons.undo} />
 <Btn onClick={handleRedo} disabled={!loaded} title="重做" icon={icons.redo} />

 <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

 {/* 显示效果 */}
 <Btn onClick={() => setShowLayers(!showLayers)} active={showLayers} disabled={!loaded} title="切换显示效果" icon={icons.layers}>
 {LAYER_PRESETS.find(p => p.id === currentPreset)?.label?.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').trim() || '显示'}
 </Btn>

 <div className="w-px h-5 bg-white/10 mx-1 shrink-0" />

 {/* 导出 */}
 <Btn onClick={handleExportPNG} disabled={!loaded} title="导出 PNG">PNG</Btn>
 <Btn onClick={handleExportSVG} disabled={!loaded} title="导出 SVG">SVG</Btn>
 <Btn onClick={handleResetView} disabled={!loaded} title="重置缩放" icon={icons.zoom} />

 <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-gray-400 flex items-center gap-1.5 font-medium px-3 py-1.5 bg-[#18181b] rounded-lg border border-white/5" title="右键地图 → 编辑实体">
 <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
 右键地图编辑实体
 </span>
 </div>

 {/* Brush status bar */}
 {brushMode && (
 <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-1.5 shrink-0 bg-blue-50 dark:bg-blue-900/20">
 <span className="text-[10px] font-bold text-[var(--text-primary)]">
 🖌️ {brushMode.type === 'expand' ? '扩张领土模式' : '失去领土模式'}
 </span>
 <span className="text-[10px] text-[var(--text-muted)]">范围：</span>
 <input type="range" min="5" max="40" value={brushRadius}
 onChange={e => { const r = +e.target.value; setBrushRadius(r); getBridge()?.setBrushMode(true, brushMode.targetStateId, r, brushMode.type === 'shrink' ? brushMode.sourceStateId : undefined); }}
 className="w-24" />
 <span className="text-[10px] text-[var(--text-muted)]">{brushRadius}</span>
 <span className="ml-auto text-[10px] text-[var(--text-muted)]">按 ESC 完成</span>
 <button onClick={exitBrush} className="px-2 py-0.5 text-[10px] font-bold bg-green-600 text-white rounded">✓ 完成</button>
 </div>
 )}

 {/* Draw mode status bar */}
 {drawMode && (
 <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-1.5 shrink-0 bg-orange-50 dark:bg-orange-900/20">
 <span className="text-[10px] font-bold text-[var(--text-primary)]">
 🎨 绘制模式：{drawMode === 'mountain' ? '⛰ 山体' : drawMode === 'forest' ? '🌲 树林' : drawMode === 'snow' ? '❄ 雪地' : drawMode === 'desert' ? '🏜 沙漠' : drawMode === 'lake' ? '💧 湖泊' : drawMode === 'swamp' ? '🌿 沼泽' : '🌊 河流'}
 </span>
 <span className="text-[10px] text-[var(--text-muted)]">粗细：</span>
 <input type="range" min="5" max="100" value={drawRadius}
 onChange={e => { const r = +e.target.value; setDrawRadius(r); getBridge()?.setTerrainPaintMode(true, drawMode!, r); }}
 className="w-20" />
 <span className="text-[10px] text-[var(--text-muted)]">{drawRadius}</span>
 <span className="text-[10px] text-[var(--text-muted)]">长按左键拖动绘制</span>
 <span className="ml-auto text-[10px] text-[var(--text-muted)]">按 ESC 退出</span>
 <button onClick={exitDraw} className="px-2 py-0.5 text-[10px] font-bold bg-green-600 text-white rounded">✓ 完成</button>
 </div>
 )}

 {/* Saves dropdown */}
 {showSaves && (
 <div className="border-b border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 max-h-[200px] overflow-y-auto">
 {saves.length === 0 ? (
 <div className="text-xs text-[var(--text-muted)] text-center py-2">暂无存档</div>
 ) : (
 <div className="space-y-1">
 {saves.map(save => (
 <div key={save.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--bg-tertiary)] group">
 <div className="flex-1 min-w-0">
 <div className="text-xs font-bold text-[var(--text-primary)] truncate">{save.name}</div>
 <div className="text-[10px] text-[var(--text-muted)]">{new Date(save.savedAt).toLocaleString('zh-CN')}</div>
 </div>
 <button onClick={() => handleLoad(save)} className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded opacity-0 group-hover:opacity-100">加载</button>
 <button onClick={() => handleDelete(save)} className="px-2 py-0.5 text-[10px] bg-red-600 text-white rounded opacity-0 group-hover:opacity-100">删除</button>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Layer presets dropdown */}
 {showLayers && (
 <div className="border-b border-[var(--border-color)] bg-[var(--surface)] px-3 py-2">
 <div className="grid grid-cols-3 gap-1.5">
 {LAYER_PRESETS.map(preset => (
 <button key={preset.id} onClick={() => handleSetPreset(preset.id)}
 className={`px-2 py-2 text-[10px] rounded text-left transition-all ${currentPreset === preset.id ? 'bg-[var(--accent)]/20 border border-[var(--accent)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'}`}>
 <div className="font-bold text-[var(--text-primary)]">{preset.label}</div>
 <div className="text-[var(--text-muted)] text-[9px] mt-0.5">{preset.desc}</div>
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Save Dialog */}
 {showSaveDialog && (
 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSaveDialog(false)}>
 <div className="bg-[var(--surface)] rounded-lg shadow-xl p-5 w-[320px] space-y-4" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-bold text-[var(--text-primary)]">💾 保存地图</h3>
 <button onClick={() => setShowSaveDialog(false)} className="text-[var(--text-muted)]">✕</button>
 </div>
 <input value={saveNameInput} onChange={e => setSaveNameInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') confirmSave(); }} autoFocus
 className="w-full px-3 py-2 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
 <div className="flex gap-2 justify-end">
 <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">取消</button>
 <button onClick={confirmSave} disabled={!saveNameInput.trim()} className="px-3 py-1.5 text-xs font-bold rounded bg-green-600 text-white disabled:opacity-50">保存</button>
 </div>
 </div>
 </div>
 )}

 {/* Draw Picker */}
 {showDrawPicker && (
 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDrawPicker(false)}>
 <div className="bg-[var(--surface)] rounded-lg shadow-xl p-5 w-[340px] space-y-4" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-bold text-[var(--text-primary)]">🎨 选择绘制类型</h3>
 <button onClick={() => setShowDrawPicker(false)} className="text-[var(--text-muted)]">✕</button>
 </div>
 <div className="grid grid-cols-3 gap-2">
 {[
 { id: 'mountain', label: '⛰ 山体', color: '#6b5b4a' },
 { id: 'forest', label: '🌲 树林', color: '#2d6b22' },
 { id: 'snow', label: '❄ 雪地', color: '#dce8e8' },
 { id: 'desert', label: '🏜 沙漠', color: '#d4ac6e' },
 { id: 'lake', label: '💧 湖泊', color: '#2980b9' },
 { id: 'swamp', label: '🌿 沼泽', color: '#4a6741' },
 { id: 'river', label: '🌊 河流', color: '#3498db' },
 ].map(t => (
 <button key={t.id} onClick={() => handleStartDraw(t.id)}
 className="px-2 py-3 text-xs rounded border border-[var(--border-color)] hover:border-[var(--accent)] text-center transition-all hover:scale-105"
 style={{ backgroundColor: t.color + '20' }}>
 <div className="text-lg">{t.label.split(' ')[0]}</div>
 <div className="text-[var(--text-primary)] mt-1">{t.label.split(' ')[1]}</div>
 </button>
 ))}
 </div>
 <div className="text-[10px] text-[var(--text-muted)] text-center">选择后拖动鼠标在地图上绘制，按 ESC 完成</div>
 </div>
 </div>
 )}

 {/* Rename Dialog */}
 {showRenameDialog && (
 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRenameDialog(null)}>
 <div className="bg-[var(--surface)] rounded-lg shadow-xl p-5 w-[320px] space-y-4" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-bold text-[var(--text-primary)]">✏️ 重命名 {showRenameDialog.type === 'state' ? '国家' : showRenameDialog.type === 'burg' ? '城市' : '河流'}</h3>
 <button onClick={() => setShowRenameDialog(null)} className="text-[var(--text-muted)]">✕</button>
 </div>
 <div className="text-[10px] text-[var(--text-muted)]">原名：{showRenameDialog.oldName}</div>
 <input value={renameInput} onChange={e => setRenameInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') confirmRename(); }} autoFocus
 className="w-full px-3 py-2 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
 <div className="flex gap-2 justify-end">
 <button onClick={() => setShowRenameDialog(null)} className="px-3 py-1.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">取消</button>
 <button onClick={confirmRename} disabled={!renameInput.trim()} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-600 text-white disabled:opacity-50">确定</button>
 </div>
 </div>
 </div>
 )}

 {/* Target State Picker (for shrink mode) */}
 {showTargetPicker && (
 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTargetPicker(null)}>
 <div className="bg-[var(--surface)] rounded-lg shadow-xl p-5 w-[360px] max-h-[500px] flex flex-col" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between mb-3">
 <h3 className="text-sm font-bold text-[var(--text-primary)]">🟡 选择失去的领土归谁</h3>
 <button onClick={() => setShowTargetPicker(null)} className="text-[var(--text-muted)]">✕</button>
 </div>
 <div className="text-[10px] text-[var(--text-muted)] mb-2">来源：{getBridge()?.getMapSummary()?.states?.find((s: any) => s.id === showTargetPicker.sourceStateId)?.name}</div>
 <div className="flex-1 overflow-y-auto space-y-1">
 <button onClick={() => handlePickTarget(0)}
 className="w-full px-3 py-2 text-xs text-left rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]">
 🏳️ 中立地区（无主之地）
 </button>
 {(getBridge()?.getMapSummary()?.states || [])
 .filter((s: any) => s.id !== showTargetPicker.sourceStateId)
 .map((s: any) => (
 <button key={s.id} onClick={() => handlePickTarget(s.id)}
 className="w-full px-3 py-2 text-xs text-left rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] flex items-center gap-2">
 <span className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
 {s.name}
 </button>
 ))}
 </div>
 </div>
 </div>
 )}

 {/* Map */}
 <div className="flex-1 min-h-0 relative">
 {!loaded && (
 <div className="absolute inset-0 flex items-center justify-center bg-[#09090b] z-10">
 <div className="text-center space-y-4 animate-pulse">
 <div className="text-5xl opacity-80">🌍</div>
 <div className="text-sm font-bold text-gray-400 tracking-widest">正在生成 AI 世界...</div>
 </div>
 </div>
 )}
 <iframe ref={iframeRef} src={FMG_URL} className="w-full h-full border-0" onLoad={() => setLoaded(true)} title="FMG" />
 </div>

 {/* Context Menu */}
 {contextMenu.visible && contextMenu.entity && (
 <div className="fixed z-[100] bg-[var(--surface)]/95 border border-[var(--border-color)] rounded-lg shadow-xl py-1.5 min-w-[200px] transform origin-top-left"
 style={{ left: contextMenu.x, top: contextMenu.y }}
 onClick={e => e.stopPropagation()}>
 {contextMenu.entity.state && (
 <>
 <div className="px-3 py-2 text-xs font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] flex items-center gap-2 mb-1">
 <span className="w-2 h-2 rounded-full" style={{backgroundColor: contextMenu.entity.state.color || 'var(--accent)'}} />
 {contextMenu.entity.state.name}
 </div>
 <button onClick={() => handleContextRename('state')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors">{icons.edit} 重命名国家</button>
 <button onClick={handleStartExpand} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-green-500 hover:text-green-400 transition-colors">{icons.plus} 扩张领土</button>
 <button onClick={handleStartShrink} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] text-amber-500 hover:text-amber-400 transition-colors">{icons.minus} 失去领土</button>
 <div className="h-px bg-[var(--border-color)] my-1 mx-2" />
 <button onClick={() => handleContextDelete('state')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-red-500 hover:bg-red-500/10 transition-colors">{icons.trash} 删除国家</button>
 </>
 )}
 {contextMenu.entity.burg && (
 <>
 <div className="px-3 py-2 text-xs font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] mb-1">
 城市：{contextMenu.entity.burg.name}{contextMenu.entity.burg.capital ? ' (首都)' : ''}
 </div>
 <button onClick={() => handleContextRename('burg')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors">{icons.edit} 重命名城市</button>
 <div className="h-px bg-[var(--border-color)] my-1 mx-2" />
 <button onClick={() => handleContextDelete('burg')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-red-500 hover:bg-red-500/10 transition-colors">{icons.trash} 删除城市</button>
 </>
 )}
 {contextMenu.entity.river && (
 <>
 <div className="px-3 py-2 text-xs font-bold text-[var(--text-muted)] border-b border-[var(--border-color)] mb-1">
 河流：{contextMenu.entity.river.name}
 </div>
 <button onClick={() => handleContextRename('river')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors">{icons.edit} 重命名河流</button>
 <div className="h-px bg-[var(--border-color)] my-1 mx-2" />
 <button onClick={() => handleContextDelete('river')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-red-500 hover:bg-red-500/10 transition-colors">{icons.trash} 删除河流</button>
 </>
 )}
 <div className="border-t border-[var(--border-color)] mt-1 pt-1">
 <button onClick={() => { setShowDrawPicker(true); setContextMenu(prev => ({ ...prev, visible: false })); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">{icons.paint} 绘制地形</button>
 </div>
 </div>
 )}
 </div>
 );
}
