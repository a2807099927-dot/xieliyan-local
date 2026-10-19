import { describe, it, expect } from 'vitest';
import { stripPreAmble, normalizeChinesePunctuation } from '../src/Agent/useAgentSession';
import { normalizeEscapedNewlines, normalizeNovelOutput, formatAsNovelText } from '../src/utils/editor/text';
import { normalizeAiErrorMessage, toSafeParagraphNodes } from '../src/utils/editorUtils';

// ─── stripPreAmble — AI 输出废话过滤 ─────────────────────────────────────────

describe('stripPreAmble — 过滤 AI 分析废话', () => {
  it('纯正文 → 原样返回', () => {
    const text = '林木走进了大厅，四周的目光齐刷刷看过来。';
    expect(stripPreAmble(text)).toBe(text);
  });

  it('有章节标记 → 从标记处开始', () => {
    const text = '好的，我来写这一章。\n根据用户要求，本章需要展现主角实力。\n\n## 第一章 初入江湖\n\n林木走进了大厅。';
    const result = stripPreAmble(text);
    expect(result).toContain('第一章 初入江湖');
    expect(result).toContain('林木走进了大厅');
    expect(result).not.toContain('好的');
  });

  it('模型自述计划 → 过滤掉', () => {
    const text = '好的，我将根据细纲开始创作。\n预计生成3000字左右。\n\n林木站在山顶，俯瞰整个城市。';
    const result = stripPreAmble(text);
    expect(result).toBe('林木站在山顶，俯瞰整个城市。');
  });

  it('分析性开头 → 过滤', () => {
    const text = '根据用户的指令和法则要求，我需要写一段战斗场景。\n首先，我分析一下当前的剧情走向。\n\n"来吧！"林木拔出长剑。';
    const result = stripPreAmble(text);
    expect(result).toBe('"来吧！"林木拔出长剑。');
  });

  it('空字符串 → 原样返回', () => {
    expect(stripPreAmble('')).toBe('');
    expect(stripPreAmble('   ')).toBe('   ');
  });

  it('全是正文没有废话 → 不裁剪', () => {
    const text = '"你是谁？"少女警惕地问道。\n\n"路过的旅人。"林木微微一笑。';
    expect(stripPreAmble(text)).toBe(text);
  });
});

// ─── normalizeChinesePunctuation — 标点修正 ─────────────────────────────────

describe('normalizeChinesePunctuation — 英文标点转中文', () => {
  it('英文双引号 → 中文双引号', () => {
    const result = normalizeChinesePunctuation('"你好"');
    expect(result).toBe('\u201c你好\u201d');
  });

  it('英文单引号 → 中文单引号', () => {
    const result = normalizeChinesePunctuation("'测试'");
    expect(result).toBe('\u2018测试\u2019');
  });

  it('英文省略号 → 中文省略号', () => {
    const result = normalizeChinesePunctuation('他说...');
    expect(result).toBe('他说\u2026\u2026');
  });

  it('双连字符 → 逗号', () => {
    const result = normalizeChinesePunctuation('他走了--没有回头');
    expect(result).toBe('他走了，没有回头');
  });

  it('空字符串 → 原样', () => {
    expect(normalizeChinesePunctuation('')).toBe('');
  });
});

// ─── normalizeAiErrorMessage — 错误消息友好化 ────────────────────────────────

describe('normalizeAiErrorMessage — AI 错误消息', () => {
  it('REQUEST_IN_PROGRESS → 友好提示', () => {
    const result = normalizeAiErrorMessage(new Error('REQUEST_IN_PROGRESS'));
    expect(result).toContain('请稍后再试');
  });

  it('abort → 请求已取消', () => {
    const result = normalizeAiErrorMessage(new Error('REQUEST_ABORTED'));
    expect(result).toContain('已取消');
  });

  it('普通错误 → 原样返回', () => {
    const result = normalizeAiErrorMessage(new Error('网络超时'));
    expect(result).toBe('网络超时');
  });

  it('非 Error 对象 → 转字符串', () => {
    const result = normalizeAiErrorMessage('字符串错误');
    expect(result).toBe('字符串错误');
  });
});

// ─── toSafeParagraphNodes — 编辑器段落节点构建 ───────────────────────────────

describe('toSafeParagraphNodes — 段落节点', () => {
  it('多行文本 → 多个段落节点', () => {
    const nodes = toSafeParagraphNodes('第一段\n第二段\n第三段');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '第一段' }] });
    expect(nodes[2]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '第三段' }] });
  });

  it('空行 → 空段落节点', () => {
    const nodes = toSafeParagraphNodes('段落一\n\n段落二');
    expect(nodes).toHaveLength(3);
    expect(nodes[1]).toEqual({ type: 'paragraph' });
  });

  it('CRLF → 正确分割', () => {
    const nodes = toSafeParagraphNodes('行一\r\n行二');
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '行一' }] });
  });

  it('单行 → 单个节点', () => {
    const nodes = toSafeParagraphNodes('只有一行');
    expect(nodes).toHaveLength(1);
  });
});

// ─── 编辑器文本工具综合 ─────────────────────────────────────────────────────

describe('编辑器文本工具 — 综合场景', () => {
  it('AI 输出完整处理链：转义换行 → HTML清洗 → 格式化', () => {
    const aiOutput = '<p>第一段内容\\n继续</p><br/><p>第二段</p>';
    const step1 = normalizeNovelOutput(aiOutput);
    expect(step1).toContain('第一段内容');
    expect(step1).toContain('第二段');
    expect(step1).not.toContain('<p>');
    expect(step1).not.toContain('<br');
  });

  it('续写结果分段 → 段落节点 → 可插入编辑器', () => {
    const text = '林木抬起头。\n\n"你来了。"老者微笑道。\n\n林木点了点头。';
    const nodes = toSafeParagraphNodes(text);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    // 有内容的节点
    const withContent = nodes.filter(n => n.content);
    expect(withContent.length).toBe(3);
  });
});
