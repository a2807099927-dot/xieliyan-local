// ov 
// 

import type { DeductionContext } from '../components/outline/plotDeductionHelpers';

export type OutlineNodeType = 'arc' | 'event' | 'sub_plot' | 'placeholder';

export interface OutlineNode {
 id: string;
 title: string;
 type: OutlineNodeType;
 conflict?: string;
 characters?: string[];
 locations?: string[];
 items?: string[];
 targetWordCount: number;
 actualWordCount: number;
 chapterId?: string;
 isAiGenerated?: boolean;
 notes?: string;
 pinned?: boolean;
 position?: {
 x: number;
 y: number;
 };
 children?: OutlineNode[];
}

export interface OutlineEdge {
 id: string;
 source: string;
 target: string;
 type?: 'straight' | 'smoothstep' | 'bezier';
}

export interface OutlineSubItem {
 id: string;
 title: string;
 content: string;
 isDefault?: boolean;
 folder?: string;
}

export interface MasterOutlineData {
 settings?: string; // fallback
 mainline?: string; // fallback
 settingsItems?: OutlineSubItem[];
 mainlineItems?: OutlineSubItem[];
}

export interface DeductionArchive {
 id: string;
 title: string;
 messages: any[];
 ctx?: DeductionContext;
 createdAt: string;
}

export interface ActiveDeductionSession {
 stage: 'idle' | 'deducing' | 'error';
 messages: any[];
 ctx?: DeductionContext;
 selectedChapterIds: string[];
}

export interface OutlineVisionData {
 nodes: OutlineNode[];
 edges?: OutlineEdge[];
 lastSyncedAt?: string;
 version: number;
 masterOutline?: MasterOutlineData;
 mapData?: import('../components/map/mapDataTypes').MapData;
 deductionArchives?: DeductionArchive[];
 activeDeductionSession?: ActiveDeductionSession;
}
