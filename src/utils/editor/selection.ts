// selection 
type ParagraphNode = {
 type?: { name?: string };
 textContent?: string;
};

type SelectionLike = {
 $from?: {
 pos: number;
 depth: number;
 parent?: ParagraphNode;
 node: (depth: number) => ParagraphNode | null | undefined;
 before: (depth: number) => number;
 end: (depth?: number) => number;
 };
};

type DocLike = {
 content?: { size: number };
 nodesBetween: (
 from: number,
 to: number,
 f: (node: ParagraphNode, pos: number) => boolean | void
 ) => void;
};

type EditorStateLike = {
 selection?: SelectionLike;
 doc?: DocLike;
};

// getCurrentParagraphText
export function getCurrentParagraphText(state: EditorStateLike): string {
 const $from = state?.selection?.$from;
 if (!$from?.parent) return '';
 return String($from.parent.textContent || '');
}

// getCurrentParagraphKey
export function getCurrentParagraphKey(state: EditorStateLike): string | null {
 const $from = state?.selection?.$from;
 if (!$from) return null;
 for (let depth = $from.depth; depth > 0; depth -= 1) {
 const node = $from.node(depth);
 if (node?.type?.name === 'paragraph') {
 return String($from.before(depth));
 }
 }
 return null;
}

// getParagraphAt
export function getParagraphAt(doc: DocLike, pos: number): { node: ParagraphNode; pos: number } | null {
 let found: { node: ParagraphNode; pos: number } | null = null;
 if (!doc?.nodesBetween) return null;
 doc.nodesBetween(Math.max(1, pos - 1), Math.max(1, pos + 1), (node, nodePos) => {
 if (node?.type?.name === 'paragraph') {
 found = { node, pos: nodePos };
 return false;
 }
 return true;
 });
 return found;
}

// isSelectionAtParagraphEnd
export function isSelectionAtParagraphEnd(state: EditorStateLike): boolean {
 const $from = state?.selection?.$from;
 if (!$from) return false;
 for (let depth = $from.depth; depth > 0; depth -= 1) {
 if ($from.node(depth)?.type?.name === 'paragraph') {
 return $from.end(depth) === $from.end();
 }
 }
 return false;
}

// isSelectionAtParagraphStart
export function isSelectionAtParagraphStart(state: EditorStateLike): boolean {
 const $from = state?.selection?.$from;
 if (!$from) return false;
 for (let depth = $from.depth; depth > 0; depth -= 1) {
 if ($from.node(depth)?.type?.name === 'paragraph') {
 return $from.before(depth) + 1 === $from.pos;
 }
 }
 return false;
}

// hasNonEmptyParagraphAfter
export function hasNonEmptyParagraphAfter(state: EditorStateLike): boolean {
 const $from = state?.selection?.$from;
 const doc = state?.doc;
 if (!$from || !doc) return false;

 let paragraphDepth = -1;
 for (let depth = $from.depth; depth > 0; depth -= 1) {
 if ($from.node(depth)?.type?.name === 'paragraph') {
 paragraphDepth = depth;
 break;
 }
 }
 if (paragraphDepth < 0) return false;

 const paragraphEndPos = $from.end(paragraphDepth);
 let found = false;
 doc.nodesBetween(paragraphEndPos + 1, doc.content?.size ?? paragraphEndPos + 1, (node) => {
 if (node?.type?.name === 'paragraph') {
 const len = String(node.textContent || '').replace(/\s+/g, '').length;
 if (len > 0) {
 found = true;
 return false;
 }
 }
 return true;
 });
 return found;
}
