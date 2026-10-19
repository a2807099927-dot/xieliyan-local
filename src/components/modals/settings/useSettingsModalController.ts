// 模块说明：设置弹窗控制 Hook。
// 关键职责：维护编辑草稿、保存/重置、各 tab 数据加载。
import { useEffect, useMemo, useState } from 'react';
import { useConfigStore } from '../../../store/useConfigStore';
import { useIslandStore } from '../../../store/useIslandStore';
import type { AiProvider, AppConfig, ProxyProfile } from '../../../types/ai';
import { electronAPI } from '../../../utils/electron';
import { mergeProviderModels, providerDefaults } from './constants';
import { probeProviderModels, getRememberedModel, pickModelForProvider } from '../../../utils/probeProviderModels';
import { liveProviderModelsOnly } from './constants';
import type { TabId } from './types';

const BUILTIN_SENSENOVA_PROXY_PROFILE = {
 id: 'builtin-sensenova',
 name: 'SenseNova（内置）',
 baseUrl: 'https://token.sensenova.cn',
 apiPath: '/v1/chat/completions',
 apiKey: '',
 model: 'sensenova-6.7-flash-lite'
};

function normalizeApiPathForBase(baseUrl: string, apiPath: string): string {
 const base = String(baseUrl || '').trim().replace(/\/+$/, '');
 let path = String(apiPath || '').trim() || '/chat/completions';
 path = '/' + path.replace(/^\/+/, '');
 if (/\/v1$/i.test(base) && /^\/v1(?=\/|$)/i.test(path)) {
 path = path.replace(/^\/v1(?=\/|$)/i, '') || '/';
 }
 return path;
}

function normalizeProxyProfile(profile: ProxyProfile): ProxyProfile {
 return {
 ...profile,
 baseUrl: String(profile.baseUrl || '').trim().replace(/\/+$/, ''),
 apiPath: normalizeApiPathForBase(profile.baseUrl, profile.apiPath)
 };
}

function ensureBuiltinProxyProfiles(draft: AppConfig): AppConfig {
 const profiles = (Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : []).map(normalizeProxyProfile);
 if (profiles.some((item) => item.id === BUILTIN_SENSENOVA_PROXY_PROFILE.id)) {
 return { ...draft, ai: { ...draft.ai, proxyProfiles: profiles } };
 }
 return {
 ...draft,
 ai: {
 ...draft.ai,
 proxyProfiles: [normalizeProxyProfile(BUILTIN_SENSENOVA_PROXY_PROFILE), ...profiles]
 }
 };
}


export function useSettingsModalController(open: boolean) {
 const config = useConfigStore((s) => s.config);
 const saveConfig = useConfigStore((s) => s.saveConfig);
 const island = useIslandStore((s) => s);

 const [activeTab, setActiveTab] = useState<TabId>('ai');
 const [draft, setDraft] = useState<AppConfig | null>(null);
 const [availableModels, setAvailableModels] = useState<string[]>([]);
 const [loadingModels, setLoadingModels] = useState(false);
 const [showApiKey, setShowApiKey] = useState(false);
 const [modelListLoaded, setModelListLoaded] = useState(false);
 const [testStatusText, setTestStatusText] = useState('');

 useEffect(() => {
 if (!open || !config) return;
 const next = ensureBuiltinProxyProfiles(structuredClone(config));
 next.ai.providerKeys = next.ai.providerKeys || {};
 next.ai.providerBaseUrls = next.ai.providerBaseUrls || {};
 next.ai.providerModels = next.ai.providerModels || {};
 next.ai.providerLastModels = next.ai.providerLastModels || {};
 if (next.ai.provider === 'local') {
 next.ai.provider = 'proxy';
 next.ai.apiKey = '';
 next.ai.baseUrl = '';
 next.ai.apiPath = '/chat/completions';
 }
 const key = next.ai.providerKeys[next.ai.provider];
 if (key) next.ai.apiKey = key;
 const mappedBaseUrl = next.ai.providerBaseUrls[next.ai.provider];
 if (mappedBaseUrl) next.ai.baseUrl = mappedBaseUrl;
 setDraft(next);
 // 只展示探测缓存 + 该 provider 记忆的模型；都没探测过则留空，提示先测试连接（不再用 fixed 假列表冒充可用）
 const live = liveProviderModelsOnly(next.ai.providerModels[next.ai.provider]);
 const remembered = getRememberedModel(next, next.ai.provider);
 const initialOptions = remembered && !live.includes(remembered) ? [remembered, ...live] : live;
 setAvailableModels(initialOptions);
 setModelListLoaded(initialOptions.length > 0);
 }, [open, config]);

 useEffect(() => {
 if (!open) return;
 // plugin loading removed (plugin system retired)
 }, [open]);

 const providerUsage = useMemo(() => draft?.tokenStats.byProvider || {}, [draft?.tokenStats.byProvider]);

 const dynamicProvider = draft ? draft.ai.provider === 'proxy' : false;
 const requestPreview = draft?.ai.baseUrl
 ? `${draft.ai.baseUrl.replace(/\/+$/, '')}${normalizeApiPathForBase(draft.ai.baseUrl, draft.ai.apiPath)}`
 : '';

 const normalizeDraftForPersist = (nextDraft: AppConfig): AppConfig => {
 const normalized = {
 ...nextDraft,
 ai: {
 ...nextDraft.ai,
 apiPath: normalizeApiPathForBase(nextDraft.ai.baseUrl, nextDraft.ai.apiPath),
 proxyProfiles: (Array.isArray(nextDraft.ai.proxyProfiles) ? nextDraft.ai.proxyProfiles : []).map(normalizeProxyProfile)
 }
 };
 if (normalized.ai.provider === 'local') {
 normalized.ai.provider = 'proxy';
 normalized.ai.apiKey = '';
 normalized.ai.baseUrl = '';
 normalized.ai.apiPath = '/chat/completions';
 }
 return normalized;
 };

 const persist = async () => {
 if (!draft) return false;
 try {
 const normalizedDraft = normalizeDraftForPersist(draft);
 // 工作区路径变更：先调 init_workspace 让后端切换路径
 const prevStoragePath = config?.workspace.storagePath || '';
 const nextStoragePath = normalizedDraft.workspace.storagePath || '';
 if (nextStoragePath && nextStoragePath !== prevStoragePath) {
 try {
 await electronAPI.fs.initWorkspace({ path: nextStoragePath });
 } catch (e) {
 island.show({ type: 'error', message: '切换工作区失败：' + String((e as Error)?.message || e) });
 return false;
 }
 }
 await saveConfig(normalizedDraft);
 setDraft(normalizedDraft);
 island.show({ type: 'success', message: '设置已保存', autoHideMs: 1200 });
 // 工作区切换后自动刷新书架
 if (nextStoragePath && nextStoragePath !== prevStoragePath) {
 try {
 const { useBookStore } = await import('../../../store/useBookStore');
 await useBookStore.getState().loadBooks();
 } catch { /* ignore */ }
 }
 return true;
 } catch {
 island.show({ type: 'error', message: '保存失败' });
 return false;
 }
 };

 const selectProvider = (provider: AiProvider) => {
 if (!draft) return;
 const nextDraft = ensureBuiltinProxyProfiles(draft);
 const defaults = providerDefaults[provider];
 const live = liveProviderModelsOnly(nextDraft.ai.providerModels?.[provider]);
 const nextBaseUrl = nextDraft.ai.providerBaseUrls?.[provider] ?? (provider === 'proxy' ? '' : defaults?.baseUrl || nextDraft.ai.baseUrl);
 // 记忆优先：切回某个 provider 时恢复它上次用的模型，而不是重置成列表首项
 const nextModel = pickModelForProvider(nextDraft, provider, live);
 const modelOptions = nextModel && !live.includes(nextModel) ? [nextModel, ...live] : live;

 let nextApiKey = nextDraft.ai.providerKeys?.[provider] ?? '';

 setDraft({
 ...nextDraft,
 ai: {
 ...nextDraft.ai,
 provider,
 apiKey: nextApiKey,
 baseUrl: nextBaseUrl,
 apiPath: defaults?.apiPath || nextDraft.ai.apiPath,
 isLocked: defaults?.locked ?? nextDraft.ai.isLocked,
 model: nextModel,
 providerLastModels: { ...nextDraft.ai.providerLastModels, [provider]: nextModel }
 }
 });

 setAvailableModels(modelOptions);
 setModelListLoaded(modelOptions.length > 0);
 };

 const applyProxyProfileById = (profileId: string) => {
 if (!draft) return;
 const profiles = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 const profile = profiles.find((item) => item.id === profileId);
 if (!profile) return;
 const normalizedProfile = normalizeProxyProfile(profile);
 setDraft({
 ...draft,
 ai: {
 ...draft.ai,
 provider: 'proxy',
 activeProxyProfileId: normalizedProfile.id,
 apiKey: normalizedProfile.apiKey || '',
 baseUrl: normalizedProfile.baseUrl || '',
 apiPath: normalizedProfile.apiPath || '/chat/completions',
 model: normalizedProfile.model || draft.ai.model,
 providerKeys: { ...draft.ai.providerKeys, proxy: normalizedProfile.apiKey || '' },
 providerBaseUrls: { ...draft.ai.providerBaseUrls, proxy: normalizedProfile.baseUrl || '' },
 proxyProfiles: profiles.map((item) => (item.id === normalizedProfile.id ? normalizedProfile : item))
 }
 });
 };

 const saveCurrentAsProxyProfile = () => {
 if (!draft || draft.ai.provider !== 'proxy') return;
 const profileId = draft.ai.activeProxyProfileId || `proxy-${Date.now()}`;
 const profile = normalizeProxyProfile({
 id: profileId,
 name: `中转站 ${new Date().toLocaleString('zh-CN')}`,
 baseUrl: String(draft.ai.baseUrl || '').trim(),
 apiPath: String(draft.ai.apiPath || '/chat/completions').trim() || '/chat/completions',
 apiKey: String(draft.ai.apiKey || ''),
 model: String(draft.ai.model || '')
 });
 const prev = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 const existing = prev.findIndex((item) => item.id === profileId);
 const merged =
 existing >= 0 ? prev.map((item, idx) => (idx === existing ? { ...item, ...profile, name: item.name || profile.name } : item)) : [profile, ...prev];
 const nextDraft = normalizeDraftForPersist({
 ...draft,
 ai: {
 ...draft.ai,
 apiPath: profile.apiPath,
 providerKeys: { ...draft.ai.providerKeys, proxy: profile.apiKey || '' },
 providerBaseUrls: { ...draft.ai.providerBaseUrls, proxy: profile.baseUrl || '' },
 providerLastModels: { ...draft.ai.providerLastModels, proxy: profile.model || draft.ai.model || '' },
 proxyProfiles: merged,
 activeProxyProfileId: profileId
 }
 });
 setDraft(nextDraft);
 void saveConfig(nextDraft)
 .then(() => {
 island.show({ type: 'success', message: '中转站配置已保存', autoHideMs: 1200 });
 })
 .catch(() => {
 island.show({ type: 'error', message: '中转站配置保存失败' });
 });
 };

 const createProxyProfile = () => {
 if (!draft || draft.ai.provider !== 'proxy') return;
 const id = `proxy-${Date.now()}`;
 const profile = {
 id,
 name: `新中转站 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
 baseUrl: '',
 apiPath: '/chat/completions',
 apiKey: '',
 model: draft.ai.model || ''
 };
 const prev = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 setDraft({
 ...draft,
 ai: {
 ...draft.ai,
 activeProxyProfileId: id,
 proxyProfiles: [profile, ...prev],
 apiKey: '',
 baseUrl: '',
 apiPath: '/chat/completions'
 }
 });
 };

 const renameProxyProfile = (profileId: string, name: string) => {
 if (!draft) return;
 const nextName = String(name || '').trim();
 if (!nextName) return;
 const prev = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 setDraft({
 ...draft,
 ai: {
 ...draft.ai,
 proxyProfiles: prev.map((item) => (item.id === profileId ? { ...item, name: nextName } : item))
 }
 });
 };

 const deleteProxyProfile = (profileId: string) => {
 if (!draft) return;
 const prev = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 const next = prev.filter((item) => item.id !== profileId);
 const nextActive = draft.ai.activeProxyProfileId === profileId ? '' : draft.ai.activeProxyProfileId;
 setDraft({
 ...draft,
 ai: {
 ...draft.ai,
 proxyProfiles: next,
 activeProxyProfileId: nextActive
 }
 });
 };

 const testLinkAndLoadModels = async () => {
   if (!draft) return;
   setLoadingModels(true);
   setTestStatusText('正在测试连接…');
   try {
     // 用草稿探测；成功后写回 draft，并立刻 save 一份全局缓存，让 Agent 菜单同步
     const liveCfg = useConfigStore.getState().config;
     const baseForProbe = {
       ...(liveCfg || draft),
       ai: {
         ...(liveCfg?.ai || draft.ai),
         ...draft.ai,
         provider: draft.ai.provider,
         apiKey: draft.ai.apiKey,
         baseUrl: draft.ai.baseUrl,
         model: draft.ai.model
       }
     } as AppConfig;

     const result = await probeProviderModels({
       config: baseForProbe,
       apiKey: draft.ai.apiKey,
       baseUrl: draft.ai.baseUrl,
       provider: draft.ai.provider,
       save: true
     });

     if (!result.ok) {
       setTestStatusText(`❌ ${result.message}`);
       // 探测失败时不灌 fixed 假列表
       const only = liveProviderModelsOnly(draft.ai.providerModels?.[draft.ai.provider]);
       setAvailableModels(only);
       setModelListLoaded(only.length > 0);
       return;
     }

     const models = result.models;
     setAvailableModels(models);
     setModelListLoaded(models.length > 0);
     const nextModel = pickModelForProvider(draft, draft.ai.provider, models);
     setDraft({
       ...draft,
       ai: {
         ...draft.ai,
         model: nextModel,
         providerModels: { ...draft.ai.providerModels, [draft.ai.provider]: models },
         providerLastModels: { ...draft.ai.providerLastModels, [draft.ai.provider]: nextModel }
       }
     });
     const fullEndpoint = `${String(draft.ai.baseUrl || '').replace(/\/+$/, '')}${normalizeApiPathForBase(draft.ai.baseUrl, draft.ai.apiPath)}`;
     setTestStatusText(
       `✅ 连接成功！检测到 ${models.length} 个可用模型（已全局缓存，Agent 与设置共用）。\n请求地址：${fullEndpoint}${nextModel ? `\n当前模型：${nextModel}` : ''}`
     );
   } catch (e) {
     const raw = e instanceof Error ? e.message : String(e);
     setTestStatusText(`❌ 连接失败：${raw.slice(0, 200)}`);
   } finally {
     setLoadingModels(false);
   }
 };

 const runApiLinkBenchmarks = async () => {
 setTestStatusText('API 链路测速功能可用');
 };

 const onSelectStoragePath = async () => {
 if (!draft) return;
 const result = await electronAPI.fs.selectFolder();
 if (!result?.path) return;
 setDraft({ ...draft, workspace: { ...draft.workspace, storagePath: result.path } });
 };

 const onSelectBackupPath = async () => {
 if (!draft) return;
 const result = await electronAPI.fs.selectFolder();
 if (!result?.path) return;
 setDraft({ ...draft, workspace: { ...draft.workspace, backupOutputPath: result.path } });
 };

 const onBackupNow = async () => {
 if (!draft) return;
 await electronAPI.fs.backupWorkspace({ outputDir: draft.workspace.backupOutputPath || undefined });
 };

 const onOpenStoragePath = async () => {
 if (!draft?.workspace.storagePath) return;
 await electronAPI.system.openPath({ path: draft.workspace.storagePath });
 };

 return {
 draft,
 activeTab,
 setActiveTab,
 setDraft,
 persist,
 showApiKey,
 setShowApiKey,
 providerUsage,
 availableModels,
 loadingModels,
 modelListLoaded,
 testStatusText,
 selectProvider,
 applyProxyProfileById,
 createProxyProfile,
 saveCurrentAsProxyProfile,
 renameProxyProfile,
 deleteProxyProfile,
 testLinkAndLoadModels,
 runApiLinkBenchmarks,
 dynamicProvider,
 requestPreview,
 onSelectStoragePath,
 onSelectBackupPath,
 onBackupNow,
 onOpenStoragePath
 };
}
