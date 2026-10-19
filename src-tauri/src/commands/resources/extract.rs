// AI 角色提取 — 调 AI 引擎按章节批量分析 → JSON parse → 同名合并 → 返回候选
// 对应 electron/ipc/resources.ts 的 RESOURCES_EXTRACT_ROLES + RESOURCES_IMPORT_EXTRACTED_ROLES

use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::ai::manager;
use crate::ai::types::{AiConfig, ChatMessage};
use crate::commands::config::config_load;

use super::roles::insert_role_into_default_category;
use super::storage::{
    default_category_id_for_role_type, default_category_name_for_role_type, ensure_categories,
    normalize_role_type, read_book, sanitize_text, to_string_array, write_book,
};

const BATCH_SIZE: usize = 2;
const CHAPTER_MAX_CHARS: usize = 3000;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRolesArgs {
    pub book_id: Option<String>,
    pub start_chapter: Option<u64>,
    pub end_chapter: Option<u64>,
    pub novel_type: Option<String>,
}

/// 候选角色（提取后未持久化到 book.json）
#[derive(Debug, Clone, Default, serde::Serialize)]
struct ExtractedRole {
    name: String,
    aliases: Vec<String>,
    role_type: String,
    faction: String,
    description: String,
    first_appearance: String,
    chapters: Vec<String>,
    profession: String,
    skills: Vec<String>,
    /// 技能效果摘要：技能名 → 1–2 句效果说明（供悬浮卡）
    skill_details: Option<HashMap<String, String>>,
    equipment: Vec<String>,
    equipment_details: Option<HashMap<String, String>>,
    items: Vec<String>,
    recent_status: String,
}

impl ExtractedRole {
    fn from_value(value: &Value) -> Option<Self> {
        let name = sanitize_text(
            value
                .get("name")
                .or_else(|| value.get("characterName"))
                .or_else(|| value.get("title"))
                .unwrap_or(&Value::Null),
        );
        if name.is_empty() {
            return None;
        }
        let role_type = normalize_role_type(
            value.get("roleType").or_else(|| value.get("type")).unwrap_or(&Value::Null),
        )
        .to_string();
        let cf = value.get("customFields");
        // 兼容入库后字段：abilities + customFields.skills / skillDetails(JSON 字符串)
        let equipment_details = parse_string_map(value.get("equipmentDetails")).or_else(|| {
            parse_string_map_from_maybe_json_str(
                cf.and_then(|c| c.get("equipmentDetails")),
            )
        });
        let skill_details = parse_string_map(
            value
                .get("skillDetails")
                .or_else(|| value.get("skillsDetails"))
                .or_else(|| value.get("skill_effects")),
        )
        .or_else(|| {
            parse_string_map_from_maybe_json_str(cf.and_then(|c| c.get("skillDetails")))
        });

        let mut skills = filter_skill_list(to_string_array(
            value
                .get("skills")
                .or_else(|| value.get("abilities"))
                .or_else(|| value.get("gongfa"))
                .unwrap_or(&Value::Null),
        ));
        // customFields.skills 文本列表
        if let Some(cf_skills) = cf
            .and_then(|c| c.get("skills"))
            .and_then(|v| v.as_str())
        {
            for part in cf_skills.split(['、', '，', ',', '\n']) {
                let t = part.trim();
                if !t.is_empty() && !skills.iter().any(|s| s == t) {
                    skills.push(t.to_string());
                }
            }
            skills = filter_skill_list(skills);
        }

        let profession = {
            let top = sanitize_text(value.get("profession").unwrap_or(&Value::Null));
            if !top.is_empty() {
                top
            } else {
                sanitize_text(
                    cf.and_then(|c| c.get("profession"))
                        .unwrap_or(&Value::Null),
                )
            }
        };
        let recent_status = {
            let top = sanitize_text(
                value
                    .get("recentStatus")
                    .or_else(|| value.get("recent_status"))
                    .unwrap_or(&Value::Null),
            );
            if !top.is_empty() {
                top
            } else {
                sanitize_text(
                    cf.and_then(|c| c.get("recentStatus"))
                        .unwrap_or(&Value::Null),
                )
            }
        };

        Some(Self {
            name,
            aliases: to_string_array(value.get("aliases").unwrap_or(&Value::Null)),
            role_type,
            faction: sanitize_text(value.get("faction").unwrap_or(&Value::Null)),
            description: sanitize_text(value.get("description").unwrap_or(&Value::Null)),
            first_appearance: sanitize_text(
                value
                    .get("firstAppearance")
                    .or_else(|| value.get("firstAppearanceChapter"))
                    .unwrap_or(&Value::Null),
            ),
            chapters: to_string_array(value.get("chapters").unwrap_or(&Value::Null)),
            profession,
            skills,
            skill_details,
            equipment: to_string_array(value.get("equipment").unwrap_or(&Value::Null)),
            equipment_details,
            items: {
                let mut items = to_string_array(
                    value
                        .get("items")
                        .or_else(|| value.get("inventory"))
                        .unwrap_or(&Value::Null),
                );
                if let Some(cf_items) = cf.and_then(|c| c.get("items")).and_then(|v| v.as_str()) {
                    for part in cf_items.split(['、', '，', ',', '\n']) {
                        let t = part.trim();
                        if !t.is_empty() && !items.iter().any(|s| s == t) {
                            items.push(t.to_string());
                        }
                    }
                }
                dedup_strings(items)
            },
            recent_status,
        })
        .map(|mut r| {
            // 若 skills 为空，尝试从 description 里捞正式技能名（如「获得技能断空斩」）
            if r.skills.is_empty() && !r.description.is_empty() {
                r.skills = filter_skill_list(skills_from_description(&r.description));
            }
            // skillDetails 只保留合法技能名
            if let Some(details) = r.skill_details.take() {
                let mut cleaned = HashMap::new();
                for (k, v) in details {
                    let key = k.trim().to_string();
                    let val = v.trim().to_string();
                    if is_valid_skill_name(&key) && !val.is_empty() {
                        cleaned.insert(key, val);
                    }
                }
                // 详情里有、skills 列表没有的技能名补进 skills
                for k in cleaned.keys() {
                    if !r.skills.iter().any(|s| s == k) {
                        r.skills.push(k.clone());
                    }
                }
                r.skills = filter_skill_list(r.skills);
                r.skill_details = if cleaned.is_empty() {
                    None
                } else {
                    Some(cleaned)
                };
            }
            r
        })
    }

    fn to_serializable(&self) -> Value {
        let equipment_details = map_to_json_obj(self.equipment_details.as_ref());
        let skill_details = map_to_json_obj(self.skill_details.as_ref());
        json!({
            "name": self.name,
            "aliases": self.aliases,
            "roleType": self.role_type,
            "faction": self.faction,
            "description": self.description,
            "firstAppearance": self.first_appearance,
            "chapters": self.chapters,
            "profession": self.profession,
            "skills": self.skills,
            "skillDetails": skill_details,
            "equipment": self.equipment,
            "equipmentDetails": equipment_details,
            "items": self.items,
            "recentStatus": self.recent_status,
        })
    }

    /// 用于同人合并的身份键：本名 + 全部别名/游戏 ID（小写）
    fn identity_keys(&self) -> Vec<String> {
        let mut keys = Vec::new();
        let push = |keys: &mut Vec<String>, s: &str| {
            let t = s.trim().to_lowercase();
            if t.chars().count() >= 2 && !keys.contains(&t) {
                keys.push(t);
            }
        };
        push(&mut keys, &self.name);
        for a in &self.aliases {
            push(&mut keys, a);
        }
        keys
    }
}

fn parse_string_map(value: Option<&Value>) -> Option<HashMap<String, String>> {
    value.and_then(|v| v.as_object()).map(|map| {
        map.iter()
            .filter_map(|(k, v)| {
                let key = k.trim().to_string();
                let val = v
                    .as_str()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| sanitize_text(v));
                if key.is_empty() || val.is_empty() {
                    None
                } else {
                    Some((key, val))
                }
            })
            .collect()
    })
}

/// 兼容 object 或 JSON 字符串（customFields.skillDetails 存的是字符串）
fn parse_string_map_from_maybe_json_str(value: Option<&Value>) -> Option<HashMap<String, String>> {
    match value {
        Some(Value::Object(_)) => parse_string_map(value),
        Some(Value::String(s)) => {
            let s = s.trim();
            if s.is_empty() || s == "{}" {
                return None;
            }
            serde_json::from_str::<HashMap<String, String>>(s)
                .ok()
                .filter(|m| !m.is_empty())
        }
        _ => None,
    }
}

fn map_to_json_obj(map: Option<&HashMap<String, String>>) -> Value {
    match map {
        Some(m) if !m.is_empty() => {
            let mut obj = serde_json::Map::new();
            for (k, v) in m {
                obj.insert(k.clone(), Value::String(v.clone()));
            }
            Value::Object(obj)
        }
        _ => Value::Null,
    }
}

/// 真名优先：2–3 字中文名高于 4 字游戏 ID / 含英文数字的 ID
fn primary_name_score(name: &str) -> i32 {
    let n = name.chars().count();
    let mut score = 0;
    if (2..=3).contains(&n) {
        score += 20;
    } else if n == 4 {
        score += 8;
    } else if n > 4 {
        score += 2;
    }
    if name.chars().any(|c| c.is_ascii_alphanumeric()) {
        score -= 12; // 游戏 ID
    }
    score
}

/// 是否像「正式功法/技能名」；过滤普攻动作（下劈/上挑等）与过短噪声
fn is_valid_skill_name(name: &str) -> bool {
    let t = name.trim();
    let n = t.chars().count();
    // 技能名通常 2–10 字；过短多为动作，过长多为句子
    if n < 2 || n > 10 {
        return false;
    }
    // 整句/说明性不是技能
    if t.contains('。') || t.contains('，') || t.contains(',') || t.contains('：') || t.contains(':')
    {
        return false;
    }
    let blacklist = [
        "下劈",
        "上挑",
        "平砍",
        "横扫",
        "直刺",
        "刺击",
        "挥砍",
        "劈砍",
        "连斩",
        "普攻",
        "普通攻击",
        "左劈",
        "右劈",
        "前刺",
        "后跳",
        "格挡",
        "闪避",
        "翻滚",
        "跳跃",
        "轻击",
        "重击",
        "蓄力",
        "蓄力一击",
        "反击",
        "防御",
        "防御姿态",
        "冲刺",
        "疾跑",
        "格挡反击",
        "基础攻击",
        "普通斩击",
        "砍击",
        "砸击",
        "抽击",
        "横砍",
        "竖砍",
        "斜劈",
        "回马枪",
        "连击",
        "三连击",
        "二连击",
        "四连击",
        "五连击",
    ];
    if blacklist.iter().any(|b| t.eq_ignore_ascii_case(b)) {
        return false;
    }
    // 极短「X劈/砍/刺/挑」动作
    if n <= 3 {
        let last = t.chars().last().unwrap_or('\0');
        if matches!(last, '劈' | '砍' | '刺' | '挑' | '斩' | '击' | '砸' | '抽') {
            return false;
        }
    }
    true
}

fn filter_skill_list(skills: Vec<String>) -> Vec<String> {
    dedup_strings(
        skills
            .into_iter()
            .map(|s| s.trim().to_string())
            .filter(|s| is_valid_skill_name(s))
            .collect(),
    )
}

/// 从描述句中捞「技能/功法/绝学」专名（谨慎，宁缺毋滥）
fn skills_from_description(desc: &str) -> Vec<String> {
    let mut out = Vec::new();
    // 获得/学会/领悟/掌握 + 技能/功法/绝学 + 名称
    let re = regex::Regex::new(
        r"(?:获得|学会|领悟|掌握|习得)(?:了|到)?(?:技能|功法|绝学|招式)?[「『【]?([\u4e00-\u9fffA-Za-z0-9]{2,10})[」』】]?",
    )
    .ok();
    if let Some(re) = re {
        for cap in re.captures_iter(desc) {
            if let Some(m) = cap.get(1) {
                out.push(m.as_str().to_string());
            }
        }
    }
    // 技能：断空斩 / 功法：xxx
    let re2 = regex::Regex::new(
        r"(?:技能|功法|绝学)[：:]\s*[「『【]?([\u4e00-\u9fffA-Za-z0-9]{2,10})[」』】]?",
    )
    .ok();
    if let Some(re2) = re2 {
        for cap in re2.captures_iter(desc) {
            if let Some(m) = cap.get(1) {
                out.push(m.as_str().to_string());
            }
        }
    }
    out
}

/// 黑名单：明显不是角色的名字
fn is_non_role_name(name: &str) -> bool {
    if name.len() < 2 {
        return true;
    }
    // 角色名一般不超过 12 字（中文按字符长度）
    let char_count = name.chars().count();
    if char_count > 12 {
        return true;
    }
    let blacklist = [
        "系统", "面板", "任务面板", "提示音", "旁白", "公告", "官方", "GM", "客服", "管理员",
        "教程", "新手引导", "系统提示", "世界频道", "公告栏", "商城", "背包", "仓库", "拍卖行",
        "邮箱", "好友列表", "公会频道", "组队频道", "副本", "地图", "传送门", "复活点", "安全区",
        "野外", "主城", "竞技场", "排行榜", "成就", "日常", "周常", "活动", "签到", "抽奖",
        "充值", "VIP", "月卡",
    ];
    let trimmed = name.trim();
    if blacklist.iter().any(|b| trimmed.eq_ignore_ascii_case(b)) {
        return true;
    }
    let pure_class = [
        "剑士", "法师", "牧师", "刺客", "战士", "猎人", "骑士", "游侠", "狂战士", "召唤师",
        "谋士", "弓箭手", "术士", "圣骑士", "德鲁伊", "武僧", "死灵法师",
    ];
    if pure_class.contains(&trimmed) {
        return true;
    }
    // 带"导师/NPC"后缀的泛称
    let suffix = ["导师", "教官", "守卫", "商人", "老板", "掌柜", "店主"];
    if char_count <= 5 {
        for s in suffix.iter() {
            if trimmed.ends_with(s) {
                return true;
            }
        }
    }
    false
}

/// 对 AI 返回值做兼容性 parse：支持 `{roles:[]} / {data:[]} / {result:[]} / 数组`
fn parse_extracted_roles_payload(value: &Value) -> Vec<ExtractedRole> {
    let rows: &[Value] = if let Some(arr) = value.get("roles").and_then(|v| v.as_array()) {
        arr.as_slice()
    } else if let Some(arr) = value.get("characters").and_then(|v| v.as_array()) {
        arr.as_slice()
    } else if let Some(arr) = value.get("data").and_then(|v| v.as_array()) {
        arr.as_slice()
    } else if let Some(arr) = value.get("result").and_then(|v| v.as_array()) {
        arr.as_slice()
    } else if let Some(arr) = value.as_array() {
        arr.as_slice()
    } else {
        return Vec::new();
    };

    rows.iter()
        .filter_map(ExtractedRole::from_value)
        .filter(|r| !is_non_role_name(&r.name))
        .collect()
}

/// 同人合并：本名/别名/游戏 ID 任一重合即合并（如 苏柳青 ↔ 柳叶青青）
fn merge_extracted_roles(roles: Vec<ExtractedRole>) -> Vec<ExtractedRole> {
    let priority: HashMap<&str, u8> = HashMap::from([
        ("主角", 7),
        ("女主", 6),
        ("反派", 5),
        ("配角", 4),
        ("NPC", 3),
        ("龙套", 2),
        ("势力", 1),
    ]);

    let mut clusters: Vec<ExtractedRole> = Vec::new();
    let mut key_to_idx: HashMap<String, usize> = HashMap::new();

    for role in roles {
        if role.name.trim().is_empty() {
            continue;
        }
        let ids = role.identity_keys();
        let mut hit: Option<usize> = None;
        for k in &ids {
            if let Some(&idx) = key_to_idx.get(k) {
                hit = Some(idx);
                break;
            }
        }

        if let Some(idx) = hit {
            let existing = &mut clusters[idx];
            let p_existing = priority.get(existing.role_type.as_str()).copied().unwrap_or(0);
            let p_new = priority.get(role.role_type.as_str()).copied().unwrap_or(0);
            if p_new > p_existing {
                existing.role_type = role.role_type.clone();
            }
            let keep_new_name = primary_name_score(&role.name) > primary_name_score(&existing.name)
                || (primary_name_score(&role.name) == primary_name_score(&existing.name)
                    && p_new > p_existing);
            if keep_new_name {
                existing.aliases.push(existing.name.clone());
                existing.name = role.name.clone();
            } else {
                existing.aliases.push(role.name.clone());
            }
            existing.aliases =
                dedup_strings([existing.aliases.clone(), role.aliases.clone()].concat());
            let main = existing.name.clone();
            existing.aliases.retain(|a| a.trim() != main.trim());

            if role.description.len() > existing.description.len() {
                existing.description = role.description;
            }
            if !role.faction.is_empty() && role.faction != "无" {
                existing.faction = role.faction;
            }
            if !role.profession.is_empty() {
                existing.profession = role.profession;
            }
            existing.skills = filter_skill_list([existing.skills.clone(), role.skills].concat());
            existing.equipment =
                dedup_strings([existing.equipment.clone(), role.equipment].concat());
            existing.items = dedup_strings([existing.items.clone(), role.items].concat());
            if !role.recent_status.is_empty() {
                existing.recent_status = role.recent_status.clone();
            }
            existing.chapters = dedup_strings([existing.chapters.clone(), role.chapters].concat());
            if existing.first_appearance.is_empty() && !role.first_appearance.is_empty() {
                existing.first_appearance = role.first_appearance;
            }
            if let Some(new_details) = role.equipment_details {
                let combined = existing
                    .equipment_details
                    .clone()
                    .unwrap_or_default()
                    .into_iter()
                    .chain(new_details.into_iter())
                    .collect();
                existing.equipment_details = Some(combined);
            }
            if let Some(new_sd) = role.skill_details {
                let mut combined = existing.skill_details.clone().unwrap_or_default();
                for (k, v) in new_sd {
                    if is_valid_skill_name(&k) && !v.trim().is_empty() {
                        let prev = combined.get(&k).map(|s| s.len()).unwrap_or(0);
                        if v.len() >= prev {
                            combined.insert(k, v);
                        }
                    }
                }
                existing.skill_details = if combined.is_empty() {
                    None
                } else {
                    Some(combined)
                };
            }
            for k in existing.identity_keys() {
                key_to_idx.insert(k, idx);
            }
        } else {
            let idx = clusters.len();
            for k in role.identity_keys() {
                key_to_idx.insert(k, idx);
            }
            clusters.push(role);
        }
    }
    clusters
}

fn dedup_strings(input: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(input.len());
    for s in input {
        let trimmed = s.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            out.push(trimmed);
        }
    }
    out
}

fn build_system_prompt(novel_type: &str) -> String {
    let label = match novel_type {
        "urban" | "dushi" => "都市",
        "xuanhuan" => "玄幻",
        "virtual_mmo" | "youxi" => "游戏",
        "alternate_history" => "历史",
        "wenyu" => "文娱",
        "shuangwen" => "爽文",
        _ => "通用",
    };
    format!(
        r#"你是专业的小说人物分析助手，擅长{label}类型小说。
请从用户提供的章节文本中提取所有出现的人物，以 JSON 数组格式输出。

⚠️ 严格排除以下非角色内容（不要提取）：
- 系统提示、面板、界面元素（如"系统提示音"、"任务面板"、"新手引导"、"公告"）
- 职业名称本身（如"剑士"、"法师"，除非是具体角色的称呼）
- 物品、技能、地名（这些不是角色）
- 旁白、叙述者
- 只出现一次且没有任何描写的路人名字

✅ 只提取有以下特征的角色：
- 有具体名字（不是泛称）
- 有至少一句对话或一段描写
- 在剧情中有实际行动或互动

🎯 角色类型判断（roleType 必须填写）：
- 区分主角、女主、配角、反派和龙套
- NPC 是功能性角色（商人、导师等）
- 势力是组织/公会/门派

每个人物对象字段（JSON 格式）：
- name: string              // **真名优先**（现实姓名/常用真名）；游戏 ID 不要单独成卡
- aliases: string[]         // 别名、外号、游戏ID（如「雪夜山明」「柳叶青青」）全部放这里
- roleType: string          // 主角/女主/配角/反派/NPC/龙套/势力
- faction: string           // 所属阵营，文中未提及写"无"
- description: string       // 一句话描述，不超过80字
- firstAppearance: string   // 首次出场章节标题
- profession: string        // 职业或身份
- equipment: string[]       // 当前穿戴的装备（具体装备名）
- equipmentDetails: object  // 装备详情，key 是装备名，value 是效果/来源简述
- items: string[]           // 持有的重要道具
- skills: string[]          // **正式功法/技能名**（如「断空斩」「横扫千军」）
- skillDetails: object      // **技能效果**：key=技能名，value=1～2句效果摘要（伤害/控制/冷却/代价等，据正文归纳）
- recentStatus: string      // 角色近期状态快照；没有则写「无」

⚠️ 同人必须合并（极重要）：
- 同一人的真名、外号、游戏 ID **只输出一张卡**：name 用真名，其余全部放 aliases
- 例：洪游 + 雪夜山明 → name「洪游」，aliases 含「雪夜山明」
- 例：苏柳青 + 柳叶青青 → name「苏柳青」，aliases 含「柳叶青青」
- **禁止**把游戏 ID 再拆成第二张独立角色卡

⚠️ skills / skillDetails 规则：
- 只收录可独立命名的功法/技能/绝学
- 每个 skills 中的名字，尽量在 skillDetails 写效果（即使正文只提了一两句也要总结）
- **禁止**普攻动作：下劈、上挑、平砍、横扫、直刺、轻击、重击、翻滚、格挡、闪避、连击等
- 不要把「金手指/外挂系统/特殊体质」写进 skills

只输出 JSON 数组。"#
    )
}

fn strip_chapter_html(content: &str) -> String {
    use regex::Regex;
    // 先移除 <script>/<style> 内容，再剔离标签，最后折叠空白
    let script_style_re =
        Regex::new(r"(?is)<(script|style)\b[^>]*>.*?</\s*(script|style)\s*>").unwrap();
    let without_blocks = script_style_re.replace_all(content, " ");
    let tag_re = Regex::new(r"(?s)<[^>]*>").unwrap();
    let text = tag_re.replace_all(&without_blocks, " ");
    let decoded = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    decoded
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

/// 从已加载的 config 中取出 AI 配置（同 ai_chat 用的字段）
fn build_ai_config(app_config: &Value) -> Result<AiConfig, String> {
    let ai = app_config
        .get("ai")
        .ok_or_else(|| "config.ai 缺失".to_string())?;
    Ok(AiConfig {
        provider: ai
            .get("provider")
            .and_then(|v| v.as_str())
            .unwrap_or("openai")
            .to_string(),
        model: ai
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        api_key: ai
            .get("apiKey")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        base_url: ai
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        api_path: ai
            .get("apiPath")
            .and_then(|v| v.as_str())
            .unwrap_or("/v1/chat/completions")
            .to_string(),
        temperature: None,
        max_tokens: None,
        request_timeout_ms: app_config
            .get("network")
            .and_then(|n| n.get("requestTimeoutMs"))
            .and_then(|v| v.as_u64()),
        stream_event: None,
        stream_request_id: None,
    })
}

/// AI 提取角色入口
#[tauri::command]
pub async fn extract_roles(
    app: AppHandle,
    args: ExtractRolesArgs,
) -> Result<Value, String> {
    let book_id = args
        .book_id
        .as_deref()
        .ok_or_else(|| "缺少 bookId".to_string())?
        .to_string();
    let book = read_book(&app, &book_id)?;
    let chapters = book
        .get("chapters")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let total = chapters.len() as u64;
    if total == 0 {
        return Ok(json!({
            "success": false,
            "error": "书籍暂无章节",
            "extracted": [],
            "totalCandidates": 0,
            "scannedChapters": 0,
        }));
    }

    let start = args.start_chapter.unwrap_or(1).max(1).min(total);
    let end = args.end_chapter.unwrap_or(start).max(start).min(total);
    let novel_type = args.novel_type.unwrap_or_else(|| "dushi".to_string());

    // 构建 AI config
    let cfg_response = config_load(app.clone()).await?;
    let app_config = cfg_response.get("config").cloned().unwrap_or(Value::Null);
    let ai_config = build_ai_config(&app_config)?;

    let system_prompt = build_system_prompt(&novel_type);
    let mut all_extracted: Vec<ExtractedRole> = Vec::new();

    let slice_start = (start as usize) - 1;
    let slice_end = end as usize;
    let chapter_slice = &chapters[slice_start..slice_end];

    // 两章一批
    let mut i = 0;
    while i < chapter_slice.len() {
        let batch_end = (i + BATCH_SIZE).min(chapter_slice.len());
        let batch = &chapter_slice[i..batch_end];
        let batch_start_no = start + i as u64;

        let book_dir = crate::workspace::books_dir(&app).join(&book_id);
        let chapters_dir = book_dir.join("chapters");
        let mut combined = String::new();
        for (offset, ch) in batch.iter().enumerate() {
            let title = ch.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let chapter_id = ch.get("id").and_then(|v| v.as_str()).unwrap_or("");
            // 优先从 chapters/{id}.html 读取正文（book.json 里的 content 可能为空/过时）
            let raw_html = if !chapter_id.is_empty() {
                let html_path = chapters_dir.join(format!("{}.html", chapter_id));
                if html_path.exists() {
                    std::fs::read_to_string(&html_path).unwrap_or_default()
                } else {
                    ch.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string()
                }
            } else {
                ch.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string()
            };
            let plain = strip_chapter_html(&raw_html);
            let text: String = plain.chars().take(CHAPTER_MAX_CHARS).collect();
            combined.push_str(&format!("第{}章 {}\n{}\n\n", batch_start_no + offset as u64, title, text));
        }
        if combined.trim().is_empty() {
            crate::logger::warn(format!(
                "[extract_roles bookId={}] batch {}-{} empty content, skipped",
                book_id, batch_start_no, batch_start_no + batch.len() as u64 - 1
            ));
            i += BATCH_SIZE;
            continue;
        }

        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(system_prompt.clone()),
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: Some(format!(
                    "请分析以下第{}-{}章的内容，提取所有人物：\n\n{}",
                    batch_start_no,
                    batch_start_no + (batch.len() as u64) - 1,
                    combined
                )),
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let cancel = tokio_util::sync::CancellationToken::new();
        match manager::chat(&ai_config, &messages, &None, &None, cancel).await {
            Ok(response) => {
                let text = response.text.trim().to_string();
                let cleaned = text
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim()
                    .to_string();
                if let Ok(value) = serde_json::from_str::<Value>(&cleaned) {
                    all_extracted.extend(parse_extracted_roles_payload(&value));
                }
            }
            Err(e) => {
                crate::logger::error(format!(
                    "[extract_roles bookId={}] AI batch {}-{} failed: {}",
                    book_id, batch_start_no, batch_start_no + batch.len() as u64 - 1, e
                ));
            }
        }

        i += BATCH_SIZE;
    }

    let merged = merge_extracted_roles(all_extracted);
    let total_candidates = merged.len();
    let extracted_serialized: Vec<Value> = merged.iter().map(|r| r.to_serializable()).collect();

    Ok(json!({
        "success": true,
        "extracted": extracted_serialized,
        "totalCandidates": total_candidates,
        "scannedChapters": end - start + 1,
        "selectedRange": { "startChapter": start, "endChapter": end },
    }))
}

/// 把候选角色导入到 book.json（合并同名 / 落入对应分类）
#[tauri::command]
pub async fn import_extracted_roles(
    app: AppHandle,
    book_id: String,
    payload: Value,
) -> Result<Value, String> {
    // payload 可以是 {roles: [...]} / {extracted: [...]} / 数组
    let extracted_list: Vec<ExtractedRole> = parse_extracted_roles_payload(&payload);
    let mut book = read_book(&app, &book_id)?;
    let mut new_categories_value: Vec<Value>;
    {
        let categories = ensure_categories(&mut book)?;

        for candidate in &extracted_list {
            // 同人合并：本名或任一别名命中已有卡（含游戏 ID）
            let cand_ids: HashSet<String> = candidate.identity_keys().into_iter().collect();
            let mut found_location: Option<(usize, usize)> = None;
            for (ci, cat) in categories.iter().enumerate() {
                if let Some(children) = cat.get("children").and_then(|v| v.as_array()) {
                    for (ri, child) in children.iter().enumerate() {
                        if role_json_matches_identities(child, &cand_ids) {
                            found_location = Some((ci, ri));
                            break;
                        }
                    }
                }
                if found_location.is_some() {
                    break;
                }
            }

            if let Some((ci, ri)) = found_location {
                let should_move = {
                    let cat = &categories[ci];
                    let target_id = default_category_id_for_role_type(&candidate.role_type);
                    let target_name = default_category_name_for_role_type(&candidate.role_type);
                    cat.get("id").and_then(|v| v.as_str()) != Some(target_id)
                        && cat.get("name").and_then(|v| v.as_str()) != Some(target_name)
                };
                if let Some(children) =
                    categories[ci].get_mut("children").and_then(|v| v.as_array_mut())
                {
                    merge_into_existing(&mut children[ri], candidate);
                    let moved_role = if should_move { Some(children.remove(ri)) } else { None };
                    if let Some(role) = moved_role {
                        insert_role_into_default_category(categories, role, &candidate.role_type);
                    }
                }
            } else {
                let new_role = build_role_payload(candidate);
                insert_role_into_default_category(categories, new_role, &candidate.role_type);
            }
        }

        // 入库后再扫一遍：把已有双卡（真名卡 + 游戏ID卡）合并成一张
        consolidate_duplicate_roles(categories);

        new_categories_value = categories.clone();
    }

    write_book(&app, &book_id, &book)?;
    Ok(json!({
        "success": true,
        "categories": std::mem::take(&mut new_categories_value),
    }))
}

/// 扫描已有角色，按 name/aliases 身份键合并重复卡（如 苏柳青 + 柳叶青青）
fn consolidate_duplicate_roles(categories: &mut [Value]) {
    // 收集 (cat_idx, role_idx) 与身份键
    let mut locations: Vec<(usize, usize)> = Vec::new();
    for (ci, cat) in categories.iter().enumerate() {
        if let Some(children) = cat.get("children").and_then(|v| v.as_array()) {
            for (ri, _) in children.iter().enumerate() {
                locations.push((ci, ri));
            }
        }
    }

    // 从后往前合并，避免索引错位：发现同人则 merge 到较早的那张，删掉后者
    // 先建 key → 首次出现位置
    let mut key_to_first: HashMap<String, (usize, usize)> = HashMap::new();
    let mut to_remove: Vec<(usize, usize)> = Vec::new(); // (ci, ri) 待删

    for &(ci, ri) in &locations {
        let child = match categories
            .get(ci)
            .and_then(|c| c.get("children"))
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.get(ri))
        {
            Some(c) => c.clone(),
            None => continue,
        };
        let mut ids = role_json_identity_keys(&child);
        if ids.is_empty() {
            continue;
        }
        let mut hit: Option<(usize, usize)> = None;
        for k in &ids {
            if let Some(&loc) = key_to_first.get(k) {
                if loc != (ci, ri) {
                    hit = Some(loc);
                    break;
                }
            }
        }
        if let Some((tci, tri)) = hit {
            // 把当前卡 merge 进首次出现的卡
            if let Some(target) = categories
                .get_mut(tci)
                .and_then(|c| c.get_mut("children"))
                .and_then(|v| v.as_array_mut())
                .and_then(|arr| arr.get_mut(tri))
            {
                merge_role_json_into(target, &child);
            }
            to_remove.push((ci, ri));
            // 刷新 key 映射到 target
            if let Some(target) = categories
                .get(tci)
                .and_then(|c| c.get("children"))
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.get(tri))
            {
                for k in role_json_identity_keys(target) {
                    key_to_first.insert(k, (tci, tri));
                }
            }
        } else {
            for k in ids.drain(..) {
                key_to_first.entry(k).or_insert((ci, ri));
            }
        }
    }

    // 按分类分组，同分类内从大索引往前删，避免错位
    let mut by_cat: HashMap<usize, Vec<usize>> = HashMap::new();
    for (ci, ri) in to_remove {
        by_cat.entry(ci).or_default().push(ri);
    }
    for (ci, mut ris) in by_cat {
        ris.sort_unstable_by(|a, b| b.cmp(a));
        ris.dedup();
        if let Some(children) = categories
            .get_mut(ci)
            .and_then(|c| c.get_mut("children"))
            .and_then(|v| v.as_array_mut())
        {
            for ri in ris {
                if ri < children.len() {
                    children.remove(ri);
                }
            }
        }
    }
}

fn role_json_identity_keys(child: &Value) -> Vec<String> {
    let mut keys = Vec::new();
    let push = |keys: &mut Vec<String>, s: &str| {
        let t = s.trim().to_lowercase();
        if t.chars().count() >= 2 && !keys.contains(&t) {
            keys.push(t);
        }
    };
    if let Some(n) = child.get("name").and_then(|v| v.as_str()) {
        push(&mut keys, n);
    }
    if let Some(arr) = child.get("aliases").and_then(|v| v.as_array()) {
        for a in arr {
            if let Some(s) = a.as_str() {
                push(&mut keys, s);
            }
        }
    }
    keys
}

/// 把 donor 角色 JSON 合并进 target（同人双卡消重）
fn merge_role_json_into(target: &mut Value, donor: &Value) {
    let donor_as_extracted = ExtractedRole::from_value(donor);
    if let Some(cand) = donor_as_extracted.as_ref() {
        merge_into_existing(target, cand);
    }
    // 额外：合并 aliases（含 donor 本名）
    let obj = match target.as_object_mut() {
        Some(o) => o,
        None => return,
    };
    let mut aliases = vec_strings(obj, "aliases");
    if let Some(dn) = donor.get("name").and_then(|v| v.as_str()) {
        aliases.push(dn.to_string());
    }
    if let Some(arr) = donor.get("aliases").and_then(|v| v.as_array()) {
        for a in arr {
            if let Some(s) = a.as_str() {
                aliases.push(s.to_string());
            }
        }
    }
    // 真名优先
    let prev_name = obj
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let donor_name = donor
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !donor_name.is_empty()
        && primary_name_score(&donor_name) > primary_name_score(&prev_name)
    {
        aliases.push(prev_name);
        obj.insert("name".to_string(), Value::String(donor_name.clone()));
        let main = donor_name;
        aliases.retain(|a| a.trim() != main.trim());
    } else {
        let main = prev_name;
        aliases.retain(|a| a.trim() != main.trim());
    }
    obj.insert(
        "aliases".to_string(),
        Value::Array(
            dedup_strings(aliases)
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );
}

fn build_role_payload(candidate: &ExtractedRole) -> Value {
    let new_id = uuid::Uuid::new_v4().to_string();
    let mut aliases = candidate.aliases.clone();
    if !aliases.iter().any(|a| a == &candidate.name) {
        aliases.insert(0, candidate.name.clone());
    }
    let aliases = dedup_strings(aliases);
    // 技能：过滤普攻后写入 abilities + customFields.skills + skillDetails（悬浮卡）
    let skills = filter_skill_list(candidate.skills.clone());
    let equipment = dedup_strings(candidate.equipment.clone());
    let items = dedup_strings(candidate.items.clone());
    let equipment_details_json = candidate
        .equipment_details
        .as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|| "{}".to_string());
    let mut skill_details_clean: HashMap<String, String> = HashMap::new();
    if let Some(sd) = candidate.skill_details.as_ref() {
        for (k, v) in sd {
            if is_valid_skill_name(k) && !v.trim().is_empty() {
                skill_details_clean.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    // 详情里有、列表没有的技能名并入 skills
    let mut skills = skills;
    for k in skill_details_clean.keys() {
        if !skills.iter().any(|s| s == k) {
            skills.push(k.clone());
        }
    }
    let skills = filter_skill_list(skills);
    let skill_details_json =
        serde_json::to_string(&skill_details_clean).unwrap_or_else(|_| "{}".to_string());

    let custom_fields = json!({
        "category": default_category_name_for_role_type(&candidate.role_type),
        "skills": skills.join("、"),
        "skillDetails": skill_details_json,
        "equipment": equipment.join("、"),
        "equipmentDetails": equipment_details_json,
        "items": items.join("、"),
        "profession": candidate.profession.clone(),
        "recentStatus": candidate.recent_status.clone(),
    });

    json!({
        "id": new_id,
        "name": candidate.name,
        "aliases": aliases,
        "roleType": candidate.role_type,
        "faction": candidate.faction,
        "description": candidate.description,
        "firstAppearance": candidate.first_appearance,
        "chapters": candidate.chapters,
        "abilities": skills.iter().cloned().map(Value::String).collect::<Vec<_>>(),
        "equipment": equipment.iter().cloned().map(Value::String).collect::<Vec<_>>(),
        "inventory": items.iter().cloned().map(Value::String).collect::<Vec<_>>(),
        "relationshipTimeline": [],
        "customFields": custom_fields,
        "extractedAt": chrono::Utc::now().to_rfc3339(),
    })
}

fn merge_into_existing(existing: &mut Value, candidate: &ExtractedRole) {
    let obj = match existing.as_object_mut() {
        Some(o) => o,
        None => return,
    };

    // aliases
    let mut prev_aliases: Vec<String> = obj
        .get("aliases")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    prev_aliases.extend(candidate.aliases.clone());
    prev_aliases.push(candidate.name.clone());
    obj.insert(
        "aliases".to_string(),
        Value::Array(
            dedup_strings(prev_aliases)
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );

    // equipment / inventory / chapters — 先读后写，避免与 customFields 交叉借用
    let mut prev_eq = vec_strings(obj, "equipment");
    prev_eq.extend(candidate.equipment.clone());
    let next_eq = dedup_strings(prev_eq);
    obj.insert(
        "equipment".to_string(),
        Value::Array(next_eq.iter().cloned().map(Value::String).collect()),
    );

    let mut prev_inv = vec_strings(obj, "inventory");
    prev_inv.extend(candidate.items.clone());
    let next_inv = dedup_strings(prev_inv);
    obj.insert(
        "inventory".to_string(),
        Value::Array(next_inv.iter().cloned().map(Value::String).collect()),
    );

    let mut prev_ch = vec_strings(obj, "chapters");
    prev_ch.extend(candidate.chapters.clone());
    obj.insert(
        "chapters".to_string(),
        Value::Array(
            dedup_strings(prev_ch)
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );

    let prev_first = obj
        .get("firstAppearance")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if prev_first.is_empty() && !candidate.first_appearance.trim().is_empty() {
        obj.insert(
            "firstAppearance".to_string(),
            Value::String(candidate.first_appearance.clone()),
        );
    }

    let prev_desc = obj
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if candidate.description.len() > 10 && candidate.description.len() > prev_desc.len() {
        obj.insert(
            "description".to_string(),
            Value::String(candidate.description.clone()),
        );
    }
    if !candidate.faction.is_empty() && candidate.faction != "无" {
        obj.insert(
            "faction".to_string(),
            Value::String(candidate.faction.clone()),
        );
    }
    obj.insert(
        "roleType".to_string(),
        Value::String(candidate.role_type.clone()),
    );

    // 技能：合并 skills + skillDetails（悬浮卡）；不删旧项。必须在 customFields mut 之前读 abilities
    let prev_abilities = vec_strings(obj, "abilities");
    let prev_abilities_empty = prev_abilities.is_empty();
    let mut skills_to_write: Option<Vec<String>> = None;
    let target_category = default_category_name_for_role_type(&candidate.role_type);

    {
        let cf = obj
            .entry("customFields")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(map) = cf.as_object_mut() {
            map.insert(
                "category".to_string(),
                Value::String(target_category.to_string()),
            );
            if !candidate.profession.is_empty() {
                let prev_prof = map
                    .get("profession")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if prev_prof.is_empty() || candidate.profession.len() > prev_prof.len() {
                    map.insert(
                        "profession".to_string(),
                        Value::String(candidate.profession.clone()),
                    );
                }
            }
            map.insert("equipment".to_string(), Value::String(next_eq.join("、")));
            map.insert("items".to_string(), Value::String(next_inv.join("、")));

            if let Some(new_details) = candidate.equipment_details.as_ref() {
                let mut merged_details: HashMap<String, String> = map
                    .get("equipmentDetails")
                    .and_then(|v| v.as_str())
                    .and_then(|s| serde_json::from_str::<HashMap<String, String>>(s).ok())
                    .unwrap_or_default();
                for (k, v) in new_details {
                    if !v.trim().is_empty() {
                        merged_details.insert(k.clone(), v.clone());
                    }
                }
                if let Ok(s) = serde_json::to_string(&merged_details) {
                    map.insert("equipmentDetails".to_string(), Value::String(s));
                }
            }

            if !candidate.recent_status.is_empty() {
                map.insert(
                    "recentStatus".to_string(),
                    Value::String(candidate.recent_status.clone()),
                );
            }

            let prev_skills_cf = map
                .get("skills")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let mut merged_skill_names = parse_list_like(&prev_skills_cf, &prev_abilities);
            let incoming = filter_skill_list(candidate.skills.clone());
            // 把 skillDetails 里的新技能名也并入列表
            let mut incoming = incoming;
            if let Some(sd) = candidate.skill_details.as_ref() {
                for k in sd.keys() {
                    if is_valid_skill_name(k) && !incoming.iter().any(|s| s == k) {
                        incoming.push(k.trim().to_string());
                    }
                }
            }
            if prev_skills_cf.is_empty() && prev_abilities_empty {
                if !incoming.is_empty() {
                    map.insert("skills".to_string(), Value::String(incoming.join("、")));
                    skills_to_write = Some(incoming);
                }
            } else if !incoming.is_empty() {
                for s in &incoming {
                    if !merged_skill_names.iter().any(|x| x == s) {
                        merged_skill_names.push(s.clone());
                    }
                }
                map.insert(
                    "skills".to_string(),
                    Value::String(merged_skill_names.join("、")),
                );
                skills_to_write = Some(merged_skill_names.clone());
            }

            // skillDetails 合并（更长说明优先）— 角色卡悬浮提示依赖
            if let Some(new_sd) = candidate.skill_details.as_ref() {
                let mut merged_sd: HashMap<String, String> = map
                    .get("skillDetails")
                    .and_then(|v| v.as_str())
                    .and_then(|s| serde_json::from_str::<HashMap<String, String>>(s).ok())
                    .unwrap_or_default();
                for (k, v) in new_sd {
                    if !is_valid_skill_name(k) || v.trim().is_empty() {
                        continue;
                    }
                    let prev_len = merged_sd.get(k).map(|s| s.len()).unwrap_or(0);
                    if v.len() >= prev_len {
                        merged_sd.insert(k.clone(), v.trim().to_string());
                    }
                }
                if let Ok(s) = serde_json::to_string(&merged_sd) {
                    map.insert("skillDetails".to_string(), Value::String(s));
                }
            }
        }
    }

    if let Some(skills) = skills_to_write {
        obj.insert(
            "abilities".to_string(),
            Value::Array(skills.into_iter().map(Value::String).collect()),
        );
    }

    // 真名优先：若 candidate 更像真名、现有 name 更像游戏 ID，则对调
    {
        let prev_name = obj
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !prev_name.is_empty()
            && primary_name_score(&candidate.name) > primary_name_score(&prev_name)
        {
            obj.insert("name".to_string(), Value::String(candidate.name.clone()));
            let mut prev_aliases = vec_strings(obj, "aliases");
            prev_aliases.push(prev_name);
            prev_aliases.extend(candidate.aliases.clone());
            let main = candidate.name.clone();
            prev_aliases.retain(|a| a.trim() != main.trim());
            obj.insert(
                "aliases".to_string(),
                Value::Array(
                    dedup_strings(prev_aliases)
                        .into_iter()
                        .map(Value::String)
                        .collect(),
                ),
            );
        }
    }

    obj.insert(
        "extractedAt".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );
}

fn parse_list_like(skills_cf: &str, abilities: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for part in skills_cf.split(['、', '，', ',', '\n']) {
        let t = part.trim();
        if !t.is_empty() {
            out.push(t.to_string());
        }
    }
    for a in abilities {
        if !out.iter().any(|x| x == a) {
            out.push(a.clone());
        }
    }
    filter_skill_list(out)
}

/// 已有角色 JSON 是否与候选身份键重合（名或别名）
fn role_json_matches_identities(child: &Value, cand_ids: &HashSet<String>) -> bool {
    let mut ids = Vec::new();
    if let Some(n) = child.get("name").and_then(|v| v.as_str()) {
        ids.push(n.trim().to_lowercase());
    }
    if let Some(arr) = child.get("aliases").and_then(|v| v.as_array()) {
        for a in arr {
            if let Some(s) = a.as_str() {
                ids.push(s.trim().to_lowercase());
            }
        }
    }
    ids.into_iter()
        .filter(|s| s.chars().count() >= 2)
        .any(|s| cand_ids.contains(&s))
}

fn vec_strings(obj: &serde_json::Map<String, Value>, key: &str) -> Vec<String> {
    obj.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}
