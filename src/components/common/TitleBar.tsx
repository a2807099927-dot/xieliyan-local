// TitleBar.tsx - Custom desktop window title bar and controls.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { electronAPI } from '../../utils/electron';
import { useBookStore } from '../../store/useBookStore';
import { useAppStore } from '../../store/useAppStore';
import { useConfigStore } from '../../store/useConfigStore';
import { IdeSvgSettings } from './IdeSvg';
import appIcon from '../../assets/app-icon.png';


interface TitleBarProps {
 onClose?: () => void;
 /** 精简模式：只显示标题 + 窗口控制按钮，隐藏云同步/设置 */
 minimal?: boolean;
}

export function TitleBar({ onClose, minimal }: TitleBarProps = {}) {
 const route = useAppStore((s) => s.route);
 const appConfig = useConfigStore((s) => s.config);

 const handleMinimize = () => { void electronAPI.system.windowMinimize(); };
 const handleMaximize = () => { void electronAPI.system.windowMaximize(); };
 const handleClose = () => { if (onClose) { onClose(); } else { void electronAPI.system.windowClose(); } };

 // 云同步下拉
 const [syncMenuOpen, setSyncMenuOpen] = useState(false);
 const [syncMenuAnchor, setSyncMenuAnchor] = useState<{ top: number; right: number } | null>(null);
 const syncBtnRef = useRef<HTMLButtonElement | null>(null);
 const syncMenuRef = useRef<HTMLDivElement | null>(null);

 // 编辑器保存状态（由 Editor.tsx dispatch）
 const [saveState, setSaveState] = useState<'saving' | 'saved' | 'failed'>('saved');
 useEffect(() => {
 const handler = (e: Event) => {
 const detail = (e as CustomEvent)?.detail;
 if (detail?.saveState) setSaveState(detail.saveState);
 };
 window.addEventListener('xly:save-state-change', handler);
 return () => window.removeEventListener('xly:save-state-change', handler);
 }, []);

 const openSyncMenu = useCallback(() => {
 const rect = syncBtnRef.current?.getBoundingClientRect();
 if (rect) {
 setSyncMenuAnchor({
 top: rect.bottom + 6,
 right: window.innerWidth - rect.right,
 });
 }
 setSyncMenuOpen(true);
 }, []);

 useEffect(() => {
 if (!syncMenuOpen) return;
 const onDocClick = (e: MouseEvent) => {
 const target = e.target as Node;
 if (
 syncMenuRef.current && !syncMenuRef.current.contains(target) &&
 syncBtnRef.current && !syncBtnRef.current.contains(target)
 ) {
 setSyncMenuOpen(false);
 }
 };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSyncMenuOpen(false); };
 document.addEventListener('mousedown', onDocClick);
 document.addEventListener('keydown', onKey);
 return () => {
 document.removeEventListener('mousedown', onDocClick);
 document.removeEventListener('keydown', onKey);
 };
 }, [syncMenuOpen]);

 const buildCloudPayloadFromConfig = useCallback(() => {
  const cfg = useConfigStore.getState().config;
  const cs = cfg?.cloudSync;
  const provider = cs?.activeProvider || cfg?.webdav?.provider || 'nutstore';
  const prof = cs?.providers?.[provider as keyof typeof cs.providers] || {};
  const wd = cfg?.webdav;
  return {
   provider,
   enabled: cs?.enabled ?? wd?.enabled ?? false,
   url: (prof as any).url || wd?.url || '',
   username: (prof as any).username || wd?.username || '',
   password: (prof as any).password || wd?.password || '',
   remotePath: (prof as any).remotePath || wd?.remotePath || '',
   accessToken: (prof as any).accessToken || '',
   refreshToken: (prof as any).refreshToken || '',
   cookie: (prof as any).cookie || '',
   folderId: (prof as any).folderId || '',
   appId: (prof as any).appId || '',
   appKey: (prof as any).appKey || '',
  };
 }, []);

 const runSyncUpload = useCallback(async () => {
 setSyncMenuOpen(false);
 const { useIslandStore } = await import('../../store/useIslandStore');
 useIslandStore.getState().show({ type: 'progress', message: '正在同步到云端...' });
    // 上传前等编辑器真正落盘当前章 .html，再打包
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('writerzen:force-save-done', onDone as EventListener);
        resolve();
      };
      const onDone = () => finish();
      window.addEventListener('writerzen:force-save-done', onDone as EventListener);
      window.dispatchEvent(new CustomEvent('writerzen:force-save-current-editor'));
      window.setTimeout(finish, 4000);
    });
    try {
      const { flushChapterMetaDisk, flushBookMetaPatches } = await import('../../store/useBookStore');
      await Promise.all([flushChapterMetaDisk(), flushBookMetaPatches()]);
    } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
 const payload = buildCloudPayloadFromConfig();
 const result = await ((electronAPI as any).cloud?.upload
  ? (electronAPI as any).cloud.upload(payload)
  : electronAPI.webdav.upload());
 if (result.success) {
 useIslandStore.getState().show({ type: 'success', message: `☁ 上传完成（${result.uploaded ?? 0} 个文件）`, autoHideMs: 2000 });
 } else {
 useIslandStore.getState().show({ type: 'error', message: result.error || '云同步失败', autoHideMs: 3000 });
 }
 }, [buildCloudPayloadFromConfig]);

 const runSyncDownload = useCallback(async () => {
 setSyncMenuOpen(false);
 if (!confirm('从云端下载将覆盖本地未同步的修改，确定继续吗？')) return;
 const { useIslandStore } = await import('../../store/useIslandStore');
 useIslandStore.getState().show({ type: 'progress', message: '正在从云端下载...' });
 const payload = buildCloudPayloadFromConfig();
 const result = await ((electronAPI as any).cloud?.download
  ? (electronAPI as any).cloud.download(payload)
  : electronAPI.webdav.download());
 if (result.success) {
 await new Promise((resolve) => setTimeout(resolve, 200));
 try {
 const { afterCloudDownload } = await import('../../store/useBookStore');
 await afterCloudDownload();
 } catch { /* ignore */ }
 // 合并云端同步下来的自定义写作提示词配置
 if ((result as any).styleProfiles && (result as any).styleProfiles.length > 0) {
 try {
 const { useConfigStore } = await import('../../store/useConfigStore');
 const config = useConfigStore.getState().config;
 if (config) {
 const remoteProfiles = (result as any).styleProfiles as Array<{ id: string; boundBookIds?: string[] }>;
 const localMap = new Map((config.ai.styleProfiles || []).map((p: any) => [p.id, p]));
 for (const p of remoteProfiles) {
 if (!p?.id) continue;
 const { boundBookIds: _, ...remoteClean } = p;
 const local = localMap.get(p.id);
 localMap.set(p.id, { ...remoteClean, boundBookIds: local?.boundBookIds });
 }
 const merged = Array.from(localMap.values());
 const next = { ...config, ai: { ...config.ai, styleProfiles: merged } };
 await useConfigStore.getState().saveConfig(next);
 useIslandStore.getState().show({ type: 'success', message: `☁ 已同步 ${remoteProfiles.length} 个自定义写作提示词配置`, autoHideMs: 2000 });
 }
 } catch (spErr) {
 console.warn('合并 styleProfiles 失败:', spErr);
 }
 }
 useIslandStore.getState().show({ type: 'success', message: `☁ 下载完成（${result.downloaded ?? 0} 个文件），书架已刷新`, autoHideMs: 2400 });
 } else {
 useIslandStore.getState().show({ type: 'error', message: result.error || '下载失败', autoHideMs: 3000 });
 }
 }, []);

 // 同步下拉菜单（portal 到 body，避开 .wz-titlebar 的 contain: paint）
 const syncDropdown = syncMenuOpen && syncMenuAnchor ? createPortal(
 <div
 ref={syncMenuRef}
 className="wz-crystal wz-menu-themed"
 style={{
 position: 'fixed',
 top: syncMenuAnchor.top,
 right: syncMenuAnchor.right,
 minWidth: '160px',
 background: 'linear-gradient(165deg, #1a1a2e 0%, #16213e 100%)',
 border: '1px solid rgba(255,255,255,0.1)',
 borderRadius: '8px',
 boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.08)',
 padding: '4px',
 zIndex: 99999,
 animation: 'fadeInScale 0.15s ease-out',
 }}
 >
 <button
 onClick={runSyncUpload}
 style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px', textAlign: 'left' }}
 onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.18)')}
 onMouseLeave={e => (e.currentTarget.style.background = 'none')}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
 <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
 <polyline points="17 8 12 3 7 8" />
 <line x1="12" y1="3" x2="12" y2="15" />
 </svg>
 <span>上传同步</span>
 </button>
 <button
 onClick={runSyncDownload}
 style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', color: '#e2e8f0', fontSize: '12px', textAlign: 'left' }}
 onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.18)')}
 onMouseLeave={e => (e.currentTarget.style.background = 'none')}
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
 <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
 <polyline points="7 10 12 15 17 10" />
 <line x1="12" y1="15" x2="12" y2="3" />
 </svg>
 <span>下载同步</span>
 </button>
 <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 6px' }} />
 <div style={{ padding: '6px 12px', fontSize: '10px', color: 'var(--text-muted)' }}>
 {(() => {
  const p = appConfig?.cloudSync?.activeProvider || appConfig?.webdav?.provider || 'nutstore';
  const map: Record<string, string> = {
   nutstore: '坚果云 WebDAV',
   webdav: '通用 WebDAV',
   aliyun: '阿里云盘',
  };
  return map[p] || '云盘同步';
 })()}
 </div>
 </div>,
 document.body
 ) : null;

 return (
 <div className="wz-titlebar">
 <div className="wz-tb-logo">
 <img src={appIcon} alt="写梨眼" className="wz-tb-logo-img" draggable={false} />
 <span>写梨眼</span>
 </div>
 <div className="wz-tb-spacer" />
{!minimal ? (
  <button
  type="button"
  className="wz-tb-settings"
  title="云端同步"
  ref={syncBtnRef}
  onClick={openSyncMenu}
  >
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9 4.5 4.5 0 0 0 7 17.5" />
  <path d="M12 12v9" />
  <path d="m8 15 4-4 4 4" />
  </svg>
  </button>
  ) : null}
  {!minimal ? (
  <button
  type="button"
  className="wz-tb-settings"
  title="设置"
  data-guide-target="settings"
  onClick={() => window.dispatchEvent(new CustomEvent('writerzen:open-settings'))}
  >
  <IdeSvgSettings size={16} />
  </button>
  ) : null}
 <div className="wz-window-controls wz-tb-win">
 <button onClick={handleMinimize} className="wz-control-btn" title="最小化"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg></button>
 <button onClick={handleMaximize} className="wz-control-btn" title="最大化/还原"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg></button>
 <button onClick={handleClose} className="wz-control-btn wz-control-btn-close close" title="关闭"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
 </div>
 {!minimal && syncDropdown}
 </div>
 );
}
