// 章节大纲独立窗口
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::common::{focus_existing_window, urlencoding_encode};
use super::state::OUTLINE_WINDOW_LABEL;

#[tauri::command]
pub async fn open_outline_window(
    app: AppHandle,
    book_id: String,
    chapter_id: Option<String>,
) -> Result<bool, String> {
    let book_id = book_id.trim().to_string();
    if book_id.is_empty() {
        return Err("open-outline-window 参数无效".into());
    }

    if let Some(window) = app.get_webview_window(OUTLINE_WINDOW_LABEL) {
        focus_existing_window(&window)?;
        return Ok(true);
    }

    let chapter_param = chapter_id
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("&chapterId={}", urlencoding_encode(s)))
        .unwrap_or_default();

    let url = format!(
        "index.html?outlineDetached=1&bookId={}{}",
        urlencoding_encode(&book_id),
        chapter_param
    );

    let window = WebviewWindowBuilder::new(&app, OUTLINE_WINDOW_LABEL, WebviewUrl::App(url.into()))
        .title("章节大纲")
        .inner_size(1100.0, 820.0)
        .min_inner_size(640.0, 500.0)
        .resizable(true)
        .decorations(false)
        .center()
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn open_outline_board_window(
    app: AppHandle,
    book_id: String,
) -> Result<bool, String> {
    let book_id = book_id.trim().to_string();
    if book_id.is_empty() {
        return Err("open_outline_board_window 参数无效".into());
    }

    const OUTLINE_BOARD_LABEL: &str = "outline-board";

    if let Some(window) = app.get_webview_window(OUTLINE_BOARD_LABEL) {
        focus_existing_window(&window)?;
        return Ok(true);
    }

    let url = format!(
        "index.html?outlineBoardDetached=1&bookId={}",
        urlencoding_encode(&book_id)
    );

    let window = WebviewWindowBuilder::new(&app, OUTLINE_BOARD_LABEL, WebviewUrl::App(url.into()))
        .title("大纲看板")
        .inner_size(1100.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(false)
        .center()
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}
