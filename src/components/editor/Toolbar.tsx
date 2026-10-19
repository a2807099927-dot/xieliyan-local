// 模块说明：编辑器工具栏组件（IDE Refresh 版）。
// 关键职责：侧栏开关、撤销重做、智能排版、剧情档案、剧情导航、智能润色（标准/强力）、自动工坊、查找替换、章节历史。
// 维护边界：
//  - 所有原有功能入口全部保留；onToggleSidebar 此前已传入但未渲染按钮，本次恢复渲染（修复）。
//  - onOpenSettings 保留在 props 接口中兼容调用方，但不再渲染按钮——设置入口统一在 ActivityBar 底部与标题栏齿轮。
//  - 视觉全部走 styles.css 的 wz-ide-* / wz-tl-* 类，随主题变量自动适配。
import { type MouseEventHandler, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { zhCN } from '../../i18n/zh-CN';
import { useAppStore } from '../../store/useAppStore';
import { IdeSvgSidebar, IdeSvgUndo, IdeSvgRedo, IdeSvgFormat, IdeSvgMemory, IdeSvgRoute, IdeSvgSpark, IdeSvgSearch, IdeSvgHistory, IdeSvgSplit } from '../common/IdeSvg';
import { FullReviewDropdown } from './FullReviewDropdown';

interface ToolbarProps {
  onOpenMemoryBank: () => void;
  onOpenFindReplace: () => void;
  onOpenHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onQuickFormat: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  onOpenOutline?: () => void;
  onOpenOutlineBoard?: () => void;
  onStartFullReview?: (promptId: string) => void;
  /** 是否处于自动工坊主区（设计方案：入口在智能润色旁） */
  /** 切换自动工坊 / 写作模式 */
}

function IconButton({
  title,
  onClick,
  onContextMenu,
  disabled,
  children,
  className
}: {
  title: string;
  onClick: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      title={title}
      className={clsx('wz-ide-icon-btn', className)}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  onOpenMemoryBank,
  onOpenFindReplace,
  onOpenHistory,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onQuickFormat,
  onToggleSidebar,
  onOpenOutline,
  onStartFullReview,
}: ToolbarProps) {
  // 分屏激活态：右侧分屏栏打开时高亮分屏按钮
  const splitActive = useAppStore((s) => Boolean(s.splitEditorTabId));

  return (
    <div className="wz-ide-toolbar !overflow-visible">
      {/* 左组：视图与编辑操作 */}
      <div className="flex items-center gap-1 min-w-0">
        {onToggleSidebar ? (
          <IconButton title="章节列表（收起/展开）" onClick={onToggleSidebar}>
            <IdeSvgSidebar size={17} />
          </IconButton>
        ) : null}
        <IconButton title={zhCN.toolbar.undo} onClick={onUndo} disabled={!canUndo}>
          <IdeSvgUndo size={17} />
        </IconButton>
        <IconButton title={zhCN.toolbar.redo} onClick={onRedo} disabled={!canRedo}>
          <IdeSvgRedo size={17} />
        </IconButton>
        <IconButton title={zhCN.toolbar.autoFormat} onClick={onQuickFormat}>
          <IdeSvgFormat size={17} />
        </IconButton>
        <div className="wz-tb-sep" />
        <button
          type="button"
          data-guide-target="memory-bank"
          onClick={onOpenMemoryBank}
          className="wz-tl-chip is-memory"
          title={zhCN.toolbar.memoryBank}
        >
          <IdeSvgMemory size={13} />
          <span>剧情档案</span>
        </button>
      </div>

      <div className="wz-tb-flex" />

      {/* 中组：剧情与 AI 生产 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onOpenOutline ? (
          <button type="button" onClick={onOpenOutline} className="wz-tl-chip is-route" title="剧情导航">
            <IdeSvgRoute size={13} />
            <span>剧情导航</span>
          </button>
        ) : null}
        {onStartFullReview && (
          <FullReviewDropdown onStartReview={onStartFullReview} />
        )}
      </div>

      <div className="wz-tb-flex" />

      {/* 右组：检索与历史 */}
      <div className="flex items-center gap-1 min-w-0">
        <IconButton title={zhCN.toolbar.searchReplace} onClick={onOpenFindReplace}>
          <IdeSvgSearch size={17} />
        </IconButton>
        <IconButton title={zhCN.toolbar.history} onClick={onOpenHistory}>
          <IdeSvgHistory size={17} />
        </IconButton>
        <IconButton title={splitActive ? '关闭分屏' : '分屏'} className={clsx(splitActive && 'engaged')} onClick={() => window.dispatchEvent(new CustomEvent('writerzen:toggle-split-view'))}>
          <IdeSvgSplit size={17} />
        </IconButton>
      </div>
    </div>
  );
}
