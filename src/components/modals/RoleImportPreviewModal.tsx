// 模块说明：从 AI 网页导入角色卡的预览/校对模态框。
// 用户在 webview 内点了"➕ 添加角色"按钮，会触发此模态打开 → 预填解析结果 → 用户校对后保存。
// 关键设计：原文左侧只读展示，右侧是结构化字段（可编辑）；保存时调 electronAPI.resources.addRole。
import { useEffect, useMemo, useState } from 'react';
import { electronAPI } from '../../utils/electron';
import { useIslandStore } from '../../store/useIslandStore';
import { useBookStore } from '../../store/useBookStore';
import { useBackdropClose } from '../../hooks/useBackdropClose';
import type { RoleProfile } from '../../types';

export interface RoleImportInput {
 /** 用户在 webview 选中或自动识别的整段原文 */
 rawText: string;
 /** 可选：预填的角色名 */
 name?: string;
 /** 可选：预填的角色类型 */
 roleType?: string;
}

interface Props {
 open: boolean;
 bookId: string;
 initialChapterTitle?: string;
 initialChapterId?: string;
 payload: RoleImportInput | null;
 onClose: () => void;
 onSaved?: (role: RoleProfile) => void;
}

const ROLE_TYPE_OPTIONS: Array<RoleProfile['roleType']> = ['主角', '女主', '配角', '反派', '龙套', 'NPC', '势力', '待分类'];

function normalizeRoleType(input: string): RoleProfile['roleType'] {
 const t = input.trim();
 if (t === '主角' || t === '男主') return '主角';
 if (t === '女主') return '女主';
 if (t === '反派') return '反派';
 if (t === '配角') return '配角';
 if (t === '龙套') return '龙套';
 if (t === 'NPC' || t === 'npc') return 'NPC';
 if (t === '势力' || t === '小队') return '势力';
 return '配角';
}

// 从原文里推断角色名 + 类型 + 各类字段（境界 / 别名 / 性格 / 能力 等）
function preParse(text: string) {
 const result = {
 name: '',
 roleType: '',
 realm: '',
 aliases: [] as string[],
 abilities: [] as string[],
 description: '',
 faction: '',
 personality: '',
 appearance: '',
 };
 const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
 if (lines.length === 0) return result;

 // 第一行通常是头部
 const head = lines[0].replace(/^[#*\-•·\s]+/, '').replace(/\*\*/g, '').trim();
 let restLines = lines;
 let headParsed = false;

 // 模式 A："1. 女主 — 浅璃" / "2. 男主 — 沐寒" / "女主 — 浅璃"
 const A = head.match(/^(?:[0-9]+[.、]\s*)?(女主|男主|主角|配角|反派|龙套|NPC|师父|师兄|师姐|对手|队友)\s*[—–\-:：]\s*([\u4e00-\u9fa5A-Za-z·]{1,15})\s*$/);
 // 模式 B："1. 浅璃 (主角)" / "浅璃（女主）" / "花颜（花系仙子）" —— 括号内可能是类型，也可能是身份/种族
 const B = head.match(/^(?:[0-9]+[.、]\s*)?([\u4e00-\u9fa5A-Za-z·]{1,15})\s*[（(]\s*([^)）]{1,20})\s*[)）]\s*$/);
 // 模式 C："女主：浅璃"
 const C = head.match(/^(女主|男主|主角|配角|反派|龙套|NPC|师父|师兄|师姐|对手|队友)\s*[:：]\s*([\u4e00-\u9fa5A-Za-z·]{1,15})/);
 // 模式 D：单纯只有名字一行（"浅璃" / "花颜"，长度 2-6 个汉字）
 const D = !A && !B && !C ? head.match(/^([\u4e00-\u9fa5]{2,6})\s*$/) : null;
 // 模式 E："仙子流角色卡：莲光仙子" / "角色档案：洛清寒" / "角色卡：陆暄光" — 类型在 header 后置
 const E = !A && !B && !C && !D ? head.match(/^.{0,10}(角色卡|角色档案|档案|资料|卡片)\s*[:：]\s*([\u4e00-\u9fa5A-Za-z·]{1,15})\s*$/) : null;

 if (A) {
 result.roleType = A[1];
 result.name = A[2].trim();
 headParsed = true;
 } else if (B) {
 result.name = B[1].trim();
 const tag = B[2].trim();
 // 判断括号里的内容是不是"类型"
 const typeMatch = tag.match(/(女主|男主|主角|配角|反派|龙套|NPC|师父|师兄|师姐|对手|队友)/);
 if (typeMatch) {
 result.roleType = typeMatch[1];
 // 括号里如果除了类型还有其他字（如"主角/竞争者"），把后续部分写进 personality
 const rest = tag.replace(typeMatch[1], '').replace(/^[\/、,，\s]+/, '').trim();
 if (rest) result.personality = rest;
 } else {
 // 括号里不是类型，可能是种族/身份/境界（"花系仙子"/"凡人世家"/"魔尊"）
 result.realm = tag;
 }
 headParsed = true;
 } else if (C) {
 result.roleType = C[1];
 result.name = C[2].trim();
 headParsed = true;
 } else if (D) {
 result.name = D[1].trim();
 headParsed = true;
 } else if (E) {
 // "仙子流角色卡：莲光仙子" → name = 莲光仙子
 result.name = E[2].trim();
 headParsed = true;
 }

 if (headParsed) restLines = lines.slice(1);

 const descLines: string[] = [];

 for (const line of restLines) {
 // 带冒号的字段（"性格：好奇..." / "能力：..." / "境界：..." 等）
 const colonMatch = line.match(/^[•\-*·\s]*([^:：]{1,12})[:：]\s*(.+)$/);
 if (colonMatch) {
 const key = colonMatch[1].replace(/^[•\-*·\s]+/, '').trim();
 const value = colonMatch[2].trim();
 // 各种字段语义识别
 if (/^姓名$|^名字$|^角色名$|^本名$|^真名$/.test(key)) {
 // "姓名：陆暄光（道号：太上忘情/实则不然）" → 提取主名 + 把括号内的道号转 aliases
 const nameMatch = value.match(/^([\u4e00-\u9fa5A-Za-z·]{1,15})\s*[（(]\s*([^)）]+)\s*[)）]/);
 if (nameMatch) {
 result.name = nameMatch[1].trim();
 // 括号里如果是"道号：xx" 这种，把后面的转 aliases
 const tag = nameMatch[2].trim();
 const innerMatch = tag.match(/(?:道号|别名|外号|又称|绰号|化名)\s*[:：]\s*(.+)/);
 if (innerMatch) {
 const alias = innerMatch[1].split(/[\/、,，]/).map((s) => s.trim()).filter(Boolean);
 result.aliases = result.aliases.concat(alias);
 } else {
 // 没有标签的括号内容直接当 alias
 result.aliases.push(tag);
 }
 } else {
 result.name = value.split(/[（(]/)[0].trim();
 }
 }
 else if (/^身份$|^职业$|^职务$|^头衔$|^称号$/.test(key)) {
 // 身份/职业 → 写入 personality（这里的身份描述偏人设）
 result.personality = result.personality ? result.personality + '\n身份：' + value : '身份：' + value;
 }
 else if (/境界|修为|实力|阶层|等级|位阶|核心属性|金手指/.test(key)) result.realm = result.realm || value;
 else if (/别名|外号|又称|绰号|曾用名|化名|道号/.test(key)) {
 const newAlias = value.split(/[,，、/\s]+/).map((s) => s.trim()).filter(Boolean);
 result.aliases = result.aliases.concat(newAlias);
 }
 else if (/能力|技能|功法|武学|法术|绝技|绝学|本命法宝|法宝/.test(key)) {
 const looksLikeList = /[、/]/.test(value) || (value.match(/[,，]/g) || []).length >= 2;
 const arr = looksLikeList
 ? value.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean)
 : [value];
 result.abilities = result.abilities.concat(arr);
 }
 else if (/势力|宗门|派别|门派|阵营|家族/.test(key)) result.faction = value;
 else if (/性格|个性|脾气|心性|品性|表面|内在|反差|护短|核心|性格设定|性格特质/.test(key)) {
 result.personality = result.personality ? result.personality + '\n' + key + '：' + value : key + '：' + value;
 }
 else if (/外貌|外观|外貌特征|长相|相貌|身形|容貌|服饰|特征|标志性动作|装束/.test(key)) {
 result.appearance = result.appearance ? result.appearance + '\n' + key + '：' + value : key + '：' + value;
 }
 else if (/气质|风度|魅力|气场|姿态/.test(key)) {
 result.appearance = result.appearance ? result.appearance + '\n' + value : value;
 }
 else if (/暧昧点|看点|卖点|特色|亮点|弱点|护短狂魔/.test(key)) {
 result.personality = result.personality ? result.personality + '\n' + key + '：' + value : key + '：' + value;
 }
 else descLines.push(line);
 } else {
 descLines.push(line);
 }
 }

 // 描述：如果上面识别到了外貌/性格，描述里只放剩下的散句；如果什么都没识别到，整段当描述
 let finalDesc = descLines.join('\n').replace(/^[•\-*·\s]+/gm, '').trim();
 // 在描述前面拼上结构化的"外貌/气质 + 性格"，方便后续 Agent 直接用
 const head1 = result.appearance ? `外貌：${result.appearance}` : '';
 const head2 = result.personality ? `性格：${result.personality}` : '';
 const headBlock = [head1, head2].filter(Boolean).join('\n');
 if (headBlock && finalDesc) {
 finalDesc = headBlock + '\n\n' + finalDesc;
 } else if (headBlock) {
 finalDesc = headBlock;
 }
 result.description = finalDesc.trim();
 return result;
}

export function RoleImportPreviewModal({ open, bookId, initialChapterTitle, initialChapterId, payload, onClose, onSaved }: Props) {
 const [name, setName] = useState('');
 const [roleType, setRoleType] = useState<RoleProfile['roleType']>('配角');
 const [realm, setRealm] = useState('');
 const [faction, setFaction] = useState('');
 const [aliasesText, setAliasesText] = useState('');
 const [abilitiesText, setAbilitiesText] = useState('');
 const [description, setDescription] = useState('');
 const [saving, setSaving] = useState(false);

 // 原文里预解析出的字段，用于初始化
 const parsed = useMemo(() => (payload ? preParse(payload.rawText) : null), [payload]);

 // 每次打开重置成最新 payload 的预解析
 useEffect(() => {
 if (!open || !payload) return;
 setName(payload.name || parsed?.name || '');
 setRoleType(normalizeRoleType(payload.roleType || parsed?.roleType || ''));
 setRealm(parsed?.realm || '');
 setFaction(parsed?.faction || '');
 setAliasesText((parsed?.aliases || []).join('、'));
 setAbilitiesText((parsed?.abilities || []).join('、'));
 setDescription(parsed?.description || '');
 setSaving(false);
 }, [open, payload, parsed]);

 const backdropProps = useBackdropClose(saving ? () => {} : onClose);

 if (!open || !payload) return null;

 const handleSave = async () => {
 if (!name.trim()) {
 useIslandStore.getState().show({ type: 'error', message: '角色名不能为空', autoHideMs: 1500 });
 return;
 }
 setSaving(true);
 try {
 const role: RoleProfile = {
 id: crypto.randomUUID(),
 name: name.trim(),
 aliases: aliasesText.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean),
 faction: faction.trim(),
 roleType,
 description: description.trim(),
 firstAppearance: initialChapterTitle || '',
 chapters: initialChapterId ? [initialChapterId] : [],
 realm: realm.trim() || undefined,
 abilities: abilitiesText.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean),
 equipment: [],
 inventory: [],
 relationshipTimeline: [],
 customFields: {},
 extractedAt: new Date().toISOString(),
 note: 'AI 网页导入',
 };
 await electronAPI.resources.addRole({ bookId, categoryId: '', role });
 // 触发 useBookStore 重新加载（让 RolesPanel 看到新角色）
 try {
 await useBookStore.getState().loadBooks();
 } catch { /* ignore */ }
 useIslandStore.getState().show({ type: 'success', message: `已添加角色「${role.name}」`, autoHideMs: 1500 });
 onSaved?.(role);
 onClose();
 } catch (err) {
 useIslandStore.getState().show({ type: 'error', message: '保存失败：' + (err instanceof Error ? err.message : String(err)) });
 } finally {
 setSaving(false);
 }
 };

 return (
 <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/50 p-4" {...backdropProps}>
 <div
  className="w-[min(820px,95vw)] max-h-[88vh] flex flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--surface)] shadow-2xl rounded-2xl"
 onClick={(e) => e.stopPropagation()}
 onMouseDown={(e) => e.stopPropagation()}
 onMouseUp={(e) => e.stopPropagation()}
 >
 <header className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-3.5">
 <div>
 <div className="text-[15px] font-bold text-[var(--text-primary)]">从 AI 网页导入角色</div>
 <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">检查识别结果后保存到角色档案库</div>
 </div>
 <button onClick={onClose} className="rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
 <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
 </button>
 </header>

 <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[var(--border-color)] overflow-hidden">
 {/* 左：原文只读 */}
 <div className="flex min-h-0 flex-col overflow-hidden">
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">原文</div>
 <div className="flex-1 overflow-auto p-4 text-sm leading-7 text-[var(--text-secondary)] whitespace-pre-wrap break-words">
 {payload.rawText}
 </div>
 </div>

 {/* 右：结构化字段 */}
 <div className="flex min-h-0 flex-col overflow-hidden">
 <div className="border-b border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">角色卡</div>
 <div className="flex-1 overflow-auto p-4">
 <div className="grid grid-cols-2 gap-3">
 <Field label="角色名 *">
 <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
 </Field>
 <Field label="类型">
 <select className={inputCls} value={roleType} onChange={(e) => setRoleType(e.target.value as RoleProfile['roleType'])}>
 {ROLE_TYPE_OPTIONS.map((opt) => (
 <option key={opt} value={opt}>{opt}</option>
 ))}
 </select>
 </Field>
 <Field label="境界 / 修为">
 <input className={inputCls} value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="如 灵界流仙" />
 </Field>
 <Field label="势力">
 <input className={inputCls} value={faction} onChange={(e) => setFaction(e.target.value)} placeholder="可空" />
 </Field>
 <Field label="别名（逗号分隔）" full>
 <input className={inputCls} value={aliasesText} onChange={(e) => setAliasesText(e.target.value)} placeholder="可空" />
 </Field>
 <Field label="能力 / 技能（逗号分隔）" full>
 <input className={inputCls} value={abilitiesText} onChange={(e) => setAbilitiesText(e.target.value)} placeholder="可空" />
 </Field>
 <Field label="描述" full>
 <textarea className={`${inputCls} min-h-[120px] leading-6`} value={description} onChange={(e) => setDescription(e.target.value)} />
 </Field>
 </div>
 </div>
 </div>
 </div>

 <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-3.5">
 <button onClick={onClose} disabled={saving} className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-strong)] px-4 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-all">取消</button>
 <button onClick={handleSave} disabled={saving || !name.trim()} className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong,indigo-500)] px-5 py-1.5 text-xs font-bold text-white shadow-lg shadow-[var(--accent)]/10 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
 {saving ? '保存中...' : '保存到角色档案'}
 </button>
 </footer>
 </div>
 </div>
 );
}

const inputCls = 'w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
 return (
 <div className={full ? 'col-span-2' : ''}>
 <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
 {children}
 </div>
 );
}
