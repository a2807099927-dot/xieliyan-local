// 模块说明：设置页存储子面板。
// 主要职责：管理工作区、备份策略与多网盘云同步配置。
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import type { AppConfig, CloudProviderId, CloudProviderProfile, CloudSyncConfig } from '../../../types/ai';
import type { SettingsDraftSetter } from './types';
import { electronAPI } from '../../../utils/electron';
import { useConfigStore } from '../../../store/useConfigStore';

interface StoreSettingsTabProps {
  draft: AppConfig;
  setDraft: SettingsDraftSetter;
  onSelectStoragePath: () => Promise<void>;
  onSelectBackupPath: () => Promise<void>;
  onBackupNow: () => Promise<void>;
  onOpenStoragePath: () => Promise<void>;
}

const PROVIDERS: Array<{
  id: CloudProviderId;
  label: string;
  short: string;
  engine: 'webdav' | 'openapi';
  hint: string;
}> = [
  {
    id: 'nutstore',
    label: '坚果云',
    short: '推荐',
    engine: 'webdav',
    hint: '官方 WebDAV，无需开放平台。在坚果云「账户信息 → 安全选项」生成应用密码后填写即可全量同步书架。',
  },
  {
    id: 'webdav',
    label: '通用 WebDAV',
    short: '任意',
    engine: 'webdav',
    hint: '兼容 Nextcloud、群晖、InfiniCloud 等任意 WebDAV 服务。填写服务器地址、账号与密码即可。',
  },
  {
    id: 'aliyun',
    label: '阿里云盘',
    short: '扫码登录',
    engine: 'openapi',
    hint: '手机阿里云盘 App 扫码即可登录备份，无需注册开放平台、无需粘贴 Token。备份目录：xieliyan/books.zip。',
  },
];

const NUTSTORE_DEFAULT_URL = 'https://dav.jianguoyun.com/dav/写梨眼';

function emptyProfile(id: CloudProviderId): CloudProviderProfile {
  if (id === 'nutstore') {
    return { url: NUTSTORE_DEFAULT_URL, username: '', password: '', remotePath: '' };
  }
  if (id === 'webdav') {
    return { url: 'https://', username: '', password: '', remotePath: '' };
  }
  return {};
}

function buildCloudSyncFromDraft(draft: AppConfig): CloudSyncConfig {
  const existing = draft.cloudSync;
  const webdav = draft.webdav;
  const providers: CloudSyncConfig['providers'] = { ...(existing?.providers || {}) };

  // 兼容旧版：仅有 webdav 时迁入 nutstore
  if (!providers.nutstore && webdav) {
    providers.nutstore = {
      url: webdav.url || NUTSTORE_DEFAULT_URL,
      username: webdav.username || '',
      password: webdav.password || '',
      remotePath: webdav.remotePath || '',
    };
  }
  if (!providers.nutstore) providers.nutstore = emptyProfile('nutstore');

  let active: CloudProviderId =
    (existing?.activeProvider as CloudProviderId) ||
    (webdav?.provider as CloudProviderId) ||
    'nutstore';
  // 旧版百度/蓝奏/夸克已下线，回退到坚果云
  if (active !== 'nutstore' && active !== 'webdav' && active !== 'aliyun') {
    active = 'nutstore';
  }
  if (!providers.webdav) providers.webdav = emptyProfile('webdav');

  return {
    enabled: existing?.enabled ?? webdav?.enabled ?? false,
    activeProvider: active,
    providers,
  };
}

export function StoreSettingsTab({
  draft,
  setDraft,
  onSelectStoragePath,
  onSelectBackupPath,
  onBackupNow,
  onOpenStoragePath,
}: StoreSettingsTabProps) {
  const [syncStatus, setSyncStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const busy = testing || authorizing || uploading || downloading;

  const cloud = useMemo(() => buildCloudSyncFromDraft(draft), [draft]);
  const activeId = cloud.activeProvider;
  const activeMeta = PROVIDERS.find((p) => p.id === activeId) || PROVIDERS[0];
  const profile: CloudProviderProfile = {
    ...emptyProfile(activeId),
    ...(cloud.providers[activeId] || {}),
  };

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  /** 组装 draft 中的 cloudSync + legacy webdav */
  const buildDraftWithCloud = (next: CloudSyncConfig): AppConfig => {
    const isWebdavKind =
      next.activeProvider === 'nutstore' || next.activeProvider === 'webdav';
    const src = isWebdavKind
      ? next.providers[next.activeProvider] || emptyProfile(next.activeProvider)
      : next.providers.nutstore || emptyProfile('nutstore');
    const webdav = {
      enabled: next.enabled,
      url: src.url || (next.activeProvider === 'nutstore' ? NUTSTORE_DEFAULT_URL : ''),
      username: src.username || '',
      password: src.password || '',
      remotePath: src.remotePath || '',
      provider: next.activeProvider,
    };
    return { ...draft, cloudSync: next, webdav };
  };

  /** 写回 cloudSync；WebDAV 类厂商同步 legacy webdav 供顶栏/关闭时自动上传 */
  const commitCloud = (next: CloudSyncConfig) => {
    const nextDraft = buildDraftWithCloud(next);
    setDraft(nextDraft);
  };

  /** 扫码/授权成功后必须立刻落盘，否则关设置页会丢凭证 */
  const commitCloudAndPersist = async (next: CloudSyncConfig): Promise<boolean> => {
    const nextDraft = buildDraftWithCloud(next);
    setDraft(nextDraft);
    try {
      await useConfigStore.getState().saveConfig(nextDraft);
      return true;
    } catch (e) {
      console.error('[cloud] persist failed', e);
      return false;
    }
  };

  const setEnabled = (enabled: boolean) => {
    commitCloud({ ...cloud, enabled });
  };

  const setActiveProvider = (id: CloudProviderId) => {
    const providers = { ...cloud.providers };
    if (!providers[id]) providers[id] = emptyProfile(id);
    commitCloud({ ...cloud, activeProvider: id, providers });
    setSyncStatus('');
  };

  const updateProfile = (patch: Partial<CloudProviderProfile>) => {
    const providers = {
      ...cloud.providers,
      [activeId]: { ...profile, ...patch },
    };
    commitCloud({ ...cloud, providers });
  };

  /** 统一交给后端 cloud_sync_* 按 provider 分发 */
  const cloudPayload = () => ({
    provider: activeId,
    enabled: cloud.enabled,
    url: profile.url || NUTSTORE_DEFAULT_URL,
    username: profile.username || '',
    password: profile.password || '',
    remotePath: profile.remotePath || '',
    accessToken: profile.accessToken || '',
    refreshToken: profile.refreshToken || '',
    cookie: profile.cookie || '',
    folderId: profile.folderId || '',
    appId: profile.appId || '',
    appKey: profile.appKey || '',
    note: profile.note || '',
  });

  const handleTest = async () => {
    setTesting(true);
    setSyncStatus(`正在测试 ${activeMeta.label}…`);
    try {
      const result: any = await withTimeout(
        (electronAPI as any).cloud.test(cloudPayload()),
        65000,
        '测试超时（>65s），请检查网络/代理后重试'
      );
      if (result.success) {
        const warning = typeof result.warning === 'string' ? result.warning : '';
        setSyncStatus(warning ? `✅ ${warning}` : `✅ ${activeMeta.label} 连接成功`);
      } else {
        setSyncStatus(`❌ ${result.error || '连接失败'}`);
      }
    } catch (error) {
      setSyncStatus(`❌ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleUpload = async () => {
    if (busy) return;
    if (!cloud.enabled) {
      setSyncStatus('❌ 请先勾选「启用云同步」');
      return;
    }
    // 凭证优先 draft，再回退全局 config（避免设置页未保存导致 payload 丢 token）
    const savedAli =
      useConfigStore.getState().config?.cloudSync?.providers?.[activeId] || {};
    const refreshToken = profile.refreshToken || (savedAli as any).refreshToken || '';
    const accessToken = profile.accessToken || (savedAli as any).accessToken || '';
    if (activeId === 'aliyun' && !accessToken && !refreshToken) {
      setSyncStatus('❌ 请先完成阿里云盘扫码登录，再上传');
      return;
    }
    setUploading(true);
    setSyncStatus(`⏳ 正在打包并上传到 ${activeMeta.label}…（大书可能需 1～2 分钟，请稍候）`);
    try {
      // 刷盘：等编辑器真正把当前章 .html 写完再打包（避免漏最新章）
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.removeEventListener('writerzen:force-save-done', onDone);
          resolve();
        };
        const onDone = () => finish();
        window.addEventListener('writerzen:force-save-done', onDone);
        window.dispatchEvent(new CustomEvent('writerzen:force-save-current-editor'));
        // 无打开编辑器时不会回 done，超时兜底
        window.setTimeout(finish, 4000);
      });
      try {
        const { flushChapterMetaDisk, flushBookMetaPatches } = await import(
          '../../../store/useBookStore'
        );
        await Promise.all([flushChapterMetaDisk(), flushBookMetaPatches()]);
      } catch {
        /* ignore */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      const api = (electronAPI as any)?.cloud?.upload;
      if (typeof api !== 'function') {
        setSyncStatus('❌ 云同步接口不可用，请重启写梨眼后再试');
        return;
      }
      const payload = {
        ...cloudPayload(),
        accessToken: accessToken || cloudPayload().accessToken,
        refreshToken: refreshToken || cloudPayload().refreshToken,
      };
      console.warn('[cloud-upload] start', {
        provider: payload.provider,
        hasRefresh: Boolean(payload.refreshToken),
        hasAccess: Boolean(payload.accessToken),
      });
      const result: any = await withTimeout(
        api(payload),
        300000,
        '上传超时（>5 分钟）。请检查网络后重试'
      );
      console.warn('[cloud-upload] result', result);
      if (!result || typeof result !== 'object') {
        setSyncStatus('❌ 上传无响应，请重启软件后重试');
        return;
      }
      if (result.success) {
        const extra =
          typeof result.warning === 'string' && result.warning
            ? `\n${result.warning}`
            : '';
        setSyncStatus(
          `✅ 上传成功（打包 ${result.uploaded ?? 0} 个文件）${extra}`
        );
        try {
          const { useIslandStore } = await import('../../../store/useIslandStore');
          useIslandStore.getState().show({
            type: 'success',
            message: `☁ 已上传到 ${activeMeta.label}`,
            autoHideMs: 2800,
          });
        } catch {
          /* ignore */
        }
      } else {
        setSyncStatus(`❌ ${result.error || '上传失败'}`);
        try {
          const { useIslandStore } = await import('../../../store/useIslandStore');
          useIslandStore
            .getState()
            .show({ type: 'error', message: result.error || '上传失败', autoHideMs: 3500 });
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[cloud-upload] error', error);
      setSyncStatus(`❌ ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async () => {
    if (busy) return;
    if (!cloud.enabled) {
      setSyncStatus('❌ 请先勾选「启用云同步」');
      return;
    }
    setDownloading(true);
    setSyncStatus(`⏳ 正在从 ${activeMeta.label} 下载…`);
    try {
      const api = (electronAPI as any)?.cloud?.download;
      if (typeof api !== 'function') {
        setSyncStatus('❌ 云同步接口不可用，请重启写梨眼后再试');
        return;
      }
      const result: any = await withTimeout(
        api(cloudPayload()),
        300000,
        '下载超时（>5 分钟）。请检查网络后重试'
      );
      if (!result || typeof result !== 'object') {
        setSyncStatus('❌ 下载无响应，请重启软件后重试');
        return;
      }
      if (result.success) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
          const { afterCloudDownload } = await import('../../../store/useBookStore');
          await afterCloudDownload();
        } catch {
          /* ignore */
        }
        if ((result as any).styleProfiles && (result as any).styleProfiles.length > 0) {
          try {
            const { useConfigStore } = await import('../../../store/useConfigStore');
            const config = useConfigStore.getState().config;
            if (config) {
              const remoteProfiles = (result as any).styleProfiles as Array<{
                id: string;
                boundBookIds?: string[];
              }>;
              const localMap = new Map(
                (config.ai.styleProfiles || []).map((p: any) => [p.id, p])
              );
              for (const p of remoteProfiles) {
                if (!p?.id) continue;
                const { boundBookIds: _, ...remoteClean } = p;
                const local = localMap.get(p.id);
                localMap.set(p.id, { ...remoteClean, boundBookIds: local?.boundBookIds });
              }
              const merged = Array.from(localMap.values());
              const next = { ...config, ai: { ...config.ai, styleProfiles: merged } };
              await useConfigStore.getState().saveConfig(next as typeof config);
            }
          } catch (spErr) {
            console.warn('合并 styleProfiles 失败:', spErr);
          }
        }
        setSyncStatus(`✅ 下载完成（${result.downloaded ?? 0} 个文件），书架已刷新`);
      } else {
        setSyncStatus(`❌ ${result.error || '下载失败'}`);
      }
    } catch (error) {
      setSyncStatus(`❌ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloading(false);
    }
  };

  const inputCls =
    'w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/50';

  return (
    <div className="space-y-6">
      <div
        className="text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        数据存储
      </div>
      <div className="w-[480px] p-6 wz-premium-pod backdrop-blur-[24px]">
        <div
          className="mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--text-muted)] opacity-60 uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Storage path:
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 text-[13px] font-medium tracking-wide text-[var(--text-primary)] transition-all hover:bg-white/5">
          {draft.workspace.storagePath || '未设置'}
        </div>

        <div
          className="mt-5 mb-2 text-[11px] font-bold tracking-[0.1em] text-[var(--text-muted)] opacity-60 uppercase"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Backup destination:
        </div>
        <div className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3 text-[13px] font-medium tracking-wide text-[var(--text-primary)] transition-all hover:bg-white/5">
          {draft.workspace.backupOutputPath || `${draft.workspace.storagePath || '未设置'}/backups`}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="flex-1 border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-2.5 text-[12px] font-medium tracking-wide text-[var(--text-primary)] transition-all hover:bg-white/5"
            onClick={() => void onSelectStoragePath()}
          >
            切换存储位置
          </button>
          <button
            className="flex-1 border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-2.5 text-[12px] font-medium tracking-wide text-[var(--text-primary)] transition-all hover:bg-white/5"
            onClick={() => void onSelectBackupPath()}
          >
            选择备份目录
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="flex-1 bg-[var(--accent)] px-5 py-2.5 text-[12px] font-bold tracking-widest text-white transition-all hover:brightness-110 active:scale-95"
            style={{ fontFamily: 'var(--font-display)' }}
            onClick={() => void onBackupNow()}
          >
            立即备份
          </button>
          <button
            className="flex-1 border border-[var(--accent)]/50 px-4 py-2.5 text-[12px] font-bold tracking-widest text-[var(--accent)] transition-all hover:bg-[var(--accent)]/10"
            style={{ fontFamily: 'var(--font-display)' }}
            onClick={() => void onOpenStoragePath()}
          >
            打开存储目录
          </button>
        </div>
      </div>

      {/* 多网盘云同步 */}
      <div
        className="text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)] uppercase"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        ☁️ 云盘备份 / 同步
      </div>
      <div className="w-[480px] p-6 wz-premium-pod backdrop-blur-[24px]">
        <label className="mb-4 flex items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={cloud.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-[13px] text-[var(--text-primary)]">启用云同步</span>
        </label>

        {cloud.enabled && (
          <div className="space-y-4">
            {/* 厂商 TAB */}
            <div>
              <div className="mb-2 text-[11px] text-[var(--text-muted)]">选择网盘</div>
              <div className="flex flex-wrap gap-1.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProvider(p.id)}
                    className={clsx(
                      'rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-all',
                      activeId === p.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm'
                        : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                    )}
                  >
                    {p.label}
                    <span className="ml-1 opacity-60 font-normal">·{p.short}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{activeMeta.hint}</p>
            </div>

            {/* 坚果云 / 通用 WebDAV */}
            {(activeId === 'nutstore' || activeId === 'webdav') && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-[11px] text-[var(--text-muted)]">
                    {activeId === 'nutstore' ? 'WebDAV 地址' : 'WebDAV 服务器地址'}
                  </div>
                  <input
                    className={inputCls}
                    value={profile.url || ''}
                    onChange={(e) => updateProfile({ url: e.target.value })}
                    placeholder={
                      activeId === 'nutstore'
                        ? NUTSTORE_DEFAULT_URL
                        : 'https://example.com/remote.php/dav/files/user/'
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-[var(--text-muted)]">
                    {activeId === 'nutstore' ? '账号（坚果云邮箱）' : '用户名'}
                  </div>
                  <input
                    className={inputCls}
                    value={profile.username || ''}
                    onChange={(e) => updateProfile({ username: e.target.value })}
                    placeholder={activeId === 'nutstore' ? 'your@email.com' : 'WebDAV 用户名'}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-[var(--text-muted)]">
                    {activeId === 'nutstore' ? '应用密码（非登录密码）' : '密码 / 应用密码'}
                  </div>
                  <input
                    type="password"
                    className={inputCls}
                    value={profile.password || ''}
                    onChange={(e) => updateProfile({ password: e.target.value })}
                    placeholder={
                      activeId === 'nutstore' ? '在坚果云「安全选项」中生成' : 'WebDAV 密码'
                    }
                  />
                </div>
              </div>
            )}

            {/* 阿里云盘：网页扫码（无需 AppKey） */}
            {activeId === 'aliyun' && (
              <div className="space-y-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)]/60 p-4">
                <div className="text-[12px] font-semibold text-[var(--text-primary)]">
                  阿里云盘扫码登录
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  点击下方按钮会打开扫码页。用手机「阿里云盘」App 扫一扫并确认后，凭证自动写回，无需开放平台、无需粘贴
                  Token。
                </p>
                {profile.accessToken || profile.refreshToken ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                    已授权
                    {profile.accessToken ? ' · 已保存 Access Token' : ''}
                    {profile.refreshToken ? ' · 已保存 Refresh Token' : ''}
                    ，可直接测试连接或上传备份。
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
                    尚未登录，请先扫码。
                  </div>
                )}
                <button
                  type="button"
                  disabled={authorizing}
                  className="w-full rounded-md bg-[var(--accent)] px-4 py-2.5 text-[12px] font-bold tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
                  onClick={() => {
                    void (async () => {
                      setAuthorizing(true);
                      setSyncStatus(
                        '正在生成阿里云盘二维码…请用手机阿里云盘 App 扫浏览器中的码。'
                      );
                      try {
                        const res: any = await (electronAPI as any).cloud.authorize('aliyun');
                        if (!res?.success) {
                          setSyncStatus(`❌ ${res?.error || '授权失败'}`);
                          return;
                        }
                        const accessToken = res.accessToken || res.access_token || '';
                        const refreshToken = res.refreshToken || res.refresh_token || '';
                        const patch: Partial<CloudProviderProfile> = {};
                        if (accessToken) patch.accessToken = String(accessToken);
                        if (refreshToken) patch.refreshToken = String(refreshToken);
                        if (!patch.accessToken && !patch.refreshToken) {
                          setSyncStatus('❌ 授权成功但未返回凭证，请重试扫码');
                          return;
                        }
                        const providers = {
                          ...cloud.providers,
                          aliyun: { ...profile, ...patch },
                        };
                        const nextCloud: CloudSyncConfig = {
                          ...cloud,
                          enabled: true,
                          activeProvider: 'aliyun',
                          providers,
                        };
                        const ok = await commitCloudAndPersist(nextCloud);
                        setSyncStatus(
                          ok
                            ? `✅ ${res.message || '授权成功，凭证已保存到本机配置。关闭设置后仍有效。'}`
                            : `✅ 授权成功，但自动保存失败——请点击设置页底部「保存」再关闭。`
                        );
                      } catch (e) {
                        setSyncStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
                      } finally {
                        setAuthorizing(false);
                      }
                    })();
                  }}
                >
                  {authorizing
                    ? '等待扫码确认…请打开手机阿里云盘'
                    : '扫码登录（打开二维码页）'}
                </button>
                <p className="text-[10px] text-[var(--text-muted)] opacity-70">
                  与网上常用的「扫码取 refresh_token」同一类接口：直接用阿里云盘账号登录，不经过开放平台审核。
                </p>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/5 disabled:opacity-50"
                onClick={() => void handleTest()}
                disabled={busy}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button
                className="border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-[11px] font-medium text-cyan-700 hover:bg-cyan-500/20 disabled:opacity-50"
                onClick={() => void handleUpload()}
                disabled={busy}
              >
                {uploading ? '上传中…' : '↑ 上传到云端'}
              </button>
              <button
                className="border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50"
                onClick={() => void handleDownload()}
                disabled={busy}
              >
                {downloading ? '下载中…' : '↓ 从云端下载'}
              </button>
            </div>
            {syncStatus && (
              <div
                className={clsx(
                  'mt-3 rounded-md border px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap',
                  syncStatus.startsWith('✅')
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                    : syncStatus.startsWith('❌')
                      ? 'border-red-500/40 bg-red-500/10 text-red-100'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-50'
                )}
              >
                {syncStatus}
              </div>
            )}
            <div className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)] opacity-70">
              同步内容：书架打包为 books.zip（含章节与角色库）。坚果云 / 通用 WebDAV 走 WebDAV；阿里云盘走扫码授权
              API。顶栏「上传/下载」使用当前选中网盘。关闭软件时自动上传走当前 WebDAV 配置（若已启用）。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
