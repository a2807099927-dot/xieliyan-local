import { readFileSync, writeFileSync } from 'fs';

const file = 'public/fmg/index.html';
let html = readFileSync(file, 'utf8');

if (!html.includes('chinese-names-patch')) {
  html = html.replace('</head>', '<script src="modules/chinese-names-patch.js"></script>\n</head>');
  writeFileSync(file, html);
  console.log('Added chinese-names-patch.js to index.html');
} else {
  console.log('Already added');
}
