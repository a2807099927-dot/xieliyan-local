import type { Book, RoleCategory, RoleProfile, StoryArchiveRecord } from '../types';
import { canonicalRoleName, normalizeRoleIdentity, resolveRoleIdentity } from '../utils/roleIdentity';
import {
 applyRoleMutationPlans,
 type RoleMutation,
 type RoleMutationAction,
 type RoleMutationPlan
} from '../utils/roleMutationEngine';

export type { RoleMutation, RoleMutationAction, RoleMutationPlan };
// 兼容上一版调用名称；实际数据已经从逐条 proposal 升级为按角色分组的 plan。
export type RoleUpdateProposal = RoleMutationPlan;

function list(value: unknown): string[] {
 return (Array.isArray(value) ? value.map(String) : String(value || '').split(/[、，,;；\n]/)).map((item) => item.trim()).filter(Boolean);
}
function has(values: unknown, target: string): boolean {
 const key = normalizeRoleIdentity(target);
 return list(values).some((value) => normalizeRoleIdentity(value) === key);
}
function actionFor(record: StoryArchiveRecord): RoleMutationAction | null {
 if (record.kind === 'skill') return 'add_skill';
 if (record.kind === 'item') return /装备|穿戴|佩戴/.test(`${record.status || ''}${record.detail}`) ? 'add_equipment' : 'add_item';
 if (record.kind === 'faction') return 'update_faction';
 if (record.kind === 'relationship') return 'append_relationship';
 if (record.kind === 'character' && record.status === '__RECENT_STATUS__') return 'update_recent_status';
 if (record.kind === 'character' && record.status === 'alias') return 'add_alias';
 if (record.kind === 'character') return 'append_plot_progress';
 return null;
}
function mutationFromRecord(record: StoryArchiveRecord): RoleMutation | null {
 const action = actionFor(record);
 if (!action) return null;
 const target = String(record.target || '').trim();
 const proposed = action === 'add_skill' || action === 'add_item' || action === 'add_equipment' || action === 'update_faction' || action === 'add_alias'
 ? target || record.title
 : record.detail;
 const labels: Record<RoleMutationAction, string> = {
 create_role: '创建角色卡', add_alias: `新增别名“${proposed}”`, add_skill: `新增技能“${proposed}”`, add_item: `新增物品“${proposed}”`, add_equipment: `新增装备“${proposed}”`, update_faction: `阵营更新为“${proposed}”`, update_recent_status: '更新近期状态', append_plot_progress: '追加剧情进展', append_relationship: `追加与“${target || '待确认对象'}”的关系变化`
 };
 return { id: `mutation:${action}:${record.id}`, action, label: labels[action], proposedValue: proposed, reason: record.detail, record };
}
function mutationAlreadyApplied(role: RoleProfile, mutation: RoleMutation): boolean {
 const cf = role.customFields || {};
 switch (mutation.action) {
 case 'add_alias': return has(role.aliases, mutation.proposedValue);
 case 'add_skill': return has([...(role.abilities || []), ...list(cf.skills)], mutation.proposedValue);
 case 'add_item': return has([...(role.inventory || []), ...list(cf.items)], mutation.proposedValue);
 case 'add_equipment': return has([...(role.equipment || []), ...list(cf.equipment)], mutation.proposedValue);
 case 'update_faction': return normalizeRoleIdentity(role.faction) === normalizeRoleIdentity(mutation.proposedValue);
 case 'update_recent_status': return cf.recentStatus === mutation.proposedValue;
 case 'append_plot_progress': return String(role.plotProgress || '').includes(mutation.proposedValue);
 case 'append_relationship': return (role.relationshipTimeline || []).some((item) => item.id === mutation.record.id || (item.target === mutation.record.target && item.detail === mutation.record.detail));
 default: return false;
 }
}

export function buildRoleUpdateProposals(book: Book, records: StoryArchiveRecord[]): RoleMutationPlan[] {
 const categories = book.resourceIndex?.customCharacterCategories || [];
 const groups = new Map<string, { role?: RoleProfile; roleName: string; aliases: Set<string>; records: StoryArchiveRecord[] }>();
 for (const record of records) {
 if (!['character', 'item', 'skill', 'faction', 'relationship'].includes(record.kind)) continue;
 const roleName = canonicalRoleName(record.subject);
 if (!roleName) continue;
 const aliases = record.kind === 'character' && record.status === 'alias' && record.target ? [record.target] : [];
 const match = resolveRoleIdentity(categories, { name: roleName, aliases });
 const key = match.role ? `role:${match.role.id}` : `new:${normalizeRoleIdentity(roleName)}`;
 const group = groups.get(key) || { role: match.role, roleName: match.role?.name || roleName, aliases: new Set<string>(), records: [] };
 aliases.forEach((alias) => group.aliases.add(alias));
 group.records.push(record);
 groups.set(key, group);
 }

 const plans: RoleMutationPlan[] = [];
 for (const [key, group] of groups) {
 const canCreate = !group.role && group.records.some((record) => record.kind === 'character');
 if (!group.role && !canCreate) continue; // 技能/物品名永远不能单独触发建角色。
 const mutations: RoleMutation[] = [];
 if (canCreate) {
 const source = group.records.find((record) => record.kind === 'character')!;
 mutations.push({ id: `mutation:create:${source.id}`, action: 'create_role', label: `创建角色“${group.roleName}”`, proposedValue: source.detail, reason: '本章首次确认该人物，后续变化将归入同一角色卡', record: source });
 }
 for (const record of group.records) {
 const mutation = mutationFromRecord(record);
 if (!mutation || (group.role && mutationAlreadyApplied(group.role, mutation))) continue;
 const duplicateKey = `${mutation.action}:${normalizeRoleIdentity(mutation.proposedValue)}:${record.chapterId}`;
 if (!mutations.some((item) => `${item.action}:${normalizeRoleIdentity(item.proposedValue)}:${item.record.chapterId}` === duplicateKey)) mutations.push(mutation);
 }
 if (!mutations.length) continue;
 const planRecords = Array.from(new Map(mutations.map((mutation) => [mutation.record.id, mutation.record])).values())
 .sort((a, b) => Number(b.kind === 'character') - Number(a.kind === 'character'));
 plans.push({
 id: `role-plan:${key}`,
 roleName: group.roleName,
 aliases: Array.from(group.aliases),
 matchedRoleId: group.role?.id,
 matchedRoleName: group.role?.name,
 createIfMissing: canCreate,
 chapterIds: Array.from(new Set(planRecords.map((record) => record.chapterId))),
 chapterTitles: Array.from(new Set(planRecords.map((record) => record.chapterTitle || record.chapterId))),
 records: planRecords,
 mutations
 });
 }
 return plans;
}

export function applyRoleUpdateProposals(categories: RoleCategory[] | undefined, plans: RoleMutationPlan[]): RoleCategory[] {
 return applyRoleMutationPlans(categories, plans);
}
