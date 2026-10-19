// Prompt 注册表 — 通过 ID 获取解密后的 prompt
use super::xor_decrypt;

// XOR 密钥（16字节，混淆用）
const XOR_KEY: &[u8] = b"xLy2026PrOmPtKeY";

/// 获取指定 ID 的 prompt
pub fn get_prompt(id: &str) -> Option<String> {
    let data = get_encrypted_data(id)?;
    Some(xor_decrypt(data, XOR_KEY))
}

fn get_encrypted_data(id: &str) -> Option<&'static [u8]> {
    match id {
        "smart_organize_system" => Some(&super::encrypted::SMART_ORGANIZE_SYSTEM),
        "smart_organize_rules" => Some(&super::encrypted::SMART_ORGANIZE_RULES),
        "continuation_system" => Some(&super::encrypted::CONTINUATION_SYSTEM),
        "rewrite_system" => Some(&super::encrypted::REWRITE_SYSTEM),
        "diff_analysis_system" => Some(&super::encrypted::DIFF_ANALYSIS_SYSTEM),
        "inline_suggestion_system" => Some(&super::encrypted::INLINE_SUGGESTION_SYSTEM),
        "world_builder_bg" => Some(&super::encrypted::WORLD_BUILDER_BG),
        "world_builder_faction" => Some(&super::encrypted::WORLD_BUILDER_FACTION),
        "world_builder_char" => Some(&super::encrypted::WORLD_BUILDER_CHAR),
        "world_builder_plot" => Some(&super::encrypted::WORLD_BUILDER_PLOT),
        "world_builder_detail" => Some(&super::encrypted::WORLD_BUILDER_DETAIL),
        "agent_chat_system" => Some(&super::encrypted::AGENT_CHAT_SYSTEM),
        "agent_writing_system" => Some(&super::encrypted::AGENT_WRITING_SYSTEM),
        "agent_outline_system" => Some(&super::encrypted::AGENT_OUTLINE_SYSTEM),
        "outline_wizard_summary" => Some(&super::encrypted::OUTLINE_WIZARD_SUMMARY),
        "outline_wizard_plan" => Some(&super::encrypted::OUTLINE_WIZARD_PLAN),
        "outline_wizard_generate" => Some(&super::encrypted::OUTLINE_WIZARD_GENERATE),
        "outline_wizard_modify" => Some(&super::encrypted::OUTLINE_WIZARD_MODIFY),
        "batch_analyze_system" => Some(&super::encrypted::BATCH_ANALYZE_SYSTEM),
        "outline_board_system" => Some(&super::encrypted::OUTLINE_BOARD_SYSTEM),
        "full_rewrite_system" => Some(&super::encrypted::FULL_REWRITE_SYSTEM),
        "full_review_strong" => Some(&super::encrypted::FULL_REVIEW_STRONG),
        "plot_deduction_system" => Some(&super::encrypted::PLOT_DEDUCTION_SYSTEM),
        _ => None,
    }
}
