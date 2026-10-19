// AI 命令路由 — 对应 electron/ipc/ai.ts
// 子模块：
//   - state:    AiAbortState（全局取消令牌）
//   - chat:     ai_chat / ai_abort
//   - validate: ai_validate
//   - models:   ai_get_provider_models / ai_get_local_models
//   - style:    ai_get_style_prompt
//   - style_extraction_prompt: ai_get_style_extraction_prompt
//   - logs:     ai_get_logs / ai_clear_logs
//   - benchmark: ai_benchmark_links

mod state;
mod chat;
mod validate;
mod models;
mod style;
mod style_extraction_prompt;
mod technique_prompt;
mod arc_planner_prompt;
mod writing_prompts;
mod web_search;
mod logs;
mod benchmark;
mod inspiration;

pub use state::AiAbortState;
pub use chat::*;
pub use validate::*;
pub use models::*;
pub use style::*;
pub use style_extraction_prompt::*;
pub use technique_prompt::*;
pub use arc_planner_prompt::*;
pub use writing_prompts::*;
pub use web_search::*;
pub use logs::*;
pub use benchmark::*;
pub use inspiration::*;
