// 模块说明：题材审查 Skill 加载器（参考 anthropics/skills 的 md + frontmatter）。
// 为避免 vite ?raw / md 拦截差异，清单内容以内嵌字符串常量提供（源文件仍保留在 skills/review/*.md 便于编辑）。

import type { AgentGenreId } from '../types';

export interface ReviewSkill {
  name: string;
  description: string;
  genre: AgentGenreId | string;
  version: string;
  checklistMarkdown: string;
  checklistLines: string[];
}

const RAW_BY_GENRE: Record<string, string> = {
  xuanhuan: `---
name: review-xuanhuan
description: 玄幻/修真题材正文审查清单
genre: xuanhuan
version: 1
---

# 玄幻审查清单

1. 境界体系：角色战力/境界是否与设定卡或已确认记忆冲突
2. 功法法宝：新出现的功法/法宝是否突然无来源，或与已有设定矛盾
3. 势力站队：门派/皇朝/魔道归属是否前后一致
4. 战力逻辑：越级反杀/碾压是否有铺垫，避免无代价开挂
5. 修炼进度：突破、心魔、瓶颈是否跳步或复读注水
6. 地理位面：秘境/宗门/都城空间关系是否混乱
7. 因果伏笔：前文埋下的机缘/仇怨是否无故消失
`,
  urban: `---
name: review-urban
description: 都市题材正文审查清单
genre: urban
version: 1
---

# 都市审查清单

1. 身份职业：主角与配角的社会身份、公司/职位是否前后一致
2. 金钱资源：消费、资产、资源调动是否突然失真
3. 关系网：亲友/同事/对手关系是否无铺垫剧变
4. 现实逻辑：医疗、法律、商业流程是否严重违和（除非明确开脑洞）
5. 信息差：角色不应知道的信息是否被误用
6. 节奏注水：商务应酬/重复打脸是否空转无推进
7. 城市地理：地点跳转是否合理
`,
  youxi: `---
name: review-youxi
description: 游戏/网游题材正文审查清单
genre: youxi
version: 1
---

# 游戏/网游审查清单

1. 数值成长：等级/装备/技能强度是否突然断层
2. 规则一致：副本规则、PK规则、交易规则是否自相矛盾
3. 现实与虚拟：下线/上线时间线是否错乱
4. 职业技能：技能效果是否与职业定位冲突
5. 经济系统：金币、材料、拍卖行逻辑是否崩坏
6. 团队关系：公会/队伍站位是否无铺垫反转
7. 主线任务：任务目标是否丢失或无故完成
`,
  lishi: `---
name: review-lishi
description: 历史/历史爽文题材正文审查清单
genre: lishi
version: 1
---

# 历史审查清单

1. 时代名物：官职、称谓、器物、制度是否严重穿越错位（开挂设定除外）
2. 势力阵营：朝廷/军阀/门阀立场是否前后矛盾
3. 人物命运：历史人物生死节点是否无说明地改写
4. 战争后勤：兵力、粮草、行军距离是否离谱
5. 礼仪秩序：朝堂/军中礼仪是否无故崩坏
6. 情报传递：书信/探马时效是否不合理
7. 权谋因果：计策成败是否缺少前因后果
`,
  lishishuangwen: `---
name: review-lishishuangwen
description: 历史爽文题材正文审查清单
genre: lishishuangwen
version: 1
---

# 历史爽文审查清单

1. 爽点兑现：打脸/逆袭是否有最小铺垫，避免空喊
2. 身份反转：隐藏身份揭露是否过早或过密
3. 实力成长：战力跃迁是否可被读者接受
4. 朝堂博弈：对手反应是否只会送人头
5. 名物制度：可爽但不要连续硬伤堆叠
6. 配角工具人：关键配角是否完全失去动机
7. 主线推进：每场冲突后是否留下新钩子
`,
  wenyi: `---
name: review-wenyi
description: 文艺/情感向题材正文审查清单
genre: wenyi
version: 1
---

# 文艺审查清单

1. 人物心理：情绪转折是否有触发事件
2. 关系进展：亲密关系推进是否突兀或反复横跳
3. 意象过量：比喻/意象是否淹没叙事信息
4. 对白真实：对话是否变成作者宣言
5. 时间流速：回忆与现在切换是否混乱
6. 主题漂移：是否偏离本章情感主线
7. 结尾余韵：章末是否有情绪落点或悬置
`,
  unknown: `---
name: review-default
description: 通用网文正文审查清单
genre: unknown
version: 1
---

# 通用审查清单

1. 角色一致性：姓名/别名/立场是否冲突
2. 禁止项：是否触碰用户/规划禁止内容
3. 必含节拍：要求的情节是否缺失
4. 连贯性：是否跳戏或与已给事实矛盾
5. 注水：空喊、复读、无信息段落
6. 指令忠实：是否忽略明确必须/禁止要求
7. 章内目标：本章冲突是否有推进
`,
  shuangwen: `---
name: review-shuangwen
description: 无脑爽文题材正文审查清单（通常跳过自动审查，仅作备用）
genre: shuangwen
version: 1
---

# 爽文备用审查清单

1. 爽点密度：是否长时间无兑现
2. 对手强度：是否只会送人头且毫无威胁
3. 主角动机：是否完全消失只剩打脸循环
4. 设定崩坏：是否连续出现无法自圆其说的开挂
5. 节奏拖沓：铺垫是否超过爽点本身
`
};

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = String(raw || '').replace(/^﻿/, '');
  if (!text.startsWith('---')) return { meta: {}, body: text.trim() };
  const nl = String.fromCharCode(10);
  const endToken = nl + '---';
  const end = text.indexOf(endToken, 3);
  if (end < 0) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).trim();
  const bodyText = text.slice(end + endToken.length).trim();
  const meta: Record<string, string> = {};
  for (const line of fm.split(nl)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) meta[k] = v;
  }
  return { meta, body: bodyText };
}

function extractChecklistLines(bodyText: string): string[] {
  const nl = String.fromCharCode(10);
  return bodyText
    .split(nl)
    .map((l) => l.trim())
    .filter((l) => /^\d+\./.test(l) || l.startsWith('- '))
    .map((l) => l.replace(/^-\s+/, '').trim())
    .filter(Boolean);
}

export function loadReviewSkill(genre?: AgentGenreId | string | null): ReviewSkill {
  const key = String(genre || 'unknown');
  const raw = RAW_BY_GENRE[key] || RAW_BY_GENRE.unknown;
  const { meta, body: bodyMd } = parseFrontmatter(raw);
  const checklistLines = extractChecklistLines(bodyMd);
  return {
    name: meta.name || `review-${key}`,
    description: meta.description || '',
    genre: meta.genre || key,
    version: meta.version || '1',
    checklistMarkdown: bodyMd,
    checklistLines: checklistLines.length
      ? checklistLines
      : [
          '1) 角色一致性',
          '2) 禁止项',
          '3) 必含节拍',
          '4) 连贯性',
          '5) 注水',
          '6) 指令忠实'
        ]
  };
}

export function formatSkillChecklistForPrompt(skill: ReviewSkill): string {
  const nl = String.fromCharCode(10);
  const lines = skill.checklistLines.map((l, i) => (/^\d+\./.test(l) ? l : `${i + 1}) ${l}`));
  return [
    `【题材技能】${skill.name} v${skill.version}`,
    skill.description ? `说明：${skill.description}` : '',
    '题材专属审查清单：',
    ...lines
  ]
    .filter(Boolean)
    .join(nl);
}
