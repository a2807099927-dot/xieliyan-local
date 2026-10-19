// 模块说明：角色面板业务逻辑层。
// 关键职责：从书籍数据派生分类视图、装备/技能聚合、合并写回。
import type { Book, RoleProfile, RoleRelationshipEvent } from '../../../types';
import { parseJsonLoosely } from '../../../utils/jsonParse';
import {
 cleanRoleText,
 isGenericNonRoleCardName,
 looksLikeAliasRelation,
 normalizeRoleIdentity,
 roleAliasLinked,
 roleIdentityKeys,
 shouldMergeRoleCards
} from '../../../utils/roleIdentity';
import { mergeRoleProfiles } from '../../../utils/roleMutationEngine';
export {
 cleanRoleText,
 isGenericNonRoleCardName,
 looksLikeAliasRelation,
 normalizeRoleIdentity,
 roleAliasLinked,
 roleIdentityKeys,
 shouldMergeRoleCards,
 mergeRoleProfiles
};

export type EditMode = 'create' | 'edit';

export interface RoleWithCategory {
 role: RoleProfile;
 categoryId: string;
 categoryName: string;
}

export interface RoleDraft {
 name: string;
 aliases: string;
 faction: string;
 roleType: RoleProfile['roleType'];
 description: string; // 背景
 personality: string; // 性格
 appearance: string; // 外貌
 other: string; // 其他
 items: string;
 relatedPlot: string;
 skills: string;
 equipment: string;
 relations: string;
 relationshipTimeline: string;
 avatar?: string;
 extraFields?: string;
 }

export interface RelationNode {
 id: string;
 name: string;
 mentions: number;
}

export interface RelationSnippet {
 chapterId: string;
 chapterTitle: string;
 text: string;
 isConflict: boolean;
}

export interface RelationEdge {
 id: string;
 sourceId: string;
 targetId: string;
 weight: number;
 snippets: RelationSnippet[];
}

export type NovelType = NonNullable<NonNullable<Book['resourceIndex']>['novelType']>;
export type RecoveryPrompt = {
 title: string;
 detail: string;
 onResume: () => void;
};

export type RoleView = '全部' | '主角' | '反派' | '配角' | '装备库' | '技能/功法' | (string & {});

// 角色分类与基础文本清洗：供列表筛选、角色卡归类、AI 提取结果入库前规整使用。
export const ROLE_VIEW_ORDER_DEFAULT: RoleView[] = ['全部', '主角', '女主', '配角', '反派', 'NPC', '龙套', '势力', '装备库', '技能/功法'];
export const ROLE_VIEW_ORDER: RoleView[] = ROLE_VIEW_ORDER_DEFAULT;
export const ROLE_VIEW_SET = new Set<RoleView>(ROLE_VIEW_ORDER);
// parseJsonLike 已合并到全局 parseJsonLoosely，直接引用。

// 关系历程解析：把数组、JSON 字符串、自由文本统一成 RoleRelationshipEvent，供角色卡和合并流程共用。
export function createTimelineId(): string {
 return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
 ? crypto.randomUUID()
 : `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseRelationshipTimeline(value: unknown): RoleRelationshipEvent[] {
 if (Array.isArray(value)) {
 return value
 .map((item): RoleRelationshipEvent | null => {
 if (!item || typeof item !== 'object') return null;
 const row = item as Partial<RoleRelationshipEvent>;
 const target = cleanRoleText(row.target);
 const detail = cleanRoleText(row.detail || row.event || row.change);
 if (!target || !detail) return null;
 return {
 id: cleanRoleText(row.id, createTimelineId()),
 target,
 chapterTitle: cleanRoleText(row.chapterTitle, '未标注章节'),
 event: cleanRoleText(row.event, detail),
 change: cleanRoleText(row.change),
 detail,
 status: cleanRoleText(row.status, '关系变化'),
 importance: typeof row.importance === 'number' ? row.importance : undefined,
 createdAt: cleanRoleText(row.createdAt)
 };
 })
 .filter((item): item is RoleRelationshipEvent => Boolean(item));
 }
 const rawText = String(value || '').trim();
 let parsed: unknown | null = null;
 try {
 parsed = parseJsonLoosely<unknown>(rawText);
 } catch {
 parsed = null;
 }
 if (parsed) return parseRelationshipTimeline(parsed);
 const text = cleanRoleText(rawText);
 if (!text) return [];
 try {
 return parseRelationshipTimeline(JSON.parse(text));
 } catch {
 return text
 .split(/\n+/g)
 .map((line): RoleRelationshipEvent | null => {
 const detail = cleanRoleText(line);
 if (!detail) return null;
 const target = detail.match(/(?:与|和|对|向)([^：:，,。；;]{2,12})/)?.[1] || '待确认对象';
 const chapterTitle = detail.match(/第\s*\d+\s*章[^：:，,。；;]*/)?.[0] || '未标注章节';
 return {
 id: createTimelineId(),
 target,
 chapterTitle,
 event: detail,
 change: detail,
 detail,
 status: '关系变化'
 };
 })
 .filter((item): item is RoleRelationshipEvent => Boolean(item));
 }
}

export function stringifyRelationshipTimeline(events: RoleRelationshipEvent[]): string {
 return events
 .map((event) => {
 const chapter = event.chapterTitle && event.chapterTitle !== '未标注章节' ? `${event.chapterTitle}：` : '';
 const target = event.target ? `与${event.target}：` : '';
 return `${chapter}${target}${event.detail || event.event || event.change}`.trim();
 })
 .filter(Boolean)
 .join('\n');
}

export function mergeRelationshipTimeline(...groups: Array<unknown>): RoleRelationshipEvent[] {
 const merged = new Map<string, RoleRelationshipEvent>();
 for (const group of groups) {
 for (const event of parseRelationshipTimeline(group)) {
 const key = [event.target, event.chapterTitle, event.detail].map((item) => cleanRoleText(item).toLowerCase()).join('|');
 if (!merged.has(key)) merged.set(key, event);
 }
 }
 return Array.from(merged.values());
}

// 角色视图/类型归一化：把旧数据、AI 输出、自定义分类收敛到固定的角色分类集合。
// 支持用户自定义分类标签：如果 value 不在内置集合中但 customTabs 包含，则原样保留。
export function normalizeRoleView(value: unknown, customTabs?: string[]): RoleView {
 const text = cleanRoleText(value, '配角');
 if (text === '全部' || text === '主角' || text === '女主' || text === '反派' || text === '配角' || text === 'NPC' || text === '龙套' || text === '势力') return text as RoleView;
 if (text === '装备库' || text === '技能/功法') return text as RoleView;
 // 用户自定义分类标签：原样返回
 if (customTabs && customTabs.includes(text)) return text as RoleView;
 // 旧类型映射到新分类
 if (text === '待确认配角' || text === '待分类') return '配角';
 return '配角';
}

export function normalizeRoleType(value: unknown): RoleProfile['roleType'] {
 const view = normalizeRoleView(value);
 return (view === '全部' ? '配角' : view) as RoleProfile['roleType'];
}

export type SkillChip = { name: string; detail: string };

// 解析技能条目（兼容合法 JSON 与旧版/被破坏的纯文本）
export function parseSkillChips(val: unknown): SkillChip[] {
  const raw = typeof val === 'string' ? val : '';
  if (!raw.trim()) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) {
      return p
        .map((x) => ({
          name: String((x && (x as { name?: unknown }).name) ?? '').trim(),
          detail: String((x && (x as { detail?: unknown }).detail) ?? '').trim(),
        }))
        .filter((x) => x.name);
    }
  } catch {}
  return raw
    .split(/[、，,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, detail: '' }));
}

// 从角色实际存储（abilities / customFields.skills / skillDetails）重建编辑器技能条目 JSON，
// 保证“编辑器展示 = 实际存储”，避免多套数据不同步。
export function buildSkillChipsJson(role: RoleProfile): string {
  const cf = role.customFields || {};
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of parseList(cf.skills || '').concat(role.abilities || [])) {
    const name = String(n || '').trim();
    if (name && !seen.has(name)) { seen.add(name); names.push(name); }
  }
  const detailMap = parseDetailMap(cf.skillDetails);
  return JSON.stringify(names.map((name) => ({ name, detail: String(detailMap[name] || '').trim() })));
}

// 保存时：以编辑器技能条目（appearance）为唯一真源，派生出 abilities / skills / skillDetails。
export function skillChipsToStores(appearanceJson: string): {
  appearance: string;
  abilities: string[];
  skills: string;
  skillDetails: string;
} {
  const chips = parseSkillChips(appearanceJson);
  const detailMap: Record<string, string> = {};
  for (const c of chips) if (c.detail) detailMap[c.name] = c.detail;
  return {
    appearance: JSON.stringify(chips),
    abilities: chips.map((c) => c.name),
    skills: chips.map((c) => c.name).join('、'),
    skillDetails: JSON.stringify(detailMap),
  };
}

// 角色草稿：新增角色用 emptyDraft，编辑已有角色用 draftFromRole，保存前都只停留在表单临时状态。
export function draftFromRole(role: RoleProfile): RoleDraft {
 return {
 name: cleanRoleText(role.name),
 aliases: (role.aliases || []).map((item) => cleanRoleText(item)).filter(Boolean).join('、'),
 faction: cleanRoleText(role.faction),
 roleType: normalizeRoleType(role.roleType),
 description: cleanRoleText(role.description),
 personality: cleanRoleText(role.customFields?.personality),
 appearance: buildSkillChipsJson(role),
 other: JSON.stringify(parseSkillChips(role.customFields?.other)),
 items: cleanRoleText(role.customFields?.items),
 relatedPlot: cleanRoleText(role.customFields?.recentStatus || role.customFields?.recentPlot || role.customFields?.relatedPlot || role.plotProgress),
 skills: cleanRoleText(role.customFields?.skills || (role.abilities || []).join('、')),
 equipment: cleanRoleText(role.customFields?.equipment || (role.inventory || []).join('、')),
 relations: cleanRoleText(role.customFields?.relations),
 relationshipTimeline: stringifyRelationshipTimeline(
 mergeRelationshipTimeline(role.relationshipTimeline, role.customFields?.relationshipTimeline, role.customFields?.relationshipTimelineText)
 ),
 avatar: role.customFields?.avatar || '',
 extraFields: role.customFields?.extraFields || ''
 };
}

export function emptyDraft(): RoleDraft {
 return {
 name: '',
 aliases: '',
 faction: '',
 roleType: '配角',
 description: '',
 personality: '',
 appearance: '',
 other: '',
 items: '',
 relatedPlot: '',
 skills: '',
 equipment: '',
 relations: '',
 relationshipTimeline: '',
 avatar: '',
 extraFields: ''
 };
}

export function parseList(text: string): string[] {
 return text
 .split(/[、，,\n]/g)
 .map((item) => cleanRoleText(item))
 .filter(Boolean);
}

export function categoryFromRole(role: RoleProfile, customTabs?: string[]): RoleView {
 const customCategory = (role.customFields?.category || '').trim();
 if (customCategory) return normalizeRoleView(customCategory, customTabs);
 return normalizeRoleView(role.roleType, customTabs);
}

// 关系图谱数据：从记忆库章节摘要里统计角色共现关系，生成右侧关系图谱使用的节点和边。
export function isLikelyNamedCharacter(name: string): boolean {
 const value = String(name || '').trim();
 if (!value) return false;
 if (value.length < 2 || value.length > 24) return false;
 if (/[，。！？；:;,\n\r]/.test(value)) return false;
 if (/^(主角|女主|反派|配角|NPC|龙套|角色名|未命名角色)$/i.test(value)) return false;
 return true;
}

export function parseDetailMap(
 value: string | Record<string, unknown> | null | undefined
): Record<string, string> {
 if (!value) return {};
 if (typeof value === 'object') {
 const out: Record<string, string> = {};
 for (const [key, item] of Object.entries(value)) {
 const normalizedKey = cleanRoleText(key);
 if (!normalizedKey) continue;
 out[normalizedKey] = cleanRoleText(item);
 }
 return out;
 }

 const text = String(value || '').trim();
 if (!text) return {};
 try {
 const parsed = JSON.parse(text) as unknown;
 if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
 const out: Record<string, string> = {};
 for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
 const normalizedKey = cleanRoleText(key);
 if (!normalizedKey) continue;
 out[normalizedKey] = cleanRoleText(item);
 }
 return out;
 }
 } catch {
 // no-op: fall back to line parser
 }

 const out: Record<string, string> = {};
 const blocks = text.split(/\n{2,}/g).map((item) => cleanRoleText(item)).filter(Boolean);
 for (const block of blocks) {
 const lines = block.split('\n').map((item) => cleanRoleText(item)).filter(Boolean);
 if (lines.length === 0) continue;
 const first = lines[0].replace(/^[【\[]|[】\]]$/g, '').trim();
 if (!first) continue;
 out[first] = lines.join('\n');
 }
 return out;
}

export const CONFLICT_REGEX = /(冲突|争执|对立|背叛|反目|大战|敌对|追杀|围攻|刺杀|对峙|决裂|威胁)/;

/**
 * 关系图数据：只读角色卡上的结构化字段（relationshipTimeline / relations）。
 * **绝不**扫描 memoryBank / 章节正文 —— 角色栏本就是轻量元数据面板。
 * （旧实现用档案全文模糊匹配角色名，老书 500+ 档会卡死，已废弃。）
 */
export function gatherRelationData(
  _book: Book,
  roleItems: RoleWithCategory[]
): { nodes: RelationNode[]; edges: RelationEdge[] } {
  void _book; // 保留签名兼容调用方；故意不读 memoryBank / chapters
  const roleList = roleItems
    .map((item) => item.role)
    .filter((role) => isLikelyNamedCharacter(role.name));
  if (roleList.length === 0) {
    return { nodes: [], edges: [] };
  }

  // name/alias → roleId
  const idByName = new Map<string, string>();
  for (const role of roleList) {
    for (const raw of [role.name, ...(role.aliases || [])]) {
      const key = normalizeRoleIdentity(raw);
      if (key && !idByName.has(key)) idByName.set(key, role.id);
    }
  }

  const nodeMentions = new Map<string, number>();
  const edgeMap = new Map<
    string,
    {
      sourceId: string;
      targetId: string;
      weight: number;
      snippets: RelationSnippet[];
    }
  >();

  const bumpEdge = (
    sourceId: string,
    targetId: string,
    snippet: RelationSnippet
  ) => {
    if (sourceId === targetId) return;
    const [a, b] = [sourceId, targetId].sort();
    const key = `${a}__${b}`;
    const exists =
      edgeMap.get(key) ||
      ({
        sourceId: a,
        targetId: b,
        weight: 0,
        snippets: [] as RelationSnippet[],
      } as const);
    const next = {
      sourceId: a,
      targetId: b,
      weight: exists.weight + 1,
      snippets: [...exists.snippets],
    };
    if (
      next.snippets.length < 8 &&
      !next.snippets.some(
        (s) => s.chapterId === snippet.chapterId && s.text === snippet.text
      )
    ) {
      next.snippets.push(snippet);
    }
    edgeMap.set(key, next);
    nodeMentions.set(sourceId, (nodeMentions.get(sourceId) || 0) + 1);
    nodeMentions.set(targetId, (nodeMentions.get(targetId) || 0) + 1);
  };

  for (const role of roleList) {
    // 1) 结构化关系时间线
    const timeline = Array.isArray(role.relationshipTimeline)
      ? role.relationshipTimeline
      : [];
    for (const ev of timeline) {
      const targetName = String(ev?.target || '').trim();
      if (!targetName) continue;
      const targetId = idByName.get(normalizeRoleIdentity(targetName));
      if (!targetId) continue;
      const detail = [ev.event, ev.change, ev.detail, ev.status]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' · ');
      bumpEdge(role.id, targetId, {
        chapterId: String(ev.chapterTitle || ev.id || ''),
        chapterTitle: String(ev.chapterTitle || '关系记录'),
        text: detail || `${role.name} ↔ ${targetName}`,
        isConflict: CONFLICT_REGEX.test(detail),
      });
    }

    // 2) customFields 里可能有 JSON 时间线
    const cfRaw = role.customFields?.relationshipTimeline;
    let cfList: Array<Record<string, unknown>> = [];
    if (Array.isArray(cfRaw)) {
      cfList = cfRaw as Array<Record<string, unknown>>;
    } else if (typeof cfRaw === 'string' && cfRaw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(cfRaw);
        if (Array.isArray(parsed)) cfList = parsed;
      } catch {
        /* ignore */
      }
    }
    for (const ev of cfList) {
      const targetName = String(ev?.target || '').trim();
      if (!targetName) continue;
      const targetId = idByName.get(normalizeRoleIdentity(targetName));
      if (!targetId) continue;
      const detail = [ev.event, ev.change, ev.detail, ev.status]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' · ');
      bumpEdge(role.id, targetId, {
        chapterId: String(ev.chapterTitle || ''),
        chapterTitle: String(ev.chapterTitle || '关系记录'),
        text: detail || `${role.name} ↔ ${targetName}`,
        isConflict: CONFLICT_REGEX.test(detail),
      });
    }

    // 3) relations 字符串列表（「与xx是朋友」类）— 仅解析为指向已知角色名
    const relArr = Array.isArray((role as { relations?: string[] }).relations)
      ? ((role as { relations?: string[] }).relations as string[])
      : parseList(cleanRoleText(role.customFields?.relations || ''));
    for (const rel of relArr) {
      const text = String(rel || '').trim();
      if (!text) continue;
      // 在已知角色名中找最长匹配
      let hitId: string | null = null;
      let hitLen = 0;
      for (const [nameKey, id] of idByName) {
        if (id === role.id) continue;
        if (nameKey.length >= 2 && text.toLowerCase().includes(nameKey) && nameKey.length > hitLen) {
          hitId = id;
          hitLen = nameKey.length;
        }
      }
      if (!hitId) continue;
      bumpEdge(role.id, hitId, {
        chapterId: '',
        chapterTitle: '关系备注',
        text,
        isConflict: CONFLICT_REGEX.test(text),
      });
    }
  }

  const nodes = roleList
    .map((role) => ({
      id: role.id,
      name: role.name,
      mentions: nodeMentions.get(role.id) || 0,
    }))
    .filter((item) => item.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 40);

  const allowed = new Set(nodes.map((item) => item.id));
  const edges: RelationEdge[] = Array.from(edgeMap.entries())
    .map(([id, edge]) => ({
      id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      weight: edge.weight,
      snippets: edge.snippets.slice(0, 8),
    }))
    .filter((edge) => allowed.has(edge.sourceId) && allowed.has(edge.targetId))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60);

  return { nodes, edges };
}

// 网游/装备面板辅助逻辑：把技能、装备、槽位和详情文本整理成角色卡可展示的数据。
type MmoSlotKind = 'weapon' | 'shield' | 'helmet' | 'chest' | 'bracers' | 'legs' | 'boots' | 'cloak' | 'ring' | 'necklace' | 'mount' | 'skill';
type EquipSlotKey = 'weapon' | 'shield' | 'helmet' | 'chest' | 'bracers' | 'legs' | 'boots' | 'cloak' | 'ring1' | 'ring2' | 'necklace' | 'mount';

export interface MmoMeta {
 name: string;
 isEmpty: boolean;
 note: string;
}

export const WEAPON_SLOT_PATTERN = /(剑|刀|弓|杖|法杖|匕首|枪|长枪|短枪|锤|棒|棍|斧|矛|戟|爪|拳套|扇|鞭|刃|弩|武器|weapon)/i;
export const NON_EQUIPMENT_FRAGMENT_PATTERN = /^(同比|同步|属性|效果|说明|描述|空位|装备|物品|包裹|背包|仓库)$/i;

export function classifySlot(name: string): MmoSlotKind | null {
 const text = name.toLowerCase();
 if (!text || NON_EQUIPMENT_FRAGMENT_PATTERN.test(text)) return null;
 if (/(盾牌|盾|圆盾|塔盾|重盾|shield)/i.test(text)) return 'shield';
 if (/(戒指|指环|戒子|戒|ring)/i.test(text)) return 'ring';
 if (/(项链|吊坠|护符|项坠|坠饰|necklace)/i.test(text)) return 'necklace';
 if (/(坐骑|马|战马|坐骑栏|骑宠|mount)/i.test(text)) return 'mount';
 if (/(头盔|头冠|帽|兜鍪|面具|发冠|helmet)/i.test(text)) return 'helmet';
 if (/(护腕|手甲|护臂|臂甲|手套|护手|bracer|glove)/i.test(text)) return 'bracers';
 if (/(腿甲|护腿|裤|下装|裙|leg)/i.test(text)) return 'legs';
 if (/(战靴|靴|鞋|boots?)/i.test(text)) return 'boots';
 if (/(披风|斗篷)/.test(text)) return 'cloak';
 if (/(胸甲|胸铠|战甲|铠甲|皮甲|法袍|衣|甲胄|护甲|armor|robe)/i.test(text)) return 'chest';
 if (WEAPON_SLOT_PATTERN.test(text)) return 'weapon';
 return null;
}

export function classifyEquipmentSlot(name: string, detail = ''): MmoSlotKind | null {
 // 固定槽位优先看装备名；详情里可能出现“用于持盾/长枪/重甲”等说明词，不能抢走真实槽位。
 const byName = classifySlot(name);
 if (!byName) return null;
 if (byName !== 'weapon' || WEAPON_SLOT_PATTERN.test(name)) {
 return byName;
 }
 return classifySlot(detail || name);
}

export function toMeta(name: string, note: string): MmoMeta {
 const trimmed = (name || '').trim();
 const isEmpty = !trimmed || trimmed === '空位' || trimmed.includes('空位');
 const normalized = (note || '')
 .replace(/\r\n/g, '\n')
 .replace(/\\n/g, '\n')
 // 在关键属性前换行（包括中文/英文标点）
 .replace(/[，,；;](?=\s*(攻击|防御|敏捷|力量|智力|体质|暴击|命中|闪避|耐久|需要等级|冷却时间|消耗|效果|范围|触发|持续时间))/g, '\n')
 .replace(/:(?=(攻击|防御|敏捷|力量|智力|体质|暴击|命中|闪避|耐久|需要等级|冷却时间|消耗|效果|范围|触发|持续时间))/g, ':\n')
 .replace(/[ \t]+\n/g, '\n')
 .replace(/\n{3,}/g, '\n\n')
 .trim();
 return {
 name: trimmed || '空位',
 isEmpty,
 note: isEmpty ? '该槽位暂未装备。' : (normalized || '暂无额外说明')
 };
}

export function buildEquipmentSlots(equipments: string[], equipmentDetailsMap: Record<string, string> = {}): Record<EquipSlotKey, string | null> {
 const slots: Record<EquipSlotKey, string | null> = {
 weapon: null,
 shield: null,
 helmet: null,
 chest: null,
 bracers: null,
 legs: null,
 boots: null,
 cloak: null,
 ring1: null,
 ring2: null,
 necklace: null,
 mount: null
 };

 // 未能分类的装备暂存，最后填入空槽
 const unclassified: string[] = [];

 for (const equip of equipments) {
 const normalized = normalizeEquipmentName(equip);
 if (!normalized) continue;
 const detail = pickDetailByName(equipmentDetailsMap, equip, '', normalizeEquipmentName);
 const slot = classifyEquipmentSlot(normalized, detail);
 if (!slot) {
 // 尝试用 detail 再分类一次
 const slotFromDetail = detail ? classifySlot(detail) : null;
 if (slotFromDetail && slotFromDetail !== 'skill') {
 assignSlot(slots, slotFromDetail, normalized);
 } else {
 unclassified.push(normalized);
 }
 continue;
 }
 assignSlot(slots, slot, normalized);
 }

 // 未分类的装备填入第一个空的武器槽
 for (const name of unclassified) {
 if (!slots.weapon) { slots.weapon = name; continue; }
 // 其他空槽按顺序填
 const emptySlot = (['shield', 'helmet', 'chest', 'bracers', 'legs', 'boots', 'cloak', 'ring1', 'ring2', 'necklace'] as EquipSlotKey[]).find(k => !slots[k]);
 if (emptySlot) slots[emptySlot] = name;
 }

 return slots;
}

function assignSlot(slots: Record<EquipSlotKey, string | null>, slot: MmoSlotKind, name: string) {
 if (slot === 'ring') {
 if (!slots.ring1) { slots.ring1 = name; }
 else if (!slots.ring2) { slots.ring2 = name; }
 else { slots.ring2 = name; }
 } else if (slot === 'skill') {
 // 技能不放装备栏
 } else {
 const key = slot as EquipSlotKey;
 if (key in slots) slots[key] = name;
 }
}

export function normalizeSkillName(name: string): string {
 let next = name.trim().replace(/^技能[\s:：]*/i, '');
 next = next.replace(/[【\[]([^】\]]+)[】\]]/g, '$1');
 next = next.replace(/\s*Lv\.?\s*\d+(\s*[-~]\s*\d+)?/gi, '');
 next = next.replace(/[（(](主动技能|被动技能|主动|被动|技能)[）)]/g, '');
 next = next.replace(/\s+/g, ' ').trim();
 return next;
}

export function normalizeEquipmentName(name: string): string {
 let next = name.trim();
 // 去掉方括号装饰（【猿牙长剑】→ 猿牙长剑）
 next = next.replace(/[【\[]([^】\]]+)[】\]]/g, '$1');
 // 去掉括号中明显是非装备属性的内容（角色归属、使用者、持有者等）
 next = next.replace(/[（(](?:.*(?:使用|持有|装备|佩戴|所有|归属|拥有).*)[）)]/g, '');
 // 去掉括号中的品质标签
 next = next.replace(/[（(](?:黑铁器|白色|绿色|蓝色|紫色|橙色|史诗|传说|普通|稀有|卓越|神器|套装|白银器|黄金器|暗金器|灵器|仙器)[）)]/g, '');
 next = next.replace(/\s+/g, ' ').trim();
 return next;
}

export function pickDetailByName(
 detailMap: Record<string, string>,
 name: string,
 fallback: string,
 normalizer: (value: string) => string = (value) => value.trim()
): string {
 const target = normalizer(name);
 if (!target) return fallback;
 const exact = detailMap[name] || detailMap[target];
 if (exact) return exact;
 const entries = Object.entries(detailMap);
 const byNormalized = entries.find(([key]) => normalizer(key) === target)?.[1];
 if (byNormalized) return byNormalized;
 const byContain = entries.find(([key]) => {
 const normKey = normalizer(key);
 return normKey.includes(target) || target.includes(normKey);
 })?.[1];
 return byContain || fallback;
}

export function normalizeSkillList(skills: string[]): string[] {
 const cleaned = skills
 .map((s) => normalizeSkillName(s))
 .filter(Boolean)
 .filter((s) => s.length >= 2)
 .filter((s) => !/^(攻击|防御|速度|更新|强化|属性|能力|技能|战斗|输出)$/i.test(s));
 return Array.from(new Set(cleaned));
}

export function normalizeSkillDetailMap(detailMap: Record<string, string>): Record<string, string> {
 const out: Record<string, string> = {};
 for (const [key, value] of Object.entries(detailMap || {})) {
 const normalizedKey = normalizeSkillName(key);
 if (!normalizedKey) continue;
 out[normalizedKey] = value;
 }
 return out;
}

export function inferProfession(role: RoleProfile): string {
 const fromField = (role.customFields?.profession || '').trim();
 if (fromField) return fromField;
 const desc = role.description || '';
 const matched = desc.match(/(铁匠|法师|战士|刺客|导师|队长|团长|牧师|商人|猎人|炼药师|工匠|将军|首领|掌柜|医师)/);
 if (matched?.[1]) return matched[1];
 return role.roleType === '主角' || role.roleType === '女主' ? '主角' : role.roleType || '未知';
}
