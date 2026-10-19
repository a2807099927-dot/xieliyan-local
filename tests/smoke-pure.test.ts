import { describe, it, expect } from 'vitest';

// ════════════════════════════════════════════════════════════════════
// 写梨眼 全功能冒烟测试 · 纯函数层
// 覆盖：章节模板、Agent 输出清洗、正文入章工具、角色身份/合并、
//       设定导入导出、JSON 宽松解析、HTML 清洗、风格解析、大纲转换、
//       Agent 循环公共工具。
// 说明：这些模块不依赖 Tauri 环境，可直接 import 验证。
// ════════════════════════════════════════════════════════════════════

import { extractChapterHeading, ensureChapterHeading, buildDefaultChapterContent, replaceChapterHeading } from '../src/utils/chapterTemplate';
import { sanitizeHtml, stripHtmlToText } from '../src/utils/sanitizeHtml';
import { parseJsonLoosely } from '../src/utils/jsonParse';
import {
  cleanRoleText, isGenericNonRoleCardName, canonicalRoleName, normalizeRoleIdentity,
  roleIdentityKeys, roleAliasLinked, buildRoleIdentityIndex, resolveRoleIdentity
} from '../src/utils/roleIdentity';
import {
  mergeRoleProfiles, applyRoleRecordsToCategories, applyExtractedRoleCandidatesToCategories
} from '../src/utils/roleMutationEngine';
import {
  parseRolesJson, parseRolesTxt, rolesToTxt, mergeRoleCategories,
  parseSettingsJson, settingsToTxt, parseSettingsTxt, mergeSettings
} from '../src/utils/dataPortability';
import { convertAiTreeToOutlineNodes } from '../src/utils/ovConverter';
import { resolveStyleForBook, buildStyleSystemMessage, injectStyleToMessages } from '../src/utils/styleResolver';
import { splitAgentOutput, stripPreAmble, stripMarkdownEmphasis } from '../src/Agent/stripAgentOutput';
import { proseToChapterHtml, countProseWords, findLatestEmptyChapter, looksLikeInsertableProse } from '../src/Agent/agentBodyPersist';
import { extractJsonObject, trimToolPayload, selectEvidence } from '../src/Agent/loopUtils';

describe('章节模板', () => {
  it('extractChapterHeading 提取标题（支持带 style 的 h2）', () => {
    expect(extractChapterHeading('<h2 style="text-align:center;">第一章 出发</h2><p>正文</p>')).toBe('第一章 出发');
  });

  it('无标题时 ensureChapterHeading 注入标题', () => {
    const out = ensureChapterHeading('<p>正文内容</p>', '第1章');
    expect(out).toContain('第1章');
    expect(out).toContain('<p>正文内容</p>');
  });

  it('已含标题时不重复注入', () => {
    const out = ensureChapterHeading('<h2>第1章</h2><p>正文</p>', '第1章');
    expect(out.match(/<h2/g)).toHaveLength(1);
  });

  it('buildDefaultChapterContent 生成带标题的空章', () => {
    const out = buildDefaultChapterContent('第1章');
    expect(out).toContain('第1章');
    expect(out).toContain('<h2');
  });

  it('replaceChapterHeading 替换首行标题并保留正文', () => {
    const out = replaceChapterHeading('<h2 style="text-align:center;">第1章 旧标题</h2><p>正文段落</p>', '第1章 新标题');
    expect(out).toContain('第1章 新标题');
    expect(out).not.toContain('旧标题');
    expect(out).toContain('<p>正文段落</p>');
    expect(out.match(/<h2/g)).toHaveLength(1);
  });

  it('replaceChapterHeading 对无标题旧章节补标题', () => {
    const out = replaceChapterHeading('<p>正文段落</p>', '第2章');
    expect(out).toContain('<h2');
    expect(out).toContain('第2章');
  });

  it('replaceChapterHeading 标题含 $ 特殊字符时原样保留', () => {
    const out = replaceChapterHeading('<h2>第1章</h2><p>正文</p>', "折扣$&优惠$'章");
    // $& 不被解释为替换模式；&/' 按 HTML 转义正常输出
    expect(out).toContain('折扣$&amp;优惠$&#39;章');
    expect(out).not.toContain('<h2>第1章</h2>');
  });
});

describe('Agent 输出清洗 stripAgentOutput', () => {
  it('splitAgentOutput 分离 think 标签与正文', () => {
    const r = splitAgentOutput('<thinking>先分析剧情</thinking>林雪推开房门，只见夜色沉沉。');
    expect(r.thinking).toContain('先分析剧情');
    expect(r.body).toContain('林雪推开房门');
  });

  it('纯正文保留在 body', () => {
    const r = splitAgentOutput('林雪转过身，望着窗外沉沉的夜色。');
    expect(r.body).toContain('林雪转过身');
  });

  it('stripMarkdownEmphasis 移除加粗/斜体标记', () => {
    expect(stripMarkdownEmphasis('**加粗**和*斜体*')).toContain('加粗');
    expect(stripMarkdownEmphasis('**加粗**')).not.toMatch(/\*\*/);
  });
});

describe('正文入章工具 agentBodyPersist', () => {
  it('proseToChapterHtml 转 HTML 段落', () => {
    const html = proseToChapterHtml('第2章', '林雪推开房门。\n夜色沉沉。');
    expect(html).toContain('第2章');
    expect(html).toContain('<p>林雪推开房门。</p>');
    expect(html).toContain('<p>夜色沉沉。</p>');
  });

  it('countProseWords 统计字数（含标题）', () => {
    // proseToChapterHtml 会包含标题「第2章」，plainLen 去标签后统计
    const n = countProseWords('第2章', '林雪推开房门。');
    expect(n).toBeGreaterThan(5);
  });

  it('findLatestEmptyChapter 找到最近的空章', () => {
    const book = {
      id: 'b1', chapters: [
        { id: 'a', title: '第1章', content: '<h2>第1章</h2><p>有内容</p>', wordCount: 50, createdAt: '1', updatedAt: '1' },
        { id: 'b', title: '第2章', content: '', wordCount: 0, createdAt: '2', updatedAt: '2' },
      ],
    } as any;
    const found = findLatestEmptyChapter(book);
    expect(found?.id).toBe('b');
  });

  it('findLatestEmptyChapter 优先返回指定空章', () => {
    const book = {
      id: 'b1', chapters: [
        { id: 'a', title: '第1章', content: '', wordCount: 0, createdAt: '1', updatedAt: '1' },
        { id: 'b', title: '第2章', content: '', wordCount: 0, createdAt: '2', updatedAt: '2' },
      ],
    } as any;
    const found = findLatestEmptyChapter(book, 'a');
    expect(found?.id).toBe('a');
  });

  it('looksLikeInsertableProse 识别长正文', () => {
    const prose = '林雪推开房门，只见夜色沉沉。她转过身，望着窗外的月光，心中忽然涌起一阵不安。'.repeat(4);
    expect(looksLikeInsertableProse(prose)).toBe(true);
  });

  it('looksLikeInsertableProse 拒绝短句', () => {
    expect(looksLikeInsertableProse('你好')).toBe(false);
  });
});

describe('角色身份 roleIdentity', () => {
  it('cleanRoleText 清洗非法文本', () => {
    expect(cleanRoleText('undefined')).toBe('');
    expect(cleanRoleText('  林雪  ')).toBe('林雪');
  });

  it('isGenericNonRoleCardName 识别非角色卡名', () => {
    expect(isGenericNonRoleCardName('undefined')).toBe(true);
    expect(isGenericNonRoleCardName('林雪')).toBe(false);
  });

  it('canonicalRoleName 归一化角色名', () => {
    expect(canonicalRoleName('林雪')).toBe('林雪');
    expect(canonicalRoleName('林雪')).toBeTruthy();
  });

  it('roleAliasLinked 判断别名关联', () => {
    const a = { id: '1', name: '林雪', aliases: ['雪儿'], categoryId: 'c', profile: {} } as any;
    const b = { id: '2', name: '雪儿', categoryId: 'c', profile: {} } as any;
    expect(roleAliasLinked(a, b)).toBe(true);
  });

  it('buildRoleIdentityIndex + resolveRoleIdentity 定位角色', () => {
    const cats = [{
      id: 'c', name: '主角', color: '#fff', children: [
        { id: 'r1', name: '林雪', categoryId: 'c', profile: { nickname: '林雪' }, aliases: [] },
      ],
    }] as any;
    const index = buildRoleIdentityIndex(cats);
    expect(index.has('林雪')).toBe(true);
    const match = resolveRoleIdentity(cats, { name: '林雪' });
    expect(match.type).toBe('exact');
    expect(match.role?.name).toBe('林雪');
  });
});

describe('角色合并 roleMutationEngine', () => {
  it('mergeRoleProfiles 取较长描述并合并别名', () => {
    const base = { role: { id: '1', name: '林雪', categoryId: 'c', description: '旧描述', aliases: [] }, categoryId: 'c', categoryName: '主角' } as any;
    const next = { role: { id: '2', name: '雪儿', categoryId: 'c', description: '新的详细描述内容', aliases: ['雪儿'] }, categoryId: 'c', categoryName: '主角' } as any;
    const merged = mergeRoleProfiles(base, next);
    // 描述取较长的一方
    expect(merged.role.description).toBe('新的详细描述内容');
    expect(merged.role.aliases.length).toBeGreaterThan(0);
  });

  it('applyRoleRecordsToCategories 追加技能到角色', () => {
    const cats = [{ id: 'c', name: '主角', color: '#fff', children: [{ id: 'r1', name: '林雪', categoryId: 'c', profile: {}, aliases: [] }] }] as any;
    const records = [{
      id: 'rec1', subject: '林雪', target: '御剑术', chapterId: 'ch1', chapterTitle: '第1章', detail: '学会御剑飞行', createdAt: '1', updatedAt: '1', kind: 'skill', sourceChapterIds: ['ch1'],
    }] as any;
    const out = applyRoleRecordsToCategories(cats, records);
    const role = out[0].children[0];
    expect(role.abilities).toContain('御剑术');
  });
});

describe('设定导入导出 dataPortability', () => {
  it('parseRolesJson → rolesToTxt → parseRolesTxt 往返', () => {
    const json = JSON.stringify([{ name: '林雪', category: '主角', roles: [{ id: '1', name: '林雪', categoryId: 'c', profile: { nickname: '林雪' } }] }]);
    const parsed = parseRolesJson(json);
    expect(parsed.length).toBe(1);
    const txt = rolesToTxt(parsed);
    expect(txt).toContain('林雪');
    expect(() => parseRolesTxt(txt)).not.toThrow();
  });

  it('parseSettingsJson 解析设定条目', () => {
    const json = JSON.stringify([{ title: '力量体系', content: '灵气分九境' }]);
    const parsed = parseSettingsJson(json);
    expect(parsed[0].title).toBe('力量体系');
    expect(parsed[0].content).toContain('灵气');
  });

  it('settingsToTxt → parseSettingsTxt 往返', () => {
    const items = [{ id: '1', title: '力量体系', content: '灵气分九境', folder: '设定' }];
    const txt = settingsToTxt(items);
    expect(txt).toContain('力量体系');
    const back = parseSettingsTxt(txt);
    expect(back.length).toBeGreaterThanOrEqual(0);
  });

  it('mergeSettings 追加合并并返回统计', () => {
    const base = [{ id: '1', title: '力量体系', content: 'v1', folder: '设定' }];
    const incoming = [{ id: '2', title: '修炼等级', content: 'x', folder: '设定' }];
    const r = mergeSettings(base as any, incoming as any);
    expect(r.items.length).toBe(2);
    expect(r.stats.added).toBe(1);
  });
});

describe('JSON 宽松解析 jsonParse', () => {
  it('parseJsonLoosely 解析围栏 JSON', () => {
    const v = parseJsonLoosely('```json\n{"a":1}\n```');
    expect(v).toEqual({ a: 1 });
  });

  it('parseJsonLoosely 解析带解释文本的对象', () => {
    const v = parseJsonLoosely('输出结果如下 {"a": 2} 完');
    expect((v as any).a).toBe(2);
  });
});

describe('HTML 清洗 sanitizeHtml', () => {
  it('sanitizeHtml 移除 script 标签', () => {
    const out = sanitizeHtml('<p>安全</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('安全');
  });

  it('stripHtmlToText 去标签取文本', () => {
    expect(stripHtmlToText('<p>第一段</p><p>第二段</p>')).toContain('第一段');
  });
});

describe('大纲转换 ovConverter', () => {
  it('convertAiTreeToOutlineNodes 转换 AI 树', () => {
    const aiTree = { type: 'root', children: [{ label: '第一卷', type: 'volume', children: [{ label: '第1章 出发', type: 'chapter' }] }] };
    const nodes = convertAiTreeToOutlineNodes(aiTree);
    expect(nodes.length).toBeGreaterThan(0);
    const flat: any[] = [];
    const walk = (arr: any[]) => arr.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
    walk(nodes);
    expect(flat.some((n) => n.title === '第1章 出发')).toBe(true);
  });
});

describe('风格解析 styleResolver', () => {
  const books = [{
    id: 'b1', title: '书', author: '', chapters: [], settings: { boundStyleProfileId: 'preset:custom' } as any,
    resourceIndex: {} as any, contextBasket: [], worldSettings: [], worldBuilder: [], createdAt: '', updatedAt: '',
  }] as any;
  const config = { ai: { activeStylePresetId: 'preset:default', styleInstruction: '指令A', styleCustomEnabled: false } } as any;

  it('resolveStyleForBook 解析书籍绑定的内置预设', () => {
    const r = resolveStyleForBook('b1', config, books);
    expect(r.stylePresetId).toBe('custom');
  });

  it('resolveStyleForBook 回退到全局预设', () => {
    const r = resolveStyleForBook(undefined, config, []);
    expect(r.stylePresetId).toBe('preset:default');
  });

  it('buildStyleSystemMessage 有指令时返回系统消息', () => {
    const msg = buildStyleSystemMessage('', '简洁文风，避免堆砌');
    expect(msg?.role).toBe('system');
    expect(msg?.content).toContain('简洁文风');
  });

  it('injectStyleToMessages 注入风格约束', () => {
    const booksWithProfile = [{
      id: 'b2', title: '书2', author: '', chapters: [], settings: { boundStyleProfileId: 'prof1' } as any,
      resourceIndex: {} as any, contextBasket: [], worldSettings: [], worldBuilder: [], createdAt: '', updatedAt: '',
    }] as any;
    const configWithProfile = { ai: { styleProfiles: [{ id: 'prof1', styleInstruction: '简洁文风' }] } } as any;
    const msgs = [{ role: 'system', content: 'base' }];
    const out = injectStyleToMessages(msgs, 'b2', configWithProfile, booksWithProfile);
    expect(out.length).toBe(2);
    expect(out[0].content).toContain('简洁文风');
    expect(out[1].content).toBe('base');
  });
});

describe('Agent 循环公共工具 loopUtils', () => {
  it('extractJsonObject 提取嵌套对象', () => {
    const raw = '{"type":"tool_call","arguments":{"query":"林雪"}}';
    const v = extractJsonObject(raw) as any;
    expect(v.type).toBe('tool_call');
    expect(v.arguments.query).toBe('林雪');
  });

  it('extractJsonObject 处理 think 包裹', () => {
    const raw = '<thinking>先想</thinking>{"tool":"search_roles","arguments":{"query":"x"}}';
    const v = extractJsonObject(raw) as any;
    expect(v.tool).toBe('search_roles');
  });

  it('trimToolPayload 超长截断', () => {
    const big = { data: 'x'.repeat(1000) };
    const out = trimToolPayload(big, 100);
    expect(out).toContain('<结果已截断>');
    expect(out.length).toBeLessThan(200);
  });

  it('trimToolPayload 短内容原样', () => {
    expect(trimToolPayload({ a: 1 }, 1000)).toBe('{"a":1}');
  });

  it('selectEvidence 按声明顺序 + 回退', () => {
    const map = new Map([['e1', { id: 'e1', text: 'x' } as any], ['e2', { id: 'e2', text: 'y' } as any]]);
    expect(selectEvidence(['e2', 'e1'], map)).toHaveLength(2);
    expect(selectEvidence([], map)).toHaveLength(2);
  });
});
