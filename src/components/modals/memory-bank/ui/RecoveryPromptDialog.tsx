// 模块说明：剧情档案恢复提示弹窗。
// 关键职责：检测到 archive-index 异常时引导用户恢复。
import type { RecoveryPrompt } from '../memoryBankLogic';

interface RecoveryPromptDialogProps {
 prompt: RecoveryPrompt;
 onDismiss: () => void;
 onResume: () => void;
}

export function RecoveryPromptDialog({ prompt, onDismiss, onResume }: RecoveryPromptDialogProps) {
 return (
 <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/45 px-4">
 <div className="w-full max-w-lg border border-amber-300/35 bg-[var(--surface)] p-5 shadow-2xl">
 <div className="text-xl font-bold text-[var(--text-primary)]">{prompt.title}</div>
 <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{prompt.detail}</div>
 <div className="mt-5 flex justify-end gap-3">
 <button
 className="border border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-strong)]"
 onClick={onDismiss}
 >
 稍后
 </button>
 <button
 className="bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
 onClick={onResume}
 >
 继续
 </button>
 </div>
 </div>
 </div>
 );
}
