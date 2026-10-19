// 模块说明：webview 内注入的脚本，给用户提供"选中文字 → 右键 → 转入写梨眼"的能力。
// 关键职责：
// 1. 监听 contextmenu 事件，弹出自定义菜单
// 2. 用户选哪个动作 → 把当前选中文字 + 动作 ID 通过 console.log 投递回宿主
// 3. 宿主（AiWebPanel）监听 console-message 拿到 payload，触发对应模态框
// 4. 暴露 window.__xlyAiWebFillInput(text) 供宿主 executeJavaScript 调用，把整段小说塞进输入框
// 注意：注入到网页上下文运行，不能 import 任何模块，必须自包含。

export const AIWEB_EVENT_PREFIX = '__XLY_AIWEB_EVENT__';

export type AiWebActionId = 'role' | 'outline' | 'chapter' | 'note';

export interface AiWebPayload {
 action: AiWebActionId;
 text: string;
}

export function buildAiWebInjectionScript(): string {
 // 改一下版本号就能让 webview 内的旧脚本失效、强制重新注入
 const SCRIPT_VERSION = 'v6';
 return `
(() => {
 // 同版本已注入则跳过；版本不同则继续覆盖
 if (window.__xlyAiWebInjected === ${JSON.stringify(SCRIPT_VERSION)}) return;
 window.__xlyAiWebInjected = ${JSON.stringify(SCRIPT_VERSION)};
 // 卸载老脚本可能留下的 DOM 残留
 try {
 const stale = document.querySelectorAll('[data-xly-menu]');
 stale.forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
 } catch (err) { /* ignore */ }

 const PREFIX = ${JSON.stringify(AIWEB_EVENT_PREFIX)};

 // 菜单项
 const ITEMS = [
 { id: 'role', label: '创建角色卡', desc: '导入到角色档案库' },
 { id: 'outline', label: '导入到本章大纲', desc: '替换/追加当前章节大纲' },
 { id: 'chapter', label: '创建剧情章节', desc: '识别多章并创建' },
 { id: 'note', label: '转入正文', desc: '插入到当前光标位置' },
 ];

 function getSelectedText() {
 const sel = window.getSelection && window.getSelection();
 if (!sel || sel.rangeCount === 0) return '';
 return cleanText(String(sel.toString() || ''));
 }

 // 清洗 webview 选中文字：去掉不可见字符、bullet 符号、过多空白
 function cleanText(raw) {
 if (!raw) return '';
 return String(raw)
 // 删除零宽/BOM/方向控制等不可见字符
 .replace(/[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]/g, '')
 // 全角空格、不间断空格转普通空格
 .replace(/[\\u3000\\u00A0]/g, ' ')
 // 行尾空白裁剪 + 行首列表符号清理（• - * · ▪）
 .split('\\n')
 .map(function (line) {
 return line.replace(/[\\t ]+$/g, '').replace(/^[\\t ]*[•·▪◦‣⁃\\-\\*]\\s+/, '');
 })
 .join('\\n')
 // 行内多空格压成一个
 .replace(/[ \\t]{2,}/g, ' ')
 // 3 个以上换行压成 2 个（最多保留一空行）
 .replace(/\\n{3,}/g, '\\n\\n')
 // 整段首尾裁剪
 .replace(/^\\s+|\\s+$/g, '');
 }

 function postPayload(action, text) {
 const payload = { action: action, text: text };
 try {
 console.log(PREFIX + JSON.stringify(payload));
 } catch (err) {
 console.error('[xly-aiweb] post failed', err);
 }
 try {
 const urlTauri = 'aiweb-bridge://localhost/web-action?p=' + encodeURIComponent(JSON.stringify(payload));
 if (navigator.sendBeacon) {
 navigator.sendBeacon(urlTauri);
 } else {
 fetch(urlTauri, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(function () {});
 }
 } catch (err) { /* ignore */ }
 try {
 const urlLegacy = 'http://aiweb-bridge.localhost/web-action?p=' + encodeURIComponent(JSON.stringify(payload));
 if (navigator.sendBeacon) {
 navigator.sendBeacon(urlLegacy);
 } else {
 fetch(urlLegacy, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(function () {});
 }
 } catch (err) {
 try {
 const img = new Image();
 img.src = 'http://aiweb-bridge.localhost/web-action?p=' + encodeURIComponent(JSON.stringify(payload)) + '&t=' + Date.now();
 } catch (e) { /* ignore */ }
 }
 }

 let menuEl = null;

 function closeMenu() {
 if (menuEl && menuEl.parentNode) {
 menuEl.parentNode.removeChild(menuEl);
 }
 menuEl = null;
 }

 function showMenu(x, y, selectedText) {
 closeMenu();
 menuEl = document.createElement('div');
 menuEl.setAttribute('data-xly-menu', '1');
 menuEl.style.cssText = [
 'position:fixed',
 'left:' + x + 'px',
 'top:' + y + 'px',
 'z-index:2147483647',
 'min-width:200px',
 'padding:4px',
 'background:rgba(12,14,20,0.96)',
 'border:1px solid rgba(255,255,255,0.16)',
 'box-shadow:0 12px 32px rgba(0,0,0,0.6)',
 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
 'font-size:13px',
 'color:rgba(248,250,252,0.94)',
 'user-select:none',
 ].join(';');

 // 顶部信息条
 const header = document.createElement('div');
 header.style.cssText = 'padding:6px 10px;font-size:10px;color:rgba(148,163,184,0.55);border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:2px;';
 const wordCount = selectedText.length;
 header.textContent = '已选中 ' + wordCount + ' 字 · 写梨眼';
 menuEl.appendChild(header);

 ITEMS.forEach(function (item) {
 const btn = document.createElement('button');
 btn.type = 'button';
 btn.style.cssText = [
 'display:block',
 'width:100%',
 'padding:8px 12px',
 'background:none',
 'border:none',
 'cursor:pointer',
 'text-align:left',
 'color:rgba(248,250,252,0.94)',
 'font-family:inherit',
 'line-height:1.3',
 'font-size:13px',
 'font-weight:600',
 ].join(';');
 btn.textContent = item.label;
 btn.addEventListener('mouseenter', function () { btn.style.background = 'rgba(255,255,255,0.06)'; });
 btn.addEventListener('mouseleave', function () { btn.style.background = 'none'; });
 btn.addEventListener('click', function (e) {
 e.preventDefault();
 e.stopPropagation();
 postPayload(item.id, selectedText);
 closeMenu();
 });
 menuEl.appendChild(btn);
 });

 document.body.appendChild(menuEl);

 // 自适应位置：贴近右边/下边超出时左/上偏移
 const rect = menuEl.getBoundingClientRect();
 const vw = window.innerWidth;
 const vh = window.innerHeight;
 if (rect.right > vw - 8) {
 menuEl.style.left = Math.max(8, vw - rect.width - 8) + 'px';
 }
 if (rect.bottom > vh - 8) {
 menuEl.style.top = Math.max(8, vh - rect.height - 8) + 'px';
 }
 }

 document.addEventListener('contextmenu', (e) => {
 const text = getSelectedText();
 if (!text) {
 // 没选中文字，不拦截 → 让网页/系统右键正常出
 return;
 }
 e.preventDefault();
 e.stopPropagation();
 showMenu(e.clientX, e.clientY, text);
 }, true);

 // 任意点击/滚动/按键关菜单
 document.addEventListener('mousedown', (e) => {
 if (menuEl && !menuEl.contains(e.target)) closeMenu();
 }, true);
 document.addEventListener('scroll', closeMenu, true);
 document.addEventListener('keydown', (e) => {
 if (e.key === 'Escape') closeMenu();
 }, true);
 window.addEventListener('blur', closeMenu);

 // ============================================================
 // 暴露给宿主调用：把整段文字塞给当前站点（优先走文件附件上传，避免大文本卡死输入框）
 // 宿主用法：webview.executeJavaScript('window.__xlyAiWebFillInput(' + JSON.stringify(text) + ', ' + JSON.stringify(filename) + ')')
 // 返回 'file' / 'text' / 'fail'
 // ============================================================
 function findFileInput() {
 // 找当前可见或隐藏的 file input（多个站点把它藏在主输入区附近）
 const all = document.querySelectorAll('input[type="file"]');
 for (let i = 0; i < all.length; i++) {
 const el = all[i];
 const accept = (el.getAttribute('accept') || '').toLowerCase();
 // 接受 .txt / 文本类型 / 通配，或没限制的
 if (!accept || accept.indexOf('text') >= 0 || accept.indexOf('.txt') >= 0 || accept.indexOf('*') >= 0 || accept.indexOf('plain') >= 0) {
 return el;
 }
 }
 return all.length > 0 ? all[0] : null;
 }

 // AI Studio / Gemini 需要先点击附件按钮才会出现 file input
 // 模拟点击附件按钮，然后再找 file input
 function tryClickAttachButton() {
 const host = location.hostname;
 let selectors = [];
 if (host.indexOf('aistudio.google.com') >= 0) {
 // AI Studio: "+" 按钮在输入框左边
 selectors = [
 'button[aria-label*="Insert"]',
 'button[aria-label*="attach" i]',
 'button[aria-label*="Add" i]',
 'button[mattooltip*="Insert"]',
 'mat-icon[fonticon="add"]',
 'mat-icon:contains("add")',
 ];
 } else if (host.indexOf('gemini.google.com') >= 0) {
 // Gemini: "+" 按钮
 selectors = [
 'button[aria-label*="upload" i]',
 'button[aria-label*="附加" i]',
 'button[aria-label*="文件" i]',
 'uploader-button button',
 ];
 } else if (host.indexOf('chatgpt.com') >= 0 || host.indexOf('openai.com') >= 0) {
 selectors = [
 'button[aria-label*="Attach" i]',
 'button[aria-label*="附件" i]',
 'button[aria-label*="upload" i]',
 ];
 } else if (host.indexOf('claude.ai') >= 0) {
 selectors = [
 'button[aria-label*="attach" i]',
 'button[aria-label*="upload" i]',
 'button[data-testid*="upload" i]',
 ];
 }
 for (let i = 0; i < selectors.length; i++) {
 try {
 const btn = document.querySelector(selectors[i]);
 if (btn) {
 btn.click();
 return true;
 }
 } catch (err) { /* ignore */ }
 }
 return false;
 }

 function findInputForSite() {
 const host = location.hostname;
 let candidates = [];
 if (host.indexOf('chatgpt.com') >= 0 || host.indexOf('openai.com') >= 0) {
 candidates = [
 '#prompt-textarea',
 'div[contenteditable="true"][role="textbox"]',
 'main form div[contenteditable="true"]',
 'main textarea',
 ];
 } else if (host.indexOf('gemini.google.com') >= 0) {
 candidates = [
 'rich-textarea .ql-editor[contenteditable="true"]',
 '.ql-editor[contenteditable="true"]',
 'div[contenteditable="true"][role="textbox"]',
 ];
 } else if (host.indexOf('aistudio.google.com') >= 0) {
 candidates = [
 'ms-prompt-input-wrapper textarea',
 'ms-text-chunk textarea',
 'textarea.user-input-area-textarea',
 'main textarea',
 ];
 } else if (host.indexOf('claude.ai') >= 0) {
 candidates = [
 'div.ProseMirror[contenteditable="true"]',
 'div[contenteditable="true"][role="textbox"]',
 'fieldset div[contenteditable="true"]',
 ];
 }
 for (let i = 0; i < candidates.length; i++) {
 const el = document.querySelector(candidates[i]);
 if (el) return el;
 }
 return null;
 }

 function setNativeValue(el, value) {
 // React/Angular 用原型上的 setter 才能感知到值变更（直接 .value = 不会触发 onChange）
 const proto = Object.getPrototypeOf(el);
 const desc = Object.getOwnPropertyDescriptor(proto, 'value');
 if (desc && desc.set) {
 desc.set.call(el, value);
 } else {
 el.value = value;
 }
 }

 // 把文字塞进 textarea / input
 function fillTextarea(el, text) {
 setNativeValue(el, String(text || ''));
 el.dispatchEvent(new Event('input', { bubbles: true }));
 el.dispatchEvent(new Event('change', { bubbles: true }));
 }

 // 把文字塞进 contenteditable（短文本可用，长文本会卡死）
 function fillContentEditable(el, text) {
 el.focus();
 try {
 const sel = window.getSelection();
 const range = document.createRange();
 range.selectNodeContents(el);
 sel.removeAllRanges();
 sel.addRange(range);
 document.execCommand('delete');
 } catch (err) { /* ignore */ }
 let inserted = false;
 try {
 inserted = document.execCommand('insertText', false, String(text || ''));
 } catch (err) { /* ignore */ }
 if (!inserted) {
 try {
 el.textContent = String(text || '');
 el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(text || '') }));
 } catch (err) { /* ignore */ }
 }
 }

 // 用 DataTransfer 给 file input 塞文件 → 派 change 事件
 // 异步版本：找不到 file input 时先尝试点击附件按钮
 async function uploadAsFileInputAsync(text, filename) {
 let fileInput = findFileInput();
 if (!fileInput) {
 // 没有 file input，尝试点击附件按钮触发它出现
 if (tryClickAttachButton()) {
 // 等待 file input 出现（点击后菜单打开需要时间）
 await new Promise(function(resolve) { setTimeout(resolve, 300); });
 fileInput = findFileInput();
 }
 }
 if (!fileInput) return false;
 try {
 const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
 const file = new File([blob], filename || 'novel.txt', { type: 'text/plain;charset=utf-8' });
 const dt = new DataTransfer();
 dt.items.add(file);
 fileInput.files = dt.files;
 fileInput.dispatchEvent(new Event('change', { bubbles: true }));
 fileInput.dispatchEvent(new Event('input', { bubbles: true }));
 return true;
 } catch (err) {
 console.warn('[xly-aiweb] uploadAsFileInput failed', err);
 return false;
 }
 }

 // 同步版本（保留给 paste 事件路径用）
 function uploadAsFileInput(text, filename) {
 return null; // 已废弃，使用 uploadAsFileInputAsync
 }
 void uploadAsFileInput;

 // 在输入框上派 paste 事件，DataTransfer 携带 File
 function pasteAsFile(text, filename) {
 const inputEl = findInputForSite();
 if (!inputEl) return false;
 try {
 const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
 const file = new File([blob], filename || 'novel.txt', { type: 'text/plain;charset=utf-8' });
 const dt = new DataTransfer();
 dt.items.add(file);
 inputEl.focus();
 const ev = new ClipboardEvent('paste', {
 bubbles: true,
 cancelable: true,
 clipboardData: dt,
 });
 // 部分浏览器构造 ClipboardEvent 不带 clipboardData，需手动赋值
 try {
 Object.defineProperty(ev, 'clipboardData', { value: dt });
 } catch (e) { /* ignore */ }
 const dispatched = inputEl.dispatchEvent(ev);
 // 如果默认行为没被取消，说明站点没接管，认为失败（站点会去走文本插入路径）
 return dispatched && ev.defaultPrevented;
 } catch (err) {
 console.warn('[xly-aiweb] pasteAsFile failed', err);
 return false;
 }
 }

 window.__xlyAiWebFillInput = async function (text, filename) {
 try {
 const txt = String(text || '');
 const fname = String(filename || 'novel.txt');
 const isLarge = txt.length > 50000;

 // 路径 1：file input 直接上传（最稳）— 异步版本会自动尝试点击附件按钮
 if (await uploadAsFileInputAsync(txt, fname)) {
 console.log('[xly-aiweb] uploaded via file input');
 return 'file';
 }

 // 路径 2：派 paste 事件带 File（部分站点接管粘贴时支持）
 if (isLarge && pasteAsFile(txt, fname)) {
 console.log('[xly-aiweb] uploaded via paste event');
 return 'file';
 }

 // 路径 3：退化到文本插入（小文本时直接走这条更自然）
 const el = findInputForSite();
 if (!el) {
 console.error('[xly-aiweb] no input element found for', location.hostname);
 return 'fail';
 }
 if (isLarge) {
 console.error('[xly-aiweb] large text but no file upload available');
 return 'fail';
 }
 el.focus();
 const tag = (el.tagName || '').toUpperCase();
 if (tag === 'TEXTAREA' || tag === 'INPUT') {
 fillTextarea(el, txt);
 } else {
 fillContentEditable(el, txt);
 }
 try {
 if (typeof el.scrollTop === 'number') el.scrollTop = el.scrollHeight;
 } catch (err) { /* ignore */ }
 return 'text';
 } catch (err) {
 console.error('[xly-aiweb] fill failed', err);
 return 'fail';
 }
 };
})();
`;
}
