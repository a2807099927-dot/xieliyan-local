import { Mark, Node, mergeAttributes } from '@tiptap/core';

export const ReviewDiffMark = Mark.create({
 name: 'reviewDiff',
 inclusive: false,

 addAttributes() {
 return {
 kind: {
 default: 'changed',
 parseHTML: (element) => element.getAttribute('data-review-diff') || 'changed',
 renderHTML: (attributes) => ({
 'data-review-diff': attributes.kind
 })
 },
 replacement: {
 default: null,
 parseHTML: (element) => element.getAttribute('data-replacement'),
 renderHTML: (attributes) => {
 if (!attributes.replacement) return {};
 return { 'data-replacement': attributes.replacement };
 }
 },
 diffId: {
 default: null,
 parseHTML: (element) => element.getAttribute('data-diff-id'),
 renderHTML: (attributes) => {
 if (!attributes.diffId) return {};
 return { 'data-diff-id': attributes.diffId };
 }
 }
 };
 },

 parseHTML() {
 return [{ tag: 'mark[data-review-diff]' }];
 },

 renderHTML({ HTMLAttributes }) {
 const kind = HTMLAttributes.kind || HTMLAttributes['data-review-diff'] || 'changed';
 return [
 'mark',
 mergeAttributes(HTMLAttributes, {
 'data-review-diff': kind,
 class: `wz-review-diff wz-review-diff-${kind}`
 }),
 0
 ];
 }
});

export const ReviewActionNode = Node.create({
 name: 'reviewAction',
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
 if (!attributes.diffId) return {};
 return { 'data-diff-id': attributes.diffId };
 },
 },
 };
 },

 parseHTML() {
 return [
 {
 tag: 'span.wz-review-actions',
 },
 ];
 },

 renderHTML({ HTMLAttributes }) {
 return ['span', mergeAttributes(HTMLAttributes, { class: 'wz-review-actions', contenteditable: 'false' }),
 ['button', { class: 'wz-review-accept' }, '√'],
 ['button', { class: 'wz-review-reject' }, '×']
 ];
 },
});
