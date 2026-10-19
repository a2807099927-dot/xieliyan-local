// 导出执行层：侧栏 ChapterList 与 Editor 工具栏两个入口共用，避免两份实现走偏。
// 范围由 ExportRangeModal 决定，这里只负责选保存路径 + 调 Rust 导出。
import { electronAPI } from './electron';
import type { ExportRange } from '../components/modals/ExportRangeModal';

export type ExportFormat = 'txt' | 'markdown' | 'pdf';

export const EXPORT_TITLE: Record<ExportFormat, string> = {
	txt: '导出 TXT',
	markdown: '导出 Markdown',
	pdf: '导出 PDF'
};

const FILE_META: Record<ExportFormat, { filterName: string; ext: string; successMessage: string; failMessage: string; autoHideMs: number }> = {
	txt: { filterName: 'Text', ext: 'txt', successMessage: 'TXT 导出完成', failMessage: 'TXT 导出失败', autoHideMs: 2800 },
	markdown: { filterName: 'Markdown', ext: 'md', successMessage: 'Markdown 导出完成', failMessage: 'Markdown 导出失败', autoHideMs: 2800 },
	pdf: { filterName: 'PDF', ext: 'pdf', successMessage: '已在浏览器中打开，请按 Ctrl+P 打印为 PDF', failMessage: 'PDF 导出失败', autoHideMs: 4000 }
};

/** 默认文件名带上范围，避免节选导出与全本同名互相覆盖 */
export function exportDefaultFileName(bookTitle: string, format: ExportFormat, range: ExportRange): string {
	const suffix = range.chapterIds ? `_${range.label}` : '';
	return `${bookTitle}${suffix}.${FILE_META[format].ext}`;
}

export async function exportChapters(options: {
	bookId: string;
	bookTitle: string;
	format: ExportFormat;
	range: ExportRange;
	run: <T>(fn: () => Promise<T>, notify?: { successMessage?: string; failMessage?: string; autoHideMs?: number }) => Promise<T>;
}): Promise<boolean> {
	const { bookId, bookTitle, format, range, run } = options;
	const meta = FILE_META[format];
	const selected = await electronAPI.fs.selectSavePath({
		title: EXPORT_TITLE[format],
		defaultPath: exportDefaultFileName(bookTitle, format, range),
		filters: [{ name: meta.filterName, extensions: [meta.ext] }]
	});
	const outputPath = typeof selected?.path === 'string' ? selected.path : '';
	if (!outputPath) return false;

	const payload = { bookId, outputPath, chapterIds: range.chapterIds };
	const invokeExport =
		format === 'markdown'
			? () => electronAPI.fs.exportMarkdown(payload)
			: format === 'pdf'
				? () => electronAPI.fs.exportPdf(payload)
				: () => electronAPI.fs.exportTxt(payload);

	await run(invokeExport, { successMessage: meta.successMessage, failMessage: meta.failMessage, autoHideMs: meta.autoHideMs });
	return true;
}
