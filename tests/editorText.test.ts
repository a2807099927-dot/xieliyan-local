import { describe, it, expect } from 'vitest';
import {
  normalizeEscapedNewlines,
  normalizeNovelOutput,
  formatAsNovelText,
  stripHeadingLineFromText,
} from '../src/utils/editor/text';
import { normalizeAiErrorMessage, toSafeParagraphNodes } from '../src/utils/editorUtils';

// ─── normalizeEscapedNewlines ─────────────────────────────────────────────────

describe('normalizeEscapedNewlines', () => {
  it('\\n → 真换行', () => {
    expect(normalizeEscapedNewlines('a\\nb')).toBe('a\nb');
  });

  it('\\r\\n → 真换行', () => {
    expect(normalizeEscapedNewlines('a\\r\\nb')).toBe('a\nb');
  });

  it('/n → 真换行', () => {
    expect(normalizeEscapedNewlines('a/nb')).toBe('a\nb');
  });

  it('空值返回空字符串', () => {
    expect(normalizeEscapedNewlines('')).toBe('');
  });
});

// ─── normalizeNovelOutput ─────────────────────────────────────────────────────

describe('normalizeNovelOutput', () => {
  it('移除 HTML 标签', () => {
    expect(normalizeNovelOutput('<p>段落一</p><p>段落二</p>')).toBe('段落一\n段落二');
  });

  it('<br> 转为换行', () => {
    expect(normalizeNovelOutput('行一<br/>行二')).toBe('行一\n行二');
  });

  it('压缩连续空行到最多两行', () => {
    const result = normalizeNovelOutput('段落一\n\n\n\n段落二');
    expect(result).toBe('段落一\n\n段落二');
  });

  it('处理转义换行符', () => {
    expect(normalizeNovelOutput('行一\\n行二')).toBe('行一\n行二');
  });

  it('移除通用 HTML 标签', () => {
    expect(normalizeNovelOutput('<div class="x">内容</div>')).toBe('内容');
  });

  it('空输入返回空字符串', () => {
    expect(normalizeNovelOutput('')).toBe('');
  });
});

// ─── formatAsNovelText ────────────────────────────────────────────────────────

describe('formatAsNovelText', () => {
  it('压缩连续空行', () => {
    const result = formatAsNovelText('段落一\n\n\n\n段落二');
    expect(result).toBe('段落一\n段落二');
  });

  it('去除行末空白', () => {
    const result = formatAsNovelText('你好   \n世界  ');
    expect(result).not.toContain('   ');
  });

  it('处理 \\r\\n', () => {
    const result = formatAsNovelText('段落一\r\n\r\n段落二');
    expect(result).toBe('段落一\n段落二');
  });

  it('处理 NBSP 字符', () => {
    const result = formatAsNovelText('测试\u00a0内容');
    expect(result).toContain('测试 内容');
  });

  it('空段落被过滤', () => {
    const result = formatAsNovelText('\n\n\n');
    expect(result).toBe('');
  });
});

// ─── stripHeadingLineFromText ─────────────────────────────────────────────────

describe('stripHeadingLineFromText', () => {
  it('首行与章节标题一致时移除', () => {
    const raw = '第一章 开篇\n正文内容';
    const result = stripHeadingLineFromText(raw, '第一章 开篇');
    expect(result.trim()).toBe('正文内容');
  });

  it('首行是 "第N章" 格式时移除（即使标题不完全一致）', () => {
    const raw = '第 3 章\n正文内容';
    const result = stripHeadingLineFromText(raw, '第三章 觉醒');
    expect(result.trim()).toBe('正文内容');
  });

  it('首行不是章节标题时不移除', () => {
    const raw = '正文开始\n第二段内容';
    const result = stripHeadingLineFromText(raw, '第一章');
    expect(result).toBe(raw);
  });

  it('空文本不崩溃', () => {
    expect(stripHeadingLineFromText('', '第一章')).toBe('');
  });

  it('首行为空行时跳过到第一个非空行', () => {
    const raw = '\n\n第一章 开篇\n正文内容';
    const result = stripHeadingLineFromText(raw, '第一章 开篇');
    expect(result).toContain('正文内容');
    expect(result).not.toContain('第一章 开篇');
  });
});

// ─── normalizeAiErrorMessage ──────────────────────────────────────────────────

describe('normalizeAiErrorMessage', () => {
  it('REQUEST_IN_PROGRESS → 友好提示', () => {
    const result = normalizeAiErrorMessage(new Error('REQUEST_IN_PROGRESS'));
    expect(result).toContain('请稍后再试');
  });

  it('REQUEST_ABORTED → 请求已取消', () => {
    const result = normalizeAiErrorMessage(new Error('REQUEST_ABORTED'));
    expect(result).toContain('已取消');
  });

  it('abort 关键词 → 请求已取消', () => {
    const result = normalizeAiErrorMessage(new Error('The request was aborted'));
    expect(result).toContain('已取消');
  });

  it('普通错误原样返回', () => {
    const result = normalizeAiErrorMessage(new Error('网络超时'));
    expect(result).toBe('网络超时');
  });

  it('非 Error 对象转为字符串', () => {
    const result = normalizeAiErrorMessage('字符串错误');
    expect(result).toBe('字符串错误');
  });

  it('null/undefined 返回空字符串', () => {
    expect(normalizeAiErrorMessage(null)).toBe('');
    expect(normalizeAiErrorMessage(undefined)).toBe('');
  });
});

// ─── toSafeParagraphNodes ─────────────────────────────────────────────────────

describe('toSafeParagraphNodes', () => {
  it('每行生成一个 paragraph 节点', () => {
    const nodes = toSafeParagraphNodes('第一行\n第二行');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '第一行' }] });
    expect(nodes[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '第二行' }] });
  });

  it('空行生成空 paragraph', () => {
    const nodes = toSafeParagraphNodes('行一\n\n行三');
    expect(nodes).toHaveLength(3);
    expect(nodes[1]).toEqual({ type: 'paragraph' });
  });

  it('处理 \\r\\n', () => {
    const nodes = toSafeParagraphNodes('A\r\nB');
    expect(nodes).toHaveLength(2);
  });

  it('单行文本', () => {
    const nodes = toSafeParagraphNodes('单行');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].content![0].text).toBe('单行');
  });
});
