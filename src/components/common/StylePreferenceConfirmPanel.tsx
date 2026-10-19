// StylePreferenceConfirmPanel.tsx
// 改稿学习偏好确认面板：监听 writerzen:style-preference-suggestions，
// 把学习到的用户文风偏好展示为可确认/拒绝的卡片，确认后参与 prompt 注入。
import { useEffect, useState } from 'react';
import { useIslandStore } from '../../store/useIslandStore';
import { confirmStylePreference, rejectStylePreference } from '../../Agent/userPreferenceStore';
import type { UserStylePreference } from '../../types';

type PendingSuggestion = {
  id: string;
  question: string;
  preference: UserStylePreference;
};

type SuggestionEvent = {
  bookId: string;
  suggestions: PendingSuggestion[];
};

export function StylePreferenceConfirmPanel() {
  const [pending, setPending] = useState<PendingSuggestion[] | null>(null);
  const [bookId, setBookId] = useState('');
  const show = useIslandStore((s) => s.show);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as SuggestionEvent;
      if (!detail?.suggestions?.length) return;
      setBookId(detail.bookId);
      setPending(detail.suggestions);
    };
    window.addEventListener('writerzen:style-preference-suggestions', handler);
    return () => window.removeEventListener('writerzen:style-preference-suggestions', handler);
  }, []);

  if (!pending || pending.length === 0) return null;

  const finish = (id: string) => {
    setPending((prev) => {
      const next = (prev || []).filter((item) => item.id !== id);
      return next.length > 0 ? next : null;
    });
  };

  const confirm = async (item: PendingSuggestion) => {
    try {
      await confirmStylePreference(bookId, item.id);
      show({ type: 'success', message: '已记住这个写作习惯', autoHideMs: 1600 });
    } catch {
      show({ type: 'error', message: '确认失败，请重试', autoHideMs: 2000 });
    }
    finish(item.id);
  };

  const reject = async (item: PendingSuggestion) => {
    try {
      await rejectStylePreference(bookId, item.id);
      show({ type: 'success', message: '已忽略该偏好', autoHideMs: 1400 });
    } catch {
      show({ type: 'error', message: '操作失败，请重试', autoHideMs: 2000 });
    }
    finish(item.id);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-[min(380px,calc(100vw-40px))] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
        <div className="text-[13px] font-bold text-[var(--text-primary)]">发现你的写作偏好</div>
        <button
          className="p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          onClick={() => setPending(null)}
          title="忽略全部"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {pending.map((item) => (
          <div key={item.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <div className="mb-2 text-[13px] leading-relaxed text-[var(--text-primary)]">{item.question}</div>
            <div className="mb-2 text-[11px] text-[var(--text-muted)]">
              {item.preference.label || item.preference.type} · {item.preference.direction}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border border-[var(--border-color)] px-3 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                onClick={() => void reject(item)}
              >
                忽略
              </button>
              <button
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-[12px] font-bold text-white transition-all hover:brightness-110"
                onClick={() => void confirm(item)}
              >
                记住
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
