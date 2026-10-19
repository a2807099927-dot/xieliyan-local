// 多网盘同步：配置与统一结果
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudProviderConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub enabled: bool,
    // WebDAV / 坚果云
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub remote_path: String,
    // 开放平台
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub cookie: String,
    #[serde(default)]
    pub folder_id: String,
    #[serde(default)]
    pub app_id: String,
    #[serde(default)]
    pub app_key: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncResult {
    pub success: bool,
    #[serde(default)]
    pub uploaded: u32,
    #[serde(default)]
    pub downloaded: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_profiles: Option<Vec<serde_json::Value>>,
}

impl CloudSyncResult {
    pub fn ok_upload(n: u32) -> Self {
        Self {
            success: true,
            uploaded: n,
            downloaded: 0,
            error: None,
            warning: None,
            style_profiles: None,
        }
    }
    pub fn ok_download(n: u32, style: Option<Vec<serde_json::Value>>) -> Self {
        Self {
            success: true,
            uploaded: 0,
            downloaded: n,
            error: None,
            warning: None,
            style_profiles: style,
        }
    }
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            uploaded: 0,
            downloaded: 0,
            error: Some(msg.into()),
            warning: None,
            style_profiles: None,
        }
    }
    pub fn ok_test() -> Self {
        Self {
            success: true,
            uploaded: 0,
            downloaded: 0,
            error: None,
            warning: None,
            style_profiles: None,
        }
    }
    pub fn ok_test_warn(w: impl Into<String>) -> Self {
        Self {
            success: true,
            uploaded: 0,
            downloaded: 0,
            error: None,
            warning: Some(w.into()),
            style_profiles: None,
        }
    }
}
