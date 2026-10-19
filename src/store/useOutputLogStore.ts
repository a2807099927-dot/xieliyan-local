// useOutputLogStore
// 底部输出面板的日志留存层。
// 数据源：useIslandStore 的真实任务/通知事件（全项目 129 处调用点真实产生）。
// 岛屿条目是瞬态的（任务结束或自动隐藏后即从 entries 移除），这里订阅其变化，
// 把这些真实事件留存为可回溯的历史，不生成任何模拟数据。
import { create } from 'zustand';
import { useIslandStore, type IslandEntry, type IslandType } from './useIslandStore';

export type OutputLogLevel = 'ok' | 'warn' | 'err' | 'info';

export interface OutputLogEntry {
 id: string;
 time: number;
 level: OutputLogLevel;
 tag: string;
 message: string;
}

// 上限保护：只保留最近若干条，避免长时间写作后无限增长拖累内存与渲染。
const MAX_OUTPUT_LOGS = 300;

const LEVEL_BY_TYPE: Record<IslandType, OutputLogLevel> = {
 success: 'ok',
 save: 'ok',
 error: 'err',
 warning: 'warn',
 progress: 'info'
};

const TAG_BY_TYPE: Record<IslandType, string> = {
 success: 'done',
 save: 'save',
 error: 'error',
 warning: 'warn',
 progress: 'task'
};

interface OutputLogState {
 logs: OutputLogEntry[];
 append: (entry: { level: OutputLogLevel; tag: string; message: string }) => void;
 clear: () => void;
}

function createLogId(): string {
 return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useOutputLogStore = create<OutputLogState>((set) => ({
 logs: [],
 append: (entry) =>
  set((state) => {
   const next: OutputLogEntry = {
    id: createLogId(),
    time: Date.now(),
    level: entry.level,
    tag: entry.tag,
    message: entry.message
   };
   const logs = [...state.logs, next];
   return { logs: logs.length > MAX_OUTPUT_LOGS ? logs.slice(logs.length - MAX_OUTPUT_LOGS) : logs };
  }),
 clear: () => set({ logs: [] })
}));

// 以「类型 + 状态 + 文案」为指纹，避免同一条目在多次 set 中被重复记录。
function fingerprint(entry: IslandEntry): string {
 return `${entry.type}|${entry.status}|${entry.message}|${entry.detail || ''}`;
}

const seenEntries = new Map<string, string>();

// 订阅真实事件流。模块被 BottomPanel 引入时生效，只读不改岛屿状态。
useIslandStore.subscribe((state) => {
 const activeIds = new Set<string>();
 state.entries.forEach((entry) => {
  activeIds.add(entry.id);
  const print = fingerprint(entry);
  if (seenEntries.get(entry.id) === print) return;
  seenEntries.set(entry.id, print);
  useOutputLogStore.getState().append({
   level: LEVEL_BY_TYPE[entry.type] || 'info',
   tag: TAG_BY_TYPE[entry.type] || 'task',
   message: entry.detail ? `${entry.message} · ${entry.detail}` : entry.message
  });
 });
 // 条目移除后清理指纹，防止 Map 无限增长。
 Array.from(seenEntries.keys()).forEach((id) => {
  if (!activeIds.has(id)) seenEntries.delete(id);
 });
});
