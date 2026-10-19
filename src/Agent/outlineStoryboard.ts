// 模块说明：章纲/细纲气泡的分段与中度摘要展示（纯展示，不改文案内容）。

export interface OutlineSection {
  title: string;
  body: string;
}

/** 把大白话章纲按自然段收成开场 / 中段 / 收束，方便扫读 */
export function splitOutlineStoryboard(raw: string): OutlineSection[] {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  let paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  // 若几乎没有空行，按单行再聚合
  if (paras.length <= 1) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 4) {
      const chunk = Math.ceil(lines.length / 3);
      paras = [
        lines.slice(0, chunk).join('\n'),
        lines.slice(chunk, chunk * 2).join('\n'),
        lines.slice(chunk * 2).join('\n')
      ].filter(Boolean);
    } else if (lines.length > 1) {
      paras = lines;
    }
  }

  if (paras.length === 1) {
    return [{ title: '整章走向', body: paras[0] }];
  }
  if (paras.length === 2) {
    return [
      { title: '开场承接', body: paras[0] },
      { title: '收束与钩子', body: paras[1] }
    ];
  }
  if (paras.length === 3) {
    return [
      { title: '开场承接', body: paras[0] },
      { title: '中段推进', body: paras[1] },
      { title: '收束与钩子', body: paras[2] }
    ];
  }

  return [
    { title: '开场承接', body: paras[0] },
    { title: '中段推进', body: paras.slice(1, -1).join('\n\n') },
    { title: '收束与钩子', body: paras[paras.length - 1] }
  ];
}

/** 中度摘要：前两段 + 字数提示，不是死夹 4 行 */
export function buildOutlineMediumPreview(raw: string, maxChars = 420): {
  preview: string;
  totalChars: number;
  truncated: boolean;
} {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  const totalChars = text.length;
  if (!text) return { preview: '', totalChars: 0, truncated: false };

  const paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let preview = '';
  if (paras.length >= 2) {
    preview = `${paras[0]}\n\n${paras[1]}`;
  } else {
    preview = text;
  }

  let truncated = totalChars > preview.length + 8;
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;
    truncated = true;
  } else if (truncated) {
    // keep two paras but mark more below
  }

  return { preview, totalChars, truncated: truncated || totalChars > maxChars };
}
