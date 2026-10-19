// history 
export interface ChapterSnapshot {
 id: string;
 at: string;
 content: string;
}

// cleanupOldHistory
export function cleanupOldHistory(
 cache: Map<string, number>,
 maxSize = 200,
 deleteCount = 50
): void {
 if (cache.size <= maxSize) return;
 const keys = Array.from(cache.keys());
 keys.slice(0, Math.max(0, deleteCount)).forEach((key) => cache.delete(key));
}

// shouldCreateSnapshot
export function shouldCreateSnapshot(
 baselineLength: number,
 nextLength: number,
 minCharDelta: number,
 force = false
): boolean {
 if (force) return true;
 if (baselineLength <= 0) return nextLength >= minCharDelta;
 return Math.abs(nextLength - baselineLength) >= minCharDelta;
}

// createHistorySnapshot
export function createHistorySnapshot(html: string): ChapterSnapshot {
 return {
 id: crypto.randomUUID(),
 at: new Date().toISOString(),
 content: html
 };
}
