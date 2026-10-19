// 模块说明：题材包加载层（前端异步桥）。
// 架构定位：位于 genreSources（同步门面）与 Rust genre 命令之间，负责“取文本 → 装配 → 缓存”。
// 关键职责：
// 1) 通过 Tauri IPC 调 get_genre_pack 拿到 { profile, seedSql } 文本对；
// 2) 交给 genrePackLoader.loadGenrePackFromText 装配成 GenrePack；
// 3) 内存缓存 + 批量预热，供上层同步读取。
// 降级策略（对应改造项 T9）：非 Tauri 环境或后端暂无数据时返回 null / 空数组，绝不抛错阻断上层。

import { loadGenrePackFromText, indexGenrePacks } from './genrePackLoader';
import type { GenrePack } from './types';

// 功能：运行环境判断——仅在 Tauri 壳内可用本地 IPC 题材来源。
const inTauri = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

// 架构：进程内缓存（genre id -> 已装配 GenrePack）。
const packCache = new Map<string, GenrePack>();

// 结构：后端返回的原始文本对。
interface RawGenrePack {
 profile: string;
 seedSql: string;
}

// 功能：异步加载单个题材包。命中缓存直接返回；否则 IPC 取文本并装配后入缓存。
export async function loadGenrePack(genreId: string): Promise<GenrePack | null> {
 if (packCache.has(genreId)) return packCache.get(genreId)!;
 if (!inTauri) return null;
 try {
 const { invoke } = await import('@tauri-apps/api/core');
 const raw = await invoke<RawGenrePack | null>('get_genre_pack', { genre: genreId });
 if (!raw || !raw.profile) return null;
 const pack = loadGenrePackFromText(raw.profile, raw.seedSql || '');
 packCache.set(genreId, pack);
 return pack;
 } catch (err) {
 console.warn('[genreStore] load genre pack failed:', genreId, err);
 return null;
 }
}

// 功能：列出后端可用题材 id；失败回退空数组。
export async function listGenreIds(): Promise<string[]> {
 if (!inTauri) return [];
 try {
 const { invoke } = await import('@tauri-apps/api/core');
 return (await invoke<string[]>('list_genre_packs')) || [];
 } catch (err) {
 console.warn('[genreStore] list genres failed:', err);
 return [];
 }
}

// 功能：批量预热。把所有可用题材装配进缓存，供同步门面即时读取（建议应用启动时调用）。
export async function preloadGenres(): Promise<void> {
 const ids = await listGenreIds();
 await Promise.all(ids.map((id) => loadGenrePack(id)));
}

// 功能：同步快照——返回当前已缓存题材包的索引（未预热时为空 Map）。
export function getCachedGenreIndex(): Map<string, GenrePack> {
 return indexGenrePacks(Array.from(packCache.values()));
}

// 功能：同步读取单个已缓存题材包；未命中触发异步预热并返回 null。
export function getCachedGenrePack(genreId: string): GenrePack | null {
 if (packCache.has(genreId)) return packCache.get(genreId)!;
 // 回退（T9）：缓存以后端原始 id 为键（如 'urban'），调用方可能用归一化后的 AgentGenreId（如 'dushi'）；按归一化 genre 再扫一遍。
 for (const cached of packCache.values()) {
 if (cached.genre === genreId) return cached;
 }
 void loadGenrePack(genreId);
 return null;
}
