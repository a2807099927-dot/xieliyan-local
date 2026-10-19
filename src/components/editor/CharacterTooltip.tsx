// CharacterTooltip — 正文角色名悬浮卡
import type { RoleProfile } from '../../types';

export interface CharacterTooltipRenderParams {
  name: string;
  roleLookup: Record<string, RoleProfile>;
  cleanText: (value: unknown, fallback?: string) => string;
  escapeHtml: (input: string) => string;
}

type SkillItem = { name: string; detail: string };

export function createCharacterTooltipElement({
  name,
  roleLookup,
  cleanText,
  escapeHtml
}: CharacterTooltipRenderParams): HTMLDivElement {
  void escapeHtml; // 保留参数签名；本组件用 textContent 赋值，本身就防 XSS
  const role = roleLookup[name] || roleLookup[name.toLowerCase()];
  const customFields = (role?.customFields || {}) as Record<string, string | undefined>;

  // —— 背景：优先角色描述(对应角色卡“背景”输入) ——
  const backgroundText =
    cleanText(role?.description) ||
    cleanText(role?.note) ||
    '暂无背景资料。';

  // —— 金手指：对应角色卡“金手指”输入(customFields.personality) ——
  const goldfingerText =
    cleanText(customFields.personality) ||
    '暂无金手指资料。';

  // —— 近期状态：对应角色卡“角色近期状态”输入(customFields.recentStatus) ——
  const recentStatusText =
    cleanText(customFields.recentStatus) ||
    '暂无近期状态资料。';

  // —— 功法/技能：结构化列表，悬浮卡内做成收放栏 ——
  const skills = collectSkillItems(role, customFields, cleanText);

  type TabId = 'background' | 'recentStatus' | 'goldfinger' | 'skill';
  const textTabs: Record<Exclude<TabId, 'skill'>, string> = {
    background: backgroundText,
    recentStatus: recentStatusText,
    goldfinger: goldfingerText
  };

  // 用 DOM API 构建，避免 innerHTML 字符串拼接带来的 XSS 风险
  const wrapper = document.createElement('div');
  wrapper.className = 'wz-hover-card';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-weight:600;margin-bottom:4px;color:var(--ide-t1);';
  nameEl.textContent = cleanText(role?.name || name, name);
  wrapper.appendChild(nameEl);

  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'font-size:12px;color:var(--ide-t3);';
  metaEl.textContent = `阵营：${cleanText(role?.faction, '未知')} | 类型：${cleanText(role?.roleType, '未知')}`;
  wrapper.appendChild(metaEl);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'wz-hover-tabs';

  const tabDefs: Array<{ id: TabId; label: string }> = [
    { id: 'background', label: '背景' },
    { id: 'recentStatus', label: '近期状态' },
    { id: 'goldfinger', label: '金手指' },
    { id: 'skill', label: '功法/技能' }
  ];

  const contentEl = document.createElement('div');
  contentEl.className = 'wz-hover-tab-content';
  contentEl.style.whiteSpace = 'pre-wrap';
  contentEl.textContent = textTabs.background;

  const skillPanel = buildSkillAccordion(skills);

  const showTab = (id: TabId) => {
    if (id === 'skill') {
      contentEl.style.whiteSpace = 'normal';
      contentEl.replaceChildren(skillPanel);
    } else {
      contentEl.style.whiteSpace = 'pre-wrap';
      contentEl.replaceChildren();
      contentEl.textContent = textTabs[id];
    }
  };

  const buttons: HTMLButtonElement[] = tabDefs.map(({ id, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = id === 'background' ? 'wz-hover-tab wz-hover-tab-active' : 'wz-hover-tab';
    btn.dataset.tab = id;
    btn.textContent = label;
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      buttons.forEach((b) => b.classList.toggle('wz-hover-tab-active', b.dataset.tab === id));
      showTab(id);
    });
    tabsEl.appendChild(btn);
    return btn;
  });

  wrapper.appendChild(tabsEl);
  wrapper.appendChild(contentEl);

  return wrapper;
}

/** 汇总技能条目：appearance → abilities + skillDetails → skills 文本 */
function collectSkillItems(
  role: RoleProfile | undefined,
  customFields: Record<string, string | undefined>,
  cleanText: (value: unknown, fallback?: string) => string
): SkillItem[] {
  const fromAppearance = parseSkillEntries(customFields.appearance, cleanText);
  if (fromAppearance.length > 0) return fromAppearance;

  const detailMap = parseSkillDetailMap(customFields.skillDetails);
  const names: string[] = [];
  if (role?.abilities?.length) {
    for (const item of role.abilities) {
      const n = cleanText(item);
      if (n && !names.includes(n)) names.push(n);
    }
  }
  const skillsLine = cleanText(customFields.skills);
  if (skillsLine) {
    for (const part of skillsLine.split(/[、，,\n]/)) {
      const n = part.trim();
      if (n && !names.includes(n)) names.push(n);
    }
  }
  for (const k of Object.keys(detailMap)) {
    if (k && !names.includes(k)) names.push(k);
  }
  return names.map((n) => ({ name: n, detail: detailMap[n] || '' }));
}

/** 可收放技能列表：默认全部收起，点名称展开效果说明 */
function buildSkillAccordion(skills: SkillItem[]): HTMLElement {
  const root = document.createElement('div');
  root.className = 'wz-hover-skill-list';

  if (skills.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wz-hover-skill-empty';
    empty.textContent = '暂无功法/技能资料。';
    root.appendChild(empty);
    return root;
  }

  // 顶部工具：全部展开 / 全部收起（技能 ≥ 3 时显示）
  if (skills.length >= 3) {
    const toolbar = document.createElement('div');
    toolbar.className = 'wz-hover-skill-toolbar';

    const expandAll = document.createElement('button');
    expandAll.type = 'button';
    expandAll.className = 'wz-hover-skill-tool-btn';
    expandAll.textContent = '全部展开';

    const collapseAll = document.createElement('button');
    collapseAll.type = 'button';
    collapseAll.className = 'wz-hover-skill-tool-btn';
    collapseAll.textContent = '全部收起';

    expandAll.addEventListener('click', (e) => {
      e.stopPropagation();
      root.querySelectorAll<HTMLElement>('.wz-hover-skill-item').forEach((item) => {
        item.classList.add('is-open');
        const body = item.querySelector<HTMLElement>('.wz-hover-skill-body');
        if (body) body.hidden = false;
        const chevron = item.querySelector('.wz-hover-skill-chevron');
        if (chevron) chevron.textContent = '▾';
      });
    });
    collapseAll.addEventListener('click', (e) => {
      e.stopPropagation();
      root.querySelectorAll<HTMLElement>('.wz-hover-skill-item').forEach((item) => {
        item.classList.remove('is-open');
        const body = item.querySelector<HTMLElement>('.wz-hover-skill-body');
        if (body) body.hidden = true;
        const chevron = item.querySelector('.wz-hover-skill-chevron');
        if (chevron) chevron.textContent = '▸';
      });
    });

    toolbar.appendChild(expandAll);
    toolbar.appendChild(collapseAll);
    root.appendChild(toolbar);
  }

  const scroll = document.createElement('div');
  scroll.className = 'wz-hover-skill-scroll';

  for (const skill of skills) {
    const item = document.createElement('div');
    item.className = 'wz-hover-skill-item';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'wz-hover-skill-head';

    const chevron = document.createElement('span');
    chevron.className = 'wz-hover-skill-chevron';
    chevron.textContent = '▸';

    const title = document.createElement('span');
    title.className = 'wz-hover-skill-name';
    title.textContent = skill.name;

    head.appendChild(chevron);
    head.appendChild(title);

    // 无详情时不展示展开，只显示名称
    const hasDetail = Boolean(skill.detail?.trim());
    if (!hasDetail) {
      head.classList.add('is-plain');
      chevron.textContent = '·';
      head.disabled = true;
    }

    const body = document.createElement('div');
    body.className = 'wz-hover-skill-body';
    body.hidden = true;
    body.textContent = skill.detail || '暂无详细说明';

    if (hasDetail) {
      head.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = item.classList.toggle('is-open');
        body.hidden = !open;
        chevron.textContent = open ? '▾' : '▸';
      });
    }

    item.appendChild(head);
    if (hasDetail) item.appendChild(body);
    scroll.appendChild(item);
  }

  root.appendChild(scroll);
  return root;
}

// —— 解析 customFields.appearance：与角色卡“功法/技能”一致的 [{name,detail}] 结构 ——
function parseSkillEntries(
  value: unknown,
  cleanText: (value: unknown, fallback?: string) => string
): Array<{ name: string; detail: string }> {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({ name: cleanText(item.name), detail: cleanText(item.detail) }))
        .filter((entry) => Boolean(entry.name));
    }
  } catch {
    // 兼容旧版纯文本(顿号/逗号/换行分隔)
  }
  return value
    .split(/[、，,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((n) => ({ name: n, detail: '' }));
}

/** 解析 customFields.skillDetails：JSON 对象 { 技能名: 效果摘要 } */
function parseSkillDetailMap(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = String(k || '').trim();
      const val = String(v ?? '').trim();
      if (key && val) out[key] = val;
    }
    return out;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parseSkillDetailMap(parsed);
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}
