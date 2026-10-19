// 统一格式：{savePath}/{bookName}/{bookName}.json
// + 旧格式（_index.json + 分散文件 + _analysis/）自动迁移
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use super::chapters::read_legacy_book;
use super::paths::{book_dir, sanitize_file_name, unified_book_filename};

#[allow(dead_code)]
pub(super) fn save_book_unified(
    save_path: &str,
    book_name: &str,
    data: &Value,
) -> Result<(), String> {
    let dir = book_dir(save_path, book_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(unified_book_filename(book_name));
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// 加载（含旧格式迁移）
pub(super) fn load_book_unified(folder: &PathBuf) -> Option<Value> {
    if !folder.is_dir() {
        return None;
    }

    // 1) 找 {bookName}.json（不以 _ 开头的 json）
    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".json") || name.starts_with('_') {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(entry.path()) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    let has_book = value.get("bookName").and_then(|v| v.as_str()).is_some();
                    let has_chapters = value.get("chapters").and_then(|v| v.as_array()).is_some();
                    if has_book && has_chapters {
                        return Some(value);
                    }
                }
            }
        }
    }

    // 2) 旧格式迁移：_index.json + chapters/ + _analysis/
    let (meta, chapters) = read_legacy_book(folder)?;

    // 加载 _analysis/*.json，按 index 范围归到对应章节
    let analysis_dir = folder.join("_analysis");
    let mut sessions: Vec<Value> = Vec::new();
    if analysis_dir.exists() {
        if let Ok(entries) = fs::read_dir(&analysis_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(raw) = fs::read_to_string(entry.path()) {
                    if let Ok(s) = serde_json::from_str::<Value>(&raw) {
                        sessions.push(s);
                    }
                }
            }
        }
    }
    sessions.sort_by(|a, b| {
        let aa = a.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let bb = b.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        bb.cmp(aa)
    });

    let unified_chapters: Vec<Value> = chapters
        .into_iter()
        .map(|ch| {
            let idx = ch.get("index").and_then(|v| v.as_i64()).unwrap_or(0);
            let analysis = sessions
                .iter()
                .find(|s| {
                    let from = s.get("chapterFrom").and_then(|v| v.as_i64()).unwrap_or(0);
                    let to = s.get("chapterTo").and_then(|v| v.as_i64()).unwrap_or(0);
                    idx >= from && idx <= to
                })
                .map(|s| {
                    json!({
                        "mode": s.get("mode").cloned().unwrap_or(Value::Null),
                        "label": s.get("label").cloned().unwrap_or(Value::Null),
                        "messages": s.get("messages").cloned().unwrap_or(json!([])),
                        "analyzedAt": s.get("createdAt").cloned().unwrap_or(Value::Null),
                    })
                });
            json!({
                "index": idx,
                "title": ch.get("title").cloned().unwrap_or(Value::Null),
                "url": ch.get("url").cloned().unwrap_or(Value::Null),
                "content": ch.get("content").cloned().unwrap_or(Value::Null),
                "analysis": analysis,
            })
        })
        .collect();

    let book_name = meta.get("bookName").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let unified = json!({
        "bookName": book_name,
        "sourceUrl": meta.get("sourceUrl").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "savePath": meta.get("savePath").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        "savedAt": chrono::Utc::now().to_rfc3339(),
        "totalChapters": unified_chapters.len(),
        "chapters": unified_chapters,
    });

    // 读取时不再写盘（避免“读操作产生副作用”）：迁移落盘改为在显式保存时进行
    Some(unified)
}

#[allow(dead_code)]
fn _hint() {
    let _ = sanitize_file_name("");
}
