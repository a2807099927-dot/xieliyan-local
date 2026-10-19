// 模块说明：编辑页主编排组件。
// 关键职责：章节列表 + TipTap 编辑器 + AI Agent 面板 + 角色面板 + 底部状态栏的布局与协调。
// 数据流：useBookStore 提供书籍/章节数据，setChapterContent 触发持久化。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { zhCN } from '../i18n/zh-CN';
import { electronAPI } from '../utils/electron';
import { useAppStore } from '../store/useAppStore';
import { useBookStore } from '../store/useBookStore';
import { useConfigStore } from '../store/useConfigStore';
import { useIslandStore } from '../store/useIslandStore';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ChapterList } from '../components/editor/ChapterList';
import { EditorBookTabs } from '../components/editor/EditorBookTabs';
import { TiptapEditor } from '../components/editor/TiptapEditor';
import { Toolbar } from '../components/editor/Toolbar';

import { RolesPanel } from '../components/panels/RolesPanel';
import { SidebarOutlinePanel } from '../components/panels/SidebarOutlinePanel';
import { buildInlineDiffHtml, buildFinalHtml } from '../utils/editor/diff';
import { AgentChatPanel } from '../Agent/AgentChatPanel';
import { AiWebPanel } from '../components/panels/AiWebPanel';
import { RoleImportPreviewModal, type RoleImportInput } from '../components/modals/RoleImportPreviewModal';
import { SendToAiWebModal } from '../components/modals/SendToAiWebModal';
import { MemoryBankModal } from '../components/modals/MemoryBankModal';
import { ChapterOutlineModal } from '../components/modals/ChapterOutlineModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { StylePreferenceConfirmPanel } from '../components/common/StylePreferenceConfirmPanel';
import { SkillConfirmPanel } from '../components/common/SkillConfirmPanel';
import { ChronoIcon } from '../components/common/ChronoIcon';
import type { RoleProfile } from '../types';
import { useFullReview } from '../hooks/useFullReview';
import { useStrongReview } from '../hooks/useStrongReview';
import { lazy, Suspense } from 'react';
// 自动工坊：壳层与状态（设计方案 P0；不改 OutlineBoard）

type RightTab = 'roles' | 'inspiration' | 'outline';
type SaveState = 'saving' | 'saved' | 'failed';

const GENERIC_ROLE_ALIAS_SET = new Set([
 '我',
 '我们',
 '咱',
 '咱们',
 '你',
 '你们',
 '他',
 '他们',
 '她',
 '她们',
 '它',
 '它们',
 '自己',
 '本人',
 '主角',
 '角色'
]);

function isUsableRoleAlias(value: unknown): value is string {
 const text = String(value || '').trim();
 return Boolean(text && !GENERIC_ROLE_ALIAS_SET.has(text));
}

// 清洗从 AI 网页选中的文字：去除不可见字符、bullet、过多空白；保证写入大纲/正文/角色卡时不带"意义不明的空格"
function sanitizePastedText(raw: string): string {
 if (!raw) return '';
 return raw
 .replace(/\u00A0/g, ' ')
 .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
 .replace(/\u3000/g, ' ')
 .split('\n')
 .map((line) => line.replace(/[\t ]+$/g, '').replace(/^[\t ]*[•·▪◦‣⁃\-\*]\s+/, ''))
 .join('\n')
 .replace(/[ \t]{2,}/g, ' ')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
}

export function Editor() {
 const back = useAppStore((s) => s.backToBookshelf);
 const bookId = useAppStore((s) => s.activeBookId);
 const chapterId = useAppStore((s) => s.activeChapterId);
 const splitTabId = useAppStore((s) => s.splitEditorTabId);
 const books = useBookStore((s) => s.books);

 const editorMaxWidthCfg = useConfigStore((s) => s.config?.ui.editorMaxWidth ?? 99999);
 const rightPanelWidthCfg = useConfigStore((s) => s.config?.ui.rightPanelWidth ?? 400);
 const saveConfig = useConfigStore((s) => s.saveConfig);
 const appConfig = useConfigStore((s) => s.config);
 const showIsland = useIslandStore((s) => s.show);
 const hideIsland = useIslandStore((s) => s.hide);
 const startTask = useIslandStore((s) => s.startTask);
 const finishTask = useIslandStore((s) => s.finishTask);
 // —— 自动工坊壳层（P0）——
 const { run: runAsync } = useAsyncAction();


 const [activeRightTab, setActiveRightTab] = useState<RightTab | null>(null);
 const [agentPanelOpen, setAgentPanelOpen] = useState(false);
 const [agentPanelWidthState, setAgentPanelWidthState] = useState(rightPanelWidthCfg);
 // IDE Refresh：AI 网页 / 思维市场的开关状态与 hidden 同步已统一迁移到 ActivityBar。
 // 编辑器仅保留 AiWebPanel 保活挂载（见 JSX 底部），不再持有窗口开关 state。

 // ActivityBar 的书籍面板入口（角色档案 / 大纲与设定）通过事件驱动右抽屉
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as RightTab | undefined;
      if (tab !== 'roles' && tab !== 'outline') return;
      setActiveRightTab((prev) => (prev === tab ? null : tab));
    };
    window.addEventListener('writerzen:toggle-side-panel', handler);
    return () => window.removeEventListener('writerzen:toggle-side-panel', handler);
  }, []);

 // ActivityBar Agent 图标切换 Agent 面板开关
 useEffect(() => {
  const handler = () => {
   setAgentPanelOpen((prev) => !prev);
  };
  window.addEventListener('writerzen:toggle-agent-panel', handler);
  return () => window.removeEventListener('writerzen:toggle-agent-panel', handler);
 }, []);

 // 工具栏分屏按钮：未分屏时把当前激活标签钉到右侧分屏栏；已分屏时关闭
 useEffect(() => {
  const handler = () => {
   const s = useAppStore.getState();
   if (s.splitEditorTabId) {
    s.setSplitEditorTab(null);
    return;
   }
   const tabId = s.activeEditorTabId || s.editorTabs[s.editorTabs.length - 1]?.id;
   const tab = s.editorTabs.find((item) => item.id === tabId);
   const tabBook = useBookStore.getState().books.find((item) => item.id === tab?.bookId);
   // 占位标签（未选章且无章节可回落）不能作为分屏对象
   if (!tab || !tabBook || tabBook.chapters.length === 0) {
    showIsland({ type: 'warning', message: '请先打开一个章节，再使用分屏。', autoHideMs: 2000 });
    return;
   }
   s.setSplitEditorTab(tabId);
  };
  window.addEventListener('writerzen:toggle-split-view', handler);
  return () => window.removeEventListener('writerzen:toggle-split-view', handler);
 }, [showIsland]);

  // 统一同步面板状态给 ActivityBar，支持两面板并存独立高亮
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('writerzen:agent-status-changed', { detail: { open: agentPanelOpen } }));
  }, [agentPanelOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('writerzen:tools-status-changed', { detail: { tab: activeRightTab } }));
  }, [activeRightTab]);

 const [isSidebarOpen, setIsSidebarOpen] = useState(true);
 const [isMemoryBankOpen, setIsMemoryBankOpen] = useState(false);
 const [outlineModalOpen, setOutlineModalOpen] = useState(false);
 const [settingsOpen, setSettingsOpen] = useState(false);
 const [historyOpen, setHistoryOpen] = useState(false);
 const [historySnapshots, setHistorySnapshots] = useState<Array<{ id: string; at: string; content: string }>>([]);
 const historyBackdropProps = useBackdropClose(() => setHistoryOpen(false));
 const [roleImportPayload, setRoleImportPayload] = useState<RoleImportInput | null>(null);
 const [sendToAiWebOpen, setSendToAiWebOpen] = useState(false);
 const [formatPanelOpen, setFormatPanelOpen] = useState(false);
 const [quickFormatSignal, setQuickFormatSignal] = useState(0);
 const [saveState, setSaveState] = useState<SaveState>('saved');
 const [canUndo, setCanUndo] = useState(false);
 const [canRedo, setCanRedo] = useState(false);
 const [findReplaceSignal, setFindReplaceSignal] = useState(0);
 const [editorMaxWidth, setEditorMaxWidth] = useState(editorMaxWidthCfg);
 const [windowWidth, setWindowWidth] = useState(window.innerWidth);

 const fullReview = useFullReview();
 const strongReview = useStrongReview();
 // 强力润色与标准润色是两条独立管线；activeReview 指向当前正在进行/展示的那一条，供状态岛与逐段 diff 面板共用。
 const activeReview = strongReview.status !== 'idle' ? strongReview : fullReview;
 const startFullReview = fullReview.startReview;

 const focusMode = useAppStore((s) => s.focusMode);
 const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);

 // F1 专注模式快捷键（也支持 Ctrl/Cmd+Shift+F 给 Mac 用户）
 const normalSizeRef = useRef<{ width: number; height: number; wasMaximized?: boolean } | null>(null);
 const focusSizeRef = useRef<{ width: number; height: number }>({ width: 900, height: window.innerHeight });
 const doToggleFocus = useCallback(async () => {
 const entering = !useAppStore.getState().focusMode;
 if (entering) {
 // 进入专注模式：记录当前状态
 let wasMaximized = false;
 try {
 const { getCurrentWindow } = await import('@tauri-apps/api/window');
 wasMaximized = await getCurrentWindow().isMaximized();
 } catch {}
 normalSizeRef.current = { width: window.outerWidth, height: window.outerHeight, wasMaximized };
 if (wasMaximized) {
 try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().unmaximize(); } catch {}
 }
 await electronAPI.system.setWindowSize({ width: focusSizeRef.current.width, height: window.outerHeight });
 } else {
 // 退出专注模式：保存专注窗口大小
 focusSizeRef.current = { width: window.outerWidth, height: window.outerHeight };
 if (normalSizeRef.current) {
 if (normalSizeRef.current.wasMaximized) {
 try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().maximize(); } catch {}
 } else {
 await electronAPI.system.setWindowSize({ width: normalSizeRef.current.width, height: normalSizeRef.current.height });
 }
 }
 }
 toggleFocusMode();
 }, [toggleFocusMode]);

 useEffect(() => {
 const onKeyDown = async (e: KeyboardEvent) => {
 const isFocusKey = e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F');
 if (!isFocusKey) return;
 e.preventDefault();
 void doToggleFocus();
 };
 const onCustomToggle = () => { void doToggleFocus(); };
 window.addEventListener('keydown', onKeyDown);
 window.addEventListener('writerzen:toggle-focus-mode', onCustomToggle);
 return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('writerzen:toggle-focus-mode', onCustomToggle); };
 }, [doToggleFocus]);

 useEffect(() => {
 let frame: number | null = null;
 const handleResize = () => {
 if (frame !== null) cancelAnimationFrame(frame);
 frame = requestAnimationFrame(() => {
 frame = null;
 const nextWidth = window.innerWidth;
 setWindowWidth((prev) => (prev === nextWidth ? prev : nextWidth));
 });
 };
 window.addEventListener('resize', handleResize, { passive: true });
 return () => {
 if (frame !== null) cancelAnimationFrame(frame);
 window.removeEventListener('resize', handleResize);
 };
 }, []);

 // Responsive collapse for narrow screens.
 /**
 * Core layout scaler.
 * Keeps the sidebar and editor proportionally sized on narrow windows.
 */
 const { layoutScale } = useMemo(() => {
 const baseWidth = 1600;
 const scale = Math.max(0.7, Math.min(1, windowWidth / baseWidth));
 return { layoutScale: scale };
 }, [windowWidth]);

 const historyActionsRef = useRef<{ undo: () => void; redo: () => void } | null>(null);

 const maxAllowedAgentWidth = Math.floor((windowWidth / layoutScale) * 0.35);
 const minAgentWidth = 300;
 const maxAgentWidth = Math.max(minAgentWidth, Math.min(maxAllowedAgentWidth, 520));
 const agentPanelWidth = Math.max(minAgentWidth, Math.min(agentPanelWidthState || 404, maxAgentWidth));
 const manualPanelWidth = Math.min(360, Math.max(300, Math.floor(windowWidth * 0.24)));
 const shouldOverlayManualPanel = windowWidth < 1450;
 const shouldShowAgentPanel = !focusMode && agentPanelOpen;
 // 手动工具抽屉独立于 Agent；打开/关闭工具不会卸载 Agent 会话。
 const shouldShowRightPanel = (activeRightTab === 'roles' || activeRightTab === 'outline') && !focusMode;
 const getLatestChapter = (targetBook?: typeof book) => {
 if (!targetBook || targetBook.chapters.length === 0) return undefined;
 return targetBook.chapters[targetBook.chapters.length - 1];
 };

 const book = useMemo(() => books.find((item) => item.id === bookId), [books, bookId]);


 useEffect(() => {
  setAgentPanelWidthState(rightPanelWidthCfg);
 }, [rightPanelWidthCfg]);

 useEffect(() => {
  if (!appConfig) return;
  if ((appConfig.ui?.rightPanelWidth ?? 400) === agentPanelWidthState) return;
  const timer = window.setTimeout(() => {
   void saveConfig({
    ...appConfig,
    ui: {
     ...appConfig.ui,
     rightPanelWidth: agentPanelWidthState
    }
   });
  }, 120);
  return () => window.clearTimeout(timer);
 }, [agentPanelWidthState, appConfig, saveConfig]);

 useEffect(() => {
  if (!shouldShowAgentPanel) return;
  const onMove = (event: MouseEvent) => {
   const desired = Math.round(window.innerWidth - event.clientX);
   setAgentPanelWidthState(Math.max(minAgentWidth, Math.min(desired, maxAgentWidth)));
  };
  const onUp = () => {
   document.removeEventListener('mousemove', onMove);
   document.removeEventListener('mouseup', onUp);
   document.body.style.cursor = '';
   document.body.style.userSelect = '';
  };
  const onStart = (event: Event) => {
   const e = event as CustomEvent<{ clientX: number }>;
   document.body.style.cursor = 'col-resize';
   document.body.style.userSelect = 'none';
   onMove({ clientX: e.detail.clientX } as MouseEvent);
   document.addEventListener('mousemove', onMove);
   document.addEventListener('mouseup', onUp);
  };
  window.addEventListener('writerzen:agent-resize-start', onStart as EventListener);
  return () => {
   window.removeEventListener('writerzen:agent-resize-start', onStart as EventListener);
   document.removeEventListener('mousemove', onMove);
   document.removeEventListener('mouseup', onUp);
   document.body.style.cursor = '';
   document.body.style.userSelect = '';
  };
 }, [shouldShowAgentPanel, minAgentWidth, maxAgentWidth]);

 const chapter = useMemo(() => {
 if (!book || book.chapters.length === 0) return undefined;
 if (chapterId) {
 const matched = book.chapters.find((item) => item.id === chapterId);
 if (matched) return matched;
 }
 return getLatestChapter(book);
 }, [book, chapterId]);
 const editorTabs = useAppStore((s) => s.editorTabs);
 const splitTab = useMemo(() => editorTabs.find((tab) => tab.id === splitTabId), [editorTabs, splitTabId]);
 const splitBook = useMemo(() => books.find((item) => item.id === splitTab?.bookId), [books, splitTab?.bookId]);
 const splitChapter = useMemo(() => {
 if (!splitBook) return undefined;
 return splitBook.chapters.find((item) => item.id === splitTab?.chapterId) ?? getLatestChapter(splitBook);
 }, [splitBook, splitTab?.chapterId]);


 // P1: 章节正文懒加载——切换章节时按需水合进 store；水合完成前不挂载编辑器，避免以空内容首挂载。
 const [primaryHydratedKey, setPrimaryHydratedKey] = useState<string | null>(null);
 useEffect(() => {
 if (!book?.id || !chapter?.id) { setPrimaryHydratedKey(null); return; }
 const hk = `${book.id}:${chapter.id}`;
 let cancelled = false;
 void useBookStore.getState().loadChapterIntoStore(book.id, chapter.id).finally(() => {
 if (!cancelled) setPrimaryHydratedKey(hk);
 });
 return () => { cancelled = true; };
 }, [book?.id, chapter?.id]);
 const primaryChapterReady = Boolean(book && chapter && primaryHydratedKey === `${book.id}:${chapter.id}`);
 const [splitHydratedKey, setSplitHydratedKey] = useState<string | null>(null);
 useEffect(() => {
 if (!splitBook?.id || !splitChapter?.id) { setSplitHydratedKey(null); return; }
 const hk = `${splitBook.id}:${splitChapter.id}`;
 let cancelled = false;
 void useBookStore.getState().loadChapterIntoStore(splitBook.id, splitChapter.id).finally(() => {
 if (!cancelled) setSplitHydratedKey(hk);
 });
 return () => { cancelled = true; };
 }, [splitBook?.id, splitChapter?.id]);
 const splitChapterReady = Boolean(splitBook && splitChapter && splitHydratedKey === `${splitBook.id}:${splitChapter.id}`);
 const chapterOutline = chapter?.outline || '';
 const hardConstraints = useMemo(() => ({ goal: chapterOutline, tone: '', constraints: '' }), [chapterOutline]);
 const handleHistoryStateChange = useCallback((state: { canUndo: boolean; canRedo: boolean }) => {
 setCanUndo(state.canUndo);
 setCanRedo(state.canRedo);
 }, []);
 const handleHistoryActionBind = useCallback((actions: { undo: () => void; redo: () => void }) => {
 historyActionsRef.current = actions;
 }, []);

 useEffect(() => {
 if (!book?.id || !chapter?.id) return;
 if (!historyOpen) return; // Only load snapshots while the history panel is open.
 let active = true;
 void (async () => {
 const result = await electronAPI.fs.loadHistorySnapshots({ bookId: book.id, chapterId: chapter.id });
 if (!active) return;
 const snapshots = Array.isArray(result?.snapshots) ? result.snapshots.slice(0, 10) : [];
 setHistorySnapshots(snapshots);
 })();
 return () => {
 active = false;
 };
 }, [book?.id, chapter?.id, historyOpen]);

  const roleKeywords = useMemo(() => {
    const categories = book?.resourceIndex?.customCharacterCategories ?? [];
    const roles = categories.flatMap((category) =>
      category.children.flatMap((role) => [
        role.name,
        ...(role.aliases || []).filter(isUsableRoleAlias)
      ])
    );
    const settings = (book?.outlineVision?.masterOutline?.settingsItems ?? []).map((s: any) => s.title);
    return [...roles, ...settings].filter(Boolean);
 }, [book?.resourceIndex, book?.outlineVision]);

 const roleLookup = useMemo(() => {
 const map: Record<string, RoleProfile> = {};
 const categories = book?.resourceIndex?.customCharacterCategories ?? [];
 for (const category of categories) {
 for (const role of category.children) {
 map[role.name] = role;
 map[role.name.toLowerCase()] = role;
 for (const alias of (role.aliases || []).filter(isUsableRoleAlias)) {
 map[alias] = role;
 map[alias.toLowerCase()] = role;
 }
 }
 }
    const settings = book?.outlineVision?.masterOutline?.settingsItems ?? [];
    for (const setting of settings as any[]) {
      if (!setting.title) continue;
      const mockRole = {
        id: setting.id,
        name: setting.title,
        description: setting.content,
        roleType: '设定',
        faction: setting.folder || '背景设定',
        createdAt: '',
        updatedAt: ''
      } as unknown as RoleProfile;
      if (!map[setting.title]) map[setting.title] = mockRole;
      if (!map[setting.title.toLowerCase()]) map[setting.title.toLowerCase()] = mockRole;
    }

    return map;
  }, [book?.resourceIndex, book?.outlineVision]);

  const splitRoleKeywords = useMemo(() => {
    const categories = splitBook?.resourceIndex?.customCharacterCategories ?? [];
    const roles = categories.flatMap((category) =>
      category.children.flatMap((role) => [
        role.name,
        ...(role.aliases || []).filter(isUsableRoleAlias)
      ])
    );
    const settings = (splitBook?.outlineVision?.masterOutline?.settingsItems ?? []).map((s: any) => s.title);
    return [...roles, ...settings].filter(Boolean);
  }, [splitBook?.resourceIndex, splitBook?.outlineVision]);

 const splitRoleLookup = useMemo(() => {
 const map: Record<string, RoleProfile> = {};
 const categories = splitBook?.resourceIndex?.customCharacterCategories ?? [];
 for (const category of categories) {
 for (const role of category.children) {
 map[role.name] = role;
 map[role.name.toLowerCase()] = role;
 for (const alias of (role.aliases || []).filter(isUsableRoleAlias)) {
 map[alias] = role;
 map[alias.toLowerCase()] = role;
 }
 }
 }
    const settings = splitBook?.outlineVision?.masterOutline?.settingsItems ?? [];
    for (const setting of settings as any[]) {
      if (!setting.title) continue;
      const mockRole = {
        id: setting.id,
        name: setting.title,
        description: setting.content,
        roleType: '设定',
        faction: setting.folder || '背景设定',
        createdAt: '',
        updatedAt: ''
      } as unknown as RoleProfile;
      if (!map[setting.title]) map[setting.title] = mockRole;
      if (!map[setting.title.toLowerCase()]) map[setting.title.toLowerCase()] = mockRole;
    }

    return map;
  }, [splitBook?.resourceIndex, splitBook?.outlineVision]);

 useEffect(() => {
 window.dispatchEvent(new CustomEvent('xly:save-state-change', { detail: { saveState } }));
 }, [saveState]);

 useEffect(() => {
 // Stable injection of copy logic for the toolbar button
 const handleCopy = () => {
 const text = (document.querySelector('.ProseMirror') as any)?.innerText || '';
 if (text) {
 navigator.clipboard.writeText(text);
 showIsland({ type: 'success', status: 'feedback', message: '章节内容已复制到贴板', autoHideMs: 1500 });
 } else {
 showIsland({ type: 'warning', status: 'feedback', message: '没有检测到可复制的内容', autoHideMs: 1500 });
 }
 };
 window.addEventListener('wz-copy-chapter-content', handleCopy);
 return () => {
 window.removeEventListener('wz-copy-chapter-content', handleCopy);
 };
 }, [showIsland]);

 // 编辑器右键菜单"将小说发送至网页助手" → 打开模态
 useEffect(() => {
 const handler = () => {
 setSendToAiWebOpen(true);
 };
 window.addEventListener('writerzen:open-send-to-aiweb', handler);
 return () => window.removeEventListener('writerzen:open-send-to-aiweb', handler);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // 新手引导：打开核心功能入口
 useEffect(() => {
 const openMemoryBank = () => setIsMemoryBankOpen(true);
 const startReviewFromEditor = () => {
 if (!book || !chapter) {
 showIsland({ type: 'warning', message: '请先打开一个章节，再使用智能润色。', autoHideMs: 2200 });
 return;
 }
 const el = document.querySelector('.ProseMirror') as HTMLElement;
 const text = el?.innerText || '';
 strongReview.clearReview();
 startFullReview(chapter.id, text, book.id);
 };
 window.addEventListener('writerzen:open-memory-bank', openMemoryBank);
 window.addEventListener('writerzen:start-full-review', startReviewFromEditor);
 return () => {
 window.removeEventListener('writerzen:open-memory-bank', openMemoryBank);
 window.removeEventListener('writerzen:start-full-review', startReviewFromEditor);
 };
 }, [book, chapter, showIsland, startFullReview]);

 // IDE Refresh：原 right rail 的"智能润色（标准档直启）"入口已由 Toolbar 的
 // FullReviewDropdown（标准/强力两档）覆盖；writerzen:start-full-review 事件入口保留不变。
 // AI 网页的 open/close 事件（writerzen:open-aiweb-tab / close-aiweb-tab）已由 ActivityBar 接管。

 const acceptDiff = activeReview.acceptDiff;
 const rejectDiff = activeReview.rejectDiff;
 useEffect(() => {
 const handleDiffAction = (e: CustomEvent) => {
 const { action, id } = e.detail;
 if (action === 'accept') {
 acceptDiff(id);
 } else if (action === 'reject') {
 rejectDiff(id);
 }
 };
 window.addEventListener('writerzen:diff-action', handleDiffAction as EventListener);
 return () => window.removeEventListener('writerzen:diff-action', handleDiffAction as EventListener);
 }, [acceptDiff, rejectDiff]);

 const paragraphDiffsRef = useRef(activeReview.result?.paragraphDiffs);
 useEffect(() => {
 paragraphDiffsRef.current = activeReview.result?.paragraphDiffs;
 }, [activeReview.result?.paragraphDiffs]);

 useEffect(() => {
 if (activeReview.status === 'scanning') {
 startTask({
 id: 'review-c-island',
 type: 'progress',
 status: 'thinking',
 message: 'AI 正在深度重写...'
 });
 } else if (activeReview.status === 'done') {
 startTask({
 id: 'review-c-island',
 type: 'success',
 status: 'feedback',
 message: '全文对比审查',
 detail: '请在正文逐行确认，或点击完成全部应用',
 actions: [
 {
 id: 'apply',
 label: '完成审查 (全部应用)',
 onClick: () => {
 const diffs = paragraphDiffsRef.current;
 if (!diffs) return;
 const finalHtml = buildFinalHtml(diffs);
 if (book?.id && chapter?.id) {
 useBookStore.getState().setChapterContent(book.id, chapter.id, finalHtml);
 }
 activeReview.clearReview();
 finishTask('review-c-island');
 showIsland({ id: 'review-c-island', type: 'success', message: '已全部应用重写内容', autoHideMs: 2000 });
 }
 },
 {
 id: 'cancel',
 label: '撤销',
 onClick: () => {
 activeReview.clearReview();
 finishTask('review-c-island');
 }
 }
 ]
 });
 } else if (activeReview.status === 'error') {
 finishTask('review-c-island');
 showIsland({
 id: 'review-c-island',
 type: 'error',
 status: 'feedback',
 message: '重写失败',
 detail: activeReview.error || '未知错误',
 autoHideMs: 3000
 });
 } else {
 finishTask('review-c-island');
 }
 }, [
 activeReview.status,
 activeReview.error,
 book?.id,
 chapter?.id,
 showIsland,
 startTask,
 finishTask,
 activeReview.clearReview
 ]);

 // AI 网页右键菜单回调：根据用户选的动作分发到不同处理
 const handleAiWebAction = useCallback((p: { action: string; text: string }) => {
 const text = sanitizePastedText(p.text);
 if (!text) return;
 if (p.action === 'role') {
 setRoleImportPayload({ rawText: text });
 return;
 }
 if (p.action === 'outline') {
 if (!book || !chapter) {
 showIsland({ type: 'error', message: '请先打开一本书的某一章再导入大纲', autoHideMs: 1800 });
 return;
 }
 // 大纲场景：进一步压成单行换行（避免 API 引用大纲时混入空行影响 token 占用）
 const compactText = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).join('\n');
 const existing = (chapter.outline || '').trim();
 let next = compactText;
 if (existing) {
 const ok = window.confirm('当前章节已有大纲。\n\n点击"确定"=追加在现有大纲后面\n点击"取消"=放弃此次导入');
 if (!ok) return;
 next = existing + '\n' + compactText;
 }
 void useBookStore.getState().setChapterOutline(book.id, chapter.id, next);
 showIsland({ type: 'success', message: '已导入到本章大纲', autoHideMs: 1500 });
 return;
 }
 if (p.action === 'note') {
 // 转入正文：广播一个事件，编辑器自己接收并插入到光标位置
 window.dispatchEvent(new CustomEvent('writerzen:insert-at-cursor', { detail: { text } }));
 showIsland({ type: 'success', message: '已转入正文', autoHideMs: 1200 });
 return;
 }
 if (p.action === 'chapter') {
 // 多章识别功能，先做最简单的：把整段文本作为一个新章节大纲（提示用户）
 showIsland({ type: 'success', message: '多章批量识别功能开发中，已先复制到剪贴板', autoHideMs: 2000 });
 try { void navigator.clipboard?.writeText(text); } catch { /* ignore */ }
 return;
 }
 }, [book, chapter, showIsland]);

 // 导出入口只有侧栏 ChapterList 一处；此前 Editor 里的三个 handleExport* 无任何引用，已删除。

 // 拆书神器 / 网文风向标的开窗逻辑已收敛到 ActivityBar（带错误提示），Editor 不再重复持有。

 if (!book || !chapter) {
 return (
 <div className="flex h-full items-center justify-center bg-[var(--bg-primary)]">
 <button className="border border-[var(--border-color)] bg-[var(--surface)] px-4 py-2 text-[var(--text-primary)]"onClick={back}>
 {zhCN.editor.backToShelf}
 </button>
 </div>
 );
 }

 return (
 <div 
 className="wz-editor-layout relative flex flex-row flex-nowrap min-w-0 h-full overflow-hidden bg-[var(--editor-canvas-bg)] text-[var(--text-primary)]"
 style={{ width: '100%', height: '100%' }}
 >
 {/* Left chapter list — 窗口窄时自动收窄，保证右侧不被挤掉 */}
 {isSidebarOpen && !focusMode ? (
 <div 
 className={clsx("wz-editor-sidebar flex min-h-0 shrink-0 select-none flex-col border-r border-[var(--panel-border-color)] bg-[var(--panel-bg)]")}
 style={{ width: '252px' }}
 >
 <ChapterList book={book} />
 </div>
 ) : null}

 <div className="wz-editor-main relative z-10 flex min-w-0 flex-1 flex-col bg-[var(--editor-canvas-bg)]">
   {/* 章节标签栏：对齐设计稿，位于侧边栏右侧、工具栏上方（原在 TitleBar 内跨全宽） */}
   {!focusMode && <EditorBookTabs books={books} />}
 {!focusMode && (<Toolbar
 onOpenMemoryBank={() => setIsMemoryBankOpen(true)}
 onOpenFindReplace={() => {
 setFindReplaceSignal((prev) => prev + 1);
 }}
 onOpenHistory={() => setHistoryOpen(true)}
 onOpenSettings={() => setSettingsOpen(true)}
 canUndo={canUndo}
 canRedo={canRedo}
 onUndo={() => historyActionsRef.current?.undo()}
 onRedo={() => historyActionsRef.current?.redo()}
 onQuickFormat={() => {
 setQuickFormatSignal((prev) => prev + 1);
 showIsland({ type: 'success', status: 'feedback', message: '正在应用排版...', autoHideMs: 1200 });
 }}
 onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
 onOpenOutline={() => setOutlineModalOpen(true)}
 onOpenOutlineBoard={() => {
 electronAPI.system.openOutlineBoardWindow({ bookId: book.id }).catch((err: any) => {
 console.error("Failed to open outline board window:", err);
 showIsland({ type: 'error', status: 'feedback', message: '打开大纲独立窗口失败: ' + String(err) });
 });
 }}
 onStartFullReview={(promptId: string) => {
 const el = document.querySelector('.ProseMirror') as HTMLElement;
 const text = el?.innerText || '';
 if (promptId === 'full_review_strong') {
 fullReview.clearReview();
 strongReview.startReview(chapter.id, text, book.id);
 } else {
 strongReview.clearReview();
 fullReview.startReview(chapter.id, text, book.id);
 }
 }}
 />)}

 

 {/* 专注模式下的精简顶栏：只显示剧情导航 */}
 {focusMode && (
 <div className="flex items-center justify-center py-1.5 pointer-events-auto">
 <button type="button" onClick={() => setOutlineModalOpen(true)} className="wz-outline-pill flex items-center gap-1.5 px-3 py-1.5 text-xs" title="剧情导航">
 <span className="wz-outline-pill-text">📖 剧情导航</span>
 </button>
 </div>
 )}

 <div className="flex flex-1 flex-col overflow-hidden">
 <div className="wz-editor-frame relative flex min-h-0 flex-1 bg-[var(--bg-secondary)]">
 <div className="relative flex-1">
 <div className="wz-editor-shell h-full relative flex flex-col">
 <div className="wz-editor-shield"/>
 <>
 <div style={{ display: activeReview.status === 'done' && activeReview.result ? 'none' : 'block', height: '100%', flex: 1, position: 'relative' }}>
  {primaryChapterReady ? (<TiptapEditor
  key={`${book.id}:${chapter.id}`}
  bookId={book.id}
  book={book}
  chapter={chapter}
  keywords={roleKeywords}
  roleLookup={roleLookup}
  hardConstraints={hardConstraints}
  findReplaceSignal={findReplaceSignal}
  quickFormatSignal={quickFormatSignal}
  contentMaxWidth={editorMaxWidth}
  onHistoryStateChange={handleHistoryStateChange}
  onHistoryActionBind={handleHistoryActionBind}
  onSaveStatusChange={setSaveState}
 editable
  enableInlineAnalysis={appConfig?.ui.enableInlineSuggestion !== false}
  />) : (<div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">正在加载章节…</div>)}
 </div>
 {activeReview.status === 'done' && activeReview.result && (
 <div style={{ display: 'block', height: '100%', flex: 1, position: 'relative' }}>
 <TiptapEditor
 key={`review-inline-temp-${book.id}-${chapter.id}`}
 bookId={book.id}
 book={book}
 chapter={{ ...chapter, id: 'review-inline-temp', content: buildInlineDiffHtml(activeReview.result.paragraphDiffs || []) }}
 keywords={roleKeywords}
 roleLookup={roleLookup}
 hardConstraints={hardConstraints}
 contentMaxWidth={editorMaxWidth}
 />
 </div>
 )}
 </>
 </div>
 </div>



 {splitBook && splitChapter ? (
 <aside className="wz-split-editor flex min-h-0 w-[42%] min-w-[420px] max-w-[680px] shrink-0 flex-col border-l border-[var(--panel-border-color)] bg-[var(--editor-canvas-bg)]">
 <div className="border-b border-[var(--border-color)] px-4 py-3">
 <div className="flex items-center justify-between gap-2">
 <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{splitBook.title}</div>
 <button type="button" className="wz-ide-icon-btn shrink-0" onClick={() => useAppStore.getState().setSplitEditorTab(null)} title="关闭分屏">
 <ChronoIcon name="x-close" size={15} />
 </button>
 </div>
 <div className="mt-1 flex items-center justify-between gap-3">
 <div className="truncate text-xs text-[var(--text-muted)]">{splitChapter.title}</div>
 <div className="shrink-0 text-[11px] text-[var(--accent)] font-semibold">可编辑</div>
 </div>
 </div>
 <div className="min-h-0 flex-1">
 <div className="wz-editor-shell h-full">
 <div className="wz-editor-shield"/>
 {splitChapterReady ? (<TiptapEditor
 key={`${splitBook.id}:${splitChapter.id}`}
 bookId={splitBook.id}
 book={splitBook}
 chapter={splitChapter}
 keywords={splitRoleKeywords}
 roleLookup={splitRoleLookup}
 hardConstraints={{ goal: splitChapter.outline || '', tone: '', constraints: '' }}
 contentMaxWidth={620}
 layout="split"
 enableEditorBridge={false}
 enableInlineAnalysis={false}
 />) : (<div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">正在加载章节…</div>)}
 </div>
 </div>
 </aside>
 ) : null}



 {/* 手动工具抽屉：位于正文与 Agent 之间；窄屏时覆盖正文，绝不挤占 Agent。原 46px 工具轨已移除。 */}
 <div
 className={clsx(
 "wz-editor-right-panel pointer-events-auto flex min-h-0 flex-col border-l border-[var(--panel-border-color)] bg-[var(--panel-bg)] transition-[width,opacity] duration-200",
 activeRightTab === 'roles' ? 'overflow-visible' : 'overflow-hidden',
 shouldOverlayManualPanel && 'absolute inset-y-0 z-30 shadow-[-18px_0_36px_rgba(0,0,0,0.18)]',
 !shouldShowRightPanel && 'invisible opacity-0'
 )}
 style={{
 width: shouldShowRightPanel ? `${manualPanelWidth}px` : '0px',
 right: shouldOverlayManualPanel ? `${agentPanelWidth}px` : undefined,
 willChange: 'width, opacity'
 }}
 >
 <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--panel-border-color)] px-3.5">
 <div className="min-w-0 truncate text-[12px] font-semibold text-[var(--text-primary)]">
 {activeRightTab === 'roles' ? '角色档案' : '大纲与设定'}
 </div>
 <button type="button" className="wz-ide-icon-btn" onClick={() => setActiveRightTab(null)} title="关闭面板">
 <ChronoIcon name="x-close" size={15} />
 </button>
 </div>
 <div className={clsx("relative min-h-0 flex-1", activeRightTab === 'roles' ? 'overflow-visible' : 'overflow-hidden')}>
 <div className="absolute inset-0">
 {activeRightTab === 'roles' ? <div className="h-full w-full overflow-visible"><RolesPanel book={book} /></div> : null}
 {activeRightTab === 'outline' ? <div className="h-full w-full overflow-hidden"><SidebarOutlinePanel book={book} chapter={chapter} /></div> : null}
 </div>
 </div>
 </div>

  {/* Agent 常驻工作台：始终位于窗口最右侧，不再与手动工具互相替换。 */}
 {shouldShowAgentPanel ? (
 <>
 <div
  className="wz-agent-resizer"
  onMouseDown={(event) => {
   event.preventDefault();
   window.dispatchEvent(new CustomEvent('writerzen:agent-resize-start', { detail: { clientX: event.clientX } }));
  }}
 />
 <aside className="wz-editor-agent-workbench relative z-40 flex min-h-0 shrink-0 flex-col border-l border-[var(--panel-border-color)] bg-[var(--panel-bg)] shadow-[-10px_0_28px_rgba(0,0,0,0.08)]" style={{ width: `${agentPanelWidth}px` }}>
  <AgentChatPanel book={book} chapter={chapter} />
 </aside>
 </>
) : null}
 </div>

 </div>
 </div>

 <MemoryBankModal book={book} open={isMemoryBankOpen} onClose={() => setIsMemoryBankOpen(false)} />
 <ChapterOutlineModal
 open={outlineModalOpen}
 initialOutline={chapterOutline}
 onCancel={() => setOutlineModalOpen(false)}
 onSave={(finalOutline) => {
 setOutlineModalOpen(false);
 if (book && chapter) {
 void useBookStore.getState().setChapterOutline(book.id, chapter.id, finalOutline);
 }
 }}
 onClear={() => {
 setOutlineModalOpen(false);
 if (book && chapter) {
 void useBookStore.getState().setChapterOutline(book.id, chapter.id, '');
 }
 }}
 />
 <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

 <StylePreferenceConfirmPanel />
 <SkillConfirmPanel />

 <RoleImportPreviewModal
 open={Boolean(roleImportPayload)}
 bookId={book?.id || ''}
 initialChapterTitle={chapter?.title}
 initialChapterId={chapter?.id}
 payload={roleImportPayload}
 onClose={() => setRoleImportPayload(null)}
 />

 <SendToAiWebModal
 open={sendToAiWebOpen}
 book={book ?? null}
 currentChapterId={chapter?.id}
 onClose={() => setSendToAiWebOpen(false)}
 />

 {/* AI 网页是独立浏览器窗口，UI 跟 React 树解耦。
 这里挂一个 0×0 的 AiWebPanel，仅为保活：监听 writerzen:aiweb-fill / writerzen:aiweb-reload，
 转发主进程注入脚本/web-action 等事件。不影响视觉布局。 */}
 <div aria-hidden="true" style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute', left: -9999, top: -9999 }}>
 <AiWebPanel onWebAction={handleAiWebAction} />
 </div>

 {historyOpen ? (
 <div
 className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 "
 {...historyBackdropProps}
 >
 <div className="wz-modal-enter wz-modal-glass flex h-[min(720px,calc(100vh-48px))] w-[min(900px,calc(100vw-48px))] flex-col overflow-hidden border border-[var(--border-color)] shadow-2xl"onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onMouseUp={(event) => event.stopPropagation()}>
 <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
 <div className="text-xl font-bold text-[var(--text-primary)]">章节历史</div>
 <button className="p-1 text-[var(--text-muted)] hover:bg-[var(--surface)]"onClick={() => setHistoryOpen(false)}>
 <svg className="h-5 w-5"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
 </button>
 </div>
 <div className="min-h-0 flex-1 overflow-auto p-4">
 {historySnapshots.length === 0 ? (
 <div className="flex h-full items-center justify-center text-[var(--text-muted)]">当前章节暂无历史快照</div>
 ) : (
 <div className="space-y-2">
 {historySnapshots.map((snapshot) => (
 <div key={snapshot.id} className="border border-[var(--border-color)] bg-[var(--surface)] p-3">
 <div className="mb-2 flex items-center justify-between">
 <div className="text-xs text-[var(--text-muted)]">{new Date(snapshot.at).toLocaleString('zh-CN')}</div>
 <button
 className="border border-indigo-300/30 bg-indigo-500/80 px-3 py-1 text-xs text-white"
 onClick={() => {
 window.dispatchEvent(new CustomEvent('writerzen:restore-snapshot', { detail: snapshot.content }));
 setHistoryOpen(false);
 showIsland({ type: 'success', message: '已恢复历史快照，正在保存...', autoHideMs: 1500 });
 }}
 >
 恢复
 </button>
 </div>
 <div className="line-clamp-3 text-sm text-[var(--text-secondary)]">{snapshot.content.replace(/<[^>]+>/g, '').slice(0, 260)}</div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 ) : null}

 </div>
 );
}
