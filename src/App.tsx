import './Agent/styleLearnBridge';
import './Agent/proactiveHealthBridge';
// 模块说明：应用入口，负责主题注入、路由渲染与工作区初始化。
// 关键职责：酷 CSS 变量写入、壁纸处理、路由切换、日间主题驱动与工作区选择弹窗。
// 维护边界：错误边界需要包裹 ErrorBoundary；主题/路由状态请分别通过 useConfigStore/useAppStore 处理而不是局部 state。
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Bookshelf } from './pages/Bookshelf';
import { Editor } from './pages/Editor';
const ContinuationDetachedPage = lazy(() => import('./pages/ContinuationDetached').then(m => ({ default: m.ContinuationDetachedPage })));
const NovelLab = lazy(() => import('./pages/NovelLab'));
const BookSweeper = lazy(() => import('./pages/BookSweeper'));
const OutlineBoard = lazy(() => import('./pages/OutlineBoard'));

import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Island } from './components/common/Island';
import { PromptDialog } from './components/common/PromptDialog';
import { QuickStartGuide } from './components/common/QuickStartGuide';
import { SettingsModal } from './components/modals/SettingsModal';
import { useAppStore } from './store/useAppStore';
import { useBookStore } from './store/useBookStore';
import { useConfigStore } from './store/useConfigStore';
import { ActivityBar } from './components/common/ActivityBar';
import { OutlineTree } from './components/outline/OutlineTree';
import { electronAPI } from './utils/electron';

import { TitleBar } from './components/common/TitleBar';
import { toAssetUrl } from './utils/assetUrl';

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

/**
 * 判断自定义主题是否是深色调（用于决定 text-primary 颜色和 dark/light class）。
 * 下方两处复用此函数，避免亮度计算重复。
 */
function isCustomThemeDark(
 gradientFrom: string | undefined,
 gradientTo: string | undefined,
 defaultFrom: string,
 defaultTo: string
): boolean {
 const fromRgb = parseHexColor(gradientFrom || defaultFrom, [23, 22, 48]);
 const toRgb = parseHexColor(gradientTo || defaultTo, [31, 63, 116]);
 const avg: [number, number, number] = [
 Math.round((fromRgb[0] + toRgb[0]) / 2),
 Math.round((fromRgb[1] + toRgb[1]) / 2),
 Math.round((fromRgb[2] + toRgb[2]) / 2)
 ];
 return relativeLuminance(avg) < 0.38;
}

function isVideoFile(path: string): boolean {
 const p = String(path || '').toLowerCase();
 return p.endsWith('.mp4') || p.endsWith('.webm') || p.endsWith('.mov') || p.endsWith('.ogg');
}

function getRawUrl(value: string): string {
 return toAssetUrl(value);
}

function toCssImageUrl(value: string): string {
 const raw = String(value || '').trim();
 if (!raw) return 'none';
 if (raw.startsWith('url(') || raw.startsWith('data:') || raw.startsWith('http')) {
 return raw.startsWith('url(') ? raw : `url("${raw}")`;
 }
 return `url("${getRawUrl(raw)}")`;
}

function normalizeCustomBackgroundImage(value: string | undefined): string {
 const raw = String(value || '').trim();
 if (!raw) return '';
 // custom theme must never reuse the built-in night wallpaper
 if (raw.includes('night-sky-user')) return '';
 return raw;
}

function upsertUploadedFontStyle(fonts: Array<{ family: string; dataUrl: string }>) {
 const styleId = 'wz-uploaded-font-style';
 const existing = document.getElementById(styleId);
 const validFonts = (fonts || []).filter((item) => item && item.family && item.dataUrl);
 if (validFonts.length === 0) {
 existing?.remove();
 return;
 }
 const css = validFonts
 .map(
 (font) => `@font-face{font-family:"${font.family.replace(/"/g, '\\"')}";src:url("${String(font.dataUrl).replace(
 /"/g,
 '\\"'
 )}");font-display:swap;}`
 )
 .join('\n');
 const style = existing ?? Object.assign(document.createElement('style'), { id: styleId });
 style.textContent = css;
 if (!existing) document.head.appendChild(style);
}

const APP_SCALE_BASE_WIDTH = 1600;
const APP_SCALE_BASE_HEIGHT = 900;
const APP_SCALE_MIN = 0.75;
const APP_SCALE_MAX = 1.25;

export default function App() {
 const route = useAppStore((s) => s.route);
 const config = useConfigStore((s) => s.config);

	const resolvedTheme = useMemo(() => {
		const rawTheme = config?.ui.theme || 'dark';
		const validThemes = [
			'light',
			'parchment',
			'dark',
			'matcha'
		];
		return validThemes.includes(rawTheme) ? rawTheme : 'dark';
	}, [config?.ui.theme]);

 	// 同步主题到 body，确保 Portal 弹窗能继承 CSS 变量
 	useEffect(() => {
 		const theme = resolvedTheme;
 		const customBackgroundImage = normalizeCustomBackgroundImage(config?.ui.customTheme?.backgroundImage);
 		const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
		document.body.className = `wz-body-host ${theme} ${isMac ? 'wz-platform-mac' : ''}`;
 	}, [resolvedTheme, config?.ui.customTheme?.backgroundImage]);

 // 简化模式（省电/性能优先）：给 html 加 wz-low-performance 类
 useEffect(() => {
 const root = document.documentElement;
 if (config?.ui.lowPerformanceMode) {
 root.classList.add('wz-low-performance');
 } else {
 root.classList.remove('wz-low-performance');
 }
 }, [config?.ui.lowPerformanceMode]);
 useEffect(() => {
 if (!import.meta.env.PROD) return;
 const timer = window.setTimeout(() => {
 }, 10_000);
 return () => window.clearTimeout(timer);
 }, []);

 // 预加载加密 prompt 缓存
 useEffect(() => {
 void import('./utils/promptStore').then(m => m.preloadPrompts()).catch(() => {});
 }, []);

 // 预加载题材包缓存（T9）：后端 get_genre_pack 内嵌数据就绪后灌入前端缓存，供同步门面即时读取
 useEffect(() => {
 void import('./Agent/genreStore').then(m => m.preloadGenres()).catch(() => {});
 }, []);

 useEffect(() => {
 const onKeyDown = (e: KeyboardEvent) => {
 if (import.meta.env.PROD) return;
 if (e.key !== 'Delete') return;
 const el = document.activeElement;
 if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
 void electronAPI.system.toggleDevTools();
 };
 window.addEventListener('keydown', onKeyDown);
 return () => window.removeEventListener('keydown', onKeyDown);
 }, []);

 // Tauri 2: 关闭 webview 默认右键菜单（防止"返回/前进/检查"那种系统菜单遮住编辑器自定义菜单）
 // 不阻止编辑器内的（让 .ProseMirror 自己 preventDefault 弹自定义菜单）
 useEffect(() => {
 const onContextMenu = (e: MouseEvent) => {
 const target = e.target as HTMLElement | null;
 if (!target?.closest('.ProseMirror') && !target?.closest('input, textarea')) {
 e.preventDefault();
 }
 };
 document.addEventListener('contextmenu', onContextMenu);
 return () => document.removeEventListener('contextmenu', onContextMenu);
 }, []);

 // 全局缩放快捷键：Ctrl/Cmd + =/−/0
 useEffect(() => {
 const onKeyDown = (e: KeyboardEvent) => {
 const mod = e.ctrlKey || e.metaKey;
 if (!mod) return;
 if (e.key === '=' || e.key === '+') {
 e.preventDefault();
 void electronAPI.system.scaleZoomIn();
 } else if (e.key === '-') {
 e.preventDefault();
 void electronAPI.system.scaleZoomOut();
 } else if (e.key === '0') {
 e.preventDefault();
 void electronAPI.system.scaleReset();
 }
 };
 window.addEventListener('keydown', onKeyDown);
 return () => window.removeEventListener('keydown', onKeyDown);
 }, []);

 // 全局搜索替换：Ctrl/Cmd + F（capture 阶段，无论焦点在哪都能拦截浏览器原生查找栏）
 useEffect(() => {
 const onKeyDown = (e: KeyboardEvent) => {
 if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
 e.preventDefault();
 window.dispatchEvent(new CustomEvent('writerzen:toggle-find-replace'));
 }
 };
 window.addEventListener('keydown', onKeyDown, true);
 return () => window.removeEventListener('keydown', onKeyDown, true);
 }, []);
 const openEditor = useAppStore((s) => s.openEditor);
 const restoreLastSession = useAppStore((s) => s.restoreLastSession);
 const loadBooks = useBookStore((s) => s.loadBooks);
 const books = useBookStore((s) => s.books);
 const booksLoading = useBookStore((s) => s.loading);
 const loadConfig = useConfigStore((s) => s.loadConfig);
 const configLoading = useConfigStore((s) => s.configLoading);

 const [workspaceRequired, setWorkspaceRequired] = useState(false);
 const [workspaceSelecting, setWorkspaceSelecting] = useState(false);
 const [workspaceHint, setWorkspaceHint] = useState('首次启动需要先选择工作区目录。');
 const [booksLoadedOnce, setBooksLoadedOnce] = useState(false);
 const [appScale, setAppScale] = useState(1);
 const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
 const hasAutoPromptedRef = useRef(false);
 const restoreAttemptedRef = useRef(false);
 const detachedOutlineParams = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 if (params.get('outlineDetached') !== '1') return null;
 const bookId = params.get('bookId') || '';
 if (!bookId) return null;
 const chapterId = params.get('chapterId') || undefined;
 return { bookId, chapterId };
 }, []);
 const continuationDetached = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 return params.get('continuationDetached') === '1';
 }, []);

 const novelLabDetached = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 return params.get('novelLabDetached') === '1';
 }, []);
 const bookSweeperDetached = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 return params.get('bookSweeperDetached') === '1';
 }, []);
 const outlineBoardDetached = useMemo(() => {
 const params = new URLSearchParams(window.location.search);
 return params.get('outlineBoardDetached') === '1';
 }, []);

 // Wallpaper pipeline: video wallpapers are kept visible, but paused while the
 // app is unfocused or being dragged so desktop-window movement stays crisp.
 const selectedTheme = config?.ui.theme || 'dark';
 const customBackgroundImage = normalizeCustomBackgroundImage(config?.ui.customTheme?.backgroundImage);
 const bgImage = !config ? '' : ((selectedTheme as string) === 'custom' ? customBackgroundImage : '') || '';
 const bgImageRawUrl = bgImage ? (bgImage.startsWith('data:') || bgImage.startsWith('http') || bgImage.startsWith('static') || bgImage.includes('blob:') || bgImage.includes('/assets/') ? bgImage : getRawUrl(bgImage)) : '';
 const hasVideoWallpaper = Boolean(bgImage && isVideoFile(bgImage));
 const hasImageWallpaper = Boolean(bgImage && !hasVideoWallpaper);
 const wallpaperVideoRef = useRef<HTMLVideoElement | null>(null);

 useEffect(() => {
 const computeScale = () => {
 const viewportWidth = window.innerWidth;
 const viewportHeight = window.innerHeight;
 const rawScale = Math.min(viewportWidth / APP_SCALE_BASE_WIDTH, viewportHeight / APP_SCALE_BASE_HEIGHT);
 const nextScale = Math.min(APP_SCALE_MAX, Math.max(APP_SCALE_MIN, Number.isFinite(rawScale) ? rawScale : 1));
 setAppScale((prev) => (Math.abs(prev - nextScale) < 0.001 ? prev : nextScale));
 };

 let raf: number | null = null;
 const schedule = () => {
 if (raf !== null) cancelAnimationFrame(raf);
 raf = requestAnimationFrame(() => {
 raf = null;
 computeScale();
 });
 };

 schedule();
 window.addEventListener('resize', schedule, { passive: true });
 if (document.fonts?.ready) {
 void document.fonts.ready.then(schedule).catch(() => {});
 }

 return () => {
 if (raf !== null) cancelAnimationFrame(raf);
 window.removeEventListener('resize', schedule);
 };
 }, []);

 // BUG-FIX: 强行释放文件句柄。当背景变为空时，通过 ref 主动清空视频源。
 useEffect(() => {
 if (!bgImage && wallpaperVideoRef.current) {
 const v = wallpaperVideoRef.current;
 v.pause();
 v.src = '';
 v.load();
 v.removeAttribute('src');
 }
 }, [bgImage]);

 useEffect(() => {
 document.documentElement.style.setProperty('--app-scale', String(appScale));
 }, [appScale]);

 const pickWorkspace = useCallback(async () => {
 if (workspaceSelecting) return;
 setWorkspaceSelecting(true);
 setWorkspaceHint('正在打开目录选择器...');

 try {
 const result = await electronAPI.fs.selectFolder();
 if (!result?.path) {
 setWorkspaceRequired(true);
 setWorkspaceHint('必须先选择工作区，才能继续使用写梨眼。');
 return;
 }

 await electronAPI.fs.initWorkspace({ path: result.path });
 await loadConfig();
 await loadBooks();
 setBooksLoadedOnce(true);
 setWorkspaceRequired(false);
 setWorkspaceHint('首次启动需要先选择工作区目录。');
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error);
 setWorkspaceRequired(true);
 setWorkspaceHint(`工作区初始化失败：${message}`);
 } finally {
 setWorkspaceSelecting(false);
 }
 }, [loadBooks, loadConfig, workspaceSelecting]);

 useEffect(() => {
 void loadConfig();
 }, [loadConfig]);

 // 标题栏齿轮按钮 → 打开设置
 // 引导或其他功能 → 关闭设置
 useEffect(() => {
 const openHandler = () => setGlobalSettingsOpen(true);
 const closeHandler = () => setGlobalSettingsOpen(false);
 window.addEventListener('writerzen:open-settings', openHandler);
 window.addEventListener('writerzen:close-settings', closeHandler);
 return () => {
 window.removeEventListener('writerzen:open-settings', openHandler);
 window.removeEventListener('writerzen:close-settings', closeHandler);
 };
 }, []);


 useEffect(() => {
 if (configLoading || !config) return;

 const hasWorkspace = Boolean(config.workspace.storagePath?.trim());
 if (hasWorkspace) {
 setWorkspaceRequired(false);
 // 始终触发 loadBooks（store 内部 set 是幂等的，HMR / 重启都需要重新拉）
 setBooksLoadedOnce(false);
 void loadBooks().then(() => setBooksLoadedOnce(true)).catch(() => setBooksLoadedOnce(true));
 return;
 }

 setWorkspaceRequired(true);
 if (!hasAutoPromptedRef.current) {
 hasAutoPromptedRef.current = true;
 void pickWorkspace();
 }
 }, [config, configLoading, loadBooks]);

 useEffect(() => {
 if (!detachedOutlineParams) return;
 openEditor(detachedOutlineParams.bookId, detachedOutlineParams.chapterId);
 }, [detachedOutlineParams, openEditor]);

 useEffect(() => {
 if (restoreAttemptedRef.current) return;
 if (configLoading || booksLoading || !config) return;
 if (!booksLoadedOnce) return;
 if (workspaceRequired) return;
 if (detachedOutlineParams || continuationDetached || novelLabDetached || bookSweeperDetached || outlineBoardDetached) return;
 if (!config.workspace.storagePath?.trim()) return;
 restoreAttemptedRef.current = true;
 restoreLastSession(books);
 }, [
 books,
 booksLoadedOnce,
 booksLoading,
 bookSweeperDetached,
 config,
 configLoading,
 continuationDetached,
 detachedOutlineParams,
 novelLabDetached,
 outlineBoardDetached,
 restoreLastSession,
 workspaceRequired
 ]);



 useEffect(() => {
 if (!hasVideoWallpaper) return;
 let titlebarDragging = false;
 let resumeTimer: number | null = null;

 const pauseVideo = () => {
 const video = wallpaperVideoRef.current;
 if (!video || video.paused) return;
 video.pause();
 };

 const playVideo = () => {
 const video = wallpaperVideoRef.current;
 if (!video || document.hidden || !document.hasFocus() || titlebarDragging) return;
 void video.play().catch(() => {
 // Autoplay can be rejected by Chromium during focus transitions; the next
 // focus/visibility event will retry without surfacing noise to users.
 });
 };

 const updatePlayback = () => {
 if (resumeTimer) {
 window.clearTimeout(resumeTimer);
 resumeTimer = null;
 }
 if (document.hidden || !document.hasFocus() || titlebarDragging) {
 pauseVideo();
 return;
 }
 resumeTimer = window.setTimeout(playVideo, 80);
 };

 const onTitlebarMouseDown = (event: MouseEvent) => {
 const target = event.target as HTMLElement | null;
 if (!target?.closest('.wz-titlebar') || target.closest('.wz-control-btn')) return;
 titlebarDragging = true;
 updatePlayback();
 };

 const onMouseUp = () => {
 if (!titlebarDragging) return;
 titlebarDragging = false;
 updatePlayback();
 };

 document.addEventListener('visibilitychange', updatePlayback);
 window.addEventListener('focus', updatePlayback);
 window.addEventListener('blur', updatePlayback);
 window.addEventListener('mousedown', onTitlebarMouseDown, true);
 window.addEventListener('mouseup', onMouseUp, true);
 updatePlayback();

 return () => {
 if (resumeTimer) window.clearTimeout(resumeTimer);
 document.removeEventListener('visibilitychange', updatePlayback);
 window.removeEventListener('focus', updatePlayback);
 window.removeEventListener('blur', updatePlayback);
 window.removeEventListener('mousedown', onTitlebarMouseDown, true);
 window.removeEventListener('mouseup', onMouseUp, true);
 };
 }, [hasVideoWallpaper, bgImage]);

 useEffect(() => {
 const root = document.documentElement;
 const body = document.body;
 if (detachedOutlineParams) {
 root.classList.add('wz-outline-detached-mode');
 body.classList.add('wz-outline-detached-mode');
 return () => {
 root.classList.remove('wz-outline-detached-mode');
 body.classList.remove('wz-outline-detached-mode');
 };
 }
 root.classList.remove('wz-outline-detached-mode');
 body.classList.remove('wz-outline-detached-mode');
 return undefined;
 }, [detachedOutlineParams]);

 useEffect(() => {
 const root = document.documentElement;
 if (detachedOutlineParams) {
 root.classList.remove('wz-has-wallpaper');
 return;
 }
 // 拆书神器独立窗口：面板用自有深蓝调色板（NovelLab.module.css 全硬编码），
 // 不跟随主窗口主题切换。这里把根容器钉成深色，避免用户切浅色主题时窗口边角透白。
 if (novelLabDetached) {
 root.setAttribute('data-theme', 'dark');
 root.classList.remove('light', 'wz-has-wallpaper');
 root.classList.add('dark');
 root.style.colorScheme = 'dark';
 root.style.removeProperty('--app-brightness');
 root.style.removeProperty('--app-contrast');
 root.style.removeProperty('--app-saturation');
 return;
 }
 const selectedTheme = config?.ui.theme || 'dark';
 const customTheme = config?.ui.customTheme;
 const defaultCustomFrom = '#171630';
 const defaultCustomTo = '#1f3f74';

 if ((selectedTheme as string) === 'custom' && customTheme) {
 root.style.setProperty('--custom-ambient-glow', customTheme.ambientGlow || '#7c3aed');
 root.style.setProperty('--custom-primary', customTheme.primaryColor || '#8b5cf6');
 root.style.setProperty('--custom-secondary', customTheme.secondaryColor || '#38bdf8');
 root.style.setProperty('--custom-gradient-from', customTheme.gradientFrom || defaultCustomFrom);
 root.style.setProperty('--custom-gradient-to', customTheme.gradientTo || defaultCustomTo);
 const safeCustomBackground = normalizeCustomBackgroundImage(customTheme.backgroundImage);
 root.style.setProperty('--custom-background-image', toCssImageUrl(safeCustomBackground));
 root.style.setProperty('--custom-surface-alpha', String(Math.min(1, Math.max(0.35, customTheme.surfaceAlpha ?? 0.9))));
 root.style.setProperty('--custom-font-family', customTheme.fontFamily || 'Inter, "Source Han Sans SC", "Microsoft YaHei UI", sans-serif');

 const customIsDark = isCustomThemeDark(
 customTheme.gradientFrom, customTheme.gradientTo,
 defaultCustomFrom, defaultCustomTo
 );
 const brightness = Math.min(1.5, Math.max(0.6, customTheme.textBrightness ?? 1));
 const baseTextColor = customTheme.textColor || (customIsDark ? '#f8fafc' : '#0f172a');
 root.style.setProperty('--custom-text-primary', applyBrightness(baseTextColor, brightness));
 root.style.setProperty('--custom-text-secondary', applyBrightness(baseTextColor, Math.max(0.55, brightness * 0.85)));
 root.style.setProperty('--custom-text-muted', applyBrightness(baseTextColor, Math.max(0.45, brightness * 0.7)));
 root.style.setProperty('--custom-border-color', customIsDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.16)');
 } else {
 root.style.removeProperty('--custom-ambient-glow');
 root.style.removeProperty('--custom-primary');
 root.style.removeProperty('--custom-secondary');
 root.style.removeProperty('--custom-gradient-from');
 root.style.removeProperty('--custom-gradient-to');
 root.style.removeProperty('--custom-background-image');
 root.style.removeProperty('--custom-surface-alpha');
 root.style.removeProperty('--custom-font-family');
 root.style.removeProperty('--custom-text-primary');
 root.style.removeProperty('--custom-text-secondary');
 root.style.removeProperty('--custom-text-muted');
 root.style.removeProperty('--custom-border-color');
 }
 root.style.setProperty('--app-brightness', String(Math.min(1.3, Math.max(0.7, config?.ui.appBrightness ?? 1))));
 root.style.setProperty('--app-contrast', String(Math.min(1.3, Math.max(0.7, config?.ui.appContrast ?? 1))));
 root.style.setProperty('--app-saturation', String(Math.min(1.4, Math.max(0.7, config?.ui.appSaturation ?? 1))));
 upsertUploadedFontStyle(config?.ui.uploadedFonts || []);

 // 判断当前主题是否深色，决定 dark / light class 与 colorScheme。
 // 注：custom 主题的 isCustomThemeDark 结果已在上方 if 块中计算过，
 // 这里复用同一函数而非重复内联计算，避免亮度逻辑分散。
 const isDark = (() => {
 if ((selectedTheme as string) === 'custom' && customTheme) {
 return isCustomThemeDark(
 customTheme.gradientFrom, customTheme.gradientTo,
 defaultCustomFrom, defaultCustomTo
 );
 }
 // 'auto' 跟随系统，用 prefers-color-scheme 判断；其余按已知深色主题集合判断
 if (selectedTheme === 'auto') {
 return window.matchMedia('(prefers-color-scheme: dark)').matches;
 }
 const darkSet = new Set(['dark']);
 return darkSet.has(selectedTheme);
 })();

 root.setAttribute('data-theme', selectedTheme);
 root.classList.remove('dark', 'light');
 root.classList.add(isDark ? 'dark' : 'light');
 root.style.colorScheme = isDark ? 'dark' : 'light';

 const hasWallpaper = Boolean(
 ((selectedTheme as string) === 'custom' && customBackgroundImage) ||
 false
 );
 if (hasWallpaper) {
 root.classList.add('wz-has-wallpaper');
 } else {
 root.classList.remove('wz-has-wallpaper');
 }
 }, [detachedOutlineParams, novelLabDetached, config?.ui.theme, config?.ui.customTheme, config?.ui.appBrightness, config?.ui.appContrast, config?.ui.appSaturation, config?.ui.uploadedFonts]);

 if (detachedOutlineParams) {
 return (
 <ErrorBoundary>
 <div className="wz-outline-detached-root relative h-screen w-screen overflow-hidden bg-[#0b1220]">
 <OutlineTree />
 <Island />
 </div>
 </ErrorBoundary>
 );
 }

 if (continuationDetached) {
 return (
 <ErrorBoundary>
 <Suspense fallback={null}>
 <ContinuationDetachedPage />
 </Suspense>
 </ErrorBoundary>
 );
 }

 if (bookSweeperDetached) {
 return (
 <ErrorBoundary>
 <Suspense fallback={null}>
 <BookSweeper />
 </Suspense>
 </ErrorBoundary>
 );
 }

 if (outlineBoardDetached) {
 return (
 <ErrorBoundary>
 <Suspense fallback={null}>
 <OutlineBoard />
 </Suspense>
 </ErrorBoundary>
 );
 }

 if (novelLabDetached) {
 return (
 <ErrorBoundary>
 <Suspense fallback={null}>
 <NovelLab />
 </Suspense>
 </ErrorBoundary>
 );
 }

 return (
 <ErrorBoundary>
 <div
 className={clsx(
 'wz-app-container',
 config?.ui.theme || 'dark',
 
 )}
 >
 {/* 全局背景层：支持视频与图片，位于所有 UI 之下 */}
 

 <div className="relative z-10 flex h-full flex-col">
 <TitleBar />

 <div className="relative flex-1 overflow-hidden">
 <div
 className="flex h-full w-full overflow-hidden bg-[var(--bg-primary)]"
 style={{
 backgroundColor: 'var(--bg-primary)',
 }}
 >
<main className="h-full flex-1 overflow-hidden">
 {route === 'bookshelf' ? <Bookshelf /> : (
 <ErrorBoundary>
 <Editor />
 </ErrorBoundary>
 )}
 </main>
{/* IDE Refresh：全局 ActivityBar 移至右侧（border-left） */}
{!workspaceRequired && route !== 'bookshelf' && <ActivityBar />}
 </div>
 </div>

   {/* 全局状态栏：对齐设计稿，作为 .app 末位子元素跨满窗口宽度 */}
 </div>
 </div>

 <Island />
      <PromptDialog />

 {/* 全局设置弹窗：书架页和编辑器页都能打开 */}
 <SettingsModal open={globalSettingsOpen} onClose={() => setGlobalSettingsOpen(false)} />
 <QuickStartGuide />

 {workspaceRequired ? (
 <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 ">
 <div className="wz-modal-enter wz-glass w-full max-w-lg p-6">
 <h2 className="text-xl font-bold text-white/90">初始化工作区</h2>
 <p className="mt-3 text-sm text-white/65">{workspaceHint}</p>
 <div className="mt-6 flex justify-end gap-3">
 <button
 className="border border-indigo-300/30 bg-indigo-500/75 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400/90 disabled:cursor-not-allowed disabled:opacity-60"
 disabled={workspaceSelecting}
 onClick={() => void pickWorkspace()}
 >
 {workspaceSelecting ? '打开中...' : '选择工作区目录'}
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </ErrorBoundary>
 );
}
