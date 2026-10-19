// 模块说明：编辑器与外部命令的桥接 Hook。
// 关键职责：响应快捷排版/AI 结果/历史快照恢复等指令。
import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { ensureChapterHeading } from '../utils/chapterTemplate';
import { formatAsNovelText, stripHeadingLineFromText, toSafeParagraphNodes } from '../utils/editorUtils';

function isEditorViewAlive(editor: any): boolean {
 return Boolean(editor && !editor.isDestroyed && editor.view?.docView);
}

interface UseEditorBridgeSyncParams {
 chapterId: string;
 chapterTitle: string;
 editor: any;
 quickFormatSignal?: number;
 quickFormatSignalRef: MutableRefObject<number | undefined>;
 onHistoryActionBind?: (actions: { undo: () => void; redo: () => void }) => void;
 onHistoryStateChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
 registerEditor: (
 chapterId: string,
 payload: {
 apply: (content: string, mode: 'replace' | 'append') => Promise<void>;
 getSelection: () => { from: number; to: number; text: string } | null;
 reviewRewrite: (range: { from: number; to: number }, rewritten: string) => Promise<void>;
 }
 ) => void;
 unregisterEditor: (chapterId: string) => void;
 forcePersistCurrentEditor: (options?: { forceHistory?: boolean }) => void;
 showIsland: (payload: any) => void;
 escapeHtml: (input: string) => string;
 onAiResult?: (range: { from: number; to: number }, text: string) => void;
}

export function useEditorBridgeSync({
 chapterId,
 chapterTitle,
 editor,
 quickFormatSignal,
 quickFormatSignalRef,
 onHistoryActionBind,
 onHistoryStateChange,
 registerEditor,
 unregisterEditor,
 forcePersistCurrentEditor,
 showIsland,
 escapeHtml,
 onAiResult
}: UseEditorBridgeSyncParams): void {
 useEffect(() => {
 if (!editor || !onHistoryActionBind) return;
 const runHistoryAction = (fn: () => void) => {
 fn();
 requestAnimationFrame(() => {
 if (!isEditorViewAlive(editor)) return;
 const state = editor.state;
 const docSize = state.doc.content.size;
 const currentFrom = editor.state.selection?.from ?? 1;
 const safePos = Math.max(1, Math.min(currentFrom, docSize));
 editor.commands.focus();
 editor.chain().focus().setTextSelection(safePos).run();
 setTimeout(() => {
 if (!isEditorViewAlive(editor)) return;
 const latestPos = editor.state.selection?.from ?? safePos;
 editor.chain().focus().setTextSelection(latestPos).run();
 }, 50);
 });
 };
 onHistoryActionBind({
 undo: () => runHistoryAction(() => editor.chain().focus().undo().run()),
 redo: () => runHistoryAction(() => editor.chain().focus().redo().run())
 });
 }, [editor, onHistoryActionBind]);

 useEffect(() => {
 if (!editor || !onHistoryStateChange) return;
 onHistoryStateChange({ canUndo: editor.can().undo(), canRedo: editor.can().redo() });
 }, [editor, onHistoryStateChange]);

 useEffect(() => {
 if (!editor) return;
 if (quickFormatSignal === undefined) return;
 if (quickFormatSignalRef.current === undefined) {
 quickFormatSignalRef.current = quickFormatSignal;
 return;
 }
 if (quickFormatSignal === quickFormatSignalRef.current) return;
 quickFormatSignalRef.current = quickFormatSignal;

 if (!isEditorViewAlive(editor)) return;
 const currentText = stripHeadingLineFromText(editor.getText(), chapterTitle);
 const formatted = formatAsNovelText(currentText);
 if (!formatted.trim()) return;

 const bodyNodes = toSafeParagraphNodes(formatted);
 const bodyHtml = bodyNodes
 .map((node) => (node.content?.[0]?.text ? `<p>${escapeHtml(String(node.content[0].text))}</p>` : '<p></p>'))
 .join('');

 // 保存当前滚动位置和光标位置
 const { from, to } = editor.state.selection;
 const scrollParents: { node: HTMLElement; scrollTop: number }[] = [];
 let node = editor.view.dom.parentElement;
 while (node) {
 scrollParents.push({ node, scrollTop: node.scrollTop });
 node = node.parentElement;
 }

  editor.chain().setContent(ensureChapterHeading(bodyHtml, chapterTitle), true).run();
  if (isEditorViewAlive(editor)) {
    editor.view.dispatch(editor.state.tr);
    requestAnimationFrame(() => {
      if (isEditorViewAlive(editor)) editor.view.updateState(editor.state);
    });
  }

  // 恢复滚动位置
  scrollParents.forEach(({ node, scrollTop }) => { node.scrollTop = scrollTop; });
  editor.commands.setTextSelection({ from: Math.min(from, editor.state.doc.content.size), to: Math.min(to, editor.state.doc.content.size) });

 forcePersistCurrentEditor({ forceHistory: true });
 showIsland({ type: 'success', status: 'feedback', message: '已完成小说排版', autoHideMs: 1200 });
 }, [chapterTitle, editor, escapeHtml, forcePersistCurrentEditor, quickFormatSignal, quickFormatSignalRef, showIsland]);

 useEffect(() => {
 if (!editor) return;
 registerEditor(chapterId, {
 apply: async (content, mode) => {
 if (!isEditorViewAlive(editor)) return;
 const nodes = toSafeParagraphNodes(content);
 if (mode === 'replace') {
 editor.chain().focus().selectAll().insertContent(nodes).run();
 } else {
 const end = editor.state.doc.content.size;
 editor.chain().focus().setTextSelection(end).insertContent(nodes).run();
 }
 forcePersistCurrentEditor({ forceHistory: true });
 },
 getSelection: () => {
 if (!isEditorViewAlive(editor)) return null;
 const { from, to } = editor.state.selection;
 if (from >= to) return null;
 return {
 from,
 to,
 text: editor.state.doc.textBetween(from, to, '\n')
 };
 },
 reviewRewrite: async (range, rewritten) => {
 onAiResult?.(range, rewritten);
 }
 });

 return () => {
 unregisterEditor(chapterId);
 };
 }, [chapterId, editor, forcePersistCurrentEditor, onAiResult, registerEditor, unregisterEditor]);
}
