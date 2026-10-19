// 剧情档案（memory.json）+ 历史快照（chapters/history/<id>.json）
// + memory_history（plot-history.json / inference-history.json，回滚记录）

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::workspace::books_dir;

const MAX_HISTORY_SNAPSHOTS: usize = 30;
const MAX_MEMORY_HISTORY_ENTRIES: usize = 60;

// ---------- 历史快照（章节正文回滚） ----------

#[tauri::command]
pub async fn load_history_snapshots(
    app: AppHandle,
    book_id: String,
    chapter_id: String,
) -> Result<Vec<Value>, String> {
    let path = books_dir(&app)
        .join(&book_id)
        .join("history")
        .join(format!("{}.json", chapter_id));
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[tauri::command]
pub async fn save_history_snapshot(
    app: AppHandle,
    book_id: String,
    chapter_id: String,
    snapshot: Value,
) -> Result<bool, String> {
    let dir = books_dir(&app).join(&book_id).join("history");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", chapter_id));

    let mut list: Vec<Value> = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        Vec::new()
    };

    list.insert(0, snapshot);
    if list.len() > MAX_HISTORY_SNAPSHOTS {
        list.truncate(MAX_HISTORY_SNAPSHOTS);
    }

    let content = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    // 原子写：历史快照也是创作数据
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    match fs::rename(&tmp, &path) {
        Ok(_) => Ok(true),
        Err(_) => {
            let _ = fs::remove_file(&path);
            fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

// ---------- 剧情档案 ----------

#[tauri::command]
pub async fn load_memory_bank(app: AppHandle, book_id: String) -> Result<Vec<Value>, String> {
    let path = books_dir(&app).join(&book_id).join("memory.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[tauri::command]
pub async fn save_memory_bank(
    app: AppHandle,
    book_id: String,
    memory_bank: Vec<Value>,
) -> Result<bool, String> {
    let dir = books_dir(&app).join(&book_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("memory.json");
    let content = serde_json::to_string_pretty(&memory_bank).map_err(|e| e.to_string())?;
    // 原子写：剧情档案是重要创作数据，避免写入中断时损坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    match fs::rename(&tmp, &path) {
        Ok(_) => Ok(true),
        Err(_) => {
            let _ = fs::remove_file(&path);
            fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
            Ok(true)
        }
    }
}

// ---------- memory_history（剧情档案的撤销 / 回滚记录） ----------

fn memory_history_file(app: &AppHandle, book_id: &str, kind: &str) -> PathBuf {
    let filename = if kind == "plot" {
        "plot-history.json"
    } else {
        "inference-history.json"
    };
    books_dir(app).join(book_id).join(filename)
}

fn read_memory_history(path: &PathBuf) -> Vec<Value> {
    if !path.exists() {
        return Vec::new();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<Value>>(&raw).ok())
        .unwrap_or_default()
}

fn write_memory_history(path: &PathBuf, list: &[Value]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_memory_history(
    app: AppHandle,
    book_id: String,
    kind: String,
) -> Result<Value, String> {
    let path = memory_history_file(&app, &book_id, &kind);
    let entries = read_memory_history(&path);
    Ok(json!({ "entries": entries }))
}

#[tauri::command]
pub async fn save_memory_history(
    app: AppHandle,
    book_id: String,
    kind: String,
    entry: Value,
) -> Result<Value, String> {
    let path = memory_history_file(&app, &book_id, &kind);
    let prev = read_memory_history(&path);

    // 归一化：保证有 id / at
    let id = entry
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let at = entry
        .get("at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    let mut next_entry = entry.clone();
    if let Some(obj) = next_entry.as_object_mut() {
        obj.insert("id".to_string(), Value::String(id.clone()));
        obj.insert("at".to_string(), Value::String(at));
    }

    let deduped: Vec<Value> = prev
        .into_iter()
        .filter(|item| item.get("id").and_then(|v| v.as_str()) != Some(&id))
        .collect();
    let mut merged = vec![next_entry];
    merged.extend(deduped);
    if merged.len() > MAX_MEMORY_HISTORY_ENTRIES {
        merged.truncate(MAX_MEMORY_HISTORY_ENTRIES);
    }

    write_memory_history(&path, &merged)?;
    Ok(json!({ "success": true, "count": merged.len() }))
}

#[tauri::command]
pub async fn delete_memory_history(
    app: AppHandle,
    book_id: String,
    kind: String,
    id: String,
) -> Result<Value, String> {
    let path = memory_history_file(&app, &book_id, &kind);
    let prev = read_memory_history(&path);
    let next: Vec<Value> = prev
        .into_iter()
        .filter(|item| item.get("id").and_then(|v| v.as_str()) != Some(&id))
        .collect();
    write_memory_history(&path, &next)?;
    Ok(json!({ "success": true, "count": next.len() }))
}

#[tauri::command]
pub async fn clear_memory_history(
    app: AppHandle,
    book_id: String,
    kind: String,
) -> Result<Value, String> {
    let path = memory_history_file(&app, &book_id, &kind);
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    Ok(json!({ "success": true }))
}
