import type { ParagraphDiff } from '../../types/review';

function escapeHtml(text: string) {
 return text.replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;")
 .replace(/'/g, "&#039;");
}

export function simpleDiff(oldText: string, newText: string) {
 const m = oldText.length;
 const n = newText.length;
 
 if (m === 0) return [{ type: 'ins' as const, text: newText }];
 if (n === 0) return [{ type: 'del' as const, text: oldText }];
 
 if (m * n > 25000000) { 
 return [
 { type: 'del' as const, text: oldText },
 { type: 'ins' as const, text: newText }
 ];
 }

 const dp = new Uint16Array((m + 1) * (n + 1));
 const getDP = (i: number, j: number) => dp[i * (n + 1) + j];
 const setDP = (i: number, j: number, val: number) => { dp[i * (n + 1) + j] = val; };

 for (let i = 1; i <= m; i++) {
 for (let j = 1; j <= n; j++) {
 if (oldText[i - 1] === newText[j - 1]) {
 setDP(i, j, getDP(i - 1, j - 1) + 1);
 } else {
 setDP(i, j, Math.max(getDP(i - 1, j), getDP(i, j - 1)));
 }
 }
 }

 let i = m;
 let j = n;
 const diff: { type: 'eq' | 'del' | 'ins', text: string }[] = [];

 while (i > 0 && j > 0) {
 if (oldText[i - 1] === newText[j - 1]) {
 diff.push({ type: 'eq', text: oldText[i - 1] });
 i--;
 j--;
 } else if (getDP(i - 1, j) > getDP(i, j - 1)) {
 diff.push({ type: 'del', text: oldText[i - 1] });
 i--;
 } else {
 diff.push({ type: 'ins', text: newText[j - 1] });
 j--;
 }
 }
 while (i > 0) {
 diff.push({ type: 'del', text: oldText[i - 1] });
 i--;
 }
 while (j > 0) {
 diff.push({ type: 'ins', text: newText[j - 1] });
 j--;
 }

 diff.reverse();
 const merged: { type: 'eq' | 'del' | 'ins', text: string }[] = [];
 for (const d of diff) {
 if (merged.length > 0 && merged[merged.length - 1].type === d.type) {
 merged[merged.length - 1].text += d.text;
 } else {
 merged.push({ ...d });
 }
 }
 return merged;
}

export function buildParagraphDiffs(originalText: string, rewrittenText: string): ParagraphDiff[] {
 const oLines = originalText.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim().split('\n');
 const rLines = rewrittenText.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim().split('\n');

 // We can just use a simple Myers diff on lines
 const m = oLines.length;
 const n = rLines.length;
 
 if (m === 0 && n === 0) return [];

 const dp = new Uint16Array((m + 1) * (n + 1));
 const getDP = (i: number, j: number) => dp[i * (n + 1) + j];
 const setDP = (i: number, j: number, val: number) => { dp[i * (n + 1) + j] = val; };

 for (let i = 1; i <= m; i++) {
 for (let j = 1; j <= n; j++) {
 if (oLines[i - 1] === rLines[j - 1]) {
 setDP(i, j, getDP(i - 1, j - 1) + 1);
 } else {
 setDP(i, j, Math.max(getDP(i - 1, j), getDP(i, j - 1)));
 }
 }
 }

 let i = m;
 let j = n;
 const diff: { type: 'eq' | 'del' | 'ins', text: string }[] = [];

 while (i > 0 && j > 0) {
 if (oLines[i - 1] === rLines[j - 1]) {
 diff.push({ type: 'eq', text: oLines[i - 1] });
 i--;
 j--;
 } else if (getDP(i - 1, j) > getDP(i, j - 1)) {
 diff.push({ type: 'del', text: oLines[i - 1] });
 i--;
 } else {
 diff.push({ type: 'ins', text: rLines[j - 1] });
 j--;
 }
 }
 while (i > 0) {
 diff.push({ type: 'del', text: oLines[i - 1] });
 i--;
 }
 while (j > 0) {
 diff.push({ type: 'ins', text: rLines[j - 1] });
 j--;
 }
 diff.reverse();

 const results: ParagraphDiff[] = [];
 let tempOriginal: string[] = [];
 let tempRewritten: string[] = [];
 let currentId = 0;

 const flush = () => {
 if (tempOriginal.length === 0 && tempRewritten.length === 0) return;
 const count = Math.max(tempOriginal.length, tempRewritten.length);
 for (let index = 0; index < count; index += 1) {
 const original = tempOriginal[index] || '';
 const rewritten = tempRewritten[index] || '';
 if (!original && !rewritten) continue;
 results.push({
 id: `diff-${Date.now()}-${currentId++}`,
 original,
 rewritten,
 status: 'pending'
 });
 }
 tempOriginal = [];
 tempRewritten = [];
 };

 for (const d of diff) {
 if (d.type === 'eq') {
 flush();
 results.push({
 id: `diff-${Date.now()}-${currentId++}`,
 original: d.text,
 rewritten: d.text,
 status: 'accepted'
 });
 } else if (d.type === 'del') {
 tempOriginal.push(d.text);
 } else if (d.type === 'ins') {
 tempRewritten.push(d.text);
 }
 }
 flush();
 
 return results;
}

export function buildInlineDiffHtml(diffs: ParagraphDiff[]): string {
 let html = '';
 
 for (const pd of diffs) {
 if (pd.status === 'accepted') {
 const parts = pd.rewritten.split('\n');
 for (const p of parts) {
 if (p) html += `<p>${escapeHtml(p)}</p>`;
 }
 } else if (pd.status === 'rejected') {
 const parts = pd.original.split('\n');
 for (const p of parts) {
 if (p) html += `<p>${escapeHtml(p)}</p>`;
 }
 } else {
 // Pending status: character-level inline diff
 const charDiffs = simpleDiff(pd.original, pd.rewritten);
 
 let pOpen = false;
 const ensureP = () => { if (!pOpen) { html += '<p>'; pOpen = true; } };
 const closeP = () => { if (pOpen) { html += '</p>'; pOpen = false; } };

 ensureP();
 
 for (const d of charDiffs) {
 if (d.type === 'eq') {
 const parts = d.text.split('\n');
 for (let i = 0; i < parts.length; i++) {
 if (i > 0) { closeP(); ensureP(); }
 html += escapeHtml(parts[i]);
 }
 } else if (d.type === 'del') {
 const parts = d.text.split('\n');
 for (let i = 0; i < parts.length; i++) {
 if (i > 0) { closeP(); ensureP(); }
 if (parts[i].length > 0) {
 html += `<mark data-review-diff="strikethrough" data-diff-id="${escapeHtml(pd.id)}">${escapeHtml(parts[i])}</mark>`;
 }
 }
 } else if (d.type === 'ins') {
 const parts = d.text.split('\n');
 for (let i = 0; i < parts.length; i++) {
 if (i > 0) { closeP(); ensureP(); }
 if (parts[i].length > 0) {
 html += `<mark data-review-diff="changed" data-diff-id="${escapeHtml(pd.id)}">${escapeHtml(parts[i])}</mark>`;
 }
 }
 }
 }
 
 // Append the DiffWidgetNode placeholder before closing the paragraph
 html += `<span data-diff-widget data-diff-id="${escapeHtml(pd.id)}"></span>`;
 closeP();
 }
 }
 
 return html.replace(/<p><\/p>/g, '');
}

export function buildFinalHtml(diffs: ParagraphDiff[]): string {
 let html = '';
 for (const pd of diffs) {
 // If pending, default to rewritten text, or we could default to original. Let's default to rewritten text.
 const finalContent = (pd.status === 'accepted' || pd.status === 'pending') ? pd.rewritten : pd.original;
 const parts = finalContent.split('\n');
 for (const p of parts) {
 if (p) html += `<p>${escapeHtml(p)}</p>`;
 }
 }
 return html;
}
