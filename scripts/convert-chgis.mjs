// 将 CHGIS Shapefile 转换为 GeoJSON（按世纪分组）
// 用法: node scripts/convert-chgis.mjs
import shapefile from 'shapefile';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SHP_FILE = join(import.meta.dirname, '..', '地图素材', 'historical-data', 'chgis', 'v6_time_pref_pgn_utf_wgs84.shp');
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'map-data');

mkdirSync(OUT_DIR, { recursive: true });

async function convert() {
  const source = await shapefile.open(SHP_FILE, undefined, { encoding: 'utf-8' });
  
  const allFeatures = [];
  let count = 0;
  
  while (true) {
    const result = await source.read();
    if (result.done) break;
    allFeatures.push(result.value);
    count++;
  }
  
  console.log(`读取了 ${count} 个 features`);
  
  // 输出完整 GeoJSON（可能很大，先看大小）
  const fullGeoJSON = {
    type: 'FeatureCollection',
    features: allFeatures,
  };
  
  const fullStr = JSON.stringify(fullGeoJSON);
  console.log(`完整 GeoJSON 大小: ${(fullStr.length / 1024 / 1024).toFixed(1)} MB`);
  
  // 如果太大，按时间段分割
  if (fullStr.length > 50 * 1024 * 1024) {
    console.log('文件过大，按时间段分割...');
    // 按世纪分组
    const centuries = {};
    for (const f of allFeatures) {
      const begYr = f.properties.BEG_YR || 0;
      const century = Math.floor(begYr / 100) * 100;
      if (!centuries[century]) centuries[century] = [];
      centuries[century].push(f);
    }
    
    for (const [century, features] of Object.entries(centuries)) {
      const gj = { type: 'FeatureCollection', features };
      const path = join(OUT_DIR, `chgis_${century}.geojson`);
      writeFileSync(path, JSON.stringify(gj));
      console.log(`  ${path} (${features.length} features)`);
    }
  } else {
    // 直接输出一个文件
    writeFileSync(join(OUT_DIR, 'chgis_all.geojson'), fullStr);
    console.log(`✅ 输出: ${join(OUT_DIR, 'chgis_all.geojson')}`);
  }
  
  // 同时输出一个简化版（只保留关键属性，减小体积）
  const simplified = allFeatures.map(f => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      name: f.properties.NAME_CH || f.properties.NAME_PY || '',
      type: f.properties.TYPE_CH || '',
      begYr: f.properties.BEG_YR || 0,
      endYr: f.properties.END_YR || 9999,
      level: f.properties.LEV_RANK || '',
    }
  }));
  
  const simpleGJ = { type: 'FeatureCollection', features: simplified };
  const simpleStr = JSON.stringify(simpleGJ);
  writeFileSync(join(OUT_DIR, 'chgis_simple.geojson'), simpleStr);
  console.log(`✅ 简化版: ${join(OUT_DIR, 'chgis_simple.geojson')} (${(simpleStr.length/1024/1024).toFixed(1)} MB)`);
}

convert().catch(err => { console.error('转换失败:', err); process.exit(1); });
