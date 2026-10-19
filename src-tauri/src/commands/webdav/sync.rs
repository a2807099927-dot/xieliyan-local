// 同步逻辑：本地 ↔ 远端文件遍历 + 3 个 Tauri 命令入口
//
// 同步范围：workspace/books/*.json
// 单向覆盖：远端旧文件直接 PUT 覆盖；本地缺的文件下载下来；本地多的远端不会管
use std::path::{Path, PathBuf};

use reqwest::Client;
use serde_json::Value;
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;

use super::protocol::{
    build_client, download_file, ensure_remote_dir, probe_remote_path,
    upload_file,
};
use super::types::{SyncResult, WebDavConfig};
use super::url::url_origin;

const REMOTE_BOOKS_DIR: &str = "books";
const REMOTE_NOVEL_LAB_DIR: &str = "novel-lab";
const SYNC_EXTS: &[&str] = &[".json", ".html"];

fn workspace_books_dir(app: &AppHandle) -> PathBuf {
    crate::workspace::get_workspace_path(app).join("books")
}

/// NovelLab 拆书存档目录（由用户在 NovelLab 内自选，路径存在 config.workspace.novelLabSavePath）
/// 没配置就返回 None
async fn novel_lab_save_dir(app: &AppHandle) -> Option<PathBuf> {
    let cfg_response = crate::commands::config::config_load(app.clone()).await.ok()?;
    let save_path = cfg_response
        .get("config")?
        .get("workspace")?
        .get("novelLabSavePath")?
        .as_str()?
        .trim()
        .to_string();
    if save_path.is_empty() {
        return None;
    }
    let p = PathBuf::from(save_path);
    if p.exists() && p.is_dir() {
        Some(p)
    } else {
        None
    }
}

fn collect_local_files(base: &Path, sub: &str, exts: &[&str]) -> Vec<String> {
    let full = if sub.is_empty() {
        base.to_path_buf()
    } else {
        base.join(sub)
    };
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&full) {
        Ok(it) => it,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string().nfc().collect::<String>();
        let rel = if sub.is_empty() {
            name.clone()
        } else {
            format!("{sub}/{name}")
        };
        let path = entry.path();
        if path.is_dir() {
            if name == "backups" {
                continue;
            }
            out.extend(collect_local_files(base, &rel, exts));
        } else if path.is_file() {
            let lower = name.to_ascii_lowercase();
            if !exts.is_empty() && !exts.iter().any(|e| lower.ends_with(e)) {
                continue;
            }
            out.push(rel);
        }
    }
    out
}

use std::io::{Cursor, Read, Write};
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

/// 上传前把 chapters/{id}.html 正文内联回 book.json，使其成为自包含完整备份。
/// 仅当章节 content 为空且磁盘 .html 非空时才回填，绝不覆盖已有正文；任何解析失败都回退原始字节。
fn enrich_book_json_with_chapter_contents(
    local_base: &Path,
    book_json_rel: &str,
    raw: Vec<u8>,
) -> Vec<u8> {
    // book.json 相对路径形如 "{bookId}/book.json"，其兄弟目录 "{bookId}/chapters/"
    let book_dir = match Path::new(book_json_rel).parent() {
        Some(p) => local_base.join(p),
        None => return raw,
    };
    let chapters_dir = book_dir.join("chapters");
    let text = match String::from_utf8(raw.clone()) {
        Ok(t) => t,
        Err(_) => return raw,
    };
    let mut book: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return raw,
    };
    let mut changed = false;
    if let Some(chapters) = book.get_mut("chapters").and_then(|v| v.as_array_mut()) {
        for ch in chapters.iter_mut() {
            let is_empty = ch
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().is_empty())
                .unwrap_or(true);
            if !is_empty {
                continue;
            }
            let chapter_id = match ch.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };
            let html_path = chapters_dir.join(format!("{}.html", chapter_id));
            if let Ok(html) = std::fs::read_to_string(&html_path) {
                if !html.trim().is_empty() {
                    if let Some(obj) = ch.as_object_mut() {
                        obj.insert("content".to_string(), Value::String(html));
                        changed = true;
                    }
                }
            }
        }
    }
    if !changed {
        return raw;
    }
    match serde_json::to_string_pretty(&book) {
        Ok(s) => s.into_bytes(),
        Err(_) => raw,
    }
}

async fn upload_dir(
    client: &Client,
    config: &WebDavConfig,
    local_base: &Path,
    remote_sub: &str,
    exts: &[&str],
) -> Result<u32, String> {
    if !local_base.exists() {
        return Ok(0);
    }
    
    // 我们不再需要建一堆目录，只要把整个书架打成一个 ${remote_sub}.zip 上传即可
    let remote_file = if config.remote_path.is_empty() {
        format!("{}.zip", remote_sub)
    } else {
        format!("{}/{}.zip", config.remote_path.trim_matches('/'), remote_sub)
    };
    
    let local_files = collect_local_files(local_base, "", exts);
    if local_files.is_empty() {
        return Ok(0);
    }
    
    let mut buf = Vec::new();
    {
        let cursor = Cursor::new(&mut buf);
        let mut zip = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        
        for file in &local_files {
            let mut content = match std::fs::read(local_base.join(file)) {
                Ok(b) => b,
                Err(e) => {
                    crate::logger::error(format!(
                        "[webdav_upload] read failed: {} err={}", file, e
                    ));
                    continue;
                }
            };
            if file.ends_with("book.json") {
                // 数据安全：把每章 chapters/{id}.html 正文内联回 book.json，
                // 使上传的 book.json 成为自包含完整备份。即使某章 .html 未进包或
                // 下载端缺失，接收端 hydrate_chapter_contents 也能据此重建 .html，
                // 避免“目录有字数、正文空白”。
                content = enrich_book_json_with_chapter_contents(local_base, file, content);
                crate::logger::warn(format!(
                    "[webdav_upload] packing book.json {} ({} bytes)", file, content.len()
                ));
            }
            // 确保 zip 内部路径是标准化的 /
            let zip_path = file.replace('\\', "/");
            if zip.start_file(zip_path, options).is_ok() {
                let _ = zip.write_all(&content);
            }
        }
        if let Err(e) = zip.finish() {
            return Err(format!("压缩打包失败: {}", e));
        }
    }
    
    // 直接一次性 PUT 上传这个 zip 包
    upload_file(client, config, &remote_file, buf).await
        .map_err(|e| format!("上传存档失败: {}", e))?;
        
    Ok(local_files.len() as u32)
}

async fn download_dir(
    client: &Client,
    config: &WebDavConfig,
    remote_sub: &str,
    local_base: &Path,
    _exts: &[&str], // exts 在打包模式下用处不大了，因为 zip 里就是全量了，但保留接口签名
    diagnostics: &mut Vec<String>,
) -> u32 {
    let remote_file = if config.remote_path.is_empty() {
        format!("{}.zip", remote_sub)
    } else {
        format!("{}/{}.zip", config.remote_path.trim_matches('/'), remote_sub)
    };
    
    if let Some(content) = download_file(client, config, &remote_file).await {
        let cursor = Cursor::new(content);
        let mut archive = match ZipArchive::new(cursor) {
            Ok(a) => a,
            Err(e) => {
                let err_msg = format!("解压失败 ({}): {}", remote_file, e);
                crate::logger::error(format!("[webdav_download] {}", err_msg));
                diagnostics.push(err_msg);
                return 0;
            }
        };
        
        let mut downloaded = 0;
        for i in 0..archive.len() {
            if let Ok(mut file) = archive.by_index(i) {
                let name = file.name().to_string();
                if name.ends_with('/') {
                    continue; // 这是一个目录
                }
                
                let safe_path = match file.enclosed_name() {
                    Some(path) => path,
                    None => {
                        crate::logger::error(format!("[webdav_download] skip invalid path: {}", name));
                        continue;
                    }
                };
                
                let mut buf = Vec::new();
                if file.read_to_end(&mut buf).is_ok() {
                    let local_path = local_base.join(safe_path);
                    if let Some(parent) = local_path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    if let Err(e) = std::fs::write(&local_path, &buf) {
                        crate::logger::error(format!(
                            "[webdav_download] write failed: {} err={} ({} bytes)",
                            local_path.display(), e, buf.len()
                        ));
                        diagnostics.push(format!("写入失败 {}: {}", name, e));
                    } else {
                        if name.ends_with("book.json") {
                            crate::logger::warn(format!(
                                "[webdav_download] wrote book.json {} ({} bytes)",
                                local_path.display(), buf.len()
                            ));
                        }
                        downloaded += 1;
                    }
                }
            }
        }
        downloaded
    } else {
        diagnostics.push(format!("远端文件不存在或下载失败: {}", remote_file));
        0
    }
}

// ─────────── config 解析 ───────────

fn is_jianguoyun(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("jianguoyun.com") || lower.contains("nutstore")
}

/// 坚果云不支持中文 WebDAV 路径（固定返回 503）。
/// 自动将路径中的非 ASCII 段替换为 "xieliyan"，返回 None 表示无需修改。
fn sanitize_non_ascii_path(url: &str) -> Option<String> {
    let origin = url_origin(url);
    let remainder = url.get(origin.len()..)?;
    let (path, query) = match remainder.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (remainder, None),
    };
    if !path.chars().any(|c| !c.is_ascii()) {
        return None;
    }
    let new_path: String = path
        .split('/')
        .map(|seg| {
            if seg.chars().any(|c| !c.is_ascii()) {
                "xieliyan"
            } else {
                seg
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    let mut result = format!("{}{}", origin, new_path);
    if let Some(q) = query {
        result = format!("{}?{}", result, q);
    }
    Some(result)
}

/// 自动合并遗留的 remote_path 到 url 中，对齐前端的合并逻辑，彻底规避路径斜杠拼接不匹配导致的同步失败
fn normalize_webdav_config(mut cfg: WebDavConfig) -> WebDavConfig {
    let remote_path = cfg.remote_path.trim().replace('\\', "/");
    // 防御：remote_path 含 U+FFFD（编码损坏，通常是 GBK→UTF-8 乱码）时直接丢弃，
    // 避免把乱码拼进 URL 导致请求发往错误地址从而超时。
    if remote_path.contains('\u{FFFD}') {
        crate::logger::warn(format!(
            "[webdav] remotePath 含乱码字符，已丢弃: {:?}", remote_path
        ));
        cfg.remote_path = String::new();
        return cfg;
    }
    let remote_path_clean = remote_path.trim_matches('/');
    if !remote_path_clean.is_empty() {
        let (url_without_query, query) = {
            let mut url_parts = cfg.url.split('?');
            let u = url_parts.next().unwrap_or("").trim_end_matches('/').to_string();
            let q = url_parts.next().map(|s| s.to_string());
            (u, q)
        };

        let url_segs: Vec<&str> = url_without_query.split('/').filter(|s| !s.is_empty()).collect();
        let remote_segs: Vec<&str> = remote_path_clean.split('/').filter(|s| !s.is_empty()).collect();
        
        let already_merged = if url_segs.len() >= remote_segs.len() {
            let tail = &url_segs[url_segs.len() - remote_segs.len()..];
            tail == remote_segs
        } else {
            false
        };

        if !already_merged {
            cfg.url = format!("{}/{}", url_without_query, remote_path_clean);
        } else {
            cfg.url = url_without_query;
        }

        if let Some(q) = query {
            cfg.url = format!("{}?{}", cfg.url, q);
        }
        cfg.remote_path = String::new();
    }
    // 坚果云特殊处理：中文路径会导致 503，自动替换为英文
    if is_jianguoyun(&cfg.url) {
        if let Some(sanitized) = sanitize_non_ascii_path(&cfg.url) {
            crate::logger::warn(format!(
                "[webdav] 坚果云不支持中文路径，已自动替换: {} → {}",
                cfg.url, sanitized
            ));
            cfg.url = sanitized;
        }
    }
    cfg
}


/// 从应用 config.webdav 解析（前端不传 config 时使用）
async fn load_webdav_from_config(app: &AppHandle) -> Result<WebDavConfig, String> {
    let cfg_response = crate::commands::config::config_load(app.clone()).await?;
    let webdav_value = cfg_response
        .get("config")
        .and_then(|c| c.get("webdav"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let cfg: WebDavConfig =
        serde_json::from_value(webdav_value).map_err(|e| format!("webdav 配置解析失败: {}", e))?;
    let cfg = normalize_webdav_config(cfg);
    if !cfg.enabled {
        return Err("WebDAV 未启用".into());
    }
    if cfg.url.trim().is_empty() || cfg.username.trim().is_empty() || cfg.password.is_empty() {
        return Err("WebDAV 配置不完整（地址/账号/密码不能为空）".into());
    }
    Ok(cfg)
}

/// 容错：如果前端传了空对象（{}）也回退到 config
async fn resolve_config(
    app: &AppHandle,
    incoming: Option<WebDavConfig>,
) -> Result<WebDavConfig, String> {
    let cfg = match incoming {
        Some(cfg) if !cfg.url.trim().is_empty() && !cfg.username.trim().is_empty() => Ok(cfg),
        _ => load_webdav_from_config(app).await,
    }?;
    Ok(normalize_webdav_config(cfg))
}


// ─────────── Tauri 命令入口 ───────────

#[tauri::command]
pub async fn webdav_test(
    app: AppHandle,
    config: Option<WebDavConfig>,
) -> Result<serde_json::Value, String> {
    let config = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => return Ok(serde_json::json!({ "success": false, "error": e })),
    };

    let client = build_client(&config);
    match probe_remote_path(&client, &config).await {
        Ok(s) if s == 200 || s == 207 => Ok(serde_json::json!({ "success": true })),
        Ok(404) | Ok(403) => {
            // 坚果云对不存在的目录可能返回 404 或 403。
            // 先尝试 MKCOL 创建，成功后再探一次确认可用。
            ensure_remote_dir(&client, &config, &config.remote_path).await;
            match probe_remote_path(&client, &config).await {
                Ok(s2) if s2 == 200 || s2 == 207 => {
                    Ok(serde_json::json!({ "success": true }))
                }
                Ok(s2) => Ok(serde_json::json!({
                    "success": false,
                    "error": format!("目录已创建但仍无法访问 ({}). 请检查坚果云第三方应用授权", s2)
                })),
                Err(e) => Ok(serde_json::json!({ "success": false, "error": e })),
            }
        }
        Ok(401) => Ok(serde_json::json!({ "success": false, "error": "账号或应用密码错误" })),
        Ok(503) => {
            // 坚果云对中文路径的 PROPFIND 固定返回 503（非限流，是其路径编码限制）。
            // 不在这里做 MKCOL（同样会 503 且只是浪费时间），直接 fallback 到 /dav 根路径探测。
            let mut fallback = config.clone();
            fallback.url = format!("{}/dav", url_origin(&config.url).trim_end_matches('/'));
            fallback.remote_path.clear();
            crate::logger::warn(format!(
                "[webdav_test] 503 on {}, fallback probe -> {}",
                config.url, fallback.url
            ));
            match probe_remote_path(&client, &fallback).await {
                Ok(fs) if fs == 200 || fs == 207 => Ok(serde_json::json!({
                    "success": true,
                    "warning": "连接成功！注意：WebDAV 地址含中文目录名，坚果云对此支持有限。建议改为纯英文路径（如 /dav/xieliyan）以确保稳定。"
                })),
                Ok(fs) => Ok(serde_json::json!({
                    "success": false,
                    "error": format!("连接失败 (503)，回退 /dav 后状态码: {}。请检查坚果云服务状态或稍后重试。", fs)
                })),
                Err(ferr) => Ok(serde_json::json!({
                    "success": false,
                    "error": format!("连接失败 (503)。请检查网络和坚果云服务状态。详情: {}", ferr)
                })),
            }
        }
        Ok(s) => Ok(serde_json::json!({ "success": false, "error": format!("连接失败 ({})", s) })),
        Err(err) => Ok(serde_json::json!({ "success": false, "error": err })),
    }
}

#[tauri::command]
pub async fn webdav_upload(
    app: AppHandle,
    config: Option<WebDavConfig>,
) -> Result<SyncResult, String> {
    let config = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(SyncResult {
                success: false,
                uploaded: 0,
                downloaded: 0,
                error: Some(e),
                style_profiles: None,
            });
        }
    };

    crate::logger::warn(format!(
        "[webdav_upload] start url={} remote_path={}",
        config.url, config.remote_path
    ));
    let client = build_client(&config);
    // 确保远端根目录存在（首次同步或路径被自动修正后可能需要创建）
    ensure_remote_dir(&client, &config, "").await;

    let books = workspace_books_dir(&app);
    let mut uploaded = match upload_dir(&client, &config, &books, REMOTE_BOOKS_DIR, SYNC_EXTS).await {
        Ok(n) => n,
        Err(e) => {
            return Ok(SyncResult {
                success: false,
                uploaded: 0,
                downloaded: 0,
                error: Some(e),
                style_profiles: None,
            });
        }
    };

    // 拆书存档（NovelLab）— 用户配了 novelLabSavePath 才同步
    if let Some(nl_dir) = novel_lab_save_dir(&app).await {
        match upload_dir(&client, &config, &nl_dir, REMOTE_NOVEL_LAB_DIR, SYNC_EXTS).await {
            Ok(n) => uploaded += n,
            Err(e) => {
                return Ok(SyncResult {
                    success: false,
                    uploaded,
                    downloaded: 0,
                    error: Some(e),
                    style_profiles: None,
                });
            }
        }
    }

    // 上传自定义写作提示词配置（不包含书籍绑定关系 boundBookIds）
    if let Ok(cfg_response) = crate::commands::config::config_load(app.clone()).await {
        if let Some(style_profiles) = cfg_response
            .get("config")
            .and_then(|c| c.get("ai"))
            .and_then(|ai| ai.get("styleProfiles"))
        {
            let mut profiles_for_upload = style_profiles.clone();
            if let Some(arr) = profiles_for_upload.as_array_mut() {
                for item in arr {
                    if let Some(obj) = item.as_object_mut() {
                        obj.remove("boundBookIds");
                    }
                }
            }
            if let Ok(body) = serde_json::to_vec(&profiles_for_upload) {
                if let Err(e) = upload_file(&client, &config, "style-profiles.json", body).await {
                    crate::logger::warn(format!("[webdav_upload] style-profiles upload failed: {}", e));
                }
            }
        }
    }

    let result = SyncResult {
        success: true,
        uploaded,
        downloaded: 0,
        error: None,
        style_profiles: None,
    };
    crate::logger::warn(format!(
        "[webdav_upload] done success={} uploaded={} error={:?}",
        result.success, result.uploaded, result.error
    ));
    Ok(result)
}

#[tauri::command]
pub async fn webdav_download(
    app: AppHandle,
    config: Option<WebDavConfig>,
) -> Result<SyncResult, String> {
    let config = match resolve_config(&app, config).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(SyncResult {
                success: false,
                uploaded: 0,
                downloaded: 0,
                error: Some(e),
                style_profiles: None,
            });
        }
    };

    crate::logger::warn(format!(
        "[webdav_download] start url={} remote_path={}",
        config.url, config.remote_path
    ));
    let client = build_client(&config);
    let books = workspace_books_dir(&app);
    let _ = std::fs::create_dir_all(&books);
    let mut diagnostics: Vec<String> = Vec::new();
    let mut downloaded =
        download_dir(&client, &config, REMOTE_BOOKS_DIR, &books, SYNC_EXTS, &mut diagnostics)
            .await;

    // 拆书存档（NovelLab）— 用户配了 novelLabSavePath 才同步回本地
    if let Some(nl_dir) = novel_lab_save_dir(&app).await {
        downloaded += download_dir(
            &client,
            &config,
            REMOTE_NOVEL_LAB_DIR,
            &nl_dir,
            SYNC_EXTS,
            &mut diagnostics,
        )
        .await;
    }

    // 下载自定义写作提示词配置
    let mut style_profiles: Option<Vec<Value>> = None;
    if let Some(bytes) = download_file(&client, &config, "style-profiles.json").await {
        let text = String::from_utf8_lossy(&bytes);
        if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
            if let Some(arr) = parsed.as_array() {
                style_profiles = Some(arr.clone());
            }
        }
    }

    // downloaded == 0 时：有诊断信息 → 报错；无诊断 → 远端暂无数据，视为成功
    if downloaded == 0 && !diagnostics.is_empty() {
        let detail = diagnostics.join(" | ");
        return Ok(SyncResult {
            success: false,
            uploaded: 0,
            downloaded: 0,
            error: Some(format!("下载失败：{}", detail)),
            style_profiles: None,
        });
    }
    let result = SyncResult {
        success: true,
        uploaded: 0,
        downloaded,
        error: None,
        style_profiles,
    };
    crate::logger::warn(format!(
        "[webdav_download] done success={} downloaded={} error={:?}",
        result.success, result.downloaded, result.error
    ));
    Ok(result)
}
