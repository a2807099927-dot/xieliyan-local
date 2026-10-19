// 章节级 AI 分析 + 分析会话存档
// 对应 electron/novel-analyzer.ts + electron/novel-crawler.ts 的 AnalysisSession 部分
//
// 流式实现：
//   - 通过 tauri event "novel-lab:analyze-chunk" / "novel-lab:analyze-done" / "novel-lab:analyze-error"
//   - 全局 ANALYZE_TASKS 用 requestId 索引 CancellationToken
//   - 调用前先 abort 上一次

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::ai::manager;
use crate::ai::types::{AiConfig, ChatMessage};
use crate::commands::config::config_load;

use super::paths::{
    analysis_dir, book_dir, merged_analysis_filename, sanitize_file_name,
};

const ANALYZE_CHUNK_EVENT: &str = "novel-lab:analyze-chunk";
const ANALYZE_DONE_EVENT: &str = "novel-lab:analyze-done";
const ANALYZE_ERROR_EVENT: &str = "novel-lab:analyze-error";

/// 全局 abort 表（key = requestId）
static ANALYZE_TASKS: Mutex<Option<HashMap<String, CancellationToken>>> = Mutex::new(None);

fn analyze_table() -> std::sync::MutexGuard<'static, Option<HashMap<String, CancellationToken>>> {
    let guard = ANALYZE_TASKS.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        drop(guard);
        let mut guard = ANALYZE_TASKS.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = Some(HashMap::new());
        }
        return guard;
    }
    guard
}

fn abort_existing(request_id: &str) {
    let mut table = analyze_table();
    if let Some(map) = table.as_mut() {
        if let Some(token) = map.remove(request_id) {
            token.cancel();
        }
    }
}

fn abort_all() {
    let mut table = analyze_table();
    if let Some(map) = table.as_mut() {
        for (_, token) in map.drain() {
            token.cancel();
        }
    }
}

fn build_system_prompt(mode: &str, is_batch: bool) -> String {
    // 追问/对话场景（非批量首轮）：纯文字教练式回答，不输出卡片 JSON
    if !is_batch {
        let focus = match mode {
            "plot"      => "剧情脉络、矛盾推进与阵营关系",
            "character" => "人设分层、角色动机与成长弧线",
            "technique" => "期待感工程、信息差与情绪节奏等可复刻写作技法",
            "value"     => "读者情绪价值与爸点/期待感管理",
            _           => "网文核心写作技法（矛盾/期待感/信息差/情绪节奏/人设）",
        };
        return format!("你是一名专业网文写作教练。请结合上文分析结论与用户追问，用简体中文清晰作答。
回答要求：
- 直接回答用户问题，可用简短 Markdown（小标题/要点/加粗），但不要输出 [card] 标记或任何 JSON。
- 结合具体人物、场景、事件支撑观点，不要泛泛而谈。
- 侧重：{}。
- 不要编造正文中没有的信息。", focus);
    }

    // 统一 prompt：所有分析场景都走同一套（卡片 JSON 输出）
    let base = "你是一名专业网文章法分析师与写作教练。\n\
                你精通矛盾驱动论、期待感工程、三方阵营论、人设分层法等网文核心技法。\n\
                用户会提供章节正文或追问问题，你需要从【可复刻的写作技法】角度回答，不要泛泛而谈。\n\
                重点分析：矛盾类型与推进方式、期待感制造手法、信息差操控、情绪压迫-释放节奏、人设塑造技巧。\n\
                请始终使用简体中文回答。\n\n\
                你精通以下核心方法论：\n\
                1. 矛盾驱动论：身份矛盾/环境矛盾/生死危机/阶层矛盾/唯一性矛盾/理念矛盾\n\
                2. 期待感工程：期待感>爽点，信息差制造期待，短钩/中钩/长钩管理\n\
                3. 三方阵营论：主角方/敌方/第三方的逻辑完善，动机铺垫层数\n\
                4. 情绪节奏：压迫-释放循环，波浪式情绪，蓄压与兑现\n\
                5. 人设分层法：类型模型→标签重复→顺承/打破\n\n\
                你的任务是把用户提供的全部文本从头到尾作为一个完整故事进行拆解，输出严格 JSON。\n\
                ⚠️ 极其重要：用户提供的文本可能包含多个章节标记（如【第一章】【第二章】等），\n\
                你必须阅读并分析从第一章到最后一章的全部内容，综合所有章节的剧情、人物、矛盾来输出分析。\n\
                绝对不能只分析第一章或前几章就停止！你的分析必须覆盖全文所有内容。\n\
                最终只输出一个 [card]，这个 card 是对全文整体的分析总结。\n\
                请始终使用简体中文撰写字段值。\n\
                不要编造正文中没有的信息。";

    let mode_focus = match mode {
        "plot"      => "突出矛盾类型与剧情推进结构（矛盾→解决→新矛盾循环），分析阵营关系如何延伸剧情。",
        "character" => "突出人设分层技法（类型模型/标签/顺承or打破）、角色动机铺垫层数、强主角方vs弱主角方。",
        "technique" => "突出期待感制造手法、信息差类型、情绪压迫-释放节奏、钩子密度与兑现节奏。",
        "value"     => "突出读者情绪价值：代入感锚点、爽点扩展机制、期待感管理、可复刻的情绪工程模板。",
        _           => "全面拆解：矛盾结构 / 期待感工程 / 信息差 / 情绪节奏 / 阵营逻辑 / 人设技法 / 可复刻模板。",
    };

    let format_guide = r#"
## 输出格式（强约束）

- 不要输出任何额外说明文本、Markdown 标题、表格、代码块语言标记
- 将全文从头到尾的所有内容综合分析，只输出一个 [card]{json}[/card]
- 你的分析必须涵盖文本中所有章节的内容，不能只分析开头部分
- JSON 字段名严格按下面的英文键名，不得翻译为中文键
- ⚠️ 所有分析字段必须结合具体剧情内容来写，引用具体场景、人物、事件，让读者能看懂故事讲了什么以及作者用了什么技巧

## JSON Schema（必须按此结构输出）

[card]
{
  "chapterIndex": 1,
  "chapterTitle": "全文整体分析",
  "storyOverview": "用200-400字概述整个故事的完整剧情走向，从开篇到结尾，让没读过原文的人也能看懂故事讲了什么",
  "mainTag": "building",
  "subTags": ["hook", "levelup"],
  "tagReason": "结合剧情说明为什么打这个标签，如：全文以主角从废物到觉醒的成长线为主轴，前5章铺垫蓄势，后5章集中爆发",
  "writingTechniques": [
    {
      "name": "技法名称（如：身份反转铺垫、压迫式蓄力、信息差悬念等）",
      "where": "具体出现在哪里（如：第3章主角被当众羞辱时）",
      "how": "作者具体怎么操作的（如：先用三段对话让配角反复强调主角是废物，再用一个细节暗示主角的隐藏实力）",
      "effect": "这个技法产生了什么效果（如：读者产生强烈的期待感，想看主角打脸）"
    }
  ],
  "plotProgression": [
    {
      "stage": "阶段名（如：开篇铺垫/矛盾升级/高潮爆发/收束留钩）",
      "chapters": "对应哪些章节",
      "content": "这个阶段具体发生了什么（100字以内，要有人物和事件）",
      "technique": "这个阶段作者用了什么写作手法"
    }
  ],
  "characterAnalysis": [
    {
      "name": "角色名",
      "role": "在故事中的定位（主角/对手/助力/第三方）",
      "arc": "这个角色在全文中的变化轨迹",
      "technique": "作者塑造这个角色用了什么手法"
    }
  ],
  "conflictSource": "misunderstanding",
  "conflictType": "具体描述核心矛盾是什么，涉及哪些人物",
  "contradictionAnalysis": {
    "type": "identity",
    "description": "详细描述矛盾的本质，结合具体剧情（80-150字）",
    "pressureLayers": 3,
    "pressureDetail": ["具体压迫来源1：xxx场景中xxx对主角做了什么", "具体压迫来源2", "具体压迫来源3"],
    "releaseStatus": "partial",
    "releasePreview": "矛盾是如何被释放或留悬的，具体到哪个场景"
  },
  "expectationEngineering": {
    "shortHook": "具体的章内悬念：在第X章结尾，作者写了xxx，让读者想知道xxx",
    "midHook": "跨章悬念：从第X章埋下的xxx线索，到第Y章才揭晓",
    "longHook": "全文级悬念（如果有）",
    "infoGapType": "reader_knows_more",
    "infoGapDetail": "具体说明信息差：读者通过xxx场景知道了xxx，但主角/配角还不知道",
    "expectationDensity": "评估钩子密度，如：平均每章1-2个悬念点"
  },
  "emotionRhythm": {
    "pattern": "用箭头描述全文情绪走向",
    "pressureCount": 5,
    "longestFlatSegment": "哪里节奏最平，大约多长",
    "waveDescription": "详细描述情绪波动：第1-2章平稳铺垫→第3章突然压迫（xxx事件）→第5章小高潮（xxx）→第8章大爆发（xxx）→第10章留钩"
  },
  "campAnalysis": {
    "protagonist": "主角是谁，有什么特点和目标",
    "enemy": "对手/敌方是谁，动机是什么",
    "thirdParty": "第三方势力（如果有），立场如何",
    "logicCheck": "各方行为逻辑是否自洽，有无漏洞"
  },
  "hookPlacement": {
    "opening": "开篇钩子：具体是什么场景/事件抓住读者",
    "middle": "中段钩子：哪个转折点让读者欲罢不能",
    "ending": "结尾钩子：最后留了什么悬念让读者想继续看"
  },
  "climaxPosition": "back",
  "infoRelease": "全文的信息释放节奏：哪些信息在前期隐藏，哪些在中期透露，哪些在高潮揭晓",
  "reusablePattern": "提炼3-5个可复刻的写作模板，每个用一句话描述操作步骤，如：\n1. 先让旁观者低估主角→再用权威留伏笔→信息差让读者多知一层\n2. 用连续三次失败蓄压→第四次突然成功制造爽感\n3. ...",
  "hookIntensity": 8,
  "labelConfidence": 0.85,
  "plotSummary": {
    "oneLineSummary": "一句话概括全文核心故事线",
    "keyEvents": ["关键事件1（具体到人物和动作）", "关键事件2", "关键事件3", "关键事件4", "关键事件5"],
    "linkBefore": "",
    "linkAfter": "全文结尾留下了什么悬念/伏笔指向后续"
  }
}
[/card]

## 枚举值说明

mainTag / subTags 可选值：
foundation（铺垫） / hook（钩子） / building（蓄势） / reveal（释放信息） /
levelup（升级） / twist（反转） / facehit（打脸） / climax（高潮） /
transition（承接） / newseed（新的铺垫） / payoff（收束兑现） / dialogue（对话博弈）

conflictSource 可选值：
external_enemy / rule_pressure / resource_competition / misunderstanding /
time_limit / power_gap / identity_constraint / inner_choice / relationship

contradictionAnalysis.type 可选值：
identity / environment / life_death / class / uniqueness / ideology / emotion / internal

expectationEngineering.infoGapType 可选值：
reader_knows_more / character_knows_more / both_unknown / none

contradictionAnalysis.releaseStatus 可选值：
released / partial / unreleased / deferred

climaxPosition 可选值：
front / middle / back / multi / none

## 内容硬约束

- storyOverview 必须是完整的故事概述（200-400字），让没读过原文的人能看懂
- writingTechniques 至少列出3个具体技法，每个都要有 where/how/effect
- plotProgression 按故事发展阶段列出，每个阶段都要有具体内容
- characterAnalysis 至少分析2个主要角色
- reusablePattern 必须提炼出具体可操作的写作模板，不少于3条
- emotionRhythm.waveDescription 必须结合具体章节和事件描述情绪走向
- 所有字段禁止空泛描述，必须引用具体的人物、场景、对话来支撑分析
- 没有内容的字段输出空字符串 ""
- hookIntensity：0-10 整数
- labelConfidence：0-1 浮点数
"#;

    format!("{}\n\n本批分析侧重：{}\n{}", base, mode_focus, format_guide)
}

fn build_ai_config(app_config: &Value) -> Result<AiConfig, String> {
    let ai = app_config
        .get("ai")
        .ok_or_else(|| "config.ai 缺失".to_string())?;
    serde_json::from_value::<AiConfig>(ai.clone())
        .map_err(|e| format!("ai 配置解析失败: {}", e))
}

#[tauri::command]
pub async fn novel_lab_analyze(
    app: AppHandle,
    request: Value,
) -> Result<bool, String> {
    let request_id = request
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            format!("novel-lab-{}", chrono::Utc::now().timestamp_millis())
        });

    let chapter_title = request.get("chapterTitle").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let chapter_content = request.get("chapterContent").and_then(|v| v.as_str()).unwrap_or("").to_string();
    // 防御性上限：即便前端未分批，也避免超长正文一次性发送给模型
    const MAX_CONTENT_CHARS: usize = 60_000;
    let chapter_content = if chapter_content.chars().count() > MAX_CONTENT_CHARS {
        let truncated: String = chapter_content.chars().take(MAX_CONTENT_CHARS).collect();
        format!("{}\n\n【注：正文过长，已自动截断至前 {} 字进行分析】", truncated, MAX_CONTENT_CHARS)
    } else {
        chapter_content
    };
    let chapter_count = request.get("chapterCount").and_then(|v| v.as_i64()).unwrap_or(1);
    let mode = request.get("mode").and_then(|v| v.as_str()).unwrap_or("full").to_string();
    let user_question = request.get("userQuestion").and_then(|v| v.as_str()).map(|s| s.to_string());
    let conversation_history: Vec<Value> = request
        .get("conversationHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // 取消上次同 id 的请求 + 注册新 token
    abort_existing(&request_id);
    let cancel = CancellationToken::new();
    {
        let mut table = analyze_table();
        if let Some(map) = table.as_mut() {
            map.insert(request_id.clone(), cancel.clone());
        }
    }

    let cfg_response = config_load(app.clone()).await?;
    let app_config = cfg_response.get("config").cloned().unwrap_or(Value::Null);
    let ai_config = match build_ai_config(&app_config) {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(ANALYZE_ERROR_EVENT, json!({ "requestId": request_id, "error": e.clone() }));
            return Err(e);
        }
    };
    if ai_config.api_key.is_empty() && ai_config.provider != "local" {
        let err = "未配置 AI API Key，请先在设置中完成配置。";
        let _ = app.emit(ANALYZE_ERROR_EVENT, json!({ "requestId": request_id, "error": err }));
        return Err(err.into());
    }

    let is_batch = conversation_history.is_empty() && user_question.is_none();
    let mut messages: Vec<ChatMessage> = vec![ChatMessage {
        role: "system".to_string(),
        content: Some(build_system_prompt(&mode, is_batch)),
        tool_calls: None,
        tool_call_id: None,
    }];

    if !conversation_history.is_empty() {
        for entry in &conversation_history {
            let role = entry.get("role").and_then(|v| v.as_str()).unwrap_or("user").to_string();
            let content = entry.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            messages.push(ChatMessage { role, content: Some(content), tool_calls: None, tool_call_id: None });
        }
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(user_question.unwrap_or_else(|| "请继续分析。".to_string())),
            tool_calls: None,
            tool_call_id: None,
        });
    } else {
        let instruction = if chapter_count > 1 {
            format!(
                "以下是一个完整故事的全部内容（共{}章），请将其作为一个整体从头到尾分析，输出一个覆盖全文的 [card]。",
                chapter_count
            )
        } else {
            "请开始分析。".to_string()
        };
        let user_block = format!(
            "【分析标题】{}\n\n【正文】\n{}\n\n{}",
            chapter_title,
            chapter_content,
            user_question
                .as_deref()
                .map(|q| format!("【额外问题】{}", q))
                .unwrap_or(instruction),
        );
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(user_block),
            tool_calls: None,
            tool_call_id: None,
        });
    }

    let app_clone = app.clone();
    let request_id_for_task = request_id.clone();

    tokio::spawn(async move {
        // 拆书分析输出较长（JSON 卡片），强制 max_tokens=16384 防止中转站/模型默认截断
        let mut analysis_config = ai_config.clone();
        analysis_config.max_tokens = Some(16384);
        analysis_config.stream_event = Some(ANALYZE_CHUNK_EVENT.to_string());
        analysis_config.stream_request_id = Some(request_id_for_task.clone());
        // 流式 → 通过 tauri event 转发到前端
        match manager::chat_stream(&app_clone, &analysis_config, &messages, &None, &None, None, cancel.clone()).await {
            Ok(_response) => {
                // 增量 chunk 已在 chat_stream 过程中经 stream_event 逐段转发，此处只需收尾
                let _ = app_clone.emit(
                    ANALYZE_DONE_EVENT,
                    json!({ "requestId": request_id_for_task }),
                );
            }
            Err(err) => {
                let payload = if cancel.is_cancelled() {
                    json!({ "requestId": request_id_for_task, "error": "分析已取消。" })
                } else {
                    crate::logger::error(format!("[novel_lab_analyze] {}", err));
                    json!({ "requestId": request_id_for_task, "error": err })
                };
                let _ = app_clone.emit(ANALYZE_ERROR_EVENT, payload);
            }
        }

        // 清理 token
        let mut table = analyze_table();
        if let Some(map) = table.as_mut() {
            map.remove(&request_id_for_task);
        }
    });

    Ok(true)
}

#[tauri::command]
pub async fn novel_lab_analyze_abort(request_id: Option<String>) -> Result<bool, String> {
    match request_id {
        Some(id) if !id.is_empty() => abort_existing(&id),
        _ => abort_all(),
    }
    Ok(true)
}

// ---------- 分析会话存档 ----------

#[tauri::command]
pub async fn novel_lab_save_analysis(
    save_path: String,
    book_name: String,
    session: Value,
) -> Result<Value, String> {
    let dir = analysis_dir(&save_path, &book_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mode = session.get("mode").and_then(|v| v.as_str()).unwrap_or("full").to_string();
    let label = session.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let chapter_from = session.get("chapterFrom").and_then(|v| v.as_i64()).unwrap_or(0);
    let chapter_to = session.get("chapterTo").and_then(|v| v.as_i64()).unwrap_or(chapter_from);
    let created_at = session
        .get("createdAt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let messages = session.get("messages").cloned().unwrap_or(json!([]));

    let id = format!("{}_{}", mode, chrono::Utc::now().timestamp_millis());
    let full = json!({
        "id": id.clone(),
        "mode": mode,
        "label": label,
        "chapterFrom": chapter_from,
        "chapterTo": chapter_to,
        "createdAt": created_at,
        "messages": messages.clone(),
    });
    let file_path = dir.join(format!("{}.json", id));
    let content = serde_json::to_string_pretty(&full).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;

    // 追加到合并分析文件
    let merged_path = book_dir(&save_path, &book_name).join(merged_analysis_filename(&book_name));
    let assistant_msgs: Vec<String> = messages
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| {
            let role = m.get("role").and_then(|v| v.as_str()).unwrap_or("");
            let content = m.get("content").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if role == "assistant" && !content.is_empty() {
                Some(content.trim_start_matches("[batch]").trim().to_string())
            } else {
                None
            }
        })
        .collect();
    if !assistant_msgs.is_empty() {
        let header = format!(
            "\n\n{}\n[{}] 第{}-{}章\n{}\n\n",
            "─".repeat(40),
            if full.get("label").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
                full.get("mode").and_then(|v| v.as_str()).unwrap_or("").to_string()
            } else {
                full.get("label").and_then(|v| v.as_str()).unwrap_or("").to_string()
            },
            chapter_from,
            chapter_to,
            "─".repeat(40)
        );
        let mut existing = fs::read_to_string(&merged_path).unwrap_or_default();
        existing.push_str(&header);
        existing.push_str(&assistant_msgs.join("\n\n"));
        fs::write(&merged_path, existing).map_err(|e| e.to_string())?;
    }

    // 更新 _index.json 的 lastAnalyzedXxx
    let index_path = book_dir(&save_path, &book_name).join("_index.json");
    if index_path.exists() {
        if let Ok(raw) = fs::read_to_string(&index_path) {
            if let Ok(mut meta) = serde_json::from_str::<Value>(&raw) {
                if let Some(obj) = meta.as_object_mut() {
                    obj.insert("lastAnalyzedIndex".to_string(), json!(chapter_to));
                    obj.insert("lastAnalyzedAt".to_string(), json!(created_at));
                    obj.insert(
                        "lastAnalyzedMode".to_string(),
                        json!(full.get("mode").and_then(|v| v.as_str()).unwrap_or("")),
                    );
                }
                if let Ok(text) = serde_json::to_string_pretty(&meta) {
                    let _ = fs::write(&index_path, text);
                }
            }
        }
    }

    Ok(json!({ "success": true, "id": id }))
}

#[tauri::command]
pub async fn novel_lab_list_analyses(
    save_path: String,
    book_name: String,
) -> Result<Value, String> {
    let dir = analysis_dir(&save_path, &book_name);
    if !dir.exists() {
        return Ok(json!({ "success": true, "sessions": [] }));
    }
    let mut sessions: Vec<Value> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read_to_string(entry.path()) {
                if let Ok(value) = serde_json::from_str::<Value>(&raw) {
                    sessions.push(json!({
                        "id": value.get("id").cloned().unwrap_or(Value::Null),
                        "mode": value.get("mode").cloned().unwrap_or(Value::Null),
                        "label": value.get("label").cloned().unwrap_or(Value::Null),
                        "chapterFrom": value.get("chapterFrom").cloned().unwrap_or(Value::Null),
                        "chapterTo": value.get("chapterTo").cloned().unwrap_or(Value::Null),
                        "createdAt": value.get("createdAt").cloned().unwrap_or(Value::Null),
                    }));
                }
            }
        }
    }
    sessions.sort_by(|a, b| {
        let aa = a.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let bb = b.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        bb.cmp(aa)
    });
    Ok(json!({ "success": true, "sessions": sessions }))
}

#[tauri::command]
pub async fn novel_lab_load_analysis(
    save_path: String,
    book_name: String,
    id: String,
) -> Result<Value, String> {
    let path = analysis_dir(&save_path, &book_name).join(format!("{}.json", id));
    if !path.exists() {
        return Ok(json!({ "success": false, "error": "未找到分析记录" }));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let session: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true, "session": session }))
}

#[allow(dead_code)]
fn _hint() {
    let _ = sanitize_file_name("");
    let _ = Path::new("");
}
