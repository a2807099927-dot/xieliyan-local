// 子模块说明：题材包注册表（内置数据版）。
// 架构定位：genre 模块的数据出入口，向 lib.rs 命令层暴露"取包 / 列表"两个纯函数。
// 数据来源（对应改造项 T9）：编译期用 include_str! 内嵌 src-tauri/resources/genre-packs/ 下的 7 套题材数据
//   （profile JSON + craft seed SQL）；运行时按 id 命中返回，无需读磁盘，也避免题材设定明文散落进前端 bundle。
// 数据形态：genre id -> (profile JSON 文本, seed SQL 文本)，均为未解析文本，交由前端 genrePackLoader 装配。

/// 结构：单个题材包的文本对（profile JSON + seed SQL），保持未解析形态由前端装配。
pub struct GenrePackText {
    pub profile_json: String,
    pub seed_sql: String,
}

/// 结构：编译期内嵌的题材包条目（id + 两段静态文本）。
struct EmbeddedPack {
    id: &'static str,
    profile_json: &'static str,
    seed_sql: &'static str,
}

/// 数据：全部内置题材包。
/// include_str! 路径相对本文件（src-tauri/src/genre/registry.rs），向上两级到 src-tauri/ 后进入 resources/genre-packs/。
const EMBEDDED_PACKS: &[EmbeddedPack] = &[
    EmbeddedPack {
        id: "urban",
        profile_json: include_str!("../../resources/genre-packs/urban/urban_genre_profile_v2.json"),
        seed_sql: include_str!("../../resources/genre-packs/urban/urban_craft_seed_v2.sql"),
    },
    EmbeddedPack {
        id: "xuanhuan",
        profile_json: include_str!("../../resources/genre-packs/xuanhuan/xuanhuan_genre_profile_v1.json"),
        seed_sql: include_str!("../../resources/genre-packs/xuanhuan/xuanhuan_craft_seed_v1.sql"),
    },
    EmbeddedPack {
        id: "wenyi",
        profile_json: include_str!("../../resources/genre-packs/wenyi/wenyi_genre_profile_v1.json"),
        seed_sql: include_str!("../../resources/genre-packs/wenyi/wenyi_craft_seed_v1.sql"),
    },
    EmbeddedPack {
        id: "youxi",
        profile_json: include_str!("../../resources/genre-packs/youxi/youxi_genre_profile_v1.json"),
        seed_sql: include_str!("../../resources/genre-packs/youxi/youxi_craft_seed_v1.sql"),
    },
    EmbeddedPack {
        id: "lishi",
        profile_json: include_str!("../../resources/genre-packs/lishi/lishi_genre_profile_v1.json"),
        seed_sql: include_str!("../../resources/genre-packs/lishi/lishi_craft_seed_v1.sql"),
    },
    EmbeddedPack {
        id: "lishishuangwen",
        profile_json: include_str!(
            "../../resources/genre-packs/lishishuangwen/lishishuangwen_genre_profile_v1.json"
        ),
        seed_sql: include_str!(
            "../../resources/genre-packs/lishishuangwen/lishishuangwen_craft_seed_v1.sql"
        ),
    },
    EmbeddedPack {
        id: "shuangwen",
        profile_json: include_str!("../../resources/genre-packs/shuangwen/shuangwen_genre_profile_v1.json"),
        seed_sql: include_str!("../../resources/genre-packs/shuangwen/shuangwen_craft_seed_v1.sql"),
    },
];

/// 功能：按题材 id 取包。命中返回内嵌文本对；未知 id 返回 None（前端会安全降级为"无题材"，不影响写作主流程）。
pub fn get_pack(genre: &str) -> Option<GenrePackText> {
    EMBEDDED_PACKS
        .iter()
        .find(|pack| pack.id == genre)
        .map(|pack| GenrePackText {
            profile_json: pack.profile_json.to_string(),
            seed_sql: pack.seed_sql.to_string(),
        })
}

/// 功能：列出全部内置题材 id，供前端展示可选题材 / 预热缓存。
pub fn list_genres() -> Vec<String> {
    EMBEDDED_PACKS.iter().map(|pack| pack.id.to_string()).collect()
}
