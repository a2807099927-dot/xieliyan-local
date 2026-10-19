// 嵌入式 webview 共享状态
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
pub struct EmbeddedState {
    /// 已创建的子 webview 标签集合（key = 业务标签如 "novel-browser"）
    pub active_labels: Mutex<HashMap<String, ChildInfo>>,
}

impl EmbeddedState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ChildInfo {
    /// child webview 的 label
    pub child_label: String,
    /// 父窗口 label
    pub parent_window: String,
}
