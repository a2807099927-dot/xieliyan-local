import { useState, useCallback } from 'react';
import { electronAPI } from '../utils/electron';

export type ExtractionPhase = 'idle' | 'phaseA' | 'phaseB' | 'phaseC' | 'done' | 'error';

export interface ExtractionState {
 phase: ExtractionPhase;
 progress: number; // 0-100
 resultText: string | null;
 error: string | null;
}

/* ── 提示词安全说明 ──
 * 所有阶段提示词已从本文件移除，改为从 Rust 后端实时获取。
 * Rust 二进制中的字符串常量需反编译才能提取，前端 JS bundle 完全不可见。
 */

function cleanInternalTerms(text: string): string {
 // Remove structural leakage: category IDs, dimension names, JSON keys
 return text
 .replace(/"id"\s*:\s*"[A-F]"\s*,?/gi, '')
 .replace(/\{\s*"categories"\s*:/gi, '{')
 .replace(/切面[A-F][：:]?\s*/gi, '')
 .replace(/categories|observations|samples|principle|fingerprint|topPatterns/gi, '');
}

function stripCodeBlocks(text: string): string {
 return text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
}

function safeJsonParse(text: string): unknown {
 const cleaned = stripCodeBlocks(text);
 try {
 const firstBrace = cleaned.indexOf('{');
 const firstBracket = cleaned.indexOf('[');
 if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
 const lastBrace = cleaned.lastIndexOf('}');
 if (lastBrace >= firstBrace) return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
 }
 if (firstBracket >= 0) {
 const lastBracket = cleaned.lastIndexOf(']');
 if (lastBracket >= firstBracket) return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
 }
 return JSON.parse(cleaned);
 } catch {
 return null;
 }
}

function extractStringArray(raw: string): string[] {
 if (!raw.trim()) return [];
 try {
 const parsed = JSON.parse('[' + raw + ']');
 if (Array.isArray(parsed)) {
 return parsed.map((s) => String(s || '').trim()).filter((s) => s.length > 0);
 }
 } catch {
 // fallback
 }
 const items: string[] = [];
 let inQuote = false;
 let quoteChar = '';
 let current = '';
 for (const ch of raw) {
 if (!inQuote && (ch === '"' || ch === "'")) {
 inQuote = true;
 quoteChar = ch;
 } else if (inQuote && ch === quoteChar) {
 inQuote = false;
 items.push(current);
 current = '';
 quoteChar = '';
 } else if (inQuote) {
 current += ch;
 }
 }
 return items.filter((s) => s.trim().length > 0);
}

function mergeToMarkdown(phaseA: string, phaseB: string, phaseC: string): string {
 let md = '';

 const parsedA = safeJsonParse(phaseA) as any;
 const parsedB = safeJsonParse(phaseB) as any;
 const parsedC = safeJsonParse(phaseC) as any;

 // ── Section 1: Core Craft fingerprint (from Phase A) ──
 md += '## 一、写作技法特征\n\n';

 const fp = parsedA?.craft_fingerprint || parsedA?.fingerprint || parsedA;
 if (fp && typeof fp === 'object') {
 const ds = fp.dialogue_style || fp.dialogue;
 const rs = fp.rhythm_style || fp.rhythm;
 const des = fp.description_style || fp.description;
 const ss = fp.structure_style || fp.structure;
 if (ds) md += `**对话技法：** ${ds}\n\n`;
 if (rs) md += `**节奏控制：** ${rs}\n\n`;
 if (des) md += `**描写技法：** ${des}\n\n`;
 if (ss) md += `**叙事结构：** ${ss}\n\n`;
 }
 if (!fp?.dialogue_style && !fp?.dialogue && !fp?.rhythm_style && !fp?.rhythm && !fp?.description_style && !fp?.description && !fp?.structure_style && !fp?.structure) {
 const fpMatch = phaseA.match(/"(?:craft_fingerprint|fingerprint)"\s*:\s*\{([^}]+)\}/s);
 if (fpMatch) {
 const fpText = fpMatch[1];
 const dialogue = fpText.match(/"(?:dialogue_style|dialogue)"\s*:\s*"([^"]+)"/)?.[1];
 const rhythm = fpText.match(/"(?:rhythm_style|rhythm)"\s*:\s*"([^"]+)"/)?.[1];
 const description = fpText.match(/"(?:description_style|description)"\s*:\s*"([^"]+)"/)?.[1];
 const structure = fpText.match(/"(?:structure_style|structure)"\s*:\s*"([^"]+)"/)?.[1];
 if (dialogue) md += `**对话技法：** ${dialogue}\n\n`;
 if (rhythm) md += `**节奏控制：** ${rhythm}\n\n`;
 if (description) md += `**描写技法：** ${description}\n\n`;
 if (structure) md += `**叙事结构：** ${structure}\n\n`;
 }
 }

 const patterns = parsedA?.top_patterns || parsedA?.topPatterns;
 if (Array.isArray(patterns) && patterns.length > 0) {
 md += '**最显著的技法规律：**\n';
 patterns.forEach((item: any, i: number) => {
 md += `${i + 1}. ${String(item).trim()}\n`;
 });
 md += '\n';
 } else {
 const patternsMatch = phaseA.match(/"(?:top_patterns|topPatterns)"\s*:\s*\[([^\]]+)\]/s);
 if (patternsMatch) {
 const items = extractStringArray(patternsMatch[1]);
 if (items.length) {
 md += '**最显著的技法规律：**\n';
 items.forEach((item, i) => { md += `${i + 1}. ${item}\n`; });
 md += '\n';
 }
 }
 }

 // ── Section 2: Triggers & Contrast (from Phase B) ──
 md += '## 二、技法触发条件与对比规律\n\n';

 const triggers = parsedB?.trigger_conditions || parsedB?.triggers;
 if (Array.isArray(triggers) && triggers.length > 0) {
 md += '**典型触发模式：**\n';
 triggers.forEach((t: any) => { md += `- ${String(t).trim()}\n`; });
 md += '\n';
 } else {
 const triggersMatch = phaseB.match(/"(?:trigger_conditions|triggers)"\s*:\s*\[([\s\S]*?)\](?=\s*[,\}])/s);
 if (triggersMatch) {
 const items = extractStringArray(triggersMatch[1]).filter((s) => s.length > 10);
 if (items.length) {
 md += '**典型触发模式：**\n';
 items.forEach((t) => { md += `- ${t}\n`; });
 md += '\n';
 }
 }
 }

 const contrasts = parsedB?.contrast_cases || parsedB?.contrasts;
 if (Array.isArray(contrasts) && contrasts.length > 0) {
 md += '**同一情境下的不同处理：**\n';
 contrasts.forEach((entry: any) => {
 if (entry.optionA && entry.whyA) {
 md += `- 方式A：${entry.optionA} —— 原因在于：${entry.whyA}\n`;
 }
 });
 md += '\n';
 } else {
 const contrastMatch = phaseB.match(/"(?:contrast_cases|contrasts)"\s*:\s*\[([\s\S]*?)\](?=\s*[,\}])/s);
 if (contrastMatch && contrastMatch[1].trim()) {
 md += '**同一情境下的不同处理：**\n';
 const entries = contrastMatch[1].split('},').filter((s) => s.includes('optionA'));
 entries.forEach((entry) => {
 const a = entry.match(/"optionA"\s*:\s*"([^"]+)"/)?.[1];
 const why = entry.match(/"whyA"\s*:\s*"([^"]+)"/)?.[1];
 if (a && why) md += `- 方式A：${a} —— 原因在于：${why}\n`;
 });
 md += '\n';
 }
 }

 const transitions = parsedB?.transitions;
 if (transitions && typeof transitions === 'object') {
 md += '**转场与过渡策略：**\n';
 const sceneSignals = Array.isArray(transitions.sceneSignals) ? transitions.sceneSignals : [];
 const timeJumps = Array.isArray(transitions.timeJumps) ? transitions.timeJumps : [];
 const moodShifts = Array.isArray(transitions.moodShifts) ? transitions.moodShifts : [];
 if (sceneSignals.length) md += `- 场景切换信号：${sceneSignals.join('；')}\n`;
 if (timeJumps.length) md += `- 时间跳跃处理：${timeJumps.join('；')}\n`;
 if (moodShifts.length) md += `- 情绪切换过渡：${moodShifts.join('；')}\n`;
 md += '\n';
 } else {
 const transMatch = phaseB.match(/"transitions"\s*:\s*\{([^}]+)\}/s);
 if (transMatch) {
 md += '**转场与过渡策略：**\n';
 const sceneSignals = transMatch[1].match(/"sceneSignals"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 const timeJumps = transMatch[1].match(/"timeJumps"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 const moodShifts = transMatch[1].match(/"moodShifts"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 if (sceneSignals) {
 const items = extractStringArray(sceneSignals);
 if (items.length) md += `- 场景切换信号：${items.join('；')}\n`;
 }
 if (timeJumps) {
 const items = extractStringArray(timeJumps);
 if (items.length) md += `- 时间跳跃处理：${items.join('；')}\n`;
 }
 if (moodShifts) {
 const items = extractStringArray(moodShifts);
 if (items.length) md += `- 情绪切换过渡：${items.join('；')}\n`;
 }
 md += '\n';
 }
 }

 const escalation = parsedB?.escalation;
 if (escalation && typeof escalation === 'object') {
 md += '**冲突升级语言特征：**\n';
 const seething = Array.isArray(escalation.seething) ? escalation.seething.slice(0, 5) : [];
 const confrontation = Array.isArray(escalation.confrontation) ? escalation.confrontation.slice(0, 5) : [];
 const eruption = Array.isArray(escalation.eruption) ? escalation.eruption.slice(0, 5) : [];
 if (seething.length) md += `- 暗流涌动阶段：${seething.join('、')}\n`;
 if (confrontation.length) md += `- 正面交锋阶段：${confrontation.join('、')}\n`;
 if (eruption.length) md += `- 全面爆发阶段：${eruption.join('、')}\n`;
 md += '\n';
 } else {
 const escMatch = phaseB.match(/"escalation"\s*:\s*\{([^}]+)\}/s);
 if (escMatch) {
 md += '**冲突升级语言特征：**\n';
 const seething = escMatch[1].match(/"seething"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 const confrontation = escMatch[1].match(/"confrontation"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 const eruption = escMatch[1].match(/"eruption"\s*:\s*\[([\s\S]*?)\](?=\s*[,\]\}])/s)?.[1];
 if (seething) {
 const items = extractStringArray(seething).slice(0, 5);
 if (items.length) md += `- 暗流涌动阶段：${items.join('、')}\n`;
 }
 if (confrontation) {
 const items = extractStringArray(confrontation).slice(0, 5);
 if (items.length) md += `- 正面交锋阶段：${items.join('、')}\n`;
 }
 if (eruption) {
 const items = extractStringArray(eruption).slice(0, 5);
 if (items.length) md += `- 全面爆发阶段：${items.join('、')}\n`;
 }
 md += '\n';
 }
 }

 // ── Section 3: Templates (from Phase C) ──
 md += '## 三、可直接套用的句式模板\n\n';

 // 场景分类：keywords 用于模糊匹配 AI 返回的 scene 名称
 const sceneCategories: Array<{ keywords: string[]; label: string }> = [
 { keywords: ['对话开场', '对话', '开场'], label: '对话开场句' },
 { keywords: ['冲突降温', '降温', '收场'], label: '冲突降温句' },
 { keywords: ['场景转场', '转场', '过渡'], label: '场景转场句' },
 { keywords: ['心理独白', '内心', '独白'], label: '心理独白句' },
 { keywords: ['章节收尾', '收尾', '钩子', '结尾'], label: '章节收尾钩子句' },
 ];

 function matchCategory(sceneName: string): string | null {
 for (const cat of sceneCategories) {
 if (cat.keywords.some((kw) => sceneName.includes(kw))) return cat.label;
 }
 return null;
 }

 const labelMap: Record<string, string[]> = {};
 let templates: any[] = [];
 if (Array.isArray(parsedC)) {
 templates = parsedC;
 } else if (parsedC && typeof parsedC === 'object') {
 templates = parsedC.templates || parsedC.scenes || [];
 if (!Array.isArray(templates) || templates.length === 0) {
 // Try to collect all array values from the object
 templates = Object.values(parsedC).filter(Array.isArray).flat();
 }
 }
 for (const t of templates) {
 if (!t || typeof t !== 'object') continue;
 const scene = String(t.scene || t.scene_type || t.name || t.type || t.sceneName || '').trim();
 const sentences = Array.isArray(t.sentences)
 ? t.sentences.map(String).filter((s: string) => s.trim().length > 0)
 : Array.isArray(t.templates)
 ? t.templates.map(String).filter((s: string) => s.trim().length > 0)
 : [];
 if (scene && sentences.length) {
 const label = matchCategory(scene) || scene;
 if (!labelMap[label]) labelMap[label] = [];
 labelMap[label].push(...sentences);
 }
 }

 // Fallback: regex extraction from raw phaseC text
 if (Object.keys(labelMap).length === 0) {
 const cleanPhaseC = stripCodeBlocks(phaseC);
 // Find all scene_type/scene entries and their templates/sentences
 const blockRegex = /"(?:scene|scene_type|name|type)"\s*:\s*"([^"]+)"/g;
 let blockMatch: RegExpExecArray | null;
 while ((blockMatch = blockRegex.exec(cleanPhaseC)) !== null) {
 const sceneName = blockMatch[1];
 const afterScene = cleanPhaseC.slice(blockMatch.index + blockMatch[0].length);
 const sentencesMatch = afterScene.match(/"(?:sentences|templates)"\s*:\s*\[([\s\S]*?)\]/s);
 if (sentencesMatch) {
 const items = extractStringArray(sentencesMatch[1]);
 if (items.length) {
 const label = matchCategory(sceneName) || sceneName;
 if (!labelMap[label]) labelMap[label] = [];
 labelMap[label].push(...items);
 }
 }
 }
 }

 // Output all matched categories, plus any unmatched ones
 const outputOrder = sceneCategories.map((c) => c.label);
 const outputSet = new Set<string>();
 for (const label of outputOrder) {
 const sentences = labelMap[label];
 if (sentences && sentences.length) {
 outputSet.add(label);
 md += `**${label}**\n`;
 sentences.forEach((s, i) => { md += `${i + 1}. ${s}\n`; });
 md += '\n';
 }
 }
 // Output any extra categories not in our predefined list
 for (const [label, sentences] of Object.entries(labelMap)) {
 if (outputSet.has(label) || !sentences.length) continue;
 md += `**${label}**\n`;
 sentences.forEach((s, i) => { md += `${i + 1}. ${s}\n`; });
 md += '\n';
 }

 return md.trim();
}


/* ── Hook ── */

export function useStyleExtraction() {
 const [state, setState] = useState<ExtractionState>({
 phase: 'idle',
 progress: 0,
 resultText: null,
 error: null,
 });

 const startExtraction = useCallback(async (sourceText: string, signal?: AbortSignal) => {
 const text = sourceText;
 let phaseA = '';
 let phaseB = '';
 let phaseC = '';

 setState({ phase: 'phaseA', progress: 5, resultText: null, error: null });

 try {
 /* ── 从 Rust 后端安全获取提示词（前端 JS bundle 不可见） ── */
 const [promptA, promptB, promptC] = await Promise.all([
 electronAPI.ai.getStyleExtractionPrompt('A'),
 electronAPI.ai.getStyleExtractionPrompt('B'),
 electronAPI.ai.getStyleExtractionPrompt('C'),
 ]);

 /* ── Phase A ── */
 const respA = await electronAPI.ai.chat({
 messages: [
 { role: 'system', content: '严格按照用户提示词中的输出格式要求执行。一切以用户设置的提示词为主，不得擅自修改字段名或结构。只输出合法的JSON，不要添加任何解释文字或markdown代码块标记。' },
 { role: 'user', content: promptA + '\n\n---\n\n文本内容：\n' + text },
 ],
 stream: false,
 disableRag: true,
 disableStyle: true,
 maxTokens: 4096,
 });
 phaseA = respA.text;
 setState({ phase: 'phaseA', progress: 35, resultText: null, error: null });

 /* ── Phase B ── */
 const phaseASummary = phaseA.length > 1500 ? phaseA.slice(0, 1500) + '\n...[已截断]' : phaseA;
 const respB = await electronAPI.ai.chat({
 messages: [
 { role: 'system', content: '严格按照用户提示词中的输出格式要求执行。一切以用户设置的提示词为主，不得擅自修改字段名或结构。只输出合法的JSON，不要添加任何解释文字或markdown代码块标记。' },
 { role: 'user', content: promptA + '\n\n---\n\n文本内容：\n' + text },
 { role: 'assistant', content: phaseASummary },
 { role: 'user', content: promptB },
 ],
 stream: false,
 disableRag: true,
 disableStyle: true,
 maxTokens: 4096,
 });
 phaseB = respB.text;
 setState({ phase: 'phaseB', progress: 65, resultText: null, error: null });

 /* ── Phase C ── */
 const phaseBTruncated = phaseB.length > 1500 ? phaseB.slice(0, 1500) + '\n...[已截断]' : phaseB;
 const phaseATruncated = phaseA.length > 1500 ? phaseA.slice(0, 1500) + '\n...[已截断]' : phaseA;
 const respC = await electronAPI.ai.chat({
 messages: [
 { role: 'system', content: '严格按照用户提示词中的输出格式要求执行。一切以用户设置的提示词为主，不得擅自修改字段名或结构。只输出合法的JSON，不要添加任何解释文字或markdown代码块标记。' },
 { role: 'user', content: promptA + '\n\n---\n\n文本内容：\n' + text },
 { role: 'assistant', content: phaseATruncated },
 { role: 'user', content: promptB },
 { role: 'assistant', content: phaseBTruncated },
 { role: 'user', content: promptC },
 ],
 stream: false,
 disableRag: true,
 disableStyle: true,
 maxTokens: 8192,
 });
 phaseC = respC.text;
 setState({ phase: 'phaseC', progress: 90, resultText: null, error: null });

 /* ── Merge & Clean ── */
 const merged = mergeToMarkdown(phaseA, phaseB, phaseC);
 const cleaned = cleanInternalTerms(merged);
 setState({ phase: 'done', progress: 100, resultText: cleaned, error: null });
 return cleaned;
 } catch (err: any) {
 const msg = err?.message || String(err);
 setState({ phase: 'error', progress: 0, resultText: null, error: msg });
 throw err;
 }
 }, []);

 const reset = useCallback(() => {
 setState({ phase: 'idle', progress: 0, resultText: null, error: null });
 }, []);

 return { state, startExtraction, reset };
}
