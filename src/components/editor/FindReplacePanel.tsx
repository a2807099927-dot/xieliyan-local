// 模块说明：功能=右上角查找替换弹窗。
// 架构=紧凑弹窗（右上角固定）：查找/替换两行 + 替换/本章替换/全书替换 + 「搜索全书」按钮。
// 默认在本章搜索并高亮；「搜索全书」产出结果到 useAppStore.bookSearchResults，由目录栏浮层展示。
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import type { Editor } from '@tiptap/core';
import { applySearchHighlights } from './searchHighlight';
import type { Book } from '../../types';
import { useBookStore } from '../../store/useBookStore';
import { useAppStore } from '../../store/useAppStore';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { getPosFromTextOffset } from '../../utils/editor/helpers';
import { toSafeParagraphNodes } from '../../utils/editorUtils';
import { ensureChapterHeading } from '../../utils/chapterTemplate';

interface FindReplacePanelProps {
 editor: Editor | null;
 book: Book;
 chapterId: string;
 onClose: () => void;
}

interface MatchItem {
 id: string;
 chapterId: string;
 chapterTitle: string;
 start: number;
 end: number;
 positionKind: 'doc' | 'text';
 text: string;
 context: string;
 before: string;
 after: string;
 isActiveChapter: boolean;
}

/**
 * 把正文 HTML 转成「带换行」的纯文本，供查找替换。
 */
function htmlToPlainWithBreaks(html: string): string {
 return String(html || '')
  .replace(/\r\n/g, '\n')
  .replace(/<\s*br\s*\/?\s*>/gi, '\n')
  .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote|section|article)\s*>/gi, '\n')
  .replace(/<\s*(p|div|h[1-6]|li|tr|blockquote|section|article)(\s[^>]*)?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&#160;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
}

function toParagraphHtml(content: string, chapterTitle: string): string {
 const lines = String(content || '')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.trimEnd());
 const title = String(chapterTitle || '').trim();
 let bodyLines = lines;
 if (title && bodyLines[0] && bodyLines[0].replace(/\s+/g, '') === title.replace(/\s+/g, '')) {
  bodyLines = bodyLines.slice(1);
 }
 const bodyHtml = bodyLines
  .map((line) => {
   const t = line.trim();
   if (!t) return '<p></p>';
   const escaped = t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
   return `<p>${escaped}</p>`;
  })
  .join('');
 return ensureChapterHeading(bodyHtml || '<p></p>', title || '第1章');
}

function extractParagraphContext(text: string, start: number): string {
 const source = String(text || '');
 if (!source) return '';
 let from = Math.max(0, start - 40);
 let to = Math.min(source.length, start + 60);
 const leftNl = source.lastIndexOf('\n', start);
 if (leftNl >= 0) from = leftNl + 1;
 const rightNl = source.indexOf('\n', start);
 if (rightNl >= 0) to = rightNl;
 let result = source.slice(from, to).trim();
 if (from > 0) result = '...' + result;
 if (to < source.length) result = result + '...';
 return result || source.slice(start, start + 10);
}

function extractMatchAnchors(text: string, start: number, end: number): { before: string; after: string } {
 return {
  before: text.slice(Math.max(0, start - 32), start),
  after: text.slice(end, Math.min(text.length, end + 32))
 };
}

function buildRegex(search: string, isRegex: boolean, matchCase: boolean): { globalRegex: RegExp; singleRegex: RegExp } {
 const flags = matchCase ? 'g' : 'gi';
 const singleFlags = matchCase ? '' : 'i';
 const pattern = isRegex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
 return {
  globalRegex: new RegExp(pattern, flags),
  singleRegex: new RegExp(pattern, singleFlags)
 };
}

// 在上下文片段中把匹配词用 <mark> 高亮，便于用户看清「定位到了哪个字」
function renderContextWithHighlight(context: string, search: string, isRegex: boolean, matchCase: boolean): ReactNode {
 const text = String(context || '');
 if (!text || !search.trim()) return text;
 try {
  const { globalRegex } = buildRegex(search, isRegex, matchCase);
  globalRegex.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let match = globalRegex.exec(text);
  while (match) {
   if (match[0].length === 0) {
    globalRegex.lastIndex += 1;
    if (globalRegex.lastIndex > text.length) break;
    match = globalRegex.exec(text);
    continue;
   }
   if (match.index > last) parts.push(text.slice(last, match.index));
   parts.push(<mark key={match.index} className="wz-search-highlight">{match[0]}</mark>);
   last = match.index + match[0].length;
   match = globalRegex.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return text;
  return parts;
 } catch {
  return text;
 }
}

function collectMatchesInEditor(
 editor: Editor | null,
 chapterId: string,
 chapterTitle: string,
 search: string,
 isRegex: boolean,
 matchCase: boolean
): MatchItem[] {
 if (!editor || !search.trim()) return [];
 const matches: MatchItem[] = [];
 try {
  const { globalRegex } = buildRegex(search, isRegex, matchCase);
  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n');
  globalRegex.lastIndex = 0;
  let match = globalRegex.exec(docText);
  while (match) {
   if (match[0].length === 0) {
    globalRegex.lastIndex += 1;
    if (globalRegex.lastIndex > docText.length) break;
    match = globalRegex.exec(docText);
    continue;
   }
    const start = match.index;
    const end = start + match[0].length;
    const anchors = extractMatchAnchors(docText, start, end);
   const from = getPosFromTextOffset(editor.state.doc, start);
   const to = getPosFromTextOffset(editor.state.doc, end);
   matches.push({
    id: `editor-${start}-${end}-${matches.length}`,
    chapterId,
    chapterTitle,
    start: from,
    end: to,
    positionKind: 'doc',
     text: match[0],
     context: extractParagraphContext(docText, start),
     before: anchors.before,
     after: anchors.after,
    isActiveChapter: true
   });
   match = globalRegex.exec(docText);
  }
 } catch {
  return [];
 }
 return matches;
}

function collectMatchesInPlainText(
 plainText: string,
 chapterId: string,
 chapterTitle: string,
 search: string,
 isRegex: boolean,
 matchCase: boolean
): MatchItem[] {
 if (!plainText || !search.trim()) return [];
 const matches: MatchItem[] = [];
 try {
  const { globalRegex } = buildRegex(search, isRegex, matchCase);
  globalRegex.lastIndex = 0;
  let match = globalRegex.exec(plainText);
  while (match) {
   if (match[0].length === 0) {
    globalRegex.lastIndex += 1;
    if (globalRegex.lastIndex > plainText.length) break;
    match = globalRegex.exec(plainText);
    continue;
   }
   const start = match.index;
   const end = start + match[0].length;
    const anchors = extractMatchAnchors(plainText, start, end);
   matches.push({
    id: `${chapterId}-${start}-${end}-${matches.length}`,
    chapterId,
    chapterTitle,
    start,
    end,
    positionKind: 'text',
    text: match[0],
    context: extractParagraphContext(plainText, start),
    before: anchors.before,
    after: anchors.after,
    isActiveChapter: false
   });
   match = globalRegex.exec(plainText);
  }
 } catch {
  return [];
 }
 return matches;
}

export function FindReplacePanel({ editor, book, chapterId: activeChapterId, onClose }: FindReplacePanelProps) {
 const setChapterContent = useBookStore((s) => s.setChapterContent);
 const openEditor = useAppStore((s) => s.openEditor);
 const setPendingSearchJump = useAppStore((s) => s.setPendingSearchJump);
 const setBookSearchResults = useAppStore((s) => s.setBookSearchResults);
 const bookSearchResults = useAppStore((s) => s.bookSearchResults);
 const [search, setSearch] = useState(() => bookSearchResults?.search || '');
 const [replace, setReplace] = useState('');
 const [isRegex, setIsRegex] = useState(false);
 const [matchCase, setMatchCase] = useState(false);
 const [fullMatch, setFullMatch] = useState(false);
 const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
 const [chapterMatches, setChapterMatches] = useState<MatchItem[]>([]);
 const [searchingBook, setSearchingBook] = useState(false);
 const [runningReplace, setRunningReplace] = useState(false);
 const [runToken, setRunToken] = useState(0);

 // 关闭查找面板时同时清掉全书搜索结果（左侧目录栏浮层跟随消失）
 const handleClose = () => {
  setBookSearchResults(null);
  setPendingSearchJump(null);
  onClose();
 };

 useEscapeKey(handleClose);

 // 全局 Ctrl+F 再次触发时关闭
 useEffect(() => {
  const handler = () => handleClose();
  window.addEventListener('writerzen:toggle-find-replace', handler);
  return () => window.removeEventListener('writerzen:toggle-find-replace', handler);
 }, [onClose]);

 // 卸载时清除高亮（全书结果由用户主动关闭时清，跨章跳转不清理，避免左侧浮层消失）
 useEffect(() => {
  return () => {
   applySearchHighlights(editor, '', { isRegex: false, matchCase: false });
  };
 }, [editor]);

 // 取章节自己的标题：误传书名会让正文首行标题被改写成书名，进而把章节名顶掉
 const titleOfChapter = (chapterId: string) => {
  const liveBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
  return liveBook.chapters.find((c) => c.id === chapterId)?.title || '';
 };

 // 默认本章搜索：输入变化即搜当前章
 const doChapterSearch = (nextSearch: string) => {
  const term = nextSearch.trim();
  const matches = term ? collectMatchesInEditor(editor, activeChapterId, titleOfChapter(activeChapterId), term, isRegex, matchCase) : [];
  setChapterMatches(matches);
  setActiveMatchId(matches[0]?.id ?? null);
  setRunToken((prev) => prev + 1);
 };

 useEffect(() => {
  if (search.trim()) doChapterSearch(search);
 }, [activeChapterId, editor]);

 const handleSearchChange = (value: string) => {
  setSearch(value);
  doChapterSearch(value);
 };

 useEffect(() => {
  applySearchHighlights(editor, search, { isRegex, matchCase });
 }, [editor, isRegex, matchCase, search]);

 useEffect(() => {
  setActiveMatchId(null);
 }, [search, isRegex, matchCase, activeChapterId]);

 const activeMatch = chapterMatches.find((item) => item.id === activeMatchId) || null;

 // 跳转（本章命中，编辑器中定位）
  const jumpToChapterMatch = (item: MatchItem) => {
   setPendingSearchJump({
    chapterId: item.chapterId,
    from: item.start,
    to: item.end,
    positionKind: item.positionKind,
    text: item.text,
    context: item.context,
    before: item.before,
    after: item.after
   });
   if (item.chapterId !== activeChapterId) {
    openEditor(book.id, item.chapterId);
   }
  };

 const replacePlainText = (plainText: string): string => {
  const { globalRegex, singleRegex } = buildRegex(search, isRegex, matchCase);
  if (!fullMatch) {
   globalRegex.lastIndex = 0;
   return plainText.replace(globalRegex, (raw) => (isRegex ? raw.replace(singleRegex, replace) : replace));
  }
  globalRegex.lastIndex = 0;
  let out = '';
  let last = 0;
  let match = globalRegex.exec(plainText);
  while (match) {
   if (match[0].length === 0) {
    globalRegex.lastIndex += 1;
    if (globalRegex.lastIndex > plainText.length) break;
    match = globalRegex.exec(plainText);
    continue;
   }
   const start = match.index;
   const end = start + match[0].length;
   const leftOk = start === 0 || /\s|[，。！？、,.!?;:()\[\]{}"'“”‘’<>《》【】]/.test(plainText[start - 1] || ' ');
   const rightOk = end >= plainText.length || /\s|[，。！？、,.!?;:()\[\]{}"'“”‘’<>《》【】]/.test(plainText[end] || ' ');
   if (leftOk && rightOk) {
    out += plainText.slice(last, start);
    out += isRegex ? match[0].replace(singleRegex, replace) : replace;
    last = end;
   }
   match = globalRegex.exec(plainText);
  }
  out += plainText.slice(last);
  return out;
 };

 // 标题一律按 targetChapterId 自查，不接受调用方传入：传错书名会把章节首行标题顶掉
 const applyChapterText = async (targetChapterId: string, text: string) => {
  const html = toParagraphHtml(text, titleOfChapter(targetChapterId));
  if (targetChapterId === activeChapterId && editor) {
   try {
    editor.chain().focus().setContent(html, false).run();
   } catch {
    try {
     editor.commands.setContent(html, false);
    } catch {
     editor.chain().focus().clearContent(false).insertContent(toSafeParagraphNodes(text)).run();
    }
   }
  }
  await setChapterContent(book.id, targetChapterId, html);
 };

  // 替换当前选中的那一处命中（只替换这一处，不触碰本章其它命中）
  const handleReplaceOne = async () => {
   if (!activeMatch || !search) return;
   setRunningReplace(true);
   try {
    // 用当前正则对命中原文做替换，得到新的文本
    const { singleRegex } = buildRegex(search, isRegex, matchCase);
    const rawText = String(activeMatch.text || '');
    const replacementText = isRegex ? rawText.replace(singleRegex, replace) : replace;

    if (activeMatch.positionKind === 'doc' && editor) {
     // 当前章：直接在编辑器内替换该范围，保留章节原有格式
     const from = Math.max(1, activeMatch.start);
     const to = Math.max(from + 1, activeMatch.end);
     if (from < to && editor.state.doc.content.size >= to) {
      editor.chain().focus().deleteRange({ from, to }).insertContent(replacementText).run();
     }
    } else {
     // 非当前章：仅替换该章文本中「这一处」命中
     const ch = book.chapters.find((c) => c.id === activeMatch.chapterId);
     if (!ch) return;
     const current = htmlToPlainWithBreaks(ch?.content || '');
     const start = activeMatch.start;
     const end = activeMatch.end;
     if (start >= 0 && end <= current.length && end > start) {
      const replaced = current.slice(0, start) + replacementText + current.slice(end);
      if (replaced !== current) {
       await applyChapterText(activeMatch.chapterId, replaced);
      }
     }
    }
    doChapterSearch(search);
   } finally {
    setRunningReplace(false);
   }
  };

 // 替换本章所有命中
 const handleReplaceChapter = async () => {
  if (!editor || !search) return;
  setRunningReplace(true);
  try {
   const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n');
   const replaced = replacePlainText(docText);
   if (replaced !== docText) {
    await applyChapterText(activeChapterId, replaced);
   }
   doChapterSearch(search);
  } finally {
   setRunningReplace(false);
  }
 };

 // 替换全书所有命中
 const handleReplaceAll = async () => {
  if (!search) return;
  setRunningReplace(true);
  try {
   await useBookStore.getState().ensureBookContentLoaded(book.id);
   const liveBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
   for (const chapter of liveBook.chapters) {
    const current =
     chapter.id === activeChapterId && editor
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
      : htmlToPlainWithBreaks(chapter.content || '');
    if (!current.trim()) continue;
    const replaced = replacePlainText(current);
    if (replaced === current) continue;
    await applyChapterText(chapter.id, replaced);
   }
   doChapterSearch(search);
   refreshBookResults(search);
  } finally {
   setRunningReplace(false);
  }
 };

 // 全书搜索：产出到 store，目录栏浮层展示
 const handleSearchBook = async () => {
  const term = search.trim();
  if (!term) return;
  setSearchingBook(true);
  try {
   await useBookStore.getState().ensureBookContentLoaded(book.id);
   const liveBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
   const items: NonNullable<ReturnType<typeof useAppStore.getState>['bookSearchResults']>['items'] = [];
   for (const chapter of liveBook.chapters) {
    const plain =
     chapter.id === activeChapterId && editor
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
      : htmlToPlainWithBreaks(chapter.content || '');
    if (!plain) continue;
    const matches = collectMatchesInPlainText(plain, chapter.id, chapter.title, term, isRegex, matchCase);
    for (const m of matches) {
     items.push({
      chapterId: m.chapterId,
      chapterTitle: m.chapterTitle,
      from: m.start,
      to: m.end,
      positionKind: m.positionKind,
      text: m.text,
       context: m.context,
       before: m.before,
       after: m.after
     });
    }
   }
   setBookSearchResults({ search: term, items });
  } finally {
   setSearchingBook(false);
  }
 };

 const refreshBookResults = (term: string) => {
  void (async () => {
   await useBookStore.getState().ensureBookContentLoaded(book.id);
   const liveBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
   const items: NonNullable<ReturnType<typeof useAppStore.getState>['bookSearchResults']>['items'] = [];
   for (const chapter of liveBook.chapters) {
    const plain =
     chapter.id === activeChapterId && editor
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n')
      : htmlToPlainWithBreaks(chapter.content || '');
    if (!plain) continue;
    for (const m of collectMatchesInPlainText(plain, chapter.id, chapter.title, term, isRegex, matchCase)) {
     items.push({
      chapterId: m.chapterId,
      chapterTitle: m.chapterTitle,
      from: m.start,
      to: m.end,
      positionKind: m.positionKind,
      text: m.text,
       context: m.context,
       before: m.before,
       after: m.after
     });
    }
   }
   setBookSearchResults({ search: term, items });
  })();
 };

  return createPortal(
   <div className="fixed right-4 top-14 z-[10000] w-[440px] max-w-[92vw] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-secondary)_92%,var(--modal-bg-mix,rgba(10,12,18,0.95)))] shadow-2xl">
   <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
    <span className="text-[13px] font-bold text-[var(--text-primary)]">查找 / 替换</span>
     <button onClick={handleClose} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]">
     <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
   </div>

   <div className="space-y-2 p-4">
    <div className="flex overflow-hidden border border-[var(--border-color)] rounded-md bg-[var(--bg-primary)]/40 focus-within:border-[var(--accent)]">
     <input
      type="text"
      data-find-input
      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/50"
      placeholder="查找（当前章）…"
      value={search}
      onChange={(e) => handleSearchChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
      autoFocus
     />
     <button
      type="button"
      onClick={() => void handleSearchBook()}
      disabled={searchingBook}
      className="shrink-0 border-l border-[var(--border-color)] bg-[var(--surface-strong)] px-3 text-[11px] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface)] disabled:opacity-50"
     >
      {searchingBook ? '搜索中…' : '搜索全书'}
     </button>
    </div>
    <div className="flex overflow-hidden border border-[var(--border-color)] rounded-md bg-[var(--bg-primary)]/40 focus-within:border-[var(--accent)]">
     <input
      type="text"
      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/50"
      placeholder="替换为…"
      value={replace}
      onChange={(e) => setReplace(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
     />
    </div>

    <div className="flex items-center gap-1.5">
     {[
      { label: '正则', val: isRegex, set: setIsRegex },
      { label: '大小写', val: matchCase, set: setMatchCase },
      { label: '全词', val: fullMatch, set: setFullMatch }
     ].map((opt) => (
      <button
       key={opt.label}
       onClick={() => opt.set(!opt.val)}
       className={clsx(
        "rounded border px-2.5 py-1 text-[11px] font-bold transition-all",
        opt.val ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:border-[var(--text-muted)]"
       )}
      >{opt.label}</button>
     ))}
     <span className="ml-auto text-[11px] text-[var(--text-muted)]">{chapterMatches.length} 处命中</span>
    </div>

    <div className="flex items-center gap-2 pt-1">
     <button onClick={() => void handleReplaceOne()} disabled={runningReplace || !activeMatch || !search} className="flex-1 rounded bg-[var(--accent)] px-2 py-1.5 text-[12px] font-bold text-white hover:brightness-110 disabled:opacity-40">替换</button>
     <button onClick={() => void handleReplaceChapter()} disabled={runningReplace || !search} className="flex-1 rounded border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1.5 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--surface)] disabled:opacity-40">本章替换</button>
     <button onClick={() => void handleReplaceAll()} disabled={runningReplace || !search} className="flex-1 rounded border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1.5 text-[12px] font-bold text-[var(--text-primary)] hover:bg-[var(--surface)] disabled:opacity-40">全书替换</button>
    </div>
   </div>

   {chapterMatches.length > 0 && (
    <div className="max-h-48 overflow-y-auto border-t border-[var(--border-color)] custom-scrollbar">
     {chapterMatches.map((item) => (
      <button
       key={item.id}
       onClick={() => { setActiveMatchId(item.id); jumpToChapterMatch(item); }}
       className={clsx(
        "block w-full px-4 py-2 text-left text-[12px] leading-relaxed transition-all",
        activeMatchId === item.id ? "bg-[var(--accent)]/10 text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface)]"
       )}
      >
       <span className="line-clamp-1">{renderContextWithHighlight(item.context, search, isRegex, matchCase)}</span>
      </button>
     ))}
    </div>
   )}
  </div>,
  document.body
 );
}
