import { describe, it, expect } from 'vitest';
import { splitCardBlocks, detectFormat, hasUnclosedCard } from '../src/pages/NovelLab/utils/technique-block-splitter';
import { safeParseTechniqueJson, validateTechniqueCard } from '../src/pages/NovelLab/utils/technique-schema';

// ─── 拆书分析：card 块切分 ─────────────────────────────────────────────────────

describe('splitCardBlocks — 拆书 card 块切分', () => {
  it('正常切分单个 card', () => {
    const input = '[card]{"chapterIndex":1,"mainTag":"hook"}[/card]';
    const blocks = splitCardBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('"mainTag":"hook"');
  });

  it('切分多个 card', () => {
    const input = '[card]{"chapterIndex":1}[/card]\n\n[card]{"chapterIndex":2}[/card]';
    const blocks = splitCardBlocks(input);
    expect(blocks).toHaveLength(2);
  });

  it('不闭合的 card 被忽略', () => {
    const input = '[card]{"chapterIndex":1}[/card]\n[card]{"incomplete":true';
    const blocks = splitCardBlocks(input);
    expect(blocks).toHaveLength(1);
  });

  it('空字符串返回空数组', () => {
    expect(splitCardBlocks('')).toEqual([]);
  });

  it('无 card 标记返回空数组', () => {
    expect(splitCardBlocks('普通文本内容')).toEqual([]);
  });
});

describe('detectFormat — 格式检测', () => {
  it('有完整 card → card 格式', () => {
    expect(detectFormat('[card]{}[/card]')).toBe('card');
  });

  it('仅有开标签 → legacy-markdown', () => {
    expect(detectFormat('[card]{}')).toBe('legacy-markdown');
  });

  it('纯文本 → legacy-markdown', () => {
    expect(detectFormat('## 分析结果\n内容')).toBe('legacy-markdown');
  });

  it('空字符串 → legacy-markdown', () => {
    expect(detectFormat('')).toBe('legacy-markdown');
  });
});

describe('hasUnclosedCard — 流式不完整检测', () => {
  it('有不闭合 card → true', () => {
    expect(hasUnclosedCard('[card]{"streaming":true')).toBe(true);
  });

  it('全部闭合 → false', () => {
    expect(hasUnclosedCard('[card]{}[/card]')).toBe(false);
  });

  it('无 card → false', () => {
    expect(hasUnclosedCard('普通文本')).toBe(false);
  });
});

// ─── 拆书分析：schema 校验（含新字段） ─────────────────────────────────────────

describe('validateTechniqueCard — 新字段透传', () => {
  const ctx = { chapterIndex: 1, chapterTitle: '全文分析' };

  it('storyOverview 正常透传', () => {
    const card = validateTechniqueCard({
      mainTag: 'building',
      storyOverview: '这是一个关于少年成长的故事...',
    }, ctx);
    expect(card.storyOverview).toBe('这是一个关于少年成长的故事...');
  });

  it('writingTechniques 数组正常透传', () => {
    const card = validateTechniqueCard({
      mainTag: 'hook',
      writingTechniques: [
        { name: '身份反转', where: '第3章', how: '先压后扬', effect: '读者期待感拉满' },
      ],
    }, ctx);
    expect(card.writingTechniques).toHaveLength(1);
    expect(card.writingTechniques![0].name).toBe('身份反转');
    expect(card.writingTechniques![0].where).toBe('第3章');
  });

  it('plotProgression 数组正常透传', () => {
    const card = validateTechniqueCard({
      mainTag: 'building',
      plotProgression: [
        { stage: '铺垫', chapters: '1-3', content: '主角入学', technique: '环境压迫' },
        { stage: '爆发', chapters: '8-10', content: '主角觉醒', technique: '连锁反转' },
      ],
    }, ctx);
    expect(card.plotProgression).toHaveLength(2);
    expect(card.plotProgression![0].stage).toBe('铺垫');
    expect(card.plotProgression![1].content).toBe('主角觉醒');
  });

  it('characterAnalysis 数组正常透传', () => {
    const card = validateTechniqueCard({
      mainTag: 'climax',
      characterAnalysis: [
        { name: '林木', role: '主角', arc: '从废物到天才', technique: '标签反转' },
      ],
    }, ctx);
    expect(card.characterAnalysis).toHaveLength(1);
    expect(card.characterAnalysis![0].name).toBe('林木');
  });

  it('新字段缺失时为 undefined', () => {
    const card = validateTechniqueCard({ mainTag: 'hook' }, ctx);
    expect(card.storyOverview).toBe('');
    expect(card.writingTechniques).toBeUndefined();
    expect(card.plotProgression).toBeUndefined();
    expect(card.characterAnalysis).toBeUndefined();
  });

  it('非数组的 writingTechniques → undefined', () => {
    const card = validateTechniqueCard({
      mainTag: 'hook',
      writingTechniques: '不是数组',
    }, ctx);
    expect(card.writingTechniques).toBeUndefined();
  });
});

describe('safeParseTechniqueJson — 完整 JSON 解析', () => {
  const ctx = { chapterIndex: 1, chapterTitle: '测试' };

  it('合法 JSON → parseError=false', () => {
    const json = JSON.stringify({
      mainTag: 'hook',
      readerDrive: '想知道主角能否突破',
      hookIntensity: 8,
      labelConfidence: 0.9,
      plotSummary: { oneLineSummary: '主角突破', keyEvents: ['觉醒', '战斗'], linkBefore: '', linkAfter: '新敌人出现' },
    });
    const card = safeParseTechniqueJson(json, ctx);
    expect(card.parseError).toBe(false);
    expect(card.mainTag).toBe('hook');
    expect(card.readerDrive).toBe('想知道主角能否突破');
  });

  it('非法 JSON → parseError=true', () => {
    const card = safeParseTechniqueJson('这不是JSON{{{', ctx);
    expect(card.parseError).toBe(true);
  });

  it('空字符串 → parseError=true', () => {
    const card = safeParseTechniqueJson('', ctx);
    expect(card.parseError).toBe(true);
  });
});
