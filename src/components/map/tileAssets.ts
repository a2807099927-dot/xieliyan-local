// tileAssets.ts — 瓦片素材加载与缓存管理

/** 所有可用的瓦片素材 ID */
export const TILE_IDS = [
 // 地形 (9)
 'mountain_snow_1', 'mountain_snow_2', 'mountain_snow_3',
 'hill_green', 'hill_rock', 'desert_1', 'desert_2', 'snow_cloud', 'grassland',
 // 植被 (12)
 'forest_dense_1', 'forest_dense_2', 'forest_dense_3',
 'forest_sparse_1', 'forest_sparse_2', 'forest_sparse_3',
 'bamboo_1', 'dead_tree_1', 'swamp_1',
 'bamboo_2', 'dead_tree_2', 'swamp_2',
 // 背景纹理 (4)
 'ocean_surface', 'parchment', 'ocean_deep', 'shore_beach',
 // 建筑 (9)
 'city_capital_1', 'city_capital_2', 'city_capital_3',
 'city_town_1', 'village_1', 'village_2',
 'fortress', 'war_banner', 'port',
] as const;

export type TileAssetId = typeof TILE_IDS[number];

/** 瓦片图片缓存 */
const tileCache = new Map<string, HTMLImageElement>();
let loadingPromise: Promise<void> | null = null;

/** 获取瓦片素材的 URL（Tauri asset protocol） */
function getTileUrl(tileId: string): string {
 // Tauri 2 中使用 asset protocol 加载 resources 目录下的文件
 // 格式: http://ly-asset.localhost/map-tiles/{tileId}.png
 // 或者使用 convertFileSrc
 try {
 const { convertFileSrc } = (window as any).__TAURI_INTERNALS__ || {};
 if (convertFileSrc) {
 // Tauri 环境
 return `http://ly-asset.localhost/map-tiles/${tileId}.png`;
 }
 } catch { /* ignore */ }
 // Dev 环境 fallback
 return `/map-tiles/${tileId}.png`;
}

/** 加载单个瓦片图片 */
function loadImage(tileId: string): Promise<HTMLImageElement> {
 return new Promise((resolve, reject) => {
 if (tileCache.has(tileId)) {
 resolve(tileCache.get(tileId)!);
 return;
 }
 const img = new Image();
 img.crossOrigin = 'anonymous';
 img.onload = () => {
 tileCache.set(tileId, img);
 resolve(img);
 };
 img.onerror = () => reject(new Error(`Failed to load tile: ${tileId}`));
 img.src = getTileUrl(tileId);
 });
}

/** 预加载所有瓦片素材（应用启动时或首次打开地图面板时调用） */
export async function preloadTileAssets(): Promise<void> {
 if (loadingPromise) return loadingPromise;
 loadingPromise = (async () => {
 const results = await Promise.allSettled(TILE_IDS.map(id => loadImage(id)));
 const failed = results.filter(r => r.status === 'rejected');
 if (failed.length > 0) {
 console.warn(`[MapTiles] ${failed.length}/${TILE_IDS.length} tiles failed to load`);
 }
 })();
 return loadingPromise;
}

/** 获取已缓存的瓦片图片（同步，需先调用 preloadTileAssets） */
export function getTileImage(tileId: string): HTMLImageElement | null {
 return tileCache.get(tileId) || null;
}

/** 检查瓦片是否已加载 */
export function isTileLoaded(tileId: string): boolean {
 return tileCache.has(tileId);
}

/** 获取已加载的瓦片数量 */
export function getLoadedCount(): number {
 return tileCache.size;
}

/** 释放所有缓存（面板关闭时调用以回收内存） */
export function releaseTileCache(): void {
 tileCache.clear();
 loadingPromise = null;
}
