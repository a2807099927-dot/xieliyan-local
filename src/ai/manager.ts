// 模块说明：AI 调用统一管理器（前端侧）。
// 关键职责：路由到对应 Provider、注入题材提示词、调度流式回调。
import type { BaseAdapter } from './adapters/base';
import type { AiProvider, AiProviderConfig, ChatMessage, ChatOptions, CompletionResult, StreamChunk } from '../types/ai';
import { openaiAdapter, deepseekAdapter, grokAdapter, zhipuAdapter, sensenovaAdapter, proxyAdapter, localAdapter, vertexOpenAIAdapter } from './adapters/compatibles';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { withRetries } from './adapters/helpers';

const adapters: Record<AiProvider, BaseAdapter> = {
 openai: openaiAdapter,
 anthropic: new AnthropicAdapter(),
 gemini: new GeminiAdapter(),
 vertex_ai: vertexOpenAIAdapter,
 deepseek: deepseekAdapter,
 grok: grokAdapter,
 zhipu: zhipuAdapter,
 sensenova: sensenovaAdapter,
 proxy: proxyAdapter,
 local: localAdapter
};

export class AiManager {
 private readonly stylePromptCache = new Map<string, { key: string; prompt: string; updatedAt: number }>();

 constructor(private readonly getConfig: () => Promise<AiProviderConfig>) {}

 private shouldUseStyleCache(provider: AiProvider): boolean {
 return provider === 'openai' || provider === 'deepseek' || provider === 'gemini';
 }

 private buildStyleCacheKey(config: AiProviderConfig, styleInstruction: string): string {
 const provider = String(config.provider || '').trim();
 const model = String(config.model || '').trim();
 return [provider, model, styleInstruction].join('::');
 }

 getOrCreateStyleCache(config: AiProviderConfig, resolvedStylePrompt?: string): { key: string; prompt: string; updatedAt: number } | null {
 const styleInstruction = String(resolvedStylePrompt || '').trim();
 if (!styleInstruction) return null;
 const key = this.buildStyleCacheKey(config, styleInstruction);
 const existing = this.stylePromptCache.get(key);
 if (existing) return existing;

 const created = {
 key,
 prompt: `【人物/文风设定】\n${styleInstruction}\n\n请严格遵循以上风格设定进行输出。`,
 updatedAt: Date.now()
 };
 this.stylePromptCache.set(key, created);
 return created;
 }

 private injectStyleInstruction(messages: ChatMessage[], resolvedStylePrompt?: string): ChatMessage[] {
 const styleInstruction = String(resolvedStylePrompt || '').trim();
 if (!styleInstruction) return messages;

 const styleSystemMessage: ChatMessage = {
 role: 'system',
 content: `【人物/文风设定】\n${styleInstruction}\n\n请严格遵循以上风格设定进行输出。`
 };

 return [styleSystemMessage, ...messages];
 }

 private injectStyleInstructionWithCache(messages: ChatMessage[], config: AiProviderConfig, resolvedStylePrompt?: string): ChatMessage[] {
 const cache = this.getOrCreateStyleCache(config, resolvedStylePrompt);
 if (!cache) return messages;
 return [{ role: 'system', content: cache.prompt }, ...messages];
 }

 private injectRagContext(messages: ChatMessage[], config: AiProviderConfig & { ragEnabled?: boolean }, ragContext?: string): ChatMessage[] {
 if (config.ragEnabled === false) return messages;
 const content = (ragContext || '').trim();
 if (!content) return messages;
 return [{ role: 'system', content }, ...messages];
 }

 prepareMessages(
 messages: ChatMessage[],
 config: AiProviderConfig & { ragEnabled?: boolean },
 ragContext?: string,
 options?: { useStyleCache?: boolean; stylePrompt?: string }
 ): ChatMessage[] {
 const withRag = this.injectRagContext(messages, config, ragContext);
 const styleCacheEnabled = config.styleCacheEnabled !== false;
 const useStyleCache = options?.useStyleCache === true && styleCacheEnabled && this.shouldUseStyleCache(config.provider);
 const stylePrompt = String(options?.stylePrompt || '').trim();
 return useStyleCache
 ? this.injectStyleInstructionWithCache(withRag, config, stylePrompt)
 : this.injectStyleInstruction(withRag, stylePrompt);
 }

 getAdapter(provider: AiProvider): BaseAdapter {
 const adapter = adapters[provider];
 if (!adapter) {
 throw new Error(`未知 AI 适配器 "${provider}"，请检查接口配置并重启应用后重试`);
 }
 return adapter;
 }

 async chat(messages: ChatMessage[], options?: ChatOptions): Promise<CompletionResult> {
 const config = await this.getConfig();
 return this.chatPrepared(this.prepareMessages(messages, config), config, options);
 }

 async chatPrepared(messages: ChatMessage[], config?: AiProviderConfig, options?: ChatOptions): Promise<CompletionResult> {
 const baseConfig = config ?? (await this.getConfig());
 const resolvedConfig = options?.maxTokens ? { ...baseConfig, maxTokens: options.maxTokens } : baseConfig;
 const adapter = this.getAdapter(resolvedConfig.provider);
 const retries = 1; // Retry once to avoid transient network jitter causing a hard failure.
 return withRetries(retries, 1000, () => adapter.complete(messages, resolvedConfig, options));
 }

 async streamPrepared(
 messages: ChatMessage[],
 onChunk: (chunk: StreamChunk) => void,
 config?: AiProviderConfig
 ): Promise<CompletionResult> {
 const resolvedConfig = config ?? (await this.getConfig());
 const adapter = this.getAdapter(resolvedConfig.provider);
 return adapter.stream(messages, resolvedConfig, onChunk);
 }

 async stream(
 messages: ChatMessage[],
 onChunk: (chunk: StreamChunk) => void
 ): Promise<CompletionResult> {
 const config = await this.getConfig();
 return this.streamPrepared(this.prepareMessages(messages, config), onChunk, config);
 }

 async validate(): Promise<{ valid: boolean; error?: string }> {
 const config = await this.getConfig();
 const adapter = this.getAdapter(config.provider);
 return adapter.validate(config);
 }
}
