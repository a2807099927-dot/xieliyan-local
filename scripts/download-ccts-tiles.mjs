// 下载中研院 CCTS 历史地图瓦片到桌面
import https from 'https';
import fs from 'fs';
import path from 'path';

const DESKTOP = path.join(process.env.USERPROFILE || '', 'Desktop', 'CCTS历史地图瓦片');
const BASE_URL = 'https://gis.sinica.edu.tw/ccts/file-exists.php?img=';

// 要下载的朝代图层
const LAYERS = [
  { id: 'spring_autumn', name: '春秋' },
  { id: 'warring_states', name: '战国' },
  { id: 'bc0210', name: '秦' },
  { id: 'bc0007', name: '西汉' },
  { id: 'ad0140', name: '东汉' },
  { id: 'ad0262', name: '三国' },
  { id: 'ad0281', name: '西晋' },
  { id: 'ad0382', name: '东晋' },
  { id: 'ad0497', name: '南北朝' },
  { id: 'ad0612', name: '隋' },
  { id: 'ad0741', name: '唐' },
  { id: 'ad1111', name: '北宋' },
  { id: 'ad1208', name: '南宋' },
  { id: 'ad1330', name: '元' },
  { id: 'ad1582', name: '明' },
];

// 中国区域的瓦片范围（经度 70-140, 纬度 15-55）
function getTileRange(zoom) {
  // 经纬度转瓦片坐标
  function lonToTile(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function latToTile(lat, z) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }
  
  return {
    xMin: lonToTile(70, zoom),
    xMax: lonToTile(140, zoom),
    yMin: latToTile(55, zoom),
    yMax: latToTile(15, zoom),
  };
}

function downloadTile(url, filePath) {
  return new Promise((resolve) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) { resolve(false); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        // 只保存有实际内容的瓦片（>200字节，排除空白/错误瓦片）
        if (buf.length > 200) {
          fs.writeFileSync(filePath, buf);
          resolve(true);
        } else {
          resolve(false);
        }
      });
    }).on('error', () => resolve(false));
  });
}

async function downloadLayer(layer, zooms = [3, 4, 5, 6, 7]) {
  const layerDir = path.join(DESKTOP, `${layer.name}_${layer.id}`);
  console.log(`\n📥 下载: ${layer.name} (${layer.id})`);
  
  let total = 0, downloaded = 0;
  
  for (const z of zooms) {
    const range = getTileRange(z);
    const zDir = path.join(layerDir, String(z));
    
    for (let x = range.xMin; x <= range.xMax; x++) {
      for (let y = range.yMin; y <= range.yMax; y++) {
        total++;
        const url = `${BASE_URL}${layer.id}-png-${z}-${x}-${y}`;
        const filePath = path.join(zDir, `${x}_${y}.png`);
        
        if (fs.existsSync(filePath)) { downloaded++; continue; }
        
        const ok = await downloadTile(url, filePath);
        if (ok) downloaded++;
        
        // 限速：每个请求间隔 50ms
        await new Promise(r => setTimeout(r, 50));
      }
    }
    console.log(`  zoom ${z}: ${downloaded}/${total} tiles`);
  }
  
  console.log(`  ✓ ${layer.name} 完成: ${downloaded} tiles saved`);
  return downloaded;
}

async function main() {
  if (!fs.existsSync(DESKTOP)) fs.mkdirSync(DESKTOP, { recursive: true });
  console.log(`保存目录: ${DESKTOP}`);
  console.log(`朝代数量: ${LAYERS.length}`);
  console.log(`缩放级别: 3-7`);
  console.log('开始下载...\n');
  
  let totalTiles = 0;
  for (const layer of LAYERS) {
    const count = await downloadLayer(layer);
    totalTiles += count;
  }
  
  console.log(`\n✅ 全部完成! 共下载 ${totalTiles} 个瓦片到 ${DESKTOP}`);
}

main().catch(console.error);
