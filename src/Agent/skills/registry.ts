// 模块说明：Agent 技能注册表。
// 仿 agentToolRegistry：技能变成可枚举、可索引、可加载的注册项。
// unified loop 把技能索引注入 system prompt，模型遇到对应场景先 load_skill 加载全文再执行。
// load 接收当前书上下文，让 review 技能能按书 genre 加载、writing/story_canon 能按书构建。

import type { Book, Chapter } from '../../types';
import type { AppConfig } from '../../types/ai';

export interface AgentSkillContext {
  book: Book;
  chapter?: Chapter | null;
  config?: AppConfig | null;
}

export interface AgentSkill {
  id: string;
  name: string;
  /** 触发描述（注入索引用，一句话说清"何时用"） */
  description: string;
  category?: 'writing' | 'review' | 'reference';
  /** 用户确认后动态生成的技能 */
  dynamic?: boolean;
  /** 返回技能全文 */
  load: (ctx: AgentSkillContext) => Promise<string> | string;
}

class AgentSkillRegistry {
  private skills = new Map<string, AgentSkill>();

  register(skill: AgentSkill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): AgentSkill | undefined {
    return this.skills.get(id);
  }

  list(): AgentSkill[] {
    return Array.from(this.skills.values());
  }

  /** 渲染成"name — description"索引行，供 buildSystemPrompt 注入（动态技能带「用户技能」标记） */
  indexLines(): string[] {
    return this.list().map((skill) =>
      `${skill.name} — ${skill.description}${skill.dynamic ? '（用户技能）' : ''}`
    );
  }
}

export const agentSkillRegistry = new AgentSkillRegistry();
