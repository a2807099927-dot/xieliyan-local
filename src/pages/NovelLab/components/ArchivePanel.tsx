// ArchivePanel.tsx - Sidebar panel for archived books and analysis sessions.
import { useEffect, useState } from 'react';
import type { AnalysisMode, ChatMessage } from '../types';
import type { AnalysisSessionMeta, ArchivedBook } from '../hooks/useArchive';

const MODE_LABELS: Record<string, string> = {
 full: '全面分析',
 plot: '剧情脉络',
 character: '角色分析',
 technique: '写作技法',
 value: '章节价值'
};

interface Props {
 savePath: string;
 archivedBooks: ArchivedBook[];
 analysisSessions: AnalysisSessionMeta[];
 onLoadBook: (folderPath: string) => void;
 onRestoreAnalysis: (messages: ChatMessage[], mode: AnalysisMode) => void;
 onRefreshArchives: () => void;
 onRefreshSessions: (bookName: string) => void;
 loadAnalysis: (savePath: string, bookName: string, id: string) => Promise<ChatMessage[] | null>;
 activeBookName?: string;
}

export default function ArchivePanel({
 savePath,
 archivedBooks,
 analysisSessions,
 onLoadBook,
 onRestoreAnalysis,
 onRefreshArchives,
 onRefreshSessions,
 loadAnalysis,
 activeBookName
}: Props) {
 const [expanded, setExpanded] = useState(false);
 const [selectedBook, setSelectedBook] = useState<ArchivedBook | null>(null);
 const [loadingId, setLoadingId] = useState<string | null>(null);

 useEffect(() => {
 if (expanded && savePath) onRefreshArchives();
 }, [expanded, savePath, onRefreshArchives]);

 useEffect(() => {
 if (selectedBook) onRefreshSessions(selectedBook.bookName);
 }, [selectedBook, onRefreshSessions]);

 const handleRestoreAnalysis = async (session: AnalysisSessionMeta) => {
 if (!selectedBook) return;
 setLoadingId(session.id);
 const messages = await loadAnalysis(savePath, selectedBook.bookName, session.id);
 setLoadingId(null);
 if (messages) onRestoreAnalysis(messages, session.mode as AnalysisMode);
 };

 const formatDate = (iso: string) => {
 if (!iso) return '';
 try {
 return new Date(iso).toLocaleDateString('zh-CN', {
 month: 'numeric',
 day: 'numeric',
 hour: '2-digit',
 minute: '2-digit'
 });
 } catch {
 return '';
 }
 };

 return (
 <div className="nl-archive-panel">
 <div className={`nl-archive-toggle ${expanded ? 'active' : ''}`} onClick={() => setExpanded((v) => !v)}>
 <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>已存档书籍</span>
 {archivedBooks.length > 0 && <span className="nl-archive-badge">{archivedBooks.length}</span>}
 <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
 <button
 className="nl-btn nl-btn-sm"
 onClick={(e) => {
 e.stopPropagation();
 onLoadBook('');
 }}
 title="新建一本书或切换工作区"
 >
 新建拆书
 </button>
 <button
 className="nl-archive-refresh-btn"
 onClick={(e) => {
 e.stopPropagation();
 onRefreshArchives();
 }}
 title="刷新列表"
 >
 刷新
 </button>
 <span className="nl-archive-chevron">{expanded ? '▲' : '▼'}</span>
 </div>
 </div>

 {expanded && (
 <div className="nl-archive-drawer">
 {!savePath ? (
 <p className="nl-archive-empty">请先在爬取面板选择保存目录</p>
 ) : archivedBooks.length === 0 ? (
 <p className="nl-archive-empty">暂无已存档书籍</p>
 ) : (
 <div className="nl-archive-list">
 {archivedBooks.map((book) => (
 <div
 key={book.folderPath}
 className={`nl-archive-book ${selectedBook?.folderPath === book.folderPath ? 'selected' : ''} ${
 activeBookName === book.bookName ? 'active-book' : ''
 }`}
 onClick={() => setSelectedBook(book)}
 >
 <div className="nl-archive-book-header">
 <span className="nl-archive-book-name">{book.bookName}</span>
 {activeBookName === book.bookName && <span className="nl-archive-current-tag">当前</span>}
 </div>
 <div className="nl-archive-book-meta">
 <span>
 已提取 <b>{book.totalChapters}</b> 章（最高到 {book.lastExtractedIndex} 章）
 </span>
 {book.lastAnalyzedIndex > 0 && (
 <span>
 {' '}
 · 分析至 <b>{book.lastAnalyzedIndex}</b> 章
 </span>
 )}
 </div>
 <div className="nl-archive-book-date">{formatDate(book.lastUpdatedAt)}</div>

 {selectedBook?.folderPath === book.folderPath && (
 <div className="nl-archive-book-actions"onClick={(e) => e.stopPropagation()}>
 <button className="nl-btn nl-btn-accent nl-btn-sm"onClick={() => onLoadBook(book.folderPath)}>
 载入此书
 </button>
 <button className="nl-btn nl-btn-sm"style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }} onClick={() => {
 if (window.confirm(`确定删除「${book.bookName}」的所有存档数据吗？此操作不可恢复。`)) {
 void window.novelLab?.deleteBook?.({ folderPath: book.folderPath }).then((res: any) => {
 if (res?.success) { setSelectedBook(null); onLoadBook(''); onRefreshArchives(); }
 else { window.alert(`删除失败：${res?.error || '未知错误'}`); }
 });
 }
 }}>
 删除
 </button>
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {selectedBook && (
 <div className="nl-archive-analysis">
 <div className="nl-archive-analysis-title">分析记录</div>
 {analysisSessions.length === 0 ? (
 <div className="nl-archive-empty">暂无该书分析记录</div>
 ) : (
 <div className="nl-archive-analysis-list">
 {analysisSessions.map((s) => (
 <button
 key={s.id}
 className="nl-archive-analysis-item"
 onClick={() => void handleRestoreAnalysis(s)}
 disabled={loadingId === s.id}
 >
 <div>
 {MODE_LABELS[s.mode] || s.mode} · 第{s.chapterFrom}-{s.chapterTo}章
 </div>
 <div className="nl-archive-analysis-date">
 {formatDate(s.createdAt)} {loadingId === s.id ? '加载中...' : ''}
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 );
}
