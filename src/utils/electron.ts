// Tauri 2 版：重导出 tauri-bridge 作为 electronAPI
// 所有从主项目复制过来的文件 import '../utils/electron' 会自动走这里
export { electronAPI, tauriAPI } from './tauri-bridge';
export type { TauriApi } from './tauri-bridge';

import type { TauriApi as TauriApiShape } from './tauri-bridge';

/**
 * 安全确认对话框：优先用 Tauri dialog 插件（WebView2 下 window.confirm 可能被拦截
 * 返回 false，导致「确定」被当「取消」处理），插件不可用时回退 window.confirm。
 */
export async function safeConfirm(message: string, title?: string): Promise<boolean> {
  try {
    const inTauri = Boolean((window as any).__TAURI_INTERNALS__);
    if (inTauri) {
      const { confirm } = await import('@tauri-apps/plugin-dialog');
      return await confirm(message, { title: title || '确认', kind: 'warning' });
    }
  } catch {
    /* 插件不可用则回退 window.confirm */
  }
  return Boolean(window.confirm(message));
}

// 保留主项目的类型导出（让 TS 不报错）
export type MemoryHistoryKind = 'plot' | 'inference';
export interface MemoryHistoryEntry {
 id: string;
 at: string;
 model?: string;
 chapterIds: string[];
 chapterTitles: string[];
 data: unknown;
}
export interface StreamChunkPayload {
 text: string;
 done: boolean;
 sessionId?: string;
}
/**
 * 历史命名（自 Electron 版迁移），实为 Tauri 桥接层。
 * 原先为 { [key: string]: any }，任何拼写错误都无法被 tsc 发现；
 * 现改为从实现推导，后端命令改签名时编译期即可暴露。
 */
export type ElectronAPI = TauriApiShape;
