// index.tsx - Novel Lab main page layout and orchestration.
import { useCallback, useEffect, useMemo, useState } from 'react';
import BrowserPanel from './components/BrowserPanel';
import CrawlerPanel from './components/CrawlerPanel';
import AnalysisPanel from './components/AnalysisPanel';
import ArchivePanel from './components/ArchivePanel';
import { TitleBar } from '../../components/common/TitleBar';
import { chunkChapters, CHUNK_CHAR_LIMIT, MAX_CHAPTERS_PER_BATCH } from './hooks/useAnalysis';
import { useCrawler } from './hooks/useCrawler';
import { useArchive } from './hooks/useArchive';
import type { AnalysisMode, Chapter, ChatMessage } from './types';
import styles from './NovelLab.module.css';
import { electronAPI } from '../../utils/electron';

/** 解析章节范围输入，如 '1-10, 15, 20-30' */
function parseRange(input: string, validIndices: number[]): number[] {
  const picked = new Set<number>();
  const valid = new Set(validIndices);
  input.split(/[,，、\s]+/).forEach((part) => {
    const p = part.trim();
    if (!p) return;
    const m = p.match(/^(\d+)\s*[-~到]\s*(\d+)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) { const t = a; a = b; b = t; }
      for (let i = a; i <= b; i += 1) if (valid.has(i)) picked.add(i);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (valid.has(n)) picked.add(n);
    }
  });
  return [...picked].sort((x, y) => x - y);
}
export default function NovelLab() {
 const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
 const [batchCompleteSignal, setBatchCompleteSignal] = useState(0);
 const [showClosePrompt, setShowClosePrompt] = useState(false);
 const [restoredMessages, setRestoredMessages] = useState<{ messages: ChatMessage[]; mode: AnalysisMode } | null>(null);
 const [sidebarTab, setSidebarTab] = useState<"web" | "local">("local");

 const crawler = useCrawler();
 const archive = useArchive();
 const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
 const [rangeInput, setRangeInput] = useState('');

 const targetChapters = crawler.session.chapters;
 const selectedChapters = useMemo(() => targetChapters.filter((ch) => selectedIndices.has(ch.index) && ch.content && ch.content.length > 0), [targetChapters, selectedIndices]);
 const selectedChars = useMemo(() => selectedChapters.reduce((acc, ch) => acc + (ch.content?.length || 0), 0), [selectedChapters]);
 const batchCount = useMemo(() => (selectedChapters.length === 0 ? 0 : chunkChapters(selectedChapters, CHUNK_CHAR_LIMIT, MAX_CHAPTERS_PER_BATCH).length), [selectedChapters]);

 const applyRange = useCallback(() => {
   const validIndices = targetChapters.map((ch) => ch.index);
   setSelectedIndices(new Set(parseRange(rangeInput, validIndices)));
 }, [rangeInput, targetChapters]);

 const selectAllWithContent = useCallback(() => {
   setSelectedIndices(new Set(targetChapters.filter((ch) => ch.content && ch.content.length > 0).map((ch) => ch.index)));
 }, [targetChapters]);

 const selectAll = useCallback(() => {
   setSelectedIndices(new Set(targetChapters.map((ch) => ch.index)));
 }, [targetChapters]);

 const clearSelection = useCallback(() => setSelectedIndices(new Set()), []);
 const invertSelect = useCallback(() => {
   setSelectedIndices((prev) => {
     const next = new Set<number>();
     targetChapters.forEach(c => {
       if (!prev.has(c.index)) next.add(c.index);
     });
     return next;
   });
 }, [targetChapters]);

 const toggleChapter = useCallback((index: number) => {
   setSelectedIndices((prev) => {
     const next = new Set(prev);
     if (next.has(index)) next.delete(index);
     else next.add(index);
     return next;
   });
 }, []);

 const deleteSelected = useCallback(() => {
   if (selectedIndices.size === 0) return;
   const newChapters = targetChapters.filter(c => !selectedIndices.has(c.index));
   crawler.setSession(s => ({ 
     ...s, 
     chapters: newChapters, 
     totalCount: newChapters.length, 
     doneCount: newChapters.filter(c => c.status === 'done').length 
   }));
   setSelectedIndices(new Set());
 }, [selectedIndices, targetChapters, crawler]);

 // 在线提取章节时，无论 CrawlerPanel 是否挂载都要把章节加入 session
 useEffect(() => {
 if (!activeChapter) return;
 crawler.addChapter(activeChapter);
 if (crawler.session.bookName && crawler.session.savePath) {
 void crawler.autoSaveChapter(activeChapter).catch(() => {});
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeChapter]);

 useEffect(() => {
 const init = async () => {
 const res = await window.novelLab?.getAppConfig();
 const workspace = (res?.config as { workspace?: { novelLabSavePath?: string } })?.workspace;
 if (workspace?.novelLabSavePath) {
 crawler.setSession((session) => ({ ...session, savePath: workspace.novelLabSavePath || '' }));
 void archive.refreshArchives(workspace.novelLabSavePath);
 }
 };
 void init();
 }, [archive.refreshArchives, crawler.setSession]);

 useEffect(() => {
 if (crawler.session.savePath) {
 void archive.refreshArchives(crawler.session.savePath);
 void window.novelLab?.setNovelLabPaths?.({ savePath: crawler.session.savePath });
 }
 }, [archive.refreshArchives, crawler.session.savePath]);

 const handleCloseRequest = useCallback(() => {
 const hasUnsaved = crawler.session.chapters.some((chapter) => !chapter.filePath && chapter.content);
 if (hasUnsaved) {
 // 暂时隐藏 child webview（移到屏幕外），避免它遮挡弹窗
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) internals.invoke('novel_browser_hide').catch(() => {});
 } catch {}
 setShowClosePrompt(true);
 return;
 }
 // 关窗前先关闭 child webview（小说浏览器），避免 webview2 死锁
 const closeAll = async () => {
 try {
 // invoke novel_browser_close 确保 child webview 被销毁
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) {
 await internals.invoke('novel_browser_close').catch(() => {});
 }
 } catch { /* ignore */ }
 await electronAPI.system.windowClose();
 };
 void closeAll();
 }, [crawler.session.chapters]);

 const handleSaveIndexAndRefresh = useCallback(async () => {
 await crawler.saveIndex();
 if (crawler.session.savePath) {
 void archive.refreshArchives(crawler.session.savePath);
 }
 }, [archive.refreshArchives, crawler.saveIndex, crawler.session.savePath]);

 const crawlerWithSave = useMemo(() => ({ ...crawler, saveIndex: handleSaveIndexAndRefresh }), [crawler, handleSaveIndexAndRefresh]);

 const handleLoadBook = useCallback(async (folderPath: string) => {
 const result = await archive.loadBook(folderPath);
 if (!result?.success || !result.meta || !result.chapters) return;

 const { meta, chapters } = result;

 crawler.setSession(() => ({
 bookName: meta.bookName,
 savePath: meta.savePath,
 chapters: chapters.map((chapter) => ({
 index: chapter.index,
 title: chapter.title,
 url: chapter.url,
 status: 'done' as const,
 content: chapter.content,
 filePath: 'loaded-from-archive'
 })),
 currentIndex: meta.lastExtractedIndex,
 isRunning: false,
 totalCount: chapters.length,
 doneCount: chapters.length
 }));

 void archive.refreshAnalysisSessions(meta.savePath, meta.bookName);

 // 自动恢复最近的分析记录
 const chapterAnalyses = (result as any).chapterAnalyses as Array<{ index: number; analysis: { mode: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } }> | undefined;
 if (chapterAnalyses && chapterAnalyses.length > 0) {
 // 取最新的分析记录恢复到面板
 const latest = chapterAnalyses[chapterAnalyses.length - 1];
 if (latest?.analysis?.messages?.length > 0) {
 setRestoredMessages({ messages: latest.analysis.messages as ChatMessage[], mode: latest.analysis.mode as AnalysisMode });
 } else {
 setRestoredMessages(null);
 }
 } else {
 setRestoredMessages(null);
 }
 }, [archive.loadBook, archive.refreshAnalysisSessions, crawler.setSession]);

 const handleCreateNew = useCallback(() => {
 crawler.setSession((session) => ({
 ...session,
 bookName: '',
 chapters: [],
 currentIndex: 0,
 isRunning: false,
 totalCount: 0,
 doneCount: 0
 }));
 setRestoredMessages(null);
 }, [crawler.setSession]);

 return (
 <div className={styles.root}>
 <TitleBar onClose={handleCloseRequest} minimal />

 <div className={styles.labContainer}>
 <div className={styles.labPanel}>
 <header className={styles.header}>
 <span className={styles.logo}>拆书神器</span>
 <span className={styles.disclaimer}>仅供学习研究，请勿用于商业用途，尊重原著版权</span>
 </header>

 <main className={styles.main}>
{/* 左侧统一全能控制台 (Global TOC) */}
 <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.6)' }}>
 {/* Header */}
 <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>📚 统一章节大纲</span>
 <span style={{ fontSize: '11px', color: '#6ee7b7' }}>已提取 {targetChapters.filter(c => c.content && c.content.length > 0).length} / 共 {targetChapters.length} 章</span>
 </div>

 {/* Selection Controls */}
 <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
 <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
 <button onClick={selectAllWithContent} style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', borderRadius: '4px', cursor: 'pointer' }}>全选(有内容)</button>
 <button onClick={selectAll} style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: '4px', cursor: 'pointer' }}>全选</button>
 <button onClick={invertSelect} style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: '4px', cursor: 'pointer' }}>反选</button>
 <button onClick={clearSelection} style={{ padding: '4px 8px', fontSize: '11px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', borderRadius: '4px', cursor: 'pointer' }}>清空</button>
 </div>
 <div style={{ display: 'flex', gap: '6px' }}>
 <input 
 style={{ flex: 1, padding: '4px 8px', fontSize: '11px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', outline: 'none' }}
 value={rangeInput}
 onChange={(e) => setRangeInput(e.target.value)}
 onKeyDown={(e) => { if (e.key === 'Enter') applyRange(); }}
 placeholder="范围圈选: 1-10, 15"
 />
 <button onClick={applyRange} style={{ padding: '4px 12px', fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.4)', color: '#38bdf8', borderRadius: '4px', cursor: 'pointer' }}>应用</button>
 </div>
 <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
 已选 {selectedIndices.size} 项 (含 {selectedChapters.length} 章有内容 · 约 {selectedChars} 字{batchCount > 1 ? ` · 分 ${batchCount} 批` : ''})
 </div>
 </div>

 {/* Scrollable Chapter List */}
 <div style={{ flex: 1, overflow: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
 {targetChapters.length === 0 ? (
 <div style={{ textAlign: 'center', marginTop: '40px', color: '#475569', fontSize: '11px', lineHeight: 1.6 }}>
 <div style={{ fontSize: '20px', marginBottom: '8px', opacity: 0.5 }}>📖</div>
 暂无章节<br/>请在右侧爬取或导入
 </div>
 ) : (
 targetChapters.map((ch) => {
 const has = Boolean(ch.content && ch.content.length > 0);
 const checked = selectedIndices.has(ch.index);
 return (
 <label key={ch.url} style={{ 
 display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', 
 padding: '4px 6px', borderRadius: '4px', cursor: 'pointer',
 background: checked ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
 border: '1px solid', borderColor: checked ? 'rgba(56, 189, 248, 0.3)' : 'transparent',
 opacity: has ? 1 : 0.6 
 }}>
 <input type="checkbox" checked={checked} onChange={() => toggleChapter(ch.index)} style={{ margin: 0, cursor: 'pointer' }} />
 <span style={{ color: has ? '#34d399' : '#475569', width: '12px', textAlign: 'center' }}>{has ? '✓' : '○'}</span>
 <span style={{ color: '#7dd3fc', fontWeight: 500, minWidth: '30px' }}>#{ch.index}</span>
 <span style={{ flex: 1, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title || `第${ch.index}章`}</span>
 <span style={{ color: '#64748b', fontSize: '10px' }}>{has ? `${ch.content!.length}字` : '无内容'}</span>
 </label>
 );
 })
 )}
 </div>

 {/* Bottom Actions */}
 {targetChapters.length > 0 && (
 <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
 <div style={{ display: 'flex', gap: '6px' }}>
 <button 
 onClick={deleteSelected}
 disabled={selectedIndices.size === 0}
 style={{ flex: 1, padding: '6px 0', fontSize: '11px', background: selectedIndices.size > 0 ? 'rgba(239, 68, 68, 0.15)' : 'transparent', color: selectedIndices.size > 0 ? '#fca5a5' : '#475569', border: '1px solid', borderColor: selectedIndices.size > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.05)', borderRadius: '4px', cursor: selectedIndices.size > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
 >删除选中({selectedIndices.size})</button>
 <button 
 onClick={() => { crawler.clearQueue(); setSelectedIndices(new Set()); }}
 style={{ flex: 1, padding: '6px 0', fontSize: '11px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
 >清空全部</button>
 </div>
 </div>
 )}
 </div>
 <aside className={styles.sidebar}>
 <ArchivePanel
 savePath={crawler.session.savePath}
 archivedBooks={archive.archivedBooks}
 analysisSessions={archive.analysisSessions}
 onLoadBook={(folderPath) => (folderPath ? void handleLoadBook(folderPath) : void handleCreateNew())}
 onRestoreAnalysis={(messages, mode) => setRestoredMessages({ messages, mode })}
 onRefreshArchives={() => void archive.refreshArchives(crawler.session.savePath)}
 onRefreshSessions={(bookName) => void archive.refreshAnalysisSessions(crawler.session.savePath, bookName)}
 loadAnalysis={archive.loadAnalysis}
 activeBookName={crawler.session.bookName}
 />

 <div style={{ display: 'flex', padding: '8px 12px', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
 <button 
 onClick={() => setSidebarTab('web')} 
 style={{ flex: 1, padding: '6px 0', fontSize: '12px', borderRadius: '6px', background: sidebarTab === 'web' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: sidebarTab === 'web' ? '#38bdf8' : '#94a3b8', border: '1px solid', borderColor: sidebarTab === 'web' ? 'rgba(56,189,248,0.3)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
 >
 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
 在线书源
 </button>
 <button 
 onClick={() => setSidebarTab('local')} 
 style={{ flex: 1, padding: '6px 0', fontSize: '12px', borderRadius: '6px', background: sidebarTab === 'local' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: sidebarTab === 'local' ? '#38bdf8' : '#94a3b8', border: '1px solid', borderColor: sidebarTab === 'local' ? 'rgba(56,189,248,0.3)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
 >
 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
 本地书源
 </button>
 </div>

 {sidebarTab === 'web' && (
 <section className={styles.panelBrowser} style={{ height: '100%', borderBottom: 'none' }}>
 <BrowserPanel
 onChapterExtracted={setActiveChapter}
 initialChapterCount={crawler.session.chapters.length}
 onBatchComplete={() => {
 setBatchCompleteSignal((signal) => signal + 1);
 }}
 />
 </section>
 )}

 {sidebarTab === 'local' && (
 <section className={styles.panelCrawler} style={{ height: '100%' }}>
 <CrawlerPanel
 activeChapter={activeChapter}
 batchCompleteSignal={batchCompleteSignal}
 crawler={crawlerWithSave}
 />
 </section>
 )}
 </aside>

 <section className={styles.panelAnalysis}>
 <AnalysisPanel
 activeChapter={activeChapter}
 chapters={crawler.session.chapters}
 session={crawler.session}
 archive={archive}
 restoredMessages={restoredMessages}
 onRestoredConsumed={() => setRestoredMessages(null)}
 selectedIndices={selectedIndices}
 />
 </section>
 </main>
 </div>
 </div>

 {showClosePrompt ? (
 <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 ">
 <div className="wz-glass w-full max-w-sm p-6 shadow-2xl">
 <h2 className="text-xl font-bold text-white/90">存在未保存内容</h2>
 <p className="mt-3 text-sm text-white/70">当前仍有未导出的章节，确认直接关闭吗？</p>
 <div className="mt-6 flex justify-end gap-3">
 <button
 className="border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
 onClick={() => {
 setShowClosePrompt(false);
 (async () => {
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) await internals.invoke('novel_browser_close').catch(() => {});
 } catch { /* ignore */ }
 await electronAPI.system.windowClose();
 })();
 }}
 >
 直接关闭
 </button>
 <button
 className="border border-indigo-500/30 bg-indigo-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
 onClick={() => {
 setShowClosePrompt(false);
 // 恢复 child webview 位置（之前只是移到屏幕外，不需要重新创建）
 try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals?.invoke) {
 // 触发 BrowserPanel 的 syncRegion 来恢复位置
 window.dispatchEvent(new Event('resize'));
 }
 } catch {}
 }}
 >
 返回
 </button>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 );
}
