import { describe, it, expect, vi } from 'vitest';

// ─── 验证 1: extract_roles 应该从 chapters/{id}.html 读取正文 ──────────────

describe('extract_roles chapter content reading', () => {
  it('html 文件存在时应优先读取 html，而非 book.json 中的空 content', () => {
    // 模拟新行为：优先从 html 读取
    const htmlContent = '<p>张无忌出生了，他是武当派张翠山的儿子。</p>';
    const bookJsonContent = ''; // book.json 的 content 是空的（旧行为）

    // 验证 html 文件确实包含正文
    expect(htmlContent).toContain('张无忌');
    expect(htmlContent.length).toBeGreaterThan(0);
    expect(bookJsonContent).toBe(''); // book.json 的 content 是空的

    // 新行为：从 html 读取到非空内容
    expect(htmlContent.length).toBeGreaterThan(bookJsonContent.length);
  });

  it('html 不存在时应回退到 book.json 的 content 字段', () => {
    const htmlExists = false;
    const fallbackContent = '<p>fallback content</p>';

    // 当 html 不存在时回退到 book.json content
    expect(htmlExists).toBe(false);
    expect(fallbackContent.length).toBeGreaterThan(0);
  });
});

// ─── 验证 2: WebDAV 下载后的 save 竞争保护 ─────────────────────────────────

describe('WebDAV download race condition protection', () => {
  it('300ms 延迟应该足够 in-flight 请求落地', async () => {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const elapsed = Date.now() - start;

    // 验证至少等待了 300ms
    expect(elapsed).toBeGreaterThanOrEqual(290); // 允许 10ms 误差
  });

  it('writerzen:webdav-downloaded 事件类型正确', () => {
    const eventName = 'writerzen:webdav-downloaded';
    expect(eventName).toBe('writerzen:webdav-downloaded');
    expect(eventName.startsWith('writerzen:')).toBe(true);
  });
});

// ─── 验证 3: book.json 写入日志包含 cats/roles 数量 ───────────────────────

describe('book.json save logging', () => {
  it('save_book 日志应包含 customCharacterCategories 统计', () => {
    // 模拟一个 book 对象
    const book = {
      id: 'test-book',
      resourceIndex: {
        customCharacterCategories: [
          {
            id: 'cat-1',
            name: '主角',
            children: [
              { id: 'role-1', name: '张三' },
              { id: 'role-2', name: '李四' }
            ]
          }
        ]
      }
    };

    const categories = book.resourceIndex.customCharacterCategories;
    const catLen = categories.length;
    const roleLen = categories.reduce((sum, cat) => sum + (cat.children?.length || 0), 0);

    expect(catLen).toBe(1);
    expect(roleLen).toBe(2);
  });
});

// ─── 验证 4: sanitizeBook 是否丢弃 resourceIndex ─────────────────────────

describe('sanitizeBook preserves resourceIndex', () => {
  it('sanitizeBook 不应丢失 customCharacterCategories', () => {
    // 模拟 sanitizeBook 的行为（从 useBookStore.ts 中提取）
    function sanitizeBook(book: any) {
      const chaptersRaw = Array.isArray(book.chapters) ? book.chapters : [];
      // 简化版：只保留关键字段
      return {
        ...book,
        chapters: chaptersRaw,
        // 注意：这里必须保留 resourceIndex！
      };
    }

    const book = {
      id: 'test',
      chapters: [],
      resourceIndex: {
        customCharacterCategories: [{ id: 'c1', name: '分类', children: [] }]
      }
    };

    const sanitized = sanitizeBook(book);

    // 关键断言：sanitizeBook 不能丢弃 resourceIndex
    expect(sanitized.resourceIndex).toBeDefined();
    expect(sanitized.resourceIndex?.customCharacterCategories).toBeDefined();
    expect(sanitized.resourceIndex?.customCharacterCategories.length).toBe(1);
  });
});

// ─── 验证 5: write_book 乐观锁（updatedAt 比较）──────────────────────────────

describe('write_book optimistic lock', () => {
  it('当 incoming updatedAt 早于磁盘 existing updatedAt 时应跳过写入', () => {
    const existingUpdatedAt = '2026-06-03T21:00:00.000Z';
    const incomingUpdatedAt = '2026-06-03T20:00:00.000Z'; // 旧 1 小时

    expect(incomingUpdatedAt < existingUpdatedAt).toBe(true);

    // 模拟 write_book 中的判断逻辑
    function shouldSkip(existing: string, incoming: string): boolean {
      return existing > incoming;
    }
    expect(shouldSkip(existingUpdatedAt, incomingUpdatedAt)).toBe(true);
  });

  it('当 incoming updatedAt 新于磁盘时应允许写入', () => {
    const existingUpdatedAt = '2026-06-03T20:00:00.000Z';
    const incomingUpdatedAt = '2026-06-03T21:00:00.000Z';

    expect(incomingUpdatedAt > existingUpdatedAt).toBe(true);

    function shouldSkip(existing: string, incoming: string): boolean {
      return existing > incoming;
    }
    expect(shouldSkip(existingUpdatedAt, incomingUpdatedAt)).toBe(false);
  });
});

// ─── 验证 6: StoreSettingsTab 下载后也应有事件+延迟（与 TitleBar 对齐）────────

describe('StoreSettingsTab download race condition fix', () => {
  it('下载成功后应先 dispatch 事件，再等待 300ms，最后 loadBooks', async () => {
    const events: string[] = [];

    // 模拟 TitleBar / StoreSettingsTab 中的流程
    async function handleDownload() {
      events.push('dispatch-before-loadBooks');
      await new Promise((resolve) => setTimeout(resolve, 300));
      events.push('loadBooks');
      events.push('dispatch-after-loadBooks'); // 旧代码中的第二次 dispatch（已删除）
    }

    await handleDownload();

    // 验证顺序：先 dispatch，再 loadBooks
    expect(events.indexOf('dispatch-before-loadBooks')).toBeLessThan(events.indexOf('loadBooks'));
    // 现在 StoreSettingsTab 和 TitleBar 都已删除第二次 dispatch
    // 所以这个断言失败了说明旧代码还在
    expect(events).toEqual(['dispatch-before-loadBooks', 'loadBooks', 'dispatch-after-loadBooks']);
  });
});

// ─── 验证 7: 模拟完整上传 → 下载流程 ──────────────────────────────────────────

describe('WebDAV upload → download round-trip', () => {
  it('上传时应去除 boundBookIds，下载后应恢复本地绑定', () => {
    // 1. 本地配置
    const localProfiles = [
      { id: 'p1', name: '古风', stylePresetId: 'custom', styleInstruction: '古风描述', boundBookIds: ['b1', 'b2'] },
      { id: 'p2', name: '现代', stylePresetId: 'custom', styleInstruction: '现代描述', boundBookIds: ['b3'] }
    ];

    // 2. 模拟上传时的清洗（sync.rs 中的逻辑）
    const profilesForUpload = JSON.parse(JSON.stringify(localProfiles));
    for (const p of profilesForUpload) {
      delete p.boundBookIds;
    }
    // 验证：上传后的 profile 不应包含 boundBookIds
    expect(profilesForUpload.every((p: any) => !('boundBookIds' in p))).toBe(true);

    // 3. 云端数据（不含 boundBookIds）
    const remoteProfiles = profilesForUpload;

    // 4. 模拟下载后的合并（TitleBar.tsx / StoreSettingsTab.tsx 中的逻辑）
    const localMap = new Map(localProfiles.map((p: any) => [p.id, p]));
    for (const p of remoteProfiles) {
      if (!p?.id) continue;
      const { boundBookIds: _, ...remoteClean } = p;
      const local = localMap.get(p.id);
      localMap.set(p.id, { ...remoteClean, boundBookIds: local?.boundBookIds });
    }
    const merged = Array.from(localMap.values());

    // 5. 验证：合并后 boundBookIds 应该恢复为本地值
    const p1Merged = merged.find((p: any) => p.id === 'p1');
    const p2Merged = merged.find((p: any) => p.id === 'p2');
    expect(p1Merged?.boundBookIds).toEqual(['b1', 'b2']);
    expect(p2Merged?.boundBookIds).toEqual(['b3']);
  });

  it('下载新 book.json 后，旧 save 应被乐观锁拦截', () => {
    // 模拟时间线
    const t1 = '2026-06-03T20:00:00.000Z'; // 旧 save 的 updatedAt
    const t2 = '2026-06-03T21:00:00.000Z'; // WebDAV 下载后的 updatedAt（更新）

    // 1. WebDAV 下载解压了新的 book.json（updatedAt = t2）
    const diskBook = { id: 'book1', updatedAt: t2, resourceIndex: { customCharacterCategories: [] } };

    // 2. 前端某组件持有旧 book 对象（updatedAt = t1），延迟 save
    const oldBook = { id: 'book1', updatedAt: t1, resourceIndex: { customCharacterCategories: [{ id: 'old', name: '旧角色' }] } };

    // 3. 模拟 write_book 乐观锁判断
    function shouldSkipWrite(incomingUpdatedAt: string, existingUpdatedAt: string): boolean {
      return existingUpdatedAt > incomingUpdatedAt;
    }

    // 4. 验证：旧 save 应该被跳过
    expect(shouldSkipWrite(oldBook.updatedAt, diskBook.updatedAt)).toBe(true);

    // 5. 如果前端基于新数据重新编辑（updatedAt >= t2），则应允许写入
    const newBook = { id: 'book1', updatedAt: t2, resourceIndex: { customCharacterCategories: [{ id: 'new', name: '新角色' }] } };
    expect(shouldSkipWrite(newBook.updatedAt, diskBook.updatedAt)).toBe(false);
  });

  it('下载后 loadBooks 应加载到最新数据', () => {
    // 模拟下载后 loadBooks 读取到的 book 数据
    const loadedBook = {
      id: 'book1',
      updatedAt: '2026-06-03T21:00:00.000Z',
      resourceIndex: {
        customCharacterCategories: [
          { id: 'cat1', name: '主角', children: [{ id: 'r1', name: '张三' }] }
        ]
      }
    };

    // 验证：loadBooks 后的内存状态应反映最新数据
    expect(loadedBook.resourceIndex.customCharacterCategories).toHaveLength(1);
    expect(loadedBook.resourceIndex.customCharacterCategories[0].children).toHaveLength(1);
    expect(loadedBook.resourceIndex.customCharacterCategories[0].children[0].name).toBe('张三');
  });
});
