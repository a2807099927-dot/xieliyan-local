// MapCanvas.tsx — OSM 底图 + CCTS 历史瓦片叠加
import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapCanvasProps {
 onRegionDoubleClick?: (name: string, id: string) => void;
}

// 朝代配置：CCTS 瓦片图层 ID
const DYNASTIES = [
 { id: 'qin', name: '秦', period: '前221-前207', ccts: 'bc0210', chgis: false },
 { id: 'xihan', name: '西汉', period: '前202-8', ccts: 'bc0007', chgis: false },
 { id: 'donghan', name: '东汉', period: '25-220', ccts: 'ad0140', chgis: false },
 { id: 'sanguo', name: '三国', period: '220-280', ccts: 'ad0262', chgis: false },
 { id: 'xijin', name: '西晋', period: '265-316', ccts: 'ad0281', chgis: false },
 { id: 'dongjin', name: '东晋', period: '317-420', ccts: 'ad0382', chgis: false },
 { id: 'nanbeichao', name: '南北朝', period: '420-589', ccts: 'ad0497', chgis: false },
 { id: 'sui', name: '隋', period: '581-618', ccts: 'ad0612', chgis: false },
 { id: 'tang', name: '唐', period: '618-907', ccts: 'ad0741', chgis: false },
 { id: 'beisong', name: '北宋', period: '960-1127', ccts: 'ad1111', chgis: false },
 { id: 'nansong', name: '南宋', period: '1127-1279', ccts: 'ad1208', chgis: false },
 { id: 'yuan', name: '元', period: '1271-1368', ccts: 'ad1330', chgis: false },
 { id: 'ming', name: '明', period: '1368-1644', ccts: 'ad1582', chgis: false },
 { id: 'qing', name: '清', period: '1636-1912', ccts: 'ad1820', chgis: false },
];

export function MapCanvas({ onRegionDoubleClick }: MapCanvasProps) {
 const containerRef = useRef<HTMLDivElement>(null);
 const mapRef = useRef<any>(null);
 const [loaded, setLoaded] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [activeDynasty, setActiveDynasty] = useState('yuan');
 const [loading, setLoading] = useState(false);
 const [hoverInfo, setHoverInfo] = useState<string | null>(null);

 const loadLayer = useCallback(async (dynastyId: string) => {
 const map = mapRef.current;
 if (!map) return;

 // 切换可见性：隐藏所有朝代图层，只显示当前选中的
 DYNASTIES.forEach(d => {
 const layerId = `ccts-${d.id}`;
 if (map.getLayer(layerId)) {
 map.setLayoutProperty(layerId, 'visibility', d.id === dynastyId ? 'visible' : 'none');
 }
 });

 // 如果当前朝代的 source 还没添加，懒加载它
 const dynasty = DYNASTIES.find(d => d.id === dynastyId);
 if (!dynasty?.ccts) return;
 const sourceId = `ccts-${dynastyId}`;
 const layerId = `ccts-${dynastyId}`;
 if (!map.getSource(sourceId)) {
 // 使用带缓存的瓦片 URL（通过 cacheProxy 拦截）
 map.addSource(sourceId, {
 type: 'raster',
 tiles: [`https://gis.sinica.edu.tw/ccts/file-exists.php?img=${dynasty.ccts}-png-{z}-{x}-{y}`],
 tileSize: 256,
 minzoom: 3,
 maxzoom: 13,
 });
 map.addLayer({
 id: layerId,
 type: 'raster',
 source: sourceId,
 paint: { 'raster-opacity': 0.4 },
 layout: { 'visibility': 'visible' },
 });
 }
 }, []);

 useEffect(() => { if (loaded) loadLayer(activeDynasty); }, [activeDynasty, loaded, loadLayer]);

 // 瓦片磁盘缓存：拦截 CCTS 请求，缓存到 CacheStorage（独立于浏览器缓存）
 useEffect(() => {
 if (!('caches' in window)) return;
 const originalFetch = window.fetch;
 window.fetch = async (...args) => {
 const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
 if (url.includes('gis.sinica.edu.tw/ccts/')) {
 try {
 const cache = await caches.open('ccts-tiles-v1');
 const cached = await cache.match(url);
 if (cached) return cached;
 const response = await originalFetch(...args);
 if (response.ok) cache.put(url, response.clone());
 return response;
 } catch { return originalFetch(...args); }
 }
 return originalFetch(...args);
 };
 return () => { window.fetch = originalFetch; };
 }, []);

 useEffect(() => {
 if (!containerRef.current) return;
 let destroyed = false;
 const init = async () => {
 try {
 if (destroyed) return;
 const map = new maplibregl.Map({
 container: containerRef.current!,
 style: `https://api.maptiler.com/maps/streets-v2/style.json?key=TvwVUYngfxyR2OE54pma&language=zh`,
 center: [108, 34], zoom: 5, minZoom: 3, maxZoom: 12, attributionControl: false,
 transformRequest: (url: string) => {
 // 对 CCTS 瓦片启用缓存
 if (url.includes('gis.sinica.edu.tw')) {
 return { url, headers: {}, credentials: 'omit' as any };
 }
 // MapTiler: 不发送 referer，避免 tauri.localhost 被拒绝
 if (url.includes('maptiler.com')) {
 return { url, headers: {}, credentials: 'omit' as any };
 }
 return { url };
 },
 });
 map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
 map.on('load', () => {
 if (!destroyed) {
 // 强制设置所有文字图层为中文
 map.getStyle().layers.forEach((layer: any) => {
 if (layer.layout && layer.layout['text-field']) {
 try {
 map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:zh'], ['get', 'name:nonlatin'], ['get', 'name']]);
 } catch {}
 }
 });
 mapRef.current = map;
 setLoaded(true);
 }
 });
 } catch (err) { if (!destroyed) setError(err instanceof Error ? err.message : '地图加载失败'); }
 };
 init();
 return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
 }, []);

 if (error) return <div className="flex h-full w-full items-center justify-center bg-[#0f2744] text-white/60 text-xs">❌ {error}</div>;

 return (
 <div className="relative w-full h-full flex flex-col">
 <div ref={containerRef} className="flex-1 min-h-0" />
 {(!loaded || loading) && <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-black/70 text-white/80 text-[10px] px-3 py-1.5 rounded-full">{!loaded ? '加载地图...' : '加载数据...'}</div>}
 {hoverInfo && <div className="absolute top-3 left-3 z-50 bg-black/85 text-white px-3 py-2 rounded shadow-lg text-sm font-bold">{hoverInfo}</div>}
 <div className="shrink-0 border-t border-white/10 bg-[#1a1a2e] px-2 py-2 overflow-x-auto">
 <div className="flex items-center gap-1 min-w-max">
 {DYNASTIES.map(d => (<button key={d.id} onClick={() => setActiveDynasty(d.id)} className={`shrink-0 px-2 py-1 text-[10px] rounded transition-all ${activeDynasty === d.id ? 'bg-red-600 text-white font-bold shadow-md' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'}`} title={d.period}>{d.name}</button>))}
 </div>
 </div>
 <div className="absolute bottom-14 right-2 z-40 text-[7px] text-white/20">© OpenStreetMap · 中研院CCTS</div>
 </div>
 );
}
