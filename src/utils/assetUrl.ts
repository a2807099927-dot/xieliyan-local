// 模块说明：本地资源 URL 解析工具。
// 关键职责：将本地文件路径 / `ly-asset://` 协议路径转换为 webview 可加载的真实 URL。
//
// Tauri 2 行为：自定义 URI scheme 在 Windows WebView2 / 其他平台 wry 内部，会被映射为
// - Windows / Linux: http://<scheme>.localhost/<path>
// - macOS / iOS: <scheme>://localhost/<path>
//
// 所以 Tauri 环境下要把 `ly-asset:///E:/wallpapers/x.jpg` 转成
// `http://ly-asset.localhost/E:/wallpapers/x.jpg`
//
// 在普通浏览器（非 Tauri 也非 Electron）预览模式下，`ly-asset:///` 不会工作，但前端 stub
// 数据里只用 data URL / http(s) URL，所以这里也保持兜底。

const inTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
const inElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

/**
 * 把任意本地资源路径或 ly-asset URI 转换为 webview 可加载的 URL。
 */
export function toAssetUrl(value: string | undefined): string {
 const raw = String(value || '').trim();
 if (!raw) return '';

 // 已经是远端 / data 协议直接返回
 if (raw.startsWith('data:') || /^https?:\/\//i.test(raw) || raw.startsWith('blob:')) return raw;

 // 提取出真实文件路径
 const filePath = (() => {
 if (raw.startsWith('ly-asset:///')) return raw.slice('ly-asset:///'.length);
 if (raw.startsWith('ly-asset://')) return raw.slice('ly-asset://'.length).replace(/^localhost\/?/, '');
 return raw.replace(/\\/g, '/').replace(/^\/+/, '');
 })();

 // 路径段做 percent-encode（只对必要字符）
 const encoded = filePath
 .split('/')
 .map((seg) => encodeURIComponent(seg))
 .join('/');

 if (inTauri) {
 // Tauri 把自定义 scheme 在 Windows/Linux 上映射到 http://<scheme>.localhost/...
 return `http://ly-asset.localhost/${encoded}`;
 }
 if (inElectron) {
 // 主项目 Electron 用三斜杠 ly-asset:/// path
 return `ly-asset:///${filePath}`;
 }
 // 浏览器预览：返回相对/绝对路径，让用户自己看到 broken image 也能调试
 return raw;
}
