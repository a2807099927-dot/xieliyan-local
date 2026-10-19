// 导出范围选择弹窗：全本 / 最近 N 章 / 自定义勾选。
// 只负责确定范围，保存对话框与导出执行仍留在调用方，保证提示与失败处理一致。
import { useMemo, useState } from 'react';
import type { Book, Chapter } from '../../types';
import { useBackdropClose } from '../../hooks/useBackdropClose';

export type ExportPreset = 'all' | 'recent50' | 'recent100' | 'custom';

export interface ExportRange {
  /** null 表示全本，不传过滤 */
  chapterIds: string[] | null;
  /** 用于文件名与提示语，如「最近50章」 */
  label: string;
}

interface Props {
  book: Book;
  /** 弹窗标题，如「导出 TXT」 */
  title: string;
  onClose: () => void;
  onConfirm: (range: ExportRange) => void;
}

const PRESETS: Array<{ key: ExportPreset; label: string }> = [
  { key: 'all', label: '全本' },
  { key: 'recent50', label: '最近 50 章' },
  { key: 'recent100', label: '最近 100 章' },
  { key: 'custom', label: '自定义' },
];

export function ExportRangeModal({ book, title, onClose, onConfirm }: Props) {
  const chapters = useMemo<Chapter[]>(() => (Array.isArray(book.chapters) ? book.chapters : []), [book.chapters]);
  const miscIds = useMemo(() => new Set(book.miscChapterIds || []), [book.miscChapterIds]);
  const [preset, setPreset] = useState<ExportPreset>('all');
  const [customIds, setCustomIds] = useState<Set<string>>(() => new Set());
  const [keyword, setKeyword] = useState('');

  const selectedIds = useMemo(() => {
    if (preset === 'all') return chapters.map((item) => item.id);
    if (preset === 'recent50' || preset === 'recent100') {
      const count = preset === 'recent50' ? 50 : 100;
      return chapters.slice(Math.max(0, chapters.length - count)).map((item) => item.id);
    }
    // 自定义按目录顺序输出，不跟随勾选先后
    return chapters.filter((item) => customIds.has(item.id)).map((item) => item.id);
  }, [preset, customIds, chapters]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const totalWords = useMemo(
    () => chapters.filter((item) => selectedSet.has(item.id)).reduce((sum, item) => sum + Number(item.wordCount || 0), 0),
    [chapters, selectedSet]
  );

  const label =
    preset === 'all' ? '全本' : preset === 'recent50' ? '最近50章' : preset === 'recent100' ? '最近100章' : `自定义${selectedIds.length}章`;

  const filtered = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    return key ? chapters.filter((item) => String(item.title || '').toLowerCase().includes(key)) : chapters;
  }, [chapters, keyword]);

  const mainRows = useMemo(() => filtered.filter((item) => !miscIds.has(item.id)), [filtered, miscIds]);
  const miscRows = useMemo(() => filtered.filter((item) => miscIds.has(item.id)), [filtered, miscIds]);

  const toggleCustom = (chapterId: string) =>
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });

  const backdropProps = useBackdropClose(onClose);

  const renderRow = (item: Chapter) => {
    const checked = selectedSet.has(item.id);
    return (
      <button
        key={item.id}
        className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors ${checked ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-tertiary)]'}`}
        onClick={() => {
          if (preset !== 'custom') {
            setPreset('custom');
            setCustomIds(new Set(selectedIds));
          }
          toggleCustom(item.id);
        }}
      >
        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${checked ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border-color)] text-transparent'}`}>
          {checked && <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor"><rect x="4" y="4" width="16" height="16" /></svg>}
        </span>
        <span className={`min-w-0 flex-1 truncate text-[13px] ${checked ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{item.title || '未命名'}</span>
        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{Number(item.wordCount || 0).toLocaleString('zh-CN')}字</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/50" {...backdropProps}>
      <div className="flex max-h-[80vh] w-[720px] flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.75)]" onClick={(event) => event.stopPropagation()}>
        <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
          <div className="text-[15px] font-bold text-[var(--text-primary)]">{title}</div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">《{book.title}》共 {chapters.length} 章 · 约 {totalWords.toLocaleString('zh-CN')} 字</div>
        </div>

        <div className="shrink-0 grid grid-cols-4 gap-2 border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-6 py-3">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              className={`h-9 border text-[13px] font-semibold transition-colors ${preset === item.key ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-primary)]' : 'border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              onClick={() => {
                if (item.key === 'custom' && preset !== 'custom') setCustomIds(new Set(selectedIds));
                setPreset(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === 'custom' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-stretch border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索章节名..." className="flex-1 bg-transparent px-5 py-2 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]" />
              <button className="border-l border-[var(--border-color)] px-4 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" onClick={() => setCustomIds(new Set(chapters.map((item) => item.id)))}>全选</button>
              <button className="border-l border-[var(--border-color)] px-4 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" onClick={() => setCustomIds(new Set())}>清空</button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">没有匹配章节</div>
              ) : (
                <>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">正文章节 · {mainRows.length}</div>
                  {mainRows.map(renderRow)}
                  {miscRows.length > 0 ? (
                    <>
                      <div className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]/70">作品相关 · {miscRows.length}</div>
                      {miscRows.map(renderRow)}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[150px] flex-1 items-center justify-center px-8 py-6 text-center text-sm text-[var(--text-muted)]">
            将导出{preset === 'all' ? '整本书' : `最后 ${selectedIds.length} 章`}，共 {totalWords.toLocaleString('zh-CN')} 字。需要挑特定章节就选「自定义」。
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-6 py-4">
          <div className="text-xs text-[var(--text-secondary)]">
            已选 <span className="font-mono font-bold text-[var(--text-primary)]">{selectedIds.length.toLocaleString('zh-CN')}</span> 章 · 约 {totalWords.toLocaleString('zh-CN')} 字
          </div>
          <div className="flex gap-3">
            <button className="border border-[var(--border-color)] bg-[var(--surface-strong)] px-5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]" onClick={onClose}>取消</button>
            <button
              className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-6 py-2 text-sm font-bold text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedIds.length === 0}
              onClick={() => onConfirm({ chapterIds: preset === 'all' ? null : selectedIds, label })}
            >
              下一步
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
