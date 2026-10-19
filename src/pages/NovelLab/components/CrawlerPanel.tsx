import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Chapter } from '../types';

interface Props {
 activeChapter: Chapter | null;
 batchCompleteSignal?: number;
 crawler: ReturnType<typeof import('../hooks/useCrawler').useCrawler>;
}


export default function CrawlerPanel({ activeChapter, batchCompleteSignal, crawler }: Props) {
  const { session, setSession, addChapters, selectPath, autoSaveChapter, saveIndex, clearQueue, saveAllUnsaved } = crawler;
  const [saveStatus, setSaveStatus] = useState('');
  // addChapters 已由父组件 NovelLab 统一处理，此处仅同步 saveStatus
  useEffect(() => {
  if (!activeChapter) return;
  // addChapters 有去重，重复调用无副作用，但 autoSave 已在父组件处理
  addChapters([activeChapter]);
  }, [activeChapter, addChapters]);

 const [tempBookName, setTempBookName] = useState(session.bookName);
 const [isBookNameConfirmed, setIsBookNameConfirmed] = useState(Boolean(session.bookName));

 useEffect(() => {
 setTempBookName(session.bookName);
 setIsBookNameConfirmed(Boolean(session.bookName));
 }, [session.bookName]);

 const handleConfirmBookName = () => {
 if (!tempBookName.trim()) return;
 setSession((s) => ({ ...s, bookName: tempBookName.trim() }));
 setIsBookNameConfirmed(true);
 };

 useEffect(() => {
 if (!batchCompleteSignal || batchCompleteSignal <= 0) return;
 setSaveStatus('保存中...');
 const { savePath, bookName } = session;
 if (!savePath || !bookName) {
 setSaveStatus('请先设置书名和保存路径');
 return;
 }
 void saveAllUnsaved(savePath, bookName)
 .then(() => saveIndex())
 .then(() => setSaveStatus('已保存'))
 .catch((error) => setSaveStatus(error instanceof Error ? error.message : String(error)));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [batchCompleteSignal]);

  const handleImportTxt = async () => {
  setSaveStatus('导入中...');
  try {
  const result = await window.novelLab?.importTxt();
  if (!result?.success || !result.chapters?.length) { if (result?.error) setSaveStatus(result.error); else setSaveStatus('未选择文件或文件为空'); return; }
  if (result.bookName) { setTempBookName(result.bookName); setSession((s) => ({ ...s, bookName: result.bookName || s.bookName })); setIsBookNameConfirmed(true); }
  addChapters(result.chapters.map((ch) => ({ index: ch.index, title: ch.title, url: `local://${ch.index}`, content: ch.content, status: 'done' })));
  setSaveStatus(`已导入 ${result.chapters.length} 章`);
  } catch (error) {
  setSaveStatus(error instanceof Error ? error.message : String(error));
  }
  };

 const handleSave = () => {
 setSaveStatus('保存中...');
 if (session.savePath && session.bookName) {
 void saveAllUnsaved(session.savePath, session.bookName)
 .then(() => saveIndex())
 .then(() => setSaveStatus('已保存'))
 .catch((error) => setSaveStatus(error instanceof Error ? error.message : String(error)));
 } else {
 void saveIndex()
 .then(() => setSaveStatus('索引已保存'))
 .catch((error) => setSaveStatus(error instanceof Error ? error.message : String(error)));
 }
 };



 return (
 <div className="nl-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
 {/* 书名 */}
 <div className="nl-row" style={{ gap: '6px' }}>
 <input className="nl-input" disabled={isBookNameConfirmed} value={tempBookName} onChange={(e) => setTempBookName(e.target.value)} placeholder="输入书名" onKeyDown={(e) => e.key === 'Enter' && handleConfirmBookName()} style={{ flex: 1, height: '30px', fontSize: '13px' }} />
 {isBookNameConfirmed ? (
 <button className="nl-btn" onClick={() => setIsBookNameConfirmed(false)} style={{ fontSize: '11px', padding: '0 10px', height: '30px' }}>修改</button>
 ) : (
 <button className="nl-btn nl-btn-accent" onClick={handleConfirmBookName} style={{ fontSize: '11px', padding: '0 10px', height: '30px' }}>确认</button>
 )}
 </div>



 {/* 底部操作栏 */}
 <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
 <div className="nl-row" style={{ gap: '8px' }}>
 <input className="nl-input" value={session.savePath} readOnly placeholder="保存目录路径" title={session.savePath} style={{ flex: 1, fontSize: '11px', padding: '0 10px', height: '30px', background: 'rgba(15, 23, 42, 0.6)' }} />
 <button className="nl-btn" onClick={() => void selectPath()} style={{ fontSize: '11px', padding: '0 12px', height: '30px' }}>选择</button>
 </div>
 <div className="nl-row" style={{ gap: '8px' }}>
 <button className="nl-btn" onClick={() => void handleImportTxt()} style={{ flex: 1, height: '34px', fontSize: '13px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.2)' }}>导入本地 TXT</button>
 <button className="nl-btn nl-btn-accent" onClick={handleSave} style={{ flex: 1, height: '34px', fontSize: '13px', fontWeight: 600 }}>保存所有章节与索引</button>
 </div>
 {saveStatus && <div style={{ fontSize: '11px', textAlign: 'center', marginTop: '-2px', color: saveStatus.includes('失败') || saveStatus.includes('请先') ? '#fca5a5' : '#86efac' }}>{saveStatus}</div>}
 </div>
 </div>
 );
}
