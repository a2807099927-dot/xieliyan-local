// 模块说明：角色卡片视图组件。
// 关键职责：展示角色信息（含装备/技能/关系），支持编辑触发。
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import type { RoleRelationshipEvent } from '../../../../types';
import { useEquipmentClipboard, type ClipboardKind } from '../../../../store/useEquipmentClipboard';
import { useBookStore } from '../../../../store/useBookStore';
import { useAppStore } from '../../../../store/useAppStore';
import { useIslandStore } from '../../../../store/useIslandStore';
import { promptDialog } from '../../../../store/usePromptDialogStore';
import {
 buildEquipmentSlots,
 categoryFromRole,
 cleanRoleText,
 inferProfession,
 mergeRelationshipTimeline,
 normalizeEquipmentName,
 normalizeSkillDetailMap,
 normalizeSkillList,
 parseDetailMap,
 parseList,
 pickDetailByName,
 toMeta,
 normalizeSkillName,
 type EditMode,
 type RoleDraft,
 type RoleView,
 type RoleWithCategory
} from '../rolePanelLogic';

/** 编辑器内技能/其他词条的悬浮气泡：portal 到 body，避免被 overflow 裁切 */
function EditorDetailBubble({
  name,
  detail,
  children,
}: {
  name: string;
  detail?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const [arrowBelow, setArrowBelow] = useState(false); // 气泡在目标下方时箭头朝上

  const refreshPlacement = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipW = Math.min(300, window.innerWidth - 24);
    const tipH = tipRef.current?.offsetHeight || 96;
    const gap = 10;
    const pad = 12;

    // 水平：与词条左对齐，贴边时收进视口
    let left = rect.left;
    left = Math.min(Math.max(pad, left), window.innerWidth - tipW - pad);

    // 垂直：优先上方；上方不够则下方
    let top = rect.top - gap;
    let transform = 'translateY(-100%)';
    let below = false;
    if (rect.top < tipH + pad + gap) {
      top = rect.bottom + gap;
      transform = 'none';
      below = true;
    }
    // 下方仍可能溢出：再夹到视口内
    if (below) {
      const maxTop = window.innerHeight - tipH - pad;
      if (top > maxTop) top = Math.max(pad, maxTop);
    } else {
      // 用 transform 上移后的视觉 top 约等于 top - tipH
      if (top - tipH < pad) {
        top = rect.bottom + gap;
        transform = 'none';
        below = true;
      }
    }

    // 箭头相对锚点的水平偏移（相对气泡左缘）
    const arrowLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - left - 6), tipW - 28);

    setArrowBelow(below);
    setStyle({
      left,
      top,
      transform,
      width: tipW,
      // CSS 变量给箭头用
      ['--arrow-left' as string]: `${arrowLeft}px`,
    });
  };

  const openTip = () => {
    refreshPlacement();
    setOpen(true);
    // 打开后再量一次真实高度，修正贴边
    requestAnimationFrame(() => refreshPlacement());
  };

  if (!detail?.trim()) {
    return <div ref={rootRef}>{children}</div>;
  }

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onMouseEnter={openTip}
      onMouseMove={refreshPlacement}
      onMouseLeave={() => setOpen(false)}
      onFocus={openTip}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tipRef}
              role="tooltip"
              className="pointer-events-none fixed z-[2147483647] rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] px-3.5 py-2.5 shadow-2xl ring-1 ring-black/10"
              style={style}
            >
              <div className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">{name}</div>
              <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words text-[var(--text-primary)]">
                {detail}
              </div>
              {/* 小三角指向词条 */}
              <div
                className={clsx(
                  'absolute h-2.5 w-2.5 rotate-45 border-[var(--border-color)] bg-[var(--surface-strong)]',
                  arrowBelow
                    ? '-top-1.5 border-l border-t'
                    : '-bottom-1.5 border-r border-b'
                )}
                style={{ left: 'var(--arrow-left)' }}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function HoverStat({ label, name, note, onCut, onPaste, canPaste, slotKind }: { label?: string; name: string; note?: string; onCut?: () => void; onPaste?: () => void; canPaste?: boolean; slotKind?: 'equipment' | 'skill' }) {
 const meta = toMeta(name, note || '');
 const rootRef = useRef<HTMLDivElement | null>(null);
 const tipRef = useRef<HTMLDivElement | null>(null);
 const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
 const [tooltipOpen, setTooltipOpen] = useState(false);
 const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

 const refreshPlacement = () => {
 const el = rootRef.current;
 if (!el) return;
 const rect = el.getBoundingClientRect();
 const expectedWidth = Math.min(300, window.innerWidth - 24);
 const tipH = tipRef.current?.offsetHeight || 120;
 let left = rect.left + rect.width / 2 - expectedWidth / 2;
 let top = rect.top - 6;
 let transform = 'translateY(-100%)';

 // 正上方优先；贴边时保持左上/右上紧贴，而不是漂到远处。
 if (left < 12) left = rect.left;
 if (left + expectedWidth > window.innerWidth - 12) left = rect.right - expectedWidth;
 left = Math.min(Math.max(12, left), window.innerWidth - expectedWidth - 12);

 // 上方空间不够（含长文案）时落到下方，避免被窗口顶边裁切
 if (rect.top < tipH + 16) {
 top = rect.bottom + 6;
 transform = 'none';
 }
 setTooltipStyle({ left, top, transform, width: expectedWidth });
 };

 const openTooltip = () => {
 refreshPlacement();
 setTooltipOpen(true);
 requestAnimationFrame(() => refreshPlacement());
 };

 // 格式化提示文本，尽量把连续属性拆成多行，便于在悬浮卡中阅读。
 const formattedNote = useMemo(() => {
 let text = meta.note || '';
 if (!text || meta.isEmpty) return '';

 if (!text.includes('\n')) {
 const keywords = ['攻击：', '防御：', '力量：', '敏捷：', '体质：', '智力：', '精神：', '需要等级：', '品阶：'];
 for (const kw of keywords) {
 const reg = new RegExp(`(?<=[^\\s])\\s+(${kw})`, 'g');
 text = text.replace(reg, '\n$1');
 }
 }
 return text.trim();
 }, [meta.note, meta.isEmpty]);

 // 分离“品阶行”和“属性行”，用于悬浮卡分层展示。
 const { qualityLine, statLines } = useMemo(() => {
 if (!formattedNote) return { qualityLine: null, statLines: '' };
 const lines = formattedNote.split('\n');
 const qualityPattern = /^[（(].*[）)]$/;
 if (lines.length > 0 && qualityPattern.test(lines[0])) {
 return { qualityLine: lines[0], statLines: lines.slice(1).join('\n') };
 }
 return { qualityLine: null, statLines: formattedNote };
 }, [formattedNote]);

 if (meta.isEmpty) {
 return (
 <div ref={rootRef} className="min-w-0" onContextMenu={(e) => {
 if (slotKind && canPaste) {
 e.preventDefault();
 setContextMenu({ x: e.clientX, y: e.clientY });
 }
 }}>
 <div className={clsx(
 'truncate border border-dashed border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] ',
 canPaste && 'cursor-pointer hover:border-emerald-400/50 hover:bg-emerald-500/10'
 )} onClick={canPaste ? onPaste : undefined}>
 <span className="mr-1 text-[var(--text-secondary)] ">{label}</span>
 {canPaste ? '点击粘贴' : '空位'}
 </div>
 {contextMenu && typeof document !== 'undefined' ? createPortal(
 <div className="fixed inset-0 z-[2147483647]" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}>
 <div className="absolute border border-white/10 bg-[#1a1c22] py-1 shadow-2xl" style={{ left: Math.min(contextMenu.x, window.innerWidth - 140), top: Math.min(contextMenu.y, window.innerHeight - 50) }} onClick={e => e.stopPropagation()}>
 <button className="w-full px-4 py-1.5 text-left text-[12px] text-emerald-300 hover:bg-emerald-500/15" onClick={() => { onPaste?.(); setContextMenu(null); }}>粘贴到此</button>
 </div>
 </div>,
 document.body
 ) : null}
 </div>
 );
 }

 return (
 <div ref={rootRef} className="relative min-w-0"onMouseEnter={openTooltip} onMouseMove={refreshPlacement} onMouseLeave={() => setTooltipOpen(false)} onContextMenu={(e) => {
 if (slotKind && onCut) {
 e.preventDefault();
 setContextMenu({ x: e.clientX, y: e.clientY });
 }
 }}>
 <div className="min-h-[30px] cursor-help border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5 text-[11px] leading-4 text-[var(--text-primary)] transition-colors hover:border-indigo-300/45 hover:bg-white/10">
 {label ? <span className="mr-1 text-[var(--text-secondary)] ">{label}</span> : null}
 <span className="break-words">{name}</span>
 </div>
 {contextMenu && typeof document !== 'undefined' ? createPortal(
 <div className="fixed inset-0 z-[2147483647]" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}>
 <div className="absolute border border-white/10 bg-[#1a1c22] py-1 shadow-2xl" style={{ left: Math.min(contextMenu.x, window.innerWidth - 140), top: Math.min(contextMenu.y, window.innerHeight - 50) }} onClick={e => e.stopPropagation()}>
 <button className="w-full px-4 py-1.5 text-left text-[12px] text-amber-300 hover:bg-amber-500/15" onClick={() => { onCut?.(); setContextMenu(null); }}>剪切</button>
 {canPaste ? <button className="w-full px-4 py-1.5 text-left text-[12px] text-emerald-300 hover:bg-emerald-500/15" onClick={() => { onPaste?.(); setContextMenu(null); }}>粘贴覆盖</button> : null}
 </div>
 </div>,
 document.body
 ) : null}
 {tooltipOpen && typeof document !== 'undefined'
 ? createPortal(
 <div
 ref={tipRef}
 className="pointer-events-none fixed z-[2147483647] max-w-[calc(100vw-24px)] max-h-[70vh] overflow-y-auto border border-slate-500/35 bg-[#111827] shadow-2xl ring-1 ring-black/45 scrollbar-hide"
 style={{
 ...tooltipStyle,
 WebkitFontSmoothing: 'antialiased',
 textRendering: 'geometricPrecision'
 }}
 >
 <div className="sticky top-0 z-10 border-b border-slate-600/45 bg-[#172033] px-2.5 py-2">
 <div className="text-[12px] font-bold leading-5 text-white tracking-normal">{meta.name}</div>
 </div>
 <div className="p-2.5">
 {qualityLine && (
 <div className="mb-2 text-[11px] font-semibold leading-5 text-amber-200">
 {qualityLine}
 </div>
 )}
 <div className="whitespace-pre-wrap break-words text-[12px] font-semibold leading-6 text-slate-100">
 {statLines || <span className="text-slate-400 italic">暂无详细描述</span>}
 </div>
 </div>
 </div>,
 document.body
 )
 : null}
 </div>
 );
}

const RelationshipTimelineItem = memo(function RelationshipTimelineItem({ event }: { event: RoleRelationshipEvent }) {
 const [open, setOpen] = useState(false);
 const detail = cleanRoleText(event.detail || event.event || event.change, '暂无详情');
 const preview = detail.length > 72 ? `${detail.slice(0, 72)}...` : detail;
 return (
 <article className="border border-white/10 bg-[rgba(15,23,42,0.42)] px-2 py-1.5">
 <div className="mb-1 flex flex-wrap items-center gap-1.5">
 <span className="rounded-full border border-cyan-300/25 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-100">
 {cleanRoleText(event.chapterTitle, '未标注章节')}
 </span>
 <span className="rounded-full border border-indigo-300/25 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-100">
 与 {cleanRoleText(event.target, '待确认对象')}
 </span>
 {event.status ? <span className="text-[10px] text-[var(--text-secondary)] ">{cleanRoleText(event.status)}</span> : null}
 <button
 className="ml-auto border border-white/10 bg-white/8 px-1.5 py-0.5 text-[10px] text-cyan-50 hover:bg-white/15"
 onClick={() => setOpen((prev) => !prev)}
 >
 {open ? '收起' : '展开'}
 </button>
 </div>
 <div className="whitespace-pre-wrap text-[11px] leading-5 text-[var(--text-secondary)] ">
 {open ? detail : preview}
 </div>
 </article>
 );
});

function RoleCardInner({
 item,
 showGearPanel,
 factionOptions,
 mergeSelectMode = false,
 mergeSelectOrder = null,
 onMergeStart,
 onMergeSelect,
 onFactionChange,
 onEdit,
 onDelete
}: {
 item: RoleWithCategory;
 showGearPanel: boolean;
 factionOptions: string[];
 mergeSelectMode?: boolean;
 mergeSelectOrder?: number | null;
 onMergeStart?: () => void;
 onMergeSelect?: () => void;
 onFactionChange: (faction: string) => void | Promise<void>;
 onEdit: () => void;
 onDelete: () => void;
}) {
 const details = useMemo(() => ({
 items: cleanRoleText(item.role.customFields?.items || (item.role.inventory || []).join('、')),
 skills: cleanRoleText(
 [
 item.role.customFields?.skills,
 (item.role.abilities || []).join('、'),
 Object.keys(parseDetailMap(item.role.customFields?.skillDetails)).join('、')
 ].filter(Boolean).join('、')
 ),
 equipment: item.role.customFields?.equipment || (item.role.equipment || []).join('、'),
 relations: cleanRoleText(item.role.customFields?.relations || ''),
 relatedPlot: cleanRoleText(item.role.customFields?.recentPlot || item.role.customFields?.relatedPlot || item.role.plotProgress || '')
 }), [item.role]);

 const skills = useMemo(() => normalizeSkillList(parseList(details.skills)), [details.skills]);
 const equipments = useMemo(() => {
 // 多源合并：customFields.equipment + 顶级 equipment 数组
 const raw = details.equipment;
 const fromCustom = parseList(raw);
 // 如果 parseList 返回空但原始字符串非空，说明分隔符不匹配，把整个字符串当一件装备
 if (fromCustom.length === 0 && raw.trim()) {
 return [raw.trim()];
 }
 if (fromCustom.length > 0) return fromCustom;
 const fromArray = (item.role.equipment || []).filter(Boolean);
 if (fromArray.length > 0) return fromArray;
 return [];
 }, [details.equipment, item.role.equipment]);
 const equippedSet = useMemo(() => new Set(equipments.map((name) => normalizeEquipmentName(name)).filter(Boolean)), [equipments]);
 const bagItems = useMemo(() => parseList(details.items).filter((name) => !equippedSet.has(normalizeEquipmentName(name))), [details.items, equippedSet]);
 const relations = useMemo(() => parseList(details.relations), [details.relations]);
 const relationshipTimeline = useMemo(() => mergeRelationshipTimeline(
 item.role.relationshipTimeline,
 item.role.customFields?.relationshipTimeline,
 item.role.customFields?.relationshipTimelineText,
 details.relations
 ), [item.role.relationshipTimeline, item.role.customFields?.relationshipTimeline, item.role.customFields?.relationshipTimelineText, details.relations]);

 const safeName = useMemo(() => cleanRoleText(item.role.name, '未命名角色'), [item.role.name]);
 const safeFaction = useMemo(() => cleanRoleText(item.role.faction, '待补充'), [item.role.faction]);
 const [factionDraft, setFactionDraft] = useState(safeFaction === '待补充' ? '' : safeFaction);
 const safeDescription = useMemo(() => cleanRoleText(item.role.description, '角色描述待补充。'), [item.role.description]);
 const profession = useMemo(() => cleanRoleText(inferProfession(item.role), '未知'), [item.role]);
 const [collapsed, setCollapsed] = useState(true);
 const skillDetailsMap = useMemo(() => normalizeSkillDetailMap(parseDetailMap(item.role.customFields?.skillDetails)), [item.role.customFields?.skillDetails]);
 const equipmentDetailsMap = useMemo(() => parseDetailMap(item.role.customFields?.equipmentDetails), [item.role.customFields?.equipmentDetails]);
 const equipmentBySlot = useMemo(() => buildEquipmentSlots(equipments, equipmentDetailsMap), [equipments, equipmentDetailsMap]);

 // 装备/技能 剪切粘贴
 const clipboard = useEquipmentClipboard((s) => s.item);
 const setClipboard = useEquipmentClipboard((s) => s.cut);
 const clearClipboard = useEquipmentClipboard((s) => s.clear);
 const updateRoleProfile = useBookStore((s) => s.updateRoleProfile);
 const activeBookId = useAppStore((s) => s.activeBookId);
 const islandShow = useIslandStore((s) => s.show);

 const handleCutEquipment = (equipName: string) => {
 const detail = equipmentDetailsMap[equipName] || equipmentDetailsMap[normalizeEquipmentName(equipName)] || '';
 setClipboard({ kind: 'equipment', name: equipName, detail, sourceRoleId: item.role.id });
 islandShow({ type: 'success', message: `已剪切「${equipName}」，请到目标角色卡的装备槽位粘贴`, autoHideMs: 2500 });
 };

 const handlePasteEquipment = async () => {
 if (!clipboard || clipboard.kind !== 'equipment' || !activeBookId) return;
 const sourceRoleId = clipboard.sourceRoleId;
 const targetRoleId = item.role.id;
 const equipName = clipboard.name;
 const equipDetail = clipboard.detail;

 // 同一角色不需要剪切
 if (sourceRoleId === targetRoleId) {
 islandShow({ type: 'warning', message: '不能粘贴到同一角色', autoHideMs: 1500 });
 return;
 }

 // 1. 从源角色移除
 await updateRoleProfile(activeBookId, ((): typeof item.role => { return item.role; })()); // placeholder, real fetch via store
 // 实际用 useBookStore 的方式：通过 getState 找源角色
 const allBooks = useBookStore.getState().books;
 const book = allBooks.find(b => b.id === activeBookId);
 if (!book) return;
 const allRoles = (book.resourceIndex?.customCharacterCategories || []).flatMap(c => c.children);
 const sourceRole = allRoles.find(r => r.id === sourceRoleId);
 const targetRole = allRoles.find(r => r.id === targetRoleId);
 if (!sourceRole || !targetRole) return;

 // 从源角色移除装备
 const newSourceEquipment = (sourceRole.equipment || []).filter(e => normalizeEquipmentName(e) !== normalizeEquipmentName(equipName));
 const sourceCustomEq = parseList(sourceRole.customFields?.equipment || '').filter(e => normalizeEquipmentName(e) !== normalizeEquipmentName(equipName));
 const sourceDetailsObj = (() => { try { return JSON.parse(sourceRole.customFields?.equipmentDetails || '{}'); } catch { return {}; } })();
 delete sourceDetailsObj[equipName];

 await updateRoleProfile(activeBookId, {
 ...sourceRole,
 equipment: newSourceEquipment,
 customFields: {
 ...sourceRole.customFields,
 equipment: sourceCustomEq.join('、'),
 equipmentDetails: JSON.stringify(sourceDetailsObj)
 }
 });

 // 2. 添加到目标角色
 const newTargetEquipment = Array.from(new Set([...(targetRole.equipment || []), equipName]));
 const targetCustomEq = Array.from(new Set([...parseList(targetRole.customFields?.equipment || ''), equipName]));
 const targetDetailsObj = (() => { try { return JSON.parse(targetRole.customFields?.equipmentDetails || '{}'); } catch { return {}; } })();
 if (equipDetail) targetDetailsObj[equipName] = equipDetail;

 await updateRoleProfile(activeBookId, {
 ...targetRole,
 equipment: newTargetEquipment,
 customFields: {
 ...targetRole.customFields,
 equipment: targetCustomEq.join('、'),
 equipmentDetails: JSON.stringify(targetDetailsObj)
 }
 });

 clearClipboard();
 islandShow({ type: 'success', message: `已将「${equipName}」转移到「${targetRole.name}」`, autoHideMs: 2000 });
 };

 const isEquipmentClipboardActive = clipboard?.kind === 'equipment' && clipboard.sourceRoleId !== item.role.id;
 const latestChapterStatus = useMemo(() => [
 item.role.customFields?.latestChapterNo ? `第${item.role.customFields?.latestChapterNo}章` : '',
 item.role.customFields?.latestChapter || ''
 ]
 .filter(Boolean)
 .join(' '), [item.role.customFields?.latestChapterNo, item.role.customFields?.latestChapter]);
 useEffect(() => {
 setFactionDraft(safeFaction === '待补充' ? '' : safeFaction);
 }, [safeFaction]);

 const commitFaction = () => {
 const next = cleanRoleText(factionDraft);
 const current = safeFaction === '待补充' ? '' : safeFaction;
 if (next === current) return;
 void onFactionChange(next);
 };

 return (
 <article
 className={` border bg-[var(--surface)] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.32)] backdrop-blur-[20px] transition ${
 mergeSelectOrder
 ? 'border-cyan-300/75 ring-2 ring-cyan-300/35'
 : mergeSelectMode
 ? 'cursor-pointer border-cyan-300/35 hover:border-cyan-200/70 hover:bg-cyan-500/10'
 : 'border-[var(--border-color)]'
 }`}
 onClick={mergeSelectMode ? onMergeSelect : undefined}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0 flex-1">
 <div className="text-sm font-semibold text-[var(--text-primary)] ">{safeName}</div>
 <div className="mt-1 truncate text-xs text-[var(--text-primary)] ">阵营：{safeFaction} · 定位：{categoryFromRole(item.role)}</div>
 {mergeSelectOrder ? (
 <div className="mt-1 text-[11px] font-semibold text-cyan-100">
 {mergeSelectOrder === 1 ? '保留主卡' : '合并副卡'}
 </div>
 ) : null}
 </div>
 <div className="flex shrink-0 items-center gap-1">
 <button
 className="inline-flex min-w-[44px] items-center justify-center whitespace-nowrap border border-cyan-300/35 bg-cyan-500/15 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25"
 onClick={(event) => {
 event.stopPropagation();
 onMergeStart?.();
 }}
 >
 合并
 </button>
 <button
 className="inline-flex min-w-[44px] items-center justify-center whitespace-nowrap border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-white/20"
 onClick={(event) => {
 event.stopPropagation();
 setCollapsed((prev) => !prev);
 }}
 >
 {collapsed ? '展开' : '收起'}
 </button>
 <button
 className="inline-flex min-w-[44px] items-center justify-center whitespace-nowrap border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-white/20"
 onClick={(event) => {
 event.stopPropagation();
 onEdit();
 }}
 >
 编辑
 </button>
 <button
 className="px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
 onClick={(event) => {
 event.stopPropagation();
 onDelete();
 }}
 >
 删除
 </button>
 </div>
 </div>
 {!collapsed ? (
 <div className="mt-2 border border-white/10 bg-white/[0.04] px-2 py-1.5">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">势力分配</div>
 <input
 className="w-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] "
 value={factionDraft}
 placeholder="手动输入势力/主角团"
 list={`role-faction-options-${item.role.id}`}
 title={factionDraft || '手动输入势力/主角团'}
 onChange={(event) => setFactionDraft(event.target.value)}
 onBlur={commitFaction}
 onKeyDown={(event) => {
 if (event.key === 'Enter') {
 event.preventDefault();
 commitFaction();
 (event.currentTarget as HTMLInputElement).blur();
 }
 }}
 />
 <datalist id={`role-faction-options-${item.role.id}`}>
 {factionOptions.map((name) => (
 <option key={name} value={name} />
 ))}
 </datalist>
 </div>
 ) : null}

 {!collapsed ? (
 <>
 <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)] ">{safeDescription}</div>

 {showGearPanel ? (
 <section className="mt-2 border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-2">
 <div className="mb-2 text-[11px] font-semibold text-[var(--text-secondary)] ">战备/装备</div>
 <div className="grid grid-cols-1 gap-2">
 <div className="border border-[var(--border-color)] bg-[var(--surface)] p-2">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">装备栏（固定槽位）</div>
 <div className="grid grid-cols-3 gap-2">
 <HoverStat slotKind="equipment" label="武器"name={equipmentBySlot.weapon || '空位'} note={equipmentBySlot.weapon ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.weapon, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.weapon ? () => handleCutEquipment(equipmentBySlot.weapon!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="盾牌"name={equipmentBySlot.shield || '空位'} note={equipmentBySlot.shield ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.shield, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.shield ? () => handleCutEquipment(equipmentBySlot.shield!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="头盔"name={equipmentBySlot.helmet || '空位'} note={equipmentBySlot.helmet ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.helmet, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.helmet ? () => handleCutEquipment(equipmentBySlot.helmet!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="胸甲"name={equipmentBySlot.chest || '空位'} note={equipmentBySlot.chest ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.chest, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.chest ? () => handleCutEquipment(equipmentBySlot.chest!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="护臂"name={equipmentBySlot.bracers || '空位'} note={equipmentBySlot.bracers ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.bracers, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.bracers ? () => handleCutEquipment(equipmentBySlot.bracers!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="下装"name={equipmentBySlot.legs || '空位'} note={equipmentBySlot.legs ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.legs, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.legs ? () => handleCutEquipment(equipmentBySlot.legs!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="鞋子"name={equipmentBySlot.boots || '空位'} note={equipmentBySlot.boots ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.boots, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.boots ? () => handleCutEquipment(equipmentBySlot.boots!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="披风"name={equipmentBySlot.cloak || '空位'} note={equipmentBySlot.cloak ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.cloak, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.cloak ? () => handleCutEquipment(equipmentBySlot.cloak!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="戒指1"name={equipmentBySlot.ring1 || '空位'} note={equipmentBySlot.ring1 ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.ring1, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.ring1 ? () => handleCutEquipment(equipmentBySlot.ring1!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="戒指2"name={equipmentBySlot.ring2 || '空位'} note={equipmentBySlot.ring2 ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.ring2, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.ring2 ? () => handleCutEquipment(equipmentBySlot.ring2!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="项链"name={equipmentBySlot.necklace || '空位'} note={equipmentBySlot.necklace ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.necklace, '正文未提取到该装备的详细说明。', normalizeEquipmentName) : '该槽位暂未装备。'} onCut={equipmentBySlot.necklace ? () => handleCutEquipment(equipmentBySlot.necklace!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 <HoverStat slotKind="equipment" label="坐骑"name={equipmentBySlot.mount || '空位'} note={equipmentBySlot.mount ? pickDetailByName(equipmentDetailsMap, equipmentBySlot.mount, '正文未提取到该坐骑的详细说明。', normalizeEquipmentName) : '该槽位暂未装备坐骑。'} onCut={equipmentBySlot.mount ? () => handleCutEquipment(equipmentBySlot.mount!) : undefined} onPaste={isEquipmentClipboardActive ? () => void handlePasteEquipment() : undefined} canPaste={isEquipmentClipboardActive} />
 </div>
 </div>
 <div className="border border-[var(--border-color)] bg-[var(--surface)] p-2">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">技能栏</div>
 <div className="flex flex-wrap gap-1.5">
 {skills.length > 0 ? (
 skills.map((name) => (
 <HoverStat
 key={`skill-${name}`}
 name={name}
 note={pickDetailByName(skillDetailsMap, name, '正文未提取到该技能的详细说明。', normalizeSkillName)}
 />
 ))
 ) : (
 <span className="text-[11px] text-[var(--text-secondary)] ">暂无技能</span>
 )}
 </div>
 </div>
 <div className="border border-[var(--border-color)] bg-[var(--surface)] p-2">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">背包/个人空间（{bagItems.length}）</div>
 <div className="flex flex-wrap gap-1.5">
 {bagItems.length > 0 ? (
 bagItems.slice(0, 12).map((name) => (
 <span key={`bag-${name}`} className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100/90">
 {name}
 </span>
 ))
 ) : (
 <span className="text-[11px] text-[var(--text-secondary)] italic">空间暂无物品</span>
 )}
 </div>
 </div>
 </div>
 </section>
 ) : (
 <section className="mt-2 border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-2">
 <div className="grid grid-cols-1 gap-2">
 <div className="border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5">
 <div className="text-[11px] text-[var(--text-secondary)] ">职业/身份</div>
 <div className="text-xs text-[var(--text-primary)] ">{profession}</div>
 </div>
 <div className="border border-[var(--border-color)] bg-[var(--surface)] px-2 py-1.5">
 <div className="text-[11px] text-[var(--text-secondary)] ">特色技能</div>
 <div className="mt-1 flex flex-wrap gap-1.5">
 {skills.length > 0 ? (
 skills.slice(0, 6).map((name) => (
 <HoverStat
 key={`tag-skill-${name}`}
 name={name}
 note={pickDetailByName(skillDetailsMap, name, '正文未提取到该技能的详细说明。', normalizeSkillName)}
 />
 ))
 ) : (
 <span className="text-[11px] text-[var(--text-secondary)] ">暂无</span>
 )}
 </div>
 </div>
 </div>
 </section>
 )}
 <div className="mt-2 border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-1.5">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">角色关系（{relations.length}）</div>
 <div className="flex flex-wrap gap-1">
 {relations.length > 0 ? (
 relations.slice(0, 8).map((rel) => (
 <span key={rel} className="rounded-full border border-[var(--border-color)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] ">
 {rel}
 </span>
 ))
 ) : (
 <span className="text-[10px] text-[var(--text-secondary)] ">暂无</span>
 )}
 </div>
 </div>
 <div className="mt-2 border border-cyan-300/25 bg-cyan-500/10 px-2 py-2">
 <div className="mb-1.5 flex items-center justify-between gap-2">
 <div className="text-[11px] font-semibold text-cyan-100/90">关系历程（{relationshipTimeline.length}）</div>
 </div>
 {relationshipTimeline.length > 0 ? (
 <div className="space-y-1.5">
 {relationshipTimeline.map((event) => (
 <RelationshipTimelineItem key={event.id} event={event} />
 ))}
 </div>
 ) : (
 <div className="text-[11px] text-[var(--text-secondary)] ">暂无关系历程。后续智能整理会记录“事件原因 + 情感变化 + 关系结果”。</div>
 )}
 </div>
 <div className="mt-2">
 <div className="mb-1 text-[11px] text-[var(--text-secondary)] ">近期剧情</div>
 <div className="border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] ">
 {latestChapterStatus ? (
 <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-300/85">
 <span className="opacity-70">最近状态</span>
 <span>{latestChapterStatus}</span>
 </div>
 ) : null}
 <div className="whitespace-pre-wrap leading-relaxed">{details.relatedPlot || '暂无内容'}</div>
 </div>
 </div>
 </>
 ) : null}
 </article>
 );
}

export const RoleCard = memo(RoleCardInner);

export function RoleEditorOverlay({
 mode,
 category,
 draft,
 onChange,
 onClose,
 onSubmit,
 roles = [],
 roleId = null,
 onSelectRole,
 customViewTabs = [],
 rawCategoryMap = new Map<string, string>(),
}: {
 mode: import('../rolePanelLogic').EditMode;
 category: import('../rolePanelLogic').RoleView;
 draft: import('../rolePanelLogic').RoleDraft;
 onChange: (patch: Partial<import('../rolePanelLogic').RoleDraft>) => void;
 onClose: () => void;
 onSubmit: () => void;
 roles?: import('../rolePanelLogic').RoleWithCategory[];
 roleId?: string | null;
 onSelectRole?: (role: import('../rolePanelLogic').RoleWithCategory) => void;
 customViewTabs?: string[];
 rawCategoryMap?: Map<string, string>;
}) {
 const [tab, setTab] = useState<'role' | 'mentions'>('role');
 const [factionOpen, setFactionOpen] = useState(false);
 const factionRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
  if (!factionOpen) return;
  const handler = (e: MouseEvent) => {
   if (factionRef.current && !factionRef.current.contains(e.target as Node)) {
    setFactionOpen(false);
   }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
 }, [factionOpen]);

 const factionNames = useMemo(() => {
  const set = new Set<string>();
  for (const item of roles) {
   if (item.categoryName === '势力' || item.role.roleType === '势力') {
    if (item.role.name) set.add(item.role.name);
   }
   if (item.role.faction) set.add(item.role.faction);
  }
  return Array.from(set);
 }, [roles]);

 const factionMembers = useMemo(
  () => roles.filter(item => item.role.faction === draft.faction && !!draft.faction),
  [roles, draft.faction]
 );

 // 功法/技能 词条（name + detail 结构体）
 type SkillEntry = { name: string; detail: string };
 const parseSkills = (val: string): SkillEntry[] => {
  if (!val) return [];
  try {
   const p = JSON.parse(val);
   if (Array.isArray(p)) return p as SkillEntry[];
  } catch {}
  // 兼容旧版顿号/逗号分隔纯文本
  return val.split(/[、，,\n]/).map(s => s.trim()).filter(Boolean).map(name => ({ name, detail: '' }));
 };
 const serializeSkills = (skills: SkillEntry[]) => JSON.stringify(skills);

 const skillEntries = useMemo(() => parseSkills(draft.appearance || ''), [draft.appearance]);
 const [skillFormOpen, setSkillFormOpen] = useState(false);
 const [skillFormName, setSkillFormName] = useState('');
 const [skillFormDetail, setSkillFormDetail] = useState('');
 const submitSkill = () => {
  const name = skillFormName.trim();
  if (!name) return;
  const next = [...skillEntries, { name, detail: skillFormDetail.trim() }];
  onChange({ appearance: serializeSkills(next) });
  setSkillFormName('');
  setSkillFormDetail('');
  setSkillFormOpen(false);
 };
 const removeSkill = (idx: number) => {
  const next = skillEntries.filter((_, i) => i !== idx);
  onChange({ appearance: serializeSkills(next) });
 };

 // 其他词条（复用 SkillEntry 类型 + parseSkills / serializeSkills）
 const otherEntries = useMemo(() => parseSkills(draft.other || ''), [draft.other]);
 const [otherFormOpen, setOtherFormOpen] = useState(false);
 const [otherFormName, setOtherFormName] = useState('');
 const [otherFormDetail, setOtherFormDetail] = useState('');
 const submitOther = () => {
  const name = otherFormName.trim();
  if (!name) return;
  const next = [...otherEntries, { name, detail: otherFormDetail.trim() }];
  onChange({ other: serializeSkills(next) });
  setOtherFormName('');
  setOtherFormDetail('');
  setOtherFormOpen(false);
 };
 const removeOther = (idx: number) => {
  const next = otherEntries.filter((_, i) => i !== idx);
  onChange({ other: serializeSkills(next) });
 };

 return (
 <section className="w-full h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden">
 {/* Top Header */}
 <div className="flex flex-col px-5 pt-6 pb-3">

  {/* 第一行：分类标签 + 势力 + 保存 */}
  <div className="flex items-center gap-2 mb-4">
  {/* 分类 pill */}
  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2d73ff]/30 bg-[#2d73ff]/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-[#2d73ff] select-none">
   <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
   {category}
  </span>

  {/* 分隔点 */}
  <span className="text-[var(--text-muted)] opacity-30 text-xs select-none">·</span>

  {/* 势力下拉 pill */}
  <div className="relative" ref={factionRef}>
   <button
   type="button"
   onClick={() => setFactionOpen(v => !v)}
   className={clsx(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all select-none cursor-pointer',
    draft.faction
    ? 'border-amber-500/40 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400 hover:bg-amber-500/[0.14]'
    : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]'
   )}
   >
   <svg className={clsx('h-3 w-3 shrink-0', draft.faction ? 'text-amber-500' : 'text-[var(--text-muted)]')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
   </svg>
   <span className="max-w-[110px] truncate">{draft.faction || '选择势力…'}</span>
   <svg className={clsx('h-2.5 w-2.5 shrink-0 transition-transform duration-200 opacity-60', factionOpen && 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
   </svg>
   </button>

   {factionOpen && (
    <div className="absolute left-0 z-50 mt-1 w-[190px] rounded border border-[var(--border-color)] bg-[var(--surface-strong)] py-1 shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
    {/* 无所属 */}
    <button
    type="button"
    onClick={() => { onChange({ faction: '' }); setFactionOpen(false); }}
    className={clsx(
     'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-all duration-150 hover:bg-[var(--surface-hover)]',
     !draft.faction ? 'text-[#2d73ff] bg-[#2d73ff]/[0.06] font-semibold' : 'text-[var(--text-secondary)]'
    )}
    >
    <span>无所属势力</span>
    {!draft.faction && <svg className="h-3 w-3 shrink-0 text-[#2d73ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    {/* 已有势力 */}
    {factionNames.map(name => {
    const isSel = draft.faction === name;
    return (
     <button
     key={name}
     type="button"
     onClick={() => { onChange({ faction: name }); setFactionOpen(false); }}
     className={clsx(
      'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-all duration-150 hover:bg-[var(--surface-hover)]',
      isSel ? 'text-[#2d73ff] bg-[#2d73ff]/[0.06] font-semibold' : 'text-[var(--text-secondary)]'
     )}
     >
     <span className="truncate pr-2">{name}</span>
     {isSel && <svg className="h-3 w-3 shrink-0 text-[#2d73ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
     </button>
    );
    })}
    <div className="my-1 border-t border-[var(--border-color)]" />
    {/* 新建势力 */}
    <button
    type="button"
    onClick={async () => {
     setFactionOpen(false);
     const val = await promptDialog({ title: '新建势力', placeholder: '请输入新的势力名称' });
     if (val && val.trim()) onChange({ faction: val.trim() });
    }}
    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-[#2d73ff] font-medium transition-all duration-150 hover:bg-[#2d73ff]/[0.08]"
    >
    <span className="font-bold">＋</span>
    <span>新建势力…</span>
    </button>
   </div>
   )}
  </div>

  </div>

  {/* 第二行：角色名称 + 保存 */}
  <div className="flex items-center gap-3">
  <input 
  className="flex-1 min-w-0 text-[22px] font-semibold text-[var(--text-primary)] bg-transparent border-none outline-none placeholder:text-[var(--text-muted)] leading-tight"
  value={draft.name}
  placeholder="角色名称"
  onChange={e => onChange({ name: e.target.value })}
  />
  <button
   type="button"
   onClick={onSubmit}
   className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2d73ff]/30 bg-[#2d73ff] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow-md active:scale-95 active:bg-blue-700"
  >
   <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-8H7v8" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 3v5h8" /></svg>
   保存
  </button>
  </div>
 </div>


 {/* Tabs */}
 <div className="flex items-center gap-6 px-5 mt-2 border-b border-[var(--border-color)]">
 <button 
 onClick={() => setTab('role')}
 className={`pb-2 text-[15px] font-bold border-b-[3px] transition-colors ${tab === 'role' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
 >
 角色
 </button>
 <button 
 onClick={() => setTab('mentions')}
 className={`pb-2 text-[15px] font-bold border-b-[3px] transition-colors ${tab === 'mentions' ? 'border-[#3b82f6] text-[#3b82f6]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
 >
 所属势力
 </button>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
 {tab === 'role' && (
 <div className="flex flex-col gap-6 pb-20">


 {/* Fields */}
 <div className="flex flex-col">
 <div className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">别名 / 称呼</div>
 <textarea
 className="w-full min-h-[44px] bg-[var(--surface)] border border-[var(--border-color)] rounded-md px-3 py-2 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] focus:bg-[var(--bg-primary)] transition-colors shadow-sm"
 placeholder="例如：本名、外号、常用称呼，用顿号或换行分隔"
 value={draft.aliases || ''}
 onChange={e => onChange({ aliases: e.target.value })}
 />
 </div>

 <div className="flex flex-col">
 <div className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">角色近期状态</div>
 <textarea 
 className="w-full min-h-[60px] bg-[var(--surface)] border border-[var(--border-color)] rounded-md px-3 py-2 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] focus:bg-[var(--bg-primary)] transition-colors shadow-sm"
 placeholder="记录角色当前处境 / 最新状态 / 最近发生的关键变化…（由你自己维护，不会被 AI 提取覆盖）"
 value={draft.relatedPlot || ''}
 onChange={e => onChange({ relatedPlot: e.target.value })}
 />
 </div>

 <div className="flex flex-col">
 <div className="text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">金手指</div>
 <textarea 
 className="w-full min-h-[60px] bg-[var(--surface)] border border-[var(--border-color)] rounded-md px-3 py-2 text-[14px] leading-relaxed text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] focus:bg-[var(--bg-primary)] transition-colors shadow-sm"
 placeholder="主角专属能力、外挂系统、特殊体质等..."
 value={draft.personality || ''}
 onChange={e => onChange({ personality: e.target.value })}
 />
 </div>

 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between">
  <span className="text-[13px] font-medium text-[var(--text-secondary)]">功法/技能</span>
  <button
  type="button"
  onClick={() => { setSkillFormOpen(v => !v); setSkillFormName(''); setSkillFormDetail(''); }}
  className="inline-flex items-center gap-1 rounded border border-[#2d73ff]/30 bg-[#2d73ff]/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#2d73ff] hover:bg-[#2d73ff]/[0.14] transition-all"
  >
  {skillFormOpen ? (
   <>
   <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
   取消
   </>
  ) : (
   <>
   <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
   新建
   </>
  )}
  </button>
 </div>

 {/* 新建表单（展开状态） */}
 {skillFormOpen && (
  <div className="flex flex-col gap-2 rounded-lg border border-[#2d73ff]/25 bg-[#2d73ff]/[0.04] p-3">
  <input
   type="text"
   autoFocus
   value={skillFormName}
   onChange={e => setSkillFormName(e.target.value)}
   onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitSkill(); } }}
   placeholder="功法 / 技能名称"
   className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] transition-colors"
  />
  <textarea
   value={skillFormDetail}
   onChange={e => setSkillFormDetail(e.target.value)}
   placeholder="详细说明：效果、冷却、等级、限制等（可留空）"
   rows={3}
   className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-3 py-2 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] transition-colors"
  />
  <div className="flex items-center justify-end gap-2">
   <button type="button" onClick={() => setSkillFormOpen(false)} className="px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">取消</button>
   <button
   type="button"
   onClick={submitSkill}
   disabled={!skillFormName.trim()}
   className="inline-flex items-center gap-1 rounded-md bg-[#2d73ff] px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
   >
   <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
   确认创建
   </button>
  </div>
  </div>
 )}

 {/* 技能列表 */}
 {skillEntries.length > 0 && (
  <div className="flex flex-col gap-1">
  {skillEntries.map((skill, idx) => (
   <EditorDetailBubble key={idx} name={skill.name} detail={skill.detail}>
   <div className="group flex items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 hover:border-[var(--border-color-hover)] hover:bg-[var(--surface-hover)] transition-all cursor-help">
   <span className="text-[13px] font-medium text-[var(--text-primary)] truncate pr-2">{skill.name}</span>
   <button
    type="button"
    onClick={() => removeSkill(idx)}
    className="shrink-0 opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-rose-100 hover:text-rose-500 dark:hover:bg-rose-500/20 transition-all"
   >
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
   </button>
   </div>
   </EditorDetailBubble>
  ))}
  </div>
 )}

 {skillEntries.length === 0 && !skillFormOpen && (
  <div className="text-[12px] text-[var(--text-muted)] py-1">暂无功法和技能，点击“新建”添加</div>
 )}
 </div>

 <div className="flex flex-col gap-2">
 <div className="flex items-center justify-between">
  <span className="text-[13px] font-medium text-[var(--text-secondary)]">其他</span>
  <button
  type="button"
  onClick={() => { setOtherFormOpen(v => !v); setOtherFormName(''); setOtherFormDetail(''); }}
  className="inline-flex items-center gap-1 rounded border border-[#2d73ff]/30 bg-[#2d73ff]/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#2d73ff] hover:bg-[#2d73ff]/[0.14] transition-all"
  >
  {otherFormOpen ? (
   <><svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>取消</>
  ) : (
   <><svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>新建</>
  )}
  </button>
 </div>

 {otherFormOpen && (
  <div className="flex flex-col gap-2 rounded-lg border border-[#2d73ff]/25 bg-[#2d73ff]/[0.04] p-3">
  <input
   type="text"
   autoFocus
   value={otherFormName}
   onChange={e => setOtherFormName(e.target.value)}
   onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitOther(); } }}
   placeholder="名称（武器、法宝、设定…）"
   className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] transition-colors"
  />
  <textarea
   value={otherFormDetail}
   onChange={e => setOtherFormDetail(e.target.value)}
   placeholder="详细描述：来源、效果、特性等（可留空）"
   rows={3}
   className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md px-3 py-2 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)] focus:border-[#3b82f6] transition-colors"
  />
  <div className="flex items-center justify-end gap-2">
   <button type="button" onClick={() => setOtherFormOpen(false)} className="px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">取消</button>
   <button
   type="button"
   onClick={submitOther}
   disabled={!otherFormName.trim()}
   className="inline-flex items-center gap-1 rounded-md bg-[#2d73ff] px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
   >
   <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
   确认创建
   </button>
  </div>
  </div>
 )}

 {otherEntries.length > 0 && (
  <div className="flex flex-col gap-1">
  {otherEntries.map((item, idx) => (
   <EditorDetailBubble key={idx} name={item.name} detail={item.detail}>
   <div className="group flex items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 hover:border-[var(--border-color-hover)] hover:bg-[var(--surface-hover)] transition-all cursor-help">
   <span className="text-[13px] font-medium text-[var(--text-primary)] truncate pr-2">{item.name}</span>
   <button
    type="button"
    onClick={() => removeOther(idx)}
    className="shrink-0 opacity-0 group-hover:opacity-100 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-rose-100 hover:text-rose-500 dark:hover:bg-rose-500/20 transition-all"
   >
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
   </button>
   </div>
   </EditorDetailBubble>
  ))}
  </div>
 )}

 {otherEntries.length === 0 && !otherFormOpen && (
  <div className="text-[12px] text-[var(--text-muted)] py-1">暂无其他设定，点击"新建"添加</div>
 )}
 </div>

 
 {/* Hidden fields but preserved for data integrity */}
 <div className="hidden">
 <select value={draft.roleType} onChange={e => onChange({ roleType: e.target.value as any })}>
 <option value="主角">主角</option>
 <option value="女主">女主</option>
 <option value="配角">配角</option>
 <option value="反派">反派</option>
 <option value="龙套">龙套</option>
 <option value="势力">势力</option>
 <option value="待确认配角">待确认配角</option>
 </select>
 </div>
 </div>
 )}

 {tab === 'mentions' && (
 <div className="flex flex-col gap-4 pb-20">
  {!draft.faction ? (
  /* 未设置势力的空状态提示 */
  <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--text-secondary)] gap-3">
   <svg className="h-10 w-10 opacity-40 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
   <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
   </svg>
   <span className="font-medium">当前角色暂无所属势力</span>
   <span className="text-[11px] opacity-75 leading-relaxed">可在上方"选择势力"下拉栏中<br/>选择已有势力或新建一个势力</span>
  </div>
  ) : (
  <>
   {/* 势力名称标题 */}
   <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
   <svg className="h-5 w-5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
   </svg>
   <div>
    <div className="text-[10px] text-[var(--text-muted)] mb-0.5">所属势力</div>
    <div className="text-[15px] font-bold text-amber-600 dark:text-amber-400">{draft.faction}</div>
   </div>
   </div>

   {/* 成员列表 */}
   <div className="flex flex-col gap-1.5">
   <div className="text-[11px] font-medium text-[var(--text-secondary)]">
    势力成员 ({factionMembers.length})
   </div>
   {factionMembers.length === 0 ? (
    <div className="text-[12px] text-[var(--text-muted)] py-4 text-center">暂无其他成员</div>
   ) : (
    factionMembers.map(item => {
    const isSelf = item.role.id === roleId;
    return (
     <button
     key={item.role.id}
     type="button"
     disabled={isSelf}
     onClick={() => { if (!isSelf) onSelectRole?.(item); }}
     className={clsx(
      'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs text-left transition-all duration-150',
      isSelf
      ? 'border-[#2d73ff]/40 bg-[#2d73ff]/[0.05] text-[#2d73ff] font-bold cursor-default'
      : 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-color-hover)] active:scale-[0.99] cursor-pointer'
     )}
     >
     <span className="truncate pr-2 font-medium">{item.role.name}</span>
     <span className={clsx(
      'shrink-0 rounded px-2 py-0.5 text-[10px]',
      isSelf
      ? 'bg-[#2d73ff]/20 text-[#2d73ff]'
      : 'bg-[var(--surface-strong)] text-[var(--text-secondary)]'
     )}>
      {(((item.role.customFields?.category) || '').trim() || item.categoryName)}
     </span>
     </button>
    );
    })
   )}
   </div>
  </>
  )}
 </div>
 )}
 </div>
 </section>
 );
}
