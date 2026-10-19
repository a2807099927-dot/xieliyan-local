// 模块说明：智能润色下拉（标准/强力两档）。
// IDE Refresh：仅更新视觉（触发按钮与菜单样式 token 化），交互与 promptId 完全不变。
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { IdeSvgSpark, IdeSvgChevronDown } from '../common/IdeSvg';

interface FullReviewDropdownProps {
  onStartReview: (promptId: string) => void;
  disabled?: boolean;
}

const REVIEW_LEVELS: { id: string; label: string; desc: string }[] = [
  { id: 'full_rewrite_system', label: '标准润色', desc: '保持文风，修得更顺更准' },
  { id: 'full_review_strong', label: '强力润色', desc: '锁定剧情对白，重构描写' },
];

export function FullReviewDropdown({ onStartReview, disabled }: FullReviewDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (promptId: string) => {
    setOpen(false);
    onStartReview(promptId);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        data-guide-target="full-review"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        className={clsx('wz-tl-chip wz-review-trigger', disabled && 'opacity-50 cursor-not-allowed')}
        title="智能润色"
      >
        <IdeSvgSpark size={13} />
        <span>智能润色</span>
        <IdeSvgChevronDown size={11} />
      </button>

      {open && !disabled && (
        <div className="wz-review-menu absolute right-0 z-50 mt-1 w-52 overflow-hidden">
          {REVIEW_LEVELS.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => handleSelect(level.id)}
              className="wz-review-option flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
            >
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">{level.label}</span>
              <span className="text-[10.5px] text-[var(--text-muted)]">{level.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
