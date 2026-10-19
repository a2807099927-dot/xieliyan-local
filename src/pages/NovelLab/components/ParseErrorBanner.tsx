// ParseErrorBanner — JSON 解析失败时的顶部横幅
//
// 设计约束（design.md §5.6，requirements.md R5.10）：
// - 红色背景横幅
// - 文案"AI 输出格式异常，已用默认值兜底"
// - 仅在 card.parseError === true 时由 TechniqueCard 渲染

interface Props {
 /** 可选附加详情（如原始片段截断），默认不显示 */
 detail?: string;
}

export default function ParseErrorBanner({ detail }: Props) {
 return (
 <div className="nl-parse-error-banner" role="alert">
 <span className="nl-parse-error-icon">⚠</span>
 <span className="nl-parse-error-text">AI 输出格式异常，已用默认值兜底</span>
 {detail ? <span className="nl-parse-error-detail">{detail}</span> : null}
 </div>
 );
}
