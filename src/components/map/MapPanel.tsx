// MapPanel.tsx — 地图面板主容器
import { MapCanvas } from './MapCanvas';

interface MapPanelProps {
 bookId: string;
}

export function MapPanel({ bookId }: MapPanelProps) {
 return (
 <div className="flex flex-1 flex-col overflow-hidden bg-[#0f2744]">
 <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 bg-[#16161a] shrink-0">
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-bold text-white/60">🌍 世界地图</span>
 <span className="text-[8px] text-white/30">滚轮缩放 · 拖拽平移</span>
 </div>
 <div className="flex items-center gap-1">
 <span className="px-1.5 py-0.5 text-[7px] font-bold bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded">MapLibre GL</span>
 </div>
 </div>
 <div className="flex-1 min-h-0">
 <MapCanvas />
 </div>
 </div>
 );
}
