// PlotSummary — 折叠区的剧情速览
//
// 设计约束（design.md §6.1，requirements.md R2.1～R2.6 / R3.3）：
// - 收起态：标题 + 单行 oneLineSummary（超长省略） + 展开按钮
// - 收起态总高度不超过 60px（≤ 同级 TechniqueCard 的 50%）
// - 展开态：完整 oneLineSummary + keyEvents 列表 + linkBefore + linkAfter
// - 任一字段为空字符串 → 该段不渲染
// - keyEvents 空数组 → 不显示"关键事件"标题

import { useState } from 'react';
import type { PlotSummaryData } from '../types/technique';

interface Props {
 data: PlotSummaryData;
 defaultCollapsed?: boolean;
}

export default function PlotSummary({ data, defaultCollapsed = true }: Props) {
 const [collapsed, setCollapsed] = useState(defaultCollapsed);
 const { oneLineSummary, keyEvents, linkBefore, linkAfter } = data;

 // 完全没有内容时整体不渲染（避免空白容器占位）
 const hasAnyContent =
 oneLineSummary.trim().length > 0 ||
 keyEvents.length > 0 ||
 linkBefore.trim().length > 0 ||
 linkAfter.trim().length > 0;
 if (!hasAnyContent) return null;

 if (collapsed) {
 return (
 <div className="nl-plot-summary nl-plot-summary-collapsed">
 <button
 type="button"
 className="nl-plot-toggle"
 onClick={() => setCollapsed(false)}
 aria-expanded={false}
 >
 <span className="nl-plot-toggle-label">剧情速览</span>
 <span className="nl-plot-toggle-summary">
 {oneLineSummary || '展开查看'}
 </span>
 <span className="nl-plot-toggle-chevron">▾</span>
 </button>
 </div>
 );
 }

 return (
 <div className="nl-plot-summary nl-plot-summary-expanded">
 <button
 type="button"
 className="nl-plot-toggle"
 onClick={() => setCollapsed(true)}
 aria-expanded={true}
 >
 <span className="nl-plot-toggle-label">剧情速览</span>
 <span className="nl-plot-toggle-chevron nl-plot-toggle-chevron-up">▴</span>
 </button>

 {oneLineSummary.trim().length > 0 ? (
 <p className="nl-plot-one-line">{oneLineSummary}</p>
 ) : null}

 {keyEvents.length > 0 ? (
 <div className="nl-plot-key-events">
 <div className="nl-plot-section-label">关键事件</div>
 <ul className="nl-plot-event-list">
 {keyEvents.map((evt, i) => (
 <li key={i}>{evt}</li>
 ))}
 </ul>
 </div>
 ) : null}

 {linkBefore.trim().length > 0 ? (
 <div className="nl-plot-link nl-plot-link-before">
 <span className="nl-plot-link-prefix">承接上章：</span>
 <span>{linkBefore}</span>
 </div>
 ) : null}

 {linkAfter.trim().length > 0 ? (
 <div className="nl-plot-link nl-plot-link-after">
 <span className="nl-plot-link-prefix">下章悬念：</span>
 <span>{linkAfter}</span>
 </div>
 ) : null}
 </div>
 );
}
