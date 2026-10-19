import { describe, it, expect } from 'vitest';
import { stripPreAmble, normalizeChinesePunctuation } from '../src/Agent/useAgentSession';

// ─── stripPreAmble ────────────────────────────────────────────────────────────

describe('stripPreAmble', () => {
  it('空文本原样返回', () => {
    expect(stripPreAmble('')).toBe('');
    expect(stripPreAmble('   ')).toBe('   ');
  });

  it('纯正文无废话直接返回', () => {
    const text = '李云天猛地睁开了眼，周围一片漆黑。';
    expect(stripPreAmble(text)).toBe(text);
  });

  it('截掉 # 第N章 之前的分析废话', () => {
    const text = [
      '好的，我来分析一下用户的需求。',
      '首先，用户希望写一段战斗场景。',
      '# 第三章 暗夜追杀',
      '李云天猛地翻身躲过一刀。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('第三章');
    expect(result).toContain('李云天');
    expect(result).not.toContain('好的');
  });

  it('截掉 "好的，" 开头的废话', () => {
    const text = [
      '好的，我将按照规则来写。',
      '根据用户指令，本章需要写一段打斗。',
      '李云天缓缓站起身来。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('李云天');
    expect(result).not.toContain('好的');
  });

  it('截掉 "用户要求" 开头的废话', () => {
    const text = [
      '用户要求写一段主角觉醒的情节。',
      '我需要先分析一下当前的剧情走向。',
      '夜色如墨，李云天独自站在山巅。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('夜色如墨');
    expect(result).not.toContain('用户要求');
  });

  it('截掉 "首先/其次/然后" 开头的废话', () => {
    const text = [
      '首先，我来构建场景。',
      '其次，需要安排人物。',
      '黎明前最黑暗的时刻，一声巨响划破长空。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('黎明前');
    expect(result).not.toContain('首先');
  });

  it('截掉 "我需要/我决定" 开头的废话', () => {
    const text = [
      '我需要设计一段主角反击的场景。',
      '街角的咖啡馆里，灯光昏暗。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('咖啡馆');
  });

  it('截掉 "根据规则/法则" 开头的废话', () => {
    const text = [
      '根据用户的指令要求，需要体现信息差。',
      '第一法则要求极限铺垫。',
      '天空阴沉，暴风雨即将来临。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('天空阴沉');
  });

  it('截掉模型自述生成计划的废话', () => {
    const text = [
      '好的，我将为您生成正文。',
      '预计生成约3000字。',
      '月光下的庭院静谧无声。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('月光下');
  });

  it('如果全是废话则返回原文（保底策略）', () => {
    const text = '好的，我来分析。';
    // 只有一行废话，没有正文段落 → firstProseIndex = -1 → 返回原文
    expect(stripPreAmble(text)).toBe(text);
  });

  it('第一行就是正文则不截', () => {
    const text = [
      '大雨滂沱，雷声轰鸣。',
      '好的，这是分析。', // 这行在正文之后，不影响
    ].join('\n');
    expect(stripPreAmble(text)).toBe(text);
  });

  it('支持中文大写数字的章节标记', () => {
    const text = [
      '思考：需要写一段情节。',
      '## 第二十五章 绝地反击',
      '拳风呼啸而至。',
    ].join('\n');
    const result = stripPreAmble(text);
    expect(result).toContain('第二十五章');
    expect(result).not.toContain('思考');
  });
});

// ─── normalizeChinesePunctuation ──────────────────────────────────────────────

describe('normalizeChinesePunctuation', () => {
  it('空文本原样返回', () => {
    expect(normalizeChinesePunctuation('')).toBe('');
  });

  it('英文双引号 → 中文双引号', () => {
    expect(normalizeChinesePunctuation('"你好"')).toBe('\u201c你好\u201d');
  });

  it('英文单引号 → 中文单引号', () => {
    expect(normalizeChinesePunctuation("'测试'")).toBe('\u2018测试\u2019');
  });

  it('英文省略号 ... → 中文省略号 ……', () => {
    expect(normalizeChinesePunctuation('等等...')).toBe('等等\u2026\u2026');
  });

  it('英文双连字符 -- → 逗号', () => {
    expect(normalizeChinesePunctuation('他--突然停下了')).toBe('他，突然停下了');
  });

  it('中文破折号 —— → 逗号', () => {
    expect(normalizeChinesePunctuation('他——突然停下了')).toBe('他，突然停下了');
  });

  it('单个中文破折号 — → 逗号', () => {
    expect(normalizeChinesePunctuation('他—转身离去')).toBe('他，转身离去');
  });

  it('多种标点混合替换', () => {
    const input = '"你确定?"他问道--"是的."';
    const result = normalizeChinesePunctuation(input);
    expect(result).toContain('\u201c');
    expect(result).toContain('，');
  });

  it('纯中文文本不受影响', () => {
    const text = '\u201c你好\u201d，他说。';
    expect(normalizeChinesePunctuation(text)).toBe(text);
  });
});
