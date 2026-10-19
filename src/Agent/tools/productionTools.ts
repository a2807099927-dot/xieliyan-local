// 模块说明：生产向 Agent 工具（讨论/写作/入章用的本地能力）。
// list_recent_context 只读；save_body / 细纲上下文组装供执行路径调用。

import type { Book, Chapter } from '../../types';
import { buildOutlineWritingContext, harvestOutlineFromConversation } from '../outlineWritingContext';
import {
  findLatestEmptyChapter,
  persistAgentBodyToChapter,
  type BodyWriteMode
} from '../agentBodyPersist';
import { buildStoryCanonBlock } from '../storyCanonCards';
import { agentToolRegistry } from './registry';
import type { AgentToolContext, AgentToolResult } from './types';

function text(value: unknown): string {
  return String(value || '').trim();
}

/** 近章上下文：8 档案 + 2 正文，供讨论/写作共用 */
export function buildRecentProductionContext(
  book: Book,
  chapter: Chapter,
  options?: { userInstruction?: string; fallbackOutline?: string }
) {
  return buildOutlineWritingContext(book, chapter, {
    archiveCount: 8,
    proseCount: 2,
    proseCharsEach: 1800,
    userInstruction: options?.userInstruction,
    fallbackOutline: options?.fallbackOutline
  });
}

export function registerProductionAgentTools(): void {
  agentToolRegistry.register({
    name: 'list_recent_context',
    description:
      '返回近章写作上下文：前 8 章剧情档案摘要 + 近 2 章正文尾部 + 本章细纲（可含对话方案回填）。讨论大纲或写作前应优先用这个，而不是 search_book 扫全书。',
    inputSchema: {
      type: 'object',
      properties: {
        userInstruction: { type: 'string' },
        fallbackOutline: { type: 'string' }
      }
    },
    readOnly: true,
    execute(input: Record<string, unknown>, context: AgentToolContext): AgentToolResult<Record<string, unknown>> {
      const packed = buildRecentProductionContext(context.book, context.currentChapter, {
        userInstruction: text(input.userInstruction),
        fallbackOutline: text(input.fallbackOutline)
      });
      const storyCanon = buildStoryCanonBlock(context.book, context.currentChapter);
      return {
        summary: `近章上下文：档案 ${packed.archiveUsed} 章 · 正文 ${packed.proseUsed} 章 · 细纲来源 ${packed.outlineSource}`,
        data: {
          hasOutline: packed.hasOutline,
          outlineSource: packed.outlineSource,
          outlineText: packed.outlineText,
          contextText: packed.contextText,
          archiveUsed: packed.archiveUsed,
          proseUsed: packed.proseUsed,
          storyCanon
        },
        evidence: []
      };
    }
  });

  agentToolRegistry.register({
    name: 'prepare_outline_write',
    description:
      '组装「按细纲写作」提示词材料（不直接调用模型）。输出 system/user 可用的上下文包。空细纲时可传入 conversationFallback。',
    inputSchema: {
      type: 'object',
      properties: {
        userInstruction: { type: 'string' },
        conversationFallback: { type: 'string' }
      }
    },
    readOnly: true,
    execute(input: Record<string, unknown>, context: AgentToolContext): AgentToolResult<Record<string, unknown>> {
      const packed = buildRecentProductionContext(context.book, context.currentChapter, {
        userInstruction: text(input.userInstruction) || '请根据本章细纲撰写正文。',
        fallbackOutline: text(input.conversationFallback)
      });
      return {
        summary: packed.hasOutline
          ? `已组装细纲写作上下文（${packed.outlineSource}）`
          : '缺少细纲：本章细纲栏与对话方案皆空',
        data: packed,
        evidence: []
      };
    }
  });

  agentToolRegistry.register({
    name: 'save_body_to_chapter',
    description:
      '将小说正文写入章节。mode=current 写当前章；mode=new_chapter 优先填最近空章，没有空章才新建。有长文时需 append 或 overwrite。',
    inputSchema: {
      type: 'object',
      properties: {
        bodyText: { type: 'string' },
        mode: { type: 'string', enum: ['current', 'new_chapter'] },
        append: { type: 'boolean' },
        overwrite: { type: 'boolean' },
        newTitle: { type: 'string' }
      },
      required: ['bodyText', 'mode']
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const bodyText = text(input.bodyText);
      const mode = (text(input.mode) || 'new_chapter') as BodyWriteMode;
      const result = await persistAgentBodyToChapter({
        bookId: context.book.id,
        chapterId: context.currentChapter.id,
        bodyText,
        mode: mode === 'current' ? 'current' : 'new_chapter',
        append: Boolean(input.append),
        overwrite: Boolean(input.overwrite) || mode === 'new_chapter',
        newTitle: text(input.newTitle) || undefined
      });
      return {
        summary: result.ok
          ? `已写入「${result.title}」约 ${result.wordCount} 字${result.reusedEmptyChapter ? '（复用空章）' : result.createdChapter ? '（新建）' : ''}`
          : `写入失败：${result.error || '未知错误'}`,
        data: result as unknown as Record<string, unknown>,
        evidence: [],
        artifacts: [{ type: 'write_result', data: { tool: 'save_body_to_chapter', ...result } }]
      };
    }
  });

  agentToolRegistry.register({
    name: 'find_empty_chapter',
    description: '查找最近的空章节（优先当前章，再从末尾往前）。写入新章前可先调用，避免重复建章。',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    execute(_input: Record<string, unknown>, context: AgentToolContext): AgentToolResult<Record<string, unknown>> {
      const empty = findLatestEmptyChapter(context.book, context.currentChapter.id);
      if (!empty) {
        return { summary: '没有空章，若要落正文需要新建章节。', data: { found: false }, evidence: [] };
      }
      return {
        summary: `找到空章「${empty.title}」`,
        data: { found: true, chapterId: empty.id, title: empty.title, wordCount: empty.wordCount || 0 },
        evidence: []
      };
    }
  });
}

/** 从对话轮次收获细纲方案（供面板/工具共用） */
export function harvestPlanFromTurns(
  turns: Array<{ role: string; content: string }>
): string {
  return harvestOutlineFromConversation(turns);
}
