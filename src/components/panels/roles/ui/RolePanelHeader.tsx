// 模块说明：角色面板顶栏。
// 关键职责：分类切换、统计数字、批量操作入口。
import { useState } from 'react';
import type { Book } from '../../../../types';
import { ROLE_VIEW_ORDER_DEFAULT, type NovelType, type RoleView } from '../rolePanelLogic';

type PanelTab = 'list' | 'editor' | 'graph';

interface RoleArchiveStats {
 roles: number;
 timelineCount: number;
 equipmentCount: number;
 skillCount: number;
}

interface RolePanelHeaderProps {
 book: Book;
 novelType: NovelType;
 extracting: boolean;
 panelTab: PanelTab;
 view: RoleView;
 canMerge: boolean;
 canDeleteAll: boolean;
 mergeSelectMode: boolean;
 mergeSelectedCount: number;
 roleArchiveStats: RoleArchiveStats;
 showFactionCollapse: boolean;
 allFactionsCollapsed: boolean;
 customViewTabs: string[];
 onNovelTypeChange: (type: NovelType) => void;
 onOpenExtractDialog: () => void;
 onShowList: () => void;
 onOpenCreate: () => void;
 onOpenMerge: () => void;
 onShowGraph: () => void;
 onRequestDeleteAll: () => void;
 onSelectView: (view: RoleView) => void;
 onToggleAllFactions: () => void;
 onCancelMergeSelection: () => void;
 onAddCustomTab: (name: string) => void;
 onRemoveCustomTab: (name: string) => void;
}

export function RolePanelHeader({
 book,
 novelType,
 extracting,
 panelTab,
 view,
 canMerge,
 canDeleteAll,
 mergeSelectMode,
 mergeSelectedCount,
 roleArchiveStats,
 showFactionCollapse,
 allFactionsCollapsed,
 customViewTabs,
 onNovelTypeChange,
 onOpenExtractDialog,
 onShowList,
 onOpenCreate,
 onOpenMerge,
 onShowGraph,
 onRequestDeleteAll,
 onSelectView,
 onToggleAllFactions,
 onCancelMergeSelection,
 onAddCustomTab,
 onRemoveCustomTab
}: RolePanelHeaderProps) {
 const [addingTab, setAddingTab] = useState(false);
 const [newTabName, setNewTabName] = useState('');
 const allViewTabs: RoleView[] = [...ROLE_VIEW_ORDER_DEFAULT, ...customViewTabs];
 const lastExtractedChapterId = book.resourceIndex?.roleExtractState?.lastExtractedChapterId;
 const lastExtractedChapterTitle = lastExtractedChapterId
 ? book.chapters.find(
 (chapter) => chapter.id === lastExtractedChapterId || String(chapter.id) === String(lastExtractedChapterId)
 )?.title
 : null;

 return (
 <>
 <div className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2">
 <div className="mb-2 flex items-center justify-between gap-2">
 <div className="flex items-center gap-2">
 {lastExtractedChapterTitle ? (
 <span className="rounded-full border border-indigo-300/35 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
 已提取至：{lastExtractedChapterTitle}
 </span>
 ) : null}
 <select
 value={novelType}
 onChange={(event) => onNovelTypeChange(event.target.value as NovelType)}
 className="w-32 border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] shadow-sm transition-all focus:border-indigo-400/50"
 >
 <option value="urban">通用/都市</option>
 <option value="virtual_mmo">虚拟网游</option>
 <option value="xuanhuan">玄幻修仙</option>
 <option value="alternate_history">架空历史</option>
 </select>
 </div>
 <button
 className="border border-emerald-300/45 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={onOpenExtractDialog}
 disabled={extracting}
 >
 {extracting ? 'AI提取中...' : 'AI提取角色'}
 </button>
 </div>
 <div className="flex flex-wrap gap-2">
 <button
 className={`whitespace-nowrap border px-3 py-1.5 text-xs ${panelTab === 'list' ? 'border-indigo-300/35 bg-indigo-500/15 font-semibold text-indigo-100' : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)]'}`}
 onClick={onShowList}
 >
 角色列表
 </button>
 <button
 className={`whitespace-nowrap border px-3 py-1.5 text-xs ${panelTab === 'editor' ? 'border-emerald-300/35 bg-emerald-500/15 font-semibold text-emerald-100' : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)]'}`}
 onClick={onOpenCreate}
 >
 新增角色
 </button>
 <button
 className="whitespace-nowrap border border-cyan-300/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={onOpenMerge}
 disabled={!canMerge}
 >
 {mergeSelectMode ? '退出合并' : '合并角色'}
 </button>
 <button
 className={`whitespace-nowrap border px-3 py-1.5 text-xs ${panelTab === 'graph' ? 'border-violet-300/35 bg-violet-500/15 font-semibold text-violet-100' : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)]'}`}
 onClick={onShowGraph}
 >
 关系图谱
 </button>
 <button
 className="whitespace-nowrap border border-rose-300/35 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={onRequestDeleteAll}
 disabled={!canDeleteAll}
 >
 全部删除
 </button>
 </div>
 </div>

 <div className="flex flex-wrap gap-2">
 {allViewTabs.map((item) => {
 const isCustom = customViewTabs.includes(item as string);
 return (
 <button
 key={item}
 className={`group relative rounded-full border px-3 py-1 text-xs ${view === item ? 'border-indigo-300/40 bg-indigo-500/20 text-indigo-100' : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)]'}`}
 onClick={() => onSelectView(item)}
 >
 {item}
 {isCustom && (
 <span
 className="ml-1 hidden text-[10px] text-rose-300 group-hover:inline cursor-pointer"
 onClick={(e) => { e.stopPropagation(); if (window.confirm(`确定删除分类「${item}」吗？`)) onRemoveCustomTab(item as string); }}
 >×</span>
 )}
 </button>
 );
 })}
 {addingTab ? (
 <span className="inline-flex items-center gap-1">
 <input
 autoFocus
 className="w-20 rounded-full border border-indigo-300/50 bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
 placeholder="分类名"
 value={newTabName}
 onChange={(e) => setNewTabName(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && newTabName.trim()) {
 onAddCustomTab(newTabName.trim());
 setNewTabName('');
 setAddingTab(false);
 } else if (e.key === 'Escape') {
 setNewTabName('');
 setAddingTab(false);
 }
 }}
 onBlur={() => {
 if (newTabName.trim()) {
 onAddCustomTab(newTabName.trim());
 }
 setNewTabName('');
 setAddingTab(false);
 }}
 />
 </span>
 ) : (
 <button
 className="rounded-full border border-dashed border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-indigo-300/40 hover:text-indigo-200"
 onClick={() => setAddingTab(true)}
 title="添加自定义分类"
 >
 +
 </button>
 )}
 {showFactionCollapse ? (
 <button
 className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-1 text-xs text-[var(--text-secondary)]"
 onClick={onToggleAllFactions}
 >
 {allFactionsCollapsed ? '展开全部分类' : '折叠全部分类'}
 </button>
 ) : null}
 </div>

 <section className="grid grid-cols-3 gap-2 border border-[var(--border-color)] bg-[var(--surface)] p-2">
 {[
 ['角色', roleArchiveStats.roles],
 ['装备', roleArchiveStats.equipmentCount],
 ['技能', roleArchiveStats.skillCount]
 ].map(([label, value]) => (
 <button
 key={String(label)}
 type="button"
 className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1.5 text-left transition hover:border-indigo-400/50 hover:bg-indigo-500/10"
 onClick={() => {
 if (label === '装备') {
 window.dispatchEvent(new CustomEvent('xly:show-equipment-debug'));
 } else if (label === '技能') {
 window.dispatchEvent(new CustomEvent('xly:show-skill-debug'));
 }
 }}
 >
 <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
 <div className="text-sm font-semibold text-[var(--text-primary)]">{value}</div>
 </button>
 ))}
 </section>

 {mergeSelectMode ? (
 <section className="border border-cyan-300/35 bg-cyan-500/10 p-2 text-xs leading-5 text-cyan-50">
 <div className="flex items-center justify-between gap-2">
 <span>合并模式：先点保留的主卡，再点要合并删除的副卡。已选 {mergeSelectedCount}/2</span>
 <button
 className="shrink-0 border border-cyan-200/35 bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-50 hover:bg-cyan-500/25"
 onClick={onCancelMergeSelection}
 >
 取消
 </button>
 </div>
 </section>
 ) : null}
 </>
 );
}
