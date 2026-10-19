// Google Gemini adapter
use crate::ai::types::{AiConfig, ChatMessage, ChatResponse, StreamChunk, ToolDef};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

fn build_body(messages: &[ChatMessage]) -> Value {
    let system_instruction: Vec<&str> = messages.iter()
        .filter(|m| m.role == "system")
        .filter_map(|m| m.content.as_deref())
        .collect();
    let contents: Vec<Value> = messages.iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            let role = if m.role == "assistant" { "model" } else { "user" };
            json!({"role": role, "parts": [{"text": m.content}]})
        })
        .collect();
    let mut body = json!({"contents": contents});
    if !system_instruction.is_empty() {
        body["systemInstruction"] = json!({"parts": [{"text": system_instruction.join("\n\n")}]});
    }
    body
}

fn endpoint(config: &AiConfig, stream: bool) -> String {
    let base = config.base_url.trim_end_matches('/');
    let action = if stream { "streamGenerateContent" } else { "generateContent" };
    format!("{}/v1beta/models/{}:{}", base, config.model, action)
}

pub async fn chat(
    config: &AiConfig,
    messages: &[ChatMessage],
    _tools: &Option<Vec<ToolDef>>,
    _tool_choice: &Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    let started = Instant::now();
    let timeout_ms = config.request_timeout_ms.unwrap_or(60_000);
    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(timeout_ms));
    let body = build_body(messages);
    let resp = tokio::select! {
        _ = cancel.cancelled() => return Err("请求已取消".into()),
        r = client.post(&endpoint(config, false))
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", &config.api_key)
            .json(&body).send()
            => r.map_err(|e| format!("Gemini 请求失败: {}", e))?   
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini 请求失败: {} | {}", status, raw.chars().take(300).collect::<String>()));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = extract_text(&data);
    Ok(ChatResponse { text, duration_ms: started.elapsed().as_millis() as u64, provider: config.provider.clone(), model: config.model.clone(), usage: None, tool_calls: None })
}

pub async fn chat_stream(
    app: &tauri::AppHandle,
    config: &AiConfig,
    messages: &[ChatMessage],
    _tools: &Option<Vec<ToolDef>>,
    _tool_choice: &Option<String>,
    session_id: Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    let started = Instant::now();
    let timeout_ms = config.request_timeout_ms.unwrap_or(60_000);
    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(timeout_ms));
    let body = build_body(messages);
    let url = format!("{}?alt=sse", endpoint(config, true));
    let resp = tokio::select! {
        _ = cancel.cancelled() => return Err("请求已取消".into()),
        r = client.post(&url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", &config.api_key)
            .json(&body).send()
            => r.map_err(|e| format!("Gemini 流式请求失败: {}", e))?
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini 流式请求失败: {} | {}", status, raw.chars().take(300).collect::<String>()));
    }
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut accumulated = String::new();
    while let Some(chunk_result) = tokio::select! {
        _ = cancel.cancelled() => None,
        c = stream.next() => c
    } {
        let bytes = chunk_result.map_err(|e| format!("流式读取失败: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        loop {
            let line_end = match buffer.find('\n') { Some(i) => i, None => break };
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();
            if !line.starts_with("data:") { continue; }
            let payload = line.trim_start_matches("data:").trim();
            if payload.is_empty() { continue; }
            let parsed: Value = match serde_json::from_str(payload) { Ok(v) => v, Err(_) => continue };
            let text = extract_text(&parsed);
            if !text.is_empty() {
                accumulated.push_str(&text);
                if let Some(ev) = config.stream_event.as_deref() {
                    let _ = app.emit(ev, serde_json::json!({"requestId": config.stream_request_id.clone(), "text": text.clone()}));
                }
                let _ = app.emit("ai:stream-chunk", StreamChunk { text, done: false, session_id: session_id.clone(), phase: None });
            }
        }
    }
    if cancel.is_cancelled() { return Err("请求已取消".into()); }
    let _ = app.emit("ai:stream-chunk", StreamChunk { text: String::new(), done: true, session_id, phase: None });
    Ok(ChatResponse { text: accumulated, duration_ms: started.elapsed().as_millis() as u64, provider: config.provider.clone(), model: config.model.clone(), usage: None, tool_calls: None })
}

fn extract_text(data: &Value) -> String {
    if let Some(candidates) = data.get("candidates").and_then(|v| v.as_array()) {
        let mut out = String::new();
        for c in candidates {
            if let Some(parts) = c.get("content").and_then(|c| c.get("parts")).and_then(|v| v.as_array()) {
                for p in parts {
                    if let Some(t) = p.get("text").and_then(|v| v.as_str()) { out.push_str(t); }
                }
            }
        }
        return out;
    }
    String::new()
}

pub async fn validate(config: &AiConfig) -> Result<bool, String> {
    let base = config.base_url.trim_end_matches('/');
    let url = format!("{}/v1beta/models?key={}", base, config.api_key);
    let client = crate::ai::build_client_with_system_proxy(Duration::from_secs(8));
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    Ok(resp.status().is_success())
}

pub async fn get_models(config: &AiConfig) -> Result<Vec<String>, String> {
    let base = config.base_url.trim_end_matches('/');
    let url = format!("{}/v1beta/models?key={}", base, config.api_key);
    let client = crate::ai::build_client_with_system_proxy(Duration::from_secs(8));
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("HTTP {}", resp.status())); }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    if let Some(arr) = data.get("models").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                models.push(name.strip_prefix("models/").unwrap_or(name).to_string());
            }
        }
    }
    Ok(models)
}
