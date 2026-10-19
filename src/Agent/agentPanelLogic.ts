// AgentChatPanel 纯逻辑抽离（无 JSX / 无 React hooks）
// 2026-08-08 从 AgentChatPanel.tsx 拆分：缩小 5700+ 行巨型组件体积。
// 这些函数均为纯函数，行为与原实现完全一致（仅统一缩进为 2 空格）。

import { splitAgentOutput, stripMarkdownEmphasis } from './stripAgentOutput';
import { normalizeChinesePunctuation } from './useAgentSession';

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getPanelStorageKey(bookId: string): string {
  return `writerzen:agent-chat-panel:${bookId}`;
}

export function isFollowWriteCommand(input: string): boolean {
  return /按这个写|按刚才.*写|就这样写|直接写|开写|开始写|写成正文|写正文|试着写|写我看看/.test(String(input || '').trim());
}

export function parseEditorReviewJson(raw: string): { pass: boolean; issues: Array<{ severity?: string; text?: string; fix?: string }>; summary?: string } {
  const text = String(raw || '').trim();
  const fallback = { pass: true, issues: [], summary: '' };
  if (!text) return fallback;
  try {
    const jsonText = text.match(/```json\s*([\s\S]*?)```/i)?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
    const parsed = JSON.parse(jsonText);
    return {
      pass: parsed.pass !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : ''
    };
  } catch {
    return fallback;
  }
}

/**
 * 分离 <think>...</think> 思维链与可见正文，流式过程中可实时展示 thinking。
 */
export function stripThinkTagsLive(raw: string): { visible: string; thinking: string } {
  let visible = '';
  let thinking = '';
  let rest = raw;
  while (rest.length) {
    const start = rest.search(/<think(?:ing)?>/i);
    if (start < 0) {
      // 可能半截开标签
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

export function extractThinkingAndBody(raw: string): { visible: string; thinking: string } {
  const split = splitAgentOutput(raw);
  // 若正文被剥空但有 thinking，说明模型只吐了计划：正文先空着，thinking 全量展示
  const visible = stripMarkdownEmphasis(normalizeChinesePunctuation(split.body || '')).trim();
  const thinking = split.thinking.trim();
  return { visible, thinking };
}

export function isContinuityUtterance(text: string): boolean {
  const t = String(text || '').trim();
  return /^(继续|下一步|接着|然后呢|然后|go on|continue|往下|写下去|就这样|按这个|按上面|照这个|好的，写|可以写了)/i.test(t)
    || /(继续写|接着写|按刚才|按上面|就按这个|写下去|插入到|写一段)/.test(t);
}

export function highlightClassFor(label: string): string {
  const t = String(label || '');
  if (/现实线|生活线|情感线|离别|搬迁|家庭/.test(t)) return 'hl-line';
  if (/游戏线|领地|副本|任务线|卡俄斯|建设|入驻/.test(t)) return 'hl-game';
  if (/不足|缺点|问题|风险|冲突弱|拖沓|生硬|尴尬|槽点/.test(t)) return 'hl-red';
  if (/亮点|优点|帅|精彩|扎实|真实|出色|加分|漂亮|通透|流畅|高级/.test(t)) return 'hl-green';
  if (/主线|推荐|核心|关键|重点|高潮|钩子|伏笔|推进|支线|暗线/.test(t)) return 'hl-amber';
  if (/吐槽|幽默|节奏|氛围|情绪|轻松|放松/.test(t)) return 'hl-cyan';
  if (/角色|人物|互动|关系|对白|台词/.test(t)) return 'hl-purple';
  return 'hl-blue';
}

export function isSectionHeadingLine(line: string): boolean {
  const t = String(line || '').trim();
  if (!t || t.length > 36) return false;
  if (/^[-•*]\s/.test(t)) return false;
  return /^(现实线|游戏线|主线|支线|暗线|情感线|生活线|任务线|副本线|线索)[：:]/.test(t)
    || /^【[^】]{1,16}】$/.test(t)
    || /^#{1,3}\s+\S/.test(t);
}

export function isComplexReadQuestion(query: string): boolean {
  return /为什么|原因|动机|为何|后来|前因后果|如何变化|怎么会|是否合理|是否冲突|矛盾|意味着|说明什么|有什么作用|根据前文|联系起来|真正目的/.test(query);
}

export function isExplicitFullBookSearch(query: string): boolean {
  return /搜索全书|全书搜索|查找全书|搜一下|全文搜索|全文检索|搜索章节|查找章节|哪些章节|哪几章|哪一章|第几章|出现在哪/.test(query);
}

export function extractLocalSearchTerms(query: string): string[] {
  const quoted = Array.from(query.matchAll(/[“\"'「『]([^”\"'」』]{2,30})[”\"'」』]/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (quoted.length) return Array.from(new Set(quoted)).slice(0, 3);

  const cleaned = query
    .replace(/请|帮我|一下|搜索全书|全书搜索|查找全书|全文搜索|全文检索|搜索章节|查找章节|搜索|查找|查询|看看|告诉我/g, ' ')
    .replace(/出现在哪些章节|出现在哪一章|出现在哪|在哪些章节|在哪一章|哪几章|哪一章|第几章|出现过|出现|出场/g, ' ')
    .replace(/[，。！？、：；,.!?;:()（）【】\[\]]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 30);

  if (cleaned.length) return Array.from(new Set(cleaned)).slice(0, 3);

  return extractMainKeywords(query).slice(0, 3);
}

export function extractMainKeywords(query: string): string[] {
  const STOP_WORDS = new Set(['什么','怎么','为什么','哪里','哪个','这个','那个','可以','能不能','是不是','有没有','还是','或者','但是','然后','所以','因为','如果','已经','现在','之前','之后','一下','一些','一个','我们','他们','你们','自己','大家','知道','觉得','应该','需要','帮我','告诉','记得','出现','发生','关于','对于','最后','第一','时候','地方','东西','问题','情况','怎样','哪些','是什么','在哪','什么时候','是谁','怎么样','多少','学习','技能']);
  const STOP_CHARS = /[是的了吗呢吧啊哦呀在有没不也都就和与或到被把让给从比跟]/g;

  const segments = query.replace(STOP_CHARS, '|').split('|').map(s => s.trim()).filter(s => s.length >= 2);

  const keywords: string[] = [];
  for (const seg of segments) {
    if (STOP_WORDS.has(seg)) continue;
    if (seg.length >= 2 && seg.length <= 6) keywords.push(seg);
    else if (seg.length > 6) { keywords.push(seg.slice(0, 8)); for (let i = 0; i < seg.length - 1; i += 2) { const sub = seg.slice(i, i + 4); if (sub.length >= 2 && !STOP_WORDS.has(sub)) keywords.push(sub); } }
  }

  return Array.from(new Set(keywords)).sort((a, b) => a.length - b.length).slice(0, 6);
}

export function isLocateQuestion(query: string): boolean {
  return /在哪|哪一章|出现在|第几章|什么时候出现|哪里出现|哪章|出现过|在第几|哪几章|出场/.test(query);
}

export function isLocalOperationCommand(query: string): boolean {
  return /填入|写入|创建章节|新建章节|分别填入|填写细纲|写入细纲|填入大纲|写入大纲|帮我填|帮我创建|批量创建|批量填入/.test(query);
}

export function stripRoleBlocks(text: string): string {
  // 去掉【角色】...【/角色】块，只保留非角色部分的文本
  const stripped = text.replace(/【角色】[\s\S]*?【\/角色】/g, '').trim();
  return stripped || '';
}
