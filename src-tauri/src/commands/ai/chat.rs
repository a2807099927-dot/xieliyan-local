// ai_chat / ai_abort — 聊天调用入口 + 中断
use crate::ai::manager;
use crate::ai::types::{AiConfig, ChatMessage, ChatRequest, ChatResponse};
use serde_json::Value;
use tauri::{AppHandle, State};
use tokio_util::sync::CancellationToken;

use super::logs;
use super::state::{AiAbortState, SENDER_KEY};

/// 从 config.ai 字段构建 AiConfig
fn build_ai_config(config_json: &Value, max_tokens: Option<u32>) -> Result<AiConfig, String> {
    let ai = config_json
        .get("ai")
        .ok_or_else(|| "config \u{7f3a}\u{5c11} ai \u{5b57}\u{6bb5}".to_string())?;
    let mut cfg: AiConfig = serde_json::from_value(ai.clone())
        .map_err(|e| format!("ai \u{914d}\u{7f6e}\u{89e3}\u{6790}\u{5931}\u{8d25}: {}", e))?;
    if let Some(mt) = max_tokens {
        cfg.max_tokens = Some(mt);
    }
    Ok(cfg)
}


/// 发起 AI 请求（流式 / 非流式）
#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    state: State<'_, AiAbortState>,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    let config_load_result = crate::commands::config::config_load(app.clone()).await?;
    let config = config_load_result
        .get("config")
        .cloned()
        .ok_or("config \u{52a0}\u{8f7d}\u{5931}\u{8d25}")?;
    let ai_config = build_ai_config(&config, request.max_tokens)?;

    if ai_config.api_key.is_empty() {
        // 之前这里只是 return Err，AI 日志面板看不到任何条目，用户体验是"日志空白"。
        // 现在主动 push 一条 error 进环形缓冲区。
        logs::record_error(
            &ai_config.provider,
            &ai_config.model,
            "API Key 未配置（请在设置→AI 模型接入填写）",
        );
        return Err("API Key 未配置".into());
    }

    // 防重入：仅在前一请求仍存活时才阻塞
    let sender_key = request.sender_id.as_deref().unwrap_or(SENDER_KEY).to_string();
    {
        let mut map = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(existing) = map.get(&sender_key) {
            if !existing.is_cancelled() {
                logs::record_error(
                    &ai_config.provider,
                    &ai_config.model,
                    "REQUEST_IN_PROGRESS（前一个请求还没结束，已拒绝新请求）",
                );
                return Err("REQUEST_IN_PROGRESS".into());
            }
            map.remove(&sender_key);
        }
    }

    let cancel = CancellationToken::new();
    {
        let mut map = state.0.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(sender_key.clone(), cancel.clone());
    }

    let messages: Vec<ChatMessage> = request.messages;
    let tools = request.tools;
    let tool_choice = request.tool_choice;
    let session_id = request.session_id;

    let result = if request.stream {
        manager::chat_stream(&app, &ai_config, &messages, &tools, &tool_choice, session_id, cancel.clone()).await
    } else {
        manager::chat(&ai_config, &messages, &tools, &tool_choice, cancel.clone()).await
    };

    {
        let mut map = state.0.lock().unwrap_or_else(|e| e.into_inner());
        map.remove(&sender_key);
    }

    // 只记录错误，不暴露提示词和请求/响应内容
    if let Err(e) = &result {
        if cancel.is_cancelled() {
            logs::record_error(&ai_config.provider, &ai_config.model, "REQUEST_ABORTED");
        } else {
            logs::record_error(&ai_config.provider, &ai_config.model, e.clone());
            crate::logger::error(format!(
                "[ai_chat] provider={} model={} err={}",
                ai_config.provider, ai_config.model, e
            ));
        }
    }

    result
}

#[tauri::command]
pub async fn ai_abort(
    state: State<'_, AiAbortState>,
    sender_id: Option<String>,
) -> Result<bool, String> {
    let map = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let mut any = false;
    match sender_id {
        // 指定 sender：只取消这一个（工坊中止 / 某面板卸载仅清自己的请求）
        Some(id) => {
            if let Some(cancel) = map.get(&id) {
                if !cancel.is_cancelled() {
                    cancel.cancel();
                    any = true;
                }
            }
        }
        // 未指定：取消全部（向后兼容；仅用于「全局停止」语义）
        None => {
            for cancel in map.values() {
                if !cancel.is_cancelled() {
                    cancel.cancel();
                    any = true;
                }
            }
        }
    }
    let _ = SENDER_KEY;
    Ok(any || map.is_empty())
}
