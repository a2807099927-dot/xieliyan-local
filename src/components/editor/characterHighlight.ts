// characterHighlight 
import { Mark } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import {
 applyHighlightsToDoc,
 getCharacterHighlightDecorations
} from '../../utils/editor/highlight';

export const CharacterHighlightMark = Mark.create({
 name: 'characterHighlight',

 inclusive: false,

 addAttributes() {
 return {
 name: {
 default: null
 }
 };
 },

 parseHTML() {
 return [{ tag: 'mark[data-character-name]' }];
 },

 renderHTML({ HTMLAttributes }) {
 return [
 'mark',
 {
 ...HTMLAttributes,
 'data-character-name': HTMLAttributes.name,
 class: 'wz-character-highlight'
 },
 0
 ];
 }
});

function escapeRegExp(value: string): string {
 return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyCharacterHighlights(
 editor: Editor,
 keywords: string[],
 options?: {
 from?: number;
 to?: number;
 }
): void {
 const markType = editor.schema.marks.characterHighlight;
 if (!markType) return;

 const normalized = Array.from(new Set(keywords.map((item) => item.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
 const docTextLength = editor.state.doc.textContent.length;
 const from = Math.max(1, options?.from ?? 1);
 const to = Math.min(editor.state.doc.content.size, options?.to ?? editor.state.doc.content.size);
 if (from >= to) return;

 const existing: Array<{ start: number; end: number; name: string }> = [];
 editor.state.doc.nodesBetween(from, to, (node, pos) => {
 if (!node.isText || !node.text) return;
 const textLen = node.text.length;
 if (textLen <= 0) return;
 const start = Math.max(from, pos);
 const end = Math.min(to, pos + textLen);
 if (start >= end) return;
 const hitMark = node.marks.find((mark) => mark.type === markType);
 if (!hitMark) return;
 existing.push({
 start,
 end,
 name: String(hitMark.attrs?.name ?? '')
 });
 });

 const shouldRender =
 normalized.length > 0 &&
 normalized.length <= 500 &&
 docTextLength <= 600000;

 const nextHits: Array<{ start: number; end: number; name: string }> = [];
 if (shouldRender && normalized.length > 0) {
 const regex = new RegExp(normalized.map(escapeRegExp).join('|'), 'g');
 nextHits.push(...getCharacterHighlightDecorations(editor.state.doc as any, from, to, regex));
 }

 if (existing.length === 0 && nextHits.length === 0) {
 return;
 }

 const sortedExisting = existing
 .slice()
 .sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
 const sortedNextHits = nextHits
 .slice()
 .sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
 const isUnchanged =
 sortedExisting.length === sortedNextHits.length &&
 sortedExisting.every((item, index) => {
 const next = sortedNextHits[index];
 return item.start === next.start && item.end === next.end && item.name === next.name;
 });
 if (isUnchanged) {
 return;
 }

 const transaction = editor.state.tr;
 const changed = applyHighlightsToDoc(
 transaction as any,
 markType as any,
 from,
 to,
 sortedNextHits as any,
 shouldRender && normalized.length > 0
 );
 if (changed) {
 editor.view.dispatch(transaction);
 }
}

