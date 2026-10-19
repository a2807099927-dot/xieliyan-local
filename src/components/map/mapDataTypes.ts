// mapDataTypes.ts — AI 世界地图数据类型定义

/** 地图顶层数据结构，存储在 book.outlineVision.mapData */
export interface MapData {
 version: number;
 width: number;
 height: number;
 backgroundType: 'ocean' | 'parchment' | 'custom';
 levels: MapLevel[];
 currentLevelId: string;
}

/** 地图层级（支持多级嵌套：世界→区域→城市→局部） */
export interface MapLevel {
 id: string;
 name: string;
 parentId: string | null;
 parentLocationId: string | null;
 depth: number; // 0=世界级, 1=区域级, 2=城市级, 3=局部级

 regions: MapRegion[];
 locations: MapLocation[];
 paths: MapPath[];
 tiles: MapTile[];
}

/** 区域轮廓（SVG path） */
export interface MapRegion {
 id: string;
 name: string;
 svgPath: string; // SVG path d 属性
 fillType: 'plain' | 'desert' | 'snow' | 'ocean' | 'forest' | 'mountain';
 faction?: string;
 color?: string;
 userCreated?: boolean;
}

/** 地点节点 */
export interface MapLocation {
 id: string;
 name: string;
 x: number;
 y: number;
 type: 'capital' | 'city' | 'town' | 'village' | 'fortress' | 'port' | 'landmark';
 tileId: string;
 description?: string;
 faction?: string;
 events?: string[];
 chapters?: string[];
 hasSubLevel?: boolean;
 userCreated?: boolean;
}

/** 路径（道路/河流/航线） */
export interface MapPath {
 id: string;
 name: string;
 type: 'road_main' | 'road_minor' | 'river' | 'sea_route';
 points: Array<{ x: number; y: number }>;
 fromLocationId?: string;
 toLocationId?: string;
 userCreated?: boolean;
}

/** 瓦片素材实例 */
export interface MapTile {
 id: string;
 tileAssetId: string;
 x: number;
 y: number;
 scale?: number;
 rotation?: number;
 userCreated?: boolean;
}

/** 操作历史条目 */
export interface MapHistoryEntry {
 timestamp: number;
 action: string;
 snapshot: MapLevel; // 深拷贝
}

/** 编辑工具类型 */
export type MapEditTool = 'select' | 'draw_path' | 'add_location' | 'eraser' | 'text_label';

/** 路径类型选项 */
export const PATH_TYPE_OPTIONS = [
 { value: 'road_main', label: '主路/官道' },
 { value: 'road_minor', label: '小路/山道' },
 { value: 'river', label: '河流/水路' },
 { value: 'sea_route', label: '海上航线' },
] as const;

/** 地点类型选项 */
export const LOCATION_TYPE_OPTIONS = [
 { value: 'capital', label: '都城', tileId: 'city_capital_1' },
 { value: 'city', label: '城镇', tileId: 'city_town_1' },
 { value: 'town', label: '小镇', tileId: 'city_town_1' },
 { value: 'village', label: '村庄', tileId: 'village_1' },
 { value: 'fortress', label: '关隘/要塞', tileId: 'fortress' },
 { value: 'port', label: '港口', tileId: 'port' },
 { value: 'landmark', label: '地标', tileId: 'war_banner' },
] as const;

/** 创建空白地图数据 */
export function createEmptyMapData(): MapData {
 const rootLevelId = 'level_root_' + Date.now().toString(36);
 return {
 version: 1,
 width: 100,
 height: 70,
 backgroundType: 'parchment',
 levels: [{
 id: rootLevelId,
 name: '世界地图',
 parentId: null,
 parentLocationId: null,
 depth: 0,
 regions: [],
 locations: [],
 paths: [],
 tiles: [],
 }],
 currentLevelId: rootLevelId,
 };
}

/** 获取当前活跃层级 */
export function getCurrentLevel(mapData: MapData): MapLevel | undefined {
 return mapData.levels.find(l => l.id === mapData.currentLevelId);
}

/** 获取层级的面包屑路径 */
export function getLevelBreadcrumb(mapData: MapData, levelId: string): MapLevel[] {
 const path: MapLevel[] = [];
 let current = mapData.levels.find(l => l.id === levelId);
 while (current) {
 path.unshift(current);
 current = current.parentId ? mapData.levels.find(l => l.id === current!.parentId) : undefined;
 }
 return path;
}
