// 从 world basemaps 数据中提取中国相关政权的精确边界
// 生成到 public/map-data/dynasties/ 目录
import { readFileSync, writeFileSync, existsSync } from 'fs';

const MAP_DIR = 'public/map-data';
const OUT_DIR = 'public/map-data/dynasties';

// 各时期对应的 world basemaps 文件和中国相关政权名称映射
const PERIODS = [
  {
    file: 'world_200.geojson',
    dynasty: { id: 'xihan', name: '西汉', period: '前202-8' },
    entities: [
      { match: 'Han', name: '汉', fullName: '西汉帝国', capital: '长安', color: '#e53935', ruler: '汉高祖→汉武帝' },
      { match: 'Southern Xiongnu', name: '南匈奴', fullName: '南匈奴', capital: '', color: '#bcaaa4', ruler: '' },
      { match: 'Yueban', name: '悦般', fullName: '悦般', capital: '', color: '#a1887f', ruler: '' },
      { match: 'Koguryo', name: '高句丽', fullName: '高句丽', capital: '国内城', color: '#ab47bc', ruler: '' },
      { match: 'Silla', name: '新罗', fullName: '新罗', capital: '金城', color: '#66bb6a', ruler: '' },
      { match: 'Paekche', name: '百济', fullName: '百济', capital: '慰礼城', color: '#42a5f5', ruler: '' },
      { match: 'Hainan', name: '海南', fullName: '海南(珠崖郡)', capital: '', color: '#4db6ac', ruler: '' },
    ]
  },
  {
    file: 'world_600.geojson',
    dynasty: { id: 'sui_tang', name: '隋/唐初', period: '581-700' },
    entities: [
      { match: 'Tang', name: '唐', fullName: '唐帝国', capital: '长安', color: '#e53935', ruler: '唐太宗→唐高宗' },
      { match: 'Turk', name: '突厥', fullName: '突厥汗国', capital: '', color: '#78909c', ruler: '' },
      { match: 'Tibet', name: '吐蕃', fullName: '吐蕃', capital: '逻些(拉萨)', color: '#8d6e63', ruler: '' },
      { match: 'Koguryo', name: '高句丽', fullName: '高句丽', capital: '平壤', color: '#ab47bc', ruler: '' },
      { match: 'Silla', name: '新罗', fullName: '新罗', capital: '金城', color: '#66bb6a', ruler: '' },
      { match: 'Paekche', name: '百济', fullName: '百济', capital: '泗沘', color: '#42a5f5', ruler: '' },
      { match: 'Nanzhao', name: '南诏', fullName: '南诏', capital: '大理', color: '#ffca28', ruler: '' },
      { match: 'Khmer', name: '真腊', fullName: '真腊', capital: '', color: '#4db6ac', ruler: '' },
    ]
  },
  {
    file: 'world_1000.geojson',
    dynasty: { id: 'beisong_data', name: '北宋', period: '960-1127' },
    entities: [
      { match: 'Song', name: '宋', fullName: '北宋', capital: '开封', color: '#e53935', ruler: '宋太祖→宋徽宗' },
      { match: 'Liao', name: '辽', fullName: '辽(契丹)', capital: '上京', color: '#546e7a', ruler: '耶律氏' },
      { match: 'Tibet', name: '吐蕃', fullName: '吐蕃诸部', capital: '', color: '#8d6e63', ruler: '' },
      { match: 'Dali', name: '大理', fullName: '大理国', capital: '大理', color: '#ffca28', ruler: '段氏' },
      { match: 'Tangut', name: '西夏', fullName: '西夏', capital: '兴庆', color: '#ff7043', ruler: '李元昊' },
      { match: 'Xia', name: '西夏', fullName: '西夏', capital: '兴庆', color: '#ff7043', ruler: '李元昊' },
      { match: 'Korea', name: '高丽', fullName: '高丽', capital: '开京', color: '#ab47bc', ruler: '' },
      { match: 'Koryo', name: '高丽', fullName: '高丽', capital: '开京', color: '#ab47bc', ruler: '' },
      { match: 'Viet', name: '大越', fullName: '大越(李朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
      { match: 'Dai Viet', name: '大越', fullName: '大越(李朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
      { match: 'Japan', name: '日本', fullName: '日本', capital: '京都', color: '#f06292', ruler: '' },
      { match: 'Khmer', name: '高棉', fullName: '高棉帝国', capital: '吴哥', color: '#4db6ac', ruler: '' },
    ]
  },
  {
    file: 'world_1300.geojson',
    dynasty: { id: 'yuan_data', name: '元', period: '1271-1368' },
    entities: [
      { match: 'Yuan', name: '元', fullName: '元帝国', capital: '大都(北京)', color: '#546e7a', ruler: '忽必烈→元顺帝' },
      { match: 'Mongol', name: '蒙古', fullName: '蒙古帝国', capital: '大都', color: '#546e7a', ruler: '' },
      { match: 'Chagatai', name: '察合台', fullName: '察合台汗国', capital: '', color: '#78909c', ruler: '' },
      { match: 'Golden', name: '金帐', fullName: '金帐汗国', capital: '', color: '#bcaaa4', ruler: '' },
      { match: 'Ilkhan', name: '伊尔', fullName: '伊尔汗国', capital: '', color: '#a1887f', ruler: '' },
      { match: 'Korea', name: '高丽', fullName: '高丽(元附庸)', capital: '开京', color: '#ab47bc', ruler: '' },
      { match: 'Koryo', name: '高丽', fullName: '高丽(元附庸)', capital: '开京', color: '#ab47bc', ruler: '' },
      { match: 'Japan', name: '日本', fullName: '日本', capital: '京都', color: '#f06292', ruler: '' },
      { match: 'Dai Viet', name: '大越', fullName: '大越(陈朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
      { match: 'Viet', name: '大越', fullName: '大越(陈朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
      { match: 'Khmer', name: '高棉', fullName: '高棉帝国', capital: '吴哥', color: '#4db6ac', ruler: '' },
      { match: 'Sukhothai', name: '素可泰', fullName: '素可泰', capital: '', color: '#ffca28', ruler: '' },
    ]
  },
  {
    file: 'world_1500.geojson',
    dynasty: { id: 'ming_data', name: '明', period: '1368-1644' },
    entities: [
      { match: 'Ming', name: '明', fullName: '明帝国', capital: '北京', color: '#e53935', ruler: '明太祖→明思宗' },
      { match: 'Mongol', name: '蒙古', fullName: '北元/鞑靼', capital: '', color: '#78909c', ruler: '' },
      { match: 'Oirat', name: '瓦剌', fullName: '瓦剌', capital: '', color: '#bcaaa4', ruler: '' },
      { match: 'Tibet', name: '乌斯藏', fullName: '乌斯藏', capital: '拉萨', color: '#8d6e63', ruler: '' },
      { match: 'Korea', name: '朝鲜', fullName: '朝鲜(李朝)', capital: '汉城', color: '#ab47bc', ruler: '' },
      { match: 'Choson', name: '朝鲜', fullName: '朝鲜(李朝)', capital: '汉城', color: '#ab47bc', ruler: '' },
      { match: 'Japan', name: '日本', fullName: '日本(室町)', capital: '京都', color: '#f06292', ruler: '' },
      { match: 'Dai Viet', name: '大越', fullName: '大越(黎朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
      { match: 'Viet', name: '大越', fullName: '大越(黎朝)', capital: '升龙', color: '#66bb6a', ruler: '' },
    ]
  },
  {
    file: 'world_1800.geojson',
    dynasty: { id: 'qing_data', name: '清', period: '1636-1912' },
    entities: [
      { match: 'Qing', name: '清', fullName: '清帝国', capital: '北京', color: '#ffca28', ruler: '康熙→乾隆→宣统' },
      { match: 'China', name: '清', fullName: '清帝国', capital: '北京', color: '#ffca28', ruler: '' },
      { match: 'Korea', name: '朝鲜', fullName: '朝鲜(李朝)', capital: '汉城', color: '#ab47bc', ruler: '' },
      { match: 'Choson', name: '朝鲜', fullName: '朝鲜(李朝)', capital: '汉城', color: '#ab47bc', ruler: '' },
      { match: 'Japan', name: '日本', fullName: '日本(江户)', capital: '江户', color: '#f06292', ruler: '德川幕府' },
      { match: 'Viet', name: '越南', fullName: '越南(阮朝)', capital: '顺化', color: '#66bb6a', ruler: '' },
      { match: 'Russia', name: '俄罗斯', fullName: '俄罗斯帝国', capital: '圣彼得堡', color: '#546e7a', ruler: '' },
      { match: 'Burma', name: '缅甸', fullName: '缅甸(贡榜)', capital: '', color: '#4db6ac', ruler: '' },
      { match: 'Siam', name: '暹罗', fullName: '暹罗', capital: '曼谷', color: '#ff7043', ruler: '' },
    ]
  },
];

// 东亚区域边界框（用于过滤）
const EAST_ASIA_BBOX = { minLon: 70, maxLon: 145, minLat: 15, maxLat: 55 };

function isInEastAsia(feature) {
  // 简单检查：feature 的任意坐标点是否在东亚范围内
  const coords = feature.geometry.type === 'MultiPolygon' 
    ? feature.geometry.coordinates.flat(2)
    : feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates.flat(1)
    : [];
  
  return coords.some(([lon, lat]) => 
    lon >= EAST_ASIA_BBOX.minLon && lon <= EAST_ASIA_BBOX.maxLon &&
    lat >= EAST_ASIA_BBOX.minLat && lat <= EAST_ASIA_BBOX.maxLat
  );
}

function simplifyCoords(coords, tolerance = 0.5) {
  // 简单的 Douglas-Peucker 简化（减少点数但保持形状）
  if (coords.length <= 10) return coords;
  
  // 每隔 N 个点取一个（粗暴但有效）
  const step = Math.max(1, Math.floor(coords.length / 150));
  const result = [];
  for (let i = 0; i < coords.length; i += step) {
    result.push(coords[i].map(v => Math.round(v * 10) / 10));
  }
  // 确保闭合
  if (result.length > 0 && (result[0][0] !== result[result.length-1][0] || result[0][1] !== result[result.length-1][1])) {
    result.push(result[0]);
  }
  return result;
}

for (const period of PERIODS) {
  const filePath = `${MAP_DIR}/${period.file}`;
  if (!existsSync(filePath)) {
    console.log(`SKIP: ${period.file} not found`);
    continue;
  }

  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const features = [];
  const matched = new Set();

  for (const entity of period.entities) {
    // 查找匹配的 feature
    const found = data.features.filter(f => {
      const name = f.properties?.NAME || '';
      return name.toLowerCase().includes(entity.match.toLowerCase()) && isInEastAsia(f);
    });

    if (found.length === 0) {
      // 尝试更宽松的匹配
      const looseFound = data.features.filter(f => {
        const name = f.properties?.NAME || '';
        return name.toLowerCase() === entity.match.toLowerCase();
      });
      if (looseFound.length > 0) {
        found.push(...looseFound.filter(isInEastAsia));
      }
    }

    for (const f of found) {
      const key = JSON.stringify(f.geometry).substring(0, 100);
      if (matched.has(key)) continue;
      matched.add(key);

      // 简化坐标
      let geometry;
      if (f.geometry.type === 'MultiPolygon') {
        geometry = {
          type: 'MultiPolygon',
          coordinates: f.geometry.coordinates.map(poly => 
            poly.map(ring => simplifyCoords(ring))
          )
        };
      } else if (f.geometry.type === 'Polygon') {
        geometry = {
          type: 'Polygon',
          coordinates: f.geometry.coordinates.map(ring => simplifyCoords(ring))
        };
      } else {
        geometry = f.geometry;
      }

      features.push({
        type: 'Feature',
        properties: {
          name: entity.name,
          fullName: entity.fullName,
          capital: entity.capital,
          phase: 'early',
          color: entity.color,
          ruler: entity.ruler,
        },
        geometry,
      });
    }

    if (found.length > 0) {
      console.log(`  ✓ ${entity.name} (${entity.match}): ${found.length} feature(s)`);
    } else {
      console.log(`  ✗ ${entity.name} (${entity.match}): NOT FOUND`);
    }
  }

  if (features.length > 0) {
    const output = {
      type: 'FeatureCollection',
      meta: {
        dynasty: period.dynasty.name,
        period: period.dynasty.period,
        phases: [{ id: 'early', name: `${period.dynasty.name} (${period.dynasty.period})`, description: '' }],
      },
      features,
    };

    const outPath = `${OUT_DIR}/${period.dynasty.id}.geojson`;
    writeFileSync(outPath, JSON.stringify(output));
    console.log(`✓ ${period.dynasty.name}: ${features.length} features → ${outPath}`);
  } else {
    console.log(`✗ ${period.dynasty.name}: no features found`);
  }
}

console.log('\nDone!');
