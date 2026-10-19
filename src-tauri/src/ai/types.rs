// AI 数据结构 — 对应 src/types/ai.ts
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub tool_type: String, // "function"
    pub function: FunctionDef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type", default = "default_tool_type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

fn default_tool_type() -> String { "function".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String, // JSON string from the model
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // 'system' | 'user' | 'assistant' | 'tool'
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "tool_calls")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "tool_call_id")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDef>>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "tool_choice")]
    pub tool_choice: Option<String>,
    #[serde(rename = "bookId")]
    pub book_id: Option<String>,
    #[serde(rename = "chapterId")]
    pub chapter_id: Option<String>,
    #[serde(rename = "disableRag", default)]
    pub disable_rag: bool,
    #[serde(rename = "disableStyle", default)]
    pub disable_style: bool,
    #[serde(rename = "maxTokens")]
    pub max_tokens: Option<u32>,
    #[serde(rename = "shuangwenMode", default)]
    pub shuangwen_mode: bool,
    #[serde(rename = "senderId", default)]
    pub sender_id: Option<String>,
    /// 流式会话唯一标识：chunk 事件会原样回填到 StreamChunk.session_id，
    /// 前端据此过滤，避免多个并发流式请求互相串扰。
    #[serde(rename = "sessionId", default)]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatResponse {
    pub text: String,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub provider: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "tool_calls")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenUsage {
    #[serde(rename = "totalTokens", skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u32>,
    #[serde(rename = "promptTokens", skip_serializing_if = "Option::is_none")]
    pub prompt_tokens: Option<u32>,
    #[serde(rename = "completionTokens", skip_serializing_if = "Option::is_none")]
    pub completion_tokens: Option<u32>,
    #[serde(rename = "estimatedCost", skip_serializing_if = "Option::is_none")]
    pub estimated_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamChunk {
    pub text: String,
    pub done: bool,
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
}

/// AI 配置（从前端 config 传入）
#[derive(Debug, Clone, Deserialize)]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    #[serde(rename = "apiKey", default)]
    pub api_key: String,
    #[serde(rename = "baseUrl", default)]
    pub base_url: String,
    #[serde(rename = "apiPath", default)]
    pub api_path: String,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: Option<u32>,
    #[serde(rename = "requestTimeoutMs")]
    pub request_timeout_ms: Option<u64>,
    #[serde(default)]
    pub stream_event: Option<String>,
    #[serde(default)]
    pub stream_request_id: Option<String>,
}
