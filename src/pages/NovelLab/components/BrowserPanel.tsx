// 模块说明：NovelLab 内嵌浏览器面板（Tauri 版）
// 关键职责：在 NovelLab 独立窗口里贴一个 child webview 加载小说网站，
// 提取章节正文 + 翻页 + 批量提取
//
// 与主项目（Electron `<webview>`）的差异：
// - Tauri webview 是窗口级 child（OS 控件层），HTML 层无法直接抓 ref
// - 通过占位 div 计算位置 → invoke `novel_browser_open(url, region)` 让 Rust 把 child 贴上来
// - executeJavaScript 通过 invoke + Tauri event 回传结果
// - ResizeObserver 监听占位 div 尺寸变化 → 同步给 Rust
//
import { useCallback, useEffect, useRef, useState } from 'react';
import { listen as tauriListen } from '@tauri-apps/api/event';
import type { Chapter } from '../types';

// ES5 + try/catch — 与主项目（Electron 版）100% 同款，逐行复刻，不做任何"聪明"改动
const EXTRACT_SCRIPT = `
(function () {
 try {
 var contentSelectors = [
 '#chaptercontent', '#booktxt', '#content', '.read-content', '.chapter-content',
 '.txt', '#readcontent', '.booktext', 'article .content', '.novel-content',
 '.content', '.yd_text2', '.Readarea', '#nr1', '#nr', '.nr_nr', '.contentbox',
 '.txtnav', '#content1'
 ];
 var titleSelectors = [
 'h1.chaptertitle', '.bookname h1', 'h1#chapter-title', '.chaptername', '.headline',
 '.title', '.nr_title', '.readTitle', '.article h1', '.content h1', 'h1'
 ];

 function pickText(selectors, minLen) {
 var i;
 for (i = 0; i < selectors.length; i += 1) {
 var el = document.querySelector(selectors[i]);
 if (!el) continue;
 // 克隆节点，移除广告/推荐链接后再取文本
 var clone = el.cloneNode(true);
 var links = clone.querySelectorAll('a');
 for (var j = 0; j < links.length; j += 1) {
 var a = links[j];
 var href = a.getAttribute('href') || '';
 var linkText = String(a.innerText || a.textContent || '').trim();
 // 移除外站链接（href 含其他域名）
 var isExternal = false;
 try { isExternal = href && new URL(href, location.href).hostname !== location.hostname; } catch(e) {}
 // 移除推荐性质的链接：外站链接、或文字很短像书名推荐的链接
 var isAdLink = isExternal || (/https?:\\/\\//.test(linkText)) || (linkText.length > 4 && linkText.length < 50 && /^[\\u4e00-\\u9fa5a-zA-Z0-9]/.test(linkText) && a.style && (a.style.color === 'red' || a.style.color === '#ff0000' || a.style.color === 'rgb(255, 0, 0)'));
 // 也检查 computed style 或 class 暗示的广告
 if (!isAdLink && linkText.length > 4 && linkText.length < 50) {
 var cs = a.getAttribute('style') || '';
 if (/color\\s*:\\s*(red|#f{1,2}0{1,4}|rgb\\(255)/i.test(cs)) isAdLink = true;
 }
 if (isAdLink) { a.parentNode && a.parentNode.removeChild(a); }
 }
 var text = String(clone.innerText || '').replace(/\\u00A0/g, ' ').trim();
 if (text.length >= minLen) return text;
 }
 return '';
 }

 function normalizeContent(raw) {
 return String(raw || '')
 .split(/\\n+/)
 .map(function (line) { return line.trim(); })
 .filter(function (line) { return !!line; })
 .filter(function (line) {
 if (/^[\\u4e00-\\u9fa5A-Za-z0-9]$/.test(line)) return false;
 if (/^[>》】\\-_=~·•\\s]+$/.test(line)) return false;
 if (/[\uFFFD]/.test(line)) return false;
 if (/^(上一章|下一章|目录|返回|加入书签|点击报错|关闭广告|护眼|关灯|字体|手机阅读|章节报错)$/i.test(line)) return false;
 // 过滤广告/推荐尾部
 if (/^请收藏[：:]?\\s*(https?:\\/\\/|www\\.)/i.test(line)) return false;
 if (/^(https?:\\/\\/|www\\.)[^\\s]{5,}$/i.test(line)) return false;
 if (/^(推荐|精品|热门|最新)(小说|书籍|阅读)[：:]?$/i.test(line)) return false;
 if (/^本站网址|^记住网址|^收藏本站|^本章未完|^点击下一页/i.test(line)) return false;
 if (/^温馨提示|^亲，推荐|^喜欢请收藏|^最新网址/i.test(line)) return false;
 return true;
 })
 .join('\\n');
 }

 function pickLargestReadableBlock() {
 var nodes = document.querySelectorAll('article, main, section, div');
 var best = '';
 var i;
 for (i = 0; i < nodes.length; i += 1) {
 var node = nodes[i];
 if (!node) continue;
 var text = String(node.innerText || '').trim();
 if (text.length < 80) continue;
 if (text.length > best.length) best = text;
 }
 return best;
 }

 function findNextLink() {
 var links = Array.prototype.slice.call(document.querySelectorAll('a, button, [role="button"], .js_page_down, #pb_next, .next-chapter, .readpage-down'));
 var chapterPatterns = [/下一章/i, /下一节/i, /下一回/i, /next\\s*chapter/i, /next/i];
 var pagePatterns = [/下一页/i, /下页/i, /next\\s*page/i];
 function cleanHref(link) {
 var href = link && (link.href || link.getAttribute('href')) || '';
 if (!href || href === '#' || /^javascript:/i.test(href)) return '';
 try { return new URL(href, location.href).href; } catch (e) { return ''; }
 }
 function textOf(link) {
 return String(link && (link.innerText || link.textContent) || '').trim();
 }
 function pageKey(href) {
 try {
 var u = new URL(href, location.href);
 var isHash = u.hash && u.hash.indexOf('/') !== -1;
 var path = isHash ? u.hash : u.pathname;
 var m = path.match(/^(.*?)(?:_(\\d+))?(\\.html?)$/i);
 if (!m) return null;
 return {
 key: u.origin + m[1] + m[3],
 page: m[2] ? Number(m[2]) : 1
 };
 } catch (e) {
 return null;
 }
 }
 function sameChapterPage(href) {
 var current = pageKey(location.href);
 var nextPage = pageKey(href);
 return !!(current && nextPage && current.key === nextPage.key && nextPage.page > current.page);
 }
 var i;
 var firstPageLink = null;
 for (i = 0; i < links.length; i += 1) {
 var pageText = textOf(links[i]);
 if (pagePatterns.some(function (re) { return re.test(pageText); })) {
 var pageHref = cleanHref(links[i]);
 if (pageHref) {
 if (sameChapterPage(pageHref)) {
 return { hasNext: true, href: pageHref, type: 'page', text: pageText };
 }
 if (!firstPageLink) firstPageLink = { hasNext: true, href: pageHref, type: 'page', text: pageText };
 } else {
 try {
 links[i].click();
 return { hasNext: true, href: '_clicked_', type: 'page', text: pageText };
 } catch (e) {
 try {
 links[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
 return { hasNext: true, href: '_clicked_', type: 'page', text: pageText };
 } catch (err) {}
 }
 }
 }
 }
 if (firstPageLink) return firstPageLink;
 for (i = 0; i < links.length; i += 1) {
 var chapterText = textOf(links[i]);
 if (chapterPatterns.some(function (re) { return re.test(chapterText); })) {
 var chapterHref = cleanHref(links[i]);
 return { hasNext: true, href: chapterHref, type: 'chapter', text: chapterText };
 }
 }
 return { hasNext: false, href: '', type: '', text: '' };
 }

 function predictNextPageUrl(currentPage, totalPage) {
 if (!(currentPage < totalPage)) return '';
 try {
 var u = new URL(location.href);
 var nextPage = currentPage + 1;
 var isHash = u.hash && u.hash.indexOf('/') !== -1;
 var path = isHash ? u.hash : u.pathname;
 var m = path.match(/^(.*?)(?:_(\\d+))?(\\.html?)$/i);
 if (!m) return '';
 var newPath = m[1] + '_' + nextPage + m[3];
 if (isHash) {
 u.hash = newPath;
 } else {
 u.pathname = newPath;
 }
 return u.href;
 } catch (e) {
 return '';
 }
 }

 var title = pickText(titleSelectors, 1) || String(document.title || '').replace(/[\\-_].*$/, '').trim();
 var selectedContent = pickText(contentSelectors, 30);
 var fallbackContent = selectedContent ? '' : pickLargestReadableBlock();
 var content = normalizeContent(selectedContent || fallbackContent);

 var bodyText = document.body ? String(document.body.innerText || '') : '';
 var pageMatch = bodyText.match(/(?:第\\s*)?(\\d+)\\s*\\/\\s*(\\d+)\\s*(?:页)?/);
 var currentPage = pageMatch ? Number(pageMatch[1]) : 1;
 var totalPage = pageMatch ? Number(pageMatch[2]) : 1;

 var next = findNextLink();
 var predictedNextPageUrl = predictNextPageUrl(currentPage, totalPage);
 if (next.type !== 'page' && predictedNextPageUrl) {
 next = { hasNext: true, href: predictedNextPageUrl, type: 'predicted-page', text: next.text || '' };
 }
 var hasNextPage = next.hasNext && (next.type === 'page' || next.type === 'predicted-page');

 return {
 title: title,
 content: content,
 url: location.href,
 hasNextPage: hasNextPage,
 nextUrl: next.href,
 nextType: next.type,
 nextText: next.text,
 currentPage: currentPage,
 totalPage: totalPage
 };
 } catch (err) {
 return {
 __error: String(err && err.message ? err.message : err),
 title: '',
 content: '',
 url: location.href,
 hasNextPage: false,
 nextUrl: ''
 };
 }
})()
`;

const NEXT_PAGE_SCRIPT = `
(function () {
 var links = Array.from(document.querySelectorAll('a, button, [role="button"], .js_page_down, #pb_next, .next-chapter, .readpage-down'));
 var chapterPatterns = [/下一章/i, /下一节/i, /下一回/i, /next\\s*chapter/i, /next/i];
 var pagePatterns = [/下一页/i, /下页/i, /next\\s*page/i];
 
 function cleanHref(link) {
 var href = link && (link.href || link.getAttribute('href')) || '';
 if (!href || href === '#' || /^javascript:/i.test(href)) return '';
 try { return new URL(href, location.href).href; } catch (e) { return ''; }
 }

 function findAndNavigate(patterns) {
 for (var i = 0; i < links.length; i++) {
 var a = links[i];
 var text = String(a.innerText || a.textContent || '').trim();
 if (patterns.some(function(re) { return re.test(text); })) {
 var href = cleanHref(a);
 if (href) {
 return href;
 }
 try {
 a.click();
 return '_clicked_';
 } catch (e) {
 try {
 a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
 return '_clicked_';
 } catch (err) {}
 }
 }
 }
 return '';
 }
 
 return findAndNavigate(chapterPatterns) || findAndNavigate(pagePatterns) || '';
})()
`;

interface Props {
 onChapterExtracted: (chapter: Chapter) => void;
 onBatchComplete?: () => void;
 initialChapterCount?: number;
}

// 合规：不再内置第三方小说站首页，由用户自行在 localStorage(nl_browser_home) 配置，缺省为空。
const DEFAULT_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('nl_browser_home')) || '';
const NAV_WAIT_MS = 15000; // child webview 跳转后最长等待时间（轮询 URL + readyState）
const inTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);

const LOCATION_SCRIPT = `
(function () {
 return {
 href: location.href,
 readyState: document.readyState,
 title: String(document.title || ''),
 bodyLength: document.body ? String(document.body.innerText || '').length : 0
 };
})()
`;

async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
 if (!inTauri) return undefined as unknown as T;
 const internals = (window as any).__TAURI_INTERNALS__;
 return await internals.invoke(cmd, args) as T;
}

/// 通过 invoke + 'novel-browser:exec-response' 事件实现"在 child webview 里执行 JS 并拿到结果"
function execJsInChild<T = unknown>(code: string, timeoutMs = 8000): Promise<T> {
 return new Promise((resolve, reject) => {
 if (!inTauri) {
 reject(new Error('非 Tauri 环境'));
 return;
 }
 const requestId = `nb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 let unlisten: (() => void) | null = null;
 const timer = setTimeout(() => {
 if (unlisten) unlisten();
 reject(new Error('execJsInChild 超时'));
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
 ).then((fn) => { unlisten = fn; }).catch((err) => {
 clearTimeout(timer);
 reject(err);
 });

 invoke('novel_browser_execute_js', { code, requestId }).catch((err) => {
 clearTimeout(timer);
 if (unlisten) unlisten();
 reject(err);
 });
 });
}

async function waitMs(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function comparableUrl(raw?: string) {
 if (!raw) return '';
 try {
 const u = new URL(raw);
 if (u.hash && !u.hash.includes('/')) {
 u.hash = '';
 }
 return u.href;
 } catch {
 return raw;
 }
}

function normalizeChapterTitle(raw?: string) {
 return String(raw || '')
 .replace(/[（(]?第\s*\d+\s*\/\s*\d+\s*页[)）]?/g, '')
 .replace(/\s+/g, '')
 .trim();
}

function chapterPaginationKey(raw?: string) {
 if (!raw) return '';
 try {
 const u = new URL(raw);
 const path = (u.hash && u.hash.includes('/')) ? u.hash : u.pathname;
 const match = path.match(/^(.*?)(?:_(\d+))?(\.html?)$/i);
 if (!match) return '';
 return `${u.origin}${match[1]}${match[3]}`;
 } catch {
 return '';
 }
}

async function waitForChildNavigation(targetUrl?: string, previousUrl?: string, timeoutMs = NAV_WAIT_MS) {
 const started = Date.now();
 const target = comparableUrl(targetUrl);
 const previous = comparableUrl(previousUrl);
 let lastSeen = '';

 while (Date.now() - started < timeoutMs) {
 try {
 const state = await execJsInChild<{
 href?: string;
 readyState?: string;
 bodyLength?: number;
 }>(LOCATION_SCRIPT, 2500);
 const href = comparableUrl(state?.href);
 lastSeen = href || lastSeen;
 const urlReady = target ? (href === target || (!!previous && href !== previous)) : !previous || href !== previous;
 const domReady = state?.readyState === 'interactive' || state?.readyState === 'complete';
 const hasBody = Number(state?.bodyLength || 0) > 0;
 if (urlReady && domReady && hasBody) {
 await waitMs(250);
 return state;
 }
 } catch {
 // A navigation in progress can briefly reject eval; keep polling.
 }
 await waitMs(180);
 }

 throw new Error(`页面跳转等待超时：${lastSeen || targetUrl || previousUrl || 'unknown'}`);
}

export default function BrowserPanel({ onChapterExtracted, onBatchComplete, initialChapterCount = 0 }: Props) {
 const placeholderRef = useRef<HTMLDivElement | null>(null);
 const chapterCountRef = useRef(initialChapterCount);

 const [url, setUrl] = useState(DEFAULT_URL);
 const [inputUrl, setInputUrl] = useState(DEFAULT_URL);
 const [extractStatus, setExtractStatus] = useState<'idle' | 'extracting' | 'success' | 'error'>('idle');
 const extractStatusRef = useRef<'idle' | 'extracting' | 'success' | 'error'>('idle');
 const [extractMsg, setExtractMsg] = useState('');
 const [chapterCount, setChapterCount] = useState(0);
 const [batchRange, setBatchRange] = useState('');

 // 同步占位 div 的位置 / 尺寸到 Rust child webview
 const syncRegion = useCallback(async (mode: 'open' | 'set' = 'set') => {
 const node = placeholderRef.current;
 if (!node || !inTauri) return;
 const rect = node.getBoundingClientRect();
 // 占位 div 还没拿到布局（0 宽高）— 跳过本次同步，由 ResizeObserver 后续触发
 if (rect.width < 10 || rect.height < 10) return;
 const region = {
 x: Math.max(0, Math.round(rect.left)),
 y: Math.max(0, Math.round(rect.top)),
 width: Math.max(50, Math.round(rect.width)),
 height: Math.max(50, Math.round(rect.height)),
 };
 if (mode === 'open') {
 await invoke('novel_browser_open', { url, region });
 } else {
 await invoke('novel_browser_set_region', { region });
 }
 }, [url]);

 // 挂载时打开 child webview，卸载时关闭
 useEffect(() => {
 if (!inTauri) return;
 let mounted = true;
 (async () => {
 // 多帧等待 — NovelLab 独立窗口刚打开时布局还没稳定
 for (let i = 0; i < 8; i += 1) {
 await new Promise((r) => requestAnimationFrame(() => r(null)));
 const node = placeholderRef.current;
 if (node) {
 const r = node.getBoundingClientRect();
 if (r.width >= 50 && r.height >= 50) break;
 }
 await new Promise((r) => setTimeout(r, 60));
 }
 if (!mounted) return;
 await syncRegion('open');
 })();
 return () => {
 mounted = false;
 invoke('novel_browser_close').catch(() => {});
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // 窗口从隐藏恢复可见时，child webview 已被 close_child_webview 销毁，
 // 需要重新创建。监听 visibilitychange + focus 事件来检测窗口恢复。
 // 同时监听 Rust 端发出的 'novel-lab:window-reshown' 事件确保可靠重建。
 useEffect(() => {
 if (!inTauri) return;
 let unmounted = false;
 const reopenChild = () => {
 if (unmounted) return;
 // 多帧延迟确保窗口布局已恢复
 let attempts = 0;
 const tryOpen = () => {
 if (unmounted || attempts > 10) return;
 attempts++;
 requestAnimationFrame(() => {
 const node = placeholderRef.current;
 if (node) {
 const r = node.getBoundingClientRect();
 if (r.width >= 50 && r.height >= 50) {
 syncRegion('open').catch(() => {});
 return;
 }
 }
 // 布局还没就绪，延迟重试
 setTimeout(tryOpen, 100);
 });
 };
 tryOpen();
 };
 const onVisibility = () => {
 if (document.visibilityState === 'visible') reopenChild();
 };
 // 只在窗口重新获得焦点时触发（非首次）
 let hasFocusedOnce = false;
 const onFocus = () => {
 if (!hasFocusedOnce) { hasFocusedOnce = true; return; }
 reopenChild();
 };
 document.addEventListener('visibilitychange', onVisibility);
 window.addEventListener('focus', onFocus);

 // 监听 Rust 端的 window-reshown 事件（最可靠的通知通道）
 let unlistenReshown: (() => void) | null = null;
 tauriListen('novel-lab:window-reshown', () => {
 reopenChild();
 }).then((fn) => { unlistenReshown = fn; }).catch(() => {});

 return () => {
 unmounted = true;
 document.removeEventListener('visibilitychange', onVisibility);
 window.removeEventListener('focus', onFocus);
 if (unlistenReshown) unlistenReshown();
 };
 }, [syncRegion]);

 // 监听占位 div 尺寸变化 + 窗口 resize
 useEffect(() => {
 if (!inTauri) return;
 const node = placeholderRef.current;
 if (!node) return;
 const ro = new ResizeObserver(() => { void syncRegion('set'); });
 ro.observe(node);
 const onResize = () => { void syncRegion('set'); };
 window.addEventListener('resize', onResize);
 // 初始位置可能偏移，间隔同步几次
 const t1 = setTimeout(() => void syncRegion('set'), 100);
 const t2 = setTimeout(() => void syncRegion('set'), 400);
 return () => {
 ro.disconnect();
 window.removeEventListener('resize', onResize);
 clearTimeout(t1);
 clearTimeout(t2);
 };
 }, [syncRegion]);

 const navigate = useCallback(() => {
 const target = inputUrl.startsWith('http') ? inputUrl : `https://${inputUrl}`;
 setUrl(target);
 setInputUrl(target);
 if (inTauri) void invoke('novel_browser_navigate', { url: target });
 }, [inputUrl]);

 const extractWholeChapter = useCallback(async () => {
 setExtractStatus('extracting');
 extractStatusRef.current = 'extracting';
 setExtractMsg('');

 let fullContent = '';
 let chapterTitle = '';
 let chapterTitleKey = '';
 let chapterUrlKey = '';
 let currentUrl = '';

 try {
 // 与主项目同款：最多 20 次翻页（够覆盖任何分页章节），下一页才继续，没有下一页就停
 for (let i = 0; i < 20; i += 1) {
 const parsed = await execJsInChild<{
 title?: string;
 content?: string;
 url?: string;
 hasNextPage?: boolean;
 nextUrl?: string;
 nextType?: string;
 nextText?: string;
 currentPage?: number;
 totalPage?: number;
 __error?: string;
 }>(EXTRACT_SCRIPT);

 if (parsed?.__error) {
 extractStatusRef.current = 'error';
 setExtractStatus('error');
 setExtractMsg(`提取脚本异常：${parsed.__error}`);
 return;
 }

 const parsedUrl = String(parsed?.url || currentUrl);
 const pageUrlKey = chapterPaginationKey(parsedUrl);
 const pageTitle = String(parsed?.title || '').trim();
 const pageTitleKey = normalizeChapterTitle(pageTitle);
 if (!chapterTitle) {
 chapterTitle = pageTitle;
 chapterTitleKey = pageTitleKey;
 chapterUrlKey = pageUrlKey;
 } else if (pageUrlKey && chapterUrlKey && pageUrlKey !== chapterUrlKey && pageTitleKey && chapterTitleKey && pageTitleKey !== chapterTitleKey) {
 break;
 }
 currentUrl = parsedUrl;

 const pageContent = String(parsed?.content || '').trim();
 if (pageContent) {
 fullContent += fullContent ? `\n${pageContent}` : pageContent;
 }

 if (parsed?.hasNextPage && parsed?.nextUrl) {
 const previousUrl = parsed.url;
 if (parsed.nextUrl !== '_clicked_') {
 await invoke('novel_browser_navigate', { url: parsed.nextUrl });
 await waitForChildNavigation(parsed.nextUrl, previousUrl);
 } else {
 await waitForChildNavigation(undefined, previousUrl);
 }
 continue;
 }

 break;
 }

 if (fullContent.length < 30) {
 extractStatusRef.current = 'error';
 setExtractStatus('error');
 setExtractMsg('提取失败：未识别到有效正文内容');
 return;
 }

 chapterCountRef.current += 1;
 const nextIndex = chapterCountRef.current;

 const chapter: Chapter = {
 index: nextIndex,
 title: chapterTitle || `第${nextIndex}章`,
 url: currentUrl,
 status: 'done',
 content: fullContent,
 };

 setChapterCount(nextIndex);
 extractStatusRef.current = 'success';
 setExtractStatus('success');
 onChapterExtracted(chapter);

 setTimeout(() => {
 setExtractStatus((prev) => {
 if (prev === 'success') {
 extractStatusRef.current = 'idle';
 return 'idle';
 }
 return prev;
 });
 }, 1200);
 } catch (error) {
 extractStatusRef.current = 'error';
 setExtractStatus('error');
 const reason = error instanceof Error ? error.message : String(error);
 setExtractMsg('提取失败：' + (reason || '请手动翻页后重试'));
 }
 }, [onChapterExtracted]);

 const goNext = useCallback(async () => {
 try {
 const before = await execJsInChild<{ href?: string }>(LOCATION_SCRIPT).catch(() => null);
 const nextUrl = await execJsInChild<string>(NEXT_PAGE_SCRIPT);
 if (!nextUrl) {
 setExtractStatus('error');
 setExtractMsg('未找到"下一页/下一章"按钮，请手动翻页。');
 return;
 }
 if (nextUrl !== '_clicked_') {
 await invoke('novel_browser_navigate', { url: nextUrl });
 await waitForChildNavigation(nextUrl, before?.href);
 } else {
 await waitForChildNavigation(undefined, before?.href);
 }
 } catch (e) {
 setExtractStatus('error');
 setExtractMsg('翻页失败：' + (e instanceof Error ? e.message : String(e)));
 }
 }, []);

 const parseBatchRange = (raw: string): { start: number; count: number } | null => {
 const value = raw.trim();
 if (!value) return null;
 if (value.includes('-')) {
 const [startStr, endStr] = value.split('-');
 const start = Number(startStr);
 const end = Number(endStr);
 if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return null;
 return { start, count: end - start + 1 };
 }
 const count = Number(value);
 if (!Number.isFinite(count) || count <= 0) return null;
 return { start: 1, count };
 };

 const batchExtract = useCallback(async () => {
 const parsedRange = parseBatchRange(batchRange);
 if (!parsedRange) {
 setExtractStatus('error');
 setExtractMsg('批量范围格式无效，请使用"10"或"1-10"。');
 return;
 }
 setExtractStatus('extracting');
 setExtractMsg('');

 // 起始章 > 1 时尝试在当前页找匹配的"第 N 章"链接并跳转
 if (parsedRange.start > 1) {
 const jumpScript = `
 (function () {
 const links = Array.from(document.querySelectorAll('a'));
 const target = ${parsedRange.start};
 const patterns = [
 new RegExp('第\\\\s*' + target + '\\\\s*章'),
 new RegExp('^' + target + '\\\\s*[\\\\.、\\\\s]?')
 ];
 const match = links.find((a) => {
 const text = String(a.innerText || a.textContent || '').trim();
 return patterns.some((re) => re.test(text));
 });
 if (!match) return false;
 const href = match.getAttribute('href') || '';
 if (href && href !== '#' && !href.toLowerCase().startsWith('javascript:')) {
 location.assign(href);
 return true;
 }
 match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
 return true;
 })()
 `;
 try {
 const before = await execJsInChild<{ href?: string }>(LOCATION_SCRIPT).catch(() => null);
 const jumped = await execJsInChild<boolean>(jumpScript);
 if (jumped) await waitForChildNavigation(undefined, before?.href);
 } catch { /* 忽略，继续从当前页开始 */ }
 }

 for (let i = 0; i < parsedRange.count; i += 1) {
 await extractWholeChapter();
 if (extractStatusRef.current === 'error') return;
 if (i >= parsedRange.count - 1) break;
 await waitMs(500);
 try {
 const before = await execJsInChild<{ href?: string }>(LOCATION_SCRIPT).catch(() => null);
 const nextUrl = await execJsInChild<string>(NEXT_PAGE_SCRIPT);
 if (!nextUrl) {
 setExtractStatus('error');
 setExtractMsg('批量提取已停止：未找到下一章链接。');
 return;
 }
 if (nextUrl !== '_clicked_') {
 await invoke('novel_browser_navigate', { url: nextUrl });
 await waitForChildNavigation(nextUrl, before?.href);
 } else {
 await waitForChildNavigation(undefined, before?.href);
 }
 // 额外等待：某些网站有验证重定向，需要更多时间才能加载出真实内容
 await waitMs(1500);
 } catch (e) {
 setExtractStatus('error');
 setExtractMsg('翻页失败：' + (e instanceof Error ? e.message : String(e)));
 return;
 }
 }
 setExtractStatus('idle');
 onBatchComplete?.();
 }, [batchRange, extractWholeChapter, onBatchComplete]);

 return (
 <div className="nl-browser-root">
 <div className="nl-toolbar">
 <input
 value={inputUrl}
 onChange={(e) => setInputUrl(e.target.value)}
 onKeyDown={(e) => e.key === 'Enter' && navigate()}
 placeholder="输入小说目录页或章节页地址…"
 className="nl-input"
 />
 <button onClick={navigate} className="nl-btn nl-btn-accent">跳转</button>
 </div>

 {/* 占位 div：child webview 会被 Rust 贴在这个矩形上 */}
 <div ref={placeholderRef} className="nl-webview" style={{ background: '#0b1220', minHeight: 300 }} />

 <div className="nl-toolbar nl-toolbar-foot">
 <span className={`nl-status nl-${extractStatus === 'extracting' ? 'muted' : extractStatus}`}>
 {extractMsg || (extractStatus === 'extracting' ? '提取中…' : extractStatus === 'success' ? '提取成功' : extractStatus === 'error' ? '提取失败' : '就绪')}
 </span>
 <span className="nl-muted">已提取：{chapterCount}</span>

 <input
 value={batchRange}
 onChange={(e) => setBatchRange(e.target.value)}
 placeholder="1-10"
 className="nl-input"
 style={{ width: '88px', textAlign: 'center', marginLeft: 'auto' }}
 disabled={extractStatus === 'extracting'}
 />

 <button onClick={batchExtract} className="nl-btn"disabled={extractStatus === 'extracting'}>批量提取</button>
 <button onClick={extractWholeChapter} className="nl-btn nl-btn-accent"disabled={extractStatus === 'extracting'}>提取当前章</button>
 <button onClick={goNext} className="nl-btn"disabled={extractStatus === 'extracting'}>下一章</button>
 </div>
 </div>
 );
}
