// 模块说明：HTML 消毒与安全取文本工具（零外部依赖，运行在 Tauri webview / 浏览器环境）。
// 关键职责：
// - sanitizeHtml：基于白名单清洗富文本，供 dangerouslySetInnerHTML 使用，防止 XSS。
// - stripHtmlToText：安全地把 HTML 转为纯文本（用 DOMParser，绝不执行脚本 / 不加载远程资源）。
// 维护边界：
// - 渲染任何“不可信来源”的 HTML（AI 返回、抓取的第三方站点内容）前，必须先过 sanitizeHtml。
// - 需要从 HTML 里取纯文本时，一律用 stripHtmlToText，禁止再写 `el.innerHTML = x` 这种模式。
// - 若后续引入 DOMPurify，可在此文件内替换实现，调用方无需改动。

/** 允许保留的标签（其余标签会被“脱壳”：删标签保留其文字内容）。 */
const ALLOWED_TAGS = new Set([
 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'mark', 'small', 'sub', 'sup',
 'p', 'div', 'span', 'br', 'hr',
 'ul', 'ol', 'li',
 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
 'blockquote', 'code', 'pre',
 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

/** 每个标签允许保留的属性白名单。 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
 a: new Set(['href', 'title', 'target', 'rel']),
 '*': new Set(['style', 'class']),
};

/** 危险标签：直接连同内容一起丢弃。 */
const FORBIDDEN_TAGS = new Set([
 'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
 'form', 'input', 'button', 'textarea', 'select', 'option', 'noscript', 'template',
]);

const URL_ATTRS = new Set(['href', 'src', 'xlink:href']);

function isSafeUrl(value: string): boolean {
 const v = value.trim().toLowerCase();
 // 允许相对路径、锚点、http(s)、mailto、tel；拦截 javascript: / data: / vbscript: 等
 if (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:')) {
 return false;
 }
 return true;
}

function sanitizeStyle(style: string): string {
 // 拦截 style 里的 expression()、url(javascript:) 等注入向量
 const lowered = style.toLowerCase();
 if (lowered.includes('expression(') || lowered.includes('javascript:') || lowered.includes('vbscript:')) {
 return '';
 }
 return style;
}

function cleanElement(el: Element): void {
 const tag = el.tagName.toLowerCase();

 // 属性清洗：删除所有事件处理器与不在白名单内的属性
 for (const attr of Array.from(el.attributes)) {
 const name = attr.name.toLowerCase();
 const globalAllow = ALLOWED_ATTRS['*'];
 const tagAllow = ALLOWED_ATTRS[tag];
 const allowed = globalAllow.has(name) || (tagAllow ? tagAllow.has(name) : false);

 if (name.startsWith('on') || !allowed) {
 el.removeAttribute(attr.name);
 continue;
 }
 if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
 el.removeAttribute(attr.name);
 continue;
 }
 if (name === 'style') {
 const safe = sanitizeStyle(attr.value);
 if (safe) el.setAttribute('style', safe);
 else el.removeAttribute('style');
 }
 }

 // 外链统一补 rel，避免 tabnabbing
 if (tag === 'a' && el.getAttribute('target') === '_blank') {
 el.setAttribute('rel', 'noopener noreferrer');
 }
}

function walk(node: Node): void {
 const children = Array.from(node.childNodes);
 for (const child of children) {
 if (child.nodeType === Node.ELEMENT_NODE) {
 const el = child as Element;
 const tag = el.tagName.toLowerCase();

 if (FORBIDDEN_TAGS.has(tag)) {
 el.remove();
 continue;
 }

 if (!ALLOWED_TAGS.has(tag)) {
 // 非白名单标签：脱壳，保留其子节点文字
 while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
 el.remove();
 continue;
 }

 cleanElement(el);
 walk(el);
 } else if (child.nodeType === Node.COMMENT_NODE) {
 child.parentNode?.removeChild(child);
 }
 }
}

/**
 * 清洗一段 HTML，返回可安全用于 dangerouslySetInnerHTML 的字符串。
 * 非浏览器环境（无 DOMParser）下降级为纯文本转义，绝不返回可执行内容。
 */
export function sanitizeHtml(dirty: string): string {
 const input = String(dirty ?? '');
 if (!input) return '';
 if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
 return escapeText(input);
 }
 try {
 const doc = new DOMParser().parseFromString(input, 'text/html');
 walk(doc.body);
 return doc.body.innerHTML;
 } catch {
 return escapeText(input);
 }
}

/**
 * 把 HTML 安全转为纯文本。使用 DOMParser（不执行脚本、不触发 img/onerror 之类的资源加载），
 * 用于统计字数、提取上下文等场景，替代不安全的 `el.innerHTML = x; el.textContent`。
 */
export function stripHtmlToText(html: string): string {
 const input = String(html ?? '');
 if (!input) return '';
 if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
 return input.replace(/<[^>]+>/g, '');
 }
 try {
 return new DOMParser().parseFromString(input, 'text/html').body.textContent || '';
 } catch {
 return input.replace(/<[^>]+>/g, '');
 }
}

function escapeText(text: string): string {
 return text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#39;');
}
