// 用户沉淀技能（用户确认制）的持久化存储。
// 与内置技能不同，用户技能是运行时确认后动态产生的，存 app_data 的 user_skills.json。
// 每次会话启动时前端读取并注册进 agentSkillRegistry。
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const USER_SKILLS_FILE: &str = "user_skills.json";

fn user_skills_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join(USER_SKILLS_FILE)
}

/// 读取全部用户技能（JSON 数组）。不存在 / 出错时返回空数组。
#[tauri::command]
pub fn user_skills_load(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = user_skills_path(&app);
    match fs::read_to_string(&path) {
        Ok(s) if !s.trim().is_empty() => serde_json::from_str(&s).map_err(|e| e.to_string()),
        _ => Ok(Vec::new()),
    }
}

/// 覆盖保存全部用户技能。
#[tauri::command]
pub fn user_skills_save(app: AppHandle, skills: Vec<serde_json::Value>) -> Result<bool, String> {
    let path = user_skills_path(&app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string(&skills).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(true)
}

/// 返回 app_data 目录路径（前端拼 user_skills 相关路径用）。
#[tauri::command]
pub fn app_data_path(app: AppHandle) -> Result<String, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.to_string_lossy().to_string())
}
