// 将 GeoJSON 省级数据转换为精简 SVG 文件
// 用法: node scripts/geojson-to-svg.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(import.meta.dirname, '..', '地图素材', 'china_geojson-master', '省');
const OUT_FILE = join(import.meta.dirname, '..', 'public', 'china-provinces.svg');

// 简单的墨卡托投影（经纬度 → SVG 坐标）
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 800;
const LON_MIN = 73;
const LON_MAX = 136;
const LAT_MIN = 3;
const LAT_MAX = 54;

function lonToX(lon) {
  return ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_WIDTH;
}

function latToY(lat) {
  // 翻转 Y 轴（SVG 的 Y 向下）
  return MAP_HEIGHT - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * MAP_HEIGHT;
}

function coordsToPath(coords) {
  if (!coords || coords.length === 0) return '';
  // 简化：每隔 N 个点取一个（减少精度降低文件大小）
  const simplified = coords.length > 200 ? coords.filter((_, i) => i % 3 === 0 || i === coords.length - 1) : coords;
  
  let d = '';
  for (let i = 0; i < simplified.length; i++) {
    const [lon, lat] = simplified[i];
    const x = lonToX(lon).toFixed(2);
    const y = latToY(lat).toFixed(2);
    d += (i === 0 ? 'M ' : ' L ') + x + ',' + y;
  }
  d += ' Z';
  return d;
}

function geometryToPath(geometry) {
  if (!geometry) return '';
  const paths = [];
  
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      const p = coordsToPath(ring);
      if (p) paths.push(p);
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        const p = coordsToPath(ring);
        if (p) paths.push(p);
      }
    }
  }
  
  return paths.join(' ');
}

// 读取所有省份 GeoJSON
const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.geojson'));
console.log(`找到 ${files.length} 个省份文件`);

let svgPaths = '';
let count = 0;

for (const file of files) {
  const content = readFileSync(join(SRC_DIR, file), 'utf8');
  const geojson = JSON.parse(content);
  
  // 获取省份名称
  const name = file.replace('.geojson', '');
  
  // 处理 features
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  
  for (const feature of features) {
    const featureName = feature.properties?.name || name;
    const d = geometryToPath(feature.geometry);
    if (d) {
      svgPaths += `  <path d="${d}" title="${featureName}" id="prov-${count}" />\n`;
      count++;
    }
  }
}

// 组装 SVG
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
${svgPaths}</svg>`;

writeFileSync(OUT_FILE, svg, 'utf8');
const sizeKB = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(0);
console.log(`✅ 生成完毕: ${OUT_FILE}`);
console.log(`   ${count} 个区域, ${sizeKB} KB`);
