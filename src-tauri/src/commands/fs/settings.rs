// 旧版 settings.json — workspace/settings.json
// 主项目用 SCHEMA_VERSION 包了一层 envelope；新代码读到 envelope 自动剥壳，没有 envelope 也兼容
use serde_json::{json, Value};
use std::fs;
use tauri::AppHandle;

use crate::workspace::get_workspace_path;

const SETTINGS_FILE: &str = "settings.json";
const SCHEMA_VERSION: u32 = 1;

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Value, String> {
    let path = get_workspace_path(&app).join(SETTINGS_FILE);
    if !path.exists() {
        return Ok(json!({ "settings": {} }));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Ok(json!({ "settings": {} })),
    };

    // envelope 形态：{ schemaVersion, settings }
    if parsed.get("schemaVersion").is_some() {
        if let Some(settings) = parsed.get("settings") {
            return Ok(json!({ "settings": settings.clone() }));
        }
    }

    Ok(json!({ "settings": parsed }))
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: Value) -> Result<bool, String> {
    let workspace = get_workspace_path(&app);
    fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    let path = workspace.join(SETTINGS_FILE);

    let payload = json!({
        "schemaVersion": SCHEMA_VERSION,
        "settings": settings,
    });
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    // 原子写：先写临时文件再 rename，避免写入中断时把 settings.json 写坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    match fs::rename(&tmp, &path) {
        Ok(_) => Ok(true),
        Err(_) => {
            // Windows rename 不覆盖已存在目标：先删旧文件再换名
            let _ = fs::remove_file(&path);
            fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}
