import type { ConflictSource } from '../types/technique';
import { CONFLICT_SOURCE_ZH } from '../types/technique-meta';

interface Props {
 conflictSource: ConflictSource;
 conflictType: string;
}

const SwordsIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M6.4 13.6L5 15l-2-2 1.4-1.4"/><path d="M9.5 9.5L8 11l-2-2 1.5-1.5"/></svg>;

export default function ConflictBlock({ conflictSource, conflictType }: Props) {
 const sourceZh = CONFLICT_SOURCE_ZH[conflictSource];
 return (
 <div className="nl-tcard-field" style={{ borderLeftColor: '#f59e0b' }}>
 <div className="nl-tcard-field-header" style={{ color: '#fbbf24' }}>
 <span className="nl-tcard-field-icon">{SwordsIcon}</span>
 <span className="nl-tcard-field-label">冲突源: {sourceZh}</span>
 </div>
 {conflictType.trim().length > 0 ? (
 <div className="nl-tcard-field-value">{conflictType}</div>
 ) : null}
 </div>
 );
}
