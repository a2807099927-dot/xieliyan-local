// ChronoIcon 
// Chrono 
import { clsx } from 'clsx';

export type IconName = 
 | 'sidebar-toggle' | 'memory-bank' | 'typography' | 'plot-guard' | 'search' 
 | 'history' | 'auto-format' | 'undo' | 'redo' | 'zen-mode' | 'export' 
 | 'settings' | 'back' | 'ai-assistant' | 'agent-core'
 | 'character-archive' | 'bookshelf' | 'novel-lab' | 'qq' | 'vision'
  | 'aiweb' | 'book-sweeper' | 'outline-board' | 'setting-book'
 // IDE Refresh 新增
 | 'send' | 'plus' | 'check' | 'x-close' | 'chevron-right' | 'chevron-down' | 'chevron-up' | 'arrow-down' | 'trash'
 | 'at-sign' | 'quote' | 'diff' | 'shield-check' | 'route' | 'sparkles'
 | 'copy' | 'users' | 'panel-right' | 'download' | 'book-ref' | 'zap';

interface ChronoIconProps {
 name: IconName;
 className?: string;
 active?: boolean;
 animating?: boolean;
 size?: number;
}

export function ChronoIcon({ name, className, active, animating, size = 18 }: ChronoIconProps) {
 const renderIcon = () => {
 switch (name) {
 case 'bookshelf':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z"/>
 <path d="M8 7h8M8 11h8"strokeWidth={active ? "2": "1.5"} />
 </svg>
 );
 case 'novel-lab':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M5 4h14v16H5z"/>
 <path d="M9 4v16"opacity="0.55"/>
 <path d="M12 8h4M12 12h5M12 16h3"/>
 <path d="M5 7H3m2 5H3m2 5H3"opacity="0.55"/>
 </svg>
 );
 case 'sidebar-toggle':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <rect x="3"y="3"width="18"height="18"rx="3"/>
 <path d="M9 3v18"strokeDasharray={animating ? "4 4": "0"} />
 </svg>
 );
 case 'back':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2">
 <path d="m15 18-6-6 6-6"/>
 </svg>
 );
 case 'memory-bank':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M12 5c-2.4-2.7-7-1.5-8 2.1-1 3.4 1.2 6 3.9 6.6 1.7.4 2.8 1.2 4.1 2.8 1.3-1.6 2.4-2.4 4.1-2.8 2.7-.6 4.9-3.2 3.9-6.6-1-3.6-5.6-4.8-8-2.1Z"/>
 <path d="M10 13h4M10.5 16h3"/>
 </svg>
 );
 case 'typography':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M4 7h16M4 12h16M4 17h10"/>
 {animating && <circle cx="18"cy="17"r="2"className="animate-pulse"/>}
 </svg>
 );
 case 'plot-guard':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <circle cx="12"cy="12"r="9"/>
 <path d="m15.5 8.5-3 6-6 3 3-6 6-3Z"/>
 <circle cx="12"cy="12"r="1.5"fill="currentColor"className={clsx(active && 'animate-pulse')} />
 </svg>
 );
 case 'search':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <circle cx="11"cy="11"r="7"/>
 <path d="m21 21-4.3-4.3"/>
 </svg>
 );
 case 'history':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M3 12a9 9 0 1 0 9-9"className={clsx(animating && 'animate-[spin_4s_linear_infinite]')} />
 <path d="M3 3v5h5"/>
 <path d="M12 7v5l4 2"/>
 </svg>
 );
 case 'auto-format':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M4 6h16M4 12h16M4 18h16"/>
 <path d="M16 4l4 4-4 4"className="opacity-40"/>
 </svg>
 );
 case 'undo':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.8">
 <path d="M3 7v6h6"/>
 <path d="M21 17a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 13"/>
 </svg>
 );
 case 'redo':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.8">
 <path d="M21 7v6h-6"/>
 <path d="M3 17a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 13"/>
 </svg>
 );
 case 'zen-mode':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
 <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
 <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
 <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
 </svg>
 );
 case 'export':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <path d="M12 3v12"/>
 <path d="m7 10 5 5 5-5"/>
 <path d="M5 21h14"/>
 </svg>
 );
 case 'settings':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <circle cx="12"cy="12"r="3"/>
 <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.3.42.65.5 1.02.08.36.08.74 0 1.1-.08.37-.26.72-.5 1.02z"/>
 </svg>
 );
 case 'ai-assistant':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <path d="M12 2a7 7 0 0 0-7 7v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9a7 7 0 0 0-7-7Z"fill="currentColor"fillOpacity="0.12"/>
 <path d="M9 18h6M10 22h4"/>
 <circle cx="9"cy="11"r="1"fill="currentColor"/>
 <circle cx="15"cy="11"r="1"fill="currentColor"/>
 {active && <path d="M12 6v2"className="animate-pulse"strokeWidth="2"/>}
 </svg>
 );
 case 'agent-core':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <rect x="4"y="4"width="16"height="16"rx="4"fill="currentColor"fillOpacity="0.1"/>
 <path d="M8 8h8M8 12h5M8 16h8"/>
 <circle cx="17"cy="12"r="2.2"fill="currentColor"fillOpacity="0.16"/>
 <path d="M17 9v1.2M17 13.8V15M14 12h1.2M18.8 12H20"opacity="0.75"/>
 </svg>
 );
 case 'character-archive':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <circle cx="12"cy="8"r="3"/>
 <path d="M4 20c1.8-3.5 4.8-5.2 8-5.2s6.2 1.7 8 5.2"/>
 </svg>
 );
 case 'vision':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.6">
 <circle cx="12"cy="12"r="9"fill="currentColor"fillOpacity="0.1"/>
 <path d="M12 3a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2Z"opacity="0.2"/>
 <circle cx="12"cy="12"r="4"strokeWidth="2"/>
 <circle cx="12"cy="12"r="1.5"fill="currentColor"/>
 <path d="m17 7-1.5 1.5M7 17l1.5-1.5M17 17l-1.5-1.5M7 7l1.5-1.5"opacity="0.6"/>
 </svg>
 );
 case 'aiweb':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <circle cx="12"cy="12"r="10"/>
 <path d="M2 12h20"/>
 <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
 </svg>
 );
 case 'book-sweeper':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M18 20V10M12 20V4M6 20v-6"/>
 </svg>
 );
 case 'outline-board':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <rect x="3"y="3"width="18"height="18"rx="2"ry="2"/>
 <line x1="9"y1="3"x2="9"y2="21"/>
 <line x1="15"y1="3"x2="15"y2="21"/>
 <line x1="3"y1="9"x2="21"y2="9"/>
 <line x1="3"y1="15"x2="21"y2="15"/>
 </svg>
 );
 case 'qq':
 return (
 <svg viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="1.5">
 <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
 </svg>
 );
 case 'setting-book':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
 <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
 <path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
 <path d="M12 7v1M12 12v1M14.5 10h-1M10.5 10h-1M13.8 8.2l-.7.7M10.9 11.1l-.7.7M13.8 11.8l-.7-.7M10.9 8.9l-.7-.7" />
 </svg>
 );
 // ── IDE Refresh ──────────────────────────────────────────
 case 'send':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
 <path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10Z" />
 </svg>
 );
 case 'plus':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <path d="M12 5v14M5 12h14" />
 </svg>
 );
 case 'check':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="m4.5 12.5 5 5 10-11" />
 </svg>
 );
 case 'x-close':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <path d="M6 6l12 12M18 6 6 18" />
 </svg>
 );
 case 'chevron-right':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="m9 5 7 7-7 7" />
 </svg>
 );
 case 'chevron-down':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="m5 9 7 7 7-7" />
 </svg>
 );
 case 'chevron-up':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="m5 15 7-7 7 7" />
 </svg>
 );
 case 'arrow-down':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="M12 5v14" />
 <path d="m6 13 6 6 6-6" />
 </svg>
 );
 case 'trash':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="M4 7h16" />
 <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
 <path d="M6 7.5 6.8 18a2 2 0 0 0 2 1.8h6.4a2 2 0 0 0 2-1.8L18 7.5" />
 <path d="M10 11v6M14 11v6" />
 </svg>
 );
 case 'at-sign':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="12" cy="12" r="3.5" />
 <path d="M15.5 12v1.8a2.2 2.2 0 0 0 4.4 0V12a7.9 7.9 0 1 0-3.2 6.3" />
 </svg>
 );
 case 'quote':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="M4 17V9a2 2 0 0 1 2-2h4v10H6.5" />
 <path d="M14 17V9a2 2 0 0 1 2-2h4v10h-3.5" />
 </svg>
 );
 case 'diff':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <path d="M12 3v18" strokeDasharray="2.5 3" />
 <path d="M7 7H5a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 5 17h2M17 7h2a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19 17h-2" />
 </svg>
 );
 case 'shield-check':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.3 7 8.8 4.1-1.5 7-4.5 7-8.8V5.8Z" />
 <path d="m9 11.5 2.2 2.2 4-4.2" />
 </svg>
 );
 case 'route':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="6" cy="19" r="2.2" />
 <circle cx="18" cy="5" r="2.2" />
 <path d="M8.2 19H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.8" />
 </svg>
 );
 case 'sparkles':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
 <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9Z" />
 <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
 </svg>
 );
 case 'copy':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
 <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
 <path d="M5.5 15.5h-1A1.5 1.5 0 0 1 3 14V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 15 5v1" fill="none" />
 </svg>
 );
 case 'users':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
 <circle cx="9" cy="8" r="3.2" />
 <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
 <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 15.4c1.4.8 2.3 2.1 2.6 4.1" />
 </svg>
 );
 case 'panel-right':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
 <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
 <path d="M15 4.5v15" />
 </svg>
 );
 case 'download':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
 <path d="M12 4.75v10" />
 <path d="m7.75 10.5 4.25 4.25 4.25-4.25" />
 <path d="M5.25 18.75h13.5" />
 </svg>
 );
 case 'book-ref':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
 <path d="M12 6.5C10.6 5 8.6 4.2 4.5 4.5v14c4.1-.3 6.1.5 7.5 2 1.4-1.5 3.4-2.3 7.5-2v-14c-4.1-.3-6.1.5-7.5 2Z" />
 <path d="M12 6.5v14" />
 </svg>
 );
 case 'zap':
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
 <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z" />
 </svg>
 );
 default:
 return null;
 }
 };

 return (
 <div 
 className={clsx(
 'wz-icon-bloom inline-flex items-center justify-center shrink-0', 
 `wz-icon-${name}`,
 className
 )}
 style={{ width: size, height: size }}
 >
 {renderIcon()}
 </div>
 );
}

