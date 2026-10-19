import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// 写梨眼 全功能冒烟测试 · 续写窗口 IPC 契约
// 覆盖：三条续写通道（细纲写作/引导续写/Agent 续写）共用独立窗口的
//       tauri-bridge 调用契约：openContinuationWindow /
//       getContinuationWindowState / submitContinuationWindowAction /
//       onContinuationWindowAction。锁定前后端字段映射，防止断链回归。
// ════════════════════════════════════════════════════════════════════

const { invokeMock, listenMock } = vi.hoisted(() => {
  const calls: Array<{ cmd: string; args: unknown }> = [];
  const invokeMock = vi.fn((cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    return Promise.resolve(null);
  });
  // 模拟 Tauri 环境：让 tauri-bridge 的模块顶层探测进入 inTauri 分支，
  // 并把 invoke 指向本文件可控的 mock（tauri-bridge 不走 @tauri-apps/api/core）。
  const w = globalThis as any;
  w.window = w;
  w.__TAURI_INTERNALS__ = { invoke: invokeMock };
  return {
    invokeMock,
    listenMock: vi.fn((event: string, handler: (e: unknown) => void) => {
      return Promise.resolve(() => {});
    }),
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

import { electronAPI } from '../src/utils/electron';

describe('continuation window IPC 契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => Promise.resolve(null));
  });

  it('openContinuationWindow 序列化 camelCase 字段（细纲通道 source=outline）', async () => {
    await electronAPI.system.openContinuationWindow({
      source: 'outline',
      bookId: 'book-1',
      chapterId: 'chapter-1',
      insertFrom: 42,
      title: 'AI 细纲写作结果',
      elapsedMs: 1234,
      paragraphs: ['段一', '段二'],
      selected: [0, 1],
      editingIndex: null,
      retryRequest: {
        messages: [{ role: 'system', content: 'sys' }],
        disableRag: true,
        disableStyle: false,
      },
    });
    expect(invokeMock).toHaveBeenCalledWith('open_continuation_window', {
      payload: {
        source: 'outline',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        insertFrom: 42,
        title: 'AI 细纲写作结果',
        elapsedMs: 1234,
        paragraphs: ['段一', '段二'],
        selected: [0, 1],
        editingIndex: null,
        retryRequest: {
          messages: [{ role: 'system', content: 'sys' }],
          disableRag: true,
          disableStyle: false,
        },
      },
    });
  });

  it('openContinuationWindow 引导续写通道 source=guided 默认 title', async () => {
    await electronAPI.system.openContinuationWindow({
      source: 'guided',
      bookId: 'b',
      chapterId: 'c',
      insertFrom: 5,
      paragraphs: ['内容'],
      selected: [0],
      editingIndex: null,
    });
    const args = invokeMock.mock.calls[0][1] as any;
    expect(args.payload.source).toBe('guided');
    expect(args.payload.title).toBe('AI 续写结果');
    expect(args.payload.paragraphs).toEqual(['内容']);
  });

  it('openContinuationWindow 段落统一 String 化（防 null 段落）', async () => {
    await electronAPI.system.openContinuationWindow({
      source: 'guided',
      bookId: 'b',
      chapterId: 'c',
      paragraphs: ['好', 123 as any, null as any, undefined as any],
      selected: [],
      editingIndex: null,
    });
    const args = invokeMock.mock.calls[0][1] as any;
    expect(args.payload.paragraphs).toEqual(['好', '123', 'null', 'undefined']);
  });

  it('openContinuationWindow 缺省字段有安全默认值', async () => {
    await electronAPI.system.openContinuationWindow({});
    const args = invokeMock.mock.calls[0][1] as any;
    expect(args.payload.source).toBe('guided');
    expect(args.payload.bookId).toBe('');
    expect(args.payload.chapterId).toBe('');
    expect(args.payload.title).toBe('AI 续写结果');
    expect(args.payload.elapsedMs).toBe(0);
    expect(args.payload.paragraphs).toEqual([]);
    expect(args.payload.selected).toEqual([]);
  });

  it('getContinuationWindowState 读取窗口状态', async () => {
    invokeMock.mockResolvedValueOnce({ state: { title: 't', paragraphs: ['p'] } });
    const res = await electronAPI.system.getContinuationWindowState();
    expect(invokeMock).toHaveBeenCalledWith('get_continuation_window_state', undefined);
    expect(res).toEqual({ state: { title: 't', paragraphs: ['p'] } });
  });

  it('submitContinuationWindowAction 提交采纳/放弃动作', async () => {
    await electronAPI.system.submitContinuationWindowAction({
      action: 'acceptAll',
      paragraphs: ['段一'],
      selected: [0],
      editingIndex: null,
    });
    expect(invokeMock).toHaveBeenCalledWith('submit_continuation_window_action', {
      action: 'acceptAll',
      paragraphs: ['段一'],
      selected: [0],
      editingIndex: null,
    });
  });

  it('onContinuationWindowAction 订阅续写窗口回传事件', async () => {
    const handler = vi.fn();
    const off = electronAPI.system.onContinuationWindowAction(handler);
    expect(listenMock).toHaveBeenCalledWith('continuation:window-action', expect.any(Function));
    const wrapped = listenMock.mock.calls[0][1] as (e: { payload: unknown }) => void;
    wrapped({ payload: { action: 'acceptSelected', source: 'outline', insertFrom: 9 } });
    expect(handler).toHaveBeenCalledWith({ action: 'acceptSelected', source: 'outline', insertFrom: 9 });
    expect(typeof off).toBe('function');
  });
});
