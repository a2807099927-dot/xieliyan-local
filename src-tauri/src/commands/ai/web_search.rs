// 内置联网搜索（爬取 Bing 搜索结果页，无需 API Key）
// 用于在 AI 调用前注入搜索结果上下文

use regex::Regex;

/// 爬取 Bing 搜索结果，返回摘要文本（用于注入 AI context）
#[tauri::command]
pub async fn web_search(query: String) -> Result<String, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(String::new());
    }

    let url = format!(
        "https://cn.bing.com/search?q={}&ensearch=0",
        urlencoding::encode(q)
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Ok(String::new());
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("读取搜索结果失败: {}", e))?;

    // 解析 Bing 搜索结果：提取 <li class="b_algo" ...> 中的标题和摘要
    let mut results: Vec<String> = Vec::new();

    // 匹配 b_algo 块（class 后可能有其他属性）
    let block_re = Regex::new(r#"<li class="b_algo"[^>]*>([\s\S]*?)</li>"#).unwrap();
    let title_re = Regex::new(r#"<h2[^>]*><a[^>]*>([^<]+)</a>"#).unwrap();
    let snippet_re = Regex::new(r#"<p[^>]*>([^<]{15,})</p>"#).unwrap();

    for cap in block_re.captures_iter(&html) {
        if results.len() >= 5 { break; }
        let block = &cap[1];

        let title = title_re.captures(block)
            .map(|m| strip_html_tags(&m[1]))
            .unwrap_or_default();

        let snippet = snippet_re.captures(block)
            .map(|m| strip_html_tags(&m[1]))
            .unwrap_or_default();

        if !snippet.is_empty() {
            let entry = if !title.is_empty() {
                format!("{}：{}", title.trim(), snippet.trim())
            } else {
                snippet.trim().to_string()
            };
            results.push(entry);
        }
    }

    if results.is_empty() {
        return Ok(String::new());
    }

    Ok(format!("【联网搜索结果（Bing）：{}】\n{}", q, results.join("\n")))
}

fn strip_html_tags(input: &str) -> String {
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    let text = tag_re.replace_all(input, "");
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}
