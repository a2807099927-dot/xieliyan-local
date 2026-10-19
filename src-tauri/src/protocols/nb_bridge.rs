// nb-bridge:// 协议 — 跨域 child webview 回调宿主用
//
// 背景：Tauri 2 不会把 `window.__TAURI_INTERNALS__` 注入到外部站点（笔趣阁等），
// 所以 child webview 里没法 invoke Rust 命令。
// 唯一通用的回调通道是 fetch 一个本地协议，Rust 拦截这个请求并解析查询串。
//
// 用法：
//   child webview 注入脚本里执行：
//     navigator.sendBeacon('http://nb-bridge.localhost/exec-result?p=<url-encoded-json>')
//   或：
//     fetch('http://nb-bridge.localhost/exec-result?p=...', { method: 'POST' })
//
// 此协议仅做"信使"：解析 payload 后立刻 emit 'novel-browser:exec-response' 给主窗口
//
// 安全性：仅响应自家协议；payload 是 child webview 自己产出的提取结果（用户主动触发）

use serde_json::Value;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Emitter, Manager, UriSchemeContext};

const PARENT_LABEL: &str = "novel-lab-window";

/// 受信来源 webview label：只有这些窗口/子 webview 里加载的页面
/// 才允许向 nb-bridge 发请求。外部网站即使加载在子 webview 中，
/// 也无法伪造这个 label（label 由宿主在创建时指定），
/// 从而堵住"任意网页向应用注入伪造事件"的通道。
const ALLOWED_SOURCES: &[&str] = &["novel-browser", "agent-webview", "novel-lab-window"];

pub fn handle_request(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let app = ctx.app_handle().clone();

    // 来源鉴权：拒绝非受信 webview 的请求（fail-closed，label 为空也拒绝）
    let source = ctx.webview_label();
    if !ALLOWED_SOURCES.contains(&source) {
        crate::logger::warn(format!(
            "[nb-bridge] 拒绝未授权来源的请求: webview_label={source}"
        ));
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Vec::new())
            .unwrap_or_else(|_| Response::new(Vec::new()));
    }

    let uri = request.uri().to_string();

    // 解析 ?p=<percent-encoded JSON>
    let qs = uri.split('?').nth(1).unwrap_or("");
    let mut payload_raw: Option<String> = None;
    for pair in qs.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        if k == "p" {
            payload_raw = Some(percent_decode(v));
            break;
        }
    }

    if let Some(raw) = payload_raw {
        if let Ok(payload) = serde_json::from_str::<Value>(&raw) {
            // 转发到 NovelLab 主窗口（用 emit_to 广播到该窗口下所有 webview）
            if let Some(parent) = app.get_webview_window(PARENT_LABEL) {
                let _ = parent.emit("novel-browser:exec-response", payload.clone());
            }
            // 兜底：广播到全局，所有 webview 都能收到
            let _ = app.emit("novel-browser:exec-response", payload);
        } else {
            crate::logger::error(format!("[nb-bridge] invalid JSON: {}", raw));
        }
    }

    // 任意请求都返回 204 + CORS 头（child webview 跨域 fetch 才不会被拦）
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
