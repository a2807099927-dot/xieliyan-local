// 模块说明：题材源同步门面（Agent 层）。
// 架构定位：给同步调用点（如 service.prepareAgentTask）提供“题材档案 / 清单 / 库”的稳定同步 API；
// 底层数据由 genreStore 异步预热进缓存，本文件只做读取与形态适配，不做 IPC。
// 关键职责：
// 1) getGenreProfile：按 id 返回题材风格档案（GenreProfile），未缓存返回 null。
// 2) getAvailableGenres：返回可选题材 id 清单。
// 3) getAgentGenreLibrary：返回已缓存题材包数组，供上层组装参考资料。
// 演进（对应改造项 T9）：数据由 genreStore.preloadGenres() 在启动时灌入；后端题材包到位后本文件无需改动。

import { getCachedGenrePack, getCachedGenreIndex } from './genreStore';
import type { GenrePack, GenreProfile } from './types';

// 兼容旧签名：题材源映射（现由缓存驱动，保留导出以免破坏历史引用）。
export const genreSources: Record<string, unknown> = {};

// 功能：按题材 id 返回风格档案；未缓存（未预热或后端无数据）时返回 null。
export function getGenreProfile(genreId: string): GenreProfile | null {
 return getCachedGenrePack(genreId)?.profile ?? null;
}

// 功能：返回可选题材 id 清单（与后端 list_genre_packs 对齐的静态兜底）。
export function getAvailableGenres(): string[] {
 return ['urban', 'xuanhuan', 'wenyi', 'youxi', 'lishi', 'lishishuangwen', 'shuangwen'];
}

// 功能：返回已缓存的题材包数组，供 Agent 组装参考资料（referenceBundle）。
export function getAgentGenreLibrary(): GenrePack[] {
 return Array.from(getCachedGenreIndex().values());
}
