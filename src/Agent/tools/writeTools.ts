// 模块说明：Agent 写工具（自主模式）。
// 维护边界：通过 useBookStore 落库；只在 context.allowWrites=true 时注册/执行。

import type { Chapter, RoleProfile } from '../../types';
import { useBookStore } from '../../store/useBookStore';
import { saveLearnedConstraint } from '../agentMemoryStore';
import { agentToolRegistry } from './registry';
import type { AgentToolContext, AgentToolResult } from './types';

function text(value: unknown): string {
  return String(value || '').trim();
}

function createId(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultChapterContent(title: string): string {
  return `<h2 style="text-align:center;">${title}</h2><p></p>`;
}

function nextChapterTitle(chapters: Chapter[]): string {
  let max = 0;
  for (const ch of chapters) {
    const m = String(ch.title || '').match(/第\s*(\d+)\s*章/);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `第${max + 1}章`;
}

function findRole(bookId: string, roleIdOrName: string): RoleProfile | null {
  const book = useBookStore.getState().books.find((b) => b.id === bookId);
  if (!book) return null;
  const roles = (book.resourceIndex?.customCharacterCategories || []).flatMap((c) => c.children || []);
  const key = text(roleIdOrName);
  return (
    roles.find((r) => r.id === key) ||
    roles.find((r) => r.name === key) ||
    roles.find((r) => (r.aliases || []).includes(key)) ||
    null
  );
}

export function registerWriteAgentTools(): void {
  agentToolRegistry.register({
    name: 'update_role',
    description:
      '修改角色卡字段（境界/势力/近况/别名等）。仅在自主模式可用。必须先 search_roles 确认角色存在。',
    inputSchema: {
      type: 'object',
      properties: {
        roleIdOrName: { type: 'string' },
        realm: { type: 'string' },
        faction: { type: 'string' },
        recentStatus: { type: 'string' },
        plotProgress: { type: 'string' },
        aliasesAdd: { type: 'array', items: { type: 'string' } }
      },
      required: ['roleIdOrName']
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const roleKey = text(input.roleIdOrName);
      const existing = findRole(context.book.id, roleKey);
      if (!existing) {
        return {
          summary: `未找到角色「${roleKey}」，未修改。`,
          data: { ok: false },
          evidence: [],
          artifacts: [{ type: 'write_result', data: { tool: 'update_role', ok: false } }]
        };
      }
      const next: RoleProfile = {
        ...existing,
        realm: text(input.realm) || existing.realm,
        faction: text(input.faction) || existing.faction,
        plotProgress: text(input.plotProgress) || existing.plotProgress,
        aliases: Array.from(
          new Set([
            ...(existing.aliases || []),
            ...((Array.isArray(input.aliasesAdd) ? input.aliasesAdd : []) as unknown[])
              .map((x) => text(x))
              .filter(Boolean)
          ])
        ),
        customFields: {
          ...(existing.customFields || {}),
          ...(text(input.recentStatus)
            ? { recentStatus: text(input.recentStatus) }
            : {})
        }
      };
      await useBookStore.getState().updateRoleProfile(context.book.id, next);
      return {
        summary: `已更新角色「${next.name}」档案字段。`,
        data: { ok: true, roleId: next.id, name: next.name },
        evidence: [],
        artifacts: [{ type: 'write_result', data: { tool: 'update_role', ok: true, roleId: next.id } }]
      };
    }
  });

  agentToolRegistry.register({
    name: 'create_chapter',
    description: '在本书末尾新建空章节（可指定标题）。仅在自主模式可用。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        outline: { type: 'string' }
      }
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const book = useBookStore.getState().books.find((b) => b.id === context.book.id);
      if (!book) throw new Error('书籍不存在');
      const now = new Date().toISOString();
      const title = text(input.title) || nextChapterTitle(book.chapters);
      const newChapter: Chapter = {
        id: createId(),
        title,
        content: buildDefaultChapterContent(title),
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
        outline: text(input.outline) || undefined
      };
      await useBookStore.getState().updateBook(book.id, (current) => ({
        ...current,
        chapters: [...current.chapters, newChapter],
        updatedAt: now
      }));
      return {
        summary: `已新建章节「${title}」。`,
        data: { ok: true, chapterId: newChapter.id, title },
        evidence: [],
        artifacts: [
          { type: 'write_result', data: { tool: 'create_chapter', ok: true, chapterId: newChapter.id, title } }
        ]
      };
    }
  });

  agentToolRegistry.register({
    name: 'update_outline',
    description: '更新指定章节细纲（outline）。默认更新当前章。仅在自主模式可用。',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' },
        outline: { type: 'string' }
      },
      required: ['outline']
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const outline = text(input.outline);
      if (!outline) {
        return {
          summary: 'outline 为空，未更新。',
          data: { ok: false },
          evidence: [],
          artifacts: [{ type: 'write_result', data: { tool: 'update_outline', ok: false } }]
        };
      }
      const chapterId = text(input.chapterId) || context.currentChapter.id;
      await useBookStore.getState().setChapterOutline(context.book.id, chapterId, outline);
      return {
        summary: `已更新章节细纲（${chapterId}）。`,
        data: { ok: true, chapterId, outlineChars: outline.length },
        evidence: [],
        artifacts: [{ type: 'write_result', data: { tool: 'update_outline', ok: true, chapterId } }]
      };
    }
  });

  agentToolRegistry.register({
    name: 'save_memory',
    description:
      '写入一条 Agent 学习记忆（默认未确认，需用户后续确认后才进入 HARD CONSTRAINTS）。仅在自主模式可用。',
    inputSchema: {
      type: 'object',
      properties: {
        fact: { type: 'string' },
        entity: { type: 'string' },
        reason: { type: 'string' },
        confirmed: { type: 'boolean' }
      },
      required: ['fact']
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const fact = text(input.fact);
      if (!fact) {
        return {
          summary: 'fact 为空，未写入。',
          data: { ok: false },
          evidence: [],
          artifacts: [{ type: 'write_result', data: { tool: 'save_memory', ok: false } }]
        };
      }
      // 默认未确认，遵守“用户控制”原则；仅当明确 confirmed=true 才直接确认
      const confirmed = input.confirmed === true;
      const saved = await saveLearnedConstraint(context.book.id, {
        fact,
        entity: text(input.entity) || undefined,
        reason: text(input.reason) || undefined,
        source: 'agent.decision_loop',
        confirmed
      });
      return {
        summary: saved
          ? confirmed
            ? `已确认写入记忆：${fact}`
            : `已写入待确认记忆：${fact}`
          : '记忆写入失败。',
        data: { ok: Boolean(saved), entry: saved },
        evidence: [],
        artifacts: [{ type: 'write_result', data: { tool: 'save_memory', ok: Boolean(saved), confirmed } }]
      };
    }
  });
}
