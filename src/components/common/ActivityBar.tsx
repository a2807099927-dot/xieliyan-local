// 模块说明：全局 ActivityBar（IDE 风格最右图标条）。
// 关键职责：
//  1) 一级导航：书架 / 写作（回编辑器）
//  2) 编辑器面板入口：Agent / 角色档案 / 大纲与设定（发事件驱动 Editor 抽屉）
//  3) 书籍工具：大纲看板
//  4) 独立工具窗：拆书神器 / 网文风向标 / AI 网页
//  5) 底部：QQ 交流群
// 维护边界：
//  - AI 网页是独立浏览器窗口，其开关状态 + 后端 hidden 事件同步收敛在此。
//  - 编辑器内"打开 AI 网页"入口仍发 writerzen:open-aiweb-tab 事件，由本组件接管。
//  - Agent / 角色卡 / 大纲设定 三个 Tab 标签已从 AgentChatPanel 顶栏移除，由此处图标控制。
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useIslandStore } from '../../store/useIslandStore';
import { electronAPI } from '../../utils/electron';
import { IdeSvgKanban, IdeSvgLab, IdeSvgCompass, IdeSvgGlobe, IdeSvgChat, IdeSvgUsers, IdeSvgOutlineBook } from './IdeSvg';

const QQ_GROUP_URL = 'https://qm.qq.com/q/LlZUAUnscu';

// Agent 图标（机器人/AI 助手风格）
function IdeSvgAgent({ size = 20, ...rest }: { size?: number; [key: string]: unknown }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
      {...rest as React.SVGProps<SVGSVGElement>}
    >
      <path d="M12 8V4" />
      <circle cx="12" cy="3" r="1" />
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 14h.01M15 14h.01M9 18h6" />
    </svg>
  );
}

export function ActivityBar() {
  const route = useAppStore((s) => s.route);
  const activeBookId = useAppStore((s) => s.activeBookId);
  const showIsland = useIslandStore((s) => s.show);

  // 编辑器上下文：无当前书时禁用书籍面板入口
  const inEditor = route === 'editor' && Boolean(activeBookId);

  // ── 右侧面板 active 状态（跟随 Editor.tsx 反馈同步） ──────────────────
  const [agentActive, setAgentActive] = useState(true);
  const [toolsActiveTab, setToolsActiveTab] = useState<'roles' | 'outline' | null>(null);

  useEffect(() => {
    const handleAgent = (e: Event) => {
      const open = (e as CustomEvent).detail?.open as boolean;
      setAgentActive(open);
    };
    const handleTools = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as 'roles' | 'outline' | null;
      setToolsActiveTab(tab);
    };
    window.addEventListener('writerzen:agent-status-changed', handleAgent);
    window.addEventListener('writerzen:tools-status-changed', handleTools);
    return () => {
      window.removeEventListener('writerzen:agent-status-changed', handleAgent);
      window.removeEventListener('writerzen:tools-status-changed', handleTools);
    };
  }, []);

  // 切换编辑器面板
  const togglePanel = useCallback((tab: 'agent' | 'roles' | 'outline') => {
    if (tab === 'agent') {
      window.dispatchEvent(new CustomEvent('writerzen:toggle-agent-panel'));
    } else {
      window.dispatchEvent(new CustomEvent('writerzen:toggle-side-panel', { detail: { tab } }));
    }
  }, []);

  // ── AI 网页独立窗口 ──────────────────────────────────────────────────────
  const [aiWebOpen, setAiWebOpen] = useState(false);

  useEffect(() => {
    if (aiWebOpen) {
      const id = localStorage.getItem('xly_aiweb_active') || 'chatgpt';
      void electronAPI.system.aiwebOpen(undefined).then(() => electronAPI.system.aiwebShellAction?.(`switch:${id}`));
    } else {
      void electronAPI.system.aiwebHide();
    }
  }, [aiWebOpen]);

  useEffect(() => {
    const offAiweb = electronAPI.system.onAiwebHidden?.(() => setAiWebOpen(false));
    return () => {
      offAiweb?.();
    };
  }, []);

  useEffect(() => {
    const openHandler = () => setAiWebOpen(true);
    const closeHandler = () => setAiWebOpen(false);
    window.addEventListener('writerzen:open-aiweb-tab', openHandler);
    window.addEventListener('writerzen:close-aiweb-tab', closeHandler);
    return () => {
      window.removeEventListener('writerzen:open-aiweb-tab', openHandler);
      window.removeEventListener('writerzen:close-aiweb-tab', closeHandler);
    };
  }, []);

  // ── 独立工具窗 ────────────────────────────────────────────────────────────
  const openOutlineBoard = useCallback(() => {
    if (!activeBookId) return;
    electronAPI.system.openOutlineBoardWindow({ bookId: activeBookId }).catch((err: unknown) => {
      showIsland({ type: 'error', message: '打开大纲看板失败', detail: String(err), autoHideMs: 1800 });
    });
  }, [activeBookId, showIsland]);

  const openNovelLab = useCallback(() => {
    electronAPI.system.openNovelLabWindow().catch((err: unknown) => {
      showIsland({ type: 'error', message: '打开拆书神器失败', detail: String(err), autoHideMs: 1800 });
    });
  }, [showIsland]);

  const openBookSweeper = useCallback(() => {
    electronAPI.system.openBookSweeperWindow().catch((err: unknown) => {
      showIsland({ type: 'error', message: '打开网文风向标失败', detail: String(err), autoHideMs: 1800 });
    });
  }, [showIsland]);

  return (
    <nav className="wz-activitybar">
      {/* 编辑器面板入口：Agent / 角色卡 / 大纲设定 */}
      <div className="wz-ab-group">
        <button
          type="button"
          className={`wz-ab-item ${inEditor && agentActive ? 'active' : ''}`}
          title="写梨眼助手"
          disabled={!inEditor}
          onClick={() => togglePanel('agent')}
        >
          <IdeSvgAgent size={20} />
        </button>
        <button
          type="button"
          className={`wz-ab-item ${inEditor && toolsActiveTab === 'roles' ? 'active' : ''}`}
          title="角色档案"
          disabled={!inEditor}
          onClick={() => togglePanel('roles')}
        >
          <IdeSvgUsers size={20} />
        </button>
        <button
          type="button"
          className={`wz-ab-item ${inEditor && toolsActiveTab === 'outline' ? 'active' : ''}`}
          title="大纲与设定"
          disabled={!inEditor}
          onClick={() => togglePanel('outline')}
        >
          <IdeSvgOutlineBook size={20} />
        </button>
      </div>

      <div className="wz-ab-sep" />

      {/* 书籍工具 */}
      <div className="wz-ab-group">
        <button
          type="button"
          className="wz-ab-item"
          title="大纲看板"
          disabled={!inEditor}
          onClick={openOutlineBoard}
        >
          <IdeSvgKanban size={20} />
        </button>
      </div>

      {/* 独立工具窗 */}
      <div className="wz-ab-group">
        <button type="button" className="wz-ab-item" title="拆书神器" onClick={openNovelLab}>
          <IdeSvgLab size={20} />
        </button>
        <button type="button" className="wz-ab-item" title="网文风向标" onClick={openBookSweeper}>
          <IdeSvgCompass size={20} />
        </button>
        <button
          type="button"
          className={`wz-ab-item ${aiWebOpen ? 'running' : ''}`}
          title={aiWebOpen ? '收起 AI 网页' : 'AI 网页'}
          onClick={() => setAiWebOpen((prev) => !prev)}
        >
          <IdeSvgGlobe size={20} />
          {aiWebOpen ? <span className="wz-ab-badge" /> : null}
        </button>
      </div>

      <div className="wz-ab-spacer" />

      {/* 底部：交流群 */}
      <div className="wz-ab-group">
        <a className="wz-ab-item" title="QQ 交流群" href={QQ_GROUP_URL} target="_blank" rel="noopener noreferrer">
          <IdeSvgChat size={19} />
        </a>
      </div>
    </nav>
  );
}
