import { describe, it, expect } from 'vitest';
import { parseJsonLoosely } from '../src/utils/jsonParse';

describe('parseJsonLoosely — 宽松 JSON 解析（智能整理/拆书兜底）', () => {
  it('标准 JSON 正常解析', () => {
    const result = parseJsonLoosely<{ name: string }>('{"name":"测试"}');
    expect(result.name).toBe('测试');
  });

  it('带 markdown 代码块包裹', () => {
    const input = '```json\n{"key":"value"}\n```';
    const result = parseJsonLoosely<{ key: string }>(input);
    expect(result.key).toBe('value');
  });

  it('前后有废话文本，提取中间 JSON', () => {
    const input = '好的，以下是分析结果：\n{"analysis":"完成"}\n希望对你有帮助。';
    const result = parseJsonLoosely<{ analysis: string }>(input);
    expect(result.analysis).toBe('完成');
  });

  it('嵌套 JSON 对象正确提取', () => {
    const input = '结果如下：{"outer":{"inner":"value"},"list":[1,2,3]}';
    const result = parseJsonLoosely<{ outer: { inner: string }; list: number[] }>(input);
    expect(result.outer.inner).toBe('value');
    expect(result.list).toEqual([1, 2, 3]);
  });

  it('数组格式 JSON', () => {
    const input = '[{"id":1},{"id":2}]';
    const result = parseJsonLoosely<Array<{ id: number }>>(input);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
  });

  it('空字符串抛出错误', () => {
    expect(() => parseJsonLoosely('')).toThrow('JSON_PARSE_EMPTY');
  });

  it('完全无 JSON 内容抛出错误', () => {
    expect(() => parseJsonLoosely('这里没有任何JSON内容')).toThrow();
  });

  it('含转义字符的 JSON', () => {
    const input = '{"text":"包含\\"引号\\"的内容"}';
    const result = parseJsonLoosely<{ text: string }>(input);
    expect(result.text).toContain('引号');
  });
});
