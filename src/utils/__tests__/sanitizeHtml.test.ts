import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripHtmlToText } from '../sanitizeHtml';

// 这些用例需要 DOM 环境（jsdom）。在 vitest 里设置 environment: 'jsdom'。
describe('sanitizeHtml', () => {
 it('删除 script 标签及其内容', () => {
 const out = sanitizeHtml('<div>hi<script>alert(1)</script></div>');
 expect(out).not.toContain('script');
 expect(out).toContain('hi');
 });

 it('剔除事件处理器属性', () => {
 const out = sanitizeHtml('<img src=x onerror="alert(1)">正文');
 expect(out.toLowerCase()).not.toContain('onerror');
 });

 it('拦截 javascript: 链接', () => {
 const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
 expect(out.toLowerCase()).not.toContain('javascript:');
 });

 it('保留白名单内的样式与基础标签', () => {
 const out = sanitizeHtml('<div style="color:#7dd3fc"><strong>加粗</strong></div>');
 expect(out).toContain('<strong>');
 expect(out).toContain('color');
 });

 it('非白名单标签脱壳但保留文字', () => {
 const out = sanitizeHtml('<marquee>跑马灯</marquee>');
 expect(out).not.toContain('marquee');
 expect(out).toContain('跑马灯');
 });
});

describe('stripHtmlToText', () => {
 it('取纯文本且不保留标签', () => {
 expect(stripHtmlToText('<p>你好<b>世界</b></p>')).toBe('你好世界');
 });

 it('空输入返回空串', () => {
 expect(stripHtmlToText('')).toBe('');
 });
});
