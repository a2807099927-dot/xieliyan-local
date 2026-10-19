// 多网盘云同步调度：坚果云 / 通用 WebDAV；阿里云盘扫码网页协议
// 统一备份物：books.zip（与 WebDAV 打包格式一致）
mod aliyun;
pub mod oauth;
mod pack;
mod types;

pub use types::{CloudProviderConfig, CloudSyncResult};

use tauri::AppHandle;

use pack::{
    load_style_profiles_json, novel_lab_save_dir, pack_books_zip, unpack_books_zip,
    workspace_books_dir,
};

fn normalize_provider(p: &str) -> String {
    p.trim().to_lowercase()
}

/// 从完整 app config 的 cloudSync + 当前 profile 组装请求。
/// 注意：前端常带 provider，仍需用磁盘配置补空的 token/密码（不能 early-return 丢凭证）。
fn merge_from_app_config(app_cfg: &serde_json::Value, mut incoming: CloudProviderConfig) -> CloudProviderConfig {
    let cs = app_cfg.get("cloudSync");
    if incoming.provider.is_empty() {
        let active = cs
            .and_then(|c| c.get("activeProvider"))
            .and_then(|v| v.as_str())
            .unwrap_or("nutstore");
        incoming.provider = active.to_string();
    }
    if !incoming.enabled {
        incoming.enabled = cs
            .and_then(|c| c.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
    }
    let provider_key = normalize_provider(&incoming.provider);
    let prof = cs
        .and_then(|c| c.get("providers"))
        .and_then(|p| {
            p.get(provider_key.as_str())
                .or_else(|| p.get(incoming.provider.as_str()))
        });
    if let Some(prof) = prof {
        if incoming.url.is_empty() {
            incoming.url = prof.get("url").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.username.is_empty() {
            incoming.username = prof.get("username").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.password.is_empty() {
            incoming.password = prof.get("password").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.access_token.is_empty() {
            incoming.access_token = prof
                .get("accessToken")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into();
        }
        if incoming.refresh_token.is_empty() {
            incoming.refresh_token = prof
                .get("refreshToken")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into();
        }
        if incoming.cookie.is_empty() {
            incoming.cookie = prof.get("cookie").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.folder_id.is_empty() {
            incoming.folder_id = prof
                .get("folderId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into();
        }
        if incoming.app_id.is_empty() {
            incoming.app_id = prof.get("appId").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.app_key.is_empty() {
            incoming.app_key = prof.get("appKey").and_then(|v| v.as_str()).unwrap_or("").into();
        }
        if incoming.remote_path.is_empty() {
            incoming.remote_path = prof
                .get("remotePath")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into();
        }
    }
    // 兼容旧 webdav（坚果 / 通用 WebDAV）
    if matches!(provider_key.as_str(), "nutstore" | "webdav" | "") {
        if let Some(wd) = app_cfg.get("webdav") {
            if incoming.url.is_empty() {
                incoming.url = wd.get("url").and_then(|v| v.as_str()).unwrap_or("").into();
            }
            if incoming.username.is_empty() {
                incoming.username = wd.get("username").and_then(|v| v.as_str()).unwrap_or("").into();
            }
            if incoming.password.is_empty() {
                incoming.password = wd.get("password").and_then(|v| v.as_str()).unwrap_or("").into();
            }
            if !incoming.enabled {
                incoming.enabled = wd.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            }
            if incoming.provider.is_empty() {
                incoming.provider = "nutstore".into();
            }
        }
    }
    incoming
}

async fn resolve_config(
    app: &AppHandle,
    incoming: Option<CloudProviderConfig>,
) -> Result<CloudProviderConfig, String> {
    let loaded = crate::commands::config::config_load(app.clone()).await.ok();
    let app_cfg = loaded
        .as_ref()
        .and_then(|v| v.get("config"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let mut cfg = merge_from_app_config(&app_cfg, incoming.unwrap_or_default());
    if cfg.provider.is_empty() {
        cfg.provider = "nutstore".into();
    }
    crate::logger::warn(format!(
        "[cloud_resolve] provider={} enabled={} has_refresh={} has_access={} refresh_len={} access_len={}",
        cfg.provider,
        cfg.enabled,
        !cfg.refresh_token.is_empty(),
        !cfg.access_token.is_empty(),
        cfg.refresh_token.len(),
        cfg.access_token.len()
    ));
    Ok(cfg)
}

async fn run_webdav_test(
    app: AppHandle,
    cfg: &CloudProviderConfig,
) -> Result<CloudSyncResult, String> {
    use crate::commands::webdav::types::WebDavConfig;
    let wd = WebDavConfig {
        enabled: true,
        url: cfg.url.clone(),
        username: cfg.username.clone(),
        password: cfg.password.clone(),
        remote_path: cfg.remote_path.clone(),
    };
    match crate::commands::webdav::webdav_test(app, Some(wd)).await {
        Ok(v) => {
            let success = v.get("success").and_then(|x| x.as_bool()).unwrap_or(false);
            if success {
                let warning = v
                    .get("warning")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
                if let Some(w) = warning {
                    Ok(CloudSyncResult::ok_test_warn(w))
                } else {
                    Ok(CloudSyncResult::ok_test())
                }
            } else {
                Ok(CloudSyncResult::err(
                    v.get("error")
                        .and_then(|x| x.as_str())
                        .unwrap_or("连接失败"),
                ))
            }
        }
        Err(e) => Ok(CloudSyncResult::err(e)),
    }
}

async fn run_webdav_upload(
    app: AppHandle,
    cfg: &CloudProviderConfig,
) -> Result<CloudSyncResult, String> {
    use crate::commands::webdav::types::WebDavConfig;
    let wd = WebDavConfig {
        enabled: true,
        url: cfg.url.clone(),
        username: cfg.username.clone(),
        password: cfg.password.clone(),
        remote_path: cfg.remote_path.clone(),
    };
    match crate::commands::webdav::webdav_upload(app, Some(wd)).await {
        Ok(r) => Ok(CloudSyncResult {
            success: r.success,
            uploaded: r.uploaded,
            downloaded: r.downloaded,
            error: r.error,
            warning: None,
            style_profiles: r.style_profiles,
        }),
        Err(e) => Ok(CloudSyncResult::err(e)),
    }
}

async fn run_webdav_download(
    app: AppHandle,
    cfg: &CloudProviderConfig,
) -> Result<CloudSyncResult, String> {
    use crate::commands::webdav::types::WebDavConfig;
    let wd = WebDavConfig {
        enabled: true,
        url: cfg.url.clone(),
        username: cfg.username.clone(),
        password: cfg.password.clone(),
        remote_path: cfg.remote_path.clone(),
    };
    match crate::commands::webdav::webdav_download(app, Some(wd)).await {
        Ok(r) => Ok(CloudSyncResult {
            success: r.success,
            uploaded: r.uploaded,
            downloaded: r.downloaded,
            error: r.error,
            warning: None,
            style_profiles: r.style_profiles,
        }),
        Err(e) => Ok(CloudSyncResult::err(e)),
    }
}

#[tauri::command]
pub async fn cloud_sync_test(
    app: AppHandle,
    config: Option<CloudProviderConfig>,
) -> Result<CloudSyncResult, String> {
    let cfg = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => return Ok(CloudSyncResult::err(e)),
    };
    let p = normalize_provider(&cfg.provider);
    crate::logger::warn(format!("[cloud_sync_test] provider={}", p));
    let res = match p.as_str() {
        "nutstore" | "webdav" | "" => run_webdav_test(app, &cfg).await?,
        "aliyun" | "alipan" => match aliyun::test(&cfg).await {
            Ok(msg) => CloudSyncResult::ok_test_warn(msg),
            Err(e) => CloudSyncResult::err(e),
        },
        "baidu" | "quark" | "lanzou" => CloudSyncResult::err(
            "该网盘已下线，请改用坚果云、通用 WebDAV 或阿里云盘".to_string(),
        ),
        other => CloudSyncResult::err(format!("未知网盘类型: {}", other)),
    };
    Ok(res)
}

#[tauri::command]
pub async fn cloud_sync_upload(
    app: AppHandle,
    config: Option<CloudProviderConfig>,
) -> Result<CloudSyncResult, String> {
    let cfg = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => return Ok(CloudSyncResult::err(e)),
    };
    let p = normalize_provider(&cfg.provider);
    crate::logger::warn(format!("[cloud_sync_upload] provider={}", p));

    if matches!(p.as_str(), "nutstore" | "webdav" | "") {
        return run_webdav_upload(app, &cfg).await;
    }

    // 阿里云盘需要 refresh/access token
    if matches!(p.as_str(), "aliyun" | "alipan") {
        if cfg.refresh_token.trim().is_empty() && cfg.access_token.trim().is_empty() {
            return Ok(CloudSyncResult::err(
                "未找到阿里云盘凭证。请先扫码登录后再上传。",
            ));
        }
    }

    let books = workspace_books_dir(&app);
    crate::logger::warn(format!(
        "[cloud_sync_upload] packing books dir={} …",
        books.display()
    ));
    // 同步打包放到 blocking 线程，避免卡住 async runtime / 前端 IPC
    let books_for_pack = books.clone();
    let pack_result =
        tokio::task::spawn_blocking(move || pack_books_zip(&books_for_pack)).await;
    let (zip, books_file_count) = match pack_result {
        Ok(Ok(v)) => {
            crate::logger::warn(format!(
                "[cloud_sync_upload] books pack ok files={} zip_bytes={}",
                v.1,
                v.0.len()
            ));
            v
        }
        Ok(Err(e)) => {
            crate::logger::error(format!("[cloud_sync_upload] pack fail: {}", e));
            return Ok(CloudSyncResult::err(e));
        }
        Err(e) => {
            crate::logger::error(format!("[cloud_sync_upload] pack join fail: {}", e));
            return Ok(CloudSyncResult::err(format!("打包任务失败: {}", e)));
        }
    };
    let zip_bytes = zip.len() as u64;
    let mut total_files = books_file_count;
    let mut novel_lab_files = 0u32;
    let mut novel_lab_zip: Option<Vec<u8>> = None;

    // 与坚果云对齐：若配置了 NovelLab 拆书目录，一并打包上传（这是 880 vs 879 的常见差值来源）
    if let Some(nl_dir) = novel_lab_save_dir(&app).await {
        let nl_path = nl_dir.clone();
        match tokio::task::spawn_blocking(move || pack_books_zip(&nl_path)).await {
            Ok(Ok((nz, nfc))) if nfc > 0 => {
                crate::logger::warn(format!(
                    "[cloud_sync_upload] novel-lab pack ok files={} zip_bytes={} dir={}",
                    nfc,
                    nz.len(),
                    nl_dir.display()
                ));
                novel_lab_files = nfc;
                total_files = total_files.saturating_add(nfc);
                novel_lab_zip = Some(nz);
            }
            Ok(Ok(_)) => {}
            Ok(Err(e)) => {
                crate::logger::warn(format!("[cloud_sync_upload] novel-lab pack skip: {}", e));
            }
            Err(e) => {
                crate::logger::warn(format!("[cloud_sync_upload] novel-lab join fail: {}", e));
            }
        }
    }

    let up = match p.as_str() {
        "aliyun" | "alipan" => aliyun::upload_books_zip(&cfg, zip).await,
        "baidu" | "quark" | "lanzou" => {
            Err("该网盘已下线，请改用坚果云、通用 WebDAV 或阿里云盘".into())
        }
        other => Err(format!("未知网盘: {}", other)),
    };

    // 附带 novel-lab.zip + style-profiles（尽力而为）
    if matches!(p.as_str(), "aliyun" | "alipan") {
        if let Ok(s) = aliyun::AliyunSession::connect(&cfg).await {
            if let Ok(folder) = s.ensure_folder("xieliyan").await {
                if let Some(nz) = novel_lab_zip {
                    if let Err(e) = s.upload_file(&folder, "novel-lab.zip", nz).await {
                        crate::logger::warn(format!(
                            "[cloud_sync_upload] novel-lab.zip upload failed: {}",
                            e
                        ));
                    }
                }
                if let Some(styles) = load_style_profiles_json(&app).await {
                    let _ = s.upload_file(&folder, "style-profiles.json", styles).await;
                }
            }
        }
    } else {
        let _ = novel_lab_zip;
    }

    match up {
        Ok(()) => {
            let mut r = CloudSyncResult::ok_upload(total_files);
            r.warning = Some(format!(
                "书架 books.zip：{} 个文件（约 {:.1} MB）{}\n网盘路径：xieliyan/books.zip{}",
                books_file_count,
                zip_bytes as f64 / (1024.0 * 1024.0),
                if novel_lab_files > 0 {
                    format!("；NovelLab 拆书 novel-lab.zip：{} 个文件", novel_lab_files)
                } else {
                    String::new()
                },
                if novel_lab_files > 0 {
                    " 与 xieliyan/novel-lab.zip"
                } else {
                    ""
                }
            ));
            crate::logger::warn(format!(
                "[cloud_sync_upload] SUCCESS provider={} books_files={} novel_lab_files={} total={} zip={}",
                p, books_file_count, novel_lab_files, total_files, zip_bytes
            ));
            Ok(r)
        }
        Err(e) => {
            crate::logger::error(format!("[cloud_sync_upload] FAIL provider={} err={}", p, e));
            Ok(CloudSyncResult::err(e))
        }
    }
}

#[tauri::command]
pub async fn cloud_sync_download(
    app: AppHandle,
    config: Option<CloudProviderConfig>,
) -> Result<CloudSyncResult, String> {
    let cfg = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => return Ok(CloudSyncResult::err(e)),
    };
    let p = normalize_provider(&cfg.provider);
    crate::logger::warn(format!("[cloud_sync_download] provider={}", p));

    if matches!(p.as_str(), "nutstore" | "webdav" | "") {
        return run_webdav_download(app, &cfg).await;
    }

    let zip = match p.as_str() {
        "aliyun" | "alipan" => aliyun::download_books_zip(&cfg).await,
        "baidu" | "quark" | "lanzou" => {
            Err("该网盘已下线，请改用坚果云、通用 WebDAV 或阿里云盘".into())
        }
        other => Err(format!("未知网盘: {}", other)),
    };

    match zip {
        Ok(bytes) => {
            crate::logger::warn(format!(
                "[cloud_sync_download] got zip {} bytes provider={}",
                bytes.len(),
                p
            ));
            if bytes.len() < 32 {
                return Ok(CloudSyncResult::err(format!(
                    "云端备份过小（{} bytes），拒绝覆盖本地，请先重新上传",
                    bytes.len()
                )));
            }
            let books = workspace_books_dir(&app);
            let _ = std::fs::create_dir_all(&books);
            match unpack_books_zip(&bytes, &books) {
                Ok(n) => {
                    crate::logger::warn(format!(
                        "[cloud_sync_download] unpack ok n={} dir={}",
                        n,
                        books.display()
                    ));
                    Ok(CloudSyncResult::ok_download(n, None))
                }
                Err(e) => {
                    crate::logger::error(format!("[cloud_sync_download] unpack fail: {}", e));
                    Ok(CloudSyncResult::err(e))
                }
            }
        }
        Err(e) => {
            crate::logger::error(format!("[cloud_sync_download] fetch fail: {}", e));
            Ok(CloudSyncResult::err(e))
        }
    }
}
