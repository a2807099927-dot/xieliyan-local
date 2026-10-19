// 模块说明：推演结构树可视化组件。
// 关键职责：将 InferenceTreeNode 树形数据递归渲染为可展开/折叠的大纲树展示，支持节点类型色圆标注。
export type InferenceTreeNode = {
 label: string;
 type: 'root' | 'arc' | 'event' | 'sub_plot';
 desc?: string;
 children?: InferenceTreeNode[];
};

function cardClassByDepth(depth: number): string {
 if (depth === 0) {
 return 'border-emerald-300/90 bg-gradient-to-br from-emerald-400/55 via-teal-400/45 to-cyan-400/40 shadow-[0_14px_30px_-14px_rgba(16,185,129,0.95)]';
 }
 if (depth === 1) {
 return 'border-sky-300/85 bg-gradient-to-br from-sky-400/50 via-blue-400/38 to-indigo-400/30 shadow-[0_12px_28px_-16px_rgba(56,189,248,0.9)]';
 }
 if (depth === 2) {
 return 'border-violet-300/85 bg-gradient-to-br from-violet-400/48 via-fuchsia-400/36 to-pink-400/28 shadow-[0_12px_28px_-16px_rgba(139,92,246,0.88)]';
 }
 return 'border-indigo-300/80 bg-gradient-to-br from-indigo-400/42 via-slate-400/32 to-cyan-400/24 shadow-[0_10px_24px_-16px_rgba(99,102,241,0.75)]';
}

function typeLabel(type: InferenceTreeNode['type']): string {
 if (type === 'root') return '总纲';
 if (type === 'arc') return '主线/支线';
 if (type === 'event') return '剧情段';
 return '变化点';
}

function TreeNodeItem({
 node,
 path,
 depth,
 collapsedPaths,
 onTogglePath
}: {
 node: InferenceTreeNode;
 path: string;
 depth: number;
 collapsedPaths: Set<string>;
 onTogglePath: (path: string) => void;
}) {
 const hasChildren = Boolean(node.children && node.children.length > 0);
 const collapsed = collapsedPaths.has(path);

 return (
 <div className="relative">
 {depth > 0 ? <div className="absolute bottom-0 left-[9px] top-0 border-l border-[var(--border-color)]/55"/> : null}
 <div className="relative pl-6">
 {depth > 0 ? <div className="absolute left-[9px] top-6 w-4 border-t border-[var(--border-color)]/55"/> : null}
 <div
 className={`wz-insight-card border px-3 py-2.5 backdrop-blur-[2px] transition-all duration-200 ${cardClassByDepth(depth)} ${
 depth === 0 ? 'py-3.5' : ''
 }`}
 >
 <div className="flex items-center gap-2">
 {hasChildren ? (
 <button
 type="button"
 className="h-5 w-5 border border-[var(--border-color)]/70 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface)]"
 onClick={() => onTogglePath(path)}
 title={collapsed ? '展开节点' : '收起节点'}
 >
 {collapsed ? '+' : '-'}
 </button>
 ) : (
 <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)]/70"/>
 )}

 <div
 className={`wz-insight-title ${depth === 0 ? 'text-[27px]' : 'text-[20px]'} font-semibold leading-tight text-[var(--text-primary)]`}
 >
 {node.label}
 </div>
 <span className="shrink-0 rounded-full border border-white/35 bg-white/18 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]/85">
 {typeLabel(node.type)}
 </span>
 </div>

 {node.desc ? (
 <div className={`wz-insight-text mt-1.5 pl-7 ${depth === 0 ? 'text-[16px]' : 'text-[14px]'} text-[var(--text-primary)]/90`}>
 {node.desc}
 </div>
 ) : null}
 </div>
 </div>

 {hasChildren ? (
 <div
 className={`mt-2 space-y-2 overflow-hidden transition-all duration-300 ease-out ${
 collapsed ? 'max-h-0 translate-y-[-6px] opacity-0' : 'max-h-[2400px] translate-y-0 opacity-100'
 }`}
 >
 {(node.children || []).map((child, index) => (
 <TreeNodeItem
 key={`${path}.${index}`}
 node={child}
 path={`${path}.${index}`}
 depth={depth + 1}
 collapsedPaths={collapsedPaths}
 onTogglePath={onTogglePath}
 />
 ))}
 </div>
 ) : null}
 </div>
 );
}

export function InferenceTreeView({
 root,
 collapsedPaths,
 onTogglePath
}: {
 root: InferenceTreeNode;
 collapsedPaths: Set<string>;
 onTogglePath: (path: string) => void;
}) {
 return <TreeNodeItem node={root} path="0"depth={0} collapsedPaths={collapsedPaths} onTogglePath={onTogglePath} />;
}
