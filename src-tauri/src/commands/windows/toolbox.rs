// 工具箱独立窗口 — 贴在主窗口右侧的小型九宫格面板
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const TOOLBOX_LABEL: &str = "toolbox-window";
const WIDTH: f64 = 290.0;
const HEIGHT: f64 = 240.0;

fn compute_position(app: &AppHandle) -> (f64, f64) {
    let Some(main) = app.get_webview_window("main") else {
        return (100.0, 100.0);
    };
    let Ok(pos) = main.outer_position() else {
        return (100.0, 100.0);
    };
    let Ok(size) = main.outer_size() else {
        return (100.0, 100.0);
    };
    // outer_position / outer_size 返回物理像素，set_position(LogicalPosition) 需要逻辑像素
    // 必须除以 scale_factor 才能在高 DPI 屏幕上正确贴边
    let scale = main.scale_factor().unwrap_or(1.0);
    // 紧贴主窗口右边缘（Windows 无边框窗口 outer_size 包含隐藏阴影边距，减 18px 物理像素补偿）
    let x = (pos.x as f64 + size.width as f64 - 18.0) / scale;
    let y = (pos.y as f64 + 80.0) / scale;
    (x, y)
}

#[tauri::command]
pub async fn toolbox_open(app: AppHandle) -> Result<serde_json::Value, String> {
    if let Some(win) = app.get_webview_window(TOOLBOX_LABEL) {
        // 已存在 → 重新定位 + 显示
        let (x, y) = compute_position(&app);
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_focus();
        return Ok(serde_json::json!({ "ok": true }));
    }

    let (x, y) = compute_position(&app);

    let mut builder = WebviewWindowBuilder::new(
        &app,
        TOOLBOX_LABEL,
        WebviewUrl::App("toolbox.html".into()),
    )
    .title("工具箱")
    .inner_size(WIDTH, HEIGHT)
    .position(x, y)
    .resizable(false)
    .decorations(false);

    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.transparent(true);
    }

    let window = builder
        .always_on_top(true)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    // 关闭时只 hide，不销毁
    let app_for_close = app.clone();
    window.on_window_event(move |ev| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
            api.prevent_close();
            if let Some(w) = app_for_close.get_webview_window(TOOLBOX_LABEL) {
                let _ = w.hide();
            }
        }
    });

    // 监听主窗口移动/缩放，实时跟随
    let app_for_follow = app.clone();
    if let Some(main) = app.get_webview_window("main") {
        main.on_window_event(move |ev| {
            match ev {
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                    if let Some(tb) = app_for_follow.get_webview_window(TOOLBOX_LABEL) {
                        if tb.is_visible().unwrap_or(false) {
                            let (nx, ny) = compute_position(&app_for_follow);
                            let _ = tb.set_position(tauri::LogicalPosition::new(nx, ny));
                        }
                    }
                }
                _ => {}
            }
        });
    }

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn toolbox_hide(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(TOOLBOX_LABEL) {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 工具箱内按钮点击回调 — 转发到主窗口执行对应动作
#[tauri::command]
pub async fn toolbox_action(app: AppHandle, action: String) -> Result<(), String> {
    // 先隐藏工具箱
    if let Some(win) = app.get_webview_window(TOOLBOX_LABEL) {
        let _ = win.hide();
    }
    // 只通知主窗口执行动作（不用 app.emit 避免重复触发）
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("toolbox:action", action);
    }
    Ok(())
}
