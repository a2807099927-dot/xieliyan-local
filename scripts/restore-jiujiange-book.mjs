/**
 * 恢复《网游之酒剑歌行》book.json
 * 底本：backups/book-auto-2026-05-26…（478 章）
 * 补章：chapters/*.html 中 第485–520 章等有正文孤儿文件
 */
import fs from 'fs';
import path from 'path';

const root = 'E:/注册机/books/0897104b-b87f-4d37-807d-e5688c1a1733';
const chaptersDir = path.join(root, 'chapters');
const backupPath = path.join(root, 'backups/book-auto-2026-05-26T11-10-21-950Z.json');
const bookPath = path.join(root, 'book.json');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function chNo(t) {
  const m = String(t || '').match(/第\s*(\d+)\s*章/);
  return m ? parseInt(m[1], 10) : null;
}
function titleFromHtml(html) {
  const m = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return (m ? m[1].replace(/<[^>]+>/g, '') : '').replace(/&nbsp;/gi, ' ').trim();
}
function plainLen(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, '').length;
}
function readHtml(id) {
  const p = path.join(chaptersDir, id + '.html');
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// 1) 备份当前被写坏的 book.json
const wipedBackup = path.join(root, `book.json.wiped-${stamp}.bak`);
fs.copyFileSync(bookPath, wipedBackup);
console.log('Saved wiped book to', wipedBackup);

// 2) 以 5/26 自动备份为底
const base = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
console.log('Base backup chapters:', base.chapters.length, 'title:', base.title);

/** @type {Map<number, any>} */
const byNo = new Map();

function consider(ch, source) {
  const n = chNo(ch.title);
  if (n == null || n < 1 || n > 520) return;
  const wc = Number(ch.wordCount || 0);
  const contentLen = plainLen(ch.content || '');
  const score = Math.max(wc, contentLen);
  // 跳过工坊空壳/极短垃圾（但 base 里原本就有的保留）
  if (score < 30 && source !== 'base') return;

  const prev = byNo.get(n);
  if (!prev) {
    byNo.set(n, { ...ch, wordCount: score || wc, _source: source, _score: score });
    return;
  }
  if (score > (prev._score || 0)) {
    byNo.set(n, { ...ch, wordCount: score || wc, _source: source, _score: score });
  }
}

// base 章节：优先用磁盘 html 补新正文
for (const ch of base.chapters) {
  const html = readHtml(ch.id);
  let content = ch.content || '';
  let wc = Number(ch.wordCount || 0);
  if (html) {
    const hl = plainLen(html);
    if (hl > plainLen(content)) {
      content = html;
      wc = Math.max(wc, hl);
    } else if (!content && hl > 0) {
      content = html;
      wc = Math.max(wc, hl);
    }
  }
  consider(
    {
      id: ch.id,
      title: ch.title,
      content: content || '',
      wordCount: wc,
      outline: ch.outline || '',
      createdAt: ch.createdAt || new Date().toISOString(),
      updatedAt: ch.updatedAt || new Date().toISOString(),
    },
    'base'
  );
}

// 从 chapters/*.html 补 485–520（及 base 缺失号）
const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith('.html'));
let consideredOrphans = 0;
for (const f of files) {
  const id = f.slice(0, -5);
  const html = fs.readFileSync(path.join(chaptersDir, f), 'utf8');
  const title = titleFromHtml(html) || '';
  const n = chNo(title);
  if (n == null) continue;
  if (n > 520) continue; // 工坊误建的 521+ 空壳不收
  // base 已有且够长：不覆盖（避免把新工坊假第2章写进缺口）
  if (n <= 484 && byNo.has(n) && (byNo.get(n)._score || 0) >= 100) continue;
  const wc = plainLen(html);
  if (wc < 50) continue;
  consider(
    {
      id,
      title: title || `第${n}章`,
      content: html,
      wordCount: wc,
      outline: '',
      createdAt: new Date().toISOString(),
      updatedAt: fs.statSync(path.join(chaptersDir, f)).mtime.toISOString(),
    },
    'html-orphan'
  );
  if (n >= 485) consideredOrphans += 1;
}

// 若 base 章节有正文但 html 丢失/为空，写回 html
let wroteHtml = 0;
for (const ch of byNo.values()) {
  if (!ch.content || plainLen(ch.content) < 50) continue;
  const p = path.join(chaptersDir, ch.id + '.html');
  if (!fs.existsSync(p) || fs.statSync(p).size < 50) {
    fs.writeFileSync(p, ch.content, 'utf8');
    wroteHtml += 1;
  }
}

const nos = [...byNo.keys()].sort((a, b) => a - b);
const chapters = nos.map((n) => {
  const ch = byNo.get(n);
  return {
    id: ch.id,
    title: ch.title,
    content: ch.content || '',
    wordCount: Number(ch.wordCount || 0),
    outline: ch.outline || '',
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
  };
});

const missing = [];
for (let i = 1; i <= 520; i++) if (!byNo.has(i)) missing.push(i);

const restored = {
  ...base,
  chapters,
  updatedAt: new Date().toISOString(),
};
if (restored.settings && restored.settings.autoWorkshop) {
  delete restored.settings.autoWorkshop;
}

fs.writeFileSync(bookPath, JSON.stringify(restored, null, 2), 'utf8');

const withBody = chapters.filter((c) => c.wordCount >= 50).length;
console.log('=== RESTORE DONE ===');
console.log('chapters restored:', chapters.length);
console.log('with body (>=50):', withBody);
console.log('max chapter no:', nos[nos.length - 1] || 0);
console.log('missing 1-520 count:', missing.length);
console.log('missing list:', missing.join(','));
console.log('html files written:', wroteHtml);
console.log('html orphans used for 485+:', consideredOrphans);
console.log('book.json size:', fs.statSync(bookPath).size);
console.log(
  'last 8:',
  chapters
    .slice(-8)
    .map((c) => `${c.title}(${c.wordCount})`)
    .join(' | ')
);
