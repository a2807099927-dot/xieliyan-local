// AI 输出清洗：从模型返回文本里剥离「任务旁白 / 导演指令 / 字数注水说明」，只留小说正文。
// Agent 落盘正文前的清洗规则。

/**
 * 判断一行/一段是否像 AI 写作旁白（而非小说正文）。
 */
export function isAiOsLine(line: string): boolean {
  const t = String(line || '').trim();
  if (!t) return false;

  // 明显元话语 / 任务腔
  if (
    /^(?:我们(?:被要求|需要|开始|再|重写|来)|需要(?:遵循|达到|增加|注意)|注意[：:]|要求[：:]|结构[：:]|开场[：:]|开头扩展|增加字数|扩展细节|计划扩展|草稿扩展|细纲要点|细纲[：:]|字数|继续。?$|（接之前）|\(接之前\)|开始(?:输出|写|构思)|直接写|只输出|严格遵循|不标思考)/.test(
      t
    )
  ) {
    return true;
  }

  // 导演指令：「写林尘…」「写王虎…」「描写…」
  if (/^(?:写|描写|介绍)[\u4e00-\u9fffA-Za-z]{0,12}[：:]/.test(t)) return true;
  if (/^(?:对话生活化|动态侧写|动作战斗|场景氛围|情绪生理|本体伪装|章末|金手指进度|本卷位置)/.test(t)) {
    return true;
  }

  // 字数注水相关
  if (/\d+\s*字(?:以上|左右|以内)?|字数(?:能上|要求|不够|统计)|扩写到|充实一段|凑字|注水/.test(t)) {
    // 正文里偶尔出现「三千字文书」等，限短句+指令味
    if (t.length < 100 || /需要|确保|达到|上\d+|能上/.test(t)) return true;
  }

  // 复述细纲条目腔 / 工坊细纲字段
  if (
    /^(?:主角|冲突|爽点|出场角色|章末钩子|本章目标|场景节拍|金手指进度|本卷位置|写作方向|续写方向)[：:]/.test(
      t
    )
  ) {
    return true;
  }

  // 「可以写…」「可以用…」指令
  if (/^可以(?:写|用|在)|不要输出|不输出章节|从第一句/.test(t) && t.length < 120) return true;

  // 整句像在跟系统对话
  if (/被要求以|网络小说正文|不输出任何说明|确保流畅不写说明/.test(t)) return true;

  return false;
}

/**
 * 从模型输出中尽量抽出纯小说正文。
 * 策略：
 * 1) 若出现「开始输出正文 / 开始写正文」等，取其后内容
 * 2) 按段过滤 OS
 * 3) 若多段夹杂，取最长的连续「非 OS」块
 */
export function stripAiOsFromBody(raw: string): string {
  let text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^```(?:text|novel|markdown|txt)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  if (!text) return '';

  // 优先：从「真正开始写」标记之后截取（模型常先 OS 再写正文）
  const startMarkers =
    /(?:^|\n)\s*(?:开始输出正文|开始写正文|开始正文|正文开始|直接写正文)[^\n]*\n+/i;
  const parts = text.split(startMarkers);
  if (parts.length > 1) {
    // 取最后一次标记之后（通常是最终稿）
    text = parts[parts.length - 1].trim();
  }

  // 去掉开头连续 OS 段
  const paras = text.split(/\n+/);
  const scored = paras.map((p) => ({ p, os: isAiOsLine(p) || isAiOsParagraph(p) }));

  // 找最长连续非 OS 段
  let bestStart = 0;
  let bestLen = 0;
  let curStart = 0;
  let curLen = 0;
  for (let i = 0; i < scored.length; i++) {
    if (!scored[i].os && scored[i].p.trim()) {
      if (curLen === 0) curStart = i;
      curLen += scored[i].p.trim().length + 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else if (scored[i].os) {
      curLen = 0;
    }
  }

  let kept: string[];
  if (bestLen > 80) {
    // 从 bestStart 往后收，直到再遇到硬 OS 标题块中断；中间空白保留
    kept = [];
    for (let i = bestStart; i < scored.length; i++) {
      if (scored[i].os) {
        // 硬中断：明显规划标题
        if (
          /^(?:我们|需要|注意|要求|结构|开场|增加字数|扩展|计划|草稿|细纲|开始输出)/.test(
            scored[i].p.trim()
          )
        ) {
          // 若后面还有更长正文可继续扫——简化：停止
          break;
        }
        continue;
      }
      if (scored[i].p.trim()) kept.push(scored[i].p.trim());
    }
  } else {
    kept = scored.filter((s) => !s.os && s.p.trim()).map((s) => s.p.trim());
  }

  let out = kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  // 再清一次行级残留
  out = out
    .split('\n')
    .filter((line) => !isAiOsLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}

function isAiOsParagraph(p: string): boolean {
  const t = p.trim();
  if (!t) return false;
  if (isAiOsLine(t)) return true;
  // 段内多处指令词且较短
  const hits = (
    t.match(
      /可以写|需要写|描写|动态侧写|生活化|去AI味|不注水|字数|细纲说|细纲没|我们/g
    ) || []
  ).length;
  if (hits >= 3 && t.length < 280) return true;
  // 整段像分镜表
  if (/^[\s\S]{0,40}[：:].{0,40}[：:]/.test(t) && /写|描写|可以/.test(t) && t.length < 200) {
    return true;
  }
  return false;
}
