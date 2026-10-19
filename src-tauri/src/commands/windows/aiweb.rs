use std::sync::{Mutex, OnceLock};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalSize, WebviewBuilder,
    WebviewUrl, WebviewWindowBuilder, Window,
};
use url::Url;

use super::common::{bind_save_handler, read_bounds, state_path};
use super::state::{AIWEB_WINDOW_LABEL, AIWEB_WINDOW_STATE_FILE};

/// shell 页脚本初始化器：在 aiweb-shell.html 任何脚本运行前注入。
///
/// 解决 release 模式下导航点击无响应的问题，原因可能涉及：
///   - `__TAURI_INTERNALS__.invoke` 受到 CSP / 同源策略影响
///   - `WebviewUrl::App("xxx.html?q=1")` 在 release 下 PathBuf 处理不一致
///   - mixed-content：release 主页可能是 https，而 bridge fallback 是 http
///
/// 注入后页面只需调用 `window.xlyAiwebSend(action)`，所有兜底由这里搞定。
fn shell_init_script(active: &str) -> String {
    let active_json = serde_json::to_string(active).unwrap_or_else(|_| "\"chatgpt\"".into());
    format!(
        r#"
(function () {{
  window.__xlyActiveAi = {active_lit};

  function bridgeFetch(action) {{
    var payload = encodeURIComponent(action);
    var urls = [
      'http://aiweb-bridge.localhost/shell?a=' + payload,
      'https://aiweb-bridge.localhost/shell?a=' + payload,
      'aiweb-bridge://localhost/shell?a=' + payload
    ];
    var sent = false;
    for (var i = 0; i < urls.length && !sent; i++) {{
      try {{ if (navigator.sendBeacon && navigator.sendBeacon(urls[i])) sent = true; }} catch (e) {{}}
    }}
    if (!sent) {{
      for (var j = 0; j < urls.length; j++) {{
        try {{ fetch(urls[j], {{ method: 'POST', mode: 'no-cors', keepalive: true }}).catch(function () {{}}); }} catch (e) {{}}
      }}
    }}
    try {{ var img = new Image(); img.src = urls[0] + '&t=' + Date.now(); }} catch (e) {{}}
  }}

  function invokeAction(action) {{
    try {{
      var t = window.__TAURI_INTERNALS__;
      if (t && typeof t.invoke === 'function') {{
        var p = t.invoke('aiweb_shell_action', {{ action: action }});
        if (p && typeof p.catch === 'function') {{
          p.catch(function () {{ bridgeFetch(action); }});
        }}
        return;
      }}
    }} catch (e) {{}}
    bridgeFetch(action);
  }}

  window.xlyAiwebSend = invokeAction;
}})();
"#,
        active_lit = active_json
    )
}

const DEFAULT_AIWEB_URL: &str = "https://chatgpt.com/";
const AIWEB_SITE_LABEL: &str = "aiweb-site";
const HEADER_HEIGHT: f64 = 38.0;

// 保持 UA 与当前真实 Chrome 版本同步（2025-05 约为 136）
const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

// 在任何页面脚本之前注入，消除 WebView2 的自动化特征指纹。
// AI Studio / Gemini 等 Google 服务在生成请求时会做客户端环境校验，
// WebView2 默认暴露 navigator.webdriver=true + chrome.runtime 残缺，
// 两者都会触发 "permission denied / internal error"。
const ANTI_DETECT_JS: &str = r#"(function () {
  // 1. 清除最强烈的自动化信号 — webdriver 标志
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch (_) {}

  // 2. 补全 window.chrome（WebView2 缺少 runtime 等子对象）
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
    };
  }
  if (!window.chrome.app) {
    window.chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    };
  }

  // 3. 修复 Permissions API — AI Studio 会查 notifications 权限；
  //    WebView2 的实现可能返回异常值引起校验失败
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const _origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (params) {
        if (params && params.name === 'notifications') {
          return Promise.resolve({ state: 'default', onchange: null });
        }
        return _origQuery(params);
      };
    }
  } catch (_) {}

  // 4. 确保语言列表不为空（WebView2 有时返回 []）
  try {
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
        configurable: true,
      });
    }
  } catch (_) {}
})();
"#;

const MIN_WIDTH: f64 = 360.0;
const MIN_HEIGHT: f64 = 420.0;
const DEFAULT_WIDTH: f64 = 520.0;
const DEFAULT_HEIGHT: f64 = 820.0;
static AIWEB_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn parse_external_url(raw: Option<String>) -> Result<Url, String> {
    let url = raw
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_AIWEB_URL);
    let parsed = Url::parse(url).map_err(|e| format!("AI 网页 URL 无效: {e}"))?;
    match parsed.scheme() {
        "https" | "http" => Ok(parsed),
        _ => Err("AI 网页只允许打开 http/https 地址".into()),
    }
}

fn site_id_from_url(url: &Url) -> &'static str {
    let host = url.host_str().unwrap_or("");
    if host.contains("gemini.google.com") {
        "gemini"
    } else if host.contains("aistudio.google.com") {
        "aistudio"
    } else if host.contains("claude.ai") {
        "claude"
    } else {
        "chatgpt"
    }
}

fn site_url_from_id(id: &str) -> &'static str {
    match id {
        "gemini" => "https://gemini.google.com/app",
        "aistudio" => "https://aistudio.google.com/prompts/new_chat",
        "claude" => "https://claude.ai/new",
        _ => DEFAULT_AIWEB_URL,
    }
}

fn existing_shell(app: &AppHandle) -> Option<tauri::Webview> {
    app.webviews().into_iter().find_map(|(label, webview)| {
        if label == AIWEB_WINDOW_LABEL {
            Some(webview)
        } else {
            None
        }
    })
}

fn existing_site(app: &AppHandle) -> Option<tauri::Webview> {
    app.webviews().into_iter().find_map(|(label, webview)| {
        if label == AIWEB_SITE_LABEL {
            Some(webview)
        } else {
            None
        }
    })
}

pub fn handle_aiweb_shell_action(app: &AppHandle, action: &str) {
    crate::logger::warn(format!("[aiweb-shell-action] {}", action));

    if let Some(site_id) = action.strip_prefix("switch:") {
        let url_str = site_url_from_id(site_id);
        if let Ok(url) = Url::parse(url_str) {
            if let Some(shell) = existing_shell(app) {
                let host = shell.window();
                let _ = host.show();
                let _ = host.set_focus();
                let _ = ensure_site_child(app, &host, site_id, url);
                if let Ok(site_json) = serde_json::to_string(site_id) {
                    let _ = shell.eval(&format!(
                        "try{{setActive({site_json});localStorage.setItem('xly_aiweb_active',{site_json});}}catch(_){{}}"
                    ));
                }
            } else if let Some(child) = existing_site(app) {
                let _ = child.navigate(url);
            }
        }
        emit_inject_request(app);
    } else if action == "hide" {
        if let Some(shell) = existing_shell(app) {
            let _ = shell.window().hide();
        }
        // 通知主窗口取消按钮高亮
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.emit("aiweb:hidden", ());
        }
        let _ = app.emit("aiweb:hidden", ());
    } else if action == "reload" {
        if let Some(child) = existing_site(app) {
            let _ = child.eval("window.location.reload()");
        }
    }

    let _ = app.emit_to(AIWEB_WINDOW_LABEL, "aiweb:shell-action", action.to_string());
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("aiweb:shell-action", action.to_string());
    }
    let _ = app.emit("aiweb:shell-action", action.to_string());
}

fn emit_inject_request(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("aiweb:inject-scripts", ());
    }
}

/// 计算 child webview 在父窗口下的逻辑尺寸（顶部预留 HEADER_HEIGHT 给 shell 标签栏）。
///
/// 修复点（v1.6.10）：
/// `window.inner_size()` 返回的是 **物理像素**，
/// 而 `LogicalSize` 期望的是 **逻辑像素**。
/// 在 125%/150%/200% 等高 DPI 显示器上两者比例不一致，
/// 直接传值会导致 child webview 比 shell 大 1.25 ~ 2x，
/// 把切换按钮（在顶部 38px 区域）整个挡住，看起来就是"按钮没反应"。
///
/// 这里通过 `scale_factor()` 把物理像素转回逻辑像素再返回。
fn child_size(window: &Window) -> (f64, f64) {
    let Ok(size) = window.inner_size() else {
        return (DEFAULT_WIDTH, DEFAULT_HEIGHT - HEADER_HEIGHT);
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical: LogicalSize<f64> = PhysicalSize::new(size.width as f64, size.height as f64)
        .to_logical(scale);
    (
        logical.width.max(1.0),
        (logical.height - HEADER_HEIGHT).max(1.0),
    )
}

fn layout_child(window: &Window, child: &tauri::Webview) {
    let (width, height) = child_size(window);
    let _ = child.set_position(LogicalPosition::new(0.0, HEADER_HEIGHT));
    let _ = child.set_size(LogicalSize::new(width, height));
}

fn ensure_site_child(
    app: &AppHandle,
    parent: &Window,
    site_id: &str,
    url: Url,
) -> Result<(), String> {
    crate::logger::warn(format!(
        "[aiweb] created child site:{site_id} url:{}",
        url.as_str()
    ));

    if let Some(child) = existing_site(app) {
        layout_child(parent, &child);
        child.navigate(url.clone()).map_err(|e| e.to_string())?;
        crate::logger::warn(format!("[aiweb] navigated child to {}", url.as_str()));
        return Ok(());
    }

    let (width, height) = child_size(parent);
    let builder = WebviewBuilder::new(AIWEB_SITE_LABEL, WebviewUrl::External(url.clone()))
        .user_agent(DEFAULT_UA)
        .initialization_script(ANTI_DETECT_JS);

    parent
        .add_child(
            builder,
            LogicalPosition::new(0.0, HEADER_HEIGHT),
            LogicalSize::new(width, height),
        )
        .map_err(|e| format!("创建 AI 网页 child webview 失败: {e}"))?;

    if let Some(child) = existing_site(app) {
        layout_child(parent, &child);
    }

    Ok(())
}

fn compute_right_docked_bounds(
    app: &AppHandle,
    preferred_width: f64,
    preferred_height: f64,
) -> (f64, f64, f64, f64) {
    let Some(main) = app.get_webview_window("main") else {
        return (80.0, 80.0, preferred_width, preferred_height);
    };
    let Ok(main_pos) = main.outer_position() else {
        return (80.0, 80.0, preferred_width, preferred_height);
    };
    let Ok(main_size) = main.outer_size() else {
        return (80.0, 80.0, preferred_width, preferred_height);
    };

    // outer_position / outer_size / monitor 返回物理像素，position() 需要逻辑像素
    let scale = main.scale_factor().unwrap_or(1.0);
    let monitor = main.current_monitor().ok().flatten();
    let (work_x, work_y, work_w, work_h) = monitor
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x as f64 / scale, p.y as f64 / scale, s.width as f64 / scale, s.height as f64 / scale)
        })
        .unwrap_or((0.0, 0.0, 1920.0, 1080.0));

    let main_x = main_pos.x as f64 / scale;
    let main_y = main_pos.y as f64 / scale;
    let main_w = main_size.width as f64 / scale;
    let main_h = main_size.height as f64 / scale;
    let right_space = work_x + work_w - (main_x + main_w);
    let left_space = main_x - work_x;

    let mut width = preferred_width.clamp(MIN_WIDTH, 720.0);
    let x = if right_space >= MIN_WIDTH {
        width = width.min(right_space);
        main_x + main_w
    } else if left_space >= MIN_WIDTH {
        width = width.min(left_space);
        main_x - width
    } else {
        (main_x + main_w - width).min(work_x + work_w - width).max(work_x)
    };
    let y = main_y.max(work_y).min(work_y + work_h - MIN_HEIGHT);
    let height = preferred_height.min(main_h).min(work_y + work_h - y).max(MIN_HEIGHT);
    (x, y, width, height)
}

#[tauri::command]
pub async fn aiweb_open(
    app: AppHandle,
    url: Option<String>,
) -> Result<serde_json::Value, String> {
    let lock = AIWEB_OPEN_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let parsed = parse_external_url(url)?;
    let active_id = site_id_from_url(&parsed);

    if let Some(shell) = existing_shell(&app) {
        let host = shell.window();
        host.show().map_err(|e| e.to_string())?;
        let _ = host.set_focus();
        // 修复：hide→show 后 child webview 的位置/尺寸可能失效（偏移到屏幕外或尺寸为 0），
        // 需要在 show 后主动重新 layout，确保内容区域正确填充。
        if let Some(child) = existing_site(&app) {
            layout_child(&host, &child);
        }
        ensure_site_child(&app, &host, active_id, parsed)?;
        handle_aiweb_shell_action(&app, active_id);
        emit_inject_request(&app);
        return Ok(serde_json::json!({ "ok": true }));
    }

    let path = state_path(&app, AIWEB_WINDOW_STATE_FILE);
    let bounds = read_bounds(&path, MIN_WIDTH, MIN_HEIGHT);
    let (fallback_x, fallback_y, fallback_w, fallback_h) =
        compute_right_docked_bounds(&app, DEFAULT_WIDTH, DEFAULT_HEIGHT);

    let mut builder = WebviewWindowBuilder::new(
        &app,
        AIWEB_WINDOW_LABEL,
        WebviewUrl::App("aiweb-shell.html".into()),
    )
    .title("AI 网页")
    .initialization_script(&shell_init_script(active_id))
    .inner_size(
        bounds.map(|b| b.width).unwrap_or(fallback_w),
        bounds.map(|b| b.height).unwrap_or(fallback_h),
    )
    .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
    .resizable(true)
    .visible(true);

    if let Some(b) = bounds {
        if let (Some(x), Some(y)) = (b.x, b.y) {
            builder = builder.position(x, y);
        } else {
            builder = builder.position(fallback_x, fallback_y);
        }
    } else {
        builder = builder.position(fallback_x, fallback_y);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    bind_save_handler(window.clone(), path);
    let host_window = window.as_ref().window();
    ensure_site_child(&app, &host_window, active_id, parsed)?;

    let app_for_resize = app.clone();
    let window_for_resize = host_window.clone();
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Resized(_) => {
                for (label, child) in app_for_resize.webviews() {
                    if label == AIWEB_SITE_LABEL {
                        layout_child(&window_for_resize, &child);
                    }
                }
            }
            // 拦截关闭：不销毁，只 hide + 通知主窗口取消按钮高亮
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Some(shell) = existing_shell(&app_for_close) {
                    let _ = shell.window().hide();
                }
                if let Some(main) = app_for_close.get_webview_window("main") {
                    let _ = main.emit("aiweb:hidden", ());
                }
                let _ = app_for_close.emit("aiweb:hidden", ());
            }
            _ => {}
        }
    });

    let app_for_ready = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        emit_inject_request(&app_for_ready);
    });

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn aiweb_hide(app: AppHandle) -> Result<(), String> {
    if let Some(shell) = existing_shell(&app) {
        shell.window().hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn aiweb_reload(app: AppHandle) -> Result<(), String> {
    if let Some(child) = existing_site(&app) {
        child.eval("window.location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn aiweb_execute_js(
    app: AppHandle,
    webview: tauri::Webview,
    code: String,
) -> Result<serde_json::Value, String> {
    // 安全加固：按“调用方 webview 的 label”鉴别。
    // 注意：aiweb-site 是挂在 aiweb-window 下的子 webview，
    // 用 Window::label() 会拿到宿主窗口 label(aiweb-window)而漏掉它，
    // 所以必须用 Webview::label()。
    const UNTRUSTED_WEBVIEWS: [&str; 1] = ["aiweb-site"];
    if UNTRUSTED_WEBVIEWS.contains(&webview.label()) {
        return Err("forbidden: untrusted webview cannot execute js".into());
    }
    let Some(child) = existing_site(&app) else {
        return Ok(serde_json::Value::Null);
    };
    child.eval(&code).map_err(|e| e.to_string())?;
    Ok(serde_json::json!("ok"))
}

#[tauri::command]
pub async fn aiweb_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let Some(shell) = existing_shell(&app) else {
        return Ok(serde_json::json!({ "visible": false, "url": "", "exists": false }));
    };
    let visible = shell.window().is_visible().unwrap_or(false);
    Ok(serde_json::json!({
        "visible": visible,
        "url": "",
        "exists": true,
    }))
}

#[tauri::command]
pub async fn aiweb_shell_action(app: AppHandle, action: String) -> Result<(), String> {
    handle_aiweb_shell_action(&app, action.trim());
    Ok(())
}
