// 按朝代从 CHGIS 数据中提取行政区划，生成各朝代的 GeoJSON
// 用法: node scripts/build-dynasty-maps.mjs
import shapefile from 'shapefile';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SHP = join(import.meta.dirname, '..', '地图素材', 'historical-data', 'chgis', 'v6_time_pref_pgn_utf_wgs84.shp');
const DBF = join(import.meta.dirname, '..', '地图素材', 'historical-data', 'chgis', 'v6_time_pref_pgn_utf_wgs84.dbf');
const OUT = join(import.meta.dirname, '..', 'public', 'map-data', 'dynasties');
mkdirSync(OUT, { recursive: true });

// 朝代定义（名称、代表年份用于查询、时间范围）
const DYNASTIES = [
  { id: 'chunqiu', name: '春秋', year: -600, start: -770, end: -476 },
  { id: 'zhanguo', name: '战国', year: -350, start: -475, end: -221 },
  { id: 'qin', name: '秦', year: -210, start: -221, end: -207 },
  { id: 'xihan', name: '西汉', year: -100, start: -206, end: 8 },
  { id: 'donghan', name: '东汉', year: 100, start: 25, end: 220 },
  { id: 'sanguo', name: '三国', year: 230, start: 220, end: 280 },
  { id: 'xijin', name: '西晋', year: 290, start: 265, end: 316 },
  { id: 'dongjin', name: '东晋/十六国', year: 370, start: 317, end: 420 },
  { id: 'nanbeichao', name: '南北朝', year: 500, start: 420, end: 589 },
  { id: 'sui', name: '隋', year: 600, start: 581, end: 618 },
  { id: 'tang', name: '唐', year: 700, start: 618, end: 907 },
  { id: 'wudai', name: '五代十国', year: 940, start: 907, end: 960 },
  { id: 'beisong', name: '北宋', year: 1050, start: 960, end: 1127 },
  { id: 'nansong', name: '南宋/金', year: 1200, start: 1127, end: 1279 },
  { id: 'yuan', name: '元', year: 1300, start: 1271, end: 1368 },
  { id: 'ming', name: '明', year: 1500, start: 1368, end: 1644 },
  { id: 'qing', name: '清', year: 1750, start: 1644, end: 1911 },
];

async function main() {
  const source = await shapefile.open(SHP, DBF, { encoding: 'utf-8' });
  
  // 读取所有 features
  const allFeatures = [];
  while (true) {
    const r = await source.read();
    if (r.done) break;
    allFeatures.push(r.value);
  }
  console.log(`总共 ${allFeatures.length} 个 features`);

  // 为每个朝代生成 GeoJSON
  for (const dynasty of DYNASTIES) {
    // 用代表年份过滤：该年份存在的行政区
    const filtered = allFeatures.filter(f => {
      const beg = f.properties.BEG_YR;
      const end = f.properties.END_YR;
      if (beg == null || end == null) return false;
      return dynasty.year >= beg && dynasty.year <= end;
    });

    // 简化属性
    const features = filtered.map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        name: f.properties.NAME_CH || f.properties.NAME_PY || '',
        type: f.properties.TYPE_CH || '',
        level: f.properties.LEV_RANK || '',
      }
    }));

    const geojson = { type: 'FeatureCollection', features };
    const outPath = join(OUT, `${dynasty.id}.geojson`);
    writeFileSync(outPath, JSON.stringify(geojson));
    
    const sizeKB = (JSON.stringify(geojson).length / 1024).toFixed(0);
    console.log(`  ${dynasty.name} (${dynasty.id}): ${features.length} 个区域, ${sizeKB} KB`);
  }

  console.log('\n✅ 所有朝代地图生成完毕！');
}

main().catch(err => { console.error(err); process.exit(1); });
