// outlineParser 回归测试
//
// 目的：自动工坊的“出纲 -> 批量建章”链路完全依赖这个解析器，
// 模型输出格式飘一点就会造成“有标题无细纲”的空卡。
// 下面的用例锁定三种已支持格式与兵家兼容行为，作为拆分 orchestrator 前的安全网。

import { describe, it, expect } from 'vitest';
import { parseOutlineFromResponse, hasOutlineMarker } from '../outlineParser';

describe('parseOutlineFromResponse - 标准格式【大纲】', () => {
  const standard = [
    '【大纲】',
    '【第1章】初入江湖',
    '【细纲】少年下山，遇见酒仙。【/细纲】',
    '【情绪节点】期待【/情绪节点】',
    '【收尾钩子】酒仙递来一壶酒。【/收尾钩子】',
    '【第2章】酒中乾坤',
    '【细纲】少年饮下第一口酒。【/细纲】',
    '【/大纲】',
  ].join('\n');

  it('解析出全部章节与字段', () => {
    const result = parseOutlineFromResponse(standard);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);

    expect(result.chapters[0]).toEqual({
      chapterNumber: 1,
      title: '初入江湖',
      outline: '少年下山，遇见酒仙。',
      emotionNode: '期待',
      endingHook: '酒仙递来一壶酒。',
    });
  });

  it('缺失的可选字段为 undefined 而不是空字符串', () => {
    const result = parseOutlineFromResponse(standard);
    expect(result.chapters[1].chapterNumber).toBe(2);
    expect(result.chapters[1].title).toBe('酒中乾坤');
    expect(result.chapters[1].emotionNode).toBeUndefined();
    expect(result.chapters[1].endingHook).toBeUndefined();
  });

  it('保留原始大纲文本', () => {
    const result = parseOutlineFromResponse(standard);
    expect(result.rawOutlineText).toContain('【第1章】初入江湖');
  });

  it('模型漏写【细纲】时，用标题后正文兜底（不产生空卡）', () => {
    const missingTag = [
      '【大纲】',
      '【第1章】孤身北上',
      '主角独自北上，路遇风雪。',
      '【/大纲】',
    ].join('\n');

    const result = parseOutlineFromResponse(missingTag);
    expect(result.success).toBe(true);
    expect(result.chapters[0].title).toBe('孤身北上');
    expect(result.chapters[0].outline).toBe('主角独自北上，路遇风雪。');
  });

  it('标题超长时截断到 20 字', () => {
    const longTitle = '一'.repeat(30);
    const result = parseOutlineFromResponse(
      `【大纲】\n【第1章】${longTitle}\n【细纲】内容。【/细纲】\n【/大纲】`,
    );
    expect(result.chapters[0].title).toHaveLength(20);
  });
});

describe('parseOutlineFromResponse - 中文章节格式', () => {
  it('识别中文数字章号并转为阿拉伯数字', () => {
    const text = '第一章 起始\n少年下山。\n\n第二章 征途\n踏上旅途。';
    const result = parseOutlineFromResponse(text);

    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters.map((c) => c.chapterNumber)).toEqual([1, 2]);
    expect(result.chapters.map((c) => c.title)).toEqual(['起始', '征途']);
  });

  it('识别阿拉伯数字章号', () => {
    const text = '第1章 起始\n少年下山。\n\n第2章 征途\n踏上旅途。';
    const result = parseOutlineFromResponse(text);

    expect(result.success).toBe(true);
    expect(result.chapters.map((c) => c.chapterNumber)).toEqual([1, 2]);
  });

  it('只有单章时不误判为大纲', () => {
    const result = parseOutlineFromResponse('第一章 起始\n少年下山。');
    expect(result.success).toBe(false);
    expect(result.chapters).toHaveLength(0);
  });
});

describe('parseOutlineFromResponse - 数字分段格式', () => {
  it('识别 “1. 标题” 形式的多段大纲', () => {
    const text = '1. 初入江湖\n少年下山。\n\n2. 酒中乾坤\n少年饮酒。';
    const result = parseOutlineFromResponse(text);

    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters.map((c) => c.chapterNumber)).toEqual([1, 2]);
    expect(result.chapters.map((c) => c.title)).toEqual(['初入江湖', '酒中乾坤']);
  });

  it('标题里的冒号后内容归入细纲而不丢弃', () => {
    const text = '1. 初入江湖：少年下山\n遇见酒仙。\n\n2. 酒中乾坤：饮下第一口\n酒入喉喉。';
    const result = parseOutlineFromResponse(text);

    expect(result.chapters[0].title).toBe('初入江湖');
    expect(result.chapters[0].outline).toContain('少年下山');
  });
});

describe('parseOutlineFromResponse - 兵家兼容', () => {
  it('空值与非字符串安全返回失败结果', () => {
    for (const bad of ['', null, undefined, 123, {}]) {
      const result = parseOutlineFromResponse(bad as unknown as string);
      expect(result.success).toBe(false);
      expect(result.chapters).toEqual([]);
      expect(result.rawOutlineText).toBe('');
    }
  });

  it('普通聊天回复不会被误认为大纲', () => {
    const result = parseOutlineFromResponse('好的，我明白了，接下来我会帮你写。');
    expect(result.success).toBe(false);
  });

  it('【大纲】标签内为空时不产生空章节', () => {
    const result = parseOutlineFromResponse('【大纲】【/大纲】');
    expect(result.success).toBe(false);
    expect(result.chapters).toEqual([]);
  });
});

describe('hasOutlineMarker', () => {
  it('标准格式成对标签时返回 true', () => {
    expect(hasOutlineMarker('【大纲】【第1章】标题【/大纲】')).toBe(true);
  });

  it('空值返回 false', () => {
    expect(hasOutlineMarker('')).toBe(false);
  });
});

describe('parseOutlineFromResponse - 思考链剥离', () => {
  it('【大纲】标签前有思考段，解析后章纲不含思考', () => {
    const raw = `好的，我先分析一下这一章的剧情走向，主角要在这里完成第一次突破。
【大纲】
【第1章】初入江湖
【细纲】少年下山，遇见酒仙。【/细纲】
【/大纲】`;
    const result = parseOutlineFromResponse(raw);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].outline).toBe('少年下山，遇见酒仙。');
    expect(result.chapters[0].outline).not.toContain('我先分析');
  });

  it('<think> 标签内的思考被剥掉，不影响章纲解析', () => {
    const raw = `<thinking>用户要 5 章，我规划一下节拍。</thinking>
【大纲】
【第1章】初入江湖
【细纲】少年下山，遇见酒仙。【/细纲】
【第2章】酒中乾坤
【细纲】少年饮下第一口酒。【/细纲】
【/大纲】`;
    const result = parseOutlineFromResponse(raw);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('初入江湖');
  });
});
