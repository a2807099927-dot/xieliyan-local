// 导入：TXT 文本拆章 / 壁纸（PNG 优化）/ 书封（长边压缩 → JPEG）+ 通用读文本

use regex::Regex;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use super::util::html_escape;

/// 读取任意文本文件（导入小说源、配置等）
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 导入 TXT — 按"第X章 / Chapter N"正则拆章
///
/// 注意：百万字级别的 TXT 会产生很大的 JSON payload（每章正文都转成 HTML）。
/// 为避免 IPC 超时，不再返回原始全文 `content` 字段，只返回拆好的 chapters 数组。
#[tauri::command]
pub async fn import_txt(file_path: String) -> Result<Value, String> {
    let raw_bytes = fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 尝试 UTF-8，失败则尝试 GBK（国内 TXT 小说常见编码）
    let content = match String::from_utf8(raw_bytes.clone()) {
        Ok(s) => s,
        Err(_) => {
            // GBK fallback
            let (decoded, _, had_errors) = encoding_rs::GBK.decode(&raw_bytes);
            if had_errors {
                return Err("文件编码无法识别（不是 UTF-8 也不是 GBK）".into());
            }
            decoded.into_owned()
        }
    };

    let re = Regex::new(
        r"(?m)^\s*(第[一二三四五六七八九十百千万0-9]+章[^\n]*|Chapter\s+\d+[^\n]*)\s*$",
    )
    .map_err(|e| e.to_string())?;

    let mut chapters: Vec<Value> = Vec::new();
    let mut last_end = 0usize;
    let mut last_title: Option<String> = None;

    let format_body = |body: &str| -> String {
        body.split('\n')
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .map(|line| format!("<p>{}</p>", html_escape(line)))
            .collect()
    };

    for cap in re.captures_iter(&content) {
        if let Some(m) = cap.get(0) {
            if let Some(title) = last_title.take() {
                let body = content[last_end..m.start()].trim();
                if !body.is_empty() {
                    chapters.push(json!({
                        "title": title,
                        "content": format!(
                            "<h2 style=\"text-align:center;\">{}</h2>{}",
                            html_escape(&title),
                            format_body(body)
                        ),
                    }));
                }
            }
            last_title = Some(m.as_str().trim().to_string());
            last_end = m.end();
        }
    }

    if let Some(title) = last_title {
        let body = content[last_end..].trim();
        if !body.is_empty() {
            chapters.push(json!({
                "title": title,
                "content": format!(
                    "<h2 style=\"text-align:center;\">{}</h2>{}",
                    html_escape(&title),
                    format_body(body)
                ),
            }));
        }
    }

    if chapters.is_empty() && !content.trim().is_empty() {
        // 没匹配到章节标题 — 整个文件当一章（但百万字时截断到前 5 万字，避免 IPC 爆）
        let truncated = if content.len() > 50_000 {
            &content[..content.char_indices().nth(50_000).map(|(i, _)| i).unwrap_or(content.len())]
        } else {
            content.as_str()
        };
        chapters.push(json!({
            "title": "第1章",
            "content": format!(
                "<h2 style=\"text-align:center;\">第1章</h2>{}",
                format_body(truncated)
            ),
        }));
    }

    // 兼容 OutlineTree 大纲导入（只需要原始文本），百万字时截断到 10 万字避免 IPC 爆
    let content_preview = if content.len() > 100_000 {
        content.char_indices().nth(100_000).map(|(i, _)| &content[..i]).unwrap_or(&content).to_string()
    } else {
        content
    };

    Ok(json!({
        "chapters": chapters,
        "totalChapters": chapters.len(),
        "totalChars": content_preview.len(),
        "content": content_preview,
    }))
}

/// 导入壁纸到 workspace/wallpapers/，PNG 优化压缩
#[tauri::command]
pub async fn import_wallpaper(
    app: AppHandle,
    source_path: String,
) -> Result<Value, String> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("源文件不存在或不是文件".into());
    }

    let workspace = crate::workspace::get_workspace_path(&app);
    let wallpaper_dir = workspace.join("wallpapers");
    fs::create_dir_all(&wallpaper_dir).map_err(|e| e.to_string())?;

    let mut replaced = 0u32;
    if let Ok(entries) = fs::read_dir(&wallpaper_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() && fs::remove_file(entry.path()).is_ok() {
                replaced += 1;
            }
        }
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let unique = chrono::Local::now().timestamp_millis();
    let losslessly_compressible = matches!(ext.as_str(), "png" | "bmp");

    let target_path: PathBuf;
    let mut compressed = false;

    if losslessly_compressible {
        if let Ok(img) = image::open(&source) {
            let mut buf = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut buf);
            if img.write_to(&mut cursor, image::ImageFormat::Png).is_ok() {
                let original_size = source.metadata().map(|m| m.len()).unwrap_or(u64::MAX);
                if (buf.len() as u64) < original_size {
                    target_path = wallpaper_dir.join(format!("wp-{}.png", unique));
                    fs::write(&target_path, &buf).map_err(|e| e.to_string())?;
                    compressed = true;
                    return Ok(json!({
                        "path": target_path.to_string_lossy(),
                        "replacedCount": replaced,
                        "compressed": compressed,
                    }));
                }
            }
        }
    }

    let final_ext = if ext.is_empty() { "bin" } else { ext.as_str() };
    target_path = wallpaper_dir.join(format!("wp-{}.{}", unique, final_ext));
    fs::copy(&source, &target_path).map_err(|e| e.to_string())?;

    Ok(json!({
        "path": target_path.to_string_lossy(),
        "replacedCount": replaced,
        "compressed": compressed,
    }))
}

/// 导入书封到 workspace/covers/{bookId}/
/// 长边 > 1200 时缩放，统一压缩为 JPEG（GIF 直接复制保留动画）
#[tauri::command]
pub async fn import_book_cover(
    app: AppHandle,
    book_id: String,
    source_path: String,
) -> Result<Value, String> {
    let book_id = book_id.trim().to_string();
    if book_id.is_empty() {
        return Err("作品 ID 不能为空".into());
    }
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err("源文件不存在".into());
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let allowed = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
    if !allowed.contains(&ext.as_str()) {
        return Err("封面仅支持 jpg/png/webp/gif/bmp".into());
    }

    let workspace = crate::workspace::get_workspace_path(&app);
    let cover_dir = workspace.join("covers").join(&book_id);
    fs::create_dir_all(&cover_dir).map_err(|e| e.to_string())?;

    if let Ok(entries) = fs::read_dir(&cover_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    let unique = chrono::Local::now().timestamp_millis();
    let mut compressed = false;
    let target_path: PathBuf;

    if ext == "gif" {
        target_path = cover_dir.join(format!("cover-{}.gif", unique));
        fs::copy(&source, &target_path).map_err(|e| e.to_string())?;
    } else {
        target_path = cover_dir.join(format!("cover-{}.jpg", unique));
        match image::open(&source) {
            Ok(mut img) => {
                let (w, h) = (img.width(), img.height());
                let long_edge = w.max(h);
                if long_edge > 1200 {
                    let factor = 1200.0 / (long_edge as f32);
                    let new_w = (w as f32 * factor).round().max(1.0) as u32;
                    let new_h = (h as f32 * factor).round().max(1.0) as u32;
                    img = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
                }
                let rgb = img.to_rgb8();
                let mut out = Vec::new();
                let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82);
                image::DynamicImage::ImageRgb8(rgb)
                    .write_with_encoder(encoder)
                    .map_err(|e| e.to_string())?;
                fs::write(&target_path, &out).map_err(|e| e.to_string())?;
                compressed = true;
            }
            Err(_) => {
                fs::copy(&source, &target_path).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(json!({
        "path": target_path.to_string_lossy(),
        "compressed": compressed,
    }))
}
