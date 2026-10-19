// chinese-names-patch.js — 中文名称生成补丁（增强版）
// 在 FMG 加载后注入，为 base 11（Chinese）文化提供完整的中文名称支持

(function() {
  "use strict";

  // 中文名称素材库
  const CN = {
    // 国名前缀（气势磅礴）
    statePrefix: [
      '天','玄','苍','紫','青','赤','白','黑','金','银',
      '龙','凤','麒','鹤','虎','狼','鹰','蛟','玉','冰',
      '炎','雷','风','云','霜','月','日','星','灵','幽',
      '冥','圣','神','魔','妖','仙','皇','帝','王','霸',
      '昊','乾','坤','泰','瑞','威','烈','盛','隆','明',
      '暗','沧','浩','煌','曜','璇','琅','瑶','璃','珏'
    ],
    // 国名中缀
    stateMid: [
      '渊','霄','穹','极','域','界','境','土','原','野',
      '川','泽','海','洋','陆','洲','山','岭','谷','峡',
      '阳','阴','华','清','荒','安','宁','平','和','武',
      '文','仁','义','德','礼','信','智','勇','忠','孝'
    ],
    // 国名后缀（政体）
    stateSuffix: [
      '帝国','王国','公国','联邦','汗国','教廷','部落',
      '国','邦','域','朝','盟','府','殿','宗'
    ],
    // 城市前缀
    cityPrefix: [
      '龙','凤','虎','鹤','鹰','麒','玄','天','云','风',
      '雷','火','冰','月','星','日','金','银','玉','翠',
      '碧','紫','赤','苍','青','白','黑','灵','幽','仙',
      '瑶','琼','丹','朱','墨','素','锦','绣','华','明'
    ],
    // 城市后缀
    citySuffix: [
      '城','都','府','关','堡','寨','镇','港','台','阁',
      '殿','宫','塔','楼','庄','营','垒','隘','邑','墟',
      '坊','津','渡','驿','亭','坞','屯','铺','集','市'
    ],
    // 河流前缀
    riverPrefix: [
      '长','大','清','碧','银','金','玄','天','龙','凤',
      '灵','幽','冰','白','青','苍','翠','明','黑','赤',
      '黄','绿','紫','蓝','丹','朱','墨','素','澄','沧'
    ],
    // 河流后缀
    riverSuffix: ['河','江','水','溪','川'],
    // 湖泊前缀
    lakePrefix: [
      '天','月','星','日','龙','凤','碧','银','金','玉',
      '灵','幽','仙','圣','明','清','澄','翠','蓝','镜',
      '瑶','琼','洞','太','西','东','南','北'
    ],
    // 湖泊后缀
    lakeSuffix: ['湖','池','潭','泊','海','泽'],
    // 山脉前缀
    mountainPrefix: [
      '天','昆','太','华','嵩','衡','泰','恒','终','万',
      '千','百','九','五','三','龙','凤','虎','鹤','仙',
      '玄','苍','紫','青','赤','白','黑','金','银','玉'
    ],
    // 山脉后缀
    mountainSuffix: ['山','岭','峰','脉','崖','嶂','巅','顶'],
    // 地区/省份前缀
    regionPrefix: [
      '东','西','南','北','中','上','下','内','外','前',
      '后','左','右','大','小','新','旧','远','近'
    ],
    // 地区/省份后缀
    regionSuffix: ['州','郡','道','路','省','府','县','域','地','原']
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function rnd() { return Math.random(); }

  // 生成中文国名
  window._genChineseStateName = function() {
    if (rnd() < 0.6) {
      // 两字 + 政体：天渊帝国
      return pick(CN.statePrefix) + pick(CN.stateMid) + pick(CN.stateSuffix);
    } else {
      // 单字 + 政体：玄国
      return pick(CN.statePrefix) + pick(CN.stateSuffix);
    }
  };

  // 生成中文城市名
  window._genChineseCityName = function() {
    if (rnd() < 0.6) {
      return pick(CN.cityPrefix) + pick(CN.citySuffix);
    } else {
      return pick(CN.cityPrefix) + pick(CN.stateMid) + pick(CN.citySuffix);
    }
  };

  // 生成中文河流名
  window._genChineseRiverName = function() {
    return pick(CN.riverPrefix) + pick(CN.riverSuffix);
  };

  // 生成中文山脉名
  window._genChineseMountainName = function() {
    return pick(CN.mountainPrefix) + pick(CN.mountainSuffix);
  };

  // 生成中文湖泊名
  window._genChineseLakeName = function() {
    return pick(CN.lakePrefix) + pick(CN.lakeSuffix);
  };

  // 生成中文地区名
  window._genChineseRegionName = function() {
    return pick(CN.regionPrefix) + pick(CN.regionSuffix);
  };

  // 强制设置加载行为为"打开最后保存的地图"
  try {
    localStorage.setItem('onloadBehavior', 'lastSaved');
  } catch(e) {}

  console.log("[FMG中文补丁] 中文名称生成器已加载");
})();
