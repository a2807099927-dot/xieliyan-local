// TagBadge — 章法标签徽章
//
// 设计约束（design.md §5.3，requirements.md R3.4 / R5.6）：
// - primary 变体：背景为标签主色，白字，胶囊样式 — 决定曲线节点颜色
// - secondary 变体：同色 0.15 透明度背景 + 1px 边框 + 小一号字体
// - UNLABELED_TAG → 灰色 + 中文"未标注"
// - 全部色值都从 TAG_META 取，不引入色域外的值（CP-9）

import { TAG_META, UNLABELED_TAG_META } from '../types/technique-meta';
import {
 UNLABELED_TAG,
 type TechniqueTag,
 type UnlabeledTag,
} from '../types/technique';

interface Props {
 tag: TechniqueTag | UnlabeledTag;
 variant?: 'primary' | 'secondary';
 /** 是否显示左侧小色块（仅 secondary 变体可选） */
 showDot?: boolean;
}

/**
 * 把 hex 色值（#rrggbb）转成带 alpha 的 rgba 字符串。
 * 仅供 secondary 变体的低透明度背景使用。
 */
function hexWithAlpha(hex: string, alpha: number): string {
 const m = /^#([0-9a-f]{6})$/i.exec(hex);
 if (!m) return hex;
 const v = parseInt(m[1], 16);
 const r = (v >> 16) & 0xff;
 const g = (v >> 8) & 0xff;
 const b = v & 0xff;
 return `rgba(${r},${g},${b},${alpha})`;
}

export default function TagBadge({ tag, variant = 'primary', showDot = false }: Props) {
 const meta = tag === UNLABELED_TAG ? UNLABELED_TAG_META : TAG_META[tag];
 const baseClass = `nl-tag-badge nl-tag-badge-${variant} nl-tag-badge-tone-${meta.tone}`;

 if (variant === 'primary') {
 const style = {
 background: meta.color,
 color: '#ffffff',
 };
 return (
 <span className={baseClass} style={style}>
 {meta.zh}
 </span>
 );
 }

 // secondary
 const style = {
 background: hexWithAlpha(meta.color, 0.15),
 color: meta.color,
 borderColor: hexWithAlpha(meta.color, 0.45),
 };
 return (
 <span className={baseClass} style={style}>
 {showDot ? <span className="nl-tag-badge-dot" style={{ background: meta.color }} /> : null}
 {meta.zh}
 </span>
 );
}
