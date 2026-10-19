// 构建东亚区域底图：中国省级 + 周边国家
// 从 world-map.svg 提取周边国家，和 china-provinces.svg 合并
// 用法: node scripts/build-east-asia-map.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const WORLD_SVG = join(import.meta.dirname, '..', 'public', 'world-map.svg');
const CHINA_SVG = join(import.meta.dirname, '..', 'public', 'china-provinces.svg');
const OUT_FILE = join(import.meta.dirname, '..', 'public', 'east-asia-map.svg');

// 需要保留的周边国家 ID（ISO 2字母代码）
const NEIGHBOR_IDS = new Set([
  'RU', // 俄罗斯
  'MN', // 蒙古
  'KZ', // 哈萨克斯坦
  'KG', // 吉尔吉斯斯坦
  'TJ', // 塔吉克斯坦
  'UZ', // 乌兹别克斯坦
  'TM', // 土库曼斯坦
  'AF', // 阿富汗
  'PK', // 巴基斯坦
  'IN', // 印度
  'NP', // 尼泊尔
  'BT', // 不丹
  'BD', // 孟加拉国
  'MM', // 缅甸
  'LA', // 老挝
  'VN', // 越南
  'TH', // 泰国
  'KH', // 柬埔寨
  'MY', // 马来西亚
  'KP', // 朝鲜
  'KR', // 韩国
  'JP', // 日本
  'TW', // 台湾
  'PH', // 菲律宾
  'ID', // 印度尼西亚
  'IR', // 伊朗
  'IQ', // 伊拉克
  'SA', // 沙特
  'TR', // 土耳其
  'SY', // 叙利亚
]);

// 从世界地图中提取周边国家的 path
const worldSvg = readFileSync(WORLD_SVG, 'utf8');
const pathRegex = /<path\s[^>]*?id="([A-Z]{2})"[^>]*?\/>/gs;
const neighborPaths = [];

let match;
while ((match = pathRegex.exec(worldSvg)) !== null) {
  const id = match[1];
  if (NEIGHBOR_IDS.has(id)) {
    // 提取 title 和 d 属性
    const fullTag = match[0];
    const titleMatch = fullTag.match(/title="([^"]+)"/);
    const dMatch = fullTag.match(/d="([^"]+)"/);
    if (dMatch) {
      const title = titleMatch ? titleMatch[1] : id;
      neighborPaths.push({ id, title, d: dMatch[1] });
    }
  }
}

console.log(`从世界地图提取了 ${neighborPaths.length} 个周边国家`);

// 读取中国省级 SVG 的 path
const chinaSvg = readFileSync(CHINA_SVG, 'utf8');
const chinaPathRegex = /<path\s[^>]*?\/>/gs;
const chinaPaths = [];
let chinaMatch;
while ((chinaMatch = chinaPathRegex.exec(chinaSvg)) !== null) {
  chinaPaths.push(chinaMatch[0]);
}
console.log(`中国省级有 ${chinaPaths.length} 个区域`);

// 世界地图的坐标系和中国省级的坐标系不同，需要统一
// 世界地图: viewBox 基于 mapsvg 的投影，宽 1009.67 高 665.96
// 中国省级: 我们自己的投影，宽 1000 高 800
// 方案：用世界地图的坐标系，把中国从世界地图中去掉，用省级替代
// 但这样坐标不匹配...

// 更简单的方案：直接用世界地图，只保留东亚区域的国家（包括中国整体）
// 然后在前端实现：双击中国时，隐藏中国整体path，显示省级paths
// 这样不需要合并不同坐标系的SVG

// 最终方案：输出一个只包含东亚区域国家的世界地图子集
const MAP_WIDTH = 1009.6727;
const MAP_HEIGHT = 665.96301;

// 也需要保留中国（CN）
const ALL_IDS = new Set([...NEIGHBOR_IDS, 'CN']);

// 重新提取（包含多行 path）
const multilinePathRegex = /<path\s[\s\S]*?id="([A-Z]{2})"\s*\/>/g;
const allPaths = [];
let m2;
// 用更宽松的正则
const svgContent = worldSvg.replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const pathRegex2 = /<path\s+[\s\S]*?id="([A-Z]{2})"\s*\/>/g;

while ((m2 = pathRegex2.exec(svgContent)) !== null) {
  const id = m2[1];
  if (ALL_IDS.has(id)) {
    allPaths.push(m2[0]);
  }
}

console.log(`最终提取了 ${allPaths.length} 个区域`);

// 组装 SVG（使用世界地图的坐标系）
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
${allPaths.join('\n')}
</svg>`;

writeFileSync(OUT_FILE, svg, 'utf8');
const sizeKB = (Buffer.byteLength(svg, 'utf8') / 1024).toFixed(0);
console.log(`✅ 生成完毕: ${OUT_FILE} (${sizeKB} KB)`);
