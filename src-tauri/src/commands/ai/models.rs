// 模型列表 — 远端 provider 模型 + 本地模型（Ollama / OpenAI 兼容）
use crate::ai::manager;
use crate::ai::types::AiConfig;
use reqwest::Client;
use serde_json::Value;
use std::time::Duration;

const PROBE_TIMEOUT_MS: u64 = 4500;

#[tauri::command]
pub async fn ai_get_provider_models(
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
) -> Result<Value, String> {
    let cfg = AiConfig {
        provider: provider.clone(),
        model: String::new(),
        api_key: api_key.unwrap_or_default(),
        base_url: base_url.unwrap_or_else(|| match provider.as_str() {
            "openai" => "https://api.openai.com".into(),
            "anthropic" => "https://api.anthropic.com".into(),
            "gemini" => "https://generativelanguage.googleapis.com".into(),
            "deepseek" => "https://api.deepseek.com".into(),
            _ => String::new(),
        }),
        api_path: String::new(),
        temperature: None,
        max_tokens: None,
        request_timeout_ms: Some(8000),
        stream_event: None,
        stream_request_id: None,
    };
    match manager::get_models(&cfg).await {
        Ok(models) => Ok(serde_json::json!({ "models": models })),
        Err(e) => Ok(serde_json::json!({ "models": [], "diagnostics": [e] })),
    }
}

/// 本地模型列表 — 先试 Ollama `/api/tags`，再试 OpenAI 兼容 `/v1/models` `/models`
/// 主项目用 IPv4 + IPv6 双探测，Tauri 阶段用单 host 直连（host 可由用户配置改）
#[tauri::command]
pub async fn ai_get_local_models(
    base_url: String,
    api_key: Option<String>,
) -> Result<Value, String> {
    let base = normalize_base_url(&base_url);
    let root = base.trim_end_matches("/v1");

    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(PROBE_TIMEOUT_MS));

    let auth_value = api_key.as_ref().map(|k| format!("Bearer {}", k));
    let mut diagnostics: Vec<String> = Vec::new();

    // 1) Ollama
    let ollama_url = format!("{}/api/tags", root);
    match probe_ollama(&client, &ollama_url, auth_value.as_deref()).await {
        Ok((true, models)) if !models.is_empty() => {
            diagnostics.push(format!("[GET {}] ok models={}", ollama_url, models.len()));
            return Ok(serde_json::json!({ "models": models, "diagnostics": diagnostics }));
        }
        Ok((true, _)) => {
            diagnostics.push(format!("[GET {}] 200 empty list", ollama_url));
        }
        Ok((false, _)) => {
            diagnostics.push(format!("[GET {}] non-200", ollama_url));
        }
        Err(e) => diagnostics.push(format!("[GET {}] failed: {}", ollama_url, e)),
    }

    // 2) OpenAI 兼容
    for path in &["/v1/models", "/models"] {
        let url = format!("{}{}", root, path);
        match probe_openai_models(&client, &url, auth_value.as_deref()).await {
            Ok((true, models)) if !models.is_empty() => {
                diagnostics.push(format!("[GET {}] ok models={}", url, models.len()));
                return Ok(serde_json::json!({ "models": models, "diagnostics": diagnostics }));
            }
            Ok((true, _)) => diagnostics.push(format!("[GET {}] 200 empty list", url)),
            Ok((false, _)) => diagnostics.push(format!("[GET {}] non-200", url)),
            Err(e) => diagnostics.push(format!("[GET {}] failed: {}", url, e)),
        }
    }

    Ok(serde_json::json!({ "models": [], "diagnostics": diagnostics }))
}

fn normalize_base_url(input: &str) -> String {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "http://127.0.0.1:11434".to_string();
    }
    trimmed.to_string()
}

async fn probe_ollama(
    client: &Client,
    url: &str,
    auth: Option<&str>,
) -> Result<(bool, Vec<String>), String> {
    let mut req = client.get(url).header("Accept", "application/json");
    if let Some(token) = auth {
        req = req.header("Authorization", token);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok((false, Vec::new()));
    }
    let value: Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = value
        .get("models")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    Ok((true, models))
}

async fn probe_openai_models(
    client: &Client,
    url: &str,
    auth: Option<&str>,
) -> Result<(bool, Vec<String>), String> {
    let mut req = client.get(url).header("Accept", "application/json");
    if let Some(token) = auth {
        req = req.header("Authorization", token);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok((false, Vec::new()));
    }
    let value: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut models: Vec<String> = Vec::new();
    if let Some(arr) = value.get("data").and_then(|v| v.as_array()) {
        models.extend(
            arr.iter()
                .filter_map(|item| item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())),
        );
    }
    if let Some(arr) = value.get("models").and_then(|v| v.as_array()) {
        models.extend(arr.iter().filter_map(|item| {
            if let Some(s) = item.as_str() {
                Some(s.to_string())
            } else {
                item.get("name")
                    .or_else(|| item.get("id"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }
        }));
    }
    let mut seen = std::collections::HashSet::new();
    let unique: Vec<String> = models
        .into_iter()
        .filter(|m| !m.is_empty() && seen.insert(m.clone()))
        .collect();
    Ok((true, unique))
}
