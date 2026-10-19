// 模块说明：Agent 系统常量集中点。
// 关键职责：维护提示词标记、消息角色、默认参数等魔法值。
import type { AgentGenreId, CraftPatternType } from './types';

// 规范题材 id 全集（与 genre-packs/ 及后端 list_genre_packs 对齐，7 套彼此独立）。
export const CANONICAL_GENRES: AgentGenreId[] = [
 'shuangwen',
 'urban',
 'xuanhuan',
 'wenyi',
 'youxi',
 'lishi',
 'lishishuangwen'
];

// 题材别名归一化表（T9 强化：解除强制归并，7 套题材各自独立；无独立数据包的近义题材就近归入最接近的一套）。
export const GENRE_ALIASES: Record<string, AgentGenreId> = {
 // 无脑爽文
 shuangwen: 'shuangwen',
 wunao: 'shuangwen',
 wunaoshuangwen: 'shuangwen',
 // 玄幻 / 奇幻 / 武侠 / 仙侠 —— 统一归入玄幻包
 xuanhuan: 'xuanhuan',
 fantasy: 'xuanhuan',
 qihuan: 'xuanhuan',
 wuxia: 'xuanhuan',
 xianxia: 'xuanhuan',
 // 都市 / 现实 / 体育 / 科幻 / 悬疑 / 诸天 / 轻小说 —— 现代向题材归入都市包
 dushi: 'urban',
 urban: 'urban',
 city: 'urban',
 xianshi: 'urban',
 tiyu: 'urban',
 kehuan: 'urban',
 zhutian: 'urban',
 xuanyi: 'urban',
 qingxiaoshuo: 'urban',
 // 历史（正剧）
 lishi: 'lishi',
 history: 'lishi',
 alternate_history: 'lishi',
 alternatehistory: 'lishi',
 // 历史爽文（独立成包）
 lishishuangwen: 'lishishuangwen',
 // 游戏 / 电竞
 youxi: 'youxi',
 game: 'youxi',
 virtualmmo: 'youxi',
 virtual_mmo: 'youxi',
 // 文娱（娱乐圈 / 影视）
 wenyi: 'wenyi'
};

export const PATTERN_TYPE_ALIASES: Record<string, CraftPatternType> = {
 dialogue: 'dialogue',
 structure: 'structure',
 psychology: 'psychology',
 rhythm: 'rhythm',
 description: 'description',
 info_density: 'info_density'
};

export const CAPABILITY_KEYWORDS: Array<{ capability: string; keywords: string[] }> = [
 { capability: 'dialogue_opener', keywords: ['对话开场', '开场句', '开口', '试探'] },
 { capability: 'conflict_cooldown', keywords: ['降温', '收场', '收口'] },
 { capability: 'ending_hook', keywords: ['收尾', '钩子', '章尾', '悬念'] },
 { capability: 'inner_monologue', keywords: ['心理', '独白', '内心', '吐槽'] },
 { capability: 'rhythm_control', keywords: ['节奏', '快', '慢', '张力'] },
 { capability: 'strategic_dialogue', keywords: ['权谋', '试探', '朝堂', '博弈', '策略'] },
 { capability: 'humiliation_reversal', keywords: ['羞辱', '反击', '打脸', '立威', '翻盘'] },
 { capability: 'description_focus', keywords: ['描写', '外貌', '环境', '氛围'] },
 { capability: 'info_density', keywords: ['信息', '设定', '情报', '伏笔'] },
 { capability: 'comedic_tucao', keywords: ['吐槽', '反差', '搞笑', '嘴硬'] },
 { capability: 'game_feedback', keywords: ['系统', '奖励', '战斗', '任务', '副本'] }
];

export const PRIMARY_PATTERN_LIMIT = 4;
export const BORROWED_PATTERN_LIMIT = 2;
