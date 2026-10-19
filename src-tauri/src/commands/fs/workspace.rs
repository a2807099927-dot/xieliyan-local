// 工作区初始化：选择目录 → mkdir books → 写入 workspace-path.txt
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::workspace::set_workspace_path;

#[tauri::command]
pub async fn init_workspace(app: AppHandle, path: String) -> Result<bool, String> {
    let workspace = PathBuf::from(&path);
    let books = workspace.join("books");
    fs::create_dir_all(&books).map_err(|e| e.to_string())?;
    set_workspace_path(&app, workspace)?;
    Ok(true)
}
