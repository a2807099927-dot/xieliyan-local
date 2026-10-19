// 小说实验室 — 对应 electron/ipc-handlers/novel-lab.ipc.ts
// 子模块：
//   - paths:    路径管理 + sanitize（共享）
//   - chapters: 章节存档（saveChapter / saveBookIndex / loadBookFromFolder）
//   - unified:  统一格式（一本书一个 JSON）+ 旧格式自动迁移
//   - archive:  存档列表 / 删除 / 加载入口
//   - analysis: 分析会话存读 + 流式 AI 分析（带 abort）
//   - imports:  TXT 导入拆章
//   - paths_cfg: novelLabSavePath 在 config 中的读写

mod paths;
mod chapters;
mod unified;
mod archive;
mod analysis;
mod imports;
mod paths_cfg;

pub use chapters::*;
pub use archive::*;
pub use analysis::*;
pub use imports::*;
pub use paths_cfg::*;
