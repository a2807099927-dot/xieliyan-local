import React from 'react';
import clsx from 'clsx';

interface SidebarSplitViewProps {
  leftWidth?: number;
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  className?: string;
}

/**
 * 通用的侧边栏双栏布局组件（仿起点作家助手右侧栏）
 * 左侧：固定宽度（默认 140px），用于导航/列表/分类树
 * 右侧：弹性伸缩（flex-1），用于内容详情与编辑
 */
export function SidebarSplitView({
  leftWidth = 140,
  leftPanel,
  rightPanel,
  className,
}: SidebarSplitViewProps) {
  return (
    <div className={clsx("flex h-full w-full overflow-hidden bg-[var(--bg-primary)]", className)}>
      {/* 左侧导航栏 */}
      <div 
        className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-secondary)]"
        style={{ width: leftWidth }}
      >
        {leftPanel}
      </div>

      {/* 右侧内容区 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
        {rightPanel}
      </div>
    </div>
  );
}

// 可选的侧边栏顶部 Header 通用组件
export function SidebarSplitHeader({
  title,
  actions,
  className,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex shrink-0 items-center justify-between border-b border-[var(--border-color)] px-4 py-2 bg-[var(--surface)]", className)}>
      <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</h3>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
