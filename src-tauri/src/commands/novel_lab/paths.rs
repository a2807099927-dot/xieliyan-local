// NovelLab 共享路径工具：sanitize + 章节文件命名 + 各子目录路径
use std::path::{Path, PathBuf};

/// Windows 下不允许的文件名字符替换为 _
pub(super) fn sanitize_file_name(name: &str) -> String {
    let normalized: String = name
        .replace(['\r', '\n', '\t'], " ")
        .trim()
        .to_string();
    let safe: String = normalized
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_whitespace() => ' ',
            c => c,
        })
        .collect();
    let collapsed: String = safe.split_whitespace().collect::<Vec<_>>().join(" ");
    // 防目录穿越：纯点号名（. / .. / ...）指向上级目录，替换为 untitled
    if collapsed.is_empty() || collapsed.chars().all(|c| c == '.') {
        "untitled".to_string()
    } else {
        collapsed
    }
}

pub(super) fn book_dir(save_path: &str, book_name: &str) -> PathBuf {
    Path::new(save_path).join(sanitize_file_name(book_name))
}

pub(super) fn analysis_dir(save_path: &str, book_name: &str) -> PathBuf {
    book_dir(save_path, book_name).join("_analysis")
}

pub(super) fn chapter_filename(index: i64, title: &str) -> String {
    format!("{:04}_{}.txt", index.max(0), sanitize_file_name(title))
}

pub(super) fn merged_book_filename(book_name: &str) -> String {
    format!("《{}》.txt", sanitize_file_name(book_name))
}

pub(super) fn merged_analysis_filename(book_name: &str) -> String {
    format!("《{}》_分析.txt", sanitize_file_name(book_name))
}

pub(super) fn unified_book_filename(book_name: &str) -> String {
    format!("{}.json", sanitize_file_name(book_name))
}

/// 主项目里 `\r\n` / `\r` 一律转 `\n`，并去首尾空白
pub(super) fn normalize_text(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n").trim().to_string()
}
