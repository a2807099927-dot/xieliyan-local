// 角色 CRUD — add / delete / update / detail / 批量更新
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::storage::{
    default_category_id_for_role_type, default_category_name_for_role_type, ensure_categories,
    find_role_location, read_book, resolve_book, write_book,
};

#[tauri::command]
pub async fn add_role(
    app: AppHandle,
    book_id: String,
    category_id: String,
    role: Value,
) -> Result<Value, String> {
    let mut book = read_book(&app, &book_id)?;
    {
        let categories = ensure_categories(&mut book)?;
        if category_id.is_empty() {
            // 找到或创建 "default" 分类
            let mut found = false;
            for cat in categories.iter_mut() {
                if cat.get("id").and_then(|v| v.as_str()) == Some("default") {
                    if let Some(children) = cat.get_mut("children").and_then(|v| v.as_array_mut()) {
                        children.push(role.clone());
                    }
                    found = true;
                    break;
                }
            }
            if !found {
                categories.push(json!({ "id": "default", "name": "未分类", "children": [role.clone()] }));
            }
        } else {
            for cat in categories.iter_mut() {
                if cat.get("id").and_then(|v| v.as_str()) == Some(category_id.as_str()) {
                    if let Some(children) = cat.get_mut("children").and_then(|v| v.as_array_mut()) {
                        children.push(role.clone());
                    }
                    break;
                }
            }
        }
    }

    let categories_clone = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    write_book(&app, &book_id, &book)?;
    Ok(json!({ "success": true, "categories": categories_clone, "role": role }))
}

#[tauri::command]
pub async fn delete_role(
    app: AppHandle,
    book_id: String,
    role_id: String,
) -> Result<Value, String> {
    let mut book = read_book(&app, &book_id)?;
    {
        let categories = ensure_categories(&mut book)?;
        for cat in categories.iter_mut() {
            if let Some(children) = cat.get_mut("children").and_then(|v| v.as_array_mut()) {
                children.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(role_id.as_str()));
            }
        }
    }
    let categories_clone = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    write_book(&app, &book_id, &book)?;
    Ok(json!({ "success": true, "categories": categories_clone }))
}

/// 整体替换某个角色对象（前端编辑后回写）
#[tauri::command]
pub async fn update_role(
    app: AppHandle,
    book_id: String,
    role: Value,
) -> Result<Value, String> {
    let role_id = role
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "缺少 role.id".to_string())?
        .to_string();

    let mut book = read_book(&app, &book_id)?;
    let mut updated = false;
    {
        let categories = ensure_categories(&mut book)?;
        if let Some((ci, ri)) = find_role_location(categories, &role_id) {
            if let Some(child) =
                categories[ci].get_mut("children").and_then(|v| v.as_array_mut())
            {
                child[ri] = role.clone();
                updated = true;
            }
        }
    }
    if !updated {
        return Err("未找到对应角色".into());
    }
    let categories_clone = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    write_book(&app, &book_id, &book)?;
    Ok(json!({ "success": true, "categories": categories_clone, "role": role }))
}

/// 局部更新角色（patch 部分字段）
#[tauri::command]
pub async fn update_role_detail(
    app: AppHandle,
    book_id: Option<String>,
    role_id: String,
    patch: Value,
) -> Result<Value, String> {
    let (resolved_id, mut book) = resolve_book(&app, book_id.as_deref())?;
    let mut found_role = Value::Null;
    {
        let categories = ensure_categories(&mut book)?;
        if let Some((ci, ri)) = find_role_location(categories, &role_id) {
            if let Some(children) =
                categories[ci].get_mut("children").and_then(|v| v.as_array_mut())
            {
                let role = &mut children[ri];
                if let (Some(role_obj), Some(patch_obj)) = (role.as_object_mut(), patch.as_object()) {
                    for (k, v) in patch_obj {
                        role_obj.insert(k.clone(), v.clone());
                    }
                }
                found_role = role.clone();
            }
        }
    }
    if found_role.is_null() {
        return Err("未找到对应角色".into());
    }
    write_book(&app, &resolved_id, &book)?;
    Ok(json!({ "success": true, "role": found_role }))
}

/// 取角色详情
#[tauri::command]
pub async fn get_role_detail(
    app: AppHandle,
    book_id: Option<String>,
    role_id: String,
) -> Result<Value, String> {
    let (_id, book) = resolve_book(&app, book_id.as_deref())?;
    if let Some(categories) = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .and_then(|v| v.as_array())
    {
        for cat in categories {
            if let Some(children) = cat.get("children").and_then(|v| v.as_array()) {
                for child in children {
                    if child.get("id").and_then(|v| v.as_str()) == Some(role_id.as_str()) {
                        return Ok(json!({ "success": true, "role": child.clone() }));
                    }
                }
            }
        }
    }
    Err("未找到角色".into())
}

/// 通用：更新单角色字段（兼容 RESOURCES_UPDATE_CHARACTER）
#[tauri::command]
pub async fn update_character(
    app: AppHandle,
    book_id: Option<String>,
    role_id: String,
    patch: Value,
) -> Result<Value, String> {
    update_role_detail(app, book_id, role_id, patch).await
}

/// 工具：把候选 ExtractedRolePayload 落入指定/默认分类
pub(super) fn insert_role_into_default_category(
    categories: &mut Vec<Value>,
    role: Value,
    role_type: &str,
) {
    let target_cat_id = default_category_id_for_role_type(role_type);
    let target_cat_name = default_category_name_for_role_type(role_type);
    let mut placed = false;
    for cat in categories.iter_mut() {
        let is_target = cat.get("id").and_then(|v| v.as_str()) == Some(target_cat_id)
            || cat.get("name").and_then(|v| v.as_str()) == Some(target_cat_name);
        if is_target {
            if let Some(children) = cat.get_mut("children").and_then(|v| v.as_array_mut()) {
                children.push(role.clone());
                placed = true;
            }
            break;
        }
    }
    if !placed {
        let order = categories.len();
        categories.push(json!({
            "id": target_cat_id,
            "name": target_cat_name,
            "isAuto": true,
            "children": [role],
            "order": order,
        }));
    }
}

#[tauri::command]
pub async fn save_avatar(
    app: AppHandle,
    book_id: String,
    role_id: String,
    bytes: Vec<u8>
) -> Result<String, String> {
    let avatars_dir = crate::workspace::books_dir(&app).join(&book_id).join("avatars");
    std::fs::create_dir_all(&avatars_dir).map_err(|e| e.to_string())?;
    let filename = format!("{}.jpg", role_id);
    let filepath = avatars_dir.join(&filename);
    std::fs::write(&filepath, bytes).map_err(|e| e.to_string())?;
    
    // We return the local asset protocol URI so the frontend can display it
    let app_data_dir = app.path().app_data_dir().unwrap_or_default();
    let relative_path = filepath.strip_prefix(&app_data_dir).unwrap_or(&filepath).to_string_lossy().to_string();
    Ok(relative_path.replace("\\", "/"))
}
