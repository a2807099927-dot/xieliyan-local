import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Book } from '../../types';
import { Lightbulb, Sparkles, Archive, Inbox, Trash2, History, X, ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { EditableOutlineGrid } from './EditableOutlineGrid';
import {
	ChatMessage,
	callAI,
	buildDeductionContext,
	parseOutlineCards,
	OutlineCard,
	DeductionContext,
} from './plotDeductionHelpers';
import { useBookStore } from '../../store/useBookStore';

interface Props {
	bookId: string;
	book: Book;
}

function getFriendlyError(errStr: string): string {
	if (!errStr) return '推演失败，发生未知错误';
	const s = String(errStr).toLowerCase();
	if (s.includes('insufficient_balance') || s.includes('insufficient account balance') || s.includes('余额不足')) {
		return 'API 余额不足，请前往配置的模型服务商充值后重试。';
	}
	if (s.includes('context length exceeded') || s.includes('context_length_exceeded')) {
		return '上下文长度超出模型限制，请删减部分正文或选择支持更长上下文的模型。';
	}
	if (s.includes('429') || s.includes('too many requests')) {
		return '请求过于频繁，请稍后重试。';
	}
	if (s.includes('failed to fetch') || s.includes('network error')) {
		return '网络连接失败，请检查网络或 API 地址是否正确。';
	}
	if (s.includes('api key 未配置')) {
		return 'API Key 未配置，请前往设置填写。';
	}
	return String(errStr);
}

export function PlotDeductionWorkspace({ bookId, book }: Props) {
	const [noteInput, setNoteInput] = useState('');
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingText, setEditingText] = useState('');

 const updateBook = useBookStore((s) => s.updateBook);
 const updateOutlineVision = useBookStore((s) => s.updateOutlineVision);

 // 档案读权威 memory.json，避免用 book.json 旧快照判断「已整理」章
 useEffect(() => {
  if (!bookId) return;
  void useBookStore.getState().loadMemoryBank(bookId);
 }, [bookId]);

	const activeSession = book.outlineVision?.activeDeductionSession;

	const [stage, setStage] = useState<'idle' | 'deducing' | 'error'>(activeSession?.stage || 'idle');
	const [messages, setMessages] = useState<(ChatMessage & { id: string })[]>(activeSession?.messages || []);
	const [chatInput, setChatInput] = useState('');
	const [bgCollapsed, setBgCollapsed] = useState(true);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [outlineCards, setOutlineCards] = useState<OutlineCard[]>([]);
	const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set(activeSession?.selectedChapterIds || []));
	const [showHistory, setShowHistory] = useState(false);
	const [showContextModal, setShowContextModal] = useState(false);
	const [contextSortDesc, setContextSortDesc] = useState(false);
	const [showDistributeModal, setShowDistributeModal] = useState(false);
	const [showOptimizeModal, setShowOptimizeModal] = useState(false);
	const [optimizeChapterIds, setOptimizeChapterIds] = useState<Set<string>>(new Set());
	const [optimizeSortDesc, setOptimizeSortDesc] = useState(false);
	const [toast, setToast] = useState<string | null>(null);

	const archives = useMemo(() => book.outlineVision?.deductionArchives || [], [book.outlineVision]);
	const ctxRef = useRef<DeductionContext | null>(activeSession?.ctx || null);
	const convoRef = useRef<ChatMessage[]>(activeSession?.messages || []);
	const scrollRef = useRef<HTMLDivElement>(null);
	const reqIdRef = useRef<number>(0); // 防止飞行中的请求插入到已重置/读档的会话
	const isAskingRef = useRef<boolean>(false); // 防止输入法回车或双击导致重复提交流程

	const notes = useMemo(() => book.inspirationNotes ?? [], [book.inspirationNotes]);

	// 自动持久化未保存的推演会话
	useEffect(() => {
		if (!updateOutlineVision || !book.id) return;
		const ov = book.outlineVision || { nodes: [], version: 1 };
		
		// 如果在推演流式输出中，仅在内存中更新，避免高频磁盘 I/O
		const shouldPersist = !loading;
		
		updateOutlineVision(book.id, {
			...ov,
			activeDeductionSession: {
				stage,
				messages,
				ctx: ctxRef.current || undefined,
				selectedChapterIds: Array.from(selectedChapterIds)
			}
		}, { persist: shouldPersist });
	}, [stage, messages, selectedChapterIds, loading, book.id, updateOutlineVision]);

	const showToast = (msg: string) => {
		setToast(msg);
		setTimeout(() => setToast(null), 2500);
	};

	// 让所有飞行中的请求作废
	const invalidateInflight = () => {
		reqIdRef.current++;
	};

	const handleAddNote = async () => {
		const text = noteInput.trim();
		if (!text) return;
		const newNote = {
			id: crypto.randomUUID(),
			content: text,
			type: '未定' as any,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		await updateBook(bookId, { inspirationNotes: [...(book.inspirationNotes || []), newNote] });
		setNoteInput('');
	};

	const toggleSelect = (id: string) => {
		const s = new Set(selectedIds);
		if (s.has(id)) s.delete(id);
		else s.add(id);
		setSelectedIds(s);
	};

	const startEditing = (note: any) => {
		setEditingId(note.id);
		setEditingText(note.content);
	};

	const commitEditing = async (id: string) => {
		if (editingId !== id) return; // 防 Enter+blur 双重提交
		setEditingId(null);
		if (!editingText.trim()) return;
		const newNotes = notes.map((n) =>
			n.id === id ? { ...n, content: editingText, updatedAt: new Date().toISOString() } : n,
		);
		await updateBook(bookId, (b) => ({ ...b, inspirationNotes: newNotes }));
		setEditingText('');
	};

	const pushMessage = (role: 'system' | 'user' | 'assistant', content: string, aiContent?: string) => {
		setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, content, aiContent }]);
		if (role !== 'system') {
			convoRef.current.push({ role, content, aiContent });
		}
	};

	const ask = async (prompt: string, aiPrompt?: string) => {
		if (isAskingRef.current || loading) return;
		isAskingRef.current = true;

		if (ctxRef.current && convoRef.current.length === 0) {
			convoRef.current.push({ role: 'system', content: ctxRef.current.systemPrompt });
		}
		const myId = ++reqIdRef.current;
		pushMessage('user', prompt, aiPrompt);
		setLoading(true);
		setError(null);
		
		const payload = convoRef.current.map(m => ({
			role: m.role,
			content: m.aiContent || m.content
		}));

		try {
			const reply = await callAI(bookId, payload);
			if (myId !== reqIdRef.current) return; // 已被重置/读档，丢弃
			const cards = parseOutlineCards(reply);
			if (cards && cards.length > 0) {
				setOutlineCards(cards);
				pushMessage(
					'assistant',
					'已生成细纲卡片，确认无误后可应用到大纲看板。\n\n' +
						reply.replace(/```json[\s\S]*?```/g, '').trim(),
				);
			} else {
				pushMessage('assistant', reply);
			}
		} catch (e: any) {
			if (myId !== reqIdRef.current) return;
			const rawErr = e?.message || (typeof e === 'string' ? e : '推演失败');
			setError(rawErr);
			const friendlyErr = getFriendlyError(rawErr);
			setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${friendlyErr}` }]);
		} finally {
			isAskingRef.current = false;
			if (myId === reqIdRef.current) setLoading(false);
		}
	};

	const handleRetry = async () => {
		if (isAskingRef.current || loading) return;
		isAskingRef.current = true;
		
		// 从 UI 中移除错误消息
		setMessages(prev => {
			const newMsg = [...prev];
			if (newMsg.length > 0 && newMsg[newMsg.length - 1].content.startsWith('⚠️')) {
				newMsg.pop();
			}
			return newMsg;
		});
		
		const myId = ++reqIdRef.current;
		setLoading(true);
		setError(null);
		
		const payload = convoRef.current.map(m => ({
			role: m.role,
			content: m.aiContent || m.content
		}));
		
		try {
			const reply = await callAI(bookId, payload);
			if (myId !== reqIdRef.current) return; 
			
			const cards = parseOutlineCards(reply);
			if (cards && cards.length > 0) {
				setOutlineCards(cards);
				pushMessage(
					'assistant',
					'已生成细纲卡片，确认无误后可应用到大纲看板。\n\n' +
						reply.replace(/```json[\s\S]*?```/g, '').trim(),
				);
			} else {
				pushMessage('assistant', reply);
			}
		} catch (e: any) {
			if (myId !== reqIdRef.current) return;
			const rawErr = e?.message || (typeof e === 'string' ? e : '推演失败');
			setError(rawErr);
			const friendlyErr = getFriendlyError(rawErr);
			setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${friendlyErr}` }]);
		} finally {
			isAskingRef.current = false;
			if (myId === reqIdRef.current) setLoading(false);
		}
	};

	const handleStartDeduction = async () => {
		const { requireLogin } = await import('../../utils/featureCheck');
		if (!requireLogin('使用剧情推演')) return;
		if (selectedIds.size === 0) return;
		setShowContextModal(true);
	};

	const executeStartDeduction = async () => {
		setShowContextModal(false);
		const selectedNotes = notes.filter((n) => selectedIds.has(n.id));
		const ctx = await buildDeductionContext(book, selectedNotes, Array.from(selectedChapterIds));
		ctxRef.current = ctx;
		convoRef.current = [{ role: 'system', content: ctx.systemPrompt }];
		setMessages([]);
		setError(null);
		setOutlineCards([]);
		setStage('deducing');

		pushMessage(
			'assistant',
			`正在读取作品《${book.title || '未命名'}》的前文概要与角色档案，并消化你选中的 ${selectedIds.size} 条灵感碎片…`,
		);

		const myId = ++reqIdRef.current;
		setLoading(true);
		try {
			const prompt = `我已经提供了前文设定和灵感碎片。请根据系统提示词，开始【阶段 0：理解灵感】。`;
			convoRef.current.push({ role: 'user', content: prompt });
			const reply = await callAI(bookId, convoRef.current);
			if (myId !== reqIdRef.current) return;
			pushMessage('assistant', reply);
		} catch (e: any) {
			if (myId !== reqIdRef.current) return;
			const rawErr = e?.message || (typeof e === 'string' ? e : '推演失败');
			setError(rawErr);
			const friendlyErr = getFriendlyError(rawErr);
			pushMessage('assistant', `⚠️ 初始化分析出错，请点击重置后重试。(${friendlyErr})`);
		} finally {
			if (myId === reqIdRef.current) setLoading(false);
		}
	};

	const handleSubmitInput = async (overrideText?: string) => {
		const text = (overrideText || chatInput).trim();
		if (!text) return;
		setChatInput('');
		await ask(text);
	};

	const handleApply = async () => {
		if (!outlineCards.length) return;
		const prevNodes = book.outlineVision?.nodes ?? [];
		const baseY = prevNodes.length
			? Math.max(...prevNodes.map((n: any) => n.position?.y ?? 0)) + 240
			: 0;
		const newNodes = outlineCards.map((c, i) => ({
			id: crypto.randomUUID(),
			title: c.title,
			type: 'event' as const,
			conflict: [c.summary, ...c.beats.map((b) => `• ${b}`)].filter(Boolean).join('\n'),
			notes: '',
			targetWordCount: 1500,
			actualWordCount: 0,
			isAiGenerated: true,
			position: { x: (i % 4) * 360, y: baseY + Math.floor(i / 4) * 240 },
			width: 320,
			height: 200,
		}));
		await updateOutlineVision(bookId, {
			...(book.outlineVision ?? { version: 1, nodes: [], edges: [] }),
			nodes: [...prevNodes, ...newNodes],
		});
		invalidateInflight();
		setStage('idle');
		setMessages([]);
		setSelectedIds(new Set());
		setOutlineCards([]);
		showToast(`🚀 已应用 ${newNodes.length} 个节点到大纲看板`);
	};

	const handleOptimizeWithChapters = async () => {
		if (optimizeChapterIds.size === 0) return;
		setShowOptimizeModal(false);
		
		let contextText = '';
		for (const id of optimizeChapterIds) {
			const ch = book.chapters?.find((c) => c.id === id);
			if (!ch) continue;
			const __plotHtml = await useBookStore.getState().ensureChapterContent(book.id, id);
			if (!__plotHtml) continue;
			
			// Strip HTML tags to get plain text
			const div = new DOMParser().parseFromString(__plotHtml, 'text/html').body;
			const plainText = Array.from(div.childNodes)
				.map(node => node.textContent?.trim())
				.filter(Boolean)
				.join('\n');
				
			if (plainText) {
				contextText += `\n\n【${ch.title}】\n${plainText}\n`;
			}
		}

		if (!contextText.trim()) {
			showToast('选中的章节没有正文内容');
			return;
		}

		const aiPrompt = `请参考以下几章前文的写作风格、故事节奏：\n${contextText}\n\n当前我们已经推演出的细纲如下：\n\`\`\`json\n${JSON.stringify(outlineCards, null, 2)}\n\`\`\`\n\n请你学习前文的风格和节奏，对当前的细纲进行再一次的优化调整。输出优化后的细纲，请继续保持九宫格卡片的结构（每个节点包含标题、要点），使用严格的 Markdown 列表或 JSON 数组输出。`;
		const uiPrompt = `[参考了所选的 ${optimizeChapterIds.size} 章正文进行风格优化] 请对当前的细纲进行再一次的优化调整。`;

		setOutlineCards([]);
		// 必须等 state 更新后触发
		setTimeout(() => {
			ask(uiPrompt, aiPrompt);
		}, 100);
	};

	// ── 把推演节点的概要拼成章节提纲文本 ──
	const buildOutlineText = (card: OutlineCard): string => {
		const lines: string[] = [];
		lines.push(`【推演节点】: ${card.title}`);
		if (card.summary) lines.push(`\n【节点概要】: ${card.summary}`);
		if (card.beats?.length) {
			lines.push(`\n【关键事件】:`);
			card.beats.forEach((b) => lines.push(`- ${b}`));
		}
		return lines.join('\n');
	};

	// ── 从章节标题里稳健提取序号（支持中文数字） ──
	const parseChineseNumber = (str: string): number => {
		const map: Record<string, number> = {
			'零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
			'六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000
		};
		let total = 0;
		let temp = 0;
		for (let i = 0; i < str.length; i++) {
			const val = map[str[i]];
			if (val === undefined) continue;
			if (val >= 10) {
				if (temp === 0 && val === 10) temp = 1;
				total += temp * val;
				temp = 0;
			} else {
				temp = val;
			}
		}
		total += temp;
		return total;
	};

	const extractChapterNumber = (title?: string): number | null => {
		if (!title) return null;
		let m = title.match(/第\s*(\d+)\s*[章节回]/) || title.match(/^(\d+)[\s、，。:：-]/);
		if (m) return parseInt(m[1], 10);
		if (/^\d+$/.test(title.trim())) return parseInt(title.trim(), 10);
		
		m = title.match(/第\s*([零一二三四五六七八九十百千万]+)\s*[章节回]/);
		if (m) return parseChineseNumber(m[1]);

		return null;
	};

	// ── 工具：用 DOM 解码 HTML 实体，拿到真正的纯文本 ──
	const stripHtmlToText = (html: string): string => {
		if (!html) return '';
		return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
	};

	// ── 工具：干掉所有空白 + 零宽字符（&nbsp;、\u200b 等正则 \s 漏掉的字符） ──
	const normalizeText = (s: string): string =>
		(s || '').replace(/[\s\u00a0\u200b-\u200d\u2060\u2028\u2029\ufeff]/g, '');

	// ── 判断一个章节是否为空章 ──
	const isChapterEmpty = (ch: any): boolean => {
		// 1. 已经有提纲 = 已分配过，不算空
		if (ch.outline?.trim()) return false;

		// 2. 字数为 0 是最可靠的信号：没正文且没提纲 → 空章
		if ((ch.wordCount ?? 0) === 0) return true;

		// 3. 没有 content 直接算空
		if (!ch.content) return (ch.wordCount ?? 0) === 0;

		// 4. 用 DOM 解码实体后再规范化（修复 &nbsp;/零宽字符 残留的盲区）
		const plain = normalizeText(stripHtmlToText(ch.content));
		if (plain.length === 0) return true;

		// 5. 纯文本 == 标题（去空白后），只有自动插入的标题，算空
		const titlePlain = normalizeText(ch.title || '');
		if (titlePlain && plain === titlePlain) return true;

		// 6. 容错：正文 == "第N章" 骨架，或去掉标题后无剩余 → 空
		const num = extractChapterNumber(ch.title);
		if (num !== null) {
			const skeleton = normalizeText(`第${num}章`);
			if (plain === skeleton) return true;
			const rest = plain.replace(titlePlain, '').replace(skeleton, '');
			if (rest.length === 0) return true;
		}

		return false;
	};

	// ── 辅助：格式化章节标题 ──
	const formatChapterTitle = (aiTitle: string, num: number) => {
		let cleanTitle = aiTitle.replace(/^第\s*\d+\s*[章节回]\s*/, '').trim();
		cleanTitle = cleanTitle.replace(/^[:：-]\s*/, '').trim();
		if (!cleanTitle) return `第${num}章`;
		return `第${num}章 ${cleanTitle}`;
	};

	// ── 预演：算出本次会填充几章、新建几章（供 Modal 展示，不写库） ──
	const distributePreview = useMemo(() => {
		const chapters = [...(book.chapters ?? [])].sort((a, b) => (extractChapterNumber(a.title) || 0) - (extractChapterNumber(b.title) || 0));
		let lastFilled = -1;
		chapters.forEach((ch, i) => {
			if (!isChapterEmpty(ch)) lastFilled = i;
		});
		let emptyCount = chapters.length - 1 - lastFilled;
		if (emptyCount < 0) emptyCount = 0;

		const total = outlineCards.length;
		const filled = Math.min(emptyCount, total);
		const created = Math.max(0, total - emptyCount);
		return { total, filled, created };
	}, [book.chapters, outlineCards]);

	// ── 执行分章入库：优先填空章坑位，不够则按序号新建章节 ──
	const executeDistribute = async () => {
		if (!outlineCards.length) return;

		const chapters = [...(book.chapters ?? [])].sort((a, b) => (extractChapterNumber(a.title) || 0) - (extractChapterNumber(b.title) || 0));

		// 1. 只取“最后一个有内容章节之后”的连续空章作为坑位
		let lastFilled = -1;
		chapters.forEach((ch, i) => {
			if (!isChapterEmpty(ch)) lastFilled = i;
		});
		const emptySlotIdx: number[] = [];
		for (let i = lastFilled + 1; i < chapters.length; i++) emptySlotIdx.push(i);

		// 2. 推算新章节起始序号：取所有标题中的最大序号，识别不到则用章节总数兜底
		let maxNum = 0;
		chapters.forEach((ch) => {
			const n = extractChapterNumber(ch.title);
			if (n !== null && n > maxNum) maxNum = n;
		});
		let nextNum = maxNum > 0 ? maxNum : chapters.length;

		const now = new Date().toISOString();
		const nextChapters = chapters.map((ch) => ({ ...ch })); // 浅拷贝，勿直接改 store 引用
		let filledCount = 0;
		let createdCount = 0;

		// 3. 依次分配：先填空坑位，坑位用尽后新建
		outlineCards.forEach((card, i) => {
			const outlineText = buildOutlineText(card);
			if (i < emptySlotIdx.length) {
				const idx = emptySlotIdx[i];
				nextChapters[idx] = { ...nextChapters[idx], outline: outlineText, updatedAt: now };
				filledCount++;
			} else {
				nextNum++;
				nextChapters.push({
					id: crypto.randomUUID(),
					title: `第${nextNum}章`,
					content: '',
					wordCount: 0,
					outline: outlineText,
					createdAt: now,
					updatedAt: now,
				});
				createdCount++;
			}
		});

		// 4. 持久化
		await updateBook(bookId, { chapters: nextChapters });

		// 6. 关闭弹窗 + 清状态 + 提示
		setShowDistributeModal(false);
		invalidateInflight();
		setStage('idle');
		setMessages([]);
		setSelectedIds(new Set());
		setOutlineCards([]);
		showToast(
			`✅ 已分配 ${outlineCards.length} 个节点` +
				(filledCount ? `｜填充空章 ${filledCount}` : '') +
				(createdCount ? `｜新建 ${createdCount}` : ''),
		);
	};

	const handleArchive = async () => {
		if (convoRef.current.length === 0) return;
		// 过滤掉第一条系统自动发的“正在读取...”提示信息，避免弄脏存档
		const convoToSave = convoRef.current.filter(m => !m.content.startsWith('正在读取'));
		if (convoToSave.length === 0) return;

		const firstUserContent = convoToSave.find((m) => m.role === 'user')?.content;
		const title = firstUserContent ? firstUserContent.substring(0, 20) + '...' : '未命名推演';
		const newArchive = {
			id: crypto.randomUUID(),
			title,
			messages: convoToSave,
			ctx: ctxRef.current ?? undefined,
			createdAt: new Date().toISOString(),
		};
		const prevArchives = book.outlineVision?.deductionArchives || [];
		await updateOutlineVision(bookId, {
			...(book.outlineVision ?? { version: 1, nodes: [], edges: [] }),
			deductionArchives: [newArchive, ...prevArchives],
		});
		showToast('已存为新档');
	};

	const handleLoadArchive = (arc: any) => {
		try {
			invalidateInflight();
			ctxRef.current = arc.ctx ?? null;
			const sys = arc.ctx?.systemPrompt;

			let parsedMessages = arc.messages;
			if (typeof parsedMessages === 'string') {
				try { parsedMessages = JSON.parse(parsedMessages); } catch { parsedMessages = []; }
			}
			if (!Array.isArray(parsedMessages)) parsedMessages = [];

			convoRef.current = [
				...(sys ? [{ role: 'system' as const, content: sys }] : []),
				...parsedMessages.map((m: any) => ({ role: m.role, content: m.content, aiContent: m.aiContent })),
			];
			const restoredMessages = parsedMessages.map((m: any) => ({
				id: m.id || crypto.randomUUID(),
				role: m.role,
				content: m.content,
				aiContent: m.aiContent
			}));
			setMessages(restoredMessages);
			setStage('deducing');
			setShowHistory(false);
			setError(null);

			// 尝试从最后一条 AI 回复中恢复卡片数据
			const lastAssistant = restoredMessages.filter((m: any) => m.role === 'assistant').pop();
			if (lastAssistant && lastAssistant.content) {
				const cards = parseOutlineCards(lastAssistant.content);
				if (cards && cards.length > 0) {
					setOutlineCards(cards);
				} else {
					setOutlineCards([]);
				}
			} else {
				setOutlineCards([]);
			}
		} catch (err: any) {
			console.error('加载存档失败', err);
			showToast('加载存档失败: ' + err.message);
		}
	};

	const handleDeleteArchive = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		try {
			const prevArchives = book.outlineVision?.deductionArchives || [];
			const nextArchives = prevArchives.filter((a) => a.id !== id);
			await updateOutlineVision(bookId, {
				...(book.outlineVision ?? { version: 1, nodes: [], edges: [] }),
				deductionArchives: nextArchives,
			});
			showToast('已删除历史记录');
		} catch (err: any) {
			console.error('删除失败', err);
			showToast('删除失败: ' + err.message);
		}
	};

	const handleReset = () => {
		invalidateInflight();
		setMessages([]);
		setOutlineCards([]);
		setError(null);
		setStage('idle');
		ctxRef.current = null;
		convoRef.current = [];
		setSelectedChapterIds(new Set());
		setChatInput('');
		
		// 清除已保存的会话
		if (book.outlineVision && updateOutlineVision) {
			const { activeDeductionSession, ...restOv } = book.outlineVision;
			updateOutlineVision(bookId, restOv as any);
		}
		setSelectedIds(new Set());
		setShowHistory(false);
		setLoading(false);
	};

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	// 只认字母选项 A–F，避免把骨架的数字行误当选项
	const dynamicOptions = useMemo(() => {
		if (messages.length === 0) return [];
		const lastMsg = messages[messages.length - 1];
		if (lastMsg.role !== 'assistant') return [];
		const opts: string[] = [];
		for (const line of lastMsg.content.split('\n')) {
			const trimmed = line.trim();
			// 仅匹配严格的字母选项，避免从正文中提取出误报选项
			const match = trimmed.match(/^(?:[\-\*]\s*)?\*{0,2}([A-F][\.\、\：\:]\s*.+?)\*{0,2}$/i);
			if (match) {
				let optText = match[1].replace(/\*\*/g, '').trim(); // 去除加粗星号
				if (!optText.includes('由我自己写') && !optText.includes('自定义')) {
					// 核心防复读逻辑：只要遇到以 A 开头的选项，就代表 AI 开始了一轮全新的选项陈列
					// 我们直接清空之前的积攒，只保留最后这一组，避免两份 A/B/C 变成 6 个按钮
					if (/^A[\.\、\：\:]/i.test(optText)) {
						opts.length = 0;
					}
					opts.push(optText);
				}
			}
		}
		return opts;
	}, [messages]);

	return (
		<div className="flex flex-1 w-full h-full overflow-hidden p-4 lg:p-5 gap-5 relative z-10">
			{/* Toast */}
			{toast && (
				<div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#202024] border border-white/10 text-sm text-gray-100 px-4 py-2 rounded-lg shadow-xl">
					{toast}
				</div>
			)}

			{/* ── 左侧：灵感池 (35%) ── */}
			<div className="flex w-[35%] flex-col overflow-hidden bg-[#121214] rounded-2xl border border-white/5 shadow-xl shadow-black/40">
				<div className="flex items-center justify-between border-b border-white/5 px-5 py-4 bg-[#18181b]/50 ">
					<span className="text-sm font-bold text-gray-200 flex items-center gap-2">
						<Lightbulb className="w-4 h-4 text-[var(--accent)]" /> 灵感碎片池
					</span>
				</div>
				<div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 premium-scroll">
					{notes.length === 0 ? (
						<div className="flex h-full items-center justify-center text-center text-sm text-gray-500 leading-relaxed">
							随时记下脑海中的剧情碎片<br />
							选中它们，即可在右侧开始推演。
						</div>
					) : (
						notes.map((note) => {
							const selected = selectedIds.has(note.id);
							return (
								<div
									key={note.id}
									className={`group relative rounded-xl p-3.5 transition-all duration-200 cursor-default ${
										selected
											? 'bg-[var(--accent)]/10 border border-[var(--accent)]/50 shadow-md shadow-[var(--accent)]/10'
											: 'bg-[#18181b] border border-white/5 hover:border-white/20 hover:shadow-sm'
									}`}
								>
									<div className="flex items-start gap-2">
										<input
											type="checkbox"
											checked={selected}
											onChange={() => toggleSelect(note.id)}
											className="mt-1 shrink-0 cursor-pointer accent-[var(--accent)]"
										/>
										<div className="min-w-0 flex-1">
											<span className="inline-block mb-1.5 rounded px-1.5 py-0.5 text-[10px] bg-gray-500/20 text-gray-400">
												{note.type}
											</span>
											{editingId === note.id ? (
												<textarea
													autoFocus
													value={editingText}
													onChange={(e) => setEditingText(e.target.value)}
													onBlur={() => commitEditing(note.id)}
													onKeyDown={(e) => {
														if (e.nativeEvent.isComposing) return;
														if (e.key === 'Enter' && !e.shiftKey) {
															e.preventDefault();
															commitEditing(note.id);
														}
														if (e.key === 'Escape') {
															e.stopPropagation();
															setEditingId(null);
														}
													}}
													className="w-full resize-none rounded bg-[var(--bg-primary)] border border-[var(--border-color)] p-2 text-sm text-[var(--text-primary)] outline-none"
													rows={2}
												/>
											) : (
												<p
													onClick={() => startEditing(note)}
													className="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)] cursor-text"
												>
													{note.content}
												</p>
											)}
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
				<div className="border-t border-white/5 p-5 bg-[#18181b]/80 ">
					<div className="relative group">
						<textarea
							value={noteInput}
							onChange={(e) => setNoteInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.nativeEvent.isComposing) return;
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									handleAddNote();
								}
							}}
							className="w-full resize-none rounded-xl bg-[#202024] border border-white/10 px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:bg-[#202024] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 outline-none transition-all"
							rows={2}
							placeholder="记下一个灵感碎片... (Enter 保存)"
						/>
						<div className="absolute right-3 bottom-3 flex gap-1.5 opacity-60">
							<span className="text-[10px] font-mono border border-white/20 rounded px-1.5 py-0.5 text-gray-400">Enter</span>
						</div>
					</div>
					<button
						type="button"
						onClick={handleStartDeduction}
						disabled={selectedIds.size === 0 || stage !== 'idle'}
						className={`w-full mt-3 rounded-lg py-3 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
							selectedIds.size > 0 && stage === 'idle'
								? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 hover:bg-[var(--accent-hover)]'
								: 'bg-white/5 text-gray-500 cursor-not-allowed'
						}`}
					>
						{stage === 'idle' ? '开始推演' : '推演进行中...'}
					</button>
				</div>
			</div>

			{/* ── 右侧：多轮向导推演台 (65%) ── */}
			<div className="flex w-[65%] flex-col overflow-hidden bg-[#121214] rounded-2xl border border-white/5 shadow-xl shadow-black/40">
				{/* 头部加 relative z-30 兜底，避免下方聊天区盖住头部内的浮层 */}
				<div className="relative z-30 flex items-center justify-between border-b border-white/5 px-6 py-4 bg-[#18181b]/50 ">
					<div className="flex items-center gap-3">
						<span className="text-sm font-bold text-gray-200">剧情推演引擎</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setBgCollapsed((v) => !v)}
							className="text-xs font-medium text-gray-400 hover:text-gray-100 flex items-center gap-1.5 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
						>
							<span>本书背景摘要</span>
							<span>{bgCollapsed ? '▼' : '▲'}</span>
						</button>
						<div className="relative">
							<button
								onClick={() => setShowHistory(!showHistory)}
								className={`text-xs px-3 py-1.5 rounded-md transition-colors border flex items-center gap-1.5 ${
									showHistory
										? 'bg-[var(--accent)]/20 text-[var(--accent-light)] border-[var(--accent)]/30'
										: 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
								}`}
							>
								<History className="w-3.5 h-3.5" />
								<span>推演记录 {archives.length > 0 && `(${archives.length})`}</span>
							</button>
						</div>
						{messages.length > 0 && (
							<button
								onClick={handleArchive}
								className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent-light)] hover:bg-[var(--accent)]/20 transition-colors border border-[var(--accent)]/20"
							>
								存为新档
							</button>
						)}
						<button
							onClick={handleReset}
							className="text-xs px-3 py-1.5 rounded-md bg-white/5 text-gray-300 hover:bg-white/10 transition-colors border border-white/10"
						>
							重置
						</button>
					</div>
				</div>

				{!bgCollapsed && ctxRef.current && (
					<div className="bg-[#18181b] border-b border-white/5 px-6 py-4 max-h-[30vh] overflow-y-auto text-xs text-gray-400 font-mono whitespace-pre-wrap premium-scroll">
						{ctxRef.current.backgroundSummary}
					</div>
				)}

					<div ref={scrollRef} className="flex-1 overflow-y-auto premium-scroll p-6 pb-40 space-y-6">
						{stage === 'idle' && messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
								<div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
									<Sparkles className="w-8 h-8 text-[var(--accent)]/50" />
								</div>
								<p className="text-sm text-gray-300">
									左侧勾选灵感碎片<br />
									然后点击“开始推演”
								</p>
							</div>
						) : (
							messages
								.filter((msg) => msg.role !== 'system')
								.map((msg, i, arr) => {
									// Hide the raw markdown of the last assistant message if outlineCards exist
									if (outlineCards.length > 0 && i === arr.length - 1 && msg.role === 'assistant') {
										return null;
									}
									return (
										<div key={msg.id || i} className="flex flex-col">
											<MessageBubble role={msg.role as any} content={msg.content} />
											{msg.role === 'assistant' && msg.content.startsWith('⚠️') && i === arr.length - 1 && (
												<div className="flex justify-start ml-12 -mt-2 mb-4">
													<button 
														onClick={handleRetry} 
														className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors border border-red-500/20 flex items-center gap-1.5"
													>
														<RotateCcw className="w-3.5 h-3.5" />
														重新生成
													</button>
												</div>
											)}
										</div>
									);
								})
						)}
						{outlineCards.length > 0 && (
							<EditableOutlineGrid cards={outlineCards} onChange={setOutlineCards} />
						)}
						{loading && (
							<div className="flex justify-start">
								<div className="bg-[#1e1e22] rounded-2xl rounded-bl-none px-5 py-3 border border-white/5 flex items-center gap-2">
									<span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
									<span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
									<span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
								</div>
							</div>
						)}
					</div>

				{/* 底部操作区 */}
				{stage !== 'idle' && (
					<div className="border-t border-white/5 bg-[#18181b]/80 px-6 py-5 shrink-0 flex flex-col gap-3">
						{/* 选项按钮：仅在未生成卡片且非 loading 时显示 */}
						{dynamicOptions.length > 0 && !loading && outlineCards.length === 0 && (
							<div className="flex flex-col gap-2 mb-1">
								{dynamicOptions.map((opt, i) => (
									<button
										key={i}
										onClick={() => handleSubmitInput(opt)}
										className="w-full text-left px-4 py-3 text-sm text-gray-200 bg-[#202024] hover:bg-[var(--accent)]/10 hover:text-[var(--accent-light)] border border-white/10 hover:border-[var(--accent)]/30 rounded-xl transition-all"
									>
										{opt}
									</button>
								))}
							</div>
						)}

						{!loading && (
							<>
								{/* 卡片就绪：应用 + 继续调整 */}
								{outlineCards.length > 0 && (
									<div className="flex flex-col gap-2 mb-1">
										<div className="flex gap-3">
											<button
												onClick={handleApply}
												className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 font-semibold text-sm rounded-xl py-3 transition-colors"
											>
												应用到大纲看板（{outlineCards.length}）
											</button>
											<button
												onClick={() => setShowDistributeModal(true)}
												className="flex-1 bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 text-[var(--accent-light)] border border-[var(--accent)]/30 font-semibold text-sm rounded-xl py-3 transition-colors"
											>
												一键分章入库（{outlineCards.length}）
											</button>
										</div>
										<button
											onClick={() => setShowOptimizeModal(true)}
											className="px-4 py-2.5 rounded-xl bg-[var(--accent)]/10 text-[var(--accent-light)] hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 text-sm transition-colors font-semibold"
										>
											参考前文正文优化细纲
										</button>
										<button
											onClick={() => setOutlineCards([])}
											className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 text-sm transition-colors"
										>
											继续调整
										</button>
									</div>
								)}

								{/* 输入框始终保留，作者随时可继续推演 */}
								<div className="flex gap-3 items-end">
									<textarea
										value={chatInput}
										onChange={(e) => setChatInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.nativeEvent.isComposing) return;
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault();
												handleSubmitInput();
											}
										}}
										className="flex-1 resize-none bg-[#202024] border border-white/10 text-gray-200 text-sm rounded-xl px-4 py-3 focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-colors premium-scroll"
										rows={2}
										placeholder={
											outlineCards.length > 0
												? '想再调整细纲？直接说…'
												: dynamicOptions.length > 0
												? '不满意？自定义回复...'
												: '输入你的想法...'
										}
									/>
									<button
										onClick={() => handleSubmitInput()}
										disabled={!chatInput.trim()}
										className="h-[46px] px-6 shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-white/5 disabled:text-gray-500 text-white text-sm font-semibold rounded-xl transition-colors"
									>
										发送
									</button>
								</div>
							</>
						)}
					</div>
				)}
			</div>

			{/* ── 历史推演记录：根级浮层（脱离 backdrop-blur / overflow-hidden 陷阱） ── */}
			{showHistory && (
				<>
					<div className="absolute inset-0 z-[60]" onClick={() => setShowHistory(false)} />
					<div className="absolute top-16 right-6 w-80 max-h-[70vh] bg-[#1e1e22] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[61] flex flex-col">
						<div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#18181b]">
							<span className="text-sm font-bold text-gray-200 flex items-center gap-2">
								<Archive className="w-4 h-4 text-[var(--accent)]" /> 历史推演记录
							</span>
							<button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-300">
								<X className="w-4 h-4" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto premium-scroll p-2">
							{archives.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-10 opacity-50 text-center">
									<Inbox className="w-10 h-10 mb-3 text-gray-500" />
									<p className="text-xs text-gray-400 mt-2">
										暂无存档记录
										<br />
										点击右上角“存为新档”即可保存
									</p>
								</div>
							) : (
								<div className="flex flex-col gap-1.5">
									{archives.map((arc) => (
										<div
											key={arc.id}
											className="relative group p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-white/5"
											onClick={() => handleLoadArchive(arc)}
										>
											<div className="text-sm font-medium text-gray-200 mb-1 truncate pr-8">{arc.title}</div>
											<div className="text-[11px] text-gray-500">
												{new Date(arc.createdAt).toLocaleString()} · {arc.messages?.length ?? 0} 条对话
											</div>
											<button
												onClick={(e) => handleDeleteArchive(e, arc.id)}
												className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-red-400 hover:bg-red-500/20 transition-all"
												title="删除存档"
											>
												<Trash2 className="w-4 h-4" />
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</>
			)}

			{/* 剧情档案库章节选择弹窗 */}
			{showContextModal && (
				<div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
					<div className="w-[500px] max-h-[80vh] flex flex-col bg-[#1e1e22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#18181b]">
							<span className="text-sm font-bold text-gray-200">选择剧情档案库前文</span>
							<button onClick={() => setShowContextModal(false)} className="text-gray-500 hover:text-gray-300">
								<X className="w-4 h-4" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto premium-scroll p-6 space-y-4">
							<div className="flex items-center justify-between gap-4">
								<p className="text-xs text-gray-400">选择需要带入本次推演的前文章节上下文（如果只需要基于核心大纲，可直接跳过）。</p>
								{(book.memoryBank?.filter(m => m.isAnalyzed).length ?? 0) > 0 && (
									<button
										onClick={() => setContextSortDesc(!contextSortDesc)}
										className="flex items-center shrink-0 gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/5"
									>
										{contextSortDesc ? (
											<><ArrowDown className="w-3.5 h-3.5" /> 倒序排列</>
										) : (
											<><ArrowUp className="w-3.5 h-3.5" /> 正序排列</>
										)}
									</button>
								)}
							</div>
							{book.memoryBank?.filter(m => m.isAnalyzed).length ? (
								<div className="space-y-2">
									{(() => {
										const sortedChapters = [...(book.chapters ?? [])].sort((a, b) => {
											const diff = (extractChapterNumber(a.title) || 0) - (extractChapterNumber(b.title) || 0);
											return contextSortDesc ? -diff : diff;
										});
										return sortedChapters.map((ch) => {
											const m = book.memoryBank?.find((mb) => mb.chapterId === ch.id);
											if (!m || !m.isAnalyzed) return null;
											const selected = selectedChapterIds.has(m.chapterId);
											return (
											<div
												key={m.chapterId}
												onClick={() => {
													const s = new Set(selectedChapterIds);
													if (s.has(m.chapterId)) s.delete(m.chapterId);
													else s.add(m.chapterId);
													setSelectedChapterIds(s);
												}}
												className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
													selected
														? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-md shadow-[var(--accent)]/5'
														: 'bg-[#18181b] border-white/5 hover:border-white/20'
												}`}
											>
												<input
													type="checkbox"
													checked={selected}
													readOnly
													className="accent-[var(--accent)] cursor-pointer"
												/>
												<div className="min-w-0 flex-1">
													<div className="text-sm text-gray-200 truncate">{ch?.title || '未知章节'}</div>
													<div className="text-xs text-gray-500 truncate">{m.plotAnalysis?.functionSummary || '暂无总结'}</div>
												</div>
											</div>
										);
									});
								})()}
								</div>
							) : (
								<div className="text-center py-8 text-xs text-gray-500">
									剧情档案库中暂无已分析的章节。
								</div>
							)}
						</div>
						<div className="p-5 border-t border-white/5 bg-[#18181b] flex justify-end gap-3">
							<button onClick={() => setShowContextModal(false)} className="px-5 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
								取消
							</button>
							<button onClick={executeStartDeduction} className="px-5 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20 hover:bg-[var(--accent-hover)] transition-colors">
								确认带入并开始
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 一键分章入库确认弹窗 */}
			{showDistributeModal && (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
					<div className="w-[440px] max-h-[80vh] flex flex-col bg-[#1e1e22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#18181b]">
							<span className="text-sm font-bold text-gray-200">确认分章入库</span>
							<button onClick={() => setShowDistributeModal(false)} className="text-gray-500 hover:text-gray-300">
								<X className="w-4 h-4" />
							</button>
						</div>

						<div className="flex-1 overflow-y-auto premium-scroll px-6 py-5 space-y-4">
							<p className="text-xs text-gray-400 leading-relaxed">
								将把本次推演的 <span className="text-[var(--accent-light)] font-semibold">{distributePreview.total}</span> 个细纲节点写入物理章节的「本章提纲」字段。
							</p>

							{/* 分配明细 */}
							<div className="space-y-2">
								<div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#18181b] border border-white/5">
									<span className="text-sm text-gray-300">填充已有空白章节</span>
									<span className="text-sm font-bold text-green-400">{distributePreview.filled} 章</span>
								</div>
								<div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#18181b] border border-white/5">
									<span className="text-sm text-gray-300">自动新建章节</span>
									<span className="text-sm font-bold text-[var(--accent-light)]">{distributePreview.created} 章</span>
								</div>
							</div>

							{/* 节点预览（前几条） */}
							<div className="rounded-lg bg-[#18181b] border border-white/5 divide-y divide-white/5">
								{outlineCards.slice(0, 5).map((c, i) => (
									<div key={i} className="px-4 py-2.5">
										<div className="text-xs font-medium text-gray-200 truncate">{i + 1}. {c.title}</div>
										{c.summary && <div className="text-[11px] text-gray-500 truncate mt-0.5">{c.summary}</div>}
									</div>
								))}
								{outlineCards.length > 5 && (
									<div className="px-4 py-2 text-[11px] text-gray-500">…等共 {outlineCards.length} 个节点</div>
								)}
							</div>

							<p className="text-[11px] text-amber-400/80 leading-relaxed">
								提示：仅写入「本章提纲」，不会覆盖任何已有正文。新建章节正文默认为空。
							</p>
						</div>

						<div className="p-5 border-t border-white/5 bg-[#18181b] flex justify-end gap-3">
							<button
								onClick={() => setShowDistributeModal(false)}
								className="px-5 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
							>
								取消
							</button>
							<button
								onClick={executeDistribute}
								className="px-5 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20 hover:bg-[var(--accent-hover)] transition-colors"
							>
								确认分配
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 参考正文优化确认弹窗 */}
			{showOptimizeModal && (
				<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
					<div className="w-[500px] max-h-[80vh] flex flex-col bg-[#1e1e22] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
						<div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#18181b]">
							<span className="text-sm font-bold text-gray-200">选择要参考的前文章节</span>
							<button onClick={() => setShowOptimizeModal(false)} className="text-gray-500 hover:text-gray-300">
								<X className="w-4 h-4" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto premium-scroll p-6 space-y-4">
							<div className="flex items-center justify-between gap-4">
								<p className="text-xs text-gray-400">选择几章前文正文，AI将学习其写作风格和故事节奏，并据此优化当前的节点细纲。</p>
								{(book.chapters?.length ?? 0) > 2 && (
									<button
										onClick={() => setOptimizeSortDesc(!optimizeSortDesc)}
										className="flex items-center shrink-0 gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/5"
									>
										{optimizeSortDesc ? (
											<><ArrowDown className="w-3.5 h-3.5" /> 倒序排列</>
										) : (
											<><ArrowUp className="w-3.5 h-3.5" /> 正序排列</>
										)}
									</button>
								)}
							</div>
							<div className="space-y-2">
								{[...(book.chapters || [])]
									.map((ch, idx) => ({ ch, idx }))
									.filter(({ idx }) => idx !== 0) // skip root
									.sort((a, b) => optimizeSortDesc ? b.idx - a.idx : a.idx - b.idx)
									.map(({ ch }) => {
										const selected = optimizeChapterIds.has(ch.id);
										return (
										<div
											key={ch.id}
											onClick={() => {
												const next = new Set(optimizeChapterIds);
												if (selected) next.delete(ch.id);
												else next.add(ch.id);
												setOptimizeChapterIds(next);
											}}
											className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
												selected
													? 'bg-[var(--accent)]/20 border-[var(--accent)]/30'
													: 'bg-black/20 border-white/5 hover:border-white/10 hover:bg-white/5'
											}`}
										>
											<div className={`w-4 h-4 rounded flex items-center justify-center border ${
												selected ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-white/20'
											}`}>
												{selected && <div className="w-2 h-2 rounded-sm bg-current" />}
											</div>
											<div className="flex-1 min-w-0">
												<div className={`text-sm font-medium truncate ${selected ? 'text-[var(--accent-light)]' : 'text-gray-300'}`}>
													{ch.title}
												</div>
												<div className="text-[11px] text-gray-500 mt-0.5">
													字数：{ch.wordCount || 0}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
						<div className="p-5 border-t border-white/5 bg-[#18181b] flex justify-end gap-3">
							<button onClick={() => setShowOptimizeModal(false)} className="px-5 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
								取消
							</button>
							<button
								disabled={optimizeChapterIds.size === 0}
								onClick={handleOptimizeWithChapters}
								className="px-5 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20 hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
							>
								确认提取正文并优化
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
