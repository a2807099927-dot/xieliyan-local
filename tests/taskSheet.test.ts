import { describe, it, expect } from 'vitest';
import {
  createAgentTaskSheet,
  parsePlanningResult,
  mergePlanningResultToTaskSheet,
} from '../src/Agent/taskSheet';
import type { AgentTaskInput } from '../src/Agent/taskSheet';

// ─── createAgentTaskSheet ─────────────────────────────────────────────────────

describe('createAgentTaskSheet', () => {
  it('从基本输入创建任务清单', () => {
    const input: AgentTaskInput = {
      genre: 'dushi',
      userInstruction: '写一段主角逆袭的情节',
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.version).toBe('1.0');
    expect(sheet.primaryGenre).toBe('urban');
    expect(sheet.userInstruction).toBe('写一段主角逆袭的情节');
    expect(sheet.plotIntent).toBeTruthy();
  });

  it('userInstruction 为空时 plotIntent 使用 fallback', () => {
    const input: AgentTaskInput = { genre: 'dushi', userInstruction: '' };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.plotIntent).toBe('根据当前上下文完成本次写作任务。');
  });

  it('显式 plotIntent 优先于推断', () => {
    const input: AgentTaskInput = {
      genre: 'dushi',
      userInstruction: '随便写',
      plotIntent: '主角觉醒',
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.plotIntent).toBe('主角觉醒');
  });

  it('从 userInstruction 中自动提取引用章节', () => {
    const input: AgentTaskInput = {
      genre: 'xuanhuan',
      userInstruction: '参考第3章和第10章的剧情',
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.referenceChapters).toContain('第3章');
    expect(sheet.referenceChapters).toContain('第10章');
  });

  it('显式 referenceChapters 与推断合并去重', () => {
    const input: AgentTaskInput = {
      genre: 'xuanhuan',
      userInstruction: '参考第3章',
      referenceChapters: ['第3章', '第5章'],
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.referenceChapters).toContain('第3章');
    expect(sheet.referenceChapters).toContain('第5章');
    // 第3章不会重复
    expect(sheet.referenceChapters.filter(r => r === '第3章')).toHaveLength(1);
  });

  it('字符串类型的 tone 被拆分为数组', () => {
    const input: AgentTaskInput = {
      genre: 'dushi',
      userInstruction: '写',
      tone: '紧张，刺激！悬疑' as any,
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.tone.length).toBeGreaterThanOrEqual(2);
  });

  it('数组类型的 tone 正常传递', () => {
    const input: AgentTaskInput = {
      genre: 'dushi',
      userInstruction: '写',
      tone: ['紧张', '悬疑'],
    };
    const sheet = createAgentTaskSheet(input);
    expect(sheet.tone).toEqual(['紧张', '悬疑']);
  });
});

// ─── parsePlanningResult ──────────────────────────────────────────────────────

describe('parsePlanningResult', () => {
  it('解析标准 JSON', () => {
    const raw = JSON.stringify({
      intent: '主角在宗门大比中获胜',
      tone: ['热血', '燃'],
      requiredBeats: ['压制', '爆发', '震惊'],
    });
    const result = parsePlanningResult(raw);
    expect(result.ok).toBe(true);
    expect(result.planning?.intent).toBe('主角在宗门大比中获胜');
    expect(result.planning?.tone).toEqual(['热血', '燃']);
    expect(result.planning?.requiredBeats).toHaveLength(3);
  });

  it('解析 ```json 包裹的内容', () => {
    const raw = '```json\n{"intent": "测试意图", "tone": ["搞笑"]}\n```';
    const result = parsePlanningResult(raw);
    expect(result.ok).toBe(true);
    expect(result.planning?.intent).toBe('测试意图');
  });

  it('空字符串返回 EMPTY_PLANNING_RESPONSE', () => {
    const result = parsePlanningResult('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('EMPTY_PLANNING_RESPONSE');
  });

  it('全部字段为空返回 PLANNING_FIELDS_EMPTY', () => {
    const raw = JSON.stringify({ intent: '', tone: [], emotionArc: [] });
    const result = parsePlanningResult(raw);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PLANNING_FIELDS_EMPTY');
  });

  it('无效 JSON 返回解析错误', () => {
    const result = parsePlanningResult('这不是JSON内容');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ─── mergePlanningResultToTaskSheet ───────────────────────────────────────────

describe('mergePlanningResultToTaskSheet', () => {
  const baseSheet = createAgentTaskSheet({
    genre: 'dushi',
    userInstruction: '写一段',
    tone: ['紧张'],
    requiredBeats: ['爆发'],
  });

  it('planning 为 null 时返回原 sheet', () => {
    const result = mergePlanningResultToTaskSheet(baseSheet, null);
    expect(result).toEqual(baseSheet);
  });

  it('合并 planning 的 tone 到 sheet（去重）', () => {
    const planning = { tone: ['紧张', '刺激'], intent: '新意图' };
    const result = mergePlanningResultToTaskSheet(baseSheet, planning);
    expect(result.tone).toContain('紧张');
    expect(result.tone).toContain('刺激');
    // 紧张不重复
    expect(result.tone.filter(t => t === '紧张')).toHaveLength(1);
  });

  it('planning 有 intent 时覆盖 plotIntent', () => {
    const planning = { intent: 'AI 规划意图' };
    const result = mergePlanningResultToTaskSheet(baseSheet, planning);
    expect(result.plotIntent).toBe('AI 规划意图');
  });

  it('planning 无 intent 时保留原 plotIntent', () => {
    const planning = { tone: ['新基调'] };
    const result = mergePlanningResultToTaskSheet(baseSheet, planning);
    expect(result.plotIntent).toBe(baseSheet.plotIntent);
  });
});
