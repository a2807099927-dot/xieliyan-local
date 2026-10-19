// 将市级 GeoJSON 数据转换为精简 SVG 文件
// 用法: node scripts/geojson-cities-to-svg.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(import.meta.dirname, '..', '地图素材', 'china_geojson-master', '市');
const OUT_FILE = join(import.meta.dirname, '..', 'public', 'china-cities.svg');

// 投影参数（和省级一致）
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
  return MAP_HEIGHT - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * MAP_HEIGHT;
}

function coordsToPath(coords) {
  if (!coords || coords.length === 0) return '';
  // 更激进的简化：每隔5个点取一个（市级数据量大，需要更多压缩）
  const step = coords.length > 100 ? 5 : coords.length > 50 ? 3 : 1;
  let d = '';
  for (let i = 0; i < coords.length; i += step) {
    const [lon, lat] = coords[i];
    const x = lonToX(lon).toFixed(1);
    const y = latToY(lat).toFixed(1);
    d += (i === 0 ? 'M ' : ' L ') + x + ',' + y;
  }
  // 确保闭合
  const [lon0, lat0] = coords[0];
  d += ' L ' + lonToX(lon0).toFixed(1) + ',' + latToY(lat0).toFixed(1) + ' Z';
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

// 读取所有市级 GeoJSON
const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.geojson'));
console.log(`找到 ${files.length} 个市级文件`);

let svgPaths = '';
let count = 0;

for (const file of files) {
  try {
    const content = readFileSync(join(SRC_DIR, file), 'utf8');
    const geojson = JSON.parse(content);
    const name = file.replace('.geojson', '');
    const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
    
    for (const feature of features) {
      const featureName = feature.properties?.NAME || feature.properties?.name || name;
      const d = geometryToPath(feature.geometry);
      if (d) {
        svgPaths += `  <path d="${d}" title="${featureName}" id="city-${count}" />\n`;
        count++;
      }
    }
  } catch (err) {
    // 跳过解析失败的文件
    console.warn(`  跳过: ${file} (${err.message})`);
  }
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
${svgPaths}</svg>`;

writeFileSync(OUT_FILE, svg, 'utf8');
const sizeKB = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(0);
console.log(`✅ 生成完毕: ${OUT_FILE}`);
console.log(`   ${count} 个区域, ${sizeKB} KB`);
