import { describe, it, expect } from 'vitest';
import { resolveStyleForBook, buildStyleSystemMessage } from '../src/utils/styleResolver';
import { parseJsonLoosely } from '../src/utils/jsonParse';
import type { AppConfig } from '../src/types/ai';
import type { Book } from '../src/types';

// 批量生成流程的核心逻辑验证
// useBatchGenerate 是 React Hook，无法直接测试，但其内部的纯函数逻辑可以验证

describe('批量生成 — 上下文构建逻辑', () => {
  // 模拟 buildMemoryContext 的逻辑
  function buildMemoryContext(
    chapters: Array<{ id: string; title: string }>,
    currentIndex: number,
    memoryBank: Array<{ chapterId: string; summary?: string; plotAnalysis?: { plotSynopsis?: string } }>
  ): string {
    const startIdx = Math.max(0, currentIndex - 10);
    const prevChapters = chapters.slice(startIdx, currentIndex);
    if (prevChapters.length === 0) return '';
    const lines: string[] = ['【前文剧情档案】'];
    for (const ch of prevChapters) {
      const memory = memoryBank.find((m) => m.chapterId === ch.id);
      if (!memory) continue;
      const content = memory.plotAnalysis?.plotSynopsis || memory.summary || '';
      if (content) lines.push(`${ch.title}：${content}`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }

  it('前10章记忆正确组装', () => {
    const chapters = Array.from({ length: 15 }, (_, i) => ({ id: `ch${i}`, title: `第${i + 1}章` }));
    const memoryBank = [
      { chapterId: 'ch8', summary: '主角遇到危机' },
      { chapterId: 'ch9', summary: '获得新能力' },
    ];
    const result = buildMemoryContext(chapters, 11, memoryBank);
    expect(result).toContain('前文剧情档案');
    expect(result).toContain('主角遇到危机');
    expect(result).toContain('获得新能力');
  });

  it('当前是第一章 → 返回空', () => {
    const chapters = [{ id: 'ch0', title: '第1章' }];
    const result = buildMemoryContext(chapters, 0, []);
    expect(result).toBe('');
  });

  it('无记忆数据 → 返回空', () => {
    const chapters = Array.from({ length: 5 }, (_, i) => ({ id: `ch${i}`, title: `第${i + 1}章` }));
    const result = buildMemoryContext(chapters, 3, []);
    expect(result).toBe('');
  });

  it('plotSynopsis 优先于 summary', () => {
    const chapters = [{ id: 'ch0', title: '第1章' }, { id: 'ch1', title: '第2章' }];
    const memoryBank = [
      { chapterId: 'ch0', summary: '简要摘要', plotAnalysis: { plotSynopsis: '详细剧情' } },
    ];
    const result = buildMemoryContext(chapters, 1, memoryBank);
    expect(result).toContain('详细剧情');
    expect(result).not.toContain('简要摘要');
  });
});

describe('批量生成 — 风格消息构建', () => {
  it('有自定义风格 → 生成 system 消息', () => {
    const msg = buildStyleSystemMessage('', '用短句、快节奏写作');
    expect(msg).not.toBeNull();
    expect(msg!.content).toContain('用短句、快节奏写作');
  });

  it('无风格 → 返回 null', () => {
    const msg = buildStyleSystemMessage('', '');
    expect(msg).toBeNull();
  });
});

describe('批量生成 — 智能整理 JSON 解析', () => {
  it('正常解析智能整理结果', () => {
    const aiOutput = '```json\n{"plotSynopsis":"主角击败对手","characters":["林木","秦城"]}\n```';
    const result = parseJsonLoosely<{ plotSynopsis: string; characters: string[] }>(aiOutput);
    expect(result.plotSynopsis).toBe('主角击败对手');
    expect(result.characters).toContain('林木');
  });

  it('AI 输出带废话前缀也能解析', () => {
    const aiOutput = '好的，以下是整理结果：\n{"synopsis":"主角觉醒","openLoops":["神秘身世"]}';
    const result = parseJsonLoosely<{ synopsis: string; openLoops: string[] }>(aiOutput);
    expect(result.synopsis).toBe('主角觉醒');
    expect(result.openLoops).toContain('神秘身世');
  });
});


// ─── AI 角色提取开关 ─────────────────────────────────────────────────────

import { buildSmartOrganizeRules } from '../src/components/modals/memory-bank/memoryBankLogic';

describe('buildSmartOrganizeRules — AI角色提取开关', () => {
  it('默认包含 archiveRecords 字段', () => {
    const rules = buildSmartOrganizeRules();
    expect(rules).toContain('archiveRecords');
    expect(rules).toContain('character|item|skill|faction');
  });

  it('disableRoleExtract=true 时不包含 archiveRecords', () => {
    const rules = buildSmartOrganizeRules({ disableRoleExtract: true });
    expect(rules).not.toContain('archiveRecords');
    expect(rules).not.toContain('character|item|skill|faction');
  });

  it('disableRoleExtract=true 时仍包含核心字段', () => {
    const rules = buildSmartOrganizeRules({ disableRoleExtract: true });
    expect(rules).toContain('plotSynopsis');
    expect(rules).toContain('narrativeChain');
    expect(rules).toContain('keyNodes');
    expect(rules).toContain('agentOutline');
    expect(rules).toContain('acquisitions');
    expect(rules).toContain('alliances');
    expect(rules).toContain('relationProgress');
  });

  it('disableRoleExtract=false 等同默认行为', () => {
    const withFalse = buildSmartOrganizeRules({ disableRoleExtract: false });
    const withDefault = buildSmartOrganizeRules();
    expect(withFalse).toBe(withDefault);
  });
});
