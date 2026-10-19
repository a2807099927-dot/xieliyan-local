// roleArchiveBridge.ts - Role categories and story archive bi-directional conversion helpers.
import type { RoleCategory, RoleProfile, RoleRelationshipEvent, StoryArchiveRecord } from '../types';
import { applyRoleRecordsToCategories } from './roleMutationEngine';

export const ROLE_CATEGORY_IDS = {
 MAIN: 'cat_main',
 FEMALE: 'cat_female',
 SUPPORT: 'cat_support',
 VILLAIN: 'cat_villain',
 NPC: 'cat_npc',
 DRAGON: 'cat_extra',
 FACTION: 'cat_faction'
} as const;

export const DEFAULT_ROLE_CATEGORIES: RoleCategory[] = [
 { id: ROLE_CATEGORY_IDS.MAIN, name: '主角', isAuto: true, children: [], order: 0 },
 { id: ROLE_CATEGORY_IDS.FEMALE, name: '女主', isAuto: true, children: [], order: 1 },
 { id: ROLE_CATEGORY_IDS.SUPPORT, name: '配角', isAuto: true, children: [], order: 2 },
 { id: ROLE_CATEGORY_IDS.VILLAIN, name: '反派', isAuto: true, children: [], order: 3 },
 { id: ROLE_CATEGORY_IDS.NPC, name: 'NPC', isAuto: true, children: [], order: 4 },
 { id: ROLE_CATEGORY_IDS.DRAGON, name: '龙套', isAuto: true, children: [], order: 5 },
 { id: ROLE_CATEGORY_IDS.FACTION, name: '势力', isAuto: true, children: [], order: 6 }
];

export function createDefaultRoleCategories(): RoleCategory[] {
 return DEFAULT_ROLE_CATEGORIES.map((category) => ({ ...category, children: [] }));
}

export function getRoleCategoryIdByType(roleType: RoleProfile['roleType'] | string): string {
 const normalized = String(roleType || '').toLowerCase();
 if (normalized.includes('主角') || normalized.includes('男主') || normalized.includes('main')) return ROLE_CATEGORY_IDS.MAIN;
 if (normalized.includes('女主') || normalized.includes('female')) return ROLE_CATEGORY_IDS.FEMALE;
 if (normalized.includes('反派') || normalized.includes('villain')) return ROLE_CATEGORY_IDS.VILLAIN;
 if (normalized === 'npc') return ROLE_CATEGORY_IDS.NPC;
 if (normalized.includes('龙套') || normalized.includes('extra')) return ROLE_CATEGORY_IDS.DRAGON;
 if (normalized.includes('势力') || normalized.includes('faction')) return ROLE_CATEGORY_IDS.FACTION;
 return ROLE_CATEGORY_IDS.SUPPORT;
}

function nowIso(): string {
 return new Date().toISOString();
}

function normalizeList(value: unknown): string[] {
 if (Array.isArray(value)) {
 return value.map((item) => String(item || '').trim()).filter(Boolean);
 }
 const text = String(value || '').trim();
 if (!text) return [];
 return text
 .split(/[、，,\n]/g)
 .map((item) => item.trim())
 .filter(Boolean);
}

function normalizeDetailMap(value: unknown): Record<string, string> {
 if (!value) return {};
 if (typeof value === 'object' && !Array.isArray(value)) {
 return Object.fromEntries(
 Object.entries(value)
 .map(([key, item]) => [String(key || '').trim(), String(item || '').trim()])
 .filter(([key]) => Boolean(key))
 );
 }
 const text = String(value || '').trim();
 if (!text) return {};
 try {
 const parsed = JSON.parse(text) as unknown;
 return normalizeDetailMap(parsed);
 } catch {
 return {};
 }
}

function normalizeRelationshipTimeline(value: unknown): RoleRelationshipEvent[] {
 if (Array.isArray(value)) {
 return value
 .map((item): RoleRelationshipEvent | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Partial<RoleRelationshipEvent>;
 const target = String(row.target || '').trim();
 const detail = String(row.detail || row.event || row.change || '').trim();
 if (!target || !detail) return null;
 return {
 id: String(row.id || `rel_${target}_${detail}`).trim(),
 target,
 chapterTitle: String(row.chapterTitle || '未标注章节').trim(),
 event: String(row.event || detail).trim(),
 change: String(row.change || '').trim(),
 detail,
 status: String(row.status || '关系变化').trim(),
 importance: typeof row.importance === 'number' ? row.importance : undefined,
 createdAt: row.createdAt
 };
 })
 .filter((item): item is RoleRelationshipEvent => Boolean(item));
 }
 const text = String(value || '').trim();
 if (!text) return [];
 try {
 return normalizeRelationshipTimeline(JSON.parse(text));
 } catch {
 return [];
 }
}

function firstChapter(role: RoleProfile): string {
 return role.chapters?.[0] || role.firstAppearance || 'role-archive';
}

function makeRecord(
 role: RoleProfile,
 kind: StoryArchiveRecord['kind'],
 title: string,
 detail: string,
 target?: string,
 status?: string
): StoryArchiveRecord {
 const chapterId = firstChapter(role);
 const now = role.extractedAt || nowIso();
 return {
 id: `role-${role.id}-${kind}-${title}-${target || ''}`,
 kind,
 title,
 subject: role.name,
 target,
 detail,
 status,
 chapterId,
 chapterTitle: chapterId === 'role-archive' ? '角色档案' : chapterId,
 sourceChapterIds: role.chapters?.length ? role.chapters : [chapterId],
 evidence: '来自用户编辑的角色档案',
 tags: ['角色档案', role.roleType, role.faction].filter(Boolean),
 importance: String(role.roleType).includes('主角') || String(role.roleType).includes('女主') ? 5 : 3,
 createdAt: now,
 updatedAt: now
 };
}

export function roleCategoriesToArchiveRecords(categories?: RoleCategory[]): StoryArchiveRecord[] {
 if (!Array.isArray(categories)) return [];

 const records: StoryArchiveRecord[] = [];
 for (const category of categories) {
 for (const role of category.children || []) {
 if (!role?.name?.trim()) continue;
 const description = [
 role.description,
 role.faction ? `所属：${role.faction}` : '',
 role.plotProgress ? `进展：${role.plotProgress}` : ''
 ]
 .filter(Boolean)
 .join('；') || `${role.name}（${role.roleType || category.name || '角色'}）`;

 records.push(makeRecord(role, 'character', role.name, description, undefined, role.roleType || category.name));

 const custom = role.customFields || {};
 const items = normalizeList(custom.items || role.inventory);
 for (const item of items) {
 records.push(makeRecord(role, 'item', item, `${role.name}持有/相关物品：${item}`, item, '持有/相关'));
 }

 const equipment = normalizeList(custom.equipment);
 const equipmentDetails = normalizeDetailMap(custom.equipmentDetails);
 for (const item of equipment) {
 records.push(makeRecord(role, 'item', item, equipmentDetails[item] || `${role.name}装备：${item}`, item, '装备'));
 }

 const skills = normalizeList(custom.skills || role.abilities);
 const skillDetails = normalizeDetailMap(custom.skillDetails);
 for (const skill of skills) {
 records.push(makeRecord(role, 'skill', skill, skillDetails[skill] || `${role.name}技能/能力：${skill}`, skill, '掌握/相关'));
 }

 const relations = normalizeList(custom.relations);
 for (const relation of relations) {
 records.push(makeRecord(role, 'relationship', `${role.name}关系`, relation, undefined, '角色关系'));
 }

 const timeline = normalizeRelationshipTimeline(role.relationshipTimeline).concat(
 normalizeRelationshipTimeline(custom.relationshipTimeline)
 );
 for (const event of timeline) {
 records.push(
 makeRecord(
 role,
 'relationship',
 `${role.name}与${event.target}关系历程`,
 `${event.chapterTitle}：${event.detail}`,
 event.target,
 event.status || '关系变化'
 )
 );
 }

 if (role.faction) {
 records.push(makeRecord(role, 'faction', role.faction, `${role.name}归属/关联势力：${role.faction}`, role.faction));
 }
 }
 }
 return records;
}

// 所有剧情档案到角色卡的写入统一走 roleMutationEngine，避免身份和字段规则再次分叉。
export function mergeRoleCategoriesWithArchiveRecords(
 categories: RoleCategory[] | undefined,
 records: StoryArchiveRecord[]
): RoleCategory[] {
 return applyRoleRecordsToCategories(categories, records);
}
