import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// 写梨眼 全功能冒烟测试 · Store 层
// 用内存 mock 替换 electronAPI（src/utils/electron），驱动 useBookStore /
// useConfigStore / useAppStore / useIslandStore 走真实逻辑路径，验证：
//   书籍 CRUD、章节正文/标题/细纲、内存库、大纲节点、灵感笔记、
//   配置加载、标签页管理、灵动岛任务。
// ════════════════════════════════════════════════════════════════════

const db = vi.hoisted(() => {
  const books: any[] = [];
  const chapterContents = new Map<string, string>(); // key: bookId::chapterId
  let config: any = null;
  let configLoaded = false;
  const memoryBanks = new Map<string, any[]>();
  return { books, chapterContents, memoryBanks, config: () => config, setConfig: (v: any) => { config = v; configLoaded = true; }, configWasLoaded: () => configLoaded };
});

vi.mock('../src/utils/electron', () => ({
  electronAPI: {
    fs: {
      loadBooks: async () => ({ books: db.books.map((b) => JSON.parse(JSON.stringify(b))) }),
      saveBook: async (payload: { book: unknown }) => {
        const book = payload.book as any;
        const idx = db.books.findIndex((b) => b.id === book.id);
        if (idx >= 0) db.books[idx] = JSON.parse(JSON.stringify(book));
        else db.books.push(JSON.parse(JSON.stringify(book)));
        return { success: true };
      },
      deleteBook: async (payload: { bookId: string }) => {
        const idx = db.books.findIndex((b) => b.id === payload.bookId);
        if (idx >= 0) db.books.splice(idx, 1);
        return { success: true };
      },
      loadChapterContent: async (payload: { bookId: string; chapterId: string }) => {
        return { success: true, content: db.chapterContents.get(`${payload.bookId}::${payload.chapterId}`) || '' };
      },
      patchChapter: async (payload: { bookId: string; chapterId: string; content?: string; title?: string; outline?: string; wordCount?: number; updatedAt: string }) => {
        const book = db.books.find((b) => b.id === payload.bookId);
        const ch = book?.chapters.find((c: any) => c.id === payload.chapterId);
        if (ch) {
          if (typeof payload.content === 'string') ch.content = payload.content;
          if (typeof payload.title === 'string') ch.title = payload.title;
          if (typeof payload.outline === 'string') ch.outline = payload.outline;
          if (typeof payload.wordCount === 'number') ch.wordCount = payload.wordCount;
          ch.updatedAt = payload.updatedAt;
        }
        if (typeof payload.content === 'string') db.chapterContents.set(`${payload.bookId}::${payload.chapterId}`, payload.content);
        return { success: true };
      },
      patchBookMeta: async (payload: { bookId: string; patch: Record<string, unknown> }) => {
        const book = db.books.find((b) => b.id === payload.bookId);
        if (book) Object.assign(book, payload.patch);
        return { success: true };
      },
      loadMemoryBank: async (payload: { bookId: string }) => {
        return { memoryBank: db.memoryBanks.get(payload.bookId) || [] };
      },
      saveMemoryBank: async (payload: { bookId: string; memoryBank: unknown[] }) => {
        db.memoryBanks.set(payload.bookId, payload.memoryBank);
        return { success: true };
      },
    },
    config: {
      load: async () => (db.configWasLoaded() ? db.config() : null),
      getApiKey: async () => null,
      save: async (payload: unknown) => { db.setConfig(payload); return { success: true }; },
      reset: async () => ({ success: true }),
    },
    ai: {
      chat: async () => ({ text: 'mock ai response', usage: { totalTokens: 10 } }),
    },
  },
  tauriAPI: {},
}));

import { useBookStore } from '../src/store/useBookStore';
import { useConfigStore } from '../src/store/useConfigStore';
import { useAppStore } from '../src/store/useAppStore';
import { useIslandStore } from '../src/store/useIslandStore';

beforeEach(() => {
  db.books.length = 0;
  db.chapterContents.clear();
  db.memoryBanks.clear();
  db.setConfig(null);
  useBookStore.setState({ books: [], loading: false, error: undefined });
  useAppStore.setState({ route: 'bookshelf', editorTabs: [], activeEditorTabId: undefined, splitEditorTabId: undefined, focusMode: false });
  useIslandStore.setState({ visible: false, entries: [], type: 'progress', status: 'idle', message: '' });
});

describe('useBookStore 书籍 CRUD', () => {
  it('createBook 建书并生成第1章', async () => {
    const book = await useBookStore.getState().createBook('测试之书', '作者');
    expect(book.title).toBe('测试之书');
    expect(book.author).toBe('作者');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].title).toBe('第1章');
    expect(book.chapters[0].content).toContain('第1章');
    // 已落库并重新加载
    expect(useBookStore.getState().books.length).toBeGreaterThanOrEqual(1);
  });

  it('saveBook 后 loadBooks 可恢复', async () => {
    const book = await useBookStore.getState().createBook('书A', '作者A');
    const saved = await useBookStore.getState().saveBook({ ...book, title: '书A改' }, { reload: true });
    expect(saved).toBeUndefined();
    const found = useBookStore.getState().books.find((b) => b.id === book.id);
    expect(found?.title).toBe('书A改');
  });

  it('deleteBook 删除书籍', async () => {
    const book = await useBookStore.getState().createBook('待删', '作者');
    await useBookStore.getState().deleteBook(book.id);
    expect(useBookStore.getState().books.find((b) => b.id === book.id)).toBeUndefined();
  });
});

describe('useBookStore 章节正文', () => {
  it('setChapterContent 写入正文并回读', async () => {
    const book = await useBookStore.getState().createBook('正文书', '作者');
    const chId = book.chapters[0].id;
    await useBookStore.getState().setChapterContent(book.id, chId, '第一段内容。');
    const ch = useBookStore.getState().books.find((b) => b.id === book.id)?.chapters.find((c) => c.id === chId);
    expect(ch?.content).toContain('第一段内容');
  });

  it('ensureChapterContent 懒加载章节正文', async () => {
    const book = await useBookStore.getState().createBook('懒加载书', '作者');
    const chId = book.chapters[0].id;
    // 模拟磁盘已有正文，而 store 内存正文为空（preferDisk 场景）
    db.chapterContents.set(`${book.id}::${chId}`, '<h2>第1章</h2><p>磁盘内容</p>');
    useBookStore.setState({
      books: useBookStore.getState().books.map((b) => b.id === book.id
        ? { ...b, chapters: b.chapters.map((c) => c.id === chId ? { ...c, content: '' } : c) }
        : b),
    });
    const loaded = await useBookStore.getState().ensureChapterContent(book.id, chId);
    expect(loaded).toContain('磁盘内容');
  });

  it('setChapterTitle 更新章节标题', async () => {
    const book = await useBookStore.getState().createBook('标题书', '作者');
    const chId = book.chapters[0].id;
    await useBookStore.getState().setChapterTitle(book.id, chId, '第1章 初入江湖');
    const ch = useBookStore.getState().books.find((b) => b.id === book.id)?.chapters.find((c) => c.id === chId);
    expect(ch?.title).toBe('第1章 初入江湖');
  });

  it('setChapterOutline 更新细纲', async () => {
    const book = await useBookStore.getState().createBook('细纲书', '作者');
    const chId = book.chapters[0].id;
    await useBookStore.getState().setChapterOutline(book.id, chId, '主角出发，途中遇险。');
    const ch = useBookStore.getState().books.find((b) => b.id === book.id)?.chapters.find((c) => c.id === chId);
    expect(ch?.outline).toContain('遇险');
  });

  it('setChapterContent 每次派发 chapter-edit-learn（改稿学习触发）', async () => {
    const book = await useBookStore.getState().createBook('学习书', '作者');
    const chId = book.chapters[0].id;
    const handler = vi.fn();
    window.addEventListener('writerzen:chapter-edit-learn', handler);
    await useBookStore.getState().setChapterContent(book.id, chId, '第一次改稿内容，Agent 草稿被用户改写后的落盘。');
    await useBookStore.getState().setChapterContent(book.id, chId, '第二次改稿内容，进一步调整了措辞。');
    window.removeEventListener('writerzen:chapter-edit-learn', handler);
    // 内容有变化时也必须触发学习（上一轮修复的核心：旧实现只在"未变化"分支派发）
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].detail.bookId).toBe(book.id);
    expect(handler.mock.calls[0][0].detail.chapterId).toBe(chId);
  });
});

describe('useBookStore 记忆库', () => {
  it('saveMemoryBank + loadMemoryBank 往返', async () => {
    const book = await useBookStore.getState().createBook('记忆书', '作者');
    await useBookStore.getState().saveMemoryBank(book.id, [
      { chapterId: 'ch1', chapterTitle: '第1章', summary: '主角登场', archiveRecords: [] },
    ]);
    await useBookStore.getState().loadMemoryBank(book.id);
    const bank = useBookStore.getState().books.find((b) => b.id === book.id)?.memoryBank;
    expect(Array.isArray(bank)).toBe(true);
  });
});

describe('useBookStore 大纲节点', () => {
  it('addOutlineNode 添加大纲节点', async () => {
    const book = await useBookStore.getState().createBook('大纲书', '作者');
    await useBookStore.getState().addOutlineNode(book.id, null, { title: '第一卷', type: 'volume' });
    // 节点挂在 master root 下，需深度遍历查找
    const findNode = (items: any[]): any => {
      for (const n of items) {
        if (n.title === '第一卷') return n;
        if (n.children) {
          const hit = findNode(n.children);
          if (hit) return hit;
        }
      }
      return undefined;
    };
    const vision = useBookStore.getState().books.find((b) => b.id === book.id)?.outlineVision;
    const node = vision?.nodes ? findNode(vision.nodes) : undefined;
    expect(node).toBeDefined();
    expect(node.title).toBe('第一卷');
  });
});

describe('useBookStore 灵感笔记', () => {
  it('addInspirationNote 添加灵感', async () => {
    const book = await useBookStore.getState().createBook('灵感书', '作者');
    useBookStore.getState().addInspirationNote(book.id, '天空之城');
    const notes = useBookStore.getState().books.find((b) => b.id === book.id)?.inspirationNotes;
    expect(Array.isArray(notes)).toBe(true);
  });
});

describe('useConfigStore 配置加载', () => {
  it('loadConfig 加载配置并保留用户字段', async () => {
    db.setConfig({ ai: { provider: 'openai' }, ui: {} });
    await useConfigStore.getState().loadConfig();
    const config = useConfigStore.getState().config;
    expect(config?.ai?.provider).toBe('openai');
    // ensureConfigShape 会把缺失的顶层字段补成对象并回填 UI 默认值
    expect(config?.ui).toBeTypeOf('object');
    expect(config?.workspace).toBeTypeOf('object');
    expect(useConfigStore.getState().configLoading).toBe(false);
  });
});

describe('useAppStore 编辑器标签页', () => {
  it('openEditor 打开标签页并去重', () => {
    useAppStore.getState().openEditor('b1', 'c1');
    useAppStore.getState().openEditor('b1', 'c1');
    const tabs = useAppStore.getState().editorTabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe('b1::c1');
  });

  it('closeEditorTab 关闭标签并回退', () => {
    useAppStore.getState().openEditor('b1', 'c1');
    useAppStore.getState().openEditor('b2', 'c2');
    useAppStore.getState().closeEditorTab('b1::c1');
    expect(useAppStore.getState().editorTabs).toHaveLength(1);
  });

  it('setSplitEditorTab 分屏', () => {
    useAppStore.getState().openEditor('b1', 'c1');
    useAppStore.getState().setSplitEditorTab('b1::c1');
    expect(useAppStore.getState().splitEditorTabId).toBe('b1::c1');
  });

  it('toggleFocusMode 切换专注模式', () => {
    useAppStore.getState().toggleFocusMode();
    expect(useAppStore.getState().focusMode).toBe(true);
    useAppStore.getState().toggleFocusMode();
    expect(useAppStore.getState().focusMode).toBe(false);
  });
});

describe('useIslandStore 灵动岛', () => {
  it('show 瞬态提示', () => {
    useIslandStore.getState().show({ type: 'success', message: '已保存' });
    expect(useIslandStore.getState().visible).toBe(true);
    expect(useIslandStore.getState().entries.length).toBe(1);
    useIslandStore.getState().hide();
    expect(useIslandStore.getState().visible).toBe(false);
  });

  it('startTask / updateTask / finishTask 任务队列', () => {
    const id = useIslandStore.getState().startTask({ type: 'progress', status: 'thinking', message: 'AI 思考中' });
    expect(useIslandStore.getState().entries.find((e) => e.id === id)?.locked).toBe(true);
    useIslandStore.getState().updateTask(id, { status: 'writing', message: '生成中' });
    expect(useIslandStore.getState().entries.find((e) => e.id === id)?.status).toBe('writing');
    useIslandStore.getState().finishTask(id);
    expect(useIslandStore.getState().entries.find((e) => e.id === id)).toBeUndefined();
  });

  it('locked 任务在 hide 后保留', () => {
    useIslandStore.getState().startTask({ type: 'progress', status: 'thinking', message: '任务' });
    useIslandStore.getState().show({ type: 'success', message: '临时提示' });
    useIslandStore.getState().hide();
    expect(useIslandStore.getState().entries.some((e) => e.locked)).toBe(true);
  });
});
