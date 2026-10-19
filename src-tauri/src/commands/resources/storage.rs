// 资源模块共享存储层 — book.json 读写 + 通用辅助
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::AppHandle;

use crate::workspace::books_dir;

pub(super) fn book_json_path(app: &AppHandle, book_id: &str) -> PathBuf {
    books_dir(app).join(book_id).join("book.json")
}

pub(super) fn read_book(app: &AppHandle, book_id: &str) -> Result<Value, String> {
    let path = book_json_path(app, book_id);
    if !path.exists() {
        return Err("书籍不存在".into());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub(super) fn write_book(app: &AppHandle, book_id: &str, book: &Value) -> Result<(), String> {
    let path = book_json_path(app, book_id);

    // 乐观锁：如果磁盘上的 book.json 比当前写入的版本更新，则放弃覆盖
    let incoming_updated_at = book.get("updatedAt").and_then(|v| v.as_str()).unwrap_or("");
    if path.exists() && !incoming_updated_at.is_empty() {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(existing) = serde_json::from_str::<Value>(&raw) {
                let existing_updated_at = existing.get("updatedAt").and_then(|v| v.as_str()).unwrap_or("");
                if existing_updated_at > incoming_updated_at {
                    crate::logger::warn(format!(
                        "[write_book bookId={}] optimistic lock: existing updatedAt ({}) > incoming updatedAt ({}), skip write",
                        book_id, existing_updated_at, incoming_updated_at
                    ));
                    return Ok(());
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(book).map_err(|e| e.to_string())?;
    let cat_len = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let role_len: usize = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|c| c.get("children").and_then(|ch| ch.as_array())).map(|ch| ch.len()).sum())
        .unwrap_or(0);
    crate::logger::warn(format!(
        "[write_book bookId={} bytes={} cats={} roles={}]",
        book_id, content.len(), cat_len, role_len
    ));
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 解析最新书籍：未指定 book_id 时取 updatedAt 最大的那本
pub(super) fn read_latest_book(app: &AppHandle) -> Result<(String, Value), String> {
    let dir = books_dir(app);
    if !dir.exists() {
        return Err("尚未初始化书籍目录".into());
    }
    let mut candidates: Vec<(String, Value)> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let book_id = entry.file_name().to_string_lossy().to_string();
            let bookfile = entry.path().join("book.json");
            if !bookfile.exists() {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(&bookfile) {
                if let Ok(book) = serde_json::from_str::<Value>(&raw) {
                    candidates.push((book_id, book));
                }
            }
        }
    }
    if candidates.is_empty() {
        return Err("未找到书籍".into());
    }
    candidates.sort_by(|a, b| {
        let ua = a.1.get("updatedAt").and_then(|v| v.as_str()).unwrap_or("");
        let ub = b.1.get("updatedAt").and_then(|v| v.as_str()).unwrap_or("");
        ub.cmp(ua)
    });
    candidates.into_iter().next().ok_or_else(|| "未找到书籍".to_string())
}

/// 取本书或最新书；返回 (book_id, book)
pub(super) fn resolve_book(
    app: &AppHandle,
    book_id: Option<&str>,
) -> Result<(String, Value), String> {
    match book_id.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(id) => Ok((id.to_string(), read_book(app, id)?)),
        None => read_latest_book(app),
    }
}

fn default_role_categories() -> Vec<Value> {
    vec![
        json!({ "id": "cat_main", "name": "主角", "isAuto": true, "children": [], "order": 0 }),
        json!({ "id": "cat_female", "name": "女主", "isAuto": true, "children": [], "order": 1 }),
        json!({ "id": "cat_support", "name": "配角", "isAuto": true, "children": [], "order": 2 }),
        json!({ "id": "cat_villain", "name": "反派", "isAuto": true, "children": [], "order": 3 }),
        json!({ "id": "cat_npc", "name": "NPC", "isAuto": true, "children": [], "order": 4 }),
        json!({ "id": "cat_extra", "name": "龙套", "isAuto": true, "children": [], "order": 5 }),
        json!({ "id": "cat_faction", "name": "势力", "isAuto": true, "children": [], "order": 6 }),
    ]
}

fn ensure_default_role_categories(categories: &mut Vec<Value>) {
    for default_category in default_role_categories() {
        let default_id = default_category.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let default_name = default_category.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let exists = categories.iter().any(|category| {
            category.get("id").and_then(|v| v.as_str()) == Some(default_id)
                || category.get("name").and_then(|v| v.as_str()) == Some(default_name)
        });
        if !exists {
            categories.push(default_category);
        }
    }
}

pub(super) fn default_category_name_for_role_type(role_type: &str) -> &'static str {
    match role_type {
        "主角" => "主角",
        "女主" => "女主",
        "反派" => "反派",
        "NPC" => "NPC",
        "龙套" => "龙套",
        "势力" => "势力",
        _ => "配角",
    }
}

/// 确保 resourceIndex.customCharacterCategories 存在，并补齐内置角色分类。
pub(super) fn ensure_categories(book: &mut Value) -> Result<&mut Vec<Value>, String> {
    let resource_index = book
        .as_object_mut()
        .ok_or_else(|| "book 根不是对象".to_string())?
        .entry("resourceIndex")
        .or_insert_with(|| json!({}));

    let resource_index = resource_index
        .as_object_mut()
        .ok_or_else(|| "resourceIndex 格式错误".to_string())?;

    let categories = resource_index
        .entry("customCharacterCategories")
        .or_insert_with(|| json!([]));

    let categories = categories
        .as_array_mut()
        .ok_or_else(|| "customCharacterCategories 格式错误".to_string())?;
    ensure_default_role_categories(categories);
    Ok(categories)
}

/// 标准化文本（去 \uFFFD、trim）
pub(super) fn sanitize_text(value: &Value) -> String {
    value
        .as_str()
        .unwrap_or("")
        .replace('\u{FFFD}', "")
        .trim()
        .to_string()
}

/// 把"逗号 / 分号 / 中英文标点 / 换行"分隔的字符串转成 Vec<String>
pub(super) fn to_string_array(value: &Value) -> Vec<String> {
    if let Some(arr) = value.as_array() {
        return arr.iter().map(sanitize_text).filter(|s| !s.is_empty()).collect();
    }
    let s = sanitize_text(value);
    if s.is_empty() {
        return Vec::new();
    }
    s.split(|c: char| matches!(c, ',' | ';' | '，' | '；' | '\n'))
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// 角色类型归一化
pub(super) fn normalize_role_type(input: &Value) -> &'static str {
    let t = sanitize_text(input).to_lowercase();
    if t.contains("npc") {
        "NPC"
    } else if t.contains("主角") || t.contains("男主") {
        "主角"
    } else if t.contains("女主") {
        "女主"
    } else if t.contains("反派") {
        "反派"
    } else if t.contains("龙套") || t.contains("路人") {
        "龙套"
    } else if t.contains("待确认") || t.contains("待分类") {
        "待分类"
    } else if t.contains("势力") || t.contains("组织") || t.contains("阵营") || t.contains("公会") {
        "势力"
    } else {
        "配角"
    }
}

/// 默认分类映射：根据角色类型决定落入哪个内置分类
/// 与 `src/utils/roleArchiveBridge.ts` 的 `getRoleCategoryIdByType` 行为对齐
pub(super) fn default_category_id_for_role_type(role_type: &str) -> &'static str {
    match role_type {
        "主角" => "cat_main",
        "女主" => "cat_female",
        "反派" => "cat_villain",
        "NPC" => "cat_npc",
        "龙套" => "cat_extra",
        "势力" => "cat_faction",
        _ => "cat_support",
    }
}

/// 在 categories 中通过 role_id 找到位置 (category index, child index)
pub(super) fn find_role_location(categories: &[Value], role_id: &str) -> Option<(usize, usize)> {
    for (ci, cat) in categories.iter().enumerate() {
        if let Some(children) = cat.get("children").and_then(|v| v.as_array()) {
            for (ri, child) in children.iter().enumerate() {
                if child.get("id").and_then(|v| v.as_str()) == Some(role_id) {
                    return Some((ci, ri));
                }
            }
        }
    }
    None
}


/// 直接 patch book.resourceIndex 的元字段（不触及 customCharacterCategories）
/// 用于 RolesPanel 更新 novelType / characterScan / roleExtractState
#[tauri::command]
pub async fn update_book_resource_meta(
    app: tauri::AppHandle,
    book_id: String,
    patch: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut book = read_book(&app, &book_id)?;
    {
        let resource_index = book
            .as_object_mut()
            .ok_or_else(|| "book 根不是对象".to_string())?
            .entry("resourceIndex")
            .or_insert_with(|| serde_json::json!({}));

        let resource_index = resource_index
            .as_object_mut()
            .ok_or_else(|| "resourceIndex 格式错误".to_string())?;

        if let Some(patch_obj) = patch.as_object() {
            for (k, v) in patch_obj {
                resource_index.insert(k.clone(), v.clone());
            }
        }
    }
    write_book(&app, &book_id, &book)?;
    Ok(serde_json::json!({ "success": true }))
}
