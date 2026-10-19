// 书架 zip 打包 / 解包（与 WebDAV 全量同步格式一致）
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const SYNC_EXTS: &[&str] = &[".json", ".html"];

pub fn workspace_books_dir(app: &AppHandle) -> PathBuf {
    crate::workspace::get_workspace_path(app).join("books")
}

/// NovelLab 拆书目录（与 WebDAV 同步一致：config.workspace.novelLabSavePath）
pub async fn novel_lab_save_dir(app: &AppHandle) -> Option<PathBuf> {
    let cfg_response = crate::commands::config::config_load(app.clone()).await.ok()?;
    let save_path = cfg_response
        .get("config")?
        .get("workspace")?
        .get("novelLabSavePath")?
        .as_str()?
        .trim()
        .to_string();
    if save_path.is_empty() {
        return None;
    }
    let p = PathBuf::from(save_path);
    if p.exists() && p.is_dir() {
        Some(p)
    } else {
        None
    }
}

fn collect_local_files(base: &Path, sub: &str) -> Vec<String> {
    let full = if sub.is_empty() {
        base.to_path_buf()
    } else {
        base.join(sub)
    };
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&full) {
        Ok(it) => it,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string()
            .nfc()
            .collect::<String>();
        let rel = if sub.is_empty() {
            name.clone()
        } else {
            format!("{sub}/{name}")
        };
        let path = entry.path();
        if path.is_dir() {
            if name == "backups" {
                continue;
            }
            out.extend(collect_local_files(base, &rel));
        } else if path.is_file() {
            let lower = name.to_ascii_lowercase();
            if !SYNC_EXTS.iter().any(|e| lower.ends_with(e)) {
                continue;
            }
            out.push(rel);
        }
    }
    out
}

/// 打包用：
/// 1) 仅当 book.json 里 content 为空时，从 chapters/*.html 回填（避免整本正文塞进 json 导致卡死）
/// 2) 若 json 有 content 但缺 .html，补一份 html 进 zip
fn enrich_book_json(
    local_base: &Path,
    book_json_rel: &str,
    raw: Vec<u8>,
) -> (Vec<u8>, Vec<(String, Vec<u8>)>) {
    let empty_extra = Vec::new();
    let book_dir = match Path::new(book_json_rel).parent() {
        Some(p) => local_base.join(p),
        None => return (raw, empty_extra),
    };
    let chapters_dir = book_dir.join("chapters");
    let book_dir_rel = Path::new(book_json_rel)
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let text = match String::from_utf8(raw.clone()) {
        Ok(t) => t,
        Err(_) => return (raw, empty_extra),
    };
    let mut book: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return (raw, empty_extra),
    };
    let mut changed = false;
    let mut extra_html: Vec<(String, Vec<u8>)> = Vec::new();
    if let Some(chapters) = book.get_mut("chapters").and_then(|v| v.as_array_mut()) {
        for ch in chapters.iter_mut() {
            let chapter_id = match ch.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };
            let html_path = chapters_dir.join(format!("{}.html", chapter_id));
            let json_empty = ch
                .get("content")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().is_empty())
                .unwrap_or(true);

            // 只回填空 content，绝不把全书 html 再写进 book.json（会卡顿/爆内存）
            if json_empty {
                if let Ok(html) = std::fs::read_to_string(&html_path) {
                    if !html.trim().is_empty() {
                        if let Some(obj) = ch.as_object_mut() {
                            obj.insert("content".to_string(), Value::String(html));
                            changed = true;
                        }
                    }
                }
            } else if !html_path.exists()
                || std::fs::metadata(&html_path).map(|m| m.len() == 0).unwrap_or(true)
            {
                // json 有正文、磁盘无有效 html → 补进 zip
                let content = ch
                    .get("content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if content.trim().is_empty() {
                    continue;
                }
                let _ = std::fs::create_dir_all(&chapters_dir);
                let _ = std::fs::write(&html_path, &content);
                let zip_rel = if book_dir_rel.is_empty() {
                    format!("chapters/{}.html", chapter_id)
                } else {
                    format!("{}/chapters/{}.html", book_dir_rel, chapter_id)
                };
                extra_html.push((zip_rel, content.into_bytes()));
            }
        }
    }
    let out = if changed {
        match serde_json::to_string_pretty(&book) {
            Ok(s) => s.into_bytes(),
            Err(_) => raw,
        }
    } else {
        raw
    };
    (out, extra_html)
}

/// 打包本地书架目录为 zip 字节（与 WebDAV books.zip 内容一致）
pub fn pack_books_zip(local_base: &Path) -> Result<(Vec<u8>, u32), String> {
    if !local_base.exists() {
        return Err("本地书架目录不存在".into());
    }
    let local_files = collect_local_files(local_base, "");
    if local_files.is_empty() {
        return Err("本地没有可同步的书籍文件".into());
    }
    let mut buf = Vec::new();
    let mut file_count = 0u32;
    {
        let cursor = Cursor::new(&mut buf);
        let mut zip = ZipWriter::new(cursor);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut packed_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut pending_extra: Vec<(String, Vec<u8>)> = Vec::new();

        for file in &local_files {
            let mut content = match std::fs::read(local_base.join(file)) {
                Ok(b) => b,
                Err(e) => {
                    crate::logger::error(format!("[cloud_pack] read {}: {}", file, e));
                    continue;
                }
            };
            if file.ends_with("book.json") {
                let (enriched, extra) = enrich_book_json(local_base, file, content);
                content = enriched;
                pending_extra.extend(extra);
            }
            let zip_path = file.replace('\\', "/");
            if zip.start_file(&zip_path, options).is_ok() {
                let _ = zip.write_all(&content);
                packed_paths.insert(zip_path);
                file_count += 1;
            }
        }
        // 补写缺失的 chapters/*.html（来自 book.json content）
        for (zip_path, bytes) in pending_extra {
            if packed_paths.contains(&zip_path) {
                continue;
            }
            if zip.start_file(&zip_path, options).is_ok() {
                let _ = zip.write_all(&bytes);
                packed_paths.insert(zip_path);
                file_count += 1;
            }
        }
        zip.finish().map_err(|e| format!("压缩失败: {}", e))?;
    }
    Ok((buf, file_count))
}

/// 原子写入：先写临时文件再 rename，避免 book.json 写一半被 loadBooks 读到坏数据
fn atomic_write(path: &Path, buf: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| format!("无效路径: {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = parent.join(format!(
        ".{}.tmp.{}",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("xly"),
        std::process::id()
    ));
    std::fs::write(&tmp, buf).map_err(|e| format!("写临时文件失败: {}", e))?;
    // Windows 上目标存在时 rename 可能失败，先删再移
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("替换文件失败 {}: {}", path.display(), e)
    })?;
    Ok(())
}

/// 将 zip 解压到本地书架目录（覆盖同名文件；book.json 原子写）
pub fn unpack_books_zip(zip_bytes: &[u8], local_base: &Path) -> Result<u32, String> {
    if zip_bytes.len() < 4 || &zip_bytes[0..2] != b"PK" {
        return Err(format!(
            "不是有效的 zip 备份（{} bytes）",
            zip_bytes.len()
        ));
    }
    let cursor = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| format!("解压失败: {}", e))?;
    if archive.len() == 0 {
        return Err("云端 zip 为空，无法覆盖本地".into());
    }
    crate::logger::warn(format!(
        "[cloud_unpack] zip entries={} bytes={} → {}",
        archive.len(),
        zip_bytes.len(),
        local_base.display()
    ));
    let mut downloaded = 0u32;
    let mut errors = 0u32;
    let mut book_json_n = 0u32;
    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let name = file.name().to_string();
        if name.ends_with('/') {
            continue;
        }
        let safe_path = match file.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => {
                crate::logger::warn(format!("[cloud_unpack] skip unsafe path: {}", name));
                continue;
            }
        };
        let mut buf = Vec::new();
        if file.read_to_end(&mut buf).is_err() {
            errors += 1;
            continue;
        }
        let local_path = local_base.join(&safe_path);
        let is_book_json = name.replace('\\', "/").ends_with("book.json");
        let write_res = if is_book_json {
            atomic_write(&local_path, &buf)
        } else {
            if let Some(parent) = local_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::write(&local_path, &buf).map_err(|e| e.to_string())
        };
        match write_res {
            Ok(()) => {
                downloaded += 1;
                if is_book_json {
                    book_json_n += 1;
                    crate::logger::warn(format!(
                        "[cloud_unpack] wrote book.json {} ({} bytes)",
                        local_path.display(),
                        buf.len()
                    ));
                }
            }
            Err(e) => {
                errors += 1;
                crate::logger::error(format!(
                    "[cloud_unpack] write failed: {} err={}",
                    local_path.display(),
                    e
                ));
            }
        }
    }
    // 解压后：把 book.json 里非空 content 物化到 chapters/{id}.html
    // 解决「目录有字数、正文空白」——zip 里只有元数据/内嵌 content 却缺 .html
    let materialize_n = materialize_html_from_book_jsons(local_base);
    crate::logger::warn(format!(
        "[cloud_unpack] done wrote={} book_json={} materialize_html={} errors={}",
        downloaded, book_json_n, materialize_n, errors
    ));
    if downloaded == 0 {
        return Err(format!(
            "解压未写入任何文件（errors={}）。zip 可能损坏或路径非法。",
            errors
        ));
    }
    Ok(downloaded)
}

/// 扫描 books/*/book.json，把非空 chapter.content 写入缺失/空的 chapters/{id}.html
fn materialize_html_from_book_jsons(local_base: &Path) -> u32 {
    let mut n = 0u32;
    let Ok(entries) = std::fs::read_dir(local_base) else {
        return 0;
    };
    for entry in entries.flatten() {
        let book_dir = entry.path();
        if !book_dir.is_dir() {
            continue;
        }
        let book_json = book_dir.join("book.json");
        if !book_json.exists() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&book_json) else {
            continue;
        };
        let Ok(book) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let Some(chapters) = book.get("chapters").and_then(|v| v.as_array()) else {
            continue;
        };
        let chapters_dir = book_dir.join("chapters");
        for ch in chapters {
            let Some(id) = ch.get("id").and_then(|v| v.as_str()) else {
                continue;
            };
            let content = ch
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if content.trim().is_empty() {
                continue;
            }
            let html_path = chapters_dir.join(format!("{}.html", id));
            let need_write = match std::fs::metadata(&html_path) {
                Ok(m) => m.len() == 0,
                Err(_) => true,
            };
            if !need_write {
                // 已有非空 html：仍可用 json 兜底覆盖空/极短异常文件
                continue;
            }
            if std::fs::create_dir_all(&chapters_dir).is_err() {
                continue;
            }
            if atomic_write(&html_path, content.as_bytes()).is_ok() {
                n += 1;
                crate::logger::warn(format!(
                    "[cloud_unpack] materialize {}.html from book.json ({} bytes)",
                    id,
                    content.len()
                ));
            }
        }
    }
    n
}

pub async fn load_style_profiles_json(app: &AppHandle) -> Option<Vec<u8>> {
    let cfg_response = crate::commands::config::config_load(app.clone()).await.ok()?;
    let style_profiles = cfg_response
        .get("config")?
        .get("ai")?
        .get("styleProfiles")?
        .clone();
    let mut profiles = style_profiles;
    if let Some(arr) = profiles.as_array_mut() {
        for item in arr {
            if let Some(obj) = item.as_object_mut() {
                obj.remove("boundBookIds");
            }
        }
    }
    serde_json::to_vec(&profiles).ok()
}
