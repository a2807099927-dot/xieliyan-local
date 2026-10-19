// 模块说明：角色档案面板。
// 关键职责：负责角色展示、编辑、势力分配、装备技能悬浮详情与关系图谱交互。
// 维护边界：角色嵌套对象的写操作均通过 useBookStore.updateRoleProfile 进行；直接修改 book.resourceIndex 而不通过 store 不被允许。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book, StoryArchiveRecord } from '../../types';
import { flushBookMetaPatches, useBookStore } from '../../store/useBookStore';
import { useIslandStore } from '../../store/useIslandStore';
import { electronAPI } from '../../utils/electron';
import { buildStoryArchiveIndex } from '../../utils/storyArchiveIndex';
import { exportRoles, importRolesFromFile } from '../../utils/dataPortability';
import { DEFAULT_ROLE_CATEGORIES } from '../../utils/roleArchiveBridge';
import { applyExtractedRoleCandidatesToCategories } from '../../utils/roleMutationEngine';

import {
 categoryFromRole,
 cleanRoleText,
 draftFromRole,
 emptyDraft,
 gatherRelationData,
 isGenericNonRoleCardName,
 mergeRelationshipTimeline,
 mergeRoleProfiles,
 normalizeRoleIdentity,
 normalizeRoleType,
 parseList,
 parseSkillChips,
 shouldMergeRoleCards,
 type EditMode,
 type NovelType,
 type RecoveryPrompt,
 type RelationEdge,
 type RoleDraft,
 type RoleView,
 type RoleWithCategory
} from './roles/rolePanelLogic';
import { RoleCard, RoleEditorOverlay } from './roles/ui/RoleCards';
import { RolePanelDialogs } from './roles/ui/RolePanelDialogs';
import { RolePanelHeader } from './roles/ui/RolePanelHeader';
import { RoleRelationGraph } from './roles/ui/RoleRelationGraph';
import { RolesTree } from './roles/ui/RolesTree';
import { SmartExtractModal } from '../modals/SmartExtractModal';

import { formatAssetDetail, parseAssetDetailMap, uniqueAssetList } from './roles/rolePanelHelpers';

export function RolesPanel({ book }: { book: Book }) {
 const loadBooks = useBookStore((s) => s.loadBooks);
 const updateBook = useBookStore((s) => s.updateBook);
 const island = useIslandStore((s) => s);
 const [view, setView] = useState<RoleView>('主角');
 const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
 const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
 const [editorMode, setEditorMode] = useState<EditMode | null>(null);
 const [panelTab, setPanelTab] = useState<'list' | 'editor' | 'graph'>('list');
 const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
 const [collapsedFactions, setCollapsedFactions] = useState<Set<string>>(new Set());
 const [selectedFactionRoleIds, setSelectedFactionRoleIds] = useState<Record<string, string>>({});
 const [pendingDelete, setPendingDelete] = useState<{ roleId: string; roleName: string } | null>(null);
 const [pendingDeleteCategory, setPendingDeleteCategory] = useState<{ categoryName: string } | null>(null);
 const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
 const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
 const [debugDialog, setDebugDialog] = useState<{ title: string; content: string } | null>(null);
 const [editAssetDialog, setEditAssetDialog] = useState<{ kind: 'equipment' | 'skill'; mode: 'create' | 'edit'; originalName?: string; name: string; detail: string; ownerRoleIds: string[] } | null>(null);
 const [quickAddRoleDialog, setQuickAddRoleDialog] = useState<{ category: string; name: string; detail: string; editRoleId?: string } | null>(null);
 const [mergePrimaryId, setMergePrimaryId] = useState('');
 const [mergeSecondaryId, setMergeSecondaryId] = useState('');
 const [mergeSelectMode, setMergeSelectMode] = useState(false);
 const [mergeSelectedIds, setMergeSelectedIds] = useState<string[]>([]);
 const [extracting, setExtracting] = useState(false);
 const [extractDialogOpen, setExtractDialogOpen] = useState(false);
 const [extractStartChapter, setExtractStartChapter] = useState('1');
 const [extractEndChapter, setExtractEndChapter] = useState('10');
 const [recoveryPrompt, setRecoveryPrompt] = useState<RecoveryPrompt | null>(null);
 const roleDeleteBusyRef = useRef(false);
 const [novelType, setNovelType] = useState<NovelType>(
 book.resourceIndex?.novelType || 'dushi'
 );

 useEffect(() => {
 if (book.resourceIndex?.novelType) {
 setNovelType(book.resourceIndex.novelType);
 }
 }, [book.resourceIndex?.novelType]);

 const updateNovelType = async (type: NovelType) => {
 setNovelType(type);
 await electronAPI.resources.updateCharacter({ bookId: book.id, patch: { novelType: type } });
 await loadBooks();
 };

 const customViewTabs = useMemo(() => book.resourceIndex?.customViewTabs || [], [book.resourceIndex?.customViewTabs]);

 const addCustomTab = async (name: string) => {
 const trimmed = name.trim();
 if (!trimmed || customViewTabs.includes(trimmed)) return;
 // 不允许和内置分类重名
 const builtins = new Set(['全部', ...DEFAULT_ROLE_CATEGORIES.map((c) => c.name), '装备库', '技能/功法']);
 if (builtins.has(trimmed)) {
 island.show({ type: 'warning', message: '不能与内置分类同名' });
 return;
 }
 await updateBook(book.id, (current) => ({
 ...current,
 resourceIndex: {
 ...(current.resourceIndex || {}),
 customCharacterCategories: current.resourceIndex?.customCharacterCategories || [],
 customViewTabs: [...(current.resourceIndex?.customViewTabs || []), trimmed],
 schemaVersion: current.resourceIndex?.schemaVersion || 1
 },
 updatedAt: new Date().toISOString()
 }));
 await loadBooks();
 setView(trimmed as any);
 };

 const removeCustomTab = async (name: string) => {
    await updateBook(book.id, (current) => ({
      ...current,
      resourceIndex: {
        ...(current.resourceIndex || {}),
        customCharacterCategories: current.resourceIndex?.customCharacterCategories || [],
        customViewTabs: (current.resourceIndex?.customViewTabs || []).filter((t) => t !== name),
        schemaVersion: current.resourceIndex?.schemaVersion || 1
      },
      updatedAt: new Date().toISOString()
    }));
    await loadBooks();
    if (view === name) setView('全部');
  };

  // 删除树中的分类：分类节点存于 customCharacterCategories（非 customViewTabs）。
  // 分类下的角色不删除，迁入「其他角色」并清除旧分类归属，符合确认文案。
  const deleteTreeCategory = async (name: string) => {
    const OTHER = '其他角色';
    if (name === OTHER) {
      island.show({ type: 'warning', message: '“其他角色”是保留角色的兜底分类，不能删除' });
      setPendingDeleteCategory(null);
      return;
    }
    await updateBook(book.id, (current) => {
      const categories = structuredClone(current.resourceIndex?.customCharacterCategories ?? []);
      let other = categories.find((c) => c.name === OTHER);
      for (const cat of categories) {
        if (cat.name !== name || !cat.children.length) continue;
        for (const role of cat.children) {
          role.customFields = {
            ...(role.customFields || {}),
            category: OTHER
          };
        }
        if (!other) {
          other = { id: crypto.randomUUID(), name: OTHER, isAuto: false, children: [], order: categories.length };
          categories.push(other);
        }
        other.children.push(...cat.children);
        cat.children = [];
      }
      const nextCategories = categories.filter((c) => c.name !== name);
      return {
        ...current,
        resourceIndex: {
          ...(current.resourceIndex || {}),
          customCharacterCategories: nextCategories,
          customViewTabs: Array.from(
            new Set([...(current.resourceIndex?.customViewTabs || []).filter((t) => t !== name), OTHER])
          ),
          schemaVersion: current.resourceIndex?.schemaVersion || 1
        },
        updatedAt: new Date().toISOString()
      };
    });
    await loadBooks();
    if (view === name) setView('全部');
    setPendingDeleteCategory(null);
  };

  const deleteCategoryAndRoles = async (name: string, roleIds: string[]) => {
    if (roleDeleteBusyRef.current) return;
    roleDeleteBusyRef.current = true;
    try {
      const idSet = new Set(roleIds);
      const names = roleItems.filter((r) => idSet.has(r.role.id)).map((r) => r.role.name);
      
      const roleIdentitySet = new Set<string>();
      for (const roleName of names) {
        roleIdentitySet.add(roleName.trim().toLowerCase());
        const roleProfile = roleItems.find((r) => r.role.name === roleName)?.role;
        for (const alias of roleProfile?.aliases || []) roleIdentitySet.add(alias.trim().toLowerCase());
      }

      const isRoleArchiveRecord = (record: any) => {
        const subject = (record.subject || '').trim().toLowerCase();
        const target = (record.target || '').trim().toLowerCase();
        const title = (record.title || '').trim().toLowerCase();
        return (
          record.kind === 'character' ||
          roleIdentitySet.has(subject) ||
          roleIdentitySet.has(target) ||
          roleIdentitySet.has(title) ||
          (record.tags || []).includes('角色档案')
        );
      };

      const cleanedMemoryBankForDisk: any[] = [];

      await updateBook(book.id, (current) => {
        const categories = structuredClone(current.resourceIndex?.customCharacterCategories ?? []);
        for (const cat of categories) {
          cat.children = cat.children.filter((role) => !idSet.has(role.id));
        }
        const nextCategories = categories.filter((c) => c.name !== name);
        
        const cleanedMemoryBank = (current.memoryBank || []).map((memory) => ({
          ...memory,
          archiveRecords: (memory.archiveRecords || []).filter((r) => !isRoleArchiveRecord(r))
        }));
        cleanedMemoryBankForDisk.push(...cleanedMemoryBank);
        
        const storyArchiveIndex = buildStoryArchiveIndex(cleanedMemoryBank);

        return {
          ...current,
          memoryBank: cleanedMemoryBank,
          resourceIndex: {
            ...(current.resourceIndex || {}),
            customCharacterCategories: nextCategories,
            customViewTabs: (current.resourceIndex?.customViewTabs || []).filter((t) => t !== name),
            storyArchiveIndex,
            schemaVersion: current.resourceIndex?.schemaVersion || 1
          },
          updatedAt: new Date().toISOString()
        };
      });

      await electronAPI.fs.saveMemoryBank({ bookId: book.id, memoryBank: cleanedMemoryBankForDisk });
      await useBookStore.getState().saveMemoryBank(book.id, cleanedMemoryBankForDisk, true);

      await Promise.all([
        ...names.map((roleName) => electronAPI.resources.cleanupResidue({ bookId: book.id, roleName })),
        loadBooks()
      ]);
      
      if (view === name) setView('全部');
      island.show({ type: 'success', message: `已删除分类及 ${roleIds.length} 个角色`, autoHideMs: 1200 });
    } catch (error) {
      island.show({ type: 'error', message: '删除分类失败', detail: error instanceof Error ? error.message : String(error) });
    }
    roleDeleteBusyRef.current = false;
  };

  // 重命名树中的分类：同步分类节点名、其下角色的 category 归属，以及同名 customViewTabs。
  const renameTreeCategory = async (oldName: string, newNameRaw: string) => {
    const trimmed = (newNameRaw || '').trim();
    if (!trimmed || trimmed === oldName) return;
    const builtins = new Set(['全部', ...DEFAULT_ROLE_CATEGORIES.map((c) => c.name), '装备库', '技能/功法']);
    if (builtins.has(trimmed)) {
      island.show({ type: 'warning', message: '不能与内置分类同名' });
      return;
    }
    await updateBook(book.id, (current) => {
      const categories = structuredClone(current.resourceIndex?.customCharacterCategories ?? []);
      const existing = categories.find((c) => c.name === trimmed);
      for (const cat of categories) {
        if (cat.name !== oldName) continue;
        for (const role of cat.children) {
          role.customFields = { ...(role.customFields || {}), category: trimmed };
        }
        if (existing && existing !== cat) {
          existing.children.push(...cat.children);
          cat.children = [];
        } else {
          cat.name = trimmed;
        }
      }
      const nextCategories = existing ? categories.filter((c) => c.name !== oldName) : categories;
      const tabs = (current.resourceIndex?.customViewTabs || []).map((tab) => (tab === oldName ? trimmed : tab));
      return {
        ...current,
        resourceIndex: {
          ...(current.resourceIndex || {}),
          customCharacterCategories: nextCategories,
          customViewTabs: Array.from(new Set(tabs)),
          schemaVersion: current.resourceIndex?.schemaVersion || 1
        },
        updatedAt: new Date().toISOString()
      };
    });
    await loadBooks();
    if (view === oldName) setView(trimmed as any);
  };

  const renameCustomTab = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || customViewTabs.includes(trimmed)) return;
    const builtins = new Set(['全部', ...DEFAULT_ROLE_CATEGORIES.map((c) => c.name), '装备库', '技能/功法']);
    if (builtins.has(trimmed)) {
      island.show({ type: 'warning', message: '不能与内置分类同名' });
      return;
    }
    await updateBook(book.id, (current) => {
      const tabs = (current.resourceIndex?.customViewTabs || []).map(t => t === oldName ? trimmed : t);
      const categories = structuredClone(current.resourceIndex?.customCharacterCategories || []);
      categories.forEach(cat => {
        cat.children.forEach(role => {
          if (role.customFields && role.customFields.category === oldName) {
            role.customFields.category = trimmed;
          }
        });
      });
      return {
        ...current,
        resourceIndex: {
          ...(current.resourceIndex || {}),
          customCharacterCategories: categories,
          customViewTabs: tabs,
          schemaVersion: current.resourceIndex?.schemaVersion || 1
        },
        updatedAt: new Date().toISOString()
      };
    });
    await loadBooks();
    if (view === oldName) setView(trimmed as any);
  };

 const roleItems = useMemo(() => {
 const categories = book.resourceIndex?.customCharacterCategories ?? [];
 if (categories.length === 0) return [] as RoleWithCategory[];

 const rawItems = categories.flatMap((category) =>
  (category.children || []).map((role) => ({
   role,
   categoryId: category.id,
   categoryName: category.name,
  }))
 );
 if (rawItems.length === 0) return [] as RoleWithCategory[];

 const merged = new Map<string, RoleWithCategory>();
 // 维护独立的唯一值数组，避免每次迭代都从 Map.values() 重建
 const uniqueValues: RoleWithCategory[] = [];
 // 角色很多时跳过 O(n) 别名互扫合并（打开侧栏卡死主因之一）
 const allowAliasScan = rawItems.length <= 80;

 for (const item of rawItems) {
  if (isGenericNonRoleCardName(item.role.name)) continue;
  // 本名 + 全部别名/游戏 ID 都作为身份键，避免「苏柳青」与「柳叶青青」各出一张卡
  const identities = [item.role.name, ...(item.role.aliases || [])]
   .map(normalizeRoleIdentity)
   .filter((id) => id.length >= 2);

  let existing: RoleWithCategory | undefined = undefined;
  const keyHit = identities.find((id) => merged.has(id));
  if (keyHit) {
   existing = merged.get(keyHit);
  } else if (allowAliasScan) {
   const linked = uniqueValues.find((entry) => shouldMergeRoleCards(entry.role, item.role));
   if (linked) existing = linked;
  }

  const nextItem = existing ? mergeRoleProfiles(existing, item) : item;

  if (existing) {
   const idx = uniqueValues.indexOf(existing);
   if (idx >= 0) uniqueValues.splice(idx, 1, nextItem);
   for (const [storedKey, storedValue] of Array.from(merged.entries())) {
    if (storedValue === existing) merged.delete(storedKey);
   }
  } else {
   uniqueValues.push(nextItem);
  }

  const nextIdentities = [nextItem.role.name, ...(nextItem.role.aliases || []), ...identities]
   .map(normalizeRoleIdentity)
   .filter((id) => id.length >= 2);
  for (const alias of Array.from(new Set(nextIdentities))) {
   merged.set(alias, nextItem);
  }
  if (nextIdentities.length === 0) merged.set(nextItem.role.id, nextItem);
 }
 return uniqueValues.sort((a, b) => a.role.name.localeCompare(b.role.name, 'zh-CN'));
 }, [book.resourceIndex?.customCharacterCategories]);

 useEffect(() => {
 const showEquipmentDebug = () => {
 const lines: string[] = [];
 for (const item of roleItems) {
 const equipArr = item.role.equipment || [];
 const equipCustom = item.role.customFields?.equipment || '';
 const equipDetails = item.role.customFields?.equipmentDetails || '';
 if (equipArr.length === 0 && !equipCustom && !equipDetails) continue;
 lines.push(`【${item.role.name}】`);
 lines.push(` equipment 数组: ${JSON.stringify(equipArr)}`);
 lines.push(` customFields.equipment: ${equipCustom || '(空)'}`);
 if (equipDetails) lines.push(` equipmentDetails: ${equipDetails}`);
 lines.push('');
 }
 setDebugDialog({ title: '装备数据', content: lines.join('\n') || '没有装备数据' });
 };
 const showSkillDebug = () => {
 const lines: string[] = [];
 for (const item of roleItems) {
 const skillArr = item.role.abilities || [];
 const skillCustom = item.role.customFields?.skills || '';
 const skillDetails = item.role.customFields?.skillDetails || '';
 if (skillArr.length === 0 && !skillCustom && !skillDetails) continue;
 lines.push(`【${item.role.name}】`);
 lines.push(` abilities 数组: ${JSON.stringify(skillArr)}`);
 lines.push(` customFields.skills: ${skillCustom || '(空)'}`);
 if (skillDetails) lines.push(` skillDetails: ${skillDetails}`);
 lines.push('');
 }
 setDebugDialog({ title: '技能数据', content: lines.join('\n') || '没有技能数据' });
 };
 window.addEventListener('xly:show-equipment-debug', showEquipmentDebug);
 window.addEventListener('xly:show-skill-debug', showSkillDebug);
 return () => {
 window.removeEventListener('xly:show-equipment-debug', showEquipmentDebug);
 window.removeEventListener('xly:show-skill-debug', showSkillDebug);
 };
 }, [roleItems]);

 const roleArchiveStats = useMemo(() => {
 let timelineCount = 0;
 let equipmentCount = 0;
 let skillCount = 0;
 for (const item of roleItems) {
 // 轻量计数：直接读取已有数组长度，避免重复 JSON 解析和 Map 合并
 const timelineArr = Array.isArray(item.role.relationshipTimeline) ? item.role.relationshipTimeline : [];
 // 尝试快速判断 customFields 中的额外历程数量
 const cfTimeline = item.role.customFields?.relationshipTimeline;
 let cfCount = 0;
 if (Array.isArray(cfTimeline)) {
 cfCount = cfTimeline.length;
 } else if (typeof cfTimeline === 'string' && cfTimeline.trim().startsWith('[')) {
 try { cfCount = (JSON.parse(cfTimeline) as unknown[]).length; } catch { cfCount = 0; }
 }
 timelineCount += Math.max(timelineArr.length, cfCount);
 equipmentCount += uniqueAssetList([...(item.role.equipment || []), ...parseList(cleanRoleText(item.role.customFields?.equipment || ''))]).length;
 // 技能：直接用已有 abilities 数组减少字符串解析
 const skillsText = item.role.customFields?.skills || '';
 skillCount += skillsText
 ? parseList(cleanRoleText(skillsText)).length
 : (item.role.abilities || []).length;
 }
 return { roles: roleItems.length, timelineCount, equipmentCount, skillCount };
 }, [roleItems]);

 /** 树分类列表：用 memo 避免每次渲染 inline 重算 */
 const treeCategories = useMemo(() => {
  const ordered = (book.resourceIndex?.customCharacterCategories ?? [])
   .slice()
   .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
   .map((c: any) => c.name)
   .filter(Boolean);
  const defaultCategories = DEFAULT_ROLE_CATEGORIES.map((c) => c.name);
  const orderedCustom = ordered.filter((name: string) => !defaultCategories.includes(name));
  const tabs = customViewTabs.filter(
   (t) => !defaultCategories.includes(t) && !orderedCustom.includes(t)
  );
  const list = [...defaultCategories, ...orderedCustom, ...tabs];
  const RESERVED = new Set(['全部', '装备库', '技能/功法']);
  const orphanCats = Array.from(
   new Set(roleItems.map((item) => categoryFromRole(item.role, customViewTabs)))
  ).filter((cat) => Boolean(cat) && !RESERVED.has(cat) && !list.includes(cat));
  return Array.from(new Set([...list, ...orphanCats]));
 }, [book.resourceIndex?.customCharacterCategories, customViewTabs, roleItems]);

 const filteredRoles = useMemo(() => {
 if (view === '全部') {
 return roleItems;
 }
 if (view === '主角') {
 return roleItems.filter((item) => {
 const cat = categoryFromRole(item.role, customViewTabs);
 return cat === '主角';
 });
 }
 if (view === '技能/功法') {
 return roleItems.filter((item) => {
 const hasSkills = (item.role.abilities || []).length > 0 || Boolean(item.role.customFields?.skills?.trim());
 return hasSkills;
 });
 }
 // 自定义分类标签：按 customFields.category 匹配
 if (customViewTabs.includes(view as string)) {
 return roleItems.filter((item) => {
 const cat = (item.role.customFields?.category || '').trim();
 return cat === view;
 });
 }
 return roleItems.filter((item) => categoryFromRole(item.role, customViewTabs) === view);
 }, [roleItems, view, customViewTabs]);

 const factionRoles = useMemo(
 () =>
 roleItems.filter((item) => {
 const category = categoryFromRole(item.role, customViewTabs);
 return Boolean(item.role.faction?.trim()) || category === '主角';
 }),
 [roleItems, customViewTabs]
 );

 const factionGroups = useMemo(() => {
 const map = new Map<string, RoleWithCategory[]>();
 for (const item of factionRoles) {
 const key = item.role.faction?.trim() || (categoryFromRole(item.role, customViewTabs) === '主角' ? '主角团' : '未归属势力');
 const list = map.get(key) || [];
 list.push(item);
 map.set(key, list);
 }
 return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'));
 }, [factionRoles]);
 const factionOptions = useMemo(() => {
 const names = new Set<string>(['主角团']);
 for (const item of roleItems) {
 const faction = cleanRoleText(item.role.faction);
 if (faction) names.add(faction);
 }
 return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'));
 }, [roleItems]);
 const allFactionsCollapsed =
 factionGroups.length > 0 && factionGroups.every(([name]) => collapsedFactions.has(name));

 const absoluteProtagonistId = useMemo(
 () =>
 roleItems.find((item) => item.role.roleType === '主角')?.role.id ||
 roleItems.find((item) => (item.role.customFields?.category || '').trim() === '主角')?.role.id ||
 null,
 [roleItems]
 );

 const editingRole = useMemo(() => roleItems.find((item) => item.role.id === editingRoleId) || null, [editingRoleId, roleItems]);
 // 与 RolesTree groupedRoles 保持同一套逻辑：优先 customFields.category，回退 categoryName
 const editingRoleCategoryName = useMemo(() => {
  if (!editingRole) return null;
  const eff = ((editingRole.role.customFields?.category) || '').trim() || editingRole.categoryName;
  return eff || null;
 }, [editingRole]);

 // 关系图：只读角色卡结构化关系字段；列表态不算；绝不碰 memoryBank/正文
 const relationGraph = useMemo(() => {
  if (panelTab !== 'graph') return { nodes: [], edges: [] as RelationEdge[] };
  return gatherRelationData(book, roleItems);
 }, [panelTab, roleItems, book.resourceIndex?.customCharacterCategories]);
 const nodeById = useMemo(() => new Map(roleItems.map((item) => [item.role.id, item.role.name])), [roleItems]);
 const selectedEdge = useMemo(
 () => relationGraph.edges.find((item) => item.id === selectedEdgeId) || null,
 [relationGraph.edges, selectedEdgeId]
 );
 const mergePrimary = useMemo(() => roleItems.find((item) => item.role.id === mergePrimaryId) || null, [mergePrimaryId, roleItems]);
 const mergeSecondary = useMemo(() => roleItems.find((item) => item.role.id === mergeSecondaryId) || null, [mergeSecondaryId, roleItems]);
 const cancelMergeSelection = () => {
 setMergeDialogOpen(false);
 setMergeSelectMode(false);
 setMergeSelectedIds([]);
 setMergePrimaryId('');
 setMergeSecondaryId('');
 };
 const closeEditor = () => {
 cancelMergeSelection();
 setEditorMode(null);
 setEditingRoleId(null);
 setDraft(emptyDraft());
 setPanelTab('list');
 };

 useEffect(() => {
 if (!editingRoleId || editorMode === 'create') return;
 if (!editingRole) closeEditor();
 }, [editingRoleId, editorMode, editingRole]);

 const openCreate = () => {
 cancelMergeSelection();
 setEditorMode('create');
 setEditingRoleId(null);
 setDraft(emptyDraft());
 setPanelTab('editor');
 };

 const selectRoleForMerge = (roleId: string) => {
 if (!mergeSelectMode) return;
 const next = mergeSelectedIds.includes(roleId)
 ? mergeSelectedIds.filter((id) => id !== roleId)
 : [...mergeSelectedIds, roleId].slice(0, 2);

 setMergeSelectedIds(next);
 if (next.length === 2) {
 setMergePrimaryId(next[0]);
 setMergeSecondaryId(next[1]);
 setMergeDialogOpen(true);
 } else {
 setMergeDialogOpen(false);
 setMergePrimaryId(next[0] || '');
 setMergeSecondaryId('');
 }
 };

 const startMergeFromRole = (roleId: string) => {
 if (roleItems.length < 2) {
 island.show({ type: 'warning', message: '至少需要两张角色卡才能合并。' });
 return;
 }
 setEditorMode(null);
 setPanelTab('list');
 setMergeDialogOpen(false);
 setMergeSelectMode(true);
 setMergeSelectedIds([roleId]);
 setMergePrimaryId(roleId);
 setMergeSecondaryId('');
 island.show({ type: 'success', message: '已选择主卡，请点击要合并进来的角色卡。', autoHideMs: 1800 });
 };

 const openMergeDialog = () => {
 if (mergeSelectMode) {
 cancelMergeSelection();
 return;
 }
 if (roleItems.length < 2) {
 island.show({ type: 'warning', message: '至少需要两张角色卡才能合并。' });
 return;
 }
 setEditorMode(null);
 setPanelTab('list');
 setView('全部');
 setMergeSelectMode(true);
 setMergeSelectedIds([]);
 setMergePrimaryId('');
 setMergeSecondaryId('');
 setMergeDialogOpen(false);
 island.show({ type: 'success', message: '合并模式：先点击保留的主卡，再点击要合并的副卡。', autoHideMs: 2200 });
 };

 const openEdit = (item: RoleWithCategory) => {
 cancelMergeSelection();
 setEditorMode('edit');
 setEditingRoleId(item.role.id);
 setDraft(draftFromRole(item.role));
 setPanelTab('editor');
 };

 const ensureCategory = (categories: NonNullable<Book['resourceIndex']>['customCharacterCategories'], name: string) => {
 const hit = categories.find((item) => item.name === name);
 if (hit) return hit;
 const created = {
 id: crypto.randomUUID(),
 name,
 isAuto: false,
 children: [],
 order: categories.length
 };
 categories.push(created);
 return created;
 };

 const withUpdatedRoles = async (mutator: (categories: NonNullable<Book['resourceIndex']>['customCharacterCategories']) => void) => {
 await updateBook(book.id, (current) => {
 const categories = structuredClone(current.resourceIndex?.customCharacterCategories ?? []);
 mutator(categories);
 return {
 ...current,
 resourceIndex: {
 ...(current.resourceIndex || {}),
 customCharacterCategories: categories,
 schemaVersion: current.resourceIndex?.schemaVersion || 1
 },
 updatedAt: new Date().toISOString()
 };
 });
 // 角色变更走 patch_book_meta 防抖（700ms）。若立刻 loadBooks 会从磁盘读回旧数据，
 // 造成“删除后瞬间回弹”。这里强制刷盘，保证后续重载一致。
 await flushBookMetaPatches();
 };

 // 可见卡可能由同人多条底层记录合并（真名 + 游戏 ID）。
 // 仅按展示 id 删会漏兄弟记录 → 列表合并后又“复活”。
 // 只按 name/aliases 身份键展开，不用描述语义关联，避免误删无关角色。
 const expandRoleIds = (categories: any[], seedIds: Set<string>): Set<string> => {
 const all = categories.flatMap((c: any) => (c.children as any[]) || []);
 const seeds = all.filter((r: any) => seedIds.has(r.id));
 const identities = new Set<string>();
 for (const s of seeds) {
 for (const nm of [s.name, ...((s.aliases as string[]) || [])]) {
 const key = normalizeRoleIdentity(nm);
 if (key.length >= 2) identities.add(key);
 }
 }
 const result = new Set<string>(seedIds);
 if (identities.size === 0) return result;
 for (const r of all) {
 if (result.has(r.id)) continue;
 const rKeys = [r.name, ...((r.aliases as string[]) || [])]
  .map(normalizeRoleIdentity)
  .filter((k) => k.length >= 2);
 if (rKeys.some((k) => identities.has(k))) result.add(r.id);
 }
 return result;
 };

 const handleExportRoles = async (format: 'json' | 'txt') => {
  try {
   const res = await exportRoles(book, format);
   if (res === 'saved') island.show({ type: 'success', message: `已导出角色档案（${format.toUpperCase()}）`, autoHideMs: 1600 });
  } catch (error) {
   island.show({ type: 'error', message: '导出角色失败', detail: error instanceof Error ? error.message : String(error) });
  }
 };

 const handleImportRoles = async (format: 'json' | 'txt') => {
  try {
   const res = await importRolesFromFile(book, format);
   if (res.cancelled) return;
   await updateBook(book.id, (current) => ({
    ...current,
    resourceIndex: {
     ...(current.resourceIndex || {}),
     customCharacterCategories: res.categories as any,
     schemaVersion: current.resourceIndex?.schemaVersion || 1,
    },
    updatedAt: new Date().toISOString(),
   }));
   await loadBooks();
   const { added, updated, newCategories } = res.stats;
   island.show({ type: 'success', message: `角色导入完成：新增 ${added}，更新 ${updated}，新建分类 ${newCategories}`, autoHideMs: 2800 });
  } catch (error) {
   island.show({ type: 'error', message: '导入角色失败', detail: error instanceof Error ? error.message : String(error) });
  }
 };

 const updateRoleFaction = async (roleId: string, faction: string) => {
 const nextFaction = cleanRoleText(faction);
 await withUpdatedRoles((categories) => {
 for (const category of categories) {
 const role = category.children.find((item) => item.id === roleId);
 if (!role) continue;
 role.faction = nextFaction;
 role.customFields = {
 ...(role.customFields || {}),
 faction: nextFaction
 };
 break;
 }
 });
 await loadBooks();
 };

 const quickAddRole = async () => {
 if (!quickAddRoleDialog || !quickAddRoleDialog.name.trim()) return;
 const name = quickAddRoleDialog.name.trim();
 const detail = (quickAddRoleDialog.detail || '').trim();
 const category = quickAddRoleDialog.category;
 const editId = quickAddRoleDialog.editRoleId;
 try {
 if (editId) {
 // 编辑模式：更新已有条目
 await withUpdatedRoles((categories) => {
 for (const cat of categories) {
 for (const role of cat.children) {
 if (role.id === editId) {
 role.name = name;
 role.description = detail;
 }
 }
 }
 });
 await loadBooks();
 island.show({ type: 'success', message: `已更新条目「${name}」`, autoHideMs: 1200 });
 } else {
 // 创建模式
 await withUpdatedRoles((categories) => {
 const bucketName = customViewTabs.includes(category) ? '配角' : (category || '配角');
 const bucket = ensureCategory(categories, bucketName);
 bucket.children.push({
 id: crypto.randomUUID(),
 name,
 faction: '',
 roleType: '待分类',
 description: detail,
 aliases: parseList(cleanRoleText(draft.aliases)),
 firstAppearance: '',
 chapters: [],
 abilities: [],
 inventory: [],
 plotProgress: '',
 relationshipTimeline: [],
 customFields: {
 category: customViewTabs.includes(category) ? category : '配角',
 isCustomEntry: 'true',
 items: '', relatedPlot: '', skills: '', equipment: '', relations: '',
 relationshipTimeline: '[]', relationshipTimelineText: ''
 }
 });
 });
 await loadBooks();
 island.show({ type: 'success', message: `已新增条目「${name}」`, autoHideMs: 1200 });
 }
 setQuickAddRoleDialog(null);
 } catch (error) {
 island.show({ type: 'error', message: '操作失败', detail: error instanceof Error ? error.message : String(error) });
 }
 };

 const saveCreate = async () => {
 const name = cleanRoleText(draft.name);
 if (!name) {
 island.show({ type: 'warning', message: '请先填写角色姓名' });
 return;
 }

 try {
 const activeCategory: RoleView = view === '全部' ? '配角' : view;
 // 如果当前在自定义分类标签下，角色的 category 设为该自定义标签名
 const resolvedCategoryForField = (activeCategory as string) || normalizeRoleType(draft.roleType);
 const relationshipTimeline = mergeRelationshipTimeline(draft.relationshipTimeline);
  const newId = crypto.randomUUID();
  await withUpdatedRoles((categories) => {
  // 内置分类走 ensureCategory；自定义标签统一放到"配角"桶下，靠 customFields.category 区分
  const bucketName = customViewTabs.includes(activeCategory as string) ? '配角' : activeCategory;
  const bucket = ensureCategory(categories, bucketName);
  bucket.children.push({
  id: newId,
 name,
 faction: cleanRoleText(draft.faction),
 roleType: normalizeRoleType(draft.roleType),
 description: cleanRoleText(draft.description),
 aliases: parseList(cleanRoleText(draft.aliases)),
 firstAppearance: '',
 chapters: [],
 abilities: parseSkillChips(draft.appearance).map((s) => s.name),
 inventory: parseList(cleanRoleText(draft.items)),
 plotProgress: cleanRoleText(draft.relatedPlot),
 relationshipTimeline,
 customFields: {
 category: resolvedCategoryForField,
 personality: cleanRoleText(draft.personality),
 appearance: JSON.stringify(parseSkillChips(draft.appearance)),
 other: JSON.stringify(parseSkillChips(draft.other)),
 items: cleanRoleText(draft.items),
 relatedPlot: cleanRoleText(draft.relatedPlot),
 recentStatus: cleanRoleText(draft.relatedPlot),
 skills: parseSkillChips(draft.appearance).map((s) => s.name).join('、'),
 skillDetails: JSON.stringify(Object.fromEntries(parseSkillChips(draft.appearance).filter((s) => s.detail).map((s) => [s.name, s.detail]))),
 equipment: cleanRoleText(draft.equipment),
 relations: cleanRoleText(draft.relations),
 relationshipTimeline: JSON.stringify(relationshipTimeline),
 relationshipTimelineText: cleanRoleText(draft.relationshipTimeline),
 avatar: draft.avatar || '',
 extraFields: draft.extraFields || ''
 }
 });
 });
 await loadBooks();
 island.show({ type: 'success', message: '已新增角色', autoHideMs: 1200 });
 setEditingRoleId(newId);
 setEditorMode('edit');
 } catch (error) {
 island.show({ type: 'error', message: '新增角色失败', detail: error instanceof Error ? error.message : String(error) });
 }
 };

 const saveEdit = async () => {
 if (!editingRoleId || !editingRole) return;

 try {
 const relationshipTimeline = mergeRelationshipTimeline(draft.relationshipTimeline);
 await withUpdatedRoles((categories) => {
 for (const category of categories) {
 for (const role of category.children) {
 if (role.id !== editingRoleId) continue;
 role.name = cleanRoleText(draft.name, '未命名角色');
 role.aliases = parseList(cleanRoleText(draft.aliases));
 role.faction = cleanRoleText(draft.faction);
 role.description = cleanRoleText(draft.description);
 role.roleType = normalizeRoleType(draft.roleType);
 role.abilities = parseSkillChips(draft.appearance).map((s) => s.name);
 role.inventory = parseList(cleanRoleText(draft.items));
 role.plotProgress = cleanRoleText(draft.relatedPlot);
 role.relationshipTimeline = relationshipTimeline;
 role.customFields = {
 ...(role.customFields || {}),
 category: role.customFields?.category || normalizeRoleType(draft.roleType),
 personality: cleanRoleText(draft.personality),
 appearance: JSON.stringify(parseSkillChips(draft.appearance)),
 other: JSON.stringify(parseSkillChips(draft.other)),
 items: cleanRoleText(draft.items),
 relatedPlot: cleanRoleText(draft.relatedPlot),
 recentStatus: cleanRoleText(draft.relatedPlot),
 skills: parseSkillChips(draft.appearance).map((s) => s.name).join('、'),
 skillDetails: JSON.stringify(Object.fromEntries(parseSkillChips(draft.appearance).filter((s) => s.detail).map((s) => [s.name, s.detail]))),
 equipment: cleanRoleText(draft.equipment),
 relations: cleanRoleText(draft.relations),
 relationshipTimeline: JSON.stringify(relationshipTimeline),
 relationshipTimelineText: cleanRoleText(draft.relationshipTimeline),
 avatar: draft.avatar || '',
 extraFields: draft.extraFields || ''
 };
 }
 }
 });
 await loadBooks();
 island.show({ type: 'success', message: '已保存角色', autoHideMs: 1200 });
 } catch (error) {
 island.show({ type: 'error', message: '保存角色失败', detail: error instanceof Error ? error.message : String(error) });
 }
 };

 const saveAssetEdit = async () => {
 if (!editAssetDialog) return;
 const name = cleanRoleText(editAssetDialog.name);
 const originalName = cleanRoleText(editAssetDialog.originalName || editAssetDialog.name);
 const detail = String(editAssetDialog.detail || '').trim();
 const selectedOwnerIds = new Set(editAssetDialog.ownerRoleIds);
 if (!name) {
 island.show({ type: 'warning', message: '请先填写名称' });
 return;
 }
 if (selectedOwnerIds.size === 0) {
 island.show({ type: 'warning', message: '请至少关联一位角色' });
 return;
 }

 try {
 console.warn('[saveAssetEdit] kind=', editAssetDialog.kind, 'name=', name, 'detail.len=', detail.length, 'owners=', Array.from(selectedOwnerIds));
 await withUpdatedRoles((categories) => {
 for (const category of categories) {
 for (const role of category.children) {
 const ownsAsset = selectedOwnerIds.has(role.id);
 if (editAssetDialog.kind === 'equipment') {
 const nextEquipment = uniqueAssetList([
 ...(role.equipment || []),
 ...parseList(role.customFields?.equipment || '')
 ]).filter((item) => item !== originalName && item !== name);
 const nextDetailMap = parseAssetDetailMap(role.customFields?.equipmentDetails);
 delete nextDetailMap[originalName];
 delete nextDetailMap[name];

 if (ownsAsset) {
 nextEquipment.push(name);
 if (detail) nextDetailMap[name] = detail;
 }

 role.equipment = nextEquipment;
 role.customFields = {
 ...(role.customFields || {}),
 equipment: nextEquipment.join('、'),
 equipmentDetails: JSON.stringify(nextDetailMap)
 };
 } else {
 const nextSkills = uniqueAssetList([
 ...(role.abilities || []),
 ...parseList(role.customFields?.skills || '')
 ]).filter((item) => item !== originalName && item !== name);
 const nextDetailMap = parseAssetDetailMap(role.customFields?.skillDetails);
 delete nextDetailMap[originalName];
 delete nextDetailMap[name];

 if (ownsAsset) {
 nextSkills.push(name);
 if (detail) nextDetailMap[name] = detail;
 }

 role.abilities = nextSkills;
 role.customFields = {
 ...(role.customFields || {}),
 skills: nextSkills.join('、'),
 skillDetails: JSON.stringify(nextDetailMap)
 };
 }
 }
 }
 });
 await loadBooks();
 setEditAssetDialog(null);
 island.show({
 type: 'success',
 message: editAssetDialog.kind === 'equipment' ? '装备已保存' : '技能/功法已保存',
 autoHideMs: 1200
 });
 } catch (error) {
 island.show({ type: 'error', message: '保存失败', detail: error instanceof Error ? error.message : String(error) });
 }
 };

 const removeRole = async (roleId: string, roleName: string) => {
 if (roleDeleteBusyRef.current) return;
 roleDeleteBusyRef.current = true;
 // 立即关闭弹窗，不等待后台 I/O 完成，避免用户感知卡顿
 setPendingDelete(null);
 try {
    // 同人合并卡：按身份键展开底层 id，一次删净，避免“删完又回弹”
    let removedIds = new Set<string>([roleId]);
    await withUpdatedRoles((categories) => {
      removedIds = expandRoleIds(categories, new Set([roleId]));
      for (const category of categories) {
        category.children = category.children.filter((role) => !removedIds.has(role.id));
      }
    });
    // withUpdatedRoles 已刷盘；内存状态已正确，勿立刻 loadBooks（曾与防抖写盘竞态导致回弹）
    if (editingRoleId && removedIds.has(editingRoleId)) closeEditor();
    void electronAPI.resources.cleanupResidue({ bookId: book.id, roleName }).catch(() => {});
    island.show({ type: 'success', message: '角色已删除，高亮已清理（不影响正文）。', autoHideMs: 1200 });
 } catch (error) {
 island.show({ type: 'error', message: '删除角色失败', detail: error instanceof Error ? error.message : String(error) });
 }
 roleDeleteBusyRef.current = false;
 };

 const batchDeleteRoles = async (ids: string[]) => {
   if (!ids.length || roleDeleteBusyRef.current) return;
   roleDeleteBusyRef.current = true;
   try {
     const seedIds = new Set(ids);
     const names = roleItems.filter((r) => seedIds.has(r.role.id)).map((r) => r.role.name);
     await withUpdatedRoles((categories) => {
        const removeIds = expandRoleIds(categories, seedIds);
        for (const category of categories) {
          category.children = category.children.filter((role) => !removeIds.has(role.id));
        }
      });
      if (editingRoleId && seedIds.has(editingRoleId)) closeEditor();
     // 不 loadBooks：防抖竞态已在 withUpdatedRoles 内 flush 解决
     void Promise.all(
       names.map((roleName) => electronAPI.resources.cleanupResidue({ bookId: book.id, roleName }))
     ).catch(() => {});
     island.show({ type: 'success', message: `已删除 ${ids.length} 个角色`, autoHideMs: 1200 });
   } catch (error) {
     island.show({ type: 'error', message: '批量删除失败', detail: error instanceof Error ? error.message : String(error) });
   }
   roleDeleteBusyRef.current = false;
 };

 const batchMoveRoles = async (ids: string[], category: string) => {
   if (!ids.length) return;
   const idSet = new Set(ids);
   try {
     await withUpdatedRoles((categories) => {
       for (const cat of categories) {
         for (const role of cat.children) {
           if (idSet.has(role.id)) {
             role.customFields = { ...(role.customFields || {}), category, sortOrder: String(Date.now()) };
           }
         }
       }
     });
     await loadBooks();
     island.show({ type: 'success', message: `已移动 ${ids.length} 个角色到「${category}」`, autoHideMs: 1200 });
   } catch (error) {
     island.show({ type: 'error', message: '批量移动失败', detail: error instanceof Error ? error.message : String(error) });
   }
 };

 const removeAllRoles = async () => {
 if (roleDeleteBusyRef.current) return;
 roleDeleteBusyRef.current = true;
 try {
 const cleanedMemoryBankForDisk: NonNullable<Book['memoryBank']> = [];
 const roleIdentitySet = new Set<string>();
 const rememberRoleIdentity = (value: unknown) => {
   const text = String(value || '').trim().toLowerCase();
   if (text) roleIdentitySet.add(text);
 };
 await updateBook(book.id, (current) => {
 const categories = structuredClone(current.resourceIndex?.customCharacterCategories ?? []);
 for (const category of categories) {
   for (const role of category.children || []) {
     rememberRoleIdentity(role.name);
     for (const alias of role.aliases || []) rememberRoleIdentity(alias);
    }
    category.children = [];
  }
  categories.length = 0;
 const isRoleArchiveRecord = (record: StoryArchiveRecord) => {
   const subject = String(record.subject || '').trim().toLowerCase();
   const target = String(record.target || '').trim().toLowerCase();
   const title = String(record.title || '').trim().toLowerCase();
   return (
     record.kind === 'character' ||
     roleIdentitySet.has(subject) ||
     roleIdentitySet.has(target) ||
     roleIdentitySet.has(title) ||
     String(record.id || '').startsWith('role-') ||
     record.evidence === '来自用户编辑的角色档案' ||
     (record.tags || []).includes('角色档案')
   );
 };
  const cleanedMemoryBank = (current.memoryBank || []).map((memory) => ({
    ...memory,
    archiveRecords: (memory.archiveRecords || []).filter((r) => !isRoleArchiveRecord(r))
  }));
 cleanedMemoryBankForDisk.push(...cleanedMemoryBank);
 const storyArchiveIndex = buildStoryArchiveIndex(cleanedMemoryBank);
 return {
   ...current,
   memoryBank: cleanedMemoryBank,
   resourceIndex: {
   ...(current.resourceIndex || {}),
    customCharacterCategories: [],
    customViewTabs: [],
    storyArchiveIndex,
   characterScan: undefined,
   roleExtractState: undefined,
   schemaVersion: current.resourceIndex?.schemaVersion || 1
   },
   updatedAt: new Date().toISOString()
 };
 });
 // 同步清理磁盘上的 memoryBank 文件
 // 同步清理磁盘上的 memoryBank 文件 (传入 skipMerge=true 彻底阻断残余记录复活角色)
  await electronAPI.fs.saveMemoryBank({ bookId: book.id, memoryBank: cleanedMemoryBankForDisk });
  await useBookStore.getState().saveMemoryBank(book.id, cleanedMemoryBankForDisk, true);
 // 触发全书物理清理
 island.show({ type: 'progress', message: '正在清理全书本地残留高亮...' });
 await electronAPI.resources.cleanupResidue({ bookId: book.id });
 
 await loadBooks();
 island.show({ type: 'success', message: '已清空角色库并清理高亮（不影响正文）。', autoHideMs: 1400 });
 setPendingDeleteAll(false);
 setPendingDelete(null);
 closeEditor();
 } catch (error) {
 island.show({ type: 'error', message: '清空角色库失败', detail: error instanceof Error ? error.message : String(error) });
 }
 roleDeleteBusyRef.current = false;
 };

 const mergeRoles = async () => {
 if (!mergePrimaryId || !mergeSecondaryId || mergePrimaryId === mergeSecondaryId) {
 island.show({ type: 'warning', message: '请选择两张不同的角色卡。' });
 return;
 }

 try {
 await withUpdatedRoles((categories) => {
 let primary: RoleWithCategory | null = null;
 let secondary: RoleWithCategory | null = null;

 for (const category of categories) {
 for (const role of category.children) {
 if (role.id === mergePrimaryId) {
 primary = { role, categoryId: category.id, categoryName: category.name };
 }
 if (role.id === mergeSecondaryId) {
 secondary = { role, categoryId: category.id, categoryName: category.name };
 }
 }
 }

 if (!primary || !secondary) return;

 const merged = mergeRoleProfiles(primary, secondary).role;
 const primaryRole = primary.role;
 Object.assign(primaryRole, {
 ...merged,
 id: primaryRole.id,
 name: primaryRole.name || merged.name,
 aliases: Array.from(
 new Set([...(merged.aliases || []), secondary.role.name].map((name) => cleanRoleText(name)).filter(Boolean))
 )
 });

 for (const category of categories) {
 category.children = category.children.filter((role) => role.id !== mergeSecondaryId);
 }
 });

 await loadBooks();
 cancelMergeSelection();
 setView('全部');
 island.show({ type: 'success', message: '角色档案已合并', autoHideMs: 1400 });
 } catch (error) {
 island.show({ type: 'error', message: '合并角色失败', detail: error instanceof Error ? error.message : String(error) });
 }
 };

 const openExtractDialog = () => {
 if (extracting) return;
 const lastCh = book.resourceIndex?.roleExtractState?.lastExtractedChapterId;
 const startNum = lastCh ? Number(lastCh) + 1 : 1;
 const total = Math.max(1, book.chapters.length || 1);
 setExtractStartChapter(String(Math.min(startNum, total)));
 setExtractEndChapter(String(Math.min(startNum + 8, total)));
 setExtractDialogOpen(true);
 };

 const showRecoveryPrompt = (prompt: RecoveryPrompt) => {
 setRecoveryPrompt(prompt);
 island.show({
 type: 'warning',
 status: 'feedback',
 message: prompt.title,
 detail: prompt.detail,
 actions: [
 {
 id: 'resume',
 label: '继续',
 onClick: () => {
 setRecoveryPrompt(null);
 prompt.onResume();
 }
 },
 {
 id: 'dismiss',
 label: '稍后',
 onClick: () => setRecoveryPrompt(null)
 }
 ]
 });
 };

 const extractRolesFromBook = async (resumeStartChapter?: number, resumeEndChapter?: number) => {
 if (extracting) return;
 const total = Math.max(1, book.chapters.length || 1);
 const rawStart = Number(resumeStartChapter ?? extractStartChapter);
 const rawEnd = Number(resumeEndChapter ?? extractEndChapter);
 const startChapter = Number.isFinite(rawStart) ? Math.max(1, Math.min(total, Math.floor(rawStart))) : 1;
 const endChapter = Number.isFinite(rawEnd) ? Math.max(startChapter, Math.min(total, Math.floor(rawEnd))) : startChapter;
 setExtracting(true);
 let interruptedStart = startChapter;
 let interruptedEnd = Math.min(startChapter + 2, endChapter);
 try {
 // 角色档案按 3 章一批提取：降低上下文压力，避免模型把配角和 NPC 压缩掉。
 const CHUNK_SIZE = 3;
 let totalExtracted = 0;
 let lastScanned = 0;

 for (let currentStart = startChapter; currentStart <= endChapter; currentStart += CHUNK_SIZE) {
 const currentEnd = Math.min(currentStart + CHUNK_SIZE - 1, endChapter);
 interruptedStart = currentStart;
 interruptedEnd = currentEnd;
 island.show({ 
 type: 'progress', 
 status: 'thinking', 
 message: `正在提取角色档案 (${currentStart}-${currentEnd}章)...` 
 });

 const extracted = await electronAPI.resources.extractRoles({
 bookId: book.id,
 startChapter: currentStart,
 endChapter: currentEnd,
 novelType
 });

 if (!extracted?.success) {
 throw new Error(extracted?.error || `第${currentStart}-${currentEnd}章角色提取失败`);
 }

 const payload = extracted?.extracted || [];
 if (payload.length > 0) {
 const latestBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
 const categories = applyExtractedRoleCandidatesToCategories(latestBook.resourceIndex?.customCharacterCategories, payload);
 await updateBook(book.id, {
 resourceIndex: {
 ...(latestBook.resourceIndex || {}),
 customCharacterCategories: categories,
 schemaVersion: latestBook.resourceIndex?.schemaVersion || 1
 }
 });
 await flushBookMetaPatches();
 totalExtracted += payload.length;
 lastScanned = currentEnd;
 }

 await loadBooks();
 }

 setPanelTab('list');
 setExtractDialogOpen(false);
 
 if (totalExtracted === 0) {
 island.show({ type: 'warning', message: '未提取到可入库角色，请补充正文后重试。' });
 } else {
 island.show({
 type: 'success',
 message: `角色提取任务完成：本次共新增/更新 ${totalExtracted} 个历史相关角色（扫描至第${lastScanned}章）`,
 autoHideMs: 3000
 });
 }
 } catch (error) {
 const reason = error instanceof Error ? error.message : String(error);
 island.show({ type: 'error', message: '角色提取过程中断', detail: reason });
 showRecoveryPrompt({
 title: 'AI 角色提取中断',
 detail: `中断在第 ${interruptedStart}-${interruptedEnd} 章。已成功导入的角色不会丢失，点击继续会从这一批重新提取到第 ${endChapter} 章。原因：${reason}`,
 onResume: () => void extractRolesFromBook(interruptedStart, endChapter)
 });
 } finally {
 setExtracting(false);
 }
 };

 const overlayCategory: RoleView =
 editorMode === 'edit' && editingRoleCategoryName ? (editingRoleCategoryName as RoleView) : view;

   return (
   <>
   {recoveryPrompt ? (
   <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/45 px-4">
   <div className="w-full max-w-md border border-amber-300/35 !bg-zinc-900/60 p-5 shadow-2xl">
   <div className="text-lg font-bold !text-zinc-100">{recoveryPrompt.title}</div>
   <div className="mt-3 whitespace-pre-wrap text-sm leading-7 !text-zinc-300">{recoveryPrompt.detail}</div>
   <div className="mt-5 flex justify-end gap-3">
   <button
   className="border !border-zinc-700/50 px-4 py-2 text-sm !text-zinc-300 hover:!bg-zinc-800/50"
   onClick={() => setRecoveryPrompt(null)}
   >
   稍后
   </button>
   <button
   className="bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
   onClick={() => {
   const resume = recoveryPrompt.onResume;
   setRecoveryPrompt(null);
   resume();
   }}
   >
   继续
   </button>
   </div>
   </div>
   </div>
   ) : null}

    <div className="relative flex h-full w-full bg-[var(--bg-primary)]">
      {/* 角色列表树（右栏） */}
      <div
        className="h-full min-w-0 order-2 w-[42%] max-w-[260px] shrink-0 border-l border-[var(--border-color)]"
      >
      <RolesTree
        roles={roleItems}
        categories={treeCategories}
        selectedRoleId={editingRole?.role.id || null}
        onSelectRole={openEdit}
        onReorder={(category, orderedRoleIds) => {
          void withUpdatedRoles((categories) => {
            orderedRoleIds.forEach((rid, idx) => {
              for (const cat of categories) {
                const role = cat.children.find((r) => r.id === rid);
                if (role) {
                  role.customFields = { ...(role.customFields || {}), sortOrder: String(idx) };
                  break;
                }
              }
            });
          }).then(() => loadBooks());
        }}
        onMoveRole={(roleId, targetCategory) => {
          void withUpdatedRoles((categories) => {
            for (const category of categories) {
              const role = category.children.find((item) => item.id === roleId);
              if (!role) continue;
              role.customFields = {
                ...(role.customFields || {}),
                category: targetCategory,
                sortOrder: String(Date.now())
              };
              break;
            }
          }).then(() => loadBooks());
        }}
        onDeleteRole={(roleId, roleName) => setPendingDelete({ roleId, roleName })}
        onDeleteAllRoles={() => setPendingDeleteAll(true)}
        onBatchDelete={(ids) => void batchDeleteRoles(ids)}
        onBatchMove={(ids, category) => void batchMoveRoles(ids, category)}
        onRenameCategory={(category, newName) => renameTreeCategory(category, newName)}
        onDeleteCategory={(category) => setPendingDeleteCategory({ categoryName: category })}
        onAddCategory={(name) => addCustomTab(name)}
        onNewRole={(category) => {
          setView(category as any);
          

          const d = emptyDraft();
          setDraft(d);
          setEditorMode('create');
          setEditingRoleId('new');
        }}
        onExtract={(mode) => {
          if (mode === 'list') {
            setExtractDialogOpen(true);
          } else {
            island.show({ type: 'warning', message: '小传提取功能开发中' });
          }
        }}
        onExportRoles={(format) => void handleExportRoles(format)}
        onImportRoles={(format) => void handleImportRoles(format)}
      />
      </div>

      {/* 详情编辑器面板（分屏·左栏，始终显示） */}
      <div
        className="order-1 flex-1 min-w-0 h-full bg-[var(--bg-primary)] overflow-hidden"
      >
        {editingRoleId && editorMode ? (
          <div className="flex h-full flex-col overflow-y-auto">
            <RoleEditorOverlay
              mode={editorMode}
              category={overlayCategory}
              draft={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              onClose={closeEditor}
              onSubmit={() => {
                if (editorMode === 'create') void saveCreate();
                else void saveEdit();
              }}
              roles={roleItems}
              roleId={editingRoleId}
              onSelectRole={openEdit}
              customViewTabs={customViewTabs}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)] select-none">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="text-[13px] opacity-50">从右侧选择一个角色</span>
          </div>
        )}
      </div>

      {/* 关系图谱全屏弹窗 */}
      {panelTab === 'graph' && (
        <div className="fixed inset-0 z-[1000] bg-[var(--bg-primary)]">
          <RoleRelationGraph
            edges={relationGraph.edges}
            selectedEdgeId={selectedEdgeId}
            selectedEdge={selectedEdge}
            nodeById={nodeById}
            onSelectEdge={setSelectedEdgeId}
            onBackToList={() => setPanelTab('list')}
          />
        </div>
      )}
    </div>

  <RolePanelDialogs
    mergeDialogOpen={mergeDialogOpen}
    mergePrimary={mergePrimary}
    mergeSecondary={mergeSecondary}
    pendingDeleteAll={pendingDeleteAll}
    pendingDelete={pendingDelete}
    pendingDeleteCategory={pendingDeleteCategory}
    extractDialogOpen={extractDialogOpen}
    chapterCount={book.chapters.length}
    extractStartChapter={extractStartChapter}
    extractEndChapter={extractEndChapter}
    extracting={extracting}
    onCancelMerge={cancelMergeSelection}
    onConfirmMerge={() => void mergeRoles()}
    onCancelDeleteAll={() => setPendingDeleteAll(false)}
    onConfirmDeleteAll={() => void removeAllRoles()}
    onCancelDelete={() => setPendingDelete(null)}
    onConfirmDelete={(roleId, roleName) => void removeRole(roleId, roleName)}
    onCancelDeleteCategory={() => setPendingDeleteCategory(null)}
    onConfirmDeleteCategory={(categoryName) => void deleteTreeCategory(categoryName)}
    onCancelExtract={() => setExtractDialogOpen(false)}
    onExtractStartChapterChange={setExtractStartChapter}
    onExtractEndChapterChange={setExtractEndChapter}
    onConfirmExtract={() => void extractRolesFromBook()}
  />

  <SmartExtractModal 
    open={extractDialogOpen} 
    onClose={() => setExtractDialogOpen(false)} 
    bookId={book.id} 
    chapterCount={book.chapters.length} 
    novelType={novelType} 
    onSaved={() => void loadBooks()} 
  />

  {debugDialog ? (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { (e.currentTarget as any).__downBackdrop = e.target === e.currentTarget; }}
      onMouseUp={(e) => {
        const wasDown = (e.currentTarget as any).__downBackdrop;
        (e.currentTarget as any).__downBackdrop = false;
        if (wasDown && e.target === e.currentTarget) setDebugDialog(null);
      }}
    >
      <div className="w-[min(720px,90vw)] max-h-[80vh] flex flex-col border !border-zinc-700/50 !bg-black shadow-2xl" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b !border-zinc-700/50 px-4 py-2.5">
          <span className="text-sm font-bold !text-zinc-100">{debugDialog.title}</span>
          <button onClick={() => setDebugDialog(null)} className="text-xs !text-zinc-400 hover:!text-zinc-100">关闭</button>
        </header>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all p-4 text-xs !text-zinc-300">{debugDialog.content}</pre>
      </div>
    </div>
  ) : null}

  {editAssetDialog ? (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { (e.currentTarget as any).__downBackdrop = e.target === e.currentTarget; }}
      onMouseUp={(e) => {
        const wasDown = (e.currentTarget as any).__downBackdrop;
        (e.currentTarget as any).__downBackdrop = false;
        if (wasDown && e.target === e.currentTarget) setEditAssetDialog(null);
      }}
    >
      <div className="w-[min(560px,90vw)] max-h-[85vh] flex flex-col border border-indigo-400/35 !bg-black shadow-2xl" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between border-b !border-zinc-700/50 px-4 py-2.5">
          <span className="text-sm font-bold !text-zinc-100">
            {editAssetDialog.mode === 'create' ? '新增' : '编辑'}{editAssetDialog.kind === 'equipment' ? '装备' : '技能/功法'}
          </span>
          <button onClick={() => setEditAssetDialog(null)} className="text-xs !text-zinc-400 hover:!text-zinc-100">关闭</button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="mb-1 block text-[11px] !text-zinc-400">名称</label>
            <input
              className="w-full border !border-zinc-700/50 !bg-zinc-900/60 px-3 py-2 text-sm !text-zinc-100 outline-none focus:border-indigo-400/70"
              value={editAssetDialog.name}
              onChange={(e) => setEditAssetDialog(prev => prev ? { ...prev, name: e.target.value } : prev)}
              placeholder={editAssetDialog.kind === 'equipment' ? '如：青锋剑' : '如：剑气纵横'}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] !text-zinc-400">详细属性（每行一条）</label>
            <textarea
              className="min-h-[140px] w-full border !border-zinc-700/50 !bg-zinc-900/60 px-3 py-2 text-sm !text-zinc-100 outline-none focus:border-indigo-400/70"
              value={editAssetDialog.detail}
              onChange={(e) => setEditAssetDialog(prev => prev ? { ...prev, detail: e.target.value } : prev)}
              placeholder={editAssetDialog.kind === 'equipment' ? '攻击：9-17\n力量：+5\n需要等级：8' : '冷却时间：5秒\n消耗：10MP\n效果：造成120%物理伤害'}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] !text-zinc-400">关联角色（必选一位）</label>
            <div className="max-h-[140px] overflow-y-auto border !border-zinc-700/50 !bg-zinc-900/60 p-2">
              {roleItems.length === 0 ? (
                <div className="text-xs !text-zinc-400">暂无角色，请先创建角色</div>
              ) : roleItems.map((item) => (
                <label key={item.role.id} className="flex cursor-pointer items-center gap-2 px-1.5 py-1 hover:!bg-zinc-800/50">
                  <input
                    type="checkbox"
                    checked={editAssetDialog.ownerRoleIds.includes(item.role.id)}
                    onChange={(e) => setEditAssetDialog(prev => {
                      if (!prev) return prev;
                      const next = e.target.checked
                        ? [...prev.ownerRoleIds, item.role.id]
                        : prev.ownerRoleIds.filter(id => id !== item.role.id);
                      return { ...prev, ownerRoleIds: next };
                    })}
                  />
                  <span className="text-xs !text-zinc-100">{item.role.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t !border-zinc-700/50 px-4 py-3">
          <button onClick={() => setEditAssetDialog(null)} className="border !border-zinc-700/50 !bg-zinc-900/60 px-4 py-1.5 text-xs !text-zinc-300 hover:!bg-zinc-800/50">取消</button>
          <button
            onClick={() => void saveAssetEdit()}
            disabled={!editAssetDialog.name.trim() || editAssetDialog.ownerRoleIds.length === 0}
            className="border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
          >保存</button>
        </footer>
      </div>
    </div>
  ) : null}

  {quickAddRoleDialog && !quickAddRoleDialog.editRoleId ? (
    <div className="mt-3 border border-indigo-400/35 !bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold !text-zinc-100">{quickAddRoleDialog.editRoleId ? '编辑条目' : '新增条目到'}「{quickAddRoleDialog.category}」</span>
        <button onClick={() => setQuickAddRoleDialog(null)} className="text-xs !text-zinc-400 hover:!text-zinc-100">关闭</button>
      </div>
      <div>
        <label className="mb-1 block text-[11px] !text-zinc-400">条目名称</label>
        <input
          className="w-full border !border-zinc-700/50 !bg-zinc-800/50 px-3 py-2 text-sm !text-zinc-100 outline-none focus:border-indigo-400/70"
          value={quickAddRoleDialog.name}
          onChange={(e) => setQuickAddRoleDialog(prev => prev ? { ...prev, name: e.target.value } : prev)}
          placeholder="输入名称"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && quickAddRoleDialog.name.trim()) { void quickAddRole(); } }}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] !text-zinc-400">详细描述（可选）</label>
        <textarea
          className="min-h-[120px] w-full border !border-zinc-700/50 !bg-zinc-800/50 px-3 py-2 text-sm !text-zinc-100 outline-none focus:border-indigo-400/70"
          value={quickAddRoleDialog.detail}
          onChange={(e) => setQuickAddRoleDialog(prev => prev ? { ...prev, detail: e.target.value } : prev)}
          placeholder="输入详细描述，每行一条"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setQuickAddRoleDialog(null)} className="border !border-zinc-700/50 !bg-zinc-800/50 px-4 py-1.5 text-xs !text-zinc-300 hover:bg-white/5">取消</button>
        <button
          onClick={() => void quickAddRole()}
          disabled={!quickAddRoleDialog.name.trim()}
          className="border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
        >{quickAddRoleDialog.editRoleId ? '保存' : '创建'}</button>
      </div>
    </div>
  ) : null}
  </>
  );
}
