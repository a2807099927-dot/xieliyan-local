// 将中国省级 GeoJSON 转换为世界地图坐标系的 SVG paths
// 然后和东亚周边国家合并成一张完整的"中国省级+周边"底图
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(import.meta.dirname, '..', '地图素材', 'china_geojson-master', '省');
const EAST_ASIA_SVG = join(import.meta.dirname, '..', 'public', 'east-asia-map.svg');
const OUT_FILE = join(import.meta.dirname, '..', 'public', 'china-detail-map.svg');

// 世界地图的投影参数（从 geoViewBox 提取）
const GEO_LON_MIN = -169.110266;
const GEO_LON_MAX = 190.486279;
const GEO_LAT_MAX = 83.600842;  // 顶部纬度
const GEO_LAT_MIN = -58.508473; // 底部纬度
const MAP_WIDTH = 1009.6727;
const MAP_HEIGHT = 665.96301;

// 经纬度 → 世界地图 SVG 坐标
function lonToX(lon) {
  return ((lon - GEO_LON_MIN) / (GEO_LON_MAX - GEO_LON_MIN)) * MAP_WIDTH;
}
function latToY(lat) {
  // 纬度从上到下递减
  return ((GEO_LAT_MAX - lat) / (GEO_LAT_MAX - GEO_LAT_MIN)) * MAP_HEIGHT;
}

function coordsToPath(coords) {
  if (!coords || coords.length === 0) return '';
  const step = coords.length > 200 ? 4 : coords.length > 100 ? 2 : 1;
  let d = '';
  for (let i = 0; i < coords.length; i += step) {
    const [lon, lat] = coords[i];
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

// 读取东亚底图（周边国家），去掉中国整体（CN）
const eastAsiaSvg = readFileSync(EAST_ASIA_SVG, 'utf8');
// 提取所有非中国的 path
const neighborPathsRaw = [];
const pathRegex = /<path\s[\s\S]*?id="([A-Z]{2})"\s*\/>/g;
let m;
while ((m = pathRegex.exec(eastAsiaSvg)) !== null) {
  if (m[1] !== 'CN') {
    neighborPathsRaw.push(m[0]);
  }
}
console.log(`周边国家: ${neighborPathsRaw.length} 个`);

// 读取中国省级 GeoJSON，转换为世界地图坐标系
const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.geojson'));
const chinaPaths = [];

for (const file of files) {
  const content = readFileSync(join(SRC_DIR, file), 'utf8');
  const geojson = JSON.parse(content);
  const name = file.replace('.geojson', '');
  const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  
  for (const feature of features) {
    const featureName = feature.properties?.name || name;
    const d = geometryToPath(feature.geometry);
    if (d) {
      chinaPaths.push(`  <path d="${d}" title="${featureName}" id="prov-${chinaPaths.length}" class="china-province" />`);
    }
  }
}
console.log(`中国省级: ${chinaPaths.length} 个`);

// 合并输出
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
<!-- 周边国家（背景） -->
<g id="neighbors">
${neighborPathsRaw.join('\n')}
</g>
<!-- 中国省级（可交互） -->
<g id="china-provinces">
${chinaPaths.join('\n')}
</g>
</svg>`;

writeFileSync(OUT_FILE, svg, 'utf8');
const sizeKB = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(0);
console.log(`✅ 生成完毕: ${OUT_FILE} (${sizeKB} KB)`);
