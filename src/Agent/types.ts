// 模块说明：Agent 系统通用类型声明。
// 关键职责：定义会话、消息、工具调用、能力清单等接口。
export type AgentGenreId =
 | 'urban'
 | 'xuanhuan'
 | 'wenyi'
 | 'youxi'
 | 'lishi'
 | 'lishishuangwen'
 | 'shuangwen'
 | 'unknown';

export type CraftPatternType =
 | 'dialogue'
 | 'structure'
 | 'psychology'
 | 'rhythm'
 | 'description'
 | 'info_density'
 | 'other';

export interface AgentPlanningResult {
 intent?: string;
 tone?: string[];
 emotionArc?: string[];
 requiredBeats?: string[];
 forbiddenMoves?: string[];
 contextHints?: string[];
}

export interface AgentPlanningParseResult {
 ok: boolean;
 planning: AgentPlanningResult | null;
 rawText: string;
 error?: string;
}

export interface AgentTaskSheet {
 version: string;
 primaryGenre: AgentGenreId;
 userInstruction: string;
 plotIntent: string;
 tone: string[];
 requiredBeats: string[];
 emotionalArc: string[];
 forbiddenMoves: string[];
 contextHints: string[];
 referenceChapters: string[];
 requestedCapabilities: string[];
 styleOverrides?: Partial<AgentStyleProfile>;
}

export interface AgentStyleProfile {
 sentenceLenRange?: Record<string, [number, number]>;
 perspective?: string;
 bannedWords?: string[];
 bannedSceneTypes?: string[];
 tone?: string;
 paragraphAvgLines?: number | Record<string, number>;
 paragraphMaxLines?: number;
 conflictShortSentenceRatio?: number;
 dialogueNarrationInterval?: string;
 narrationInsertMaxChars?: number;
 descriptionOrder?: string[];
 descriptionFirstAppearanceMaxChars?: number;
 sensoryChannels?: Record<string, number>;
 chapterStructure?: Record<string, unknown>;
 conflictResolutionLogic?: Record<string, string>;
 infoDensity?: Record<string, unknown>;
 [key: string]: unknown;
}

export interface AgentReflectorThreshold {
 passTotal: number;
 maxTotal: number;
 keyDimensions: string[];
 keyMinScore: number;
 dimensions: Record<string, unknown>;
}

export interface GenreProfile {
 genre: AgentGenreId;
 displayName: string;
 reflectorThreshold: AgentReflectorThreshold;
 styleProfile: AgentStyleProfile;
 conflictSignals: Record<string, string[]>;
 craftFingerprint: Record<string, string>;
 /** 无脑爽文模式专属 system prompt，从加密的 runtime.dat 里读取 */
 shuangwenPrompt?: string;
 raw: Record<string, unknown>;
}

export interface CraftTriggerRule {
 if?: string;
 then?: string;
 because?: string;
 example?: string;
 [key: string]: unknown;
}

export interface CraftTemplate {
 template: string;
 type?: string;
 context?: string;
 [key: string]: unknown;
}

export interface CraftPattern {
 id: string;
 genre: AgentGenreId;
 patternType: CraftPatternType;
 patternName: string;
 frequency: string;
 triggerConditions: CraftTriggerRule[];
 templates: CraftTemplate[];
 forbidden: string[];
 conflictSignals: Record<string, string[]>;
 examples: Record<string, unknown>;
 ruleSummary: string;
 source: string;
 createdAt: number;
 tags: string[];
 searchableText: string;
}

export interface GenrePack {
 genre: AgentGenreId;
 profile: GenreProfile;
 patterns: CraftPattern[];
}

export interface PatternSelection {
 primaryGenre: AgentGenreId;
 primaryPatterns: CraftPattern[];
 borrowedPatterns: CraftPattern[];
 requestedCapabilities: string[];
}

export interface AgentReferenceBundle {
 primaryGenre: AgentGenreId;
 profileSnippet: string;
 perspective?: string;
 patternSnippet: string;
 selectedPatternIds: string[];
 borrowedPatternIds: string[];
 requestedCapabilities: string[];
 /** 无脑爽文模式专属 system prompt，从加密包里读取后透传给 messageBuilder */
 shuangwenPrompt?: string;
}

export interface AgentChapterReference {
 id: string;
 title: string;
 reason: 'explicit' | 'previous' | 'current' | 'library';
 excerpt: string;
 chapterIndex: number;
}

export interface AgentWorkspaceBridge {
 getSelection: (
 chapterId: string
 ) => { from: number; to: number; text: string } | null | Promise<{ from: number; to: number; text: string } | null>;
 reviewRewrite: (chapterId: string, range: { from: number; to: number }, rewritten: string) => Promise<boolean> | boolean;
 applyDraft?: (chapterId: string, content: string, mode: 'replace' | 'append') => Promise<boolean> | boolean;
}
