import type { AgentTool, AgentToolContext, AgentToolName, AgentToolResult } from './types';

class AgentToolRegistry {
  private tools = new Map<AgentToolName, AgentTool<any, any>>();

  register<TInput, TOutput>(tool: AgentTool<TInput, TOutput>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: AgentToolName): AgentTool<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  listForMode(options?: { allowWrites?: boolean }): AgentTool[] {
    const allowWrites = Boolean(options?.allowWrites);
    return this.list().filter((tool) => tool.readOnly || allowWrites);
  }

  describeForModel(options?: {
    allowWrites?: boolean;
  }): Array<Pick<AgentTool, 'name' | 'description' | 'inputSchema' | 'readOnly'>> {
    return this.listForMode(options).map(({ name, description, inputSchema, readOnly }) => ({
      name,
      description,
      inputSchema,
      readOnly
    }));
  }

  async execute<TOutput = unknown>(
    name: AgentToolName,
    input: unknown,
    context: AgentToolContext
  ): Promise<AgentToolResult<TOutput>> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`未知 Agent 工具：${name}`);
    if (!tool.readOnly && !context.allowWrites) {
      throw new Error(`写工具 ${name} 仅在自主模式下可用`);
    }
    return (await tool.execute(input, context)) as AgentToolResult<TOutput>;
  }
}

export const agentToolRegistry = new AgentToolRegistry();
