// 角色库 / 设定库 的导入导出（JSON + TXT）+ 合并策略 + TXT 技能自动解析
//
// 说明：
// - 复用应用已有的原生文件命令（electronAPI.fs.selectFile / selectSavePath /
//   readTextFile / saveTextFile），无需新增 @tauri-apps/plugin-* 依赖或权限。
// - 角色导入：增量合并（同名分类合并；同名/别名角色只补空缺，绝不覆盖）。
// - 设定导入：增量去重（按标题，存在则跳过，只加入本地没有的新条目）。
// - TXT 设定解析：首行作为文件夹名，每个【标题】块解析为一条独立设定。

import { electronAPI } from './electron';
import type { Book } from '../types';
import type { OutlineSubItem } from '../types/ov';

// ── 类型（结构化，宽松即可）───────────────────────────────────────────
type AnyRole = {
  id: string;
  name: string;
  aliases?: string[];
  roleType?: string;
  faction?: string;
  description?: string;
  profession?: string;
  firstAppearance?: string;
  chapters?: unknown;
  customFields?: Record<string, string>;
  [k: string]: unknown;
};

type AnyCategory = {
  id: string;
  name: string;
  isAuto?: boolean;
  children: AnyRole[];
  order?: number;
  [k: string]: unknown;
};

type SettingItem = OutlineSubItem & { folder?: string };

export type IoFormat = 'json' | 'txt';

const DEFAULT_SETTINGS_FOLDER = '背景设定';
const TXT_IMPORT_FALLBACK_FOLDER = '导入设定';

// ── 小工具 ────────────────────────────────────────────────────────────
function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T;
}

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase();
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function splitList(s?: string): string[] {
  if (!s) return [];
  return s
    .split(/[、,，;；\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function appearanceNames(json?: string): string {
  if (!json) return '';
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr
        .map((x) => (x && typeof x === 'object' ? String((x as any).name ?? '') : String(x ?? '')))
        .filter(Boolean)
        .join('、');
    }
  } catch {
    /* not JSON, ignore */
  }
  return '';
}

// ── 原生文件读写（复用现有 electronAPI.fs 命令）──────────────────────
export async function saveTextViaDialog(
  defaultName: string,
  content: string
): Promise<'saved' | 'cancelled'> {
  const { path } = await electronAPI.fs.selectSavePath({ defaultPath: defaultName });
  if (!path) return 'cancelled';
  await electronAPI.fs.saveTextFile({ path, content });
  return 'saved';
}

export async function readTextViaDialog(): Promise<string | null> {
  const { path } = await electronAPI.fs.selectFile();
  if (!path) return null;
  const { text } = await electronAPI.fs.readTextFile({ path });
  return text ?? '';
}

// ══════════════════════════════════════════════════════════════════════
// 角色库
// ══════════════════════════════════════════════════════════════════════

function roleIdentitySet(r: AnyRole): Set<string> {
  const s = new Set<string>();
  if (r.name) s.add(norm(r.name));
  (r.aliases || []).forEach((a) => {
    if (a) s.add(norm(a));
  });
  return s;
}

function findExistingRole(
  cats: AnyCategory[],
  incoming: AnyRole
): { cat: AnyCategory; role: AnyRole } | null {
  const idIn = roleIdentitySet(incoming);
  for (const cat of cats) {
    for (const role of cat.children || []) {
      const idEx = roleIdentitySet(role);
      for (const key of idIn) {
        if (idEx.has(key)) return { cat, role };
      }
    }
  }
  return null;
}

// 只补空缺：保留原有数据，只把原有缺失的字段用新数据补上
function fillGapsRole(existing: AnyRole, incoming: AnyRole): void {
  const scalarKeys: Array<keyof AnyRole> = [
    'roleType',
    'faction',
    'description',
    'profession',
    'firstAppearance',
  ];
  for (const k of scalarKeys) {
    if (isEmpty(existing[k]) && !isEmpty(incoming[k])) {
      (existing as any)[k] = incoming[k];
    }
  }
  // 别名并集（保序去重）
  const mergedAliases: string[] = [];
  [...(existing.aliases || []), ...(incoming.aliases || [])].forEach((a) => {
    if (a && !mergedAliases.some((m) => norm(m) === norm(a))) mergedAliases.push(a);
  });
  if (mergedAliases.length) existing.aliases = mergedAliases;
  // customFields：只补原有缺失的键
  if (incoming.customFields) {
    existing.customFields = existing.customFields || {};
    for (const [k, v] of Object.entries(incoming.customFields)) {
      if (isEmpty(existing.customFields[k]) && !isEmpty(v)) {
        existing.customFields[k] = v;
      }
    }
  }
}

export function mergeRoleCategories(
  existing: AnyCategory[],
  incoming: AnyCategory[]
): { categories: AnyCategory[]; stats: { added: number; updated: number; newCategories: number } } {
  const result: AnyCategory[] = clone(existing || []);
  let added = 0;
  let updated = 0;
  let newCategories = 0;

  for (const inCat of incoming || []) {
    let target = result.find((c) => norm(c.name) === norm(inCat.name));
    if (!target) {
      target = {
        id: uid('cat_'),
        name: inCat.name || '导入分类',
        isAuto: false,
        children: [],
        order: result.length,
      };
      result.push(target);
      newCategories++;
    }
    for (const inRole of inCat.children || []) {
      if (!inRole || !inRole.name) continue;
      const found = findExistingRole(result, inRole);
      if (found) {
        fillGapsRole(found.role, inRole);
        updated++;
      } else {
        const created = clone(inRole);
        created.id = uid('role_');
        target.children.push(created);
        added++;
      }
    }
  }
  return { categories: result, stats: { added, updated, newCategories } };
}

// —— 角色 JSON —— //
export function parseRolesJson(text: string): AnyCategory[] {
  const data = JSON.parse(text);
  let cats: any[];
  if (Array.isArray(data)) {
    // 可能是分类数组，也可能是角色数组
    if (data.length && data[0] && Array.isArray(data[0].children)) {
      cats = data;
    } else {
      cats = [{ id: uid('cat_'), name: '导入角色', isAuto: false, children: data, order: 0 }];
    }
  } else if (data && Array.isArray(data.customCharacterCategories)) {
    cats = data.customCharacterCategories;
  } else {
    throw new Error('无法识别的角色数据格式（应为分类数组或 { customCharacterCategories: [] }）');
  }
  // 归一化
  return cats.map((c: any) => ({
    id: String(c.id || uid('cat_')),
    name: String(c.name || '导入分类'),
    isAuto: !!c.isAuto,
    order: typeof c.order === 'number' ? c.order : 0,
    children: Array.isArray(c.children)
      ? c.children.filter((r: any) => r && r.name).map((r: any) => ({ ...r }))
      : [],
  }));
}

// —— 角色 TXT —— //
export function rolesToTxt(cats: AnyCategory[]): string {
  const parts: string[] = [];
  for (const cat of cats || []) {
    const lines: string[] = [`【分类：${cat.name}】`, ''];
    (cat.children || []).forEach((r, idx) => {
      if (idx > 0) lines.push('----------------');
      lines.push(`姓名：${r.name || ''}`);
      if (r.aliases && r.aliases.length) lines.push(`别名：${r.aliases.join('、')}`);
      if (r.roleType) lines.push(`类型：${r.roleType}`);
      if (r.faction) lines.push(`势力：${r.faction}`);
      if (r.profession) lines.push(`职业：${r.profession}`);
      if (r.firstAppearance) lines.push(`首次登场：${r.firstAppearance}`);
      const cf = r.customFields || {};
      const skills = cf.skills || appearanceNames(cf.appearance);
      if (skills) lines.push(`功法/技能：${skills}`);
      if (cf.equipment) lines.push(`装备：${cf.equipment}`);
      if (cf.items) lines.push(`道具：${cf.items}`);
      if (r.description) lines.push(`简介：${r.description}`);
    });
    parts.push(lines.join('\n').replace(/\s+$/, ''));
  }
  return parts.join('\n\n') + '\n';
}

const ROLE_TXT_LABELS: Record<string, string> = {
  姓名: 'name',
  名称: 'name',
  别名: 'aliases',
  类型: 'roleType',
  势力: 'faction',
  职业: 'profession',
  首次登场: 'firstAppearance',
  '功法/技能': 'skills',
  技能: 'skills',
  功法: 'skills',
  装备: 'equipment',
  道具: 'items',
  简介: 'description',
  描述: 'description',
};

function finalizeRoleFromRaw(raw: Record<string, string>): AnyRole {
  const r: AnyRole = { id: uid('role_'), name: (raw.name || '').trim() };
  if (raw.aliases) r.aliases = splitList(raw.aliases);
  if (raw.roleType) r.roleType = raw.roleType.trim();
  if (raw.faction) r.faction = raw.faction.trim();
  if (raw.profession) r.profession = raw.profession.trim();
  if (raw.firstAppearance) r.firstAppearance = raw.firstAppearance.trim();
  if (raw.description) r.description = raw.description.trim();
  const cf: Record<string, string> = {};
  if (raw.skills) {
    const s = splitList(raw.skills);
    if (s.length) {
      cf.skills = s.join('、');
      cf.appearance = JSON.stringify(s.map((name) => ({ name, detail: '' })));
    }
  }
  if (raw.equipment) cf.equipment = raw.equipment.trim();
  if (raw.items) cf.items = raw.items.trim();
  if (Object.keys(cf).length) r.customFields = cf;
  return r;
}

export function parseRolesTxt(text: string): AnyCategory[] {
  const lines = text.split(/\r?\n/);
  const cats: AnyCategory[] = [];
  let curCat: AnyCategory | null = null;
  let raw: Record<string, string> | null = null;
  let lastField: string | null = null;

  const ensureCat = (name: string): AnyCategory => {
    let c = cats.find((x) => norm(x.name) === norm(name));
    if (!c) {
      c = { id: uid('cat_'), name, isAuto: false, children: [], order: cats.length };
      cats.push(c);
    }
    return c;
  };
  const commitRole = () => {
    if (raw && (raw.name || '').trim()) {
      const cat = curCat || ensureCat('导入角色');
      cat.children.push(finalizeRoleFromRaw(raw));
    }
    raw = null;
    lastField = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();
    const ch = trimmed.match(/^【分类[:：](.+)】$/);
    if (ch) {
      commitRole();
      curCat = ensureCat(ch[1].trim());
      continue;
    }
    if (/^-{3,}$/.test(trimmed) || /^={3,}$/.test(trimmed)) {
      commitRole();
      continue;
    }
    const kv = trimmed.match(/^([^:：]{1,10})[:：]\s*(.*)$/);
    if (kv && ROLE_TXT_LABELS[kv[1].trim()]) {
      const field = ROLE_TXT_LABELS[kv[1].trim()];
      if (field === 'name') commitRole();
      if (!raw) raw = {};
      raw[field] = kv[2];
      lastField = field;
      continue;
    }
    if (raw && lastField && trimmed) {
      raw[lastField] += '\n' + line;
    }
  }
  commitRole();
  return cats;
}

// —— 角色：高层编排 —— //
export async function exportRoles(book: Book, format: IoFormat): Promise<'saved' | 'cancelled'> {
  const cats = (book.resourceIndex?.customCharacterCategories ?? []) as unknown as AnyCategory[];
  const bookName = (book.title || '未命名').trim();
  if (format === 'json') {
    return saveTextViaDialog(`${bookName}-角色档案.json`, JSON.stringify(cats, null, 2));
  }
  return saveTextViaDialog(`${bookName}-角色档案.txt`, rolesToTxt(cats));
}

export async function importRolesFromFile(
  book: Book,
  format: IoFormat
): Promise<
  | { cancelled: true }
  | {
      cancelled: false;
      categories: AnyCategory[];
      stats: { added: number; updated: number; newCategories: number };
    }
> {
  const text = await readTextViaDialog();
  if (text == null) return { cancelled: true };
  const incoming = format === 'json' ? parseRolesJson(text) : parseRolesTxt(text);
  const existing = (book.resourceIndex?.customCharacterCategories ?? []) as unknown as AnyCategory[];
  const { categories, stats } = mergeRoleCategories(existing, incoming);
  return { cancelled: false, categories, stats };
}

// ══════════════════════════════════════════════════════════════════════
// 设定库
// ══════════════════════════════════════════════════════════════════════

export function mergeSettings(
  existing: SettingItem[],
  incoming: SettingItem[]
): { items: SettingItem[]; stats: { added: number; skipped: number } } {
  const result: SettingItem[] = clone(existing || []);
  const seen = new Set(result.map((i) => norm(i.title)));
  let added = 0;
  let skipped = 0;
  for (const it of incoming || []) {
    const key = norm(it.title);
    if (!key) continue;
    
    // allow duplicates as requested by user
    
    result.push({
      id: uid('set_'),
      title: it.title.trim(),
      content: (it.content ?? '').toString(),
      folder: it.folder || DEFAULT_SETTINGS_FOLDER,
    });
    added++;
  }
  return { items: result, stats: { added, skipped } };
}

// —— 设定 JSON —— //
export function parseSettingsJson(text: string): SettingItem[] {
  const data = JSON.parse(text);
  let arr: any[];
  if (Array.isArray(data)) arr = data;
  else if (data && Array.isArray(data.settingsItems)) arr = data.settingsItems;
  else throw new Error('无法识别的设定数据格式（应为条目数组或 { settingsItems: [] }）');
  return arr
    .filter((x) => x && (x.title != null))
    .map((x: any) => ({
      id: uid('set_'),
      title: String(x.title).trim(),
      content: (x.content ?? '').toString(),
      folder: x.folder ? String(x.folder) : DEFAULT_SETTINGS_FOLDER,
    }));
}

// —— 设定 TXT —— //
export function settingsToTxt(items: SettingItem[]): string {
  const byFolder = new Map<string, SettingItem[]>();
  for (const it of items || []) {
    const f = it.folder || DEFAULT_SETTINGS_FOLDER;
    if (!byFolder.has(f)) byFolder.set(f, []);
    byFolder.get(f)!.push(it);
  }
  const blocks: string[] = [];
  for (const [folder, arr] of byFolder) {
    const lines: string[] = [`# 文件夹：${folder}`, ''];
    for (const it of arr) {
      lines.push(`【${it.title}】`);
      if (it.content && it.content.trim()) lines.push(it.content.trim());
      lines.push('....');
      lines.push('');
    }
    blocks.push(lines.join('\n').replace(/\s+$/, ''));
  }
  return blocks.join('\n\n') + '\n';
}

// TXT 自动解析：首行=文件夹名；每个【标题】块=一条独立设定（标题只取【】内文字）
export function parseSettingsTxt(
  text: string,
  fallbackFolder: string = TXT_IMPORT_FALLBACK_FOLDER
): SettingItem[] {
  const lines = text.split(/\r?\n/);
  const items: SettingItem[] = [];
  let folder = '';
  let cur: { title: string; contentLines: string[]; folder: string } | null = null;
  let sawEntry = false;

  const flush = () => {
    if (cur) {
      const content = cur.contentLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const title = cur.title.trim();
      if (title) items.push({ id: uid('set_'), title, content, folder: cur.folder });
      cur = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    // 文件夹头：# 文件夹：X
    const fh = trimmed.match(/^#\s*(?:文件夹|folder)\s*[:：]\s*(.+)$/i);
    if (fh) {
      flush();
      folder = fh[1].trim();
      continue;
    }

    // 分隔线：.... / ---- / …… / ====
    if (/^(?:[.．。·]{2,}|-{2,}|…+|={2,})$/.test(trimmed)) {
      flush();
      continue;
    }

    // 条目开始：【标题】其余...
    const em = trimmed.match(/^【(.+?)】(.*)$/);
    if (em) {
      flush();
      sawEntry = true;
      const remainder = em[2].replace(/^\s*[:：]\s*/, '').trim();
      cur = {
        title: em[1],
        contentLines: remainder ? [remainder] : [],
        folder: folder || fallbackFolder,
      };
      continue;
    }

    // 首个条目之前的裸行 -> 文件夹名（兼容“刺客.txt”首行）
    if (!sawEntry && !cur && trimmed && !folder) {
      folder = trimmed;
      continue;
    }

    // 条目正文
    if (cur) cur.contentLines.push(line);
  }
  flush();
  return items;
}

// —— 设定：高层编排 —— //
export async function exportSettings(book: Book, format: IoFormat): Promise<'saved' | 'cancelled'> {
  const items = (book.outlineVision?.masterOutline?.settingsItems ?? []) as unknown as SettingItem[];
  const bookName = (book.title || '未命名').trim();
  if (format === 'json') {
    return saveTextViaDialog(`${bookName}-大纲与设定.json`, JSON.stringify(items, null, 2));
  }
  return saveTextViaDialog(`${bookName}-大纲与设定.txt`, settingsToTxt(items));
}

export async function importSettingsFromFile(
  book: Book,
  format: IoFormat
): Promise<
  | { cancelled: true }
  | { cancelled: false; items: SettingItem[]; stats: { added: number; skipped: number } }
> {
  const text = await readTextViaDialog();
  if (text == null) return { cancelled: true };
  const incoming = format === 'json' ? parseSettingsJson(text) : parseSettingsTxt(text);
  const existing = (book.outlineVision?.masterOutline?.settingsItems ?? []) as unknown as SettingItem[];
  const { items, stats } = mergeSettings(existing, incoming);
  return { cancelled: false, items, stats };
}
