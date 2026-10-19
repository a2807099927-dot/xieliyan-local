// 章节存档：saveChapter / saveBookIndex
// + 旧格式 _index.json 元信息读写
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use super::paths::{
    book_dir, chapter_filename, merged_analysis_filename, merged_book_filename, normalize_text, sanitize_file_name,
};

#[tauri::command]
pub async fn novel_lab_save_chapter(
    save_path: String,
    book_name: String,
    chapter: Value,
) -> Result<Value, String> {
    let dir = book_dir(&save_path, &book_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let index = chapter
        .get("index")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let title = chapter
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content = chapter
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let file_path = dir.join(chapter_filename(index, &title));
    let content_normalized = normalize_text(&content);
    let file_content = format!(
        "{}\n{}\n\n{}\n",
        title.trim(),
        "=".repeat(40),
        content_normalized
    );
    fs::write(&file_path, file_content).map_err(|e| e.to_string())?;

    // 重建合并文件：扫描目录内所有章节 .txt（按章号排序、同章号去重），避免重复保存导致内容叠加
    let merged = dir.join(merged_book_filename(&book_name));
    let merged_name = merged_book_filename(&book_name);
    let analysis_name = merged_analysis_filename(&book_name);
    let mut chapter_map: std::collections::BTreeMap<i64, (String, String)> = std::collections::BTreeMap::new();
    if let Ok(read) = fs::read_dir(&dir) {
        for e in read.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".txt") { continue; }
            if fname == merged_name || fname == analysis_name { continue; }
            let idx_str: String = fname.chars().take_while(|c| c.is_ascii_digit()).collect();
            if idx_str.is_empty() { continue; }
            let idx: i64 = idx_str.parse().unwrap_or(0);
            if let Ok(raw) = fs::read_to_string(e.path()) {
                let lines: Vec<&str> = raw.split('\n').collect();
                let ch_title = lines.first().map(|s| s.trim().to_string()).unwrap_or_default();
                let sep_idx = lines.iter().position(|l| l.starts_with("===")).unwrap_or(0);
                let body = lines[(sep_idx + 1)..].join("\n").trim().to_string();
                chapter_map.insert(idx, (ch_title, body));
            }
        }
    }
    // 确保本次写入的章节以最新内容为准
    chapter_map.insert(index, (title.trim().to_string(), content_normalized.clone()));
    let mut merged_text = String::new();
    for (_idx, (ch_title, body)) in &chapter_map {
        merged_text.push_str(&format!("\n\n{}\n\n{}\n", ch_title.trim(), body));
    }
    fs::write(&merged, merged_text).map_err(|e| e.to_string())?;

    Ok(json!({ "success": true, "filePath": file_path.to_string_lossy() }))
}

#[tauri::command]
pub async fn novel_lab_save_book_index(
    save_path: String,
    book_name: String,
    chapters: Vec<Value>,
    extra: Option<Value>,
) -> Result<Value, String> {
    let dir = book_dir(&save_path, &book_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let index_path = dir.join("_index.json");
    let existing: Value = if index_path.exists() {
        fs::read_to_string(&index_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or(json!({}))
    } else {
        json!({})
    };

    let mut sorted = chapters.clone();
    sorted.sort_by_key(|c| c.get("index").and_then(|v| v.as_i64()).unwrap_or(0));

    let last_index = sorted
        .last()
        .and_then(|c| c.get("index").and_then(|v| v.as_i64()))
        .unwrap_or(0);

    let source_url = extra
        .as_ref()
        .and_then(|e| e.get("sourceUrl"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            existing
                .get("sourceUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        });

    let last_analyzed_index = extra
        .as_ref()
        .and_then(|e| e.get("lastAnalyzedIndex"))
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| existing.get("lastAnalyzedIndex").and_then(|v| v.as_i64()).unwrap_or(0));

    let last_analyzed_at = extra
        .as_ref()
        .and_then(|e| e.get("lastAnalyzedAt"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            existing
                .get("lastAnalyzedAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        });

    let last_analyzed_mode = extra
        .as_ref()
        .and_then(|e| e.get("lastAnalyzedMode"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            existing
                .get("lastAnalyzedMode")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        });

    let total_chapters = sorted.len() as i64;
    let meta = json!({
        "bookName": book_name,
        "savePath": save_path,
        "sourceUrl": source_url,
        "lastExtractedIndex": last_index,
        "lastExtractedAt": chrono::Utc::now().to_rfc3339(),
        "lastAnalyzedIndex": last_analyzed_index,
        "lastAnalyzedAt": last_analyzed_at,
        "lastAnalyzedMode": last_analyzed_mode,
        "totalChapters": total_chapters,
        "chapters": sorted,
    });

    let content = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(&index_path, content).map_err(|e| e.to_string())?;

    Ok(json!({ "success": true }))
}

/// 内部辅助：读取 _index.json + 各章节 .txt 还原 ChapterData[]
pub(super) fn read_legacy_book(folder: &PathBuf) -> Option<(Value, Vec<Value>)> {
    let index_path = folder.join("_index.json");
    if !index_path.exists() {
        return None;
    }
    let raw = fs::read_to_string(&index_path).ok()?;
    let meta: Value = serde_json::from_str(&raw).ok()?;
    let entries = meta
        .get("chapters")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut chapters: Vec<Value> = Vec::with_capacity(entries.len());
    for ch in &entries {
        let index = ch.get("index").and_then(|v| v.as_i64()).unwrap_or(0);
        let title = ch.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let url = ch.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let file_path = folder.join(chapter_filename(index, &title));

        let content = if let Ok(raw) = fs::read_to_string(&file_path) {
            // 跳过标题行 + 分隔线
            let lines: Vec<&str> = raw.split('\n').collect();
            let sep_idx = lines.iter().position(|l| l.starts_with("===")).unwrap_or(0);
            lines[(sep_idx + 1)..].join("\n").trim().to_string()
        } else {
            String::new()
        };

        chapters.push(json!({
            "index": index,
            "title": title,
            "url": url,
            "content": content,
            "scrapedAt": "",
        }));
    }

    Some((meta, chapters))
}

#[allow(dead_code)]
fn _hint() {
    let _ = sanitize_file_name("");
}
