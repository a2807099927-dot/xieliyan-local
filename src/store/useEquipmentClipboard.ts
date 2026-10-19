// 角色装备/技能剪贴板 store
// 用于跨角色卡剪切/粘贴装备和技能
import { create } from 'zustand';

export type ClipboardKind = 'equipment' | 'skill';

interface ClipboardItem {
 kind: ClipboardKind;
 name: string;
 detail: string;
 /** 来源角色 ID，剪切时记录，粘贴成功后从来源移除 */
 sourceRoleId: string;
}

interface ClipboardState {
 item: ClipboardItem | null;
 cut: (item: ClipboardItem) => void;
 clear: () => void;
}

export const useEquipmentClipboard = create<ClipboardState>((set) => ({
 item: null,
 cut: (item) => set({ item }),
 clear: () => set({ item: null })
}));
