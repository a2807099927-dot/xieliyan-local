// main 
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
// IDE 写作工作台主题：必须排在 styles.css 之后，靠后置覆盖旧主题变量
import './styles/ide-theme.css';
import App from './App';
import { installNovelLabShim } from './utils/novel-lab-shim';
import { installGlobalErrorReporter } from './utils/error-reporter';

// 在 React render 前注入 window.novelLab + 全局错误上报
installNovelLabShim();
installGlobalErrorReporter();

// WebView2 防黑屏：定期触发微小 DOM 操作，防止 WebView2 进入休眠渲染暂停
// 当窗口不活跃超过一段时间后，WebView2 可能暂停渲染导致黑屏
(function keepAlive() {
 let timer: ReturnType<typeof setInterval> | null = null;
 const start = () => {
 if (timer) return;
 timer = setInterval(() => {
 // 触发一次 reflow 让 WebView2 保持渲染活跃
 document.body.style.opacity = '1';
 }, 30000); // 每 30 秒
 };
 const stop = () => {
 if (timer) { clearInterval(timer); timer = null; }
 };
 document.addEventListener('visibilitychange', () => {
 if (document.hidden) start(); else stop();
 });
 // 窗口失焦时也启动
 window.addEventListener('blur', start);
 window.addEventListener('focus', stop);
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
 <App />
 </React.StrictMode>
);

// React 挂载完成后只移除 splash spinner，保留深色背景兜底（独立窗口无 backgroundColor 配置时 WebView 默认白底）
const splash = document.getElementById('splash');
if (splash) {
 const style = document.createElement('style');
 style.textContent = '#splash::after { display: none !important; }';
 document.head.appendChild(style);
}

