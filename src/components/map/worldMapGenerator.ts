// worldMapGenerator.ts — 随机生成架空世界 SVG 地图
// 包含：大陆轮廓、山脉、河流、森林、沙漠、城市、势力色块

interface Region {
 name: string;
 color: string;
 cx: number;
 cy: number;
 points: [number, number][];
}

interface City {
 name: string;
 x: number;
 y: number;
 capital?: boolean;
}

interface Mountain {
 points: [number, number][];
}

interface River {
 points: [number, number][];
}

// 题材对应的命名风格
const NAMING: Record<string, { regions: string[]; cities: string[]; mountains: string[]; rivers: string[] }> = {
 xuanhuan: {
 regions: ['天玄域', '地煞域', '苍穹域', '幽冥域', '太虚域', '混沌域', '紫霄域', '九幽域'],
 cities: ['天都城', '万剑宗', '炼丹阁', '星辰殿', '龙渊城', '凤鸣谷', '雷霆峰', '玄天府', '碧落城', '紫云宫', '太初城', '混元殿', '青云门', '赤焰堡', '冰魄宫', '幽冥城'],
 mountains: ['万仞山脉', '天柱山', '昆仑墟', '不周山', '须弥山'],
 rivers: ['天河', '忘川', '弱水', '黄泉'],
 },
 xianxia: {
 regions: ['东胜神洲', '西牛贺洲', '南瞻部洲', '北俱芦洲', '中央仙域', '蓬莱仙境', '昆仑仙山', '瑶池圣地'],
 cities: ['蓬莱仙宫', '昆仑道宫', '瑶池圣殿', '紫霄宫', '兜率天宫', '灵台方寸', '花果山', '火焰山城', '通天河畔', '流沙城', '女儿国', '朱紫国', '乌鸡国', '车迟国', '比丘国', '灭法国'],
 mountains: ['昆仑仙山', '蓬莱仙岛', '方丈山', '瀛洲', '十洲三岛'],
 rivers: ['天河', '通天河', '流沙河', '子母河'],
 },
 lishi: {
 regions: ['中原', '关中', '江南', '塞北', '西域', '岭南', '巴蜀', '辽东'],
 cities: ['长安', '洛阳', '金陵', '临安', '开封', '邺城', '成都', '襄阳', '荆州', '幽州', '凉州', '益州', '扬州', '徐州', '青州', '并州'],
 mountains: ['秦岭', '太行山', '昆仑山', '天山', '祁连山'],
 rivers: ['大河', '长江', '淮水', '汉水'],
 },
 xifan: {
 regions: ['北境王国', '精灵森林', '矮人山脉', '南方帝国', '东方联盟', '暗影之地', '龙裔高原', '海盗群岛'],
 cities: ['王都', '精灵港', '铁炉堡', '暴风城', '银月城', '达拉然', '奥格瑞玛', '雷霆崖', '幽暗城', '藏宝海湾', '黑石塔', '冰冠堡垒', '风暴要塞', '沙塔斯', '永歌森林', '洛丹伦'],
 mountains: ['孤峰山脉', '灰色山脉', '迷雾山脉', '红角山', '白霜峰'],
 rivers: ['银河', '安度因河', '冰封之河', '熔岩之河'],
 },
 mohuan: {
 regions: ['光明圣域', '黑暗深渊', '混沌边境', '亡灵荒原', '恶魔领地', '天使之城', '龙族领地', '精灵密林'],
 cities: ['圣光之城', '暗影堡垒', '亡灵要塞', '恶魔王座', '天使圣殿', '龙巢', '世界树', '深渊之门', '炼狱之城', '净土圣地', '血色修道院', '黑暗神殿', '冰封王座', '燃烧平原', '永恒之井', '时光之穴'],
 mountains: ['末日火山', '冰封山脉', '暗影山', '圣光之巅', '深渊裂谷'],
 rivers: ['冥河', '圣光之泉', '血河', '毒沼'],
 },
 kehuan: {
 regions: ['联邦核心区', '边境殖民地', '自由贸易区', '军事禁区', '资源开采带', '科研特区', '流放星域', '未知区域'],
 cities: ['新纪元城', '星港Alpha', '殖民地Beta', '前哨站Gamma', '空间站Delta', '矿业城Epsilon', '学院城Zeta', '军事基地Eta', '贸易港Theta', '避难所Iota', '实验室Kappa', '监狱Lambda', '工厂Mu', '农业区Nu', '能源站Xi', '通讯塔Omicron'],
 mountains: ['陨石坑山脉', '冰晶高原', '熔岩地带', '辐射荒原', '水晶峡谷'],
 rivers: ['地下水脉', '冰川融流', '化学溪', '能量管道'],
 },
 wuxia: {
 regions: ['中原武林', '西域', '南疆', '北漠', '东海', '蜀中', '关外', '江南'],
 cities: ['少林寺', '武当山', '峨眉派', '华山派', '丐帮总舵', '明教光明顶', '天山灵鹫宫', '大理段氏', '桃花岛', '绝情谷', '铁掌帮', '星宿派', '逍遥派', '全真教', '古墓派', '血刀门'],
 mountains: ['华山', '嵩山', '武当山', '峨眉山', '昆仑山'],
 rivers: ['长江', '黄河', '洞庭湖', '太湖'],
 },
 mori: {
 regions: ['安全区', '辐射区', '变异兽领地', '废墟城市', '地下避难所', '军阀领地', '荒野', '死亡之地'],
 cities: ['避难所01', '前哨基地', '交易镇', '铁壁城', '废墟市场', '地下城', '军营', '科研站', '净水厂', '农场据点', '弹药库', '医疗站', '通讯塔', '发电站', '防御工事', '观察哨'],
 mountains: ['断裂山脉', '辐射高地', '废墟丘陵', '毒雾山', '焦土岭'],
 rivers: ['污染河', '地下暗河', '酸雨溪', '净水源'],
 },
};

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max)); }
function pick<T>(arr: T[]): T { return arr[randInt(0, arr.length)]; }
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 生成不规则多边形（模拟大陆/区域轮廓）
function generateBlob(cx: number, cy: number, radius: number, points: number = 12): [number, number][] {
 const result: [number, number][] = [];
 for (let i = 0; i < points; i++) {
 const angle = (i / points) * Math.PI * 2;
 const r = radius * (0.6 + Math.random() * 0.8);
 result.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
 }
 return result;
}

// 生成山脉路径
function generateMountainPath(x1: number, y1: number, x2: number, y2: number): [number, number][] {
 const points: [number, number][] = [];
 const steps = randInt(8, 15);
 for (let i = 0; i <= steps; i++) {
 const t = i / steps;
 const x = x1 + (x2 - x1) * t + rand(-15, 15);
 const y = y1 + (y2 - y1) * t + rand(-15, 15);
 points.push([x, y]);
 }
 return points;
}

// 生成河流路径（更弯曲）
function generateRiverPath(x1: number, y1: number, x2: number, y2: number): [number, number][] {
 const points: [number, number][] = [];
 const steps = randInt(12, 20);
 for (let i = 0; i <= steps; i++) {
 const t = i / steps;
 const x = x1 + (x2 - x1) * t + rand(-25, 25) * Math.sin(t * Math.PI);
 const y = y1 + (y2 - y1) * t + rand(-20, 20) * Math.cos(t * Math.PI * 2);
 points.push([x, y]);
 }
 return points;
}

// 多边形转 SVG path
function polyToPath(points: [number, number][]): string {
 if (points.length < 3) return '';
 return `M${points[0][0]},${points[0][1]} ` + points.slice(1).map(p => `L${p[0]},${p[1]}`).join(' ') + ' Z';
}

// 点序列转平滑曲线
function pointsToSmoothPath(points: [number, number][]): string {
 if (points.length < 2) return '';
 let d = `M${points[0][0]},${points[0][1]}`;
 for (let i = 1; i < points.length; i++) {
 const prev = points[i - 1];
 const curr = points[i];
 const mx = (prev[0] + curr[0]) / 2;
 const my = (prev[1] + curr[1]) / 2;
 d += ` Q${prev[0]},${prev[1]} ${mx},${my}`;
 }
 const last = points[points.length - 1];
 d += ` L${last[0]},${last[1]}`;
 return d;
}

export function generateWorldMap(genreId: string): string {
 const W = 900, H = 600;
 const naming = NAMING[genreId] || NAMING.xuanhuan;
 
 // 生成 5-8 个区域
 const regionCount = randInt(5, 9);
 const regionNames = shuffle(naming.regions).slice(0, regionCount);
 const colors = ['#e8d4a0', '#c5e0b4', '#b4d7e8', '#e8b4b4', '#d4b4e8', '#e8e0b4', '#b4e8d4', '#e8c4a0'];
 
 const regions: Region[] = [];
 const gridCols = Math.ceil(Math.sqrt(regionCount));
 const gridRows = Math.ceil(regionCount / gridCols);
 const cellW = (W - 100) / gridCols;
 const cellH = (H - 80) / gridRows;
 
 for (let i = 0; i < regionCount; i++) {
 const col = i % gridCols;
 const row = Math.floor(i / gridCols);
 const cx = 60 + col * cellW + cellW / 2 + rand(-20, 20);
 const cy = 50 + row * cellH + cellH / 2 + rand(-15, 15);
 const radius = Math.min(cellW, cellH) * 0.4 + rand(-10, 10);
 regions.push({
 name: regionNames[i] || `未知之地${i}`,
 color: colors[i % colors.length],
 cx, cy,
 points: generateBlob(cx, cy, radius, randInt(8, 14)),
 });
 }

 // 生成城市（每个区域 1-3 个）
 const cityNames = shuffle(naming.cities);
 const cities: City[] = [];
 let cityIdx = 0;
 regions.forEach((r, ri) => {
 const count = randInt(1, 4);
 for (let i = 0; i < count && cityIdx < cityNames.length; i++) {
 cities.push({
 name: cityNames[cityIdx++],
 x: r.cx + rand(-40, 40),
 y: r.cy + rand(-30, 30),
 capital: i === 0 && ri === 0,
 });
 }
 });

 // 生成山脉（2-4 条）
 const mountainCount = randInt(2, 5);
 const mountains: Mountain[] = [];
 for (let i = 0; i < mountainCount; i++) {
 const x1 = rand(50, W - 50);
 const y1 = rand(50, H - 50);
 const angle = rand(0, Math.PI * 2);
 const len = rand(100, 250);
 mountains.push({ points: generateMountainPath(x1, y1, x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len) });
 }

 // 生成河流（2-4 条）
 const riverCount = randInt(2, 5);
 const rivers: River[] = [];
 for (let i = 0; i < riverCount; i++) {
 const x1 = rand(100, W - 100);
 const y1 = rand(30, 100);
 const x2 = rand(100, W - 100);
 const y2 = rand(H - 100, H - 30);
 rivers.push({ points: generateRiverPath(x1, y1, x2, y2) });
 }

 // 构建 SVG
 let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;max-width:900px;">`;
 
 // 背景（海洋）
 svg += `<rect width="${W}" height="${H}" fill="#a8d4e6" rx="8"/>`;
 
 // 大陆底色
 const continentPoints = generateBlob(W / 2, H / 2, Math.min(W, H) * 0.42, 20);
 svg += `<path d="${polyToPath(continentPoints)}" fill="#f5eed6" stroke="#c9b896" stroke-width="2"/>`;

 // 区域色块
 regions.forEach(r => {
 svg += `<path d="${polyToPath(r.points)}" fill="${r.color}" fill-opacity="0.6" stroke="${r.color.replace(/[a-f0-9]{2}$/i, '80')}" stroke-width="1.5"/>`;
 });

 // 山脉
 mountains.forEach(m => {
 svg += `<path d="${pointsToSmoothPath(m.points)}" fill="none" stroke="#8B7355" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
 // 山峰符号
 m.points.filter((_, i) => i % 3 === 0).forEach(([x, y]) => {
 svg += `<polygon points="${x},${y - 8} ${x - 5},${y + 2} ${x + 5},${y + 2}" fill="#8B7355" opacity="0.6"/>`;
 });
 });

 // 河流
 rivers.forEach(r => {
 svg += `<path d="${pointsToSmoothPath(r.points)}" fill="none" stroke="#4a90d9" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`;
 });

 // 森林点缀（随机散布）
 for (let i = 0; i < randInt(15, 30); i++) {
 const x = rand(80, W - 80);
 const y = rand(80, H - 80);
 svg += `<circle cx="${x}" cy="${y}" r="${rand(3, 6)}" fill="#4a8c3f" opacity="0.4"/>`;
 }

 // 区域名称
 regions.forEach(r => {
 svg += `<text x="${r.cx}" y="${r.cy}" text-anchor="middle" font-size="11" font-weight="bold" fill="#4a3520" opacity="0.8">${r.name}</text>`;
 });

 // 城市标注
 cities.forEach(c => {
 const size = c.capital ? 5 : 3;
 const color = c.capital ? '#c0392b' : '#2c3e50';
 svg += `<circle cx="${c.x}" cy="${c.y}" r="${size}" fill="${color}" stroke="white" stroke-width="1"/>`;
 svg += `<text x="${c.x}" y="${c.y + size + 10}" text-anchor="middle" font-size="${c.capital ? 9 : 7}" fill="${color}" font-weight="${c.capital ? 'bold' : 'normal'}">${c.name}</text>`;
 });

 // 山脉名称
 const mountainNames = shuffle(naming.mountains);
 mountains.forEach((m, i) => {
 if (i < mountainNames.length) {
 const mid = m.points[Math.floor(m.points.length / 2)];
 svg += `<text x="${mid[0]}" y="${mid[1] - 12}" text-anchor="middle" font-size="8" fill="#5c4033" font-style="italic">${mountainNames[i]}</text>`;
 }
 });

 // 河流名称
 const riverNames = shuffle(naming.rivers);
 rivers.forEach((r, i) => {
 if (i < riverNames.length) {
 const mid = r.points[Math.floor(r.points.length / 2)];
 svg += `<text x="${mid[0] + 10}" y="${mid[1]}" text-anchor="start" font-size="7" fill="#2980b9" font-style="italic">${riverNames[i]}</text>`;
 }
 });

 // 指南针
 svg += `<g transform="translate(${W - 45}, 35)">`;
 svg += `<circle cx="0" cy="0" r="15" fill="white" fill-opacity="0.8" stroke="#666" stroke-width="0.5"/>`;
 svg += `<polygon points="0,-12 3,0 -3,0" fill="#c0392b"/>`;
 svg += `<polygon points="0,12 3,0 -3,0" fill="#333"/>`;
 svg += `<text x="0" y="-14" text-anchor="middle" font-size="6" fill="#c0392b">N</text>`;
 svg += `</g>`;

 // 标题
 const genreLabel = { xuanhuan: '玄幻', xianxia: '仙侠', lishi: '历史架空', xifan: '西幻', mohuan: '魔幻', kehuan: '科幻', wuxia: '武侠', mori: '末日' }[genreId] || '架空';
 svg += `<text x="${W / 2}" y="25" text-anchor="middle" font-size="14" font-weight="bold" fill="#2c3e50">${genreLabel}世界地图</text>`;

 svg += '</svg>';
 return svg;
}
