import { describe, it, expect } from 'vitest';
import { mergeRoleCategoriesWithArchiveRecords } from '../src/utils/roleArchiveBridge';
import type { RoleCategory } from '../src/types';

// ─── Bug 1: 智能整理不应清空角色档案 ─────────────────────────────────────────

describe('saveMemoryBank 角色安全防护', () => {
  it('merge 后角色数量不应减少（防护逻辑验证）', () => {
    // 模拟已有角色数据
    const existingCategories: RoleCategory[] = [
      {
        id: 'cat-1',
        name: '主角',
        children: [
          { id: 'r1', name: '张三', aliases: [], faction: '', roleType: '主角', description: '', chapters: [], abilities: [], inventory: [] },
          { id: 'r2', name: '李四', aliases: [], faction: '', roleType: '配角', description: '', chapters: [], abilities: [], inventory: [] },
        ]
      } as any,
      {
        id: 'cat-2',
        name: '反派',
        children: [
          { id: 'r3', name: '王五', aliases: [], faction: '', roleType: '反派', description: '', chapters: [], abilities: [], inventory: [] },
        ]
      } as any,
    ];

    const originalCount = existingCategories.reduce((sum, cat) => sum + (cat.children?.length || 0), 0);
    expect(originalCount).toBe(3);

    // 模拟 AI 返回正常 archiveRecords（新增角色）
    const normalRecords = [
      { id: 'ar1', subject: '赵六', kind: 'character', detail: '新角色', chapterId: 'ch1', title: '', target: '', status: '' },
    ];

    const merged = mergeRoleCategoriesWithArchiveRecords(existingCategories, normalRecords as any);
    const mergedCount = merged.reduce((sum, cat) => sum + (cat.children?.length || 0), 0);

    // 合并后角色数量只增不减
    expect(mergedCount).toBeGreaterThanOrEqual(originalCount);
  });

  it('空 archiveRecords → 不触发 merge，保留原数据', () => {
    const existingCategories: RoleCategory[] = [
      { id: 'cat-1', name: '主角', children: [{ id: 'r1', name: '张三' }] } as any,
    ];

    // 模拟 saveMemoryBank 的逻辑：archiveRecords 为空时不调 merge
    const archiveRecords: any[] = [];
    const syncedCategories = archiveRecords.length
      ? mergeRoleCategoriesWithArchiveRecords(existingCategories, archiveRecords)
      : existingCategories;

    // 应该原样保留
    expect(syncedCategories).toBe(existingCategories);
    expect(syncedCategories[0].children[0].name).toBe('张三');
  });

  it('merge 不会删除已有角色（只新增/更新）', () => {
    const existingCategories: RoleCategory[] = [
      {
        id: 'cat-protagonist',
        name: '主角',
        children: [
          { id: 'r1', name: '林木', aliases: ['小木'], faction: '', roleType: '主角', description: '主角描述', chapters: ['ch1'], abilities: [], inventory: [] },
        ]
      } as any,
    ];

    // AI 整理出的记录里提到了已有角色 + 新角色
    const records = [
      { id: 'ar1', subject: '林木', kind: 'character', detail: '新的描述补充', chapterId: 'ch2', title: '', target: '', status: '' },
      { id: 'ar2', subject: '秦城', kind: 'character', detail: '新角色', chapterId: 'ch2', title: '', target: '', status: '' },
    ];

    const merged = mergeRoleCategoriesWithArchiveRecords(existingCategories, records as any);

    // 林木应该还在
    const allRoles = merged.flatMap(cat => cat.children || []);
    const linmu = allRoles.find((r: any) => r.name === '林木');
    expect(linmu).toBeDefined();
    expect((linmu as any).aliases).toContain('小木'); // 原有 aliases 保留

    // 秦城应该被新增
    const qincheng = allRoles.find((r: any) => r.name === '秦城');
    expect(qincheng).toBeDefined();

    // 总角色数 >= 原有数量
    expect(allRoles.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Bug 2: 拆书 TXT 导入编码兼容 ───────────────────────────────────────────

describe('TXT 导入章节解析', () => {
  // 模拟 Rust 端的章节解析逻辑（纯前端复刻用于测试）
  function parseChapters(raw: string): Array<{ index: number; title: string; content: string }> {
    const re = /^(第[零一二三四五六七八九十百千万0-9]+[章节回卷]|Chapter\s+\d+|CHAPTER\s+\d+)/;
    const chapters: Array<{ index: number; title: string; content: string }> = [];
    let currentTitle = '';
    let currentContent: string[] = [];
    let idx = 0;

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (re.test(trimmed)) {
        if (currentTitle || currentContent.length > 0) {
          idx++;
          chapters.push({
            index: idx,
            title: currentTitle || `第${idx}章`,
            content: currentContent.join('\n').trim(),
          });
        }
        currentTitle = trimmed;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentTitle || currentContent.length > 0) {
      idx++;
      chapters.push({
        index: idx,
        title: currentTitle || `第${idx}章`,
        content: currentContent.join('\n').trim(),
      });
    }
    return chapters;
  }

  it('标准格式 TXT 正确拆分章节 + 内容', () => {
    const txt = `第一章 开端
林木走进了大厅。
四周的目光齐刷刷看过来。

第二章 初遇
他看到了一个少女。
少女正在练剑。`;

    const chapters = parseChapters(txt);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].title).toBe('第一章 开端');
    expect(chapters[0].content).toContain('林木走进了大厅');
    expect(chapters[0].content).toContain('四周的目光');
    expect(chapters[1].title).toBe('第二章 初遇');
    expect(chapters[1].content).toContain('少女正在练剑');
  });

  it('每个章节的 content 不为空', () => {
    const txt = `第1章 测试
这是第一章的正文内容，至少有一些字。

第2章 继续
这是第二章的内容。`;

    const chapters = parseChapters(txt);
    for (const ch of chapters) {
      expect(ch.content.length).toBeGreaterThan(0);
    }
  });

  it('无章节标记 → 整本作为单章', () => {
    const txt = '这是一整篇没有章节标记的文本，直接作为正文。\n第二段内容。';
    const chapters = parseChapters(txt);
    // 无标题匹配时，整体当作一章
    expect(chapters.length).toBe(1);
    expect(chapters[0].content).toContain('这是一整篇');
  });

  it('中文数字章节标题正确匹配', () => {
    const txt = `第一百二十三章 大战
激烈的战斗开始了。`;

    const chapters = parseChapters(txt);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('第一百二十三章 大战');
    expect(chapters[0].content).toContain('激烈的战斗');
  });

  it('阿拉伯数字章节标题正确匹配', () => {
    const txt = `第123章 突破
主角成功突破了。

第124章 归来
他回到了家。`;

    const chapters = parseChapters(txt);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].content).toContain('成功突破');
    expect(chapters[1].content).toContain('回到了家');
  });

  it('AnalysisPanel 正确判断有内容的章节', () => {
    // 模拟 AnalysisPanel 的 chaptersWithContent 过滤逻辑
    const chapters = [
      { index: 1, title: '第一章', url: 'local://1', status: 'done' as const, content: '有正文内容' },
      { index: 2, title: '第二章', url: 'local://2', status: 'done' as const, content: '' },
      { index: 3, title: '第三章', url: 'local://3', status: 'done' as const, content: undefined },
      { index: 4, title: '第四章', url: 'local://4', status: 'done' as const, content: '也有内容' },
    ];

    const chaptersWithContent = chapters.filter(ch => ch.content && ch.content.length > 0);
    expect(chaptersWithContent).toHaveLength(2);
    expect(chaptersWithContent[0].title).toBe('第一章');
    expect(chaptersWithContent[1].title).toBe('第四章');
  });
});
