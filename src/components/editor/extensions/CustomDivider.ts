import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { textblockTypeInputRule } from '@tiptap/core';

export const CustomDivider = HorizontalRule.extend({
  addAttributes() {
    return {
      variant: {
        default: 'solid',
        parseHTML: element => element.getAttribute('data-variant') || 'solid',
        renderHTML: attributes => {
          if (attributes.variant === 'dashed') {
            return {
              'data-variant': 'dashed',
              style: 'border-top: 1px dashed var(--border-color); margin: 2rem 0;'
            };
          }
          return {
            'data-variant': 'solid',
            style: 'border-top: 1px solid var(--border-color); margin: 2rem 0;'
          };
        }
      }
    };
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^(?:---|—-|___\s|\*\*\*\s)$/,
        type: this.type,
        getAttributes: (match) => {
          if (match[0].startsWith('***')) {
            return { variant: 'dashed' };
          }
          return { variant: 'solid' };
        }
      })
    ];
  }
});
