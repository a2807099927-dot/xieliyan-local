// 模块说明：设置弹窗容器组件。
// 关键职责：组织各设置子面板，并提供统一的保存与关闭流程。
import { useEffect, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import type { AppConfig } from '../../types/ai';
import { AiModelAccessTab } from './settings/AiModelAccessTab';
import { HabitSettingsTab } from './settings/HabitSettingsTab';
import { StoreSettingsTab } from './settings/StoreSettingsTab';
import { StyleSettingsTab } from './settings/StyleSettingsTab';
import { UiSettingsTab } from './settings/UiSettingsTab';
import { AiLogTab } from './settings/AiLogTab';
import { AgentSettingsTab } from './settings/AgentSettingsTab';
import { providerCards, tabs } from './settings/constants';
import { useSettingsModalController } from './settings/useSettingsModalController';

const TAB_CAPTIONS: Record<string, string> = {
 ai: 'CORE MODELS',
 style: 'STYLE DNA',
 ui: 'INTERFACE',
 habit: 'USER HABITS',
 store: 'PERSISTENCE',
 logs: 'DIAGNOSTICS',
 agent: 'AGENT CORE'
 };

function parseHexColor(color: string, fallback: [number, number, number]): [number, number, number] {
 const cleaned = String(color || '').trim().replace('#', '');
 if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
 return [
 Number.parseInt(cleaned.slice(0, 2), 16),
 Number.parseInt(cleaned.slice(2, 4), 16),
 Number.parseInt(cleaned.slice(4, 6), 16)
 ];
 }
 if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
 return [
 Number.parseInt(cleaned[0] + cleaned[0], 16),
 Number.parseInt(cleaned[1] + cleaned[1], 16),
 Number.parseInt(cleaned[2] + cleaned[2], 16)
 ];
 }
 return fallback;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
 const normalize = (value: number) => {
 const unit = value / 255;
 return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
 };
 const rr = normalize(r);
 const gg = normalize(g);
 const bb = normalize(b);
 return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function toHex([r, g, b]: [number, number, number]): string {
 const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
 return `#${[clamp(r), clamp(g), clamp(b)].map((item) => item.toString(16).padStart(2, '0')).join('')}`;
}

function applyBrightness(color: string, factor: number): string {
 const [r, g, b] = parseHexColor(color, [248, 250, 252]);
 return toHex([r * factor, g * factor, b * factor]);
}

function toCssImageUrl(value: string): string {
 const raw = String(value || '').trim();
 if (!raw) return '';
 const escaped = raw.replace(/"/g, '\\"');
 return `url("${escaped}")`;
}

function applyThemePreview(ui: AppConfig['ui']) {
  const root = document.documentElement;
  const selectedTheme = ui.theme || 'dark';
  const customTheme = ui.customTheme;
  const darkThemes = new Set(['dark']);

  if ((selectedTheme as string) === 'custom') {
  root.style.setProperty('--custom-ambient-glow', customTheme.ambientGlow || '#7c3aed');
  root.style.setProperty('--custom-primary', customTheme.primaryColor || '#8b5cf6');
  root.style.setProperty('--custom-secondary', customTheme.secondaryColor || '#38bdf8');
  root.style.setProperty('--custom-gradient-from', customTheme.gradientFrom || '#171630');
  root.style.setProperty('--custom-gradient-to', customTheme.gradientTo || '#1f3f74');
  root.style.setProperty('--custom-background-image', toCssImageUrl(customTheme.backgroundImage));
  root.style.setProperty('--custom-surface-alpha', String(Math.min(1, Math.max(0.35, customTheme.surfaceAlpha ?? 0.9))));
  root.style.setProperty('--custom-font-family', customTheme.fontFamily || 'Inter, "Source Han Sans SC", "Microsoft YaHei UI", sans-serif');

  const from = parseHexColor(customTheme.gradientFrom || '#171630', [23, 22, 48]);
  const to = parseHexColor(customTheme.gradientTo || '#1f3f74', [31, 63, 116]);
  const avg: [number, number, number] = [
  Math.round((from[0] + to[0]) / 2),
  Math.round((from[1] + to[1]) / 2),
  Math.round((from[2] + to[2]) / 2)
  ];
  const customIsDark = relativeLuminance(avg) < 0.36;
  const brightness = Math.min(1.5, Math.max(0.6, customTheme.textBrightness ?? 1));
  const baseTextColor = customTheme.textColor || (customIsDark ? '#f8fafc' : '#0f172a');
  root.style.setProperty('--custom-text-primary', applyBrightness(baseTextColor, brightness));
  root.style.setProperty('--custom-text-secondary', applyBrightness(baseTextColor, Math.max(0.55, brightness * 0.85)));
  root.style.setProperty('--custom-text-muted', applyBrightness(baseTextColor, Math.max(0.45, brightness * 0.7)));
  root.style.setProperty('--custom-border-color', customIsDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.16)');
  }

  root.style.setProperty('--app-brightness', String(Math.min(1.3, Math.max(0.7, ui.appBrightness ?? 1))));
  root.style.setProperty('--app-contrast', String(Math.min(1.3, Math.max(0.7, ui.appContrast ?? 1))));
  root.style.setProperty('--app-saturation', String(Math.min(1.4, Math.max(0.7, ui.appSaturation ?? 1))));

  const isDark =
  (selectedTheme as string) === 'custom'
  ? relativeLuminance(parseHexColor(customTheme.gradientFrom || '#171630', [23, 22, 48])) < 0.36
  : darkThemes.has(selectedTheme);
 root.setAttribute('data-theme', selectedTheme);
 root.classList.toggle('dark', isDark);
 root.classList.toggle('light', !isDark);
 root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
 const {
 draft,
 activeTab,
 setActiveTab,
 setDraft,
 persist,
 showApiKey,
 setShowApiKey,
 providerUsage,
 availableModels,
 loadingModels,
 modelListLoaded,
 testStatusText,
 selectProvider,
 applyProxyProfileById,
 createProxyProfile,
 saveCurrentAsProxyProfile,
 renameProxyProfile,
 deleteProxyProfile,
 testLinkAndLoadModels,
 runApiLinkBenchmarks,
 dynamicProvider,
 requestPreview,
 onSelectStoragePath,
 onSelectBackupPath,
 onBackupNow,
 onOpenStoragePath
 } = useSettingsModalController(open);

 const snapshotRef = useRef<{
 theme: string | null;
 darkClass: boolean;
 lightClass: boolean;
 colorScheme: string;
 styles: Record<string, string>;
 } | null>(null);
 const committedRef = useRef(false);

 const previewToken = useMemo(
 () =>
 JSON.stringify({
 theme: draft?.ui.theme,
 customTheme: draft?.ui.customTheme
 }),
 [draft?.ui.theme, draft?.ui.customTheme]
 );

 useEffect(() => {
 if (!open) {
 const root = document.documentElement;
 if (snapshotRef.current && !committedRef.current) {
 root.setAttribute('data-theme', snapshotRef.current.theme || 'immersive');
 root.classList.toggle('dark', snapshotRef.current.darkClass);
 root.classList.toggle('light', snapshotRef.current.lightClass);
 root.style.colorScheme = snapshotRef.current.colorScheme;
 for (const [key, value] of Object.entries(snapshotRef.current.styles)) {
 if (value) root.style.setProperty(key, value);
 else root.style.removeProperty(key);
 }
 }
 snapshotRef.current = null;
 committedRef.current = false;
 return;
 }

 const root = document.documentElement;
 if (!snapshotRef.current) {
 const watched = [
 '--custom-ambient-glow',
 '--custom-primary',
 '--custom-secondary',
 '--custom-gradient-from',
 '--custom-gradient-to',
 '--custom-background-image',
 '--custom-surface-alpha',
 '--custom-font-family',
 '--custom-text-primary',
 '--custom-text-secondary',
 '--custom-text-muted',
 '--custom-border-color',
 '--app-brightness',
 '--app-contrast',
 '--app-saturation'
 ];
 snapshotRef.current = {
 theme: root.getAttribute('data-theme'),
 darkClass: root.classList.contains('dark'),
 lightClass: root.classList.contains('light'),
 colorScheme: root.style.colorScheme,
 styles: watched.reduce<Record<string, string>>((acc, key) => {
 acc[key] = root.style.getPropertyValue(key);
 return acc;
 }, {})
 };
 committedRef.current = false;
 }
 }, [open]);

 useEffect(() => {
 if (!open || !draft) return;
 applyThemePreview(draft.ui);
 }, [open, draft, previewToken]);

 const handleSave = async () => {
 const ok = await persist();
 if (ok) {
 committedRef.current = true;
 onClose();
 }
 };

 if (!open || !draft) return null;

   return (
     <>
       {/* 半透明遮罩 */}
       <div className="fixed inset-0 z-[5000] bg-black/40" onClick={onClose} />
       {/* 右侧滑入面板 */}
       <div className="fixed right-0 top-0 z-[5001] flex h-full w-[min(880px,95vw)] flex-col border-l-[0.5px] border-[var(--border-color)] bg-[var(--surface)] shadow-[-8px_0_32px_rgba(0,0,0,0.15)] animate-slide-in-right">
         <div className="flex h-14 shrink-0 items-center justify-between border-b-[0.5px] border-[var(--border-color)] bg-transparent px-6">
 <div className="flex items-center gap-4 text-xs font-bold tracking-[0.2em] text-[var(--text-primary)]">
 <span className="opacity-40 uppercase">System Settings</span>
 <span className="h-px w-3 bg-[var(--border-color)]"></span>
 <span className="text-sm font-bold tracking-[0.1em] text-[var(--accent)]">
 系统设置
 </span>
 </div>
 <button className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] transition-all" onClick={onClose}>
 <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <path d="M18 6 6 18M6 6l12 12"/>
 </svg>
 </button>
 </div>

 <div className="flex flex-1 min-h-0">
 <aside className="w-52 shrink-0 border-r-[0.5px] border-[var(--border-color)] bg-transparent">
 <div className="flex flex-col p-1">
 {tabs.map(([id, label]) => (
 <button
 key={id}
 onClick={() => setActiveTab(id)}
 className={clsx(
 'relative w-full px-4 py-3 rounded-none text-left transition-all',
 activeTab === id
 ? 'bg-[var(--accent)]/10 text-[var(--text-primary)] font-medium border-l-[3px] border-[var(--accent)]'
 : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]'
 )}
 >
 <div className="flex flex-col">
 <span className={clsx("text-[9px] font-bold tracking-[0.15em] uppercase transition-colors font-mono", activeTab === id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}>
 {TAB_CAPTIONS[id] || id}
 </span>
 <span className="mt-0.5 text-xs font-bold">{label}</span>
 </div>
 </button>
 ))}
 </div>
 </aside>

 <section className="flex-1 overflow-y-auto bg-transparent p-6">
 {activeTab === 'ai' ? (
 <AiModelAccessTab
 draft={draft}
 setDraft={setDraft}
 providerCards={providerCards}
 providerUsage={providerUsage}
 selectProvider={selectProvider}
 showApiKey={showApiKey}
 setShowApiKey={setShowApiKey}
 dynamicProvider={dynamicProvider}
 requestPreview={requestPreview}
 modelListLoaded={modelListLoaded}
 availableModels={availableModels}
 loadingModels={loadingModels}
 applyProxyProfileById={applyProxyProfileById}
 createProxyProfile={createProxyProfile}
 saveCurrentAsProxyProfile={saveCurrentAsProxyProfile}
 renameProxyProfile={renameProxyProfile}
 deleteProxyProfile={deleteProxyProfile}
 testLinkAndLoadModels={testLinkAndLoadModels}
 runApiLinkBenchmarks={runApiLinkBenchmarks}
 testStatusText={testStatusText}
 />
 ) : null}


 {activeTab === 'style' ? (
 <StyleSettingsTab
 draft={draft}
 setDraft={setDraft}
 />
 ) : null}

 {activeTab === 'ui' ? <UiSettingsTab draft={draft} setDraft={setDraft} /> : null}
 {activeTab === 'habit' ? <HabitSettingsTab draft={draft} setDraft={setDraft} /> : null}

 {activeTab === 'store' ? (
 <StoreSettingsTab
 draft={draft}
 setDraft={setDraft}
 onSelectStoragePath={onSelectStoragePath}
 onSelectBackupPath={onSelectBackupPath}
 onBackupNow={onBackupNow}
 onOpenStoragePath={onOpenStoragePath}
 />
 ) : null}

 {activeTab === 'logs' ? <AiLogTab /> : null}

          {activeTab === 'agent' ? <AgentSettingsTab draft={draft} setDraft={setDraft} /> : null}
 </section>
 </div>

 <div className="flex h-16 shrink-0 items-center justify-end gap-3 border-t-[0.5px] border-[var(--border-color)] bg-transparent px-6 py-4">
 <button
 className="rounded-sm border-[0.5px] border-[var(--border-color)] bg-transparent hover:bg-[var(--surface)] px-6 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all active:scale-95"
 onClick={onClose}
 >
 取消
 </button>
 <button
 className="rounded-sm bg-[var(--accent)] px-8 py-2 text-xs font-bold text-white shadow-md hover:brightness-105 transition-all active:scale-95"
 onClick={() => void handleSave()}
 >
 保存设置
 </button>
 </div>
 </div>
 </>
 );
 }
