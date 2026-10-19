// 存档列表 / 加载 / 删除
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use super::chapters::read_legacy_book;
use super::unified::load_book_unified;

const MAX_ENTRIES: usize = 300;

#[tauri::command]
pub async fn novel_lab_list_archives(save_path: String) -> Result<Value, String> {
    if save_path.is_empty() {
        return Ok(json!({ "success": true, "books": [] }));
    }
    let root = PathBuf::from(&save_path);
    if !root.is_dir() {
        return Ok(json!({ "success": true, "books": [] }));
    }

    let mut result: Vec<Value> = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return Ok(json!({ "success": true, "books": [] })),
    };

    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let folder = entry.path();
        let index_path = folder.join("_index.json");
        let raw = match fs::read_to_string(&index_path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let meta: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        result.push(json!({
            "bookName": meta.get("bookName").and_then(|v| v.as_str()).unwrap_or(""),
            "folderPath": folder.to_string_lossy(),
            "lastExtractedIndex": meta.get("lastExtractedIndex").and_then(|v| v.as_i64()).unwrap_or(0),
            "lastAnalyzedIndex": meta.get("lastAnalyzedIndex").and_then(|v| v.as_i64()).unwrap_or(0),
            "lastAnalyzedMode": meta.get("lastAnalyzedMode").and_then(|v| v.as_str()).unwrap_or(""),
            "totalChapters": meta.get("totalChapters").and_then(|v| v.as_i64()).unwrap_or(0),
            "lastUpdatedAt": meta.get("lastExtractedAt").and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }

    result.sort_by(|a, b| {
        let aa = a.get("lastUpdatedAt").and_then(|v| v.as_str()).unwrap_or("");
        let bb = b.get("lastUpdatedAt").and_then(|v| v.as_str()).unwrap_or("");
        bb.cmp(aa)
    });

    // 排序完成后再截断（避免在过滤/排序前截断导致漏书）
    result.truncate(MAX_ENTRIES);

    Ok(json!({ "success": true, "books": result }))
}

#[tauri::command]
pub async fn novel_lab_load_book(folder_path: String) -> Result<Value, String> {
    let folder = PathBuf::from(&folder_path);
    if !folder.is_dir() {
        return Ok(json!({ "success": false, "error": "目录不存在" }));
    }

    // 1) 优先统一格式（自动迁移）
    if let Some(unified) = load_book_unified(&folder) {
        let book_name = unified.get("bookName").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let save_path = unified.get("savePath").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let source_url = unified.get("sourceUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let total_chapters = unified.get("totalChapters").and_then(|v| v.as_i64()).unwrap_or(0);
        let saved_at = unified.get("savedAt").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut chapters_out: Vec<Value> = Vec::new();
        let mut chapter_analyses: Vec<Value> = Vec::new();
        if let Some(arr) = unified.get("chapters").and_then(|v| v.as_array()) {
            for ch in arr {
                let idx = ch.get("index").and_then(|v| v.as_i64()).unwrap_or(0);
                chapters_out.push(json!({
                    "index": idx,
                    "title": ch.get("title").cloned().unwrap_or(Value::Null),
                    "url": ch.get("url").cloned().unwrap_or(Value::Null),
                    "content": ch.get("content").cloned().unwrap_or(Value::Null),
                    "scrapedAt": "",
                }));
                if let Some(analysis) = ch.get("analysis") {
                    if !analysis.is_null() {
                        chapter_analyses.push(json!({
                            "index": idx,
                            "analysis": analysis.clone(),
                        }));
                    }
                }
            }
        }

        return Ok(json!({
            "success": true,
            "meta": {
                "bookName": book_name,
                "savePath": save_path,
                "sourceUrl": source_url,
                "lastExtractedIndex": total_chapters,
                "lastExtractedAt": saved_at,
                "totalChapters": total_chapters,
            },
            "chapters": chapters_out,
            "chapterAnalyses": chapter_analyses,
        }));
    }

    // 2) 兜底：旧格式
    if let Some((meta, chapters)) = read_legacy_book(&folder) {
        return Ok(json!({
            "success": true,
            "meta": meta,
            "chapters": chapters,
            "chapterAnalyses": [],
        }));
    }

    Ok(json!({ "success": false, "error": "书籍目录无效" }))
}

#[tauri::command]
pub async fn novel_lab_delete_book(folder_path: String) -> Result<Value, String> {
    let folder = PathBuf::from(&folder_path);
    let index_file = folder.join("_index.json");
    if !index_file.exists() {
        return Ok(json!({
            "success": false,
            "error": "目标不是有效的小说实验室存档文件夹",
        }));
    }
    fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}
