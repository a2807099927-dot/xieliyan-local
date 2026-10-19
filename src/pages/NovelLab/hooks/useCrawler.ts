// useCrawler 
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Chapter, CrawlSession } from '../types';

const initialSession: CrawlSession = {
 bookName: '',
 savePath: '',
 chapters: [],
 currentIndex: 0,
 isRunning: false,
 totalCount: 0,
 doneCount: 0
};

export function useCrawler() {
 const [session, setSession] = useState<CrawlSession>(initialSession);
 // 用 ref 镜像 session，让 saveAllUnsaved/saveIndex 等异步函数始终读到最新值
 const sessionRef = useRef<CrawlSession>(initialSession);
 const syncSession = useCallback((updater: (prev: CrawlSession) => CrawlSession) => {
 setSession((prev) => {
 const next = updater(prev);
 sessionRef.current = next;
 return next;
 });
 }, []);

 const addChapter = useCallback((chapter: Chapter) => {
  syncSession((prev) => {
  if (prev.chapters.some((item) => item.url === chapter.url)) return prev;
  return {
  ...prev,
  chapters: [...prev.chapters, chapter],
  totalCount: prev.totalCount + 1,
  doneCount: chapter.status === 'done' ? prev.doneCount + 1 : prev.doneCount
  };
  });
  }, [syncSession]);

  // 批量导入章节：一次 state 更新完成，避免大文件逐章 setState 造成 O(n²) 卡死/无响应
  const addChapters = useCallback((chapters: Chapter[]) => {
  if (!chapters.length) return;
  syncSession((prev) => {
  const existingUrls = new Set(prev.chapters.map((item) => item.url));
  const fresh = chapters.filter((ch) => !existingUrls.has(ch.url));
  if (!fresh.length) return prev;
  const done = fresh.filter((ch) => ch.status === 'done').length;
  return {
  ...prev,
  chapters: [...prev.chapters, ...fresh],
  totalCount: prev.totalCount + fresh.length,
  doneCount: prev.doneCount + done
  };
  });
  }, [syncSession]);

 const saveAllUnsaved = useCallback(async (path: string, bookName: string) => {
 // 直接从 ref 读取最新 chapters，不用 setSession 副作用读数据
 if (!path || !bookName) return;
 const pending = sessionRef.current.chapters.filter((chapter) => !chapter.filePath && chapter.content);

 for (const ch of pending) {
 const result = await window.novelLab?.saveChapter({
 savePath: path,
 bookName,
 chapter: { index: ch.index, title: ch.title, content: ch.content || '', url: ch.url, scrapedAt: new Date().toISOString() }
 });
 if (!result?.success || !result.filePath) {
 throw new Error(result?.error || `章节保存失败：${ch.title}`);
 }
 syncSession((s) => ({
 ...s,
 chapters: s.chapters.map((item) => (item.url === ch.url ? { ...item, filePath: result.filePath } : item))
 }));
 }
 }, [syncSession]);

 const selectPath = useCallback(async () => {
 const picked = await window.novelLab?.selectSavePath();
 if (!picked) return;
 // 从 ref 读取最新 bookName，避免 await 后闭包陈旧
 const currentBookName = sessionRef.current.bookName;
 syncSession((prev) => ({ ...prev, savePath: picked }));
 if (currentBookName) {
 void saveAllUnsaved(picked, currentBookName);
 }
 }, [saveAllUnsaved, syncSession]);

 const autoSaveChapter = useCallback(async (chapter: Chapter) => {
 // 从 ref 读取最新 bookName/savePath，避免闭包陈旧
 const { bookName, savePath } = sessionRef.current;
 if (!chapter.content || !bookName || !savePath) return;
 const result = await window.novelLab?.saveChapter({
 savePath,
 bookName,
 chapter: {
 index: chapter.index,
 title: chapter.title,
 content: chapter.content,
 url: chapter.url,
 scrapedAt: new Date().toISOString()
 }
 });
 if (!result?.success || !result.filePath) {
 throw new Error(result?.error || `章节保存失败：${chapter.title}`);
 }
 syncSession((prev) => ({
 ...prev,
 chapters: prev.chapters.map((item) => (item.url === chapter.url ? { ...item, filePath: result.filePath } : item))
 }));
 }, [syncSession]);

 const saveIndex = useCallback(async () => {
 // 从 ref 读取最新 session，不依赖闭包
 const { bookName, savePath, chapters } = sessionRef.current;
 if (!bookName || !savePath || chapters.length === 0) return;
 const result = await window.novelLab?.saveBookIndex({
 savePath,
 bookName,
 chapters: chapters.map((c) => ({ index: c.index, title: c.title, url: c.url }))
 });
 if (!result?.success) {
 throw new Error(result?.error || '索引保存失败');
 }
 }, []);

 const clearQueue = useCallback(() => {
 syncSession((prev) => ({ ...prev, chapters: [], totalCount: 0, doneCount: 0 }));
 }, [syncSession]);

  return useMemo(() => ({
  session,
  setSession: syncSession,
  addChapter,
  addChapters,
  selectPath,
  autoSaveChapter,
  saveIndex,
  clearQueue,
  saveAllUnsaved
  }), [session, syncSession, addChapter, addChapters, selectPath, autoSaveChapter, saveIndex, clearQueue, saveAllUnsaved]);
}
