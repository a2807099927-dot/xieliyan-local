// ai 
// AI 
import type { TokenUsage } from './index';
import type { AgentGenreId } from '../Agent/types';

export type AiProvider =
 | 'openai'
 | 'anthropic'
 | 'gemini'
 | 'vertex_ai'
 | 'deepseek'
 | 'grok'
 | 'zhipu'
 | 'sensenova'
 | 'proxy'
 | 'local';

export interface ProxyProfile {
 id: string;
 name: string;
 baseUrl: string;
 apiPath: string;
 apiKey: string;
 model: string;
}

export interface StyleProfile {
 id: string;
 name: string;
 /** 文风预设 ID。'' = 关闭，'custom' = 自定义，其它 = 内置预设 ID */
 stylePresetId: string;
 /** 自定义文风文本（仅 stylePresetId === 'custom' 时使用） */
 styleInstruction: string;
 /** 绑定到的书籍 ID 列表 */
 boundBookIds?: string[];
}

export interface AiProviderConfig {
 provider: AiProvider;
 apiKey: string;
 model: string;
 baseUrl: string;
 apiPath: string;
 isLocked: boolean;
 /** 文风预设 ID。'' 或 undefined = 关闭，'custom' = 自定义，其它 = 内置预设 ID。
 * 保留作为全局默认 fallback；优先使用 styleProfiles 中绑定的配置。 */
 stylePresetId?: string;
 /** 自定义文风文本（仅 stylePresetId === 'custom' 时使用）
 * 保留作为全局默认 fallback；优先使用 styleProfiles 中绑定的配置。 */
 styleInstruction?: string;
 styleCacheEnabled?: boolean;
 /** 文风配置库 */
 styleProfiles?: StyleProfile[];
 /** 当前在设置面板中选中的 profile ID（仅 stylePresetId === 'custom' 时有效） */
 activeStyleProfileId?: string;
 /** 当前选中的内置预设 ID（空字符串 = 关闭，与 activeStyleProfileId 互斥） */
 activeStylePresetId?: string;
 // Agent 模式：
 // 'builtin' — 使用内置 genre-pack 题材写作体系（默认）
 // 'custom' — 用户自定义编辑/写手/剧情规划师三个角色的 prompt
 agentMode?: 'builtin' | 'custom';
 // 自定义 Agent 三角色 prompt
 customEditorPrompt?: string;
 customWriterPrompt?: string;
 customPlannerPrompt?: string;
 // Agent 默认题材（编辑器 Agent 模式下使用，不设置则自动从书籍推断）
 agentGenre?: AgentGenreId;
 temperature?: number;
 maxTokens?: number;
 providerKeys?: Record<string, string>;
 providerBaseUrls?: Record<string, string>;
 providerApiPaths?: Record<string, string>;
 providerModels?: Record<string, string[]>;
 providerLastModels?: Record<string, string>;
 proxyProfiles?: ProxyProfile[];
 activeProxyProfileId?: string;

 requestSignal?: AbortSignal;
 requestTimeoutMs?: number;
 responseType?: 'text' | 'json';

 // Vertex AI specific fields
 vertexProjectId?: string;
 vertexLocation?: string;
 vertexRegion?: string;
 vertexServiceAccountJson?: string;
 vertexAccessToken?: string;
 vertexOAuthClientId?: string;
 vertexOAuthClientSecret?: string;
 vertexOAuthRefreshToken?: string;
}

/** 云同步支持的网盘厂商（坚果云 / 通用 WebDAV / 阿里云盘） */
export type CloudProviderId = 'nutstore' | 'webdav' | 'aliyun';

/** 单厂商凭证（按 TAB 切换保存） */
export interface CloudProviderProfile {
  /** WebDAV 地址（坚果云 / 通用 WebDAV） */
  url?: string;
  username?: string;
  password?: string;
  remotePath?: string;
  /** 阿里云盘扫码凭证 */
  accessToken?: string;
  refreshToken?: string;
  cookie?: string;
  folderId?: string;
  appId?: string;
  appKey?: string;
  /** 备注：远端目录名等 */
  note?: string;
}

export interface CloudSyncConfig {
  enabled: boolean;
  activeProvider: CloudProviderId;
  providers: Partial<Record<CloudProviderId, CloudProviderProfile>>;
}

export interface AppConfig {
 ai: AiProviderConfig & {
 contextTransparencyEnabled: boolean;
 contextBudgetEnabled: boolean;
 ragEnabled: boolean;
 /** 关闭 AI 自动提取角色档案（智能整理时不输出 archiveRecords） */
 disableAutoRoleExtract?: boolean;
 };
 network: {
 requestTimeoutMs: number;
 maxRetries: number;
 retryDelayMs: number;
 errorLogging: boolean;
 };
 ui: {
 windowPreset: 'follow-system' | '1366x768' | '1600x900' | '1920x1080';
  theme:
  | 'auto'
  | 'light'
  | 'dark'
  | 'parchment'
  | 'matcha';
 uploadedFonts?: Array<{
 id: string;
 name: string;
 family: string;
 dataUrl: string;
 }>;
 customTheme: {
 ambientGlow: string;
 primaryColor: string;
 secondaryColor: string;
 gradientFrom: string;
 gradientTo: string;
 backgroundImage: string;
 surfaceAlpha: number;
 fontFamily: string;
 textColor: string;
 textBrightness: number;
 };
 language: 'zh-CN' | 'en';
 sidebarWidth: number;
 rightPanelWidth: number;
 editorFontFamily: string;
 editorFontColor: string;
 editorFontWeight: number;
 editorTextBrightness: number;
 editorFontSize: number;
 editorLineHeight: number;
 editorMaxWidth: number;
 appBrightness: number;
 appContrast: number;
 appSaturation: number;
 rightPanelMode: 'overlay' | 'push';
 chapterListOrder: 'asc' | 'desc';
 chapterWordGoal: number;
 memoryBankChapterOrder: 'asc' | 'desc';
 lowPerformanceMode?: boolean;
 editorGridLine?: 'none' | 'solid' | 'dashed';
 /** 正文写完一段按回车时，右侧弹出 AI 段落建议卡片（默认开启） */
 enableInlineSuggestion?: boolean;
 };
  agent: {
    /** Agent 人格语气 */
    persona: 'casual' | 'formal' | 'editorial' | 'partner';
    /** 自定义人格描述 */
    customPersona?: string;
    /** Agent 回复语言 */
    language: 'zh-CN' | 'en';
    /** 写前复盘（pre-write reflection）：动笔前先形成写作决策。默认关闭（正文纯执行）；显式 true 时开启，写作更快 */
    preWriteReflection?: boolean;
  };
 workspace: {
 storagePath: string;
 autoSaveIntervalMs: number;
 backupEnabled: boolean;
 backupCount: number;
 backupOutputPath?: string;
 lastBackupAt?: string;
 novelLabSavePath?: string;
 lastNovelLabPath?: string;
 };
 webdav?: {
 enabled: boolean;
 url: string;
 username: string;
 password: string;
 remotePath: string;
 /** 当前选用的云盘厂商（与 cloudSync.activeProvider 同步） */
 provider?: CloudProviderId;
 };
 /**
  * 多网盘云同步配置：坚果云 WebDAV 可用；其它厂商保存凭证并按 TAB 切换。
  * 上传/下载引擎：nutstore → 现有 WebDAV；其它厂商通道按接口逐步开放。
  */
 cloudSync?: CloudSyncConfig;
 plugins: {
 enabled: string[];
 userPluginDir: string;
 };
 tokenStats: {
 totalUsed: number;
 estimatedCost: number;
 byProvider: Record<string, number>;
 };
 schemaVersion: number;
}

export interface ChatMessage {
 role: 'system' | 'user' | 'assistant';
 content: string;
}

export interface StreamChunk {
 text: string;
 done: boolean;
 sessionId?: string;
}

export interface CompletionResult {
 text: string;
 usage: TokenUsage;
 model: string;
 provider: AiProvider;
 durationMs: number;
}

export interface ChatOptions {
 stream?: boolean;
 timeoutMs?: number;
 maxTokens?: number;
 responseType?: 'text' | 'json';
}

export interface ValidateResult {
 valid: boolean;
 error?: string;
}


