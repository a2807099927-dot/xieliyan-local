// 多窗口共享状态：跨命令传递最近一次的"开窗参数"和挂起的桥接请求
use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::oneshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWindowState {
    pub book_id: String,
    pub chapter_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContinuationState {
    pub source: String,
    pub book_id: String,
    pub chapter_id: String,
    #[serde(default)]
    pub insert_from: Option<i64>,
    pub title: String,
    #[serde(default)]
    pub elapsed_ms: f64,
    #[serde(default)]
    pub paragraphs: Vec<String>,
    #[serde(default)]
    pub selected: Vec<i64>,
    #[serde(default)]
    pub editing_index: Option<i64>,
    #[serde(default)]
    pub retry_request: Option<Value>,
}

#[derive(Default)]
pub struct WindowsState {
    pub agent_window: Mutex<Option<AgentWindowState>>,
    pub continuation_state: Mutex<Option<ContinuationState>>,
    pub pending_agent_bridges: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
}

impl WindowsState {
    pub fn new() -> Self {
        Self::default()
    }
}

// 内部常量统一放这里
pub(super) const AGENT_WINDOW_LABEL: &str = "agent-window";
pub(super) const CONTINUATION_WINDOW_LABEL: &str = "continuation-window";
pub(super) const NOVEL_LAB_WINDOW_LABEL: &str = "novel-lab-window";
pub(super) const OUTLINE_WINDOW_LABEL: &str = "outline-window";
pub(super) const AIWEB_WINDOW_LABEL: &str = "aiweb-window";
pub(super) const AGENT_WINDOW_STATE_FILE: &str = "agent-window-state.json";
pub(super) const CONTINUATION_WINDOW_STATE_FILE: &str = "continuation-window-state.json";
pub(super) const AIWEB_WINDOW_STATE_FILE: &str = "aiweb-window-state.json";
pub(super) const AGENT_BRIDGE_TIMEOUT_MS: u64 = 12_000;
