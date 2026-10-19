import { describe, it, expect } from 'vitest';
import { extractRolesFromText, hasRoleMarker } from '../src/Agent/roleExtractor';
import type { RoleProfile } from '../src/types';

function makeRole(name: string, id = 'r1', aliases: string[] = []): RoleProfile {
  return { id, name, aliases, roleType: '配角' } as RoleProfile;
}

// ─── 结构化角色块 ─────────────────────────────────────────────────────────────

describe('extractRolesFromText — 结构化块', () => {
  it('解析【角色】...【/角色】标记', () => {
    const text = `
以下是出场角色：
【角色】
姓名：李云天
阵营：天玄宗
类型：主角
描述：天才少年，觉醒罕见灵根
能力：雷系法术、剑术
【/角色】
    `;
    const result = extractRolesFromText(text, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('李云天');
    expect(result[0].faction).toBe('天玄宗');
    expect(result[0].roleType).toBe('主角');
    expect(result[0].description).toContain('天才少年');
    expect(result[0].abilities).toContain('雷系法术');
    expect(result[0].abilities).toContain('剑术');
    expect(result[0].isUpdate).toBe(false);
    expect(result[0].status).toBe('pending');
  });

  it('识别已有角色为更新模式', () => {
    const existing = [makeRole('李云天', 'role-001')];
    const text = `【角色】姓名：李云天\n描述：突破到元婴期【/角色】`;
    const result = extractRolesFromText(text, existing);
    expect(result).toHaveLength(1);
    expect(result[0].isUpdate).toBe(true);
    expect(result[0].existingRoleId).toBe('role-001');
  });

  it('多个角色块都能解析', () => {
    const text = `
【角色】姓名：角色一\n描述：描述一【/角色】
【角色】姓名：角色二\n描述：描述二【/角色】
    `;
    const result = extractRolesFromText(text, []);
    expect(result).toHaveLength(2);
  });

  it('名字太短（<2字）被过滤', () => {
    const text = `【角色】姓名：A\n描述：太短了【/角色】`;
    const result = extractRolesFromText(text, []);
    expect(result).toHaveLength(0);
  });

  it('名字太长（>10字）被过滤', () => {
    const text = `【角色】姓名：这个角色的名字超过了十个字的限制\n描述：太长了【/角色】`;
    const result = extractRolesFromText(text, []);
    expect(result).toHaveLength(0);
  });
});

// ─── 自然语言提取 ─────────────────────────────────────────────────────────────

describe('extractRolesFromText — 自然语言', () => {
  it('识别 "XXX，是一个..." 模式', () => {
    const text = '在这个世界里，张无忌，是一个武功高强的少年，他性格温和却意志坚定。';
    const result = extractRolesFromText(text, []);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('张无忌');
    expect(result[0].roleType).toBe('待分类');
  });

  it('有结构化标记时不走自然语言路径', () => {
    const text = `
张无忌，是一个武功高强的少年。
【角色】姓名：赵敏\n描述：蒙古郡主【/角色】
    `;
    const result = extractRolesFromText(text, []);
    // 有结构化标记时只解析标记内的
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('赵敏');
  });

  it('过滤常见非角色名词', () => {
    const text = '这个，是一个非常复杂的问题。那个，是一个简单的回答。';
    const result = extractRolesFromText(text, []);
    expect(result).toHaveLength(0);
  });

  it('单次最多提取5个角色', () => {
    const names = ['角色甲', '角色乙', '角色丙', '角色丁', '角色戊', '角色己', '角色庚'];
    const text = names.map(n => `${n}，是一个在这个世界中有着重要地位的人物角色`).join('\n');
    const result = extractRolesFromText(text, []);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('文本太短（<20字）返回空', () => {
    expect(extractRolesFromText('太短了', [])).toHaveLength(0);
  });
});

// ─── 角色类型归一化 ───────────────────────────────────────────────────────────

describe('extractRolesFromText — 角色类型归一化', () => {
  const cases: Array<[string, string]> = [
    ['主角', '主角'],
    ['男主', '主角'],
    ['女主', '女主'],
    ['反派', '反派'],
    ['BOSS', '反派'],
    ['配角', '配角'],
    ['NPC', 'NPC'],
    ['龙套', '龙套'],
    ['势力', '势力'],
    ['未知类型', '待分类'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      const text = `【角色】姓名：测试角色\n类型：${input}\n描述：测试描述内容【/角色】`;
      const result = extractRolesFromText(text, []);
      expect(result).toHaveLength(1);
      expect(result[0].roleType).toBe(expected);
    });
  }
});

// ─── hasRoleMarker ────────────────────────────────────────────────────────────

describe('hasRoleMarker', () => {
  it('有完整标记返回 true', () => {
    expect(hasRoleMarker('【角色】内容【/角色】')).toBe(true);
  });

  it('只有开始标记返回 false', () => {
    expect(hasRoleMarker('【角色】内容')).toBe(false);
  });

  it('空字符串返回 false', () => {
    expect(hasRoleMarker('')).toBe(false);
  });
});
