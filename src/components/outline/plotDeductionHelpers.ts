import type { Book, InspirationNote } from '../../types';
import { electronAPI } from '../../utils/electron';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
	aiContent?: string;
}

export async function callAI(bookId: string, messages: ChatMessage[]): Promise<string> {
	const res = await electronAPI.ai.chat({
		stream: false,
		bookId,
		disableRag: true,
		disableStyle: true,
		messages: messages as any,
	});
	return (res?.text || '').trim();
}

export interface DeductionContext {
	systemPrompt: string;
	backgroundSummary: string;
}

function takeRecentOutline(book: Book, selectedChapterIds?: string[], n = 5): string {
	let analyzedMemories = (book.memoryBank || []).filter(m => m.isAnalyzed && m.plotAnalysis);
	if (selectedChapterIds && selectedChapterIds.length > 0) {
		analyzedMemories = analyzedMemories.filter(m => selectedChapterIds.includes(m.chapterId));
	} else {
		analyzedMemories = analyzedMemories.slice(-n);
	}
	const chapterPlots = analyzedMemories.map(m => {
		const title = book.chapters?.find(c => c.id === m.chapterId)?.title || `章节`;
		const synopsis = m.plotAnalysis?.plotSynopsis || m.plotAnalysis?.functionSummary || '';
		return `[已写剧情] ${title}：\n${synopsis}`;
	});
	const futureNodes = (book.outlineVision?.nodes ?? [])
		.slice(-n)
		.map((nd) => `[未来大纲] ${nd.title ?? ''}：${nd.notes || nd.conflict || ''}`);
	return [...chapterPlots, ...futureNodes].filter(Boolean).join('\n\n');
}

function formatCharacters(book: Book): string {
	const chars = book.resourceIndex?.customCharacterCategories?.flatMap(c => c.children) ?? [];
	return chars
		.filter(c => c.name && (c.description || c.plotProgress))
		.map(
			(c) =>
				`- ${c.name} (${c.roleType || '角色'})｜身份/阵营：${c.faction || '未知'}｜设定：${c.description || ''}｜现状：${c.plotProgress || ''}`,
		)
		.join('\n');
}

function formatWorld(book: Book): string {
	const w = book.worldBuilder ?? [];
	return w
		.filter(item => item.content?.trim())
		.map(item => `[${item.category}] ${item.name}: ${item.content}`)
		.join('\n');
}

function formatNotes(notes: InspirationNote[]): string {
	return notes.map((n) => `- [${n.type}] ${n.content}`).join('\n');
}

export async function buildDeductionContext(
	book: Book,
	selectedNotes: InspirationNote[],
	selectedChapterIds?: string[],
): Promise<DeductionContext> {
	const world = formatWorld(book);
	const characters = formatCharacters(book);
	const outline = takeRecentOutline(book, selectedChapterIds);
	const notes = formatNotes(selectedNotes);

	let latestNum = 0;
	book.chapters?.forEach(ch => {
		const m = ch.title.match(/第\s*(\d+)\s*[章节回]/);
		if (m) {
			const n = parseInt(m[1], 10);
			if (n > latestNum) latestNum = n;
		}
	});
	const chapterInfo = latestNum > 0 
		? `\n【进度说明】\n当前作品已写到 第${latestNum}章。请你在最终生成细纲（阶段5）时，顺延当前的章节序号（即从 第${latestNum + 1}章 开始编号），标题格式请务必以“第X章”开头。` 
		: '';

	const backgroundSummary = [
		`【作品名】${book.title ?? '未命名'}`,
		world && `\n【世界观与设定】\n${world}`,
		characters && `\n【关键角色档案】\n${characters}`,
		outline && `\n【最近剧情与大纲】\n${outline}`,
		`\n【待推演灵感碎片】\n${notes}`,
		chapterInfo,
	]
		.filter(Boolean)
		.join('\n');

	let systemPrompt = await electronAPI.ai.getEncryptedPrompt('plot_deduction_system');
	if (!systemPrompt) {
		console.warn('Failed to load encrypted plot_deduction_system prompt, falling back to a minimal version.');
		systemPrompt = '你是中文小说剧情推演助手。推演前先对齐以下信息：\n{{BACKGROUND_SUMMARY}}\n';
	}

	systemPrompt = systemPrompt.replace('{{BACKGROUND_SUMMARY}}', backgroundSummary);

	return { systemPrompt, backgroundSummary };
}

export interface OutlineCard {
	title: string;
	summary: string;
	beats: string[];
}

function normalizeCard(o: any): OutlineCard | null {
	if (!o || typeof o !== 'object') return null;
	const title = String(o.title ?? '').trim();
	const summary = String(o.summary ?? '').trim();
	const beats = Array.isArray(o.beats)
		? o.beats.map((b: any) => String(b).trim()).filter(Boolean)
		: [];
	if (!title && !summary && beats.length === 0) return null;
	return { title: title || '未命名节点', summary, beats };
}

/**
 * 仅在出现 \`\`\`json ... \`\`\` 严格围栏时，才认定为“最终细纲”。
 * 中间阶段（骨架、提问等）一律返回空数组，避免误触发应用态。
 */
export function parseOutlineCards(raw: string): OutlineCard[] {
	if (!raw) return [];
	let cards: OutlineCard[] = [];
	
	// 1. Try JSON parsing first
	const m = raw.match(/```json\s*([\s\S]*?)```/i);
	if (m) {
		try {
			const arr = JSON.parse(m[1].trim());
			if (Array.isArray(arr)) {
				cards = arr.map(normalizeCard).filter((c): c is OutlineCard => c !== null);
				if (cards.length > 0) return cards;
			}
		} catch {
			/* ignore and fallback */
		}
	}

	// 2. Fallback to Markdown text parsing (e.g., **第1章 xxx**)
	const regex = /(?:^|\n)(?:\*\*|###\s*)?((?:第[0-9一二三四五六七八九十百]+[章回节]|节点\s*\d+|[0-9]+\.)[^\n*]*)(?:\*\*|###\s*)?(?:\n|$)([\s\S]*?)(?=(?:\n(?:\*\*|###\s*)?(?:第[0-9一二三四五六七八九十百]+[章回节]|节点\s*\d+|[0-9]+\.)|$))/g;
	let match;
	while ((match = regex.exec(raw)) !== null) {
		const title = match[1].trim();
		const contentBlock = match[2].trim();
		const lines = contentBlock.split('\n').map(l => l.trim()).filter(Boolean);
		// Strip lines that match the A-F option format
		const isOptionLine = (line: string) => /^(?:[\-\*]\s*)?\*{0,2}[A-F][.、：:]/i.test(line);
		const beats = lines
			.filter(l => !isOptionLine(l))
			.map(l => l.replace(/^[-*•]\s*/, ''))
			.filter(Boolean);
		cards.push({ title, summary: '', beats });
	}

	return cards;
}
