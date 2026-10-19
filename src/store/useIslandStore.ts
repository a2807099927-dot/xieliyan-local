// useIslandStore 
// AI ///
// useIsland useIslandStore DOM 
import { create } from 'zustand';

export type IslandType = 'progress' | 'success' | 'error' | 'warning' | 'save';
export type IslandStatus =
 | 'idle'
 | 'connecting'
 | 'memoizing'
 | 'thinking'
 | 'streaming'
 | 'writing'
 | 'feedback';

export interface IslandAction {
 id: string;
 label: string;
 onClick: () => void;
}

export interface IslandEntry {
 id: string;
 type: IslandType;
 status: IslandStatus;
 message: string;
 detail?: string;
 actions?: IslandAction[];
 locked?: boolean;
 createdAt: number;
}

type IslandPayload = {
 id?: string;
 type: IslandType;
 status?: IslandStatus;
 message: string;
 detail?: string;
 autoHideMs?: number;
 actions?: IslandAction[];
 locked?: boolean;
};

export interface IslandState {
 visible: boolean;
 type: IslandType;
 status: IslandStatus;
 message: string;
 detail?: string;
 actions?: IslandAction[];
 entries: IslandEntry[];
 show: (payload: IslandPayload) => void;
 startTask: (payload: Omit<IslandPayload, 'autoHideMs'>) => string;
 updateTask: (id: string, payload: Partial<Omit<IslandPayload, 'id' | 'autoHideMs'>>) => void;
 finishTask: (id: string) => void;
 hide: (id?: string) => void;
}

const transientTimers = new Map<string, ReturnType<typeof setTimeout>>();

function createIslandId(prefix = 'island'): string {
 return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toEntry(payload: IslandPayload, fallbackId?: string): IslandEntry {
 return {
 id: payload.id || fallbackId || createIslandId(),
 type: payload.type,
 status: payload.status || 'idle',
 message: payload.message,
 detail: payload.detail,
 actions: payload.actions,
 locked: payload.locked,
 createdAt: Date.now()
 };
}

function clearEntryTimer(id: string) {
 const timer = transientTimers.get(id);
 if (timer) {
 clearTimeout(timer);
 transientTimers.delete(id);
 }
}

function firstEntryState(entries: IslandEntry[]) {
 const first = entries[0];
 return {
 visible: entries.length > 0,
 type: first?.type || 'progress',
 status: first?.status || 'idle',
 message: first?.message || '',
 detail: first?.detail,
 actions: first?.actions
 };
}

export const useIslandStore = create<IslandState>((set, get) => ({
 visible: false,
 type: 'progress',
 status: 'idle',
 message: '',
 detail: undefined,
 actions: undefined,
 entries: [],
 show: (payload) => {
 const entry = toEntry(payload, 'island-feedback');
 clearEntryTimer(entry.id);
 set((state) => {
 const activeTasks = state.entries.filter((item) => item.locked);
 const otherEntries = state.entries.filter((item) => item.locked || item.id !== entry.id);
 const entries = activeTasks.length > 0 ? [...otherEntries, entry] : [entry];
 return { ...firstEntryState(entries), entries };
 });
 if (payload.autoHideMs && payload.autoHideMs > 0) {
 transientTimers.set(
 entry.id,
 setTimeout(() => {
 get().hide(entry.id);
 }, payload.autoHideMs)
 );
 }
 },
 startTask: (payload) => {
 const id = payload.id || createIslandId('ai-task');
 const entry = toEntry({ ...payload, id, locked: true });
 clearEntryTimer(id);
 set((state) => {
 const entries = [...state.entries.filter((item) => item.id !== id), entry];
 return { ...firstEntryState(entries), entries };
 });
 return id;
 },
 updateTask: (id, payload) => {
 set((state) => {
 const entries = state.entries.map((entry) =>
 entry.id === id
 ? {
 ...entry,
 ...payload,
 status: payload.status || entry.status,
 locked: payload.locked ?? entry.locked
 }
 : entry
 );
 return { ...firstEntryState(entries), entries };
 });
 },
 finishTask: (id) => {
 clearEntryTimer(id);
 set((state) => {
 const entries = state.entries.filter((entry) => entry.id !== id);
 return { ...firstEntryState(entries), entries };
 });
 },
 hide: (id) => {
 if (id) {
 clearEntryTimer(id);
 set((state) => {
 const entries = state.entries.filter((entry) => entry.id !== id || entry.locked);
 return { ...firstEntryState(entries), entries };
 });
 return;
 }
 Array.from(transientTimers.keys()).forEach(clearEntryTimer);
 set((state) => {
 const entries = state.entries.filter((entry) => entry.locked);
 return { ...firstEntryState(entries), entries };
 });
 }
}));
