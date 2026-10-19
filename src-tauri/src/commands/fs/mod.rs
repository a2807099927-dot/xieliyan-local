// 文件系统 commands 路由 — 对应 electron/ipc/fs.ts
// 模块拆分原则：按职责独立小文件，避免单文件膨胀
//
//   - util:      共享工具（HTML 标签处理、数据 URL 编码等）
//   - dialog:    select_folder/file/save_path
//   - books:     load/save/delete book + chapter content + patch
//   - memory:    剧情档案 + 历史快照 + memory_history (plot/inference)
//   - exports:   export_txt/markdown/pdf + save_text_file
//   - imports:   import_txt + import_wallpaper + import_book_cover + read_text_file
//   - backup:    backup_workspace + backup_book + zip 递归
//   - workspace: init_workspace（工作区切换）

mod util;
mod dialog;
mod books;
mod memory;
mod exports;
mod imports;
mod backup;
mod workspace;
mod settings;

pub use dialog::*;
pub use books::*;
pub use memory::*;
pub use exports::*;
pub use imports::*;
pub use backup::*;
pub use workspace::*;
pub use settings::*;
