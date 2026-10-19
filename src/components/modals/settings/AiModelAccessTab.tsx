// 模块说明：设置页 AI 模型接入子面板。
// 关键职责：配置各 Provider 的 baseUrl/apiKey、模型选择与连通性测试。
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { AppConfig } from '../../../types/ai';
import type { ProviderCardItem, SettingsDraftSetter } from './types';

interface AiModelAccessTabProps {
 draft: AppConfig;
 setDraft: SettingsDraftSetter;
 providerCards: ProviderCardItem[];
 providerUsage: Record<string, number>;
 selectProvider: (provider: AppConfig['ai']['provider']) => void;
 showApiKey: boolean;
 setShowApiKey: (updater: (v: boolean) => boolean) => void;
 dynamicProvider: boolean;
 requestPreview: string;
 modelListLoaded: boolean;
 availableModels: string[];
 loadingModels: boolean;
 testLinkAndLoadModels: () => Promise<void>;
 runApiLinkBenchmarks: () => Promise<void>;
 testStatusText: string;
 applyProxyProfileById: (profileId: string) => void;
 createProxyProfile: () => void;
 saveCurrentAsProxyProfile: () => void;
 renameProxyProfile: (profileId: string, name: string) => void;
 deleteProxyProfile: (profileId: string) => void;
}

function formatTokenUsage(value: number): string {
 const count = Math.max(0, Math.round(Number(value) || 0));
 if (count < 10_000) return `${count.toLocaleString('zh-CN')} TOKEN`;
 if (count < 100_000_000) return `${(count / 10_000).toFixed(count < 100_000 ? 1 : 0).replace(/\.0$/, '')} 万TOKEN`;
 return `${(count / 100_000_000).toFixed(1).replace(/\.0$/, '')} 亿TOKEN`;
}

export function AiModelAccessTab(props: AiModelAccessTabProps) {
 const {
 draft,
 setDraft,
 providerCards,
 providerUsage,
 selectProvider,
 showApiKey,
 setShowApiKey,
 dynamicProvider,
 requestPreview,
 modelListLoaded,
 availableModels,
 loadingModels,
 testLinkAndLoadModels,
 runApiLinkBenchmarks,
 testStatusText,
 applyProxyProfileById,
 createProxyProfile,
 saveCurrentAsProxyProfile,
 renameProxyProfile,
 deleteProxyProfile
 } = props;

 const proxyProfiles = Array.isArray(draft.ai.proxyProfiles) ? draft.ai.proxyProfiles : [];
 const selectedProxyProfileId = draft.ai.activeProxyProfileId || proxyProfiles[0]?.id || '';

 const patchActiveProxyProfile = (patch: Partial<{ apiKey: string; baseUrl: string; model: string; apiPath: string }>) => {
 if (draft.ai.provider !== 'proxy' || !selectedProxyProfileId) return proxyProfiles;
 return proxyProfiles.map((item) => (item.id === selectedProxyProfileId ? { ...item, ...patch } : item));
 };

 // 预置后缀选项
 const API_PATH_PRESETS = [
 { label: 'OpenAI / 兼容格式', value: '/chat/completions' },
 { label: 'Claude (Anthropic)', value: '/messages' },
 { label: 'Gemini (generateContent)', value: '/generateContent' },
 { label: 'Ollama (generate)', value: '/api/generate' },
 { label: '自定义…', value: '__custom__' }
 ];

 const currentApiPath = draft.ai.apiPath || '/chat/completions';
 const isCustomPath = !API_PATH_PRESETS.slice(0, -1).some((p) => p.value === currentApiPath);
 const selectValue = isCustomPath ? '__custom__' : currentApiPath;

 return (
 <div className="space-y-4">
 <section className="grid grid-cols-3 gap-3 border border-[var(--accent)]/20 bg-[var(--surface)]/55 p-3 backdrop-blur-[28px]">
	<div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
	<div className="text-[10px] font-black tracking-[0.18em] text-[var(--text-muted)] uppercase">累计消耗</div>
	<div className="mt-1 text-lg font-black text-[var(--text-primary)]">{formatTokenUsage(draft.tokenStats?.totalUsed || 0)}</div>
	</div>
	<div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
	<div className="text-[10px] font-black tracking-[0.18em] text-[var(--text-muted)] uppercase">当前通道</div>
	<div className="mt-1 text-lg font-black text-[var(--accent)]">{formatTokenUsage(providerUsage[draft.ai.provider] || 0)}</div>
	</div>
	<div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2">
 <div className="text-[10px] font-black tracking-[0.18em] text-[var(--text-muted)] uppercase">统计说明</div>
 <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">成功请求会累计输入与输出 Token，便于估算用量。</div>
 </div>
 </section>

 <div className="grid grid-cols-2 gap-3" data-guide-target="provider-cards">
 {providerCards.map((item) => (
 <button
 key={item.value}
 onClick={() => selectProvider(item.value)}
 className={clsx(
 'relative overflow-hidden p-2.5 text-left backdrop-blur-[40px]',
	draft.ai.provider === item.value ? 'wz-premium-pod-active' : 'wz-premium-pod hover:bg-[var(--surface)]'
 )}
 >
 <div className="flex items-center gap-2.5">
 {item.icon ? <span className="inline-flex h-6 w-6 items-center justify-center bg-[var(--surface-strong)] shadow-inner ring-1 ring-[var(--accent)]/30">{item.icon}</span> : null}
 <div className="text-[13px] font-bold tracking-tight wz-ui-label text-[var(--text-primary)]">{item.title}</div>
 </div>
 <div className="mt-0.5 text-[8px] font-black tracking-[0.2em] text-[var(--text-muted)] opacity-40 uppercase"style={{ fontFamily: 'inherit' }}>{item.endpoint || 'CUSTOM PROXY'}</div>
 <div className="mt-2 flex items-center gap-1.5">
 <span className="text-[8px] font-black tracking-widest text-[var(--accent)]/50 uppercase"style={{ fontFamily: 'inherit' }}>USAGE:</span>
 <span className="text-[10px] font-bold tracking-tight text-[var(--accent)]/90">{formatTokenUsage(providerUsage[item.value] || 0)}</span>
 </div>
 </button>
 ))}
 </div>

 {draft.ai.provider === 'proxy' ? (
 <div className="border border-[var(--border-color)] bg-[var(--surface)]/55 p-3">
 <label className="mb-2 block text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"style={{ fontFamily: 'var(--font-display)' }}>
 中转站配置
 </label>
 <div className="grid grid-cols-[1fr_auto] gap-2">
 <select
 className="w-full border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text-primary)]"
 value={selectedProxyProfileId}
 onChange={(e) => applyProxyProfileById(e.target.value)}
 >
 {proxyProfiles.map((item) => (
 <option key={item.id} value={item.id}>
 {item.name}
 </option>
 ))}
 </select>
 <div className="flex gap-2">
 <button data-guide-target="proxy-new" className="border border-[var(--border-color)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-primary)]"onClick={createProxyProfile}>新建</button>
 <button data-guide-target="proxy-save" className="border border-[var(--border-color)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-primary)]"onClick={saveCurrentAsProxyProfile}>保存</button>
 </div>
 </div>
 {draft.ai.activeProxyProfileId ? (
 <div className="mt-2 flex gap-2">
 <input
 className="h-9 flex-1 border border-[var(--border-color)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-primary)]"
 placeholder="配置名称"
 value={proxyProfiles.find((item) => item.id === draft.ai.activeProxyProfileId)?.name || ''}
 onChange={(e) => renameProxyProfile(draft.ai.activeProxyProfileId || '', e.target.value)}
 />
 <button
 className="border border-rose-400/40 bg-rose-500/10 px-3 text-sm font-semibold text-rose-300"
 onClick={() => deleteProxyProfile(draft.ai.activeProxyProfileId || '')}
 >
 删除
 </button>
 </div>
 ) : null}
 </div>
 ) : null}

 <div className="p-6 wz-premium-pod backdrop-blur-[24px]">

 <label className="mb-4 block text-[11px] font-bold tracking-[0.25em] text-[var(--accent)] uppercase"style={{ fontFamily: 'var(--font-display)' }}>API Key</label> <div data-guide-target="api-key" className="flex h-[46px] items-center border border-[var(--border-color)] bg-[var(--surface-strong)]">
 <input className="h-full min-w-0 flex-1 bg-transparent px-4 text-[15px] leading-tight text-[var(--text-primary)] outline-none"placeholder="输入 API Key"type={showApiKey ? 'text' : 'password'} value={draft.ai.apiKey} onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, apiKey: e.target.value, providerKeys: { ...draft.ai.providerKeys, [draft.ai.provider]: e.target.value }, proxyProfiles: patchActiveProxyProfile({ apiKey: e.target.value }) } })} />
 <button type="button"className="flex h-full w-11 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"onClick={() => setShowApiKey((v) => !v)} title={showApiKey ? '隐藏 Key' : '显示 Key'}>
 <svg className="h-5 w-5"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12"cy="12"r="3"/></svg>
 </button>
 </div>

 {draft.ai.provider !== 'local' && (<>
 <label className="mb-3 mt-6 block text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"style={{ fontFamily: 'var(--font-display)' }}>Base URL（代理地址）</label>
 <input data-guide-target="base-url" className="w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 text-[15px] leading-tight text-[var(--text-primary)] disabled:opacity-65"placeholder="http://localhost:18080/v1"value={draft.ai.baseUrl} disabled={!dynamicProvider} onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, baseUrl: e.target.value, providerBaseUrls: { ...draft.ai.providerBaseUrls, [draft.ai.provider]: e.target.value }, proxyProfiles: patchActiveProxyProfile({ baseUrl: e.target.value }) } })} />

 {/* API 后缀选择器 */}
 {dynamicProvider && (
 <div className="mt-3">
 <label className="mb-2 block text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"style={{ fontFamily: 'var(--font-display)' }}>API 后缀（路径）</label>
 <div className="flex gap-2">
 <select
 className="w-[220px] shrink-0 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2.5 text-[13px] text-[var(--text-primary)]"
 value={selectValue}
 onChange={(e) => {
 if (e.target.value === '__custom__') return;
 const newPath = e.target.value;
 setDraft({ ...draft, ai: { ...draft.ai, apiPath: newPath, proxyProfiles: patchActiveProxyProfile({ apiPath: newPath }) } });
 }}
 >
 {API_PATH_PRESETS.map((p) => (
 <option key={p.value} value={p.value}>{p.label}</option>
 ))}
 </select>
 <input
 className="min-w-0 flex-1 border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] font-mono"
 placeholder="/chat/completions"
 value={currentApiPath}
 onChange={(e) => {
 const newPath = e.target.value;
 setDraft({ ...draft, ai: { ...draft.ai, apiPath: newPath, proxyProfiles: patchActiveProxyProfile({ apiPath: newPath }) } });
 }}
 />
 </div>
 </div>
 )}

 <div className="mt-2 text-[12px] text-[var(--text-muted)]">完整请求地址预览：{requestPreview || '请先填写 Base URL'}</div>
 </>)}

 <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
 <div>
 <label className="mb-3 block text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"style={{ fontFamily: 'var(--font-display)' }}>模型 (Model)</label>
 {modelListLoaded && availableModels.length > 0 ? (
 <select className="w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 text-[15px] leading-tight text-[var(--text-primary)]"value={draft.ai.model} onChange={(e) => {
 const model = e.target.value;
 setDraft({ ...draft, ai: { ...draft.ai, model, providerLastModels: { ...draft.ai.providerLastModels, [draft.ai.provider]: model }, proxyProfiles: patchActiveProxyProfile({ model }) } });
 }}>
 {availableModels.map((model) => <option key={model} value={model}>{model}</option>)}
 </select>
 ) : (
 <div className="flex h-[46px] items-center border border-dashed border-[var(--border-color)] bg-[var(--surface-strong)] px-4 text-[13px] text-[var(--text-muted)]">测试连接成功后显示模型列表</div>
 )}
 </div>
 <div className="flex items-end">
 <button data-guide-target="test-connection" className="h-[46px] border border-[var(--border-color)] bg-[var(--surface-strong)] px-5 text-[15px] font-semibold leading-none text-[var(--text-primary)] hover:bg-white/10 disabled:opacity-60"onClick={() => void testLinkAndLoadModels()} disabled={loadingModels}>{loadingModels ? '测试中...' : '测试连接'}</button>
 </div>
 </div>

 <div className="mt-3 flex flex-wrap gap-2">
 <button className="h-10 border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 text-sm font-semibold text-[var(--text-primary)]"onClick={() => void runApiLinkBenchmarks()}>测试所有 API 链路模块</button>
 </div>
 <div className={clsx(
 'mt-2 whitespace-pre-wrap text-[12px] leading-5',
 testStatusText.startsWith('✅') ? 'text-emerald-400' :
 testStatusText.startsWith('⚠️') ? 'text-amber-400' :
 testStatusText.startsWith('❌') ? 'text-rose-400' :
 'text-[var(--text-muted)]'
 )}>
 {testStatusText || '点击测试连接后将显示链路检测结果'}
 </div>
 </div>
 </div>
 );
}
