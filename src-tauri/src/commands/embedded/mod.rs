// 嵌入式 webview 管理（NovelLab 内置浏览器 / AI 网页等）
//
// 实现原理：用 Tauri 2 的 WebviewBuilder + WebviewWindow.add_child 把第三方
// 网页 webview 贴到主项目独立窗口的指定 region，前端用占位 div 控制位置。
//
// 子模块：
//   - state:           跨命令共享的 EmbeddedState（label → child webview 引用）
//   - novel_browser:   NovelLab 内嵌浏览器（笔趣阁等小说站）

mod state;
mod novel_browser;

pub use state::EmbeddedState;
pub use novel_browser::*;
