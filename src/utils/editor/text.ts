// text.ts - Plain-text normalization helpers for editor and AI outputs.
/**
 * Converts escaped line-break sequences into real newlines.
 */
export function normalizeEscapedNewlines(text: string): string {
 return String(text || '')
 .replace(/\\r\\n/g, '\n')
 .replace(/\\n/g, '\n')
 .replace(/\/n/g, '\n');
}

/**
 * Normalizes model output into clean plain novel text.
 */
export function normalizeNovelOutput(text: string): string {
 return normalizeEscapedNewlines(text)
 .replace(/<\/p>\s*<p>/gi, '\n')
 .replace(/<br\s*\/?>/gi, '\n')
 .replace(/<\/?p[^>]*>/gi, '')
 .replace(/<[^>]+>/g, '')
 .replace(/\r\n/g, '\n')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
}

function normalizeNovelParagraph(text: string): string {
 const trimmed = text.trim();
 if (!trimmed) return '';
 return trimmed;
}

/**
 * Formats arbitrary text into normalized novel paragraphs.
 */
export function formatAsNovelText(raw: string): string {
 const plain = raw.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
 const normalized = plain
 .split('\n')
 .map((line) => line.replace(/\s+$/g, ''))
 .join('\n')
 .replace(/\n{3,}/g, '\n\n');
 const blocks = normalized
 .split(/\n\s*\n/g)
 .map((item) => normalizeNovelParagraph(item))
 .filter(Boolean);
 return blocks.join('\n');
}

/**
 * Removes duplicated heading line from plain chapter text.
 */
export function stripHeadingLineFromText(raw: string, chapterTitle: string): string {
 const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
 const firstNonEmpty = lines.findIndex((line) => line.trim().length > 0);
 if (firstNonEmpty < 0) return raw;
 const first = lines[firstNonEmpty].trim();
 const normalizedTitle = String(chapterTitle || '').trim();
 if (first === normalizedTitle || /^第\s*\d+\s*章/.test(first)) {
 lines.splice(firstNonEmpty, 1);
 return lines.join('\n');
 }
 return raw;
}
