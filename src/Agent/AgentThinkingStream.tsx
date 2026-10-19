// 模块说明：Agent 思维流展示（纯展示层，无 emoji）。
// 位置：写梨眼 Agent 气泡内，标题下方。

import { memo, useEffect, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';

export type ThinkingIcon = 'think' | 'search' | 'write' | 'review' | 'ok' | 'warn' | 'tool' | 'plan';

export interface ThinkingEntry {
  id: string;
  step: number;
  text: string;
  icon: ThinkingIcon;
  at: number;
}

function IconSvg({ kind }: { kind: ThinkingIcon }): ReactNode {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };
  switch (kind) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16.5 16.5 21 21" />
        </svg>
      );
    case 'write':
      return (
        <svg {...common}>
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0 0-3L18.5 4.5a2.1 2.1 0 0 0-3 0L4 16v4Z" />
          <path d="m14.5 6.5 3 3" />
        </svg>
      );
    case 'review':
      return (
        <svg {...common}>
          <path d="M8 6h11M8 12h11M8 18h8" />
          <path d="M4.5 6.2 5.8 7.5 7.6 5.5" />
          <path d="M4.5 12.2 5.8 13.5 7.6 11.5" />
        </svg>
      );
    case 'ok':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.2 12.2 2.5 2.5 5.2-5.4" />
        </svg>
      );
    case 'warn':
      return (
        <svg {...common}>
          <path d="M12 4.5 21 20H3L12 4.5Z" />
          <path d="M12 10v4.5" />
          <circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tool':
      return (
        <svg {...common}>
          <path d="M14.5 6.5a4 4 0 0 0-5.6 5.6L4 17l3 3 4.9-4.9a4 4 0 0 0 5.6-5.6L15 12l-2.5-2.5 2-3Z" />
        </svg>
      );
    case 'plan':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      );
    case 'think':
    default:
      return (
        <svg {...common}>
          <path d="M9.5 17.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
          <path d="M8.2 14.8A5.8 5.8 0 1 1 15.8 14.8c0 1.7-.9 2.6-1.7 3.4-.5.5-.9 1.1-.9 1.8v.5H10.8v-.5c0-.7-.4-1.3-.9-1.8-.8-.8-1.7-1.7-1.7-3.4Z" />
        </svg>
      );
  }
}

export function inferThinkingIcon(text: string): ThinkingIcon {
  const t = String(text || '');
  if (/自查通过|检查通过|完成|已生成|已整理回答/.test(t)) return 'ok';
  if (/问题|失败|未通过|修订|无法解析|错误/.test(t)) return 'warn';
  if (/查证|搜索|search_|调用|检索|档案|read_chapter|inspect_/.test(t)) return 'search';
  if (/自查|审查|复核|Review|checklist/.test(t)) return 'review';
  if (/写作|正文|Draft|生成正文|写手|生成/.test(t)) return 'write';
  if (/规划|plan|方案/.test(t)) return 'plan';
  if (/工具|tool/.test(t)) return 'tool';
  return 'think';
}

export function makeThinkingEntry(step: number, text: string, icon?: ThinkingIcon): ThinkingEntry {
  return {
    id: `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    step,
    text: String(text || '').trim() || '…',
    icon: icon || inferThinkingIcon(text),
    at: Date.now()
  };
}

interface AgentThinkingStreamProps {
  entries: ThinkingEntry[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  active?: boolean;
  className?: string;
  /** 嵌在气泡内时使用更紧凑样式 */
  embedded?: boolean;
}

export const AgentThinkingStream = memo(function AgentThinkingStream({
  entries,
  collapsed,
  onToggleCollapse,
  active = false,
  className,
  embedded = false
}: AgentThinkingStreamProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (collapsed) return;
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [entries, collapsed]);

  if (!entries.length) return null;

  return (
    <div
      className={clsx(
        'wz-think-stream',
        collapsed && 'is-collapsed',
        active && 'is-active',
        embedded && 'is-embedded',
        className
      )}
    >
      <button type="button" className="wz-think-stream-head" onClick={onToggleCollapse}>
        <span className="wz-think-stream-title">
          <span className="wz-think-title-ic" aria-hidden>
            <IconSvg kind={active ? 'think' : 'ok'} />
          </span>
          思维过程
          {active ? <span className="wz-think-live">进行中</span> : null}
        </span>
        <span className="wz-think-stream-meta">
          {entries.length} 步 · {collapsed ? '展开' : '收起'}
        </span>
      </button>
      {!collapsed ? (
        <div ref={listRef} className="wz-think-stream-list custom-scrollbar">
          {entries.map((entry) => (
            <div key={entry.id} className={clsx('wz-think-stream-item', `is-${entry.icon}`)}>
              <span className="wz-think-icon" aria-hidden>
                <IconSvg kind={entry.icon} />
              </span>
              <span className="wz-think-text">
                {entry.step > 0 ? <span className="wz-think-step">第{entry.step}步</span> : null}
                {entry.step > 0 ? <span className="wz-think-sep">·</span> : null}
                <span className="wz-think-body">{entry.text}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default AgentThinkingStream;
