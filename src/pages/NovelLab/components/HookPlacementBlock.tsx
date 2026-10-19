import type { HookPlacement } from '../types/technique';
import { HOOK_POSITION_ZH } from '../types/technique-meta';

interface Props {
 hookPlacement: HookPlacement;
}

const POSITIONS: Array<keyof HookPlacement> = ['opening', 'middle', 'ending'];
const HookIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v8"/><path d="M12 10a4 4 0 0 1 4 4v3a2 2 0 1 1-4 0v-3"/><path d="M10 2h4"/><path d="M9 22h6"/></svg>;

export default function HookPlacementBlock({ hookPlacement }: Props) {
 const segments = POSITIONS.filter((p) => hookPlacement[p].trim().length > 0);
 if (segments.length === 0) return null;

 return (
 <div className="nl-tcard-field nl-tcard-field-full" style={{ borderLeftColor: '#8b5cf6' }}>
 <div className="nl-tcard-field-header" style={{ color: '#a78bfa' }}>
 <span className="nl-tcard-field-icon">{HookIcon}</span>
 <span className="nl-tcard-field-label">钩子分布</span>
 </div>
 <div className="nl-hook-block" style={{ padding: 0, background: 'transparent', border: 'none', marginTop: '4px' }}>
 {segments.map((p) => (
 <div key={p} className={`nl-hook-segment nl-hook-segment-${p}`}>
 <div className="nl-hook-label">{HOOK_POSITION_ZH[p]}</div>
 <div className="nl-hook-text">{hookPlacement[p]}</div>
 </div>
 ))}
 </div>
 </div>
 );
}
