// Anthropic Claude Messages API
use crate::ai::types::{AiConfig, ChatMessage, ChatResponse, StreamChunk, ToolDef};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

fn build_body(messages: &[ChatMessage], config: &AiConfig, stream: bool) -> Value {
    let system: Vec<&str> = messages.iter()
        .filter(|m| m.role == "system")
        .filter_map(|m| m.content.as_deref())
        .collect();
    let chat: Vec<Value> = messages.iter()
        .filter(|m| m.role != "system")
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    let mut body = json!({
        "model": config.model,
        "max_tokens": config.max_tokens.unwrap_or(4096),
        "messages": chat,
        "stream": stream,
    });
    if !system.is_empty() {
        body["system"] = json!(system.join("\n\n"));
    }
    body
}

fn endpoint(config: &AiConfig) -> String {
    let base = config.base_url.trim_end_matches('/');
    format!("{}/v1/messages", base)
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
    let body = build_body(messages, config, false);
    let resp = tokio::select! {
        _ = cancel.cancelled() => return Err("请求已取消".into()),
        r = client
            .post(&endpoint(config))
            .header("Content-Type", "application/json")
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send() => r.map_err(|e| format!("Anthropic 请求失败: {}", e))?
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic 请求失败: {} | {}", status, raw.chars().take(300).collect::<String>()));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = extract_text(&data);
    Ok(ChatResponse {
        text,
        duration_ms: started.elapsed().as_millis() as u64,
        provider: config.provider.clone(),
        model: config.model.clone(),
        usage: None,
        tool_calls: None,
    })
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
    let body = build_body(messages, config, true);
    let resp = tokio::select! {
        _ = cancel.cancelled() => return Err("请求已取消".into()),
        r = client
            .post(&endpoint(config))
            .header("Content-Type", "application/json")
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send() => r.map_err(|e| format!("Anthropic 流式请求失败: {}", e))?
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic 流式请求失败: {} | {}", status, raw.chars().take(300).collect::<String>()));
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
            if parsed.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
                if let Some(text) = parsed.get("delta").and_then(|d| d.get("text")).and_then(|v| v.as_str()) {
                    if !text.is_empty() {
                        accumulated.push_str(text);
                        if let Some(ev) = config.stream_event.as_deref() {
                            let _ = app.emit(ev, serde_json::json!({"requestId": config.stream_request_id.clone(), "text": text}));
                        }
                        let _ = app.emit("ai:stream-chunk", StreamChunk { text: text.to_string(), done: false, session_id: session_id.clone(), phase: None });
                    }
                }
            }
        }
    }
    if cancel.is_cancelled() { return Err("请求已取消".into()); }
    let _ = app.emit("ai:stream-chunk", StreamChunk { text: String::new(), done: true, session_id, phase: None });
    Ok(ChatResponse {
        text: accumulated,
        duration_ms: started.elapsed().as_millis() as u64,
        provider: config.provider.clone(),
        model: config.model.clone(),
        usage: None,
        tool_calls: None,
    })
}

fn extract_text(data: &Value) -> String {
    if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
        let mut out = String::new();
        for item in content {
            if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                if let Some(t) = item.get("text").and_then(|v| v.as_str()) { out.push_str(t); }
            }
        }
        return out;
    }
    String::new()
}

pub async fn validate(config: &AiConfig) -> Result<bool, String> {
    let messages = vec![ChatMessage { role: "user".into(), content: Some("ping".to_string()), tool_calls: None, tool_call_id: None }];
    let mut min_config = config.clone();
    min_config.max_tokens = Some(1);
    let cancel = CancellationToken::new();
    chat(&min_config, &messages, &None, &None, cancel).await.map(|_| true)
}

pub async fn get_models(_config: &AiConfig) -> Result<Vec<String>, String> {
    Ok(vec!["claude-sonnet-4-5".into(), "claude-opus-4-1".into(), "claude-3-5-sonnet-latest".into()])
}
