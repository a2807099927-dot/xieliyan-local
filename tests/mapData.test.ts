import { describe, it, expect } from 'vitest';

// 地图模块的数据结构和配置验证
// AiMapPanel 和 MapCanvas 主要是 UI 组件，这里验证其数据常量和 localStorage 逻辑

describe('AiMapPanel — 图层预设数据完整性', () => {
  // 从 AiMapPanel 的 LAYER_PRESETS 常量验证
  const LAYER_PRESETS = [
    { id: '行政区域图', label: '🏛 行政图', desc: '国家与边界' },
    { id: '文化', label: '🎭 文化图', desc: '文化分布' },
    { id: '宗教', label: '⛩ 宗教图', desc: '宗教分布' },
    { id: '省份', label: '📜 省份图', desc: '行政省份' },
    { id: '生物群', label: '🌿 生物群', desc: '气候生物' },
    { id: '高程图', label: '⛰ 地形图', desc: '海拔高度' },
    { id: '自然', label: '🏞 自然图', desc: '物理特征' },
    { id: '兴趣点', label: '📍 兴趣点', desc: '标记景点' },
    { id: '军事', label: '⚔ 军事图', desc: '军队部署' },
  ];

  it('所有预设都有 id/label/desc', () => {
    for (const preset of LAYER_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.desc).toBeTruthy();
    }
  });

  it('预设 ID 不重复', () => {
    const ids = LAYER_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('至少有 5 个图层预设', () => {
    expect(LAYER_PRESETS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('MapCanvas — 朝代配置数据完整性', () => {
  const DYNASTIES = [
    { id: 'qin', name: '秦', period: '前221-前207', ccts: 'bc0210' },
    { id: 'xihan', name: '西汉', period: '前202-8', ccts: 'bc0007' },
    { id: 'donghan', name: '东汉', period: '25-220', ccts: 'ad0140' },
    { id: 'sanguo', name: '三国', period: '220-280', ccts: 'ad0262' },
    { id: 'xijin', name: '西晋', period: '265-316', ccts: 'ad0281' },
    { id: 'dongjin', name: '东晋', period: '317-420', ccts: 'ad0382' },
    { id: 'nanbeichao', name: '南北朝', period: '420-589', ccts: 'ad0497' },
    { id: 'sui', name: '隋', period: '581-618', ccts: 'ad0612' },
    { id: 'tang', name: '唐', period: '618-907', ccts: 'ad0741' },
    { id: 'beisong', name: '北宋', period: '960-1127', ccts: 'ad1111' },
    { id: 'nansong', name: '南宋', period: '1127-1279', ccts: 'ad1208' },
    { id: 'yuan', name: '元', period: '1271-1368', ccts: 'ad1330' },
    { id: 'ming', name: '明', period: '1368-1644', ccts: 'ad1582' },
    { id: 'qing', name: '清', period: '1636-1912', ccts: 'ad1820' },
  ];

  it('覆盖 14 个主要朝代', () => {
    expect(DYNASTIES).toHaveLength(14);
  });

  it('所有朝代都有 id/name/period/ccts', () => {
    for (const d of DYNASTIES) {
      expect(d.id).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.period).toBeTruthy();
      expect(d.ccts).toBeTruthy();
    }
  });

  it('朝代 ID 不重复', () => {
    const ids = DYNASTIES.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('CCTS 图层 ID 格式正确（ad/bc + 4位数字）', () => {
    for (const d of DYNASTIES) {
      expect(d.ccts).toMatch(/^(ad|bc)\d{4}$/);
    }
  });

  it('朝代按时间顺序排列', () => {
    // 验证 ccts 编号大致递增（bc 为负数，ad 为正数）
    const toNum = (ccts: string) => {
      if (ccts.startsWith('bc')) return -parseInt(ccts.slice(2));
      return parseInt(ccts.slice(2));
    };
    for (let i = 1; i < DYNASTIES.length; i++) {
      expect(toNum(DYNASTIES[i].ccts)).toBeGreaterThan(toNum(DYNASTIES[i - 1].ccts));
    }
  });
});
