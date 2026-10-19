// 模块说明：编辑器顶部章节 Tab 栏（IDE 写作工作台外观）。
// 关键职责：
//  1) 章节级标签：同一本书的不同章节各占一个标签，支持切换 / 关闭 / 分屏
//  2) 固定"写梨眼"书架标签，在编辑器内点击可回书架
//  3) 保存态脏点：项目当前只有全局保存状态（Editor.tsx 广播 xly:save-state-change），
//     没有按章节的脏标记，因此脏点只标注"当前激活章节"，不为非活动标签伪造状态。
// 维护边界：
//  - 标签模型在 useAppStore 中，标签 id 由 makeEditorTabId(bookId, chapterId) 生成。
//  - 所有选章入口（侧边栏点击、新建章节、删除后跳转）都走 openEditor，无需在此重复处理。
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../store/useAppStore';
import type { Book } from '../../types';
import { IdeSvgClose, IdeSvgPlus } from '../common/IdeSvg';

interface EditorBookTabsProps {
 books: Book[];
}

type SaveState = 'saving' | 'saved' | 'failed';
type Chapter = Book['chapters'][number];

export function EditorBookTabs({ books }: EditorBookTabsProps) {
 const tabs = useAppStore((s) => s.editorTabs);
 const activeTabId = useAppStore((s) => s.activeEditorTabId);
 const activateEditorTab = useAppStore((s) => s.activateEditorTab);
 const closeEditorTab = useAppStore((s) => s.closeEditorTab);

 // 全局保存状态：仅用于给当前激活章节标注脏点
 const [saveState, setSaveState] = useState<SaveState>('saved');
 useEffect(() => {
  const handler = (e: Event) => {
   const detail = (e as CustomEvent)?.detail;
   if (detail?.saveState) setSaveState(detail.saveState as SaveState);
  };
  window.addEventListener('xly:save-state-change', handler);
  return () => window.removeEventListener('xly:save-state-change', handler);
 }, []);

 const visibleTabs = tabs.flatMap((tab) => {
   const book = books.find((item) => item.id === tab.bookId);
   if (!book) return [];
   const chapter = tab.chapterId ? book.chapters.find((item) => item.id === tab.chapterId) : undefined;
   return [{ tab, book, chapter }];
  });

 // 仅当同时打开了多本书时才在标签上加书名前缀，避免单书场景下标签冗长
 const multiBook = new Set(visibleTabs.map((item) => item.book.id)).size > 1;

 return (
  <div
   className="wz-editor-book-tabs flex flex-1 min-w-0 items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
   style={{ WebkitAppRegion: 'no-drag' } as any}
  >
   {visibleTabs.map(({ tab, book, chapter }) => {
    const active = tab.id === activeTabId;
    const label = chapter?.title?.trim() || (tab.chapterId ? '未命名章节' : book.title);
    const fullLabel = multiBook ? `${book.title} · ${label}` : label;
    // 脏点只对当前激活标签生效：保存中=琥珀，失败=红色，已保存则不显示
    const showDirty = active && saveState !== 'saved';

    return (
     <div
      key={tab.id}
      className={clsx('wz-ide-etab shrink-0', active && 'is-active')}
      title={`${book.title} · ${label}`}
      onClick={() => activateEditorTab(tab.id)}
      onAuxClick={(event) => {
       // 鼠标中键关闭，与主流编辑器一致
       if (event.button === 1) {
        event.preventDefault();
        closeEditorTab(tab.id);
       }
      }}
     >
      {showDirty ? (
       <span
        className="wz-ide-etab-dirty"
        style={saveState === 'failed' ? { background: 'var(--ide-red)' } : undefined}
        title={saveState === 'failed' ? '保存失败' : '保存中…'}
       />
      ) : null}

      <span className="min-w-0 max-w-[190px] truncate">{fullLabel}</span>

      <span
       className="wz-ide-etab-x"
       role="button"
       title="关闭"
       onClick={(event) => {
        event.stopPropagation();
        closeEditorTab(tab.id);
       }}
      >
       <IdeSvgClose size={11} />
      </span>
     </div>
    );
   })}
   <button type="button" className="wz-ide-etab-add" title="打开章节" onClick={() => window.dispatchEvent(new CustomEvent('writerzen:focus-chapter-search'))}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
   </button>
  </div>
 );
}
