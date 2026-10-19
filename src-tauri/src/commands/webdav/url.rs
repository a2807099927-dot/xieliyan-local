// URL 处理：origin/path 拆分、percent-encode/decode、构建完整 dav URL
use super::types::WebDavConfig;

/// 提取 origin（如 `https://dav.jianguoyun.com:443`）
pub(super) fn url_origin(url: &str) -> String {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or(""),
            parsed.port().map(|p| format!(":{p}")).unwrap_or_default()
        )
    } else {
        url.trim_end_matches('/').to_string()
    }
}

/// 提取路径前缀（如 `/dav`）
pub(super) fn url_path_prefix(url: &str) -> String {
    reqwest::Url::parse(url)
        .map(|u| u.path().trim_end_matches('/').to_string())
        .unwrap_or_default()
}

/// 把 PROPFIND 返回的 href（已带 `/dav/` 前缀）拼回完整 URL
pub(super) fn build_dav_url(config: &WebDavConfig, path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }
    // path 为空时直接返回 config.url（normalize 后已含完整目录路径），
    // 避免拼接出 "base_url/" 导致坚果云返回 503
    let path = path.trim_matches('/');
    if path.is_empty() {
        return config.url.trim_end_matches('/').to_string();
    }
    let prefix = url_path_prefix(&config.url);
    if !prefix.is_empty() {
        // prefix 来自 URL parser，非 ASCII 字符是 percent-encoded 形态；
        // 而 PROPFIND 返回的 href 经过 percent_decode 是解码形态。
        // 用解码后的 prefix 做比较，避免编码不一致导致路径重复拼接。
        let decoded_prefix = percent_decode(&prefix);
        if path.starts_with(&decoded_prefix) {
            let origin = url_origin(&config.url);
            return format!("{}{}", origin.trim_end_matches('/'), path);
        }
    }
    let base = config.url.trim_end_matches('/');
    format!("{}/{}", base, path)
}

/// 对 URL 中的 path 段做 percent-encode（保留 ASCII 字母数字和常见 URL 安全符号）
pub(super) fn encode_url_path(url: &str) -> String {
    let split_idx = url
        .find("://")
        .and_then(|p| url[p + 3..].find('/').map(|i| p + 3 + i));
    let (head, path) = match split_idx {
        Some(i) => (&url[..i], &url[i..]),
        None => return url.to_string(),
    };
    let mut out = String::with_capacity(path.len());
    for &b in path.as_bytes() {
        match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~'
            | b'/' | b':' | b'@' | b'!' | b'$' | b'&' | b'\'' | b'(' | b')' | b'*' | b'+' | b',' | b';' | b'=' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    format!("{}{}", head, out)
}

/// percent-decode（还原 PROPFIND 返回的 URL-encoded href）
pub(super) fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_digit(bytes[i + 1]), hex_digit(bytes[i + 2])) {
                out.push((hi << 4) | lo);
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
