// 模块说明：应用内输入弹窗宿主组件。
// 关键职责：由 usePromptDialogStore 驱动，替代 Tauri WebView 不支持的 window.prompt。
// 架构定位：在应用根部（App）挂载一次；通过 promptDialog() 触发。
import { useEffect, useRef } from 'react';
import { usePromptDialogStore } from '../../store/usePromptDialogStore';

export function PromptDialog() {
  const open = usePromptDialogStore((s) => s.open);
  const title = usePromptDialogStore((s) => s.title);
  const value = usePromptDialogStore((s) => s.value);
  const placeholder = usePromptDialogStore((s) => s.placeholder);
  const confirmText = usePromptDialogStore((s) => s.confirmText);
  const cancelText = usePromptDialogStore((s) => s.cancelText);
  const maxLength = usePromptDialogStore((s) => s.maxLength);
  const setValue = usePromptDialogStore((s) => s.setValue);
  const submit = usePromptDialogStore((s) => s.submit);
  const cancel = usePromptDialogStore((s) => s.cancel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // 打开后自动聚焦并全选，贴近原生 prompt 体验
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="w-[320px] max-w-[90vw] rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 p-4 shadow-2xl">
        <div className="mb-3 text-sm font-semibold text-[#374151] dark:text-gray-100">{title}</div>
        <input
          ref={inputRef}
          className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-[#374151] dark:text-gray-100 outline-none focus:ring-2 focus:ring-[#2d73ff]/50"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="rounded border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-700 px-3 py-1.5 text-xs text-[#374151] dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded border border-[#2d73ff]/30 bg-[#2d73ff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
