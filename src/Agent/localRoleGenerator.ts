// localRoleGenerator.ts — 本地角色生成器（零 token 消耗）
// 基于本书智能整理数据 + 本地模板库，随机生成与剧情关联的角色卡
import type { Book, ChapterMemory, RoleProfile } from '../types';

// ─── 模板库 ─────────────────────────────────────────────────────────────────

/** 阵营模板 */
const FACTIONS = {
 protagonist: ['主角方', '主角势力', '主角阵营', '友军'],
 antagonist: ['敌方', '反派势力', '对立阵营', '暗势力'],
 neutral: ['第三方', '中立势力', '游离者', '观望派', '隐世一族'],
};

/** 角色定位模板 */
const ROLE_TYPES: Array<{ type: RoleProfile['roleType']; weight: number }> = [
 { type: '配角', weight: 40 },
 { type: '反派', weight: 25 },
 { type: '女主', weight: 15 },
 { type: 'NPC', weight: 10 },
 { type: '势力', weight: 10 },
];

/** 动机模板库 */
const MOTIVATIONS: Record<string, string[]> = {
 protagonist: ['守护重要之人', '追寻真相', '证明自我价值', '报恩', '完成师命', '保护家族'],
 antagonist: ['复仇', '野心称霸', '信奉极端理念', '被迫为恶', '嫉妒', '维护旧秩序', '掠夺资源'],
 neutral: ['利益交换', '寻找失物', '隐居避世', '观察局势', '等待时机', '自保求存', '追求自由'],
};

/** 性格标签库 */
const PERSONALITY_TAGS = {
 positive: ['沉稳', '机敏', '豪爽', '温和', '坚韧', '聪慧', '正直', '洒脱', '细腻', '果断'],
 negative: ['阴沉', '狡诈', '暴躁', '冷酷', '多疑', '偏执', '傲慢', '贪婪', '残忍', '虚伪'],
 neutral: ['神秘', '寡言', '随性', '古怪', '淡漠', '慵懒', '执拗', '天真', '老练', '圆滑'],
};

/** 角色弧线模板 */
const ARC_TEMPLATES: Record<string, string[]> = {
 protagonist: ['从弱到强的成长', '逐渐揭开身世之谜', '从敌对到信任', '牺牲自我保护主角', '最终独当一面'],
 antagonist: ['逐步暴露野心', '被主角击败后洗白', '黑化到底最终覆灭', '发现真相后反水', '与主角同归于尽'],
 neutral: ['观望后选择站队', '利益驱动最终背叛', '被主角感化加入', '始终保持中立到结局', '暗中帮助主角'],
};

/** 冲突种子模板 */
const CONFLICT_SEEDS: Record<string, string[]> = {
 protagonist: ['掌握主角不愿公开的秘密', '与主角争夺同一机缘', '曾被主角无意伤害', '对主角的做法有根本分歧', '身份暴露会牵连主角'],
 antagonist: ['占据主角必须获取的资源', '威胁主角在乎的人', '与主角有血海深仇', '阻断主角的晋升之路', '散布对主角不利的谣言'],
 neutral: ['持有关键情报待价而沽', '与主角和敌方都有交易', '可能随时倒向任何一方', '掌握改变局势的关键物品', '身份成谜引发各方猜忌'],
};

/** 出场方式模板 */
const ENTRANCE_STYLES = [
 '在主角陷入困境时突然出现',
 '作为某个事件的幕后推手被揭露',
 '以路人身份登场，后续揭示真实身份',
 '通过他人口中的传闻先行铺垫',
 '与主角在特定场合偶然相遇',
 '作为任务/交易的对接人出现',
 '在战斗中作为第三方介入',
 '以受害者身份出现博取同情',
];

// ─── 分析函数 ─────────────────────────────────────────────────────────────────

/** 分析当前书籍的阵营分布，找出缺失的阵营 */
function analyzeFactionGap(book: Book): 'protagonist' | 'antagonist' | 'neutral' {
 const roles = getAllRoles(book);
 const counts = { protagonist: 0, antagonist: 0, neutral: 0 };

 for (const role of roles) {
 const f = (role.faction || '').toLowerCase();
 if (f.includes('主角') || f.includes('友') || f.includes('己方')) counts.protagonist++;
 else if (f.includes('敌') || f.includes('反派') || f.includes('对立')) counts.antagonist++;
 else counts.neutral++;
 }

 // 找最少的阵营
 if (counts.neutral <= counts.protagonist && counts.neutral <= counts.antagonist) return 'neutral';
 if (counts.antagonist <= counts.protagonist) return 'antagonist';
 return 'protagonist';
}

/** 获取书中所有角色 */
function getAllRoles(book: Book): RoleProfile[] {
 const categories = book.resourceIndex?.customCharacterCategories || [];
 const roles: RoleProfile[] = [];
 for (const cat of categories) {
 if (cat.children) roles.push(...cat.children);
 }
 return roles;
}

/** 从智能整理中提取最近的剧情关键词 */
function extractRecentPlotContext(book: Book): { keywords: string[]; recentEvents: string[]; existingNames: string[] } {
 const memories = book.memoryBank || [];
 const analyzed = memories.filter(m => m.isAnalyzed && m.plotAnalysis);
 const recent = analyzed.slice(-10); // 最近10章

 const keywords: string[] = [];
 const recentEvents: string[] = [];

 for (const mem of recent) {
 const pa = mem.plotAnalysis;
 if (!pa) continue;
 if (pa.plotSynopsis) {
 // 提取关键名词
 const nouns = pa.plotSynopsis.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
 keywords.push(...nouns.slice(0, 5));
 }
 if (pa.keyNodes) {
 for (const node of pa.keyNodes.slice(0, 3)) {
 if (node.action) recentEvents.push(node.action);
 }
 }
 }

 const existingNames = getAllRoles(book).map(r => r.name);

 return {
 keywords: [...new Set(keywords)].slice(0, 20),
 recentEvents: recentEvents.slice(-6),
 existingNames,
 };
}

/** 找到可以关联的已有角色 */
function findRelationTarget(book: Book, faction: 'protagonist' | 'antagonist' | 'neutral'): RoleProfile | null {
 const roles = getAllRoles(book);
 if (roles.length === 0) return null;

 // 优先找同阵营或对立阵营的角色
 const candidates = roles.filter(r => {
 const f = (r.faction || '').toLowerCase();
 if (faction === 'protagonist') return f.includes('主角') || f.includes('友');
 if (faction === 'antagonist') return f.includes('敌') || f.includes('反派');
 return true; // neutral 可以关联任何人
 });

 const pool = candidates.length > 0 ? candidates : roles;
 return pool[Math.floor(Math.random() * pool.length)];
}

/** 建议出场章节 */
function suggestAppearanceChapter(book: Book): string {
 const totalChapters = book.chapters.length;
 if (totalChapters === 0) return '第1章';
 // 建议在当前最新章节附近出场
 const latest = totalChapters;
 const offset = Math.floor(Math.random() * 3); // 0-2章后
 return `第${latest + offset + 1}章左右`;
}

// ─── 随机工具 ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
 return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
 const shuffled = [...arr].sort(() => Math.random() - 0.5);
 return shuffled.slice(0, n);
}

function weightedPick(items: Array<{ type: string; weight: number }>): string {
 const total = items.reduce((s, i) => s + i.weight, 0);
 let r = Math.random() * total;
 for (const item of items) {
 r -= item.weight;
 if (r <= 0) return item.type;
 }
 return items[0].type;
}

// ─── 主生成函数 ───────────────────────────────────────────────────────────────

export interface GeneratedRoleCard {
 name: string;
 faction: string;
 factionType: 'protagonist' | 'antagonist' | 'neutral';
 roleType: string;
 personality: string[];
 motivation: string;
 description: string;
 conflictSeed: string;
 arcSuggestion: string;
 entranceStyle: string;
 appearanceChapter: string;
 relationHint: string;
}

/** 生成姓名（本地随机组合） */
function generateName(existingNames: string[]): string {
 const surnames = ['林', '陈', '苏', '叶', '沈', '顾', '萧', '楚', '慕', '凌', '白', '秦', '韩', '柳', '云', '夜', '墨', '风', '霜', '寒', '裴', '容', '司', '上官', '欧阳', '南宫', '独孤', '东方', '西门', '诸葛'];
 const maleNames = ['渊', '辰', '尘', '寒', '墨', '夜', '玄', '逸', '煜', '霆', '泽', '昊', '宸', '翊', '珩', '衍', '澈', '临', '砚', '枫', '无极', '长安', '九歌', '千秋', '一尘', '无忧', '天行', '破军'];
 const femaleNames = ['瑶', '月', '雪', '霜', '烟', '琉', '璃', '若', '兮', '颜', '清', '浅', '落', '晚', '初', '念', '如梦', '倾城', '无双', '轻尘', '映雪', '凝霜', '听雨', '拂晓'];

 const isFemale = Math.random() < 0.35;
 let name = '';
 let attempts = 0;
 while (attempts < 20) {
 const surname = pick(surnames);
 const given = pick(isFemale ? femaleNames : maleNames);
 name = surname + given;
 if (!existingNames.includes(name)) break;
 attempts++;
 }
 return name;
}

/** 生成单张角色卡 */
function generateSingleCard(book: Book, context: ReturnType<typeof extractRecentPlotContext>, preferredFaction?: 'protagonist' | 'antagonist' | 'neutral'): GeneratedRoleCard {
 const faction = preferredFaction || analyzeFactionGap(book);
 const factionName = pick(FACTIONS[faction]);
 const roleType = weightedPick(ROLE_TYPES);
 const motivation = pick(MOTIVATIONS[faction]);

 // 性格：2正面/负面 + 1中性
 const personalityPool = faction === 'antagonist' ? PERSONALITY_TAGS.negative : PERSONALITY_TAGS.positive;
 const personality = [...pickN(personalityPool, 2), pick(PERSONALITY_TAGS.neutral)];

 const conflictSeed = pick(CONFLICT_SEEDS[faction]);
 const arcSuggestion = pick(ARC_TEMPLATES[faction]);
 const entranceStyle = pick(ENTRANCE_STYLES);
 const appearanceChapter = suggestAppearanceChapter(book);

 // 关联已有角色
 const relationTarget = findRelationTarget(book, faction);
 let relationHint = '暂无关联（书中尚无角色）';
 if (relationTarget) {
 const relationTemplates: Record<string, string[]> = {
 protagonist: [`与「${relationTarget.name}」是旧识`, `受「${relationTarget.name}」之托前来`, `曾被「${relationTarget.name}」救过`, `是「${relationTarget.name}」的同门`],
 antagonist: [`与「${relationTarget.name}」有旧怨`, `暗中监视「${relationTarget.name}」`, `曾是「${relationTarget.name}」的对手`, `觊觎「${relationTarget.name}」的资源`],
 neutral: [`与「${relationTarget.name}」有过交易`, `对「${relationTarget.name}」保持观望`, `掌握「${relationTarget.name}」的秘密`, `与「${relationTarget.name}」互不干涉`],
 };
 relationHint = pick(relationTemplates[faction]);
 }

 const name = generateName(context.existingNames);

 // 生成描述（结合剧情上下文）
 let description = `${personality.join('、')}的${factionName}成员，动机是${motivation}。`;
 if (context.recentEvents.length > 0) {
 const event = pick(context.recentEvents);
 description += `与近期事件「${event}」有潜在关联。`;
 }

 return {
 name,
 faction: factionName,
 factionType: faction,
 roleType,
 personality,
 motivation,
 description,
 conflictSeed,
 arcSuggestion,
 entranceStyle,
 appearanceChapter,
 relationHint,
 };
}

/** 主入口：生成 3 张角色卡 */
export function generateRoleCards(book: Book): GeneratedRoleCard[] {
 const context = extractRecentPlotContext(book);
 const gap = analyzeFactionGap(book);

 // 3张卡：1张填补缺口阵营 + 2张随机阵营（确保多样性）
 const factions: Array<'protagonist' | 'antagonist' | 'neutral'> = [gap];
 const others = (['protagonist', 'antagonist', 'neutral'] as const).filter(f => f !== gap);
 factions.push(pick(others));
 factions.push(pick(['protagonist', 'antagonist', 'neutral'] as const));

 return factions.map(f => generateSingleCard(book, context, f));
}

/** 将生成的角色卡格式化为展示文本 */
export function formatRoleCardForDisplay(card: GeneratedRoleCard, index: number): string {
 return `**角色${index + 1}：${card.name}**
━━━━━━━━━━━━━━━━━━
📌 阵营：${card.faction}（${card.factionType === 'protagonist' ? '主角方' : card.factionType === 'antagonist' ? '敌方' : '第三方'}）
🎭 定位：${card.roleType}
🧠 性格：${card.personality.join(' / ')}
💡 动机：${card.motivation}
📝 简介：${card.description}

⚔️ 冲突种子：${card.conflictSeed}
🔗 关系线索：${card.relationHint}
📖 弧线建议：${card.arcSuggestion}
🚪 出场方式：${card.entranceStyle}
📍 建议出场：${card.appearanceChapter}`;
}

/** 将角色卡转为 RoleProfile 格式（用于保存到角色库） */
export function cardToRoleProfile(card: GeneratedRoleCard): Partial<RoleProfile> {
 return {
 name: card.name,
 faction: card.faction,
 roleType: card.roleType as RoleProfile['roleType'],
 description: card.description,
 aliases: [],
 firstAppearance: card.appearanceChapter,
 chapters: [],
 note: `动机：${card.motivation}\n冲突种子：${card.conflictSeed}\n弧线建议：${card.arcSuggestion}\n出场方式：${card.entranceStyle}\n关系线索：${card.relationHint}`,
 };
}
