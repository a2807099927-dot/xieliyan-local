// 模块说明：把 NovelLab 页面用的 `window.novelLab.*` API 接到 Tauri 命令上
// 主项目里这套 API 是通过 preload 注入的；Tauri 没有 preload，所以在前端 main.tsx 早期注入

import { listen as tauriListen } from '@tauri-apps/api/event';

let invokeImpl: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let inTauri = false;

try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals && typeof internals.invoke === 'function') {
 invokeImpl = internals.invoke;
 inTauri = true;
 }
} catch { /* ignore */ }

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
 if (!invokeImpl) return undefined as unknown as T;
 return await invokeImpl(cmd, args) as T;
}

export function installNovelLabShim() {
 if (typeof window === 'undefined') return;
 if ((window as any).novelLab) return;

 (window as any).novelLab = {
 // ─── 配置 ──────────────────────────────────────
 getAppConfig: async () => {
 if (!inTauri) return null;
 return await invoke('config_load');
 },
 setNovelLabPaths: async (args: { savePath?: string; lastBookPath?: string }) => {
 if (!inTauri) return { success: true };
 return await invoke('config_set_novel_lab_path', { savePath: args?.savePath, lastBookPath: args?.lastBookPath });
 },

 // ─── 路径选择 ──────────────────────────────────
 selectSavePath: async () => {
 if (!inTauri) return null;
 return await invoke<string | null>('novel_lab_select_save_path');
 },

 // ─── 章节存档 ──────────────────────────────────
 saveChapter: async (args: any) => {
 if (!inTauri) return { success: true };
 return await invoke('novel_lab_save_chapter', { savePath: args.savePath, bookName: args.bookName, chapter: args.chapter });
 },
 saveBookIndex: async (args: any) => {
 if (!inTauri) return { success: true };
 return await invoke('novel_lab_save_book_index', {
 savePath: args.savePath,
 bookName: args.bookName,
 chapters: args.chapters,
 extra: args.extra,
 });
 },

 // ─── 存档管理 ──────────────────────────────────
 listArchives: async (args: { savePath: string }) => {
 if (!inTauri) return { success: true, books: [] };
 return await invoke('novel_lab_list_archives', { savePath: args.savePath });
 },
 loadBook: async (args: { folderPath: string }) => {
 if (!inTauri) return { success: false };
 return await invoke('novel_lab_load_book', { folderPath: args.folderPath });
 },
 deleteBook: async (args: { folderPath: string }) => {
 if (!inTauri) return { success: false, error: '浏览器预览模式不支持' };
 return await invoke('novel_lab_delete_book', { folderPath: args.folderPath });
 },

 // ─── 分析会话 ──────────────────────────────────
 saveAnalysis: async (args: any) => {
 if (!inTauri) return { success: true };
 return await invoke('novel_lab_save_analysis', {
 savePath: args.savePath,
 bookName: args.bookName,
 session: args.session,
 });
 },
 listAnalyses: async (args: { savePath: string; bookName: string }) => {
 if (!inTauri) return { success: true, sessions: [] };
 return await invoke('novel_lab_list_analyses', args);
 },
 loadAnalysis: async (args: { savePath: string; bookName: string; id: string }) => {
 if (!inTauri) return { success: false };
 return await invoke('novel_lab_load_analysis', args);
 },

 // ─── TXT 导入 ──────────────────────────────────
 importTxt: async () => {
 if (!inTauri) return { success: false, chapters: [] };
 return await invoke('novel_lab_import_txt');
 },

 // ─── 流式分析 ──────────────────────────────────
 analyze: async (request: any) => {
 if (!inTauri) return;
 await invoke('novel_lab_analyze', { request });
 },
 abortAnalyze: async () => {
 if (!inTauri) return;
 await invoke('novel_lab_analyze_abort', { requestId: null });
 },
 onAnalyzeChunk: (callback: (payload: any) => void) => {
 if (!inTauri) return () => {};
 let unlisten: (() => void) | null = null;
 tauriListen<any>('novel-lab:analyze-chunk', (e) => callback(e.payload))
 .then((fn) => { unlisten = fn; })
 .catch(() => {});
 return () => { if (unlisten) unlisten(); };
 },
 onAnalyzeDone: (callback: (payload: any) => void) => {
 if (!inTauri) return () => {};
 let unlisten: (() => void) | null = null;
 tauriListen<any>('novel-lab:analyze-done', (e) => callback(e.payload))
 .then((fn) => { unlisten = fn; })
 .catch(() => {});
 return () => { if (unlisten) unlisten(); };
 },
 onAnalyzeError: (callback: (payload: any) => void) => {
 if (!inTauri) return () => {};
 let unlisten: (() => void) | null = null;
 tauriListen<any>('novel-lab:analyze-error', (e) => callback(e.payload))
 .then((fn) => { unlisten = fn; })
 .catch(() => {});
 return () => { if (unlisten) unlisten(); };
 },
 };
}
