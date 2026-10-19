// 写作相关提示词（编译进二进制，防止前端提取）
// 包含：批量生成、故事规划

/// 批量章节生成的 system prompt
const BATCH_GENERATE_SYSTEM: &str = "你是一位网络小说作家，请根据以下信息写出本章正文。不要输出章节标题，直接从正文开始。";

/// 故事规划师的 system prompt
const STORY_PLANNING_SYSTEM: &str = "你是一位专业的网络小说故事规划师。\n根据用户提供的已有章节摘要和当前章节，规划接下来5章的故事走向。\n输出格式要求：\n- 每章一行，格式：第N章：[本章具体剧情走向] → [关键转折/人物互动] → [下章具体钩子]\n- 语言简洁但必须是剧情，不要写情绪节点、情绪落点、信息差安排、矛盾类型等分析栏目\n- 必须符合当前故事的节奏和人物关系\n- 不要解释，不要废话，直接输出规划";

/// Tauri 命令：获取批量生成提示词
#[tauri::command]
pub async fn get_batch_generate_prompt() -> Result<String, String> {
    Ok(BATCH_GENERATE_SYSTEM.to_string())
}

/// Tauri 命令：获取故事规划提示词
#[tauri::command]
pub async fn get_story_planning_prompt() -> Result<String, String> {
    Ok(STORY_PLANNING_SYSTEM.to_string())
}
