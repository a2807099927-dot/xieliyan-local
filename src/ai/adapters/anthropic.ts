// anthropic.ts - Adapter for Anthropic Claude chat and streaming completions.
import type {
 AiProviderConfig,
 ChatMessage,
 CompletionResult,
 StreamChunk,
 ValidateResult
} from '../../types/ai';
import { estimateUsage } from './helpers';
import { stripMarkdownCodeFences, type BaseAdapter } from './base';

interface AnthropicResponse {
 content?: Array<{ text?: string }>;
}

export class AnthropicAdapter implements BaseAdapter {
 provider = 'anthropic' as const;
 name = 'Anthropic / Claude';
 isLocked = true;
 lockedBaseUrl = 'https://api.anthropic.com';
 lockedApiPath = '/v1/messages';
 supportedModels = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'];
 defaultModel = 'claude-sonnet-4-5';

 async complete(messages: ChatMessage[], config: AiProviderConfig): Promise<CompletionResult> {
 const started = performance.now();
 const system = messages
 .filter((m) => m.role === 'system')
 .map((m) => m.content)
 .join('\n');
 const bodyMessages = messages.filter((m) => m.role !== 'system');

 const baseUrl = (config.baseUrl || this.lockedBaseUrl).replace(/\/+$/, '');
 const apiPath = (config.apiPath || this.lockedApiPath).replace(/^\/?/, '/');
 const response = await fetch(`${baseUrl}${apiPath}`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-api-key': config.apiKey,
 'anthropic-version': '2023-06-01'
 },
 signal: config.requestSignal,
 body: JSON.stringify({
 model: config.model || this.defaultModel,
 ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
 temperature: config.temperature ?? 0.7,
 system,
 messages: bodyMessages
 })
 });

 if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
 const data = (await response.json()) as AnthropicResponse;
 const text = data.content?.[0]?.text ?? '';

 return {
 text,
 usage: estimateUsage(messages, text, this.provider, config.model || this.defaultModel),
 model: config.model || this.defaultModel,
 provider: this.provider,
 durationMs: Math.round(performance.now() - started)
 };
 }

 async stream(messages: ChatMessage[], config: AiProviderConfig, onChunk: (chunk: StreamChunk) => void): Promise<CompletionResult> {
 const started = performance.now();
 const system = messages
 .filter((m) => m.role === 'system')
 .map((m) => m.content)
 .join('\n');
 const bodyMessages = messages.filter((m) => m.role !== 'system');
 const model = config.model || this.defaultModel;

 const baseUrl = (config.baseUrl || this.lockedBaseUrl).replace(/\/+$/, '');
 const apiPath = (config.apiPath || this.lockedApiPath).replace(/^\/?/, '/');
 const response = await fetch(`${baseUrl}${apiPath}`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-api-key': config.apiKey,
 'anthropic-version': '2023-06-01'
 },
 signal: config.requestSignal,
 body: JSON.stringify({
 model,
 ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
 temperature: config.temperature ?? 0.7,
 system,
 messages: bodyMessages,
 stream: true
 })
 });

 if (!response.ok) throw new Error(`Anthropic stream error: ${response.status}`);

 let fullText = '';
 const reader = response.body?.getReader();
 if (!reader) throw new Error('No response body');

 const decoder = new TextDecoder();
 let buffer = '';
 let currentBlockType = 'text';

 try {
 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed || !trimmed.startsWith('data:')) continue;
 const json = trimmed.slice(5).trim();
 try {
 const event = JSON.parse(json);
 if (event.type === 'content_block_start') {
 currentBlockType = event.content_block?.type ?? 'text';
 }
 if (event.type === 'content_block_delta' && currentBlockType === 'text') {
 const text = event.delta?.text ?? event.delta?.partial_json ?? '';
 if (text) {
 fullText += text;
 onChunk({ text, done: false });
 }
 }
 } catch {
 // ignore malformed stream lines
 }
 }
 }
 } finally {
 reader.releaseLock();
 }

 onChunk({ text: '', done: true });

 return {
 text: fullText,
 usage: estimateUsage(messages, fullText, this.provider, model),
 model,
 provider: this.provider,
 durationMs: Math.round(performance.now() - started)
 };
 }

 async completeJson<T>(messages: ChatMessage[], config: AiProviderConfig): Promise<T> {
 const result = await this.complete(
 [...messages, { role: 'system', content: '仅返回合法 JSON，不要使用 Markdown 代码块。' }],
 config
 );
 return JSON.parse(stripMarkdownCodeFences(result.text)) as T;
 }

 async validate(config: AiProviderConfig): Promise<ValidateResult> {
 if (!config.apiKey) return { valid: false, error: 'API Key 不能为空' };
 try {
 await this.complete([{ role: 'user', content: 'ping' }], config);
 return { valid: true };
 } catch (error) {
 return { valid: false, error: error instanceof Error ? error.message : '验证失败' };
 }
 }
}
