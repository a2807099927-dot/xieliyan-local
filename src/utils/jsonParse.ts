// jsonParse 
function extractBalancedJson(text: string): string | null {
 const source = String(text || '');
 const starts: Array<{ ch: '{' | '['; idx: number }> = [];
 for (let i = 0; i < source.length; i += 1) {
 const ch = source[i];
 if (ch === '{' || ch === '[') starts.push({ ch, idx: i });
 }

 for (const start of starts) {
 const open = start.ch;
 const close = open === '{' ? '}' : ']';
 let depth = 0;
 let inString = false;
 let escaped = false;

 for (let i = start.idx; i < source.length; i += 1) {
 const ch = source[i];
 if (inString) {
 if (escaped) {
 escaped = false;
 continue;
 }
 if (ch === '\\') {
 escaped = true;
 continue;
 }
 if (ch === '"') inString = false;
 continue;
 }
 if (ch === '"') {
 inString = true;
 continue;
 }
 if (ch === open) depth += 1;
 if (ch === close) {
 depth -= 1;
 if (depth === 0) return source.slice(start.idx, i + 1);
 }
 }
 }
 return null;
}

export function parseJsonLoosely<T>(text: string): T {
 const source = String(text || '').trim();
 if (!source) throw new Error('JSON_PARSE_EMPTY');
 try {
 return JSON.parse(source) as T;
 } catch {
 const fenced = source
 .replace(/^```json\s*/i, '')
 .replace(/^```\s*/i, '')
 .replace(/```$/i, '')
 .trim();
 if (fenced !== source) {
 try {
 return JSON.parse(fenced) as T;
 } catch {
 // continue
 }
 }
 const balanced = extractBalancedJson(source);
 if (!balanced) throw new Error('JSON_PARSE_NO_OBJECT');
 return JSON.parse(balanced) as T;
 }
}
