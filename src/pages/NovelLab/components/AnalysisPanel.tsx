import { sanitizeHtml } from '../../../utils/sanitizeHtml';
// AnalysisPanel.tsx - NovelLab analysis chat panel with batch analysis and follow-up Q&A.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisMode, Chapter, ChatMessage } from '../types';
import type { CrawlSession } from '../types';
import { BATCH_MESSAGE_PREFIX, useAnalysis, chunkChapters, CHUNK_CHAR_LIMIT, MAX_CHAPTERS_PER_BATCH } from '../hooks/useAnalysis';
import type { ChapterCardData, LegacyChapterCard as LegacyChapterCardData } from '../types/technique';
import { safeParseTechniqueJson } from '../utils/technique-schema';
import { detectFormat, splitCardBlocks } from '../utils/technique-block-splitter';
import ChapterCard from './ChapterCard';

/** 简易 Markdown → HTML 转换（仅处理标题、加粗、列表、换行） */
function simpleMarkdown(text: string): string {
 return text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .split('\n')
 .map((line) => {
 // 标题
 if (/^#{1,3}\s/.test(line)) {
 const level = (line.match(/^#+/) as RegExpMatchArray)[0].length;
 const content = line.replace(/^#+\s*/, '');
 const sizes: Record<number, string> = { 1: '18px', 2: '16px', 3: '14px' };
 return `<div style="font-size:${sizes[level] || '14px'};font-weight:700;color:#7dd3fc;margin:16px 0 8px;border-bottom:${level <= 2 ? '1px solid rgba(125,211,252,0.15)' : 'none'};padding-bottom:${level <= 2 ? '6px' : '0'}">${content}</div>`;
 }
 // 无序列表
 if (/^[-*•]\s/.test(line)) {
 const content = line.replace(/^[-*•]\s*/, '');
 return `<div style="padding-left:16px;position:relative;margin:3px 0"><span style="position:absolute;left:4px;color:#38bdf8">•</span>${formatInline(content)}</div>`;
 }
 // 空行
 if (!line.trim()) return '<div style="height:8px"></div>';
 // 普通段落
 return `<div style="margin:3px 0">${formatInline(line)}</div>`;
 })
 .join('');
}

function formatInline(text: string): string {
 return text
 .replace(/\*\*(.+?)\*\*/g, '<span style="font-weight:700;color:#e2e8f0">$1</span>')
 .replace(/「(.+?)」/g, '<span style="color:#a78bfa">「$1」</span>')
 .replace(/【(.+?)】/g, '<span style="color:#fbbf24;font-weight:600">【$1】</span>');
}


const MODES: Array<{ key: AnalysisMode; label: string }> = [
 { key: 'full', label: '全面分析' },
 { key: 'plot', label: '剧情脉络' },
 { key: 'character', label: '角色分析' },
 { key: 'technique', label: '写作技法' },
 { key: 'value', label: '章节价值' }
];

interface Props {
 activeChapter: Chapter | null;
 chapters?: Chapter[];
 session?: CrawlSession;
 archive?: any;
 restoredMessages?: { messages: ChatMessage[]; mode: AnalysisMode } | null;
 onRestoredConsumed?: () => void;
 selectedIndices: Set<number>;
}

/**
 * 批量响应文本 → ChapterCardData[]
 *
 * 设计约束（design.md §4.1，CP-7 / CP-8）：
 * - detectFormat='card' → 走 splitCardBlocks + safeParseTechniqueJson，产出 TechniqueAnalysisCard[]
 * - detectFormat='legacy-markdown' → 走旧的 Markdown 解析，产出 LegacyChapterCard[]
 * - 旧格式路径绝不调用 safeParseTechniqueJson，保证 parseError 不会误触发
 */
function parseBatchContent(content: string): { raw: string; cards: ChapterCardData[] } {
 const text = (content.startsWith(BATCH_MESSAGE_PREFIX) ? content.slice(BATCH_MESSAGE_PREFIX.length) : content).trim();


 // ── 截断修复：有 [card] 但没 [/card]，尝试补全 JSON ────────
 let repaired = text;
 if (text.includes('[card]') && !text.includes('[/card]')) {
 const cardStart = text.indexOf('[card]') + '[card]'.length;
 let jsonFragment = text.slice(cardStart).trim();
 // 尝试补全截断的 JSON：逐层闭合未关闭的括号和引号
 let inStr = false;
 let escaped = false;
 let braces = 0;
 let brackets = 0;
 let lastValidEnd = 0;
 for (let i = 0; i < jsonFragment.length; i++) {
 const c = jsonFragment[i];
 if (inStr) {
 if (escaped) { escaped = false; continue; }
 if (c === '\\') { escaped = true; continue; }
 if (c === '"') { inStr = false; }
 continue;
 }
 if (c === '"') { inStr = true; continue; }
 if (c === '{') braces++;
 if (c === '}') { braces--; if (braces === 0) { lastValidEnd = i + 1; } }
 if (c === '[') brackets++;
 if (c === ']') brackets--;
 }
 // 如果已有完整闭合的顶层对象，直接用
 if (lastValidEnd > 0) {
 repaired = '[card]' + jsonFragment.slice(0, lastValidEnd) + '[/card]';
 } else if (braces > 0) {
 // 未闭合：先关闭可能截断的字符串，再逐层补 ] 和 }
 let fix = jsonFragment;
 if (inStr) fix += '"';
 // 找最后一个完整的 key-value（在最后一个逗号处截断）
 const lastComma = fix.lastIndexOf(',');
 const lastColon = fix.lastIndexOf(':');
 if (lastComma > lastColon && lastComma > fix.length - 200) {
 fix = fix.slice(0, lastComma);
 }
 for (let i = 0; i < brackets; i++) fix += ']';
 for (let i = 0; i < braces; i++) fix += '}';
 repaired = '[card]' + fix + '[/card]';
 }
 }

 // ── 新格式（card）路径 ────────────────────────────────
 if (detectFormat(repaired) === 'card') {
 const blocks = splitCardBlocks(repaired);
 const cards: ChapterCardData[] = blocks.map((block, i) => {
 // ctx 的 chapterIndex / Title 由 JSON 字段覆盖，这里给个兜底
 const card = safeParseTechniqueJson(block, {
 chapterIndex: i + 1,
 chapterTitle: '',
 });
 // 让 JSON 里自带的 chapterIndex / chapterTitle 覆盖兜底（如果合法）
 // safeParseTechniqueJson 已经 spread ctx 在最前，所以 raw 里的 chapterIndex/Title
 // 不会被注入。这里手动从原始 block 里取一次，作为 UI 显示锚点。
 try {
 const raw = JSON.parse(block) as Record<string, unknown>;
 if (typeof raw.chapterIndex === 'number') card.chapterIndex = raw.chapterIndex;
 if (typeof raw.chapterTitle === 'string' && raw.chapterTitle.trim()) {
 card.chapterTitle = raw.chapterTitle;
 }
 } catch { /* parseError 已经被 validator 处理过，这里忽略 */ }
 return card;
 });
 return { raw: text, cards };
 }

 // ── 兜底：AI 未用 [card] 标记但返回了裸 JSON ──────────
 // 检测文本中是否包含 JSON 对象（含 chapterIndex / mainTag 等特征字段）
 const jsonObjects: string[] = [];
 // 用字符串感知的花括号配对提取顶层 {} 块（跳过字符串内的 {} ）
 let braceDepth = 0;
 let blockStart = -1;
 let inString = false;
 let escaped = false;
 for (let i = 0; i < repaired.length; i++) {
 const ch = repaired[i];
 if (inString) {
 if (escaped) { escaped = false; continue; }
 if (ch === '\\') { escaped = true; continue; }
 if (ch === '"') { inString = false; }
 continue;
 }
 if (ch === '"') { inString = true; continue; }
 if (ch === '{') {
 if (braceDepth === 0) blockStart = i;
 braceDepth++;
 } else if (ch === '}') {
 braceDepth--;
 if (braceDepth === 0 && blockStart >= 0) {
 const candidate = repaired.slice(blockStart, i + 1);
 // 快速检查是否含有特征字段（至少两个以上才认为是分析 JSON）
 const featureCount = [
 'chapterIndex', 'mainTag', 'readerDrive', 'reusablePattern',
 'storyOverview', 'writingTechniques', 'plotProgression',
 'contradictionAnalysis', 'expectationEngineering', 'emotionRhythm',
 'conflictSource', 'hookPlacement', 'characterAnalysis'
 ].filter(k => candidate.includes(`"${k}"`)).length;
 if (featureCount >= 2) {
 jsonObjects.push(candidate);
 }
 blockStart = -1;
 }
 }
 }
 if (jsonObjects.length > 0) {
 const cards: ChapterCardData[] = [];
 for (let i = 0; i < jsonObjects.length; i++) {
 try {
 const card = safeParseTechniqueJson(jsonObjects[i], {
 chapterIndex: i + 1,
 chapterTitle: '',
 });
 try {
 const raw = JSON.parse(jsonObjects[i]) as Record<string, unknown>;
 if (typeof raw.chapterIndex === 'number') card.chapterIndex = raw.chapterIndex;
 if (typeof raw.chapterTitle === 'string' && raw.chapterTitle.trim()) {
 card.chapterTitle = raw.chapterTitle;
 }
 } catch { /* ignore */ }
 cards.push(card);
 } catch { /* 单个 JSON 解析失败，跳过 */ }
 }
 if (cards.length > 0) {
 return { raw: text, cards };
 }
 }

 // ── 旧格式（legacy-markdown）路径 ─────────────────────
 // 与原版六宫格 parser 等价，但产出 LegacyChapterCard[] 形态供 ChapterCard 兼容渲染
 const sectionDefs = [
 { key: 'plot', label: '主线剧情', tone: 'plot', aliases: ['主线剧情', '剧情脉络', '剧情结构', '剧情'] },
 { key: 'characters', label: '角色变化', tone: 'characters', aliases: ['角色变化', '角色分析', '人物变化', '角色'] },
 { key: 'upgrades', label: '升级/收获', tone: 'upgrades', aliases: ['升级/收获', '升级收获', '升级', '收获'] },
 { key: 'highlights', label: '冲突高光', tone: 'highlights', aliases: ['冲突高光', '高光/冲突', '高光冲突', '冲突', '高光'] },
 { key: 'foreshadowing', label: '伏笔与悬念', tone: 'foreshadowing', aliases: ['伏笔与悬念', '伏笔悬念', '伏笔', '悬念'] },
 { key: 'craft', label: '写法借鉴', tone: 'craft', aliases: ['写法借鉴', '写作技法', '技法借鉴', '可借鉴写法'] },
 ];

 const normalizeHeading = (value: string) =>
 value
 .replace(/^#+\s*/, '')
 .replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')
 .replace(/\*\*/g, '')
 .replace(/[：:]\s*$/, '')
 .trim();

 const splitIntoChapters = () => {
 const matches = [...text.matchAll(/^##\s+(.+)$/gm)];
 if (matches.length === 0) return [{ title: '分析结果', body: text }];
 return matches.map((match, index) => {
 const start = (match.index || 0) + match[0].length;
 const end = matches[index + 1]?.index ?? text.length;
 return { title: normalizeHeading(match[1]), body: text.slice(start, end).trim() };
 });
 };

 const extractSections = (body: string) => {
 const headings = [...body.matchAll(/^(?:#{3,6}\s*)?(.{1,32}?)(?:\*\*)?\s*[：:]?\s*$/gm)]
 .map((match) => {
 const title = normalizeHeading(match[1]);
 const def = sectionDefs.find((item) => item.aliases.some((alias) => title.includes(alias)));
 return def ? { def, index: match.index || 0, length: match[0].length } : null;
 })
 .filter((item): item is { def: (typeof sectionDefs)[number]; index: number; length: number } => Boolean(item));

 return sectionDefs
 .map((def) => {
 const current = headings.find((item) => item.def.key === def.key);
 if (!current) return null;
 const next = headings.find((item) => item.index > current.index);
 const raw = body.slice(current.index + current.length, next?.index ?? body.length).trim();
 const points = raw
 .split('\n')
 .map((line) => line.replace(/^[-*•]\s*/, '').trim())
 .filter(Boolean)
 .slice(0, 8);
 return points.length > 0 ? { key: def.key, label: def.label, tone: def.tone, points } : null;
 })
 .filter((item): item is { key: string; label: string; tone: string; points: string[] } => Boolean(item));
 };

 const chapters = splitIntoChapters()
 .map((chapter, idx) => {
 const sections = extractSections(chapter.body);
 const card: LegacyChapterCardData = {
 chapterIndex: idx + 1,
 chapterTitle: chapter.title || `第 ${idx + 1} 章`,
 legacy: true,
 rawSections: sections,
 };
 return card;
 })
 .filter((c) => c.rawSections.length > 0);

 return { raw: text, cards: chapters as ChapterCardData[] };
}

const BatchCards = memo(({ content, onReanalyze }: { content: string; onReanalyze?: (chapterIndex: number) => void }) => {
 const data = useMemo(() => {
 try {
 return parseBatchContent(content);
 } catch {
 // JSON 解析完全失败，提取纯文字兜底
 const raw = (content.startsWith(BATCH_MESSAGE_PREFIX) ? content.slice(BATCH_MESSAGE_PREFIX.length) : content).trim();
 return { raw, cards: [] as ChapterCardData[] };
 }
 }, [content]);

 if (data.cards.length === 0) {
 // 兜底：显示纯文本；如果连文本都没有，提示错误
 if (!data.raw || data.raw.length < 5) {
 return <div className="nl-plain-result" style={{ color: '#f87171' }}>⚠️ AI 返回信息格式错误，无法解析</div>;
 }
 // 简易 Markdown 渲染：处理标题、加粗、列表
 return <div className="nl-plain-result" dangerouslySetInnerHTML={{ __html: sanitizeHtml(simpleMarkdown(data.raw)) }} />;
 }

 return (
 <div className="nl-analysis-container">
 {data.cards.map((card, idx) => (
 <ChapterCard
 key={`${card.chapterIndex}-${idx}`}
 data={card}
 onReanalyze={onReanalyze}
 />
 ))}
 </div>
 );
});

const StreamingText = memo(({ content, isStreaming }: { content: string; isStreaming?: boolean }) => (
 <div className="nl-stream-text">
 {content}
 {isStreaming && <span className="nl-cursor">|</span>}
 </div>
));

const MessageItem = memo(({ msg, onRetry, onReanalyze }: { msg: ChatMessage; onRetry?: () => void; onReanalyze?: (chapterIndex: number) => void }) => {
 if (msg.role === 'user') return <div className="nl-msg nl-msg-user">{msg.content}</div>;
 if (msg.content.startsWith(BATCH_MESSAGE_PREFIX)) {
 // 流式中：智能显示
 if (msg.isStreaming) {
 const rawText = msg.content.slice(BATCH_MESSAGE_PREFIX.length);
 const cardStart = rawText.indexOf('[card]');
 const cardEnd = rawText.indexOf('[/card]');
 
 // 已经有完整 [card]...[/card] → 直接渲染卡片（流式完成前就能看到）
 if (cardStart >= 0 && cardEnd > cardStart) {
 return <BatchCards content={msg.content} />;
 }
 
 // 已开始输出 [card] 但未闭合 → 显示"正在生成卡片"
 if (cardStart >= 0) {
 return (
 <div className="nl-msg nl-msg-ai">
 <div style={{ color: '#7dd3fc', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
 <span className="nl-cursor">|</span>
 <span>正在生成分析卡片…（{rawText.length} 字）</span>
 </div>
 </div>
 );
 }
 
 // 还没出现 [card] → AI 可能在"思考"，显示等待状态
 if (rawText.length > 20) {
 return (
 <div className="nl-msg nl-msg-ai">
 <div style={{ color: '#94a3b8', fontSize: '12px' }}>
 <span>AI 正在分析内容…（已接收 {rawText.length} 字）</span>
 <span className="nl-cursor" style={{ marginLeft: '4px' }}>|</span>
 </div>
 </div>
 );
 }
 
 // 刚开始，文字很少
 return (
 <div className="nl-msg nl-msg-ai">
 <div className="nl-stream-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(simpleMarkdown(rawText)) }} />
 <span className="nl-cursor">|</span>
 </div>
 );
 }
 return <BatchCards content={msg.content} onReanalyze={onReanalyze} />;
 }
 const isError = msg.content.startsWith('⚠️') || msg.content.includes('分析失败');
 return (
 <div className="nl-msg nl-msg-ai">
 <StreamingText content={msg.content} isStreaming={msg.isStreaming} />
 {isError && onRetry ? (
 <button onClick={onRetry} style={{ marginTop: '8px', padding: '4px 12px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#c4b5fd', fontSize: '12px', cursor: 'pointer' }}>重试该章节</button>
 ) : null}
 </div>
 );
});

const BatchProgressBar = memo(({ batchStatus, isAnalyzing }: { batchStatus: string; isAnalyzing: boolean }) => {
 if (!isAnalyzing || !batchStatus) return null;
 return (
 <div className="nl-batch-progress">
 <div className="nl-batch-progress-dot"/>
 <span className="nl-batch-progress-text">{batchStatus}</span>
 </div>
 );
});

export default function AnalysisPanel({ activeChapter, chapters = [], session, archive, restoredMessages, onRestoredConsumed, selectedIndices }: Props) {
 const [inputText, setInputText] = useState('');
 const { messages, setMessages, activeMode, setActiveMode, isAnalyzing, batchStatus, startBatchAnalysis, ask, stop, retryFailed, reanalyzeChapter } = useAnalysis();
 const endRef = useRef<HTMLDivElement | null>(null);
 const msgIds = useRef<WeakMap<ChatMessage, string>>(new WeakMap());

 // 持久化对话记录到 localStorage
 const STORAGE_KEY = 'writerzen:novel-lab:analysis-chat';
 const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const hasRestoredRef = useRef(false);

 // 组件挂载时恢复上次对话
 useEffect(() => {
 if (hasRestoredRef.current) return;
 hasRestoredRef.current = true;
 try {
 const raw = window.localStorage.getItem(STORAGE_KEY);
 if (raw) {
 const parsed = JSON.parse(raw) as { messages?: ChatMessage[]; mode?: AnalysisMode };
 if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
 setMessages(parsed.messages.filter(m => !m.isStreaming));
 if (parsed.mode) setActiveMode(parsed.mode);
 }
 }
 } catch { /* ignore */ }
 }, [setMessages, setActiveMode]);

 // messages 变化时自动保存（防抖）
 useEffect(() => {
 if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
 saveTimerRef.current = setTimeout(() => {
 try {
 const toSave = messages.filter(m => !m.isStreaming).slice(-60);
 window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: toSave, mode: activeMode }));
 } catch { /* ignore */ }
 }, 1000);
 return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
 }, [messages, activeMode]);

 // 旧六宫格章节卡的"重新分析"按钮回调：
 // 用 chapterIndex 在 chapters props 里找对应章节后调 reanalyzeChapter
 const handleReanalyzeFromCard = useCallback(
 (chapterIndex: number) => {
 const target =
 chapters.find((c) => c.index === chapterIndex) ??
 (activeChapter && activeChapter.index === chapterIndex ? activeChapter : null);
 if (target && reanalyzeChapter) {
 void reanalyzeChapter(target);
 }
 },
 [chapters, activeChapter, reanalyzeChapter],
 );

 const scrollRaf = useRef<number | null>(null);
 const scrollToBottom = useCallback(() => {
 if (scrollRaf.current) return;
 scrollRaf.current = requestAnimationFrame(() => {
 scrollRaf.current = null;
 endRef.current?.scrollIntoView({ behavior: 'smooth' });
 });
 }, []);

 const targetChapters = useMemo(() => (chapters.length > 0 ? chapters : activeChapter ? [activeChapter] : []), [chapters, activeChapter]);

  const selectedChapters = useMemo(
    () => targetChapters.filter((ch) => selectedIndices.has(ch.index) && ch.content && ch.content.length > 0),
    [targetChapters, selectedIndices]
  );
  const selectedChars = useMemo(() => selectedChapters.reduce((acc, ch) => acc + (ch.content?.length || 0), 0), [selectedChapters]);
  const batchCount = useMemo(
    () => (selectedChapters.length === 0 ? 0 : chunkChapters(selectedChapters, CHUNK_CHAR_LIMIT, MAX_CHAPTERS_PER_BATCH).length),
    [selectedChapters]
  );


 const totalLength = useMemo(() => targetChapters.reduce((acc, ch) => acc + (ch.content?.length || 0), 0), [targetChapters]);

  const prevIsAnalyzing = useRef(isAnalyzing);
  const lastAutoSavedRef = useRef('');
  useEffect(() => {
    const justFinished = prevIsAnalyzing.current && !isAnalyzing;
    prevIsAnalyzing.current = isAnalyzing;
    if (!justFinished) return;
    if (!session?.savePath || !session?.bookName) return;
    // 仅在存在真正的批量分析结果时自动存档（追问/空结果/中途停止均不触发）
    const hasBatchResult = messages.some(
      (m) => m.role === 'assistant' && m.content.startsWith(BATCH_MESSAGE_PREFIX)
    );
    if (!hasBatchResult) return;
    const analyzed = selectedChapters.length > 0 ? selectedChapters : targetChapters;
    const chapterFrom = analyzed[0]?.index ?? 1;
    const chapterTo = analyzed[analyzed.length - 1]?.index ?? 1;
    const sig = session.bookName + '|' + activeMode + '|' + chapterFrom + '-' + chapterTo + '|' + messages.length;
    if (lastAutoSavedRef.current === sig) return;
    lastAutoSavedRef.current = sig;
    void archive?.saveAnalysis(session.savePath, session.bookName, activeMode, chapterFrom, chapterTo, messages);
  }, [isAnalyzing, messages, session, activeMode, selectedChapters, targetChapters, archive]);

 // 用 ref 追踪上一次的 targetChapters 标识，切换书籍时重置消息
 const prevChaptersKeyRef = useRef('');

 useEffect(() => {
 if (restoredMessages) {
 setMessages(restoredMessages.messages);
 setActiveMode(restoredMessages.mode);
 onRestoredConsumed?.();
 return;
 }
 if (targetChapters.length === 0) return;
 // 只统计有内容的章节
 const chaptersWithContent = targetChapters.filter(ch => ch.content && ch.content.length > 0);
 const chaptersKey = `${chaptersWithContent.length}|${totalLength}`;
 const changed = prevChaptersKeyRef.current !== chaptersKey;
 prevChaptersKeyRef.current = chaptersKey;
    if (changed) { }

 // 章节数量变化时更新欢迎消息（除非用户已经开始了分析对话）
 const hasAnalysisResults = messages.some(m => m.role === 'assistant' && m.content.startsWith('[batch]'));
 if (changed && !hasAnalysisResults) {
 setMessages([
 {
 role: 'assistant',
 content: chaptersWithContent.length > 0
 ? `已准备：${chaptersWithContent.length} 章（${totalLength} 字），点击"开始批量深度分析"进行拆解。`
 : `已提取 ${targetChapters.length} 章标题，请先提取章节内容后再分析。`
 }
 ]);
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [targetChapters, totalLength, restoredMessages]);

 useEffect(() => {
 scrollToBottom();
 }, [messages, scrollToBottom]);

 const sendQuestion = useCallback(() => {
 if (!inputText.trim()) return;
 const q = inputText.trim();
 setInputText('');
 // 检测重试关键词（不需要章节数据）
 if (/^重试$|^retry$/i.test(q)) { retryFailed(); return; }
 if (targetChapters.length === 0) return;
 const dummyChapter = {
 ...targetChapters[0],
 title: targetChapters.length > 1 ? `共 ${targetChapters.length} 章` : targetChapters[0].title,
 content: targetChapters.length > 1 ? targetChapters.map((c) => c.content).join('\n\n') : targetChapters[0].content
 };
 ask(dummyChapter, q);
 }, [targetChapters, ask, inputText, retryFailed]);

 const handleStartAnalysis = useCallback(() => {
 const withContent = targetChapters.filter(ch => selectedIndices.has(ch.index) && ch.content && ch.content.length > 0);
 if (withContent.length === 0) return;
 startBatchAnalysis(withContent, activeMode);
 }, [targetChapters, selectedIndices, activeMode, startBatchAnalysis]);

 return (
 <div className="nl-pane">
 <div className="nl-row nl-wrap">
 {MODES.map((m) => (
 <button key={m.key} className={`nl-btn ${activeMode === m.key ? 'nl-btn-accent' : ''}`} onClick={() => setActiveMode(m.key)}>
 {m.label}
 </button>
 ))}
 </div>



 <div className="nl-row">
 <button className="nl-btn nl-btn-accent" disabled={selectedChapters.length === 0 || isAnalyzing} onClick={handleStartAnalysis}>
 {isAnalyzing && batchStatus ? batchStatus : isAnalyzing ? '准备中...' : selectedChapters.length > 0 ? `开始分析（已选 ${selectedChapters.length} 章）` : '请先选择章节'}
 </button>
 <button className="nl-btn"disabled={!isAnalyzing} onClick={stop}>停止</button>
 <button className="nl-btn"onClick={() => setMessages([])} disabled={isAnalyzing || messages.length === 0}>清空</button>
 </div>

 <div className="nl-chat">
 {messages.map((msg, i) => (
 <MessageItem
 key={i}
 msg={msg}
 onRetry={(msg.role === 'assistant' && (msg.content.startsWith('⚠️') || msg.content.includes('分析失败'))) ? retryFailed : undefined}
 onReanalyze={handleReanalyzeFromCard}
 />
 ))}
 <BatchProgressBar batchStatus={batchStatus} isAnalyzing={isAnalyzing} />
 <div ref={endRef} />
 </div>

 <div className="nl-row">
 <textarea
 className="nl-input nl-textarea"
 value={inputText}
 disabled={isAnalyzing}
 onChange={(e) => setInputText(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendQuestion();
 }
 }}
 placeholder={targetChapters.length > 0 ? '输入追问，Enter 发送' : '请先提取章节'}
 />
 <button className="nl-btn nl-btn-accent"disabled={!inputText.trim() || isAnalyzing} onClick={sendQuestion}>
 发送
 </button>
 </div>
 </div>
 );
}
