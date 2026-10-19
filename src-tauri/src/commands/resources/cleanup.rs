// 章节正文中残留的 <mark data-character-name="..."> 清理
// 删除某角色或所有角色的高亮包裹，但保留内部文本

use regex::Regex;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::AppHandle;

use super::storage::resolve_book;
use crate::workspace::books_dir;

#[tauri::command]
pub async fn cleanup_residue(
    app: AppHandle,
    book_id: Option<String>,
    role_name: Option<String>,
) -> Result<Value, String> {
    let (resolved_id, _book) = resolve_book(&app, book_id.as_deref())?;
    let chapters_dir: PathBuf = books_dir(&app).join(&resolved_id).join("chapters");
    if !chapters_dir.exists() {
        return Ok(json!({ "success": true, "cleanedFiles": 0 }));
    }

    let role_name_trimmed = role_name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let pattern = if let Some(name) = role_name_trimmed {
        format!(
            r#"(?is)<mark data-character-name="{}"[^>]*>(.*?)</mark>"#,
            regex::escape(name)
        )
    } else {
        r#"(?is)<mark data-character-name="[^"]*"[^>]*>(.*?)</mark>"#.to_string()
    };
    let re = Regex::new(&pattern).map_err(|e| e.to_string())?;

    let mut cleaned_files = 0u32;
    if let Ok(entries) = std::fs::read_dir(&chapters_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("html") {
                continue;
            }
            let raw = match std::fs::read_to_string(&path) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let replaced = re.replace_all(&raw, "$1").to_string();
            if replaced != raw {
                if std::fs::write(&path, replaced).is_ok() {
                    cleaned_files += 1;
                }
            }
        }
    }

    Ok(json!({
        "success": true,
        "cleanedFiles": cleaned_files
    }))
}
