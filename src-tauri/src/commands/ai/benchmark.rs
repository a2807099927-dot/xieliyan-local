// AI 链路探测 — 并发 ping 主流 provider 入口，返回延迟 / 状态

use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const BENCHMARK_TIMEOUT_MS: u64 = 9000;

#[tauri::command]
pub async fn ai_benchmark_links(app: AppHandle) -> Result<Value, String> {
    // 从 config 读 vertex 项目（如果有）
    let config = crate::commands::config::config_load(app).await?;
    let ai = config.get("config").and_then(|c| c.get("ai"));
    let project_id = ai
        .and_then(|a| a.get("vertexProjectId"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let location = ai
        .and_then(|a| a.get("vertexLocation").or_else(|| a.get("vertexRegion")))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("global");
    let vertex_host = if location == "global" {
        "https://aiplatform.googleapis.com".to_string()
    } else {
        format!("https://{}-aiplatform.googleapis.com", location)
    };

    let probes: Vec<(&str, String)> = vec![
        ("openai", "https://api.openai.com/v1/models".to_string()),
        ("anthropic", "https://api.anthropic.com/v1/messages".to_string()),
        ("gemini", "https://generativelanguage.googleapis.com/v1beta/models".to_string()),
        ("grok", "https://api.x.ai/v1/models".to_string()),
        ("deepseek", "https://api.deepseek.com/models".to_string()),
        ("zhipu", "https://open.bigmodel.cn/api/paas/v4/models".to_string()),
        (
            "vertex_ai",
            if project_id.is_empty() {
                format!("{}/v1beta1/publishers/google/models", vertex_host)
            } else {
                format!(
                    "{}/v1/projects/{}/locations/{}/publishers/google/models",
                    vertex_host, project_id, location
                )
            },
        ),
    ];

    let client = crate::ai::build_client_with_system_proxy(Duration::from_millis(BENCHMARK_TIMEOUT_MS));

    let mut probe_handles = Vec::new();
    for (provider, url) in probes {
        let client = client.clone();
        let provider = provider.to_string();
        probe_handles.push(tokio::spawn(async move {
            let started = Instant::now();
            let resp = client
                .get(&url)
                .header("Accept", "application/json")
                .send()
                .await;
            let latency = started.elapsed().as_millis() as u64;
            match resp {
                Ok(r) => {
                    let status = r.status().as_u16();
                    json!({
                        "provider": provider,
                        "url": url,
                        "status": status,
                        "latencyMs": latency,
                        "reachable": status > 0 && status < 600,
                    })
                }
                Err(e) => json!({
                    "provider": provider,
                    "url": url,
                    "status": 0,
                    "latencyMs": latency,
                    "reachable": false,
                    "error": e.to_string(),
                }),
            }
        }));
    }

    let mut probes_result: Vec<Value> = Vec::new();
    for handle in probe_handles {
        if let Ok(value) = handle.await {
            probes_result.push(value);
        }
    }

    Ok(json!({
        "generatedAt": chrono::Local::now().to_rfc3339(),
        "probes": probes_result,
    }))
}
