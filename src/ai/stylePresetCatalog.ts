// 渲染进程使用的内置文风预设清单（仅元数据，不含完整 prompt 内容）
// ─────────────────────────────────────────────────────────────────────────
// 主进程已通过 electron/prompts/genres/* 持有完整 prompt。
// 渲染进程只需要 id 和 label 来渲染选择器，不下发 prompt 文本到 renderer，
// 避免明文 prompt 进入渲染包体积，也保持 prompt 单源真值在主进程。

export interface StylePresetMeta {
 id: string;
 label: string;
}

/**
 * 与 electron/prompts/genres/index.ts 的 BUILTIN_STYLE_PRESETS 顺序保持一致。
 * 维护时两边一起改。
 */
export const BUILTIN_STYLE_PRESET_META: StylePresetMeta[] = [
 { id: 'shuangwen', label: '无脑爽文' },
 { id: 'dushi', label: '都市' },
 { id: 'wenyi', label: '文娱' },
 { id: 'youxi', label: '游戏' },
 { id: 'xuanhuan', label: '玄幻' },
 { id: 'qihuan', label: '奇幻' },
 { id: 'wuxia', label: '武侠' },
 { id: 'xianxia', label: '仙侠' },
 { id: 'xianshi', label: '现实' },
 { id: 'lishi', label: '历史' },
 { id: 'tiyu', label: '体育' }
];

/** 文风预设值。空 = 关闭，'custom' = 用户自定义，其它 = 内置 ID */
export type StylePresetValue = '' | 'custom' | string;
