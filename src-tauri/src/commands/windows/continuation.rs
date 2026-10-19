// 续写结果独立窗口：创建 / 状态查询 / action 回传
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use super::common::{bind_save_handler, focus_existing_window, read_bounds, state_path};
use super::state::{
    ContinuationState, WindowsState, CONTINUATION_WINDOW_LABEL, CONTINUATION_WINDOW_STATE_FILE,
};

#[tauri::command]
pub async fn open_continuation_window(
    app: AppHandle,
    state: tauri::State<'_, WindowsState>,
    payload: ContinuationState,
) -> Result<bool, String> {
    if payload.book_id.is_empty() || payload.chapter_id.is_empty() {
        return Err("open-continuation-window 参数无效".into());
    }

    if let Ok(mut guard) = state.continuation_state.lock() {
        *guard = Some(payload);
    }

    if let Some(window) = app.get_webview_window(CONTINUATION_WINDOW_LABEL) {
        focus_existing_window(&window)?;
        return Ok(true);
    }

    let path = state_path(&app, CONTINUATION_WINDOW_STATE_FILE);
    let bounds = read_bounds(&path, 600.0, 700.0);
    let (w, h) = bounds.map(|b| (b.width, b.height)).unwrap_or((980.0, 1080.0));

    let mut builder = WebviewWindowBuilder::new(
        &app,
        CONTINUATION_WINDOW_LABEL,
        WebviewUrl::App("index.html?continuationDetached=1".into()),
    )
    .title("AI 续写结果")
    .min_inner_size(600.0, 700.0)
    .resizable(true)
    .decorations(false)
    .visible(false)
    .inner_size(w, h);

    if let Some(b) = bounds {
        if let (Some(x), Some(y)) = (b.x, b.y) {
            builder = builder.position(x, y);
        } else {
            builder = builder.center();
        }
    } else {
        builder = builder.center();
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    bind_save_handler(window.clone(), path);

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn get_continuation_window_state(
    state: tauri::State<'_, WindowsState>,
) -> Result<Value, String> {
    let value = state
        .continuation_state
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| serde_json::to_value(s).unwrap_or(Value::Null)));
    Ok(serde_json::json!({ "state": value }))
}

#[tauri::command]
pub async fn submit_continuation_window_action(
    app: AppHandle,
    state: tauri::State<'_, WindowsState>,
    action: String,
    paragraphs: Vec<String>,
    selected: Vec<i64>,
    editing_index: Option<i64>,
) -> Result<bool, String> {
    if action.is_empty() {
        return Err("submit-continuation-window-action 参数无效".into());
    }

    let (source, insert_from) = state
        .continuation_state
        .lock()
        .ok()
        .map(|g| match g.as_ref() {
            Some(s) => (s.source.clone(), s.insert_from),
            None => ("guided".to_string(), None),
        })
        .unwrap_or(("guided".to_string(), None));

    let payload = serde_json::json!({
        "action": action,
        "source": source,
        "insertFrom": insert_from,
        "paragraphs": paragraphs,
        "selected": selected,
        "editingIndex": editing_index,
    });

    if let Some(main) = app.get_webview_window("main") {
        main.emit("continuation:window-action", payload)
            .map_err(|e| e.to_string())?;
    }

    if action == "discard" || action == "acceptAll" || action == "acceptSelected" {
        if let Ok(mut guard) = state.continuation_state.lock() {
            *guard = None;
        }
        if let Some(window) = app.get_webview_window(CONTINUATION_WINDOW_LABEL) {
            let _ = window.close();
        }
    }

    Ok(true)
}
