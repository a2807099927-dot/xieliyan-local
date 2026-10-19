// 配置管理 commands — 对应 electron/config.ts
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use super::secrets;

const CONFIG_FILE: &str = "config.json";
/// 主项目 Electron 版的 config 路径（用于读取已有 AI 配置）
const ELECTRON_CONFIG_FILE: &str = "xieliyan_global_config.json";

/// keyring 中敏感字段的账号名
const SECRET_AI_API_KEY: &str = "ai_api_key";
const SECRET_PROVIDER_KEYS: &str = "ai_provider_keys";
const SECRET_WEBDAV_PW: &str = "webdav_password";

fn config_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join(CONFIG_FILE)
}

/// 探测主项目 Electron 版的 config 路径（%AppData%\xie-li-yan\）
fn electron_config_path() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    let p = PathBuf::from(appdata).join("xie-li-yan").join(ELECTRON_CONFIG_FILE);
    if p.exists() { Some(p) } else { None }
}

fn default_config() -> Value {
    json!({
        "ai": {
            "provider": "openai",
            "model": "gpt-4o",
            "apiKey": "",
            "baseUrl": "https://api.openai.com",
            "apiPath": "/chat/completions",
            "isLocked": true,
            "ragEnabled": true,
            "stylePresetId": "",
            "styleInstruction": "",
            "styleCustomEnabled": false,
            "providerKeys": {},
            "providerBaseUrls": {},
            "providerModels": {},
            "providerLastModels": {},
            "proxyProfiles": [],
            "activeProxyProfileId": "",
            "contextTransparencyEnabled": true,
            "contextBudgetEnabled": true,
            "styleCacheEnabled": true,
        },
        "ui": {
            "theme": "dark",
            "editorMaxWidth": 1100,
            "rightPanelWidth": 400,
            "glassEnabled": true,
            "lowPerformanceMode": false,
            "memoryBankChapterOrder": "asc",
            "customTheme": {},
            "appBrightness": 1,
            "appContrast": 1,
            "appSaturation": 1,
            "uploadedFonts": [],
            "editorTextBrightness": 1
        },
        "workspace": {
            "storagePath": "",
            "backupOutputPath": "",
        },
        "network": { "requestTimeoutMs": 60000 },
        "tokenStats": { "totalUsed": 0, "estimatedCost": 0, "byProvider": {} },
        "webdav": { "enabled": false, "url": "", "username": "", "password": "" },
    })
}

/// Deep merge：用 source 填充 target 中不存在或为空的字段（已有非空值的字段保留 target 自己的）
/// "空"判定：null / "" / [] / {}
/// 对于"配置字典"类字段（proxyProfiles/providerKeys/providerBaseUrls/providerModels/providerLastModels）：
///   - 数组：source 比 target 长 → 用 source 覆盖（避免 Tauri 自己缺少主项目的内置中转站）
///   - 对象：source 键数比 target 多 → merge 进去（不丢 target 的）
fn fill_missing_from_source(target: &mut Value, source: &Value) {
    let (Some(t), Some(s)) = (target.as_object_mut(), source.as_object()) else {
        return;
    };
    for (k, v) in s {
        // 优先处理"配置集合"字段：数组超集合并 + 对象超集合并
        if matches!(k.as_str(), "proxyProfiles" | "providerKeys" | "providerBaseUrls" | "providerModels" | "providerLastModels") {
            match (t.get_mut(k), v) {
                (Some(Value::Array(t_arr)), Value::Array(s_arr)) => {
                    if s_arr.len() > t_arr.len() {
                        *t_arr = s_arr.clone();
                    }
                    continue;
                }
                (Some(Value::Object(t_obj)), Value::Object(s_obj)) => {
                    for (sk, sv) in s_obj {
                        if !t_obj.contains_key(sk) {
                            t_obj.insert(sk.clone(), sv.clone());
                        }
                    }
                    continue;
                }
                (None, _) => {
                    t.insert(k.clone(), v.clone());
                    continue;
                }
                _ => {}
            }
        }

        let should_replace = match t.get(k) {
            None => true,
            Some(Value::Null) => true,
            Some(Value::String(x)) => x.is_empty(),
            Some(Value::Array(x)) => x.is_empty(),
            Some(Value::Object(x)) => x.is_empty(),
            _ => false,
        };
        if should_replace {
            t.insert(k.clone(), v.clone());
        } else if matches!(t.get(k), Some(Value::Object(_))) && v.is_object() {
            if let Some(nested) = t.get_mut(k) {
                fill_missing_from_source(nested, v);
            }
        }
    }
}

/// 把配置里的敏感字段写入 keyring，并在待落盘 JSON 里抹空。
/// keyring 不可用（set_secret 返回 false）时保留明文，保证不丢数据。
fn redact_secret(cfg: &mut Value, ptr: &str, account: &str) {
    let val = cfg.pointer(ptr).and_then(|v| v.as_str()).unwrap_or("").to_string();
    if val.is_empty() { return; }
    if secrets::set_secret(account, &val) {
        if let Some(slot) = cfg.pointer_mut(ptr) { *slot = json!(""); }
    }
}

fn provider_keys_has_value(v: &Value) -> bool {
    v.as_object().map(|o| o.values().any(|x| x.as_str().map(|s| !s.is_empty()).unwrap_or(false))).unwrap_or(false)
}

fn redact_provider_keys(cfg: &mut Value) {
    let obj = match cfg.pointer("/ai/providerKeys") {
        Some(v) if provider_keys_has_value(v) => v.clone(),
        _ => return,
    };
    if let Ok(s) = serde_json::to_string(&obj) {
        if secrets::set_secret(SECRET_PROVIDER_KEYS, &s) {
            if let Some(slot) = cfg.pointer_mut("/ai/providerKeys") { *slot = json!({}); }
        }
    }
}

/// 落盘前：把所有敏感字段移入 keyring 并从 JSON 里抹掉。
fn persist_secrets(cfg: &mut Value) {
    redact_secret(cfg, "/ai/apiKey", SECRET_AI_API_KEY);
    redact_secret(cfg, "/webdav/password", SECRET_WEBDAV_PW);
    redact_provider_keys(cfg);
}

/// 加载时：把 keyring 里的敏感字段回填到 JSON；同时把磁盘上残留的明文（老版本）迁移进 keyring。
fn restore_secrets(cfg: &mut Value) {
    if let Some(v) = cfg.pointer("/ai/apiKey").and_then(|x| x.as_str()) {
        if !v.is_empty() { secrets::set_secret(SECRET_AI_API_KEY, v); }
    }
    if let Some(v) = cfg.pointer("/webdav/password").and_then(|x| x.as_str()) {
        if !v.is_empty() { secrets::set_secret(SECRET_WEBDAV_PW, v); }
    }
    if let Some(pk) = cfg.pointer("/ai/providerKeys") {
        if provider_keys_has_value(pk) {
            if let Ok(s) = serde_json::to_string(pk) { secrets::set_secret(SECRET_PROVIDER_KEYS, &s); }
        }
    }
    if let Some(k) = secrets::get_secret(SECRET_AI_API_KEY) {
        if let Some(slot) = cfg.pointer_mut("/ai/apiKey") { *slot = json!(k); }
    }
    if let Some(p) = secrets::get_secret(SECRET_WEBDAV_PW) {
        if let Some(slot) = cfg.pointer_mut("/webdav/password") { *slot = json!(p); }
    }
    if let Some(raw) = secrets::get_secret(SECRET_PROVIDER_KEYS) {
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
            if let Some(slot) = cfg.pointer_mut("/ai/providerKeys") { *slot = parsed; }
        }
    }
}

/// 加载配置（优先从 Tauri 版读，没有则从主项目 Electron 版读）
/// 首次启动（Tauri 自己的 config 不存在）：从主项目完整克隆 + 落盘
/// 已存在 Tauri config：直接读，不再合并（避免覆盖用户在 Tauri 内的改动）
#[tauri::command]
pub async fn config_load(app: AppHandle) -> Result<Value, String> {
    let path = config_path(&app);
    let is_first_launch = !path.exists();

    let mut config = if !is_first_launch {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_else(|_| default_config())
    } else if let Some(electron_path) = electron_config_path() {
        // 首次启动：完整克隆主项目 config
        match fs::read_to_string(&electron_path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| default_config()),
            Err(_) => default_config(),
        }
    } else {
        default_config()
    };

    // 仅首次启动 deep-merge 兜底（用主项目补齐 default_config 中缺失的字段）
    if is_first_launch {
        if let Some(electron_path) = electron_config_path() {
            if let Ok(raw) = fs::read_to_string(&electron_path) {
                if let Ok(electron_cfg) = serde_json::from_str::<Value>(&raw) {
                    fill_missing_from_source(&mut config, &electron_cfg);
                }
            }
        }
        // 写回 Tauri config，标记为"已初始化"
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        persist_secrets(&mut config);
        if let Ok(text) = serde_json::to_string_pretty(&config) {
            let _ = fs::write(&path, text);
        }
    }

    // 同步当前工作区路径到 config.workspace.storagePath
    let workspace = crate::workspace::get_workspace_path(&app);
    if let Some(ws) = config.get_mut("workspace").and_then(|v| v.as_object_mut()) {
        ws.insert("storagePath".to_string(), json!(workspace.to_string_lossy()));
    }

    restore_secrets(&mut config);

    Ok(json!({ "config": config }))
}

/// 保存配置
#[tauri::command]
pub async fn config_save(app: AppHandle, mut config: Value) -> Result<bool, String> {
    let path = config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    persist_secrets(&mut config);
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    // 原子写：避免写入中断时把全局配置写坏（配置含用户设置，损坏后需重配）
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    match fs::rename(&tmp, &path) {
        Ok(_) => Ok(true),
        Err(_) => {
            let _ = fs::remove_file(&path);
            fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

/// 重置配置
#[tauri::command]
pub async fn config_reset(app: AppHandle) -> Result<bool, String> {
    let path = config_path(&app);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

/// 获取 API Key（Tauri 版暂时直接从 config 读，后续接入 keyring）
#[tauri::command]
pub async fn config_get_api_key(app: AppHandle) -> Result<Option<String>, String> {
    if let Some(k) = secrets::get_secret(SECRET_AI_API_KEY) {
        return Ok(Some(k));
    }
    let config_res = config_load(app).await?;
    let key = config_res.get("config")
        .and_then(|c| c.get("ai"))
        .and_then(|ai| ai.get("apiKey"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    Ok(key)
}
