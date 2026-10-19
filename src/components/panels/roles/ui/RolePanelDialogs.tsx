// 模块说明：角色面板弹窗集合。
// 关键职责：新建/编辑角色、装备、技能的对话框。
import { categoryFromRole, type RoleWithCategory } from '../rolePanelLogic';

interface PendingDeleteRole {
 roleId: string;
 roleName: string;
}

interface PendingDeleteCategory {
 categoryName: string;
}

interface RolePanelDialogsProps {
 mergeDialogOpen: boolean;
 mergePrimary: RoleWithCategory | null;
 mergeSecondary: RoleWithCategory | null;
 pendingDeleteAll: boolean;
 pendingDelete: PendingDeleteRole | null;
 pendingDeleteCategory: PendingDeleteCategory | null;
 extractDialogOpen: boolean;
 chapterCount: number;
 extractStartChapter: string;
 extractEndChapter: string;
 extracting: boolean;
 onCancelMerge: () => void;
 onConfirmMerge: () => void;
 onCancelDeleteAll: () => void;
 onConfirmDeleteAll: () => void;
 onCancelDelete: () => void;
 onConfirmDelete: (roleId: string, roleName: string) => void;
 onCancelDeleteCategory: () => void;
 onConfirmDeleteCategory: (categoryName: string) => void;
 onCancelExtract: () => void;
 onExtractStartChapterChange: (value: string) => void;
 onExtractEndChapterChange: (value: string) => void;
 onConfirmExtract: () => void;
}

export function RolePanelDialogs({
 mergeDialogOpen,
 mergePrimary,
 mergeSecondary,
 pendingDeleteAll,
 pendingDelete,
 pendingDeleteCategory,
 extractDialogOpen,
 chapterCount,
 extractStartChapter,
 extractEndChapter,
 extracting,
 onCancelMerge,
 onConfirmMerge,
 onCancelDeleteAll,
 onConfirmDeleteAll,
 onCancelDelete,
 onConfirmDelete,
 onCancelDeleteCategory,
 onConfirmDeleteCategory,
 onCancelExtract,
 onExtractStartChapterChange,
 onExtractEndChapterChange,
 onConfirmExtract
}: RolePanelDialogsProps) {
 return (
 <>
 {mergeDialogOpen ? (
 <div className="pointer-events-none absolute inset-0 z-[980] flex items-center justify-center p-3">
 <section className="wz-modal-enter pointer-events-auto w-full max-w-[460px] border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 p-4 shadow-2xl backdrop-blur-[20px]">
 <div className="text-sm font-semibold text-[var(--text-primary)]">合并角色档案</div>
 <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
 确认把副卡合并进主卡吗？合并后会保留主卡名称，副卡名称会进入别名，关系历程、装备、技能会自动去重合并。
 </p>
 <div className="mt-3 grid gap-2 text-xs">
 <div className="border border-cyan-300/25 bg-cyan-500/10 p-3">
 <div className="text-[11px] font-semibold text-cyan-100">保留主卡</div>
 <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
 {mergePrimary?.role.name || '未命名角色'}
 </div>
 <div className="mt-1 text-[11px] text-[var(--text-muted)]">
 {mergePrimary ? categoryFromRole(mergePrimary.role) : '待选择'}
 </div>
 </div>
 <div className="border border-rose-300/25 bg-rose-500/10 p-3">
 <div className="text-[11px] font-semibold text-rose-100">合并副卡并删除</div>
 <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
 {mergeSecondary?.role.name || '未命名角色'}
 </div>
 <div className="mt-1 text-[11px] text-[var(--text-muted)]">
 {mergeSecondary ? categoryFromRole(mergeSecondary.role) : '待选择'}
 </div>
 </div>
 </div>
 <div className="mt-4 flex items-center justify-end gap-2">
 <button
 className="wz-dz-btn-ghost border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
 onClick={onCancelMerge}
 >
 取消
 </button>
 <button
 className="border border-cyan-300/45 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
 onClick={onConfirmMerge}
 >
 确认合并
 </button>
 </div>
 </section>
 </div>
 ) : null}

 {pendingDeleteAll ? (
 <div className="pointer-events-none absolute inset-0 z-[980] flex items-center justify-center p-3">
 <section className="wz-modal-enter pointer-events-auto w-full max-w-[420px] border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 p-4 shadow-2xl backdrop-blur-[20px]">
 <div className="text-sm font-semibold text-[var(--text-primary)]">清空角色库</div>
 <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
 确认清空角色库吗？此操作会删除当前作品下全部分类中的角色，且不可撤销。仅清理角色高亮标记，不会修改正文文字。
 </p>
 <div className="mt-4 flex items-center justify-end gap-2">
 <button
 className="wz-dz-btn-ghost border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
 onClick={onCancelDeleteAll}
 >
 取消
 </button>
 <button
 className="border border-rose-300/45 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
 onClick={onConfirmDeleteAll}
 >
 确认清空
 </button>
 </div>
 </section>
 </div>
 ) : null}

 {pendingDeleteCategory ? (
 <div className="pointer-events-none absolute inset-0 z-[980] flex items-center justify-center p-3">
 <section className="wz-modal-enter pointer-events-auto w-full max-w-[420px] border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 p-4 shadow-2xl backdrop-blur-[20px]">
 <div className="text-sm font-semibold text-[var(--text-primary)]">删除分类</div>
 <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
 确认删除分类“{pendingDeleteCategory.categoryName}”吗？分类下的角色会保留，并迁入“其他角色”；不会删除角色档案，也不会修改正文文字。
 </p>
 <div className="mt-4 flex items-center justify-end gap-2">
 <button
 className="wz-dz-btn-ghost border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
 onClick={onCancelDeleteCategory}
 >
 取消
 </button>
 <button
 className="border border-rose-300/45 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
 onClick={() => onConfirmDeleteCategory(pendingDeleteCategory.categoryName)}
 >
 确认删除分类
 </button>
 </div>
 </section>
 </div>
 ) : null}

 {pendingDelete ? (
 <div className="pointer-events-none absolute inset-0 z-[980] flex items-center justify-center p-3">
 <section className="wz-modal-enter pointer-events-auto w-full max-w-[420px] border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 p-4 shadow-2xl backdrop-blur-[20px]">
 <div className="text-sm font-semibold text-[var(--text-primary)]">删除角色</div>
 <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">
 确认删除角色“{pendingDelete.roleName}”吗？此操作不可撤销。仅清理该角色相关高亮标记，不会修改正文文字。
 </p>
 <div className="mt-4 flex items-center justify-end gap-2">
 <button
 className="wz-dz-btn-ghost border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
 onClick={onCancelDelete}
 >
 取消
 </button>
 <button
 className="border border-rose-300/45 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
 onClick={() => onConfirmDelete(pendingDelete.roleId, pendingDelete.roleName)}
 >
 确认删除
 </button>
 </div>
 </section>
 </div>
 ) : null}

 
 </>
 );
}
