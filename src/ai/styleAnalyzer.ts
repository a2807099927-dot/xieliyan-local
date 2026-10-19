/**
 * 写作风格分析器
 *
 * 四步流程：
 * 1. 第一层：统计+归纳（原文 + prompt → JSON 分析）
 * 2. 第二层：深挖+对比（原文 + 第一层摘要 + prompt → JSON 补充）
 * 3. 第三层：抽象+生成（前两层结果 + prompt → 句式模板，不带原文）
 * 4. 转化：前三层结果 → 最终写手 system prompt
 */

import { electronAPI } from '../utils/electron';


export interface StyleAnalysisProgress {
 step: number; // 1-4
 totalSteps: number; // 4
 message: string;
}

export interface StyleAnalysisResult {
 writerPrompt: string;
 rawAnalysis?: string; // 原始分析 JSON（调试用）
}

// ─── 第一层 Prompt ─────────────────────────────────────────────────────────────

// ─── Prompt 模板从 Rust 后端获取（安全：不暴露在 JS bundle 中）─────────────────
async function getPrompt(phase: 'A' | 'B' | 'C' | 'D'): Promise<string> {
 const prompt = await electronAPI.ai.getStyleExtractionPrompt(phase);
 if (!prompt) throw new Error(`无法获取分析提示词（阶段 ${phase}）`);
 return prompt;
}

// ─── 执行逻辑 ───────────────────────────────────────────────────────────────────

export async function analyzeWritingStyle(
 rawText: string,
 onProgress: (progress: StyleAnalysisProgress) => void
): Promise<StyleAnalysisResult> {
 const text = rawText.replace(/\r\n/g, '\n').trim();

 // ── 第一层：统计+归纳 ──────────────────────────────────────────────────────
 onProgress({ step: 1, totalSteps: 4, message: '正在分析写作技法（第一层：统计归纳）...' });

 const layer1System = await getPrompt('A');
 const layer1Response = await electronAPI.ai.chat({
 stream: false,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: layer1System },
 { role: 'user', content: `以下是需要分析的小说文本（共${text.length}字）：\n\n${text}` }
 ]
 });
 const layer1Result = layer1Response.text || '';
 if (!layer1Result.trim()) throw new Error('第一层分析未返回结果，请检查模型是否正常响应。');

 // ── 第二层：深挖+对比 ──────────────────────────────────────────────────────
 onProgress({ step: 2, totalSteps: 4, message: '正在深度分析（第二层：触发条件与对比案例）...' });

 const layer2System = await getPrompt('B');
 const layer2Response = await electronAPI.ai.chat({
 stream: false,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: layer2System },
 { role: 'user', content: `【第一层分析摘要】\n${layer1Result}\n\n【原文】\n${text}` }
 ]
 });
 const layer2Result = layer2Response.text || '';
 if (!layer2Result.trim()) throw new Error('第二层分析未返回结果。');

 // ── 第三层：句式模板（不带原文）────────────────────────────────────────────
 onProgress({ step: 3, totalSteps: 4, message: '正在提炼句式模板（第三层：可执行模板）...' });

 const layer3System = await getPrompt('C');
 const layer3Response = await electronAPI.ai.chat({
 stream: false,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: layer3System },
 { role: 'user', content: `【第一层分析结果】\n${layer1Result}\n\n【第二层分析结果】\n${layer2Result}` }
 ]
 });
 const layer3Result = layer3Response.text || '';
 if (!layer3Result.trim()) throw new Error('第三层分析未返回结果。');

 // ── 第四层：转化为写手 Prompt ──────────────────────────────────────────────
 onProgress({ step: 4, totalSteps: 4, message: '正在生成写手指令...' });

 const transformSystem = await getPrompt('D');
 const transformResponse = await electronAPI.ai.chat({
 stream: false,
 disableRag: true,
 disableStyle: true,
 messages: [
 { role: 'system', content: transformSystem },
 { role: 'user', content: `【第一层：统计归纳】\n${layer1Result}\n\n【第二层：触发条件与对比】\n${layer2Result}\n\n【第三层：句式模板】\n${layer3Result}` }
 ]
 });
 const writerPrompt = (transformResponse.text || '').trim();
 if (!writerPrompt) throw new Error('写手指令生成失败。');

 return {
 writerPrompt,
 rawAnalysis: [
 '=== 第一层分析 ===',
 layer1Result,
 '',
 '=== 第二层分析 ===',
 layer2Result,
 '',
 '=== 第三层分析 ===',
 layer3Result
 ].join('\n')
 };
}
