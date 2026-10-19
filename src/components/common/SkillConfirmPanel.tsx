// SkillConfirmPanel.tsx
// Agent 技能沉淀确认面板：订阅 useUserSkillStore.candidates，
// 完整展示候选技能（名称/触发描述/来源/内容全文），用户确认才存入技能库。
import { useEffect, useState } from 'react';
import { useIslandStore } from '../../store/useIslandStore';
import { useUserSkillStore, type SkillCandidate } from '../../Agent/userSkillStore';

export function SkillConfirmPanel() {
  const candidates = useUserSkillStore((s) => s.candidates);
  const [pending, setPending] = useState<SkillCandidate[]>([]);
  const show = useIslandStore((s) => s.show);
  const confirm = useUserSkillStore((s) => s.confirm);
  const reject = useUserSkillStore((s) => s.reject);
  const dismissAll = useUserSkillStore((s) => s.dismissAll);

  // 启动时加载已存技能（注册进 registry）
  useEffect(() => {
    void useUserSkillStore.getState().loadSaved();
  }, []);

  // 候选队列变化即同步展示
  useEffect(() => {
    setPending(candidates.slice());
  }, [candidates]);

  if (pending.length === 0) return null;

  const finish = (id: string) => {
    setPending((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next;
    });
  };

  const doConfirm = async (item: SkillCandidate) => {
    const ok = await confirm(item.id);
    if (ok) show({ type: 'success', message: `已存入技能库：${item.name}`, autoHideMs: 1800 });
    else show({ type: 'error', message: '存入失败，请重试', autoHideMs: 2000 });
    finish(item.id);
  };

  const doReject = async (item: SkillCandidate) => {
    await reject(item.id);
    show({ type: 'success', message: '已忽略该技能', autoHideMs: 1400 });
    finish(item.id);
  };

  const doDismissAll = () => {
    dismissAll();
    setPending([]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[9999] w-[min(520px,calc(100vw-40px))] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3">
        <div className="text-[13px] font-bold text-[var(--text-primary)]">Agent 发现一个可复用的写作方法</div>
        <button
          className="p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          onClick={doDismissAll}
          title="忽略全部"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
        {pending.map((item) => (
          <div key={item.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--surface)] p-3">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="text-[14px] font-bold text-[var(--text-primary)]">{item.name}</div>
              {item.category ? (
                <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {item.category === 'writing' ? '写作' : item.category === 'review' ? '审查' : '参考'}
                </span>
              ) : null}
            </div>
            <div className="mb-2 text-[12px] text-[var(--text-secondary)]">{item.description}</div>
            <div className="mb-2 text-[11px] text-[var(--text-muted)]">{item.source}</div>
            <div className="custom-scrollbar mb-3 max-h-[40vh] overflow-y-auto rounded bg-[var(--bg-primary)] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">
              {item.content}
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border border-[var(--border-color)] px-3 py-1 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                onClick={() => void doReject(item)}
              >
                忽略
              </button>
              <button
                className="rounded-md bg-[var(--accent)] px-3 py-1 text-[12px] font-bold text-white transition-all hover:brightness-110"
                onClick={() => void doConfirm(item)}
              >
                确认存入
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
