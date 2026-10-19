// 模块说明：设置页界面子面板。
// 关键职责：配置主题、显示缩放、窗口尺寸、网格线与性能相关 UI 选项。
import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import type { AppConfig } from '../../../types/ai';
import type { SettingsDraftSetter } from './types';
import { electronAPI } from '../../../utils/electron';

interface UiSettingsTabProps {
  draft: AppConfig;
  setDraft: SettingsDraftSetter;
}

type ThemeOption = {
  value: AppConfig['ui']['theme'];
  label: string;
  description: string;
  swatches: [string, string, string];
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'dark',
    label: '石墨夜幕',
    description: '经典深灰色调，专业稳重，极简专注。',
    swatches: ['#1e1e22', '#18181c', '#528bf2']
  },
  {
    value: 'matcha',
    label: '竹青护眼',
    description: '淡雅竹青绿底与深黛绿字，温润低刺激。',
    swatches: ['#eaf1e6', '#e0e8dc', '#3d6b43']
  },
  {
    value: 'parchment',
    label: '纸页暖光',
    description: '仿古羊皮纸温暖淡黄，保护视力，质感经典。',
    swatches: ['#faf2e0', '#f3e6cd', '#a05a2c']
  },
  {
    value: 'light',
    label: '晨光暖白',
    description: '近白略暖的炭墨纸面，如清晨纸页般干净清爽。',
    swatches: ['#f8f7f2', '#f2f1eb', '#476f8a']
  }
];

const FILTER_ITEMS = [
  { key: 'appBrightness', label: '整体亮度', min: 70, max: 130, unit: '%' },
  { key: 'appContrast', label: '整体对比度', min: 70, max: 130, unit: '%' },
  { key: 'appSaturation', label: '整体饱和度', min: 70, max: 140, unit: '%' }
] as const;

export function UiSettingsTab({ draft, setDraft }: UiSettingsTabProps) {
  const windowPreset = draft.ui.windowPreset || '1600x900';
  const [scale, setScale] = useState(1.0);

  useEffect(() => {
    const fetchScale = async () => {
      try {
        const currentScale = await electronAPI.system.scaleGet();
        setScale(currentScale);
      } catch (err) {
        console.error('Failed to get UI scale:', err);
      }
    };
    void fetchScale();

    const unlisten = electronAPI.system.onScaleChanged((newScale: number) => {
      setScale(newScale);
    });

    return () => {
      if (typeof unlisten === 'function') {
        unlisten();
      }
    };
  }, []);

  const updateUi = (patch: Partial<AppConfig['ui']>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ui: {
          ...prev.ui,
          ...patch
        }
      };
    });
  };

  const handleScaleChange = async (value: number) => {
    setScale(value);
    try {
      await electronAPI.system.scaleSet(value);
    } catch (err) {
      console.error('Failed to set UI scale:', err);
    }
  };

  const applyWindowPreset = async (preset: AppConfig['ui']['windowPreset']) => {
    if (preset === 'follow-system') return;
    const [w, h] = preset.split('x').map((item) => Number(item));
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    try {
      await electronAPI.system.setWindowSize({ width: w, height: h });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '窗口分辨率调整失败');
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        界面与阅读
      </div>

      <div className="wz-premium-pod space-y-4 p-6 backdrop-blur-[24px]">
        <div>
          <div className="text-sm font-medium tracking-wide text-[var(--text-primary)]">工作台主题</div>
          <div className="mt-1 text-[12px] text-[var(--text-muted)]">
            先给你几套写作软件里常用、真的能拿来久看的配色，不是挂几个名字糊弄人。
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {THEME_OPTIONS.map((theme) => {
            const active = draft.ui.theme === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                className={clsx(
                  'group rounded-sm border px-3 py-3 text-left transition-all duration-200',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_0_1px_rgba(99,102,241,0.18)]'
                    : 'border-[var(--border-color)] bg-[var(--surface-strong)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5'
                )}
                onClick={() => updateUi({ theme: theme.value })}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex gap-1.5">
                    {theme.swatches.map((color) => (
                      <span
                        key={color}
                        className="h-4 w-4 rounded-full border border-black/20"
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                  {active ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">当前</span>
                  ) : null}
                </div>
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{theme.label}</div>
                <div className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{theme.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="wz-premium-pod p-6 backdrop-blur-[24px]">
        <div className="mb-4 text-sm font-medium tracking-wide text-[var(--text-primary)]">网格线</div>
        <div className="grid grid-cols-3 gap-3">
          {(['none', 'solid', 'dashed'] as const).map((mode) => {
            const active = (draft.ui.editorGridLine ?? 'none') === mode;
            const labels = { none: '无', solid: '实线', dashed: '虚线' };
            return (
              <button
                key={mode}
                type="button"
                className={clsx(
                  'flex flex-col items-center justify-center border p-3 transition-all duration-200',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)] shadow-sm'
                    : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                )}
                onClick={() => updateUi({ editorGridLine: mode })}
              >
                <div className="mb-2 flex h-10 w-16 flex-col justify-around overflow-hidden border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5">
                  {mode === 'none' && (
                    <div className="flex h-full items-center justify-center">
                      <svg className="h-4 w-4 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                    </div>
                  )}
                  {mode === 'solid' && (
                    <>
                      <div className="w-full border-b border-[var(--border-color)] opacity-60" />
                      <div className="w-full border-b border-[var(--border-color)] opacity-60" />
                      <div className="w-full border-b border-[var(--border-color)] opacity-60" />
                    </>
                  )}
                  {mode === 'dashed' && (
                    <>
                      <div className="w-full border-b border-dashed border-[var(--border-color)] opacity-60" />
                      <div className="w-full border-b border-dashed border-[var(--border-color)] opacity-60" />
                      <div className="w-full border-b border-dashed border-[var(--border-color)] opacity-60" />
                    </>
                  )}
                </div>
                <span className="text-[12px] font-semibold">{labels[mode]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="wz-premium-pod p-6 backdrop-blur-[24px]">
        <div className="mb-4 text-sm font-medium tracking-wide text-[var(--text-primary)]">全局显示调节</div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-3">
            <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">窗口分辨率预设</div>
            <select
              className="w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--text-primary)]"
              value={windowPreset}
              onChange={(event) => {
                const nextPreset = event.target.value as AppConfig['ui']['windowPreset'];
                updateUi({ windowPreset: nextPreset });
                void applyWindowPreset(nextPreset);
              }}
            >
              <option value="1600x900">1600 × 900（默认）</option>
              <option value="1366x768">1366 × 768</option>
              <option value="1920x1080">1920 × 1080</option>
              <option value="follow-system">跟随系统窗口</option>
            </select>
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">除了“跟随系统”以外，选了就会立刻调窗口大小。</div>
          </label>

          <div className="flex flex-col justify-between border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                <span>界面缩放比例（Webview Zoom）</span>
                <span className="font-semibold text-[var(--accent)]">{Math.round(scale * 100)}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={180}
                step={5}
                value={Math.round(scale * 100)}
                onChange={(event) => void handleScaleChange(Number(event.target.value) / 100)}
                className="mt-1.5 w-full accent-[var(--accent)]"
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>缩小（50%）</span>
              <button
                className="cursor-pointer underline hover:text-[var(--accent)]"
                onClick={() => void handleScaleChange(1.0)}
              >
                重置默认
              </button>
              <span>放大（180%）</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {FILTER_ITEMS.map((item) => {
            const value = draft.ui[item.key] as number;
            return (
              <div key={item.key} className="border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-3">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                  <span>{item.label}</span>
                  <span>{Math.round(value * 100)}{item.unit}</span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  step={1}
                  value={Math.round(value * 100)}
                  onChange={(event) => updateUi({ [item.key]: Number(event.target.value) / 100 } as Partial<AppConfig['ui']>)}
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-5 py-4">
        <label className="flex cursor-pointer items-center justify-between">
          <div className="flex-1">
            <div className="text-[14px] font-medium tracking-wide text-[var(--text-primary)]">正文建议卡片</div>
            <div className="mt-0.5 text-[11px] leading-5 tracking-tight text-[var(--text-muted)] opacity-70">
              写完一段按回车后，在正文右侧弹出 AI 建议卡片（用词 / 语序 / 描写建议）。关闭后不再弹出，避免打断连续写作。
            </div>
          </div>
          <input
            type="checkbox"
            className="ml-3 h-4 w-4 flex-shrink-0"
            checked={draft.ui.enableInlineSuggestion !== false}
            onChange={(event) => updateUi({ enableInlineSuggestion: event.target.checked })}
          />
        </label>
      </div>

      <div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-5 py-4">
        <label className="flex cursor-pointer items-center justify-between">
          <div className="flex-1">
            <div className="text-[14px] font-medium tracking-wide text-[var(--text-primary)]">简化模式（省电模式）</div>
            <div className="mt-0.5 text-[11px] leading-5 tracking-tight text-[var(--text-muted)] opacity-70">
              关掉毛玻璃模糊、循环动画、视频壁纸这些耗能效果。笔记本或者低性能机器开这个会舒服不少。
            </div>
          </div>
          <input
            type="checkbox"
            className="ml-3 h-4 w-4 flex-shrink-0"
            checked={Boolean(draft.ui.lowPerformanceMode)}
            onChange={(event) => updateUi({ lowPerformanceMode: event.target.checked })}
          />
        </label>
      </div>
    </div>
  );
}
