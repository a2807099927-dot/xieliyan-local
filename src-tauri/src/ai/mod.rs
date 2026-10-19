// AI 模块 — 对应主项目 src/ai/manager.ts + electron/aiManager.ts
use std::time::Duration;
use reqwest::Client;

pub mod types;
pub mod manager;
pub mod adapters;

pub fn build_client_with_system_proxy(timeout: Duration) -> Client {
    let mut builder = Client::builder()
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(15));

    if let Ok(proxy_settings) = sysproxy::Sysproxy::get_system_proxy() {
        if proxy_settings.enable && !proxy_settings.host.is_empty() {
            let proxy_url = format!("http://{}:{}", proxy_settings.host, proxy_settings.port);
            if let Ok(reqwest_proxy) = reqwest::Proxy::all(&proxy_url) {
                // 国内 IP 和常见国内域名不走代理，避免绕路超时
                let no_proxy = reqwest::NoProxy::from_string("localhost,127.0.0.1,*.aliyuncs.com,*.tencentcloudapi.com,10.*,172.16.*,192.168.*");
                let reqwest_proxy = reqwest_proxy.no_proxy(no_proxy);
                builder = builder.proxy(reqwest_proxy);
            }
        }
    }

    builder.build().unwrap_or_else(|_| Client::new())
}

