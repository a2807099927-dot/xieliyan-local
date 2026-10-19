// 文件/文件夹选择对话框
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn select_folder(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let result = rx.recv().map_err(|e| e.to_string())?;
    Ok(result.and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().to_string())))
}

#[tauri::command]
pub async fn select_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_file(move |path| {
        let _ = tx.send(path);
    });
    let result = rx.recv().map_err(|e| e.to_string())?;
    Ok(result.and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().to_string())))
}

#[tauri::command]
pub async fn select_save_path(
    app: AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut builder = app.dialog().file();
    if let Some(dp) = default_path.as_deref() {
        builder = builder.set_file_name(dp);
    }
    builder.save_file(move |path| {
        let _ = tx.send(path);
    });
    let result = rx.recv().map_err(|e| e.to_string())?;
    Ok(result.and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().to_string())))
}
