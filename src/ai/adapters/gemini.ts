// gemini.ts - Adapter for Google Gemini chat and SSE streaming completions.
import type {
 AiProviderConfig,
 ChatMessage,
 ChatOptions,
 CompletionResult,
 StreamChunk,
 ValidateResult
} from '../../types/ai';
import { estimateUsage } from './helpers';
import { stripMarkdownCodeFences, type BaseAdapter } from './base';

interface GeminiResponse {
 candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function toGeminiMessages(messages: ChatMessage[]) {
 return messages
 .filter((m) => m.role !== 'system')
 .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
}

function collectSystemInstruction(messages: ChatMessage[]): string {
 return messages
 .filter((m) => m.role === 'system')
 .map((m) => m.content)
 .join('\n\n')
 .trim();
}

export class GeminiAdapter implements BaseAdapter {
 provider = 'gemini' as const;
 name = 'Google / Gemini';
 isLocked = true;
 lockedBaseUrl = 'https://generativelanguage.googleapis.com';
 lockedApiPath = '/v1beta/models/{model}:generateContent';
 supportedModels = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
 defaultModel = 'gemini-2.5-flash';

 private endpoint(model: string, config: AiProviderConfig, apiVersion: 'v1beta' | 'v1' = 'v1beta'): string {
 const baseUrl = (config.baseUrl || this.lockedBaseUrl).replace(/\/+$/, '');
 const apiPath = `/${apiVersion}/models/{model}:generateContent`.replace('{model}', model);
 return `${baseUrl}${apiPath}`;
 }

 async complete(messages: ChatMessage[], config: AiProviderConfig, options?: ChatOptions): Promise<CompletionResult> {
 const started = performance.now();
 const model = config.model || this.defaultModel;

 const generationConfig: any = {
 temperature: config.temperature ?? 0.7,
 ...(options?.maxTokens ?? config.maxTokens ? { maxOutputTokens: options?.maxTokens ?? config.maxTokens } : {})
 };

 if (options?.responseType === 'json') {
 generationConfig.responseMimeType = 'application/json';
 }

 const systemInstruction = collectSystemInstruction(messages);

 const body = JSON.stringify({
 contents: toGeminiMessages(messages),
 generationConfig,
 ...(systemInstruction ? { system_instruction: { parts: [{ text: systemInstruction }] } } : {})
 });
 const endpoints = [this.endpoint(model, config, 'v1beta'), this.endpoint(model, config, 'v1')];
 let data: GeminiResponse | null = null;
 let lastError = '';
 for (const endpoint of endpoints) {
 const response = await fetch(endpoint, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-goog-api-key': config.apiKey
 },
 signal: config.requestSignal,
 body
 });
 if (response.ok) {
 data = (await response.json()) as GeminiResponse;
 break;
 }
 lastError = `Gemini error: ${response.status} ${response.statusText} (${endpoint})`;
 }

 if (!data) {
 throw new Error(lastError || 'Gemini request failed');
 }

 const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

 return {
 text,
 usage: estimateUsage(messages, text, this.provider, model),
 model,
 provider: this.provider,
 durationMs: Math.round(performance.now() - started)
 };
 }

 async stream(messages: ChatMessage[], config: AiProviderConfig, onChunk: (chunk: StreamChunk) => void): Promise<CompletionResult> {
 const started = performance.now();
 const model = config.model || this.defaultModel;

 const generationConfig: any = {
 temperature: config.temperature ?? 0.7,
 ...(config.maxTokens ? { maxOutputTokens: config.maxTokens } : {})
 };

 const systemInstruction = collectSystemInstruction(messages);

 const body = JSON.stringify({
 contents: toGeminiMessages(messages),
 generationConfig,
 ...(systemInstruction ? { system_instruction: { parts: [{ text: systemInstruction }] } } : {})
 });

 const baseUrl = (config.baseUrl || this.lockedBaseUrl).replace(/\/+$/, '');
 const apiPath = `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
 const url = `${baseUrl}${apiPath}`;

 const response = await fetch(url, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-goog-api-key': config.apiKey
 },
 signal: config.requestSignal,
 body
 });

 if (!response.ok) {
 throw new Error(`Gemini stream error: ${response.status} ${response.statusText}`);
 }

 let fullText = '';
 const reader = response.body?.getReader();
 if (!reader) throw new Error('No response body');

 const decoder = new TextDecoder();
 let buffer = '';

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
 const json = trimmed.slice(4).trim();
 if (json === '[DONE]') continue;
 try {
 const parsed = JSON.parse(json);
 const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
 if (text) {
 fullText += text;
 onChunk({ text, done: false });
 }
 } catch {
 // skip non-JSON lines
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
 [...messages, { role: 'system', content: '仅返回合法 JSON，不要带 Markdown 标记。' }],
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
