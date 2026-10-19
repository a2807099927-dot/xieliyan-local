// 
// 
import { useCallback, useState } from 'react';
import { useIslandStore } from '../store/useIslandStore';

interface ActionOptions<T> {
 loadingMessage?: string;
 successMessage?: string;
 failMessage?: string;
 autoHideMs?: number;
 onSuccess?: (value: T) => void;
 onError?: (error: unknown) => void;
}

// useAsyncAction
export function useAsyncAction() {
 // 只取需要的 action（zustand 中为稳定引用），避免随灵动岛状态变化重渲染
 const islandShow = useIslandStore((s) => s.show);
 const islandStartTask = useIslandStore((s) => s.startTask);
 const islandFinishTask = useIslandStore((s) => s.finishTask);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const run = useCallback(
 async <T>(fn: () => Promise<T>, options?: ActionOptions<T>): Promise<T> => {
 setLoading(true);
 setError(null);
 let taskId: string | null = null;
 if (options?.loadingMessage) {
 taskId = islandStartTask({ type: 'progress', status: 'thinking', message: options.loadingMessage });
 }
 try {
 const value = await fn();
 if (taskId) {
 islandFinishTask(taskId);
 taskId = null;
 }
 if (options?.successMessage) {
 islandShow({ type: 'success', message: options.successMessage, autoHideMs: options.autoHideMs ?? 1200 });
 }
 options?.onSuccess?.(value);
 return value;
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 setError(message);
 if (taskId) {
 islandFinishTask(taskId);
 taskId = null;
 }
 islandShow({
 type: 'error',
 message: options?.failMessage || '操作失败',
 detail: message,
 autoHideMs: options?.autoHideMs ?? 2600
 });
 options?.onError?.(err);
 throw err;
 } finally {
 if (taskId) {
 islandFinishTask(taskId);
 }
 setLoading(false);
 }
 },
 [islandShow, islandStartTask, islandFinishTask]
 );

 return { run, loading, error };
}

