import { describe, it, expect } from 'vitest';
import { convertAiTreeToOutlineNodes, convertAiTreeToSegmentNodes } from '../src/utils/ovConverter';

// ─── convertAiTreeToOutlineNodes ──────────────────────────────────────────────

describe('convertAiTreeToOutlineNodes', () => {
  it('从 root 节点的 children 转换', () => {
    const tree = {
      label: '全书',
      type: 'root',
      children: [
        { label: '第一幕', type: 'arc', desc: '开篇铺垫' },
        { label: '决战', type: 'event', desc: '高潮对决' },
      ],
    };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].title).toBe('第一幕');
    expect(nodes[0].type).toBe('arc');
    expect(nodes[0].conflict).toBe('开篇铺垫');
    expect(nodes[1].title).toBe('决战');
    expect(nodes[1].type).toBe('event');
  });

  it('非 root 节点直接包装为单元素数组', () => {
    const tree = { label: '事件', type: 'event', desc: '描述' };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe('事件');
  });

  it('递归转换 children', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [
        {
          label: '主线',
          type: 'arc',
          children: [
            { label: '子事件1', type: 'event' },
            { label: '子事件2', type: 'event' },
          ],
        },
      ],
    };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].children).toHaveLength(2);
    expect(nodes[0].children![0].title).toBe('子事件1');
  });

  it('空输入返回空数组', () => {
    expect(convertAiTreeToOutlineNodes(null)).toEqual([]);
    expect(convertAiTreeToOutlineNodes(undefined)).toEqual([]);
  });

  it('无 label 的节点使用默认标题', () => {
    const tree = { type: 'event', desc: '仅有描述' };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes[0].title).toBe('未命名剧情点');
  });

  it('每个节点都有 id 和必要字段', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [{ label: '事件', type: 'event' }],
    };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes[0].id).toBeTruthy();
    expect(nodes[0].targetWordCount).toBe(3000);
    expect(nodes[0].actualWordCount).toBe(0);
    expect(nodes[0].isAiGenerated).toBe(true);
  });

  it('type 映射正确', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [
        { label: 'A', type: 'arc' },
        { label: 'B', type: 'sub_plot' },
        { label: 'C', type: 'event' },
        { label: 'D', type: 'unknown_type' },
      ],
    };
    const nodes = convertAiTreeToOutlineNodes(tree);
    expect(nodes[0].type).toBe('arc');
    expect(nodes[1].type).toBe('sub_plot');
    expect(nodes[2].type).toBe('event');
    expect(nodes[3].type).toBe('event'); // 未知类型 fallback 到 event
  });
});

// ─── convertAiTreeToSegmentNodes ──────────────────────────────────────────────

describe('convertAiTreeToSegmentNodes', () => {
  it('有 event 子节点时生成分段节点', () => {
    const tree = {
      label: '全书',
      type: 'root',
      children: [
        { label: '事件1', type: 'event', desc: '第1-3章 开篇' },
        { label: '事件2', type: 'event', desc: '第4-6章 发展' },
        { label: '事件3', type: 'event', desc: '第7-10章 高潮' },
      ],
    };
    const nodes = convertAiTreeToSegmentNodes(tree, 10);
    expect(nodes.length).toBeGreaterThan(0);
    // 返回的是 arc 包裹的结构
    expect(nodes[0].type).toBe('arc');
    expect(nodes[0].children).toBeTruthy();
  });

  it('无 event 时回退到 convertAiTreeToOutlineNodes', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [
        { label: '主线', type: 'arc', desc: '整体弧线' },
      ],
    };
    // arc 节点没有叶子 event，collectAiPoints 返回空
    const nodes = convertAiTreeToSegmentNodes(tree, 0);
    // 回退到基本转换
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0].title).toBe('主线');
  });

  it('空输入返回空数组', () => {
    expect(convertAiTreeToSegmentNodes(null)).toEqual([]);
  });

  it('chapterCount=0 时从内容推断', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [
        { label: '事件A', type: 'event', desc: '第1-5章 铺垫' },
        { label: '事件B', type: 'event', desc: '第6-10章 推进' },
      ],
    };
    const nodes = convertAiTreeToSegmentNodes(tree, 0);
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('生成的分段节点有合理的 targetWordCount', () => {
    const tree = {
      label: '根',
      type: 'root',
      children: [
        { label: '事件1', type: 'event', desc: '第1-4章内容' },
        { label: '事件2', type: 'event', desc: '第5-8章内容' },
      ],
    };
    const nodes = convertAiTreeToSegmentNodes(tree, 8);
    const allChildren = nodes.flatMap(arc => arc.children ?? []).flatMap(cat => cat.children ?? []);
    for (const node of allChildren) {
      expect(node.targetWordCount).toBeGreaterThan(0);
    }
  });
});
