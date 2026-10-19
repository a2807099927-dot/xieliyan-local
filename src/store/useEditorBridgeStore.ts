// 模块说明：编辑器桥接全局状态（zustand）。
// 关键职责：保存当前活动 editor 引用，供面板/AI 调用。
import { create } from 'zustand';

type InsertMode = 'replace' | 'append';

export interface EditorSelectionSnapshot {
 from: number;
 to: number;
 text: string;
}

interface EditorBridgeApi {
 apply: (content: string, mode: InsertMode) => Promise<void>;
 getSelection: () => EditorSelectionSnapshot | null;
 reviewRewrite: (range: { from: number; to: number }, rewritten: string) => Promise<void>;
}

interface EditorBridgeState {
 byChapterId: Record<string, EditorBridgeApi>;
 register: (chapterId: string, api: EditorBridgeApi) => void;
 unregister: (chapterId: string) => void;
 applyToChapter: (chapterId: string, content: string, mode: InsertMode) => Promise<boolean>;
 getSelectionForChapter: (chapterId: string) => EditorSelectionSnapshot | null;
 reviewRewriteForChapter: (chapterId: string, range: { from: number; to: number }, rewritten: string) => Promise<boolean>;
}

export const useEditorBridgeStore = create<EditorBridgeState>((set, get) => ({
 byChapterId: {},
 register: (chapterId, api) => {
 set((state) => ({
 byChapterId: {
 ...state.byChapterId,
 [chapterId]: api
 }
 }));
 },
 unregister: (chapterId) => {
 set((state) => {
 const next = { ...state.byChapterId };
 delete next[chapterId];
 return { byChapterId: next };
 });
 },
 applyToChapter: async (chapterId, content, mode) => {
 const api = get().byChapterId[chapterId];
 if (!api) return false;
 await api.apply(content, mode);
 return true;
 },
 getSelectionForChapter: (chapterId) => {
 const api = get().byChapterId[chapterId];
 return api ? api.getSelection() : null;
 },
 reviewRewriteForChapter: async (chapterId, range, rewritten) => {
 const api = get().byChapterId[chapterId];
 if (!api) return false;
 await api.reviewRewrite(range, rewritten);
 return true;
 }
}));
