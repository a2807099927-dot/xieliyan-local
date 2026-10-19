import React from 'react';
import type { TechniqueAnalysisCard } from '../types/technique';
import { CLIMAX_POSITION_ZH } from '../types/technique-meta';
import TagBadge from './TagBadge';
import HookPlacementBlock from './HookPlacementBlock';
import ConflictBlock from './ConflictBlock';
import ParseErrorBanner from './ParseErrorBanner';

interface Props {
 card: TechniqueAnalysisCard;
}

interface FieldProps {
 label: string;
 value: string;
 icon?: React.ReactNode;
 fullWidth?: boolean;
 tone?: 'reader-drive' | 'payoff' | 'info-release' | 'reusable' | 'climax' | 'default';
}

function TechniqueField({ label, value, tone = 'default', icon, fullWidth }: FieldProps) {
 if (value.trim().length === 0) return null;
 const className = `nl-tcard-field nl-tcard-field-${tone} ${fullWidth ? 'nl-tcard-field-full' : ''}`;
 return (
 <div className={className}>
 <div className="nl-tcard-field-header">
 {icon && <span className="nl-tcard-field-icon">{icon}</span>}
 <span className="nl-tcard-field-label">{label}</span>
 </div>
 <div className="nl-tcard-field-value">{value}</div>
 </div>
 );
}

// Icons
const Icons = {
 Tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
 Rocket: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
 Zap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
 Flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
 Eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
 Puzzle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.611c-.94.94-2.469.94-3.408 0L8.73 19.73a.98.98 0 0 1-.276-.837c.07-.47.48-.802.925-.968a2.5 2.5 0 1 0-3.214-3.214c-.166.446-.497.855-.968.925a.979.979 0 0 1-.837-.276l-1.611-1.611c-.94-.94-.94-2.469 0-3.408l1.568-1.568c.23-.23.338-.556.289-.878A5.987 5.987 0 0 0 3 7.85c0-3.313 2.687-6 6-6 1.157 0 2.235.33 3.15.894a.977.977 0 0 1 .458.835c0 .484-.393.871-.877.871a4 4 0 1 0 5.485 5.485c0-.484.387-.877.871-.877.348 0 .666.18.835.458a5.986 5.986 0 0 0 .517 3.183z"/></svg>
};

export default function TechniqueCard({ card }: Props) {
 const showConfidenceWarning = !card.parseError && card.labelConfidence < 0.5;

 return (
 <div className="nl-tcard">
 {card.parseError ? <ParseErrorBanner /> : null}

 <header className="nl-tcard-header">
 <span className="nl-tcard-chapter-index">第 {card.chapterIndex} 章</span>
 <h3 className="nl-tcard-title">{card.chapterTitle}</h3>
 </header>

 {!card.parseError ? (
 <div className="nl-tcard-tag-row">
 <TagBadge tag={card.mainTag} variant="primary" />
 {card.subTags.map((t, i) => (
 <TagBadge key={`${t}-${i}`} tag={t} variant="secondary" showDot />
 ))}
 {showConfidenceWarning ? (
 <span className="nl-confidence-warning" title={`labelConfidence = ${card.labelConfidence.toFixed(2)}`}>
 <span className="nl-confidence-icon">⚠</span>
 <span className="nl-confidence-text">标签可能不稳</span>
 </span>
 ) : null}
 </div>
 ) : null}

 {!card.parseError ? (
 <div className="nl-tcard-body-bento">
 {/* 故事概述（多章整体分析时显示） */}
 {card.storyOverview ? (
 <TechniqueField label="故事概述" value={card.storyOverview} icon={Icons.Eye} fullWidth />
 ) : null}

 <TechniqueField label="标签理由" value={card.tagReason} icon={Icons.Tag} fullWidth />

 {/* 剧情推进阶段 */}
 {card.plotProgression && card.plotProgression.length > 0 ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#38bdf8' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#38bdf8' }}>{Icons.Rocket}</span>
 <span className="nl-tcard-field-label" style={{ color: '#38bdf8' }}>剧情推进</span>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
 {card.plotProgression.map((p, i) => (
 <div key={i} style={{ padding: '8px 10px', background: 'rgba(56,189,248,0.06)', borderRadius: '6px', border: '1px solid rgba(56,189,248,0.12)' }}>
 <div style={{ fontSize: '12px', fontWeight: 700, color: '#7dd3fc', marginBottom: '4px' }}>
 {p.stage}{p.chapters ? ` (${p.chapters})` : ''}
 </div>
 <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.6 }}>{p.content}</div>
 {p.technique ? <div style={{ fontSize: '11px', color: '#a78bfa', marginTop: '4px' }}>技法：{p.technique}</div> : null}
 </div>
 ))}
 </div>
 </div>
 ) : null}

 {/* 写作技法详解 */}
 {card.writingTechniques && card.writingTechniques.length > 0 ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#10b981' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#34d399' }}>{Icons.Puzzle}</span>
 <span className="nl-tcard-field-label" style={{ color: '#34d399' }}>写作技法拆解</span>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
 {card.writingTechniques.map((t, i) => (
 <div key={i} style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.06)', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.12)' }}>
 <div style={{ fontSize: '12px', fontWeight: 700, color: '#6ee7b7', marginBottom: '4px' }}>{t.name}</div>
 {t.where ? <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>📍 {t.where}</div> : null}
 <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.6 }}>{t.how}</div>
 {t.effect ? <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '3px' }}>→ 效果：{t.effect}</div> : null}
 </div>
 ))}
 </div>
 </div>
 ) : null}

 {/* 角色分析 */}
 {card.characterAnalysis && card.characterAnalysis.length > 0 ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#8b5cf6' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#a78bfa' }}>{Icons.Flame}</span>
 <span className="nl-tcard-field-label" style={{ color: '#a78bfa' }}>角色塑造</span>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', marginTop: '4px' }}>
 {card.characterAnalysis.map((c, i) => (
 <div key={i} style={{ padding: '8px 10px', background: 'rgba(139,92,246,0.06)', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.12)' }}>
 <div style={{ fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '3px' }}>{c.name} <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400 }}>({c.role})</span></div>
 <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}>{c.arc}</div>
 {c.technique ? <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>手法：{c.technique}</div> : null}
 </div>
 ))}
 </div>
 </div>
 ) : null}
 
 <TechniqueField label="读者动力" value={card.readerDrive} tone="reader-drive" icon={Icons.Rocket} />
 
 <TechniqueField label="爽点机制" value={card.payoffMechanism} tone="payoff" icon={Icons.Zap} />

 <HookPlacementBlock hookPlacement={card.hookPlacement} />

 {card.climaxPosition !== 'none' ? (
 <TechniqueField label="高潮位置" value={CLIMAX_POSITION_ZH[card.climaxPosition]} tone="climax" icon={Icons.Flame} />
 ) : (
 <div className="nl-tcard-empty-slot" /> /* Fill grid space if none */
 )}
 
 <ConflictBlock conflictSource={card.conflictSource} conflictType={card.conflictType} />

 {/* 矛盾深度分析 */}
 {card.contradictionAnalysis && card.contradictionAnalysis.description ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#f43f5e' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#fb7185' }}>⚔</span>
 <span className="nl-tcard-field-label" style={{ color: '#fb7185' }}>矛盾分析</span>
 {card.contradictionAnalysis.type && <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '8px' }}>类型：{card.contradictionAnalysis.type}</span>}
 </div>
 <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.6, marginTop: '4px' }}>{card.contradictionAnalysis.description}</div>
 {card.contradictionAnalysis.pressureDetail && card.contradictionAnalysis.pressureDetail.length > 0 && (
 <div style={{ marginTop: '6px' }}>
 <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>压迫层（{card.contradictionAnalysis.pressureLayers}层）：</div>
 {card.contradictionAnalysis.pressureDetail.map((p, i) => (
 <div key={i} style={{ fontSize: '11px', color: '#cbd5e1', paddingLeft: '8px', lineHeight: 1.5 }}>• {p}</div>
 ))}
 </div>
 )}
 {card.contradictionAnalysis.releasePreview && (
 <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '4px' }}>释放：{card.contradictionAnalysis.releasePreview}（{card.contradictionAnalysis.releaseStatus}）</div>
 )}
 </div>
 ) : null}

 {/* 期待感工程 */}
 {card.expectationEngineering && (card.expectationEngineering.shortHook || card.expectationEngineering.longHook || card.expectationEngineering.infoGapDetail) ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#f59e0b' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#fbbf24' }}>🎣</span>
 <span className="nl-tcard-field-label" style={{ color: '#fbbf24' }}>期待感工程</span>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
 {card.expectationEngineering.shortHook && <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}><span style={{ color: '#94a3b8' }}>短钩：</span>{card.expectationEngineering.shortHook}</div>}
 {card.expectationEngineering.midHook && <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}><span style={{ color: '#94a3b8' }}>中钩：</span>{card.expectationEngineering.midHook}</div>}
 {card.expectationEngineering.longHook && <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.5 }}><span style={{ color: '#94a3b8' }}>长钩：</span>{card.expectationEngineering.longHook}</div>}
 {card.expectationEngineering.infoGapDetail && <div style={{ fontSize: '12px', color: '#7dd3fc', lineHeight: 1.5 }}><span style={{ color: '#94a3b8' }}>信息差：</span>{card.expectationEngineering.infoGapDetail}</div>}
 {card.expectationEngineering.expectationDensity && <div style={{ fontSize: '11px', color: '#94a3b8' }}>钩子密度：{card.expectationEngineering.expectationDensity}</div>}
 </div>
 </div>
 ) : null}

 {/* 情绪节奏 */}
 {card.emotionRhythm && (card.emotionRhythm.waveDescription || card.emotionRhythm.pattern) ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#06b6d4' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#22d3ee' }}>📈</span>
 <span className="nl-tcard-field-label" style={{ color: '#22d3ee' }}>情绪节奏</span>
 {card.emotionRhythm.pressureCount > 0 && <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '8px' }}>压迫点×{card.emotionRhythm.pressureCount}</span>}
 </div>
 {card.emotionRhythm.pattern && <div style={{ fontSize: '12px', color: '#67e8f9', marginTop: '4px', fontFamily: 'ui-monospace, monospace' }}>{card.emotionRhythm.pattern}</div>}
 {card.emotionRhythm.waveDescription && <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.6, marginTop: '4px' }}>{card.emotionRhythm.waveDescription}</div>}
 {card.emotionRhythm.longestFlatSegment && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>最平段：{card.emotionRhythm.longestFlatSegment}</div>}
 </div>
 ) : null}

 {/* 阵营分析 */}
 {card.campAnalysis && (card.campAnalysis.protagonist || card.campAnalysis.enemy) ? (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#8b5cf6' }}>
 <div className="nl-tcard-field-header">
 <span className="nl-tcard-field-icon" style={{ color: '#a78bfa' }}>⚖</span>
 <span className="nl-tcard-field-label" style={{ color: '#a78bfa' }}>阵营分析</span>
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px' }}>
 {card.campAnalysis.protagonist && <div style={{ fontSize: '12px', padding: '6px 8px', background: 'rgba(139,92,246,0.06)', borderRadius: '4px', border: '1px solid rgba(139,92,246,0.15)' }}><div style={{ fontSize: '10px', color: '#a78bfa', marginBottom: '2px' }}>主角方</div><div style={{ color: '#e2e8f0', lineHeight: 1.5 }}>{card.campAnalysis.protagonist}</div></div>}
 {card.campAnalysis.enemy && <div style={{ fontSize: '12px', padding: '6px 8px', background: 'rgba(244,63,94,0.06)', borderRadius: '4px', border: '1px solid rgba(244,63,94,0.15)' }}><div style={{ fontSize: '10px', color: '#fb7185', marginBottom: '2px' }}>敌方</div><div style={{ color: '#e2e8f0', lineHeight: 1.5 }}>{card.campAnalysis.enemy}</div></div>}
 </div>
 {card.campAnalysis.thirdParty && <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '4px', lineHeight: 1.5 }}><span style={{ color: '#94a3b8' }}>第三方：</span>{card.campAnalysis.thirdParty}</div>}
 {card.campAnalysis.logicCheck && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>逻辑检查：{card.campAnalysis.logicCheck}</div>}
 </div>
 ) : null}

 <TechniqueField label="信息释放" value={card.infoRelease} tone="info-release" icon={Icons.Eye} fullWidth />

 <TechniqueField label="可复用模板" value={card.reusablePattern} tone="reusable" icon={Icons.Puzzle} fullWidth />
 </div>
 ) : null}
 </div>
 );
}
