// historicalDataService.ts — 历史地图数据获取与缓存服务
// 从 Wikidata SPARQL 查询历史政权、城市、战役等数据
// 缓存到本地 workspace/map-data-cache/ 目录

import { electronAPI } from '../../utils/electron';

/** 缓存目录路径（相对于用户工作区） */
export const MAP_CACHE_DIR = 'map-data-cache';

/** 历史政权/国家数据 */
export interface HistoricalEntity {
 id: string; // Wikidata ID (如 Q8733)
 name: string; // 中文名称
 nameEn?: string; // 英文名称
 type: 'state' | 'city' | 'battle' | 'event' | 'person';
 startYear?: number; // 起始年份（负数为公元前）
 endYear?: number; // 结束年份
 lat?: number; // 纬度
 lon?: number; // 经度
 description?: string; // 简介
 capital?: string; // 首都（政权）
 parent?: string; // 上级政权
}

/** 查询结果缓存格式 */
interface CacheEntry {
 query: string;
 timestamp: number;
 data: HistoricalEntity[];
}

// 内存缓存
const memoryCache = new Map<string, CacheEntry>();

/** Wikidata SPARQL 端点 */
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/**
 * 查询某个时期某个区域的历史政权
 * @param year 年份（如 220 表示公元220年，-221 表示公元前221年）
 * @param region 区域关键词（如 "中国"、"东亚"）
 */
export async function queryHistoricalStates(year: number, region: string): Promise<HistoricalEntity[]> {
 const cacheKey = `states_${year}_${region}`;
 
 // 检查内存缓存
 const cached = memoryCache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
 return cached.data;
 }

 // 构建 SPARQL 查询：查找在指定年份存在的政权/国家
 const yearStr = year >= 0 ? `${year}` : `${Math.abs(year)}`;
 const eraFilter = year >= 0 
 ? `FILTER(YEAR(?start) <= ${year} && YEAR(?end) >= ${year})`
 : `FILTER(YEAR(?start) <= -${Math.abs(year)} && YEAR(?end) >= -${Math.abs(year)})`;

 const sparql = `
SELECT ?item ?itemLabel ?itemDescription ?start ?end ?coord ?capitalLabel WHERE {
 ?item wdt:P31/wdt:P279* wd:Q3624078 . # 实例为国家或其子类
 ?item wdt:P580 ?start . # 成立时间
 ?item wdt:P582 ?end . # 解散时间
 ${eraFilter}
 OPTIONAL { ?item wdt:P625 ?coord . } # 坐标
 OPTIONAL { ?item wdt:P36 ?capital . } # 首都
 SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en" . }
}
LIMIT 100
 `.trim();

 try {
 const response = await fetch(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}`, {
 headers: { 'Accept': 'application/sparql-results+json' },
 });

 if (!response.ok) throw new Error(`Wikidata 查询失败: ${response.status}`);
 
 const json = await response.json();
 const results: HistoricalEntity[] = [];

 for (const binding of json.results?.bindings || []) {
 const entity: HistoricalEntity = {
 id: binding.item?.value?.split('/').pop() || '',
 name: binding.itemLabel?.value || '',
 type: 'state',
 description: binding.itemDescription?.value || '',
 capital: binding.capitalLabel?.value || '',
 };

 if (binding.start?.value) {
 entity.startYear = new Date(binding.start.value).getFullYear();
 }
 if (binding.end?.value) {
 entity.endYear = new Date(binding.end.value).getFullYear();
 }
 if (binding.coord?.value) {
 const match = binding.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
 if (match) {
 entity.lon = parseFloat(match[1]);
 entity.lat = parseFloat(match[2]);
 }
 }

 if (entity.name && entity.id) {
 results.push(entity);
 }
 }

 // 缓存结果
 const entry: CacheEntry = { query: cacheKey, timestamp: Date.now(), data: results };
 memoryCache.set(cacheKey, entry);

 // 持久化到本地文件
 saveCacheToFile(cacheKey, entry);

 return results;
 } catch (err) {
 console.error('[HistoricalData] Query failed:', err);
 return [];
 }
}

/**
 * 查询某个地点附近的历史城市/地标
 * @param lat 纬度
 * @param lon 经度
 * @param radiusKm 半径（公里）
 */
export async function queryNearbyHistoricalPlaces(lat: number, lon: number, radiusKm: number = 100): Promise<HistoricalEntity[]> {
 const cacheKey = `places_${lat.toFixed(1)}_${lon.toFixed(1)}_${radiusKm}`;
 
 const cached = memoryCache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
 return cached.data;
 }

 const sparql = `
SELECT ?item ?itemLabel ?itemDescription ?coord WHERE {
 ?item wdt:P31/wdt:P279* wd:Q515 . # 城市
 ?item wdt:P625 ?coord . # 有坐标
 SERVICE wikibase:around {
 ?item wdt:P625 ?coord .
 bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
 bd:serviceParam wikibase:radius "${radiusKm}" .
 }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en" . }
}
LIMIT 50
 `.trim();

 try {
 const response = await fetch(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}`, {
 headers: { 'Accept': 'application/sparql-results+json' },
 });

 if (!response.ok) return [];
 
 const json = await response.json();
 const results: HistoricalEntity[] = [];

 for (const binding of json.results?.bindings || []) {
 const entity: HistoricalEntity = {
 id: binding.item?.value?.split('/').pop() || '',
 name: binding.itemLabel?.value || '',
 type: 'city',
 description: binding.itemDescription?.value || '',
 };

 if (binding.coord?.value) {
 const match = binding.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
 if (match) {
 entity.lon = parseFloat(match[1]);
 entity.lat = parseFloat(match[2]);
 }
 }

 if (entity.name && entity.id) {
 results.push(entity);
 }
 }

 const entry: CacheEntry = { query: cacheKey, timestamp: Date.now(), data: results };
 memoryCache.set(cacheKey, entry);
 saveCacheToFile(cacheKey, entry);

 return results;
 } catch (err) {
 console.error('[HistoricalData] Places query failed:', err);
 return [];
 }
}

/**
 * 查询某个时期的战役
 */
export async function queryBattles(startYear: number, endYear: number, region?: string): Promise<HistoricalEntity[]> {
 const cacheKey = `battles_${startYear}_${endYear}_${region || 'all'}`;
 
 const cached = memoryCache.get(cacheKey);
 if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
 return cached.data;
 }

 const sparql = `
SELECT ?item ?itemLabel ?itemDescription ?coord ?date WHERE {
 ?item wdt:P31/wdt:P279* wd:Q178561 . # 战役
 ?item wdt:P625 ?coord . # 有坐标
 ?item wdt:P585 ?date . # 发生时间
 FILTER(YEAR(?date) >= ${startYear} && YEAR(?date) <= ${endYear})
 SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en" . }
}
LIMIT 100
 `.trim();

 try {
 const response = await fetch(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}`, {
 headers: { 'Accept': 'application/sparql-results+json' },
 });

 if (!response.ok) return [];
 
 const json = await response.json();
 const results: HistoricalEntity[] = [];

 for (const binding of json.results?.bindings || []) {
 const entity: HistoricalEntity = {
 id: binding.item?.value?.split('/').pop() || '',
 name: binding.itemLabel?.value || '',
 type: 'battle',
 description: binding.itemDescription?.value || '',
 };

 if (binding.coord?.value) {
 const match = binding.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
 if (match) {
 entity.lon = parseFloat(match[1]);
 entity.lat = parseFloat(match[2]);
 }
 }

 if (binding.date?.value) {
 entity.startYear = new Date(binding.date.value).getFullYear();
 }

 if (entity.name && entity.id) {
 results.push(entity);
 }
 }

 const entry: CacheEntry = { query: cacheKey, timestamp: Date.now(), data: results };
 memoryCache.set(cacheKey, entry);
 saveCacheToFile(cacheKey, entry);

 return results;
 } catch (err) {
 console.error('[HistoricalData] Battles query failed:', err);
 return [];
 }
}

/** 保存缓存到本地文件 */
async function saveCacheToFile(key: string, entry: CacheEntry): Promise<void> {
 try {
 const fileName = `${MAP_CACHE_DIR}/${key}.json`;
 await electronAPI.fs.saveTextFile?.({
 path: fileName,
 content: JSON.stringify(entry, null, 2),
 });
 } catch {
 // 静默失败（缓存写入不影响功能）
 }
}

/** 从本地文件加载缓存 */
export async function loadCacheFromFile(key: string): Promise<CacheEntry | null> {
 try {
 const fileName = `${MAP_CACHE_DIR}/${key}.json`;
 const result = await electronAPI.fs.readTextFile?.({ path: fileName });
 const content = typeof result === 'string' ? result : (result as any)?.text;
 if (content) {
 return JSON.parse(content) as CacheEntry;
 }
 } catch {
 // 文件不存在或解析失败
 }
 return null;
}
