// 修改 FMG 的 names-generator.js，让 base 11 (Chinese) 直接输出中文
import { readFileSync, writeFileSync } from 'fs';

const file = 'public/fmg/modules/names-generator.js';
let c = readFileSync(file, 'utf8');

// 在 getState 函数开头插入中文拦截
const getStateMarker = 'getState = function (name, culture, base) {';
const getStateInsert = `getState = function (name, culture, base) {
    // 中文名称拦截
    if (base === 11 && window._genChineseStateName) return window._genChineseStateName();`;
c = c.replace(getStateMarker, getStateInsert);

// 找到主要的名称生成函数并拦截
// getBase 函数 - 生成基础名称
const getBasePattern = 'getBase = function (base,';
if (c.includes(getBasePattern)) {
  c = c.replace(getBasePattern, `getBase = function (base,`);
  // 在函数体开头加入中文拦截
  const idx = c.indexOf('getBase = function (base,');
  const braceIdx = c.indexOf('{', idx);
  if (braceIdx > -1) {
    c = c.substring(0, braceIdx + 1) + 
      '\n    // 中文名称拦截\n    if (base === 11 && window._genChineseCityName) return window._genChineseCityName();\n' + 
      c.substring(braceIdx + 1);
  }
}

writeFileSync(file, c);
console.log('Patched names-generator.js for Chinese names');

// 在 index.html 中引入补丁脚本
const indexFile = 'public/fmg/index.html';
let html = readFileSync(indexFile, 'utf8');
if (!html.includes('chinese-names-patch.js')) {
  html = html.replace('</head>', '  <script src="modules/chinese-names-patch.js"></script>\n</head>');
  writeFileSync(indexFile, html);
  console.log('Added chinese-names-patch.js to index.html');
}
