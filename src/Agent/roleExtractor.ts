/**
 * 角色提取器
 * 
 * 从 Agent 对话中的 AI 回复里识别角色信息，生成角色卡建议。
 */

import type { RoleProfile } from '../types';

export interface RoleCardSuggestion {
 id: string;
 /** 角色名 */
 name: string;
 /** 阵营 */
 faction: string;
 /** 角色类型 */
 roleType: RoleProfile['roleType'];
 /** 描述 */
 description: string;
 /** 能力列表 */
 abilities: string[];
 /** 是否匹配到已有角色（更新模式） */
 isUpdate: boolean;
 /** 匹配到的已有角色 ID（更新模式） */
 existingRoleId?: string;
 /** 状态 */
 status: 'pending' | 'confirmed' | 'dismissed';
}

function createId(): string {
 return `role-sug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 AI 回复文本中提取角色信息
 * 
 * 识别模式：
 * 1. 明确的角色介绍段落（"XXX，是一个..."）
 * 2. 包含角色属性关键词的段落（阵营、能力、性格等）
 * 3. 结构化的角色列表
 */
export function extractRolesFromText(
 text: string,
 existingRoles: RoleProfile[]
): RoleCardSuggestion[] {
 if (!text || text.length < 20) return [];

 const suggestions: RoleCardSuggestion[] = [];
 const existingNames = new Set(existingRoles.map(r => r.name.toLowerCase()));
 const existingAliases = new Map<string, string>();
 for (const role of existingRoles) {
 for (const alias of (role.aliases || [])) {
 existingAliases.set(alias.toLowerCase(), role.id);
 }
 existingAliases.set(role.name.toLowerCase(), role.id);
 }

 // 模式 1：结构化角色块（【角色】...【/角色】）
 const roleBlockRegex = /【角色】([\s\S]*?)【\/角色】/g;
 let blockMatch;
 while ((blockMatch = roleBlockRegex.exec(text)) !== null) {
 const block = blockMatch[1].trim();
 const suggestion = parseRoleBlock(block, existingNames, existingAliases);
 if (suggestion) suggestions.push(suggestion);
 }

 // 模式 2：自然语言中的角色描述（"角色名：描述"格式）
 // 只在没有结构化标记时尝试
 if (suggestions.length === 0) {
 const naturalSuggestions = extractFromNaturalText(text, existingNames, existingAliases);
 suggestions.push(...naturalSuggestions);
 }

 return suggestions;
}

function parseRoleBlock(
 block: string,
 existingNames: Set<string>,
 existingAliases: Map<string, string>
): RoleCardSuggestion | null {
 const nameMatch = block.match(/(?:姓名|名字|角色名)[：:]\s*(.+)/);
 const factionMatch = block.match(/(?:阵营|势力|门派)[：:]\s*(.+)/);
 const typeMatch = block.match(/(?:类型|定位|身份)[：:]\s*(.+)/);
 const descMatch = block.match(/(?:描述|简介|背景)[：:]\s*(.+)/);
 const abilityMatch = block.match(/(?:能力|技能|特长)[：:]\s*(.+)/);

 const name = (nameMatch?.[1] || '').trim();
 if (!name || name.length < 2 || name.length > 10) return null;

 const faction = (factionMatch?.[1] || '').trim();
 const rawType = (typeMatch?.[1] || '').trim();
 const description = (descMatch?.[1] || '').trim();
 const abilitiesRaw = (abilityMatch?.[1] || '').trim();
 const abilities = abilitiesRaw ? abilitiesRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [];

 const roleType = normalizeRoleType(rawType);
 const nameLower = name.toLowerCase();
 const existingId = existingAliases.get(nameLower);

 return {
 id: createId(),
 name,
 faction,
 roleType,
 description,
 abilities,
 isUpdate: Boolean(existingId),
 existingRoleId: existingId || undefined,
 status: 'pending'
 };
}

function extractFromNaturalText(
 text: string,
 existingNames: Set<string>,
 existingAliases: Map<string, string>
): RoleCardSuggestion[] {
 const suggestions: RoleCardSuggestion[] = [];

 // 匹配"XXX，是一个/是一位..."模式
 const introPattern = /[「""]?([^\s,，。！？「」""]{2,8})[」""]?[，,]?\s*(?:是一[个位名]|乃是|身为|作为)(.{10,80})/g;
 let match;
 const seen = new Set<string>();

 while ((match = introPattern.exec(text)) !== null) {
 const name = match[1].trim();
 if (seen.has(name) || name.length < 2 || name.length > 8) continue;
 // 排除常见非角色名词
 if (/^(这个|那个|一个|某个|什么|怎么|如何|为何|因为|所以|但是|然而|虽然)/.test(name)) continue;
 seen.add(name);

 const context = match[2].trim();
 const nameLower = name.toLowerCase();
 const existingId = existingAliases.get(nameLower);

 suggestions.push({
 id: createId(),
 name,
 faction: '',
 roleType: '待分类',
 description: context.slice(0, 100),
 abilities: [],
 isUpdate: Boolean(existingId),
 existingRoleId: existingId || undefined,
 status: 'pending'
 });

 if (suggestions.length >= 5) break; // 单次最多提取 5 个
 }

 return suggestions;
}

function normalizeRoleType(raw: string): RoleProfile['roleType'] {
 const map: Record<string, RoleProfile['roleType']> = {
 '主角': '主角', '男主': '主角',
 '女主': '女主', '女主角': '女主',
 '反派': '反派', 'boss': '反派', '大反派': '反派',
 '配角': '配角', '重要配角': '配角',
 'npc': 'NPC', '路人': '龙套', '龙套': '龙套',
 '势力': '势力', '组织': '势力'
 };
 return map[raw.toLowerCase()] || '待分类';
}

/**
 * 检测 AI 回复是否包含角色信息标记
 */
export function hasRoleMarker(text: string): boolean {
 if (!text) return false;
 return /【角色】/.test(text) && /【\/角色】/.test(text);
}
