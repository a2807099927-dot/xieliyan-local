use std::time::Duration;

use base64::Engine;
use reqwest::Client;
use tokio::time::sleep;

use super::types::WebDavConfig;
use super::url::{build_dav_url, encode_url_path};

const REQUEST_TIMEOUT_SECS: u64 = 60;
const MAX_RETRIES: usize = 3;
const RETRYABLE_STATUS: [u16; 3] = [502, 503, 504];

pub(super) fn build_client(config: &WebDavConfig) -> Client {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // 智能代理分流：如果用户使用的是坚果云（jianguoyun.com，国内服务），强制直连，不走系统代理。
    // 这能彻底避免用户开启 AI 梯子（系统全局代理）时，国内流量被强行绕行海外代理节点导致的极其缓慢或超时失败。
    let is_jianguoyun = config.url.contains("jianguoyun.com") || config.url.contains("nutstore");

    if !is_jianguoyun {
        // 自动检测系统代理（与 AI 模块保持一致）
        if let Ok(proxy_settings) = sysproxy::Sysproxy::get_system_proxy() {
            if proxy_settings.enable && !proxy_settings.host.is_empty() {
                let proxy_url = format!("http://{}:{}", proxy_settings.host, proxy_settings.port);
                if let Ok(reqwest_proxy) = reqwest::Proxy::all(&proxy_url) {
                    builder = builder.proxy(reqwest_proxy);
                }
            }
        }
    }

    builder.build().unwrap_or_else(|_| Client::new())
}


pub(super) fn auth_value(config: &WebDavConfig) -> String {
    let token =
        base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", config.username, config.password));
    format!("Basic {}", token)
}

fn method(name: &[u8]) -> reqwest::Method {
    reqwest::Method::from_bytes(name).unwrap_or(reqwest::Method::GET)
}

/// 普通重试间隔（网络抖动 / 502 504 503 瞬时）
fn retry_wait_ms(attempt: usize) -> u64 {
    (attempt as u64) * 1200
}

/// 坚果云限流（BlockedTemporarily）需要更长退避，否则连续重试仍会被拒绝
fn rate_limit_wait_ms(attempt: usize) -> u64 {
    // attempt 从 1 开始：8s, 16s, 32s (指数退避)
    8000 * (1u64 << (attempt - 1))
}

/// 从响应 body 判断是否坚果云限流
fn is_rate_limited(body: &str) -> bool {
    body.contains("BlockedTemporarily") || body.contains("Too many requests") || body.contains("ns.jianguoyun.com")
}

pub(super) async fn ensure_remote_dir(client: &Client, config: &WebDavConfig, dir_path: &str) {
    let raw = build_dav_url(config, dir_path);
    let url = encode_url_path(&raw);
    for attempt in 1..=MAX_RETRIES {
        match client
            .request(method(b"MKCOL"), &url)
            .header("Authorization", auth_value(config))
            .send()
            .await
        {
            Ok(res) => {
                let s = res.status().as_u16();
                // 201 = 创建成功 / 405 = 已存在 → 达到"确保"目的
                if s == 201 || s == 405 || s == 200 {
                    return;
                }
                // 503：坚果云对中文路径 MKCOL 固定返回 503（非限流，是其行为特性），
                // 指数退避在这里只会浪费时间。直接静默退出，上层会继续尝试上传。
                // 真正的限流（BlockedTemporarily）发生在 PUT/PROPFIND，在那里处理。
                if s == 503 {
                    let body = res.text().await.unwrap_or_default();
                    if is_rate_limited(&body) && attempt < MAX_RETRIES {
                        // 极少数情况：MKCOL 真的被限流了（body 含 BlockedTemporarily）
                        let wait = rate_limit_wait_ms(attempt);
                        crate::logger::warn(format!(
                            "[webdav] MKCOL {} -> 503 rate-limited (attempt {}/{}) retry in {}ms",
                            url, attempt, MAX_RETRIES, wait
                        ));
                        sleep(Duration::from_millis(wait)).await;
                        continue;
                    }
                    // 普通 503（路径不支持 / 目录不存在等），静默退出
                    crate::logger::warn(format!("[webdav] MKCOL {} -> 503, skipping", url));
                    return;
                }
                return; // 其它错误：忽略（确保操作的容错语义）
            }
            Err(_) => {
                if attempt < MAX_RETRIES {
                    sleep(Duration::from_millis(retry_wait_ms(attempt))).await;
                    continue;
                }
                return;
            }
        }
    }
}

pub(super) async fn upload_file(
    client: &Client,
    config: &WebDavConfig,
    remote_path: &str,
    body: Vec<u8>,
) -> Result<(), String> {
    let raw = build_dav_url(config, remote_path);
    let url = encode_url_path(&raw);
    for attempt in 1..=MAX_RETRIES {
        match client
            .put(&url)
            .header("Authorization", auth_value(config))
            .header("Content-Type", "application/octet-stream")
            .body(body.clone())
            .send()
            .await
        {
            Ok(res) => {
                let s = res.status().as_u16();
                if s == 200 || s == 201 || s == 204 {
                    return Ok(());
                }
                let err_text = res.text().await.unwrap_or_default();
                // 只要 body 含限流特征就做指数退避，不强制要求是 5xx 状态码
                let rate_limited = is_rate_limited(&err_text);
                let retryable = RETRYABLE_STATUS.contains(&s) || rate_limited;
                if retryable && attempt < MAX_RETRIES {
                    let wait = if rate_limited {
                        crate::logger::warn(format!(
                            "[webdav] PUT {} rate-limited (attempt {}/{}) retry in {}ms",
                            url, attempt, MAX_RETRIES,
                            rate_limit_wait_ms(attempt)
                        ));
                        rate_limit_wait_ms(attempt)
                    } else {
                        retry_wait_ms(attempt)
                    };
                    sleep(Duration::from_millis(wait)).await;
                    continue;
                }
                return Err(format!(
                    "HTTP {} - {}",
                    s,
                    err_text.chars().take(200).collect::<String>()
                ));
            }
            Err(e) => {
                if attempt < MAX_RETRIES {
                    sleep(Duration::from_millis(retry_wait_ms(attempt))).await;
                    continue;
                }
                return Err(format!("network request failed: {}", e));
            }
        }
    }
    Err("upload failed: retries exceeded".into())
}

pub(super) async fn download_file(
    client: &Client,
    config: &WebDavConfig,
    remote_path: &str,
) -> Option<Vec<u8>> {
    let raw = build_dav_url(config, remote_path);
    let url = encode_url_path(&raw);
    for attempt in 1..=MAX_RETRIES {
        let res = match client
            .get(&url)
            .header("Authorization", auth_value(config))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                if attempt < MAX_RETRIES {
                    sleep(Duration::from_millis(retry_wait_ms(attempt))).await;
                    continue;
                }
                crate::logger::warn(format!("[webdav] GET {} failed: {}", url, e));
                return None;
            }
        };
        let s = res.status().as_u16();
        if res.status().is_success() {
            return res.bytes().await.ok().map(|b| b.to_vec());
        }
        if RETRYABLE_STATUS.contains(&s) && attempt < MAX_RETRIES {
            sleep(Duration::from_millis(retry_wait_ms(attempt))).await;
            continue;
        }
        crate::logger::warn(format!(
            "[webdav] GET {} -> HTTP {}",
            url, s
        ));
        return None;
    }
    None
}

pub(super) async fn probe_remote_path(
    client: &Client,
    config: &WebDavConfig,
) -> Result<u16, String> {
    let raw = build_dav_url(config, &config.remote_path);
    let url = encode_url_path(&raw);
    for attempt in 1..=MAX_RETRIES {
        match client
            .request(method(b"PROPFIND"), &url)
            .header("Authorization", auth_value(config))
            .header("Depth", "0")
            .header("Content-Type", "application/xml")
            .body(
                r#"<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>"#,
            )
            .send()
            .await
        {
            Ok(res) => {
                let s = res.status().as_u16();
                // 503：坚果云对中文路径固定返回，不是瞬时故障，无需重试
                if s == 503 {
                    return Ok(503);
                }
                // 502/504 瞬时故障才重试
                if (s == 502 || s == 504) && attempt < MAX_RETRIES {
                    let body = res.text().await.unwrap_or_default();
                    let wait = if is_rate_limited(&body) {
                        rate_limit_wait_ms(attempt)
                    } else {
                        retry_wait_ms(attempt)
                    };
                    sleep(Duration::from_millis(wait)).await;
                    continue;
                }
                return Ok(s);
            }
            Err(e) => {
                if attempt < MAX_RETRIES {
                    sleep(Duration::from_millis(retry_wait_ms(attempt))).await;
                    continue;
                }
                return Err(format!("network error: {}", e));
            }
        }
    }
    Err("probe failed: retries exceeded".into())
}
