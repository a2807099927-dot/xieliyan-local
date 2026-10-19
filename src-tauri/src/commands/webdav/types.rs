// WebDAV 数据结构
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebDavConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default, alias = "remote_path", rename = "remotePath")]
    pub remote_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub uploaded: u32,
    pub downloaded: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 云端同步下来的 styleProfiles（自定义写作提示词配置），None 表示云端无此文件
    #[serde(rename = "styleProfiles", skip_serializing_if = "Option::is_none")]
    pub style_profiles: Option<Vec<serde_json::Value>>,
}
