// AI 配置验证 — POST 一个最小请求看 Key 是否有效
use crate::ai::manager;
use crate::ai::types::AiConfig;
use serde_json::Value;

#[tauri::command]
pub async fn ai_validate(config: Value) -> Result<Value, String> {
    let ai_payload = config.get("ai").or(Some(&config)).cloned().unwrap_or(config);
    let ai_config: AiConfig = serde_json::from_value(ai_payload)
        .map_err(|e| format!("config 解析失败: {}", e))?;
    match manager::validate(&ai_config).await {
        Ok(true) => Ok(serde_json::json!({ "valid": true })),
        Ok(false) => Ok(serde_json::json!({ "valid": false, "error": "验证未通过" })),
        Err(e) => Ok(serde_json::json!({ "valid": false, "error": e })),
    }
}
