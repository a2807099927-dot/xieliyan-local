// editorUtils.ts - Shared editor text helpers.
export { normalizeEscapedNewlines, normalizeNovelOutput, formatAsNovelText, stripHeadingLineFromText } from './editor/text';

export function normalizeAiErrorMessage(error: unknown): string {
 const raw = error instanceof Error ? error.message : String(error || '');
 if (raw.includes('REQUEST_IN_PROGRESS')) return '上一条 AI 请求仍在进行中，请稍后再试。';
 if (raw.includes('REQUEST_ABORTED') || /abort|aborted|cancel/i.test(raw)) return '请求已取消。';
 return raw;
}

export function toSafeParagraphNodes(content: string) {
 const lines = content.replace(/\r\n/g, '\n').split('\n');
 return lines.map((line) =>
 line
 ? {
 type: 'paragraph',
 content: [{ type: 'text', text: line }]
 }
 : { type: 'paragraph' }
 );
}
