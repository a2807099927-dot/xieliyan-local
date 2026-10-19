// LegacyChapterCard — 旧六宫格存档兼容卡
//
// 设计约束（design.md §7.1，requirements.md R6.1 / R6.2 / R6.4，CP-8）：
// - 主体显示"未标注，需要重新分析此章"占位（与 TechniqueCard 视觉量级一致）
// - 提供"重新分析"按钮（行为由父组件传 onReanalyze 回调实现）
// - 折叠区显示原六宫格 rawSections，让用户在升级前仍能看到旧数据
// - 永远不会触发 parseError（不调用 schema validator）

import { useState } from 'react';
import type { LegacyChapterCard as LegacyChapterCardData } from '../types/technique';

interface Props {
 data: LegacyChapterCardData;
 onReanalyze?: (chapterIndex: number) => void;
 reanalyzing?: boolean;
}

export default function LegacyChapterCard({
 data,
 onReanalyze,
 reanalyzing = false,
}: Props) {
 const [showLegacyDetail, setShowLegacyDetail] = useState(false);

 return (
 <div className="nl-tcard nl-tcard-legacy">
 <header className="nl-tcard-header">
 <span className="nl-tcard-chapter-index">第 {data.chapterIndex} 章</span>
 <h3 className="nl-tcard-title">{data.chapterTitle}</h3>
 </header>

 <div className="nl-tcard-legacy-placeholder">
 <p className="nl-tcard-legacy-tip">
 此章为旧版六宫格存档，未标注章法分析。
 <br />
 点击下方按钮可让 AI 重新拆解为新版章法卡。
 </p>
 <button
 type="button"
 className="nl-tcard-legacy-btn"
 onClick={() => onReanalyze?.(data.chapterIndex)}
 disabled={reanalyzing || !onReanalyze}
 >
 {reanalyzing ? '正在重新分析…' : '重新分析此章'}
 </button>
 </div>

 {data.rawSections.length > 0 ? (
 <div className="nl-tcard-legacy-detail">
 <button
 type="button"
 className="nl-tcard-legacy-detail-toggle"
 onClick={() => setShowLegacyDetail((prev) => !prev)}
 aria-expanded={showLegacyDetail}
 >
 <span>{showLegacyDetail ? '收起旧版六宫格' : '查看旧版六宫格'}</span>
 <span className="nl-plot-toggle-chevron">
 {showLegacyDetail ? '▴' : '▾'}
 </span>
 </button>

 {showLegacyDetail ? (
 <div className="nl-card-grid nl-tcard-legacy-grid">
 {data.rawSections.map((section) => (
 <section
 key={section.key}
 className={`nl-card-section nl-section-${section.tone}`}
 >
 <div className="nl-section-label">{section.label}</div>
 <ul className="nl-section-list">
 {section.points.map((point, i) => (
 <li key={`${section.key}-${i}`}>{point}</li>
 ))}
 </ul>
 </section>
 ))}
 </div>
 ) : null}
 </div>
 ) : null}
 </div>
 );
}
