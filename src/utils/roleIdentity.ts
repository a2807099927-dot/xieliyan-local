import type { RoleCategory, RoleProfile } from '../types';

// 从 rolePanelLogic 抽出的已验证身份规则。所有角色读取/写入都必须复用这里，禁止再写局部 normalize。
export const BAD_ROLE_TEXT_PATTERN = /(\{?\s*esc\s*\([^)]*\)\s*\}?|role\.[a-zA-Z_]+|\?\.[a-zA-Z_]+|HTMLAttributes\.[a-zA-Z_]+|undefined|null|createdAt|importance|chapterTitle|target|event|change|detail|status)/g;

export function cleanRoleText(value: unknown, fallback = ''): string {
 return String(value ?? '')
 .replace(/\uFFFD/g, '')
 .replace(BAD_ROLE_TEXT_PATTERN, '')
 .replace(/[{}[\]`"\\]+/g, '')
 .replace(/[:,]+/g, ' ')
 .replace(/\s{2,}/g, ' ')
 .trim() || fallback;
}

export function isGenericNonRoleCardName(value: unknown): boolean {
 const name = cleanRoleText(value).replace(/\s+/g, '');
 if (!name) return true;
 if (/^(主角|男主|女主|反派|配角|待确认配角|NPC|龙套|势力|组织|阵营|公会|俱乐部|角色|人物)$/.test(name)) return true;
 if (/^(系统|面板|任务面板|提示音|旁白|公告|官方|GM|客服|管理员|教程|新手引导)$/i.test(name)) return true;
 if (/^(?:生活职业|剑士|法师|牧师|刺客|战士|猎人|工匠|铁匠|药剂|炼药|采集|新手|职业|技能|装备)?导师$/.test(name) && name.length > 8) return true;
 if (/^(?:.+)?官方$/.test(name) && name.length <= 8) return true;
 if (/^(?:.+)?系统$/.test(name) && name.length <= 8) return true;
 return false;
}

export function canonicalRoleName(value: unknown): string {
 return cleanRoleText(value).replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '').trim();
}

export function normalizeRoleIdentity(value: unknown): string {
 return cleanRoleText(value)
 .replace(/[（(].*?[）)]/g, '')
 .replace(/·/g, '')
 .replace(/\s+/g, '')
 .toLowerCase();
}

export function looksLikeAliasRelation(text: string, name: string): boolean {
 const source = cleanRoleText(text);
 const target = cleanRoleText(name);
 if (!source || !target || !source.includes(target)) return false;
 const index = source.indexOf(target);
 const start = Math.max(0, index - 16);
 const end = Math.min(source.length, index + target.length + 16);
 return /(外号|游戏ID|ID|昵称|网名|代号|真名|本名|现实姓名|叫做|名叫|就是|即|同一人)/i.test(source.slice(start, end));
}

export function roleIdentityKeys(role: Pick<RoleProfile, 'name'> & { aliases?: string[] | null }): string[] {
 const keys: string[] = [];
 for (const raw of [role.name, ...(role.aliases || [])]) {
 const id = normalizeRoleIdentity(raw);
 if (id && id.length >= 2 && !keys.includes(id)) keys.push(id);
 }
 return keys;
}

export function roleAliasLinked(left: RoleProfile, right: RoleProfile): boolean {
 const leftIds = new Set(roleIdentityKeys(left));
 if (roleIdentityKeys(right).some((id) => leftIds.has(id))) return true;
 const leftText = [left.description, left.plotProgress, left.customFields?.profession, left.customFields?.relatedPlot, left.customFields?.recentPlot].join(' ');
 const rightText = [right.description, right.plotProgress, right.customFields?.profession, right.customFields?.relatedPlot, right.customFields?.recentPlot].join(' ');
 return looksLikeAliasRelation(leftText, right.name) || looksLikeAliasRelation(rightText, left.name);
}

export const shouldMergeRoleCards = roleAliasLinked;

export interface RoleIdentityCandidate { name: string; aliases?: string[] }
export interface RoleIdentityMatch {
 type: 'exact' | 'alias' | 'unresolved';
 role?: RoleProfile;
 category?: RoleCategory;
 matchedBy?: string;
}

export function buildRoleIdentityIndex(categories: RoleCategory[] | undefined): Map<string, { role: RoleProfile; category: RoleCategory; source: 'name' | 'alias' }> {
 const index = new Map<string, { role: RoleProfile; category: RoleCategory; source: 'name' | 'alias' }>();
 for (const category of categories || []) {
 for (const role of category.children || []) {
 const nameKey = normalizeRoleIdentity(role.name);
 if (nameKey.length >= 2 && !index.has(nameKey)) index.set(nameKey, { role, category, source: 'name' });
 for (const alias of role.aliases || []) {
 const key = normalizeRoleIdentity(alias);
 if (key.length >= 2 && !index.has(key)) index.set(key, { role, category, source: 'alias' });
 }
 }
 }
 return index;
}

export function resolveRoleIdentity(categories: RoleCategory[] | undefined, candidate: RoleIdentityCandidate): RoleIdentityMatch {
 const index = buildRoleIdentityIndex(categories);
 const candidateKeys = [candidate.name, ...(candidate.aliases || [])].map(normalizeRoleIdentity).filter((key) => key.length >= 2);
 for (const key of candidateKeys) {
 const hit = index.get(key);
 if (hit) return { type: hit.source === 'name' ? 'exact' : 'alias', role: hit.role, category: hit.category, matchedBy: key };
 }
 return { type: 'unresolved' };
}
