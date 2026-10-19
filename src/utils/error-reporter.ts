// 前端全局错误上报 — 把所有未捕获错误自动写入 Tauri 日志文件
// 落盘路径：%APPDATA%/com.xieliyan.app/logs/xieliyan-tauri-YYYY-MM-DD.log

let invokeImpl: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

try {
 const internals = (window as any).__TAURI_INTERNALS__;
 if (internals && typeof internals.invoke === 'function') {
 invokeImpl = internals.invoke;
 }
} catch { /* ignore */ }

function reportToBackend(source: string, message: string) {
 if (!invokeImpl) return;
 invokeImpl('logs_report_error', { source, message }).catch(() => {
 // 上报失败也不再递归，否则会无限循环
 });
}

let reentryGuard = false;

export function installGlobalErrorReporter() {
 if (typeof window === 'undefined') return;

 // 1) JS 运行时同步异常
 window.addEventListener('error', (event) => {
 if (reentryGuard) return;
 reentryGuard = true;
 try {
 const err = event.error;
 const message = err
 ? `${err.name || 'Error'}: ${err.message || String(err)}\n${err.stack || ''}`
 : `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`;
 console.error('[error-reporter]', message);
 reportToBackend('window.onerror', message.slice(0, 4000));
 } finally {
 reentryGuard = false;
 }
 });

 // 2) Promise rejection
 window.addEventListener('unhandledrejection', (event) => {
 if (reentryGuard) return;
 reentryGuard = true;
 try {
 const reason = event.reason;
 const message = reason instanceof Error
 ? `${reason.name}: ${reason.message}\n${reason.stack || ''}`
 : String(reason);
 console.error('[error-reporter] unhandled promise:', message);
 reportToBackend('unhandledrejection', message.slice(0, 4000));
 } finally {
 reentryGuard = false;
 }
 });

 // 3) console.error 镜像（可选，关注但不强制 — 大部分组件用 console.error 报错）
 const originalErr = console.error;
 console.error = function (...args: any[]) {
 originalErr.apply(console, args);
 if (reentryGuard) return;
 reentryGuard = true;
 try {
 const message = args
 .map((a) => {
 if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
 if (typeof a === 'object') {
 try { return JSON.stringify(a); } catch { return String(a); }
 }
 return String(a);
 })
 .join(' ');
 // 跳过错误上报系统自身和 React 内部的标准提示
 if (message.includes('[error-reporter]')) return;
 reportToBackend('console.error', message.slice(0, 4000));
 } finally {
 reentryGuard = false;
 }
 };
}
