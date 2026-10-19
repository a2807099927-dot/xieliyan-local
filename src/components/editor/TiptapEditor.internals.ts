// 模块说明：Tiptap 正文编辑器内部工具。
// 架构定位：从 TiptapEditor.tsx 抽离的无状态常量与编辑器安全操作，不持有组件状态。
// 功能：内联建议色板、编辑器视图存活探测、安全事务派发。
import type { Editor } from '@tiptap/react';
import type { Transaction } from 'prosemirror-state';

// 内联建议高亮色板：为多条建议轮换分配可区分的下划线颜色。
export const INLINE_SUGGESTION_COLORS = ['#ef4444', '#a78bfa', '#60a5fa', '#34d399', '#f59e0b'];

// 判断编辑器视图是否仍存活（未销毁且 ProseMirror 视图已挂载），作为派发事务前的安全闸。
export function isEditorViewAlive(editor: Editor | null | undefined): editor is Editor {
 return Boolean(editor && !editor.isDestroyed && (editor.view as unknown as { docView?: unknown })?.docView);
}

// 安全派发事务：仅在编辑器视图存活时 dispatch，捕获陈旧视图异常，返回是否成功。
export function safeDispatch(editor: Editor | null | undefined, tr: Transaction): boolean {
 if (!isEditorViewAlive(editor)) return false;
 try {
 editor.view.dispatch(tr);
 return true;
 } catch (error) {
 console.warn('[TiptapEditor] skip dispatch on stale editor view:', error);
 return false;
 }
}
