// useExtractStore
// 智能提取角色的全局状态 store。
// 目的：把提取的“运行状态 + 结果”从弹窗组件的局部 state 中抽离出来，
// 放到模块作用域的全局 store，从而实现：
//   1) 后台持续运行：即使关闭弹窗 / 切换面板，提取任务也不会中断（异步 Promise 由 store 持有）。
//   2) 结果持久化：关掉再打开提取界面，依然能看到上次提取的角色列表。
//   3) 完成自动弹回：提取成功后自动重新弹出窗口，并在灵动岛提供“查看结果”按钮兵底。
import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { electronAPI } from '../utils/electron';
import { useIslandStore } from './useIslandStore';

export type ExtractStatus = 'idle' | 'extracting' | 'done' | 'error';

export type ExtractedRole = Record<string, any>;

// runExtract 的参数：chapter 号用于展示；resolved* 是传给后端的 1-based 章节序号。
export interface RunExtractParams {
  bookId: string;
  startChapter: number;
  endChapter: number;
  resolvedStart: number;
  resolvedEnd: number;
  novelType: string;
}

export interface ExtractState {
  /** 弹窗是否可见（单一真相源，提取完成时可由 store 自动置 true 实现自动弹回） */
  open: boolean;
  status: ExtractStatus;
  bookId: string | null;
  startChapter: number;
  endChapter: number;
  novelType: string;
  extractedRoles: ExtractedRole[];
  /** 选中的结果下标（用数组而非 Set，便于 store 存储与比较） */
  selectedIndices: number[];
  saving: boolean;
  error?: string;
  /** 递增的运行编号，用于丢弃“旧任务”的返回结果（防竞态） */
  runId: number;
  /** 是否已有可展示的结果 */
  hasResult: boolean;
  /** 上次提取进度章节号 */
  lastExtracted: number | null;

  openModal: () => void;
  closeModal: () => void;
  setConfig: (
    patch: Partial<Pick<ExtractState, 'startChapter' | 'endChapter' | 'bookId' | 'novelType' | 'lastExtracted'>>,
  ) => void;
  setSelectedIndices: (next: number[]) => void;
  toggleIndex: (idx: number, on: boolean) => void;
  selectAll: (on: boolean) => void;
  setSaving: (v: boolean) => void;
  clearResults: () => void;
  updateRoleType: (index: number, roleType: string) => void;
  setLastExtracted: (v: number | null) => void;
  runExtract: (params: RunExtractParams) => Promise<void>;
}

export const useExtractStore = create<ExtractState>((set, get) => ({
  open: false,
  status: 'idle',
  bookId: null,
  startChapter: 1,
  endChapter: 1,
  novelType: '',
  extractedRoles: [],
  selectedIndices: [],
  saving: false,
  error: undefined,
  runId: 0,
  hasResult: false,
  lastExtracted: null,

  openModal: () => set({ open: true }),

  // 只隐藏弹窗，保留结果；下次打开仍可看到上次提取的角色。
  closeModal: () => set({ open: false }),

  setConfig: (patch) => set(patch),

  setSelectedIndices: (next) => set({ selectedIndices: next }),

  toggleIndex: (idx, on) => {
    const cur = new Set(get().selectedIndices);
    if (on) cur.add(idx);
    else cur.delete(idx);
    set({ selectedIndices: Array.from(cur).sort((a, b) => a - b) });
  },

  selectAll: (on) => {
    if (on) set({ selectedIndices: get().extractedRoles.map((_, i) => i) });
    else set({ selectedIndices: [] });
  },

  setSaving: (v) => set({ saving: v }),

  clearResults: () =>
    set({
      status: 'idle',
      extractedRoles: [],
      selectedIndices: [],
      hasResult: false,
      error: undefined,
    }),

  updateRoleType: (index, roleType) => {
    set({
      extractedRoles: get().extractedRoles.map((role, idx) =>
        idx === index ? { ...role, roleType } : role
      )
    });
  },

  setLastExtracted: (v) => set({ lastExtracted: v }),

  runExtract: async (params) => {
    // 已有任务在跑就不重复启动。
    if (get().status === 'extracting') return;

    const runId = get().runId + 1;
    set({
      status: 'extracting',
      runId,
      bookId: params.bookId,
      startChapter: params.startChapter,
      endChapter: params.endChapter,
      novelType: params.novelType,
      extractedRoles: [],
      selectedIndices: [],
      hasResult: false,
      error: undefined,
    });

    const island = useIslandStore.getState();
    island.show({
      type: 'progress',
      status: 'thinking',
      message: `正在智能提取角色 (${params.startChapter}-${params.endChapter}章)...`,
    });

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<{ currentBatch: number; totalBatches: number; currentChapter: number }>('extract_progress', (event) => {
        // 如果运行编号已经变了（即任务被取消或重新发起），不响应这个事件
        if (get().runId !== runId) return;
        const { currentBatch, totalBatches, currentChapter } = event.payload;
        localStorage.setItem(`extract_progress_${params.bookId}`, currentChapter.toString());
        set({ lastExtracted: currentChapter });
        island.show({ 
          type: 'progress', 
          status: 'thinking',
          message: `正在智能提取角色: 正在分析第 ${currentChapter} 章 (${currentBatch}/${totalBatches})...`
        });
      });

      const res = await electronAPI.resources.extractRoles({
        bookId: params.bookId,
        startChapter: params.resolvedStart,
        endChapter: params.resolvedEnd,
        novelType: params.novelType,
      });

      // 若期间又启动了新的提取，丢弃本次旧结果。
      if (get().runId !== runId) return;

      if (!res?.success) {
        throw new Error(res?.error || '角色提取失败');
      }

      // 整体成功后，确保进度更新为 endChapter
      localStorage.setItem(`extract_progress_${params.bookId}`, params.endChapter.toString());
      set({ lastExtracted: params.endChapter });

      const payload: ExtractedRole[] = res.extracted || [];

      if (payload.length === 0) {
        set({
          status: 'done',
          extractedRoles: [],
          selectedIndices: [],
          hasResult: false,
          open: true, // 自动弹回，让用户看到“未提取到新角色”的结果态
        });
        island.show({ type: 'warning', message: '未提取到新角色' });
      } else {
        set({
          status: 'done',
          extractedRoles: payload,
          selectedIndices: payload.map((_, i) => i), // 默认全选
          hasResult: true,
          open: true, // 提取完成自动重新弹出窗口
        });
        island.show({
          type: 'success',
          message: `成功提取 ${payload.length} 个角色`,
          autoHideMs: 6000,
          // 兵底：即使自动弹回被关掉，也可从灵动岛一键重新打开。
          actions: [
            {
              id: 'view-extract-result',
              label: '查看结果',
              onClick: () => get().openModal(),
            },
          ],
        });
      }
    } catch (e: any) {
      if (get().runId !== runId) return;
      const msg = e?.message || '提取过程发生错误';
      set({ status: 'error', error: msg });
      island.show({ type: 'error', message: msg });
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },
}));
