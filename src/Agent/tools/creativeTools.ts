// 模块说明：创作向 Agent 工具（出纲 / 写作 / 设定卡）。
// Skill 管 prompt 与设定装配；Tool 管可调用执行。

import type { Book, Chapter } from '../../types';
import { electronAPI } from '../../utils/electron';
import { useBookStore } from '../../store/useBookStore';
import { buildOutlineWritingContext, buildOutlineWritingSystemPrompt, harvestOutlineFromConversation } from '../outlineWritingContext';
import { resolveOutlineTargetChapter } from '../outlineTarget';
import { buildStoryCanonBlock } from '../storyCanonCards';
import type { AgentGenreId } from '../types';
import { inferAgentGenreFromBook } from '../bookContext';
import {
  buildChapterPlanDiscussSystemPrompt,
  buildFormalChapterOutlineSystemPrompt,
  buildEditorReviewSystemPrompt
} from '../skills/writingSkill';
import { splitAgentOutput } from '../stripAgentOutput';
import { normalizeChinesePunctuation } from '../useAgentSession';
import {
  runPreWriteReflection,
  formatPreWriteDecisionForWriter,
  formatPreWriteDecisionForUser,
} from '../preWriteReflection';
import { bookHasNoSubstantialBody } from '../batchChapterCreator';
import { agentToolRegistry } from './registry';
import type { AgentToolContext, AgentToolResult } from './types';

function text(value: unknown): string {
  return String(value || '').trim();
}

function memoryContextFor(book: Book, targetIndex: number, lookback = 10): string {
  const memBank: any[] = Array.isArray((book as any).memoryBank) ? (book as any).memoryBank : [];
  const start = Math.max(0, targetIndex - lookback);
  const lines: string[] = [];
  for (const ch of (book.chapters || []).slice(start, targetIndex)) {
    const m = memBank.find((mm: any) => mm.chapterId === ch.id);
    const s = m?.plotAnalysis?.plotSynopsis || m?.summary || '';
    if (s) lines.push(`${ch.title}：${s}`);
  }
  return lines.length ? `【前文剧情档案】\n${lines.join('\n')}` : '';
}

async function callChat(args: {
  book: Book;
  chapter: Chapter;
  messages: Array<{ role: string; content: string }>;
  senderId: string;
  maxTokens?: number;
  /** 严格正文模式：模型只返回思考/计划时返回空 text（供上层判定无正文），不回退原文 */
  strictBody?: boolean;
}): Promise<{ text: string; totalTokens: number }> {
  const response = await electronAPI.ai.chat({
    messages: args.messages as any,
    stream: false,
    bookId: args.book.id,
    chapterId: args.chapter.id,
    disableRag: true,
    disableStyle: true,
    maxTokens: args.maxTokens ?? 8192,
    senderId: args.senderId
  });
  const raw = String(response?.text || '').trim();
  const split = splitAgentOutput(raw);
  const body = normalizeChinesePunctuation(split.body || (args.strictBody ? '' : raw)).trim();
  return {
    text: body,
    totalTokens: Number(response?.usage?.totalTokens || 0)
  };
}

export function registerCreativeAgentTools(): void {
  agentToolRegistry.register({
    name: 'resolve_outline_target',
    description:
      '解析章纲/细纲应对准哪一章：优先当前空章、后方空章、末尾空章，禁止误抓全书早期短章。出纲前应调用。',
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    execute(_input: Record<string, unknown>, context: AgentToolContext): AgentToolResult<Record<string, unknown>> {
      const resolved = resolveOutlineTargetChapter(context.book, context.currentChapter);
      return {
        summary: `目标章：${resolved.label}`,
        data: {
          chapterId: resolved.chapter.id,
          title: resolved.chapter.title,
          index: resolved.index,
          label: resolved.label,
          wordCount: resolved.chapter.wordCount || 0
        },
        evidence: []
      };
    }
  });

  agentToolRegistry.register({
    name: 'build_story_canon',
    description:
      '组装小说设定卡 + 近期剧情卡（来自剧情档案章梗概）+ 近章角色卡。出纲/写作前的 Skill 装配，0 token。',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string', description: '锚定章，默认当前章' }
      }
    },
    readOnly: true,
    execute(input: Record<string, unknown>, context: AgentToolContext): AgentToolResult<Record<string, unknown>> {
      const chapterId = text(input.chapterId) || context.currentChapter.id;
      const ch =
        context.book.chapters.find((c) => c.id === chapterId) || context.currentChapter;
      const block = buildStoryCanonBlock(context.book, ch);
      return {
        summary: `已装配设定/剧情/角色卡（约 ${block.length} 字）`,
        data: { chapterId: ch.id, storyCanon: block, chars: block.length },
        evidence: []
      };
    }
  });

  agentToolRegistry.register({
    name: 'plan_chapter_outline',
    description:
      '讨论/生成一整章章纲故事板（大白话剧情，非分析表）。内部自动：定位目标章 + 档案 + 设定卡 + 规划师 Skill。',
    inputSchema: {
      type: 'object',
      properties: {
        userInstruction: { type: 'string' },
        conversation: {
          type: 'array',
          items: { type: 'object' },
          description: '可选近期对话 [{role,content}]'
        }
      },
      required: ['userInstruction']
    },
    readOnly: true,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      const userInstruction = text(input.userInstruction);
      if (!userInstruction) {
        return { summary: '缺少 userInstruction', data: { ok: false }, evidence: [] };
      }
      // 用 store 最新书，避免陈旧
      const book = useBookStore.getState().books.find((b) => b.id === context.book.id) || context.book;
      const current =
        book.chapters.find((c) => c.id === context.currentChapter.id) || context.currentChapter;
      const resolved = resolveOutlineTargetChapter(book, current);
      const mCtx = memoryContextFor(book, resolved.index);
      const system = buildChapterPlanDiscussSystemPrompt({
        book,
        targetLabel: resolved.label,
        memoryContext: mCtx,
        anchorChapter: resolved.chapter
      });
      const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: system }];
      const conv = Array.isArray(input.conversation) ? input.conversation : [];
      for (const turn of conv.slice(-12) as Array<{ role?: string; content?: string }>) {
        if (turn?.role === 'user' || turn?.role === 'assistant') {
          messages.push({ role: turn.role, content: String(turn.content || '') });
        }
      }
      messages.push({ role: 'user', content: userInstruction });

      const { text: out, totalTokens } = await callChat({
        book,
        chapter: current,
        messages,
        senderId: 'tool-plan-outline',
        maxTokens: 8192
      });

      return {
        summary: `已生成「${resolved.label}」章纲故事板（${out.length} 字）`,
        data: {
          ok: true,
          targetChapterId: resolved.chapter.id,
          targetTitle: resolved.label,
          targetIndex: resolved.index,
          outlineDraft: out,
          totalTokens,
          needsConfirm: true
        },
        evidence: [],
        artifacts: [
          {
            type: 'write_result',
            data: {
              tool: 'plan_chapter_outline',
              targetChapterId: resolved.chapter.id,
              targetTitle: resolved.label,
              chars: out.length
            }
          }
        ]
      };
    }
  });

  agentToolRegistry.register({
    name: 'write_chapter_body',
    description:
      '按本章细纲（或对话方案）写正文。内部：prepare 细纲+9档案+1正文 + 写手 Skill。只生成不落库；落库用 save_body_to_chapter。',
    inputSchema: {
      type: 'object',
      properties: {
        userInstruction: { type: 'string' },
        conversationFallback: { type: 'string', description: '细纲栏为空时用对话方案' },
        conversation: { type: 'array', items: { type: 'object' } }
      },
      required: ['userInstruction']
    },
    readOnly: true,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      const userInstruction = text(input.userInstruction) || '请根据本章细纲撰写正文。';
      const book = useBookStore.getState().books.find((b) => b.id === context.book.id) || context.book;
      let chapter =
        book.chapters.find((c) => c.id === context.currentChapter.id) || context.currentChapter;
      // 尽量确保近章正文已加载
      try {
        const idx = book.chapters.findIndex((c) => c.id === chapter.id);
        const prev = idx > 0 ? book.chapters[idx - 1] : undefined;
        if (prev) await useBookStore.getState().ensureChapterContent(book.id, prev.id);
        await useBookStore.getState().ensureChapterContent(book.id, chapter.id);
        const fresh = useBookStore.getState().books.find((b) => b.id === book.id) || book;
        chapter = fresh.chapters.find((c) => c.id === chapter.id) || chapter;
      } catch {
        /* ignore */
      }

      const conv = Array.isArray(input.conversation) ? input.conversation : [];
      const harvested =
        text(input.conversationFallback) ||
        harvestOutlineFromConversation(
          conv.map((t: any) => ({ role: t.role, content: String(t.content || '') }))
        );

      const packed = buildOutlineWritingContext(book, chapter, {
        archiveCount: 8,
        proseCount: 2,
        proseCharsEach: 1800,
        userInstruction,
        fallbackOutline: harvested
      });

      if (!packed.hasOutline) {
        const isNewBook = bookHasNoSubstantialBody(book.chapters);
        const guide = isNewBook
          ? '本书无前文（新书），无细纲时不要硬写。请先走开局流程：给用户 2-3 个开局方向 → 用户选定 → 固化故事核心档案（主角/世界/核心冲突/长线目标/爽点模型）→ 出第一章细纲 → formalize_chapter_outline 落细纲 → 再回来调 write_chapter_body。'
          : '本章细纲栏与对话方案皆空，无法直接写正文。请先用 plan_chapter_outline 生成章纲 → 等用户确认 → formalize_chapter_outline 落细纲 → 再回来调 write_chapter_body。';
        return {
          summary: '缺少细纲：' + (isNewBook ? '新书无前文' : '细纲栏与对话方案皆空'),
          data: {
            ok: false,
            needOutline: true,
            isNewBook,
            guide,
          },
          evidence: [],
        };
      }

      if (packed.outlineSource === 'conversation' && packed.outlineText) {
        void useBookStore.getState().setChapterOutline(book.id, chapter.id, packed.outlineText).catch(() => {});
      }

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: buildOutlineWritingSystemPrompt(book, chapter) }
      ];
      for (const turn of conv.slice(-6) as Array<{ role?: string; content?: string }>) {
        if (turn?.role === 'user' || turn?.role === 'assistant') {
          messages.push({ role: turn.role, content: String(turn.content || '') });
        }
      }
      messages.push({ role: 'user', content: packed.userContent });

      // 写前复盘：在正文生成前先跑一次复盘，决策注入 system + artifacts 展示
      const taskSheet: any = {
        primaryGenre: inferAgentGenreFromBook(book) as AgentGenreId,
        userInstruction,
        requiredBeats: [],
        forbiddenMoves: [],
      };
      let reflectionArtifact: any = null;
      try {
        const reflect = await runPreWriteReflection(
          { book, chapter, taskSheet, outlineText: packed.outlineText },
          async (msgs) => {
            const r = await callChat({ book, chapter, messages: msgs, senderId: 'tool-pre-write', maxTokens: 1200 });
            return { text: r.text };
          }
        );
        if (reflect.decision) {
          // 决策紧跟写手 system（index 1），比 unshift 到最前约束力更强（后置 system 覆盖前置）
          messages.splice(1, 0, { role: 'system', content: formatPreWriteDecisionForWriter(reflect.decision) });
        }
        if (reflect.decisionText || reflect.decision) {
          reflectionArtifact = {
            type: 'pre_write_reflection' as any,
            data: {
              decisionText: reflect.decisionText,
              continuation: reflect.decision?.continuation || '',
              approach: reflect.decision?.approach || '',
              satisfaction: reflect.decision?.pacing?.satisfaction || [],
              endState: reflect.decision?.pacing?.endState || '',
            },
          };
        }
      } catch { /* 复盘失败不阻塞正文 */ }

      const { text: out, totalTokens } = await callChat({
        book,
        chapter,
        messages,
        senderId: 'tool-write-body',
        maxTokens: 8192,
        strictBody: true
      });
      if (!out.trim()) {
        return {
          summary: '模型只返回了写作计划，未生成正文。请把细纲写得更具体后重试。',
          data: { ok: false, needRetry: true, bodyText: '' },
          evidence: [],
        };
      }

      return {
        summary: `已生成正文草稿（${out.length} 字，细纲来源 ${packed.outlineSource}）`,
        data: {
          ok: true,
          bodyText: out,
          chapterId: chapter.id,
          outlineSource: packed.outlineSource,
          hasOutline: packed.hasOutline,
          totalTokens,
          needsConfirm: true
        },
        evidence: [],
        artifacts: [
          {
            type: 'write_result',
            data: { tool: 'write_chapter_body', chapterId: chapter.id, chars: out.length }
          },
          ...(reflectionArtifact ? [reflectionArtifact] : []),
        ]
      };
    }
  });

  agentToolRegistry.register({
    name: 'formalize_chapter_outline',
    description:
      '将用户确认的章纲概要展开为可写入细纲栏的正式细纲，并 setChapterOutline。',
    inputSchema: {
      type: 'object',
      properties: {
        targetChapterId: { type: 'string' },
        targetTitle: { type: 'string' },
        confirmedSynopsis: { type: 'string' }
      },
      required: ['targetChapterId', 'confirmedSynopsis']
    },
    readOnly: false,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      if (!context.allowWrites) throw new Error('写工具未授权');
      const targetChapterId = text(input.targetChapterId);
      const confirmedSynopsis = text(input.confirmedSynopsis);
      const targetTitle = text(input.targetTitle) || '目标章';
      if (!targetChapterId || !confirmedSynopsis) {
        return { summary: '缺少目标章或确认概要', data: { ok: false }, evidence: [] };
      }
      const book = useBookStore.getState().books.find((b) => b.id === context.book.id) || context.book;
      const tIdx = book.chapters.findIndex((ch) => ch.id === targetChapterId);
      const mCtx = memoryContextFor(book, tIdx >= 0 ? tIdx : 0);
      const anchor = book.chapters.find((c) => c.id === targetChapterId) || context.currentChapter;
      const system = buildFormalChapterOutlineSystemPrompt({
        book,
        targetTitle,
        memoryContext: mCtx,
        anchorChapter: anchor
      });
      const { text: formal, totalTokens } = await callChat({
        book,
        chapter: context.currentChapter,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `用户确认的章纲概要如下：\n\n${confirmedSynopsis}\n\n请基于此输出正式细纲。`
          }
        ],
        senderId: 'tool-formal-outline',
        maxTokens: 8192
      });
      if (formal) {
        await useBookStore.getState().setChapterOutline(book.id, targetChapterId, formal);
      }
      return {
        summary: formal ? `已写入正式细纲到「${targetTitle}」` : '正式细纲生成失败',
        data: { ok: Boolean(formal), formalOutline: formal, targetChapterId, targetTitle, totalTokens },
        evidence: [],
        artifacts: [{ type: 'write_result', data: { tool: 'formalize_chapter_outline', targetChapterId, ok: Boolean(formal) } }]
      };
    }
  });

  agentToolRegistry.register({
    name: 'review_draft',
    description:
      '写后自检：用编辑审稿 Skill 检查正文；硬问题时最多自动修订一次。只返回可落稿正文，不入章。',
    inputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'string' },
        outlineText: { type: 'string' },
        userInstruction: { type: 'string' },
        chapterId: { type: 'string' }
      },
      required: ['draft']
    },
    readOnly: true,
    async execute(input: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      const draft = text(input.draft);
      if (!draft || draft.length < 300) {
        return {
          summary: '正文过短，跳过自检',
          data: { ok: true, pass: true, revised: false, bodyText: draft, skipped: true },
          evidence: []
        };
      }
      const book = useBookStore.getState().books.find((b) => b.id === context.book.id) || context.book;
      const chapterId = text(input.chapterId) || context.currentChapter.id;
      const chapter = book.chapters.find((c) => c.id === chapterId) || context.currentChapter;
      const outlineText = text(input.outlineText);
      const userInstruction = text(input.userInstruction);

      const reviewUser = [
        `当前章节：${chapter.title || '当前章'}`,
        outlineText ? `【本章细纲】\n${outlineText}` : '',
        userInstruction ? `【用户指令】\n${userInstruction}` : '',
        `【待审正文】\n${draft}`,
        '请只输出 JSON。'
      ]
        .filter(Boolean)
        .join('\n\n');

      const reviewOut = await callChat({
        book,
        chapter,
        messages: [
          { role: 'system', content: buildEditorReviewSystemPrompt(book) },
          { role: 'user', content: reviewUser }
        ],
        senderId: 'tool-review-draft',
        maxTokens: 4096
      });

      let pass = true;
      let summary = '自检通过';
      let issues: Array<{ severity?: string; text?: string; fix?: string }> = [];
      try {
        const raw = reviewOut.text || '';
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
        const parsed = JSON.parse(jsonText);
        pass = Boolean(parsed?.pass);
        summary = text(parsed?.summary) || summary;
        issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
      } catch {
        // 解析失败：不挡稿，当作通过但记一笔
        pass = true;
        summary = '自检结果无法解析，已跳过修订';
      }

      const hardIssues = issues.filter((item) => String(item?.severity || '').toLowerCase() === 'hard');
      const needRevision = pass === false || hardIssues.length > 0;
      if (!needRevision) {
        return {
          summary,
          data: {
            ok: true,
            pass: true,
            revised: false,
            bodyText: draft,
            reviewSummary: summary,
            issues,
            totalTokens: reviewOut.totalTokens
          },
          evidence: []
        };
      }

      const revUser = [
        '请根据审稿意见修订正文。只输出修订后的小说正文，不要解释。',
        outlineText ? `【本章细纲】\n${outlineText}` : '',
        userInstruction ? `【用户指令】\n${userInstruction}` : '',
        `【审稿问题】\n${issues
          .map((x, i) => `${i + 1}. ${x.text || ''}${x.fix ? `；修法：${x.fix}` : ''}`)
          .join('\n')}`,
        `【原正文】\n${draft}`
      ]
        .filter(Boolean)
        .join('\n\n');

      const revisedOut = await callChat({
        book,
        chapter,
        messages: [
          { role: 'system', content: buildOutlineWritingSystemPrompt(book, chapter) },
          { role: 'user', content: revUser }
        ],
        senderId: 'tool-review-revise',
        maxTokens: 8192
      });
      const revisedText = normalizeChinesePunctuation(revisedOut.text || draft).trim() || draft;

      return {
        summary: `自检未过，已自动修订一次（${summary}）`,
        data: {
          ok: true,
          pass: false,
          revised: true,
          bodyText: revisedText,
          reviewSummary: summary || `已按 ${issues.length} 条意见修订`,
          issues,
          totalTokens: reviewOut.totalTokens + revisedOut.totalTokens
        },
        evidence: [],
        artifacts: [
          {
            type: 'write_result',
            data: { tool: 'review_draft', revised: true, chars: revisedText.length }
          }
        ]
      };
    }
  });
}
