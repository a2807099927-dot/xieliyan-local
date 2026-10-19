// 小说实验室独立窗口
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use super::common::focus_existing_window;
use super::state::NOVEL_LAB_WINDOW_LABEL;

const NOVEL_BROWSER_LABEL: &str = "novel-browser";

/// 关窗前先把内嵌浏览器 child webview 关掉，否则 webview2 在 Windows 上
/// 会因为父窗口尚有 child 而拒绝关闭，表现为 X 按钮无响应。
fn close_child_webview(app: &AppHandle) {
    if let Some(child) = app.webviews().into_iter().find_map(|(label, wv)| {
        if label == NOVEL_BROWSER_LABEL {
            Some(wv)
        } else {
            None
        }
    }) {
        let _ = child.close();
    }
}

#[tauri::command]
pub async fn open_novel_lab_window(app: AppHandle) -> Result<bool, String> {
    // 窗口已存在（可能是隐藏状态）：直接 show + focus，不重建。
    if let Some(window) = app.get_webview_window(NOVEL_LAB_WINDOW_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        focus_existing_window(&window)?;
        // 通知前端窗口已重新显示，需要重建 child webview
        let _ = window.emit("novel-lab:window-reshown", ());
        return Ok(true);
    }

    // 防御性清理：如果 get_webview_window 找不到但 label 仍被占用（异步销毁竞态），
    // 先强制关闭残留的 webview/window，再重建。
    if let Some(wv) = app.webviews().into_iter().find_map(|(l, w)| if l == NOVEL_LAB_WINDOW_LABEL { Some(w) } else { None }) {
        let _ = wv.close();
        // 等一小段时间让 OS 释放资源
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let url = "index.html?novelLabDetached=1";
    let window =
        WebviewWindowBuilder::new(&app, NOVEL_LAB_WINDOW_LABEL, WebviewUrl::App(url.into()))
            .title("小说实验室")
            .inner_size(1400.0, 1000.0)
            .min_inner_size(1100.0, 750.0)
            .resizable(true)
            .decorations(false)
            .center()
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;

    // 修复：拦截关闭事件，不销毁窗口，只隐藏。
    // 旧逻辑直接销毁，导致再次打开时 Tauri 异步销毁期间仍能 get_webview_window，
    // 走 focus 分支但窗口已死，表现为"再次点击无反应"。
    let app_clone = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // 先关闭 child webview，再隐藏父窗口
            close_child_webview(&app_clone);
            api.prevent_close();
            if let Some(w) = app_clone.get_webview_window(NOVEL_LAB_WINDOW_LABEL) {
                let _ = w.hide();
            }
        }
    });

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}
