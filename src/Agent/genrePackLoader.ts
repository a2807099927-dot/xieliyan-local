// 模块说明：题材提示词包加载器。
// 关键职责：从 runtime.dat 解密读取题材资源，按主题装配 system 提示。
import { parseCraftPatternsFromSql } from './sqlCraftSeedParser';
import { normalizeGenreId } from './normalize';
import type { GenrePack, GenreProfile } from './types';

function toNumberRecord(value: unknown): Record<string, number> | undefined {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
 return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, Number(item)]));
}

function normalizeProfile(raw: Record<string, unknown>): GenreProfile {
 const reflectorThreshold = (raw.reflector_threshold ?? {}) as Record<string, unknown>;
 const rawStyleProfile = (raw.style_profile ?? {}) as Record<string, unknown>;
 const styleProfile = {
 sentenceLenRange: rawStyleProfile.sentence_len_range as Record<string, [number, number]> | undefined,
 perspective: typeof rawStyleProfile.perspective === 'string' ? rawStyleProfile.perspective : undefined,
 bannedWords: Array.isArray(rawStyleProfile.banned_words)
 ? rawStyleProfile.banned_words.map((item) => String(item))
 : undefined,
 bannedSceneTypes: Array.isArray(rawStyleProfile.banned_scene_types)
 ? rawStyleProfile.banned_scene_types.map((item) => String(item))
 : undefined,
 tone: typeof rawStyleProfile.tone === 'string' ? rawStyleProfile.tone : undefined,
 paragraphAvgLines:
 typeof rawStyleProfile.paragraph_avg_lines === 'number' || typeof rawStyleProfile.paragraph_avg_lines === 'object'
 ? (rawStyleProfile.paragraph_avg_lines as number | Record<string, number>)
 : undefined,
 paragraphMaxLines: Number(rawStyleProfile.paragraph_max_lines) || undefined,
 conflictShortSentenceRatio: Number(rawStyleProfile.conflict_short_sentence_ratio) || undefined,
 dialogueNarrationInterval:
 typeof rawStyleProfile.dialogue_narration_interval === 'string' ? rawStyleProfile.dialogue_narration_interval : undefined,
 narrationInsertMaxChars: Number(rawStyleProfile.narration_insert_max_chars ?? rawStyleProfile.narration_insert_avg_chars) || undefined,
 descriptionOrder: Array.isArray(rawStyleProfile.description_order)
 ? rawStyleProfile.description_order.map((item) => String(item))
 : undefined,
 descriptionFirstAppearanceMaxChars:
 Number(rawStyleProfile.description_first_appearance_max_chars ?? rawStyleProfile.description_first_appearance_avg_chars) || undefined,
 sensoryChannels: toNumberRecord(rawStyleProfile.sensory_channels),
 chapterStructure: (rawStyleProfile.chapter_structure ?? {}) as Record<string, unknown>,
 conflictResolutionLogic: (rawStyleProfile.conflict_resolution_logic ?? {}) as Record<string, string>,
 infoDensity: (rawStyleProfile.info_density ?? {}) as Record<string, unknown>,
 psychologyDepthRatio: toNumberRecord(rawStyleProfile.psychology_depth_ratio),
 raw: rawStyleProfile
 };
 const conflictSignals = (raw.conflict_signals ?? {}) as Record<string, string[]>;
 const craftFingerprint = (raw.craft_fingerprint ?? {}) as Record<string, string>;
 // shuangwen_prompt：无脑爽文模式的专属 system prompt，存在 profile 里随 runtime.dat 加密
 const shuangwenPrompt = typeof raw.shuangwen_prompt === 'string' ? raw.shuangwen_prompt : undefined;

 return {
 genre: normalizeGenreId(raw.genre),
 displayName: String(raw.display_name || raw.genre || '未命名题材'),
 reflectorThreshold: {
 passTotal: Number(reflectorThreshold.pass_total) || 18,
 maxTotal: Number(reflectorThreshold.max_total) || 25,
 keyDimensions: Array.isArray(reflectorThreshold.key_dimensions)
 ? reflectorThreshold.key_dimensions.map((item) => String(item))
 : [],
 keyMinScore: Number(reflectorThreshold.key_min_score) || 3,
 dimensions: (reflectorThreshold.dimensions ?? {}) as Record<string, unknown>
 },
 styleProfile,
 conflictSignals,
 craftFingerprint,
 shuangwenPrompt,
 raw
 };
}

export function loadGenrePackFromText(profileText: string, seedSqlText: string): GenrePack {
 // 去除可能的 UTF-8 BOM（部分 profile 文件带 BOM，JSON.parse 不会自动跳过会报错）
 const rawProfile = JSON.parse(profileText.replace(/^\uFEFF/, '')) as Record<string, unknown>;
 const profile = normalizeProfile(rawProfile);
 const patterns = parseCraftPatternsFromSql(seedSqlText).filter((pattern) => pattern.genre === profile.genre);
 return {
 genre: profile.genre,
 profile,
 patterns
 };
}

export function indexGenrePacks(packs: GenrePack[]): Map<string, GenrePack> {
 return new Map(packs.map((pack) => [pack.genre, pack]));
}
