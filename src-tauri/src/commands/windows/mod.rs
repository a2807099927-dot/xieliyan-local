// 多窗口管理 commands — 对应 electron/ipc/system.ts 中的多窗口部分
//
// 子模块拆分：
//   - state:        共享 WindowsState（Agent 状态 / 续写状态 / 桥接挂起队列）+ 常量
//   - common:       通用工具（窗口尺寸保存 / 聚焦 / URL 编码）
//   - agent:        Agent 助手独立窗口 + 主↔Agent 桥接
//   - continuation: 续写结果独立窗口
//   - outline:      章节大纲独立窗口
//   - novel_lab:    小说实验室独立窗口

mod state;
mod common;
mod agent;
mod continuation;
mod outline;
mod novel_lab;
mod aiweb;
mod toolbox;
mod book_sweeper;

pub use state::WindowsState;
pub use agent::*;
pub use continuation::*;
pub use outline::*;
pub use novel_lab::*;
pub use aiweb::*;
pub use toolbox::*;
pub use book_sweeper::*;
