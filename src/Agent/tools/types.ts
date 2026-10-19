import type { Book, Chapter } from '../../types';

export type ReadOnlyAgentToolName =
  | 'search_book'
  | 'search_roles'
  | 'search_archive'
  | 'find_chapter'
  | 'read_chapter'
  | 'inspect_organization'
  | 'get_role_update_plans'
  | 'list_recent_context'
  | 'prepare_outline_write'
  | 'find_empty_chapter'
  | 'resolve_outline_target'
  | 'build_story_canon'
  | 'plan_chapter_outline'
  | 'write_chapter_body'
  | 'review_draft'
  | 'open_webpage'
  | 'extract_page_text';

export type WriteAgentToolName =
  | 'update_role'
  | 'create_chapter'
  | 'update_outline'
  | 'save_memory'
  | 'save_body_to_chapter'
  | 'formalize_chapter_outline';

export type AgentToolName = ReadOnlyAgentToolName | WriteAgentToolName;

export type AgentArtifact =
  | { type: 'organization_health'; data: Record<string, unknown> }
  | { type: 'role_update_plans'; data: Record<string, unknown> }
  | { type: 'write_result'; data: Record<string, unknown> }
  | { type: 'chapter_review'; data: Record<string, unknown> }
  | { type: 'pre_write_reflection'; data: { decisionText: string; continuation: string; approach: string; satisfaction: string[]; endState: string } };

export interface AgentEvidence {
  id: string;
  source: AgentToolName;
  chapterId?: string;
  chapterTitle?: string;
  from?: number;
  to?: number;
  text?: string;
  snippet: string;
}

export interface AgentToolResult<T = unknown> {
  summary: string;
  data: T;
  evidence: AgentEvidence[];
  artifacts?: AgentArtifact[];
}

export interface AgentToolContext {
  book: Book;
  currentChapter: Chapter;
  /** 自主模式可开启写工具；默认 false，保持只读安全 */
  allowWrites?: boolean;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: AgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  execute: (
    input: TInput,
    context: AgentToolContext
  ) => Promise<AgentToolResult<TOutput>> | AgentToolResult<TOutput>;
}

export interface AgentToolRun {
  id: string;
  step: number;
  tool: AgentToolName;
  reason: string;
  summary: string;
  status: 'running' | 'done' | 'error';
  thought?: string;
}

export interface ReadOnlyAgentLoopResult {
  answer: string;
  evidence: AgentEvidence[];
  artifacts: AgentArtifact[];
  toolRuns: AgentToolRun[];
  totalTokens: number;
  /** api=真实返回；estimate=本地估算；none=未知 */
  tokenSource?: 'api' | 'estimate' | 'none';
}
