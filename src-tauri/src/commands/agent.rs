// Agent 任务准备 — 对应 electron/ipc/agent.ts
// Tauri 版策略：
//   - dev 模式：前端直接调 prepareAgentTask（已经是默认 fallback），后端命令实际不会被触发
//   - 生产模式：暂未把 runtime.dat 迁移到 Tauri bundle，后端返回 ok:false，前端的"使用本地 Agent 包"开关可绕过
// 后续真正打包时再添加 runtime.dat 解密逻辑

use serde_json::{json, Value};

#[tauri::command]
pub async fn agent_prepare_task(_task_sheet: Value) -> Result<Value, String> {
    Ok(json!({
        "ok": false,
        "error": "Agent 资源包未在 Tauri 版打包，请在设置中开启『使用本地 Agent 包』。"
    }))
}

#[tauri::command]
pub async fn agent_status() -> Result<Value, String> {
    Ok(json!({
        "ready": false,
        "reason": "agent pack not bundled in tauri version",
    }))
}
