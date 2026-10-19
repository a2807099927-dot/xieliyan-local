// index.ts - Core shared domain types.
import type { AiProvider } from './ai';
import type { OutlineVisionData } from './ov';

export interface InspirationNote {
 id: string;
 content: string;
 type: '起点' | '终点' | '锚点' | '设定' | '未定';
 tags?: string[];
 order?: number;
 linkedDeductionId?: string;
 createdAt: string;
 updatedAt: string;
}

export interface StructureTreeNode {
 label: string;
 type: 'root' | 'arc' | 'event' | 'sub_plot';
 desc?: string;
 children?: StructureTreeNode[];
}

export interface Chapter {
 id: string;
 title: string;
 content: string;
 wordCount: number;
 createdAt: string;
 updatedAt: string;
 notes?: string;
 outline?: string;
}

export interface RecycledChapter extends Chapter {
 deletedAt: string;
}

export interface PlotNode {
 time?: string;
 action: string;
 nodeType: '背景铺垫' | '转折点' | '高潮点' | '其他';
 impactLevel?: number;
}

export interface PlotEventRecord {
 time?: string;
 subject: string;
 target?: string;
 detail: string;
 chapter?: string;
 evidence?: string;
 impactLevel?: number;
}

export interface AgentChapterOutline {
 summary: string;
 chapterTarget: string;
 sceneBeats: string[];
 locations: string[];
 charactersInvolved: string[];
 conflictNotes: string[];
 gains: string[];
 relationshipChanges: string[];
 endingState: string;
 openLoops: string[];
 tags: string[];
}

export type StoryArchiveKind = 'character' | 'item' | 'skill' | 'faction' | 'relationship' | 'foreshadow' | 'event';

export interface StoryArchiveRecord {
 id: string;
 kind: StoryArchiveKind;
 title: string;
 subject: string;
 target?: string;
 detail: string;
 status?: string;
 chapterId: string;
 chapterTitle?: string;
 sourceChapterIds?: string[];
 evidence?: string;
 tags?: string[];
 importance?: number;
 createdAt: string;
 updatedAt?: string;
}

export interface StoryArchiveBucket {
 key: string;
 kind: StoryArchiveKind;
 title: string;
 aliases?: string[];
 records: StoryArchiveRecord[];
 chapters: string[];
 summary: string;
 latestStatus?: string;
 importance?: number;
 updatedAt: string;
}

export interface StoryArchiveIndex {
 generatedAt: string;
 sourceRecordCount: number;
 buckets: {
 characters: StoryArchiveBucket[];
 items: StoryArchiveBucket[];
 skills: StoryArchiveBucket[];
 factions: StoryArchiveBucket[];
 relationships: StoryArchiveBucket[];
 foreshadows: StoryArchiveBucket[];
 events: StoryArchiveBucket[];
 };
}

export interface ChapterMemory {
 chapterId: string;
 summary: string;
 isAnalyzed: boolean;
 plotAnalysis?: {
 narrativeChain: string;
 keyNodes: PlotNode[];
 plotSynopsis?: string;
 functionSummary: string;
 acquisitions?: PlotEventRecord[];
 alliances?: PlotEventRecord[];
 relationProgress?: PlotEventRecord[];
 };
 agentOutline?: AgentChapterOutline;
 archiveRecords?: StoryArchiveRecord[];
 aiInference?: {
 generatedAt: string;
 providerModel?: string;
 structureTree?: StructureTreeNode | null;
 timelineEvents?: Array<{
 time: string;
 location: string;
 event: string;
 impact: number;
 phase?: string;
 chapter?: string;
 contextQuote?: string;
 }>;
 parallelThreads?: Array<{
 name: string;
 status: '已闭环' | '待推进' | '已埋伏笔' | '疑似伏笔' | '已回收' | '进行中';
 progress: string;
 evidence?: string;
 }>;
 predictions?: Array<{
 direction: string;
 probability: string;
 suggestion: string;
 }>;
 rawText?: string;
 };
}

export interface Volume {
 id: string;
 title: string;
 chapters: Chapter[];
 startChapterId?: string;
}

export interface ContextItem {
 id: string;
 title: string;
 content: string;
 enabled: boolean;
 order: number;
}

export interface LoreItem {
 id: string;
 name: string;
 category: string;
 content: string;
 order: number;
}

export interface WorldBuilderItem {
 id: string;
 category: '世界观' | '地理' | '势力' | '人物' | '其他';
 name: string;
 fields: Record<string, string>;
 content: string;
 tags?: string[];
 createdAt: string;
}

export interface RoleProfile {
 id: string;
 name: string;
 aliases: string[];
 faction: string;
 roleType: '主角' | '女主' | '配角' | '反派' | '龙套' | 'NPC' | '势力' | '待分类';
 description: string;
 firstAppearance: string;
 chapters: string[];
 extractedAt?: string;
 note?: string;
 realm?: string;
 abilities?: string[];
 equipment?: string[];
 inventory?: string[];
 plotProgress?: string;
 relationshipTimeline?: RoleRelationshipEvent[];
 avatar?: string;
 customFields?: Record<string, string>;
}

export interface RoleRelationshipEvent {
 id: string;
 target: string;
 chapterTitle: string;
 event: string;
 change: string;
 detail: string;
 status: string;
 importance?: number;
 createdAt?: string;
}

export interface RoleCategory {
 id: string;
 name: string;
 isAuto: boolean;
 children: RoleProfile[];
 order: number;
}

export interface ExtractedRolePayload {
 name: string;
 aliases: string[];
 faction: string;
 profession?: string;
 roleType: string;
 description: string;
 firstAppearance: string;
 chapters: string[];
 items?: string[];
 skills?: string[];
 skillDetails?: Record<string, string>;
 equipment?: string[];
 equipmentDetails?: Record<string, string>;
 relations?: string[];
 relationshipTimeline?: Array<{
 target: string;
 chapterTitle?: string;
 event?: string;
 change?: string;
 detail?: string;
 status?: string;
 importance?: number;
 }>;
 plotNodes?: string[];
 isUncertain?: boolean;
}

export interface CharacterScanResult {
 scannedAt: string;
 totalChapters: number;
 scannedChapters: number;
 status: 'idle' | 'scanning' | 'done' | 'error';
}

export interface ResourceIndex {
 customCharacterCategories: RoleCategory[];
 storyArchiveIndex?: StoryArchiveIndex;
 novelType?: 'shuangwen' | 'xuanhuan' | 'qihuan' | 'wuxia' | 'xianxia' | 'dushi' | 'xianshi' | 'lishi' | 'youxi' | 'tiyu' | 'kehuan' | 'zhutian' | 'xuanyi' | 'qingxiaoshuo' | 'virtual_mmo' | 'urban' | 'alternate_history' | 'wenyi' | 'lishishuangwen';
 characterScan?: CharacterScanResult;
 roleExtractState?: {
 lastExtractedChapterId?: string;
 lastExtractedAt?: string;
 };
 /** 用户自定义的角色档案分类标签（如"丹药"、"宗门"等） */
 customViewTabs?: string[];
 schemaVersion: number;
}

export interface BookSettings {
 worldSettings?: string;
 plotOutline?: string;
 characterChats?: string;
 theme?: 'light' | 'dark' | 'auto';
 fontFamily?: string;
 fontSize?: number;
 lineHeight?: number;
 editorWidth?: 'narrow' | 'medium' | 'wide' | 'full';
 /** 绑定的文风配置 ID（对应 AppConfig.ai.styleProfiles） */
 boundStyleProfileId?: string;
}


/** Agent 持久学习记忆（用户确认后的事实约束） */
export interface AgentMemoryEntry {
  id: string;
  fact: string;
  source: string;
  confirmed: boolean;
  createdAt: string;
  lastUsedAt?: string;
  entity?: string;
  reason?: string;
}


/** 用户确认后的写作风格偏好（来自改稿学习） */
export type StylePreferenceType =
  | 'sentence_length'
  | 'word_choice'
  | 'description_density'
  | 'dialogue_ratio'
  | 'paragraph_rhythm';

export type StylePreferenceDirection = 'shorten' | 'lengthen' | 'increase' | 'decrease' | 'prefer' | 'avoid';

export interface UserStylePreference {
  id: string;
  type: StylePreferenceType;
  direction: StylePreferenceDirection;
  evidence: string;
  confidence: number;
  confirmed: boolean;
  createdAt: string;
  lastUsedAt?: string;
  label?: string;
}

/** Review hard-issue 维度统计（自适应清单） */
export interface ReviewDimensionStat {
  dimension: string;
  hardFailStreak: number;
  passStreak: number;
  totalHard: number;
  totalPass: number;
  lastAt?: string;
}

export interface AdaptiveReviewState {
  stats: ReviewDimensionStat[];
  /** 自动追加的针对性检查项 */
  extraChecks: string[];
  /** 降级为 soft 的维度 */
  softDimensions: string[];
  updatedAt?: string;
}

export interface Book {
 id: string;
 title: string;
 author?: string;
 cover?: string;
 description?: string;
 chapters: Chapter[];
 volumes?: Volume[];
 settings: BookSettings;
 resourceIndex?: ResourceIndex;
 contextBasket?: ContextItem[];
 worldSettings?: LoreItem[];
 worldBuilder?: WorldBuilderItem[];
 memoryBank?: ChapterMemory[];
 /** Agent 学习到的持久事实约束（confirmed 后参与 HARD CONSTRAINTS） */
 agentMemory?: AgentMemoryEntry[];
 /** 用户确认的写作风格偏好 */
 userStylePreferences?: UserStylePreference[];
  /** 自适应审查清单状态 */
  adaptiveReviewState?: AdaptiveReviewState;
  /** 老书「书的理解」是否已获用户确认（首次对齐一次，关键变更后重置 false） */
  agentContextConfirmed?: boolean;
 outlineVision?: OutlineVisionData;
 recycledChapters?: RecycledChapter[];
 /** 作品相关（序章、设定等非正文章节 ID 列表） */
 miscChapterIds?: string[];
 inspirationNotes?: InspirationNote[];
 createdAt: string;
 updatedAt: string;
}

export interface TokenUsage {
 promptTokens: number;
 completionTokens: number;
 totalTokens: number;
 cachedTokens: number;
 estimatedCost: number;
 provider: AiProvider;
 model: string;
 timestamp: string;
}
