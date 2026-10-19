// Agent 助手独立窗口：创建 / 状态查询 / 主-Agent 桥接
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;

use super::common::{
    bind_save_handler, focus_existing_window, read_bounds, state_path, urlencoding_encode,
};
use super::state::{
    AgentWindowState, WindowsState, AGENT_BRIDGE_TIMEOUT_MS, AGENT_WINDOW_LABEL,
    AGENT_WINDOW_STATE_FILE,
};

/// 根据屏幕尺寸推荐 Agent 窗口的初始宽高
fn agent_fallback_size(app: &AppHandle) -> (f64, f64) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten());

    let (screen_w, screen_h) = monitor
        .map(|m| {
            let size = m.size();
            (size.width as f64, size.height as f64)
        })
        .unwrap_or((1920.0, 1080.0));

    let width = if screen_w >= 1920.0 {
        1920.0
    } else if screen_w >= 1600.0 {
        1600.0
    } else {
        (screen_w - 32.0).max(1280.0)
    };
    let height = if screen_h >= 1080.0 {
        1080.0
    } else if screen_h >= 900.0 {
        900.0
    } else {
        (screen_h - 32.0).max(780.0)
    };
    (width, height)
}

#[tauri::command]
pub async fn open_agent_window(
    app: AppHandle,
    state: tauri::State<'_, WindowsState>,
    book_id: String,
    chapter_id: String,
) -> Result<bool, String> {
    let book_id = book_id.trim().to_string();
    let chapter_id = chapter_id.trim().to_string();
    if book_id.is_empty() || chapter_id.is_empty() {
        return Err("open-agent-window 参数无效：缺少 bookId 或 chapterId".into());
    }

    if let Ok(mut guard) = state.agent_window.lock() {
        *guard = Some(AgentWindowState {
            book_id: book_id.clone(),
            chapter_id: chapter_id.clone(),
        });
    }

    if let Some(window) = app.get_webview_window(AGENT_WINDOW_LABEL) {
        focus_existing_window(&window)?;
        return Ok(true);
    }

    let path = state_path(&app, AGENT_WINDOW_STATE_FILE);
    let bounds = read_bounds(&path, 1280.0, 780.0);
    let (fallback_w, fallback_h) = agent_fallback_size(&app);
    let url = format!(
        "index.html?agentDetached=1&bookId={}&chapterId={}",
        urlencoding_encode(&book_id),
        urlencoding_encode(&chapter_id)
    );

    let mut builder = WebviewWindowBuilder::new(&app, AGENT_WINDOW_LABEL, WebviewUrl::App(url.into()))
        .title("Agent 助手")
        .min_inner_size(1280.0, 780.0)
        .resizable(true)
        .decorations(false)
        .visible(false);

    let (w, h) = bounds.map(|b| (b.width, b.height)).unwrap_or((fallback_w, fallback_h));
    builder = builder.inner_size(w, h);

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
pub async fn get_agent_window_state(
    state: tauri::State<'_, WindowsState>,
) -> Result<Value, String> {
    let value = state
        .agent_window
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|s| serde_json::to_value(s).unwrap_or(Value::Null)));
    Ok(serde_json::json!({ "state": value }))
}

/// 主窗口 → Agent 窗口的桥接请求（getSelection / reviewRewrite / applyDraft）
/// 通过 event 转发到主窗口，等待 submit_agent_window_bridge_response 完成
#[tauri::command]
pub async fn submit_agent_window_bridge_request(
    app: AppHandle,
    state: tauri::State<'_, WindowsState>,
    request_id: String,
    bridge_type: String,
    chapter_id: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    if request_id.is_empty() || bridge_type.is_empty() || chapter_id.is_empty() {
        return Err("submit-agent-window-bridge-request 参数无效".into());
    }

    let (tx, rx) = oneshot::channel::<Result<Value, String>>();
    if let Ok(mut pending) = state.pending_agent_bridges.lock() {
        pending.insert(request_id.clone(), tx);
    } else {
        return Err("Agent 桥接队列锁失败".into());
    }

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口已关闭".to_string())?;

    main.emit(
        "agent:bridge-request",
        serde_json::json!({
            "requestId": request_id,
            "type": bridge_type,
            "chapterId": chapter_id,
            "payload": payload,
        }),
    )
    .map_err(|e| e.to_string())?;

    let response = tokio::time::timeout(Duration::from_millis(AGENT_BRIDGE_TIMEOUT_MS), rx).await;

    if let Ok(mut pending) = state.pending_agent_bridges.lock() {
        pending.remove(&request_id);
    }

    match response {
        Ok(Ok(Ok(value))) => Ok(value),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_)) => Err("Agent 桥接请求被取消".into()),
        Err(_) => Err("Agent 桥接请求超时".into()),
    }
}

#[tauri::command]
pub async fn submit_agent_window_bridge_response(
    state: tauri::State<'_, WindowsState>,
    request_id: String,
    success: bool,
    result: Option<Value>,
    error: Option<String>,
) -> Result<bool, String> {
    let sender = if let Ok(mut pending) = state.pending_agent_bridges.lock() {
        pending.remove(&request_id)
    } else {
        return Ok(false);
    };
    let Some(sender) = sender else { return Ok(false) };

    let payload = if success {
        Ok(result.unwrap_or(Value::Null))
    } else {
        Err(error.unwrap_or_else(|| "Agent 桥接执行失败".to_string()))
    };
    let _ = sender.send(payload);
    Ok(true)
}
