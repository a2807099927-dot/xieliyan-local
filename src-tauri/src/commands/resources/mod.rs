// 资源管理 commands 路由 — 对应 electron/ipc/resources.ts
// 子模块拆分：
//   - storage：book.json 读写 + 通用辅助
//   - categories：分类 CRUD
//   - roles：角色 CRUD（含详情、整体更新）
//   - extract：AI 角色提取 + 去重合并 + 导入回写
//   - cleanup：正文残留 <mark> 清理

mod categories;
mod roles;
mod extract;
mod cleanup;
pub mod storage;

pub use categories::*;
pub use roles::*;
pub use extract::*;
pub use cleanup::*;
