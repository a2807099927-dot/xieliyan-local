// 模块说明：应用配置全局 Store。
// 关键职责：加载/保存 AI 配置（provider/model/apiKey）、文风设置、写作习惯、token 用量统计。
import { create } from 'zustand';
import type { AppConfig } from '../types/ai';
import { electronAPI } from '../utils/electron';

interface ConfigState {
 config?: AppConfig;
 configLoading: boolean;
 configError?: string;
 loadConfig: () => Promise<void>;
 saveConfig: (next: AppConfig) => Promise<void>;
 addTokenUsage: (provider: string, total: number, cost: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null;
}

const DEFAULT_CUSTOM_THEME = {
 ambientGlow: '#7c3aed',
 primaryColor: '#8b5cf6',
 secondaryColor: '#38bdf8',
 gradientFrom: '#171630',
 gradientTo: '#1f3f74',
 backgroundImage: '',
 surfaceAlpha: 0.9,
 fontFamily: 'Inter, "Source Han Sans SC", "Microsoft YaHei UI", sans-serif',
 textColor: '#f8fafc',
 textBrightness: 1
};

function ensureConfigShape(value: unknown): AppConfig | undefined {
 // Defensive migration layer: accepts older config payloads and backfills new fields.
 // 关键原则：永远不能因为某个字段缺失或形状不对就丢弃整个用户配置；
 // 缺字段就 backfill 默认值，保留用户已有字段（包括 stylePresetId / styleInstruction 等）。
 const payload = isRecord(value) && 'config' in value ? (value as { config?: unknown }).config : value;
 if (!isRecord(payload)) return undefined;

 // 强制 backfill 顶层四大字段为对象（不丢弃用户的其它字段）
 if (!isRecord(payload.ai)) (payload as Record<string, unknown>).ai = {};
 if (!isRecord(payload.ui)) (payload as Record<string, unknown>).ui = {};
 if (!isRecord(payload.workspace)) (payload as Record<string, unknown>).workspace = {};
 if (!isRecord(payload.tokenStats)) (payload as Record<string, unknown>).tokenStats = { totalUsed: 0, estimatedCost: 0, byProvider: {} };
 if (!isRecord(payload.agent)) (payload as Record<string, unknown>).agent = { persona: 'casual', language: 'zh-CN' };

 const config = payload as unknown as AppConfig;
 if (typeof config.ai.contextTransparencyEnabled === 'undefined') config.ai.contextTransparencyEnabled = true;
 if (typeof config.ai.contextBudgetEnabled === 'undefined') config.ai.contextBudgetEnabled = true;
 if (typeof config.ai.ragEnabled === 'undefined') config.ai.ragEnabled = true;
 if (typeof config.ai.styleCacheEnabled === 'undefined') config.ai.styleCacheEnabled = true;

 // 迁移旧字段到新 agentMode 架构
 const legacyAi = config.ai as unknown as Record<string, unknown>;
 if (!config.ai.agentMode) {
 const oldStyleMode = legacyAi.agentStyleMode as string | undefined;
 if (oldStyleMode === 'global-custom' || oldStyleMode === 'custom') {
 config.ai.agentMode = 'custom';
 // 将旧的 styleInstruction 迁移到 customWriterPrompt（老配置兼容）
 // 注意：customWriterPrompt 已降级为「写作风格单入口」的兜底（见 writingSkill.buildWritingPromptBundle T1），
 // 权威源 = styleProfiles[].styleInstruction。此处迁移只为旧数据不丢失，不再作为写手风格的权威源。
 if (config.ai.styleInstruction && !config.ai.customWriterPrompt) {
 config.ai.customWriterPrompt = config.ai.styleInstruction;
 }
 } else {
 config.ai.agentMode = 'builtin';
 }
 }

 // 迁移旧版 stylePresetId 取值格式 → 新版（v1.5.x 之前用 'preset-XXX' / 中文名 / 旧 ID，新版只认空串/'custom'/规范英文 ID）。
 // 关键：不能把"自定义"误判成"关闭"——优先看 styleCustomEnabled 旧标志。
 const knownIds = new Set(['shuangwen', 'dushi', 'wenyi', 'youxi', 'xuanhuan', 'qihuan', 'wuxia', 'xianxia', 'xianshi', 'lishi', 'tiyu', 'kehuan', 'zhutian', 'xuanyi', 'qingxiaoshuo']);
 const legacyIdMap: Record<string, string> = {
 // 旧版 'preset-XXX' 前缀
 'preset-玄幻': 'xuanhuan', 'preset-都市': 'dushi', 'preset-仙侠': 'xianxia', 'preset-武侠': 'wuxia',
 'preset-奇幻': 'qihuan', 'preset-历史': 'lishi', 'preset-游戏': 'youxi', 'preset-现实': 'xianshi',
 'preset-科幻': 'kehuan', 'preset-体育': 'tiyu', 'preset-文娱': 'wenyi', 'preset-无脑爽文': 'shuangwen',
 'preset-诸天无限': 'zhutian', 'preset-悬疑': 'xuanyi', 'preset-轻小说': 'qingxiaoshuo',
 // 旧版纯中文名
 '玄幻': 'xuanhuan', '都市': 'dushi', '仙侠': 'xianxia', '武侠': 'wuxia', '奇幻': 'qihuan',
 '历史': 'lishi', '游戏': 'youxi', '现实': 'xianshi', '科幻': 'kehuan', '体育': 'tiyu',
 '文娱': 'wenyi', '无脑爽文': 'shuangwen', '诸天无限': 'zhutian', '悬疑': 'xuanyi', '轻小说': 'qingxiaoshuo'
 };
 const rawPresetId = String(config.ai.stylePresetId || '').trim();
 const legacyCustomEnabled = legacyAi.styleCustomEnabled === true;
 if (rawPresetId === '' || rawPresetId === 'custom' || knownIds.has(rawPresetId)) {
 // 已经是新格式，无需迁移
 } else if (legacyIdMap[rawPresetId]) {
 config.ai.stylePresetId = legacyIdMap[rawPresetId];
 } else if (legacyCustomEnabled || (config.ai.styleInstruction && config.ai.styleInstruction.trim().length > 0)) {
 // 不认识的取值，但用户开过自定义或写过自定义文本 → 视为自定义
 config.ai.stylePresetId = 'custom';
 } else {
 // 完全识别不出 → 关闭，避免误注入未知 prompt
 config.ai.stylePresetId = '';
 }

 // 清理旧字段（从运行时对象中移除，不影响磁盘文件）
 delete legacyAi.agentStyleMode;
 delete legacyAi.writingMode;
 delete legacyAi.styleCustomEnabled;
 if (!Array.isArray(config.ai.proxyProfiles)) config.ai.proxyProfiles = [];
 if (typeof config.ai.activeProxyProfileId !== 'string') config.ai.activeProxyProfileId = '';
 // 迁移旧文风配置到 styleProfiles（v1.7.0+）
 if (!Array.isArray(config.ai.styleProfiles)) config.ai.styleProfiles = [];
 const hasLegacyStyle = (config.ai.stylePresetId || '').trim() !== '' || (config.ai.styleInstruction || '').trim() !== '';
 if (hasLegacyStyle && config.ai.styleProfiles.length === 0) {
 config.ai.styleProfiles = [{
 id: crypto.randomUUID(),
 name: '默认配置',
 stylePresetId: (config.ai.stylePresetId || '').trim(),
 styleInstruction: (config.ai.styleInstruction || '').trim()
 }];
 config.ai.activeStyleProfileId = config.ai.styleProfiles[0].id;
 }
 // 迁移：区分 activeStyleProfileId（仅自定义 profile）与 activeStylePresetId（内置预设）
 if (typeof config.ai.activeStylePresetId !== 'string') {
 const activeProfile = config.ai.styleProfiles?.find((p) => p.id === config.ai.activeStyleProfileId);
 if (activeProfile && activeProfile.stylePresetId === 'custom') {
 // 当前选中的是自定义 profile，activeStylePresetId 留空
 config.ai.activeStylePresetId = '';
 } else {
 // 当前选中的是内置预设或关闭，迁移到 activeStylePresetId
 config.ai.activeStylePresetId = (config.ai.stylePresetId || '').trim();
 config.ai.activeStyleProfileId = '';
 }
 }
 if (typeof config.ui.windowPreset !== 'string') config.ui.windowPreset = '1600x900';
 if (typeof config.ui.rightPanelMode === 'undefined') config.ui.rightPanelMode = 'overlay';
 if (config.ui.chapterListOrder !== 'asc' && config.ui.chapterListOrder !== 'desc') config.ui.chapterListOrder = 'asc';
 if (!Number.isFinite(config.ui.chapterWordGoal) || config.ui.chapterWordGoal <= 0) config.ui.chapterWordGoal = 3000;
 if (config.ui.memoryBankChapterOrder !== 'asc' && config.ui.memoryBankChapterOrder !== 'desc') config.ui.memoryBankChapterOrder = 'asc';
 if (!isRecord(config.ui.customTheme)) {
 config.ui.customTheme = { ...DEFAULT_CUSTOM_THEME };
 } else {
 config.ui.customTheme = {
 ambientGlow: typeof config.ui.customTheme.ambientGlow === 'string' ? config.ui.customTheme.ambientGlow : DEFAULT_CUSTOM_THEME.ambientGlow,
 primaryColor: typeof config.ui.customTheme.primaryColor === 'string' ? config.ui.customTheme.primaryColor : DEFAULT_CUSTOM_THEME.primaryColor,
 secondaryColor: typeof config.ui.customTheme.secondaryColor === 'string' ? config.ui.customTheme.secondaryColor : DEFAULT_CUSTOM_THEME.secondaryColor,
 gradientFrom: typeof config.ui.customTheme.gradientFrom === 'string' ? config.ui.customTheme.gradientFrom : DEFAULT_CUSTOM_THEME.gradientFrom,
 gradientTo: typeof config.ui.customTheme.gradientTo === 'string' ? config.ui.customTheme.gradientTo : DEFAULT_CUSTOM_THEME.gradientTo,
 backgroundImage:
 typeof config.ui.customTheme.backgroundImage === 'string' ? config.ui.customTheme.backgroundImage : DEFAULT_CUSTOM_THEME.backgroundImage,
 surfaceAlpha:
 typeof config.ui.customTheme.surfaceAlpha === 'number'
 ? Math.min(1, Math.max(0.35, config.ui.customTheme.surfaceAlpha))
 : DEFAULT_CUSTOM_THEME.surfaceAlpha,
 fontFamily:
 typeof config.ui.customTheme.fontFamily === 'string' && config.ui.customTheme.fontFamily.trim().length > 0
 ? config.ui.customTheme.fontFamily
 : DEFAULT_CUSTOM_THEME.fontFamily,
 textColor:
 typeof config.ui.customTheme.textColor === 'string' && config.ui.customTheme.textColor.trim().length > 0
 ? config.ui.customTheme.textColor
 : DEFAULT_CUSTOM_THEME.textColor,
 textBrightness:
 typeof config.ui.customTheme.textBrightness === 'number'
 ? Math.min(1.5, Math.max(0.6, config.ui.customTheme.textBrightness))
 : DEFAULT_CUSTOM_THEME.textBrightness
 };
 }

 if (typeof config.ui.editorTextBrightness !== 'number') config.ui.editorTextBrightness = 1;
 if (!Array.isArray(config.ui.uploadedFonts)) config.ui.uploadedFonts = [];
 config.ui.uploadedFonts = config.ui.uploadedFonts
 .filter(
 (item): item is { id: string; name: string; family: string; dataUrl: string } =>
 Boolean(
 item &&
 typeof item.id === 'string' &&
 typeof item.name === 'string' &&
 typeof item.family === 'string' &&
 typeof item.dataUrl === 'string' &&
 item.dataUrl.length > 0
 )
 )
 .slice(0, 30);
 if (typeof config.ui.appBrightness !== 'number') config.ui.appBrightness = 1;
 if (typeof config.ui.appContrast !== 'number') config.ui.appContrast = 1;
 if (typeof config.ui.appSaturation !== 'number') config.ui.appSaturation = 1;
 if (typeof config.ui.editorFontWeight !== 'number' || !Number.isFinite(config.ui.editorFontWeight)) config.ui.editorFontWeight = 400;
 if (typeof config.ui.editorFontSize !== 'number' || !Number.isFinite(config.ui.editorFontSize)) config.ui.editorFontSize = 16;
 config.ui.editorFontWeight = Math.min(800, Math.max(300, Math.round(config.ui.editorFontWeight / 100) * 100));
 config.ui.editorFontSize = Math.min(28, Math.max(14, Math.round(config.ui.editorFontSize)));
 config.ui.editorTextBrightness = Math.min(1.5, Math.max(0.7, config.ui.editorTextBrightness));
 config.ui.appBrightness = Math.min(1.3, Math.max(0.7, config.ui.appBrightness));
 config.ui.appContrast = Math.min(1.3, Math.max(0.7, config.ui.appContrast));
 config.ui.appSaturation = Math.min(1.4, Math.max(0.7, config.ui.appSaturation));
 if (config.ui.editorGridLine !== 'none' && config.ui.editorGridLine !== 'solid' && config.ui.editorGridLine !== 'dashed') {
  config.ui.editorGridLine = 'none';
 }
 if (typeof config.ui.enableInlineSuggestion === 'undefined') config.ui.enableInlineSuggestion = true;
 if (typeof config.workspace.backupOutputPath === 'undefined') config.workspace.backupOutputPath = '';

 // 多网盘云同步：从旧 webdav 迁移 / 补全 shape
 if (!config.cloudSync || typeof config.cloudSync !== 'object') {
  const wd = config.webdav;
  const rawP = (wd as { provider?: string } | undefined)?.provider;
  const activeProvider =
   rawP === 'aliyun' || rawP === 'webdav' ? rawP : 'nutstore';
  config.cloudSync = {
   enabled: Boolean(wd?.enabled),
   activeProvider,
   providers: {
    nutstore: {
     url: wd?.url || 'https://dav.jianguoyun.com/dav/写梨眼',
     username: wd?.username || '',
     password: wd?.password || '',
     remotePath: wd?.remotePath || '',
    },
   },
  };
 } else {
  if (typeof config.cloudSync.enabled !== 'boolean') {
   config.cloudSync.enabled = Boolean(config.webdav?.enabled);
  }
  // 仅保留坚果 / 通用 WebDAV / 阿里；旧版百度、蓝奏、夸克回退坚果
  const ap = config.cloudSync.activeProvider as string;
  if (ap !== 'nutstore' && ap !== 'webdav' && ap !== 'aliyun') {
   config.cloudSync.activeProvider = 'nutstore';
  }
  if (!config.cloudSync.activeProvider) config.cloudSync.activeProvider = 'nutstore';
  if (!config.cloudSync.providers || typeof config.cloudSync.providers !== 'object') {
   config.cloudSync.providers = {};
  }
  if (!config.cloudSync.providers.nutstore && config.webdav) {
   config.cloudSync.providers.nutstore = {
    url: config.webdav.url,
    username: config.webdav.username,
    password: config.webdav.password,
    remotePath: config.webdav.remotePath,
   };
  }
 }

 return config;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
 config: undefined,
 configLoading: false,
 configError: undefined,

 loadConfig: async () => {
 set({ configLoading: true, configError: undefined });
 try {
 const loaded = await electronAPI.config.load();
 const parsed = ensureConfigShape(loaded);
 if (!parsed) {
 throw new Error('配置文件结构无效');
 }

 const apiKey = await electronAPI.config.getApiKey();
 const config: AppConfig = {
 ...parsed,
 ai: {
 ...parsed.ai,
 apiKey: apiKey ?? parsed.ai.apiKey ?? ''
 }
 };

 set({ config, configLoading: false, configError: undefined });
 } catch (error) {
 // 关键：绝对不能调 electronAPI.config.reset()，否则会清掉用户磁盘上已有的 config（包括 stylePresetId/styleInstruction 等所有偏好）。
 // 这里只把已读到的 payload 用 ensureConfigShape 再宽容地修一次，缺字段用默认补，不写盘。
 try {
 const loaded = await electronAPI.config.load().catch(() => undefined);
 const recovered = ensureConfigShape(loaded);
 if (recovered) {
 const apiKey = await electronAPI.config.getApiKey().catch(() => null);
 set({
 config: {
 ...recovered,
 ai: {
 ...recovered.ai,
 apiKey: apiKey ?? recovered.ai.apiKey ?? ''
 }
 },
 configLoading: false,
 configError: undefined
 });
 return;
 }
 } catch {
 // fall through to error path
 }

 set({ config: undefined, configLoading: false, configError: error instanceof Error ? error.message : String(error) });
 }
 },

 saveConfig: async (next) => {
 try {
 await electronAPI.config.save({ config: next });
 set({ config: next });
 } catch (error) {
 console.error('[Config] Failed to save config to disk:', error);
 throw error;
 }
 },

 addTokenUsage: (provider, total, cost) => {
 const current = get().config;
 if (!current) return;
 const updated: AppConfig = {
 ...current,
 tokenStats: {
 ...current.tokenStats,
 totalUsed: current.tokenStats.totalUsed + total,
 estimatedCost: current.tokenStats.estimatedCost + cost,
 byProvider: {
 ...current.tokenStats.byProvider,
 [provider]: (current.tokenStats.byProvider[provider] || 0) + total
 }
 }
 };
 set({ config: updated });
 // Persist token stats asynchronously; swallow disk errors to avoid interrupting editor flow.
 void electronAPI.config.save({ config: updated }).catch((err) =>
 console.error('[Config] addTokenUsage persist failed:', err)
 );
 }
}));

