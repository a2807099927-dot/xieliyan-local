// 网文风向标（扫榜）独立窗口及数据抓取 commands
use futures_util::future::join_all;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::common::focus_existing_window;

const BOOK_SWEEPER_WINDOW_LABEL: &str = "book-sweeper-window";

/// 打开网文风向标扫榜独立窗口
#[tauri::command]
pub async fn open_book_sweeper_window(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(BOOK_SWEEPER_WINDOW_LABEL) {
        focus_existing_window(&window)?;
        return Ok(true);
    }

    let url = "index.html?bookSweeperDetached=1";
    let window =
        WebviewWindowBuilder::new(&app, BOOK_SWEEPER_WINDOW_LABEL, WebviewUrl::App(url.into()))
            .title("网文风向标")
            .inner_size(1100.0, 800.0)
            .min_inner_size(800.0, 600.0)
            .resizable(true)
            .decorations(false) // 保持无边框，完美贴合系统的毛玻璃 Flat 风格
            .center()
            .visible(false)
            .background_color(tauri::webview::Color(4, 10, 27, 255))
            .build()
            .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}

/// 抓取起点中文网排行榜列表
/// rank_type 可选值:
/// - 'yuepiao': 月票榜 | 'hotsales': 畅销榜 | 'recom': 推荐榜
/// - 'newsign': 签约榜 | 'newp': 新锐人气 | 'newbook': 新书榜
/// - 'sanjiang': 三江推荐（额外并发获取每本书的收藏数和封面）
///
/// 策略：
///   1. 优先请求独立页面 /rank/{type}/（返回 20 条完整数据）
///   2. 若独立页面 404 → 退回统一 /rank/ 页面按 JSON key 提取（仅 5 条）
///   3. 三江推荐始终走 /sanjiang/ 独立页面
#[tauri::command]
pub async fn fetch_qidian_rank(rank_type: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // 三江推荐独立页面
    if rank_type == "sanjiang" {
        return fetch_qidian_sanjiang(&client).await;
    }

    // 1. 优先尝试独立页面（返回 20 条）
    let individual_url = format!("https://m.qidian.com/rank/{}/", rank_type);
    let resp = client.get(&individual_url)
        .send()
        .await
        .map_err(|e| format!("请求起点排行榜失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取起点排行数据失败: {}", e))?;

    // 检查独立页面是否返回了有效 records
    if let Some(records) = extract_qidian_records(&html) {
        return Ok(records);
    }

    // 2. 独立页面无数据（404 或结构变化）→ 退回统一 /rank/ 页面
    let resp2 = client.get("https://m.qidian.com/rank/")
        .send()
        .await
        .map_err(|e| format!("请求起点排行榜(统一页)失败: {}", e))?;

    let html2 = resp2.text()
        .await
        .map_err(|e| format!("读取起点排行数据(统一页)失败: {}", e))?;

    let page_data = extract_qidian_page_data(&html2)
        .ok_or_else(|| "未能从起点页面中提取到排行榜数据，可能接口发生变动或被系统风控拦截。".to_string())?;

    // rank_type → pageData 中的 JSON key 映射
    let json_key = match rank_type.as_str() {
        "yuepiao"       => "fyRank",
        "hotsales"      => "hotRank",
        "recom"         => "recRank",
        "newsign"       => "signRank",
        "newp"          => "newpRank",
        "newbook"       => "newbRank",
        "ds"            => "dsRank",
        "readindex"     => "readIndex",
        "upd"           => "updRank",
        "newfans"       => "newFans",
        other           => other,
    };

    if let Some(arr) = page_data.get(json_key) {
        return Ok(arr.clone());
    }

    if let Some(records) = page_data.get("records") {
        return Ok(records.clone());
    }

    Err(format!("起点排行榜页面中未找到 '{}' 对应的数据 (key: {})", rank_type, json_key))
}

/// 三江推荐独立抓取（含并发获取收藏数）
async fn fetch_qidian_sanjiang(client: &reqwest::Client) -> Result<Value, String> {
    let resp = client.get("https://m.qidian.com/sanjiang/")
        .send()
        .await
        .map_err(|e| format!("请求起点三江推荐失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取起点三江推荐数据失败: {}", e))?;

    let records_val = extract_qidian_records(&html)
        .ok_or_else(|| "未能从起点三江推荐页面中提取到列表数据。".to_string())?;

    let records = match records_val.as_array() {
        Some(arr) => arr.clone(),
        None => return Ok(records_val),
    };

    let client2 = client.clone();
    let futures: Vec<_> = records.iter().map(|rec| {
        let c = client2.clone();
        let bid = rec.get("bid")
            .and_then(|v| v.as_i64())
            .map(|n| n.to_string())
            .unwrap_or_default();
        async move {
            if bid.is_empty() {
                return (bid, None::<i64>);
            }
            let detail_url = format!("https://m.qidian.com/book/{}/", bid);
            let Ok(resp) = c.get(&detail_url).send().await else { return (bid, None); };
            let Ok(h) = resp.text().await else { return (bid, None); };
            let collect = extract_qidian_collect(&h);
            (bid, collect)
        }
    }).collect();

    let results = join_all(futures).await;
    let collect_map: std::collections::HashMap<String, i64> = results
        .into_iter()
        .filter_map(|(bid, c)| c.map(|v| (bid, v)))
        .collect();

    let enriched: Vec<Value> = records.into_iter().map(|mut rec| {
        let bid = rec.get("bid")
            .and_then(|v| v.as_i64())
            .map(|n| n.to_string())
            .unwrap_or_default();
        if let Some(collect) = collect_map.get(&bid) {
            rec["collect"] = json!(collect);
        }
        rec
    }).collect();

    Ok(json!(enriched))
}

/// 从起点 HTML 中提取 pageData 对象（统一榜单页面）
fn extract_qidian_page_data(html: &str) -> Option<Value> {
    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(pd) = parsed.pointer("/pageContext/pageProps/pageData") {
                        return Some(pd.clone());
                    }
                }
            }
        }
    }
    None
}

/// 从起点 HTML 中提取 records 列表（三江推荐等独立页面）
fn extract_qidian_records(html: &str) -> Option<Value> {
    // 1. vite-plugin-ssr_pageContext 标签
    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(records) = parsed.pointer("/pageContext/pageProps/pageData/records") {
                        return Some(records.clone());
                    }
                }
            }
        }
    }
    // 2. 正则备用
    if let Ok(re) = regex::Regex::new(r"(?i)<script[^>]*>([\s\S]*?)</script>") {
        for cap in re.captures_iter(html) {
            let content = &cap[1];
            if content.contains("INITIAL_STATE") {
                if let Ok(parsed) = serde_json::from_str::<Value>(content) {
                    if let Some(records) = parsed.pointer("/pageContext/pageProps/pageData/records") {
                        return Some(records.clone());
                    }
                }
            }
        }
    }
    None
}

/// 从起点书籍详情页 HTML 中提取 collect（收藏数）
fn extract_qidian_collect(html: &str) -> Option<i64> {
    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(c) = parsed.pointer("/pageContext/pageProps/pageData/bookInfo/collect") {
                        return c.as_i64();
                    }
                }
            }
        }
    }
    None
}

/// 抓取番茄小说排行榜列表
/// rank_type 可选值:
/// - "1_1": 男生频道新书榜
/// - "2_1": 女生频道新书榜
/// - "1_2": 男生频道最热榜
/// - "2_2": 女生频道最热榜
/// category_id: 可选的细分类别 ID (如东方仙侠 1140 等)
#[tauri::command]
pub async fn fetch_fanqie_rank(rank_type: String, category_id: Option<String>) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = if let Some(ref cat_id) = category_id {
        if !cat_id.is_empty() && cat_id != "all" {
            format!("https://fanqienovel.com/rank/{}?category_id={}", rank_type, cat_id)
        } else {
            format!("https://fanqienovel.com/rank/{}", rank_type)
        }
    } else {
        format!("https://fanqienovel.com/rank/{}", rank_type)
    };

    let resp = client.get(&url)
        .header("Referer", "https://fanqienovel.com/")
        .send()
        .await
        .map_err(|e| format!("请求番茄排行榜失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取番茄排行数据失败: {}", e))?;

    // 使用正则提取 HTML 中的 window.__INITIAL_STATE__
    let re = regex::Regex::new(r"(?i)window\.__INITIAL_STATE__\s*=\s*")
        .map_err(|e| e.to_string())?;

    if let Some(m) = re.find(&html) {
        let json_start = m.end();
        // 用花括号配对找到完整 JSON 对象的结尾
        let bytes = html[json_start..].as_bytes();
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escaped = false;
        let mut end_pos = 0;
        for (i, &b) in bytes.iter().enumerate() {
            if in_string {
                if escaped { escaped = false; continue; }
                if b == b'\\' { escaped = true; continue; }
                if b == b'"' { in_string = false; }
                continue;
            }
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 { end_pos = i + 1; break; }
                }
                _ => {}
            }
        }
        if end_pos > 0 {
            let content = &html[json_start..json_start + end_pos];
            // 番茄的 __INITIAL_STATE__ 是 JS 对象字面量，可能包含 undefined（非法 JSON）
            let sanitized = content.replace(":undefined", ":null").replace(": undefined", ": null");
            let parsed: Value = serde_json::from_str(&sanitized)
                .map_err(|e| format!("解析番茄 JSON 失败: {}", e))?;
            
            if let Some(book_list) = parsed.pointer("/rank/book_list") {
                return Ok(book_list.clone());
            }
        }
    }

    // 如果页面没有 __INITIAL_STATE__ 或解析失败，返回空数组而不是报错
    Ok(Value::Array(vec![]))
}

/// 抓取起点小说章节目录
#[tauri::command]
pub async fn fetch_qidian_chapters(book_id: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://m.qidian.com/book/{}/catalog/", book_id);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("请求起点目录失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取起点目录数据失败: {}", e))?;

    // 1. 尝试从 vite-plugin-ssr_pageContext 标签中解析 JSON
    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(vs) = parsed.pointer("/pageContext/pageProps/pageData/vs") {
                        return Ok(vs.clone());
                    }
                }
            }
        }
    }

    // 2. 备用逻辑：正则提取
    let re = regex::Regex::new(r"(?i)<script[^>]*>([\s\S]*?)</script>")
        .map_err(|e| e.to_string())?;

    for cap in re.captures_iter(&html) {
        let content = &cap[1];
        if content.contains("INITIAL_STATE") {
            let parsed: Value = serde_json::from_str(content)
                .map_err(|e| format!("解析起点 JSON 失败: {}", e))?;
            
            if let Some(vs) = parsed.pointer("/pageContext/pageProps/pageData/vs") {
                return Ok(vs.clone());
            }
        }
    }

    Err("未能从起点页面中提取到章节目录。".to_string())
}

/// 抓取起点章节内容
#[tauri::command]
pub async fn fetch_qidian_chapter_content(book_id: String, chapter_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://m.qidian.com/chapter/{}/{}/", book_id, chapter_id);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("请求起点章节失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取起点章节内容失败: {}", e))?;

    // 1. 尝试从 vite-plugin-ssr_pageContext 标签中解析 JSON
    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(c_content) = parsed.pointer("/pageContext/pageProps/pageData/chapterInfo/content") {
                        if let Some(s) = c_content.as_str() {
                            return Ok(s.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. 备用逻辑：正则提取
    let re = regex::Regex::new(r"(?i)<script[^>]*>([\s\S]*?)</script>")
        .map_err(|e| e.to_string())?;

    for cap in re.captures_iter(&html) {
        let content = &cap[1];
        if content.contains("INITIAL_STATE") {
            let parsed: Value = serde_json::from_str(content)
                .map_err(|e| format!("解析起点 JSON 失败: {}", e))?;
            
            if let Some(c_content) = parsed.pointer("/pageContext/pageProps/pageData/chapterInfo/content") {
                if let Some(s) = c_content.as_str() {
                    return Ok(s.to_string());
                }
            }
        }
    }

    Err("未能从起点页面中提取到章节内容，可能为 VIP 收费章节。".to_string())
}

/// 抓取番茄小说章节目录
#[tauri::command]
pub async fn fetch_fanqie_chapters(book_id: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://fanqienovel.com/api/reader/directory/detail?bookId={}", book_id);
    let resp = client.get(&url)
        .header("Referer", "https://fanqienovel.com/")
        .send()
        .await
        .map_err(|e| format!("请求番茄目录失败: {}", e))?;

    let json: Value = resp.json()
        .await
        .map_err(|e| format!("读取番茄目录数据失败: {}", e))?;

    if let Some(list) = json.pointer("/data/chapterListWithVolume") {
        return Ok(list.clone());
    }

    Err("未能从番茄目录 API 中提取到章节列表。".to_string())
}

/// 抓取番茄小说章节内容
#[tauri::command]
pub async fn fetch_fanqie_chapter_content(chapter_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://fanqienovel.com/reader/{}", chapter_id);
    let resp = client.get(&url)
        .header("Referer", "https://fanqienovel.com/")
        .send()
        .await
        .map_err(|e| format!("请求番茄章节失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取番茄章节内容失败: {}", e))?;

    // 使用花括号配对提取 HTML 中的 window.__INITIAL_STATE__ JSON
    let re = regex::Regex::new(r"(?i)window\.__INITIAL_STATE__\s*=\s*")
        .map_err(|e| e.to_string())?;

    if let Some(m) = re.find(&html) {
        let json_start = m.end();
        let bytes = html[json_start..].as_bytes();
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escaped = false;
        let mut end_pos = 0;
        for (i, &b) in bytes.iter().enumerate() {
            if in_string {
                if escaped { escaped = false; continue; }
                if b == b'\\' { escaped = true; continue; }
                if b == b'"' { in_string = false; }
                continue;
            }
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 { end_pos = i + 1; break; }
                }
                _ => {}
            }
        }
        if end_pos > 0 {
            let content = &html[json_start..json_start + end_pos];
            let sanitized = content.replace(":undefined", ":null").replace(": undefined", ": null");
            let parsed: Value = serde_json::from_str(&sanitized)
                .map_err(|e| format!("解析番茄 JSON 失败: {}", e))?;
            
            if let Some(c_content) = parsed.pointer("/reader/chapterData/content") {
                if let Some(s) = c_content.as_str() {
                    return Ok(s.to_string());
                }
            }
        }
    }

    Err("未能从番茄页面中提取到章节内容。".to_string())
}

/// 抓取起点小说完整简介（详情页）
#[tauri::command]
pub async fn fetch_qidian_description(book_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://m.qidian.com/book/{}/", book_id);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("请求起点详情失败: {}", e))?;

    let html = resp.text()
        .await
        .map_err(|e| format!("读取起点详情数据失败: {}", e))?;

    if let Some(start_idx) = html.find("id=\"vite-plugin-ssr_pageContext\"") {
        if let Some(tag_end) = html[start_idx..].find('>') {
            let start_json = start_idx + tag_end + 1;
            if let Some(end_json) = html[start_json..].find("</script>") {
                let json_str = &html[start_json..start_json + end_json];
                if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                    if let Some(desc) = parsed.pointer("/pageContext/pageProps/pageData/bookInfo/desc") {
                        if let Some(s) = desc.as_str() {
                            return Ok(s.trim().trim_start_matches('\u{3000}').to_string());
                        }
                    }
                }
            }
        }
    }

    // 备用正则提取
    if let Ok(re) = regex::Regex::new(r#""desc"\s*:\s*"([^"]+)""#) {
        if let Some(cap) = re.captures(&html) {
            return Ok(cap[1].to_string());
        }
    }

    Err("未能从起点详情页中提取到完整简介。".to_string())
}

