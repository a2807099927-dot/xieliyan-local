import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// 写梨眼 用户沉淀技能 Store 测试
// 覆盖：pushCandidates 去重/限频、confirm 注册+持久化、reject 移出、
//       dismissAll、loadSaved 恢复。
// ════════════════════════════════════════════════════════════════════

const mockStore = vi.hoisted(() => {
  let saved: Array<Record<string, unknown>> = [];
  return {
    saved: () => saved,
    setSaved: (v: Array<Record<string, unknown>>) => { saved = v; },
    saveFn: vi.fn(async (skills: Array<Record<string, unknown>>) => { saved = skills; return true; }),
    loadFn: vi.fn(async () => saved),
    appDataFn: vi.fn(async () => 'C:/appdata'),
  };
});

vi.mock('../src/utils/electron', () => ({
  electronAPI: {
    userSkills: {
      load: mockStore.loadFn,
      save: mockStore.saveFn,
      appDataPath: mockStore.appDataFn,
    },
  },
}));

import { useUserSkillStore } from '../src/Agent/userSkillStore';
import { agentSkillRegistry } from '../src/Agent/skills/registry';

function makeCandidate(overrides: Partial<{ name: string; description: string; content: string; source: string }> = {}) {
  return {
    id: '',
    name: overrides.name || '高密度对白改写法',
    description: overrides.description || '改写对白密度时使用',
    content: overrides.content || '把叙述性旁白改为人物对白，通过潜台词展现动机与冲突，保持信息量不流失。',
    source: overrides.source || '来自《冬山》第3章改写',
  };
}

describe('useUserSkillStore pushCandidates', () => {
  beforeEach(() => {
    useUserSkillStore.setState({ candidates: [], savedSkills: [], lastCandidateAtByBook: {}, loaded: false });
  });

  it('接受新候选并入队', () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate()]);
    expect(useUserSkillStore.getState().candidates.length).toBe(1);
  });

  it('同名候选去重不重复入队', () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate()]);
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate()]);
    expect(useUserSkillStore.getState().candidates.length).toBe(1);
  });

  it('与已存技能同名也不弹', async () => {
    const cand = makeCandidate();
    useUserSkillStore.getState().pushCandidates('book-1', [cand]);
    await useUserSkillStore.getState().confirm(useUserSkillStore.getState().candidates[0].id);
    useUserSkillStore.setState({ candidates: [] });
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate()]);
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
  });

  it('同一本书 30 分钟内限频 1 条', () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '方法A' })]);
    // 清空队列但保留限频时间戳
    useUserSkillStore.setState({ candidates: [] });
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '方法B' })]);
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
  });

  it('不同书不互相限频', () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '方法A' })]);
    useUserSkillStore.setState({ candidates: [] });
    useUserSkillStore.getState().pushCandidates('book-2', [makeCandidate({ name: '方法B' })]);
    expect(useUserSkillStore.getState().candidates.length).toBe(1);
  });
});

describe('useUserSkillStore confirm/reject/dismissAll', () => {
  beforeEach(() => {
    useUserSkillStore.setState({ candidates: [], savedSkills: [], lastCandidateAtByBook: {}, loaded: false });
    mockStore.setSaved([]);
    vi.clearAllMocks();
  });

  it('confirm 注册进 agentSkillRegistry 并移出队列', async () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '独特方法X' })]);
    const id = useUserSkillStore.getState().candidates[0].id;
    const ok = await useUserSkillStore.getState().confirm(id);
    expect(ok).toBe(true);
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
    expect(useUserSkillStore.getState().savedSkills.length).toBe(1);
    expect(agentSkillRegistry.get(id)).toBeDefined();
    expect(mockStore.saveFn).toHaveBeenCalled();
  });

  it('confirm 持久化内容含完整技能字段', async () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '持久化技能', content: '完整方法正文……' })]);
    const id = useUserSkillStore.getState().candidates[0].id;
    await useUserSkillStore.getState().confirm(id);
    const saved = mockStore.saved();
    expect(saved[0]).toMatchObject({ name: '持久化技能', content: '完整方法正文……' });
    expect(saved[0]).toHaveProperty('savedAt');
  });

  it('reject 移出队列且不保存', async () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: '要拒绝的方法' })]);
    const id = useUserSkillStore.getState().candidates[0].id;
    await useUserSkillStore.getState().reject(id);
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
    expect(useUserSkillStore.getState().savedSkills.length).toBe(0);
    expect(mockStore.saveFn).not.toHaveBeenCalled();
  });

  it('dismissAll 清空队列', () => {
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: 'A' })]);
    useUserSkillStore.setState({ lastCandidateAtByBook: {} });
    useUserSkillStore.getState().pushCandidates('book-1', [makeCandidate({ name: 'B' })]);
    useUserSkillStore.getState().dismissAll();
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
  });
});

describe('useUserSkillStore loadSaved', () => {
  it('启动加载已存技能并注册', async () => {
    mockStore.setSaved([
      { id: 'skl_prev', name: '旧技能', description: 'desc', content: 'content', source: 'src', savedAt: '2026-01-01' },
    ]);
    await useUserSkillStore.getState().loadSaved();
    expect(useUserSkillStore.getState().loaded).toBe(true);
    expect(useUserSkillStore.getState().savedSkills.length).toBe(1);
    expect(agentSkillRegistry.get('skl_prev')).toBeDefined();
  });

  it('loadSaved 幂等（只加载一次）', async () => {
    mockStore.setSaved([{ id: 'skl_x', name: 'x', description: '', content: 'c', source: 's' }]);
    await useUserSkillStore.getState().loadSaved();
    await useUserSkillStore.getState().loadSaved();
    expect(mockStore.loadFn).toHaveBeenCalledTimes(1);
  });
});

describe('useUserSkillStore proposeFromUsage（手动存入）', () => {
  beforeEach(() => {
    useUserSkillStore.setState({ candidates: [], savedSkills: [], lastCandidateAtByBook: {}, loaded: false });
  });

  it('写入类任务组装写作技能候选（内容含产出摘录）', () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', {
      didWrite: true,
      didReview: false,
      loadedSkill: null,
      draftExcerpt: '林雪转身。她看着窗外。没有说话。',
    });
    const cs = useUserSkillStore.getState().candidates;
    expect(cs.length).toBe(1);
    expect(cs[0].name).toBe('章节正文写作法');
    expect(cs[0].content).toContain('冬山');
    expect(cs[0].content).toContain('林雪转身');
    expect(cs[0].category).toBe('writing');
  });

  it('审查类任务组装审查技能候选', () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', {
      didWrite: false,
      didReview: true,
      loadedSkill: null,
      draftExcerpt: '',
    });
    const cs = useUserSkillStore.getState().candidates;
    expect(cs.length).toBe(1);
    expect(cs[0].name).toBe('正文质量审查法');
    expect(cs[0].category).toBe('review');
  });

  it('加载技能类组装按需加载候选', () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', {
      didWrite: false,
      didReview: false,
      loadedSkill: 'review',
      draftExcerpt: '',
    });
    const cs = useUserSkillStore.getState().candidates;
    expect(cs.length).toBe(1);
    expect(cs[0].name).toBe('按需加载技能库');
    expect(cs[0].content).toContain('review');
  });

  it('无名无用的 usage 不生成候选', () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', {
      didWrite: false,
      didReview: false,
      loadedSkill: null,
      draftExcerpt: '',
    });
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
  });

  it('手动存入不受 30 分钟限频限制', () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', { didWrite: true, didReview: false, loadedSkill: null, draftExcerpt: 'a' });
    useUserSkillStore.setState({ candidates: [] });
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', { didWrite: true, didReview: false, loadedSkill: null, draftExcerpt: 'b' });
    expect(useUserSkillStore.getState().candidates.length).toBe(1);
  });

  it('与已存技能同名不重复弹', async () => {
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', { didWrite: true, didReview: false, loadedSkill: null, draftExcerpt: 'x' });
    await useUserSkillStore.getState().confirm(useUserSkillStore.getState().candidates[0].id);
    useUserSkillStore.setState({ candidates: [] });
    useUserSkillStore.getState().proposeFromUsage('book-1', '冬山', { didWrite: true, didReview: false, loadedSkill: null, draftExcerpt: 'y' });
    expect(useUserSkillStore.getState().candidates.length).toBe(0);
  });
});
