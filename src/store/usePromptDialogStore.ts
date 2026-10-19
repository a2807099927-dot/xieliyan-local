// 模块说明：应用内输入弹窗状态（替代 Tauri WebView 不支持的 window.prompt）。
// 关键职责：以 Promise 形式弹出输入框，resolve 用户输入；取消或关闭返回 null。
// 维护边界：宿主组件 PromptDialog 挂载一次即可，任意位置通过 promptDialog() 调用。
import { create } from 'zustand';

export interface PromptDialogOptions {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  maxLength?: number;
}

interface PromptDialogState {
  open: boolean;
  title: string;
  value: string;
  placeholder: string;
  confirmText: string;
  cancelText: string;
  maxLength?: number;
  _resolve: ((value: string | null) => void) | null;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
  setValue: (value: string) => void;
  submit: () => void;
  cancel: () => void;
}

export const usePromptDialogStore = create<PromptDialogState>((set, get) => ({
  open: false,
  title: '',
  value: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  maxLength: undefined,
  _resolve: null,
  prompt: (options) => {
    // 若已有未决弹窗，先以取消结算旧的，避免 Promise 泄漏
    const prev = get()._resolve;
    if (prev) prev(null);
    return new Promise<string | null>((resolve) => {
      set({
        open: true,
        title: options.title,
        value: options.defaultValue ?? '',
        placeholder: options.placeholder ?? '',
        confirmText: options.confirmText ?? '确定',
        cancelText: options.cancelText ?? '取消',
        maxLength: options.maxLength,
        _resolve: resolve,
      });
    });
  },
  setValue: (value) => set({ value }),
  submit: () => {
    const { _resolve, value } = get();
    set({ open: false, _resolve: null });
    if (_resolve) _resolve(value);
  },
  cancel: () => {
    const { _resolve } = get();
    set({ open: false, _resolve: null });
    if (_resolve) _resolve(null);
  },
}));

// 便捷函数：在任意位置以 await 调用（组件内外均可）。
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return usePromptDialogStore.getState().prompt(options);
}
