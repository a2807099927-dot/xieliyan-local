// highlight 
type CharacterHit = {
 start: number;
 end: number;
 name: string;
};

// createCharacterHighlight
export function createCharacterHighlight(start: number, end: number, name: string): CharacterHit {
 return { start, end, name };
}

// matchCharacterNames
export function matchCharacterNames(
 text: string,
 regex: RegExp,
 nodePos: number,
 from: number,
 to: number
): CharacterHit[] {
 const hits: CharacterHit[] = [];
 regex.lastIndex = 0;
 let match = regex.exec(text);
 while (match) {
 const start = nodePos + match.index;
 const end = start + match[0].length;
 if (start >= from && end <= to) {
 hits.push(createCharacterHighlight(start, end, match[0]));
 }
 match = regex.exec(text);
 }
 return hits;
}

// getCharacterHighlightDecorations
export function getCharacterHighlightDecorations(
 doc: {
 nodesBetween: (
 from: number,
 to: number,
 f: (node: { isText?: boolean; text?: string }, pos: number) => void
 ) => void;
 },
 from: number,
 to: number,
 regex: RegExp
): CharacterHit[] {
 const hits: CharacterHit[] = [];
 doc.nodesBetween(from, to, (node, pos) => {
 if (!node?.isText || !node.text) return;
 hits.push(...matchCharacterNames(node.text, regex, pos, from, to));
 });
 return hits.sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
}

// applyHighlightsToDoc
export function applyHighlightsToDoc(
 transaction: {
 removeMark: (from: number, to: number, markType: unknown) => void;
 addMark: (from: number, to: number, mark: unknown) => void;
 setMeta: (key: string, value: unknown) => void;
 steps: unknown[];
 },
 markType: { create: (attrs?: Record<string, unknown>) => unknown },
 from: number,
 to: number,
 hits: CharacterHit[],
 shouldRender: boolean
): boolean {
 transaction.setMeta('addToHistory', false);
 transaction.removeMark(from, to, markType);
 if (!shouldRender) return transaction.steps.length > 0;
 for (const hit of hits) {
 transaction.addMark(hit.start, hit.end, markType.create({ name: hit.name }));
 }
 return transaction.steps.length > 0;
}
