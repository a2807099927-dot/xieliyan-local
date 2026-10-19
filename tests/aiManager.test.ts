import { describe, it, expect } from 'vitest';
import { AiManager } from '../src/ai/manager';
import type { AiProviderConfig, ChatMessage } from '../src/types/ai';

function makeConfig(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    provider: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 4096,
    temperature: 0.7,
    ...overrides,
  } as AiProviderConfig;
}

describe('AiManager — prepareMessages', () => {
  const manager = new AiManager(async () => makeConfig());

  it('无风格无 RAG → 原样返回', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '写一段' }];
    const result = manager.prepareMessages(msgs, makeConfig());
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('写一段');
  });

  it('有风格 → 头部注入 system 消息', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '写一段' }];
    const result = manager.prepareMessages(msgs, makeConfig(), undefined, { stylePrompt: '用短句写作' });
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('用短句写作');
    expect(result[0].content).toContain('风格设定');
    expect(result[1].content).toBe('写一段');
  });

  it('有 RAG 上下文 → 头部注入', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '续写' }];
    const config = makeConfig({ ragEnabled: true } as any);
    const result = manager.prepareMessages(msgs, config, '前文：主角进入森林');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('主角进入森林');
  });

  it('RAG 禁用 → 不注入', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '续写' }];
    const config = makeConfig({ ragEnabled: false } as any);
    const result = manager.prepareMessages(msgs, config, '前文：主角进入森林');
    expect(result).toHaveLength(1);
  });

  it('空风格 → 不注入', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '写' }];
    const result = manager.prepareMessages(msgs, makeConfig(), undefined, { stylePrompt: '   ' });
    expect(result).toHaveLength(1);
  });

  it('风格 + RAG 同时存在 → 两条 system 消息', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: '写' }];
    const config = makeConfig({ ragEnabled: true } as any);
    const result = manager.prepareMessages(msgs, config, 'RAG内容', { stylePrompt: '风格内容' });
    expect(result).toHaveLength(3);
    // 风格在最前面（后注入的 prepend 到头部）
    expect(result[0].content).toContain('风格内容');
    expect(result[1].content).toContain('RAG内容');
    expect(result[2].content).toBe('写');
  });
});

describe('AiManager — getOrCreateStyleCache', () => {
  const manager = new AiManager(async () => makeConfig());

  it('空风格 → 返回 null', () => {
    const result = manager.getOrCreateStyleCache(makeConfig(), '');
    expect(result).toBeNull();
  });

  it('有风格 → 返回缓存对象', () => {
    const result = manager.getOrCreateStyleCache(makeConfig(), '细腻描写');
    expect(result).not.toBeNull();
    expect(result!.prompt).toContain('细腻描写');
    expect(result!.key).toContain('openai');
    expect(result!.key).toContain('gpt-4');
  });

  it('相同配置 → 返回同一缓存', () => {
    const r1 = manager.getOrCreateStyleCache(makeConfig(), '风格A');
    const r2 = manager.getOrCreateStyleCache(makeConfig(), '风格A');
    expect(r1).toBe(r2);
  });

  it('不同风格 → 不同缓存', () => {
    const r1 = manager.getOrCreateStyleCache(makeConfig(), '风格X');
    const r2 = manager.getOrCreateStyleCache(makeConfig(), '风格Y');
    expect(r1).not.toBe(r2);
  });
});

describe('AiManager — getAdapter', () => {
  const manager = new AiManager(async () => makeConfig());

  it('已知 provider → 返回适配器', () => {
    expect(() => manager.getAdapter('openai')).not.toThrow();
    expect(() => manager.getAdapter('deepseek')).not.toThrow();
    expect(() => manager.getAdapter('anthropic')).not.toThrow();
    expect(() => manager.getAdapter('gemini')).not.toThrow();
  });

  it('未知 provider → 抛出错误', () => {
    expect(() => manager.getAdapter('unknown' as any)).toThrow('未知 AI 适配器');
  });
});
