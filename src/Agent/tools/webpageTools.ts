// 模块说明：Agent 看章节工具（C 组 P2-C2/C3/C4）。
// 职责：
//   - open_webpage(url)：用 Agent 独立隐藏 webview 打开页面（P2-C1 已建）
//   - extract_page_text(selector?)：execute_js 提取正文；失败 fallback read_url（reqwest）
//   - 反爬边界：空/乱码/验证码页 → 返回「该站反爬无法读取」，不硬闯、不重试
// 铁律：只做笔趣阁系等公开低反爬站；番茄/起点遇到直接返回「无法读取」。

import { listen as tauriListen } from '@tauri-apps/api/event';
import { electronAPI } from '../../utils/electron';
import { agentToolRegistry } from './registry';
import type { AgentToolContext, AgentToolResult } from './types';

function text(value: unknown): string {
  return String(value || '').trim();
}

/**
 * 在 Agent 独立 webview 里执行 JS 并拿回真实结果（P2-C1 回传通道）。
 * execute_js 命令只返回「已派发」；真实结果走全局 'novel-browser:exec-response' 事件异步回来。
 * 这里监听一次事件 + requestId 匹配 + 超时，参照 BrowserPanel.execJsInChild。
 */
function execJsInAgentWebview<T = unknown>(code: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `agent-web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unlisten: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (unlisten) unlisten();
      reject(new Error('execJsInAgentWebview 超时'));
    }, timeoutMs);

    tauriListen<{ requestId: string; success: boolean; result?: T; error?: string }>(
      'novel-browser:exec-response',
      (e) => {
        if (e.payload.requestId !== requestId) return;
        clearTimeout(timer);
        if (unlisten) unlisten();
        if (e.payload.success) {
          resolve(e.payload.result as T);
        } else {
          reject(new Error(e.payload.error || 'exec failed'));
        }
      }
    )
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });

    void electronAPI.ai
      .agentBrowserExecuteJs(code, requestId)
      .catch((err: unknown) => {
        clearTimeout(timer);
        if (unlisten) unlisten();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/** 反爬乱码特征：私用区字符（U+E000-U+F8FF）占比高 → 字体加密（番茄类） */
export function isLikelyEncryptedGarbled(content: string): boolean {
  const s = String(content || '');
  if (s.length < 20) return false;
  let privateUse = 0;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= 0xe000 && code <= 0xf8ff) privateUse += 1;
  }
  return privateUse / s.length > 0.05;
}

/** 反爬边界：内容是否可接受（长度足够 + 非乱码 + 非验证码页） */
export function isReadableChapterText(content: string): boolean {
  const s = String(content || '').trim();
  if (s.length < 100) return false; // 正文过短 → 失败
  if (isLikelyEncryptedGarbled(s)) return false;
  if (/验证码|安全检测|请输入验证码|滑动验证/.test(s)) return false;
  return true;
}

/** 提取正文的 JS 策略：常见正文容器命中即取，截断到 limit 字 */
export function buildExtractScript(selector?: string, limit = 5000): string {
  const selectors = text(selector) || '#chaptercontent,#content,.content,article';
  return `(() => {
    const limit = ${limit};
    const sels = ${JSON.stringify(selectors)}.split(',').map(s => s.trim()).filter(Boolean);
    let node = null;
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el) { node = el; break; }
      } catch (e) {}
    }
    if (!node) return { ok: false, error: 'no_match', length: 0, text: '' };
    const t = (node.innerText || node.textContent || '').trim();
    return { ok: true, length: t.length, text: t.slice(0, limit) };
  })()`;
}

/** 静态站 fallback：reqwest 抓 HTML，剥标签取正文 */
async function fetchStaticText(url: string): Promise<string> {
  const html = await electronAPI.ai.httpFetch(url);
  if (!html) return '';
  // 去掉 script/style 后剥标签
  const cleaned = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

/**
 * 统一看章节入口：open_webpage + extract_page_text 的合体执行。
 * 先独立 webview 打开 → execute_js 提取；失败 fallback read_url 静态抓取。
 */
export async function readChapterFromUrl(
  url: string,
  selector?: string
): Promise<{ ok: boolean; text: string; source: 'webview' | 'static' | 'unreadable'; error?: string }> {
  if (!url) return { ok: false, text: '', source: 'unreadable', error: '缺少 url' };

  // 路径 1：独立 webview（JS 渲染站）—— execute_js 结果走全局事件回传，真实等待返回
  try {
    await electronAPI.ai.agentBrowserOpen(url);
    // 等待渲染
    await new Promise((r) => setTimeout(r, 2500));
    const result = await execJsInAgentWebview<{ ok: boolean; error?: string; length: number; text: string }>(
      buildExtractScript(selector)
    );
    const extracted = result?.text || '';
    if (isReadableChapterText(extracted)) {
      return { ok: true, text: extracted.slice(0, 5000), source: 'webview' };
    }
    // webview 提取成功但内容不达标 → 落到静态路径
  } catch {
    /* webview 不可用/超时 → 走静态 */
  }

  // 路径 2：静态站 reqwest（更快更省，文本仍可能够）
  try {
    const staticText = await fetchStaticText(url);
    if (isReadableChapterText(staticText)) {
      return { ok: true, text: staticText.slice(0, 5000), source: 'static' };
    }
  } catch {
    /* ignore */
  }

  return { ok: false, text: '', source: 'unreadable', error: '该站反爬无法读取' };
}

export function registerWebpageAgentTools(): void {
  agentToolRegistry.register({
    name: 'open_webpage',
    description:
      '在 Agent 独立隐藏浏览器中打开指定网页（笔趣阁系等公开低反爬小说站）。同题材研究读章节前先调用。番茄/起点等反爬站会失败。',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: '要打开的网址' } }, required: ['url'] },
    readOnly: true,
    async execute(input: Record<string, unknown>, _context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      const url = text(input.url);
      if (!url) return { summary: '缺少 url', data: { ok: false }, evidence: [] };
      try {
        await electronAPI.ai.agentBrowserOpen(url);
        return { summary: `已打开 ${url}`, data: { ok: true, url }, evidence: [] };
      } catch (e: any) {
        return { summary: `打开失败：${e?.message || String(e)}`, data: { ok: false, url }, evidence: [] };
      }
    }
  });

  agentToolRegistry.register({
    name: 'extract_page_text',
    description:
      '从当前打开的网页提取正文（默认常见容器 #chaptercontent/#content/.content/article）。返回干净正文或「该站反爬无法读取」。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '（可选）目标 URL；缺省用当前已打开页面' },
        selector: { type: 'string', description: '（可选）自定义正文选择器，逗号分隔' }
      }
    },
    readOnly: true,
    async execute(input: Record<string, unknown>, _context: AgentToolContext): Promise<AgentToolResult<Record<string, unknown>>> {
      const url = text(input.url);
      const selector = text(input.selector);
      const result = await readChapterFromUrl(url, selector);
      if (!result.ok) {
        return { summary: result.error || '该站反爬无法读取', data: { ok: false, source: result.source }, evidence: [] };
      }
      return {
        summary: `已提取正文（${result.text.length} 字，来源 ${result.source}）`,
        data: { ok: true, content: result.text, source: result.source, length: result.text.length },
        evidence: []
      };
    }
  });
}
