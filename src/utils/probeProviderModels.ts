// 模块说明：探测当前 Provider 真实可用模型，并写入全局 config.providerModels。
// 铁律：列表只信 API 返回；不把内置 fixed 清单伪装成「可用」。
// 设置页「测试连接」与 Agent「检测可用模型」走同一通道。

import type { AppConfig, AiProvider } from '../types/ai';
import { electronAPI } from './electron';
import { useConfigStore } from '../store/useConfigStore';

function text(v: unknown): string {
  return String(v || '').trim();
}

/** 当前 provider 下已缓存的「探测到的」可用模型（纯 API 列表，无内置灌水） */
export function getProbedModelsForProvider(config: AppConfig | null | undefined, provider?: string): string[] {
  if (!config?.ai) return [];
  const p = provider || config.ai.provider;
  const list = config.ai.providerModels?.[p];
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.map((m) => text(m)).filter(Boolean)));
}

/** 该 provider 上次使用的模型（仅取显式记录，未记录则为空串） */
export function getRememberedModel(config: AppConfig | null | undefined, provider?: string): string {
  if (!config?.ai) return '';
  const p = provider || config.ai.provider;
  return text(config.ai.providerLastModels?.[p]);
}

/**
 * 切到某个 provider 时应生效的模型：记忆的模型仍在 API 列表里就优先用它，
 * 其次保留当前模型，两者都不在列表才退回列表首项（避免把失效模型硬塞进请求）。
 */
export function pickModelForProvider(
  config: AppConfig | null | undefined,
  provider: string | undefined,
  liveModels: string[]
): string {
  if (!config?.ai) return liveModels[0] || '';
  const remembered = getRememberedModel(config, provider);
  const current = text(config.ai.model);
  if (remembered && liveModels.includes(remembered)) return remembered;
  if (current && liveModels.includes(current)) return current;
  return liveModels[0] || remembered || current || '';
}

/** Agent / 设置共用：可切换模型列表 */
export function getSelectableModels(config: AppConfig | null | undefined): string[] {
  if (!config?.ai) return [];
  const probed = getProbedModelsForProvider(config);
  const current = text(config.ai.model);
  if (probed.length === 0) {
    // 从未探测成功：只给当前模型一项，避免灌一堆假列表
    return current ? [current] : [];
  }
  if (current && !probed.includes(current)) {
    return [current, ...probed];
  }
  return probed;
}

export interface ProbeModelsResult {
  ok: boolean;
  models: string[];
  liveCount: number;
  message: string;
  /** 已写回的完整 config（若 ok 且 save） */
  config?: AppConfig;
}

/**
 * 拉 /models（或等价接口），只保存 live 列表到 providerModels[provider]。
 * @param save 是否立刻 saveConfig（Agent 菜单检测应 true；设置页草稿可 false）
 */
export async function probeProviderModels(options: {
  config: AppConfig;
  /** 覆盖草稿里的 key/url（设置页未保存时） */
  apiKey?: string;
  baseUrl?: string;
  provider?: AiProvider | string;
  save?: boolean;
}): Promise<ProbeModelsResult> {
  const cfg = options.config;
  const provider = (options.provider || cfg.ai.provider) as AiProvider | string;
  const effectiveBaseUrl = text(options.baseUrl ?? cfg.ai.baseUrl);
  const effectiveApiKey = text(options.apiKey ?? cfg.ai.apiKey ?? cfg.ai.providerKeys?.[provider]);

  if (!effectiveBaseUrl) {
    return { ok: false, models: [], liveCount: 0, message: 'Base URL 为空，请先填写 API 地址。' };
  }
  if (!effectiveApiKey) {
    return { ok: false, models: [], liveCount: 0, message: 'API Key 为空，请先填写密钥。' };
  }

  try {
    const isVertex = provider === 'vertex_ai';
    const queryProvider = isVertex ? 'gemini' : provider;
    const queryBaseUrl = isVertex ? 'https://generativelanguage.googleapis.com' : effectiveBaseUrl;

    const res = await electronAPI.ai.getProviderModels({
      provider: queryProvider,
      apiKey: effectiveApiKey,
      baseUrl: queryBaseUrl
    });

    const rawLive = Array.isArray(res?.models) ? res.models.map((m: string) => text(m)).filter(Boolean) : [];
    const live = isVertex ? rawLive.filter((m) => m.startsWith('gemini-')) : rawLive;
    const models = Array.from(new Set(live));

    if (models.length === 0) {
      return {
        ok: false,
        models: [],
        liveCount: 0,
        message:
          '连接可能通过，但未返回模型列表。部分中转站不支持 /models；请手动在设置里填写当前要用的模型名，或换支持列模型的接口。'
      };
    }

    const nextModel = pickModelForProvider(cfg, provider, models);
    const next: AppConfig = {
      ...cfg,
      ai: {
        ...cfg.ai,
        provider: provider as AiProvider,
        baseUrl: effectiveBaseUrl || cfg.ai.baseUrl,
        apiKey: effectiveApiKey || cfg.ai.apiKey,
        model: nextModel,
        providerKeys: { ...(cfg.ai.providerKeys || {}), [provider]: effectiveApiKey },
        providerBaseUrls: { ...(cfg.ai.providerBaseUrls || {}), [provider]: effectiveBaseUrl },
        providerModels: { ...(cfg.ai.providerModels || {}), [provider]: models },
        providerLastModels: { ...(cfg.ai.providerLastModels || {}), [provider]: nextModel },
        // 标记最近一次探测时间（可选字段，存 config 上不破坏类型：挂 providerModels 旁用 any 扩展）
        ...( { providerModelsProbedAt: { ...((cfg.ai as any).providerModelsProbedAt || {}), [provider]: Date.now() } } as any )
      }
    };
    // 把 probedAt 写进 ai（类型上可选）
    (next.ai as any).providerModelsProbedAt = {
      ...((cfg.ai as any).providerModelsProbedAt || {}),
      [provider]: Date.now()
    };

    if (options.save !== false) {
      await useConfigStore.getState().saveConfig(next);
    }

    return {
      ok: true,
      models,
      liveCount: models.length,
      message: `已检测到 ${models.length} 个可用模型`,
      config: next
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let tip = '';
    if (/401|unauthorized|invalid.*key/i.test(raw)) tip = '（Key 无效或过期）';
    else if (/403|forbidden/i.test(raw)) tip = '（权限不足）';
    else if (/404/i.test(raw)) tip = '（接口路径不对）';
    else if (/timeout|ECONNREFUSED|ENOTFOUND|network|fetch failed/i.test(raw)) tip = '（网络/地址不通）';
    return {
      ok: false,
      models: [],
      liveCount: 0,
      message: `检测失败：${raw.slice(0, 160)}${tip}`
    };
  }
}
