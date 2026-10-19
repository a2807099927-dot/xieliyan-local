// ChapterCard — 章节卡顶层容器
//
// 设计约束（design.md §5.1，requirements.md R3.1 / R3.2）：
// - 接收 ChapterCardData 联合类型
// - data.legacy === true → 渲染 LegacyChapterCard
// - 否则渲染 TechniqueCard + PlotSummary（章法卡视觉权重 ≥ 60%，剧情速览 ≤ 50%）
// - 整张卡顶层 .nl-card 容器与 NovelLab 现有视觉一致

import {
 isLegacyChapterCard,
 type ChapterCardData,
} from '../types/technique';
import TechniqueCard from './TechniqueCard';
import PlotSummary from './PlotSummary';
import LegacyChapterCard from './LegacyChapterCard';

interface Props {
 data: ChapterCardData;
 onReanalyze?: (chapterIndex: number) => void;
 reanalyzing?: boolean;
}

export default function ChapterCard({ data, onReanalyze, reanalyzing }: Props) {
 if (isLegacyChapterCard(data)) {
 return (
 <div className="nl-card nl-card-chapter nl-card-chapter-legacy">
 <LegacyChapterCard
 data={data}
 onReanalyze={onReanalyze}
 reanalyzing={reanalyzing}
 />
 </div>
 );
 }

 return (
 <div className="nl-card nl-card-chapter">
 <TechniqueCard card={data} />
 <PlotSummary data={data.plotSummary} defaultCollapsed={true} />
 </div>
 );
}
