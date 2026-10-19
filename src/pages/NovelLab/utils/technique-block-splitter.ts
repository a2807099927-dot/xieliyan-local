// 章法分析卡 [card]...[/card] 块切分器
//
// 设计目标（design.md §Components and Interfaces · Block Splitter）：
// AI 批量输出按 [card]<json>[/card] 格式逐章封装。前端拿到完整的拼接文本后：
// 1. 用 detectFormat 判断是 'card' 新格式还是 'legacy-markdown' 旧格式
// 2. 'card' 格式 → splitCardBlocks 切出每章 JSON 字符串，逐张校验
// 3. 'legacy-markdown' 格式 → 走 AnalysisPanel 现有 Markdown 解析路径
//
// 性质保证（CP-7 流式分章原子性）：
// - 不闭合的 [card] 直接丢弃，永远不返回半张卡的字符串
// - splitCardBlocks 每次调用都从头扫，确保增量流式输入下结果稳定
//
// 性质保证（CP-8 旧存档读取无副作用）：
// - detectFormat='legacy-markdown' 路径绝不调用 safeParseTechniqueJson
// - 没有 [card] 标记的输入永远不会触发 parseError

const CARD_BLOCK_RE = /\[card\]([\s\S]*?)\[\/card\]/g;
const CARD_OPEN_RE = /\[card\]/;

/**
 * 把拼接的批量响应文本切成多个 JSON 字符串。
 *
 * 规则：
 * - 仅匹配 [card]...[/card] 完整闭合块
 * - 不闭合的 [card] 直接忽略（避免流式中途返回半张卡）
 * - 多个块按出现顺序保留
 * - 每段 JSON 字符串去除首尾空白，但内部保持原样（含换行、缩进）
 *
 * @param rawBatch 批量响应文本（assistant message 内容）
 * @returns 每章 JSON 字符串数组（不含 [card] 标记）
 */
export function splitCardBlocks(rawBatch: string): string[] {
 if (typeof rawBatch !== 'string' || rawBatch.length === 0) return [];

 const out: string[] = [];
 // 必须每次创建新的 RegExp 实例避免 lastIndex 状态串扰
 const re = new RegExp(CARD_BLOCK_RE.source, CARD_BLOCK_RE.flags);
 let m: RegExpExecArray | null;
 while ((m = re.exec(rawBatch)) !== null) {
 out.push(m[1].trim());
 }
 return out;
}

/**
 * 判断批量响应是新 card 格式还是旧 Markdown 格式。
 *
 * 优先级（GPT 强调的混合格式）：
 * - 含至少一个完整闭合的 [card]...[/card] 块 → 'card'
 * （即使同时含旧 Markdown 段落也优先走 card 路径，旧段落会被忽略）
 * - 仅含 [card] 但不闭合 → 'legacy-markdown'（按未识别处理，走旧路径）
 * - 完全没有 [card] 标记 → 'legacy-markdown'
 *
 * @param rawBatch 批量响应文本
 * @returns 'card' | 'legacy-markdown'
 */
export function detectFormat(rawBatch: string): 'card' | 'legacy-markdown' {
 if (typeof rawBatch !== 'string' || rawBatch.length === 0) {
 return 'legacy-markdown';
 }
 // 只有完整闭合块才认 card 格式
 const re = new RegExp(CARD_BLOCK_RE.source, CARD_BLOCK_RE.flags);
 return re.test(rawBatch) ? 'card' : 'legacy-markdown';
}

/**
 * 检查文本中是否存在不闭合的 [card]（仅诊断用，splitCardBlocks 不依赖此函数）。
 * 用于流式中途的"该章 streaming 中"占位渲染，避免显示半张卡。
 *
 * @returns true 表示存在 [card] 但缺对应的 [/card]
 */
export function hasUnclosedCard(rawBatch: string): boolean {
 if (typeof rawBatch !== 'string') return false;
 const openMatches = rawBatch.match(/\[card\]/g) ?? [];
 const closeMatches = rawBatch.match(/\[\/card\]/g) ?? [];
 return openMatches.length > closeMatches.length;
}

// 仅用于测试可见，确保 CARD_OPEN_RE 不被 unused 警告（其本意是给 hasUnclosedCard 留扩展）
void CARD_OPEN_RE;
