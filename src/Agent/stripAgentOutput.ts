// 模块说明：把 Agent 输出拆成「思维过程」和「可插入正文」。
// 维护边界：纯函数，不碰 store；写作/查证后处理都走这里。

export interface SplitAgentOutput {
  thinking: string;
  body: string;
  /** 是否有可用的正文（body 非空）。false 且 thinking 非空 = 模型只输出思考/计划，无正文 */
  hasBody: boolean;
}

const META_LINE =
  /(用户(要求|提供|希望|说|指令|提到|明确|深层)|我(需要|决定|认为|分析|构建|设计|考虑|假设|得|的思路|会|将)|根据(用户|指令|要求|规则|法则|刚才)|^(首先|其次|然后|最后|接着|现在|好的|嗯|哦)|承接前文|严格承接|两条线|现实线|游戏线|写作规则|格式要求|不要解释|直接输出正文|避免Markdown|只输出小说正文|不要解释过程|可以自然引出|这个场景能|开头应该|章的开头|插入到第|写一段|回顾一下|我们刚才的讨论|我给出了|用户表示|用户接着|核心冲突|情绪铺垫|为后续剧情|埋下伏笔|预计(生成|写|输出|创作|约)|计划.{0,6}生成|将会(生成|写|输出|创作))/;

const PROSE_LINE =
  /(^「|^“|^"|^\u201c|说道|问道|笑道|低声|忽然|只见|此时|片刻|眼前|身后|心中|抬起|转身|望着|看着|走了|走进|推开|握着|点头|沉默|深吸|夜色|晨光|阳光|冷风|房间|门外|街口|营地|系统提示|传送|屏幕)/;

function stripThinkTags(text: string): { visible: string; thinking: string } {
  let visible = '';
  let thinking = '';
  let rest = String(text || '');
  while (rest.length) {
    const start = rest.search(/<think(?:ing)?>/i);
    if (start < 0) {
      const half = rest.search(/<think(?:ing)?$/i);
      if (half >= 0) {
        visible += rest.slice(0, half);
        break;
      }
      visible += rest;
      break;
    }
    visible += rest.slice(0, start);
    const afterStart = rest.slice(start).replace(/^<think(?:ing)?>/i, '');
    const end = afterStart.search(/<\/think(?:ing)?>/i);
    if (end < 0) {
      thinking += afterStart.replace(/<\/think(?:ing)?$/i, '');
      break;
    }
    thinking += afterStart.slice(0, end);
    rest = afterStart.slice(end).replace(/^<\/think(?:ing)?>/i, '');
  }
  return { visible, thinking };
}

function scoreMeta(line: string): number {
  const t = line.trim();
  if (!t) return 0;
  let score = 0;
  if (META_LINE.test(t)) score += 3;
  if (/^(好的|嗯|哦|首先|其次|然后|最后|现在|接下来)[，,。！!：:\s]/.test(t)) score += 2;
  if (/用户|我需要|我决定|我的思路|我得|写作|正文|解释过程|Markdown/.test(t)) score += 2;
  if (/第\d+章/.test(t) && /写|开头|插入|承接|推进|剧情/.test(t)) score += 2;
  if (t.length > 80 && /用户|我|思路|承接|要求/.test(t)) score += 1;
  return score;
}

function scoreProse(line: string): number {
  const t = line.trim();
  if (!t) return 0;
  let score = 0;
  if (PROSE_LINE.test(t)) score += 4;
  if (/[「」""\u201c\u201d]/.test(t)) score += 3;
  if (!META_LINE.test(t) && t.length >= 12 && /[\u4e00-\u9fff]{8,}/.test(t)) score += 1;
  // 明显不是小说：整句都在解释任务
  if (META_LINE.test(t)) score -= 3;
  return score;
}

/**
 * 把模型输出拆成 thinking + body。
 * - thinking：写作计划/自我解释/规则复述
 * - body：可直接进编辑器的小说正文
 */
export function splitAgentOutput(raw: string, options?: { stripTail?: boolean }): SplitAgentOutput {
  const stripTail = options?.stripTail !== false;
  const tagged = stripThinkTags(raw);
  let thinkingParts: string[] = [];
  if (tagged.thinking.trim()) thinkingParts.push(tagged.thinking.trim());

  const text = tagged.visible.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { thinking: thinkingParts.join('\n\n').trim(), body: '', hasBody: false };
  }

  const lines = text.split('\n');
  let bodyStart = -1;
  let metaStreak = 0;
  let seenMeta = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const meta = scoreMeta(trimmed);
    const prose = scoreProse(trimmed);

    if (meta >= 2 && meta >= prose) {
      seenMeta = true;
      metaStreak += 1;
      continue;
    }

    // 已经过了分析段，且当前更像正文
    if (seenMeta && prose > 0 && prose >= meta) {
      bodyStart = i;
      break;
    }

    // 开头就是正文
    if (!seenMeta && prose >= 2 && meta <= 1) {
      bodyStart = i;
      break;
    }

    // 开头模糊行：若偏 meta 就继续吃掉
    if (!seenMeta && meta > prose) {
      seenMeta = true;
      metaStreak += 1;
      continue;
    }

    // 默认：若已有 meta，非空行当正文起点；否则当正文
    if (seenMeta && metaStreak >= 1) {
      bodyStart = i;
      break;
    }
    bodyStart = i;
    break;
  }

  if (bodyStart < 0) {
    // 全文都像分析：全部进 thinking，body 为空
    thinkingParts.push(text);
    return { thinking: thinkingParts.join('\n\n').trim(), body: '', hasBody: false };
  }

  const head = lines.slice(0, bodyStart).join('\n').trim();
  let body = lines.slice(bodyStart).join('\n').trim();

  // 正文里若仍夹着大段 meta 尾巴，再砍一次尾部纯 meta 段
  const bodyLines = body.split('\n');
  let lastProse = bodyLines.length - 1;
  for (let i = bodyLines.length - 1; i >= 0; i--) {
    const t = bodyLines[i].trim();
    if (!t) continue;
    if (scoreProse(t) >= 2 && scoreMeta(t) < 2) {
      lastProse = i;
      break;
    }
    if (scoreMeta(t) >= 3 && scoreProse(t) <= 0) {
      continue;
    }
    lastProse = i;
    break;
  }
  if (stripTail && lastProse < bodyLines.length - 1) {
    const tailMeta = bodyLines.slice(lastProse + 1).join('\n').trim();
    if (tailMeta) thinkingParts.push(tailMeta);
    body = bodyLines.slice(0, lastProse + 1).join('\n').trim();
  }

  if (head) thinkingParts.push(head);

  // 若 body 仍大面积 meta（误判），整段改 thinking
  const bodyMetaRatio = body
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => (scoreMeta(l.trim()) >= 2 ? 1 : 0));
  if (bodyMetaRatio.length >= 3) {
    const ratio = bodyMetaRatio.reduce((a: number, b: number) => a + b, 0) / bodyMetaRatio.length;
    if (ratio >= 0.6) {
      thinkingParts.push(body);
      body = '';
    }
  }

  return {
    thinking: thinkingParts.filter(Boolean).join('\n\n').trim(),
    body: body.trim(),
    hasBody: body.trim().length > 0
  };
}

/** 兼容旧接口：只返回正文 */
export function stripPreAmble(text: string): string {
  const raw = String(text || '');
  if (!raw.trim()) return raw;
  const { body, thinking } = splitAgentOutput(raw, { stripTail: false });
  // 若完全剥空（全是分析废话），回退原文，避免误删
  if (!body && thinking) return raw;
  return body || raw;
}


export function stripMarkdownEmphasis(text: string): string {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');
}
