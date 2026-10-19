// Block Splitter 单元测试
//
// 覆盖范围（对应 tasks.md §2.4）：
// - 完整闭合块的标准切分
// - 不闭合 [card] 不返回（CP-7 流式分章原子性）
// - 没有 [card] 标记的纯 Markdown（CP-8 旧存档读取无副作用）
// - 含 JSON 嵌套数组、转义引号的复杂内容捕获
// - 混合格式优先级：同时含 Markdown 与 [card] → 'card' 优先（GPT 补充 2）

import { describe, it, expect } from 'vitest';
import {
 splitCardBlocks,
 detectFormat,
 hasUnclosedCard,
} from '../technique-block-splitter';

const wrap = (json: string) => `[card]\n${json}\n[/card]`;
const card = (idx: number) => wrap(`{"chapterIndex":${idx},"chapterTitle":"第${idx}章"}`);

describe('splitCardBlocks', () => {
 it('单 [card]...[/card] 块 → 返回 1 元素', () => {
 const blocks = splitCardBlocks(card(1));
 expect(blocks).toHaveLength(1);
 expect(blocks[0]).toContain('"chapterIndex":1');
 });

 it('三个块（中间空行）→ 返回 3 元素', () => {
 const text = [card(1), card(2), card(3)].join('\n\n');
 const blocks = splitCardBlocks(text);
 expect(blocks).toHaveLength(3);
 expect(blocks[0]).toContain('"chapterIndex":1');
 expect(blocks[2]).toContain('"chapterIndex":3');
 });

 it('没有 [card] 标记的纯 Markdown → 返回空数组', () => {
 const md = '## 第一章\n### 主线剧情\n- 关键点';
 expect(splitCardBlocks(md)).toEqual([]);
 });

 it('只有 [card] 没有 [/card] → 返回空数组', () => {
 const text = '[card]\n{"chapterIndex":1}\n';
 expect(splitCardBlocks(text)).toEqual([]);
 });

 it('完整 [card] + 不闭合 [card] → 只返回完整的那一组', () => {
 const text = card(1) + '\n\n[card]\n{"chapterIndex":2}';
 const blocks = splitCardBlocks(text);
 expect(blocks).toHaveLength(1);
 expect(blocks[0]).toContain('"chapterIndex":1');
 });

 it('JSON 内含嵌套数组 + 转义引号 → 完整捕获不破坏', () => {
 const json = '{"keyEvents":["少年说\\"再来一次\\"","[标记]"],"chapterIndex":7}';
 const blocks = splitCardBlocks(wrap(json));
 expect(blocks).toHaveLength(1);
 expect(blocks[0]).toContain('keyEvents');
 expect(blocks[0]).toContain('"chapterIndex":7');
 });

 it('空字符串输入 → 空数组', () => {
 expect(splitCardBlocks('')).toEqual([]);
 });

 it('非字符串输入 → 空数组', () => {
 // @ts-expect-error 故意传错类型
 expect(splitCardBlocks(null)).toEqual([]);
 // @ts-expect-error
 expect(splitCardBlocks(undefined)).toEqual([]);
 });

 it('多次调用同一文本结果稳定（lastIndex 不串扰）', () => {
 const text = card(1) + card(2);
 const a = splitCardBlocks(text);
 const b = splitCardBlocks(text);
 expect(a).toEqual(b);
 expect(a).toHaveLength(2);
 });
});

describe('detectFormat', () => {
 it('含完整闭合 [card]...[/card] → "card"', () => {
 expect(detectFormat(card(1))).toBe('card');
 });

 it('纯 Markdown → "legacy-markdown"', () => {
 expect(detectFormat('## 第一章\n### 主线剧情')).toBe('legacy-markdown');
 });

 it('空字符串 → "legacy-markdown"', () => {
 expect(detectFormat('')).toBe('legacy-markdown');
 });

 it('仅含未闭合 [card] → "legacy-markdown"', () => {
 expect(detectFormat('[card]\n{"a":1}\n')).toBe('legacy-markdown');
 });

 // GPT 补充 2：混合格式优先级
 it('Markdown + 完整 [card] 块同时出现 → "card"（card 优先）', () => {
 const mixed =
 '## 第一章 旧土\n### 主线剧情\n- 旧的总结点\n\n' +
 card(1);
 expect(detectFormat(mixed)).toBe('card');
 });

 it('Markdown + 不闭合 [card] → "legacy-markdown"（不接受半张 card）', () => {
 const mixed = '## 第一章\n### 主线剧情\n\n[card]\n{"a":1}\n';
 expect(detectFormat(mixed)).toBe('legacy-markdown');
 });

 it('混合格式下 splitCardBlocks 仅返回 card 块（忽略 Markdown 段）', () => {
 const mixed =
 '## 第一章\n### 主线剧情\n- xxx\n\n' +
 card(1) +
 '\n\n## 第二章 (旧)\n- yyy';
 expect(detectFormat(mixed)).toBe('card');
 const blocks = splitCardBlocks(mixed);
 expect(blocks).toHaveLength(1);
 expect(blocks[0]).toContain('"chapterIndex":1');
 });
});

describe('hasUnclosedCard', () => {
 it('全部闭合 → false', () => {
 expect(hasUnclosedCard(card(1) + card(2))).toBe(false);
 });

 it('多一个 [card] 没闭合 → true', () => {
 expect(hasUnclosedCard(card(1) + '\n[card]\n{"a":1}')).toBe(true);
 });

 it('完全没标记 → false', () => {
 expect(hasUnclosedCard('普通文本')).toBe(false);
 });

 it('非字符串 → false', () => {
 // @ts-expect-error
 expect(hasUnclosedCard(null)).toBe(false);
 });
});
