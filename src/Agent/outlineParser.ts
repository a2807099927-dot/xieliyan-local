/**
 * 大纲解析器
 * 
 * 从 Agent 回复或用户粘贴内容中提取结构化的多章大纲数据。
 * 
 * 支持的格式：
 * 1. 标准格式：【大纲】【第N章】标题【细纲】内容【/细纲】【/大纲】
 * 2. 数字分段：1. 标题\n内容\n\n2. 标题\n内容
 * 3. 中文章节：第一章 标题\n内容\n\n第二章 标题\n内容
 * 4. 第N章格式：第1章 标题\n内容
 */

export interface ParsedChapterOutline {
 /** 章节序号（从 AI 输出中提取的原始序号） */
 chapterNumber: number;
 /** 章节标题（截断至 20 字） */
 title: string;
 /** 细纲内容 */
 outline: string;
 /** 情绪节点（可选） */
 emotionNode?: string;
 /** 收尾钩子（可选） */
 endingHook?: string;
}

export interface OutlineParseResult {
 /** 是否成功解析到大纲 */
 success: boolean;
 /** 解析出的章节列表 */
 chapters: ParsedChapterOutline[];
 /** 原始大纲文本 */
 rawOutlineText: string;
}

const MAX_TITLE_LENGTH = 20;

// 中文数字映射
const CN_NUM_MAP: Record<string, number> = {
 '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
 '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
 '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
 '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
 '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
 '二十六': 26, '二十七': 27, '二十八': 28, '二十九': 29, '三十': 30
};

function cnNumToArabic(cn: string): number | null {
 const direct = CN_NUM_MAP[cn];
 if (direct) return direct;
 // 处理"三十一"到"九十九"
 const match = cn.match(/^([二三四五六七八九])?十([一二三四五六七八九])?$/);
 if (match) {
 const tens = match[1] ? CN_NUM_MAP[match[1]]! : 1;
 const ones = match[2] ? CN_NUM_MAP[match[2]]! : 0;
 return tens * 10 + ones;
 }
 return null;
}

/**
 * 从文本中解析多章大纲（支持多种格式）
 */
export function parseOutlineFromResponse(text: string): OutlineParseResult {
  const empty: OutlineParseResult = { success: false, chapters: [], rawOutlineText: '' };
  if (!text || typeof text !== 'string') return empty;

  // 先剥离思考/计划：模型可能在【大纲】标签内/外输出思维链，统一清掉再解析
  const stripped = stripThinkFromOutline(text);

  // 优先尝试标准格式
  const standardResult = parseStandardFormat(stripped);
  if (standardResult.success) return standardResult;

  // 尝试数字分段格式（1. 标题\n内容）
  const numberedResult = parseNumberedFormat(stripped);
  if (numberedResult.success) return numberedResult;

  // 尝试中文章节格式（第一章/第1章 标题）
  const chineseResult = parseChineseChapterFormat(stripped);
  if (chineseResult.success) return chineseResult;

  return empty;
}

/** 剥掉 AI 思维链（<think> 标签 或 不带标签的规划开头），再喂给大纲解析 */
function stripThinkFromOutline(raw: string): string {
  let text = String(raw || '');
  // 1. 剥 <think>...</think> 标签
  text = text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/gi, '')
    .trim();
  // 2. 剥不带标签的「规划/思考」开头（模型先自述再写大纲）
  const metaHead = text.match(/^(?:【思考】|【分析】|【规划】|思考：|分析：|我先|好的[，,]|好的[，,]?我|让我|根据用户|我需要|我打算|我将|现在来)[^\n]*\n+/i);
  if (metaHead) {
    text = text.slice(metaHead[0].length).trim();
  }
  return text;
}

/**
 * 标准格式：【大纲】...【/大纲】
 */
function parseStandardFormat(text: string): OutlineParseResult {
 const empty: OutlineParseResult = { success: false, chapters: [], rawOutlineText: '' };

 const outlineMatch = text.match(/[*]*【大纲】[*]*([\s\S]*?)[*]*【\/大纲】[*]*/);
 if (!outlineMatch) return empty;

 const rawOutlineText = outlineMatch[1].trim();
 if (!rawOutlineText) return empty;

 const chapterBlocks = rawOutlineText.split(/【第(\d+)章】/);
 const chapters: ParsedChapterOutline[] = [];

 for (let i = 1; i < chapterBlocks.length; i += 2) {
 const chapterNumber = parseInt(chapterBlocks[i], 10);
 const block = chapterBlocks[i + 1] || '';

 const titleMatch = block.match(/^([^\n【]+)/);
 const rawTitle = (titleMatch?.[1] || '').trim();
 const title = rawTitle.slice(0, MAX_TITLE_LENGTH);

 // 优先标准标签；AI 经常漏写【细纲】时，用标题后的整段正文兜底，避免「有标题无细纲」空卡
 const outlineContentMatch = block.match(/【细纲】([\s\S]*?)(?:【\/细纲】|$)/);
 let outline = (outlineContentMatch?.[1] || '').trim();
 if (!outline) {
  // 去掉标题行后的剩余文本作为细纲
  const afterTitle = block.replace(/^[^\n]*\n?/, '').trim();
  // 去掉其它标签壳
  outline = afterTitle
   .replace(/【情绪节点】[\s\S]*?(?:【\/情绪节点】|$)/g, '')
   .replace(/【收尾钩子】[\s\S]*?(?:【\/收尾钩子】|$)/g, '')
   .replace(/【细纲】|【\/细纲】/g, '')
   .trim();
 }

 const emotionMatch = block.match(/【情绪节点】([\s\S]*?)(?:【\/情绪节点】|$)/);
 const emotionNode = emotionMatch?.[1]?.trim() || undefined;

 const hookMatch = block.match(/【收尾钩子】([\s\S]*?)(?:【\/收尾钩子】|$)/);
 const endingHook = hookMatch?.[1]?.trim() || undefined;

 if (title || outline) {
 chapters.push({
 chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : chapters.length + 1,
 title,
 outline,
 emotionNode,
 endingHook
 });
 }
 }

 return { success: chapters.length > 0, chapters, rawOutlineText };
}

/**
 * 数字分段格式：
 * 1. 标题
 * 内容...
 * 
 * 2. 标题
 * 内容...
 */
function parseNumberedFormat(text: string): OutlineParseResult {
 const empty: OutlineParseResult = { success: false, chapters: [], rawOutlineText: '' };

 // 匹配 "数字." 或 "数字、" 或 "数字)" 开头的分段
 const pattern = /(?:^|\n)\s*(\d+)\s*[.、)）]\s*(.+)/g;
 const matches: Array<{ number: number; title: string; startIndex: number }> = [];
 let match;

 while ((match = pattern.exec(text)) !== null) {
 matches.push({
 number: parseInt(match[1], 10),
 title: match[2].trim(),
 startIndex: match.index + match[0].length
 });
 }

 // 至少要有 2 个分段才认为是大纲
 if (matches.length < 2) return empty;

 const chapters: ParsedChapterOutline[] = [];
 for (let i = 0; i < matches.length; i++) {
 const current = matches[i];
 const nextStart = i + 1 < matches.length ? text.lastIndexOf('\n', matches[i + 1].startIndex - matches[i + 1].title.length - 5) : text.length;
 const outline = text.slice(current.startIndex, nextStart).trim();

 // 标题可能包含冒号后的内容，分离出来
 const titleParts = current.title.split(/[：:]/);
 const title = (titleParts[0] || '').trim().slice(0, MAX_TITLE_LENGTH);
 const extraOutline = titleParts.length > 1 ? titleParts.slice(1).join('：').trim() : '';
 const fullOutline = [extraOutline, outline].filter(Boolean).join('\n');

 if (title) {
 chapters.push({
 chapterNumber: current.number,
 title,
 outline: fullOutline
 });
 }
 }

 return { success: chapters.length >= 2, chapters, rawOutlineText: text };
}

/**
 * 中文章节格式：
 * 第一章 标题 / 第1章 标题 / 第一章：标题
 * 内容...
 */
function parseChineseChapterFormat(text: string): OutlineParseResult {
 const empty: OutlineParseResult = { success: false, chapters: [], rawOutlineText: '' };

 // 匹配"第X章"（X 可以是阿拉伯数字或中文数字）
 const pattern = /(?:^|\n)\s*第([一二三四五六七八九十百\d]+)[章节回]\s*[：:.]?\s*(.+)/g;
 const matches: Array<{ number: number; title: string; startIndex: number }> = [];
 let match;

 while ((match = pattern.exec(text)) !== null) {
 const numStr = match[1];
 let num: number;
 if (/^\d+$/.test(numStr)) {
 num = parseInt(numStr, 10);
 } else {
 const converted = cnNumToArabic(numStr);
 if (!converted) continue;
 num = converted;
 }

 matches.push({
 number: num,
 title: match[2].trim(),
 startIndex: match.index + match[0].length
 });
 }

 if (matches.length < 2) return empty;

 const chapters: ParsedChapterOutline[] = [];
 for (let i = 0; i < matches.length; i++) {
 const current = matches[i];
 const nextStart = i + 1 < matches.length ? text.lastIndexOf('\n', matches[i + 1].startIndex - matches[i + 1].title.length - 10) : text.length;
 const outline = text.slice(current.startIndex, nextStart).trim();

 const title = current.title.slice(0, MAX_TITLE_LENGTH);

 if (title) {
 chapters.push({
 chapterNumber: current.number,
 title,
 outline
 });
 }
 }

 return { success: chapters.length >= 2, chapters, rawOutlineText: text };
}

/**
 * 检测文本是否包含可解析的大纲（任意格式）
 */
export function hasOutlineMarker(text: string): boolean {
 if (!text) return false;
 // 标准格式
 if (/[*]*【大纲】[*]*/.test(text) && /[*]*【\/大纲】[*]*/.test(text)) return true;
 // 数字分段（至少 2 个）
 const numberedCount = (text.match(/(?:^|\n)\s*\d+\s*[.、)）]\s*.+/g) || []).length;
 if (numberedCount >= 2) return true;
 // 中文章节（至少 2 个）
 const chapterCount = (text.match(/(?:^|\n)\s*第[一二三四五六七八九十百\d]+[章节回]\s*[：:.]?\s*.+/g) || []).length;
 if (chapterCount >= 2) return true;
 return false;
}
