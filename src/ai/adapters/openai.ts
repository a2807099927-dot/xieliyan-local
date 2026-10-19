// openai.ts - OpenAI-compatible adapter used by multiple providers.
import type {
 AiProvider,
 AiProviderConfig,
 ChatMessage,
 CompletionResult,
 StreamChunk,
 ValidateResult
} from '../../types/ai';
import { estimateUsage } from './helpers';
import { stripMarkdownCodeFences, type BaseAdapter } from './base';

interface OpenAIChatChoice {
 message?: { content?: unknown; reasoning_content?: unknown };
 delta?: { content?: unknown; reasoning_content?: unknown };
 text?: unknown;
}

interface OpenAIChatResponse {
 choices?: OpenAIChatChoice[];
 output_text?: unknown;
 output?: unknown;
 response?: { output_text?: unknown; output_text_delta?: unknown };
 output_text_delta?: unknown;
 // Anthropic Messages API native format
 content?: unknown;
 type?: string;
 delta?: { type?: string; text?: string };
}

function normalizeText(value: unknown): string {
 if (typeof value === 'string') return value;
 if (!value) return '';

 if (Array.isArray(value)) {
 return value
 .map((item) => normalizeText(item))
 .filter(Boolean)
 .join('');
 }

 if (typeof value === 'object') {
 const record = value as Record<string, unknown>;
 const direct = normalizeText(record.text);
 if (direct) return direct;

 const content = normalizeText(record.content);
 if (content) return content;

 const valueText = normalizeText(record.value);
 if (valueText) return valueText;

 const outputText = normalizeText(record.output_text);
 if (outputText) return outputText;
 }

 return '';
}

function readResponseOutputText(payload: OpenAIChatResponse): string {
 const output = payload.output;
 if (!Array.isArray(output)) return '';
 return output
 .map((item) => {
 if (!item || typeof item !== 'object') return '';
 const record = item as Record<string, unknown>;
 return normalizeText(record.content) || normalizeText(record);
 })
 .filter(Boolean)
 .join('');
}

// Anthropic Messages API 非流式响应格式: { content: [{ type: 'text', text: '...' }] }
function readAnthropicContent(payload: OpenAIChatResponse): string {
 const content = (payload as Record<string, unknown>).content;
 if (!Array.isArray(content)) return '';
 return (content as Array<Record<string, unknown>>)
 .filter((item) => !item.type || item.type === 'text')
 .map((item) => normalizeText(item.text))
 .filter(Boolean)
 .join('');
}

// Anthropic 流式格式: content_block_delta 事件中 delta.type='text_delta'
function readAnthropicDelta(payload: OpenAIChatResponse): string {
 // SSE payload: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
 if (payload.type === 'content_block_delta') {
 return normalizeText(payload.delta?.text) || '';
 }
 return '';
}

function readCompletionText(payload: OpenAIChatResponse): string {
 const choice = payload.choices?.[0];
 const candidates = [
 normalizeText(choice?.message?.content),
 normalizeText(choice?.message?.reasoning_content),
 normalizeText(choice?.text),
 normalizeText(payload.output_text),
 normalizeText(payload.response?.output_text),
 readResponseOutputText(payload),
 readAnthropicContent(payload)
 ];
 return candidates.find((item) => item.trim().length > 0) || '';
}

function readDeltaText(payload: OpenAIChatResponse): string {
 const choice = payload.choices?.[0];
 const candidates = [
 normalizeText(choice?.delta?.content),
 normalizeText(choice?.delta?.reasoning_content),
 normalizeText(choice?.text),
 normalizeText(payload.output_text_delta),
 normalizeText(payload.response?.output_text_delta),
 readAnthropicDelta(payload)
 ];
 return candidates.find((item) => item.length > 0) || '';
}

function normalizeEndpointPath(baseUrl: string, apiPath: string): string {
 let path = (apiPath || '').trim() || '/chat/completions';
 path = '/' + path.replace(/^\/+/, '');
 // 防止中转配置写成 baseUrl=/v1 且 apiPath=/v1/chat/completions，
 // 最终请求被拼成 /v1/v1/chat/completions。
 if (/\/v1$/i.test(baseUrl) && /^\/v1(?=\/|$)/i.test(path)) {
 path = path.replace(/^\/v1(?=\/|$)/i, '') || '/';
 }
 return path;
}

export class OpenAICompatibleAdapter implements BaseAdapter {
 provider: AiProvider;
 name: string;
 isLocked: boolean;
 lockedBaseUrl?: string;
 lockedApiPath?: string;
 supportedModels: string[];
 defaultModel: string;

 constructor(params: {
 provider: AiProvider;
 name: string;
 isLocked: boolean;
 lockedBaseUrl?: string;
 lockedApiPath?: string;
 supportedModels: string[];
 defaultModel: string;
 }) {
 this.provider = params.provider;
 this.name = params.name;
 this.isLocked = params.isLocked;
 this.lockedBaseUrl = params.lockedBaseUrl;
 this.lockedApiPath = params.lockedApiPath;
 this.supportedModels = params.supportedModels;
 this.defaultModel = params.defaultModel;
 }

 protected getEndpoint(config: AiProviderConfig): string {
 const preferIpv4Localhost = (url: string): string => {
 const value = String(url || '').trim();
 if (!value) return value;
 if (/^http:\/\/localhost(?=[:/]|$)/i.test(value)) {
 return value.replace(/^http:\/\/localhost/i, 'http://127.0.0.1');
 }
 return value;
 };

 const baseUrl = preferIpv4Localhost((config.baseUrl || this.lockedBaseUrl || '').replace(/\/+$/, ''));
 const apiPath = normalizeEndpointPath(baseUrl, config.apiPath || this.lockedApiPath || '');
 return `${baseUrl}${apiPath}`;
 }

 protected getBaseUrl(config: AiProviderConfig): string {
 const preferIpv4Localhost = (url: string): string => {
 const value = String(url || '').trim();
 if (!value) return value;
 if (/^http:\/\/localhost(?=[:/]|$)/i.test(value)) {
 return value.replace(/^http:\/\/localhost/i, 'http://127.0.0.1');
 }
 return value;
 };
 return preferIpv4Localhost((config.baseUrl || this.lockedBaseUrl || '').replace(/\/+$/, ''));
 }

 protected getAuthHeader(config: AiProviderConfig): string {
 return `Bearer ${config.apiKey}`;
 }

 /** 判断当前配置是否指向 Anthropic 原生 /messages 端点 */
 private isAnthropicEndpoint(config: AiProviderConfig): boolean {
 const effectivePath = (config.apiPath || this.lockedApiPath || '').trim();
 return /\/messages\/?$/.test(effectivePath);
 }

 /** 构建请求头：Anthropic 端点用 x-api-key，否则用 Bearer */
 private buildHeaders(config: AiProviderConfig): Record<string, string> {
 if (this.isAnthropicEndpoint(config)) {
 return {
 'Content-Type': 'application/json',
 'x-api-key': config.apiKey,
 'anthropic-version': '2023-06-01'
 };
 }
 return {
 'Content-Type': 'application/json',
 Authorization: this.getAuthHeader(config)
 };
 }

 /** 构建请求体：Anthropic 格式需要将 system 消息单独提取 */
 private buildBody(messages: ChatMessage[], config: AiProviderConfig, stream: boolean): string {
 const model = config.model || this.defaultModel;
 const temperature = config.temperature ?? 0.7;
 const maxTokens = config.maxTokens;

 if (this.isAnthropicEndpoint(config)) {
 const systemMessages = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
 const chatMessages = messages.filter((m) => m.role !== 'system');
 return JSON.stringify({
 model,
 ...(maxTokens ? { max_tokens: maxTokens } : {}),
 ...(systemMessages ? { system: systemMessages } : {}),
 messages: chatMessages,
 ...(stream ? { stream: true } : {})
 });
 }

 return JSON.stringify({ model, temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}), messages, stream });
 }

 private async fetchWithTimeout(
 input: string,
 init: RequestInit,
 timeoutMs = 60_000,
 externalSignal?: AbortSignal
 ): Promise<Response> {
 const controller = new AbortController();
 let timedOut = false;
 const timer = setTimeout(() => {
 timedOut = true;
 controller.abort();
 }, timeoutMs);
 const abortHandler = () => controller.abort();
 externalSignal?.addEventListener('abort', abortHandler, { once: true });
 try {
 return await fetch(input, { ...init, signal: controller.signal });
 } catch (error) {
 if (timedOut) {
 throw new Error(`request timeout after ${timeoutMs}ms`);
 }
 throw error;
 } finally {
 clearTimeout(timer);
 externalSignal?.removeEventListener('abort', abortHandler);
 }
 }

 async complete(messages: ChatMessage[], config: AiProviderConfig, options?: { timeoutMs?: number }): Promise<CompletionResult> {
 const started = performance.now();
 const timeoutMs = options?.timeoutMs ?? config.requestTimeoutMs ?? 60_000;
 const response = await this.fetchWithTimeout(
 this.getEndpoint(config),
 {
 method: 'POST',
 headers: this.buildHeaders(config),
 body: this.buildBody(messages, config, false)
 },
 timeoutMs,
 config.requestSignal
 );

 if (!response.ok) {
 const raw = await response.text().catch(() => '');
 throw new Error('AI 请求失败: ' + response.status + ' ' + response.statusText + (raw ? ' | ' + raw.slice(0, 300) : ''));
 }

 const data = (await response.json()) as OpenAIChatResponse;
 const text = readCompletionText(data).trim();
 if (!text) {
 throw new Error(`AI 返回空内容（${this.provider}/${config.model || this.defaultModel}）`);
 }
 // 优先从 API 响应取真实 usage，fallback 到估算
 const apiUsage = (data as any).usage;
 const realPromptTokens = apiUsage?.prompt_tokens ?? 0;
 const realCompletionTokens = apiUsage?.completion_tokens ?? 0;
 const realTotalTokens = apiUsage?.total_tokens ?? (realPromptTokens + realCompletionTokens);
 // DeepSeek: prompt_cache_hit_tokens; OpenAI: prompt_tokens_details.cached_tokens
 const cachedTokens = apiUsage?.prompt_cache_hit_tokens ?? apiUsage?.prompt_tokens_details?.cached_tokens ?? 0;
 const hasRealUsage = realTotalTokens > 0;
 const fallback = estimateUsage(messages, text, this.provider, config.model || this.defaultModel);
 return {
 text,
 usage: hasRealUsage ? { ...fallback, promptTokens: realPromptTokens, completionTokens: realCompletionTokens, totalTokens: realTotalTokens, cachedTokens } : fallback,
 model: config.model || this.defaultModel,
 provider: this.provider,
 durationMs: Math.round(performance.now() - started)
 };
 }

 async stream(messages: ChatMessage[], config: AiProviderConfig, onChunk: (chunk: StreamChunk) => void): Promise<CompletionResult> {
 const started = performance.now();
 const timeoutMs = config.requestTimeoutMs ?? 60_000;
 const response = await this.fetchWithTimeout(
 this.getEndpoint(config),
 {
 method: 'POST',
 headers: this.buildHeaders(config),
 body: this.buildBody(messages, config, true)
 },
 timeoutMs,
 config.requestSignal
 );

 if (!response.ok || !response.body) {
 const raw = await response.text().catch(() => '');
 throw new Error('AI 流式请求失败: ' + response.status + ' ' + response.statusText + (raw ? ' | ' + raw.slice(0, 300) : ''));
 }

 const reader = response.body.getReader();
 const decoder = new TextDecoder();
 let accumulated = '';
 let buffer = '';

 while (true) {
 const { value, done } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');
 buffer = lines.pop() ?? '';

 for (const line of lines) {
 const trimmed = line.trim();
 if (!trimmed.startsWith('data:')) continue;
 const payload = trimmed.slice(5).trim();
 if (payload === '[DONE]') continue;
 try {
 const parsed = JSON.parse(payload) as OpenAIChatResponse;
 const text = readDeltaText(parsed);
 if (text) {
 accumulated += text;
 onChunk({ text, done: false });
 }
 } catch {
 // ignore malformed chunks
 }
 }
 }

 onChunk({ text: '', done: true });

 if (!accumulated.trim()) {
 throw new Error(`AI 返回空内容（${this.provider}/${config.model || this.defaultModel}）`);
 }

 return {
 text: accumulated,
 usage: estimateUsage(messages, accumulated, this.provider, config.model || this.defaultModel),
 model: config.model || this.defaultModel,
 provider: this.provider,
 durationMs: Math.round(performance.now() - started)
 };
 }

 async completeJson<T>(messages: ChatMessage[], config: AiProviderConfig): Promise<T> {
 const result = await this.complete(
 [
 ...messages,
 {
 role: 'system',
 content: '仅返回合法 JSON，不要输出 Markdown 代码块。'
 }
 ],
 config
 );
 const safeText = stripMarkdownCodeFences(result.text);
 return JSON.parse(safeText) as T;
 }

 async validate(config: AiProviderConfig): Promise<ValidateResult> {
 if (!config.apiKey && this.provider !== 'local' && this.provider !== 'proxy') {
 return { valid: false, error: 'API Key 不能为空' };
 }

 try {
 const baseUrl = this.getBaseUrl(config);
 const modelProbePaths = this.provider === 'zhipu' ? ['/api/paas/v4/models'] : ['/v1/models', '/models'];
 for (const p of modelProbePaths) {
 const endpoint = `${baseUrl}${p}`;
 try {
 const response = await this.fetchWithTimeout(
 endpoint,
 {
 method: 'GET',
 headers: {
 Accept: 'application/json',
 ...(config.apiKey ? { Authorization: this.getAuthHeader(config) } : {})
 }
 },
 15_000,
 config.requestSignal
 );
 if (response.ok) return { valid: true };
 if (response.status === 401 || response.status === 403) {
 const raw = await response.text().catch(() => '');
 return {
 valid: false,
 error: 'API Key 无效或无权限: ' + response.status + ' ' + response.statusText + (raw ? ' | ' + raw.slice(0, 300) : '')
 };
 }
 } catch {
 // try next probe path
 }
 }

 await this.complete(
 [{ role: 'user', content: 'ping' }],
 {
 ...config,
 model: config.model || this.defaultModel,
 temperature: 0,
 maxTokens: 32
 },
 { timeoutMs: 20_000 }
 );
 return { valid: true };
 } catch (error) {
 return { valid: false, error: error instanceof Error ? error.message : '连接失败（可能超时）' };
 }
 }
}
