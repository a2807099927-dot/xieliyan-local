// OpenAI 兼容 adapter — OpenAI / DeepSeek / Grok / proxy / local 共用
use crate::ai::types::{AiConfig, ChatMessage, ChatResponse, StreamChunk, TokenUsage};
use futures_util::StreamExt;

use serde_json::{json, Value};
use std::error::Error as StdError;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

fn normalize_endpoint(config: &AiConfig) -> String {
    let base = config.base_url.trim_end_matches('/');
    let mut path = config.api_path.clone();
    if path.is_empty() {
        path = "/chat/completions".to_string();
    }
    if !path.starts_with('/') {
        path = format!("/{}", path);
    }

    let base_has_v1 = base.to_ascii_lowercase().ends_with("/v1");

    // base 末尾如果是 /v1，path 前缀 /v1 要去掉，避免 /v1/v1
    if base_has_v1 && (path.starts_with("/v1/") || path == "/v1") {
        path = path.strip_prefix("/v1").unwrap_or(&path).to_string();
        if path.is_empty() { path = "/".to_string(); }
    }

    // base 不带 /v1 且 path 是 /chat/completions 时自动补 /v1
    // （用户漏写或配置迁移丢失 /v1 的兜底）
    if !base_has_v1 && path == "/chat/completions" {
        path = "/v1/chat/completions".to_string();
    }

    format!("{}{}", base, path)
}

/// 判断是否走 Anthropic 原生 /messages 端点（OpenAI 兼容 adapter 的 fallback）
fn is_anthropic_endpoint(config: &AiConfig) -> bool {
    config.api_path.trim_end_matches('/').ends_with("/messages")
}

fn build_body(messages: &[ChatMessage], config: &AiConfig, stream: bool, tools: &Option<Vec<crate::ai::types::ToolDef>>, tool_choice: &Option<String>) -> Value {
    let temperature = config.temperature.unwrap_or(0.7);

    // Anthropic 原生 /messages 端点：system 单独提取
    if is_anthropic_endpoint(config) {
        let system_messages: Vec<&str> = messages.iter()
            .filter(|m| m.role == "system")
            .filter_map(|m| m.content.as_deref())
            .collect();
        let chat_messages: Vec<&ChatMessage> = messages.iter()
            .filter(|m| m.role != "system")
            .collect();
        let mut body = json!({
            "model": config.model,
            "messages": chat_messages,
            "stream": stream,
        });
        if let Some(max) = config.max_tokens {
            body["max_tokens"] = json!(max);
        }
        if !system_messages.is_empty() {
            body["system"] = json!(system_messages.join("\n\n"));
        }
        return body;
    }

    // 标准 OpenAI 兼容
    let mut body = json!({
        "model": config.model,
        "temperature": temperature,
        "messages": messages,
        "stream": stream,
    });
    if let Some(max) = config.max_tokens {
        body["max_tokens"] = json!(max);
    }
    if let Some(ref t) = tools {
        if !t.is_empty() {
            body["tools"] = serde_json::to_value(t).unwrap_or(json!([]));
            body["tool_choice"] = json!(tool_choice.as_deref().unwrap_or("auto"));
        }
    }
    body
}

/// 非流式调用
pub async fn chat(
    config: &AiConfig,
    messages: &[ChatMessage],
    tools: &Option<Vec<crate::ai::types::ToolDef>>,
    tool_choice: &Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    let started = Instant::now();
    let endpoint = normalize_endpoint(config);
    let timeout_ms = config.request_timeout_ms.unwrap_or(300_000);

    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(timeout_ms));

    let body = build_body(messages, config, false, tools, tool_choice);
    let body_size = serde_json::to_string(&body).map(|s| s.len()).unwrap_or(0);

    let mut req = client
        .post(&endpoint)
        .json(&body);
    // Anthropic 端点用 x-api-key + anthropic-version
    if is_anthropic_endpoint(config) {
        req = req.header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01");
    } else {
        req = req.bearer_auth(&config.api_key);
    }

    let resp = tokio::select! {
        _ = cancel.cancelled() => { return Err("请求已取消".into()); }
        r = req.send() => r.map_err(|e| {
            let mut detail = format!("AI 请求失败: {}", e);
            if e.is_timeout() { detail.push_str(" [原因: 请求超时]"); }
            if e.is_connect() { detail.push_str(" [原因: 连接失败]"); }
            // 遍历错误链，找到底层真实原因
            let mut source: Option<&dyn StdError> = e.source();
            while let Some(cause) = source {
                detail.push_str(&format!(" | caused by: {}", cause));
                source = cause.source();
            }
            detail.push_str(&format!(" | body_size={} timeout={}ms", body_size, timeout_ms));
            detail
        })?
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!(
            "AI 请求失败: {} | endpoint={} | body={}",
            status,
            endpoint,
            raw.chars().take(400).collect::<String>()
        ));
    }

    let raw_text = match resp.bytes().await {
        Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
        Err(e) => {
            return Err(format!("读取 AI 响应正文失败 (bytes): {}", e));
        }
    };

    // 检测中转站返回 HTML 页面（常见于地址配错、Key 失效、网关拦截）
    let trimmed_start = raw_text.trim_start();
    if trimmed_start.starts_with("<!") || trimmed_start.starts_with("<html") || trimmed_start.starts_with("<HTML") {
        return Err(format!(
            "AI 接口返回了 HTML 页面而非 JSON，通常原因：\n\
            1. Base URL 地址配错（指向了中转站首页而非 API 端点）\n\
            2. API Key 无效或过期\n\
            3. 中转站网关拦截\n\n\
            请检查设置中的 Base URL 是否正确（应以 /v1 结尾）。\n\
            当前请求地址：{}", endpoint
        ));
    }

    let data: Value = serde_json::from_str(&raw_text).map_err(|e| {
        format!(
            "AI 响应解析失败: {} | 原始正文前 400 字为: {}",
            e,
            raw_text.chars().take(400).collect::<String>()
        )
    })?;
    let text = extract_completion_text(&data);
    let first_choice = data.get("choices").and_then(|c| c.as_array()).and_then(|arr| arr.first());
    let has_tool_calls = first_choice
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("tool_calls"))
        .is_some();
    if text.trim().is_empty() && !has_tool_calls {
        return Err(format!("AI 返回为空 | 原始正文为: {}", raw_text.chars().take(400).collect::<String>()));
    }
    let tool_calls: Option<Vec<crate::ai::types::ToolCall>> = first_choice
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("tool_calls"))
        .and_then(|tc| serde_json::from_value(tc.clone()).ok());

    let usage = data.get("usage").map(|u| {
        let prompt = u.get("prompt_tokens").and_then(|v| v.as_u64()).map(|n| n as u32);
        let completion = u.get("completion_tokens").and_then(|v| v.as_u64()).map(|n| n as u32);
        let total = u.get("total_tokens").and_then(|v| v.as_u64()).map(|n| n as u32)
            .or_else(|| match (prompt, completion) {
                (Some(p), Some(c)) => Some(p + c),
                (Some(p), None) => Some(p),
                (None, Some(c)) => Some(c),
                _ => None,
            });
        TokenUsage { total_tokens: total, prompt_tokens: prompt, completion_tokens: completion, estimated_cost: None }
    });

    Ok(ChatResponse {
        text,
        duration_ms: started.elapsed().as_millis() as u64,
        provider: config.provider.clone(),
        model: config.model.clone(),
        usage,
        tool_calls,
    })
}

/// 流式调用 — chunk 通过 Tauri event emit
pub async fn chat_stream(
    app: &tauri::AppHandle,
    config: &AiConfig,
    messages: &[ChatMessage],
    tools: &Option<Vec<crate::ai::types::ToolDef>>,
    tool_choice: &Option<String>,
    session_id: Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    // 带 tools 时退化为非流式，保证 tool_calls 能被正确解析
    if tools.as_ref().map_or(false, |t| !t.is_empty()) {
        return chat(config, messages, tools, tool_choice, cancel).await;
    }

    let started = Instant::now();
    let endpoint = normalize_endpoint(config);
    let timeout_ms = config.request_timeout_ms.unwrap_or(60_000);

    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(timeout_ms));

    let body = build_body(messages, config, true, tools, tool_choice);

    let mut req = client
        .post(&endpoint)
        .json(&body);
    if is_anthropic_endpoint(config) {
        req = req.header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01");
    } else {
        req = req.bearer_auth(&config.api_key);
    }

    let resp = tokio::select! {
        _ = cancel.cancelled() => { return Err("请求已取消".into()); }
        r = req.send() => r.map_err(|e| {
            let mut detail = format!("AI 流式请求失败: {}", e);
            if e.is_timeout() { detail.push_str(" [原因: 请求超时]"); }
            if e.is_connect() { detail.push_str(" [原因: 连接失败]"); }
            let mut source: Option<&dyn StdError> = e.source();
            while let Some(cause) = source {
                detail.push_str(&format!(" | caused by: {}", cause));
                source = cause.source();
            }
            detail
        })?
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let raw = resp.text().await.unwrap_or_default();
        return Err(format!(
            "AI 流式请求失败: {} | endpoint={} | body={}",
            status,
            endpoint,
            raw.chars().take(400).collect::<String>()
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut accumulated = String::new();

    while let Some(chunk_result) = tokio::select! {
        _ = cancel.cancelled() => None,
        c = stream.next() => c
    } {
        let bytes = match chunk_result {
            Ok(b) => b,
            Err(e) => {
                // 流式读取错误：如果已有累积内容，视为部分成功；否则报错
                if !accumulated.is_empty() {
                    break;
                }
                return Err(format!("流式读取失败: {}", e));
            }
        };
        let s = String::from_utf8_lossy(&bytes);
        buffer.push_str(&s);

        // 按 SSE 分行解析
        loop {
            let line_end = match buffer.find('\n') {
                Some(i) => i,
                None => break,
            };
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if !line.starts_with("data:") {
                continue;
            }
            let payload = line.trim_start_matches("data:").trim().to_string();
            if payload == "[DONE]" {
                continue;
            }

            let parsed: Value = match serde_json::from_str(&payload) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let delta_text = extract_delta_text(&parsed);
            if !delta_text.is_empty() {
                accumulated.push_str(&delta_text);
                if let Some(ev) = config.stream_event.as_deref() {
                    let _ = app.emit(ev, serde_json::json!({
                        "requestId": config.stream_request_id.clone(),
                        "text": delta_text.clone()
                    }));
                }
                let _ = app.emit("ai:stream-chunk", StreamChunk {
                    text: delta_text,
                    done: false,
                    session_id: session_id.clone(),
                    phase: None,
                });
            }
        }
    }

    if cancel.is_cancelled() {
        return Err("请求已取消".into());
    }

    // 最终 done 事件
    let _ = app.emit("ai:stream-chunk", StreamChunk {
        text: String::new(),
        done: true,
        session_id,
        phase: None,
    });

    Ok(ChatResponse {
        text: accumulated,
        duration_ms: started.elapsed().as_millis() as u64,
        provider: config.provider.clone(),
        model: config.model.clone(),
        usage: None,
        tool_calls: None,
    })
}

fn extract_completion_text(data: &Value) -> String {
    if let Some(choices) = data.get("choices").and_then(|v| v.as_array()) {
        if let Some(first) = choices.first() {
            // 兼容推理模型（DeepSeek-R1 / 某些代理）会同时给 reasoning_content + content；
            // 优先取 content，content 为空时退回 reasoning_content
            let content_text = first
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !content_text.is_empty() {
                return content_text.to_string();
            }
            let reasoning_text = first
                .get("message")
                .and_then(|m| m.get("reasoning_content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !reasoning_text.is_empty() {
                // 推理模型只给思考、无正文时：包成 <think> 标签返回，前端可剥离，避免思考直接当正文
                return format!("<think>{}</think>", reasoning_text);
            }
            if let Some(t) = first.get("text").and_then(|v| v.as_str()) {
                return t.to_string();
            }
        }
    }
    if let Some(t) = data.get("output_text").and_then(|v| v.as_str()) {
        return t.to_string();
    }
    // Anthropic Messages API 非流式：{ content: [{ type: 'text', text: '...' }] }
    if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
        let mut out = String::new();
        for item in content {
            if item.get("type").and_then(|v| v.as_str()) == Some("text") {
                if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                    out.push_str(t);
                }
            }
        }
        if !out.is_empty() { return out; }
    }
    String::new()
}

fn extract_delta_text(data: &Value) -> String {
    if let Some(choices) = data.get("choices").and_then(|v| v.as_array()) {
        if let Some(first) = choices.first() {
            // 推理模型流式：delta.content 通常先空、再来真正的回答；reasoning_content 是思考过程
            // 优先输出 content，content 为空时 fallback 到 reasoning_content（部分代理只给后者）
            if let Some(t) = first.get("delta").and_then(|d| d.get("content")).and_then(|v| v.as_str()) {
                if !t.is_empty() {
                    return t.to_string();
                }
            }
            if let Some(t) = first.get("delta").and_then(|d| d.get("reasoning_content")).and_then(|v| v.as_str()) {
                if !t.is_empty() {
                    // 推理模型只给思考、无正文时：包成 <think> 标签返回，前端可剥离，避免思考直接当正文
                    return format!("<think>{}</think>", t);
                }
            }
            if let Some(t) = first.get("text").and_then(|v| v.as_str()) {
                return t.to_string();
            }
        }
    }
    if let Some(t) = data.get("output_text_delta").and_then(|v| v.as_str()) {
        return t.to_string();
    }
    // Anthropic 端点流式格式：{ type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
    if data.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
        if let Some(t) = data.get("delta").and_then(|d| d.get("text")).and_then(|v| v.as_str()) {
            return t.to_string();
        }
    }
    String::new()
}

/// 验证 API Key 可用性
pub async fn validate(config: &AiConfig) -> Result<bool, String> {
    let base = config.base_url.trim().trim_end_matches('/');
    let candidates = if base.to_ascii_lowercase().ends_with("/v1") {
        vec![format!("{}/models", base), format!("{}/v1/models", base)]
    } else {
        vec![format!("{}/v1/models", base), format!("{}/models", base)]
    };

    let client = crate::ai::build_client_with_system_proxy(Duration::from_secs(8));

    let mut last_err = String::new();
    for endpoint in &candidates {
        match client
            .get(endpoint)
            .bearer_auth(&config.api_key)
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    return Ok(true);
                }
                if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                    return Ok(false);
                }
                last_err = format!("{}: HTTP {}", endpoint, status);
            }
            Err(e) => {
                last_err = format!("{}: {}", endpoint, e);
            }
        }
    }

    // 降级测试：使用 chat/completions 接口发送 ping
    let chat_endpoint = normalize_endpoint(config);
    let chat_body = build_body(
        &[ChatMessage { role: "user".to_string(), content: Some("ping".to_string()), tool_calls: None, tool_call_id: None }],
        config,
        false,
        &None,
        &None,
    );

    match client
        .post(&chat_endpoint)
        .bearer_auth(&config.api_key)
        .json(&chat_body)
        .send()
        .await
    {
        Ok(resp) => {
            if resp.status().is_success() {
                return Ok(true);
            }
        }
        Err(_) => {}
    }

    Err(format!("验证未通过。探测详情: {}", last_err))
}


/// 获取 provider 模型列表（GET /v1/models 或 /models）
/// 多端点回退：/v1/models → /models（部分中转站只支持其中一种）
pub async fn get_models(config: &AiConfig) -> Result<Vec<String>, String> {
    let base = config.base_url.trim().trim_end_matches('/');
    let candidates: Vec<String> = if base.to_ascii_lowercase().ends_with("/v1") {
        vec![format!("{}/models", base), format!("{}/v1/models", base)]
    } else {
        vec![format!("{}/v1/models", base), format!("{}/models", base)]
    };

    let client = crate::ai::build_client_with_system_proxy(Duration::from_secs(8));

    let mut last_err = String::new();
    for endpoint in &candidates {
        let resp = match client
            .get(endpoint)
            .bearer_auth(&config.api_key)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{}: {}", endpoint, e);
                continue;
            }
        };
        if !resp.status().is_success() {
            last_err = format!("{}: HTTP {}", endpoint, resp.status());
            continue;
        }
        let data: Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                last_err = format!("{}: parse {}", endpoint, e);
                continue;
            }
        };
        let mut models = Vec::new();
        if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                    models.push(id.to_string());
                }
            }
        } else if let Some(arr) = data.get("models").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(id) = item
                    .get("id")
                    .or_else(|| item.get("name"))
                    .and_then(|v| v.as_str())
                {
                    models.push(id.to_string());
                }
            }
        }
        if !models.is_empty() {
            return Ok(models);
        }
        // 200 但 data 为空：继续尝试下一个端点
        last_err = format!("{}: empty response", endpoint);
    }
    Err(last_err)
}
