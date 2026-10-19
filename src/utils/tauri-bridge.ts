// Tauri 桥接层 — 接口签名与主项目的 electronAPI 完全一致
// 实现：在 Tauri 环境调真实 invoke；在浏览器预览模式走 stub（开发用）

import { listen as tauriListen } from '@tauri-apps/api/event';

// 跟主项目 webdav config 对齐
interface WebDavConfig {
 enabled?: boolean;
 url?: string;
 username?: string;
 password?: string;
 remotePath?: string;
}
type WebDavLikePayload = WebDavConfig | { config?: WebDavConfig } | undefined;

function extractWebDavConfig(payload: WebDavLikePayload): WebDavConfig | undefined {
 if (!payload) return undefined;
 // 兼容两种形态：直接传 config，或包了一层 { config: {...} }
 if ('config' in payload && payload.config) return payload.config;
 return payload as WebDavConfig;
}

let invokeImpl: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let inTauri = false;

function checkInTauri(): boolean {
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals && typeof internals.invoke === 'function') {
 invokeImpl = internals.invoke;
 inTauri = true;
 return true;
 }
 } catch { /* ignore */ }
 return inTauri;
}

try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals && typeof internals.invoke === 'function') {
 invokeImpl = internals.invoke;
 inTauri = true;
 }
} catch { /* ignore */ }

// 安全的事件监听器工厂：确保组件卸载时即使 Promise 未 resolve 也能正确清理
function safeListen<T>(event: string, handler: (payload: T) => void): () => void {
 checkInTauri();
 if (!inTauri) return () => {};
 let unlisten: (() => void) | null = null;
 let disposed = false;
 tauriListen<T>(event, (e) => { if (!disposed) handler(e.payload); })
 .then((fn) => {
 if (disposed) { fn(); return; }
 unlisten = fn;
 })
 .catch(() => {});
 return () => {
 disposed = true;
 if (unlisten) unlisten();
 };
}

const browserStubBooks = [
 {
 id: 'demo-book-1',
 title: '示例小说',
 author: '写梨眼',
 description: 'Tauri 2 版预览用示例',
 genre: '玄幻',
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 chapters: [
 { id: 'ch-1', title: '第1章 起始', content: '<h2 style="text-align:center;">第1章 起始</h2><p>这是 Tauri 2 版的第一章示例内容。</p>', wordCount: 18, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
 { id: 'ch-2', title: '第2章 征途', content: '<h2 style="text-align:center;">第2章 征途</h2><p>少年踏上了未知的旅途。</p>', wordCount: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
 ],
 volumes: [{ id: 'vol-1', title: '第一卷', chapterIds: ['ch-1', 'ch-2'] }],
 resourceIndex: { customCharacterCategories: [] },
 },
 {
 id: 'demo-book-2',
 title: '网游之酒剑歌行',
 author: '酒仙',
 description: '酒中乾坤大，壶中日月长',
 genre: '网游',
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 chapters: [
 { id: 'c2-1', title: '第1章 酒仙传承', content: '<h2 style="text-align:center;">第1章 酒仙传承</h2><p>太白斗酒诗百篇，长安市上酒家眠。</p>', wordCount: 20, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
 ],
 volumes: [{ id: 'vol-1', title: '正文', chapterIds: ['c2-1'] }],
 resourceIndex: { customCharacterCategories: [] },
 },
 {
 id: 'demo-book-3',
 title: '新书一号',
 author: '无名氏',
 description: '科幻未来畅想',
 genre: '科幻',
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 chapters: [
 { id: 'c3-1', title: '第1章 赛博黎明', content: '<h2 style="text-align:center;">第1章 赛博黎明</h2><p>霓虹闪烁的钢铁森林中。</p>', wordCount: 15, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
 ],
 volumes: [{ id: 'vol-1', title: '正文', chapterIds: ['c3-1'] }],
 resourceIndex: { customCharacterCategories: [] },
 },
 {
 id: 'demo-book-4',
 title: '玄幻纪元',
 author: '大道',
 description: '破碎虚空，唯我独尊',
 genre: '玄幻',
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 chapters: [
 { id: 'c4-1', title: '第1章 觉醒', content: '<h2 style="text-align:center;">第1章 觉醒</h2><p>废柴少年的逆袭之旅。</p>', wordCount: 12, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
 ],
 volumes: [{ id: 'vol-1', title: '正文', chapterIds: ['c4-1'] }],
 resourceIndex: { customCharacterCategories: [] },
 },
 {
 id: 'demo-book-5',
 title: '都市全能高手',
 author: '修罗',
 description: '龙王归来，赘婿崛起',
 genre: '都市',
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 chapters: [
 { id: 'c5-1', title: '第1章 龙王出山', content: '<h2 style="text-align:center;">第1章 龙王出山</h2><p>歪嘴一笑，乾坤已定。</p>', wordCount: 16, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
 ],
 volumes: [{ id: 'vol-1', title: '正文', chapterIds: ['c5-1'] }],
 resourceIndex: { customCharacterCategories: [] },
 }
];

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
 checkInTauri();
 if (invokeImpl) {
 return await invokeImpl(cmd, args) as T;
 }
 // 浏览器预览模式 stub
 return undefined as unknown as T;
}

export const tauriAPI = {
 fs: {
 selectFolder: async () => {
 if (!inTauri) return { path: null };
 const path = await invoke<string | null>('select_folder');
 return { path };
 },
 selectFile: async (_payload?: unknown) => {
 if (!inTauri) return { path: null };
 const path = await invoke<string | null>('select_file');
 return { path };
 },
 selectSavePath: async (payload?: { defaultPath?: string; title?: string; filters?: unknown }) => {
 if (!inTauri) return { path: null };
 const path = await invoke<string | null>('select_save_path', { defaultPath: payload?.defaultPath });
 return { path };
 },
 initWorkspace: async (payload: { path: string }) => {
 if (!inTauri) return { success: true };
 await invoke<boolean>('init_workspace', payload);
 return { success: true };
 },
 loadBooks: async () => {
 if (!inTauri) return { books: browserStubBooks };
 const books = await invoke<unknown[]>('load_books');
 // Tauri 端首次启动 books 可能为空数组（新建或未配置工作区），属正常状态。
 // 不再注入示例书，避免示例数据被当成真实书籍编辑后写入磁盘。
 return { books: Array.isArray(books) ? books : [] };
 },
 loadChapterContent: async (payload: { bookId: string; chapterId: string }) => {
 if (!inTauri) return { success: true, content: '' };
 const content = await invoke<string>('load_chapter_content', payload);
 return { success: true, content: content || '' };
 },
 saveBook: async (payload: { book: unknown }) => {
 if (inTauri) await invoke<boolean>('save_book', { book: payload.book });
 return { success: true };
 },
 /** 仅合并 book.settings，不回填章节正文（工坊设定等高频小改） */
 patchBookSettings: async (payload: { bookId: string; settings: Record<string, unknown> }) => {
 if (inTauri) await invoke<boolean>('patch_book_settings', {
 bookId: payload.bookId,
 settingsPatch: payload.settings,
 });
 return { success: true };
 },
 /** 轻量改 book.json 顶层字段（灵感笔记/大纲看板/书名等），禁止改 chapters，无正文回填 */
 patchBookMeta: async (payload: { bookId: string; patch: Record<string, unknown> }) => {
 if (inTauri) await invoke<boolean>('patch_book_meta', {
 bookId: payload.bookId,
 patch: payload.patch,
 });
 return { success: true };
 },
 saveChapterContent: async (payload: { bookId: string; chapterId: string; content: string }) => {
 if (inTauri) await invoke<boolean>('save_chapter_content', payload);
 return { success: true };
 },
 patchChapter: async (payload: { bookId: string; chapterId: string; content?: string; title?: string; outline?: string; wordCount?: number; updatedAt: string }) => {
 if (inTauri) await invoke('patch_chapter', payload);
 return { success: true };
 },
 deleteBook: async (payload: { bookId: string }) => {
 if (inTauri) await invoke<boolean>('delete_book', payload);
 return { success: true };
 },
 exportTxt: async (payload: { bookId: string; outputPath: string; chapterIds?: string[] | null }) => {
 if (inTauri) await invoke('export_txt', { chapterIds: null, ...payload });
 return { success: true };
 },
 exportMarkdown: async (payload: { bookId: string; outputPath: string; chapterIds?: string[] | null }) => {
 if (inTauri) await invoke('export_markdown', { chapterIds: null, ...payload });
 return { success: true };
 },
 exportPdf: async (payload: { bookId: string; outputPath: string; chapterIds?: string[] | null }) => {
 if (!inTauri) return { success: true };
 return await invoke<{ success: boolean; path?: string }>('export_pdf', { chapterIds: null, ...payload });
 },
 importTxt: async (payload: { filePath: string }): Promise<{ content: string; chapters: unknown[]; volumes?: unknown[] }> => {
 if (!inTauri) return { content: '', chapters: [] };
 return await invoke('import_txt', payload) as { content: string; chapters: unknown[] };
 },
 readTextFile: async (payload: { path: string }) => {
 if (!inTauri) return { text: '' };
 const text = await invoke<string>('read_text_file', payload);
 return { text };
 },
 importWallpaper: async (payload: { sourcePath: string }) => {
 if (!inTauri) return { path: '', replacedCount: 0, compressed: false };
 return await invoke<{ path: string; replacedCount: number; compressed: boolean }>('import_wallpaper', { sourcePath: payload.sourcePath });
 },
 importBookCover: async (payload: { bookId: string; sourcePath: string }) => {
 if (!inTauri) return { path: '', compressed: false };
 return await invoke<{ path: string; compressed: boolean }>('import_book_cover', { bookId: payload.bookId, sourcePath: payload.sourcePath });
 },
 backupWorkspace: async (payload?: { outputDir?: string }) => {
 if (!inTauri) return { success: true };
 return await invoke('backup_workspace', { outputDir: payload?.outputDir }) as { success: boolean; path?: string; fileCount?: number };
 },
 backupBook: async (payload: { bookId: string }) => {
 if (!inTauri) return { success: true };
 return await invoke<{ success: boolean; backupPath?: string }>('backup_book', { bookId: payload.bookId });
 },
 loadMemoryBank: async (payload: { bookId: string }) => {
 if (!inTauri) return { memoryBank: [] };
 const memoryBank = await invoke<unknown[]>('load_memory_bank', payload);
 return { memoryBank: Array.isArray(memoryBank) ? memoryBank : [] };
 },
 saveMemoryBank: async (payload: { bookId: string; memoryBank: unknown[] }) => {
 if (inTauri) await invoke('save_memory_bank', payload);
 return { success: true };
 },
 loadMemoryHistory: async (payload: { bookId: string; kind: string }) => {
 if (!inTauri) return { entries: [] };
 return await invoke<{ entries: any[] }>('load_memory_history', { bookId: payload.bookId, kind: payload.kind });
 },
 saveMemoryHistory: async (payload: { bookId: string; kind: string; entry: any }) => {
 if (!inTauri) return { success: true };
 return await invoke<{ success: boolean; count?: number }>('save_memory_history', { bookId: payload.bookId, kind: payload.kind, entry: payload.entry });
 },
 deleteMemoryHistory: async (payload: { bookId: string; kind: string; id: string }) => {
 if (!inTauri) return { success: true };
 return await invoke<{ success: boolean; count?: number }>('delete_memory_history', { bookId: payload.bookId, kind: payload.kind, id: payload.id });
 },
 clearMemoryHistory: async (payload: { bookId: string; kind: string }) => {
 if (!inTauri) return { success: true };
 return await invoke<{ success: boolean }>('clear_memory_history', { bookId: payload.bookId, kind: payload.kind });
 },
 loadHistorySnapshots: async (payload: { bookId: string; chapterId: string }) => {
 if (!inTauri) return { snapshots: [] as Array<{ id: string; at: string; content: string }> };
 const snapshots = await invoke<Array<{ id: string; at: string; content: string }>>('load_history_snapshots', payload);
 return { snapshots: Array.isArray(snapshots) ? snapshots : [] };
 },
 saveHistorySnapshot: async (payload: { bookId: string; chapterId: string; snapshot: unknown }) => {
 if (inTauri) await invoke('save_history_snapshot', payload);
 return { success: true };
 },
 loadSettings: async () => {
 if (!inTauri) return { settings: null };
 return await invoke<{ settings: any }>('load_settings');
 },
 saveSettings: async (payload: { settings: unknown }) => {
 if (!inTauri) return { success: true };
 await invoke('save_settings', { settings: payload.settings });
 return { success: true };
 },
 saveTextFile: async (payload: { path: string; content: string }) => {
 if (!inTauri) return { success: true };
 await invoke('save_text_file', { path: payload.path, content: payload.content });
 return { success: true };
 },
 },

 system: {
 setWindowSize: async (payload: { width: number; height: number }) => {
 if (inTauri) await invoke('set_window_size', { width: payload.width, height: payload.height });
 },
 windowMinimize: async () => {
 checkInTauri();
 if (!inTauri) return;
 try {
 const { getCurrentWindow } = await import('@tauri-apps/api/window');
 await getCurrentWindow().minimize();
 } catch {
 await invoke('window_minimize');
 }
 },
 windowMaximize: async () => {
 checkInTauri();
 if (!inTauri) return;
 try {
 const { getCurrentWindow } = await import('@tauri-apps/api/window');
 const win = getCurrentWindow();
 if (await win.isMaximized()) {
 await win.unmaximize();
 } else {
 await win.maximize();
 }
 } catch {
 await invoke('window_maximize');
 }
 },
 windowClose: async () => {
 checkInTauri();
 if (!inTauri) return;
 try {
 const { getCurrentWindow } = await import('@tauri-apps/api/window');
 await getCurrentWindow().close();
 } catch {
 await invoke('window_close');
 }
 },
 toggleDevTools: async () => { if (inTauri) await invoke('toggle_dev_tools'); },
 openExternal: async (payload: { url: string }) => {
 if (!inTauri) return { success: false };
 const ok = await invoke<boolean>('open_external', { url: payload.url });
 return { success: ok };
 },
 openPath: async (payload: { path: string }) => {
 if (!inTauri) return { success: false };
 try {
 const ok = await invoke<boolean>('open_path', { path: payload.path });
 return { success: ok };
 } catch (err: any) {
 return { success: false, error: String(err?.message || err) };
 }
 },
 openAgentWindow: async (payload: { bookId: string; chapterId: string }) => {
 if (!inTauri) return { success: true };
 await invoke('open_agent_window', { bookId: payload.bookId, chapterId: payload.chapterId });
 return { success: true };
 },
 openNovelLabWindow: async () => {
 if (!inTauri) return { success: true };
 await invoke('open_novel_lab_window');
 return { success: true };
 },
 openBookSweeperWindow: async () => {
 if (!inTauri) return { success: true };
 await invoke('open_book_sweeper_window');
 return { success: true };
 },
 openOutlineBoardWindow: async (payload: { bookId: string }) => {
 if (!inTauri) return { success: true };
 await invoke('open_outline_board_window', { bookId: payload.bookId });
 return { success: true };
 },
 fetchQidianRank: async (rankType: string) => {
 if (!inTauri) return [];
 return await invoke<any[]>('fetch_qidian_rank', { rankType });
 },
 fetchFanqieRank: async (rankType: string | number, categoryId?: string | null) => {
 if (!inTauri) return [];
 return await invoke<any[]>('fetch_fanqie_rank', { rankType: String(rankType), categoryId });
 },
 fetchQidianChapters: async (bookId: string) => {
 if (!inTauri) return [];
 return await invoke<any>('fetch_qidian_chapters', { bookId });
 },
 fetchQidianDescription: async (bookId: string) => {
 if (!inTauri) return '';
 return await invoke<string>('fetch_qidian_description', { bookId });
 },
 fetchQidianChapterContent: async (bookId: string, chapterId: string) => {
 if (!inTauri) return '';
 return await invoke<string>('fetch_qidian_chapter_content', { bookId, chapterId });
 },
 fetchFanqieChapters: async (bookId: string) => {
 if (!inTauri) return [];
 return await invoke<any>('fetch_fanqie_chapters', { bookId });
 },
 fetchFanqieChapterContent: async (chapterId: string) => {
 if (!inTauri) return '';
 return await invoke<string>('fetch_fanqie_chapter_content', { chapterId });
 },
 getAgentWindowState: async () => {
 if (!inTauri) return { state: null };
 return await invoke<{ state: { bookId: string; chapterId: string } | null }>('get_agent_window_state');
 },
 submitAgentWindowBridgeRequest: async (payload: { requestId: string; type: string; chapterId: string; payload?: unknown }) => {
 if (!inTauri) return {};
 return await invoke('submit_agent_window_bridge_request', {
 requestId: payload.requestId,
 bridgeType: payload.type,
 chapterId: payload.chapterId,
 payload: payload.payload,
 });
 },
 submitAgentWindowBridgeResponse: async (payload: { requestId: string; success: boolean; result?: unknown; error?: string }) => {
 if (!inTauri) return { success: true };
 await invoke('submit_agent_window_bridge_response', {
 requestId: payload.requestId,
 success: payload.success,
 result: payload.result,
 error: payload.error,
 });
 return { success: true };
 },
 onAgentWindowBridgeRequest: (callback: (payload: any) => void) => {
 return safeListen<any>('agent:bridge-request', callback);
 },
 openContinuationWindow: async (payload: any) => {
 if (!inTauri) return { success: true };
 await invoke('open_continuation_window', {
 payload: {
 source: payload?.source ?? 'guided',
 bookId: payload?.bookId ?? '',
 chapterId: payload?.chapterId ?? '',
 insertFrom: payload?.insertFrom,
 title: payload?.title ?? 'AI 续写结果',
 elapsedMs: Number(payload?.elapsedMs ?? 0),
 paragraphs: Array.isArray(payload?.paragraphs) ? payload.paragraphs.map((p: unknown) => String(p)) : [],
 selected: Array.isArray(payload?.selected) ? payload.selected.filter((n: unknown) => Number.isFinite(n)) : [],
 editingIndex: typeof payload?.editingIndex === 'number' ? payload.editingIndex : null,
 retryRequest: payload?.retryRequest,
 },
 });
 return { success: true };
 },
 getContinuationWindowState: async () => {
 if (!inTauri) return { state: null };
 return await invoke<{ state: any | null }>('get_continuation_window_state');
 },
 submitContinuationWindowAction: async (payload: { action: string; paragraphs: string[]; selected: number[]; editingIndex: number | null }) => {
 if (!inTauri) return { success: true };
 await invoke('submit_continuation_window_action', {
 action: payload.action,
 paragraphs: payload.paragraphs ?? [],
 selected: payload.selected ?? [],
 editingIndex: payload.editingIndex,
 });
 return { success: true };
 },
 onContinuationWindowAction: (callback: (payload: any) => void) => {
 return safeListen<any>('continuation:window-action', callback);
 },
 aiwebOpen: async (url?: string) => {
 if (!inTauri) return { ok: false as boolean, reason: 'not_supported' };
 return await invoke<{ ok: boolean; reason?: string }>('aiweb_open', { url });
 },
 aiwebHide: async () => {
 if (inTauri) await invoke('aiweb_hide');
 },
 aiwebReload: async () => {
 if (inTauri) await invoke('aiweb_reload');
 },
 aiwebShellAction: async (action: string) => {
 if (inTauri) await invoke('aiweb_shell_action', { action });
 },
 aiwebExecuteJS: async (code?: string) => {
 if (!inTauri || !code) return null as unknown;
 return await invoke<unknown>('aiweb_execute_js', { code });
 },
 aiwebStatus: async () => {
 if (!inTauri) return { visible: false, url: '', exists: false };
 return await invoke<{ visible: boolean; url: string; exists: boolean }>('aiweb_status');
 },
 onAiwebInjectScripts: (callback: () => void) => {
 return safeListen<unknown>('aiweb:inject-scripts', () => callback());
 },
 onAiwebWebAction: (callback: (payload: string) => void) => {
 return safeListen<string>('aiweb:web-action', (p) => callback(String(p || '')));
 },
 onAiwebShellAction: (callback: (action: string) => void) => {
 return safeListen<string>('aiweb:shell-action', (p) => callback(String(p || '')));
 },
 onAiwebHidden: (callback: () => void) => {
 return safeListen<unknown>('aiweb:hidden', () => callback());
 },
 onToolboxAction: (callback: (action: string) => void) => {
 return safeListen<string>('toolbox:action', (p) => callback(String(p || '')));
 },
 toolboxOpen: async () => {
 if (!inTauri) return { ok: false as boolean };
 return await invoke<{ ok: boolean }>('toolbox_open');
 },
 toolboxHide: async () => {
 if (inTauri) await invoke('toolbox_hide');
 },
 scaleSet: async (scale: number) => {
 if (!inTauri) return scale;
 return await invoke<number>('scale_set', { scale });
 },
 scaleGet: async () => {
 if (!inTauri) return 1.0;
 return await invoke<number>('scale_get');
 },
 scaleZoomIn: async () => {
 if (!inTauri) return 1.0;
 return await invoke<number>('scale_zoom_in');
 },
 scaleZoomOut: async () => {
 if (!inTauri) return 1.0;
 return await invoke<number>('scale_zoom_out');
 },
 scaleReset: async () => {
 if (!inTauri) return 1.0;
 return await invoke<number>('scale_reset');
 },
  onScaleChanged: (callback: (scale: number) => void) => {
  return safeListen<number>('scale:changed', callback);
  },
  },

  userSkills: {
  load: async (): Promise<Array<Record<string, unknown>>> => {
  if (!inTauri) return [];
  const list = await invoke<Array<Record<string, unknown>>>('user_skills_load');
  return Array.isArray(list) ? list : [];
  },
  save: async (skills: Array<Record<string, unknown>>): Promise<boolean> => {
  if (!inTauri) return true;
  const ok = await invoke<boolean>('user_skills_save', { skills });
  return Boolean(ok);
  },
  appDataPath: async (): Promise<string> => {
  if (!inTauri) return '';
  return await invoke<string>('app_data_path');
  },
  },

  ai: {
 chat: async (payload: { messages: Array<{role:string;content?: string | null; tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>; tool_call_id?: string}>; stream?: boolean; tools?: Array<{type:'function';function:{name:string;description:string;parameters:Record<string,unknown>}}>; tool_choice?: 'auto'|'none'; bookId?: string; chapterId?: string; disableRag?: boolean; disableStyle?: boolean; maxTokens?: number; shuangwenMode?: boolean; senderId?: string; sessionId?: string }): Promise<{ text: string; provider: string; model: string; durationMs?: number; usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; estimatedCost?: number }; tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }> }> => {
 if (!inTauri) return { text: '[浏览器预览模式：AI 调用不可用]', provider: 'openai', model: '' };
 const resp = await invoke<any>('ai_chat', { request: payload });
 return resp;
 },
 abort: async (senderId?: string) => {
 if (inTauri) await invoke('ai_abort', { senderId: senderId ?? null });
 return { success: true };
 },
 validate: async (payload: { config: unknown } | unknown) => {
 if (!inTauri) return { valid: true };
 const config = (payload as any)?.config ?? payload;
 return await invoke<{ valid: boolean; error?: string }>('ai_validate', { config });
 },
 getLocalModels: async (payload: { baseUrl?: string; apiKey?: string } | unknown) => {
 if (!inTauri) return { models: [] as string[] };
 const args = (payload as any) || {};
 const baseUrl = String(args.baseUrl || 'http://127.0.0.1:11434');
 return await invoke<{ models: string[]; diagnostics?: string[] }>('ai_get_local_models', { baseUrl, apiKey: args.apiKey });
 },
 getProviderModels: async (payload: { provider: string; apiKey?: string; baseUrl?: string }) => {
 if (!inTauri) return { models: [] };
 return await invoke<{ models: string[]; diagnostics?: string[] }>('ai_get_provider_models', { provider: payload.provider, apiKey: payload.apiKey, baseUrl: payload.baseUrl });
 },
 getStylePrompt: async (payload: { styleInstruction?: string }) => {
 if (!inTauri) return '';
 return await invoke<string>('ai_get_style_prompt', { styleInstruction: payload.styleInstruction });
 },
 getStyleExtractionPrompt: async (phase: 'A' | 'B' | 'C' | 'D'): Promise<string> => {
 if (!inTauri) return '';
 return await invoke<string>('ai_get_style_extraction_prompt', { phase });
 },
 getArcPlannerPrompt: async (phase: 'discussing' | 'finalize'): Promise<string> => {
 if (!inTauri) return '';
 return await invoke<string>('ai_get_arc_planner_prompt', { phase });
 },
 getEncryptedPrompt: async (id: string): Promise<string> => {
 if (!inTauri) return '';
 try {
 return await invoke<string>('get_encrypted_prompt', { id });
 } catch (e) {
 console.error(`Failed to get encrypted prompt ${id}:`, e);
 return '';
 }
 },
 benchmarkLinks: async () => {
 if (!inTauri) return { generatedAt: '', probes: [] };
 return await invoke<{ generatedAt: string; probes: any[] }>('ai_benchmark_links');
 },
 onStreamChunk: (callback: (chunk: { text: string; done: boolean; sessionId?: string; phase?: string }) => void) => {
 return safeListen<{ text: string; done: boolean; sessionId?: string; phase?: string }>('ai:stream-chunk', callback);
 },
 /**
  * 按 sessionId 过滤的流式监听：只接收指定流式会话的 chunk。
  * 用于修复并发流式请求互相串扰：每个流式调用方生成唯一 sessionId，
  * 传给 ai.chat({ sessionId })，再用本方法注册监听。
  * 兼容性：chunk 不带 sessionId（旧后端/非流式请求）时不过滤，照常回调。
  */
 onStreamChunkFor: (sessionId: string, callback: (chunk: { text: string; done: boolean; sessionId?: string; phase?: string }) => void) => {
 return safeListen<{ text: string; done: boolean; sessionId?: string; phase?: string }>('ai:stream-chunk', (chunk) => {
 if (chunk.sessionId && chunk.sessionId !== sessionId) return;
 callback(chunk);
 });
 },
 getLogs: async (): Promise<any[]> => {
 if (!inTauri) return [];
 return await invoke<any[]>('ai_get_logs');
 },
 clearLogs: async () => {
 if (inTauri) await invoke('ai_clear_logs');
 return { success: true };
 },
 inspirationSearch: async (payload: { query: string; currentChapter: string; contextSummary: string }): Promise<{ success: boolean; results: Array<{ book_name: string; chapter_hint: string; reason: string; fetched_text: string; source_url: string }>; ai_analysis: string; error?: string }> => {
 if (!inTauri) return { success: false, results: [], ai_analysis: '', error: '浏览器预览模式不支持' };
 return await invoke('ai_inspiration_search', { request: { query: payload.query, current_chapter: payload.currentChapter, context_summary: payload.contextSummary } });
 },
  httpFetch: async (url: string): Promise<string> => {
   if (!inTauri) return '';
   return await invoke<string>('http_fetch', { url });
  },
   webSearch: async (query: string): Promise<string> => {
    if (!inTauri) return '';
    return await invoke<string>('web_search', { query });
   },
   agentBrowserOpen: async (url: string): Promise<boolean> => {
    if (!inTauri) return false;
    return await invoke<boolean>('agent_browser_open', { url });
   },
   agentBrowserNavigate: async (url: string): Promise<boolean> => {
    if (!inTauri) return false;
    return await invoke<boolean>('agent_browser_navigate', { url });
   },
   agentBrowserExecuteJs: async (code: string, requestId: string): Promise<{ ok: boolean; requestId: string }> => {
    if (!inTauri) return { ok: false, requestId };
    return await invoke<{ ok: boolean; requestId: string }>('agent_browser_execute_js', { code, requestId });
   },
   agentBrowserClose: async (): Promise<boolean> => {
    if (!inTauri) return false;
    return await invoke<boolean>('agent_browser_close');
   },
   },

 agent: {
 prepareTask: async (payload: { taskSheet: unknown }) => {
 if (!inTauri) return { ok: false, error: '浏览器预览模式不支持' };
 return await invoke<{ ok: boolean; error?: string; referenceBundle?: unknown }>('agent_prepare_task', { taskSheet: payload.taskSheet });
 },
 status: async () => {
 if (!inTauri) return { ready: false };
 return await invoke<{ ready: boolean; reason?: string }>('agent_status');
 },
 },

 webdav: {
 test: async (payload?: WebDavLikePayload): Promise<{ success: boolean; error?: string; warning?: string }> => {
 if (!inTauri) return { success: false, error: 'Tauri 2 阶段：浏览器预览模式不支持 WebDAV' };
 const cfg = extractWebDavConfig(payload);
 return await invoke<{ success: boolean; error?: string; warning?: string }>('webdav_test', { config: cfg });
 },
 upload: async (payload?: WebDavLikePayload): Promise<{ success: boolean; uploaded?: number; error?: string }> => {
 if (!inTauri) return { success: false };
 const cfg = extractWebDavConfig(payload);
 return await invoke<{ success: boolean; uploaded: number; error?: string }>('webdav_upload', { config: cfg });
 },
 download: async (payload?: WebDavLikePayload): Promise<{ success: boolean; downloaded?: number; error?: string }> => {
 if (!inTauri) return { success: false };
 const cfg = extractWebDavConfig(payload);
 return await invoke<{ success: boolean; downloaded: number; error?: string }>('webdav_download', { config: cfg });
 },
 },

 /** 多网盘统一同步（坚果云 / 通用 WebDAV + 阿里云盘扫码） */
 cloud: {
 test: async (payload?: Record<string, unknown>): Promise<{ success: boolean; error?: string; warning?: string }> => {
 if (!inTauri) return { success: false, error: '浏览器预览模式不支持云同步' };
 return await invoke('cloud_sync_test', { config: payload || null }) as any;
 },
 upload: async (payload?: Record<string, unknown>): Promise<{ success: boolean; uploaded?: number; error?: string }> => {
 if (!inTauri) return { success: false, error: '浏览器预览模式不支持云同步' };
 return await invoke('cloud_sync_upload', { config: payload || null }) as any;
 },
 download: async (payload?: Record<string, unknown>): Promise<{ success: boolean; downloaded?: number; error?: string; styleProfiles?: unknown[] }> => {
 if (!inTauri) return { success: false, error: '浏览器预览模式不支持云同步' };
 return await invoke('cloud_sync_download', { config: payload || null }) as any;
 },
 /** 阿里云盘扫码授权 */
 authorize: async (provider: 'aliyun'): Promise<{
  success: boolean;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
  appFolder?: string;
 }> => {
  if (!inTauri) return { success: false, error: '浏览器预览模式不支持授权' };
  return await invoke('cloud_oauth_authorize', { provider }) as any;
 },
 oauthStatus: async (): Promise<{ aliyunReady: boolean; via?: string }> => {
  if (!inTauri) return { aliyunReady: true };
  return await invoke('cloud_oauth_status') as any;
 },
 },

 config: {
 load: async () => {
 if (!inTauri) {
 return { config: {
 workspace: { storagePath: 'C:/xieliyan-workspace', backupOutputPath: '' },
 ai: { provider: 'openai', model: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com', apiPath: '/v1/chat/completions', isLocked: true, ragEnabled: true, stylePresetId: '', styleInstruction: '', styleCustomEnabled: false, providerKeys: {}, providerBaseUrls: {}, providerModels: {}, providerLastModels: {}, proxyProfiles: [], activeProxyProfileId: '' },
 ui: { theme: 'dark', editorMaxWidth: 1100, rightPanelWidth: 400, lowPerformanceMode: false, customTheme: {}, appBrightness: 1, appContrast: 1, appSaturation: 1, uploadedFonts: [] },
 network: { requestTimeoutMs: 60000 },
 tokenStats: { byProvider: {} },
 webdav: { enabled: false, url: '', username: '', password: '' },
 } as any };
 }
 return await invoke<{ config: any }>('config_load');
 },
 getApiKey: async () => {
 if (!inTauri) return null;
 return await invoke<string | null>('config_get_api_key');
 },
 save: async (payload: { config: unknown }) => {
 if (inTauri) await invoke('config_save', { config: payload.config });
 return { success: true };
 },
 reset: async () => {
 if (inTauri) await invoke('config_reset');
 return { success: true };
 },
 },

 resources: {
 getCurrentBook: async () => ({}),
 scanCurrentBook: async (_payload: unknown) => ({}),
 queryCurrentBook: async (_payload: unknown) => ({}),
 addCategory: async (payload: { bookId?: string; name: string }) => {
 if (!inTauri) return { success: true, categories: [] };
 return await invoke('add_category', { bookId: payload.bookId, name: payload.name });
 },
 deleteCategory: async (payload: { bookId?: string; id: string }) => {
 if (!inTauri) return { success: true, categories: [] };
 return await invoke('delete_category', { bookId: payload.bookId, id: payload.id });
 },
 renameCategory: async (payload: { bookId?: string; id: string; name: string }) => {
 if (!inTauri) return { success: true };
 return await invoke('rename_category', { bookId: payload.bookId, id: payload.id, name: payload.name });
 },
 addRole: async (payload: { bookId?: string; categoryId: string; role?: unknown }) => {
 if (!inTauri) return { success: true };
 return await invoke('add_role', { bookId: payload.bookId, categoryId: payload.categoryId, role: payload.role });
 },
 deleteRole: async (payload: { roleId: string; bookId?: string }) => {
 if (!inTauri) return { success: true };
 return await invoke('delete_role', { bookId: payload.bookId, roleId: payload.roleId });
 },
 extractRoles: async (payload: { bookId: string; startChapter?: number; endChapter?: number; novelType?: string }): Promise<{ success: boolean; error?: string; extracted: any[]; totalCandidates: number; scannedChapters: number; selectedRange?: { startChapter: number; endChapter: number } }> => {
 if (!inTauri) return { success: false, error: '浏览器预览模式不支持', extracted: [], totalCandidates: 0, scannedChapters: 0 };
 return await invoke('extract_roles', { args: payload });
 },
 importExtractedRoles: async (payload: { bookId: string; payload?: unknown; roles?: unknown; result?: unknown; startChapter?: number; endChapter?: number }) => {
 if (!inTauri) return { success: true, categories: [], ignoredFingerprints: [] };
 const body = (payload as any).payload ?? (payload as any).roles ?? (payload as any).result ?? payload;
 return await invoke('import_extracted_roles', { bookId: payload.bookId, payload: body });
 },
 updateCharacter: async (payload: { bookId?: string; roleId?: string; patch: unknown }) => {
 if (!inTauri) return { success: true };
 // 没传 roleId 时（如 RolesPanel 更新 novelType），patch 写到 book.resourceIndex 而非具体角色
 if (!payload.roleId) {
 // 这种场景调 update_book_resource_meta（直接 patch resourceIndex）
 return await invoke('update_book_resource_meta', { bookId: payload.bookId, patch: payload.patch });
 }
 return await invoke('update_character', { bookId: payload.bookId, roleId: payload.roleId, patch: payload.patch });
 },
 updateRole: async (payload: { bookId?: string; role: unknown }) => {
 if (!inTauri) return { success: true };
 return await invoke('update_role', { bookId: payload.bookId, role: payload.role });
 },
 getRoleDetail: async (payload: { bookId?: string; roleId: string }) => {
 if (!inTauri) return {};
 return await invoke('get_role_detail', { bookId: payload.bookId, roleId: payload.roleId });
 },
 updateRoleDetail: async (payload: { bookId?: string; roleId: string; patch: unknown }) => {
 if (!inTauri) return { success: true };
 return await invoke('update_role_detail', { bookId: payload.bookId, roleId: payload.roleId, patch: payload.patch });
 },
 cleanupResidue: async (payload: { bookId?: string; roleName?: string }) => {
 if (!inTauri) return { success: true };
 return await invoke('cleanup_residue', { bookId: payload.bookId, roleName: payload.roleName });
 },
 },

 
};

export const electronAPI = tauriAPI;

/**
 * 桥接层的权威类型：直接从实现对象推导，避免手维声明与实现漂移。
 * 新增/修改 tauriAPI 上的方法时无需同步改类型。
 */
export type TauriApi = typeof tauriAPI;
