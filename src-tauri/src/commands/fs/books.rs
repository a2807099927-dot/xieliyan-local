// 书籍 CRUD 与章节正文 IO
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::AppHandle;

use crate::workspace::books_dir;

/// 同一本书的 book.json 写盘互斥，防止并发 save/patch 共用 tmp 或交叉 rename 写坏文件
static BOOK_JSON_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();

fn book_json_lock(book_id: &str) -> Arc<Mutex<()>> {
    let map = BOOK_JSON_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = map.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .entry(book_id.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

/// 从「合法 JSON + 尾部垃圾」中恢复第一个完整对象（load 容错用）
fn recover_trailing_json(raw: &str) -> Result<Value, String> {
    let bytes = raw.as_bytes();
    let mut depth: i32 = 0;
    let mut in_str = false;
    let mut esc = false;
    let mut end = None;
    for (i, &c) in bytes.iter().enumerate() {
        if in_str {
            if esc {
                esc = false;
                continue;
            }
            if c == b'\\' {
                esc = true;
                continue;
            }
            if c == b'"' {
                in_str = false;
            }
            continue;
        }
        match c {
            b'"' => in_str = true,
            b'{' | b'[' => depth += 1,
            b'}' | b']' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    let end = end.ok_or_else(|| "recover: no complete JSON".to_string())?;
    let slice = raw.get(..end).ok_or_else(|| "recover: slice".to_string())?;
    serde_json::from_str(slice.trim()).map_err(|e| format!("recover parse: {}", e))
}

/// 原子写入 book.json：唯一 tmp 名 + 同书互斥，避免 Windows 并发 rename 拼坏/找不到文件
fn atomic_write_book_json(book_id: &str, target: &std::path::Path, content: &str) -> Result<(), String> {
    let lock = book_json_lock(book_id);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());

    let parent = target.parent().ok_or_else(|| "book.json 路径无效".to_string())?;
    let tmp = parent.join(format!(
        "book.json.tmp.{}",
        uuid::Uuid::new_v4()
    ));
    fs::write(&tmp, content).map_err(|e| format!("write tmp failed: {}", e))?;

    // Windows 上 rename 不能覆盖已存在目标；先替换式删除目标再 rename
    if target.exists() {
        // 先备份一小份最近好文件（覆盖式 .bak，失败不阻断）
        let bak = target.with_extension("json.bak");
        let _ = fs::copy(target, &bak);
        fs::remove_file(target).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("remove old book.json failed: {}", e)
        })?;
    }

    match fs::rename(&tmp, target) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(format!("rename failed: {}", e))
        }
    }
}

/// 加载书籍列表
///
/// 修复点：`book.json` 里 `chapter.content` 字段会和 `chapters/{id}.html` 实际正文脱节
/// （`patch_chapter` 自动保存只写 .html，不更新 book.json 里的 chapter.content）。
/// 之前 `loadBooks` 只读 book.json，导致云同步下载后，磁盘上 .html 是新的、内存里 content 字段
/// 还是上传时序列化的旧值，章节看上去"没下载到"。
/// 现在加载时主动从 `chapters/{id}.html` 把最新正文回填到 chapter.content，
/// 让磁盘 .html 成为唯一真相来源。
#[tauri::command]
pub async fn load_books(app: AppHandle) -> Result<Vec<Value>, String> {
    let dir = books_dir(&app);
    crate::logger::warn(format!("[load_books] scanning dir: {}", dir.display()));
    if !dir.exists() {
        crate::logger::error(format!("[load_books] books dir not exists: {}", dir.display()));
        return Ok(vec![]);
    }
    let mut books: Vec<Value> = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut skipped = 0u32;
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let book_dir = entry.path();
        let book_json = book_dir.join("book.json");
        if !book_json.exists() {
            skipped += 1;
            continue;
        }
        let raw = match fs::read_to_string(&book_json) {
            Ok(s) => s,
            Err(e) => {
                crate::logger::error(format!(
                    "[load_books] read failed: {} err={}",
                    book_json.display(),
                    e
                ));
                continue;
            }
        };
        match serde_json::from_str::<Value>(&raw).or_else(|e| {
            // 并发写损坏时常见 trailing characters：尝试只取第一个完整 JSON 对象
            recover_trailing_json(&raw).map_err(|_| e)
        }) {
            Ok(mut book) => {
                // 工坊会话 sidecar（autoWorkshop.json）合并进 settings，避免设定只存在独立小文件时丢状态
                merge_auto_workshop_sidecar(&book_dir, &mut book);
                hydrate_chapter_contents(&book_dir, &mut book);
                strip_chapter_contents(&mut book);
                books.push(book);
            }
            Err(e) => {
                crate::logger::error(format!(
                    "[load_books] parse failed: {} err={}",
                    book_json.display(),
                    e
                ));
            }
        }
    }
    crate::logger::warn(format!(
        "[load_books] loaded {} books, skipped {} dirs without book.json",
        books.len(),
        skipped
    ));
    Ok(books)
}

/// 把每个章节的 `chapters/{id}.html` 实际内容回填到 chapter.content
/// （磁盘是真相来源，book.json 里的 content 字段会因为 patch_chapter 部分保存而过时）
///
/// 兼容旧版（Electron）格式迁移：
/// 旧版将正文存储在 `book.json` 的 `chapter.content` 字段，不存在 `chapters/` 子目录。
/// 新版（Tauri）改为独立的 `chapters/{id}.html` 文件。
/// 首次以新版打开旧数据时，若 `.html` 文件不存在但 `book.json` 里有非空 content，
/// 则自动写入 `.html`，完成一次性格式迁移，避免后续 autosave 覆盖旧正文。
/// P1: 清空内存中的章节正文，只保留元数据；正文以磁盘 chapters/{id}.html 为准，前端按需 load_chapter_content 懒加载。
fn strip_chapter_contents(book: &mut Value) {
    if let Some(chapters) = book.get_mut("chapters").and_then(|c| c.as_array_mut()) {
        for ch in chapters.iter_mut() {
            if let Some(obj) = ch.as_object_mut() {
                obj.insert("content".to_string(), Value::String(String::new()));
            }
        }
    }
}

fn hydrate_chapter_contents(book_dir: &std::path::Path, book: &mut Value) {
    let chapters_dir = book_dir.join("chapters");
    let Some(chapters) = book
        .get_mut("chapters")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for ch in chapters.iter_mut() {
        let Some(chapter_id) = ch
            .get("id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        let html_path = chapters_dir.join(format!("{}.html", chapter_id));
        if !html_path.exists() {
            // ── 旧版兼容迁移 ──────────────────────────────────────────────────
            // .html 文件不存在，检查 book.json 里是否存有旧版正文（Electron 格式）
            let old_content = ch
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !old_content.trim().is_empty() {
                // 将旧版正文迁移写入 chapters/{id}.html
                if let Err(e) = fs::create_dir_all(&chapters_dir) {
                    crate::logger::error(format!(
                        "[hydrate] create chapters dir failed for {}: {}",
                        chapter_id, e
                    ));
                } else if let Err(e) = fs::write(&html_path, &old_content) {
                    crate::logger::error(format!(
                        "[hydrate] migrate content to .html failed for {}: {}",
                        chapter_id, e
                    ));
                } else {
                    crate::logger::warn(format!(
                        "[hydrate] migrated old content to chapters/{}.html ({} bytes)",
                        chapter_id,
                        old_content.len()
                    ));
                }
                // content 字段已是正确值，无需再次赋值
            }
            // 无论迁移成功与否，跳过后续的 read_to_string 回填
            continue;
        }
        // ── .html 文件存在 ────────────────────────────────────────────────
        // P1 优化：章节正文最终会被 strip_chapter_contents 清空（内存只保留元数据），
        // 因此对"非空 .html"不再整篇读入内存——省去启动时对全书章节文件的一次性读取。
        // 仅当 .html 为 0 字节（疑似被异常清空）时，才用 book.json 里的兜底内容修复磁盘文件。
        let html_len = fs::metadata(&html_path).map(|m| m.len()).unwrap_or(0);
        if html_len == 0 {
            let fallback = ch
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if !fallback.trim().is_empty() {
                crate::logger::warn(format!(
                    "[hydrate] chapters/{}.html is empty, restoring from book.json fallback ({} bytes)",
                    chapter_id,
                    fallback.len()
                ));
                // 用 book.json 里的兜底内容把 .html 修复回来，避免正文永久丢失
                let _ = fs::write(&html_path, &fallback);
            }
        }
        // 非空 .html：内存正文随后会被 strip 清空，这里无需读取或赋值。
    }
}


/// 落盘 book.json 前，把每个"内存中为空"的章节正文从 chapters/{id}.html 回填。
///
/// P1 懒加载模型下，内存里的 chapter.content 已被 strip 清空。如果直接把这样的 book
/// 写回 book.json，会把 book.json 里的正文备份一并清空，导致"空 .html 从 book.json 回填"
/// 的兜底彻底失效。这里在写盘前从磁盘 .html 回填，使 book.json 始终是一份完整备份。
/// 只在"内存为空且磁盘有正文"时回填，绝不会用空内容覆盖任何已有正文。
fn backfill_chapter_contents_from_disk(book_dir: &std::path::Path, book: &mut Value) {
    let chapters_dir = book_dir.join("chapters");
    let Some(chapters) = book.get_mut("chapters").and_then(|v| v.as_array_mut()) else {
        return;
    };
    for ch in chapters.iter_mut() {
        let is_empty = ch
            .get("content")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().is_empty())
            .unwrap_or(true);
        if !is_empty {
            continue;
        }
        let Some(chapter_id) = ch.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()) else {
            continue;
        };
        let html_path = chapters_dir.join(format!("{}.html", chapter_id));
        if let Ok(html) = fs::read_to_string(&html_path) {
            if !html.is_empty() {
                if let Some(obj) = ch.as_object_mut() {
                    obj.insert("content".to_string(), Value::String(html));
                }
            }
        }
    }
}

/// 轻量写入书籍设定补丁。
/// - 若含 `autoWorkshop`：只写 `books/{id}/autoWorkshop.json`（通常几 KB），绝不重写 book.json
/// - 其它 settings 键：合并进 book.json 的 settings（仍读改写 book.json，但无章节回填）
/// 用于工坊设定打字等高频小改动。
#[tauri::command]
pub async fn patch_book_settings(
    app: AppHandle,
    book_id: String,
    settings_patch: Value,
) -> Result<bool, String> {
    if book_id.trim().is_empty() {
        return Err("book_id 为空".to_string());
    }
    let dir = books_dir(&app).join(&book_id);
    if !dir.exists() {
        return Err(format!("书籍目录不存在: {}", book_id));
    }

    let patch_obj = settings_patch
        .as_object()
        .ok_or_else(|| "settings_patch 必须是 object".to_string())?;

    // ★ 工坊会话：独立小文件，避免 30MB book.json 读写
    if let Some(aw) = patch_obj.get("autoWorkshop") {
        let aw_path = dir.join("autoWorkshop.json");
        let content =
            serde_json::to_string_pretty(aw).map_err(|e| format!("serialize autoWorkshop: {}", e))?;
        let tmp = dir.join("autoWorkshop.json.tmp");
        fs::write(&tmp, &content).map_err(|e| format!("write autoWorkshop tmp: {}", e))?;
        fs::rename(&tmp, &aw_path).map_err(|e| format!("rename autoWorkshop: {}", e))?;
        crate::logger::warn(format!(
            "[patch_book_settings bookId={} autoWorkshop.json bytes={}] ok",
            book_id,
            content.len()
        ));
        // 若 patch 只有 autoWorkshop，到此结束
        if patch_obj.len() == 1 {
            return Ok(true);
        }
    }

    // 其它 settings 键：合并进 book.json（无 backfill）
    let other: serde_json::Map<String, Value> = patch_obj
        .iter()
        .filter(|(k, _)| k.as_str() != "autoWorkshop")
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if other.is_empty() {
        return Ok(true);
    }

    let path = dir.join("book.json");
    if !path.exists() {
        return Err(format!("book.json 不存在: {}", book_id));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read book.json: {}", e))?;
    let mut book: Value = serde_json::from_str(&raw).map_err(|e| format!("parse book.json: {}", e))?;
    let root = book
        .as_object_mut()
        .ok_or_else(|| "book.json 根不是 object".to_string())?;
    let settings_entry = root
        .entry("settings")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(dst) = settings_entry.as_object_mut() {
        for (k, v) in other {
            dst.insert(k, v);
        }
    }
    root.insert(
        "updatedAt".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    );
    let content = serde_json::to_string_pretty(&book).map_err(|e| format!("serialize: {}", e))?;
    atomic_write_book_json(&book_id, &path, &content)?;
    crate::logger::warn(format!(
        "[patch_book_settings bookId={} book.json settings merge bytes={}] ok",
        book_id,
        content.len()
    ));
    Ok(true)
}

/// 轻量改 book.json 顶层字段（inspirationNotes / outlineVision / settings / title 等）。
/// **不做**章节正文回填，避免老书每次打字重读数百个 .html。
/// 禁止用本接口改 `chapters` 数组结构（增删章仍走 save_book）。
#[tauri::command]
pub async fn patch_book_meta(
    app: AppHandle,
    book_id: String,
    patch: Value,
) -> Result<bool, String> {
    if book_id.trim().is_empty() {
        return Err("book_id 为空".to_string());
    }
    let path = books_dir(&app).join(&book_id).join("book.json");
    if !path.exists() {
        return Err(format!("book.json 不存在: {}", book_id));
    }
    let patch_obj = patch
        .as_object()
        .ok_or_else(|| "patch 必须是 object".to_string())?;

    // 明确拒绝用本路径改 chapters，防止误写成空目录
    if patch_obj.contains_key("chapters") {
        return Err("patch_book_meta 禁止改 chapters，请用 save_book / patch_chapter".to_string());
    }

    let raw = fs::read_to_string(&path).map_err(|e| format!("read book.json: {}", e))?;
    let mut book: Value = serde_json::from_str(&raw).map_err(|e| format!("parse book.json: {}", e))?;
    let root = book
        .as_object_mut()
        .ok_or_else(|| "book.json 根不是 object".to_string())?;

    for (k, v) in patch_obj {
        if k == "id" {
            continue; // 永不改 id
        }
        if k == "settings" {
            // settings 浅合并，避免整块覆盖丢掉其它键
            let entry = root
                .entry("settings")
                .or_insert_with(|| serde_json::json!({}));
            if let (Some(dst), Some(src)) = (entry.as_object_mut(), v.as_object()) {
                for (sk, sv) in src {
                    dst.insert(sk.clone(), sv.clone());
                }
            } else {
                root.insert(k.clone(), v.clone());
            }
        } else {
            root.insert(k.clone(), v.clone());
        }
    }
    root.insert(
        "updatedAt".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    );

    let content = serde_json::to_string_pretty(&book).map_err(|e| format!("serialize: {}", e))?;
    atomic_write_book_json(&book_id, &path, &content)?;
    crate::logger::warn(format!(
        "[patch_book_meta bookId={} bytes={} keys={:?}] ok",
        book_id,
        content.len(),
        patch_obj.keys().collect::<Vec<_>>()
    ));
    Ok(true)
}

/// 加载书籍时把 autoWorkshop.json 合并进 settings.autoWorkshop（若存在）
pub fn merge_auto_workshop_sidecar(book_dir: &std::path::Path, book: &mut Value) {
    let aw_path = book_dir.join("autoWorkshop.json");
    if !aw_path.exists() {
        return;
    }
    let Ok(raw) = fs::read_to_string(&aw_path) else {
        return;
    };
    let Ok(aw) = serde_json::from_str::<Value>(&raw) else {
        return;
    };
    let Some(root) = book.as_object_mut() else {
        return;
    };
    let settings = root
        .entry("settings")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(s) = settings.as_object_mut() {
        s.insert("autoWorkshop".to_string(), aw);
    }
}

/// 保存书籍 book.json（内存正文为空时，从磁盘 .html 回填，保证 book.json 是完整备份）
#[tauri::command]
pub async fn save_book(app: AppHandle, mut book: Value) -> Result<bool, String> {
    let book_id = book
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            let err = "缺少 book.id".to_string();
            crate::logger::error(format!("[save_book] {}", err));
            err
        })?
        .to_string();

    let dir = books_dir(&app).join(&book_id);
    fs::create_dir_all(&dir).map_err(|e| {
        let msg = format!("create_dir_all failed: {}", e);
        crate::logger::error(format!("[save_book bookId={}] {}", book_id, msg));
        msg
    })?;

    // P1 数据安全：内存中的正文可能已被剥离为空，落盘前从磁盘 .html 回填，避免清空 book.json 备份。
    backfill_chapter_contents_from_disk(&dir, &mut book);

    let content = serde_json::to_string_pretty(&book).map_err(|e| {
        let msg = format!("serialize failed: {}", e);
        crate::logger::error(format!("[save_book bookId={}] {}", book_id, msg));
        msg
    })?;
    let target = dir.join("book.json");

    // 同书互斥 + 唯一 tmp，避免并发 save 交叉 rename 写坏 book.json（trailing characters / 书架空白）
    atomic_write_book_json(&book_id, &target, &content).map_err(|e| {
        crate::logger::error(format!("[save_book bookId={}] {}", book_id, e));
        e
    })?;

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
        "[save_book bookId={} bytes={} cats={} roles={}] ok",
        book_id, content.len(), cat_len, role_len
    ));
    Ok(true)
}

/// 删除整本（含 chapters / history / memory 等子目录）
#[tauri::command]
pub async fn delete_book(app: AppHandle, book_id: String) -> Result<bool, String> {
    let book_id = safe_component(&book_id, "book_id")?;
    let dir = books_dir(&app).join(&book_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

/// 校验路径组件：拒绝空、`.`、`..`、含路径分隔符的值（防路径穿越/目录越界）
fn safe_component(raw: &str, name: &str) -> Result<String, String> {
    let v = raw.trim();
    if v.is_empty() {
        return Err(format!("{} 为空", name));
    }
    if v == "." || v == ".." || v.contains('/') || v.contains('\\') || v.contains('\0') {
        return Err(format!("{} 含非法路径字符", name));
    }
    Ok(v.to_string())
}

/// 加载章节正文 HTML
/// 优先 chapters/{id}.html；若缺失或空，回退 book.json 的 chapter.content 并尽量写回 .html
#[tauri::command]
pub async fn load_chapter_content(
    app: AppHandle,
    book_id: String,
    chapter_id: String,
) -> Result<String, String> {
    let book_id = safe_component(&book_id, "book_id")?;
    let chapter_id = safe_component(&chapter_id, "chapter_id")?;
    let book_dir = books_dir(&app).join(&book_id);
    let path = book_dir
        .join("chapters")
        .join(format!("{}.html", chapter_id));
    if path.exists() {
        let html = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if !html.trim().is_empty() {
            return Ok(html);
        }
    }
    // 回退：book.json 内嵌正文（云同步 / 旧格式常见）
    let book_json = book_dir.join("book.json");
    if book_json.exists() {
        if let Ok(raw) = fs::read_to_string(&book_json) {
            if let Ok(book) = serde_json::from_str::<Value>(&raw) {
                if let Some(chapters) = book.get("chapters").and_then(|v| v.as_array()) {
                    for ch in chapters {
                        if ch.get("id").and_then(|v| v.as_str()) == Some(chapter_id.as_str()) {
                            let content = ch
                                .get("content")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if !content.trim().is_empty() {
                                let chapters_dir = book_dir.join("chapters");
                                let _ = fs::create_dir_all(&chapters_dir);
                                let _ = fs::write(&path, &content);
                                crate::logger::warn(format!(
                                    "[load_chapter_content] restored {}.html from book.json ({} bytes)",
                                    chapter_id,
                                    content.len()
                                ));
                                return Ok(content);
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    Ok(String::new())
}

/// 保存章节正文
#[tauri::command]
pub async fn save_chapter_content(
    app: AppHandle,
    book_id: String,
    chapter_id: String,
    content: String,
) -> Result<bool, String> {
    let book_id = safe_component(&book_id, "book_id")?;
    let chapter_id = safe_component(&chapter_id, "chapter_id")?;
    let dir = books_dir(&app).join(&book_id).join("chapters");
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let target = dir.join(format!("{}.html", chapter_id));
    let tmp = dir.join(format!("{}.html.tmp", chapter_id));
    // 原子写入：先写 tmp 再 rename
    tokio::fs::write(&tmp, &content).await.map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, &target).await.map_err(|e| e.to_string())?;
    Ok(true)
}

/// 部分更新章节（content/title/outline/word_count 任选）
///
/// - `content` → 写入 `chapters/{id}.html`（章节正文文件）
/// - `title` / `outline` / `word_count` → 直接 patch 到 `book.json` 对应章节，避免前端漏调 `save_book` 导致字段丢失
#[tauri::command]
pub async fn patch_chapter(
    app: AppHandle,
    book_id: String,
    chapter_id: String,
    content: Option<String>,
    title: Option<String>,
    outline: Option<String>,
    word_count: Option<u64>,
    updated_at: String,
) -> Result<Value, String> {
    if let Some(c) = content {
        save_chapter_content(app.clone(), book_id.clone(), chapter_id.clone(), c).await?;
    }

    // 如果传了 title / outline / word_count，就直接改 book.json 中对应的 chapter
    // （之前依赖前端再调 save_book，但 setChapterContent 路径并不会调，导致章节标题/字数修改不持久化 — 严重 BUG）
    if title.is_some() || outline.is_some() || word_count.is_some() {
        let book_path = books_dir(&app).join(&book_id).join("book.json");
        if book_path.exists() {
            let raw = tokio::fs::read_to_string(&book_path).await.map_err(|e| {
                let msg = format!("read book.json failed: {}", e);
                crate::logger::error(format!("[patch_chapter bookId={}] {}", book_id, msg));
                msg
            })?;
            let mut book_value: Value = serde_json::from_str(&raw).map_err(|e| {
                let msg = format!("parse book.json failed: {}", e);
                crate::logger::error(format!("[patch_chapter bookId={}] {}", book_id, msg));
                msg
            })?;

            let mut changed = false;
            if let Some(chapters) = book_value.get_mut("chapters").and_then(|v| v.as_array_mut()) {
                for ch in chapters.iter_mut() {
                    if ch.get("id").and_then(|v| v.as_str()) == Some(chapter_id.as_str()) {
                        if let Some(t) = title.as_ref() {
                            ch["title"] = Value::String(t.clone());
                            changed = true;
                        }
                        if let Some(o) = outline.as_ref() {
                            ch["outline"] = Value::String(o.clone());
                            changed = true;
                        }
                        if let Some(wc) = word_count {
                            ch["wordCount"] = Value::Number(serde_json::Number::from(wc));
                            changed = true;
                        }
                        if changed {
                            ch["updatedAt"] = Value::String(updated_at.clone());
                        }
                        break;
                    }
                }
            }

            if changed {
                book_value["updatedAt"] = Value::String(updated_at.clone());
                let serialized = serde_json::to_string_pretty(&book_value).map_err(|e| {
                    let msg = format!("serialize book.json failed: {}", e);
                    crate::logger::error(format!("[patch_chapter bookId={}] {}", book_id, msg));
                    msg
                })?;
                atomic_write_book_json(&book_id, &book_path, &serialized).map_err(|e| {
                    crate::logger::error(format!("[patch_chapter bookId={}] {}", book_id, e));
                    e
                })?;
            }
        }
    }

    Ok(json!({ "success": true, "updatedAt": updated_at }))
}
