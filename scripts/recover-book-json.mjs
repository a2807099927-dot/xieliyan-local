/**
 * Recover book.json corrupted by concurrent save_book (trailing characters).
 * Usage: node scripts/recover-book-json.mjs <path-to-book.json>
 */
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/recover-book-json.mjs <book.json>');
  process.exit(1);
}

const abs = path.resolve(target);
const raw = fs.readFileSync(abs, 'utf8');
const bak = `${abs}.corrupt-${Date.now()}.bak`;
fs.copyFileSync(abs, bak);
console.log('backup ->', bak, 'bytes', raw.length);

function firstJsonEnd(s) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const end = firstJsonEnd(raw);
if (end < 0) {
  console.error('cannot locate first complete JSON object');
  process.exit(1);
}

const slice = raw.slice(0, end).trim();
const parsed = JSON.parse(slice);
const out = JSON.stringify(parsed, null, 2);
fs.writeFileSync(abs, out, 'utf8');
JSON.parse(fs.readFileSync(abs, 'utf8'));

console.log(
  JSON.stringify(
    {
      ok: true,
      title: parsed.title,
      chapters: (parsed.chapters || []).length,
      keptBytes: end,
      trailingBytes: raw.length - end,
      writtenBytes: out.length,
    },
    null,
    2
  )
);
