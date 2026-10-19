// searchHighlight 
import { Mark } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

export const SearchHighlightMark = Mark.create({
 name: 'searchHighlight',
 inclusive: false,
 parseHTML() {
 return [{ tag: 'mark[data-search-match]' }];
 },
 renderHTML() {
 return ['mark', { 'data-search-match': 'true', class: 'wz-search-highlight' }, 0];
 }
});

function escapeRegExp(value: string): string {
 return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applySearchHighlights(
 editor: Editor | null,
 query: string,
 options: {
 isRegex: boolean;
 matchCase: boolean;
 }
): void {
 if (!editor) return;
 const markType = editor.schema.marks.searchHighlight;
 if (!markType) return;

 const transaction = editor.state.tr;
 transaction.setMeta('addToHistory', false);
 const docSize = editor.state.doc.content.size;
 transaction.removeMark(1, docSize, markType);

 if (!query) {
 if (transaction.steps.length > 0) {
 editor.view.dispatch(transaction);
 }
 return;
 }

 let regex: RegExp;
 try {
 const flags = options.matchCase ? 'g' : 'gi';
 const pattern = options.isRegex ? query : escapeRegExp(query);
 regex = new RegExp(pattern, flags);
 } catch {
 // Invalid regex
 if (transaction.steps.length > 0) {
 editor.view.dispatch(transaction);
 }
 return;
 }

 editor.state.doc.nodesBetween(1, docSize, (node, pos) => {
 if (!node.isText || !node.text) return;
 // 注意：搜索在每个文本节点内独立执行。如果搜索词跨越两个文本节点
 // （例如节点边界处有加粗/斜体标记），则无法匹配。这是 ProseMirror
 // 逐节点遍历的固有限制，不影响纯文本内容的正常搜索。
 regex.lastIndex = 0;
 let match = regex.exec(node.text);
 while (match && match[0].length > 0) {
 const start = pos + match.index;
 const end = start + match[0].length;
 transaction.addMark(start, end, markType.create());
 match = regex.exec(node.text);
 }
 });

 if (transaction.steps.length > 0) {
 editor.view.dispatch(transaction);
 }
}

