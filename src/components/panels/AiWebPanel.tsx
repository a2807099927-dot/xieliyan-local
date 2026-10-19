// 模块说明：AI 网页侧栏面板（tab 栏 + IPC 控制独立窗口）
// 每个站点是独立的 BrowserWindow（不是 webview 标签），Google 不会拦截
// 这个组件负责：显示 tab 栏让用户切换站点，通过 IPC 控制哪个窗口显示
import { useEffect, useRef, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { electronAPI } from '../../utils/electron';
import { buildAiWebInjectionScript } from './aiweb-injection';
import type { AiWebPayload } from './aiweb-injection';

interface AiSiteEntry {
 id: string;
 label: string;
 color: string;
}

const SITES: AiSiteEntry[] = [
 { id: 'chatgpt', label: 'ChatGPT', color: '#10a37f' },
 { id: 'gemini', label: 'Gemini', color: '#4285f4' },
 { id: 'aistudio', label: 'Studio', color: '#1a73e8' },
 { id: 'claude', label: 'Claude', color: '#d97a47' },
];

interface AiWebPanelProps {
 onWebAction?: (payload: AiWebPayload) => void;
}

export function AiWebPanel({ onWebAction }: AiWebPanelProps = {}) {
 const shellActionBusyRef = useRef(false);
 const [activeId, setActiveId] = useState<string>(() => {
 return localStorage.getItem('xly_aiweb_active') || SITES[0].id;
 });

 const openSite = useCallback((site: AiSiteEntry) => {
 setActiveId(site.id);
 localStorage.setItem('xly_aiweb_active', site.id);
 void electronAPI.system.aiwebOpen(undefined).then(() => electronAPI.system.aiwebShellAction?.(`switch:${site.id}`));
 }, []);

 // 注意：不要在挂载时自动 openSite，避免 Editor 内 AiWebPanel 被常驻后强行打开 AI 窗口。
 // 由 Editor 的 setAiWebOpen(true) 显式触发开窗。
 // 站点切换通过下面的 fill request / 用户从独立窗口的 tab 栏点击 实现。

 // 监听宿主"贴文字到输入框"请求
 useEffect(() => {
 const onFillRequest = (ev: Event) => {
 const detail = (ev as CustomEvent).detail as { siteId: string; text: string; filename?: string } | undefined;
 if (!detail || !detail.text) return;
 const targetSite = SITES.find((s) => s.id === detail.siteId) || SITES[0];
 openSite(targetSite);
 const tryInject = async (retries: number) => {
 if (retries <= 0) return;
 try {
 await electronAPI.system.aiwebExecuteJS(buildAiWebInjectionScript());
 const safeText = JSON.stringify(String(detail.text));
 const safeName = JSON.stringify(String(detail.filename || 'novel.txt'));
 const result = await electronAPI.system.aiwebExecuteJS(
 `window.__xlyAiWebFillInput && window.__xlyAiWebFillInput(${safeText}, ${safeName})`
 );
 if (result === 'fail' || result === null) {
 setTimeout(() => void tryInject(retries - 1), 500);
 }
 } catch {
 setTimeout(() => void tryInject(retries - 1), 500);
 }
 };
 setTimeout(() => void tryInject(15), 1000);
 };
 window.addEventListener('writerzen:aiweb-fill', onFillRequest as EventListener);
 return () => window.removeEventListener('writerzen:aiweb-fill', onFillRequest as EventListener);
 }, [openSite]);

 // 监听主进程通知：站点 view dom-ready 后注入右键菜单脚本
 useEffect(() => {
 const off = electronAPI.system.onAiwebInjectScripts(() => {
 void electronAPI.system.aiwebExecuteJS(buildAiWebInjectionScript()).catch(() => {});
 });
 return off;
 }, []);

 // 独立 AI 网页窗口里的顶部导航只负责发动作；真正切换由主窗口执行，避免子窗口自操作 child webview 卡住。
 useEffect(() => {
 const off = electronAPI.system.onAiwebShellAction?.((action: string) => {
 if (shellActionBusyRef.current) return;
 shellActionBusyRef.current = true;
 window.setTimeout(() => {
 shellActionBusyRef.current = false;
 }, 180);
 if (action === 'hide') {
 void electronAPI.system.aiwebHide();
 return;
 }
 if (action === 'reload') {
 void electronAPI.system.aiwebReload();
 return;
 }
 const siteId = action.startsWith('switch:') ? action.slice('switch:'.length) : '';
 const site = SITES.find((item) => item.id === siteId);
 if (site) {
 setActiveId(site.id);
 localStorage.setItem('xly_aiweb_active', site.id);
 }
 }) || (() => {});
 return off;
 }, []);

 // 监听主进程转发的右键菜单动作（创建角色卡 / 导入大纲 / 转入正文等）
 useEffect(() => {
 const off = electronAPI.system.onAiwebWebAction((payloadStr: string) => {
 try {
 const payload = JSON.parse(payloadStr);
 if (payload && payload.action && payload.text && onWebAction) {
 onWebAction(payload);
 }
 } catch { /* ignore */ }
 });
 return off;
 }, [onWebAction]);

 // 监听外部"刷新当前网页"请求
 useEffect(() => {
 const onReload = () => { void electronAPI.system.aiwebReload(); };
 window.addEventListener('writerzen:aiweb-reload', onReload);
 return () => window.removeEventListener('writerzen:aiweb-reload', onReload);
 }, []);

 const reload = () => void electronAPI.system.aiwebReload();

 // suppress unused
 void onWebAction;

 return (
 <div className="flex h-full w-full flex-col overflow-hidden !bg-black">
 {/* 顶部站点切换（横排带名字） */}
 <div className="flex shrink-0 items-center gap-1 border-b !border-zinc-800 !bg-black px-2 py-1.5">
 {SITES.map((site) => {
 const active = activeId === site.id;
 return (
 <button
 key={site.id}
 onClick={() => openSite(site)}
 className={clsx(
 'flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold transition-all',
 active ? '!bg-zinc-900 !text-white' : '!text-zinc-400 hover:!text-zinc-100'
 )}
 style={active ? { boxShadow: `inset 0 -2px 0 ${site.color}` } : undefined}
 >
 <span
 className="inline-block h-1.5 w-1.5 rounded-full"
 style={{ background: site.color, opacity: active ? 1 : 0.45 }}
 />
 {site.label}
 </button>
 );
 })}
 <div className="ml-auto flex items-center gap-1">
 <button
 onClick={reload}
 title="刷新"
 className="rounded p-1 !text-zinc-400 transition hover:!bg-zinc-900 hover:!text-white"
 >
 <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" /></svg>
 </button>
 </div>
 </div>

 {/* 下方提示 */}
 <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
 <div className="text-[11px] !text-zinc-500">← 网页在右侧窗口中</div>
 </div>
 </div>
 );
}
