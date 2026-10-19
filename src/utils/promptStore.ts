// 模块说明：Prompt 加载层（前端唯一取词入口）。
// 架构定位：按 id 从 Rust 端解密后的本地提示词注册表取词，向上传提供统一的取词能力。
// 关键职责：
// 1) 通过 Tauri IPC 调 get_encrypted_prompt，拿到明文提示词。
// 2) 内存缓存 + 同步快照 + 批量预热，避免重复 IPC 往返。
// 安全说明：本地 XOR 只是防 strings 直读，并非真正加密；源码里带密文和密钥，
// 意味着这套提示词对本仓库读者是明文可读的资产，定位就是「可自用的本地词库」。

/**
 * 基底文风指令：注入到所有系统内置 system prompt，约束文本表达。
 * 具体而非抽象、删冗余含蓄、能一句说清绝不用两句。
 */
export const BASE_PROSE_DIRECTIVE =
  '\n\n【文风硬约束（最高优先级，适用于所有输出文本）】\n' +
  '始终采用具体、直接的叙述；删除同义反复、解释性补充、空泛感叹、过度修饰，' +
  '以及“不是……而是……”等刻意句式；能一句说清绝不用两句。';

/** 把基底文风指令追加到已有 system prompt 末尾 */
export function withBaseProse(prompt: string): string {
  if (!prompt) return prompt;
  if (String(prompt).includes('【文风硬约束（最高优先级，适用于所有输出文本）】')) return prompt;
  return prompt + BASE_PROSE_DIRECTIVE;
}

// 运行环境判断——是否处于 Tauri 桌面壳内（决定能否走本地 IPC 解密来源）。
const inTauri = Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

// 进程内缓存（id -> 明文提示词）。
const cache = new Map<string, string>();

// 本地来源：通过 Tauri IPC 调 Rust 端 get_encrypted_prompt（内部解密后返回明文）。
async function fetchLocalPrompt(id: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('get_encrypted_prompt', { id });
}

// 统一取词：命中缓存直接返回；纯浏览器 dev 无 IPC 时返回占位符，保持开发期可跑。
export async function getPrompt(id: string): Promise<string> {
  if (cache.has(id)) return cache.get(id)!;
  if (!inTauri) return `[DEV] prompt:${id}`;
  let text: string | null = null;
  try {
    text = await fetchLocalPrompt(id);
  } catch (err) {
    console.warn('[promptStore] local prompt lookup failed:', err);
  }
  if (text == null) text = `[DEV] prompt:${id}`;
  cache.set(id, text);
  return text;
}

// 同步快照：给必须同步取词的调用点用；命中缓存返回真值，否则触发异步预热并先返回 fallback。
export function getPromptSync(id: string, fallback = ''): string {
  if (cache.has(id)) return cache.get(id)!;
  void getPrompt(id);
  return fallback;
}

// 批量预热：应用启动时并发拉取常用提示词，降低首个 AI 动作的等待。
export async function preloadPrompts(): Promise<void> {
  const ids = [
    'smart_organize_system',
    'continuation_system',
    'rewrite_system',
    'diff_analysis_system',
    'inline_suggestion_system',
    'agent_chat_system',
    'agent_writing_system',
    'outline_board_system',
    'full_rewrite_system',
    'full_review_strong',
  ];
  await Promise.all(ids.map((id) => getPrompt(id)));
}
