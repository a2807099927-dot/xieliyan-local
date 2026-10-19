// NovelLab 内嵌浏览器 — 在 NovelLab 独立窗口内创建一个 child webview
// 加载笔趣阁等小说站点，前端通过位置同步把它"贴在" BrowserPanel 占位 div 的位置

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl,
    WebviewWindowBuilder,
};

use super::state::{ChildInfo, EmbeddedState};

const PARENT_LABEL: &str = "novel-lab-window";
const CHILD_LABEL: &str = "novel-browser";
/// Agent 独立隐藏 webview（不依赖 NovelLab 窗口，P2-C1）
const AGENT_BROWSER_LABEL: &str = "agent-webview";
const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Deserialize)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 通过 label 查找 child webview（Tauri 2 没有 `app.get_webview` API，
/// 但能拿到所有 webviews 然后按 label 匹配）
fn find_child_webview(app: &AppHandle, label: &str) -> Option<tauri::Webview> {
    app.webviews().into_iter().find_map(|(l, w)| {
        if l == label {
            Some(w)
        } else {
            None
        }
    })
}

/// 打开 NovelLab 内嵌浏览器（贴在 BrowserPanel 占位 div 的位置）
/// - 已存在则只 navigate + reposition
/// - 不存在则创建 child webview
#[tauri::command]
pub async fn novel_browser_open(
    app: AppHandle,
    state: tauri::State<'_, EmbeddedState>,
    url: String,
    region: Region,
) -> Result<bool, String> {
    let parent = app
        .get_webview_window(PARENT_LABEL)
        .ok_or_else(|| "小说实验室窗口未打开".to_string())?;

    let target_url = if url.is_empty() {
        "https://m.bqgl.cc/".to_string()
    } else {
        url
    };

    // 已存在 child webview → 只重定向 + 重排位置
    if let Some(existing) = find_child_webview(&app, CHILD_LABEL) {
        if let Ok(parsed) = target_url.parse::<url::Url>() {
            let _ = existing.navigate(parsed);
        }
        let _ = existing.set_position(LogicalPosition::new(region.x, region.y));
        let _ = existing.set_size(LogicalSize::new(region.width.max(1.0), region.height.max(1.0)));
        return Ok(true);
    }

    // 创建新 child webview
    let url_parsed: url::Url = target_url
        .parse()
        .map_err(|e: url::ParseError| format!("URL 解析失败: {}", e))?;

    let builder = WebviewBuilder::new(CHILD_LABEL, WebviewUrl::External(url_parsed))
        .user_agent(DEFAULT_UA)
        .auto_resize();

    let position = LogicalPosition::new(region.x, region.y);
    let size = LogicalSize::new(region.width.max(1.0), region.height.max(1.0));

    // WebviewWindow 不直接暴露 add_child，要先拿底层 Window
    parent
        .as_ref()
        .window()
        .add_child(builder, position, size)
        .map_err(|e| format!("创建 child webview 失败: {}", e))?;

    if let Ok(mut map) = state.active_labels.lock() {
        map.insert(
            CHILD_LABEL.to_string(),
            ChildInfo {
                child_label: CHILD_LABEL.to_string(),
                parent_window: PARENT_LABEL.to_string(),
            },
        );
    }

    Ok(true)
}

/// 重排位置（NovelLab 窗口 resize 时调用）
#[tauri::command]
pub async fn novel_browser_set_region(
    app: AppHandle,
    region: Region,
) -> Result<bool, String> {
    let Some(child) = find_child_webview(&app, CHILD_LABEL) else {
        return Ok(false);
    };
    let _ = child.set_position(LogicalPosition::new(region.x, region.y));
    let _ = child.set_size(LogicalSize::new(region.width.max(1.0), region.height.max(1.0)));
    Ok(true)
}

/// 跳转到新 URL
#[tauri::command]
pub async fn novel_browser_navigate(app: AppHandle, url: String) -> Result<bool, String> {
    let Some(child) = find_child_webview(&app, CHILD_LABEL) else {
        return Err("内嵌浏览器未打开".into());
    };
    let target = if url.starts_with("http") {
        url
    } else {
        format!("https://{}", url)
    };
    let parsed: url::Url = target
        .parse()
        .map_err(|e: url::ParseError| format!("URL 瑙ｆ瀽澶辫触: {}", e))?;
    child.navigate(parsed).map_err(|e| e.to_string())?;
    Ok(true)
}

/// child webview → 主窗口的执行结果回传通道（通过 __TAURI_INTERNALS__.invoke 调过来）
/// child webview 跨域时如果 Tauri runtime 已注入则走这条路；否则走 nb-bridge:// 协议
#[tauri::command]
pub async fn novel_browser_exec_response(
    app: AppHandle,
    request_id: String,
    success: bool,
    result: Option<Value>,
    error: Option<String>,
) -> Result<bool, String> {
    use tauri::Emitter;
    let payload = json!({
        "requestId": request_id,
        "success": success,
        "result": result,
        "error": error,
    });
    if let Some(parent) = app.get_webview_window(PARENT_LABEL) {
        let _ = parent.emit("novel-browser:exec-response", payload.clone());
    }
    let _ = app.emit("novel-browser:exec-response", payload);
    Ok(true)
}

/// 在 child webview 里执行 JS（异步返回结果）
/// 主项目 Electron `webview.executeJavaScript` 等价物
///
/// 多通道兜底（任何一条到达即可）：
///   1) `__TAURI_INTERNALS__.invoke('novel_browser_exec_response', ...)` — 跨域页面有时会被注入
///   2) `navigator.sendBeacon('http://nb-bridge.localhost/...')` — 自定义 URI 协议回调
///   3) `fetch(... no-cors)`
///   4) `<img src="...">` — 受 img-src CSP 控制，最宽松
#[tauri::command]
pub async fn novel_browser_execute_js(
    app: AppHandle,
    code: String,
    request_id: String,
) -> Result<Value, String> {
    let Some(child) = find_child_webview(&app, CHILD_LABEL) else {
        return Err("内嵌浏览器未打开".into());
    };

    let wrapped = format!(
        r#"(async () => {{
            var __reqId = {req_id_lit};
            var __sent = false;
            function __nbReport(payload) {{
                if (__sent) return;
                __sent = true;
                // 通道 1：直接 invoke（如果 Tauri runtime 已注入到 child）
                try {{
                    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {{
                        window.__TAURI_INTERNALS__.invoke('novel_browser_exec_response', payload).catch(function () {{}});
                    }}
                }} catch (e) {{}}
                // 通道 2/3/4：自定义协议 URL（跨域页面也能触发）
                var url;
                try {{ url = 'http://nb-bridge.localhost/exec-result?p=' + encodeURIComponent(JSON.stringify(payload)); }}
                catch (e) {{ return; }}
                try {{ if (navigator.sendBeacon && navigator.sendBeacon(url)) {{}} }} catch (e) {{}}
                try {{ fetch(url, {{ method: 'GET', mode: 'no-cors', keepalive: true, credentials: 'omit' }}).catch(function () {{}}); }} catch (e) {{}}
                try {{ var img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = url; }} catch (e) {{}}
            }}
            try {{
                var __result = await (async () => {{ return ({code}); }})();
                __nbReport({{ requestId: __reqId, success: true, result: __result === undefined ? null : __result }});
            }} catch (err) {{
                __nbReport({{ requestId: __reqId, success: false, error: String(err && err.message ? err.message : err) }});
            }}
        }})();"#,
        code = code,
        req_id_lit = serde_json::to_string(&request_id).unwrap_or_else(|_| "''".into()),
    );

    child.eval(&wrapped).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "requestId": request_id }))
}

/// 关闭内嵌浏览器（NovelLab 切换到其他视图或卸载时调用）
#[tauri::command]
pub async fn novel_browser_close(
    app: AppHandle,
    state: tauri::State<'_, EmbeddedState>,
) -> Result<bool, String> {
    if let Some(child) = find_child_webview(&app, CHILD_LABEL) {
        let _ = child.close();
    }
    if let Ok(mut map) = state.active_labels.lock() {
        map.remove(CHILD_LABEL);
    }
    Ok(true)
}

/// 暂时隐藏（移到屏幕外，比关闭更轻量；显示时只需要 set_region 移回来）
#[tauri::command]
pub async fn novel_browser_hide(app: AppHandle) -> Result<bool, String> {
    if let Some(child) = find_child_webview(&app, CHILD_LABEL) {
        let _ = child.set_position(LogicalPosition::new(-99999.0, -99999.0));
    }
    Ok(true)
}

/// Agent 独立隐藏 webview：打开 URL（不依赖 NovelLab 窗口，P2-C1）
/// - 已存在 agent-webview → 只 navigate
/// - 不存在 → 创建不可见独立窗口承载该网页
#[tauri::command]
pub async fn agent_browser_open(app: AppHandle, url: String) -> Result<bool, String> {
    let target = if url.trim().is_empty() {
        return Err("agent_browser_open 需要 url".into());
    } else {
        url
    };

    if let Some(existing) = find_child_webview(&app, AGENT_BROWSER_LABEL) {
        if let Ok(parsed) = target.parse::<url::Url>() {
            let _ = existing.navigate(parsed);
        }
        return Ok(true);
    }

    let parsed: url::Url = target
        .parse()
        .map_err(|e: url::ParseError| format!("URL 解析失败: {}", e))?;

    // 创建不可见的独立窗口承载网页；execute_js 回传走全局 emit，不依赖 NovelLab
    WebviewWindowBuilder::new(&app, AGENT_BROWSER_LABEL, WebviewUrl::External(parsed))
        .user_agent(DEFAULT_UA)
        .inner_size(1280.0, 1600.0)
        .visible(false)
        .build()
        .map_err(|e| format!("创建 Agent webview 失败: {}", e))?;

    Ok(true)
}

/// Agent 独立 webview：跳转到新 URL
#[tauri::command]
pub async fn agent_browser_navigate(app: AppHandle, url: String) -> Result<bool, String> {
    let Some(child) = find_child_webview(&app, AGENT_BROWSER_LABEL) else {
        return Err("Agent 浏览器未打开".into());
    };
    let target = if url.starts_with("http") {
        url
    } else {
        format!("https://{}", url)
    };
    let parsed: url::Url = target
        .parse()
        .map_err(|e: url::ParseError| format!("URL 解析失败: {}", e))?;
    child.navigate(parsed).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Agent 独立 webview：执行 JS 并回传结果
/// 回传通道复用 novel_browser_execute_js 的多通道方案（全局 emit / nb-bridge），
/// 但目标是 agent-webview；前端监听全局 'novel-browser:exec-response' 事件即可收到。
#[tauri::command]
pub async fn agent_browser_execute_js(
    app: AppHandle,
    code: String,
    request_id: String,
) -> Result<Value, String> {
    let Some(child) = find_child_webview(&app, AGENT_BROWSER_LABEL) else {
        return Err("Agent 浏览器未打开".into());
    };

    let wrapped = format!(
        r#"(async () => {{
            var __reqId = {req_id_lit};
            var __sent = false;
            function __nbReport(payload) {{
                if (__sent) return;
                __sent = true;
                try {{
                    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {{
                        window.__TAURI_INTERNALS__.invoke('novel_browser_exec_response', payload).catch(function () {{}});
                    }}
                }} catch (e) {{}}
                var url;
                try {{ url = 'http://nb-bridge.localhost/exec-result?p=' + encodeURIComponent(JSON.stringify(payload)); }}
                catch (e) {{ return; }}
                try {{ if (navigator.sendBeacon && navigator.sendBeacon(url)) {{}} }} catch (e) {{}}
                try {{ fetch(url, {{ method: 'GET', mode: 'no-cors', keepalive: true, credentials: 'omit' }}).catch(function () {{}}); }} catch (e) {{}}
                try {{ var img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = url; }} catch (e) {{}}
            }}
            try {{
                var __result = await (async () => {{ return ({code}); }})();
                __nbReport({{ requestId: __reqId, success: true, result: __result === undefined ? null : __result }});
            }} catch (err) {{
                __nbReport({{ requestId: __reqId, success: false, error: String(err && err.message ? err.message : err) }});
            }}
        }})();"#,
        code = code,
        req_id_lit = serde_json::to_string(&request_id).unwrap_or_else(|_| "''".into()),
    );

    child.eval(&wrapped).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "requestId": request_id }))
}

/// 关闭 Agent 独立 webview
#[tauri::command]
pub async fn agent_browser_close(app: AppHandle) -> Result<bool, String> {
    if let Some(child) = find_child_webview(&app, AGENT_BROWSER_LABEL) {
        let _ = child.close();
    }
    Ok(true)
}
