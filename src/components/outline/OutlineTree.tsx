// OutlineTree 
/**
 * @module OutlineVision/Tree
 * @description 大纲画布：用户手动摆放节点、连接关系、固定节点位置。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
 Node,
 Edge,
 Panel,
 useNodesState,
 useEdgesState,
 useReactFlow,
 ReactFlowProvider,
 addEdge,
 applyEdgeChanges,
 ConnectionMode,
 ConnectionLineType,
 type Connection,
 type EdgeChange
} from 'reactflow';
import 'reactflow/dist/style.css';
import { OutlineNode, OutlineNodeLite } from './OutlineNode';
import { useBookStore } from '../../store/useBookStore';
import { useAppStore } from '../../store/useAppStore';
import { ChronoIcon } from '../common/ChronoIcon';
import { useIslandStore } from '../../store/useIslandStore';
import { convertAiTreeToSegmentNodes } from '../../utils/ovConverter';
import { electronAPI } from '../../utils/electron';
import { VolumeDropdown } from './VolumeDropdown';
import { shallow } from 'zustand/shallow';
import type { OutlineVisionData } from '../../types/ov';

const DEFAULT_EDGE_STYLE = { stroke: '#7c92ff', strokeWidth: 1.35, opacity: 0.95 } as const;
const CONNECTION_LINE_STYLE = { stroke: '#7c92ff', strokeWidth: 1, opacity: 0.92 } as const;
const VIRTUAL_ROOT_ID = '__ov_virtual_root__';
const isVirtualRootId = (id: string) => id === VIRTUAL_ROOT_ID;
const roundPoint = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) });
const isPinnedRootNode = (node: Pick<Node, 'id' | 'data'>) => {
 if (isVirtualRootId(node.id)) return true;
 return String((node.data as any)?.title || '').trim() === '总纲';
};

function flattenVisionNodes(source: OutlineVisionData['nodes'], mode: 'saved' | 'cone' = 'cone'): { nodes: Node[] } {
 const nodes: Node[] = [];
 const levels = new Map<number, string[]>();
 const savedPositionIds = new Set<string>();
 let cursor = 0;
 const hasMultiRoot = source.length > 1;
 const depthOffset = hasMultiRoot ? 1 : 0;

 const walk = (items: OutlineVisionData['nodes'], depth = 0) => {
 items.forEach((item) => {
 const saved = item.position;
 const position =
 saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
 ? roundPoint(saved.x, saved.y)
 : roundPoint(depth * 320, cursor * 120);
 if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
 savedPositionIds.add(item.id);
 }
 cursor += 1;
 const level = depth + depthOffset;
 const bucket = levels.get(level) || [];
 bucket.push(item.id);
 levels.set(level, bucket);

 nodes.push({
 id: item.id,
 type: 'outline',
 data: { ...item },
 position,
 draggable: !(depth === 0 && String(item.title || '').trim() === '总纲')
 });

 if (Array.isArray(item.children) && item.children.length > 0) {
 walk(item.children, depth + 1);
 }
 });
 };

 walk(source);
 if (hasMultiRoot) {
 nodes.push({
 id: VIRTUAL_ROOT_ID,
 type: 'outline',
 data: {
 id: VIRTUAL_ROOT_ID,
 title: '总纲',
 type: 'arc',
 targetWordCount: 0,
 actualWordCount: 0,
 virtual: true
 } as any,
 position: { x: 80, y: 0 },
 draggable: false,
 selectable: true
 });
 levels.set(0, [VIRTUAL_ROOT_ID]);

 }

 if (mode === 'cone') {
 const nodeMap = new Map(nodes.map((node) => [node.id, node]));
 const X_GAP = 430;
 const BASE_Y_STEP = 150;

 Array.from(levels.entries())
 .sort((a, b) => a[0] - b[0])
 .forEach(([depth, ids]) => {
 const count = ids.length;
 const yStep = BASE_Y_STEP + Math.min(36, depth * 4);
 ids.forEach((id, idx) => {
 const node = nodeMap.get(id);
 if (!node) return;
 if (savedPositionIds.has(id)) return;
 const y = count <= 1 ? 0 : (idx - (count - 1) / 2) * yStep;
 node.position = roundPoint(80 + depth * X_GAP, y);
 });
 });
 }
 return { nodes };
}

function normalizeVisionEdges(candidate: OutlineVisionData['edges'], validNodeIds: Set<string>): Edge[] {
 if (!Array.isArray(candidate)) return [];
 return candidate
 .filter((item) => validNodeIds.has(item.source) && validNodeIds.has(item.target))
 .map((item) => ({
 id: item.id,
 source: item.source,
 target: item.target,
 type: item.type || 'straight',
 animated: false,
 style: DEFAULT_EDGE_STYLE
 }));
}

function toPersistedEdges(edges: Edge[]): NonNullable<OutlineVisionData['edges']> {
 return edges.map((edge) => ({
 id: edge.id,
 source: edge.source,
 target: edge.target,
 type: edge.type === 'bezier' ? 'bezier' : 'straight'
 }));
}

function OutlineTreeInner({ resizeSignal = 0 }: { resizeSignal?: number }) {
 const bookId = useAppStore((s) => s.activeBookId);
 const jumpTargetId = useAppStore((s) => s.outlineVisionJumpTargetId);
 const setJumpTargetId = useAppStore((s) => s.setOutlineVisionJumpTargetId);
 const openEditor = useAppStore((s) => s.openEditor);
 const { books, updateOutlineVision, syncOutlineProgress, importOutlineFromText, updateOutlineNode, addOutlineNode, deleteOutlineNode } = useBookStore(
 (s) => ({
 books: s.books,
 updateOutlineVision: s.updateOutlineVision,
 syncOutlineProgress: s.syncOutlineProgress,
 importOutlineFromText: s.importOutlineFromText,
 updateOutlineNode: s.updateOutlineNode,
 addOutlineNode: s.addOutlineNode,
 deleteOutlineNode: s.deleteOutlineNode
 }),
 shallow
 );
 const showIsland = useIslandStore((s) => s.show);
 const { fitView, getNodes, zoomIn, zoomOut } = useReactFlow();

 // 档案读权威 memory.json，避免用 book.json 旧快照显示 AI 推演
 useEffect(() => {
  if (!bookId) return;
  void useBookStore.getState().loadMemoryBank(bookId);
 }, [bookId]);

 const detachedMode = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 return params.get('outlineDetached') === '1';
 }, []);

 const book = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);
 const visionData = book?.outlineVision;

 const [nodes, setNodes, onNodesChange] = useNodesState([]);
 const [edges, setEdges] = useEdgesState([]);
 const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
 const initializedRef = useRef(false);

 const useLiteNode = detachedMode || nodes.length > 220;
 const nodeTypes = useMemo(
 () => ({
 outline: useLiteNode ? OutlineNodeLite : OutlineNode
 }),
 [useLiteNode]
 );

 const persistEdges = useCallback(
 async (nextEdges: Edge[]) => {
 if (!bookId || !book?.outlineVision) return;
 await updateOutlineVision(
 bookId,
 {
 ...book.outlineVision,
 edges: toPersistedEdges(nextEdges),
 lastSyncedAt: new Date().toISOString()
 },
 { persist: true }
 );
 },
 [book, bookId, updateOutlineVision]
 );

 useEffect(() => {
 if (!visionData?.nodes) return;
 const { nodes: flatNodes } = flattenVisionNodes(visionData.nodes, 'cone');
 const nodeIdSet = new Set(flatNodes.map((node) => node.id));
 const loadedEdges = normalizeVisionEdges(visionData.edges, nodeIdSet);

 setNodes(flatNodes);
 // 
 setEdges(loadedEdges);

 if (!initializedRef.current && flatNodes.length > 0) {
 initializedRef.current = true;
 setTimeout(
 () =>
 fitView({
 padding: 0.22,
 duration: 0,
 minZoom: flatNodes.length <= 24 ? 1 : 0.18,
 maxZoom: flatNodes.length <= 24 ? 1 : 1.35
 }),
 40
 );
 }
 }, [fitView, setEdges, setNodes, visionData?.edges, visionData?.nodes]);

 useEffect(() => {
 if (!resizeSignal) return;
 const timer = window.setTimeout(() => {
 if (getNodes().length === 0) return;
 const nodeCount = getNodes().length;
 fitView({
 padding: 0.22,
 duration: 0,
 minZoom: nodeCount <= 24 ? 1 : 0.18,
 maxZoom: nodeCount <= 24 ? 1 : 1.35
 });
 }, 60);
 return () => window.clearTimeout(timer);
 }, [fitView, getNodes, resizeSignal]);

 useEffect(() => {
 if (!jumpTargetId) return;
 fitView({
 nodes: [{ id: jumpTargetId }],
 duration: 0,
 padding: 0.75,
 minZoom: 0.18,
 maxZoom: 1.35
 });
 setJumpTargetId(null);
 }, [fitView, jumpTargetId, setJumpTargetId]);

 useEffect(() => {
 if (!bookId) return undefined;
 const timer = window.setTimeout(() => {
 void syncOutlineProgress(bookId);
 }, 220);
 return () => window.clearTimeout(timer);
 }, [bookId, syncOutlineProgress, book?.chapters]);

 const handleNodeDragStop = useCallback(
 (_event: React.MouseEvent | MouseEvent, node: Node) => {
 if (!bookId) return;
 if (isPinnedRootNode(node)) return;
 void updateOutlineNode(bookId, node.id, {
 position: {
 x: Math.round(node.position.x),
 y: Math.round(node.position.y)
 }
 });
 },
 [bookId, updateOutlineNode]
 );

 const closeContextMenu = useCallback(() => {
 setContextMenu(null);
 }, []);

 const handleConnect = useCallback(
 (connection: Connection) => {
 if (!connection.source || !connection.target) return;
 const next = addEdge(
 {
 ...connection,
 id: `e-link-${connection.source}-${connection.target}-${crypto.randomUUID().slice(0, 6)}`,
 type: 'straight',
 animated: false,
 style: DEFAULT_EDGE_STYLE
 },
 edges
 );
 setEdges(next);
 void persistEdges(next);
 },
 [edges, persistEdges, setEdges]
 );

 const handleEdgesChange = useCallback(
 (changes: EdgeChange[]) => {
 const next = applyEdgeChanges(changes, edges);
 setEdges(next);
 const touched = changes.some((change) => change.type === 'remove');
 if (touched) {
 void persistEdges(next);
 }
 },
 [edges, persistEdges, setEdges]
 );

 const handleEdgeDoubleClick = useCallback(
 (_event: React.MouseEvent, edge: Edge) => {
 const next = edges.filter((item) => item.id !== edge.id);
 setEdges(next);
 void persistEdges(next);
 showIsland({ type: 'success', message: '已删除连线', autoHideMs: 900 });
 },
 [edges, persistEdges, setEdges, showIsland]
 );

 const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
 if (isVirtualRootId(node.id)) return;
 event.preventDefault();
 event.stopPropagation();
 setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
 }, []);

 const handleDisconnectNode = useCallback(() => {
 if (!contextMenu) return;
 const nodeId = contextMenu.nodeId;
 const nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
 setEdges(nextEdges);
 void persistEdges(nextEdges);
 closeContextMenu();
 showIsland({ type: 'success', message: '已断开该节点所有连线', autoHideMs: 1000 });
 }, [closeContextMenu, contextMenu, edges, persistEdges, setEdges, showIsland]);

 const handleDeleteNodeFromMenu = useCallback(async () => {
 if (!contextMenu || !bookId) return;
 const targetNode = nodes.find((node) => node.id === contextMenu.nodeId);
 if (!targetNode) {
 closeContextMenu();
 return;
 }
 if (isPinnedRootNode(targetNode)) {
 closeContextMenu();
 showIsland({ type: 'warning', message: '总纲节点不可删除', autoHideMs: 1200 });
 return;
 }
 const ok = window.confirm('删除该节点及其所有子节点？');
 if (!ok) {
 closeContextMenu();
 return;
 }

 const nextEdges = edges.filter((edge) => edge.source !== targetNode.id && edge.target !== targetNode.id);
 setEdges(nextEdges);
 await persistEdges(nextEdges);
 await deleteOutlineNode(bookId, targetNode.id);
 closeContextMenu();
 showIsland({ type: 'success', message: '节点已删除', autoHideMs: 1000 });
 }, [bookId, closeContextMenu, contextMenu, deleteOutlineNode, edges, nodes, persistEdges, setEdges, showIsland]);

 useEffect(() => {
 if (!contextMenu) return undefined;
 const onWindowClick = () => setContextMenu(null);
 const onEsc = (event: KeyboardEvent) => {
 if (event.key === 'Escape') setContextMenu(null);
 };
 window.addEventListener('click', onWindowClick);
 window.addEventListener('keydown', onEsc);
 return () => {
 window.removeEventListener('click', onWindowClick);
 window.removeEventListener('keydown', onEsc);
 };
 }, [contextMenu]);

 const handleImportFromAi = useCallback(async () => {
 if (!book) return;
 const inference = book.memoryBank?.find((m) => m.aiInference)?.aiInference;
 if (!inference?.structureTree) {
 showIsland({ type: 'warning', message: '未找到结构推断结果，请先执行推断', autoHideMs: 3000 });
 return;
 }

 const taskId = useIslandStore.getState().startTask({ type: 'progress', status: 'thinking', message: '正在同步推断结构...' });
 try {
 const newNodes = convertAiTreeToSegmentNodes(inference.structureTree, book.chapters.length);
 await updateOutlineVision(book.id, {
 nodes: newNodes,
 edges: [],
 version: (visionData?.version || 0) + 1,
 lastSyncedAt: new Date().toISOString()
 });
 useIslandStore.getState().finishTask(taskId);
 showIsland({ type: 'success', message: `同步完成，已合并 ${newNodes.length} 个剧情节点`, autoHideMs: 1800 });
 } catch (err) {
 useIslandStore.getState().finishTask(taskId);
 showIsland({ type: 'error', message: '同步失败', detail: String(err) });
 }
 }, [book, showIsland, updateOutlineVision, visionData?.version]);

 const handleImportFromFile = useCallback(async () => {
 if (!book) return;
 const selected = await electronAPI.fs.selectFile({
 title: '上传大纲文件',
 filters: [{ name: 'Text/Markdown/JSON/DOCX', extensions: ['txt', 'md', 'json', 'docx'] }]
 });
 if (typeof selected?.path !== 'string' || selected.path.length === 0) return;

 showIsland({ type: 'progress', status: 'thinking', message: '正在识别上传大纲...' });
 try {
 const imported = await electronAPI.fs.importTxt({ filePath: selected.path });
 const content = typeof imported?.content === 'string' ? imported.content : '';
 await importOutlineFromText(book.id, content);
 showIsland({ type: 'success', message: '大纲导入成功', autoHideMs: 1600 });
 } catch (err) {
 showIsland({ type: 'error', message: '大纲导入失败', detail: String(err) });
 }
 }, [book, importOutlineFromText, showIsland]);

 const handleZoomIn = useCallback(() => {
 void zoomIn({ duration: 120 });
 }, [zoomIn]);

 const handleZoomOut = useCallback(() => {
 void zoomOut({ duration: 120 });
 }, [zoomOut]);

 const handleFitCanvas = useCallback(() => {
 const count = getNodes().length;
 if (count === 0) return;
 fitView({
 padding: 0.22,
 duration: 120,
 minZoom: count <= 24 ? 1 : 0.18,
 maxZoom: count <= 24 ? 1 : 1.35
 });
 }, [fitView, getNodes]);

 const onNodeClick = useCallback(
 (_event: React.MouseEvent, node: Node) => {
 if (isVirtualRootId(node.id)) return;
 const chapterId = (node.data as any)?.chapterId;
 if (chapterId && bookId) {
 openEditor(bookId, chapterId);
 showIsland({ type: 'success', message: `已跳转：${(node.data as any)?.title || '章节'}`, autoHideMs: 1000 });
 }
 },
 [bookId, openEditor, showIsland]
 );

 const handleAddRootNode = useCallback(async () => {
 if (!bookId) return;
 await addOutlineNode(bookId, null, {
 title: `剧情节点${nodes.length + 1}`,
 type: 'event',
 targetWordCount: 2200
 });
 }, [addOutlineNode, bookId, nodes.length]);

 const handleDeleteMindMap = useCallback(async () => {
 if (!bookId || !visionData) return;
 const first = window.confirm('删除整个导图？这会清空全部大纲节点和连线。');
 if (!first) return;
 const second = window.confirm('最终确认：该操作不可撤销，是否继续？');
 if (!second) return;

 await updateOutlineVision(bookId, {
 ...visionData,
 nodes: [],
 edges: [],
 version: (visionData.version || 0) + 1,
 lastSyncedAt: new Date().toISOString()
 });
 showIsland({ type: 'success', message: '已清空思维导图', autoHideMs: 1200 });
 }, [bookId, showIsland, updateOutlineVision, visionData]);

 return (
 <div className="h-full w-full overflow-hidden"style={{ background: detachedMode ? '#0b1220' : 'transparent' }}>
 <ReactFlow
 nodes={nodes}
 edges={edges}
 proOptions={{ hideAttribution: true }}
 nodeTypes={nodeTypes}
 onNodesChange={onNodesChange}
 onEdgesChange={handleEdgesChange}
 onNodeClick={onNodeClick}
 onNodeContextMenu={handleNodeContextMenu}
 onNodeDragStop={handleNodeDragStop}
 onConnect={handleConnect}
 onEdgeDoubleClick={handleEdgeDoubleClick}
 onPaneClick={closeContextMenu}
 defaultEdgeOptions={{ style: DEFAULT_EDGE_STYLE, animated: false, type: 'straight' }}
 connectionMode={ConnectionMode.Loose}
 connectionLineType={ConnectionLineType.Straight}
 connectionLineStyle={CONNECTION_LINE_STYLE}
 nodesDraggable
 nodesConnectable
 elementsSelectable
 selectNodesOnDrag={false}
 panOnDrag
 onlyRenderVisibleElements
 minZoom={0.12}
 maxZoom={1.6}
 className="wz-outline-tree"
 >
 {contextMenu && (
 <Panel
 position="top-left"
 style={{ left: contextMenu.x, top: contextMenu.y }}
 className="z-[1200] border border-white/20 bg-[#111a2de8] p-1 shadow-2xl "
 >
 <button
 onClick={handleDisconnectNode}
 className="block w-full px-3 py-2 text-left text-xs font-semibold text-white/90 hover:bg-white/10"
 >
 取消连线
 </button>
 <button
 onClick={() => void handleDeleteNodeFromMenu()}
 className="block w-full px-3 py-2 text-left text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
 >
 删除节点
 </button>
 </Panel>
 )}

 <Panel position="top-right"className="flex gap-2">
 <VolumeDropdown />
 <button
 onClick={handleAddRootNode}
 className="flex items-center gap-2 bg-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/25"
 >
 <ChronoIcon name="vision"size={14} />
 <span>新增节点</span>
 </button>
 <button
 onClick={handleDeleteMindMap}
 className="flex items-center gap-2 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/35"
 >
 <ChronoIcon name="back"size={14} />
 <span>删除导图</span>
 </button>
 <button
 onClick={handleImportFromFile}
 className="flex items-center gap-2 bg-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/25"
 >
 <ChronoIcon name="export"size={14} />
 <span>上传导入</span>
 </button>
 <button
 onClick={handleImportFromAi}
 className="flex items-center gap-2 bg-indigo-500/80 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-600"
 >
 <ChronoIcon name="ai-assistant"size={14} />
 <span>AI 同步</span>
 </button>
 </Panel>

 <Panel position="bottom-right"className="flex flex-col gap-2">
 <button
 onClick={handleZoomIn}
 title="放大"
 className="h-9 w-9 rounded-full border border-white/20 bg-white/12 text-white hover:bg-white/25"
 >
 <svg viewBox="0 0 24 24"className="mx-auto h-4 w-4"fill="none"stroke="currentColor"strokeWidth="2.2">
 <path d="M12 6v12M6 12h12"/>
 </svg>
 </button>
 <button
 onClick={handleZoomOut}
 title="缩小"
 className="h-9 w-9 rounded-full border border-white/20 bg-white/12 text-white hover:bg-white/25"
 >
 <svg viewBox="0 0 24 24"className="mx-auto h-4 w-4"fill="none"stroke="currentColor"strokeWidth="2.2">
 <path d="M6 12h12"/>
 </svg>
 </button>
 <button
 onClick={handleFitCanvas}
 title="适配画布"
 className="h-9 w-9 rounded-full border border-white/20 bg-white/12 text-white hover:bg-white/25"
 >
 <svg viewBox="0 0 24 24"className="mx-auto h-4 w-4"fill="none"stroke="currentColor"strokeWidth="1.8">
 <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
 </svg>
 </button>
 </Panel>

 <Panel position="bottom-left"className="wz-outline-stats-panel border border-white/10 bg-white/5 p-4">
 <div className="flex flex-col gap-1">
 <span className="text-[10px] font-black uppercase tracking-widest text-white/40">画布统计</span>
 <div className="flex items-center gap-4">
 <div className="flex flex-col">
 <span className="text-xs font-bold text-white/80">{nodes.filter((n) => !isVirtualRootId(n.id)).length}</span>
 <span className="text-[9px] text-white/40">节点</span>
 </div>
 <div className="h-6 w-px bg-white/10"/>
 <div className="flex flex-col">
 <span className="text-xs font-bold text-white/80">{edges.length}</span>
 <span className="text-[9px] text-white/40">连线</span>
 </div>
 <div className="h-6 w-px bg-white/10"/>
 <div className="flex flex-col">
 <span className="text-xs font-bold text-secondary">
 {nodes.reduce((sum, n) => sum + (((n.data as any)?.targetWordCount as number) || 0), 0).toLocaleString()}
 </span>
 <span className="text-[9px] text-white/40">规划字数</span>
 </div>
 </div>
 </div>
 </Panel>
 </ReactFlow>
 </div>
 );
}

export function OutlineTree({ resizeSignal = 0 }: { resizeSignal?: number }) {
 return (
 <ReactFlowProvider>
 <OutlineTreeInner resizeSignal={resizeSignal} />
 </ReactFlowProvider>
 );
}



