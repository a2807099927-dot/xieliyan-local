// parseJsonLoosely 回归测试
//
// 目的：AI 返回值解析是全项目最高频的故障点（模型多输出一个 ``` 或加一句前言就崩）。
// 这些用例锁定当前已验证的宽容行为，作为后续把 29 处裸 JSON.parse 收口到此函数的安全网。

import { describe, it, expect } from 'vitest';
import { parseJsonLoosely } from '../jsonParse';

describe('parseJsonLoosely', () => {
  it('直接解析合法 JSON 对象与数组', () => {
    expect(parseJsonLoosely('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoosely('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('容忍首尾空白', () => {
    expect(parseJsonLoosely('   {"a":1}\n\n ')).toEqual({ a: 1 });
  });

  it('剥离 ```json 代码围栏', () => {
    expect(parseJsonLoosely('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('剥离无语言标记的 ``` 围栏', () => {
    expect(parseJsonLoosely('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('忽略模型加在前面的自然语言前言', () => {
    expect(parseJsonLoosely('好的，结果如下：{"a":1}')).toEqual({ a: 1 });
  });

  it('忽略模型加在后面的收尾语', () => {
    expect(parseJsonLoosely('{"a":1}\n希望对你有帮助！')).toEqual({ a: 1 });
  });

  it('不被字符串内的花括号误导', () => {
    expect(parseJsonLoosely('{"text":"a}b"}')).toEqual({ text: 'a}b' });
    expect(parseJsonLoosely('前言 {"text":"a}b"} 后语')).toEqual({ text: 'a}b' });
  });

  it('不被转义引号误导', () => {
    expect(parseJsonLoosely('前言 {"text":"say \\"hi\\" }"}')).toEqual({
      text: 'say "hi" }',
    });
  });

  it('能从前言中提取数组', () => {
    expect(parseJsonLoosely('结果：[1,2]')).toEqual([1, 2]);
  });

  it('支持嵌套结构', () => {
    expect(
      parseJsonLoosely('```json\n{"outer":{"inner":[{"k":"v"}]}}\n```'),
    ).toEqual({ outer: { inner: [{ k: 'v' }] } });
  });

  it('空输入抛 JSON_PARSE_EMPTY', () => {
    expect(() => parseJsonLoosely('')).toThrow('JSON_PARSE_EMPTY');
    expect(() => parseJsonLoosely('   ')).toThrow('JSON_PARSE_EMPTY');
  });

  it('完全不含 JSON 时抛 JSON_PARSE_NO_OBJECT', () => {
    expect(() => parseJsonLoosely('抱歉，我无法完成该请求。')).toThrow(
      'JSON_PARSE_NO_OBJECT',
    );
  });
});
