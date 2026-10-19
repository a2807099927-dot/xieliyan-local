// NovelLab 内的 TXT 导入：弹文件选择 + 拆章 + 返回 Vec<{index, title, content}>
use regex::Regex;
use serde_json::{json, Value};
use std::fs;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn novel_lab_import_txt(app: AppHandle) -> Result<Value, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Text", &["txt"])
        .set_title("选择 TXT 小说文件")
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    let picked = rx.recv().map_err(|e| e.to_string())?;
    let Some(picked_path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(json!({ "success": false, "chapters": [] }));
    };

    // 读取文件字节，尝试 UTF-8，失败则尝试 GBK（国内 TXT 小说常见编码）
    let raw_bytes = fs::read(&picked_path).map_err(|e| format!("读取文件失败: {}", e))?;
    // 避免 clone：先按引用判 UTF-8，合法则直接消费 bytes，非法再走 GBK 解码
    let raw = match std::str::from_utf8(&raw_bytes) {
        Ok(s) => s.to_owned(),
        Err(_) => {
            let (decoded, _, had_errors) = encoding_rs::GBK.decode(&raw_bytes);
            if had_errors {
                return Err("文件编码无法识别（不是 UTF-8 也不是 GBK）".into());
            }
            decoded.into_owned()
        }
    };
    let file_name = picked_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .to_string();

    let re = Regex::new(
        r"^(第[零一二三四五六七八九十百千万0-9]+[章节回卷]|Chapter\s+\d+|CHAPTER\s+\d+)",
    )
    .map_err(|e| e.to_string())?;

    let mut chapters: Vec<Value> = Vec::new();
    let mut current_title = String::new();
    let mut current_content: Vec<&str> = Vec::new();
    let mut idx = 0i64;

    for line in raw.split('\n') {
        let trimmed = line.trim();
        if re.is_match(trimmed) {
            if !current_title.is_empty() || !current_content.is_empty() {
                idx += 1;
                let title = if current_title.is_empty() {
                    format!("第{}章", idx)
                } else {
                    current_title.clone()
                };
                chapters.push(json!({
                    "index": idx,
                    "title": title,
                    "content": current_content.join("\n").trim(),
                }));
            }
            current_title = trimmed.to_string();
            current_content.clear();
        } else {
            current_content.push(line);
        }
    }
    // 末尾章节
    if !current_title.is_empty() || !current_content.is_empty() {
        idx += 1;
        let title = if current_title.is_empty() {
            format!("第{}章", idx)
        } else {
            current_title.clone()
        };
        chapters.push(json!({
            "index": idx,
            "title": title,
            "content": current_content.join("\n").trim(),
        }));
    }

    // 完全没匹配到任何章节标题 → 整本作为单章
    if chapters.is_empty() && !raw.trim().is_empty() {
        chapters.push(json!({
            "index": 1,
            "title": file_name.clone(),
            "content": raw.trim(),
        }));
    }

    Ok(json!({
        "success": true,
        "bookName": file_name,
        "chapters": chapters,
    }))
}

/// 同时也提供 select-save-path（NovelLab 自有的 dialog）
#[tauri::command]
pub async fn novel_lab_select_save_path(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let picked = rx.recv().map_err(|e| e.to_string())?;
    Ok(picked.and_then(|p| p.into_path().ok().map(|x| x.to_string_lossy().to_string())))
}
