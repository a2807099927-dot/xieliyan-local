// UI 全局缩放协调器 — 对应 electron/scale-coordinator.ts
// 实现：tauri::Webview::set_zoom() 把缩放应用到所有打开的 webview，并持久化到 userData。
// 离散档位与主项目保持一致：[0.5, 0.67, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0]

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

const SCALE_FILE: &str = "ui-scale.json";
const DEFAULT_SCALE: f64 = 1.0;
const MIN_SCALE: f64 = 0.5;
const MAX_SCALE: f64 = 2.0;
const SCALE_STEPS: &[f64] = &[
    0.5, 0.67, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 1.75, 2.0,
];

#[derive(Default)]
pub struct ScaleState {
    pub current: Mutex<f64>,
}

impl ScaleState {
    pub fn new() -> Self {
        Self {
            current: Mutex::new(DEFAULT_SCALE),
        }
    }
}

fn scale_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(SCALE_FILE)
}

fn detect_default_scale_by_resolution(app: &AppHandle) -> f64 {
    let monitor = app.get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    if let Some(mon) = monitor {
        let size = mon.size(); // 物理像素尺寸
        if size.width <= 1366 || size.height <= 768 {
            crate::logger::warn(format!("[scale] Low resolution screen detected ({:?}), auto scaling to 0.75", size));
            return 0.75;
        } else if size.width <= 1920 || size.height <= 1080 {
            crate::logger::warn(format!("[scale] 1K screen detected ({:?}), auto scaling to 0.85", size));
            return 0.85;
        }
    }
    DEFAULT_SCALE
}

fn load_scale_from_disk(app: &AppHandle) -> f64 {
    let path = scale_path(app);
    if path.exists() {
        let raw = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => return detect_default_scale_by_resolution(app),
        };
        let value: serde_json::Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => return detect_default_scale_by_resolution(app),
        };
        let scale = value.get("scale").and_then(|v| v.as_f64()).unwrap_or_else(|| detect_default_scale_by_resolution(app));
        clamp_scale(scale)
    } else {
        let default_scale = detect_default_scale_by_resolution(app);
        // 第一次检测后，自动存盘，方便用户后续自行调整
        save_scale_to_disk(app, default_scale);
        default_scale
    }
}

fn save_scale_to_disk(app: &AppHandle, scale: f64) {
    let path = scale_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, json!({ "scale": scale }).to_string());
}

fn clamp_scale(scale: f64) -> f64 {
    let s = scale.clamp(MIN_SCALE, MAX_SCALE);
    (s * 100.0).round() / 100.0
}

fn find_next_step(current: f64, direction: i8) -> f64 {
    if direction > 0 {
        for &step in SCALE_STEPS {
            if step > current + 0.01 {
                return step;
            }
        }
        SCALE_STEPS[SCALE_STEPS.len() - 1]
    } else {
        for &step in SCALE_STEPS.iter().rev() {
            if step < current - 0.01 {
                return step;
            }
        }
        SCALE_STEPS[0]
    }
}

fn apply_to_all(app: &AppHandle, scale: f64) {
    for (_label, window) in app.webview_windows() {
        let _ = window.set_zoom(scale);
    }
    let _ = app.emit("scale:changed", scale);
}

/// 应用初始化阶段加载持久化缩放并应用到主窗口
pub fn init_scale(app: &AppHandle) {
    let saved = load_scale_from_disk(app);
    let state: tauri::State<'_, ScaleState> = app.state();
    *state.current.lock().unwrap_or_else(|e| e.into_inner()) = saved;
    apply_to_all(app, saved);
}

#[tauri::command]
pub async fn scale_get(state: tauri::State<'_, ScaleState>) -> Result<f64, String> {
    Ok(*state.current.lock().unwrap_or_else(|e| e.into_inner()))
}

#[tauri::command]
pub async fn scale_set(
    app: AppHandle,
    state: tauri::State<'_, ScaleState>,
    scale: f64,
) -> Result<f64, String> {
    let next = clamp_scale(scale);
    *state.current.lock().unwrap_or_else(|e| e.into_inner()) = next;
    apply_to_all(&app, next);
    save_scale_to_disk(&app, next);
    Ok(next)
}

#[tauri::command]
pub async fn scale_zoom_in(
    app: AppHandle,
    state: tauri::State<'_, ScaleState>,
) -> Result<f64, String> {
    let next = {
        let mut current = state.current.lock().unwrap_or_else(|e| e.into_inner());
        let n = find_next_step(*current, 1);
        *current = n;
        n
    };
    apply_to_all(&app, next);
    save_scale_to_disk(&app, next);
    Ok(next)
}

#[tauri::command]
pub async fn scale_zoom_out(
    app: AppHandle,
    state: tauri::State<'_, ScaleState>,
) -> Result<f64, String> {
    let next = {
        let mut current = state.current.lock().unwrap_or_else(|e| e.into_inner());
        let n = find_next_step(*current, -1);
        *current = n;
        n
    };
    apply_to_all(&app, next);
    save_scale_to_disk(&app, next);
    Ok(next)
}

#[tauri::command]
pub async fn scale_reset(
    app: AppHandle,
    state: tauri::State<'_, ScaleState>,
) -> Result<f64, String> {
    *state.current.lock().unwrap_or_else(|e| e.into_inner()) = DEFAULT_SCALE;
    apply_to_all(&app, DEFAULT_SCALE);
    save_scale_to_disk(&app, DEFAULT_SCALE);
    Ok(DEFAULT_SCALE)
}
