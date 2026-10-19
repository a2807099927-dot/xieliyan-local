// AI 调用路由层 — 根据 provider 分发到 adapter
use crate::ai::adapters::{anthropic, gemini, openai};
use crate::ai::types::{AiConfig, ChatMessage, ChatResponse, ToolDef};
use tokio_util::sync::CancellationToken;

pub async fn chat(
    config: &AiConfig,
    messages: &[ChatMessage],
    tools: &Option<Vec<ToolDef>>,
    tool_choice: &Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    match config.provider.as_str() {
        "anthropic" => anthropic::chat(config, messages, tools, tool_choice, cancel).await,
        "gemini" => gemini::chat(config, messages, tools, tool_choice, cancel).await,
        _ => openai::chat(config, messages, tools, tool_choice, cancel).await,
    }
}

pub async fn chat_stream(
    app: &tauri::AppHandle,
    config: &AiConfig,
    messages: &[ChatMessage],
    tools: &Option<Vec<ToolDef>>,
    tool_choice: &Option<String>,
    session_id: Option<String>,
    cancel: CancellationToken,
) -> Result<ChatResponse, String> {
    match config.provider.as_str() {
        "anthropic" => anthropic::chat_stream(app, config, messages, tools, tool_choice, session_id, cancel).await,
        "gemini" => gemini::chat_stream(app, config, messages, tools, tool_choice, session_id, cancel).await,
        _ => openai::chat_stream(app, config, messages, tools, tool_choice, session_id, cancel).await,
    }
}

pub async fn validate(config: &AiConfig) -> Result<bool, String> {
    match config.provider.as_str() {
        "anthropic" => anthropic::validate(config).await,
        "gemini" => gemini::validate(config).await,
        _ => openai::validate(config).await,
    }
}

pub async fn get_models(config: &AiConfig) -> Result<Vec<String>, String> {
    match config.provider.as_str() {
        "anthropic" => anthropic::get_models(config).await,
        "gemini" => gemini::get_models(config).await,
        _ => openai::get_models(config).await,
    }
}
