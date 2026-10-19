// 模块说明：从用户改稿差异中提炼风格偏好（纯函数）。
// 参考：self-improving-agents Feedback Loop / SkillLoop review-gated learning。

export type StylePreferenceType =
  | 'sentence_length'
  | 'word_choice'
  | 'description_density'
  | 'dialogue_ratio'
  | 'paragraph_rhythm';

export type StylePreferenceDirection = 'shorten' | 'lengthen' | 'increase' | 'decrease' | 'prefer' | 'avoid';

export interface StylePreference {
  type: StylePreferenceType;
  direction: StylePreferenceDirection;
  evidence: string;
  confidence: number; // 0-1
  label: string;
}

export interface DiffResult {
  kind: 'sentence' | 'paragraph' | 'dialogue' | 'word' | 'length';
  originalSample: string;
  editedSample: string;
  metric?: Record<string, number>;
}

function plain(htmlOrText: string): string {
  return String(htmlOrText || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '')
    .trim();
}

function splitSentences(text: string): string[] {
  return plain(text)
    .split(/(?<=[。！？!?；;])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return plain(text)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function avgLen(items: string[]): number {
  if (!items.length) return 0;
  return items.reduce((n, s) => n + s.length, 0) / items.length;
}

function dialogueRatio(text: string): number {
  const p = plain(text);
  if (!p) return 0;
  // 中文对话常见引号
  const m = p.match(/[「“"].*?[」”"]/g) || [];
  const dlen = m.reduce((n, s) => n + s.length, 0);
  return dlen / Math.max(1, p.length);
}

function descriptionDensity(text: string): number {
  const p = plain(text);
  if (!p) return 0;
  // 粗略：形容词/描写性标点与长句占比的合成
  const adj = (p.match(/[的地得]/g) || []).length;
  const commas = (p.match(/[，,、]/g) || []).length;
  return (adj + commas) / Math.max(1, p.length);
}

/** 对比原文与用户修改，提取可观察差异 */
export function diffOriginalAndUserEdit(original: string, edited: string): DiffResult[] {
  const o = plain(original);
  const e = plain(edited);
  if (!o || !e || o === e) return [];

  const diffs: DiffResult[] = [];
  const oSent = splitSentences(o);
  const eSent = splitSentences(e);
  const oPara = splitParagraphs(o);
  const ePara = splitParagraphs(e);

  const oAvgS = avgLen(oSent);
  const eAvgS = avgLen(eSent);
  if (oAvgS > 0 && Math.abs(eAvgS - oAvgS) / oAvgS >= 0.12) {
    diffs.push({
      kind: 'sentence',
      originalSample: oSent.slice(0, 2).join(''),
      editedSample: eSent.slice(0, 2).join(''),
      metric: { originalAvgSentence: oAvgS, editedAvgSentence: eAvgS }
    });
  }

  const oAvgP = avgLen(oPara);
  const eAvgP = avgLen(ePara);
  if (oAvgP > 0 && Math.abs(eAvgP - oAvgP) / oAvgP >= 0.15) {
    diffs.push({
      kind: 'paragraph',
      originalSample: oPara[0] || '',
      editedSample: ePara[0] || '',
      metric: { originalAvgParagraph: oAvgP, editedAvgParagraph: eAvgP, oCount: oPara.length, eCount: ePara.length }
    });
  }

  const oDial = dialogueRatio(o);
  const eDial = dialogueRatio(e);
  if (Math.abs(eDial - oDial) >= 0.06) {
    diffs.push({
      kind: 'dialogue',
      originalSample: o.slice(0, 80),
      editedSample: e.slice(0, 80),
      metric: { originalDialogueRatio: oDial, editedDialogueRatio: eDial }
    });
  }

  const oDesc = descriptionDensity(o);
  const eDesc = descriptionDensity(e);
  if (Math.abs(eDesc - oDesc) >= 0.02) {
    diffs.push({
      kind: 'length',
      originalSample: o.slice(0, 60),
      editedSample: e.slice(0, 60),
      metric: { originalDescDensity: oDesc, editedDescDensity: eDesc, originalChars: o.length, editedChars: e.length }
    });
  }

  // 粗粒度用词替换：找原句中被删、改句中新增的 2-4 字片段
  if (Math.abs(e.length - o.length) >= 8) {
    diffs.push({
      kind: 'word',
      originalSample: o.slice(0, 100),
      editedSample: e.slice(0, 100),
      metric: { deltaChars: e.length - o.length }
    });
  }

  return diffs;
}

/** 把 diff 提炼成风格偏好列表 */
export function extractStylePreferences(diffs: DiffResult[]): StylePreference[] {
  const prefs: StylePreference[] = [];

  for (const d of diffs) {
    if (d.kind === 'sentence' && d.metric) {
      const o = d.metric.originalAvgSentence || 0;
      const e = d.metric.editedAvgSentence || 0;
      if (o <= 0) continue;
      const shorten = e < o;
      const conf = Math.min(0.95, Math.abs(e - o) / o);
      if (conf < 0.12) continue;
      prefs.push({
        type: 'sentence_length',
        direction: shorten ? 'shorten' : 'lengthen',
        evidence: `均句长 ${o.toFixed(1)} → ${e.toFixed(1)}；例：${d.originalSample.slice(0, 36)} → ${d.editedSample.slice(0, 36)}`,
        confidence: conf,
        label: shorten ? '偏好更短句子' : '偏好更长句子'
      });
    }

    if (d.kind === 'paragraph' && d.metric) {
      const o = d.metric.originalAvgParagraph || 0;
      const e = d.metric.editedAvgParagraph || 0;
      if (o <= 0) continue;
      const conf = Math.min(0.9, Math.abs(e - o) / o);
      if (conf < 0.15) continue;
      prefs.push({
        type: 'paragraph_rhythm',
        direction: e < o ? 'shorten' : 'lengthen',
        evidence: `均段长 ${o.toFixed(1)} → ${e.toFixed(1)}（段数 ${d.metric.oCount} → ${d.metric.eCount}）`,
        confidence: conf,
        label: e < o ? '偏好更短段落/更快节奏' : '偏好更长段落/更慢铺陈'
      });
    }

    if (d.kind === 'dialogue' && d.metric) {
      const o = d.metric.originalDialogueRatio || 0;
      const e = d.metric.editedDialogueRatio || 0;
      const conf = Math.min(0.9, Math.abs(e - o) * 4);
      if (conf < 0.2) continue;
      prefs.push({
        type: 'dialogue_ratio',
        direction: e > o ? 'increase' : 'decrease',
        evidence: `对话占比 ${(o * 100).toFixed(1)}% → ${(e * 100).toFixed(1)}%`,
        confidence: conf,
        label: e > o ? '偏好更多对话' : '偏好更少对话、更多叙述'
      });
    }

    if (d.kind === 'length' && d.metric) {
      const o = d.metric.originalDescDensity || 0;
      const e = d.metric.editedDescDensity || 0;
      const conf = Math.min(0.85, Math.abs(e - o) * 12);
      if (conf < 0.18) continue;
      prefs.push({
        type: 'description_density',
        direction: e > o ? 'increase' : 'decrease',
        evidence: `描写密度指标 ${o.toFixed(3)} → ${e.toFixed(3)}；字数 ${d.metric.originalChars} → ${d.metric.editedChars}`,
        confidence: conf,
        label: e > o ? '偏好更密描写' : '偏好更克制描写'
      });
    }

    if (d.kind === 'word' && d.metric) {
      const delta = d.metric.deltaChars || 0;
      if (Math.abs(delta) < 12) continue;
      prefs.push({
        type: 'word_choice',
        direction: delta < 0 ? 'avoid' : 'prefer',
        evidence: `整体字数变化 ${delta > 0 ? '+' : ''}${delta}；用户重写片段：${d.editedSample.slice(0, 40)}`,
        confidence: Math.min(0.7, Math.abs(delta) / 80),
        label: delta < 0 ? '偏好更精简用词' : '偏好更铺陈用词'
      });
    }
  }

  // 同 type 取 confidence 最高
  const best = new Map<string, StylePreference>();
  for (const p of prefs) {
    const key = `${p.type}:${p.direction}`;
    const prev = best.get(key);
    if (!prev || p.confidence > prev.confidence) best.set(key, p);
  }
  return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

/** 生成给用户确认的提问文案 */
export function buildPreferenceConfirmationQuestion(pref: StylePreference): string {
  return `我注意到你习惯「${pref.label}」。\n依据：${pref.evidence}\n以后要我默认这样写吗？`;
}
