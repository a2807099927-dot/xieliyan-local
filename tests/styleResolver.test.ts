import { describe, it, expect } from 'vitest';
import { resolveStyleForBook, buildStyleSystemMessage, injectStyleToMessages } from '../src/utils/styleResolver';
import type { AppConfig } from '../src/types/ai';
import type { Book } from '../src/types';

function makeConfig(overrides: Partial<AppConfig['ai']> = {}): AppConfig {
  return {
    ai: {
      provider: 'openai',
      apiKey: 'test',
      model: 'gpt-4',
      activeStylePresetId: '',
      activeStyleProfileId: '',
      stylePresetId: '',
      styleInstruction: '',
      styleProfiles: [],
      ...overrides,
    },
  } as unknown as AppConfig;
}

function makeBook(id: string, boundId?: string): Book {
  return {
    id,
    title: '测试',
    chapters: [],
    settings: boundId ? { boundStyleProfileId: boundId } : {},
    resourceIndex: { customCharacterCategories: [] },
  } as unknown as Book;
}

describe('resolveStyleForBook — 风格解析', () => {
  it('书籍绑定 off → 返回空风格', () => {
    const style = resolveStyleForBook('b1', makeConfig(), [makeBook('b1', 'off')]);
    expect(style.stylePresetId).toBe('');
    expect(style.styleInstruction).toBe('');
  });

  it('书籍绑定自定义 profile → 使用 profile 内容', () => {
    const config = makeConfig({
      styleProfiles: [{ id: 'sp1', name: '测试风格', stylePresetId: 'preset-a', styleInstruction: '写得更细腻' }],
    });
    const style = resolveStyleForBook('b1', config, [makeBook('b1', 'sp1')]);
    expect(style.stylePresetId).toBe('preset-a');
    expect(style.styleInstruction).toBe('写得更细腻');
  });

  it('无绑定 → fallback 到全局 activeStyleProfileId', () => {
    const config = makeConfig({
      activeStyleProfileId: 'sp2',
      styleProfiles: [{ id: 'sp2', name: '全局', stylePresetId: '', styleInstruction: '全局风格' }],
    });
    const style = resolveStyleForBook('b1', config, [makeBook('b1')]);
    expect(style.styleInstruction).toBe('全局风格');
  });

  it('全部为空 → 返回空风格', () => {
    const style = resolveStyleForBook('b1', makeConfig(), [makeBook('b1')]);
    expect(style.stylePresetId).toBe('');
    expect(style.styleInstruction).toBe('');
  });
});

describe('buildStyleSystemMessage — 风格消息构建', () => {
  it('有 instruction → 返回 system 消息', () => {
    const msg = buildStyleSystemMessage('', '用短句写作');
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe('system');
    expect(msg!.content).toContain('用短句写作');
    expect(msg!.content).toContain('写作风格设定');
  });

  it('空 instruction → 返回 null', () => {
    const msg = buildStyleSystemMessage('preset-a', '');
    expect(msg).toBeNull();
  });
});

describe('injectStyleToMessages — 风格注入', () => {
  it('正常注入到消息头部', () => {
    const config = makeConfig({
      activeStyleProfileId: 'sp1',
      styleProfiles: [{ id: 'sp1', name: 't', stylePresetId: '', styleInstruction: '细腻描写' }],
    });
    const msgs = [{ role: 'user' as const, content: '写一段' }];
    const result = injectStyleToMessages(msgs, 'b1', config, [makeBook('b1')]);
    expect(result.length).toBe(2);
    expect(result[0].content).toContain('细腻描写');
  });

  it('disabled=true → 不注入', () => {
    const config = makeConfig({
      activeStyleProfileId: 'sp1',
      styleProfiles: [{ id: 'sp1', name: 't', stylePresetId: '', styleInstruction: '细腻描写' }],
    });
    const msgs = [{ role: 'user' as const, content: '写一段' }];
    const result = injectStyleToMessages(msgs, 'b1', config, [makeBook('b1')], true);
    expect(result.length).toBe(1);
  });
});
