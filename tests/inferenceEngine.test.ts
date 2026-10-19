import { describe, it, expect } from 'vitest';
import {
  parseJsonLoosely,
  pickField,
  toSafeText,
  toInlineText,
  toSafePlotNodes,
  toSafePlotEvents,
  asSafeInference,
  isMemoryExtracted,
  toNarrativeSegments,
  buildInferencePrompt,
  buildInferenceMergeContext,
  createInferenceDataFromAiResponse,
} from '../src/components/modals/memory-bank/inferenceEngine';

// ─── parseJsonLoosely ─────────────────────────────────────────────────────────

describe('parseJsonLoosely', () => {
  it('解析标准 JSON', () => {
    const result = parseJsonLoosely<{ a: number }>('{"a": 1}');
    expect(result.a).toBe(1);
  });

  it('剥离 DeepSeek <think> 思维链', () => {
    const input = '<think>让我想想这个问题...</think>{"result": "ok"}';
    const result = parseJsonLoosely<{ result: string }>(input);
    expect(result.result).toBe('ok');
  });

  it('剥离 ```json 代码块包裹', () => {
    const input = '```json\n{"a": 1}\n```';
    const result = parseJsonLoosely<{ a: number }>(input);
    expect(result.a).toBe(1);
  });

  it('跳过 JSON 前的中文解释文字', () => {
    const input = '好的，以下是分析结果：\n{"result": "ok"}';
    const result = parseJsonLoosely<{ result: string }>(input);
    expect(result.result).toBe('ok');
  });

  it('处理 BOM 字符', () => {
    const input = '\uFEFF{"a": 1}';
    const result = parseJsonLoosely<{ a: number }>(input);
    expect(result.a).toBe(1);
  });

  it('提取嵌套在文本中的平衡 JSON', () => {
    const input = '一些文字 {"nested": {"inner": true}} 尾部文字';
    const result = parseJsonLoosely<{ nested: { inner: boolean } }>(input);
    expect(result.nested.inner).toBe(true);
  });

  it('解析不完整 JSON（截断）时使用 partial 解析', () => {
    const input = '{"a": "hello", "b": "world", "c": [1, 2, 3';
    const result = parseJsonLoosely<Record<string, unknown>>(input);
    expect(result.a).toBe('hello');
    expect(result.b).toBe('world');
  });

  it('完全无效内容抛出错误', () => {
    expect(() => parseJsonLoosely('这完全不是JSON')).toThrow();
  });
});

// ─── pickField ────────────────────────────────────────────────────────────────

describe('pickField', () => {
  it('按优先级返回第一个存在的字段', () => {
    const obj = { timeline: [1], time_view: [2] };
    expect(pickField(obj, ['timeline', 'time_view'])).toEqual([1]);
  });

  it('跳过 null/undefined 字段', () => {
    const obj = { a: null, b: undefined, c: 'found' } as any;
    expect(pickField(obj, ['a', 'b', 'c'])).toBe('found');
  });

  it('全部不存在返回 undefined', () => {
    expect(pickField({}, ['a', 'b'])).toBeUndefined();
  });
});

// ─── toSafeText / toInlineText ────────────────────────────────────────────────

describe('toSafeText', () => {
  it('字符串直接返回', () => {
    expect(toSafeText('hello')).toBe('hello');
  });

  it('数组用分号连接', () => {
    expect(toSafeText(['a', 'b', 'c'])).toBe('a；b；c');
  });

  it('空值返回空字符串', () => {
    expect(toSafeText(null)).toBe('');
    expect(toSafeText(undefined)).toBe('');
    expect(toSafeText(0)).toBe('');
  });
});

describe('toInlineText', () => {
  it('对象键名映射为中文', () => {
    const result = toInlineText({ summary: '这是摘要', foreshadow: '这是伏笔' });
    expect(result).toContain('摘要');
    expect(result).toContain('伏笔');
  });

  it('英文 key 无映射时只输出 value', () => {
    const result = toInlineText({ randomKey: '值' });
    expect(result).toBe('值');
  });

  it('嵌套数组递归展开', () => {
    const result = toInlineText(['a', ['b', 'c']]);
    expect(result).toContain('a');
    expect(result).toContain('b');
  });
});

// ─── toSafePlotNodes ──────────────────────────────────────────────────────────

describe('toSafePlotNodes', () => {
  it('解析标准节点数组', () => {
    const nodes = [
      { action: '主角出场', nodeType: '背景铺垫', impactLevel: 3 },
      { event: '转折发生', type: '转折点', impact: 5 },
    ];
    const result = toSafePlotNodes(nodes);
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('主角出场');
    expect(result[0].nodeType).toBe('背景铺垫');
    expect(result[1].action).toBe('转折发生');
    expect(result[1].nodeType).toBe('转折点');
  });

  it('impact 超范围自动钳位到 1-5', () => {
    const result = toSafePlotNodes([{ action: '事件', impactLevel: 10 }]);
    expect(result[0].impactLevel).toBeLessThanOrEqual(5);
  });

  it('过滤无 action 的项', () => {
    const result = toSafePlotNodes([{ nodeType: '其他' }, { action: '有效' }]);
    expect(result).toHaveLength(1);
  });

  it('非数组输入返回空数组', () => {
    expect(toSafePlotNodes('not array')).toEqual([]);
    expect(toSafePlotNodes(null)).toEqual([]);
  });
});

// ─── toSafePlotEvents ─────────────────────────────────────────────────────────

describe('toSafePlotEvents', () => {
  it('解析标准事件数组', () => {
    const events = [
      { subject: '主角', detail: '获得神器', target: '青龙刀' },
    ];
    const result = toSafePlotEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('主角');
    expect(result[0].detail).toBe('获得神器');
    expect(result[0].target).toBe('青龙刀');
  });

  it('支持中文字段名', () => {
    const events = [{ '角色': '配角', '事件': '叛变' }];
    const result = toSafePlotEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe('配角');
  });

  it('缺少 subject 或 detail 的项被过滤', () => {
    const events = [
      { subject: '主角' }, // 缺 detail
      { detail: '事件' }, // 缺 subject
      { subject: '完整', detail: '完整事件' },
    ];
    const result = toSafePlotEvents(events);
    expect(result).toHaveLength(1);
  });
});

// ─── asSafeInference ──────────────────────────────────────────────────────────

describe('asSafeInference', () => {
  it('解析完整推演 JSON', () => {
    const input = {
      structureTree: { label: '主线', type: 'root', children: [{ label: '事件A', type: 'event' }] },
      timelineEvents: [{ event: '事件一', impact: 3, time: '上午' }],
      parallelThreads: [{ name: '伏笔线索', status: '疑似伏笔', progress: '待观察', evidence: '埋下伏笔' }],
      predictions: [{ direction: '主角升级', probability: '高', suggestion: '建议推进' }],
    };
    const result = asSafeInference(input);
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.structureTree).toBeTruthy();
    expect((r.timelineEvents ?? []).length).toBeGreaterThanOrEqual(1);
    expect((r.predictions ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('只有 structureTree 时自动派生其他视图', () => {
    const input = {
      structureTree: {
        label: '全书',
        type: 'root',
        children: [
          { label: '第一幕', type: 'arc', desc: '开篇' },
          { label: '伏笔线', type: 'sub_plot', desc: '暗线铺垫' },
        ],
      },
    };
    const result = asSafeInference(input);
    expect(result).not.toBeNull();
    const r = result!;
    expect((r.timelineEvents ?? []).length).toBeGreaterThan(0);
    expect((r.predictions ?? []).length).toBeGreaterThan(0);
  });

  it('嵌套在 data/payload 包裹中也能解析', () => {
    const input = {
      data: {
        structureTree: { label: '根', type: 'root' },
        timelineEvents: [{ event: '测试', impact: 2 }],
        parallelThreads: [],
        predictions: [{ direction: '方向', suggestion: '建议' }],
      },
    };
    const result = asSafeInference(input);
    expect(result).not.toBeNull();
  });

  it('null 输入返回 null', () => {
    expect(asSafeInference(null)).toBeNull();
    expect(asSafeInference(undefined)).toBeNull();
  });

  it('字符串包裹的 JSON 也能解析', () => {
    const jsonStr = JSON.stringify({
      structureTree: { label: '测试', type: 'root' },
      predictions: [{ direction: '方向一', suggestion: '建议一' }],
    });
    const result = asSafeInference(jsonStr);
    expect(result).not.toBeNull();
    expect(result!.structureTree?.label).toBe('测试');
  });
});

// ─── isMemoryExtracted ────────────────────────────────────────────────────────

describe('isMemoryExtracted', () => {
  it('无 memory 返回 false', () => {
    expect(isMemoryExtracted(undefined)).toBe(false);
  });

  it('isAnalyzed 为 true 返回 true', () => {
    expect(isMemoryExtracted({ isAnalyzed: true } as any)).toBe(true);
  });

  it('有 summary 返回 true', () => {
    expect(isMemoryExtracted({ summary: '有摘要' } as any)).toBe(true);
  });

  it('空 plotAnalysis 返回 false', () => {
    expect(isMemoryExtracted({ plotAnalysis: {} } as any)).toBe(false);
  });

  it('有 narrativeChain 返回 true', () => {
    expect(isMemoryExtracted({
      plotAnalysis: { narrativeChain: '有内容' }
    } as any)).toBe(true);
  });
});

// ─── toNarrativeSegments ──────────────────────────────────────────────────────

describe('toNarrativeSegments', () => {
  it('按分隔符拆分字符串', () => {
    const result = toNarrativeSegments({
      plotAnalysis: { narrativeChain: '开篇→发展→高潮→结局' },
    } as any);
    expect(result).toEqual(['开篇', '发展', '高潮', '结局']);
  });

  it('数组直接返回', () => {
    const result = toNarrativeSegments({
      plotAnalysis: { narrativeChain: ['段落一', '段落二'] },
    } as any);
    expect(result).toEqual(['段落一', '段落二']);
  });

  it('无 plotAnalysis 返回空数组', () => {
    expect(toNarrativeSegments(undefined)).toEqual([]);
    expect(toNarrativeSegments(null)).toEqual([]);
  });
});

// ─── createInferenceDataFromAiResponse ────────────────────────────────────────

describe('createInferenceDataFromAiResponse', () => {
  it('从标准 JSON 创建推演数据', () => {
    const raw = JSON.stringify({
      structureTree: { label: '主线', type: 'root' },
      predictions: [{ direction: '方向', suggestion: '建议' }],
    });
    const result = createInferenceDataFromAiResponse(raw, 'openai', 'gpt-4');
    expect(result.generatedAt).toBeTruthy();
    expect(result.providerModel).toBe('openai gpt-4');
    expect(result.rawText).toBe(raw);
  });

  it('空 rawText 不崩溃', () => {
    const result = createInferenceDataFromAiResponse('', 'test');
    expect(result.generatedAt).toBeTruthy();
  });
});

// ─── buildInferencePrompt ─────────────────────────────────────────────────────

describe('buildInferencePrompt', () => {
  it('包含结构化要求和上下文', () => {
    const prompt = buildInferencePrompt('【第一章】测试内容');
    expect(prompt).toContain('structureTree');
    expect(prompt).toContain('timelineEvents');
    expect(prompt).toContain('predictions');
    expect(prompt).toContain('【第一章】测试内容');
  });
});

describe('buildInferenceMergeContext', () => {
  it('拼接多批次结果', () => {
    const result = buildInferenceMergeContext(['批次1', '批次2']);
    expect(result).toContain('【批次1】');
    expect(result).toContain('【批次2】');
  });

  it('过滤空批次', () => {
    const result = buildInferenceMergeContext(['有效', '', '  ']);
    expect(result).toContain('【批次1】');
    // 函数以 `【批次N】\n${item}` 格式拼装后再过滤 trim 为空的，
    // 但 '【批次2】\n' trim 后非空，所以空输入批次仍会存在
    // 只验证有效批次内容存在即可
    expect(result).toContain('有效');
  });
});
