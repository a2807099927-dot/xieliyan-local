// roleIdentity 回归测试
//
// 目的：角色身份规则是角色卡合并/去重的唯一真相（模块注释已明确禁止局部 normalize）。
// 这些用例锁定现有行为，以便后续拆分 RolesPanel / rolePanelLogic 时不会锹误合并规则。

import { describe, it, expect } from 'vitest';
import {
  cleanRoleText,
  canonicalRoleName,
  normalizeRoleIdentity,
  isGenericNonRoleCardName,
  roleIdentityKeys,
  looksLikeAliasRelation,
} from '../roleIdentity';

describe('cleanRoleText', () => {
  it('保留正常中文姓名并去除首尾空白', () => {
    expect(cleanRoleText('  洪游  ')).toBe('洪游');
  });

  it('剔除模板/代码泄漏产生的脏文本', () => {
    expect(cleanRoleText('undefined')).toBe('');
    expect(cleanRoleText('null')).toBe('');
    expect(cleanRoleText('role.name')).toBe('');
    expect(cleanRoleText('createdAt')).toBe('');
  });

  it('剔除引号、括号、反斜杠等结构字符', () => {
    expect(cleanRoleText('"邹天"')).toBe('邹天');
    expect(cleanRoleText('[邹天]')).toBe('邹天');
    expect(cleanRoleText('{邹天}')).toBe('邹天');
  });

  it('把冒号/逗号归一为空格并压缩连续空白', () => {
    expect(cleanRoleText('姓名:洪游')).toBe('姓名 洪游');
    expect(cleanRoleText('洪游,邹天')).toBe('洪游 邹天');
  });

  it('全部被剔除时返回 fallback', () => {
    expect(cleanRoleText('undefined', '未命名')).toBe('未命名');
    expect(cleanRoleText(null, '未命名')).toBe('未命名');
    expect(cleanRoleText(undefined, '未命名')).toBe('未命名');
  });
});

describe('canonicalRoleName', () => {
  it('去除括号内的附加说明与所有空白', () => {
    expect(canonicalRoleName('洪游（会长）')).toBe('洪游');
    expect(canonicalRoleName('洪游(会长)')).toBe('洪游');
    expect(canonicalRoleName(' 邹 天 ')).toBe('邹天');
  });
});

describe('normalizeRoleIdentity', () => {
  it('统一大小写、去间隔点与括号，用作身份比对键', () => {
    expect(normalizeRoleIdentity('ED')).toBe('ed');
    expect(normalizeRoleIdentity('Zou·Tian')).toBe('zoutian');
    expect(normalizeRoleIdentity('洪游（会长）')).toBe('洪游');
  });

  it('同一角色的不同书写归一到同一键', () => {
    expect(normalizeRoleIdentity(' ed ')).toBe(normalizeRoleIdentity('ED'));
  });
});

describe('isGenericNonRoleCardName', () => {
  it('泛称与空值不应建角色卡', () => {
    expect(isGenericNonRoleCardName('')).toBe(true);
    expect(isGenericNonRoleCardName('主角')).toBe(true);
    expect(isGenericNonRoleCardName('反派')).toBe(true);
    expect(isGenericNonRoleCardName('待确认配角')).toBe(true);
    expect(isGenericNonRoleCardName('旁白')).toBe(true);
    expect(isGenericNonRoleCardName('系统')).toBe(true);
  });

  it('真实人名应建角色卡', () => {
    expect(isGenericNonRoleCardName('洪游')).toBe(false);
    expect(isGenericNonRoleCardName('邹天')).toBe(false);
    expect(isGenericNonRoleCardName('ED')).toBe(false);
  });
});

describe('roleIdentityKeys', () => {
  it('合并主名与别名，并按归一形式去重', () => {
    expect(roleIdentityKeys({ name: '邹天', aliases: ['ED'] })).toEqual([
      '邹天',
      'ed',
    ]);
  });

  it('剔除长度不足 2 的噪声键', () => {
    expect(roleIdentityKeys({ name: '邹天', aliases: ['A'] })).toEqual(['邹天']);
  });

  it('重复别名不会产生重复键', () => {
    expect(
      roleIdentityKeys({ name: '邹天', aliases: ['邹天', ' 邹 天 '] }),
    ).toEqual(['邹天']);
  });

  it('无 aliases 字段时不报错', () => {
    expect(roleIdentityKeys({ name: '洪游' })).toEqual(['洪游']);
  });
});

describe('looksLikeAliasRelation', () => {
  it('识别“游戏ID就是X”这类别名说明', () => {
    expect(looksLikeAliasRelation('他的游戏ID就是洪游', '洪游')).toBe(true);
    expect(looksLikeAliasRelation('本名叫做邹天', '邹天')).toBe(true);
  });

  it('只是顺带提到名字不算别名关系', () => {
    expect(looksLikeAliasRelation('洪游走到对面坐下', '洪游')).toBe(false);
  });

  it('目标名未出现在文本中时返回 false', () => {
    expect(looksLikeAliasRelation('他的游戏ID就是洪游', '邹天')).toBe(false);
  });

  it('空输入安全返回 false', () => {
    expect(looksLikeAliasRelation('', '洪游')).toBe(false);
    expect(looksLikeAliasRelation('任意文本', '')).toBe(false);
  });
});
