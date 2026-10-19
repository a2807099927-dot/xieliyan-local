// AI 调用日志 — 内存环形缓冲区，最多保存 100 条
//
// 设计原则：
//   - 仅记录当前会话（重启后清空），跟前端 UI "Session Diagnostics" 描述一致
//   - request / response / error 三类条目，分别由 chat 入口处主动 push
//   - 不做磁盘持久化（错误另外通过 logger.rs 写日志文件）
//   - Mutex 中毒走 .into_inner() 容错，跟项目里其它锁规范一致

use serde::Serialize;
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use uuid::Uuid;

const MAX_LOGS: usize = 100;

#[derive(Debug, Clone, Serialize)]
pub struct AiLogEntry {
    pub id: String,
    pub timestamp: String,
    /// "request" | "response" | "error"
    #[serde(rename = "type")]
    pub kind: String,
    /// 字符串或 JSON 对象都行，前端会自动 JSON.parse
    pub content: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

static AI_LOG_BUFFER: OnceLock<Mutex<VecDeque<AiLogEntry>>> = OnceLock::new();

fn buffer() -> &'static Mutex<VecDeque<AiLogEntry>> {
    AI_LOG_BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOGS)))
}

fn push(entry: AiLogEntry) {
    let mut buf = buffer().lock().unwrap_or_else(|e| e.into_inner());
    if buf.len() >= MAX_LOGS {
        buf.pop_front();
    }
    buf.push_back(entry);
}

fn now_iso() -> String {
    chrono::Local::now().to_rfc3339()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// 记录一次"调用错误"（包括 REQUEST_IN_PROGRESS、API Key 未配置、HTTP 失败等）
pub fn record_error(provider: &str, model: &str, message: impl Into<String>) {
    push(AiLogEntry {
        id: new_id(),
        timestamp: now_iso(),
        kind: "error".into(),
        content: Value::String(message.into()),
        provider: Some(provider.to_string()),
        model: Some(model.to_string()),
    });
}

#[tauri::command]
pub async fn ai_get_logs() -> Result<Vec<AiLogEntry>, String> {
    let buf = buffer().lock().unwrap_or_else(|e| e.into_inner());
    Ok(buf.iter().cloned().collect())
}

#[tauri::command]
pub async fn ai_clear_logs() -> Result<bool, String> {
    let mut buf = buffer().lock().unwrap_or_else(|e| e.into_inner());
    buf.clear();
    Ok(true)
}
