import { describe, expect, it } from 'vitest';
import { splitAgentOutput } from '../stripAgentOutput';

describe('splitAgentOutput hasBody 语义', () => {
  it('思考+正文：hasBody=true，body 为正文', () => {
    const raw = `用户让我写第一章的正文，我需要先分析承接点，然后构建场景。
根据细纲，第一章主角应该在山崖上醒来。
「林尘缓缓睁开眼，山风灌入衣袍。他低头看着自己陌生的手掌，心中一片茫然。」
他挣扎着坐起，环顾四周，这里根本不是他的房间。`;
    const s = splitAgentOutput(raw);
    expect(s.hasBody).toBe(true);
    expect(s.body).toContain('林尘缓缓睁开眼');
    expect(s.body).not.toContain('我需要先分析');
  });

  it('纯思考过程（无正文）：hasBody=false，body 为空', () => {
    const raw = `用户让我续写这一章，我需要先看看前文设定。
根据用户指令，这一章要推进主线剧情，我要设计好冲突节奏。
我觉得开头应该先描写主角的心理活动，然后再引入反派。`;
    const s = splitAgentOutput(raw);
    expect(s.hasBody).toBe(false);
    expect(s.body).toBe('');
    expect(s.thinking).toContain('我需要先看看');
  });

  it('正文夹在两句思考之间：hasBody=true', () => {
    const raw = `好的，我先想一下怎么写。这一章主角应该打败对手。
「林尘眼神一凝，剑锋直取对方面门。」
打斗结束，我接下来要安排章末钩子。`;
    const s = splitAgentOutput(raw);
    expect(s.hasBody).toBe(true);
    expect(s.body).toContain('林尘眼神一凝');
  });

  it('空输入：hasBody=false', () => {
    const s = splitAgentOutput('');
    expect(s.hasBody).toBe(false);
  });
});
