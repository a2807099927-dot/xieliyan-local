// Agent 人格与技能设置面板。
import type { AppConfig } from '../../../types/ai';
import type { SettingsDraftSetter } from './types';

interface AgentSettingsTabProps {
  draft: AppConfig;
  setDraft: SettingsDraftSetter;
}

export function AgentSettingsTab({ draft, setDraft }: AgentSettingsTabProps) {
  const lang = draft.agent?.language || 'zh-CN';
  const custom = draft.agent?.customPersona || '';

  return (
    <div className="space-y-6">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase" style={{ fontFamily: 'var(--font-display)' }}>
        Agent 人格
      </div>

      {/* ── 人设描述 ── */}
      <div className="wz-premium-pod p-6 backdrop-blur-[24px]">
        <div className="mb-2 text-sm font-medium tracking-wide text-[var(--text-primary)]">
          人设描述
        </div>
        <p className="mb-3 text-[10px] text-[var(--text-muted)]">
          描述 Agent 的语气、对话风格和角色定位。留空则使用系统默认。此描述会注入到 Agent 的 system prompt 中。
          <span className="block mt-1 text-amber-500/80">建议 200 字以内，写清楚语气/角色要求即可；越长越容易被稀释，同一条约束放进 prompt 里的有效度会下降。</span>
        </p>
        <textarea
          className="w-full h-28 resize-y border border-[var(--border-color)] bg-[var(--surface-strong)] p-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] outline-none"
          placeholder="例如：你是写梨眼的写作搭子，话少但一针见血，从不绕弯……"
          value={custom}
          onChange={(e) =>
            setDraft((prev) =>
              prev ? { ...prev, agent: { ...prev.agent, customPersona: e.target.value } } : prev
            )
          }
        />
      </div>

      {/* ── 语言 ── */}
      <div className="wz-premium-pod p-6 backdrop-blur-[24px]">
        <div className="mb-4 text-sm font-medium tracking-wide text-[var(--text-primary)]">回复语言</div>
        <div className="flex gap-3">
          {([
            { value: 'zh-CN' as const, label: '中文' },
            { value: 'en' as const, label: 'English' },
          ]).map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() =>
                setDraft((prev) =>
                  prev ? { ...prev, agent: { ...prev.agent, language: l.value } } : prev
                )
              }
              className={`px-4 py-2 text-xs font-medium border transition-all ${
                lang === l.value
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                  : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 写作辅助 ── */}
      <div className="wz-premium-pod p-6 backdrop-blur-[24px]">
        <div className="mb-2 text-sm font-medium tracking-wide text-[var(--text-primary)]">写作辅助</div>
        <p className="mb-3 text-[10px] text-[var(--text-muted)]">
          写前复盘：每次写正文前先形成写作决策（承接点/怎么写/为什么/爽点节奏），并展示给用户。默认关闭（正文纯执行）；打开可获深度规划，但每章多一次调用。
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.agent?.preWriteReflection === true}
            onChange={(e) =>
              setDraft((prev) =>
                prev ? { ...prev, agent: { ...prev.agent, preWriteReflection: e.target.checked } } : prev
              )
            }
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-[12px] text-[var(--text-primary)]">写前复盘</span>
        </label>
      </div>
    </div>
  );
}
