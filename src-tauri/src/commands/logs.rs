// 日志相关 commands — 对应主项目 electron/ipc/system.ts 的 LOGS_GET_INFO / LOGS_OPEN_FOLDER / LOGS_GET_CONTENT
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::logger;

#[tauri::command]
pub async fn logs_get_info() -> Result<Value, String> {
    let dir = logger::log_dir_path();
    let files = logger::list_log_files();
    Ok(json!({
        "logDir": dir.to_string_lossy(),
        "files": files,
    }))
}

#[tauri::command]
pub async fn logs_open_folder(app: AppHandle) -> Result<bool, String> {
    let dir = logger::log_dir_path();
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn logs_get_content(filename: String) -> Result<Value, String> {
    let content = logger::read_log_content(&filename)?;
    Ok(json!({ "content": content }))
}

/// 前端主动上报错误（比如 React ErrorBoundary 捕获到的运行时异常）
#[tauri::command]
pub async fn logs_report_error(source: String, message: String) -> Result<bool, String> {
    crate::logger::error(format!("[frontend:{}] {}", source, message));
    Ok(true)
}
