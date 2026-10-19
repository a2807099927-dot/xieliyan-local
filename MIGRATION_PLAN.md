# Tauri 2 迁移详细计划

> **历史文档（迁移已完成）。** 写梨眼已全量运行在 Tauri 2 上（当前版本见 `README.md`）。
> 下表「状态」列停留在立项时的 ⬜，此后不再维护，请勿据此判断功能缺失；实际实现位置查 `ARCHITECTURE.md` 与 `PROJECT_REFERENCE.md`。

## 功能对照表（Electron → Tauri 2）

| # | 功能 | Electron 实现 | Tauri 2 实现 | 状态 |
|---|---|---|---|---|
| 1 | 文件读写 | Node fs | Rust std::fs + tauri::api::path | ⬜ |
| 2 | 章节保存/加载 | IPC fs-save-chapter-content | invoke("fs:save_chapter") | ⬜ |
| 3 | 导出 TXT/MD | Node fs.writeFile | Rust std::fs::write | ⬜ |
| 4 | 导出 PDF | Electron printToPDF | tauri-plugin-shell 调 wkhtmltopdf 或 headless print | ⬜ |
| 5 | AI 请求（非流式） | Node fetch → provider adapter | Rust reqwest → provider adapter | ⬜ |
| 6 | AI 请求（流式 SSE） | Node fetch + ReadableStream + IPC send | Rust reqwest + eventsource + Tauri event emit | ⬜ |
| 7 | AI abort | AbortController | tokio CancellationToken | ⬜ |
| 8 | 密钥存储 | keytar (N-API) | keyring crate | ⬜ |
| 9 | 配置管理 | JSON 文件 + configManager | Rust serde_json + 同样逻辑 | ⬜ |
| 10 | 日志 | 自定义 Logger 类 | tauri-plugin-log 或自定义 | ⬜ |
| 11 | 备份 | Node fs zip | Rust zip crate | ⬜ |
| 12 | WebDAV 同步 | Node HTTP | Rust reqwest + WebDAV 协议 | ⬜ |
| 13 | 自动更新 | electron-updater | tauri-plugin-updater | ⬜ |
| 14 | 多窗口 | BrowserWindow | WebviewWindow | ⬜ |
| 15 | 窗口状态持久化 | 自定义 JSON | tauri-plugin-window-state | ⬜ |
| 16 | 全局缩放 | webContents.setZoomFactor | 平台 plugin (WebView2/WKWebView API) | ⬜ |
| 17 | Agent 题材包加密 | Node crypto AES | Rust aes-gcm crate | ⬜ |
| 18 | 角色提取（AI 调用） | 复用 AI IPC | 复用 Rust AI command | ⬜ |
| 19 | 记忆库/剧情档案 | JSON 文件读写 | Rust serde_json | ⬜ |
| 20 | 文本拆书（新） | 无（原来是 webview 抓取） | Rust regex 拆章 + 前端 UI | ⬜ |
| 21 | 代码混淆 | javascript-obfuscator | 前端 JS 混淆不变 + Rust 天然编译 | ⬜ |
| 22 | GPU 稳定性 | Chromium switches | 不需要（系统 WebView 自己管） | ✅ |
| 23 | 标题栏 | frame:false + 自定义 TitleBar | Tauri decorations:false + 同样 TitleBar | ⬜ |

## 砍掉的功能

| 功能 | 原因 |
|---|---|
| AI 网页侧栏（4 站点内嵌） | Tauri 无 WebContentsView + partition 隔离 |
| NovelLab 内嵌浏览器抓取 | Tauri 无嵌套 WebView |
| 插件系统 | 已在 Electron 版退役 |

## 新增功能

| 功能 | 说明 |
|---|---|
| 文本拆书 | 拖入 .txt/.epub → Rust 正则拆章 → 章节列表 → 导入书架或分析 |

## Rust 依赖规划（Cargo.toml）

```toml
[dependencies]
tauri = { version = "2", features = ["all"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
keyring = "3"
aes-gcm = "0.10"
zip = "2"
regex = "1"
uuid = { version = "1", features = ["v4"] }
chrono = "0.4"
sha2 = "0.10"
base64 = "0.22"
log = "0.4"

[dependencies.tauri-plugin-updater]
version = "2"

[dependencies.tauri-plugin-window-state]
version = "2"

[dependencies.tauri-plugin-log]
version = "2"
```

## 前端改动清单

核心改动：把所有 `electronAPI.*` 调用替换为 Tauri `invoke()` + `listen()`。

```typescript
// 之前（Electron）
const result = await electronAPI.fs.loadBooks();

// 之后（Tauri）
import { invoke } from '@tauri-apps/api/core';
const result = await invoke<{ books: Book[] }>('fs:load_books');
```

需要改的文件（按引用 electronAPI 的频率排序）：
1. `src/utils/electron.ts` → 改为 `src/utils/tauri-bridge.ts`（统一桥接层）
2. `src/hooks/useAiChat.ts`
3. `src/store/useBookStore.ts`
4. `src/store/useConfigStore.ts`
5. `src/pages/Editor.tsx`
6. `src/components/modals/MemoryBankModal.tsx`
7. `src/components/panels/RolesPanel.tsx`
8. `src/Agent/useAgentSession.ts`
9. 其他 20+ 文件

**策略**：写一个 `tauri-bridge.ts` 适配层，接口签名跟现在的 `electronAPI` 完全一致，内部改为 invoke。这样其他文件只需要改 import 路径。

## 时间估算

| Phase | 内容 | 预估 |
|---|---|---|
| 0 | 项目骨架 + tauri.conf.json + Cargo.toml | 1 天 |
| 1 | 前端复制 + tauri-bridge 适配层 | 2 天 |
| 2 | Rust fs commands（30+ handler） | 5 天 |
| 3 | Rust AI commands（流式 SSE + abort） | 4 天 |
| 4 | config/logger/workspace/backup | 2 天 |
| 5 | 多窗口 | 2 天 |
| 6 | WebDAV | 2 天 |
| 7 | 自动更新 | 1 天 |
| 8 | 文本拆书 | 2 天 |
| 9 | 全局缩放 plugin | 3 天 |
| 10 | 打包 + 测试 + 修 bug | 5 天 |

**总计：约 29 天（6 周）**

## 验收标准

迁移完成的定义：
- [ ] 能新建/打开/编辑/保存书籍
- [ ] TipTap 编辑器正常工作（撤销/重做/查找替换/角色高亮）
- [ ] AI 续写/重写/分析正常（流式输出 + 中止）
- [ ] Agent 工作台正常
- [ ] 角色档案正常（提取/编辑/合并）
- [ ] 记忆库正常（智能整理/推演）
- [ ] 导出 TXT/MD 正常
- [ ] WebDAV 同步正常
- [ ] 自动更新正常
- [ ] 文本拆书正常
- [ ] Win + Mac 双平台打包成功
- [ ] 包体积 < 15MB（不含系统 WebView）
