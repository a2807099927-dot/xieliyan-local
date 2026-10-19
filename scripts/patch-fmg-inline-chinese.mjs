// 直接在 names-generator.js 里内联中文名称生成，不依赖外部文件
import { readFileSync, writeFileSync } from 'fs';

const file = 'public/fmg/modules/names-generator.js';
let c = readFileSync(file, 'utf8');

// 中文名称生成代码（内联到文件顶部）
const chineseBlock = `
// ===== 中文名称内联生成器 =====
const _CN_P = ['天','玄','苍','紫','青','赤','白','黑','金','银','龙','凤','虎','鹤','鹰','玉','冰','炎','雷','风','云','霜','月','星','灵','幽','圣','神','皇','霸','昊','乾','坤','泰','瑞','威','烈','盛','隆','明','暗'];
const _CN_M = ['渊','霄','穹','极','域','界','境','原','野','川','泽','海','陆','洲','山','岭','谷','阳','阴','华','清','荒','安','宁','平','和','武','文','仁','义'];
const _CN_SS = ['帝国','王国','公国','汗国','教国','联盟','部落','国','邦','朝','盟'];
const _CN_CS = ['城','都','府','关','堡','寨','镇','港','台','阁','殿','宫','塔','楼','庄','营','垒','隘','邑','墟'];
function _cnPick(a){return a[Math.floor(Math.random()*a.length)];}
function _cnGenState(){return _cnPick(_CN_P)+_cnPick(_CN_M)+_cnPick(_CN_SS);}
function _cnGenCity(){return _cnPick(_CN_P)+_cnPick(_CN_CS);}
function _cnGenName(){return _cnPick(_CN_P)+_cnPick(_CN_M);}
// ===== END 中文名称 =====
`;

// 在文件开头（"use strict" 之后）插入中文代码
c = c.replace('"use strict";', '"use strict";\n' + chineseBlock);

// 修改 getBase 函数的中文拦截
c = c.replace(
  '// 中文名称拦截\n    if (base === 11 && window._genChineseCityName) return window._genChineseCityName();',
  '// 中文名称拦截\n    if (base === 11) return _cnGenCity();'
);

// 修改 getState 函数的中文拦截
c = c.replace(
  '// 中文名称拦截\n    if (base === 11 && window._genChineseStateName) return window._genChineseStateName();',
  '// 中文名称拦截\n    if (base === 11) return _cnGenState();'
);

// 如果 getState 没有之前的拦截，手动添加
if (!c.includes('if (base === 11) return _cnGenState()')) {
  c = c.replace(
    'getState = function (name, culture, base) {',
    'getState = function (name, culture, base) {\n    // 中文名称拦截\n    if (base === 11) return _cnGenState();'
  );
}

writeFileSync(file, c);
console.log('Done: inline Chinese names in names-generator.js');
