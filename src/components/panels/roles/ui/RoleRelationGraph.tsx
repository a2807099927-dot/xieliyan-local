// 模块说明：角色关系图组件。
// 关键职责：用 reactflow 渲染角色关系网络。
import type { RelationEdge } from '../rolePanelLogic';

interface RoleRelationGraphProps {
 edges: RelationEdge[];
 selectedEdgeId: string | null;
 selectedEdge: RelationEdge | null;
 nodeById: Map<string, string>;
 onSelectEdge: (id: string) => void;
 onBackToList: () => void;
}

export function RoleRelationGraph({
 edges,
 selectedEdgeId,
 selectedEdge,
 nodeById,
 onSelectEdge,
 onBackToList
}: RoleRelationGraphProps) {
 return (
 <section className="wz-modal-enter flex min-h-[420px] w-full flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 shadow-xl backdrop-blur-[20px]">
 <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
 <div>
 <div className="text-sm font-semibold text-[var(--text-primary)]">角色关系图谱</div>
 <div className="text-xs text-[var(--text-muted)]">
  来自角色卡上的关系字段（时间线 / 关系备注），不扫描章节正文。点击卡片查看明细。
 </div>
 </div>
 <button className="wz-dz-btn-ghost px-2 py-1 text-xs"onClick={() => onBackToList()}>返回列表</button>
 </div>
 <div className="min-h-0 flex-1 overflow-auto p-3">
 {edges.length === 0 ? (
 <div className="flex h-full items-center justify-center border border-dashed border-[var(--border-color)] bg-[var(--surface)] p-3 text-sm text-[var(--text-muted)]">
 暂无可用关系数据，请先在记忆库完成章节分析。
 </div>
 ) : (
 <div className="space-y-2">
 {selectedEdge ? (
 <div className="space-y-2 border border-[var(--border-color)] bg-[var(--surface)] p-3">
 <div className="text-sm font-semibold text-[var(--text-primary)]">关联片段明细</div>
 {selectedEdge.snippets.length === 0 ? (
 <div className="text-xs text-[var(--text-muted)]">暂无历史片段。</div>
 ) : (
 selectedEdge.snippets.map((item, index) => (
 <article
 key={`${item.chapterId}-${index}`}
 className={` border p-2 text-xs ${
 item.isConflict
 ? 'border-amber-300/45 bg-amber-500/15'
 : 'border-[var(--border-color)] bg-[var(--bg-tertiary)]'
 }`}
 >
 <div className="mb-1 flex items-center justify-between">
 <span className="font-semibold text-[var(--text-primary)]">{item.chapterTitle}</span>
 {item.isConflict ? <span className="rounded-full border border-amber-300/55 bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-100">冲突</span> : null}
 </div>
 <div className="max-h-40 overflow-y-auto pr-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]">{item.text}</div>
 </article>
 ))
 )}
 </div>
 ) : (
 <div className="border border-dashed border-[var(--border-color)] bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)]">
 点击下方关系卡片查看两人历史互动细节。
 </div>
 )}
 <div className="grid grid-cols-1 gap-2">
 {edges.slice(0, 24).map((edge) => {
 const selected = selectedEdgeId === edge.id;
 const conflictCount = edge.snippets.filter((s) => s.isConflict).length;
 return (
 <button
 key={edge.id}
 className={`w-full border px-3 py-2 text-left ${
 selected
 ? 'border-violet-300/55 bg-violet-500/20'
 : 'border-[var(--border-color)] bg-[var(--surface)] hover:bg-white/10'
 }`}
 onClick={() => onSelectEdge(edge.id)}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="text-sm font-semibold text-[var(--text-primary)]">
 {nodeById.get(edge.sourceId) || edge.sourceId} → {nodeById.get(edge.targetId) || edge.targetId}
 </div>
 <div className="text-[11px] text-[var(--text-muted)]">强度 {edge.weight}</div>
 </div>
 <div className="mt-1 text-xs text-[var(--text-secondary)]">
 历史片段 {edge.snippets.length} 条{conflictCount > 0 ? ` · 冲突 ${conflictCount} 条` : ''}
 </div>
 </button>
 );
 })}
 </div>
 </div>
 )}
 </div>
 </section>
 
 );
}
