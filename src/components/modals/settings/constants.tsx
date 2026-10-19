// 模块说明：设置页常量定义模块。
// 关键职责：集中维护设置项枚举、默认值与展示元数据。
import type { AiProvider } from '../../../types/ai';
import type { ProviderCardItem, TabId } from './types';

export const providerCards: ProviderCardItem[] = [
 { value: 'openai', title: 'OpenAI (Official)', endpoint: 'https://api.openai.com/v1' },
 { value: 'anthropic', title: 'Anthropic (Claude Official)', endpoint: 'https://api.anthropic.com/v1' },
 { value: 'gemini', title: 'Google (Gemini Official)', endpoint: 'https://generativelanguage.googleapis.com/v1beta' },
 { value: 'vertex_ai', title: 'Google (Vertex AI / API Key)', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai' },
 { value: 'grok', title: 'Grok (Official)', endpoint: 'https://api.x.ai/v1' },
 { value: 'deepseek', title: 'DeepSeek', endpoint: 'https://api.deepseek.com' },
 { value: 'proxy', title: '自定义 / 中转 (Universal)' }
];

export const fixedProviderModels: Partial<Record<AiProvider, string[]>> = {
 openai: ['gpt-5.4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
 anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-sonnet-latest'],
 gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-pro'],
 vertex_ai: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'],
 grok: ['grok-3', 'grok-3-mini', 'grok-2', 'grok-beta'],
 deepseek: ['deepseek-chat', 'deepseek-reasoner']
};

export const providerDefaults: Partial<Record<AiProvider, { baseUrl: string; apiPath: string; locked: boolean }>> = {
 openai: { baseUrl: 'https://api.openai.com', apiPath: '/v1/chat/completions', locked: true },
 anthropic: { baseUrl: 'https://api.anthropic.com', apiPath: '/v1/messages', locked: true },
 gemini: { baseUrl: 'https://generativelanguage.googleapis.com', apiPath: '/v1beta/models', locked: true },
 vertex_ai: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiPath: '/chat/completions', locked: true },
 grok: { baseUrl: 'https://api.x.ai', apiPath: '/v1/chat/completions', locked: true },
 deepseek: { baseUrl: 'https://api.deepseek.com', apiPath: '/v1/chat/completions', locked: true },
 proxy: { baseUrl: '', apiPath: '/chat/completions', locked: false }
};

export const tabs: Array<[TabId, string]> = [
 ['ai', 'AI 模型接入'],
 ['style', '文风与设定'],
 ['ui', '界面与外观'],
 ['habit', '写作习惯'],
 ['store', '存储与备份'],
 ['logs', 'AI 日志'],
 ['agent', 'Agent 人格与技能'],
 ];

export function mergeProviderModels(provider: AiProvider, cached: string[] | undefined): string[] {
  const fixed = fixedProviderModels[provider] || [];
  const list = Array.isArray(cached) ? cached.filter(Boolean) : [];
  // 已有探测缓存：只信 API 列表，不再把内置 fixed 灌进「可用」
  if (list.length > 0) {
    return Array.from(new Set(list));
  }
  // 从未探测：回退内置（仅作占位；UI 应提示先测试连接）
  if (provider === 'vertex_ai') {
    return Array.from(new Set([...(fixedProviderModels.vertex_ai || [])]));
  }
  return Array.from(new Set(fixed));
}

/** 仅返回探测缓存，无 fixed 灌水；无缓存则空数组 */
export function liveProviderModelsOnly(cached: string[] | undefined): string[] {
  if (!Array.isArray(cached) || cached.length === 0) return [];
  return Array.from(new Set(cached.map((m) => String(m || '').trim()).filter(Boolean)));
}

export function buildPayload(size: number): string {
 const seed =
 '青石街夜雨落在灯笼纸上，行人脚步在水纹里断续。少年握着旧伞，忽听远处钟声，像某种命运在暗处敲门。';
 let text = '';
 while (text.length < size) text += seed;
 return text.slice(0, size);
}
