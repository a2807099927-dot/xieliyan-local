import { describe, it, expect } from 'vitest';
// 续写流程的消息构建逻辑验证
// buildGuidedRetryMessages 是模块内部函数，通过导出的 useContinuationFlow 间接测试
// 这里验证核心文本处理工具

import { normalizeEscapedNewlines, normalizeNovelOutput, formatAsNovelText, stripHeadingLineFromText } from '../src/utils/editor/text';

describe('normalizeEscapedNewlines — 续写输出换行修正', () => {
  it('转换 \\n 为真实换行', () => {
    expect(normalizeEscapedNewlines('第一段\\n第二段')).toBe('第一段\n第二段');
  });
  it('转换 \\r\\n 为真实换行', () => {
    expect(normalizeEscapedNewlines('行1\\r\\n行2')).toBe('行1\n行2');
  });
  it('转换 /n 为真实换行', () => {
    expect(normalizeEscapedNewlines('段落/n段落')).toBe('段落\n段落');
  });
  it('空字符串安全', () => {
    expect(normalizeEscapedNewlines('')).toBe('');
  });
});

describe('normalizeNovelOutput — AI 输出正文清洗', () => {
  it('去除 HTML 标签', () => {
    expect(normalizeNovelOutput('<p>段落一</p><p>段落二</p>')).toBe('段落一\n段落二');
  });
  it('br 转换为换行', () => {
    expect(normalizeNovelOutput('行一<br/>行二')).toBe('行一\n行二');
  });
  it('压缩多余空行', () => {
    expect(normalizeNovelOutput('段一\n\n\n\n段二')).toBe('段一\n\n段二');
  });
  it('去除首尾空白', () => {
    expect(normalizeNovelOutput('  正文内容  ')).toBe('正文内容');
  });
});

describe('formatAsNovelText — 正文格式化', () => {
  it('合并连续空行为段落分隔', () => {
    const result = formatAsNovelText('段落一\n\n\n\n段落二');
    expect(result).toBe('段落一\n段落二');
  });
  it('保留有效段落', () => {
    const result = formatAsNovelText('第一段\n\n第二段\n\n第三段');
    expect(result).toBe('第一段\n第二段\n第三段');
  });
});

describe('stripHeadingLineFromText — 去除重复标题行', () => {
  it('去除与章节标题相同的首行', () => {
    const result = stripHeadingLineFromText('第一章 开端\n正文内容', '第一章 开端');
    expect(result).toContain('正文内容');
    expect(result).not.toContain('第一章 开端');
  });
  it('去除"第N章"格式的首行', () => {
    const result = stripHeadingLineFromText('第 3 章\n正文', '其他标题');
    expect(result.trim()).toBe('正文');
  });
  it('不去除非标题首行', () => {
    const result = stripHeadingLineFromText('这是正文开头\n后续内容', '第一章');
    expect(result).toContain('这是正文开头');
  });
});
