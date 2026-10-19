// AgentChatPanel

// 编辑器右侧栏 Agent 聊天面板。

// 双模式：询问剧情（本地检索）/ 润色代写（直接调 API）

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';

import { createPortal } from 'react-dom';

import { clsx } from 'clsx';

import { ChronoIcon } from '../components/common/ChronoIcon';

import appIcon from '../assets/app-icon.png';

import { IdeSvgClock3, IdeSvgPlus, IdeSvgChevronRight, IdeSvgChevronDown } from '../components/common/IdeSvg';

import type { Book, Chapter } from '../types';

import { useAppStore } from '../store/useAppStore';

import { flushBookMetaPatches, useBookStore } from '../store/useBookStore';

import { useIslandStore } from '../store/useIslandStore';
import { useUserSkillStore } from './userSkillStore';

import { electronAPI } from '../utils/electron';

import { getPromptSync, withBaseProse } from '../utils/promptStore';

import { htmlToPlainWithBreaks, searchInBook, type LocalSearchOccurrence, type LocalSearchResult } from './localSearch';

import {

 detectLocalReadIntent,

 searchLocalArchive,

 searchLocalRoles,

 type LocalArchiveResult,

 type LocalRoleResult

} from './localReadTools';

import { parseOutlineFromResponse, hasOutlineMarker, type ParsedChapterOutline } from './outlineParser';

import { buildBatchChapters } from './batchChapterCreator';

import { extractRolesFromText, hasRoleMarker, type RoleCardSuggestion } from './roleExtractor';

import { generateRoleCards, formatRoleCardForDisplay, type GeneratedRoleCard } from './localRoleGenerator';


import { getSelectableModels, probeProviderModels } from '../utils/probeProviderModels';
import { useConfigStore } from '../store/useConfigStore';

import { runReadOnlyAgentLoop, type AgentWorkflow } from './agentLoop';

import { routeAgentIntent } from './agentIntentRouter';

import { buildBookUnderstanding, formatBookUnderstanding, shouldReconfirmUnderstanding } from './bookUnderstanding';
import { bookHasNoSubstantialBody } from './batchChapterCreator';
import { runWizardStep } from './newBookWizard';
import { wizardReducer, isWizardComplete } from './wizardState';
import type { AgentWizardState, WizardAction } from './wizardState';
import type { OpeningOption } from './openingDirection';

import { buildChapterPlanDiscussSystemPrompt, buildFormalChapterOutlineSystemPrompt, buildEditorReviewSystemPrompt } from './skills/writingSkill';

import { registerProductionAgentTools } from './tools/productionTools';

import { registerCreativeAgentTools } from './tools/creativeTools';
import { registerWriteAgentTools } from './tools/writeTools';

import { registerReadOnlyAgentTools } from './tools/readOnlyTools';

import { inspectOrganizationHealth } from './organizationHealth';

import { buildRoleUpdateProposals } from './roleUpdateProposals';

import { applyExtractedRoleCandidatesToCategories, type ExtractedRoleCandidate } from '../utils/roleMutationEngine';

import { resolveRoleIdentity } from '../utils/roleIdentity';

import { resolveConversationQuery, type AgentConversationContext } from './conversationContext';

import { normalizeChinesePunctuation } from './useAgentSession';

import { splitAgentOutput, stripPreAmble, stripMarkdownEmphasis } from './stripAgentOutput';

import { buildOutlineWritingContext, buildOutlineWritingSystemPrompt, harvestOutlineFromConversation } from './outlineWritingContext';

import { looksLikeInsertableProse, persistAgentBodyToChapter } from './agentBodyPersist';

import { splitOutlineStoryboard, buildOutlineMediumPreview } from './outlineStoryboard';

import type { AgentArtifact, AgentEvidence, AgentToolRun } from './tools/types';

import { AgentThinkingStream, makeThinkingEntry, type ThinkingEntry } from './AgentThinkingStream';


import { runAgentLoop } from './agentUnifiedLoop';

import {
  makeId,
  getPanelStorageKey,
  isFollowWriteCommand,
  parseEditorReviewJson,
  stripThinkTagsLive,
  extractThinkingAndBody,
  isContinuityUtterance,
  highlightClassFor,
  isSectionHeadingLine,
  isComplexReadQuestion,
  isExplicitFullBookSearch,
  extractLocalSearchTerms,
  extractMainKeywords,
  isLocateQuestion,
  isLocalOperationCommand,
  stripRoleBlocks,
} from './agentPanelLogic';

/**
 * 写权限判定：只有用户明确要求落库/修改资料时才授予写工具。
 * 否定句式（"先别写/不要保存/别修改"）一律不授予——存疑时偏向不执行，
 * 误判为无权限只会让 AI 多问一轮，误判为有权限则可能直接改动用户数据。
 */
const ALLOW_WRITES_RE = /写入|入章|保存|落到|更新角色|修改角色|创建章节|新建章节|写入细纲|落细纲|填入细纲/;
const CANCEL_WRITES_RE = /(?:先|暂时|现在)?\s*(?:别|不要|莫|先别|先不|不|不用|暂停|取消|算了)\s*(?:写入|入章|保存|落到|更新|修改|创建|新建|填入|落细纲|删除|清空|覆盖)[了吧啦]?/;







type AgentMode = 'query' | 'write' | 'outline';

type AgentShellTab = 'agent' | 'roles' | 'outline';


interface ChatBubble {

 id: string;

 role: 'user' | 'assistant' | 'system';

 content: string;

 /** 流式输出过程中的可见正文（完成后写入 content） */

 streamingText?: string;

 /** 模型思维链/思考过程（若有） */

 thinkingText?: string;

 tokenInfo?: string;

 chapterLinks?: Array<{ chapterId: string; chapterIndex: number; title: string }>;

 confirmState?: { estimatedTokens: number; messages: Array<{ role: string; content: string }>; userContent: string; agentLoop?: boolean; workflow?: AgentWorkflow };

 /** 批量大纲预览状态 */

 outlinePreview?: { chapters: ParsedChapterOutline[]; status: 'pending' | 'confirmed' | 'dismissed' };

 /** 角色卡建议 */

 roleSuggestions?: RoleCardSuggestion[];

 /** 细纲推演确认 */

 outlineConfirm?: { targetChapterId: string; targetTitle: string };

 /** 本地生成的角色卡 */

 generatedRoles?: GeneratedRoleCard[];

 /** 本地全文检索结果（零 token）。 */

 localSearchResults?: LocalSearchResult[];

 /** 本地角色档案查询结果（零 token）。 */

 localRoleResults?: LocalRoleResult[];

 /** 本地剧情档案查询结果（零 token）。 */

 localArchiveResults?: LocalArchiveResult[];

 /** 进阶只读 Agent 的工具执行轨迹与最终证据。 */

 agentToolRuns?: AgentToolRun[];

 agentEvidence?: AgentEvidence[];

  agentArtifacts?: AgentArtifact[];

  /** 本次任务的技能类工具使用汇总（供「存入技能库」按钮） */
  skillUsage?: { didWrite: boolean; didReview: boolean; loadedSkill: string | null; draftExcerpt: string };


 /** 本条会话的思维过程（嵌在 Agent 气泡下） */

 thinkingEntries?: ThinkingEntry[];

 thinkingCollapsed?: boolean;

  /** 正文入章（对齐自动工坊落盘） */

  bodyWriteState?: {

   status: 'pending' | 'written' | 'dismissed' | 'error';

   mode?: 'current' | 'new_chapter' | 'append';

   chapterId?: string;

   title?: string;

   wordCount?: number;

   message?: string;

  };

  /** 老书「书的理解」对齐确认（T8.2） */

  understandingConfirm?: {

   understandingText: string;

   coveredChapterCount: number;

   /** 被对齐卡暂停的续写指令，确认后自动重发 */
   resumeText?: string;

  };

  /** 新书 wizard 确认卡（P2-A2~A5） */

  wizardCard?: {

   step: number;

   /** 卡片渲染内容 */
   title: string;

   body: string;

   /** 可选项（方向卡专用：2-3 个方向） */
   options?: Array<{ key: string; title: string; body: string; data?: unknown }>;

   /** 是否为最后一步（大纲审查完成，可落细纲写作） */
   isFinal?: boolean;

  };

}









type AgentTaskState =
 | { kind: 'idle' }
 | { kind: 'discussing_outline'; chapterId: string; targetTitle: string; draftPlan?: string }
 | { kind: 'outline_ready'; chapterId: string; targetTitle: string; planText: string }
 | { kind: 'writing_from_outline'; chapterId: string; outlineText: string }
 | { kind: 'draft_ready'; chapterId: string; bodyText: string };

interface AgentChatPanelProps {

 book: Book;

 chapter: Chapter;

 onClose?: () => void;

}







const GUIDE_UNIFIED = '我已连接当前作品与章节。你可以直接询问剧情、搜索角色、续写或改写正文，也可以让我推演下一章；我会自动选择合适的处理方式。';

const GUIDE_QUERY = GUIDE_UNIFIED;

const GUIDE_WRITE = GUIDE_UNIFIED;

const GUIDE_OUTLINE = GUIDE_UNIFIED;

const GUIDE_ID = 'sys-guide-init';

// 注册生产工具 + 只读工具（幂等 register）

try { registerReadOnlyAgentTools(); registerProductionAgentTools(); registerCreativeAgentTools(); } catch { /* ignore */ }

const COLLAPSE_THRESHOLD = 220;















// ────── 章节跳转链接 ──────────────────────────────────────────────────────







function ChapterLink({ chapterId, chapterIndex, title, bookId }: { chapterId: string; chapterIndex: number; title: string; bookId: string }) {

 return (

 <button type="button" onClick={() => useAppStore.getState().openEditor(bookId, chapterId)}

 className="inline-flex items-center gap-1 border border-indigo-400/25 bg-indigo-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-500/20 transition"

 title={`跳转到第${chapterIndex + 1}章`}>

 <span>第{chapterIndex + 1}章</span>

 <span className="max-w-[80px] truncate opacity-70">{title}</span>

 </button>

 );

}











function jumpToTextOccurrence(

 bookId: string,

 chapterId: string,

 occurrence: Pick<LocalSearchOccurrence, 'from' | 'to' | 'text'>

) {

 const app = useAppStore.getState();

 app.setPendingSearchJump({

 chapterId,

 from: occurrence.from,

 to: occurrence.to,

 positionKind: 'text',

 text: occurrence.text

 });

 app.openEditor(bookId, chapterId);

}







function waitForCurrentEditorSave(timeoutMs = 1200): Promise<void> {
 return new Promise((resolve) => {
  let done = false;
  const finish = () => {
   if (done) return;
   done = true;
   window.removeEventListener('writerzen:force-save-done', onDone as EventListener);
   resolve();
  };
  const onDone = () => finish();
  window.addEventListener('writerzen:force-save-done', onDone as EventListener, { once: true });
  try {
   window.dispatchEvent(new CustomEvent('writerzen:force-save-current-editor'));
  } catch {
   finish();
   return;
  }
  window.setTimeout(finish, timeoutMs);
 });
}

function buildCurrentChapterCommentContext(book: Book, chapter: Chapter): string {
 const chapters = Array.isArray(book.chapters) ? book.chapters : [];
 const idx = chapters.findIndex((c) => c.id === chapter.id);
 const prev = idx > 0 ? chapters[idx - 1] : undefined;
 const currentPlain = htmlToPlainWithBreaks(String(chapter.content || ''));
 const prevPlain = htmlToPlainWithBreaks(String(prev?.content || ''));
 const memories = Array.isArray((book as any).memoryBank) ? (book as any).memoryBank as Array<any> : [];
 const currentMemory = memories.find((m: any) => m?.chapterId === chapter.id);
 const prevMemory = prev ? memories.find((m: any) => m?.chapterId === prev.id) : undefined;
 const currentSummary = String(currentMemory?.plotAnalysis?.plotSynopsis || currentMemory?.summary || '').trim();
 const prevSummary = String(prevMemory?.plotAnalysis?.plotSynopsis || prevMemory?.summary || '').trim();
 const currentBody = currentPlain.slice(0, 50000);
 return [
  `【当前章节】${chapter.title}`,
  currentSummary ? `【当前章摘要】\n${currentSummary}` : '',
  currentPlain ? `【当前章正文｜${currentBody.length}/${currentPlain.length}字】\n${currentBody}${currentBody.length < currentPlain.length ? '\n（当前章过长，以上为前50000字）' : ''}` : '【当前章正文】（空）',
  prev ? `【上一章】${prev.title}` : '',
  prevSummary ? `【上一章摘要】\n${prevSummary}` : '',
  prevPlain ? `【上一章正文末尾摘录】\n${prevPlain.slice(-4000)}` : ''
 ].filter(Boolean).join('\n\n');
}

function HighlightSnippet({ snippet, keyword }: { snippet: string; keyword: string }) {

 const index = snippet.indexOf(keyword);

 if (index < 0) return <>{snippet}</>;

 return <>{snippet.slice(0, index)}<mark className="rounded-sm bg-amber-300/35 px-0.5 text-inherit">{keyword}</mark>{snippet.slice(index + keyword.length)}</>;

}







function LocalSearchCards({ results, bookId }: { results: LocalSearchResult[]; bookId: string }) {

 return (

 <div className="mt-3 space-y-3">

 {results.map((result) => (

 <div key={result.keyword}>

 <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-[var(--text-muted)]">

 <span>“{result.keyword}”</span>

 <span>{result.totalHits} 处 · {result.hits.length} 章</span>

 </div>

 <div className="space-y-1.5">

 {result.hits.map((hit) => (

 <details key={`${result.keyword}-${hit.chapterId}`} className="group overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--surface)]">

 <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[11.5px] marker:hidden hover:bg-[var(--surface-hover)]">

 <svg className="h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>

 <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">第{hit.chapterIndex + 1}章 {hit.chapterTitle}</span>

 <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{hit.count} 处</span>

 </summary>

 <div className="border-t border-[var(--border-color)] p-1.5">

 {hit.occurrences.map((occurrence, index) => (

 <button key={`${occurrence.from}-${index}`} type="button" onClick={() => jumpToTextOccurrence(bookId, hit.chapterId, occurrence)} className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-[1.55] text-[var(--text-secondary)] hover:bg-indigo-500/10 hover:text-[var(--text-primary)]" title="跳转到正文中的这一处">

 <span className="mr-1.5 text-[9px] font-semibold text-indigo-500">{index + 1}</span>

 <HighlightSnippet snippet={occurrence.snippet} keyword={result.keyword} />

 </button>

 ))}

 {hit.count > hit.occurrences.length ? <div className="px-2 py-1 text-[10px] text-[var(--text-muted)]">另有 {hit.count - hit.occurrences.length} 处重复结果未展开</div> : null}

 </div>

 </details>

 ))}

 </div>

 </div>

 ))}

 </div>

 );

}







function LocalRoleCards({ roles, bookId }: { roles: LocalRoleResult[]; bookId: string }) {

 return (

 <div className="mt-3 space-y-1.5">

 {roles.map((role) => (

 <details key={role.id} className="group overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--surface)]">

 <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 marker:hidden hover:bg-[var(--surface-hover)]">

 <svg className="h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>

 <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--text-primary)]">{role.name}</span>

 <span className="text-[10px] text-[var(--text-muted)]">{role.roleType} · {role.faction}</span>

 </summary>

 <div className="space-y-2 border-t border-[var(--border-color)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--text-secondary)]">

 {role.description ? <p>{role.description}</p> : <p className="text-[var(--text-muted)]">暂无角色描述</p>}

 <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">

 <span>分类：{role.category}</span><span>首次：{role.firstAppearance || '未记录'}</span>

 {role.realm ? <span>境界：{role.realm}</span> : null}

 {role.aliases.length ? <span>别名：{role.aliases.join('、')}</span> : null}

 </div>

 {role.abilities.length ? <div><span className="font-medium text-[var(--text-primary)]">能力：</span>{role.abilities.join('、')}</div> : null}

 {role.equipment.length ? <div><span className="font-medium text-[var(--text-primary)]">装备：</span>{role.equipment.join('、')}</div> : null}

 {role.plotProgress ? <div><span className="font-medium text-[var(--text-primary)]">剧情进展：</span>{role.plotProgress}</div> : null}

 {role.chapterHits.length ? (

 <details className="group/chapters rounded-md bg-[var(--surface-hover)]">

 <summary className="cursor-pointer list-none px-2 py-1.5 text-[10.5px] font-medium text-indigo-500 marker:hidden">正文出现位置（{role.chapterHits.reduce((sum, hit) => sum + hit.count, 0)}处）</summary>

 <div className="space-y-1 px-1.5 pb-1.5">

 {role.chapterHits.flatMap((hit) => hit.occurrences.slice(0, 3).map((occurrence, index) => (

 <button key={`${hit.chapterId}-${occurrence.from}-${index}`} type="button" onClick={() => jumpToTextOccurrence(bookId, hit.chapterId, occurrence)} className="block w-full rounded px-2 py-1.5 text-left text-[10.5px] hover:bg-indigo-500/10">

 <span className="font-medium text-indigo-500">第{hit.chapterIndex + 1}章</span> · <HighlightSnippet snippet={occurrence.snippet} keyword={role.name} />

 </button>

 )))}

 </div>

 </details>

 ) : null}

 </div>

 </details>

 ))}

 </div>

 );

}







const ARCHIVE_KIND_LABEL: Record<LocalArchiveResult['kind'], string> = {

 character: '人物', item: '物品', skill: '技能', faction: '势力', relationship: '关系', foreshadow: '伏笔', event: '事件'

};







const TOOL_LABEL: Record<AgentToolRun['tool'], string> = {
 search_book: '搜索全书', search_roles: '查询角色', search_archive: '查询剧情档案', find_chapter: '查找章节', read_chapter: '读取章节',
 inspect_organization: '整理体检', get_role_update_plans: '角色更新计划',
 list_recent_context: '近章上下文', prepare_outline_write: '组装细纲写作', find_empty_chapter: '查找空章',
 resolve_outline_target: '定位目标章', build_story_canon: '设定/剧情卡', plan_chapter_outline: '生成章纲',
 write_chapter_body: '生成正文', review_draft: '写后自检',
 update_role: '更新角色', create_chapter: '新建章节', update_outline: '更新细纲', save_memory: '写入记忆',
 save_body_to_chapter: '正文入章', formalize_chapter_outline: '写入正式细纲',
 open_webpage: '打开网页', extract_page_text: '提取正文'
};

function formatToolThought(run: AgentToolRun): string {
  const label = TOOL_LABEL[run.tool] || run.tool;
  const reason = String(run.reason || '').trim();
  const summary = String(run.summary || '').trim();
  if (run.status === 'running') {
    return reason ? `${label}：${reason}（执行中…）` : `${label}（执行中…）`;
  }
  if (run.status === 'error') {
    return `${label}失败${summary ? `：${summary}` : ''}`;
  }
  if (summary && reason && summary !== reason) return `${label}：${summary}`;
  if (summary) return `${label}：${summary}`;
  if (reason) return `${label}：${reason}`;
  return `${label}完成`;
}









function AgentTraceCards({
  runs,
  defaultOpen = false,
  title
}: {
  runs: AgentToolRun[];
  defaultOpen?: boolean;
  title?: string;
}) {
 if (!runs.length) return null;

 const done = runs.filter((run) => run.status === 'done').length;
 const hasError = runs.some((run) => run.status === 'error');
 const running = runs.some((run) => run.status === 'running');
 const verifyish = runs.every((run) =>
  /search_|read_chapter|inspect_organization|get_role/.test(String(run.tool || ''))
 );
 const headTitle = title || (verifyish ? '查证过程' : '执行过程');

 return (
  <details className={clsx('wz-ag-trace', running && 'is-active', hasError && 'is-error')} open={defaultOpen || running}>
   <summary className="wz-ag-trace-head">
    <span className="wz-ag-trace-title">
     <span className="wz-ag-trace-dot" aria-hidden />
     {headTitle}
    </span>
    <span className="wz-ag-trace-meta">
     {done}/{runs.length}
     <span className="wz-ag-trace-chev" aria-hidden />
    </span>
   </summary>
   <div className="wz-ag-trace-list">
    {runs.map((run) => (
     <div key={run.id} className={clsx('wz-ag-trace-item', `is-${run.status}`)}>
      <div className="wz-ag-trace-rail" aria-hidden>
       <span className="wz-ag-trace-node" />
      </div>
      <div className="wz-ag-trace-main">
       <div className="wz-ag-trace-line">
        <span className="wz-ag-trace-tool">{TOOL_LABEL[run.tool] || run.tool}</span>
        {run.reason ? <span className="wz-ag-trace-reason">{run.reason}</span> : null}
       </div>
       {run.summary ? <div className="wz-ag-trace-summary">{run.summary}</div> : null}
      </div>
     </div>
    ))}
   </div>
  </details>
 );
}







function AgentEvidenceCards({ evidence, bookId }: { evidence: AgentEvidence[]; bookId: string }) {

 if (!evidence.length) return null;

 return (

  <details className="wz-ag-evidence">

   <summary className="wz-ag-evidence-head">

    <span>回答依据</span>

    <span className="wz-ag-evidence-meta">{evidence.length}</span>

   </summary>

   <div className="wz-ag-evidence-list">

    {evidence.map((item, index) => (

     <button

      key={`${item.id}-${index}`}

      type="button"

      disabled={!item.chapterId}

      onClick={() => {

       if (!item.chapterId) return;

       if (typeof item.from === 'number' && typeof item.to === 'number' && item.text) {

        jumpToTextOccurrence(bookId, item.chapterId, { from: item.from, to: item.to, text: item.text });

       } else {

        useAppStore.getState().openEditor(bookId, item.chapterId);

       }

      }}

      className="wz-ag-evidence-item"

     >

      <span className="wz-ag-evidence-title">{item.chapterTitle || '本地档案'}</span>

      <span className="wz-ag-evidence-snip">{item.snippet}</span>

     </button>

    ))}

   </div>

  </details>

 );

}







function AgentArtifactCards({ artifacts }: { artifacts: AgentArtifact[] }) {

 if (!artifacts.length) return null;

 return <div className="mt-2 space-y-2">{artifacts.map((artifact, index) => {

 if (artifact.type === 'organization_health') {

 const data = artifact.data as { totalChapters?: number; completeChapters?: number; missingCount?: number; summaryOnlyCount?: number; incompleteArchiveCount?: number; estimatedCalls?: number; chapters?: Array<{ chapterId: string; chapterTitle: string; reasons: string[] }> };

 return <div key={`health-${index}`} className="rounded-lg border border-indigo-400/20 bg-indigo-500/[0.06] p-3"><div className="text-[11px] font-bold text-indigo-300">作品整理体检</div><div className="mt-2 grid grid-cols-2 gap-1.5 text-[10.5px] text-[var(--text-secondary)]"><span>完整：{data.completeChapters || 0}/{data.totalChapters || 0}</span><span>未整理：{data.missingCount || 0}</span><span>只有摘要：{data.summaryOnlyCount || 0}</span><span>档案不完整：{data.incompleteArchiveCount || 0}</span></div><div className="mt-2 text-[10px] text-[var(--text-muted)]">建议处理 {(data.missingCount || 0) + (data.summaryOnlyCount || 0) + (data.incompleteArchiveCount || 0)} 章 · 预计 {data.estimatedCalls || 0} 次分析</div>{data.chapters?.length ? <details className="mt-2"><summary className="cursor-pointer text-[10px] text-indigo-400">查看建议章节</summary><div className="mt-1 max-h-36 space-y-1 overflow-y-auto">{data.chapters.slice(0, 30).map((item) => <div key={item.chapterId} className="rounded bg-black/10 px-2 py-1 text-[10px]"><b>{item.chapterTitle}</b><span className="ml-1 text-[var(--text-muted)]">{item.reasons?.join('；')}</span></div>)}</div></details> : null}</div>;

 }

  if (artifact.type === 'pre_write_reflection') {
  const data = artifact.data;
  return (
   <div key={`pwr-${index}`} className="rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3">
    <div className="text-[11px] font-bold text-amber-300">写前复盘</div>
    {data.continuation ? <div className="mt-2 text-[10px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">承接：</span>{data.continuation}</div> : null}
    {data.approach ? <div className="mt-1 text-[10px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">怎么写：</span>{data.approach}</div> : null}
    {data.satisfaction?.length ? <div className="mt-1 text-[10px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">爽点：</span>{data.satisfaction.join('、')}</div> : null}
    {data.endState ? <div className="mt-1 text-[10px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">章末：</span>{data.endState}</div> : null}
   </div>
  );
  }

  const data = artifact.data as { totalPlans?: number; totalMutations?: number; plans?: Array<{ id: string; roleName: string; createIfMissing: boolean; matchedRoleName?: string; chapterTitles: string[]; mutations: Array<{ id: string; label: string; reason: string }> }> };

 return <div key={`plans-${index}`} className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-3"><div className="text-[11px] font-bold text-emerald-300">角色卡更新计划</div><div className="mt-1 text-[10px] text-[var(--text-muted)]">{data.totalPlans || 0} 名角色 · {data.totalMutations || 0} 项待审查更新</div><div className="mt-2 space-y-1.5">{data.plans?.slice(0, 12).map((plan) => <details key={plan.id} className="rounded bg-black/10 px-2 py-1.5"><summary className="cursor-pointer text-[10.5px] font-medium">{plan.roleName}<span className={clsx('ml-2 text-[9px]', plan.createIfMissing ? 'text-amber-400' : 'text-emerald-400')}>{plan.createIfMissing ? '新角色' : `更新${plan.matchedRoleName ? `：${plan.matchedRoleName}` : ''}`}</span></summary><div className="mt-1 space-y-1">{plan.mutations.map((mutation) => <div key={mutation.id} className="text-[10px] text-[var(--text-secondary)]">• {mutation.label}<span className="ml-1 text-[var(--text-muted)]">{mutation.reason}</span></div>)}</div></details>)}</div></div>;

 })}</div>;

}







function LocalArchiveCards({ archives, bookId }: { archives: LocalArchiveResult[]; bookId: string }) {

 return (

 <div className="mt-3 space-y-1.5">

 {archives.map((archive) => (

 <details key={archive.key} className="group overflow-hidden rounded-md border border-[var(--border-color)] bg-[var(--surface)]">

 <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 marker:hidden hover:bg-[var(--surface-hover)]">

 <svg className="h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>

 <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-medium text-indigo-500">{ARCHIVE_KIND_LABEL[archive.kind]}</span>

 <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--text-primary)]">{archive.title}</span>

 <span className="text-[10px] text-[var(--text-muted)]">{archive.records.length} 条</span>

 </summary>

 <div className="border-t border-[var(--border-color)] px-2.5 py-2">

 {archive.latestStatus ? <div className="mb-2 text-[10.5px] text-[var(--text-muted)]">当前状态：{archive.latestStatus}</div> : null}

 <div className="space-y-1">

 {archive.records.map((record) => (

 <button key={record.id} type="button" disabled={record.chapterIndex < 0} onClick={() => {

 if (record.chapterIndex < 0) return;

 if (record.jump) jumpToTextOccurrence(bookId, record.chapterId, record.jump);

 else useAppStore.getState().openEditor(bookId, record.chapterId);

 }} className="block w-full rounded-md px-2 py-1.5 text-left text-[10.5px] leading-[1.55] text-[var(--text-secondary)] hover:bg-indigo-500/10 disabled:cursor-default disabled:opacity-60">

 <span className="font-medium text-indigo-500">{record.chapterIndex >= 0 ? `第${record.chapterIndex + 1}章` : '未知章节'}</span>

 <span className="ml-1 text-[var(--text-muted)]">{record.chapterTitle}</span>

 <div className="mt-0.5">{record.detail}</div>

 {record.evidence ? <div className="mt-0.5 line-clamp-2 text-[var(--text-muted)]">依据：{record.evidence}</div> : null}

 </button>

 ))}

 </div>

 </div>

 </details>

 ))}

 </div>

 );

}







// ────── 气泡组件 ──────────────────────────────────────────────────────────────







interface BubbleProps {

 bubble: ChatBubble;

 bookId: string;

 onDismiss?: () => void;

 onConfirmSend?: () => void;

 onCancelSend?: () => void;

 onConfirmOutline?: () => void;

 onDismissOutline?: () => void;

 onConfirmRole?: (roleId: string) => void;

 onDismissRole?: (roleId: string) => void;

  onConfirmOutlineApply?: (bubbleId: string) => void;

  onDismissOutlineApply?: (bubbleId: string) => void;

  onConfirmUnderstanding?: (bubbleId: string) => void;

  onDismissUnderstanding?: (bubbleId: string) => void;

  onWizardSelect?: (bubbleId: string, key: string) => void;

  onWizardConfirm?: (bubbleId: string) => void;

  onWizardBack?: (bubbleId: string) => void;

  onConfirmGeneratedRole?: (bubbleId: string, cardIndex: number) => void;

 onRegenerateRoles?: () => void;

 onToggleThinking?: () => void;

 onWriteBody?: (mode: 'current' | 'new_chapter' | 'append') => void;

 onDismissBodyWrite?: () => void;

}











// ────── 流式输出 + 富文本渲染 ──────────────────────────────────────────────














































function renderAgentRichText(text: string): ReactNode[] {

  // 去掉裸露 **，把 **重点** 变成彩色高亮；支持简单换行与段落标题

  const nodes: ReactNode[] = [];

  const src = String(text || '');

  const parts = src.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);

  parts.forEach((part, idx) => {

    if (!part) return;

    const bold = part.match(/^\*\*([^*\n]+)\*\*$/);

    const ital = part.match(/^\*([^*\n]+)\*$/);

    if (bold) {

      const label = bold[1];

      const heading = isSectionHeadingLine(label) || /^(现实线|游戏线|主线|支线|暗线|情感线|生活线|任务线)/.test(label.trim());

      nodes.push(

        <strong

          key={`b-${idx}`}

          className={clsx('wz-ag-hl', heading && 'wz-ag-heading', highlightClassFor(label))}

        >

          {label}

        </strong>

      );

      return;

    }

    if (ital) {

      nodes.push(<em key={`i-${idx}`} className="wz-ag-em">{ital[1]}</em>);

      return;

    }

    const lines = part.split('\n');

    lines.forEach((line, li) => {

      if (li > 0) nodes.push(<br key={`br-${idx}-${li}`} />);

      if (!line) return;

      if (isSectionHeadingLine(line)) {

        nodes.push(

          <strong

            key={`h-${idx}-${li}`}

            className={clsx('wz-ag-hl', 'wz-ag-heading', highlightClassFor(line))}

          >

            {line}

          </strong>

        );

        return;

      }

      nodes.push(<span key={`t-${idx}-${li}`}>{line}</span>);

    });

  });

  return nodes;

}









function shouldUseAutonomousDispatch(input: string): boolean {
 const text = String(input || '').trim();
 if (!text) return false;
 // 明确单步：固定链路更稳
 if (/^(按这个|按这个写|就这样写|开写|开始写|写入空章|入章|保存正文|整理体检|角色更新建议)$/i.test(text)) return false;
 if (/续写|接着写|继续写|按细纲写|根据细纲写|写一章|写新章|生成正文/.test(text) && text.length < 40) return false;
 if (/我们先讨论|讨论一下|你的看法|怎么展开|这章怎么写|下一章怎么写/.test(text) && !/然后.*写|最后.*写入|顺便|同时|检查|查一下/.test(text)) return false;
 // 复杂目标：需要拆分、先查再写、写完再入章、同时做多件事
 const complexSignals = [
  /自己判断|你来判断|自动判断|自主|拆分任务|分步骤|全流程/,
  /先.*(?:查|看|确认|核实|检查).*再.*(?:写|改|入章|保存)/,
  /(?:写|续写|生成正文).*(?:并|然后|顺便).*?(?:自检|检查|修订|写入|入章|保存)/,
  /(?:细纲|大纲).*(?:然后|再).*正文/,
  /角色卡.*(?:检查|更新|同步).*正文/,
  /前文.*(?:查|核实).*写/,
  /同时|顺便|一并|全套|闭环/
 ];
 return complexSignals.some((re) => re.test(text)) || text.length > 90;
}

async function reviewAndMaybeReviseDraft(args: {
  book: Book;
  chapter: Chapter;
  outlineText?: string;
  userInstruction: string;
  draft: string;
  onDelta: (visible: string, thinking: string) => void;
}): Promise<{ text: string; reviewSummary?: string; revised: boolean }> {
  const body = String(args.draft || '').trim();
  if (!body || body.length < 300) return { text: body, revised: false };

  const reviewMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildEditorReviewSystemPrompt(args.book) },
    {
      role: 'user',
      content: [
        `当前章节：${args.chapter.title || '当前章'}`,
        args.outlineText ? `【本章细纲】\n${args.outlineText}` : '',
        args.userInstruction ? `【用户指令】\n${args.userInstruction}` : '',
        `【待审正文】\n${body}`,
        '请只输出 JSON。'
      ].filter(Boolean).join('\n\n')
    }
  ];

  const reviewResp = await streamAiChat({
    messages: reviewMessages,
    bookId: args.book.id,
    chapterId: args.chapter.id,
    disableRag: true,
    disableStyle: true,
    maxTokens: 4096,
    senderId: 'agent-editor-review',
    onDelta: args.onDelta
  });
  const review = parseEditorReviewJson(reviewResp.text || '');
  const hardIssues = review.issues.filter((item) => String(item?.severity || '').toLowerCase() === 'hard');
  const needRevision = review.pass === false || hardIssues.length > 0;
  if (!needRevision) {
    return { text: body, reviewSummary: review.summary || '自检通过', revised: false };
  }

  const revisionMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildOutlineWritingSystemPrompt(args.book, args.chapter) },
    {
      role: 'user',
      content: [
        '请根据审稿意见修订正文。只输出修订后的小说正文，不要解释。',
        args.outlineText ? `【本章细纲】\n${args.outlineText}` : '',
        args.userInstruction ? `【用户指令】\n${args.userInstruction}` : '',
        `【审稿问题】\n${review.issues.map((x, i) => `${i + 1}. ${x.text || ''}${x.fix ? `；修法：${x.fix}` : ''}`).join('\n')}`,
        `【原正文】\n${body}`
      ].filter(Boolean).join('\n\n')
    }
  ];
  const revisedResp = await streamAiChat({
    messages: revisionMessages,
    bookId: args.book.id,
    chapterId: args.chapter.id,
    disableRag: true,
    disableStyle: true,
    maxTokens: 8192,
    senderId: 'agent-editor-revision',
    onDelta: args.onDelta
  });
  const split = splitAgentOutput(revisedResp.text || '');
  // 修订只取正文；若修订只吐思考则保留原稿（不回退含思考的原文）
  const revisedText = stripMarkdownEmphasis(normalizeChinesePunctuation(split.body || '')).trim();
  return { text: revisedText || body, reviewSummary: review.summary || `已按 ${review.issues.length} 条审稿意见修订`, revised: true };
}

async function streamAiChat(args: {

  messages: Array<{ role: string; content: string }>;

  bookId: string;

  chapterId: string;

  disableRag?: boolean;

  disableStyle?: boolean;

  maxTokens?: number;

  senderId?: string;

  onDelta: (fullVisible: string, thinking: string) => void;

}): Promise<{ text: string; usage?: { totalTokens?: number }; provider?: string; model?: string }> {

  let acc = '';

  // 独立 sessionId：chunk 按会话过滤，多个并发流式请求（面板/编辑器/工坊）互不串扰
  const streamSessionId = `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const off = electronAPI.ai.onStreamChunkFor(streamSessionId, (chunk) => {

    if (chunk.text) acc += chunk.text;

    const { visible, thinking } = extractThinkingAndBody(acc);

    args.onDelta(visible, thinking);

  });

  try {

    const response = await electronAPI.ai.chat({

      messages: args.messages as any,

      stream: true,

      bookId: args.bookId,

      chapterId: args.chapterId,

      disableRag: args.disableRag,

      disableStyle: args.disableStyle,

      senderId: args.senderId || 'agent-panel',

      sessionId: streamSessionId,

    });

    const finalText = String(response?.text || acc || '').trim();

    const parsed = extractThinkingAndBody(finalText);

    args.onDelta(parsed.visible, parsed.thinking);

    return { text: parsed.visible.trim(), usage: response?.usage, provider: response?.provider, model: response?.model };

  } finally {

    try { off?.(); } catch { /* ignore */ }

  }

}











const Bubble = memo(function Bubble({ bubble, bookId, onDismiss, onConfirmSend, onCancelSend, onConfirmOutline, onDismissOutline, onConfirmRole, onDismissRole, onConfirmOutlineApply, onDismissOutlineApply, onConfirmUnderstanding, onDismissUnderstanding, onWizardSelect, onWizardConfirm, onWizardBack, onConfirmGeneratedRole, onRegenerateRoles, onToggleThinking, onWriteBody, onDismissBodyWrite }: BubbleProps) {

 const isOutlinePlan = Boolean(bubble.outlineConfirm) || /章纲概要|正式细纲|已填入/.test(String(bubble.tokenInfo || ''));
 const [collapsed, setCollapsed] = useState(() => {
  if (bubble.role !== 'assistant') return false;
  if (isOutlinePlan) return String(bubble.content || '').length > 320;
  return String(bubble.content || '').length > COLLAPSE_THRESHOLD;
 });
 const [outlineSegMode, setOutlineSegMode] = useState(true);

 const prevLenRef = useRef(bubble.content.length);

 const shouldCollapse = bubble.role === 'assistant' && (
  isOutlinePlan ? bubble.content.length > 320 : bubble.content.length > COLLAPSE_THRESHOLD
 );







 useEffect(() => {

 if (!shouldCollapse) return;

 const th = isOutlinePlan ? 320 : COLLAPSE_THRESHOLD;
 if (prevLenRef.current <= th && bubble.content.length > th) setCollapsed(true);
 prevLenRef.current = bubble.content.length;
 }, [bubble.content.length, shouldCollapse, isOutlinePlan]);







 if (bubble.role === 'system') {

    if (bubble.confirmState) {

      return (

        <div className="mx-auto my-3 max-w-[95%] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-700 dark:text-amber-200 shadow-sm">

          <div>本次请求预计消耗约 <span className="font-bold text-amber-600 dark:text-amber-400">{bubble.confirmState.estimatedTokens.toLocaleString()}</span> token，是否继续？</div>

          <div className="mt-3 flex gap-2">

            <button type="button" onClick={onConfirmSend} className="rounded-md bg-emerald-500 px-4 py-1.5 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-600 transition-colors">继续发送</button>

            <button type="button" onClick={onCancelSend} className="rounded-md border border-[var(--border-color)] bg-[var(--surface)] px-4 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors">取消</button>

          </div>

        </div>

      );

    }

    if (bubble.id === GUIDE_ID) return null;

    return <div className="my-2 rounded-md border border-[var(--border-color)] bg-[var(--surface-hover)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">{bubble.content}</div>;

  }







  if (bubble.role === 'user') {

    return (

      <div className="wz-msg-user">

        <div className="wz-msg-avatar">你</div>

        <div className="wz-msg-body">

          <div className="wz-msg-name">你</div>

          <div className="wz-msg-user-bubble whitespace-pre-wrap break-words">{bubble.content}</div>

        </div>

      </div>

    );

  }







 const isThinking = !bubble.streamingText && /^(正在检索|正在思考|正在生成|正在查证|正在整理|正在构思)/.test(bubble.content);







 return (

 <div className="wz-msg-ai">

 <div className="wz-msg-avatar wz-msg-avatar-app"><img src={appIcon} alt="写梨眼" draggable={false} /></div>

 <div className="wz-msg-body group relative">

 <div className="wz-msg-name">写梨眼 Agent</div>

 <button type="button" onClick={onDismiss} className="absolute right-0 top-0 hidden rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] group-hover:flex">

 <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>

 </button>

 <div className="wz-ag-assistant-bubble">

 {bubble.thinkingEntries?.length ? (

 <AgentThinkingStream

 entries={bubble.thinkingEntries}

 collapsed={
  // 仅用户点收起才收；进行中强制展开，结束后默认仍展示思维过程
  Boolean(bubble.thinkingCollapsed) && !(isThinking || Boolean(bubble.streamingText))
 }

 onToggleCollapse={() => onToggleThinking?.()}

 active={isThinking || Boolean(bubble.streamingText)}

 embedded

 />

 ) : null}

 {isThinking && !bubble.streamingText ? (

  <div className="mt-2">

  <div className="flex items-center gap-2 text-xs text-zinc-400">

  <span className="flex gap-1"><i className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" /><i className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" style={{ animationDelay: '0.2s' }} /><i className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" style={{ animationDelay: '0.4s' }} /></span>

  <span>{bubble.content}</span>

  </div>

  {bubble.thinkingText ? <div className="mt-2 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap bg-[#0c0c0d] border border-zinc-700/40 rounded-lg p-3 max-h-64 overflow-y-auto">{bubble.thinkingText}</div> : null}

  {bubble.agentToolRuns?.length ? <AgentTraceCards runs={bubble.agentToolRuns} defaultOpen /> : null}

  </div>

  ) : (

  <>

  {bubble.thinkingText ? (

  <details className="mt-1.5" open={Boolean(bubble.streamingText)}>

  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors select-none">思考过程</summary>

  <div className="mt-2 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap bg-[#0c0c0d] border border-zinc-700/40 rounded-lg p-3 max-h-64 overflow-y-auto">{bubble.thinkingText}</div>

  </details>

  ) : null}

  {bubble.agentToolRuns?.length ? <AgentTraceCards runs={bubble.agentToolRuns} /> : null}

  {(() => {
   const rawBody = bubble.roleSuggestions && bubble.roleSuggestions.length > 0
    ? stripRoleBlocks(bubble.streamingText || bubble.content)
    : (bubble.streamingText || bubble.content);
   const isChapterReview = Boolean(bubble.agentArtifacts?.some((a) => a.type === 'chapter_review'));
   const showOutlineBoard = isOutlinePlan && !bubble.streamingText && !bubble.roleSuggestions?.length && String(rawBody || '').trim().length > 80;
   if (isChapterReview) {
    const sections = String(rawBody || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    return (
     <div className="mt-3 bg-[#0c0c0d] border border-zinc-700/60 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-700/40 bg-zinc-900/60">
       <span className="w-2 h-2 rounded-full bg-blue-400/80 shrink-0" />
       <span className="text-xs font-semibold text-blue-300 tracking-wide uppercase">当前章评论</span>
      </div>
      <div className="divide-y divide-zinc-700/30">
       {sections.map((sec, i) => {
        const lines = sec.split(/\n+/).filter(Boolean);
        const head = lines[0] || '';
        const rest = lines.slice(1).join('\n');
        const looksHeading = /^【.+】$/.test(head) || /^(整体印象|节奏|人物|情绪|张力|可改进点|优点|问题)/.test(head);
        return (
         <section key={i} className="px-4 py-3">
          {looksHeading ? <div className="text-xs font-semibold text-zinc-300 mb-1.5">{head.replace(/^【|】$/g, '')}</div> : null}
          <div className="whitespace-pre-wrap break-words text-sm text-[var(--text-primary)] leading-relaxed">{looksHeading ? rest : sec}</div>
         </section>
        );
       })}
      </div>
     </div>
    );
   }
   if (showOutlineBoard) {
    const sections = splitOutlineStoryboard(String(rawBody || ''));
    const medium = buildOutlineMediumPreview(String(rawBody || ''), 460);
    return (
     <div className="mt-3 bg-[#0c0c0d] border border-zinc-700/60 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/40 bg-zinc-900/60">
       <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400/80 shrink-0" />
        <span className="text-xs font-semibold text-amber-300 tracking-wide uppercase">章纲故事板</span>
       </div>
       <span className="text-[10px] text-zinc-500 tabular-nums">约 {medium.totalChars} 字</span>
      </div>
      {collapsed ? (
         <div className="px-4 py-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">
        {medium.preview}
        {medium.truncated ? <div className="mt-2 text-xs text-zinc-500 italic">……后文已收起，便于先扫走向</div> : null}
       </div>
      ) : outlineSegMode && sections.length > 1 ? (
       <div className="divide-y divide-zinc-700/30">
        {sections.map((sec) => (
         <section key={sec.title} className="px-4 py-3">
          <div className="text-xs font-semibold text-zinc-300 mb-1.5">{sec.title}</div>
          <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">{sec.body}</div>
         </section>
        ))}
       </div>
      ) : (
        <div className="px-4 py-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed">{renderAgentRichText(rawBody)}</div>
      )}
      <div className="flex gap-2 px-4 py-2.5 border-t border-zinc-700/40 bg-zinc-900/40">
       {shouldCollapse ? (
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
         {collapsed ? '展开全文' : '收起为摘要'}
        </button>
       ) : null}
       {!collapsed && sections.length > 1 ? (
        <button type="button" onClick={() => setOutlineSegMode((v) => !v)} className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
         {outlineSegMode ? '整段阅读' : '分段扫读'}
        </button>
       ) : null}
      </div>
     </div>
    );
   }
   return (
    <>
      <div className={clsx('text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed', collapsed && 'line-clamp-6')}>
      {renderAgentRichText(rawBody)}
      {bubble.streamingText ? <span className="wz-ag-caret" /> : null}
     </div>
     {shouldCollapse ? (
      <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">{collapsed ? '展开' : '收起'}</button>
     ) : null}
    </>
   );
  })()}

  {bubble.chapterLinks && bubble.chapterLinks.length > 0 ? (

  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">

  {bubble.chapterLinks.map((link, idx) => <ChapterLink key={`${link.chapterId}-${idx}`} {...link} bookId={bookId} />)}

  </div>

  ) : null}

  {bubble.tokenInfo ? <div className="wz-ag-token">{bubble.tokenInfo}</div> : null}

  {bubble.localSearchResults?.length ? <LocalSearchCards results={bubble.localSearchResults} bookId={bookId} /> : null}

  {bubble.localRoleResults?.length ? <LocalRoleCards roles={bubble.localRoleResults} bookId={bookId} /> : null}

  {bubble.localArchiveResults?.length ? <LocalArchiveCards archives={bubble.localArchiveResults} bookId={bookId} /> : null}

  {bubble.agentEvidence?.length ? <AgentEvidenceCards evidence={bubble.agentEvidence} bookId={bookId} /> : null}

  {bubble.agentArtifacts?.length ? <AgentArtifactCards artifacts={bubble.agentArtifacts} /> : null}

 {/* 批量大纲预览 */}

 {bubble.outlinePreview && bubble.outlinePreview.status === 'pending' ? (

 <div className="mt-2 border-t border-indigo-300/10 pt-2">

 <div className="mb-1.5 text-[11px] font-bold text-indigo-300">📋 检测到 {bubble.outlinePreview.chapters.length} 章大纲</div>

 <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">

 {bubble.outlinePreview.chapters.map((ch, idx) => (

 <details key={idx} className="group border border-white/5 !bg-zinc-900 px-2 py-1 text-[11px] [&[open]]:bg-black/30">

 <summary className="cursor-pointer list-none font-semibold !text-zinc-300 marker:hidden hover:text-white/95 transition-colors flex items-center gap-1.5">

 <span className="text-[9px] !text-zinc-500 group-open:rotate-90 transition-transform inline-block w-2">▶</span>

 <span className="truncate flex-1">第{ch.chapterNumber}章 {ch.title}</span>

 </summary>

 <div className="mt-1 pl-3.5 text-[10.5px] !text-zinc-400 leading-relaxed">{ch.outline}</div>

 </details>

 ))}

 </div>

 <div className="mt-2 flex gap-1.5">

 <button type="button" onClick={onConfirmOutline} className="flex-1 border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25">确认写入</button>

 <button type="button" onClick={onDismissOutline} className="border !border-zinc-600 !bg-zinc-800 px-3 py-1 text-[11px] !text-zinc-400 transition hover:!bg-zinc-800">忽略</button>

 </div>

 </div>

 ) : bubble.outlinePreview?.status === 'confirmed' ? (

 <div className="mt-2 text-[10px] text-emerald-300/70">✅ 已创建 {bubble.outlinePreview.chapters.length} 个章节</div>

 ) : null}

 {/* 角色卡建议 */}

 {bubble.roleSuggestions && bubble.roleSuggestions.length > 0 ? (

 <div className="mt-3 border-t border-amber-300/10 pt-3">

 <div className="mb-2 text-[11px] font-bold text-amber-300">👤 检测到角色信息</div>

 <div className="space-y-3">

 {bubble.roleSuggestions.map(role => (

 <div key={role.id} className="border !border-zinc-700 !bg-zinc-900 px-3 py-2.5">

 <div className="text-[12px] font-bold !text-zinc-100">{role.name}</div>

 {role.faction ? <div className="mt-1 text-[10px] text-indigo-300/70">阵营：{role.faction}</div> : null}

 {role.roleType && role.roleType !== '待分类' ? <div className="text-[10px] !text-zinc-400">类型：{role.roleType}</div> : null}

 {role.description ? <div className="mt-1 text-[11px] leading-5 !text-zinc-400">{role.description}</div> : null}

 {role.abilities.length > 0 ? <div className="mt-1 text-[10px] text-cyan-300/60">能力：{role.abilities.join('、')}</div> : null}

 <div className="mt-2 flex gap-2">

 {role.status === 'pending' ? (

 <>

 <button type="button" onClick={() => onConfirmRole?.(role.id)} className="border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25">添加到档案</button>

 <button type="button" onClick={() => onDismissRole?.(role.id)} className="border !border-zinc-700 !bg-zinc-800 px-3 py-1 text-[10px] !text-zinc-400 transition hover:!bg-zinc-800">忽略</button>

 </>

 ) : role.status === 'confirmed' ? (

 <span className="text-[10px] text-emerald-400">✅ 已合并到角色库</span>

 ) : (

 <span className="text-[10px] !text-zinc-500">已忽略</span>

 )}

 </div>

 </div>

 ))}

 </div>

 </div>

 ) : null}







 {/* 正文入章（对齐自动工坊 setChapterContent） */}

 {bubble.bodyWriteState?.status === 'pending' ? (

 <div className="mt-3 border-t border-emerald-400/15 pt-3">

 <div className="mb-2 text-[11px] font-bold text-emerald-300">写入章节正文</div>

 <div className="mb-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">清洗旁白后按工坊格式落盘。当前章有长文时请选追加或覆盖。</div>

 <div className="flex flex-wrap gap-1.5">

 <button type="button" onClick={() => onWriteBody?.('current')} className="border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25">写入当前章</button>

 <button type="button" onClick={() => onWriteBody?.('append')} className="border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20">追加到当前章</button>

 <button type="button" onClick={() => onWriteBody?.('new_chapter')} className="border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-indigo-100 transition hover:bg-indigo-500/20">写入空章/新章</button>

 <button type="button" onClick={() => onDismissBodyWrite?.()} className="border border-[var(--border-color)] bg-[var(--surface)] px-2.5 py-1 text-[10.5px] text-[var(--text-muted)] transition hover:bg-[var(--surface-hover)]">忽略</button>

 </div>

 </div>

 ) : bubble.bodyWriteState?.status === 'written' ? (

 <div className="mt-2 text-[10.5px] text-emerald-300/85">

 已写入「{bubble.bodyWriteState.title || '章节'}」· 约 {bubble.bodyWriteState.wordCount?.toLocaleString() || 0} 字

 {bubble.bodyWriteState.chapterId ? (

 <button

 type="button"

 className="ml-2 underline decoration-emerald-400/40 hover:text-emerald-200"

 onClick={() => useAppStore.getState().openEditor(bookId, bubble.bodyWriteState!.chapterId!)}

 >打开章节</button>

 ) : null}

 </div>

  ) : bubble.bodyWriteState?.status === 'error' ? (

  <div className="mt-2 text-[10.5px] text-rose-300/85">{bubble.bodyWriteState.message || '写入失败'}</div>

  ) : null}

  {/* 存入技能库（手动确认制）：本次任务用过技能类工具且有产出时，用户自选保存 */}
  {bubble.skillUsage && (bubble.skillUsage.didWrite || bubble.skillUsage.didReview || bubble.skillUsage.loadedSkill) ? (
  <div className="mt-2 flex items-center gap-2">
  <button
   type="button"
   onClick={() => {
    const currentBook = useBookStore.getState().books.find((b) => b.id === bookId);
    useUserSkillStore.getState().proposeFromUsage(bookId, currentBook?.title || '当前作品', {
    didWrite: bubble.skillUsage!.didWrite,
    didReview: bubble.skillUsage!.didReview,
    loadedSkill: bubble.skillUsage!.loadedSkill,
    draftExcerpt: bubble.skillUsage!.draftExcerpt,
    });
   }}
   className="border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-amber-200 transition hover:bg-amber-500/20"
   title="把本次写作/审查方法存入技能库，下次会话可复用"
  >存入技能库</button>
  </div>
  ) : null}








 {/* 细纲推演确认卡片 */}

 {bubble.outlineConfirm && (
 <div className="wz-ag-outline-actions">
 <div className="wz-ag-outline-actions-label">章纲概要 → {bubble.outlineConfirm.targetTitle}</div>
 <div className="wz-ag-outline-actions-btns">
 <button type="button" onClick={() => onConfirmOutlineApply?.(bubble.id)} className="wz-ag-outline-btn primary">
 满意，出细纲
 </button>
 <button type="button" onClick={() => onDismissOutlineApply?.(bubble.id)} className="wz-ag-outline-btn">
 继续讨论
 </button>
 </div>
 </div>
 )}

 {/* 老书「书的理解」对齐确认卡（T8.2） */}
 {bubble.understandingConfirm && (
 <div className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.06] p-3">
 <div className="text-[11px] font-bold text-indigo-300">书的理解 · 首次对齐</div>
 <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[10.5px] text-[var(--text-secondary)]">
 {bubble.understandingConfirm.understandingText}
 </div>
 <div className="mt-2 text-[10px] text-[var(--text-muted)]">
 {bubble.understandingConfirm.coveredChapterCount > 0 ? `已覆盖 ${bubble.understandingConfirm.coveredChapterCount} 章档案` : '尚无剧情档案'}
 </div>
 <div className="mt-2 flex gap-2">
 <button type="button" onClick={() => onConfirmUnderstanding?.(bubble.id)} className="wz-ag-outline-btn primary">
 确认，开始续写
 </button>
 <button type="button" onClick={() => onDismissUnderstanding?.(bubble.id)} className="wz-ag-outline-btn">
 先纠正
 </button>
 </div>
 </div>
 )}

 {/* 新书 wizard 确认卡（P2-A2~A5） */}
 {bubble.wizardCard && (
 <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.06] p-3">
  <div className="text-[11px] font-bold text-amber-300">{bubble.wizardCard.title}</div>
  <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-[10.5px] text-[var(--text-secondary)]">
   {bubble.wizardCard.body}
  </div>
  {bubble.wizardCard.options && (
   <div className="mt-2 space-y-1.5">
    {bubble.wizardCard.options.map((opt) => (
     <button
      key={opt.key}
      type="button"
      onClick={() => onWizardSelect?.(bubble.id, opt.key)}
      className="wz-ag-outline-btn block w-full text-left"
     >
      <b>{opt.title}</b>
      <span className="block text-[10px] text-[var(--text-muted)]">{opt.body}</span>
     </button>
    ))}
   </div>
  )}
  {!bubble.wizardCard.options && (
   <div className="mt-2 flex gap-2">
    <button type="button" onClick={() => onWizardConfirm?.(bubble.id)} className="wz-ag-outline-btn primary">
     {bubble.wizardCard.isFinal ? '确认大纲，开始写作' : '确认，下一步'}
    </button>
    {bubble.wizardCard.step > 1 && (
     <button type="button" onClick={() => onWizardBack?.(bubble.id)} className="wz-ag-outline-btn">
      回退修改
     </button>
    )}
   </div>
  )}
 </div>
 )}

 {/* 本地生成角色卡按钮 */}

 {bubble.generatedRoles && bubble.generatedRoles.length > 0 && (

 <div className="mt-3 border-t border-amber-300/10 pt-3">

 <div className="mb-2 text-[11px] font-bold text-amber-300">🎭 选择要添加的角色</div>

 <div className="space-y-2">

 {bubble.generatedRoles.map((card, idx) => (

 <div key={idx} className="flex items-center gap-2">

 <span className="text-[11px] !text-zinc-300 flex-1 truncate">{card.name}（{card.faction} · {card.roleType}）</span>

 <button

 type="button"

 onClick={() => onConfirmGeneratedRole?.(bubble.id, idx)}

 className="shrink-0 border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-200 transition hover:bg-amber-500/25"

 >

 添加到角色库

 </button>

 </div>

 ))}

 </div>

 <button

 type="button"

 onClick={() => onRegenerateRoles?.()}

 className="mt-2 border !border-zinc-700 !bg-zinc-800 px-2 py-0.5 text-[9px] !text-zinc-400 transition hover:!bg-zinc-800"

 >

 🔄 重新生成

 </button>

 </div>

 )}

 </>

 )}

 </div>
 </div>

 </div>

 );

});







function GuideEmptyState({ bookTitle }: { bookTitle: string }) {

 return (

 <div className="wz-ag-empty">

 <div className="wz-ag-empty-mark wz-msg-avatar-app"><img src={appIcon} alt="写梨眼" draggable={false} /></div>

 <div className="wz-ag-empty-title">已连接《{bookTitle}》</div>

 <div className="wz-ag-empty-sub">直接说你想讨论、想写、想查的；我会按讨论 / 执行 / 查证处理。</div>

 </div>

 );

}











/** 章纲/细纲推演的目标章：优先当前章与「当前位置之后」的空章，禁止从全书开头误抓第15章这类早期短章。 */

function resolveOutlineTargetChapter(book: Book, current: Chapter): { chapter: Chapter; index: number; label: string } {

  const chapters = book.chapters || [];

  const fallback = current || chapters[chapters.length - 1];

  if (!chapters.length || !fallback) {

    return { chapter: current, index: 0, label: current?.title || '当前章' };

  }







  const plainLen = (ch: Chapter) =>

    String(ch.content || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, '').length;







  const isEmptyish = (ch: Chapter) => {

    const wc = Number(ch.wordCount || 0);

    return wc < 80 && plainLen(ch) < 80;

  };







  const labelOf = (ch: Chapter, index: number) => {

    const title = String(ch.title || '').trim();

    if (/第\s*\d+\s*章/.test(title)) return title;

    return `第${index + 1}章${title ? ` ${title}` : ''}`;

  };







  const curIdx = chapters.findIndex((c) => c.id === current.id);

  const start = curIdx >= 0 ? curIdx : Math.max(0, chapters.length - 1);







  // 1) 当前章空着 / 待写 → 就是它

  if (curIdx >= 0 && isEmptyish(chapters[curIdx])) {

    const ch = chapters[curIdx];

    return { chapter: ch, index: curIdx, label: labelOf(ch, curIdx) };

  }







  // 2) 从当前章起往后找空章（下一章待写）

  for (let i = start; i < chapters.length; i++) {

    if (isEmptyish(chapters[i])) {

      return { chapter: chapters[i], index: i, label: labelOf(chapters[i], i) };

    }

  }







  // 3) 从末尾往前找空章

  for (let i = chapters.length - 1; i >= 0; i--) {

    if (isEmptyish(chapters[i])) {

      return { chapter: chapters[i], index: i, label: labelOf(chapters[i], i) };

    }

  }







  // 4) 当前章（讨论「这章」时即使已有正文也锚定当前）

  if (curIdx >= 0) {

    const ch = chapters[curIdx];

    return { chapter: ch, index: curIdx, label: labelOf(ch, curIdx) };

  }







  const last = chapters[chapters.length - 1];

  const lastIdx = chapters.length - 1;

  return { chapter: last, index: lastIdx, label: labelOf(last, lastIdx) };

}











// ────── 主面板 ────────────────────────────────────────────────────────────────







export function AgentChatPanel({ book, chapter, onClose }: AgentChatPanelProps) {

 const [mode, setMode] = useState<AgentMode>('query');

 const shellTab = 'agent';

type AgentSessionLite = {
 id: string;
 title: string;
 createdAt: number;
 updatedAt: number;
 bubbles: ChatBubble[];
 conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
 mode: AgentMode;
 workflow: AgentWorkflow;
};

 const [chatBubbles, setChatBubbles] = useState<ChatBubble[]>(() => [{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]);
 // 新书 wizard 状态机（P2-A1，面板本地持有）
 const [agentWizardState, wizardDispatch] = useReducer<React.Reducer<AgentWizardState | null, WizardAction>>(
  wizardReducer,
  null as AgentWizardState | null
 );
 const [agentSessions, setAgentSessions] = useState<AgentSessionLite[]>(() => [{
  id: 'current',
  title: '当前会话',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  bubbles: [{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }],
  conversation: [],
  mode: 'query',
  workflow: 'general'
 }]);
 const [activeSessionId, setActiveSessionId] = useState<string>('current');

 const [chatInput, setChatInput] = useState('');

 const [busy, setBusy] = useState(false);

 const [agentWebSearch, setAgentWebSearch] = useState(false);

 const [workflow, setWorkflow] = useState<AgentWorkflow>('general');
 const [agentTaskState, setAgentTaskState] = useState<AgentTaskState>({ kind: 'idle' });

 /* agent task state chapter guard：切章后丢弃非本目标章的待写状态 */
 useEffect(() => {
  setAgentTaskState((prev) => {
   if (prev.kind === 'idle') return prev;
   if (prev.kind === 'outline_ready' || prev.kind === 'writing_from_outline' || prev.kind === 'draft_ready') {
    // 目标章仍在书中则保留；否则清空
    const stillThere = (book.chapters || []).some((c) => c.id === prev.chapterId);
    if (!stillThere) return { kind: 'idle' };
    // 用户切到完全无关章且状态是 draft/writing 时，仅当 chapterId 不匹配当前章也不匹配 outline 目标时保留 outline_ready，其余跟章走
    if (prev.kind !== 'outline_ready' && prev.chapterId !== chapter.id) {
      return { kind: 'idle' };
    }
   }
   if (prev.kind === 'discussing_outline' && prev.chapterId !== chapter.id) {
    return { kind: 'idle' };
   }
   return prev;
  });
 }, [chapter.id, book.chapters]);


 const aiConfig = useConfigStore((state) => state.config?.ai);

 const saveConfig = useConfigStore((state) => state.saveConfig);

 const appConfig = useConfigStore((state) => state.config);

 const agentModelLabel = aiConfig?.model || '未选择模型';

 const agentProvider = aiConfig?.provider || 'proxy';

 const [modelMenuOpen, setModelMenuOpen] = useState(false);

 const modelMenuRef = useRef<HTMLDivElement | null>(null);







 const agentModelOptions = useMemo(() => getSelectableModels(appConfig), [appConfig]);

 const [probingModels, setProbingModels] = useState(false);

 const probeAvailableModels = useCallback(async () => {
  if (!appConfig || probingModels) return;
  setProbingModels(true);
  try {
   const result = await probeProviderModels({ config: appConfig, save: true });
   if (result.ok) {
    useIslandStore.getState().show({
     type: 'success',
     message: `已检测 ${result.liveCount} 个可用模型（全局生效）`,
     autoHideMs: 1800
    });
   } else {
    useIslandStore.getState().show({ type: 'error', message: result.message.slice(0, 160) });
   }
  } catch (err) {
   useIslandStore.getState().show({
    type: 'error',
    message: `检测失败：${err instanceof Error ? err.message : String(err)}`
   });
  } finally {
   setProbingModels(false);
  }
 }, [appConfig, probingModels]);







 const shortModelLabel = useMemo(() => {

  const raw = String(agentModelLabel || '');

  if (raw.length <= 18) return raw;

  // deepseek-v4-flash -> deepseek-v4-flash 仍长则截断中间

  if (raw.length <= 28) return raw;

  return `${raw.slice(0, 12)}…${raw.slice(-8)}`;

 }, [agentModelLabel]);







 const switchAgentModel = useCallback(async (model: string) => {

  if (!appConfig || !model || model === agentModelLabel) {

   setModelMenuOpen(false);

   return;

  }

  const next = {

   ...appConfig,

   ai: {

    ...appConfig.ai,

    model,

    providerModels: {

     ...(appConfig.ai.providerModels || {}),

     [appConfig.ai.provider]: Array.from(new Set([

      ...(appConfig.ai.providerModels?.[appConfig.ai.provider] || []),

      model

     ]))

    },

    providerLastModels: {

     ...(appConfig.ai.providerLastModels || {}),

     [appConfig.ai.provider]: model

    }

   }

  };

  try {

   await saveConfig(next);

   useIslandStore.getState().show({ type: 'success', message: `已切换模型：${model}`, autoHideMs: 1400 });

  } catch (err) {

   useIslandStore.getState().show({ type: 'error', message: `切换失败：${err instanceof Error ? err.message : String(err)}` });

  } finally {

   setModelMenuOpen(false);

  }

 }, [appConfig, agentModelLabel, saveConfig]);







 useEffect(() => {

  if (!modelMenuOpen) return;

  const onDoc = (e: MouseEvent) => {

   if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false);

  };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModelMenuOpen(false); };

  document.addEventListener('mousedown', onDoc);

  document.addEventListener('keydown', onKey);

  return () => {

   document.removeEventListener('mousedown', onDoc);

   document.removeEventListener('keydown', onKey);

  };

 }, [modelMenuOpen]);







 const [activeEntity, setActiveEntity] = useState('');

 const [pendingConfirmId, setPendingConfirmId] = useState<string | null>(null);







 const storageKey = useMemo(() => getPanelStorageKey(book.id), [book.id]);







 useEffect(() => {

 try {

 const raw = window.localStorage.getItem(storageKey);

 if (!raw) { setChatBubbles([{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]); return; }

 const parsed = JSON.parse(raw) as { bubbles?: ChatBubble[]; mode?: AgentMode; workflow?: AgentWorkflow };

 if (parsed.mode) setMode(parsed.mode);

 if (parsed.workflow) setWorkflow(parsed.workflow);

 setChatBubbles(Array.isArray(parsed.bubbles) && parsed.bubbles.length > 0 ? parsed.bubbles : [{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]);

 const restored = (Array.isArray(parsed.bubbles) ? parsed.bubbles : [])

 .filter((b: any) => b && (b.role === 'user' || b.role === 'assistant') && typeof b.content === 'string' && b.content.trim())

 .map((b: any) => ({ role: b.role as 'user' | 'assistant', content: String(b.content) }));

 conversationRef.current = restored.slice(-20);







 } catch { setChatBubbles([{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]); }

 }, [storageKey]);







 const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 const [bubbleMenu, setBubbleMenu] = useState<{ x: number; y: number } | null>(null);

 const [selectDeleteMode, setSelectDeleteMode] = useState(false);

 const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
const [sessionMenu, setSessionMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
const [renameSessionState, setRenameSessionState] = useState<{ sessionId: string; value: string } | null>(null);

const buildSessionTitle = useCallback((bubbles: ChatBubble[]) => {
 const firstUser = bubbles.find((b) => b.role === 'user' && String(b.content || '').trim());
 const raw = String(firstUser?.content || '新会话').replace(/\s+/g, ' ').trim();
 return raw.length > 18 ? `${raw.slice(0, 18)}…` : raw;
}, []);

const syncActiveSession = useCallback((nextBubbles: ChatBubble[], nextMode?: AgentMode, nextWorkflow?: AgentWorkflow) => {
 setAgentSessions((prev) => prev.map((sess) => sess.id === activeSessionId ? {
  ...sess,
  updatedAt: Date.now(),
  title: buildSessionTitle(nextBubbles),
  bubbles: nextBubbles,
  conversation: conversationRef.current.slice(-20),
  mode: nextMode ?? mode,
  workflow: nextWorkflow ?? workflow,
 } : sess));
}, [activeSessionId, buildSessionTitle, mode, workflow]);

const switchAgentSession = useCallback((sessionId: string) => {
 const target = agentSessions.find((s) => s.id === sessionId);
 if (!target) return;
 setActiveSessionId(sessionId);
 setMode(target.mode);
 setWorkflow(target.workflow);
 setChatBubbles(target.bubbles.length ? target.bubbles : [{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]);
 conversationRef.current = target.conversation.slice(-20);
 agentContextRef.current = {};
 setPendingConfirmId(null);
 activeThinkingIdRef.current = null;
 setAgentTaskState({ kind: 'idle' });
 setHistoryMenuOpen(false);
}, [agentSessions, mode, workflow]);

const createNewAgentSession = useCallback(() => {
 const guide = mode === 'query' ? GUIDE_QUERY : mode === 'outline' ? GUIDE_OUTLINE : GUIDE_WRITE;
 const freshId = makeId('sess');
 const fresh: AgentSessionLite = {
  id: freshId,
  title: '新会话',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  bubbles: [{ id: GUIDE_ID, role: 'system', content: guide }],
  conversation: [],
  mode,
  workflow,
 };
 // 新建前先把当前会话快照进列表，避免旧会话丢内容
 setAgentSessions((prev) => {
  const snapTitle = buildSessionTitle(chatBubbles);
  const withSnap = prev.map((sess) => sess.id === activeSessionId ? {
   ...sess,
   updatedAt: Date.now(),
   title: snapTitle,
   bubbles: chatBubbles,
   conversation: conversationRef.current.slice(-20),
   mode,
   workflow,
  } : sess);
  return [fresh, ...withSnap];
 });
 setActiveSessionId(freshId);
 setChatBubbles(fresh.bubbles);
 conversationRef.current = [];
 agentContextRef.current = {};
 setActiveEntity('');
 setPendingConfirmId(null);
 activeThinkingIdRef.current = null;
 setAgentTaskState({ kind: 'idle' });
 setHistoryMenuOpen(false);
}, [mode, workflow, chatBubbles, activeSessionId, buildSessionTitle]);

const renameAgentSession = useCallback((sessionId: string) => {
 const sess = agentSessions.find((s) => s.id === sessionId);
 if (!sess) return;
 setRenameSessionState({ sessionId, value: sess.title || '未命名会话' });
 setSessionMenu(null);
}, [agentSessions]);

const submitRenameAgentSession = useCallback(() => {
 if (!renameSessionState) return;
 const title = renameSessionState.value.trim();
 if (!title) {
  setRenameSessionState(null);
  return;
 }
 setAgentSessions((prev) => prev.map((s) => s.id === renameSessionState.sessionId ? { ...s, title, updatedAt: Date.now() } : s));
 setRenameSessionState(null);
}, [renameSessionState]);

const deleteAgentSession = useCallback((sessionId: string) => {
 setAgentSessions((prev) => {
  if (prev.length <= 1) {
   useIslandStore.getState().show({ type: 'warning', message: '至少保留一个会话', autoHideMs: 1200 });
   return prev;
  }
  const idx = prev.findIndex((s) => s.id === sessionId);
  if (idx < 0) return prev;
  const next = prev.filter((s) => s.id !== sessionId);
  if (activeSessionId === sessionId) {
   const fallback = next[Math.max(0, idx - 1)] || next[0];
   if (fallback) {
    setActiveSessionId(fallback.id);
    setMode(fallback.mode);
    setWorkflow(fallback.workflow);
    setChatBubbles(fallback.bubbles.length ? fallback.bubbles : [{ id: GUIDE_ID, role: 'system', content: GUIDE_UNIFIED }]);
    conversationRef.current = fallback.conversation.slice(-20);
    agentContextRef.current = {};
    setPendingConfirmId(null);
    activeThinkingIdRef.current = null;
    setAgentTaskState({ kind: 'idle' });
   }
  }
  return next;
 });
 setSessionMenu(null);
}, [activeSessionId]);


 useEffect(() => {
  if (!historyMenuOpen) return;
  const onDoc = (e: MouseEvent) => {
   const target = e.target as HTMLElement | null;
   if (target?.closest('[data-ag-session-menu]') || target?.closest('[data-ag-session-trigger]') || target?.closest('[data-ag-session-wrap]') || target?.closest('[data-ag-session-item-menu]')) return;
   setHistoryMenuOpen(false);
   setSessionMenu(null);
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setHistoryMenuOpen(false); setSessionMenu(null); setRenameSessionState(null); } };
  document.addEventListener('mousedown', onDoc);
  document.addEventListener('keydown', onKey);
  return () => {
   document.removeEventListener('mousedown', onDoc);
   document.removeEventListener('keydown', onKey);
  };
 }, [historyMenuOpen]);






 useEffect(() => {

 if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

 saveTimerRef.current = setTimeout(() => {

 try {

 const trimmed = chatBubbles.length > 60 ? chatBubbles.slice(-60) : chatBubbles;
 syncActiveSession(trimmed);

 const cleaned = trimmed.map(b => ({

 ...b,

 confirmState: undefined,

 // 保留 outlinePreview 和 roleSuggestions 的状态（已确认/已忽略的记录）

 outlinePreview: b.outlinePreview ? { chapters: b.outlinePreview.chapters, status: b.outlinePreview.status } : undefined,

 roleSuggestions: b.roleSuggestions?.map(r => ({ ...r })),

 bodyWriteState: b.bodyWriteState ? { ...b.bodyWriteState } : undefined,

 // 全文命中与本地档案卡可能很大，只在当前会话内保留，避免挤爆 localStorage。

 localSearchResults: undefined,

 localRoleResults: undefined,

 localArchiveResults: undefined,

 agentToolRuns: undefined,

 agentEvidence: undefined,

 agentArtifacts: undefined

 }));

 window.localStorage.setItem(storageKey, JSON.stringify({ bubbles: cleaned, mode, workflow }));

 } catch {}

 }, 800);

 return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };

 }, [chatBubbles, mode, storageKey, workflow]);







 const scrollRef = useRef<HTMLDivElement | null>(null);

 useEffect(() => { const el = scrollRef.current; if (!el) return; requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; }); }, [chatBubbles]);







 const conversationRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

 const agentContextRef = useRef<AgentConversationContext>({});

 const [roleCreationMode, setRoleCreationMode] = useState(false);







 const activeThinkingIdRef = useRef<string | null>(null);
const agentAbortRef = useRef<AbortController | null>(null);
const handleSendUnifiedRef = useRef<(() => void) | null>(null);

const handleStop = useCallback(() => {
  agentAbortRef.current?.abort();
  setBusy(false);
  activeThinkingIdRef.current = null;
}, []);







 const appendThoughtToBubble = useCallback((bubbleId: string, text: string, step = 0, icon?: ThinkingEntry['icon']) => {
 const entry = makeThinkingEntry(step, text, icon);
 setChatBubbles((prev) => prev.map((item) => {
 if (item.id !== bubbleId) return item;
 const list = [...(item.thinkingEntries || [])];
 const last = list[list.length - 1];
 // 同一步进度刷新（执行中 → 完成），避免思维流重复刷同一工具
 if (last && last.step > 0 && step > 0 && last.step === step) {
  list[list.length - 1] = { ...entry, id: last.id };
  return { ...item, thinkingEntries: list.slice(-80), thinkingCollapsed: false };
 }
 if (last && last.text === entry.text) return item;
 list.push(entry);
 return {
  ...item,
  thinkingEntries: list.slice(-80),
  thinkingCollapsed: false
 };
 }));
 }, []);

 // 订阅全局思维事件（一键写作 / 自主模式 / 决策循环）





 // 订阅全局思维事件（一键写作 / 自主模式 / 决策循环）

 useEffect(() => {

 const onThought = (ev: Event) => {

 const detail = (ev as CustomEvent).detail as { thought?: string; step?: number } | undefined;

 if (!detail?.thought) return;

 const targetId = activeThinkingIdRef.current;

 if (!targetId) return;

 appendThoughtToBubble(targetId, String(detail.thought), Number(detail.step || 0));

 };

 window.addEventListener('writerzen:agent-thought', onThought as EventListener);

 return () => {

 window.removeEventListener('writerzen:agent-thought', onThought as EventListener);

 };

 }, [appendThoughtToBubble]);







  const handleClearChat = useCallback(() => {
 const guide = mode === 'query' ? GUIDE_QUERY : mode === 'outline' ? GUIDE_OUTLINE : GUIDE_WRITE;
 const fresh = [{ id: GUIDE_ID, role: 'system' as const, content: guide }];
 setChatBubbles(fresh);
 conversationRef.current = [];
 agentContextRef.current = {};
 setActiveEntity('');
 setPendingConfirmId(null);
 activeThinkingIdRef.current = null;
 setAgentTaskState({ kind: 'idle' });
 syncActiveSession(fresh);
 }, [mode, syncActiveSession]);







 const switchMode = useCallback((newMode: AgentMode) => {

 setMode(newMode);

 const guide = newMode === 'query' ? GUIDE_QUERY : newMode === 'outline' ? GUIDE_OUTLINE : GUIDE_WRITE;

 setChatBubbles([{ id: GUIDE_ID, role: 'system', content: guide }]);

 conversationRef.current = [];

 agentContextRef.current = {};

 setActiveEntity('');

 setPendingConfirmId(null);

 }, []);







const restoreSessionFromHistory = useCallback((sessionId: string) => {
 switchAgentSession(sessionId);
 useIslandStore.getState().show({ type: 'success', message: '已切换会话', autoHideMs: 1200 });
}, [switchAgentSession]);

 useEffect(() => {
 // 角色/大纲面板的开关由 Editor 端响应；Agent 端只占位订阅，保持事件流一致
 const handler = (e: Event) => {
 const detail = (e as CustomEvent).detail;
 const tab = detail?.tab;
 if (!tab) {
 // 关闭角色/大纲面板时，保持 Agent 自己的 focus，不切换
 }
 };
 window.addEventListener('writerzen:toggle-side-panel', handler);
 return () => window.removeEventListener('writerzen:toggle-side-panel', handler);
 }, []);







 // ── 直接发送（不再弹 token 确认） ──────────────────────────────────────────

 const executeSend = useCallback(async (

 confirmBubbleId: string | null,

 direct?: {

 messages: Array<{ role: string; content: string }>;

 userContent: string;

 agentLoop?: boolean;

 workflow?: AgentWorkflow;

 forceWrite?: boolean;

 }

 ) => {

 const bubble = confirmBubbleId ? chatBubbles.find(b => b.id === confirmBubbleId) : undefined;

 const payload = direct || bubble?.confirmState;

 if (!payload) return;


 const { messages, userContent } = payload;

 const useAgentLoop = Boolean(payload.agentLoop) && !direct?.forceWrite;

 setPendingConfirmId(null);

 setBusy(true);

 const thinkingId = makeId('thinking');

 activeThinkingIdRef.current = thinkingId;

 const writing = Boolean(direct?.forceWrite) || mode === 'write' || !useAgentLoop;

 const initialThought = makeThinkingEntry(0, writing ? '正在生成…' : '正在思考…', 'think');

 if (confirmBubbleId) {

 setChatBubbles(prev => prev.map(b => b.id === confirmBubbleId ? {

 id: thinkingId,

 role: 'assistant',

 content: writing ? '正在生成...' : '正在思考...',

 confirmState: undefined,

 thinkingEntries: [initialThought],

 thinkingCollapsed: false

 } : b));

 } else {

 setChatBubbles(prev => [...prev, {

 id: thinkingId,

 role: 'assistant',

 content: writing ? '正在生成...' : '正在思考...',

 thinkingEntries: [initialThought],

 thinkingCollapsed: false

 }]);

 }

 try {

  if (useAgentLoop) {

  await useBookStore.getState().ensureBookContentLoaded(book.id);

  // 档案读权威 memory.json（book.json 里是旧快照，重启后 book.memoryBank 会过期）
  await useBookStore.getState().loadMemoryBank(book.id);

  const freshBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;

  const freshChapter = freshBook.chapters.find((item) => item.id === chapter.id) || chapter;

  const result = await runReadOnlyAgentLoop({

 book: freshBook,

 currentChapter: freshChapter,

 query: userContent,

 workflow: (payload as any).workflow || workflow,

 conversation: conversationRef.current.slice(-12),

 onToolRuns: (runs) => {

 const active = runs[runs.length - 1];

 if (active) {

 const text = active.status === 'running'

 ? `调用 ${active.tool}：${active.reason || '查证中'}`

 : `${active.tool} → ${active.summary || active.status}`;

 appendThoughtToBubble(thinkingId, text, active.step || 0, active.status === 'running' ? 'search' : 'tool');

 }

 setChatBubbles(prev => prev.map((item) => item.id === thinkingId ? {

 ...item,

 content: active?.status === 'running' ? `正在查证：${active.reason}` : '正在整理已找到的证据…',

 agentToolRuns: runs

 } : item));

 }

 });

 // answer 在下方 safeAnswer 后再写入 conversation（避免 tool JSON 污染记忆）

 conversationRef.current.push({ role: 'user', content: userContent });

 if (conversationRef.current.length > 40) conversationRef.current = conversationRef.current.slice(-20);

 const mentionedRole = (freshBook.resourceIndex?.customCharacterCategories || [])

 .flatMap((category) => category.children || [])

 .find((role) => [role.name, ...(role.aliases || [])].some((name) => userContent.includes(name)));

 if (mentionedRole) { agentContextRef.current = { ...agentContextRef.current, lastEntity: mentionedRole.name }; setActiveEntity(mentionedRole.name); }

 const safeAnswer = (() => {

  const a = String(result.answer || '').trim();

  if (/^\s*\{[\s\S]*"type"\s*:\s*"tool_call"/.test(a) || (/^\s*\{/.test(a) && /"tool"\s*:/.test(a) && /"arguments"\s*:/.test(a))) {

   return '查证过程已执行，但模型返回了工具指令原文而不是可读结论。请换个说法再问，或直接让我「讨论大纲 / 按细纲写」。';

  }

  return a || '没有整理出可读回答。';

 })();

 appendThoughtToBubble(thinkingId, '查证完成，已整理回答', 0, 'ok');

 setChatBubbles(prev => prev.map((item) => item.id === thinkingId ? {

 ...item,

 content: safeAnswer,

 tokenInfo: result.totalTokens

  ? (result.tokenSource === 'estimate'

    ? `Agent 查证 · 约 ${result.totalTokens.toLocaleString()} token（估算）`

    : result.tokenSource === 'api'

      ? `Agent 查证 · ${result.totalTokens.toLocaleString()} token`

      : `Agent 查证 · ${result.totalTokens.toLocaleString()} token`)

  : 'Agent 查证',

 agentToolRuns: result.toolRuns,

 agentEvidence: result.evidence,

 agentArtifacts: result.artifacts

 } : item));

 conversationRef.current.push({ role: 'assistant', content: safeAnswer });

 if (conversationRef.current.length > 40) conversationRef.current = conversationRef.current.slice(-20);

 return;

 }







 // 联网搜索注入

 if (agentWebSearch) {

 try {

 const internals = (window as any).__TAURI_INTERNALS__;

 if (internals?.invoke) {

 const searchResult = await internals.invoke('web_search', { query: userContent }) as string;

 if (searchResult && searchResult.length > 10) {

 messages.splice(1, 0, { role: 'system', content: searchResult });

 }

 }

 } catch { /* 搜索失败不阻塞 */ }

 }

 const response = await streamAiChat({

 messages: messages as any,

 bookId: book.id,

 chapterId: chapter.id,

 disableRag: true,

 disableStyle: mode === 'query',

 senderId: 'agent-panel',

 onDelta: (visible, thinking) => {

 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {

 ...b,

 content: visible ? '正在生成…' : (thinking ? '正在思考…' : '正在生成…'),

 streamingText: visible || undefined,

 thinkingText: thinking || undefined,

 } : b));

 },

 });

 let aiText = (response?.text || '').trim();

 if (!aiText) {
  const fallback = stripMarkdownEmphasis(normalizeChinesePunctuation(response?.text || '')).trim();
  if (fallback) aiText = fallback;
  else throw new Error('AI 返回为空');
 }

 conversationRef.current.push({ role: 'user', content: userContent });

 // aiText 已经过 splitAgentOutput，只保留正文

 conversationRef.current.push({ role: 'assistant', content: aiText });

 if (conversationRef.current.length > 40) conversationRef.current = conversationRef.current.slice(-20);

 const tokenInfo = response?.usage?.totalTokens ? `📊 ${response.usage.totalTokens} token` : '';







 // 检测是否包含批量大纲

 let outlinePreview: ChatBubble['outlinePreview'] = undefined;

 if (hasOutlineMarker(aiText)) {

 const parsed = parseOutlineFromResponse(aiText);

 if (parsed.success && parsed.chapters.length > 0) {

 outlinePreview = { chapters: parsed.chapters, status: 'pending' };

 }

 }







 // 检测是否包含角色卡标记（来自"创造角色"流程的 AI 回复）

 let roleSuggestions: RoleCardSuggestion[] | undefined = undefined;

 if (hasRoleMarker(aiText)) {

 const existingRoles = (book.resourceIndex?.customCharacterCategories || []).flatMap(c => c.children || []);

 const extracted = extractRolesFromText(aiText, existingRoles);

 if (extracted.length > 0) roleSuggestions = extracted;

 }







 appendThoughtToBubble(thinkingId, '生成完成', 0, 'ok');

 const splitFinal = splitAgentOutput(aiText);

 const finalBody = stripMarkdownEmphasis(normalizeChinesePunctuation(splitFinal.body)).trim();

 const finalThink = stripMarkdownEmphasis(splitFinal.thinking).trim();

 if (finalThink) {

 // 思维过程完整写入气泡 thinkingText；步骤流只留摘要

 appendThoughtToBubble(thinkingId, finalThink.length > 180 ? finalThink.slice(0, 180) + '…' : finalThink, 0, 'think');

 }

 let reviewedBody = finalBody;
 let reviewInfo = '';
 if (writing && looksLikeInsertableProse(finalBody) && !outlinePreview && !(roleSuggestions && roleSuggestions.length)) {
  try {
   appendThoughtToBubble(thinkingId, '正在做写后自检…', 0, 'review');
   const reviewResult = await reviewAndMaybeReviseDraft({
    book,
    chapter,
    outlineText: agentTaskState.kind === 'writing_from_outline' || agentTaskState.kind === 'outline_ready' ? ('outlineText' in agentTaskState ? agentTaskState.outlineText : agentTaskState.planText) : '',
    userInstruction: userContent,
    draft: finalBody,
    onDelta: (_visible, thinking) => {
     if (thinking) appendThoughtToBubble(thinkingId, thinking.slice(0, 180), 0, 'review');
    }
   });
   reviewedBody = reviewResult.text || finalBody;
   reviewInfo = reviewResult.revised ? ' · 自检已修订' : (reviewResult.reviewSummary ? ' · 自检通过' : '');
   if (reviewResult.revised) appendThoughtToBubble(thinkingId, '自检发现硬问题，已自动修订一次', 0, 'review');
   else appendThoughtToBubble(thinkingId, '自检通过', 0, 'ok');
  } catch (reviewErr) {
   appendThoughtToBubble(thinkingId, `自检跳过：${reviewErr instanceof Error ? reviewErr.message.slice(0, 80) : String(reviewErr).slice(0, 80)}`, 0, 'warn');
  }
 }
 const canWriteBody = (mode === 'write' || direct?.forceWrite === true) && looksLikeInsertableProse(reviewedBody) && !outlinePreview && !(roleSuggestions && roleSuggestions.length);
 if (canWriteBody) setAgentTaskState({ kind: 'draft_ready', chapterId: chapter.id, bodyText: reviewedBody });
 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {
 ...b,
 content: reviewedBody || '（模型只返回了写作计划，没有正文。请再说一次“只输出正文”）',
 streamingText: undefined,
 thinkingText: finalThink || b.thinkingText,
 tokenInfo: tokenInfo ? `${tokenInfo}${reviewInfo}` : reviewInfo.trim(),
 outlinePreview,
 roleSuggestions,
 bodyWriteState: canWriteBody ? { status: 'pending' as const } : undefined
 } : b));
 } catch (err) {

 const errMsg = err instanceof Error ? err.message : String(err);

 appendThoughtToBubble(thinkingId, `失败：${errMsg.slice(0, 80)}`, 0, 'warn');

 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? { ...b, content: `请求失败：${errMsg.slice(0, 200)}` } : b));

 } finally {

 setBusy(false);

 if (activeThinkingIdRef.current === thinkingId) activeThinkingIdRef.current = null;

 }

 }, [chatBubbles, book, chapter, mode, agentWebSearch, workflow, appendThoughtToBubble, agentTaskState]);







 const cancelSend = useCallback((id: string) => { setChatBubbles(prev => prev.filter(b => b.id !== id)); setPendingConfirmId(null); }, []);







 // ── 询问剧情模式发送 ──────────────────────────────────────────────────────

 
const handleCurrentChapterReviewSend = useCallback(async () => {
 const rawContent = chatInput.trim();
 if (!rawContent || busy || pendingConfirmId) return;
  await waitForCurrentEditorSave();
  await useBookStore.getState().ensureBookContentLoaded(book.id);
  // 档案读权威 memory.json，避免用 book.json 旧快照
  await useBookStore.getState().loadMemoryBank(book.id);
  const freshBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
  const freshChapter = freshBook.chapters.find((item) => item.id === chapter.id) || chapter;
  const chapterContext = buildCurrentChapterCommentContext(freshBook, freshChapter);
 const userBubbleId = makeId('user');
 const thinkingId = makeId('review');
 setChatBubbles(prev => [
  ...prev.filter(b => b.id !== GUIDE_ID),
  { id: userBubbleId, role: 'user', content: rawContent },
  {
   id: thinkingId,
   role: 'assistant',
   content: '正在阅读当前章节…',
   thinkingEntries: [
    makeThinkingEntry(0, '技能：当前章评论', 'plan'),
    makeThinkingEntry(1, '读取当前章正文与上一章承接', 'tool'),
    makeThinkingEntry(2, '整理节奏、人物与可改进点', 'think')
   ],
   thinkingCollapsed: false
  }
 ]);
 setChatInput('');
 setBusy(true);
 activeThinkingIdRef.current = thinkingId;
 try {
  const messages: Array<{ role: string; content: string }> = [
   {
    role: 'system',
     content: withBaseProse([
      '你是写梨眼的当前章评论助手。',
     '任务：认真阅读当前章节正文与上一章承接，然后给出对当前章节的具体看法。',
     '回答维度优先：1) 整体观感 2) 节奏 3) 人物表现 4) 情绪/张力 5) 可改进点。',
     '不要索要文本，不要解释自己没读到，不要说证据不足，不要输出客服套话。',
     '不要写成小说正文，不要提供可直接入章的 prose，不要输出 Markdown 星号强调。',
     '如果当前章确实为空，再明确指出当前章为空，并只讨论承接与下一步写法。'
     ].join('\n'))
    }
   ];
   const response = await streamAiChat({
   messages: [...messages, { role: 'user', content: `${rawContent}\n\n${chapterContext}` }] as any,
   bookId: freshBook.id,
   chapterId: freshChapter.id,
   disableRag: true,
   disableStyle: true,
   senderId: 'agent-current-chapter-review',
   onDelta: (visible, thinking) => {
    setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {
     ...b,
     content: visible ? '正在整理看法…' : (thinking ? '正在思考…' : '正在整理看法…'),
     streamingText: visible || undefined,
     thinkingText: thinking ? stripMarkdownEmphasis(thinking) : undefined,
    } : b));
   }
  });
  const rawOut = String(response?.text || '').trim();
  const split = splitAgentOutput(rawOut);
  const answer = stripMarkdownEmphasis(normalizeChinesePunctuation(rawOut || split.thinking || split.body || '')).trim();
  if (!answer) throw new Error('AI 返回为空');
  conversationRef.current.push({ role: 'user', content: rawContent }, { role: 'assistant', content: answer });
  if (conversationRef.current.length > 40) conversationRef.current = conversationRef.current.slice(-20);
  agentContextRef.current = {
   ...agentContextRef.current,
   lastSkill: 'current_chapter_review',
   lastReviewChapterId: freshChapter.id
  };
  setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {
   ...b,
   content: answer,
   streamingText: undefined,
   thinkingText: stripMarkdownEmphasis(split.thinking || b.thinkingText || ''),
   tokenInfo: response?.usage?.totalTokens ? `当前章评论 · ${Number(response.usage.totalTokens).toLocaleString()} token` : '当前章评论',
   bodyWriteState: undefined,
   outlinePreview: undefined,
   roleSuggestions: undefined,
   agentArtifacts: [{ type: 'chapter_review', data: { chapterId: freshChapter.id, chapterTitle: freshChapter.title } }]
  } : b));
 } catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  appendThoughtToBubble(thinkingId, `失败：${errMsg.slice(0, 80)}`, 0, 'warn');
  setChatBubbles(prev => prev.map(b => b.id === thinkingId ? { ...b, content: `请求失败：${errMsg.slice(0, 200)}`, streamingText: undefined, bodyWriteState: undefined } : b));
 } finally {
  setBusy(false);
  if (activeThinkingIdRef.current === thinkingId) activeThinkingIdRef.current = null;
 }
}, [chatInput, busy, pendingConfirmId, book, chapter]);

const handleQuerySend = useCallback(async () => {

 const rawContent = chatInput.trim();

 if (!rawContent || busy || pendingConfirmId) return;

 const resolved = resolveConversationQuery(rawContent, agentContextRef.current);

 let content = resolved.query;

 if (isContinuityUtterance(rawContent) && conversationRef.current.length) {

 const recent = conversationRef.current.slice(-6)

 .map((t) => `${t.role === 'user' ? '用户' : '助手'}：${String(t.content || '').slice(0, 280)}`)

 .join('\n');

 content = rawContent + '\n\n【请承接以下最近对话继续，不要重开话题】\n' + recent;

 }

 setChatBubbles(prev => [...prev.filter(b => b.id !== GUIDE_ID), { id: makeId('user'), role: 'user', content: rawContent }]);

 setChatInput('');







 // 角色创造模式已改为本地生成，此处不再需要 AI 调用

 // 如果用户在角色创造后继续输入，退出角色模式走正常流程

 if (roleCreationMode) {

 setRoleCreationMode(false);

 }







 // 联网模式：跳过本地搜索，直接走 AI（搜索结果在 executeSend 中注入）

 if (agentWebSearch) {

 const messages: Array<{ role: string; content: string }> = [

 { role: 'system', content: withBaseProse(getPromptSync('agent_chat_system', '你是一位网文写作助手，擅长回答关于剧情、角色、网络流行梗的问题。请结合联网搜索结果回答用户的问题。')) }

 ];

 for (const turn of conversationRef.current.slice(-12)) messages.push({ role: turn.role, content: turn.content });

 messages.push({ role: 'user', content });

 void executeSend(null, { messages, userContent: content, agentLoop: false });

 return;

 }







 // 只读工具统一使用最新书籍快照；全文搜索前先水合懒加载章节。

 await waitForCurrentEditorSave();
 await useBookStore.getState().ensureBookContentLoaded(book.id);

 // 档案读权威 memory.json，避免用 book.json 旧快照
 await useBookStore.getState().loadMemoryBank(book.id);

 const freshBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;

 if (/整理体检|整理状态|哪些章.*(?:未整理|缺档案)/.test(content)) {

 const report = inspectOrganizationHealth(freshBook);

 const data = { totalChapters: report.totalChapters, completeChapters: report.completeChapters, missingCount: report.missingChapters.length, summaryOnlyCount: report.summaryOnlyChapters.length, incompleteArchiveCount: report.incompleteArchiveChapters.length, estimatedCalls: report.estimatedCalls, recommendedChapterIds: report.recommendedChapterIds, chapters: report.missingChapters.concat(report.summaryOnlyChapters, report.incompleteArchiveChapters).slice(0, 80) };

 setChatBubbles(prev => [...prev, { id: makeId('health'), role: 'assistant', content: `整理体检完成：建议处理 ${report.recommendedChapterIds.length} 章。`, agentArtifacts: [{ type: 'organization_health', data }], tokenInfo: '整理体检 · 本地只读 · 0 token' }]);

 return;

 }

 if (/角色(?:卡)?更新(?:建议|计划)|待更新角色/.test(content)) {

 const records = (freshBook.memoryBank || []).flatMap((memory) => memory.archiveRecords || []);

 const plans = buildRoleUpdateProposals(freshBook, records);

 const compact = plans.slice(0, 40).map((plan) => ({ id: plan.id, roleName: plan.roleName, matchedRoleId: plan.matchedRoleId, matchedRoleName: plan.matchedRoleName, createIfMissing: plan.createIfMissing, chapterIds: plan.chapterIds, chapterTitles: plan.chapterTitles, mutations: plan.mutations.map((mutation) => ({ id: mutation.id, action: mutation.action, label: mutation.label, proposedValue: mutation.proposedValue, reason: mutation.reason })) }));

 const data = { totalPlans: plans.length, totalMutations: plans.reduce((sum, plan) => sum + plan.mutations.length, 0), plans: compact };

 setChatBubbles(prev => [...prev, { id: makeId('role-plans'), role: 'assistant', content: `找到 ${plans.length} 组角色卡更新计划。这里只预览，不会直接修改角色卡。`, agentArtifacts: [{ type: 'role_update_plans', data }], tokenInfo: '角色计划 · 本地只读 · 0 token' }]);

 return;

 }

 const localReadIntent = isComplexReadQuestion(content) ? null : detectLocalReadIntent(content, freshBook);

 const discussIntent = routeAgentIntent(rawContent);
 if (discussIntent.mode === 'discuss' && discussIntent.reason === '讨论当前内容') {
  const freshChapter = freshBook.chapters.find((item) => item.id === chapter.id) || chapter;
  const chapterContext = buildCurrentChapterCommentContext(freshBook, freshChapter);
  const messages: Array<{ role: string; content: string }> = [
   { role: 'system', content: withBaseProse(getPromptSync('agent_chat_system', '你是网文写作评论助手。你的任务是先认真阅读当前章节正文与承接上下文，再给出看法、节奏判断、角色表现评价和可改进建议。不要索要文本，不要解释自己没读到，不要输出客服套话，不要写成小说正文，不要输出可直接入章的 prose。')) }
  ];
  for (const turn of conversationRef.current.slice(-8)) messages.push({ role: turn.role, content: turn.content });
  messages.push({ role: 'user', content: `${content}

${chapterContext}` });
  void executeSend(null, { messages, userContent: content, agentLoop: false, workflow });
  return;
 }







 if (localReadIntent === 'role') {

 const localRoleResults = searchLocalRoles(freshBook, content);

 if (localRoleResults[0]) { setActiveEntity(localRoleResults[0].name); agentContextRef.current = { lastEntity: localRoleResults[0].name, lastIntent: 'search_roles', lastKeywords: [localRoleResults[0].name] }; }

 setChatBubbles(prev => [...prev, {

 id: makeId('local-role'),

 role: 'assistant',

 content: localRoleResults.length

 ? `在本地角色档案中找到 ${localRoleResults.length} 个结果。点击角色展开资料和正文出现位置。`

 : '本地角色档案中没有找到相关记录。',

 localRoleResults,

 tokenInfo: '角色档案 · 本地只读 · 0 token'

 }]);

 return;

 }







 if (localReadIntent === 'archive') {

 const localArchiveResults = searchLocalArchive(freshBook, content);

 if (localArchiveResults[0]) { setActiveEntity(localArchiveResults[0].title); agentContextRef.current = { ...agentContextRef.current, lastEntity: localArchiveResults[0].title, lastIntent: 'search_archive', lastKeywords: [localArchiveResults[0].title] }; }

 setChatBubbles(prev => [...prev, {

 id: makeId('local-archive'),

 role: 'assistant',

 content: localArchiveResults.length

 ? `在剧情档案中找到 ${localArchiveResults.length} 组记录。点击档案展开，再点击记录跳转到对应章节。`

 : '本地剧情档案中没有找到相关记录。',

 localArchiveResults,

 tokenInfo: '剧情档案 · 本地只读 · 0 token'

 }]);

 return;

 }







 const keywords = extractLocalSearchTerms(content);

 const localResults = keywords

 .map((keyword) => searchInBook(freshBook, keyword))

 .filter((result) => result.hits.length > 0)

 .slice(0, 3);







 if (isLocateQuestion(content) || isExplicitFullBookSearch(content)) {

 if (keywords[0]) agentContextRef.current = { ...agentContextRef.current, lastEntity: keywords[0], lastIntent: 'search_book', lastKeywords: keywords };

 setChatBubbles(prev => [...prev, {

 id: makeId('local-search'),

 role: 'assistant',

 content: localResults.length

 ? `找到 ${localResults.reduce((sum, result) => sum + result.totalHits, 0)} 处匹配。结果已按章节收起，点击章节后选择具体段落即可跳转。`

 : `已搜索全书，但没有找到“${keywords.join('、') || content}”。`,

 localSearchResults: localResults,

 tokenInfo: '全书检索 · 本地只读 · 0 token'

 }]);

 return;

 }







 // 本地操作指令拦截：填入大纲/创建章节等操作不需要调 AI

 if (isLocalOperationCommand(content)) {

 // 检查用户消息中是否已经包含了大纲内容（直接粘贴了大纲）

 const parsed = parseOutlineFromResponse(content);

 if (parsed.success && parsed.chapters.length > 0) {

 // 用户直接粘贴了带【大纲】标记的内容，显示预览

 setChatBubbles(prev => [...prev, {

 id: makeId('outline-local'),

 role: 'assistant',

 content: `已识别到 ${parsed.chapters.length} 章大纲，请确认后写入：`,

 outlinePreview: { chapters: parsed.chapters, status: 'pending' },

 tokenInfo: '📋 本地解析（未消耗 token）'

 }]);

 } else {

 // 用户只是说了"帮我填入"但没给内容，提示用户发送

 setChatBubbles(prev => [...prev, {

 id: makeId('local-hint'),

 role: 'assistant',

 content: '好的，我准备好了，请发送大纲。\n\n支持任意格式，例如：\n• 1. 标题\\n内容\n• 第一章 标题\\n内容\n\n粘贴后我会自动识别并创建章节。',

 tokenInfo: '📋 本地操作（未消耗 token）'

 }]);

 }

 return;

 }







 // 检查用户消息本身是否包含大纲标记（直接粘贴了大纲）

 if (hasOutlineMarker(content)) {

 const parsed = parseOutlineFromResponse(content);

 if (parsed.success && parsed.chapters.length > 0) {

 setChatBubbles(prev => [...prev, {

 id: makeId('outline-local'),

 role: 'assistant',

 content: `已识别到 ${parsed.chapters.length} 章大纲，请确认后写入：`,

 outlinePreview: { chapters: parsed.chapters, status: 'pending' },

 tokenInfo: '📋 本地解析（未消耗 token）'

 }]);

 return;

 }

 }







 // 复杂问题 → 只读 Agent Loop，直接发送，不再弹 token 确认

 void executeSend(null, {

 messages: [],

 userContent: content,

 agentLoop: true,

 workflow

 });

 }, [chatInput, busy, pendingConfirmId, book, roleCreationMode, workflow, executeSend]);







 // ── 润色代写模式发送 ──────────────────────────────────────────────────────

 const handleWriteSend = useCallback(async () => {

 const content = chatInput.trim();

 if (!content || busy || pendingConfirmId) return;

 setChatBubbles(prev => [...prev.filter(b => b.id !== GUIDE_ID), { id: makeId('user'), role: 'user', content }]);

 setChatInput('');







 // 近 1 章正文需要确保已加载（档案走 memoryBank，不必全量水合全书）

 try {

 const chapters = book.chapters || [];

 const idx = chapters.findIndex((c) => c.id === chapter.id);

 const prev = idx > 0 ? chapters[idx - 1] : undefined;

 if (prev) await useBookStore.getState().ensureChapterContent(book.id, prev.id);

 await useBookStore.getState().ensureChapterContent(book.id, chapter.id);

 } catch { /* ignore */ }

 // 档案读权威 memory.json，避免用 book.json 旧快照
 try { await useBookStore.getState().loadMemoryBank(book.id); } catch { /* ignore */ }

 const freshBook = useBookStore.getState().books.find((b) => b.id === book.id) || book;
 const wantsFollowState = isFollowWriteCommand(content) && agentTaskState.kind === 'outline_ready';
 const targetWriteChapter = wantsFollowState
  ? (freshBook.chapters.find((c) => c.id === agentTaskState.chapterId) || chapter)
  : chapter;
 const freshChapter = freshBook.chapters.find((c) => c.id === targetWriteChapter.id) || targetWriteChapter;

 // 按「本章细纲写作」逻辑：细纲 + 前9章档案 + 近1章正文（禁止查证）
 // 本章 outline 为空时：优先用结构化讨论状态，其次从最近对话里捞 Agent 刚给出的方案。
 const stateOutline = wantsFollowState ? agentTaskState.planText : '';
 const conversationOutline = stateOutline || harvestOutlineFromConversation([
 ...conversationRef.current,
 // 当前气泡里未进 ref 的最近助手回复也扫一遍
 ...chatBubbles
 .filter((b) => b.role === 'assistant' && b.content && !b.streamingText)
 .slice(-4)
 .map((b) => ({ role: 'assistant' as const, content: b.content }))
 ]);
 const packed = buildOutlineWritingContext(freshBook, freshChapter, {
 archiveCount: 8,
 proseCount: 2,
 proseCharsEach: 1800,
 userInstruction: content,
 fallbackOutline: conversationOutline
 });
 if (!packed.hasOutline) {

  setChatBubbles(prev => [...prev, {

  id: makeId('need-outline'),

  role: 'assistant',

  content: '这一章还没有细纲，对话里也没找到可写的方案。你可以：\n1）先在「本章细纲」写好大纲；\n2）或先让我推演下一章；\n3）或右键「根据本章内容开始写作」。'

  }]);

  return;

  }







 // 对话方案回填进细纲栏，下次不用再说一遍（静默，失败不挡写作）

 if (packed.outlineSource === 'conversation' && packed.outlineText) {

 void useBookStore.getState().setChapterOutline(book.id, freshChapter.id, packed.outlineText).catch(() => {});

 }
 setAgentTaskState({ kind: 'writing_from_outline', chapterId: freshChapter.id, outlineText: packed.outlineText });







 const messages: Array<{ role: string; content: string }> = [

 { role: 'system', content: buildOutlineWritingSystemPrompt(freshBook, freshChapter) }

 ];

 // 对话记忆短一点就够：细纲+档案才是主上下文

 for (const turn of conversationRef.current.slice(-6)) messages.push({ role: turn.role, content: turn.content });

 messages.push({ role: 'user', content: packed.userContent });







 // 直接发送，不再弹 token 确认

 setMode('write');

 void executeSend(null, {

 messages,

 userContent: content,

 agentLoop: false,

 forceWrite: true

 });

 }, [chatInput, busy, pendingConfirmId, book, chapter, chatBubbles, executeSend, agentTaskState]);







 // ── 推演细纲模式发送 ──────────────────────────────────────────────────────

 const handleOutlineSend = useCallback(async () => {

 const content = chatInput.trim();

 if (!content || busy) return;


 setChatBubbles(prev => [...prev.filter(b => b.id !== GUIDE_ID), { id: makeId('user'), role: 'user', content }]);

 setChatInput('');

 setBusy(true);







 const thinkingId = makeId('thinking');

 activeThinkingIdRef.current = thinkingId;

 setChatBubbles(prev => [...prev, {

 id: thinkingId,

 role: 'assistant',

 content: '正在构思章纲...',

 thinkingEntries: [makeThinkingEntry(0, '正在构思章纲…', 'plan')],

 thinkingCollapsed: false

 }]);







 try {

 // 档案读权威 memory.json，避免用 book.json 旧快照
 await useBookStore.getState().loadMemoryBank(book.id);

 const latestBooks = useBookStore.getState().books;

 const latestBook = latestBooks.find((b) => b.id === book.id) || book;

 const memoryBank: any[] = Array.isArray((latestBook as any).memoryBank) ? (latestBook as any).memoryBank : [];







 const resolved = resolveOutlineTargetChapter(latestBook, chapter);

 const targetChapter = resolved.chapter;

 const targetIndex = resolved.index;

 const targetLabel = resolved.label;







 const startIdx = Math.max(0, targetIndex - 10);

 const prevChapters = latestBook.chapters.slice(startIdx, targetIndex);

 const memoryLines: string[] = [];

 for (const ch of prevChapters) {

 const mem = memoryBank.find((m: any) => m.chapterId === ch.id);

 const synopsis = mem?.plotAnalysis?.plotSynopsis || mem?.summary || '';

 if (synopsis) memoryLines.push(`${ch.title}：${synopsis}`);

 }

 const memoryContext = memoryLines.length > 0 ? '【前文剧情档案】\n' + memoryLines.join('\n') : '';







 // 第一阶段：给出大白话章纲概要

 const messages: Array<{ role: string; content: string }> = [

 { role: 'system', content: buildChapterPlanDiscussSystemPrompt({
 book: latestBook,
 targetLabel,
 memoryContext,
 anchorChapter: targetChapter || chapter,
 }) }

 ];

 for (const turn of conversationRef.current.slice(-12)) messages.push({ role: turn.role, content: turn.content });

 messages.push({ role: 'user', content });







 const response = await streamAiChat({

 messages: messages as any,

 bookId: book.id,

 chapterId: chapter.id,

 disableRag: true,

 disableStyle: true,

 maxTokens: 8192,

 senderId: 'agent-outline',

 onDelta: (visible, thinking) => {

 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {

 ...b,

 content: visible ? '正在生成章纲…' : (thinking ? '正在思考…' : '正在构思章纲...'),

 streamingText: visible || undefined,

 thinkingText: thinking || undefined,

 } : b));

 },

 });

 const aiText = (response?.text || '').trim();

 if (!aiText) throw new Error('AI 返回为空');







 conversationRef.current.push({ role: 'user', content }, { role: 'assistant', content: aiText });
 setAgentTaskState({
  kind: 'outline_ready',
  chapterId: targetChapter?.id || '',
  targetTitle: targetLabel,
  planText: aiText
 });







 // 显示结果 + 确认卡片（满意出细纲 / 继续讨论）

 const resultId = makeId('outline-draft');

 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {

 id: resultId,

 role: 'assistant',

 content: aiText,

 streamingText: undefined,

 thinkingText: b.thinkingText,

 outlineConfirm: { targetChapterId: targetChapter?.id || '', targetTitle: targetLabel }

 } : b));

 } catch (err) {

 setChatBubbles(prev => prev.map(b => b.id === thinkingId ? { ...b, content: `❌ 推演失败：${err instanceof Error ? err.message : String(err)}` } : b));

 } finally {

 setBusy(false);

 }

 }, [chatInput, busy, book, chapter, setAgentTaskState]);

 // 跑 wizard 一步并更新指定气泡（P2-A2~A5）
 const runWizardStepAndPush = useCallback(async (b: Book, state: AgentWizardState, bubbleId: string) => {
  let card;
  try {
   const result = await runWizardStep(
    b,
    state,
    (msgs) => electronAPI.ai.chat({
     messages: msgs as any,
     stream: false,
     bookId: b.id,
     chapterId: chapter.id,
     disableRag: true,
     disableStyle: true,
     senderId: 'wizard',
    }).then((r) => ({ text: r.text || '' })),
    (q) => electronAPI.ai.webSearch(q),
    appConfig
   );
   card = result.card;
  } catch (err) {
   setChatBubbles(prev => prev.map(x => x.id === bubbleId ? {
    ...x,
    content: `wizard 出错：${err instanceof Error ? err.message : String(err)}`,
    tokenInfo: 'wizard 错误',
   } : x));
   setBusy(false);
   return;
  }
  setChatBubbles(prev => prev.map(x => x.id === bubbleId ? {
   ...x,
   content: card.body,
   tokenInfo: `新书 wizard · 第 ${state.step}/6 步`,
   wizardCard: {
    step: state.step,
    title: card.title,
    body: card.body,
    options: card.options,
    isFinal: card.isFinal,
   },
   } : x));
   setBusy(false);
  }, [chapter.id, appConfig]);







 const handleSendUnified = useCallback(() => {
  const raw = chatInput.trim();
  if (!raw || busy || pendingConfirmId) return;

  // 意图判定
  const intent = routeAgentIntent(raw);
  const isWritingIntent = intent.mode === 'execute' && (intent.executeKind === 'write_body' || intent.executeKind === 'rewrite');
  const currentBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
  const isNewBook = bookHasNoSubstantialBody(currentBook.chapters);

  // 新书 wizard 触发（P2-A5）：新书 + 写作意图 → 初始化 wizard 并跑方向卡
  if (isWritingIntent && isNewBook) {
   setChatInput('');
   setBusy(true);
   setChatBubbles(prev => [
    ...prev.filter(b => b.id !== GUIDE_ID),
    { id: makeId('user'), role: 'user', content: raw },
    { id: makeId('wizard'), role: 'assistant', content: '检测到新书开局。让我先帮你定开局方向，再逐层确认后开始写。', tokenInfo: '新书 wizard · 第 1/6 步' },
   ]);
   const thinkingId = makeId('wizard');
   wizardDispatch({ type: 'init', userRequest: raw });
   void (async () => {
    const state = { mode: 'new_book_wizard' as const, step: 1, userRequest: raw };
    await runWizardStepAndPush(currentBook, state, thinkingId);
   })();
   return;
  }

  // 老书对齐触发（P2-B1）：老书 + 写作意图 + 需要重新对齐 → 推对齐卡并暂停续写
  if (isWritingIntent && !isNewBook && shouldReconfirmUnderstanding(currentBook)) {
   const understanding = buildBookUnderstanding(currentBook);
   setChatBubbles(prev => [
    ...prev.filter(b => b.id !== GUIDE_ID),
    { id: makeId('user'), role: 'user', content: raw },
    {
     id: makeId('understand'),
     role: 'assistant',
     content: '检测到你正在续写。首次续写前先对齐书的理解，确认后我不会再重复询问。',
     understandingConfirm: {
      understandingText: formatBookUnderstanding(understanding),
      coveredChapterCount: understanding.coveredChapterCount,
      resumeText: raw,
     },
     tokenInfo: '书的理解 · 首次对齐',
    },
   ]);
   setChatInput('');
   return;
  }

  setChatInput('');
  setBusy(true);
  const abortCtrl = new AbortController();
  agentAbortRef.current = abortCtrl;
  const thinkingId = makeId('agent');
  activeThinkingIdRef.current = thinkingId;
  setChatBubbles(prev => [
    ...prev.filter(b => b.id !== GUIDE_ID),
    { id: makeId('user'), role: 'user', content: raw },
    { id: thinkingId, role: 'assistant', content: '正在思考…', thinkingEntries: [makeThinkingEntry(0, 'Agent 启动', 'plan')], thinkingCollapsed: true }
  ]);

  void (async () => {
    await waitForCurrentEditorSave();
    await useBookStore.getState().ensureBookContentLoaded(book.id);
    // 档案读权威 memory.json，避免用 book.json 旧快照
    await useBookStore.getState().loadMemoryBank(book.id);
    const freshBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;
    const freshChapter = freshBook.chapters.find((item) => item.id === chapter.id) || chapter;
    return runAgentLoop({
    book: freshBook,
    chapter: freshChapter,
    userMessage: raw,
    signal: abortCtrl.signal,
    conversation: conversationRef.current.slice(-16).map(t => ({ role: t.role, content: t.content })),
    maxIterations: 25,
    // 只在用户明确要求落库/修改资料时暴露写工具；普通续写只生成草稿，由按钮确认入章。
    // 否定句式（先别写/不要保存/别修改）不授予写权限。
    allowWrites: ALLOW_WRITES_RE.test(raw) && !CANCEL_WRITES_RE.test(raw),
    onThought: (text, step) => { appendThoughtToBubble(thinkingId, text, step, 'think'); },
    onToolStart: (name, reason) => {
      appendThoughtToBubble(thinkingId, `调用 ${name}`, 0, 'tool');
    },
    onToolEnd: (name, summary) => {
      appendThoughtToBubble(thinkingId, `${name} → ${summary}`, 0, 'ok');
    },
  });
  })().then(result => {
    const candidateBody = stripMarkdownEmphasis(normalizeChinesePunctuation(result.draftText || result.answer || '')).trim();
    const canWriteBody = looksLikeInsertableProse(candidateBody);
    if (canWriteBody) setAgentTaskState({ kind: 'draft_ready', chapterId: chapter.id, bodyText: candidateBody });
    // 把日志追加到 thinking
    for (const entry of result.log) {
      appendThoughtToBubble(thinkingId, `[${entry.type}] ${entry.detail}`, 0, entry.type === 'error' ? 'warn' : entry.type === 'tool' ? 'tool' : 'think');
    }
    conversationRef.current.push({ role: 'user', content: raw }, { role: 'assistant', content: result.answer });
    if (conversationRef.current.length > 40) conversationRef.current = conversationRef.current.slice(-20);
    setChatBubbles(prev => prev.map(b => b.id === thinkingId ? {
      ...b, content: candidateBody || result.answer, streamingText: undefined,
      tokenInfo: `Agent · ${result.totalTokens.toLocaleString()} token · ${result.toolCalls} 次工具`,
      bodyWriteState: canWriteBody ? { status: 'pending' as const } : undefined,
      outlinePreview: undefined,
      agentArtifacts: result.artifacts || b.agentArtifacts,
      skillUsage: result.skillUsage || b.skillUsage,
    } : b));
    setBusy(false);
    activeThinkingIdRef.current = null;
  }).catch(err => {
    const msg = err instanceof Error ? err.message : String(err);
    appendThoughtToBubble(thinkingId, `失败：${msg.slice(0, 80)}`, 0, 'warn');
    setChatBubbles(prev => prev.map(b => b.id === thinkingId ? { ...b, content: `执行失败：${msg.slice(0, 200)}`, streamingText: undefined } : b));
    setBusy(false);
    activeThinkingIdRef.current = null;
  });
}, [chatInput, busy, pendingConfirmId, book, chapter, appendThoughtToBubble]);

// 供对齐卡确认后自动重发续写指令使用（避免闭包过期）
handleSendUnifiedRef.current = handleSendUnified;

const handleSend = useCallback(() => {
  void handleSendUnified();
}, [handleSendUnified]);








 // ── 正文入章（工坊同款 setChapterContent） ────────────────────────────────

 const handleWriteBody = useCallback(async (bubbleId: string, mode: 'current' | 'new_chapter' | 'append') => {

 const bubble = chatBubbles.find((b) => b.id === bubbleId);

 if (!bubble || bubble.role !== 'assistant') return;

 const bodyText = String(bubble.content || '').trim();

 if (!looksLikeInsertableProse(bodyText)) {

 useIslandStore.getState().show({ type: 'warning', message: '这段不像可落稿正文', autoHideMs: 1600 });

 return;

 }

 try {

 const result = await persistAgentBodyToChapter({

 bookId: book.id,

 chapterId: chapter.id,

 bodyText,

 mode: mode === 'append' ? 'current' : mode,

 append: mode === 'append',

 overwrite: mode === 'current'

 });

 if (!result.ok) {

 setChatBubbles((prev) => prev.map((b) => b.id === bubbleId ? {

 ...b,

 bodyWriteState: { status: 'error', message: result.error || '写入失败' }

 } : b));

 useIslandStore.getState().show({ type: 'error', message: result.error || '写入失败' });

 return;

 }

 setChatBubbles((prev) => prev.map((b) => b.id === bubbleId ? {

 ...b,

 bodyWriteState: {

 status: 'written',

 mode: mode === 'append' ? 'append' : result.mode,

 chapterId: result.chapterId,

 title: result.title,

 wordCount: result.wordCount

 }

 } : b));

  useIslandStore.getState().show({

   type: 'success',

   message: result.createdChapter

   ? `已新建并写入「${result.title}」约 ${result.wordCount} 字`

   : result.reusedEmptyChapter

   ? `已写入空章「${result.title}」约 ${result.wordCount} 字`

   : `已写入「${result.title}」约 ${result.wordCount} 字`,

   autoHideMs: 2200

   });

  if (result.chapterId === chapter.id) {
  // 写的就是当前章：chapterId 未变，openEditor 不触发重挂载，且 content effect 会
  // 因 lastSavedHtmlRef 已同步而跳过 → 编辑器停留旧正文。dispatch 事件强制重载。
  window.dispatchEvent(new CustomEvent('writerzen:reload-current-chapter'));
  } else {
  useAppStore.getState().openEditor(book.id, result.chapterId);
  }

 } catch (err) {

 const msg = err instanceof Error ? err.message : String(err);

 setChatBubbles((prev) => prev.map((b) => b.id === bubbleId ? {

 ...b,

 bodyWriteState: { status: 'error', message: msg }

 } : b));

 useIslandStore.getState().show({ type: 'error', message: `写入失败：${msg}` });

 }

 }, [book.id, chapter.id, chatBubbles]);







 const handleDismissBodyWrite = useCallback((bubbleId: string) => {

 setChatBubbles((prev) => prev.map((b) => b.id === bubbleId ? {

 ...b,

 bodyWriteState: { status: 'dismissed' }

 } : b));

 }, []);







 // ── 批量大纲确认 ─────────────────────────────────────────────────────────

 const handleConfirmOutline = useCallback(async (bubbleId: string) => {

 const bubble = chatBubbles.find(b => b.id === bubbleId);

 if (!bubble?.outlinePreview || bubble.outlinePreview.status !== 'pending') return;







 const { chapters: parsedChapters } = bubble.outlinePreview;

 const { newChapters, outlines } = buildBatchChapters(book, parsedChapters);

 const updateBook = useBookStore.getState().updateBook;

 const setChapterOutline = useBookStore.getState().setChapterOutline;







 const now = new Date().toISOString();

 await updateBook(book.id, (current) => ({

 ...current,

 chapters: [...current.chapters, ...newChapters],

 updatedAt: now

 }));







 // 逐章写入细纲

 for (const ch of newChapters) {

 const outline = outlines.get(ch.id);

 if (outline) {

 await setChapterOutline(book.id, ch.id, outline);

 }

 }







 // 更新气泡状态

 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, outlinePreview: { ...b.outlinePreview!, status: 'confirmed' } } : b));

 useIslandStore.getState().show({ type: 'success', message: `已创建 ${newChapters.length} 个章节并写入细纲`, autoHideMs: 2000 });

 }, [chatBubbles, book]);







 const handleDismissOutline = useCallback((bubbleId: string) => {

 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, outlinePreview: { ...b.outlinePreview!, status: 'dismissed' } } : b));

 }, []);

 // 老书「书的理解」对齐确认：置 book.agentContextConfirmed=true（随书落盘），确认后若被暂停则自动重发续写指令
 const handleConfirmUnderstanding = useCallback(async (bubbleId: string) => {
  const target = chatBubbles.find(b => b.id === bubbleId);
  const resumeText = String(target?.understandingConfirm?.resumeText || '').trim();
  try {
   await useBookStore.getState().updateBook(book.id, { agentContextConfirmed: true });
  } catch (e) {
   useIslandStore.getState().show({ type: 'error', message: '保存确认状态失败', detail: e instanceof Error ? e.message : String(e), autoHideMs: 2000 });
  }
  setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, understandingConfirm: undefined } : b));
  useIslandStore.getState().show({ type: 'success', message: '已确认书的理解，后续续写不再重复确认', autoHideMs: 1600 });
  if (resumeText) {
   // 确认后自动重发被暂停的续写指令（此时 agentContextConfirmed 已为 true，不会再弹）
   setChatInput(resumeText);
   setTimeout(() => { handleSendUnifiedRef.current?.(); }, 0);
  }
 }, [book.id, chatBubbles]);

 const handleDismissUnderstanding = useCallback((bubbleId: string) => {
  setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, understandingConfirm: undefined } : b));
  setChatBubbles(prev => [...prev, {
   id: makeId('understand'),
   role: 'assistant',
   content: '好的，请告诉我要纠正的地方（世界观 / 人物 / 剧情 / 风格），我会重新对齐后再续写。',
   tokenInfo: '待纠正'
  }]);
 }, []);

 // ── 新书 wizard 交互（P2-A2~A5）────────────────────────────────────
 const wizardBubbleIdRef = useRef<string | null>(null);
 const wizardPayloadRef = useRef<unknown>(null);

 const advanceWizard = useCallback(async (nextState: AgentWizardState) => {
  const bubbleId = wizardBubbleIdRef.current;
  if (!bubbleId) return;
  setBusy(true);
  if (isWizardComplete(nextState)) {
   // 6 步完成：提示可落细纲写作，清除卡
   setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, wizardCard: undefined } : b).concat([{
    id: makeId('wizard-done'),
    role: 'assistant',
    content: '新书开局已全部确认（方向/档案/写法/卷规划/大纲/审查）。细纲已就绪，后续按细纲续写即可。',
    tokenInfo: 'wizard 完成',
   }]));
   setBusy(false);
   return;
  }
  await runWizardStepAndPush(book, nextState, bubbleId);
 }, [book, runWizardStepAndPush]);

 const handleWizardSelect = useCallback((bubbleId: string, key: string) => {
  const bubble = chatBubbles.find(b => b.id === bubbleId);
  const options = bubble?.wizardCard?.options || [];
  const chosen = options.find((o) => o.key === key);
  if (!chosen || !agentWizardState) return;
  // 优先用卡里携带的结构化数据（完整 OpeningOption），不从渲染文本反解
  const option: OpeningOption =
   (chosen.data && typeof chosen.data === 'object' && 'pitch' in chosen.data
     ? (chosen.data as OpeningOption)
     : { title: chosen.title, pitch: chosen.title, outline: chosen.body, risk: '' });
  wizardPayloadRef.current = [option];
  const next = wizardReducer(agentWizardState, { type: 'confirm', step: 1, payload: [option] });
  wizardBubbleIdRef.current = bubbleId;
  void advanceWizard(next!);
 }, [agentWizardState, chatBubbles, advanceWizard]);

 const handleWizardConfirm = useCallback((bubbleId: string) => {
  if (!agentWizardState) return;
  const step = agentWizardState.step;
  const payload = wizardPayloadRef.current;
  wizardBubbleIdRef.current = bubbleId;
  const next = wizardReducer(agentWizardState, { type: 'confirm', step, payload });
  void advanceWizard(next!);
 }, [agentWizardState, advanceWizard]);

 const handleWizardBack = useCallback((bubbleId: string) => {
  if (!agentWizardState || agentWizardState.step <= 1) return;
  wizardBubbleIdRef.current = bubbleId;
  const next = wizardReducer(agentWizardState, { type: 'rollback', toStep: agentWizardState.step - 1 });
  void advanceWizard(next!);
 }, [agentWizardState, advanceWizard]);








 // Agent 内所有角色候选统一经过身份匹配和角色写入引擎；不再直接调用 resources.addRole。

 const persistAgentRoleCandidate = useCallback(async (candidate: ExtractedRoleCandidate) => {

 const latestBook = useBookStore.getState().books.find((item) => item.id === book.id) || book;

 const categories = latestBook.resourceIndex?.customCharacterCategories;

 const matched = resolveRoleIdentity(categories || [], { name: candidate.name || '', aliases: candidate.aliases || [] });

 const nextCategories = applyExtractedRoleCandidatesToCategories(categories, [candidate]);

 await useBookStore.getState().updateBook(book.id, {

 resourceIndex: {

 ...(latestBook.resourceIndex || {}),

 customCharacterCategories: nextCategories,

 schemaVersion: latestBook.resourceIndex?.schemaVersion || 1

 }

 });

 await flushBookMetaPatches();

 return { created: !matched.role, roleName: matched.role?.name || candidate.name || '未命名角色' };

 }, [book]);







 // ── 角色卡确认 ──────────────────────────────────────────────────────────────

 const handleConfirmRole = useCallback(async (bubbleId: string, roleId: string) => {

 const bubble = chatBubbles.find(b => b.id === bubbleId);

 const suggestion = bubble?.roleSuggestions?.find(r => r.id === roleId);

 if (!suggestion || suggestion.status !== 'pending') return;

 try {

 const result = await persistAgentRoleCandidate({

 name: suggestion.name,

 faction: suggestion.faction,

 roleType: suggestion.roleType,

 description: suggestion.description,

 firstAppearance: chapter.title,

 chapters: [chapter.id],

 skills: suggestion.abilities

 });

 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? {

 ...b,

 roleSuggestions: b.roleSuggestions?.map(r => r.id === roleId ? { ...r, status: 'confirmed' as const, isUpdate: !result.created } : r)

 } : b));

 useIslandStore.getState().show({ type: 'success', message: result.created ? `已创建角色「${result.roleName}」` : `已合并到现有角色「${result.roleName}」，未创建重复角色卡`, autoHideMs: 2200 });

 } catch (err) {

 useIslandStore.getState().show({ type: 'error', message: `保存角色失败：${err instanceof Error ? err.message : String(err)}` });

 }

 }, [chatBubbles, chapter.id, chapter.title, persistAgentRoleCandidate]);







 const handleDismissRole = useCallback((bubbleId: string, roleId: string) => {

 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? {

 ...b,

 roleSuggestions: b.roleSuggestions?.map(r => r.id === roleId ? { ...r, status: 'dismissed' as const } : r)

 } : b));

 }, []);







 // ── 创造角色入口 ──────────────────────────────────────────────────────────────

 const handleCreateRole = useCallback(() => {

 if (busy) return;

 // 本地生成角色卡（零 token 消耗）

 const cards = generateRoleCards(book);

 const displayText = '🎭 **智能角色生成**（基于本书剧情，零 token 消耗）\n\n' +

 '已分析本书阵营分布与近期剧情，为你生成 3 张角色卡：\n\n' +

 cards.map((c, i) => formatRoleCardForDisplay(c, i)).join('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n') +

 '\n\n点击下方按钮将角色添加到角色库，或点击🔄重新生成。';







 setChatBubbles(prev => [

 ...prev.filter(b => b.id !== GUIDE_ID),

 {

 id: makeId('role-gen'),

 role: 'assistant',

 content: displayText,

 tokenInfo: '🎲 本地生成（未消耗 token）',

 generatedRoles: cards,

 }

 ]);

 }, [busy, book]);







 return (

<div className="wz-agent-panel flex h-full min-h-0 flex-col">  {/* 顶部模式页签已移至右侧 ActivityBar 图标控制 */}

  <div className="wz-ag-head">

  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ide-t1)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>写梨眼助手</span>

  <span className="wz-ag-spacer" />

 {shellTab === 'agent' ? (
 <>
 <div className="wz-ag-session-wrap" data-ag-session-wrap>
 <button
  type="button"
  className={clsx('wz-ag-icon-btn', historyMenuOpen && 'on')}
  onClick={(e) => {
   e.stopPropagation();
   setHistoryMenuOpen((v) => !v);
  }}
  title="会话列表"
  data-ag-session-trigger
 >
  <IdeSvgClock3 size={15} />
 </button>
 {historyMenuOpen ? createPortal(
  <div
   className="wz-ag-session-menu"
   role="menu"
   aria-label="Agent 会话列表"
   data-ag-session-menu
   style={{
    position: 'fixed',
    top: (() => {
     const el = document.querySelector('[data-ag-session-trigger]') as HTMLElement | null;
     if (!el) return 72;
     const r = el.getBoundingClientRect();
     return Math.min(r.bottom + 8, window.innerHeight - 120);
    })(),
    right: (() => {
     const el = document.querySelector('[data-ag-session-trigger]') as HTMLElement | null;
     if (!el) return 24;
     const r = el.getBoundingClientRect();
     return Math.max(12, window.innerWidth - r.right);
    })(),
    zIndex: 100000,
   }}
   onMouseDown={(e) => e.stopPropagation()}
  >
   <div className="wz-ag-session-menu-hd">
    <div className="title">会话列表</div>
    <div className="sub">点一条即可切换；新建会话会保留旧会话</div>
   </div>
   {agentSessions.length === 0 ? (
    <div className="wz-ag-session-empty">当前没有会话。</div>
   ) : (
    <div className="wz-ag-session-list custom-scrollbar">
     {agentSessions.map((sess) => {
      const previewSource = [...sess.bubbles].reverse().find((b) => b.role === 'assistant' || b.role === 'user');
      const content = String(previewSource?.content || '').replace(/\s+/g, ' ').trim();
      const preview = content.length > 90 ? `${content.slice(0, 90)}…` : content || '（空会话）';
      const isCurrent = sess.id === activeSessionId;
      const turns = sess.conversation.length;
      return (
       <button
        key={sess.id}
        type="button"
        className={clsx('wz-ag-session-item', isCurrent && 'is-current')}
        onClick={() => restoreSessionFromHistory(sess.id)}
        onContextMenu={(e) => {
         e.preventDefault();
         e.stopPropagation();
         setSessionMenu({ sessionId: sess.id, x: e.clientX, y: e.clientY });
        }}
       >
        <div className="row1">
         {renameSessionState?.sessionId === sess.id ? (
          <input
           autoFocus
           className="wz-ag-session-rename"
           value={renameSessionState.value}
           onClick={(e) => e.stopPropagation()}
           onChange={(e) => setRenameSessionState((prev) => prev ? { ...prev, value: e.target.value } : prev)}
           onBlur={() => submitRenameAgentSession()}
           onKeyDown={(e) => {
            if (e.key === 'Enter') {
             e.preventDefault();
             submitRenameAgentSession();
            }
            if (e.key === 'Escape') {
             e.preventDefault();
             setRenameSessionState(null);
            }
           }}
          />
         ) : (
          <span className="idx">{sess.title || '未命名会话'}</span>
         )}
         <span className="meta">{isCurrent ? '当前' : `${turns} 轮`}</span>
        </div>
        <div className="preview">{preview}</div>
       </button>
      );
     })}
    </div>
   )}
  </div>,
  document.body
 ) : null}
 </div>
 <button
  type="button"
  className="wz-ag-icon-btn"
  onClick={() => {
   if (chatBubbles.length <= 1 && conversationRef.current.length === 0) {
    createNewAgentSession();
    return;
   }
   if (window.confirm('新建会话会保留当前会话到列表，并切到一个全新的 Agent 会话，确定继续吗？')) {
    createNewAgentSession();
   }
  }}
  title="新建会话"
 >
  <IdeSvgPlus size={15} />
 </button>
 </>
 ) : null}

 {onClose ? <button type="button" className="wz-ag-icon-btn" onClick={onClose} title="收起面板">

 <IdeSvgChevronRight size={15} />

 </button> : (

 <button type="button" className="wz-ag-icon-btn" title="收起面板" onClick={() => window.dispatchEvent(new CustomEvent('writerzen:toggle-agent-panel'))}>

 <IdeSvgChevronRight size={15} />

 </button>

 )}

 </div>







 {/* 对话与执行记录 */}

 <div ref={scrollRef} className="wz-ag-scroll custom-scrollbar" onContextMenu={e => { if (!selectDeleteMode) { e.preventDefault(); setBubbleMenu({ x: e.clientX, y: e.clientY }); } }}>

 {chatBubbles.length === 1 && chatBubbles[0]?.id === GUIDE_ID ? (

 <GuideEmptyState bookTitle={book.title} />

 ) : null}

 {chatBubbles.map(bubble => {
 const selected = selectDeleteMode && selectedDeleteIds.has(bubble.id);
 const toggleSelect = () => {
  if (!selectDeleteMode) return;
  setSelectedDeleteIds((prev) => {
   const next = new Set(prev);
   if (next.has(bubble.id)) next.delete(bubble.id);
   else next.add(bubble.id);
   return next;
  });
 };
 return (
 <div
  key={bubble.id}
  className={clsx(
   'wz-ag-msg-row flex items-start gap-2',
   selectDeleteMode && 'is-selecting',
   selected && 'is-selected'
  )}
  onClick={(e) => {
   if (!selectDeleteMode) return;
   // 不抢按钮/输入/链接的点击
   const el = e.target as HTMLElement | null;
   if (el?.closest('button, a, input, textarea, summary, [data-no-select]')) return;
   toggleSelect();
  }}
  role={selectDeleteMode ? 'checkbox' : undefined}
  aria-checked={selectDeleteMode ? selected : undefined}
 >

 {selectDeleteMode ? (
 <button
  type="button"
  className="wz-del-check-btn mt-3.5 shrink-0"
  data-no-select
  aria-label={selected ? '取消选择' : '选择消息'}
  onClick={(e) => { e.stopPropagation(); toggleSelect(); }}
 >
  <span className={clsx('wz-del-check', selected && 'on')} aria-hidden>
   {selected ? (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>
   ) : null}
  </span>
 </button>
 ) : null}

 <div className="flex min-w-0 flex-1 flex-col">

 <Bubble bubble={bubble} bookId={book.id}

 onDismiss={() => setChatBubbles((curr) => {
  const next = curr.filter((b) => b.id !== bubble.id);
  conversationRef.current = next
    .filter((b) => b.role === 'user' || b.role === 'assistant')
    .map((b) => ({ role: b.role as 'user' | 'assistant', content: String(b.content || '') }))
    .filter((t) => t.content.trim().length > 0)
    .slice(-20);
  return next;
 })}

 onToggleThinking={() => setChatBubbles(curr => curr.map(b => b.id === bubble.id ? { ...b, thinkingCollapsed: !b.thinkingCollapsed } : b))}

 onConfirmSend={bubble.confirmState ? () => void executeSend(bubble.id) : undefined}

 onCancelSend={bubble.confirmState ? () => cancelSend(bubble.id) : undefined}

 onConfirmOutline={bubble.outlinePreview?.status === 'pending' ? () => void handleConfirmOutline(bubble.id) : undefined}

 onDismissOutline={bubble.outlinePreview?.status === 'pending' ? () => handleDismissOutline(bubble.id) : undefined}

 onConfirmRole={bubble.roleSuggestions?.length ? (roleId) => void handleConfirmRole(bubble.id, roleId) : undefined}

 onDismissRole={bubble.roleSuggestions?.length ? (roleId) => handleDismissRole(bubble.id, roleId) : undefined}

 onConfirmUnderstanding={bubble.understandingConfirm ? (bubbleId) => void handleConfirmUnderstanding(bubbleId) : undefined}

 onDismissUnderstanding={bubble.understandingConfirm ? (bubbleId) => handleDismissUnderstanding(bubbleId) : undefined}

 onWizardSelect={bubble.wizardCard ? (bubbleId, key) => handleWizardSelect(bubbleId, key) : undefined}

 onWizardConfirm={bubble.wizardCard ? (bubbleId) => handleWizardConfirm(bubbleId) : undefined}

 onWizardBack={bubble.wizardCard ? (bubbleId) => handleWizardBack(bubbleId) : undefined}

 onWriteBody={bubble.bodyWriteState?.status === 'pending' ? (mode) => void handleWriteBody(bubble.id, mode) : undefined}

 onDismissBodyWrite={bubble.bodyWriteState?.status === 'pending' ? () => handleDismissBodyWrite(bubble.id) : undefined}

 onConfirmOutlineApply={bubble.outlineConfirm ? (bubbleId) => {
 const target = chatBubbles.find(b => b.id === bubbleId);
 if (!target?.outlineConfirm) return;
 const { targetChapterId, targetTitle } = target.outlineConfirm;
 const synopsis = String(target.content || '').trim();
 if (!synopsis) {
  useIslandStore.getState().show({ type: 'warning', message: '没有可确认的章纲内容', autoHideMs: 1600 });
  return;
 }
 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? {
  ...b,
  outlineConfirm: undefined,
  tokenInfo: '正在生成正式细纲…',
  thinkingCollapsed: false,
  thinkingEntries: [
    ...(b.thinkingEntries || []),
    makeThinkingEntry(0, '用户确认章纲，调用 formalize_chapter_outline', 'plan'),
    makeThinkingEntry(1, '写入正式细纲到目标章细纲栏…', 'write')
  ].slice(-80)
 } : b));
 activeThinkingIdRef.current = bubbleId;
 setBusy(true);
 void (async () => {
  try {
   registerCreativeAgentTools();
   registerWriteAgentTools();
   const freshBook = useBookStore.getState().books.find((b2) => b2.id === book.id) || book;
   const freshChapter = freshBook.chapters.find((c) => c.id === chapter.id) || chapter;
   const { agentToolRegistry } = await import('./tools/registry');
   const result = await agentToolRegistry.execute(
    'formalize_chapter_outline',
    { targetChapterId, targetTitle, confirmedSynopsis: synopsis },
    { book: freshBook, currentChapter: freshChapter, allowWrites: true }
   );
   const data = (result.data || {}) as Record<string, unknown>;
   const formalOutline = String(data.formalOutline || '').trim();
   if (!formalOutline || data.ok === false) {
    throw new Error(result.summary || '正式细纲生成失败');
   }
   appendThoughtToBubble(bubbleId, result.summary || '正式细纲已写入', 2, 'ok');
   setAgentTaskState({ kind: 'outline_ready', chapterId: targetChapterId, targetTitle, planText: formalOutline });
   setChatBubbles(prev => prev.map((b) => b.id === bubbleId ? {
    ...b,
    content: formalOutline,
    tokenInfo: `已填入 ${targetTitle}${data.totalTokens ? ` · ${Number(data.totalTokens).toLocaleString()} token` : ''}`,
    thinkingCollapsed: false,
    outlineConfirm: undefined
   } : b).concat([{ id: makeId('done'), role: 'assistant', content: `正式细纲已写入「${targetTitle}」细纲栏。`, tokenInfo: '完成' }]));
  } catch (err) {
   setChatBubbles(prev => [...prev, { id: makeId('err'), role: 'assistant', content: `生成细纲失败：${err instanceof Error ? err.message : String(err)}` }]);
  } finally {
   setBusy(false);
   if (activeThinkingIdRef.current === bubbleId) activeThinkingIdRef.current = null;
  }
 })();
 } : undefined}

 onDismissOutlineApply={bubble.outlineConfirm ? (bubbleId) => setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, outlineConfirm: undefined } : b)) : undefined}

 onConfirmGeneratedRole={bubble.generatedRoles?.length ? (bubbleId, cardIndex) => {

 const target = chatBubbles.find(b => b.id === bubbleId);

 if (!target?.generatedRoles?.[cardIndex]) return;

 const card = target.generatedRoles[cardIndex];

 void persistAgentRoleCandidate({

 name: card.name,

 faction: card.faction,

 roleType: card.roleType,

 description: [card.description, `性格：${card.personality.join('、')}`, `动机：${card.motivation}`, `冲突种子：${card.conflictSeed}`, `弧线建议：${card.arcSuggestion}`, `出场方式：${card.entranceStyle}`].filter(Boolean).join('；'),

 firstAppearance: card.appearanceChapter,

 relations: card.relationHint && !card.relationHint.includes('暂无关联') ? [card.relationHint] : []

 }).then((result) => {

 useIslandStore.getState().show({ type: 'success', message: result.created ? `已创建角色「${result.roleName}」` : `已合并到现有角色「${result.roleName}」，未创建重复角色卡`, autoHideMs: 2200 });

 setChatBubbles(prev => prev.map(b => b.id === bubbleId ? { ...b, generatedRoles: b.generatedRoles?.filter((_, i) => i !== cardIndex) } : b));

 }).catch(err => useIslandStore.getState().show({ type: 'error', message: `保存失败：${err instanceof Error ? err.message : String(err)}` }));

 } : undefined}

 onRegenerateRoles={bubble.generatedRoles ? () => handleCreateRole() : undefined}

 />

 </div>
 </div>
 );
 })}

 </div>







 {selectDeleteMode ? (
 <div className="wz-ag-delbar">
 <div className="wz-ag-delbar-left">
 <span className="wz-ag-delbar-title">选择删除</span>
 <span className="wz-ag-delbar-count">已选 {selectedDeleteIds.size} 条</span>
 </div>
 <div className="wz-ag-delbar-actions">
 <button type="button" className="wz-ag-delbar-btn danger" disabled={selectedDeleteIds.size === 0} onClick={() => {
  setChatBubbles((prev) => {
    const next = prev.filter((b) => !selectedDeleteIds.has(b.id));
    // 真正清上下文：界面删了，发给模型的 conversationRef 也同步重建
    conversationRef.current = next
      .filter((b) => b.role === 'user' || b.role === 'assistant')
      .map((b) => ({ role: b.role as 'user' | 'assistant', content: String(b.content || '') }))
      .filter((t) => t.content.trim().length > 0)
      .slice(-20);
    return next;
  });
  setSelectedDeleteIds(new Set());
  setSelectDeleteMode(false);
  // 删记录后：若没有 outline_ready 对应内容，任务状态回 idle（避免「按这个写」吃幽灵方案）
  setAgentTaskState((prev) => {
   if (prev.kind === 'idle') return prev;
   if (prev.kind === 'outline_ready' || prev.kind === 'draft_ready') {
    const still = conversationRef.current.some((turn) => turn.role === 'assistant' && turn.content && turn.content.includes(prev.kind === 'outline_ready' ? prev.planText.slice(0, 40) : prev.bodyText.slice(0, 40)));
    if (!still) return { kind: 'idle' };
   }
   return prev;
  });
 }}>删除</button>
 <button type="button" className="wz-ag-delbar-btn" onClick={() => { setSelectDeleteMode(false); setSelectedDeleteIds(new Set()); }}>取消</button>
 </div>
 </div>

 ) : null}







{sessionMenu ? createPortal(
 <div className="fixed inset-0 z-[100001]" onMouseDown={() => setSessionMenu(null)} onContextMenu={(e) => { e.preventDefault(); setSessionMenu(null); }}>
  <div
   className="wz-ag-item-menu"
   data-ag-session-item-menu
   style={{ left: Math.min(sessionMenu.x, window.innerWidth - 168), top: Math.min(sessionMenu.y, window.innerHeight - 100) }}
   onMouseDown={(e) => e.stopPropagation()}
  >
   <button type="button" className="wz-ag-item-menu-btn" onClick={() => renameAgentSession(sessionMenu.sessionId)}>重命名</button>
   <button type="button" className="wz-ag-item-menu-btn danger" onClick={() => deleteAgentSession(sessionMenu.sessionId)}>删除</button>
  </div>
 </div>, document.body
) : null}

{bubbleMenu ? createPortal(

 <div className="fixed inset-0 z-[99999]" onClick={() => setBubbleMenu(null)} onContextMenu={e => { e.preventDefault(); setBubbleMenu(null); }}>

 <div className="absolute rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] py-1 shadow-xl" style={{ left: Math.min(bubbleMenu.x, window.innerWidth - 160), top: Math.min(bubbleMenu.y, window.innerHeight - 60) }} onClick={e => e.stopPropagation()}>

 <button className="w-full px-4 py-1.5 text-left text-[12px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]" onClick={() => { setSelectDeleteMode(true); setSelectedDeleteIds(new Set()); setBubbleMenu(null); }}>选择删除聊天记录</button>

 </div>

 </div>, document.body

 ) : null}











 {/* 指令输入区（卡片化 composer） */}

 <div className="wz-ag-composer">

 <div className="wz-composer-box">

 <textarea data-agent-composer value={chatInput} onChange={e => setChatInput(e.target.value)}

 onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}

 placeholder={busy ? '正在处理当前任务…' : pendingConfirmId ? '请先确认或取消上方请求' : '询问剧情，或描述你希望 AI 完成的修改…'}

 disabled={busy || Boolean(pendingConfirmId)}

 rows={2} />

 <div className="wz-composer-bar">

 <div className="wz-ag-model-wrap" ref={modelMenuRef}>

 <button

 type="button"

 className={clsx('wz-ag-model', modelMenuOpen && 'open')}

 title={`当前模型：${agentModelLabel}（点击切换）`}

 onClick={() => setModelMenuOpen((v) => !v)}

 >

 <span className="model-ico" aria-hidden>

 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">

 <circle cx="12" cy="12" r="3" />

 <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />

 </svg>

 </span>

 <span className="model-name">{shortModelLabel}</span>

 <IdeSvgChevronDown size={10} />

 </button>

 {modelMenuOpen ? (

 <div className="wz-ag-model-menu" role="listbox" aria-label="选择模型">

  <div className="wz-ag-model-menu-hd">切换模型</div>
 <div className="wz-ag-model-menu-sub">仅显示已检测可用 · 与设置共用</div>

 {agentModelOptions.length === 0 ? (
 <div className="wz-ag-model-empty">还没有可用模型缓存。点下方「检测可用模型」，或去设置里点「测试连接」。</div>
 ) : agentModelOptions.map((m) => (
 <button
 key={m}
 type="button"
 role="option"
 aria-selected={m === agentModelLabel}
 className={clsx('wz-ag-model-item', m === agentModelLabel && 'active')}
 onClick={() => void switchAgentModel(m)}
 >
 <span className="name">{m}</span>
 {m === agentModelLabel ? <span className="check">当前</span> : null}
 </button>
 ))}

 <button
 type="button"
 className="wz-ag-model-foot probe"
 disabled={probingModels || !appConfig}
 onClick={() => void probeAvailableModels()}
 >
 {probingModels ? '检测中…' : '检测可用模型'}
 </button>

 <button
 type="button"
 className="wz-ag-model-foot"
 onClick={() => {
 setModelMenuOpen(false);
 window.dispatchEvent(new CustomEvent('writerzen:open-settings'));
 }}


 >

 在设置中管理模型…

 </button>

 </div>

 ) : null}

 </div>

 

 

 <button type="button" onClick={() => setAgentWebSearch(!agentWebSearch)} className={clsx('wz-ag-icon-btn', agentWebSearch && 'on')} title={agentWebSearch ? '联网已开' : '联网搜索'}>

 <ChronoIcon name="aiweb" size={15} />

 </button>

 <span style={{ flex: 1 }} />

 <button type="button" onClick={busy ? handleStop : handleSend} disabled={!busy && (!chatInput.trim() || Boolean(pendingConfirmId))} className="wz-cb-send" title={busy ? '停止' : '发送（Enter）'}>

 {!busy ? (
 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
   <path d="M12 19V5M5 12l7-7 7 7" />
 </svg>
 ) : (
 <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-white/80">
   <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="10" height="10" rx="1" /></svg>
 </span>
 )}
 </button>

 </div>

 </div>

 </div>

 </div>

 );

}







// ────── 辅助函数 ──────────────────────────────────────────────────────────────



















































