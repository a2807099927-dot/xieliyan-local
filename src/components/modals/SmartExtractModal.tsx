import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { electronAPI } from '../../utils/electron';
import { flushBookMetaPatches, useBookStore } from '../../store/useBookStore';
import { applyExtractedRoleCandidatesToCategories } from '../../utils/roleMutationEngine';
import { useAppStore } from '../../store/useAppStore';
import { useIslandStore } from '../../store/useIslandStore';
import { useExtractStore } from '../../store/useExtractStore';
import { useBackdropClose } from '../../hooks/useBackdropClose';
import type { RoleProfile } from '../../types';

const ROLE_TYPE_OPTIONS: Array<RoleProfile['roleType']> = ['主角', '女主', '配角', '反派', 'NPC', '龙套', '势力', '待分类'];

interface SmartExtractModalProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  chapterCount: number;
  novelType: string;
  onSaved: () => void;
}

function parseChapterNumber(title: string): number | null {
  const match = title.match(/第\s*(\d+)\s*章/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const genericMatch = title.match(/(\d+)/);
  if (genericMatch) {
    return parseInt(genericMatch[1], 10);
  }
  return null;
}

export function SmartExtractModal({ open, onClose, bookId, chapterCount, novelType, onSaved }: SmartExtractModalProps) {
  const activeChapterId = useAppStore(s => s.activeChapterId);
  const books = useBookStore((s) => s.books);
  const currentBook = books.find(b => b.id === bookId);
  const chapters = currentBook?.chapters || [];

  // 灵动岛（仅用于保存环节的反馈）
  const islandShow = useIslandStore((s) => s.show);

  // 仅与 UI 展示相关、无需跨弹窗持久的本地状态
  const [tab, setTab] = useState<'outline' | 'roles'>('roles');
  const [roleTab, setRoleTab] = useState<'chapter' | 'bio'>('chapter');

  // 所有“提取运行状态 + 结果”均来自全局 store，从而支持后台持续运行、结果持久化、自动弹回。
  const storeOpen = useExtractStore(s => s.open);
  const status = useExtractStore(s => s.status);
  const extractedRoles = useExtractStore(s => s.extractedRoles);
  const selectedIndices = useExtractStore(s => s.selectedIndices);
  const saving = useExtractStore(s => s.saving);
  const startChapter = useExtractStore(s => s.startChapter);
  const endChapter = useExtractStore(s => s.endChapter);
  const openModal = useExtractStore(s => s.openModal);
  const closeModal = useExtractStore(s => s.closeModal);
  const setConfig = useExtractStore(s => s.setConfig);
  const toggleIndex = useExtractStore(s => s.toggleIndex);
  const selectAll = useExtractStore(s => s.selectAll);
  const setSaving = useExtractStore(s => s.setSaving);
  const clearResults = useExtractStore(s => s.clearResults);
  const updateRoleType = useExtractStore(s => s.updateRoleType);
  const lastExtracted = useExtractStore(s => s.lastExtracted);
  const setLastExtracted = useExtractStore(s => s.setLastExtracted);
  const runExtract = useExtractStore(s => s.runExtract);

  const extracting = status === 'extracting';
  const selectedCount = selectedIndices.length;

  const findChapterIndexByNum = (num: number): number => {
    const idx = chapters.findIndex(c => parseChapterNumber(c.title) === num);
    if (idx !== -1) {
      return idx + 1; // 1-based index
    }
    return Math.max(1, Math.min(num, chapters.length));
  };

  const maxChapterNum = React.useMemo(() => {
    let maxNum = chapters.length;
    for (const c of chapters) {
      const num = parseChapterNumber(c.title);
      if (num !== null && num > maxNum) {
        maxNum = num;
      }
    }
    return maxNum;
  }, [chapters]);

  const computeDefaultStart = (): number => {
    if (chapters.length === 0) return 1;
    const activeIndex = activeChapterId ? chapters.findIndex(c => c.id === activeChapterId) : -1;
    const activeChapterSeq = activeIndex !== -1 ? activeIndex + 1 : 1;
    const titleNum = activeIndex !== -1 ? parseChapterNumber(chapters[activeIndex].title) : null;
    return titleNum !== null ? titleNum : activeChapterSeq;
  };

  // 将父组件的 open 上升沿桥接到全局 store（无需修改 RolesPanel）。
  const prevOpenProp = useRef(false);
  useEffect(() => {
    if (open && !prevOpenProp.current) {
      const st = useExtractStore.getState();
      // 若正在提取或已有本书结果，保留现有状态，仅同步 book/novelType；
      // 否则初始化默认章节范围。
      const sameBookRunningOrResult =
        (st.status === 'extracting' || st.hasResult) && st.bookId === bookId;
      if (sameBookRunningOrResult) {
        setConfig({ bookId, novelType });
      } else {
        const defaultStart = computeDefaultStart();
        clearResults();
        setConfig({ bookId, novelType, startChapter: defaultStart, endChapter: defaultStart });
      }

      const saved = localStorage.getItem(`extract_progress_${bookId}`);
      if (saved) {
        setLastExtracted(Number(saved));
      } else {
        setLastExtracted(null);
      }

      openModal();
    }
    prevOpenProp.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const backdropProps = useBackdropClose(() => handleClose());

  const handleClose = () => {
    // 仅隐藏窗口；如果此时正在提取，任务依然在后台继续，完成后会自动弹回。
    closeModal();
    onClose();
  };

  if (!storeOpen) return null;

  const handleExtract = async () => {
    if (extracting) return;
    const resolvedStart = findChapterIndexByNum(startChapter);
    const resolvedEnd = findChapterIndexByNum(endChapter);
    // 异步提取逻辑由全局 store 持有，即使本组件卸载也不会中断。
    await runExtract({
      bookId,
      startChapter,
      endChapter,
      resolvedStart,
      resolvedEnd,
      novelType,
    });
  };

  const handleSave = async () => {
    if (selectedCount === 0 || saving) return;
    setSaving(true);

    const resolvedStart = findChapterIndexByNum(startChapter);
    const resolvedEnd = findChapterIndexByNum(endChapter);

    try {
      const selectedSet = new Set(selectedIndices);
      const payloadToSave = extractedRoles.filter((_, i) => selectedSet.has(i));
      const current = useBookStore.getState().books.find((item) => item.id === bookId);
      if (!current) throw new Error('未找到当前作品');
      const categories = applyExtractedRoleCandidatesToCategories(current.resourceIndex?.customCharacterCategories, payloadToSave);
      await useBookStore.getState().updateBook(bookId, {
        resourceIndex: {
          ...(current.resourceIndex || {}),
          customCharacterCategories: categories,
          schemaVersion: current.resourceIndex?.schemaVersion || 1,
        },
      });
      await flushBookMetaPatches();
      islandShow({ type: 'success', message: `已成功保存 ${payloadToSave.length} 个角色`, autoHideMs: 2000 });
      clearResults();
      closeModal();
      onSaved();
      onClose();
    } catch (e: any) {
      islandShow({ type: 'error', message: e.message || '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const allSelected = selectedCount === extractedRoles.length && extractedRoles.length > 0;

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4" {...backdropProps}>
      <div 
        className="flex w-[860px] h-[600px] max-w-[95vw] flex-col overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-2xl"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-[var(--text-primary)]">智能提取</span>
            {extracting && (
              <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                后台提取中
              </span>
            )}
          </div>
          <button onClick={handleClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Config */}
          <div className="flex w-[320px] shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--surface)]">
            <div className="flex border-b border-[var(--border-color)]">
              <button 
                onClick={() => setTab('outline')}
                className={clsx("flex-1 py-2.5 text-sm font-medium", tab === 'outline' ? "border-b-2 border-indigo-400 text-indigo-400" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]")}
              >
                章纲
              </button>
              <button 
                onClick={() => setTab('roles')}
                className={clsx("flex-1 py-2.5 text-sm font-medium", tab === 'roles' ? "border-b-2 border-indigo-400 text-indigo-400" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]")}
              >
                角色
              </button>
            </div>

            {tab === 'roles' && (
              <div className="flex flex-col p-4 flex-1">
                <div className="flex gap-2 rounded bg-[var(--bg-primary)] p-1">
                  <button 
                    onClick={() => setRoleTab('chapter')}
                    className={clsx("flex-1 rounded py-1 text-xs transition-colors", roleTab === 'chapter' ? "bg-[var(--surface-strong)] text-[var(--text-primary)] shadow" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                  >
                    本章角色
                  </button>
                  <button 
                    onClick={() => setRoleTab('bio')}
                    className={clsx("flex-1 rounded py-1 text-xs transition-colors", roleTab === 'bio' ? "bg-[var(--surface-strong)] text-[var(--text-primary)] shadow" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
                  >
                    角色小传
                  </button>
                </div>

                <div className="mt-6 flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">起始章</span>
                    <input 
                      type="number" 
                      min={1} 
                      max={maxChapterNum}
                      value={startChapter}
                      onChange={e => setConfig({ startChapter: Number(e.target.value) })}
                      className="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-[var(--text-secondary)]">结束章</span>
                    <input 
                      type="number" 
                      min={1} 
                      max={maxChapterNum}
                      value={endChapter}
                      onChange={e => setConfig({ endChapter: Number(e.target.value) })}
                      className="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
                    />
                  </label>

                  {lastExtracted !== null && (
                    <div className="mt-2 text-xs text-[var(--text-secondary)] bg-[var(--surface-strong)] p-2.5 rounded-md flex flex-col gap-1.5 border border-indigo-500/20">
                      <span className="font-medium text-[var(--text-primary)]">上次提取进度：第 {lastExtracted} 章</span>
                      {lastExtracted < maxChapterNum ? (
                        <button 
                          className="text-left text-indigo-400 hover:text-indigo-300 hover:underline transition-colors outline-none"
                          onClick={() => {
                            setConfig({ startChapter: lastExtracted + 1, endChapter: maxChapterNum });
                          }}
                        >
                          接着提取后续章节 ({lastExtracted + 1} - {maxChapterNum})
                        </button>
                      ) : (
                        <span className="text-emerald-500/90">已提取至最新章节</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-6">
                  <button 
                    onClick={handleExtract}
                    disabled={extracting}
                    className="w-full rounded bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {extracting ? '提取中...' : '开始提取'}
                  </button>
                  {extracting && (
                    <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
                      可关闭本窗口，提取将在后台继续，完成后自动弹回。
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {tab === 'outline' && (
              <div className="flex flex-1 items-center justify-center p-4 text-sm text-[var(--text-muted)]">
                章纲提取功能开发中
              </div>
            )}
          </div>

          {/* Right Panel - Results */}
          <div className="flex flex-1 flex-col bg-[var(--bg-primary)] relative">
            <div className="border-b border-[var(--border-color)] px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">提取结果 ({extractedRoles.length})</span>
              {extractedRoles.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input 
                    type="checkbox" 
                    checked={allSelected}
                    onChange={(e) => selectAll(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  全选
                </label>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {extractedRoles.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  {extracting ? 'AI 思考中，请稍候...' : '点击左侧按钮开始提取角色'}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {extractedRoles.map((role, idx) => {
                    const checked = selectedIndices.includes(idx);
                    return (
                    <div 
                      key={idx} 
                      className={clsx(
                        "flex items-start gap-3 rounded-md border p-3 transition-colors",
                        checked 
                          ? "border-indigo-500/50 bg-indigo-500/5" 
                          : "border-[var(--border-color)] bg-[var(--surface)] hover:border-[var(--border-color-hover)]"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        className="mt-1 accent-indigo-500 cursor-pointer"
                        checked={checked}
                        onChange={(e) => toggleIndex(idx, e.target.checked)}
                      />
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">{role.name}</span>
                          <select
                            value={(role.roleType || '配角') as RoleProfile['roleType']}
                            onChange={(event) => updateRoleType(idx, event.target.value as RoleProfile['roleType'])}
                            className="h-6 rounded border border-[var(--border-color)] bg-[var(--surface-strong)] px-1.5 text-[10px] font-medium text-[var(--text-primary)] outline-none transition-colors hover:border-indigo-400/60 focus:border-indigo-400 cursor-pointer"
                            aria-label={`调整${role.name}的角色标签`}
                          >
                            {ROLE_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          {role.faction && (
                            <span className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                              {role.faction}
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <div className="text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2" title={role.description}>
                            {role.description}
                          </div>
                        )}
                        {(role.profession || role.recentStatus || role.firstAppearance) && (
                          <div className="text-[11px] text-[var(--text-muted)] line-clamp-2">
                            {[
                              role.profession ? `职业:${role.profession}` : '',
                              role.recentStatus && role.recentStatus !== '无' ? `近况:${role.recentStatus}` : '',
                              role.firstAppearance ? `首现:${role.firstAppearance}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                        {(() => {
                          // AI 输出字段是 skills；入库后才是 abilities。预览两种都认。
                          const skills: string[] = Array.isArray(role.skills)
                            ? role.skills
                            : Array.isArray(role.abilities)
                              ? role.abilities
                              : [];
                          const equipment: string[] = Array.isArray(role.equipment) ? role.equipment : [];
                          const aliases: string[] = Array.isArray(role.aliases) ? role.aliases : [];
                          const items: string[] = Array.isArray(role.items) ? role.items : [];
                          // skillDetails: { 技能名: 效果摘要 }，供悬浮查看
                          const skillDetails: Record<string, string> =
                            role.skillDetails && typeof role.skillDetails === 'object' && !Array.isArray(role.skillDetails)
                              ? role.skillDetails
                              : {};
                          if (!aliases.length && !skills.length && !equipment.length && !items.length) return null;
                          return (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {aliases.slice(0, 3).map((a: string, i: number) => (
                                <span key={`a${i}`} className="text-[10px] text-[var(--text-muted)] border border-[var(--border-color)] rounded-sm px-1">别名:{a}</span>
                              ))}
                              {skills.slice(0, 4).map((a: string, i: number) => {
                                const detail = skillDetails[a] || '';
                                return (
                                  <span
                                    key={`s${i}`}
                                    className="text-[10px] text-amber-500/70 border border-amber-500/20 rounded-sm px-1 cursor-help"
                                    title={detail || '（未提取到效果说明）'}
                                  >
                                    技能:{a}
                                  </span>
                                );
                              })}
                              {equipment.slice(0, 3).map((a: string, i: number) => (
                                <span key={`e${i}`} className="text-[10px] text-cyan-500/70 border border-cyan-500/20 rounded-sm px-1">装备:{a}</span>
                              ))}
                              {items.slice(0, 2).map((a: string, i: number) => (
                                <span key={`i${i}`} className="text-[10px] text-emerald-500/70 border border-emerald-500/20 rounded-sm px-1">道具:{a}</span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border-color)] bg-[var(--surface)] px-4 py-3 flex items-center justify-end gap-3">
              <span className="text-xs text-[var(--text-muted)]">
                已选 {selectedCount} 项，保存后将自动进入角色栏
              </span>
              <button 
                onClick={handleSave}
                disabled={selectedCount === 0 || saving || extracting}
                className="rounded bg-emerald-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? '保存中...' : '确认入库'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
