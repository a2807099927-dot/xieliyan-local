// 章法标签 / 枚举的展示元数据：中文文案 + 配色 + tone 标识
//
// 对应 design.md §Components and Interfaces · Tag / Enum Display Mapping
// 设计约束（CP-9 配色封闭性）：
// 所有色值必须取自 NovelLab 现有调色板（参见 NovelLab.module.css）：
// #38bdf8 / #7dd3fc / #8b5cf6 / #a78bfa / #f59e0b / #fbbf24 /
// #ef4444 / #f87171 / #10b981 / #34d399 / #ec4899 / #f9a8d4 /
// #06b6d4 / #22d3ee / #7c3aed / #dc2626 / #94a3b8 / #64748b
//
// 不得引入上述色域之外的任意 RGB / HSL 值，确保与 nl-section-*
// 的边框色保持视觉协调。

import type { TechniqueTag, ConflictSource, ClimaxPosition } from './technique';

interface TagMetaEntry {
 /** 中文显示文本 */
 zh: string;
 /** 主标签徽章背景色（同时用于副标签的低透明度边框） */
 color: string;
 /** CSS class 后缀（与 nl-section-* tone 命名风格保持一致） */
 tone: string;
}

// ─── 12 个章法标签 → 中文 + 配色 ───────────────────────────
// 配色思路：
// 蓝色系（hook / dialogue）→ 制造期待 / 信息传递
// 紫色系（building / newseed） → 蓄势 / 铺垫的能量积蓄
// 青色系（reveal）→ 信息释放
// 橙色系（levelup）→ 升级
// 粉/红色系（twist / facehit / climax / payoff）→ 爽感释放
// 绿色系（payoff）→ 兑现感
// 灰色系（foundation / transition）→ 中性 / 衔接
export const TAG_META: Record<TechniqueTag, TagMetaEntry> = {
 foundation: { zh: '铺垫', color: '#94a3b8', tone: 'foundation' },
 hook: { zh: '钩子', color: '#38bdf8', tone: 'hook' },
 building: { zh: '蓄势', color: '#7c3aed', tone: 'building' },
 reveal: { zh: '释放信息', color: '#06b6d4', tone: 'reveal' },
 levelup: { zh: '升级', color: '#f59e0b', tone: 'levelup' },
 twist: { zh: '反转', color: '#a78bfa', tone: 'twist' },
 facehit: { zh: '打脸', color: '#ef4444', tone: 'facehit' },
 climax: { zh: '高潮', color: '#dc2626', tone: 'climax' },
 transition: { zh: '承接', color: '#64748b', tone: 'transition' },
 newseed: { zh: '新的铺垫', color: '#8b5cf6', tone: 'newseed' },
 payoff: { zh: '收束兑现', color: '#10b981', tone: 'payoff' },
 dialogue: { zh: '对话博弈', color: '#22d3ee', tone: 'dialogue' },
};

/** 词典外标签（UNLABELED_TAG）的展示元数据 */
export const UNLABELED_TAG_META: TagMetaEntry = {
 zh: '未标注',
 color: '#64748b',
 tone: 'unlabeled',
};

// ─── 9 个冲突来源 → 中文 ────────────────────────────────
export const CONFLICT_SOURCE_ZH: Record<ConflictSource, string> = {
 external_enemy: '外部敌人',
 rule_pressure: '规则压力',
 resource_competition: '资源竞争',
 misunderstanding: '误解质疑',
 time_limit: '时间限制',
 power_gap: '实力差距',
 identity_constraint: '身份约束',
 inner_choice: '内心抉择',
 relationship: '情感亏欠',
};

// ─── 5 个高潮位置 → 中文 ────────────────────────────────
export const CLIMAX_POSITION_ZH: Record<ClimaxPosition, string> = {
 front: '前置高潮',
 middle: '中置高潮',
 back: '后置高潮',
 multi: '多段小高潮',
 none: '无明显高潮',
};

// ─── 钩子分配三段位置的中文文案 ─────────────────────────
export const HOOK_POSITION_ZH = {
 opening: '开头钩子',
 middle: '中段钩子',
 ending: '结尾钩子',
} as const;
