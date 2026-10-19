// helpers 
import type { TokenUsage } from '../../types';
import type { AiProvider, ChatMessage } from '../../types/ai';

export function estimateTextTokens(text: string): number {
 // Chinese characters usually occupy more tokens than English words.
 // A safe heuristic for Chinese-heavy text in many modern models is ~0.8 to 1.2 characters per token.
 // Using 1.1x multiplier for conservative safety in novel writing contexts.
 const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
 const englishCount = text.length - chineseCount;
 return Math.max(1, Math.ceil(chineseCount * 1.1 + englishCount / 4));
}

export function estimateUsage(
 messages: ChatMessage[],
 output: string,
 provider: AiProvider,
 model: string
): TokenUsage {
 const promptTokens = estimateTextTokens(messages.map((m) => m.content).join('\n'));
 const completionTokens = estimateTextTokens(output);
 const totalTokens = promptTokens + completionTokens;
 const estimatedCost = totalTokens * 0.000002;

 return {
 promptTokens,
 completionTokens,
 totalTokens,
 cachedTokens: 0,
 estimatedCost,
 provider,
 model,
 timestamp: new Date().toISOString()
 };
}

export async function withRetries<T>(
 retries: number,
 baseDelayMs: number,
 fn: () => Promise<T>
): Promise<T> {
 let lastError: unknown;
 for (let i = 0; i <= retries; i += 1) {
 try {
 return await fn();
 } catch (error) {
 lastError = error;
 if (i === retries) break;
 const delay = baseDelayMs * 2 ** i;
 await new Promise((resolve) => setTimeout(resolve, delay));
 }
 }
 throw lastError;
}

