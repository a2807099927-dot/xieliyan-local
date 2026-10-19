// 资源分类管理 — add / delete / rename
use serde_json::{json, Value};
use tauri::AppHandle;

use super::storage::{ensure_categories, read_book, write_book};

#[tauri::command]
pub async fn add_category(
    app: AppHandle,
    book_id: String,
    name: String,
) -> Result<Value, String> {
    let mut book = read_book(&app, &book_id)?;
    let id = format!("cat-{}", chrono::Utc::now().timestamp_millis());
    let new_category = json!({ "id": id, "name": name, "children": [] });
    {
        let categories = ensure_categories(&mut book)?;
        categories.push(new_category.clone());
    }
    let categories_clone = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    write_book(&app, &book_id, &book)?;
    Ok(json!({ "success": true, "categories": categories_clone, "category": new_category }))
}

#[tauri::command]
pub async fn delete_category(
    app: AppHandle,
    book_id: String,
    id: String,
) -> Result<Value, String> {
    let mut book = read_book(&app, &book_id)?;
    {
        let categories = ensure_categories(&mut book)?;
        categories.retain(|c| c.get("id").and_then(|v| v.as_str()) != Some(id.as_str()));
    }
    let categories_clone = book
        .get("resourceIndex")
        .and_then(|v| v.get("customCharacterCategories"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    write_book(&app, &book_id, &book)?;
    Ok(json!({ "success": true, "categories": categories_clone }))
}

#[tauri::command]
pub async fn rename_category(
    app: AppHandle,
    book_id: String,
    id: String,
    name: String,
) -> Result<Value, String> {
    let mut book = read_book(&app, &book_id)?;
    {
        let categories = ensure_categories(&mut book)?;
        for cat in categories.iter_mut() {
            if cat.get("id").and_then(|v| v.as_str()) == Some(id.as_str()) {
                if let Some(obj) = cat.as_object_mut() {
                    obj.insert("name".to_string(), Value::String(name.clone()));
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
    Ok(json!({ "success": true, "categories": categories_clone }))
}
