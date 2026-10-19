// 模块说明：写作习惯设置页签组件。
// 关键职责：维护正文字体、字号、亮度、自定义字体上传与常用写作快捷键展示。
import { useMemo, useRef, type ChangeEvent } from 'react';
import type { AppConfig } from '../../../types/ai';
import type { SettingsDraftSetter } from './types';

interface HabitSettingsTabProps {
 draft: AppConfig;
 setDraft: SettingsDraftSetter;
}

const FONT_LIBRARY = [
 { label: '现代默认', value: '"Inter","Source Han Sans SC","Microsoft YaHei UI","PingFang SC",sans-serif' },
 { label: '雅黑清晰', value: '"Microsoft YaHei UI","PingFang SC","Noto Sans SC",sans-serif' },
 { label: '思源黑体', value: '"Source Han Sans SC","Noto Sans SC","Microsoft YaHei UI",sans-serif' },
 { label: '思源宋体', value: '"Source Han Serif SC","Songti SC","STSong",serif' },
 { label: '楷体风格', value: '"KaiTi","STKaiti","FangSong",serif' }
];

const FONT_SIZE_OPTIONS = [
 { label: '紧凑', value: 15, hint: '适合小屏和高信息密度' },
 { label: '标准', value: 16, hint: '默认阅读尺寸' },
 { label: '舒适', value: 18, hint: '长时间写作更轻松' },
 { label: '大字', value: 20, hint: '适合投屏或高分屏' },
 { label: '超大', value: 22, hint: '护眼优先' },
 { label: '特大', value: 24, hint: '沉浸阅读与校稿' }
];

function readFileAsDataUrl(file: File): Promise<string> {
 return new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result || ''));
 reader.onerror = () => reject(new Error('读取字体文件失败'));
 reader.readAsDataURL(file);
 });
}

function createId(): string {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
 return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeFontName(name: string): string {
 return String(name || '')
 .replace(/\.[^.]+$/, '')
 .replace(/[^\w\u4e00-\u9fa5\-\s]/g, '')
 .trim();
}

function buildFamilyName(base: string): string {
 const safe = base.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5\-]/g, '').slice(0, 32) || 'UserFont';
 return `WZ_${safe}_${Date.now().toString(36)}`;
}

function clampEditorFontSize(value: number): number {
 if (!Number.isFinite(value)) return 18;
 return Math.min(28, Math.max(14, Math.round(value)));
}

export function HabitSettingsTab({ draft, setDraft }: HabitSettingsTabProps) {
 const currentWeight = draft.ui.editorFontWeight || 400;
 const currentBrightness = draft.ui.editorTextBrightness || 1;
 const currentFontSize = clampEditorFontSize(draft.ui.editorFontSize || 18);
 const uploadInputRef = useRef<HTMLInputElement | null>(null);
 const uploadedFonts = useMemo(() => (Array.isArray(draft.ui.uploadedFonts) ? draft.ui.uploadedFonts : []), [draft.ui.uploadedFonts]);

 const fontOptions = useMemo(() => {
 const uploaded = uploadedFonts.map((font) => ({
 label: `自定义 · ${font.name}`,
 value: `"${font.family}","Source Han Sans SC","Microsoft YaHei UI",sans-serif`
 }));
 return [...uploaded, ...FONT_LIBRARY];
 }, [uploadedFonts]);

 const currentFamily = draft.ui.editorFontFamily || fontOptions[0]?.value || FONT_LIBRARY[0].value;

 const patchUi = (uiPatch: Partial<AppConfig['ui']>) => {
 setDraft({
 ...draft,
 ui: {
 ...draft.ui,
 ...uiPatch
 }
 });
 };

 const onUploadFont = async (event: ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;

 const lowerName = file.name.toLowerCase();
 const valid = ['.ttf', '.otf', '.woff', '.woff2'].some((ext) => lowerName.endsWith(ext));
 if (!valid) {
 window.alert('仅支持 .ttf / .otf / .woff / .woff2 字体文件。');
 event.target.value = '';
 return;
 }
 if (file.size > 12 * 1024 * 1024) {
 window.alert('字体文件建议不超过 12MB。');
 event.target.value = '';
 return;
 }

 try {
 const dataUrl = await readFileAsDataUrl(file);
 const readableName = sanitizeFontName(file.name) || '自定义字体';
 const family = buildFamilyName(readableName);
 const nextFont = { id: createId(), name: readableName, family, dataUrl };
 const nextFonts = [...uploadedFonts, nextFont].slice(-30);
 patchUi({
 uploadedFonts: nextFonts,
 editorFontFamily: `"${family}","Source Han Sans SC","Microsoft YaHei UI",sans-serif`
 });
 } catch (error) {
 window.alert(error instanceof Error ? error.message : '上传字体失败');
 } finally {
 event.target.value = '';
 }
 };

 const removeUploadedFont = (id: string) => {
 const target = uploadedFonts.find((item) => item.id === id);
 const nextFonts = uploadedFonts.filter((item) => item.id !== id);
 const fallback = FONT_LIBRARY[0].value;
 const shouldFallback = Boolean(target && draft.ui.editorFontFamily.includes(`"${target.family}"`));
 patchUi({
 uploadedFonts: nextFonts,
 editorFontFamily: shouldFallback ? fallback : draft.ui.editorFontFamily
 });
 };

 return (
 <div className="space-y-6">
 <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"style={{ fontFamily: 'var(--font-display)' }}>
 写作习惯
 </div>

 <div className="p-6 wz-premium-pod backdrop-blur-[24px]">
 <div className="mb-4 text-sm font-medium tracking-wide text-[var(--text-primary)]">正文字体设置</div>

 <div className="grid grid-cols-2 gap-3">
 <label className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
 <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">字体族</div>
 <select
 className="w-full border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none"
 value={currentFamily}
 onChange={(event) => patchUi({ editorFontFamily: event.target.value })}
 >
 {fontOptions.map((item) => (
 <option key={item.label} value={item.value}>
 {item.label}
 </option>
 ))}
 </select>
 </label>

 <div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
 <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
 <span>字体粗细</span>
 <span>{currentWeight}</span>
 </div>
 <input
 type="range"
 min={300}
 max={800}
 step={100}
 value={currentWeight}
 onChange={(event) => patchUi({ editorFontWeight: Number(event.target.value) })}
 className="w-full accent-[var(--accent)]"
 />
 </div>

 <label className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
 <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
 <span>字体颜色</span>
 <span className="text-[10px] opacity-60">{draft.ui.editorFontColor}</span>
 </div>
 <input
 type="color"
 value={draft.ui.editorFontColor || '#f8fafc'}
 onChange={(event) => patchUi({ editorFontColor: event.target.value })}
 className="h-6 w-full cursor-pointer overflow-hidden border-none bg-transparent"
 />
 </label>
 </div>

 <div className="mt-3 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-3">
 <div className="mb-3 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
 <span>正文字号</span>
 <span>{currentFontSize}px</span>
 </div>
 <input
 type="range"
 min={14}
 max={28}
 step={1}
 value={currentFontSize}
 onChange={(event) => patchUi({ editorFontSize: clampEditorFontSize(Number(event.target.value)) })}
 className="mb-3 w-full accent-[var(--accent)]"
 />
 <div className="grid grid-cols-2 gap-2">
 {FONT_SIZE_OPTIONS.map((option) => {
 const active = currentFontSize === option.value;
 return (
 <button
 key={option.value}
 className={` border px-3 py-2 text-left transition ${
 active
 ? 'border-[var(--accent)] bg-[var(--accent)]/18 text-[var(--text-primary)] shadow-[0_0_18px_rgba(99,102,241,0.18)]'
 : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]'
 }`}
 onClick={() => patchUi({ editorFontSize: option.value })}
 >
 <div className="flex items-center justify-between gap-2">
 <span className="text-xs font-bold">{option.label}</span>
 <span className="text-[10px] opacity-70">{option.value}px</span>
 </div>
 <div
 className="mt-1 truncate text-[var(--text-primary)]"
 style={{
 fontFamily: currentFamily,
 fontSize: `${Math.min(option.value, 20)}px`,
 fontWeight: currentWeight,
 filter: `brightness(${currentBrightness})`
 }}
 >
 雨声落在窗沿，文字开始发光。
 </div>
 <div className="mt-1 text-[10px] opacity-55">{option.hint}</div>
 </button>
 );
 })}
 </div>
 </div>

 <div className="mt-3 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-3">
 <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
 <span>字体亮度</span>
 <span>{Math.round(currentBrightness * 100)}%</span>
 </div>
 <input
 type="range"
 min={70}
 max={150}
 step={1}
 value={Math.round(currentBrightness * 100)}
 onChange={(event) => patchUi({ editorTextBrightness: Number(event.target.value) / 100 })}
 className="w-full accent-[var(--accent)]"
 />
 </div>

 <div className="mt-3 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-3">
 <div className="mb-2 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
 <span>上传字体文件</span>
 <span>{uploadedFonts.length} 个</span>
 </div>
 <div className="mb-2 flex items-center gap-2">
 <input
 ref={uploadInputRef}
 type="file"
 accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
 className="hidden"
 onChange={onUploadFont}
 />
 <button className="border border-[var(--border-color)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] hover:brightness-110"onClick={() => uploadInputRef.current?.click()}>
 上传字体
 </button>
 <span className="text-[11px] text-[var(--text-secondary)]">支持 ttf/otf/woff/woff2</span>
 </div>

 {uploadedFonts.length > 0 ? (
 <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
 {uploadedFonts.map((font) => (
 <div key={font.id} className="flex items-center justify-between border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-xs">
 <span className="truncate text-[var(--text-primary)]">{font.name}</span>
 <button className="text-rose-300 hover:text-rose-200"onClick={() => removeUploadedFont(font.id)}>
 删除
 </button>
 </div>
 ))}
 </div>
 ) : (
 <div className="text-[11px] text-[var(--text-secondary)]">还没有上传自定义字体。</div>
 )}
 </div>
 </div>

 <div className="flex w-full gap-4">
 <div className="flex flex-1 items-center justify-center gap-2 p-4 wz-premium-pod text-sm text-[var(--text-primary)]">
 <span className="text-[10px] uppercase tracking-widest opacity-40">SAVE:</span>
 <span className="font-semibold tracking-wider">CTRL + S</span>
 </div>
 <div className="flex flex-1 items-center justify-center gap-2 p-4 wz-premium-pod text-sm text-[var(--text-primary)]">
 <span className="text-[10px] uppercase tracking-widest opacity-40">FIND:</span>
 <span className="font-semibold tracking-wider">CTRL + F</span>
 </div>
 </div>
 </div>
 );
}
