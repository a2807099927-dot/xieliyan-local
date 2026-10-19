// ly-asset:// 协议处理 — 让 webview 加载本地文件（动态壁纸 / 自定义书封 / 上传字体等）
// 与主项目 electron/main.ts 中的 protocol.handle('ly-asset', ...) 行为对齐
//
// 安全策略：
//   只允许访问 userData / workspace 这两个根目录下的文件（防止任意目录遍历攻击）
//
// 支持：
//   - 静态文件（图片 / 字体 / JSON）
//   - Range 请求（视频流式播放，让动态壁纸支持时间轴跳转）

use std::path::PathBuf;

use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeContext};

/// 协议入口
pub fn handle_request(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let app = ctx.app_handle().clone();
    match handle_inner(&app, request) {
        Ok(response) => response,
        Err(err) => {
            crate::logger::error(format!("[ly-asset] {}", err));
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "text/plain")
                .body(format!("ly-asset error: {}", err).into_bytes())
                .unwrap_or_else(|_| Response::new(Vec::new()))
        }
    }
}

fn handle_inner(
    app: &AppHandle,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, String> {
    let uri = request.uri().to_string();
    let path_str = parse_local_path(&uri)?;

    let resolved = PathBuf::from(&path_str);
    let canonical = match resolved.canonicalize() {
        Ok(c) => c,
        Err(e) => {
            return Ok(not_found(&format!(
                "{} (canonicalize: {})",
                resolved.display(),
                e
            )));
        }
    };

    if !canonical.is_file() {
        return Ok(not_found(&canonical.to_string_lossy()));
    }

    // 安全策略：允许访问 userData / workspace / 用户在 config 里授权过的资产
    let user_data = app.path().app_data_dir().ok();
    let workspace = crate::workspace::get_workspace_path(app).canonicalize().ok();

    let mut allowed_roots: Vec<PathBuf> = Vec::new();
    if let Some(p) = user_data {
        if let Ok(c) = p.canonicalize() {
            allowed_roots.push(c);
        }
    }
    if let Some(p) = workspace {
        allowed_roots.push(p);
    }

    let canonical_lower = canonical.to_string_lossy().to_ascii_lowercase();
    let mut allowed = allowed_roots.iter().any(|root| {
        let root_str = root.to_string_lossy().to_ascii_lowercase();
        canonical_lower == root_str
            || canonical_lower.starts_with(&format!("{}{}", root_str, std::path::MAIN_SEPARATOR))
    });

    // 兜底：从 config.ui.customTheme.backgroundImage / uploadedFonts.dataUrl 中读到的具体文件全开
    // 与主项目 Electron 在 main.ts 中 allowedUserAssets 行为对齐
    if !allowed {
        if let Some(authorized_files) = read_authorized_user_assets(app) {
            for asset in authorized_files {
                if let Ok(asset_canonical) = std::path::PathBuf::from(&asset).canonicalize() {
                    if asset_canonical == canonical {
                        allowed = true;
                        break;
                    }
                }
            }
        }
    }

    if !allowed {
        crate::logger::error(format!(
            "[ly-asset] forbidden: {} (not under userData/workspace/authorized)",
            canonical.display()
        ));
        return Ok(forbidden());
    }

    let mime = guess_mime(&canonical);
    let total = std::fs::metadata(&canonical).map_err(|e| e.to_string())?.len();

    if let Some(range) = request.headers().get("range") {
        if let Some((start, end)) = parse_range(range.to_str().unwrap_or(""), total) {
            use std::io::{Read, Seek, SeekFrom};
            let mut file = std::fs::File::open(&canonical).map_err(|e| e.to_string())?;
            file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
            let read_len = (end - start + 1) as usize;
            let mut chunk = vec![0u8; read_len];
            file.read_exact(&mut chunk).map_err(|e| e.to_string())?;
            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", read_len.to_string())
                .header("Content-Type", mime)
                .body(chunk)
                .map_err(|e| e.to_string());
        }
    }

    // 非 Range：整文件返回（图片/字体/JSON 等小资源）
    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Length", total.to_string())
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", mime)
        .body(bytes)
        .map_err(|e| e.to_string())
}

/// 从 config 读出"用户授权过的"本地资产路径列表
/// （customTheme.backgroundImage 和 uploadedFonts[].dataUrl 等）
fn read_authorized_user_assets(app: &AppHandle) -> Option<Vec<String>> {
    let cfg_path = app
        .path()
        .app_data_dir()
        .ok()?
        .join("config.json");
    let raw = std::fs::read_to_string(&cfg_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let mut out = Vec::new();
    let ui = value.get("ui")?;

    if let Some(bg) = ui
        .get("customTheme")
        .and_then(|c| c.get("backgroundImage"))
        .and_then(|v| v.as_str())
    {
        out.push(strip_ly_asset_prefix(bg));
    }
    if let Some(fonts) = ui.get("uploadedFonts").and_then(|v| v.as_array()) {
        for font in fonts {
            if let Some(p) = font.get("dataUrl").and_then(|v| v.as_str()) {
                if !p.starts_with("data:") {
                    out.push(strip_ly_asset_prefix(p));
                }
            }
        }
    }
    Some(out)
}

fn strip_ly_asset_prefix(s: &str) -> String {
    let trimmed = s.trim();
    let stripped = if let Some(rest) = trimmed.strip_prefix("ly-asset:///") {
        rest.to_string()
    } else if let Some(rest) = trimmed.strip_prefix("ly-asset://localhost/") {
        rest.to_string()
    } else if let Some(rest) = trimmed.strip_prefix("ly-asset://") {
        rest.to_string()
    } else {
        trimmed.to_string()
    };
    // percent-decode 防御
    percent_decode(&stripped)
}

fn parse_local_path(uri: &str) -> Result<String, String> {
    // Tauri 2 在 Windows/Linux 上把 ly-asset 协议映射到 http://ly-asset.localhost/<path>
    // 在 macOS/iOS 上保留 ly-asset://localhost/<path> 形式
    // 我们要剥成纯路径："E:/wallpapers/wp-xxx.jpg"
    let after_host = if let Some(rest) = uri.strip_prefix("http://ly-asset.localhost/") {
        rest
    } else if let Some(rest) = uri.strip_prefix("https://ly-asset.localhost/") {
        rest
    } else if let Some(rest) = uri.strip_prefix("ly-asset://localhost/") {
        rest
    } else if let Some(rest) = uri.strip_prefix("ly-asset:///") {
        rest
    } else if let Some(rest) = uri.strip_prefix("ly-asset://") {
        rest
    } else {
        return Err(format!("invalid scheme: {}", uri));
    };

    // 去掉可能存在的查询串和 fragment
    let path_only = after_host
        .split('?')
        .next()
        .unwrap_or(after_host)
        .split('#')
        .next()
        .unwrap_or(after_host);

    let decoded = percent_decode(path_only);
    Ok(decoded)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_digit(bytes[i + 1]);
            let lo = hex_digit(bytes[i + 2]);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn parse_range(value: &str, total: u64) -> Option<(u64, u64)> {
    // bytes=START-END
    let trimmed = value.trim_start_matches("bytes=").trim();
    let mut parts = trimmed.splitn(2, '-');
    let start_str = parts.next()?;
    let end_str = parts.next()?;
    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        total.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };
    if start > end || end >= total {
        return None;
    }
    Some((start, end))
}

fn guess_mime(path: &PathBuf) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "ogg" | "ogv" => "video/ogg",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "json" => "application/json",
        "txt" | "log" | "md" => "text/plain; charset=utf-8",
        "html" | "htm" => "text/html; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn not_found(path: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain")
        .body(format!("File not found: {}", path).into_bytes())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn forbidden() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("Content-Type", "text/plain")
        .body(b"Access denied".to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}
