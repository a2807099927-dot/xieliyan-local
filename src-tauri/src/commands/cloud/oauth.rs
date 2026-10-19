// 阿里云盘：网页扫码授权（主路径，无需开放平台 AppKey）
// 可选：本机 env / cloud-oauth-apps.json 的阿里开放平台密钥作回退
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OAuthAppCreds {
    #[serde(default)]
    pub baidu_client_id: String,
    #[serde(default)]
    pub baidu_client_secret: String,
    #[serde(default)]
    pub aliyun_client_id: String,
    #[serde(default)]
    pub aliyun_client_secret: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_folder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 过滤示例占位符（如「你的百度 API Key」），避免当真实密钥去请求开放平台
fn sanitize_cred(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty() {
        return String::new();
    }
    let lower = t.to_lowercase();
    let looks_placeholder = t.contains('你')
        || t.contains("示例")
        || t.contains("填写")
        || lower.contains("your_")
        || lower.contains("your-")
        || lower.contains("xxx")
        || lower.contains("placeholder")
        || (lower.contains("client_id") && t.chars().any(|c| c > '\u{7f}'))
        || (lower.contains("api key") && t.chars().any(|c| c > '\u{7f}'))
        || (lower.contains("secret") && t.chars().any(|c| c > '\u{7f}'));
    if looks_placeholder {
        crate::logger::warn(format!(
            "[oauth] ignore placeholder credential: {}…",
            t.chars().take(24).collect::<String>()
        ));
        return String::new();
    }
    t.to_string()
}

fn load_oauth_apps(app: &AppHandle) -> OAuthAppCreds {
    let mut creds = OAuthAppCreds::default();
    // 1) 环境变量（优先）
    if let Ok(v) = std::env::var("XLY_BAIDU_CLIENT_ID") {
        creds.baidu_client_id = sanitize_cred(&v);
    }
    if let Ok(v) = std::env::var("XLY_BAIDU_CLIENT_SECRET") {
        creds.baidu_client_secret = sanitize_cred(&v);
    }
    if let Ok(v) = std::env::var("XLY_ALIYUN_CLIENT_ID") {
        creds.aliyun_client_id = sanitize_cred(&v);
    }
    if let Ok(v) = std::env::var("XLY_ALIYUN_CLIENT_SECRET") {
        creds.aliyun_client_secret = sanitize_cred(&v);
    }
    // 2) app_data/cloud-oauth-apps.json
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("cloud-oauth-apps.json");
        if path.exists() {
            if let Ok(raw) = std::fs::read_to_string(&path) {
                if let Ok(file) = serde_json::from_str::<OAuthAppCreds>(&raw) {
                    if creds.baidu_client_id.is_empty() {
                        creds.baidu_client_id = sanitize_cred(&file.baidu_client_id);
                    }
                    if creds.baidu_client_secret.is_empty() {
                        creds.baidu_client_secret = sanitize_cred(&file.baidu_client_secret);
                    }
                    if creds.aliyun_client_id.is_empty() {
                        creds.aliyun_client_id = sanitize_cred(&file.aliyun_client_id);
                    }
                    if creds.aliyun_client_secret.is_empty() {
                        creds.aliyun_client_secret = sanitize_cred(&file.aliyun_client_secret);
                    }
                }
            }
        }
    }
    creds
}

/// 用系统默认浏览器打开 URL。
/// Windows 注意：`cmd /c start` 会把 URL 中的 `&` 当成命令分隔符，必须整段加引号；
/// 优先用 rundll32 url.dll，再回退 start / opener。
fn open_browser(app: &AppHandle, url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("打开浏览器失败：URL 为空".into());
    }
    crate::logger::warn(format!(
        "[oauth] open_browser: {}…",
        url.chars().take(120).collect::<String>()
    ));

    #[cfg(target_os = "windows")]
    {
        // 1) rundll32：不经 cmd 解析，对 ? & = 最安全
        let r1 = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
        if r1.is_ok() {
            return Ok(());
        }

        // 2) cmd start：整段 URL 加双引号，避免 & 被拆命令
        let quoted = format!("\"{}\"", url.replace('"', ""));
        let r2 = std::process::Command::new("cmd")
            .args(["/C", "start", "", &quoted])
            .status();
        if let Ok(s) = r2 {
            if s.success() {
                return Ok(());
            }
        }

        // 3) explorer.exe 也可打开 http(s)
        let r3 = std::process::Command::new("explorer")
            .arg(url)
            .spawn();
        if r3.is_ok() {
            return Ok(());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("打开浏览器失败: {}。请手动访问：\n{}", e, url))
}

/// 阿里云盘网页扫码登录（护照接口，无需开放平台 AppKey）
/// 1) generate.do 拿 ck/t/codeContent
/// 2) 浏览器展示二维码，手机阿里云盘 App 扫码并确认
/// 3) query.do 轮询 → CONFIRMED → 解析 bizExt 拿 refreshToken
async fn aliyun_web_qr_oauth(app: &AppHandle) -> Result<OAuthResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| e.to_string())?;

    let gen_url = "https://passport.aliyundrive.com/newlogin/qrcode/generate.do?appName=aliyun_drive&fromSite=52&appName=aliyun_drive&appEntrance=web&isMobile=false&lang=zh_CN&returnUrl=&bizParams=&_bx-v=2.2.3";
    crate::logger::warn("[oauth_aliyun] web QR: generate…");
    let gen_resp = client
        .post(gen_url)
        .header("Referer", "https://www.aliyundrive.com/")
        .header("Origin", "https://www.aliyundrive.com")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body("")
        .send()
        .await
        .map_err(|e| format!("获取扫码二维码失败（请检查网络）: {}", e))?;
    let gen: Value = gen_resp.json().await.map_err(|e| e.to_string())?;
    let data = gen
        .pointer("/content/data")
        .cloned()
        .ok_or_else(|| format!("扫码接口响应异常: {}", gen))?;
    let t = data
        .get("t")
        .map(|v| match v {
            Value::Number(n) => n.to_string(),
            Value::String(s) => s.clone(),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("缺少 t: {}", data))?;
    let ck = data
        .get("ck")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("缺少 ck: {}", data))?
        .to_string();
    let code_content = data
        .get("codeContent")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("缺少 codeContent: {}", data))?
        .to_string();

    let qr_img = format!(
        "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data={}",
        urlencoding::encode(&code_content)
    );
    let html_path = std::env::temp_dir().join(format!(
        "xieliyan-aliyun-qr-{}.html",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    write_aliyun_qr_html(
        &html_path,
        &qr_img,
        "请用手机「阿里云盘」App 扫一扫，并在手机上点确认登录",
        false,
    )?;

    let file_url = if cfg!(windows) {
        format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"))
    } else {
        format!("file://{}", html_path.to_string_lossy())
    };

    open_browser(app, &file_url).map_err(|e| {
        format!(
            "{}\n\n请用浏览器打开临时文件：\n{}",
            e,
            html_path.display()
        )
    })?;
    crate::logger::warn(format!(
        "[oauth_aliyun] web QR opened, t={}, html={}",
        t,
        html_path.display()
    ));

    let query_url = "https://passport.aliyundrive.com/newlogin/qrcode/query.do?appName=aliyun_drive&fromSite=52&_bx-v=2.2.3";
    let deadline = Instant::now() + Duration::from_secs(180);
    let mut saw_scanned = false;
    loop {
        if Instant::now() > deadline {
            let _ = write_aliyun_qr_html(&html_path, &qr_img, "二维码已超时，请回软件重新扫码", true);
            return Err("扫码超时（3 分钟）。请重新点击「扫码登录」。".into());
        }
        tokio::time::sleep(Duration::from_secs(2)).await;

        // 不要过度 encode：t 是数字、ck 是 hex，form 直接传更稳
        let body = [
            ("t", t.as_str()),
            ("ck", ck.as_str()),
            ("appName", "aliyun_drive"),
            ("appEntrance", "web"),
            ("isMobile", "false"),
            ("lang", "zh_CN"),
            ("returnUrl", ""),
            ("fromSite", "52"),
            ("bizParams", ""),
            ("navlanguage", "zh-CN"),
            ("navPlatform", "Win32"),
        ];
        let qr = match client
            .post(query_url)
            .header("Referer", "https://www.aliyundrive.com/")
            .header("Origin", "https://www.aliyundrive.com")
            .form(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                crate::logger::warn(format!("[oauth_aliyun] query net err: {}", e));
                continue;
            }
        };
        let text = match qr.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let qv: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                crate::logger::warn(format!(
                    "[oauth_aliyun] query json err: {} body={}",
                    e,
                    text.chars().take(200).collect::<String>()
                ));
                continue;
            }
        };
        let qdata = match qv.pointer("/content/data") {
            Some(d) => d.clone(),
            None => {
                crate::logger::warn(format!("[oauth_aliyun] query no data: {}", text.chars().take(300).collect::<String>()));
                continue;
            }
        };
        let status = qdata
            .get("qrCodeStatus")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_uppercase();

        // 即使 status 字段异常，只要带 bizExt / token 也尝试解析
        if qdata.get("bizExt").is_some()
            || qdata.get("refreshToken").is_some()
            || qdata.get("refresh_token").is_some()
            || status == "CONFIRMED"
        {
            match extract_aliyun_tokens_from_qr_data(&qdata) {
                Ok((refresh, access, exp)) => {
                    let _ = write_aliyun_qr_html(
                        &html_path,
                        &qr_img,
                        "登录成功！可以关闭本页，返回写梨眼。",
                        true,
                    );
                    crate::logger::warn("[oauth_aliyun] web QR CONFIRMED, token ok");
                    return Ok(OAuthResult {
                        success: true,
                        error: None,
                        access_token: access,
                        refresh_token: Some(refresh),
                        expires_in: exp,
                        app_folder: None,
                        message: Some(
                            "阿里云盘扫码登录成功。凭证已保存，可直接测试连接或上传备份。".into(),
                        ),
                    });
                }
                Err(e) if status == "CONFIRMED" || qdata.get("bizExt").is_some() => {
                    crate::logger::warn(format!(
                        "[oauth_aliyun] CONFIRMED but parse fail: {} data_keys={:?}",
                        e,
                        qdata.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>())
                    ));
                    // 记录 bizExt 片段便于排障（不写完整 token）
                    if let Some(bx) = qdata.get("bizExt").and_then(|v| v.as_str()) {
                        crate::logger::warn(format!(
                            "[oauth_aliyun] bizExt len={} head={}",
                            bx.len(),
                            bx.chars().take(48).collect::<String>()
                        ));
                    }
                    let _ = write_aliyun_qr_html(
                        &html_path,
                        &qr_img,
                        &format!("扫码已确认，但解析凭证失败：{}。请回软件重试。", e),
                        true,
                    );
                    return Err(format!(
                        "扫码已确认，但解析登录凭证失败：{}。请重新扫码登录。",
                        e
                    ));
                }
                Err(_) => {}
            }
        }

        match status.as_str() {
            "NEW" | "" => continue,
            "SCANED" | "SCANNED" => {
                if !saw_scanned {
                    saw_scanned = true;
                    let _ = write_aliyun_qr_html(
                        &html_path,
                        &qr_img,
                        "已扫码，请在手机上点击「确认登录」",
                        false,
                    );
                    crate::logger::warn("[oauth_aliyun] QR scanned, waiting confirm…");
                }
                continue;
            }
            "EXPIRED" | "CANCELED" | "CANCELLED" => {
                let _ = write_aliyun_qr_html(
                    &html_path,
                    &qr_img,
                    "二维码已失效或已取消，请回软件重新扫码",
                    true,
                );
                return Err("二维码已失效或已取消，请重新扫码登录。".into());
            }
            "CONFIRMED" => {
                // 上面 parse 失败已 return；此处兜底
                continue;
            }
            other => {
                crate::logger::warn(format!(
                    "[oauth_aliyun] unexpected qr status={} raw={}",
                    other,
                    text.chars().take(240).collect::<String>()
                ));
                continue;
            }
        }
    }
}

fn write_aliyun_qr_html(
    path: &std::path::Path,
    qr_img: &str,
    status_msg: &str,
    done: bool,
) -> Result<(), String> {
    let title = if done {
        "阿里云盘登录"
    } else {
        "阿里云盘扫码登录"
    };
    let status_color = if done && status_msg.contains("成功") {
        "#6ee7b7"
    } else if done {
        "#fca5a5"
    } else {
        "#fde68a"
    };
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/><title>{title} · 写梨眼</title>
<meta http-equiv="Cache-Control" content="no-cache"/>
<style>
body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:system-ui,"Segoe UI",sans-serif;background:#0f1419;color:#e7ecf1}}
.card{{background:#1a222d;border-radius:16px;padding:36px 40px;text-align:center;
box-shadow:0 12px 40px rgba(0,0,0,.35);max-width:380px}}
h1{{font-size:18px;margin:0 0 8px;font-weight:600}}
p{{font-size:13px;opacity:.75;line-height:1.55;margin:0 0 16px}}
img{{width:280px;height:280px;border-radius:12px;background:#fff;padding:10px;box-sizing:border-box}}
.status{{margin-top:14px;font-size:13px;color:{color};font-weight:600}}
.tip{{margin-top:12px;font-size:12px;opacity:.5}}
</style></head><body><div class="card">
<h1>{title}</h1>
<p>打开手机「阿里云盘」App → 扫一扫<br/>确认登录后返回写梨眼即可</p>
{img}
<p class="status">{status}</p>
<p class="tip">二维码约 3 分钟内有效 · 请勿分享给他人</p>
</div></body></html>"#,
        title = title,
        color = status_color,
        img = if done && status_msg.contains("成功") {
            String::new()
        } else {
            format!(r#"<img src="{}" alt="QR"/>"#, qr_img)
        },
        status = html_escape_min(status_msg)
    );
    std::fs::write(path, html.as_bytes()).map_err(|e| format!("写入扫码页失败: {}", e))
}

/// 从扫码 query 的 data 节点提取 refresh / access token
fn extract_aliyun_tokens_from_qr_data(
    qdata: &Value,
) -> Result<(String, Option<String>, Option<u64>), String> {
    // 1) 顶层直接带 token
    if let Some(refresh) = qdata
        .get("refreshToken")
        .or_else(|| qdata.get("refresh_token"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        let access = qdata
            .get("accessToken")
            .or_else(|| qdata.get("access_token"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let exp = qdata
            .get("expiresIn")
            .or_else(|| qdata.get("expires_in"))
            .and_then(|v| v.as_u64());
        return Ok((refresh.to_string(), access, exp));
    }

    let biz_ext = qdata
        .get("bizExt")
        .ok_or_else(|| "响应无 bizExt".to_string())?;

    // bizExt 有时直接是对象
    if let Some(obj) = biz_ext.as_object() {
        return extract_tokens_from_login_value(&Value::Object(obj.clone()));
    }

    let raw = biz_ext
        .as_str()
        .ok_or_else(|| "bizExt 类型异常".to_string())?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("bizExt 为空".into());
    }

    // 已经是 JSON 文本
    if trimmed.starts_with('{') {
        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
            return extract_tokens_from_login_value(&v);
        }
    }

    // base64 → 文本 → JSON（容忍非法 UTF-8 / 异常 unicode）
    let decoded = base64_decode_flex(trimmed)?;
    let text = bytes_to_jsonish_text(&decoded);
    crate::logger::warn(format!(
        "[oauth_aliyun] bizExt decoded len={} head={}",
        text.len(),
        text.chars().take(80).collect::<String>().replace('\n', " ")
    ));

    // 先正则直接抽（比完整 JSON 更抗脏数据）
    if let Some(refresh) = regex_pick_token(&text, &["refreshToken", "refresh_token"]) {
        let access = regex_pick_token(&text, &["accessToken", "access_token"]);
        let exp = regex_pick_token(&text, &["expiresIn", "expires_in"])
            .and_then(|s| s.parse::<u64>().ok());
        return Ok((refresh, access, exp));
    }

    // 清理后解析 JSON
    let cleaned = sanitize_jsonish(&text);
    let biz: Value = serde_json::from_str(&cleaned)
        .or_else(|_| serde_json::from_str(&text))
        .map_err(|e| format!("bizExt JSON 解析失败: {}（已尝试容错）", e))?;
    extract_tokens_from_login_value(&biz)
}

fn extract_tokens_from_login_value(
    biz: &Value,
) -> Result<(String, Option<String>, Option<u64>), String> {
    let login = biz
        .get("pds_login_result")
        .or_else(|| biz.get("pdsLoginResult"))
        .or_else(|| biz.get("loginResult"))
        .cloned()
        .unwrap_or_else(|| biz.clone());

    let refresh = login
        .get("refreshToken")
        .or_else(|| login.get("refresh_token"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            // 有时嵌套在 data / token 里
            login
                .pointer("/data/refreshToken")
                .or_else(|| login.pointer("/token/refreshToken"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .ok_or_else(|| {
            format!(
                "未找到 refreshToken，keys={:?}",
                login.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>())
            )
        })?;

    let access = login
        .get("accessToken")
        .or_else(|| login.get("access_token"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let exp = login
        .get("expiresIn")
        .or_else(|| login.get("expires_in"))
        .and_then(|v| v.as_u64());
    Ok((refresh, access, exp))
}

fn bytes_to_jsonish_text(bytes: &[u8]) -> String {
    // 优先严格 UTF-8；失败则 lossy
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => String::from_utf8_lossy(bytes).into_owned(),
    }
}

/// 去掉 JSON 中可能导致 serde 报 invalid unicode 的脏字符（如孤立代理项）
fn sanitize_jsonish(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let u = ch as u32;
        // 过滤孤立代理区（U+D800..=U+DFFF）与 NUL
        if (0xD800..=0xDFFF).contains(&u) || u == 0 {
            out.push(' ');
            continue;
        }
        out.push(ch);
    }
    // 常见：bizExt 解码后是 URL 编码的 JSON
    if out.contains("%7B") || out.contains("%22") {
        if let Ok(decoded) = urlencoding::decode(&out) {
            return decoded.into_owned();
        }
    }
    out
}

fn regex_pick_token(text: &str, keys: &[&str]) -> Option<String> {
    for key in keys {
        // "refreshToken":"xxxx" 或 "refreshToken": "xxxx"
        let patterns = [
            format!(r#""{}"\s*:\s*"([^"]+)""#, key),
            format!(r#"{}['\"]?\s*[:=]\s*['\"]([^'\"]+)['\"]"#, key),
        ];
        for p in patterns {
            if let Ok(re) = regex::Regex::new(&p) {
                if let Some(c) = re.captures(text) {
                    if let Some(m) = c.get(1) {
                        let v = m.as_str().trim();
                        if v.len() >= 8 {
                            return Some(v.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

fn base64_decode_flex(raw: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let t = raw.trim();
    // 去掉可能的空白/换行
    let compact: String = t.chars().filter(|c| !c.is_whitespace()).collect();
    let s = compact.replace('-', "+").replace('_', "/");
    let pad = match s.len() % 4 {
        0 => s.clone(),
        2 => format!("{}==", s),
        3 => format!("{}=", s),
        _ => s.clone(),
    };
    base64::engine::general_purpose::STANDARD
        .decode(pad.as_bytes())
        .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(s.as_bytes()))
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(pad.as_bytes()))
        .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(compact.as_bytes()))
        .map_err(|e| format!("base64 解码失败: {}", e))
}

/// 阿里授权：网页扫码（无需 AppKey）
async fn aliyun_code_oauth(app: &AppHandle, _creds: &OAuthAppCreds) -> Result<OAuthResult, String> {
    aliyun_web_qr_oauth(app).await
}

fn html_escape_min(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[tauri::command]
pub async fn cloud_oauth_authorize(
    app: AppHandle,
    provider: String,
) -> Result<OAuthResult, String> {
    let creds = load_oauth_apps(&app);
    let p = provider.trim().to_lowercase();
    crate::logger::warn(format!("[cloud_oauth_authorize] provider={}", p));
    match p.as_str() {
        "aliyun" | "alipan" => match aliyun_code_oauth(&app, &creds).await {
            Ok(r) => Ok(r),
            Err(e) => Ok(OAuthResult {
                success: false,
                error: Some(e),
                access_token: None,
                refresh_token: None,
                expires_in: None,
                app_folder: None,
                message: None,
            }),
        },
        "baidu" => Ok(OAuthResult {
            success: false,
            error: Some("百度网盘已下线，请改用坚果云、通用 WebDAV 或阿里云盘扫码。".into()),
            access_token: None,
            refresh_token: None,
            expires_in: None,
            app_folder: None,
            message: None,
        }),
        _ => Ok(OAuthResult {
            success: false,
            error: Some("仅支持阿里云盘扫码授权".into()),
            access_token: None,
            refresh_token: None,
            expires_in: None,
            app_folder: None,
            message: None,
        }),
    }
}

/// 查询授权通道是否可用（阿里网页扫码始终可用）
#[tauri::command]
pub async fn cloud_oauth_status(_app: AppHandle) -> Result<Value, String> {
    Ok(json!({
        "aliyunReady": true,
        "via": "web-qr",
        "aliyunMode": "web-qr",
    }))
}
