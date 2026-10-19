import { describe, it, expect } from 'vitest';
import { useBookStore } from '../src/store/useBookStore';

describe('连点建章模拟', () => {
  it('连续 append 10 章不丢章', async () => {
    // 构造最小书
    const book = {
      id: 'bk',
      title: '测试书',
      description: '',
      chapters: [],
      settings: {},
      resourceIndex: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
    // 直接注入 store（绕过 loadBooks，避免 electron 依赖）
    useBookStore.setState({ books: [book] });
    // 模拟连点 10 次
    for (let i = 0; i < 10; i++) {
      const now = new Date().toISOString();
      await useBookStore.getState().updateBook('bk', (current) => ({
        ...current,
        chapters: [...current.chapters, {
          id: 'c'+i+'-'+Date.now()+'-'+Math.random().toString(16).slice(2),
          title: '第'+(i+1)+'章',
          content: '<h2>第'+(i+1)+'章</h2><p></p>',
          wordCount: 0,
          createdAt: now,
          updatedAt: now,
        }],
        updatedAt: now,
      }));
    }
    const s = useBookStore.getState().books.find((b)=>b.id==='bk');
    console.log('内存 chapters 数:', s?.chapters.length);
    expect(s?.chapters.length).toBe(10);
  });
});
