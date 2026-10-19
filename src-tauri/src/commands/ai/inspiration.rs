// 灵感搜索 — AI 直接生成参考段落
// 不再走网络搜索，直接让 AI 根据用户上下文生成 3-5 段不同风格的参考写法

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::ai::manager;
use crate::ai::types::{AiConfig, ChatMessage};

#[derive(Debug, Deserialize)]
pub struct InspirationRequest {
    pub query: String,
    pub current_chapter: String,
    pub context_summary: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct InspirationResult {
    pub book_name: String,
    pub chapter_hint: String,
    pub reason: String,
    pub fetched_text: String,
    pub source_url: String,
}

#[derive(Debug, Serialize)]
pub struct InspirationResponse {
    pub success: bool,
    pub results: Vec<InspirationResult>,
    pub ai_analysis: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn build_ai_config_from_json(config_json: &Value) -> Result<AiConfig, String> {
    let ai = config_json
        .get("ai")
        .ok_or_else(|| "config missing ai field".to_string())?;
    let cfg: AiConfig = serde_json::from_value(ai.clone())
        .map_err(|e| format!("ai config parse failed: {}", e))?;
    Ok(cfg)
}

fn extract_json_from_response(text: &str) -> Result<Value, String> {
    if let Ok(v) = serde_json::from_str::<Value>(text) {
        return Ok(v);
    }
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            let slice = &text[start..=end];
            if let Ok(v) = serde_json::from_str::<Value>(slice) {
                return Ok(v);
            }
        }
    }
    Err(format!("AI response not valid JSON: {}", &text[..text.len().min(200)]))
}

#[tauri::command]
pub async fn ai_inspiration_search(
    app: AppHandle,
    request: InspirationRequest,
) -> Result<InspirationResponse, String> {
    let config_result = crate::commands::config::config_load(app.clone()).await?;
    let config = config_result
        .get("config")
        .cloned()
        .ok_or("config load failed")?;
    let ai_config = build_ai_config_from_json(&config)?;

    if ai_config.api_key.is_empty() && ai_config.provider != "local" {
        return Err("API Key not configured".into());
    }

    let system_prompt = r#"你是一个网文阅读量极大的资深编辑兼写作教练。用户正在写小说，遇到了卡文或需要参考。

请根据用户提供的当前章节内容、前文摘要和问题，完成以下任务：
1. 简要分析用户当前的写作困境
2. 生成 3-5 段不同风格的参考段落（每段 200-400 字），展示这个场景可以怎么写
3. 每段标注灵感来源（参考了哪部经典网文的写法风格）和写作手法说明

请严格按以下 JSON 格式返回：
{
  "analysis": "对用户当前困境的简要分析（1-2句话）",
  "references": [
    {
      "style_source": "灵感来源（如：全职高手式简洁利落型）",
      "technique": "使用的写作手法（如：动作白描+环境渲染）",
      "text": "参考段落正文（200-400字，直接可用的小说正文）"
    }
  ]
}

要求：
- 参考段落必须是原创的，不是抄袭原文
- 风格要多样化（如：简洁型、沉浸型、幽默型、紧张型）
- 段落要能自然衔接用户当前的情节
- 直接输出 JSON，不要解释"#;

    let user_content = format!(
        "【我的问题】\n{}\n\n【当前章节内容】\n{}\n\n【前文摘要】\n{}",
        request.query,
        &request.current_chapter[..request.current_chapter.len().min(2500)],
        &request.context_summary[..request.context_summary.len().min(1500)]
    );

    let messages = vec![
        ChatMessage { role: "system".to_string(), content: Some(system_prompt.to_string()), tool_calls: None, tool_call_id: None },
        ChatMessage { role: "user".to_string(), content: Some(user_content), tool_calls: None, tool_call_id: None },
    ];

    let cancel = tokio_util::sync::CancellationToken::new();
    let response = manager::chat(&ai_config, &messages, &None, &None, cancel).await?;
    let text = response.text.trim().to_string();

    let parsed = extract_json_from_response(&text)?;

    let analysis = parsed
        .get("analysis")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let references = parsed
        .get("references")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let style = item.get("style_source")?.as_str()?.to_string();
                    let technique = item.get("technique")?.as_str()?.to_string();
                    let text = item.get("text")?.as_str()?.to_string();
                    if text.len() < 20 { return None; }
                    Some(InspirationResult {
                        book_name: style,
                        chapter_hint: technique,
                        reason: String::new(),
                        fetched_text: text,
                        source_url: String::new(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if references.is_empty() {
        return Ok(InspirationResponse {
            success: true,
            results: vec![],
            ai_analysis: analysis,
            error: Some("AI did not generate valid references".to_string()),
        });
    }

    Ok(InspirationResponse {
        success: true,
        results: references,
        ai_analysis: analysis,
        error: None,
    })
}
