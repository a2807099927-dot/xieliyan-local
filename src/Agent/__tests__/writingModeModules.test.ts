import { describe, expect, it } from 'vitest';
import {
  buildOpeningOptionsPrompt,
  parseOpeningOptions,
  buildStoryCoreArchivePrompt,
  parseStoryCoreArchive,
  buildWritingApproachPrompt,
  parseWritingApproach,
  buildNewBookBaseBlocks,
} from '../openingDirection';
import {
  buildPlotPlanPrompt,
  parsePlotPlan,
  buildChapterOutlinePrompt,
  parseChapterOutline,
  buildOutlineReviewPrompt,
  parseOutlineReview,
  hasInvalidOutlineIssues,
  formatOutlineReviewForUser,
} from '../plotPlanning';
import { buildResearchPrompt, parseResearchResult } from '../researchPrompt';
import { buildBookUnderstanding, formatBookUnderstanding, shouldReconfirmUnderstanding } from '../bookUnderstanding';
import type { Book, Chapter } from '../../types';

function fakeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'b1',
    title: '测试书',
    description: '玄幻，主角穿越有系统',
    chapters: [
      { id: 'c1', title: '第1章', content: '', wordCount: 0, createdAt: '', updatedAt: '', outline: '' } as Chapter,
    ],
    settings: { worldSettings: '灵气复苏世界，宗门林立' } as Book['settings'],
    resourceIndex: {
      customCharacterCategories: [
        {
          name: '主角',
          children: [
            {
              id: 'r1',
              name: '林尘',
              roleType: '主角',
              faction: '青云宗',
              realm: '练气三层',
              abilities: [],
              equipment: [],
              customFields: {},
            } as any,
          ],
        },
      ],
    },
    ...overrides,
  } as Book;
}

describe('openingDirection 方向卡 / 档案 / 写法决策', () => {
  it('buildOpeningOptionsPrompt 含设定卡与题材约束，强约束不编造', () => {
    const blocks = buildNewBookBaseBlocks(fakeBook());
    const msgs = buildOpeningOptionsPrompt({ book: fakeBook(), ...blocks, userRequest: '主角穿越有系统' });
    const user = msgs[1].content;
    expect(user).toContain('用户想法');
    expect(user).toContain('2-3 个开局方向');
    expect(msgs[0].content).toContain('严禁编造');
  });

  it('parseOpeningOptions 解析纯 JSON 并裁剪到 3 个', () => {
    const raw = JSON.stringify({
      options: [
        { title: 'A', pitch: '穿越觉醒系统', outline: '宗门崛起', risk: '套路旧' },
        { title: 'B', pitch: '废柴逆袭', outline: '打脸', risk: '憋屈' },
        { title: 'C', pitch: '宗门少主', outline: '权谋', risk: '慢热' },
        { title: 'D', pitch: '第四个', outline: '', risk: '' },
      ],
    });
    const r = parseOpeningOptions(raw);
    expect(r.options).toHaveLength(3);
    expect(r.options[0].title).toBe('A');
  });

  it('parseOpeningOptions 垃圾输入返回空数组不抛错', () => {
    expect(parseOpeningOptions('not json').options).toEqual([]);
    expect(parseOpeningOptions('').options).toEqual([]);
  });

  it('story core archive 解析五要素', () => {
    const msgs = buildStoryCoreArchivePrompt({
      book: fakeBook(),
      chosen: { title: '穿越者', pitch: '开局觉醒系统', outline: '宗门', risk: '旧' },
      settingBlock: '灵气复苏',
    });
    expect(msgs[1].content).toContain('五要素');
    const d = parseStoryCoreArchive(JSON.stringify({
      protagonist: '林尘', world: '灵气复苏', coreConflict: '宗门之战', longTermGoal: '飞升', satisfactionModel: '打脸',
    }));
    expect(d?.protagonist).toBe('林尘');
    expect(d?.coreConflict).toBe('宗门之战');
  });

  it('writing approach 解析', () => {
    const d = parseWritingApproach(JSON.stringify({
      perspective: '第三人称', pacing: '快节奏', differentiation: '系统流+宗门权谋', readerPositioning: '男频爽文读者',
    }));
    expect(d?.pacing).toBe('快节奏');
  });
});

describe('plotPlanning 剧情规划 / 章节大纲 / 大纲审查', () => {
  it('buildPlotPlanPrompt 定位在 plotOutline 之下', () => {
    const msgs = buildPlotPlanPrompt({
      book: fakeBook(),
      coreArchiveBlock: '【故事核心档案】主角林尘',
      writingApproachBlock: '【写法决策】第三人称快节奏',
    });
    expect(msgs[0].content).toContain('plotOutline');
    expect(msgs[1].content).toContain('第一卷');
  });

  it('parsePlotPlan 解析冲突递进', () => {
    const d = parsePlotPlan(JSON.stringify({
      volumeGoal: '主角入青云宗站稳脚跟', conflictProgression: ['入门被欺', '外门小比', '秘境夺宝', '内门试炼', '立威'], characterArc: '从懦弱到坚定', volumeEndHook: '发现宗门秘辛',
    }));
    expect(d?.volumeGoal).toContain('青云宗');
    expect(d?.conflictProgression).toHaveLength(5);
    expect(d?.volumeEndHook).toContain('秘辛');
  });

  it('parseChapterOutline 解析章节列表并过滤空事件', () => {
    const r = parseChapterOutline(JSON.stringify({
      chapters: [
        { chapterNo: 1, coreEvent: '穿越觉醒', beats: ['醒来', '获系统'], plotFunction: '开局' },
        { chapterNo: 2, coreEvent: '', beats: [], plotFunction: '' },
        { chapterNo: 3, coreEvent: '入宗考核', beats: ['测试'], plotFunction: '推进' },
      ],
    }));
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].beats).toContain('获系统');
  });

  it('大纲审查：无效项被标记，hasInvalidOutlineIssues 正确', () => {
    const r = parseOutlineReview(JSON.stringify({
      issues: [
        { chapterNo: 1, verdict: 'valid', reason: '推进主线', suggestion: '' },
        { chapterNo: 2, verdict: 'invalid', reason: '注水', suggestion: '删或压缩' },
        { chapterNo: 3, verdict: 'needs_rework', reason: '重复', suggestion: '换冲突' },
      ],
      summary: '两章需处理',
    }));
    expect(r.issues).toHaveLength(3);
    expect(hasInvalidOutlineIssues(r)).toBe(true);
    expect(formatOutlineReviewForUser(r)).toContain('第2章 [无效]');
  });
});

describe('researchPrompt 研究结论', () => {
  it('prompt 强制来源标注', () => {
    const msgs = buildResearchPrompt({
      book: fakeBook(),
      searchResults: '【联网搜索结果（Bing）：玄幻 完本】...',
      readTexts: ['样本正文...'],
    });
    expect(msgs[1].content).toContain('来源');
    expect(msgs[1].content).toContain('实读');
  });

  it('parseResearchResult 解析差异化与来源', () => {
    const r = parseResearchResult(JSON.stringify({
      openingPattern: '穿越即遇危机',
      satisfactionPatterns: ['打脸', '突破'],
      cliches: ['无敌流'],
      differentiation: '本书加入宗门权谋',
      sources: ['基于训练知识，非实时'],
    }));
    expect(r.findings?.differentiation).toContain('宗门权谋');
    expect(r.findings?.sources).toContain('基于训练知识，非实时');
  });
});

describe('bookUnderstanding 老书理解组装', () => {
  it('组装包含世界/人物/剧情，0 模型调用（纯数据）', () => {
    const book = fakeBook({
      memoryBank: [
        {
          chapterId: 'c1',
          summary: '主角觉醒系统，入青云宗',
          isAnalyzed: true,
          agentOutline: { openLoops: ['玉佩伏笔'] },
        } as any,
      ],
    });
    const u = buildBookUnderstanding(book);
    expect(u.worldRules).toContain('灵气复苏');
    expect(u.characters).toContain('林尘');
    expect(u.plotState).toContain('主角觉醒系统');
    expect(u.plotState).toContain('玉佩伏笔');
    expect(u.coveredChapterCount).toBeGreaterThan(0);
  });

  it('无档案老书给出诚实提示而非编造', () => {
    const book = fakeBook();
    const u = buildBookUnderstanding(book);
    expect(u.plotState).toContain('无剧情档案');
  });

  it('formatBookUnderstanding 是用户可读对齐卡', () => {
    const text = formatBookUnderstanding(buildBookUnderstanding(fakeBook()));
    expect(text).toContain('我理解你的书目前状态如下');
    expect(text).toContain('【世界规则】');
  });

  it('shouldReconfirmUnderstanding：未确认或零覆盖需重新对齐', () => {
    expect(shouldReconfirmUnderstanding(fakeBook())).toBe(true);
    expect(shouldReconfirmUnderstanding(fakeBook({ agentContextConfirmed: true }))).toBe(true); // 零覆盖仍对齐
    expect(shouldReconfirmUnderstanding(fakeBook({
      agentContextConfirmed: true,
      memoryBank: [{ chapterId: 'c1', summary: '有档案', isAnalyzed: true } as any],
    }))).toBe(false);
  });
});
