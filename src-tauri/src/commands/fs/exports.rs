// 导出与文本写入：TXT / Markdown / PDF / 通用 saveTextFile

use serde_json::{json, Value};
use std::fs;
use tauri::AppHandle;

use super::util::{html_escape, strip_html};
use crate::workspace::books_dir;

fn read_book_json(app: &AppHandle, book_id: &str) -> Result<Value, String> {
    let book_json = books_dir(app).join(book_id).join("book.json");
    if !book_json.exists() {
        return Err("书籍不存在".into());
    }
    let raw = fs::read_to_string(&book_json).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn read_chapter_text(app: &AppHandle, book_id: &str, chapter: &Value) -> String {
    let chapter_id = chapter.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let html_path = books_dir(app)
        .join(book_id)
        .join("chapters")
        .join(format!("{}.html", chapter_id));
    let html = if html_path.exists() {
        fs::read_to_string(&html_path).unwrap_or_default()
    } else {
        chapter
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    strip_html(&html)
}

/// 去除正文开头与章节标题重复的部分。
/// strip_html 后标题可能以 "标题\n\n"、"标题\n" 或仅 "标题" 形式出现在正文开头，
/// 需要全部兼容处理。
fn strip_leading_title(plain: &str, ch_title: &str) -> String {
    // 优先匹配 "标题\n\n"（两个换行）
    let prefix_double = format!("{}\n\n", ch_title);
    if plain.starts_with(&prefix_double) {
        return plain[prefix_double.len()..].to_string();
    }
    // 其次匹配 "标题\n"（一个换行）
    let prefix_single = format!("{}\n", ch_title);
    if plain.starts_with(&prefix_single) {
        return plain[prefix_single.len()..].to_string();
    }
    // 正文仅有标题本身
    if plain == ch_title || plain.trim() == ch_title {
        return String::new();
    }
    plain.to_string()
}

/// 按 chapter_ids 过滤导出范围；None 表示全本。始终沿用书里原有的章节顺序。
fn chapters_in_scope<'a>(chapters: &'a [Value], chapter_ids: &Option<Vec<String>>) -> Vec<&'a Value> {
    match chapter_ids {
        None => chapters.iter().collect(),
        Some(ids) => {
            let wanted: std::collections::HashSet<&str> = ids.iter().map(|id| id.as_str()).collect();
            chapters
                .iter()
                .filter(|ch| wanted.contains(ch.get("id").and_then(|v| v.as_str()).unwrap_or("")))
                .collect()
        }
    }
}

#[tauri::command]
pub async fn export_txt(
    app: AppHandle,
    book_id: String,
    output_path: String,
    chapter_ids: Option<Vec<String>>,
) -> Result<bool, String> {
    let book = read_book_json(&app, &book_id)?;
    let title = book.get("title").and_then(|v| v.as_str()).unwrap_or("无题");
    let mut out = String::new();
    out.push_str(&format!("《{}》\n\n", title));
    if let Some(chapters) = book.get("chapters").and_then(|v| v.as_array()) {
        for ch in chapters_in_scope(chapters, &chapter_ids) {
            let ch_title = ch.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let mut plain = read_chapter_text(&app, &book_id, ch);
            // 避免章节标题重复：正文 HTML 中已包含 <h2> 标题，strip_html 后会保留在 plain 开头
            if !ch_title.is_empty() {
                plain = strip_leading_title(&plain, ch_title);
            }
            out.push_str(&format!("\n{}\n\n{}\n\n", ch_title, plain));
        }
    }
    fs::write(&output_path, out).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn export_markdown(
    app: AppHandle,
    book_id: String,
    output_path: String,
    chapter_ids: Option<Vec<String>>,
) -> Result<bool, String> {
    let book = read_book_json(&app, &book_id)?;
    let title = book.get("title").and_then(|v| v.as_str()).unwrap_or("无题");
    let author = book.get("author").and_then(|v| v.as_str()).unwrap_or("");

    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", title));
    if !author.is_empty() {
        out.push_str(&format!("作者：{}\n\n", author));
    }
    if let Some(chapters) = book.get("chapters").and_then(|v| v.as_array()) {
        for ch in chapters_in_scope(chapters, &chapter_ids) {
            let ch_title = ch.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let mut plain = read_chapter_text(&app, &book_id, ch);
            if !ch_title.is_empty() {
                plain = strip_leading_title(&plain, ch_title);
            }
            out.push_str(&format!("\n## {}\n\n{}\n\n", ch_title, plain));
        }
    }
    fs::write(&output_path, out).map_err(|e| e.to_string())?;
    Ok(true)
}

/// 导出 PDF — 生成排版好的 HTML 文件，用系统浏览器打开供用户打印为 PDF
/// Tauri 2 没有 Electron 的 printToPDF API，改为生成 HTML 后用浏览器打印
#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    book_id: String,
    output_path: String,
    chapter_ids: Option<Vec<String>>,
) -> Result<Value, String> {
    use tauri_plugin_opener::OpenerExt;

    let book = read_book_json(&app, &book_id)?;
    let title = book
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("无题")
        .to_string();

    let mut sections = String::new();
    if let Some(chapters) = book.get("chapters").and_then(|v| v.as_array()) {
        for ch in chapters_in_scope(chapters, &chapter_ids) {
            let ch_title = ch.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let mut plain = read_chapter_text(&app, &book_id, ch);
            if !ch_title.is_empty() {
                plain = strip_leading_title(&plain, ch_title);
            }
            let paragraphs: Vec<String> = plain
                .split('\n')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| format!("<p>{}</p>", html_escape(s)))
                .collect();
            sections.push_str(&format!(
                "<section><h2>{}</h2>{}</section>",
                html_escape(ch_title),
                paragraphs.join("")
            ));
        }
    }

    let html = format!(
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<style>
body {{ font-family: 'Microsoft YaHei', 'PingFang SC', 'SimSun', sans-serif; line-height: 1.85; color: #111827; padding: 48px 60px; max-width: 800px; margin: 0 auto; }}
h1 {{ text-align: center; margin-bottom: 32px; font-size: 24px; }}
h2 {{ break-before: page; margin-top: 32px; font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }}
h2:first-of-type {{ break-before: auto; }}
p {{ margin: 0 0 0.9em; text-indent: 2em; font-size: 14px; }}
.print-hint {{ text-align: center; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; margin-bottom: 24px; font-size: 13px; color: #0369a1; }}
@media print {{ .print-hint {{ display: none; }} body {{ padding: 24px; }} }}
</style>
</head>
<body>
<div class="print-hint">💡 按 <b>Ctrl+P</b> 打印此页面，选择"另存为 PDF"即可导出。打印完成后可关闭此页面。</div>
<h1>{title}</h1>
{sections}
</body>
</html>"#,
        title = html_escape(&title),
        sections = sections,
    );

    // 写入到用户选择的输出路径旁边（.html 后缀）
    let html_path = if output_path.ends_with(".pdf") {
        output_path.replace(".pdf", ".html")
    } else {
        format!("{}.html", output_path)
    };

    if let Some(parent) = std::path::Path::new(&html_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&html_path, &html).map_err(|e| format!("写入导出文件失败: {e}"))?;

    // 用系统默认浏览器打开 HTML 文件
    app.opener()
        .open_path(&html_path, None::<&str>)
        .map_err(|e| format!("打开导出文件失败: {e}"))?;

    Ok(json!({ "success": true, "path": html_path }))
}

/// 通用：保存文本到指定路径
#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<bool, String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}
