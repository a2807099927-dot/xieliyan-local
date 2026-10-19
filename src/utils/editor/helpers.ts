// helpers 
import type { Node as PMNode } from 'prosemirror-model';

// normalizeNovelParagraph
export function normalizeNovelParagraph(text: string): string {
 const trimmed = text.trim();
 if (!trimmed) return '';
 return trimmed;
}

// createId
export function createId(): string {
 if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
 return crypto.randomUUID();
 }
 return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// hashText
export function hashText(input: string): string {
 let hash = 2166136261;
 for (let i = 0; i < input.length; i += 1) {
 hash ^= input.charCodeAt(i);
 hash = Math.imul(hash, 16777619);
 }
 return `h${(hash >>> 0).toString(16)}`;
}

// normalizeParagraphForScan
export function normalizeParagraphForScan(text: string): string {
 return text.replace(/\s+/g, ' ').trim();
}

// extractTextFromStepSlice
export function extractTextFromStepSlice(content: unknown): string {
 if (!Array.isArray(content)) return '';
 let acc = '';
 for (const node of content) {
 if (!node || typeof node !== 'object') continue;
 const anyNode = node as { text?: unknown; content?: unknown };
 if (typeof anyNode.text === 'string') acc += anyNode.text;
 if (anyNode.content) acc += extractTextFromStepSlice(anyNode.content);
 }
 return acc;
}

// transactionInsertedMeaningfulCharCount
export function transactionInsertedMeaningfulCharCount(transaction: any): number {
 const steps = Array.isArray(transaction?.steps) ? transaction.steps : [];
 let count = 0;
 for (const step of steps) {
 const json = step?.toJSON?.();
 const inserted = extractTextFromStepSlice(json?.slice?.content);
 count += inserted.replace(/\s+/g, '').length;
 }
 return count;
}

// getPosFromTextOffset
export function getPosFromTextOffset(doc: PMNode, offset: number): number {
  const docSize = doc.content.size;
  const target = Math.max(0, Math.min(offset, doc.textBetween(0, docSize, '\n', '\n').length));
  let result = Math.max(1, Math.min(target + 1, docSize));

  doc.nodesBetween(0, docSize, (node, pos) => {
  if (!node.isText || !node.text) return true;
  // 让 ProseMirror 自己计算节点前的文本，准确处理 heading、空段落和 block separator。
  const textStart = doc.textBetween(0, pos, '\n', '\n').length;
  const textEnd = textStart + node.text.length;
  if (target >= textStart && target <= textEnd) {
  result = pos + (target - textStart);
  return false;
  }
  return true;
  });

  return Math.max(1, Math.min(result, docSize));
}

// shouldPreferBodyFont
export function shouldPreferBodyFont(editorFontFamily: string | undefined): boolean {
 const raw = String(editorFontFamily || '').trim();
 return !raw;
}

// escapeHtml
export function escapeHtml(input: string): string {
 return input
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
}

// cleanCharacterTooltipText
export function cleanCharacterTooltipText(value: unknown, fallback = ''): string {
 return String(value ?? '')
 .replace(/\uFFFD/g, '')
 .replace(/(\{?\s*esc\s*\([^)]*\)\s*\}?|role\.[a-zA-Z_]+|\?\.[a-zA-Z_]+|HTMLAttributes\.[a-zA-Z_]+|undefined|null)/g, '')
 .replace(/[{}()[\]`]+/g, '')
 .replace(/\s{2,}/g, ' ')
 .trim() || fallback;
}

// clampSuggestionText
export function clampSuggestionText(text: string): string {
 return String(text || '')
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
 .replace(/\uFFFD/g, '')
 .replace(/\s+/g, ' ')
 .trim();
}

// normalizeSuggestionTerm
export function normalizeSuggestionTerm(text: string): string {
 return clampSuggestionText(text)
 .replace(/^['"\u201c\u201d\u2018\u2019\u300c\u300d\u3010\u3011\u300e\u300f]+/, '')
 .replace(/['"\u201c\u201d\u2018\u2019\u300c\u300d\u3010\u3011\u300e\u300f]+$/, '')
 .replace(/^[\-\s]+/, '')
 .replace(/[\-\s]+$/, '')
 .trim();
}

// pickSuggestionField
export function pickSuggestionField(row: Record<string, unknown>, candidates: string[]): string {
 for (const key of candidates) {
 const value = row[key];
 if (typeof value === 'string' && value.trim()) return value;
 }
 return '';
}

// findIndexInRawParagraph
export function findIndexInRawParagraph(rawText: string, normalizedText: string, targetText: string): number {
 const direct = rawText.indexOf(targetText);
 if (direct >= 0) return direct;

 const normalizedIdx = normalizedText.indexOf(targetText);
 if (normalizedIdx < 0) return -1;

 let normalizedCursor = 0;
 for (let rawIdx = 0; rawIdx < rawText.length; rawIdx += 1) {
 const ch = rawText[rawIdx];
 const isSpace = /\s/.test(ch);
 if (isSpace) {
 if (normalizedCursor > 0 && normalizedText[normalizedCursor] === ' ') {
 normalizedCursor += 1;
 }
 continue;
 }
 if (normalizedCursor === normalizedIdx) return rawIdx;
 normalizedCursor += 1;
 }
 return -1;
}

// isValidParagraph
export function isValidParagraph(text: string): boolean {
 return String(text || '').replace(/\s+/g, '').length > 0;
}

// isEmptyParagraph
export function isEmptyParagraph(text: string): boolean {
 return !isValidParagraph(text);
}

// getWordCount
export function getWordCount(text: string): number {
 return String(text || '').replace(/\s+/g, '').length;
}

// estimateReadingTime
export function estimateReadingTime(text: string, charsPerMinute = 600): number {
 const count = getWordCount(text);
 if (count <= 0) return 0;
 return Math.max(1, Math.ceil(count / Math.max(1, charsPerMinute)));
}
