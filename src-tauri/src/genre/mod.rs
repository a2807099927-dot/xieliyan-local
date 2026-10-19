// 模块说明：题材提示词包（genre pack）的后端存储与下发。
// 架构定位：与 prompts 模块并列——把"题材风格档案(profile JSON) + 手法种子(seed SQL)"作为资源放在 Rust 端，
//           前端通过 invoke 运行时获取，避免把整套题材设定明文打进前端 bundle。
// 关键职责：按 genre id 返回 (profile_json, seed_sql) 文本对，并列出可用题材 id。
// 现状（对应改造项 T9，已完成）：registry 通过 include_str! 内嵌 genre-packs/ 下的 7 套题材数据，
//           前端 genreStore 预热后即可读取；后续如需更强保护，可改为从加密 runtime.dat 解密后填充。

pub mod registry;
