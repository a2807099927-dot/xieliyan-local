import { describe, it, expect } from 'vitest';
import { parseOutlineFromResponse, hasOutlineMarker } from '../src/Agent/outlineParser';

// ─── 标准格式 【大纲】...【/大纲】 ──────────────────────────────────────────────

describe('parseOutlineFromResponse — 标准格式', () => {
  it('解析完整标准格式（含细纲/情绪/钩子）', () => {
    const text = `
好的，这是大纲：
【大纲】
【第1章】暗夜潜行
【细纲】主角潜入敌营，发现秘密文件。【/细纲】
【情绪节点】紧张→惊讶【/情绪节点】
【收尾钩子】文件中出现了主角父亲的名字。【/收尾钩子】

【第2章】真相浮出
【细纲】主角开始调查父亲的过去。【/细纲】
【/大纲】
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].chapterNumber).toBe(1);
    expect(result.chapters[0].title).toBe('暗夜潜行');
    expect(result.chapters[0].outline).toBe('主角潜入敌营，发现秘密文件。');
    expect(result.chapters[0].emotionNode).toBe('紧张→惊讶');
    expect(result.chapters[0].endingHook).toBe('文件中出现了主角父亲的名字。');
    expect(result.chapters[1].chapterNumber).toBe(2);
    expect(result.chapters[1].title).toBe('真相浮出');
    expect(result.chapters[1].emotionNode).toBeUndefined();
  });

  it('标题超过20字自动截断', () => {
    const text = `【大纲】【第1章】这是一个非常非常非常非常非常非常长的标题超过二十字了哦
【细纲】内容【/细纲】
【第2章】短标题
【细纲】内容2【/细纲】【/大纲】`;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters[0].title.length).toBeLessThanOrEqual(20);
  });

  it('Markdown 加粗包裹的标记也能识别', () => {
    const text = `**【大纲】**
【第1章】标题一
【细纲】内容一【/细纲】
【第2章】标题二
【细纲】内容二【/细纲】
**【/大纲】**`;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
  });
});

// ─── 数字分段格式 ─────────────────────────────────────────────────────────────

describe('parseOutlineFromResponse — 数字分段格式', () => {
  it('解析 "1. 标题\\n内容" 格式', () => {
    const text = `
1. 暗夜潜行
主角潜入敌营，发现秘密。

2. 真相浮出
主角开始调查真相。

3. 最终对决
主角与反派正面交锋。
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(3);
    expect(result.chapters[0].chapterNumber).toBe(1);
    expect(result.chapters[0].title).toBe('暗夜潜行');
    expect(result.chapters[2].chapterNumber).toBe(3);
  });

  it('解析 "1、标题" 中文顿号格式', () => {
    const text = `
1、暗夜潜行
内容一

2、真相浮出
内容二
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
  });

  it('标题含冒号时分离标题和细纲', () => {
    const text = `
1. 暗夜潜行：主角偷偷潜入
详细描述...

2. 真相浮出：发现关键证据
详细描述...
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters[0].title).toBe('暗夜潜行');
    expect(result.chapters[0].outline).toContain('主角偷偷潜入');
  });

  it('只有1个分段不算大纲', () => {
    const text = `1. 唯一章节\n内容`;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(false);
    expect(result.chapters).toHaveLength(0);
  });
});

// ─── 中文章节格式 ─────────────────────────────────────────────────────────────

describe('parseOutlineFromResponse — 中文章节格式', () => {
  it('解析 "第一章 标题" 中文数字格式', () => {
    const text = `
第一章 暗夜潜行
主角潜入敌营。

第二章 真相浮出
主角调查真相。
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].chapterNumber).toBe(1);
    expect(result.chapters[1].chapterNumber).toBe(2);
  });

  it('解析 "第1章 标题" 阿拉伯数字格式', () => {
    const text = `
第1章 暗夜潜行
内容一

第2章 真相浮出
内容二
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters[0].chapterNumber).toBe(1);
    expect(result.chapters[1].chapterNumber).toBe(2);
  });

  it('支持带冒号的格式 "第三章：标题"', () => {
    const text = `
第一章：暗夜潜行
内容一

第二章：真相浮出
内容二
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
  });

  it('支持大中文数字 "第二十五章"', () => {
    const text = `
第二十五章 暗夜潜行
内容一

第二十六章 真相浮出
内容二
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters[0].chapterNumber).toBe(25);
    expect(result.chapters[1].chapterNumber).toBe(26);
  });

  it('支持 "节" 和 "回" 关键字', () => {
    const text = `
第一回 暗夜潜行
内容一

第二回 真相浮出
内容二
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters).toHaveLength(2);
  });
});

// ─── 边界情况 ─────────────────────────────────────────────────────────────────

describe('parseOutlineFromResponse — 边界情况', () => {
  it('空字符串返回失败', () => {
    expect(parseOutlineFromResponse('').success).toBe(false);
  });

  it('null/undefined 返回失败', () => {
    expect(parseOutlineFromResponse(null as any).success).toBe(false);
    expect(parseOutlineFromResponse(undefined as any).success).toBe(false);
  });

  it('纯文本无结构返回失败', () => {
    expect(parseOutlineFromResponse('这是一段纯文本，没有任何大纲标记。').success).toBe(false);
  });

  it('标准格式优先于数字格式', () => {
    const text = `
1. 这不该被解析

【大纲】
【第1章】真正的标题
【细纲】真正的内容【/细纲】
【第2章】第二章标题
【细纲】第二章内容【/细纲】
【/大纲】
    `;
    const result = parseOutlineFromResponse(text);
    expect(result.success).toBe(true);
    expect(result.chapters[0].title).toBe('真正的标题');
  });
});

// ─── hasOutlineMarker ─────────────────────────────────────────────────────────

describe('hasOutlineMarker', () => {
  it('检测标准格式', () => {
    expect(hasOutlineMarker('【大纲】内容【/大纲】')).toBe(true);
  });

  it('检测数字分段（需至少2个）', () => {
    expect(hasOutlineMarker('1. 标题\n2. 标题')).toBe(true);
    expect(hasOutlineMarker('1. 只有一个')).toBe(false);
  });

  it('检测中文章节', () => {
    expect(hasOutlineMarker('第一章 标题\n第二章 标题')).toBe(true);
  });

  it('空字符串返回 false', () => {
    expect(hasOutlineMarker('')).toBe(false);
  });
});
