// 备份：整工作区 zip + 单本 book.json 复制

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::workspace::{books_dir, get_workspace_path};

#[tauri::command]
pub async fn backup_workspace(
    app: AppHandle,
    output_dir: Option<String>,
) -> Result<Value, String> {
    let workspace = get_workspace_path(&app);
    let target_dir = output_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| workspace.join("backups"));
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let backup_path = target_dir.join(format!("xieliyan-backup-{}.zip", timestamp));

    let file = fs::File::create(&backup_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let books = workspace.join("books");
    let mut count = 0;
    if books.exists() {
        zip_dir_recursive(&books, &books, &mut zip, &opts, &mut count)?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(json!({
        "success": true,
        "path": backup_path.to_string_lossy(),
        "fileCount": count,
    }))
}

fn zip_dir_recursive(
    base: &PathBuf,
    current: &PathBuf,
    zip: &mut zip::ZipWriter<fs::File>,
    opts: &zip::write::SimpleFileOptions,
    count: &mut i32,
) -> Result<(), String> {
    use std::io::Write;
    let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            zip_dir_recursive(base, &path, zip, opts, count)?;
        } else {
            zip.start_file::<&str, ()>(&rel_str, *opts)
                .map_err(|e| e.to_string())?;
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
            *count += 1;
        }
    }
    Ok(())
}

/// 单本备份（拷 book.json 到 backups/）保留最近 5 份
#[tauri::command]
pub async fn backup_book(app: AppHandle, book_id: String) -> Result<Value, String> {
    let dir = books_dir(&app).join(&book_id);
    let book_path = dir.join("book.json");
    if !book_path.exists() {
        return Err("书籍不存在".into());
    }
    let backup_dir = dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let stamp = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
    let target = backup_dir.join(format!(
        "book-{}-{}.json",
        stamp,
        chrono::Local::now().timestamp_millis()
    ));
    fs::copy(&book_path, &target).map_err(|e| e.to_string())?;

    // 保留最近 5 份
    let mut entries: Vec<_> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| e.path().is_file())
        .collect();
    entries.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    for old in entries.into_iter().skip(5) {
        let _ = fs::remove_file(old.path());
    }

    Ok(json!({
        "success": true,
        "backupPath": target.to_string_lossy(),
    }))
}
