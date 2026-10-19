// workspace management
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

static WORKSPACE_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

const WORKSPACE_CONFIG_FILE: &str = "workspace-path.txt";

/// Safe mutex lock that recovers from poisoning instead of panicking
fn lock_workspace() -> std::sync::MutexGuard<'static, Option<PathBuf>> {
    WORKSPACE_PATH.lock().unwrap_or_else(|e| e.into_inner())
}

fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    fs::create_dir_all(&dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub fn get_workspace_path(app: &AppHandle) -> PathBuf {
    {
        let cached = lock_workspace();
        if let Some(p) = cached.as_ref() {
            return p.clone();
        }
    }

    let user_data = app.path().app_data_dir().unwrap_or_default();
    let config_file = user_data.join(WORKSPACE_CONFIG_FILE);

    // Cross-architecture migration (Electron -> Tauri 2)
    if !config_file.exists() {
        if let Some(parent) = user_data.parent() {
            let old_electron_dir = parent.join("xie-li-yan");
            let old_electron_config = old_electron_dir.join("xieliyan_global_config.json");
            
            let mut migrated = false;

            if old_electron_config.exists() {
                if let Ok(raw) = fs::read_to_string(&old_electron_config) {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
                        if let Some(storage_path) = parsed.get("workspace").and_then(|w| w.get("storagePath")).and_then(|s| s.as_str()) {
                            let p = PathBuf::from(storage_path.trim());
                            if !storage_path.trim().is_empty() && p.exists() {
                                let _ = fs::create_dir_all(&user_data);
                                if fs::write(&config_file, storage_path.trim()).is_ok() {
                                    migrated = true;
                                    *lock_workspace() = Some(p.clone());
                                }
                            }
                        }
                    }
                }
            }

            if !migrated {
                let old_default_workspace = old_electron_dir.join("workspace");
                let new_default_workspace = user_data.join("workspace");
                if old_default_workspace.exists() && !new_default_workspace.exists() {
                    let _ = fs::create_dir_all(&user_data);
                    if copy_dir_all(&old_default_workspace, &new_default_workspace).is_ok() {
                        let _ = fs::write(&config_file, new_default_workspace.to_string_lossy().as_ref());
                        *lock_workspace() = Some(new_default_workspace.clone());
                    }
                }
            }
        }
    }

    {
        let cached = lock_workspace();
        if let Some(p) = cached.as_ref() {
            return p.clone();
        }
    }

    let user_data = app.path().app_data_dir().unwrap_or_default();
    let config_file = user_data.join(WORKSPACE_CONFIG_FILE);

    if config_file.exists() {
        if let Ok(saved) = fs::read_to_string(&config_file) {
            let trimmed = saved.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                if p.exists() {
                    *lock_workspace() = Some(p.clone());
                    return p;
                }
            }
        }
    }

    let default = user_data.join("workspace");
    *lock_workspace() = Some(default.clone());
    default
}

pub fn set_workspace_path(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let user_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&user_data).map_err(|e| e.to_string())?;
    let config_file = user_data.join(WORKSPACE_CONFIG_FILE);
    fs::write(&config_file, path.to_string_lossy().as_ref()).map_err(|e| e.to_string())?;
    *lock_workspace() = Some(path);
    Ok(())
}

pub fn books_dir(app: &AppHandle) -> PathBuf {
    get_workspace_path(app).join("books")
}
