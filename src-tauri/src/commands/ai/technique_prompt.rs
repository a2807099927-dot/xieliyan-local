// 网文风向标 · 章节技法分析提示词（编译进二进制，防止前端提取）

pub const TECHNIQUE_SYSTEM_PROMPT: &str = r#"你是一位精通网文创作方法论的章法分析大师，擅长从以下维度拆解写作技法：
- 矛盾驱动论（身份/环境/生死/阶层/唯一性/理念矛盾）
- 期待感工程（短钩/中钩/长钩、信息差操控）
- 三方阵营论（主角方/敌方/第三方的逻辑完善）
- 情绪节奏（压迫-释放循环、波浪式情绪）
- 人设分层法（类型模型→标签→顺承/打破）

请对章节进行深度技法拆解，重点输出【可复刻的写作技法】。"#;

pub fn build_technique_user_prompt(chapter_titles: &str, chapter_count: usize, full_text: &str) -> String {
    format!(
        r#"以下是「{titles}」共{count}章的完整正文：

{text}

请从以下维度进行专业技法拆解：

1. 【主线剧情推进】：这{count}章的核心矛盾是什么？矛盾如何层层推进？用了什么矛盾类型？
2. 【伏笔与钩子布局】：埋了哪些伏笔？短钩/中钩/长钩分别是什么？跨章节的期待感如何维持？
3. 【信息差操控】：读者和角色之间的信息差如何变化？这种信息差制造了什么情绪效果？
4. 【情绪节奏】：{count}章整体的情绪走向（压→升→压→升）？哪章是蓄压哪章是释放？
5. 【人设技法】：角色是如何分层塑造的？有没有顺承/打破？
6. 【阵营逻辑】：矛盾来源多样性如何？是否有第三方转换、友军引出等手法？
7. 【可复刻模板】：这{count}章中最值得学习的3-5个具体技法，写出可直接套用的操作步骤。

要求：语言精炼一针见血，重点是【可复刻】，不要泛泛而谈。用 Markdown 格式输出。"#,
        titles = chapter_titles,
        count = chapter_count,
        text = full_text
    )
}

/// Tauri 命令：返回技法分析提示词（前端不再硬编码）
#[tauri::command]
pub async fn get_technique_analysis_prompt(
    chapter_titles: String,
    chapter_count: u32,
    full_text: String,
) -> Result<serde_json::Value, String> {
    let user_prompt = build_technique_user_prompt(&chapter_titles, chapter_count as usize, &full_text);
    Ok(serde_json::json!({
        "systemPrompt": TECHNIQUE_SYSTEM_PROMPT,
        "userPrompt": user_prompt
    }))
}
