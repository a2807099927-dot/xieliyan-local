use serde_json::Value;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Emitter, Manager, UriSchemeContext};

/// 受信来源 webview label：AI 网页的 shell 窗口与子站点 webview 才允许调用。
/// 外部站点无法伪造 label，堵住"任意网页注入 shell action / web action"通道。
const ALLOWED_SOURCES: &[&str] = &["aiweb-site", "aiweb-window"];

pub fn handle_request(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let app = ctx.app_handle().clone();

    // 来源鉴权：fail-closed
    let source = ctx.webview_label();
    if !ALLOWED_SOURCES.contains(&source) {
        crate::logger::warn(format!(
            "[aiweb-bridge] 拒绝未授权来源的请求: webview_label={source}"
        ));
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new()));
    }

    let uri = request.uri().to_string();
    let qs = uri.split('?').nth(1).unwrap_or("");
    let mut payload_raw: Option<String> = None;
    let mut shell_action: Option<String> = None;

    for pair in qs.split('&') {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("");
        let value = kv.next().unwrap_or("");
        if key == "p" {
            payload_raw = Some(percent_decode(value));
            break;
        }
        if key == "a" {
            shell_action = Some(percent_decode(value));
        }
    }

    if let Some(action) = shell_action {
        crate::logger::warn(format!("[aiweb-bridge] shell action: {}", action));
        crate::commands::windows::handle_aiweb_shell_action(&app, &action);
    }

    if let Some(raw) = payload_raw {
        if serde_json::from_str::<Value>(&raw).is_ok() {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit("aiweb:web-action", raw.clone());
            }
            let _ = app.emit("aiweb:web-action", raw);
        } else {
            crate::logger::error(format!("[aiweb-bridge] invalid JSON: {}", raw));
        }
    }

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "*")
        .header("Cache-Control", "no-store")
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        if b == b'%' && i + 2 < bytes.len() {
            let hi = hex(bytes[i + 1]);
            let lo = hex(bytes[i + 2]);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(b);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
