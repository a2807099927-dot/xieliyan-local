// novelLabSavePath / lastNovelLabPath 在 config.json 中的读写
use serde_json::{json, Value};
use tauri::AppHandle;

#[tauri::command]
pub async fn config_set_novel_lab_path(
    app: AppHandle,
    save_path: Option<String>,
    last_book_path: Option<String>,
) -> Result<Value, String> {
    let cfg_response = crate::commands::config::config_load(app.clone()).await?;
    let mut cfg = cfg_response
        .get("config")
        .cloned()
        .ok_or_else(|| "config 加载失败".to_string())?;

    let workspace = cfg
        .get_mut("workspace")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| "workspace 字段缺失".to_string())?;

    if let Some(p) = save_path {
        workspace.insert("novelLabSavePath".to_string(), Value::String(p));
    }
    if let Some(p) = last_book_path {
        workspace.insert("lastNovelLabPath".to_string(), Value::String(p));
    }

    crate::commands::config::config_save(app, cfg).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn config_get_novel_lab_path(app: AppHandle) -> Result<Value, String> {
    let cfg_response = crate::commands::config::config_load(app).await?;
    let workspace = cfg_response
        .get("config")
        .and_then(|c| c.get("workspace"));
    let save_path = workspace
        .and_then(|w| w.get("novelLabSavePath"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let last_book_path = workspace
        .and_then(|w| w.get("lastNovelLabPath"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(json!({
        "savePath": save_path,
        "lastBookPath": last_book_path,
    }))
}
