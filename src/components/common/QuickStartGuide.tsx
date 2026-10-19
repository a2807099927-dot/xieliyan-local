import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useBookStore } from '../../store/useBookStore';
import { useIslandStore } from '../../store/useIslandStore';

const GUIDE_DONE_KEY = 'xly_quick_start_done_v1';
const BUBBLE_WIDTH = 340;
const BUBBLE_GAP = 12;

type GuideStep = {
 id: string;
 title: string;
 detail: string;
 action: string;
 target: string;
 onAction: () => void;
};

type BubblePosition = {
 top: number;
 left: number;
 arrowLeft: number;
 placement: 'top' | 'bottom';
};

function clamp(value: number, min: number, max: number) {
 return Math.min(max, Math.max(min, value));
}

function getBubblePosition(targetSelector: string): BubblePosition {
 const fallbackTop = 64;
 const fallbackLeft = Math.max(16, window.innerWidth - BUBBLE_WIDTH - 20);
 const target = document.querySelector<HTMLElement>(targetSelector);

 if (!target) {
 return { top: fallbackTop, left: fallbackLeft, arrowLeft: BUBBLE_WIDTH - 42, placement: 'top' };
 }

 const rect = target.getBoundingClientRect();
 const maxLeft = Math.max(16, window.innerWidth - BUBBLE_WIDTH - 16);
 const left = clamp(rect.left + rect.width / 2 - BUBBLE_WIDTH / 2, 16, maxLeft);
 const hasRoomBelow = rect.bottom + BUBBLE_GAP + 220 < window.innerHeight;
 const top = hasRoomBelow ? rect.bottom + BUBBLE_GAP : Math.max(48, rect.top - BUBBLE_GAP - 220);
 const arrowLeft = clamp(rect.left + rect.width / 2 - left - 7, 18, BUBBLE_WIDTH - 32);

 return {
 top,
 left,
 arrowLeft,
 placement: hasRoomBelow ? 'top' : 'bottom'
 };
}

export function QuickStartGuide() {
 const [open, setOpen] = useState(false);
 const [stepIndex, setStepIndex] = useState(0);
 const [position, setPosition] = useState<BubblePosition>(() => ({
 top: 64,
 left: Math.max(16, window.innerWidth - BUBBLE_WIDTH - 20),
 arrowLeft: BUBBLE_WIDTH - 42,
 placement: 'top'
 }));
 const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
 const route = useAppStore((s) => s.route);
 const openEditor = useAppStore((s) => s.openEditor);
 const books = useBookStore((s) => s.books);
 const showIsland = useIslandStore((s) => s.show);

 useEffect(() => {
 try {
 if (import.meta.env.PROD && window.localStorage.getItem(GUIDE_DONE_KEY) === '1') return;
 const timer = window.setTimeout(() => setOpen(true), 800);
 return () => window.clearTimeout(timer);
 } catch {
 return;
 }
 }, []);

 const closeForever = () => {
 try {
 if (import.meta.env.PROD) window.localStorage.setItem(GUIDE_DONE_KEY, '1');
 } catch {}
 setOpen(false);
 };

 const ensureEditor = (): boolean => {
 if (route === 'editor') return true;
 const book = books[0];
 const chapter = book?.chapters?.[0];
 if (!book || !chapter) {
 showIsland({ type: 'warning', message: '先创建一本书和一个章节，再试这些写作功能。', autoHideMs: 2600 });
 return false;
 }
 openEditor(book.id, chapter.id);
 return true;
 };

 const steps: GuideStep[] = useMemo(() => [
 {
 id: 'model',
 title: '配置模型 (1/7)',
 detail: '开始前，先把 AI 模型接好。点击右上角设置齿轮，进入模型配置。',
 action: '打开设置',
 target: '[data-guide-target="settings"]',
 onAction: () => window.dispatchEvent(new CustomEvent('writerzen:open-settings'))
 },
 {
 id: 'model-provider',
 title: '选择服务商 (2/7)',
 detail: '如果你有官方 API Key，选择对应官方模型；如果使用中转站，选择自定义 / 中转模型。选好后点下一步。',
 action: '下一步',
 target: '[data-guide-target="provider-cards"]',
 onAction: () => {}
 },
 {
 id: 'model-proxy-new',
 title: '新建中转配置 (3/7)',
 detail: '使用中转站时，点击“新建”创建一套连接配置；如果你选的是官方模型，可以直接下一步。',
 action: '下一步',
 target: '[data-guide-target="proxy-new"]',
 onAction: () => {}
 },
 {
 id: 'model-proxy-save',
 title: '保存中转配置 (4/7)',
 detail: '中转地址和密钥填好后，记得点击“保存”，以后就不用反复填写。',
 action: '下一步',
 target: '[data-guide-target="proxy-save"]',
 onAction: () => {}
 },
 {
 id: 'model-base-url',
 title: '填写接口地址 (5/7)',
 detail: '这里填写代理地址，也就是 Base URL。官方直连用户一般不用改这里。',
 action: '下一步',
 target: '[data-guide-target="base-url"]',
 onAction: () => {}
 },
 {
 id: 'model-api-key',
 title: '填写密钥 (6/7)',
 detail: '把你的 API Key 填在这里。写梨眼只调用你自己配置的模型服务。',
 action: '下一步',
 target: '[data-guide-target="api-key"]',
 onAction: () => {}
 },
 {
 id: 'model-test',
 title: '测试连接 (7/7)',
 detail: '最后点击“测试连接”。能拉到模型列表，就说明这条 AI 通道已经打通。',
 action: '完成配置，去体验',
 target: '[data-guide-target="test-connection"]',
 onAction: () => {
 window.dispatchEvent(new CustomEvent('writerzen:close-settings'));
 }
 },
 {
 id: 'enter-start',
 title: '触发卡片建议 (1/2)',
 detail: '在正文写完一段后按回车，然后在新行输入任意两个字，右侧会弹出 AI 建议卡片。没有内容时，可以先插入一段示例。',
 action: '插入示例段落',
 target: '.ProseMirror',
 onAction: () => {
 if (!ensureEditor()) return;
 window.setTimeout(() => {
 window.dispatchEvent(new CustomEvent('writerzen:insert-at-cursor', {
 detail: {
 text: '夜色压在街口，雨水沿着破旧招牌往下淌。他停在灯光照不到的地方，听见身后脚步声一点点逼近。'
 }
 }));
 showIsland({ type: 'success', message: '示例段落已插入，把光标放在段尾按回车试试。', autoHideMs: 2600 });
 }, 120);
 }
 },
 {
 id: 'enter-card',
 title: '采纳建议卡片 (2/2)',
 detail: '这就是 AI 根据上下文给出的灵感建议。点击卡片，或按 Tab，就可以把建议采纳进正文。',
 action: '下一步',
 target: '[data-guide-target="inline-suggestion-card"]',
 onAction: () => {}
 },
 {
 id: 'organize-open',
 title: '打开剧情档案 (1/3)',
 detail: '写了一段之后，可以让 AI 把角色、线索和章节信息整理出来。点击这里进入智能整理。',
 action: '打开剧情档案',
 target: '[data-guide-target="memory-bank"]',
 onAction: () => {
 if (!ensureEditor()) return;
 window.setTimeout(() => window.dispatchEvent(new CustomEvent('writerzen:open-memory-bank')), 120);
 }
 },
 {
 id: 'organize-generate',
 title: '自动整理 (2/3)',
 detail: '点击智能整理，AI 会从章节里提取角色、设定和线索，形成可查阅的剧情档案。',
 action: '生成档案',
 target: '[data-guide-target="memory-bank-generate"]',
 onAction: () => {}
 },
 {
 id: 'organize-close',
 title: '关闭档案库 (3/3)',
 detail: '整理完成后，点击关闭，回到正文继续写。',
 action: '关闭',
 target: '[data-guide-target="memory-bank-close"]',
 onAction: () => {}
 },
 {
 id: 'polish-start',
 title: '启动智能润色 (1/2)',
 detail: '写完一章觉得文字还不够顺，可以交给智能润色逐段检查。点击这里开始。',
 action: '开始润色',
 target: '[data-guide-target="full-review"]',
 onAction: () => {
 if (!ensureEditor()) return;
 window.setTimeout(() => window.dispatchEvent(new CustomEvent('writerzen:start-full-review')), 120);
 }
 },
 {
 id: 'polish-accept',
 title: '对比与采纳 (2/2)',
 detail: '润色出结果后，可以逐处对比修改。满意的内容直接采纳，不满意就保留原文。',
 action: '采纳',
 target: '[data-guide-target="full-review-accept"]',
 onAction: () => {}
 }
 ], [books, route]);

 const currentStep = steps[stepIndex] ?? steps[0];

 useEffect(() => {
 if (currentStep?.id !== 'enter-start') return;
 window.dispatchEvent(new CustomEvent('writerzen:close-settings'));

 const timer = window.setInterval(() => {
 if (document.querySelector('[data-guide-target="inline-suggestion-card"]')) {
 setStepIndex((value) => (steps[value]?.id === 'enter-start' ? Math.min(steps.length - 1, value + 1) : value));
 }
 }, 300);
 return () => window.clearInterval(timer);
 }, [currentStep?.id, steps]);

 useEffect(() => {
 if (!open || !currentStep) return;

 const target = document.querySelector<HTMLElement>(currentStep.target);
 if (!target && /^(enter|organize|polish)-/.test(currentStep.id) && route !== 'editor') {
 ensureEditor();
 }

 const updatePosition = () => {
 const el = document.querySelector<HTMLElement>(currentStep.target);

 if (!el && currentStep.id.startsWith('model-proxy-')) {
 setTargetRect(null);
 setStepIndex((value) => Math.min(steps.length - 1, value + 1));
 return;
 }

 if (!el) {
 setTargetRect(null);
 setPosition(getBubblePosition(currentStep.target));
 return;
 }

 if ('scrollIntoViewIfNeeded' in el) {
 (el as any).scrollIntoViewIfNeeded();
 } else {
 el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 }
 setTargetRect(el.getBoundingClientRect());
 setPosition(getBubblePosition(currentStep.target));
 };
 updatePosition();

 const clickHandler = (e: MouseEvent) => {
 if (currentStep.id === 'enter-start') return;

 const el = document.querySelector<HTMLElement>(currentStep.target);
 if (el && (el.contains(e.target as Node) || el === e.target)) {
 if (stepIndex < steps.length - 1) {
 window.setTimeout(() => setStepIndex((value) => value + 1), 150);
 }
 }
 };
 document.addEventListener('click', clickHandler, true);

 let raf = 0;
 const schedule = () => {
 window.cancelAnimationFrame(raf);
 raf = window.requestAnimationFrame(updatePosition);
 };

 window.addEventListener('resize', schedule);
 window.addEventListener('scroll', schedule, true);
 const timer = window.setInterval(updatePosition, 500);

 return () => {
 window.cancelAnimationFrame(raf);
 window.removeEventListener('resize', schedule);
 window.removeEventListener('scroll', schedule, true);
 window.clearInterval(timer);
 document.removeEventListener('click', clickHandler, true);
 };
 }, [currentStep, open, route, steps.length, stepIndex]);

 useEffect(() => {
 if (!open || !currentStep) return;
 const target = document.querySelector<HTMLElement>(currentStep.target);
 if (!target) return;

 target.setAttribute('data-guide-active', 'true');
 return () => target.removeAttribute('data-guide-active');
 }, [currentStep, open]);

 if (!open || !currentStep) return null;

 return (
 <div className="pointer-events-none fixed inset-0 z-[5100]">
 <style>{`
 @keyframes wz-ring-pulse {
 0% { transform: scale(1); opacity: 0.8; box-shadow: 0 0 0 0 rgba(129, 140, 248, 0.4); }
 70% { transform: scale(1.05); opacity: 0; box-shadow: 0 0 0 10px rgba(129, 140, 248, 0); }
 100% { transform: scale(1); opacity: 0; box-shadow: 0 0 0 0 rgba(129, 140, 248, 0); }
 }
 .wz-target-highlight {
 animation: wz-ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
 border-radius: 8px;
 background: rgba(129, 140, 248, 0.05);
 border: 2px solid var(--accent);
 box-shadow: inset 0 0 12px rgba(129, 140, 248, 0.2);
 }
 @keyframes wz-pop-in {
 0% { opacity: 0; transform: scale(0.95) translateY(10px); }
 100% { opacity: 1; transform: scale(1) translateY(0); }
 }
 .wz-guide-popover {
 animation: wz-pop-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
 }
 `}</style>

 {targetRect && (
 <div
 className="wz-target-highlight pointer-events-none fixed z-[5099]"
 style={{
 top: targetRect.top - 6,
 left: targetRect.left - 6,
 width: targetRect.width + 12,
 height: targetRect.height + 12,
 transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
 }}
 />
 )}

 <section
 className="wz-guide-popover pointer-events-auto fixed z-[5100] w-[340px] p-5"
 style={{ top: position.top, left: position.left, transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
 >
 <div className="absolute inset-0 z-[-1] rounded-2xl border border-[var(--border-color)] bg-[var(--surface-strong)]/80 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]" />

 <div className="absolute left-0 right-0 top-0 h-1 overflow-hidden rounded-t-2xl">
 <div className="h-full w-full bg-gradient-to-r from-[var(--accent)] via-purple-500 to-[var(--accent)] opacity-80" />
 </div>

 <span
 className={[
 'absolute h-4 w-4 rotate-45 border-[var(--border-color)] bg-[var(--surface-strong)]/90 ',
 position.placement === 'top'
 ? '-top-[9px] border-l border-t shadow-[-4px_-4px_8px_-4px_rgba(0,0,0,0.2)]'
 : '-bottom-[9px] border-b border-r shadow-[4px_4px_8px_-4px_rgba(0,0,0,0.2)]'
 ].join(' ')}
 style={{ left: position.arrowLeft, transition: 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
 />

 <div className="relative">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[10px] font-bold text-[var(--accent)] ring-1 ring-[var(--accent)]/30">
 {stepIndex + 1}
 </div>
 <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
 快速上手 / {steps.length}
 </div>
 </div>
 <h2 className="mt-3 text-lg font-extrabold tracking-tight text-[var(--text-primary)]">{currentStep.title}</h2>
 </div>
 <button
 className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)]"
 onClick={closeForever}
 title="关闭"
 >
 ×
 </button>
 </div>

 <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{currentStep.detail}</p>

 <div className="mt-6 flex items-center justify-between gap-2">
 <button
 className="text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
 onClick={closeForever}
 >
 不再提示
 </button>
 <div className="flex items-center gap-2">
 {stepIndex > 0 ? (
 <button
 className="rounded-lg px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition-all hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] active:scale-95"
 onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
 >
 上一步
 </button>
 ) : null}
 {currentStep.action && (
 <button
 className="relative overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] transition-all hover:bg-white/10 active:scale-95"
 onClick={currentStep.onAction}
 >
 {currentStep.action}
 </button>
 )}
 <button
 className="relative overflow-hidden rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[var(--accent)]/30 transition-all hover:brightness-110 active:scale-95"
 onClick={() => {
 if (stepIndex >= steps.length - 1) closeForever();
 else setStepIndex((value) => Math.min(steps.length - 1, value + 1));
 }}
 >
 {stepIndex >= steps.length - 1 ? '完成' : '下一步'}
 </button>
 </div>
 </div>
 </div>
 </section>
 </div>
 );
}
