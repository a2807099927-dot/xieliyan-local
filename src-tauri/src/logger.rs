// 全局错误日志器（仅记录 ERROR / WARN）
//
// 落盘位置：{userData}/logs/xieliyan-tauri-YYYY-MM-DD.log
// 接口对齐主项目 electron/logger.ts，前端通过 logs_get_info / logs_get_content 调用
//
// 设计原则：
//   - 只写错误日志（用户明确要求"只记录报错"，避免日志膨胀）
//   - 落盘失败静默吞错（不能让 logger 自己拖垮主流程）
//   - 自动清理 7 天前的旧日志

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

const LOG_RETAIN_DAYS: i64 = 7;

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 初始化（从 setup 钩子调用一次，绑定 userData/logs 目录）
pub fn init(app: &AppHandle) {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("logs");
    let _ = fs::create_dir_all(&dir);
    let _ = LOG_DIR.set(dir);
    cleanup_old_logs();
}

fn log_dir() -> PathBuf {
    LOG_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("./logs"))
}

fn date_tag() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn write_line(level: &str, message: &str) {
    let dir = log_dir();
    if let Err(_) = fs::create_dir_all(&dir) {
        return;
    }
    let file_path = dir.join(format!("xieliyan-tauri-{}.log", date_tag()));
    let line = format!(
        "[{}] [{}] {}\n",
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f"),
        level,
        message
    );
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
    {
        let _ = f.write_all(line.as_bytes());
    }
    // 控制台镜像（dev 模式可以直接看到）
    eprintln!("[xly] [{}] {}", level, message);
}

/// 记录 ERROR 级别（用户要求的"功能报错"主入口）
pub fn error(message: impl AsRef<str>) {
    write_line("ERROR", message.as_ref());
}

/// 记录 WARN 级别（提示性问题，比如降级/兜底）
#[allow(dead_code)]
pub fn warn(message: impl AsRef<str>) {
    write_line("WARN", message.as_ref());
}

fn cleanup_old_logs() {
    let dir = log_dir();
    let cutoff = chrono::Local::now() - chrono::Duration::days(LOG_RETAIN_DAYS);
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    let modified_chrono: chrono::DateTime<chrono::Local> = modified.into();
                    if modified_chrono < cutoff {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

/// 列出当前日志目录里所有文件
pub fn list_log_files() -> Vec<String> {
    let dir = log_dir();
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    out.push(name.to_string());
                }
            }
        }
    }
    out.sort_by(|a, b| b.cmp(a)); // 最新的排前面
    out
}

pub fn read_log_content(filename: &str) -> Result<String, String> {
    let dir = log_dir();
    // 路径安全：剥掉所有目录跳跃，只取 basename
    let safe = std::path::Path::new(filename)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无效的文件名".to_string())?;
    let path = dir.join(safe);
    if !path.exists() {
        return Err("日志文件不存在".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

pub fn log_dir_path() -> PathBuf {
    log_dir()
}


/// 工具：把 Result<T, String> 在 Err 时记录日志，再原样返回
/// 用法：`log_err("ai_chat", manager::chat(...).await)`
#[allow(dead_code)]
pub fn log_err<T>(scope: &str, result: Result<T, String>) -> Result<T, String> {
    if let Err(e) = &result {
        error(format!("[{}] {}", scope, e));
    }
    result
}

/// 宏版本，避免每个命令都包一层 `log_err`
#[macro_export]
macro_rules! log_err {
    ($scope:expr, $expr:expr) => {{
        let __r = $expr;
        if let Err(ref __e) = __r {
            $crate::logger::error(format!("[{}] {}", $scope, __e));
        }
        __r
    }};
}
