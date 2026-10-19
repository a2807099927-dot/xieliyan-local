// 模块说明：小说设定卡 + 近期剧情卡 + 近章角色整理卡。
// 铁律：剧情卡 / 角色整理只从剧情档案（memoryBank 章梗概 + archiveRecords）本地拼接。
// 不另调模型「再总结一遍」——档案里已有 plotSynopsis / summary，直接用。
// 给出纲/写作/自主 Agent 用：先明白「这是本什么书」「近几章档案写了什么」。

import type { Book, Chapter, ChapterMemory, RoleProfile, StoryArchiveRecord } from '../types';
import { normalizeGenreId } from './normalize';

function text(value: unknown, max = 800): string {
  const s = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function chapterNo(book: Book, chapter: Chapter, fallback = 0): number {
  const idx = book.chapters.findIndex((c) => c.id === chapter.id);
  return (idx >= 0 ? idx : fallback) + 1;
}

function memoryOf(book: Book, chapterId: string): ChapterMemory | undefined {
  return (book.memoryBank || []).find((m) => m && m.chapterId === chapterId);
}

/** 章梗概：严格优先剧情档案字段，不读正文、不另总结 */
export function chapterArchiveSynopsis(mem: ChapterMemory | undefined): {
  synopsis: string;
  source: 'plotSynopsis' | 'functionSummary' | 'summary' | 'agentOutline' | 'empty';
} {
  if (!mem) return { synopsis: '', source: 'empty' };
  const plot = text(mem.plotAnalysis?.plotSynopsis, 280);
  if (plot) return { synopsis: plot, source: 'plotSynopsis' };
  const func = text(mem.plotAnalysis?.functionSummary, 240);
  if (func) return { synopsis: func, source: 'functionSummary' };
  const sum = text(mem.summary, 240);
  if (sum) return { synopsis: sum, source: 'summary' };
  const outlineSum = text(mem.agentOutline?.summary, 240);
  if (outlineSum) return { synopsis: outlineSum, source: 'agentOutline' };
  return { synopsis: '', source: 'empty' };
}

function resolveGenreLabel(book: Book): string {
  const raw =
    (book as any).resourceIndex?.novelType ||
    (book as any).novelType ||
    (book.settings as any)?.novelType ||
    '';
  const id = normalizeGenreId(String(raw || ''));
  const map: Record<string, string> = {
    virtual_mmo: '虚拟网游 / 双线（现实线 + 游戏线）',
    youxi: '网游 / 游戏题材',
    xuanhuan: '玄幻',
    xianxia: '仙侠',
    dushi: '都市',
    urban: '都市',
    kehuan: '科幻',
    qihuan: '奇幻',
    wuxia: '武侠',
    lishi: '历史',
    lishishuangwen: '历史爽文',
    shuangwen: '爽文',
    xuanyi: '悬疑',
    wenyi: '文娱',
    qingxiaoshuo: '轻小说',
    zhutian: '诸天无限',
    xianshi: '现实向'
  };
  const rawKey = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (rawKey === 'virtual_mmo' || rawKey.includes('virtualmmo')) {
    return map.virtual_mmo;
  }
  return map[id] || (id && id !== 'unknown' ? id : '未标注题材');
}

export function isDualLineGameBook(book: Book): boolean {
  const raw =
    (book as any).resourceIndex?.novelType ||
    (book as any).novelType ||
    (book.settings as any)?.novelType ||
    '';
  const rawKey = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const id = normalizeGenreId(String(raw || ''));
  if (rawKey === 'virtual_mmo' || rawKey.includes('virtualmmo') || id === 'youxi') return true;
  const hay = [
    text((book.settings as any)?.worldSettings, 1200),
    text((book.settings as any)?.plotOutline, 800),
    text(book.title, 80),
    text(book.description, 400)
  ]
    .join('\n')
    .toLowerCase();
  return /虚拟|网游|游戏线|现实线|上线|下线|副本|公会|mmo/.test(hay);
}

/** 小说设定卡：这是本什么书、世界怎么运转、硬规则是什么 */
export function buildNovelSettingCard(book: Book): string {
  const genre = resolveGenreLabel(book);
  const settings = book.settings || ({} as Book['settings']);
  const worldBlob = text((settings as any).worldSettings, 1800);
  const plotBlob = text((settings as any).plotOutline, 1500);
  const chats = text((settings as any).characterChats, 800);
  const loreItems = Array.isArray(book.worldSettings) ? book.worldSettings : [];
  const loreLines = loreItems
    .slice(0, 10)
    .map((item: any) => {
      const title = text(item?.title || item?.name, 40);
      const body = text(item?.content || item?.description || item?.text, 220);
      if (!title && !body) return '';
      return title ? `· ${title}${body ? `：${body}` : ''}` : `· ${body}`;
    })
    .filter(Boolean);

  const dual = isDualLineGameBook(book);
  const hardRules: string[] = [];
  if (dual) {
    hardRules.push(
      '双线硬规则：现实线与游戏线不可无过渡跳线。',
      '从游戏内场景（广场/副本/领地/公会）回到现实家中/线下，必须先下线/退出登录/摘设备；禁止「广场聊完直接就在家里」。',
      '从现实进入游戏，必须先上线/登录/接入；禁止现实动作直接变成游戏动作。',
      '同屏人物要分清：谁在游戏里、谁在现实里、谁在语音/消息跨线。',
      '物品与状态：游戏道具默认不带到现实；现实物品默认不带进游戏，除非本书已有明确设定。'
    );
  }

  hardRules.push(
    '出纲与写作必须遵守本书已有设定与近章事实，不得凭空改世界规则。',
    '地点跳转要有过程：走路/车/传送/下线/上线，禁止瞬移式场景切换。',
    '近期剧情以剧情档案章梗概为准，不得用正文幻觉覆盖档案。'
  );

  const parts = [
    `【小说设定卡】`,
    `书名：《${book.title || '未命名'}》`,
    `题材：${genre}`,
    dual ? '结构：现实线 + 游戏线（虚拟网游）' : '',
    worldBlob ? `世界/设定摘要：\n${worldBlob}` : '',
    plotBlob ? `总纲/主线摘要：\n${plotBlob}` : '',
    chats ? `角色备注：\n${chats}` : '',
    loreLines.length ? `设定条目：\n${loreLines.join('\n')}` : '',
    hardRules.length ? `硬规则：\n${hardRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''
  ].filter(Boolean);

  return parts.join('\n');
}

/**
 * 近期剧情卡：只根据剧情档案章节梗概本地拼接。
 * 来源优先级：plotSynopsis > functionSummary > summary > agentOutline.summary
 * 0 token，不调用模型。
 */
export function buildRecentPlotCard(
  book: Book,
  anchorChapter: Chapter,
  options?: { lookback?: number }
): string {
  const lookback = Math.max(2, Math.min(options?.lookback ?? 5, 8));
  const chapters = book.chapters || [];
  const idx = chapters.findIndex((c) => c.id === anchorChapter.id);
  const end = idx >= 0 ? idx : chapters.length - 1;
  const start = Math.max(0, end - lookback + 1);
  const window = chapters.slice(start, end + 1);

  const lines: string[] = [];
  let lastEnding = '';
  let openLoops: string[] = [];
  let lastLocationHint = '';
  let lastChars: string[] = [];
  let filled = 0;
  let empty = 0;

  for (let i = 0; i < window.length; i++) {
    const ch = window[i];
    const mem = memoryOf(book, ch.id);
    const no = chapterNo(book, ch, start + i);
    const title = ch.title || `第${no}章`;
    const { synopsis, source } = chapterArchiveSynopsis(mem);
    const ending = text(mem?.agentOutline?.endingState, 120);
    const loops = Array.isArray(mem?.agentOutline?.openLoops)
      ? mem!.agentOutline!.openLoops.map((x) => text(x, 60)).filter(Boolean).slice(0, 3)
      : [];
    const chars = Array.isArray(mem?.agentOutline?.charactersInvolved)
      ? mem!.agentOutline!.charactersInvolved.map((x) => text(x, 20)).filter(Boolean).slice(0, 6)
      : [];
    const locs = Array.isArray(mem?.agentOutline?.locations)
      ? mem!.agentOutline!.locations.map((x) => text(x, 30)).filter(Boolean).slice(0, 3)
      : [];

    // 档案记录里再捞一点人物/地点（仍是档案，不读正文）
    const recs = Array.isArray(mem?.archiveRecords) ? mem!.archiveRecords! : [];
    if (!chars.length) {
      const fromRec = recs
        .filter((r) => r.kind === 'character')
        .map((r) => text(r.subject || r.title, 20))
        .filter(Boolean)
        .slice(0, 6);
      if (fromRec.length) chars.push(...fromRec);
    }

    if (ending) lastEnding = ending;
    if (loops.length) openLoops = loops;
    if (locs.length) lastLocationHint = locs.join('、');
    if (chars.length) lastChars = chars;

    if (synopsis || ending || loops.length) filled += 1;
    else empty += 1;

    if (!synopsis && !ending && !loops.length && !chars.length) {
      lines.push(
        `第${no}章 ${title}｜（剧情档案未整理 / 无章梗概 — 出纲时勿臆造本章事实，可只承接近有档案章）`
      );
      continue;
    }

    const bits = [
      synopsis ? `档案梗概：${synopsis}` : '',
      ending ? `结尾状态：${ending}` : '',
      locs.length ? `地点：${locs.join('、')}` : '',
      chars.length ? `在场：${chars.join('、')}` : '',
      loops.length ? `未收：${loops.join('；')}` : '',
      source !== 'empty' ? `来源字段：${source}` : ''
    ].filter(Boolean);
    lines.push(`第${no}章 ${title}｜${bits.join(' ｜ ')}`);
  }

  const continuityHints: string[] = [];
  continuityHints.push(
    `数据来源：剧情档案 memoryBank（章梗概/结尾/在场），本地拼接，未另调模型总结。有档案 ${filled} 章，空档 ${empty} 章。`
  );
  if (lastEnding) continuityHints.push(`最近结尾状态：${lastEnding}`);
  if (lastLocationHint) continuityHints.push(`最近主要地点：${lastLocationHint}`);
  if (lastChars.length) continuityHints.push(`最近在场人物：${lastChars.join('、')}`);
  if (openLoops.length) continuityHints.push(`未收束线索：${openLoops.join('；')}`);

  if (isDualLineGameBook(book)) {
    continuityHints.push(
      '续接时先判断：当前收束点在现实还是游戏。若要从游戏场景接到现实家中，必须写清下线过程。'
    );
  }

  return [
    '【近期剧情卡 · 来自剧情档案章梗概】',
    `锚定章：${anchorChapter.title || '当前章'}（含其前 ${Math.max(0, window.length - 1)} 章档案）`,
    ...lines,
    continuityHints.length ? `续接要点：\n${continuityHints.map((x) => `· ${x}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function listRoles(book: Book): RoleProfile[] {
  return (book.resourceIndex?.customCharacterCategories || []).flatMap((c) => c.children || []);
}

/**
 * 近章角色整理卡：只从 archiveRecords + 已有角色卡本地整理。
 * 0 token。用于出纲时知道谁最近出场、状态/技能/关系变化。
 */
export function buildRecentRoleCard(
  book: Book,
  anchorChapter: Chapter,
  options?: { lookback?: number; maxRoles?: number }
): string {
  const lookback = Math.max(2, Math.min(options?.lookback ?? 5, 8));
  const maxRoles = options?.maxRoles ?? 8;
  const chapters = book.chapters || [];
  const idx = chapters.findIndex((c) => c.id === anchorChapter.id);
  const end = idx >= 0 ? idx : chapters.length - 1;
  const start = Math.max(0, end - lookback + 1);
  const windowIds = new Set(chapters.slice(start, end + 1).map((c) => c.id));

  const records: StoryArchiveRecord[] = [];
  for (const mem of book.memoryBank || []) {
    if (!mem || !windowIds.has(mem.chapterId)) continue;
    for (const r of mem.archiveRecords || []) {
      if (r) records.push(r);
    }
  }

  // 按 subject 聚合
  type Agg = {
    name: string;
    kinds: Set<string>;
    details: string[];
    chapters: Set<string>;
  };
  const byName = new Map<string, Agg>();
  for (const r of records) {
    if (!['character', 'item', 'skill', 'faction', 'relationship'].includes(r.kind)) continue;
    const name = text(r.subject, 30);
    if (!name) continue;
    const key = name.toLowerCase();
    const g = byName.get(key) || { name, kinds: new Set(), details: [], chapters: new Set() };
    g.kinds.add(r.kind);
    const bit = text(
      [r.title, r.target, r.detail, r.status].filter(Boolean).join(' · '),
      100
    );
    if (bit && g.details.length < 4 && !g.details.includes(bit)) g.details.push(bit);
    if (r.chapterTitle) g.chapters.add(text(r.chapterTitle, 40));
    byName.set(key, g);
  }

  const roles = listRoles(book);
  const lines: string[] = [];
  const sorted = Array.from(byName.values()).sort((a, b) => b.details.length - a.details.length);

  for (const g of sorted.slice(0, maxRoles)) {
    const card = roles.find(
      (r) =>
        r.name === g.name ||
        (r.aliases || []).some((a) => a === g.name) ||
        r.name.includes(g.name) ||
        g.name.includes(r.name)
    );
    const profileBits = card
      ? [
          card.roleType ? `类型:${card.roleType}` : '',
          card.faction ? `阵营:${card.faction}` : '',
          card.realm ? `境界:${card.realm}` : '',
          text(card.plotProgress || (card.customFields as any)?.recentStatus, 80)
            ? `近况:${text(card.plotProgress || (card.customFields as any)?.recentStatus, 80)}`
            : ''
        ].filter(Boolean)
      : ['（档案出现，角色卡未建或未匹配）'];

    lines.push(
      `· ${g.name}｜${profileBits.join('；')}｜近章档案：${g.details.join(' / ') || '有出场记录'}｜章：${Array.from(g.chapters).slice(0, 3).join('、') || '—'}`
    );
  }

  if (!lines.length) {
    // 退回：仅用角色卡里近况非空的
    for (const r of roles.slice(0, maxRoles)) {
      const recent = text(r.plotProgress || (r.customFields as any)?.recentStatus, 100);
      if (!recent) continue;
      lines.push(
        `· ${r.name}｜${[r.roleType, r.faction, r.realm].filter(Boolean).join('/')}｜卡内近况:${recent}`
      );
    }
  }

  return [
    '【近章角色整理卡 · 来自剧情档案 archiveRecords + 角色卡】',
    '说明：本地从近章档案记录整理，不另调模型；建卡/改卡仍须用户确认。',
    lines.length ? lines.join('\n') : '· （近章档案无人物/技能/关系记录）'
  ].join('\n');
}

/** 合并设定卡 + 档案剧情卡 + 档案角色卡 */
export function buildStoryCanonBlock(book: Book, anchorChapter: Chapter): string {
  const setting = buildNovelSettingCard(book);
  const recent = buildRecentPlotCard(book, anchorChapter);
  const roles = buildRecentRoleCard(book, anchorChapter);
  return [setting, recent, roles].filter(Boolean).join('\n\n');
}
