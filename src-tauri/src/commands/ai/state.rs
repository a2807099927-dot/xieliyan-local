// 全局 AI 请求 abort 控制（防重入 + 中断）
use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub struct AiAbortState(pub Mutex<HashMap<String, CancellationToken>>);

impl AiAbortState {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

pub(super) const SENDER_KEY: &str = "main";
