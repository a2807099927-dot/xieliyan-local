import type { RoleCategory, RoleProfile, RoleRelationshipEvent, StoryArchiveRecord } from '../types';
import { canonicalRoleName, cleanRoleText, normalizeRoleIdentity, resolveRoleIdentity } from './roleIdentity';

export interface RoleWithCategory { role: RoleProfile; categoryId: string; categoryName: string }
export type RoleMutationAction = 'create_role' | 'add_alias' | 'add_skill' | 'add_item' | 'add_equipment' | 'update_faction' | 'update_recent_status' | 'append_plot_progress' | 'append_relationship';
export interface RoleMutation { id: string; action: RoleMutationAction; label: string; proposedValue: string; reason: string; record: StoryArchiveRecord }
export interface RoleMutationPlan {
 id: string;
 roleName: string;
 aliases: string[];
 matchedRoleId?: string;
 matchedRoleName?: string;
 createIfMissing: boolean;
 chapterIds: string[];
 chapterTitles: string[];
 records: StoryArchiveRecord[];
 mutations: RoleMutation[];
}

const DEFAULTS: Array<[string, string, RoleProfile['roleType']]> = [
 ['cat_main','主角','主角'], ['cat_female','女主','女主'], ['cat_support','配角','配角'], ['cat_villain','反派','反派'], ['cat_npc','NPC','NPC'], ['cat_extra','龙套','龙套'], ['cat_faction','势力','势力']
];
function cloneCategories(categories?: RoleCategory[]): RoleCategory[] {
 const source = categories?.length ? categories : DEFAULTS.map(([id,name]) => ({ id, name, isAuto: true, children: [], order: DEFAULTS.findIndex((row)=>row[0]===id) }));
 return source.map((category) => ({ ...category, children: (category.children || []).map((role) => ({ ...role, aliases:[...(role.aliases||[])], chapters:[...(role.chapters||[])], abilities:[...(role.abilities||[])], equipment:[...(role.equipment||[])], inventory:[...(role.inventory||[])], relationshipTimeline:(role.relationshipTimeline||[]).map((item)=>({...item})), customFields:{...(role.customFields||{})} })) }));
}
function list(value: unknown): string[] { return (Array.isArray(value) ? value.map(String) : String(value||'').split(/[、，,;；\n]/)).map((x)=>x.trim()).filter(Boolean); }
function unique(values: string[]): string[] { const out:string[]=[]; const seen=new Set<string>(); for(const value of values){const key=normalizeRoleIdentity(value); if(value&&key&&!seen.has(key)){seen.add(key);out.push(value)}} return out; }
function detailMap(value: unknown): Record<string,string> { if(!value)return{}; if(typeof value==='object'&&!Array.isArray(value))return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([k,v])=>[cleanRoleText(k),cleanRoleText(v)]).filter(([k])=>k)); try{return detailMap(JSON.parse(String(value)))}catch{return{}} }
function timeline(value: unknown): RoleRelationshipEvent[] { if(!value)return[]; if(!Array.isArray(value)){try{return timeline(JSON.parse(String(value)))}catch{return[]}} return value.map((raw:any)=>{const detail=cleanRoleText(raw?.detail||raw?.event||raw?.change);const target=cleanRoleText(raw?.target);return detail&&target?{id:cleanRoleText(raw.id,`rel_${target}_${detail}`),target,chapterTitle:cleanRoleText(raw.chapterTitle,'未标注章节'),event:cleanRoleText(raw.event,detail),change:cleanRoleText(raw.change),detail,status:cleanRoleText(raw.status,'关系变化'),importance:typeof raw.importance==='number'?raw.importance:undefined,createdAt:cleanRoleText(raw.createdAt)||undefined}:null}).filter(Boolean) as RoleRelationshipEvent[]; }
function mergeTimeline(...values: unknown[]): RoleRelationshipEvent[] { const map=new Map<string,RoleRelationshipEvent>(); for(const value of values)for(const item of timeline(value)){const key=[item.target,item.chapterTitle,item.detail].map(normalizeRoleIdentity).join('|');if(!map.has(key))map.set(key,item)} return [...map.values()]; }
function appendText(current: string|undefined, value:string):string { const next=value.trim(); return !next||current?.includes(next)?current||'':[current,next].filter(Boolean).join('；'); }
function roleTypeFromRecord(record: StoryArchiveRecord): RoleProfile['roleType'] { const text=`${record.status||''} ${(record.tags||[]).join(' ')}`; if(/主角|男主|main/i.test(text))return'主角';if(/女主|female/i.test(text))return'女主';if(/反派|villain/i.test(text))return'反派';if(/npc/i.test(text))return'NPC';if(/龙套|extra/i.test(text))return'龙套';if(/势力|组织|宗门|faction/i.test(text))return'势力';return'配角'; }
function categoryFor(categories:RoleCategory[], type:RoleProfile['roleType']):RoleCategory { const row=DEFAULTS.find((item)=>item[2]===type)||DEFAULTS[2]; return categories.find((cat)=>cat.id===row[0]||cat.name===row[1])||categories[0]; }

/** 从 rolePanelLogic 原样抽出的角色卡合并语义：别名、技能、物品、详情和关系时间线统一去重。 */
export function mergeRoleProfiles(base: RoleWithCategory, next: RoleWithCategory): RoleWithCategory {
 const bc=base.role.customFields||{}, nc=next.role.customFields||{};
 const score=(name:string)=>{const n=cleanRoleText(name).length;let s=n>=2&&n<=3?20:n===4?8:n>4?2:0;if(/[A-Za-z0-9]/.test(name))s-=12;return s};
 const prefer=score(next.role.name)>score(base.role.name), display=prefer?next.role.name:base.role.name, other=prefer?base.role.name:next.role.name;
 const mergedTimeline=mergeTimeline(base.role.relationshipTimeline,next.role.relationshipTimeline,bc.relationshipTimeline,nc.relationshipTimeline);
 const role:RoleProfile={...base.role,name:display,aliases:unique([...(base.role.aliases||[]),...(next.role.aliases||[]),other,next.role.name,base.role.name].filter((a)=>a&&a!==display)),faction:base.role.faction||next.role.faction,description:(next.role.description||'').length>(base.role.description||'').length?next.role.description:base.role.description,abilities:unique([...(base.role.abilities||[]),...(next.role.abilities||[])]),equipment:unique([...(base.role.equipment||[]),...(next.role.equipment||[])]),inventory:unique([...(base.role.inventory||[]),...(next.role.inventory||[])]),plotProgress:[base.role.plotProgress,next.role.plotProgress].filter(Boolean).join('；'),relationshipTimeline:mergedTimeline,customFields:{...nc,...bc,category:bc.category||base.role.roleType||base.categoryName,items:unique([...list(bc.items),...list(nc.items),...(base.role.inventory||[]),...(next.role.inventory||[])]).join('、'),skills:unique([...list(bc.skills),...list(nc.skills),...(base.role.abilities||[]),...(next.role.abilities||[])]).join('、'),equipment:unique([...list(bc.equipment),...list(nc.equipment),...(base.role.equipment||[]),...(next.role.equipment||[])]).join('、'),relations:[bc.relations,nc.relations].filter(Boolean).join('；'),skillDetails:JSON.stringify({...detailMap(bc.skillDetails),...detailMap(nc.skillDetails)}),equipmentDetails:JSON.stringify({...detailMap(bc.equipmentDetails),...detailMap(nc.equipmentDetails)}),relationshipTimeline:JSON.stringify(mergedTimeline)}};
 return {...base,role};
}

export function applyRoleRecordsToCategories(categories: RoleCategory[]|undefined, records: StoryArchiveRecord[]):RoleCategory[]{
 const next=cloneCategories(categories); const ordered=[...records].sort((a,b)=>Number(b.kind==='character')-Number(a.kind==='character')); const seen=new Set<string>();
 for(const record of ordered){ if(!record?.subject||seen.has(record.id))continue; seen.add(record.id); let match=resolveRoleIdentity(next,{name:record.subject,aliases:record.kind==='character'&&record.status==='alias'&&record.target?[record.target]:[]});
 if(!match.role){ if(record.kind!=='character')continue; const type=roleTypeFromRecord(record); const role:RoleProfile={id:`role_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name:canonicalRoleName(record.subject),aliases:record.status==='alias'&&record.target?[cleanRoleText(record.target)]:[],faction:'',roleType:type,description:record.status==='__RECENT_STATUS__'?'':record.detail,firstAppearance:record.chapterId,chapters:record.sourceChapterIds?.length?[...record.sourceChapterIds]:[record.chapterId],extractedAt:new Date().toISOString(),abilities:[],equipment:[],inventory:[],plotProgress:'',relationshipTimeline:[],customFields:{category:type}}; categoryFor(next,type).children.push(role); match={type:'exact',role}; }
 if (!match.role) continue;
 const role=match.role; const cf={...(role.customFields||{})}; role.chapters=unique([...(role.chapters||[]),...(record.sourceChapterIds?.length?record.sourceChapterIds:[record.chapterId])]);
 if(record.kind==='character'){if(record.status==='__RECENT_STATUS__')cf.recentStatus=record.detail;else{role.plotProgress=appendText(role.plotProgress,record.detail);if(record.status==='alias'&&record.target)role.aliases=unique([...(role.aliases||[]),record.target]);}}
 else if(record.kind==='skill'){const name=cleanRoleText(record.target||record.title);role.abilities=unique([...(role.abilities||[]),name]);cf.skills=unique([...list(cf.skills),name]).join('、');const details=detailMap(cf.skillDetails);if(name&&record.detail.length>(details[name]?.length||0))details[name]=record.detail;cf.skillDetails=JSON.stringify(details);}
 else if(record.kind==='item'){const name=cleanRoleText(record.target||record.title);role.inventory=unique([...(role.inventory||[]),name]);cf.items=unique([...list(cf.items),name]).join('、');if(/装备|穿戴|佩戴/.test(`${record.status||''}${record.detail}`)){role.equipment=unique([...(role.equipment||[]),name]);cf.equipment=unique([...list(cf.equipment),name]).join('、');}}
 else if(record.kind==='relationship'){const event:RoleRelationshipEvent={id:record.id,target:record.target||'待确认对象',chapterTitle:record.chapterTitle||record.chapterId,event:record.detail,change:record.status||'关系变化',detail:record.detail,status:record.status||'关系变化',importance:record.importance,createdAt:record.createdAt};role.relationshipTimeline=mergeTimeline(role.relationshipTimeline,[event]);cf.relationshipTimeline=JSON.stringify(role.relationshipTimeline);cf.relations=appendText(cf.relations,record.target?`${record.target}：${record.detail}`:record.detail);}
 else if(record.kind==='faction')role.faction=record.target||record.title||role.faction;
 if(!(record.kind==='character'&&record.status==='__RECENT_STATUS__'))cf.recentPlot=appendText(cf.recentPlot,`${record.chapterTitle||record.chapterId}：${record.detail}`); role.customFields=cf;role.extractedAt=new Date().toISOString(); }
 return next;
}

export function applyRoleMutationPlans(categories:RoleCategory[]|undefined, plans:RoleMutationPlan[]):RoleCategory[]{const records:StoryArchiveRecord[]=[];const ids=new Set<string>();for(const plan of plans)for(const record of plan.records)if(!ids.has(record.id)){ids.add(record.id);records.push(record)}return applyRoleRecordsToCategories(categories,records);}

export interface ExtractedRoleCandidate {
 name?: string; aliases?: string[]; faction?: string; profession?: string; roleType?: string; description?: string;
 firstAppearance?: string; chapters?: string[]; items?: string[]; skills?: string[]; skillDetails?: Record<string,string>;
 equipment?: string[]; equipmentDetails?: Record<string,string>; relations?: string[]; relationshipTimeline?: unknown;
 recentStatus?: string;
}
function normalizeCandidateRoleType(value:unknown):RoleProfile['roleType']{const text=cleanRoleText(value,'配角');if(/主角|男主/i.test(text))return'主角';if(/女主/i.test(text))return'女主';if(/反派/i.test(text))return'反派';if(/^NPC$/i.test(text))return'NPC';if(/龙套/i.test(text))return'龙套';if(/势力|组织/i.test(text))return'势力';return'配角';}

/** 全书 AI 提取也走同一前端合并器；已有角色保留原 id 和用户分类，新角色才进入默认分类。 */
export function applyExtractedRoleCandidatesToCategories(categories:RoleCategory[]|undefined,candidates:ExtractedRoleCandidate[]):RoleCategory[]{
 const next=cloneCategories(categories);
 for(const candidate of candidates){const name=canonicalRoleName(candidate.name);if(!name)continue;const match=resolveRoleIdentity(next,{name,aliases:candidate.aliases||[]});const type=normalizeCandidateRoleType(candidate.roleType);const skills=unique(candidate.skills||[]),equipment=unique(candidate.equipment||[]),items=unique(candidate.items||[]);const details=candidate.skillDetails||{},eqDetails=candidate.equipmentDetails||{};
 const incoming:RoleProfile={id:`role_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name,aliases:unique(candidate.aliases||[]),faction:cleanRoleText(candidate.faction),roleType:type,description:cleanRoleText(candidate.description),firstAppearance:cleanRoleText(candidate.firstAppearance),chapters:unique(candidate.chapters||[]),extractedAt:new Date().toISOString(),abilities:skills,equipment,inventory:items,plotProgress:'',relationshipTimeline:timeline(candidate.relationshipTimeline),customFields:{category:type,profession:cleanRoleText(candidate.profession),skills:skills.join('、'),skillDetails:JSON.stringify(details),equipment:equipment.join('、'),equipmentDetails:JSON.stringify(eqDetails),items:items.join('、'),relations:(candidate.relations||[]).join('；'),recentStatus:cleanRoleText(candidate.recentStatus),relationshipTimeline:JSON.stringify(timeline(candidate.relationshipTimeline))}};
 if(match.role&&match.category){const merged=mergeRoleProfiles({role:match.role,categoryId:match.category.id,categoryName:match.category.name},{role:incoming,categoryId:match.category.id,categoryName:match.category.name}).role;Object.assign(match.role,{...merged,id:match.role.id,customFields:{...(merged.customFields||{}),category:match.role.customFields?.category||match.category.name}});}else categoryFor(next,type).children.push(incoming);
 }
 return next;
}
