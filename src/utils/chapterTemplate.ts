// chapterTemplate.ts - Chapter heading extraction and normalization helpers.
function escapeHtml(input: string): string {
 return input
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/\"/g, '&quot;')
 .replace(/'/g, '&#39;');
}

const LEADING_HEADING_RE = /^\s*<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>\s*/i;
const LEADING_HEADING_BLOCK_RE = /^\s*(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)\s*/i;
const LEADING_EXTRA_HEADINGS_RE = /^\s*(?:<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>\s*)+/i;
const LEADING_PARAGRAPH_RE = /^\s*(<p[^>]*>[\s\S]*?<\/p>)\s*/i;
const LEADING_EMPTY_PARAGRAPH_RE =
 /^\s*<p[^>]*>(?:\s|&nbsp;|&#160;|&#8203;|&#xfeff;|\u200B|\u200C|\u200D|\uFEFF|<br\s*\/?\s*>)*<\/p>\s*/i;
const TAG_RE = /<[^>]+>/g;

function decodeHtml(text: string): string {
 return text
 .replace(/&nbsp;/g, ' ')
 .replace(/&amp;/g, '&')
 .replace(/&lt;/g, '<')
 .replace(/&gt;/g, '>')
 .replace(/&quot;/g, '"')
 .replace(/&#39;/g, "'");
}

function stripTags(input: string): string {
 return decodeHtml(input.replace(TAG_RE, ''));
}

export function extractChapterHeading(content: string): string {
 const html = String(content || '');
 const match = html.match(LEADING_HEADING_RE);
 if (!match) return '';
 return stripTags(match[1] || '').trim();
}

export function ensureChapterHeading(content: string, fallbackTitle: string): string {
 const html = String(content || '').trim();
 const headingBlockMatch = html.match(LEADING_HEADING_BLOCK_RE);
 const currentHeading = extractChapterHeading(html);
 const title = currentHeading || fallbackTitle.trim() || '第1章';

 const heading = headingBlockMatch?.[1] || `<h2 style="text-align:center;">${escapeHtml(title)}</h2>`;
 let body = html.replace(LEADING_HEADING_BLOCK_RE, '').trim();

 body = body.replace(LEADING_EXTRA_HEADINGS_RE, '').trim();

 while (LEADING_EMPTY_PARAGRAPH_RE.test(body)) {
 const next = body.replace(LEADING_EMPTY_PARAGRAPH_RE, '').trim();
 if (!next) break;
 body = next;
 }

 const paragraphMatch = body.match(LEADING_PARAGRAPH_RE);
 if (paragraphMatch) {
 const firstParagraphText = stripTags(paragraphMatch[1] || '').trim();
 const normalizedTitle = String(title || '').trim();
 const looksLikeChapterTitle = firstParagraphText.length < 24 && /^第\s*\d+\s*章/.test(firstParagraphText);
 if (firstParagraphText === normalizedTitle || looksLikeChapterTitle) {
 body = body.replace(LEADING_PARAGRAPH_RE, '').trim();
 }
 }

 if (!body) return `${heading}<p></p>`;
 return `${heading}${body}`;
}

export function buildDefaultChapterContent(title: string): string {
 return ensureChapterHeading('', title);
}

// 目录重命名时同步正文标题：替换（或补上）首行章节标题，正文其余部分原样保留。
export function replaceChapterHeading(content: string, newTitle: string): string {
 const html = String(content || '');
 const title = String(newTitle || '').trim();
 if (!title) return html;
 const heading = `<h2 style="text-align:center;">${escapeHtml(title)}</h2>`;
 if (LEADING_HEADING_BLOCK_RE.test(html)) {
  // 用函数替换：标题含 $& 等字符时不会被误解释为替换模式
  return html.replace(LEADING_HEADING_BLOCK_RE, () => heading);
 }
 // 没有首行标题的旧章节：按 ensureChapterHeading 规则补一个（会顺带清掉伪装成正文的首行"第X章…"）
 return ensureChapterHeading(html, title);
}
