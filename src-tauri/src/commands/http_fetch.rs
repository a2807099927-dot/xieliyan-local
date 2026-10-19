// 通用 HTTP 请求（供 Agent 读取网页、文档等）
use crate::ai::build_client_with_system_proxy;
use std::time::Duration;

/// SSRF 防护：拒绝向本机 / 内网 / 云元数据等保留地址发起请求。
/// Agent 的 read_url 工具会读取任意 URL，若不加限制，被提示词注入诱导后
/// 可能探测本机服务（127.0.0.1）、内网（10.x/172.16-31.x/192.168.x）
/// 或云元数据（169.254.169.254），属于纵深防御的关键一环。
fn validate_public_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("URL 无效: {e}"))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("仅支持 http/https 协议，收到: {scheme}"));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL 缺少主机名".to_string())?;

    // 禁止 user:pass@host 形态（既泄露凭据，也常被用来混淆真实目标）
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("不支持带用户名/密码的 URL".into());
    }

    let lower = host.to_ascii_lowercase();
    if lower == "localhost" || lower.ends_with(".localhost") {
        return Err("禁止访问本机地址 (localhost)".into());
    }

    // IPv6 字面量在 host_str 里可能带方括号，去掉后再解析
    let ip_candidate = lower.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = ip_candidate.parse::<std::net::IpAddr>() {
        let blocked = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
            }
            std::net::IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    || v6.is_unique_local()
                    || v6.to_ipv4_mapped().map_or(false, |v4| {
                        v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
                    })
            }
        };
        if blocked {
            return Err(format!("禁止访问本机/内网/保留地址: {host}"));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn http_fetch(url: String) -> Result<String, String> {
    validate_public_url(&url)?;

    let client = build_client_with_system_proxy(Duration::from_secs(20));

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (compatible; XieLiYan/2.0)")
        .send()
        .await
        .map_err(|e| format!("请求失败：{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }

    resp.text().await.map_err(|e| format!("读取响应失败：{}", e))
}
