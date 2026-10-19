// styleResolver.ts
// 根据当前书籍解析有效的文风配置（优先使用书籍绑定，否则 fallback 到全局默认）
import type { AppConfig } from '../types/ai';
import type { Book } from '../types';
import { BUILTIN_STYLE_PRESET_META } from '../ai/stylePresetCatalog';

export interface ResolvedStyle {
 stylePresetId: string;
 styleInstruction: string;
}

export interface ChatMessagePayload {
 role: 'system' | 'user' | 'assistant';
 content: string;
}

const BUILTIN_PRESET_IDS = new Set(BUILTIN_STYLE_PRESET_META.map((p) => p.id));

function isBuiltinPresetId(id: string): boolean {
 return BUILTIN_PRESET_IDS.has(id);
}

/**
 * 解析指定书籍应使用的有效文风。
 * 优先级：书籍绑定 > 全局 activeStyleProfileId（自定义） > 全局 activeStylePresetId（内置）
 */
export function resolveStyleForBook(
 bookId: string | undefined,
 config: AppConfig,
 books: Book[]
): ResolvedStyle {
 // 1. 尝试从书籍绑定中解析
 if (bookId) {
 const book = books.find((b) => b.id === bookId);
 const boundId = book?.settings?.boundStyleProfileId;
 if (boundId) {
 // 显式关闭
 if (boundId === 'off') {
 return { stylePresetId: '', styleInstruction: '' };
 }
 // 直接绑定内置预设（格式 'preset:<id>' 兼容旧数据）
 if (boundId.startsWith('preset:')) {
 return {
 stylePresetId: boundId.slice('preset:'.length),
 styleInstruction: ''
 };
 }
 // 绑定到内置预设（直接存 preset ID）
 if (isBuiltinPresetId(boundId)) {
 return { stylePresetId: boundId, styleInstruction: '' };
 }
 // 绑定到自定义 profile
 const profile = config.ai.styleProfiles?.find((p) => p.id === boundId);
 if (profile) {
 return {
 stylePresetId: profile.stylePresetId || '',
 styleInstruction: profile.styleInstruction || ''
 };
 }
 }
 }

 // 2. 全局自定义 profile 优先
 if (config.ai.activeStyleProfileId) {
 const profile = config.ai.styleProfiles?.find((p) => p.id === config.ai.activeStyleProfileId);
 if (profile) {
 return {
 stylePresetId: profile.stylePresetId || '',
 styleInstruction: profile.styleInstruction || ''
 };
 }
 }

 // 3. Fallback 到全局内置预设（兼容旧配置）
 return {
 stylePresetId: config.ai.activeStylePresetId ?? config.ai.stylePresetId ?? '',
 styleInstruction: config.ai.styleInstruction || ''
 };
}

/**
 * 根据解析出的风格构建 system prompt 消息。
 * 当前仅注入自定义指令（styleInstruction）；
 * 内置预设的 prompt 文本暂由主进程侧处理（Tauri 版需后续补充 bundle）。
 */
export function buildStyleSystemMessage(
 stylePresetId: string,
 styleInstruction: string
): ChatMessagePayload | null {
 const instruction = String(styleInstruction || '').trim();
 if (instruction) {
 return {
 role: 'system',
 content: `【写作风格设定】\n${instruction}\n\n请严格遵循以上风格设定进行输出。`
 };
 }
 // 内置 preset：前端暂无 prompt 文本，返回 null，由主进程通过 stylePresetId 通道注入
 return null;
}

/**
 * 将风格 system prompt 注入到消息列表头部（如未禁用）。
 */
export function injectStyleToMessages(
 messages: ChatMessagePayload[],
 bookId: string | undefined,
 config: AppConfig,
 books: Book[],
 disabled?: boolean
): ChatMessagePayload[] {
 if (disabled) return messages;
 const style = resolveStyleForBook(bookId, config, books);
 const styleMsg = buildStyleSystemMessage(style.stylePresetId, style.styleInstruction);
 if (!styleMsg) return messages;
 return [styleMsg, ...messages];
}
