// 多窗口共享工具：bounds 持久化、focus、URL 编码
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

/// 窗口尺寸 + 位置（落盘到 userData 子文件）
#[derive(Debug, Clone, Copy, Deserialize)]
pub(super) struct WindowBounds {
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
}

pub(super) fn state_path(app: &AppHandle, file: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(file)
}

pub(super) fn read_bounds(path: &Path, min_w: f64, min_h: f64) -> Option<WindowBounds> {
    let raw = std::fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let width = value.get("width")?.as_f64()?;
    let height = value.get("height")?.as_f64()?;
    if width < min_w || height < min_h {
        return None;
    }
    let x = value.get("x").and_then(|v| v.as_f64());
    let y = value.get("y").and_then(|v| v.as_f64());
    Some(WindowBounds { width, height, x, y })
}

pub(super) fn save_bounds(window: &tauri::WebviewWindow, path: &Path) {
    let Ok(size) = window.outer_size() else { return };
    let Ok(pos) = window.outer_position() else { return };
    // outer_size / outer_position 返回物理像素，存储时转为逻辑像素
    // 确保 read_bounds 恢复的值可直接传给 .position() / .inner_size()
    let scale = window.scale_factor().unwrap_or(1.0);
    let bounds = serde_json::json!({
        "width": size.width as f64 / scale,
        "height": size.height as f64 / scale,
        "x": pos.x as f64 / scale,
        "y": pos.y as f64 / scale,
    });
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(&bounds) {
        let _ = std::fs::write(path, text);
    }
}

/// 在窗口的 resize/move/close 事件上自动保存 bounds
pub(super) fn bind_save_handler(window: tauri::WebviewWindow, path: PathBuf) {
    let win = window.clone();
    let path_clone = path;
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
            save_bounds(&win, &path_clone);
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            save_bounds(&win, &path_clone);
        }
        _ => {}
    });
}

/// 窗口已存在时聚焦它，并 500ms 后清除"置顶"标记
pub(super) fn focus_existing_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if !window.is_visible().unwrap_or(false) {
        window.show().map_err(|e| e.to_string())?;
    }
    window.set_focus().map_err(|e| e.to_string())?;
    let _ = window.set_always_on_top(true);
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_always_on_top(false);
        }
    });
    Ok(())
}

/// 简单 URL encode（仅 percent-encode 非保留字符）
pub(super) fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}
