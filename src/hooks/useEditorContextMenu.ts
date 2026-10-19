// useEditorContextMenu 
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ContextMenuState = {
 x: number;
 y: number;
 nativeFrom?: number;
 nativeTo?: number;
} | null;

interface UseEditorContextMenuParams {
 editor: any;
}

// useEditorContextMenu
export function useEditorContextMenu({ editor }: UseEditorContextMenuParams): {
 contextMenuState: ContextMenuState;
 closeContextMenu: () => void;
 capturedSelection: { from: number; to: number } | null;
} {
 const [contextMenuState, setContextMenuState] = useState<ContextMenuState>(null);
 const editorRef = useRef(editor);
 const lastNonEmptySelectionRef = useRef<{ from: number; to: number } | null>(null);
 editorRef.current = editor;

 useEffect(() => {
 const updateLastNonEmptySelection = () => {
 const ed = editorRef.current;
 const sel = ed?.state?.selection;
 if (!sel) return;
 if (typeof sel.from === 'number' && typeof sel.to === 'number' && sel.from < sel.to) {
 lastNonEmptySelectionRef.current = { from: sel.from, to: sel.to };
 }
 };

 const onMouseUp = () => {
 requestAnimationFrame(updateLastNonEmptySelection);
 };
 const onKeyUp = () => updateLastNonEmptySelection();

 const onContextMenu = (event: MouseEvent) => {
 const target = event.target as HTMLElement | null;
 if (!target?.closest('.ProseMirror')) return;
 event.preventDefault();
 const ed = editorRef.current;
 const sel = ed?.state?.selection;
 const hasLiveSelection = Boolean(sel && typeof sel.from === 'number' && typeof sel.to === 'number' && sel.from < sel.to);
 const fallback = lastNonEmptySelectionRef.current;
 setContextMenuState({
 x: event.clientX,
 y: event.clientY,
 nativeFrom: hasLiveSelection ? sel?.from : fallback?.from,
 nativeTo: hasLiveSelection ? sel?.to : fallback?.to
 });
 };

 document.addEventListener('mouseup', onMouseUp, true);
 document.addEventListener('keyup', onKeyUp, true);
 document.addEventListener('contextmenu', onContextMenu);
 return () => {
 document.removeEventListener('mouseup', onMouseUp, true);
 document.removeEventListener('keyup', onKeyUp, true);
 document.removeEventListener('contextmenu', onContextMenu);
 };
 }, []);

 const capturedSelection = useMemo(() => {
 if (!contextMenuState) return null;
 if (contextMenuState.nativeFrom == null || contextMenuState.nativeTo == null) return null;
 return { from: contextMenuState.nativeFrom, to: contextMenuState.nativeTo };
 }, [contextMenuState]);

 return {
 contextMenuState,
 closeContextMenu: useCallback(() => setContextMenuState(null), []),
 capturedSelection
 };
}
