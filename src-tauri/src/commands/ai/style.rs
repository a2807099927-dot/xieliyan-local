// 风格 prompt — 主项目可对预设进行扩展，Tauri 阶段先返回原文
#[tauri::command]
pub async fn ai_get_style_prompt(style_instruction: Option<String>) -> Result<String, String> {
    Ok(style_instruction.unwrap_or_default())
}
