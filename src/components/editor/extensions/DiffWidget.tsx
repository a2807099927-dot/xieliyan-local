import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

const DiffWidgetComponent = (props: any) => {
 const diffId = props.node.attrs.diffId;
 
 const handleAccept = () => {
 window.dispatchEvent(new CustomEvent('writerzen:diff-action', { detail: { action: 'accept', id: diffId } }));
 };

 const handleReject = () => {
 window.dispatchEvent(new CustomEvent('writerzen:diff-action', { detail: { action: 'reject', id: diffId } }));
 };

 return (
 <NodeViewWrapper as="span" className="inline-flex items-center gap-0.5 ml-2 p-0.5 select-none align-middle bg-[var(--surface-strong)] border border-[var(--border-color)] rounded-full shadow-sm" contentEditable={false}>
 <button 
 onClick={handleAccept}
 className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all"
 title="接受修改"
 >
 <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
 </button>
 <div className="w-px h-3 bg-[var(--border-color)] mx-0.5 opacity-50"></div>
 <button 
 onClick={handleReject}
 className="flex items-center justify-center w-[22px] h-[22px] rounded-full text-[var(--text-muted)] hover:bg-rose-500 hover:text-white transition-all"
 title="拒绝（恢复原文）"
 >
 <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
 </button>
 </NodeViewWrapper>
 );
};

export const DiffWidgetNode = Node.create({
 name: 'diffWidget',
 group: 'inline',
 inline: true,
 selectable: false,
 atom: true,

 addAttributes() {
 return {
 diffId: {
 default: null,
 parseHTML: element => element.getAttribute('data-diff-id'),
 renderHTML: attributes => {
 if (!attributes.diffId) {
 return {};
 }
 return {
 'data-diff-id': attributes.diffId,
 };
 },
 },
 };
 },

 parseHTML() {
 return [
 {
 tag: 'span[data-diff-widget]',
 },
 ];
 },

 renderHTML({ HTMLAttributes }) {
 return ['span', mergeAttributes(HTMLAttributes, { 'data-diff-widget': '' })];
 },

 addNodeView() {
 return ReactNodeViewRenderer(DiffWidgetComponent);
 },
});
