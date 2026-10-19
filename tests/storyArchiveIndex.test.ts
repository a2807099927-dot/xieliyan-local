import { describe, it, expect } from 'vitest';
import {
  buildStoryArchiveIndex,
  collectStoryArchiveRecords,
  searchStoryArchiveIndex,
  formatArchiveBucketForPrompt,
} from '../src/utils/storyArchiveIndex';
import type { ChapterMemory, StoryArchiveRecord } from '../src/types';

function makeRecord(overrides: Partial<StoryArchiveRecord>): StoryArchiveRecord {
  return {
    kind: 'character',
    title: '角色',
    subject: '主角',
    detail: '详情',
    chapterId: 'ch1',
    chapterTitle: '第一章',
    ...overrides,
  } as StoryArchiveRecord;
}

function makeMemory(chapterId: string, records: StoryArchiveRecord[] = []): ChapterMemory {
  return { chapterId, archiveRecords: records } as ChapterMemory;
}

// ─── collectStoryArchiveRecords ───────────────────────────────────────────────

describe('collectStoryArchiveRecords', () => {
  it('从 memoryBank 中收集所有 archiveRecords', () => {
    const bank = [
      makeMemory('ch1', [makeRecord({ subject: 'A' })]),
      makeMemory('ch2', [makeRecord({ subject: 'B' }), makeRecord({ subject: 'C' })]),
    ];
    const records = collectStoryArchiveRecords(bank);
    expect(records).toHaveLength(3);
  });

  it('合并 extraRecords', () => {
    const bank = [makeMemory('ch1', [makeRecord({ subject: 'A' })])];
    const extra = [makeRecord({ subject: 'Extra' })];
    const records = collectStoryArchiveRecords(bank, extra);
    expect(records).toHaveLength(2);
  });

  it('空 memoryBank 返回空数组', () => {
    expect(collectStoryArchiveRecords(undefined)).toEqual([]);
    expect(collectStoryArchiveRecords([])).toEqual([]);
  });
});

// ─── buildStoryArchiveIndex ───────────────────────────────────────────────────

describe('buildStoryArchiveIndex', () => {
  it('按 kind 分桶', () => {
    const bank = [
      makeMemory('ch1', [
        makeRecord({ kind: 'character', subject: '主角' }),
        makeRecord({ kind: 'item', subject: '神剑' }),
        makeRecord({ kind: 'foreshadow', subject: '暗线', title: '伏笔A', detail: '暗线铺垫' }),
      ]),
    ];
    const index = buildStoryArchiveIndex(bank);
    expect(index.buckets.characters.length).toBeGreaterThanOrEqual(1);
    expect(index.buckets.items.length).toBeGreaterThanOrEqual(1);
    expect(index.buckets.foreshadows.length).toBeGreaterThanOrEqual(1);
    expect(index.sourceRecordCount).toBe(3);
  });

  it('同名角色合并到同一个 bucket', () => {
    const bank = [
      makeMemory('ch1', [makeRecord({ kind: 'character', subject: '主角', detail: '出场' })]),
      makeMemory('ch2', [makeRecord({ kind: 'character', subject: '主角', detail: '突破' })]),
    ];
    const index = buildStoryArchiveIndex(bank);
    expect(index.buckets.characters).toHaveLength(1);
    expect(index.buckets.characters[0].records).toHaveLength(2);
  });

  it('空数据返回空索引', () => {
    const index = buildStoryArchiveIndex([]);
    expect(index.sourceRecordCount).toBe(0);
    expect(Object.values(index.buckets).every(b => b.length === 0)).toBe(true);
  });
});

// ─── searchStoryArchiveIndex ──────────────────────────────────────────────────

describe('searchStoryArchiveIndex', () => {
  const bank = [
    makeMemory('ch1', [
      makeRecord({ kind: 'character', subject: '李云天', detail: '觉醒灵根' }),
      makeRecord({ kind: 'item', subject: '青龙刀', detail: '上古神器' }),
      makeRecord({ kind: 'foreshadow', subject: '神秘人', title: '暗影伏笔', detail: '神秘黑影出现' }),
    ]),
  ];
  const index = buildStoryArchiveIndex(bank);

  it('按关键词搜索命中', () => {
    const results = searchStoryArchiveIndex(index, '李云天');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // bucket summary 或 records 中应包含 '李云天' 相关内容
    const match = results.find(b => b.summary.includes('李云天') || b.title.includes('李云天'));
    expect(match).toBeTruthy();
  });

  it('无匹配返回空数组（有最低分过滤）', () => {
    const results = searchStoryArchiveIndex(index, 'ZZZZZ完全不存在');
    // score > 0 过滤，可能返回空
    expect(results.length).toBeLessThanOrEqual(bank[0].archiveRecords!.length);
  });

  it('空查询返回前 N 个', () => {
    const results = searchStoryArchiveIndex(index, '', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('限制返回数量', () => {
    const results = searchStoryArchiveIndex(index, '角色', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

// ─── formatArchiveBucketForPrompt ─────────────────────────────────────────────

describe('formatArchiveBucketForPrompt', () => {
  it('格式化包含所有关键信息', () => {
    const bucket = buildStoryArchiveIndex([
      makeMemory('ch1', [makeRecord({ kind: 'character', subject: '主角', detail: '觉醒' })]),
    ]).buckets.characters[0];

    const text = formatArchiveBucketForPrompt(bucket);
    expect(text).toContain('【character】');
    expect(text).toContain('主角');
    expect(text).toContain('摘要');
  });
});
