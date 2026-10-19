// 模块说明：敏感字段（API Key / 网盘密码等）的安全存储。
// 关键职责：优先写入操作系统钥匙串（keyring）；keyring 不可用时降级为“不处理”，
//   由调用方自行回退到配置文件明文（保证不丢数据，安全性降级但可用）。
// 维护边界：
//   - 需在 src-tauri/Cargo.toml 添加依赖：keyring = "2"（或 3，两个大版本的 get/set_password API 均兼容）。
//   - 只依赖 Entry::new / get_password / set_password / delete_password 这四个跨版本稳定的 API。

use keyring::Entry;

/// 钥匙串服务名（与应用标识保持一致）。
const SERVICE: &str = "xie-li-yan";

/// 写入一个密钥。返回 true 表示已成功落到钥匙串（调用方可据此决定是否从磁盘抹掉明文）。
pub fn set_secret(account: &str, value: &str) -> bool {
    if value.is_empty() {
        clear_secret(account);
        return true;
    }
    match Entry::new(SERVICE, account) {
        Ok(entry) => entry.set_password(value).is_ok(),
        Err(_) => false,
    }
}

/// 读取一个密钥；不存在 / 钥匙串不可用时返回 None。
pub fn get_secret(account: &str) -> Option<String> {
    let entry = Entry::new(SERVICE, account).ok()?;
    match entry.get_password() {
        Ok(v) if !v.is_empty() => Some(v),
        _ => None,
    }
}

/// 尽力删除一个密钥（忽略错误）。
pub fn clear_secret(account: &str) {
    if let Ok(entry) = Entry::new(SERVICE, account) {
        let _ = entry.delete_password();
    }
}
