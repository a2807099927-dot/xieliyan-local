// 阿里云盘：优先网页协议（扫码拿 refresh_token，无需开放平台 AppKey）
// 回退：开放平台 OpenAPI（需 client_id/secret）
//
// 重要：网页协议同目录允许重名文件，check_name_mode=overwrite 并不可靠。
// 上传前会删除同名旧文件；下载时取 updated_at 最新的那份，避免覆盖到旧备份。
use reqwest::Client;
use serde_json::{json, Value};

use super::types::CloudProviderConfig;

const WEB_TOKEN_URL: &str = "https://auth.aliyundrive.com/v2/account/token";
const WEB_API: &str = "https://api.aliyundrive.com";
const OPEN_TOKEN_URL: &str = "https://open.aliyundrive.com/oauth/access_token";
const OPEN_API: &str = "https://openapi.alipan.com";

const BOOKS_ZIP: &str = "books.zip";
const FOLDER_NAME: &str = "xieliyan";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Backend {
    Web,
    Open,
}

#[derive(Clone, Debug)]
struct RemoteFile {
    file_id: String,
    size: u64,
    updated_at: String,
    created_at: String,
}

pub struct AliyunSession {
    pub client: Client,
    pub access_token: String,
    pub drive_id: String,
    backend: Backend,
}

impl AliyunSession {
    pub async fn connect(cfg: &CloudProviderConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .build()
            .map_err(|e| e.to_string())?;

        let refresh = cfg.refresh_token.trim();
        if refresh.is_empty() {
            return Err("请先点击「扫码登录」完成阿里云盘授权".into());
        }

        match connect_web(&client, refresh).await {
            Ok(s) => {
                crate::logger::warn(format!(
                    "[aliyun] connected via web, drive_id={}",
                    s.drive_id
                ));
                return Ok(s);
            }
            Err(web_err) => {
                crate::logger::warn(format!("[aliyun] web token failed: {}", web_err));
            }
        }

        connect_open(&client, cfg, refresh).await
    }

    async fn api_post(&self, path: &str, body: Value) -> Result<Value, String> {
        let base = match self.backend {
            Backend::Web => WEB_API,
            Backend::Open => OPEN_API,
        };
        let resp = self
            .client
            .post(format!("{}{}", base, path))
            .header("Authorization", format!("Bearer {}", self.access_token))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let data: Value = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            let msg = data
                .get("message")
                .or_else(|| data.get("code"))
                .map(|v| v.to_string())
                .unwrap_or_else(|| status.to_string());
            return Err(format!("阿里云盘 API 错误: {}", msg));
        }
        Ok(data)
    }

    fn list_path(&self) -> &'static str {
        match self.backend {
            Backend::Web => "/adrive/v3/file/list",
            Backend::Open => "/adrive/v1.0/openFile/list",
        }
    }

    /// 列出目录下全部文件（分页）
    async fn list_all(&self, parent_id: &str) -> Result<Vec<Value>, String> {
        let mut items = Vec::new();
        let mut marker = String::new();
        loop {
            let mut body = json!({
                "drive_id": self.drive_id,
                "parent_file_id": parent_id,
                "limit": 100,
                "order_by": "updated_at",
                "order_direction": "DESC"
            });
            if !marker.is_empty() {
                body.as_object_mut()
                    .unwrap()
                    .insert("marker".into(), json!(marker));
            }
            let list = self.api_post(self.list_path(), body).await?;
            if let Some(arr) = list.get("items").and_then(|v| v.as_array()) {
                items.extend(arr.iter().cloned());
            }
            let next = list
                .get("next_marker")
                .or_else(|| list.get("marker"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if next.is_empty() || next == marker {
                break;
            }
            marker = next;
            if items.len() > 2000 {
                break;
            }
        }
        Ok(items)
    }

    fn parse_file(it: &Value) -> Option<RemoteFile> {
        let file_id = it.get("file_id")?.as_str()?.to_string();
        let size = it
            .get("size")
            .and_then(|v| v.as_u64())
            .or_else(|| it.get("size").and_then(|v| v.as_i64()).map(|n| n as u64))
            .unwrap_or(0);
        let updated_at = it
            .get("updated_at")
            .or_else(|| it.get("updatedAt"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let created_at = it
            .get("created_at")
            .or_else(|| it.get("createdAt"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        Some(RemoteFile {
            file_id,
            size,
            updated_at,
            created_at,
        })
    }

    /// 同名文件全部找出，按 updated_at 新→旧
    async fn find_files_by_name(
        &self,
        parent_id: &str,
        name: &str,
        typ: &str,
    ) -> Result<Vec<RemoteFile>, String> {
        let items = self.list_all(parent_id).await?;
        let mut matched: Vec<RemoteFile> = items
            .iter()
            .filter(|it| {
                it.get("type").and_then(|v| v.as_str()) == Some(typ)
                    && it.get("name").and_then(|v| v.as_str()) == Some(name)
            })
            .filter_map(Self::parse_file)
            .collect();
        matched.sort_by(|a, b| {
            // 新的在前
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| b.created_at.cmp(&a.created_at))
                .then_with(|| b.size.cmp(&a.size))
        });
        Ok(matched)
    }

    async fn trash_file(&self, file_id: &str) -> Result<(), String> {
        let path = match self.backend {
            Backend::Web => "/v2/recyclebin/trash",
            Backend::Open => "/adrive/v1.0/openFile/recyclebin/trash",
        };
        // 开放平台可能用 delete；失败不阻断主流程
        match self
            .api_post(
                path,
                json!({
                    "drive_id": self.drive_id,
                    "file_id": file_id
                }),
            )
            .await
        {
            Ok(_) => Ok(()),
            Err(e1) => {
                // 再试 batch delete（网页协议）
                if self.backend == Backend::Web {
                    let r = self
                        .api_post(
                            "/adrive/v2/batch",
                            json!({
                                "requests": [{
                                    "body": {
                                        "drive_id": self.drive_id,
                                        "file_id": file_id
                                    },
                                    "headers": { "Content-Type": "application/json" },
                                    "id": file_id,
                                    "method": "POST",
                                    "url": "/file/delete"
                                }],
                                "resource": "file"
                            }),
                        )
                        .await;
                    if r.is_ok() {
                        return Ok(());
                    }
                }
                Err(e1)
            }
        }
    }

    /// 删除 parent 下所有同名文件（上传前清场，避免重名残留旧备份）
    async fn remove_same_name_files(&self, parent_id: &str, name: &str) -> u32 {
        let files = match self.find_files_by_name(parent_id, name, "file").await {
            Ok(f) => f,
            Err(e) => {
                crate::logger::warn(format!("[aliyun] list for cleanup failed: {}", e));
                return 0;
            }
        };
        let mut n = 0u32;
        for f in files {
            crate::logger::warn(format!(
                "[aliyun] trash old {} id={} size={} updated={}",
                name, f.file_id, f.size, f.updated_at
            ));
            match self.trash_file(&f.file_id).await {
                Ok(()) => n += 1,
                Err(e) => crate::logger::warn(format!(
                    "[aliyun] trash {} failed: {}",
                    f.file_id, e
                )),
            }
        }
        n
    }

    /// 确保「写梨眼」文件夹存在，返回 file_id（多份同名时取最新）
    pub async fn ensure_folder(&self, name: &str) -> Result<String, String> {
        let parent = "root";
        let folders = self.find_files_by_name(parent, name, "folder").await?;
        if let Some(f) = folders.first() {
            // 多余同名文件夹：尽量保留最新，清理旧的（避免上传落到旧目录）
            for old in folders.iter().skip(1) {
                let _ = self.trash_file(&old.file_id).await;
            }
            return Ok(f.file_id.clone());
        }

        let create_path = match self.backend {
            Backend::Web => "/adrive/v2/file/createWithFolders",
            Backend::Open => "/adrive/v1.0/openFile/create",
        };
        let created = self
            .api_post(
                create_path,
                json!({
                    "drive_id": self.drive_id,
                    "parent_file_id": parent,
                    "name": name,
                    "type": "folder",
                    "check_name_mode": "refuse"
                }),
            )
            .await?;
        if let Some(id) = created.get("file_id").and_then(|v| v.as_str()) {
            return Ok(id.to_string());
        }
        // exist 场景再列
        let folders = self.find_files_by_name(parent, name, "folder").await?;
        folders
            .first()
            .map(|f| f.file_id.clone())
            .ok_or_else(|| "创建文件夹失败".into())
    }

    pub async fn upload_file(
        &self,
        parent_id: &str,
        name: &str,
        bytes: Vec<u8>,
    ) -> Result<(), String> {
        // 关键：清掉同名旧文件，否则下载会拿到历史备份
        let removed = self.remove_same_name_files(parent_id, name).await;
        if removed > 0 {
            crate::logger::warn(format!(
                "[aliyun] cleaned {} old file(s) named {}",
                removed, name
            ));
            // 给回收站/索引一点时间
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }

        let size = bytes.len() as u64;
        let part_size = 10 * 1024 * 1024u64;
        let part_count = ((size + part_size - 1) / part_size).max(1) as usize;
        let part_info_list: Vec<Value> = (1..=part_count)
            .map(|n| json!({ "part_number": n }))
            .collect();

        let create_path = match self.backend {
            Backend::Web => "/adrive/v2/file/createWithFolders",
            Backend::Open => "/adrive/v1.0/openFile/create",
        };
        let created = self
            .api_post(
                create_path,
                json!({
                    "drive_id": self.drive_id,
                    "parent_file_id": parent_id,
                    "name": name,
                    "type": "file",
                    "check_name_mode": "refuse",
                    "size": size,
                    "part_info_list": part_info_list
                }),
            )
            .await?;

        crate::logger::warn(format!(
            "[aliyun] create {} size={} rapid={} file_id={:?}",
            name,
            size,
            created
                .get("rapid_upload")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            created.get("file_id").and_then(|v| v.as_str())
        ));

        if created.get("rapid_upload").and_then(|v| v.as_bool()) == Some(true) {
            return Ok(());
        }

        let file_id = created
            .get("file_id")
            .and_then(|v| v.as_str())
            .ok_or("create 缺少 file_id")?
            .to_string();
        let upload_id = created
            .get("upload_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let parts = created
            .get("part_info_list")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if parts.is_empty() && size > 0 {
            return Err("创建上传任务成功但未返回分片地址，请重试".into());
        }

        for (idx, part) in parts.iter().enumerate() {
            let upload_url = part
                .get("upload_url")
                .and_then(|v| v.as_str())
                .ok_or("缺少 upload_url")?;
            let start = (idx as u64 * part_size) as usize;
            let end = ((idx as u64 + 1) * part_size).min(size) as usize;
            let chunk = &bytes[start..end];
            let put = self
                .client
                .put(upload_url)
                .body(chunk.to_vec())
                .send()
                .await
                .map_err(|e| format!("分片上传失败: {}", e))?;
            if !put.status().is_success() {
                return Err(format!("分片上传 HTTP {}", put.status()));
            }
        }

        if !upload_id.is_empty() {
            let complete_path = match self.backend {
                Backend::Web => "/v2/file/complete",
                Backend::Open => "/adrive/v1.0/openFile/complete",
            };
            self.api_post(
                complete_path,
                json!({
                    "drive_id": self.drive_id,
                    "file_id": file_id,
                    "upload_id": upload_id
                }),
            )
            .await?;
        }

        // 校验：云端最新同名文件 size 应匹配
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        if let Ok(files) = self.find_files_by_name(parent_id, name, "file").await {
            if let Some(latest) = files.first() {
                crate::logger::warn(format!(
                    "[aliyun] after upload latest {} size={} (expect {}) id={}",
                    name, latest.size, size, latest.file_id
                ));
                // 再清一次多余副本（complete 期间可能仍看到旧的）
                for old in files.iter().skip(1) {
                    let _ = self.trash_file(&old.file_id).await;
                }
                if latest.size > 0 && size > 0 && latest.size != size {
                    crate::logger::warn(format!(
                        "[aliyun] size mismatch after upload: cloud={} local={}",
                        latest.size, size
                    ));
                }
            }
        }
        Ok(())
    }

    pub async fn download_file_by_name(
        &self,
        parent_id: &str,
        name: &str,
    ) -> Result<Vec<u8>, String> {
        let files = self.find_files_by_name(parent_id, name, "file").await?;
        if files.is_empty() {
            return Err(format!(
                "云端未找到文件 {}（目录 xieliyan）。请先上传一次备份。",
                name
            ));
        }
        if files.len() > 1 {
            crate::logger::warn(format!(
                "[aliyun] found {} copies of {}, using newest size={} updated={}",
                files.len(),
                name,
                files[0].size,
                files[0].updated_at
            ));
        }
        let latest = &files[0];
        crate::logger::warn(format!(
            "[aliyun] download {} id={} size={} updated={}",
            name, latest.file_id, latest.size, latest.updated_at
        ));

        let dl_path = match self.backend {
            Backend::Web => "/v2/file/get_download_url",
            Backend::Open => "/adrive/v1.0/openFile/getDownloadUrl",
        };
        let got = self
            .api_post(
                dl_path,
                json!({
                    "drive_id": self.drive_id,
                    "file_id": latest.file_id,
                    "expire_sec": 900
                }),
            )
            .await?;
        let url = got
            .get("url")
            .or_else(|| got.get("download_url"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("无下载地址: {}", got))?;

        let resp = self
            .client
            .get(url)
            .header("Referer", "https://www.aliyundrive.com/")
            .send()
            .await
            .map_err(|e| format!("下载请求失败: {}", e))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("下载 HTTP {}", status));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("读取下载内容失败: {}", e))?;
        if bytes.is_empty() {
            return Err("下载内容为空".into());
        }
        // zip 魔数
        if bytes.len() < 4 || &bytes[0..2] != b"PK" {
            return Err(format!(
                "下载内容不是有效 zip（{} bytes，头不是 PK）。可能下到了错误文件。",
                bytes.len()
            ));
        }
        crate::logger::warn(format!(
            "[aliyun] downloaded {} bytes for {}",
            bytes.len(),
            name
        ));
        Ok(bytes.to_vec())
    }
}

async fn connect_web(client: &Client, refresh: &str) -> Result<AliyunSession, String> {
    let body = json!({
        "refresh_token": refresh,
        "grant_type": "refresh_token"
    });
    let resp = client
        .post(WEB_TOKEN_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网页协议刷新 token 失败: {}", e))?;
    let status = resp.status();
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = data
            .get("message")
            .or_else(|| data.get("code"))
            .map(|v| v.to_string())
            .unwrap_or_else(|| status.to_string());
        return Err(format!("网页协议 token 无效: {}", msg));
    }
    let access_token = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("响应缺少 access_token")?
        .to_string();
    // 备份盘优先 default_drive_id；部分账号备份盘与资源库不同
    let drive_id = data
        .get("default_drive_id")
        .or_else(|| data.get("resource_drive_id"))
        .or_else(|| data.get("backup_drive_id"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("无法解析 drive_id: {}", data))?
        .to_string();

    Ok(AliyunSession {
        client: client.clone(),
        access_token,
        drive_id,
        backend: Backend::Web,
    })
}

async fn connect_open(
    client: &Client,
    cfg: &CloudProviderConfig,
    refresh: &str,
) -> Result<AliyunSession, String> {
    let mut client_id = cfg.app_id.trim().to_string();
    let mut client_secret = cfg.app_key.trim().to_string();
    if client_id.is_empty() {
        client_id = std::env::var("XLY_ALIYUN_CLIENT_ID").unwrap_or_default();
    }
    if client_secret.is_empty() {
        client_secret = std::env::var("XLY_ALIYUN_CLIENT_SECRET").unwrap_or_default();
    }
    if client_id.is_empty() || client_secret.is_empty() {
        return Err("扫码凭证已失效，且未配置开放平台密钥。请重新点击「扫码登录」。".into());
    }

    let body = json!({
        "client_id": client_id.as_str(),
        "client_secret": client_secret.as_str(),
        "grant_type": "refresh_token",
        "refresh_token": refresh
    });
    let resp = client
        .post(OPEN_TOKEN_URL)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("开放平台刷新 token 失败: {}", e))?;
    let status = resp.status();
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = data
            .get("message")
            .or_else(|| data.get("error_description"))
            .or_else(|| data.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("token 刷新失败");
        return Err(format!("阿里云盘授权失败: {}", msg));
    }
    let access_token = data
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("响应缺少 access_token")?
        .to_string();

    let drive_resp = client
        .post(format!("{}/adrive/v1.0/user/getDriveInfo", OPEN_API))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&json!({}))
        .send()
        .await
        .map_err(|e| format!("获取 drive 失败: {}", e))?;
    let drive_data: Value = drive_resp.json().await.map_err(|e| e.to_string())?;
    let drive_id = drive_data
        .get("default_drive_id")
        .or_else(|| drive_data.get("resource_drive_id"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("无法解析 drive_id: {}", drive_data))?
        .to_string();

    Ok(AliyunSession {
        client: client.clone(),
        access_token,
        drive_id,
        backend: Backend::Open,
    })
}

pub async fn test(cfg: &CloudProviderConfig) -> Result<String, String> {
    let s = AliyunSession::connect(cfg).await?;
    let folder = s.ensure_folder(FOLDER_NAME).await?;
    let files = s.find_files_by_name(&folder, BOOKS_ZIP, "file").await?;
    let mode = match s.backend {
        Backend::Web => "网页协议",
        Backend::Open => "开放平台",
    };
    if files.is_empty() {
        Ok(format!(
            "连接成功（{}）。目录 {} 下尚无 {}，请先上传。",
            mode, FOLDER_NAME, BOOKS_ZIP
        ))
    } else {
        let latest = &files[0];
        Ok(format!(
            "连接成功（{}）。云端 {} 共 {} 份，将使用最新：{} bytes，更新于 {}",
            mode,
            BOOKS_ZIP,
            files.len(),
            latest.size,
            if latest.updated_at.is_empty() {
                "未知"
            } else {
                &latest.updated_at
            }
        ))
    }
}

pub async fn upload_books_zip(cfg: &CloudProviderConfig, zip: Vec<u8>) -> Result<(), String> {
    let s = AliyunSession::connect(cfg).await?;
    let folder = s.ensure_folder(FOLDER_NAME).await?;
    crate::logger::warn(format!(
        "[aliyun] upload_books_zip {} bytes → folder={}",
        zip.len(),
        folder
    ));
    s.upload_file(&folder, BOOKS_ZIP, zip).await
}

pub async fn download_books_zip(cfg: &CloudProviderConfig) -> Result<Vec<u8>, String> {
    let s = AliyunSession::connect(cfg).await?;
    let folder = s.ensure_folder(FOLDER_NAME).await?;
    s.download_file_by_name(&folder, BOOKS_ZIP).await
}
