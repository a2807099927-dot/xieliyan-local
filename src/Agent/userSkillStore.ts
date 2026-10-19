// 用户沉淀技能 Store（用户确认制）。
// Agent 完成任务后可能提炼出可复用方法，先作为候选完整展示，用户确认才存入。
// 持久化到 app_data/user_skills.json，下次会话启动时加载并注册进 agentSkillRegistry。
import { create } from 'zustand';
import { electronAPI } from '../utils/electron';
import { useIslandStore } from '../store/useIslandStore';
import { agentSkillRegistry, type AgentSkillContext } from './skills/registry';

export interface SkillCandidate {
  id: string;
  name: string;
  description: string;
  content: string;
  source: string;
  category?: 'writing' | 'review' | 'reference';
  savedAt?: string;
}

interface UserSkillState {
  candidates: SkillCandidate[];
  savedSkills: SkillCandidate[];
  /** 限频记录：bookId → 最近一次候选生成时间戳 */
  lastCandidateAtByBook: Record<string, number>;
  loaded: boolean;
  pushCandidates(bookId: string, cs: SkillCandidate[]): void;
  /** 手动「存入技能」入口：从本次 Agent 任务的工具使用汇总组装候选并入队（跳过限频） */
  proposeFromUsage(bookId: string, bookTitle: string, usage: { didWrite: boolean; didReview: boolean; loadedSkill: string | null; draftExcerpt: string }): void;
  confirm(id: string): Promise<boolean>;
  reject(id: string): Promise<boolean>;
  dismissAll(): void;
  loadSaved(): Promise<void>;
}

/** 生成候选 id */
function makeCandidateId(): string {
  return `skl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 注册进 agentSkillRegistry，并返回可移除句柄 */
function registerDynamic(skill: SkillCandidate): void {
  agentSkillRegistry.register({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    dynamic: true,
    load: (ctx: AgentSkillContext) => skill.content,
  });
}

/** 判断两个候选是否"相似"（同名或同来源同名字，避免重复弹） */
function isSimilar(a: { name: string; source?: string; content?: string }, b: { name: string; source?: string; content?: string }): boolean {
  if (a.name === b.name) return true;
  if (a.source && b.source && a.source === b.source) return true;
  if (a.content && b.content && a.content.length > 40 && b.content.length > 40 && a.content === b.content) return true;
  return false;
}

/** 从本次 Agent 任务的工具使用汇总组装候选（内容反映真实对话，非模板） */
function makeCandidateFromUsage(
  bookTitle: string,
  usage: { didWrite: boolean; didReview: boolean; loadedSkill: string | null; draftExcerpt: string }
): SkillCandidate | null {
  const { didWrite, didReview, loadedSkill, draftExcerpt } = usage;

  if (didWrite) {
    return {
      id: '',
      name: '章节正文写作法',
      description: '按细纲/指令生成可直接落稿的章节正文时使用',
      content: [
        `本节章写作方法（来自《${bookTitle}》的一次成功实践）：`,
        '本次工具链：定位章节 → 读取全章 → 对齐设定与承接 → 按细纲生成正文。',
        draftExcerpt ? `本次产出节选：\n${draftExcerpt}` : '',
        '要点：正文必须可直接落稿，不输出计划/解释；人物/地点/道具来自档案或设定，避免凭空引入。',
      ].filter(Boolean).join('\n\n'),
      source: `来自《${bookTitle}》章节写作`,
      category: 'writing',
    };
  }
  if (didReview) {
    return {
      id: '',
      name: '正文质量审查法',
      description: '对已写正文做质量自检/找硬伤时使用',
      content: [
        `本节章审查方法（来自《${bookTitle}》的一次成功实践）：`,
        '用 review_draft 对草稿做硬约束检查（角色一致性/禁止项/必含节拍/连贯性/注水/指令忠实），命中 hard 问题即输出修订意见并要求按意见改写，复审通过后定稿。',
        draftExcerpt ? `本次审查对象节选：\n${draftExcerpt}` : '',
      ].filter(Boolean).join('\n\n'),
      source: `来自《${bookTitle}》正文审查`,
      category: 'review',
    };
  }
  if (loadedSkill) {
    return {
      id: '',
      name: '按需加载技能库',
      description: '遇到写作/审查/设定对齐场景时先加载对应技能再执行',
      content: `本次调用了 load_skill("${loadedSkill}") 后完成《${bookTitle}》相关任务。要点：写长内容前先加载 writing，评价/自检前先加载 review，对齐设定前先加载 story_canon，再按技能全文执行。`,
      source: `来自《${bookTitle}》技能使用`,
      category: 'reference',
    };
  }
  return null;
}

export const useUserSkillStore = create<UserSkillState>((set, get) => ({
  candidates: [],
  savedSkills: [],
  lastCandidateAtByBook: {},
  loaded: false,

  pushCandidates: (bookId, cs) => {
    const now = Date.now();
    const lastAt = get().lastCandidateAtByBook[bookId] || 0;
    // 限频：同一本书 30 分钟内最多 1 条候选
    if (now - lastAt < 30 * 60 * 1000) return;
    if (!Array.isArray(cs) || cs.length === 0) return;

    const known = [...get().candidates, ...get().savedSkills];
    const fresh = cs.filter((c) => c && c.name && c.content && !known.some((k) => isSimilar(k, c)));
    if (fresh.length === 0) return;

    set((state) => ({
      candidates: [...state.candidates, ...fresh.map((c) => ({ ...c, id: c.id || makeCandidateId() }))],
      lastCandidateAtByBook: { ...state.lastCandidateAtByBook, [bookId]: now },
    }));
  },

  /** 组装候选：内容反映本次实际做的（工具链 + 产出摘录），而非固定模板 */
  proposeFromUsage: (bookId, bookTitle, usage) => {
    const skill = makeCandidateFromUsage(bookTitle, usage);
    if (!skill) return;
    const known = [...get().candidates, ...get().savedSkills];
    if (known.some((k) => isSimilar(k, skill))) {
      // 已存在同名候选/技能：不重复弹，给一个轻提示
      useIslandStore.getState().show({ type: 'success', message: '该技能已在库中', autoHideMs: 1400 });
      return;
    }
    set((state) => ({
      candidates: [...state.candidates, { ...skill, id: makeCandidateId() }],
    }));
  },

  confirm: async (id) => {
    const cand = get().candidates.find((c) => c.id === id);
    if (!cand) return false;
    const saved = { ...cand, savedAt: new Date().toISOString() };
    // 注册进 registry（动态技能，本次会话即可用）
    registerDynamic(saved);
    const nextSaved = [...get().savedSkills.filter((s) => s.id !== id), saved];
    set((state) => ({
      savedSkills: nextSaved,
      candidates: state.candidates.filter((c) => c.id !== id),
    }));
    try {
      await electronAPI.userSkills.save(nextSaved.map((s) => ({ ...s })));
    } catch { /* 持久化失败不阻断本次会话 */ }
    return true;
  },

  reject: async (id) => {
    set((state) => ({
      candidates: state.candidates.filter((c) => c.id !== id),
    }));
    return true;
  },

  dismissAll: () => {
    set({ candidates: [] });
  },

  loadSaved: async () => {
    if (get().loaded) return;
    try {
      const list = await electronAPI.userSkills.load();
      const skills = (Array.isArray(list) ? list : [])
        .map((s) => ({ ...s } as unknown as SkillCandidate))
        .filter((s) => s && typeof s.name === 'string' && s.name && typeof s.content === 'string' && s.content)
        .map((s) => ({ ...s, id: s.id || makeCandidateId() }));
      if (skills.length) {
        for (const s of skills) registerDynamic(s);
      }
      set({ savedSkills: skills, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
