// base 
import type {
 AiProvider,
 AiProviderConfig,
 ChatMessage,
 ChatOptions,
 CompletionResult,
 StreamChunk,
 ValidateResult
} from '../../types/ai';

export interface BaseAdapter {
 provider: AiProvider;
 name: string;
 isLocked: boolean;
 lockedBaseUrl?: string;
 lockedApiPath?: string;
 supportedModels: string[];
 defaultModel: string;

 complete(messages: ChatMessage[], config: AiProviderConfig, options?: ChatOptions): Promise<CompletionResult>;
 stream(
 messages: ChatMessage[],
 config: AiProviderConfig,
 onChunk: (chunk: StreamChunk) => void
 ): Promise<CompletionResult>;
 completeJson<T>(messages: ChatMessage[], config: AiProviderConfig): Promise<T>;
 validate(config: AiProviderConfig): Promise<ValidateResult>;
}

export function stripMarkdownCodeFences(input: string): string {
 return input.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

