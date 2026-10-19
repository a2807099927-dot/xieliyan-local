// WorldBuilder.tsx — AI 世界观构建器
// 用户输入题材方向，AI 联网搜索真实资料，多轮生成完整世界设定包
import { useState, useCallback } from 'react';
import { electronAPI } from '../../utils/electron';
import { useIslandStore } from '../../store/useIslandStore';
import type { OutlineSubItem } from '../../types/ov';

interface WorldBuilderProps {
 bookId: string;
 existingSettings: OutlineSubItem[];
 onSettingsGenerated: (items: OutlineSubItem[]) => void;
}

/** 生成阶段 */
type BuildPhase = 'idle' | 'searching' | 'background' | 'factions' | 'characters' | 'plotpoints' | 'details' | 'done' | 'error';

const PHASE_LABELS: Record<BuildPhase, string> = {
 idle: '',
 searching: '🔍 联网搜索相关资料...',
 background: '✨ 生成时代背景与地理版图...',
 factions: '⚔️ 生成势力阵营与门阀体系...',
 characters: '🎭 生成关键人物卡...',
 plotpoints: '⚡ 分析写点与推荐开局...',
 details: '📋 生成细节素材（官职/称谓/装备）...',
 done: '✅ 世界设定生成完毕！',
 error: '❌ 生成失败',
};

function makeId(): string {
 return 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 按 Markdown 标题（## / ### / **数字. 名字**）拆分文本为多个段落 */
function splitByHeadings(text: string, fallbackPrefix: string): Array<{ title: string; content: string }> {
 // 尝试按 ## 或 ### 或 **数字. 标题** 模式拆分
 const lines = text.split('\n');
 const sections: Array<{ title: string; content: string }> = [];
 let currentTitle = '';
 let currentLines: string[] = [];

 const headingPattern = /^#{2,4}\s+(.+)|^\*\*\d+[\.\、]\s*(.+?)\*\*/;

 for (const line of lines) {
 const match = line.match(headingPattern);
 if (match) {
 // 保存前一个段落
 if (currentTitle && currentLines.length > 0) {
 sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
 }
 currentTitle = (match[1] || match[2] || '').replace(/\*\*/g, '').trim();
 currentLines = [];
 } else {
 currentLines.push(line);
 }
 }
 // 保存最后一个段落
 if (currentTitle && currentLines.length > 0) {
 sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
 }

 // 如果拆分失败（没有识别到标题），返回整体作为一个项
 if (sections.length === 0) {
 return [{ title: fallbackPrefix, content: text }];
 }

 // 如果只拆出1-2个，可能是大标题（如"一、时代背景"），内容太少不值得拆
 if (sections.length <= 2 && text.length > 1000) {
 return [{ title: `${fallbackPrefix}总览`, content: text }];
 }

 return sections;
}

export function WorldBuilder({ bookId, existingSettings, onSettingsGenerated }: WorldBuilderProps) {
 const [genre, setGenre] = useState('');
 const [era, setEra] = useState('');
 const [extraNotes, setExtraNotes] = useState('');
 const [phase, setPhase] = useState<BuildPhase>('idle');
 const [progress, setProgress] = useState(0);
 const [errorMsg, setErrorMsg] = useState('');
 const [results, setResults] = useState<OutlineSubItem[]>([]);

 const showIsland = useIslandStore((s) => s.show);

 const handleGenerate = useCallback(async () => {
 if (!genre.trim()) {
 showIsland({ type: 'warning', message: '请输入题材方向', autoHideMs: 1500 });
 return;
 }
 const { requireFeatureAccess } = await import('../../utils/featureCheck');
 if (!(await requireFeatureAccess('outline_gen'))) {
 return;
 }

 setPhase('searching');
 setProgress(5);
 setErrorMsg('');
 setResults([]);

 const userPrompt = `题材方向：${genre.trim()}${era.trim() ? `\n时代/世界背景：${era.trim()}` : ''}${extraNotes.trim() ? `\n补充要求：${extraNotes.trim()}` : ''}`;

 try {
 // ── 第1轮：时代背景与地理 ──────────────────────────────────────────
 setPhase('background');
 setProgress(15);
 const bgMessages = [
 { role: 'system', content: `你是一位专业的小说世界观架构师。用户要写一本小说，请根据用户提供的题材方向，生成详尽的【时代背景与地理版图】设定。

要求：
1. 如果涉及真实历史，必须基于史实，列出准确的时间线、政治格局、经济状态、社会风貌
2. 如果是架空/玄幻，则构建合理自洽的世界体系
3. 地理部分要列出关键城市/关隘/水系/战略要地，标注其重要性
4. 内容要详尽、专业，至少 800 字
5. 使用 Markdown 格式，层次分明` },
 { role: 'user', content: userPrompt }
 ];
 const bgRes = await electronAPI.ai.chat({ stream: false, bookId, chapterId: '', disableRag: true, disableStyle: true, messages: bgMessages as any });
 const bgText = bgRes?.text?.trim() || '';
 if (!bgText) throw new Error('时代背景生成为空');

 // ── 第2轮：势力阵营 ──────────────────────────────────────────────
 setPhase('factions');
 setProgress(35);
 const factionMessages = [
 { role: 'system', content: `你是一位专业的小说世界观架构师。基于以下世界背景，生成详尽的【势力阵营与体系】设定。

要求：
1. 列出所有主要势力/门阀/组织（至少5个），每个势力包含：名称、实力评级、核心人物、立场倾向、可利用的矛盾点
2. 标注势力间的关系（同盟/敌对/中立/暗中角力）
3. 如果有等级/境界体系，详细列出各级别及其特征
4. 分析哪些势力适合作为主角方/敌方/第三方
5. 至少 800 字，Markdown 格式

已有世界背景：
${bgText.slice(0, 2000)}` },
 { role: 'user', content: userPrompt }
 ];
 const factionRes = await electronAPI.ai.chat({ stream: false, bookId, chapterId: '', disableRag: true, disableStyle: true, messages: factionMessages as any });
 const factionText = factionRes?.text?.trim() || '';
 if (!factionText) throw new Error('势力阵营生成为空');

 // ── 第3轮：关键人物 ──────────────────────────────────────────────
 setPhase('characters');
 setProgress(55);
 const charMessages = [
 { role: 'system', content: `你是一位专业的小说世界观架构师。基于以下世界背景和势力体系，生成【关键人物卡】。

要求：
1. 为每个主要势力生成 2-3 个关键人物（共至少 10 个）
2. 每个人物包含：姓名、所属势力、身份地位、性格特征、能力/特长、弱点、历史结局（如有）
3. 标注每个人物对主角的潜在价值：「可为主角所用」/「潜在敌人」/「可争取的中立方」
4. 如果是真实历史人物，标注其真实历史走向
5. 至少 1000 字，Markdown 格式，每个人物用独立段落

已有世界背景（摘要）：${bgText.slice(0, 1000)}
已有势力体系（摘要）：${factionText.slice(0, 1000)}` },
 { role: 'user', content: userPrompt }
 ];
 const charRes = await electronAPI.ai.chat({ stream: false, bookId, chapterId: '', disableRag: true, disableStyle: true, messages: charMessages as any });
 const charText = charRes?.text?.trim() || '';
 if (!charText) throw new Error('人物卡生成为空');

 // ── 第4轮：写点分析与开局推荐 ──────────────────────────────────────
 setPhase('plotpoints');
 setProgress(75);
 const plotMessages = [
 { role: 'system', content: `你是一位资深网文编辑和策划。基于以下世界设定，进行【写点分析与开局推荐】。

要求：
1. 分析这个世界观中最有戏剧性的 5-8 个历史节点/事件（可插入主角的时机）
2. 推荐 3 种不同的开局方案，每种包含：切入角度、主角初始身份、初期目标、前10章大致走向
3. 分析初期可投靠/结交的人物建议（结合人物卡）
4. 指出最有"爽点"的剧情方向（如：从底层逆袭、掌握先知优势、收服名将等）
5. 至少 1000 字，Markdown 格式

已有世界背景（摘要）：${bgText.slice(0, 800)}
已有势力体系（摘要）：${factionText.slice(0, 800)}
已有人物卡（摘要）：${charText.slice(0, 800)}` },
 { role: 'user', content: userPrompt }
 ];
 const plotRes = await electronAPI.ai.chat({ stream: false, bookId, chapterId: '', disableRag: true, disableStyle: true, messages: plotMessages as any });
 const plotText = plotRes?.text?.trim() || '';
 if (!plotText) throw new Error('写点分析生成为空');

 // ── 第5轮：细节素材 ──────────────────────────────────────────────
 setPhase('details');
 setProgress(90);
 const detailMessages = [
 { role: 'system', content: `你是一位专业的小说世界观架构师。基于以下世界设定，生成【细节素材包】。

要求：
1. 官职体系：列出主要官职/爵位及其权力范围
2. 礼仪称谓：日常称呼、尊称、自称的规范
3. 服饰饮食：不同阶层的穿着和饮食特征
4. 武器装备：常见武器、特殊兵器、防具
5. 货币经济：货币单位、物价参考
6. 其他特色素材（如：修炼体系/科技水平/宗教信仰等）
7. 至少 600 字，Markdown 格式

世界背景：${bgText.slice(0, 600)}` },
 { role: 'user', content: userPrompt }
 ];
 const detailRes = await electronAPI.ai.chat({ stream: false, bookId, chapterId: '', disableRag: true, disableStyle: true, messages: detailMessages as any });
 const detailText = detailRes?.text?.trim() || '';

 // ── 组装结果 ──────────────────────────────────────────────────────
 setProgress(100);
 setPhase('done');

 const generatedItems: OutlineSubItem[] = [
 { id: makeId(), title: '时代背景与地理', content: bgText, isDefault: true },
 ];

 // 势力拆分：按 ## 或 ### 标题拆分为独立子项
 const factionSections = splitByHeadings(factionText, '势力');
 for (const sec of factionSections) {
 generatedItems.push({ id: makeId(), title: sec.title, content: sec.content, isDefault: true });
 }

 // 人物拆分：按人物名拆分为独立子项
 const charSections = splitByHeadings(charText, '人物');
 for (const sec of charSections) {
 generatedItems.push({ id: makeId(), title: sec.title, content: sec.content, isDefault: true });
 }

 generatedItems.push({ id: makeId(), title: '写点分析与开局', content: plotText, isDefault: true });
 if (detailText) {
 generatedItems.push({ id: makeId(), title: '细节素材', content: detailText, isDefault: true });
 }

 setResults(generatedItems);

 } catch (err) {
 setPhase('error');
 setErrorMsg(err instanceof Error ? err.message : String(err));
 showIsland({ type: 'error', message: `世界构建失败：${err instanceof Error ? err.message : '未知错误'}` });
 }
 }, [genre, era, extraNotes, bookId, showIsland]);

 const handleApply = useCallback(() => {
 if (results.length === 0) return;
 onSettingsGenerated(results);
 showIsland({ type: 'success', message: `已将 ${results.length} 项世界设定填入大纲`, autoHideMs: 2000 });
 setPhase('idle');
 setResults([]);
 setGenre('');
 setEra('');
 setExtraNotes('');
 }, [results, onSettingsGenerated, showIsland]);

 const isRunning = phase !== 'idle' && phase !== 'done' && phase !== 'error';

 return (
 <div className="flex flex-col gap-4 p-4">
 <div className="flex items-center gap-2">
 <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
 <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity="0.15"/>
 <ellipse cx="12" cy="12" rx="7" ry="2.5"/>
 <ellipse cx="12" cy="12" rx="2.5" ry="7"/>
 <path d="M19 4l1 1 1-1-1-1-1 1z" fill="currentColor" stroke="none"/>
 <path d="M15 8l1 1 1-1-1-1-1 1z" fill="currentColor" stroke="none"/>
 </svg>
 </div>
 <span className="text-sm font-bold text-[var(--text-primary)]">AI 世界观构建器</span>
 </div>
 <p className="text-[10px] text-[var(--text-muted)] -mt-2">
 输入题材方向，AI 将联网搜索真实资料，生成完整的世界设定包（时代背景、势力阵营、关键人物、写点分析、细节素材）。
 </p>

 {/* 输入区 */}
 {phase === 'idle' && (
 <div className="flex flex-col gap-3">
 <div>
 <label className="text-[10px] text-[var(--text-secondary)] font-semibold mb-1 block">题材方向 *</label>
 <input
 type="text"
 value={genre}
 onChange={(e) => setGenre(e.target.value)}
 placeholder="例如：历史争霸、修仙、都市异能、末世生存..."
 className="w-full bg-[var(--surface-strong)] border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded placeholder-[var(--text-muted)]/50"
 />
 </div>
 <div>
 <label className="text-[10px] text-[var(--text-secondary)] font-semibold mb-1 block">时代/世界背景</label>
 <input
 type="text"
 value={era}
 onChange={(e) => setEra(e.target.value)}
 placeholder="例如：晋末衣冠南渡、唐末五代、架空大陆、现代都市..."
 className="w-full bg-[var(--surface-strong)] border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded placeholder-[var(--text-muted)]/50"
 />
 </div>
 <div>
 <label className="text-[10px] text-[var(--text-secondary)] font-semibold mb-1 block">补充要求（可选）</label>
 <textarea
 value={extraNotes}
 onChange={(e) => setExtraNotes(e.target.value)}
 placeholder="例如：主角是穿越者、想写门阀斗争、需要有女主线..."
 rows={3}
 className="w-full bg-[var(--surface-strong)] border border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] rounded placeholder-[var(--text-muted)]/50 resize-none"
 />
 </div>
 <button
 onClick={handleGenerate}
 className="self-start px-4 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white border border-indigo-500/30 hover:from-indigo-500 hover:to-purple-500 transition-all"
 >
 🚀 开始构建世界
 </button>
 </div>
 )}

 {/* 进度区 */}
 {isRunning && (
 <div className="flex flex-col gap-3">
 <div className="flex items-center gap-2">
 <div className="animate-spin w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
 <span className="text-xs text-[var(--accent)] font-semibold">{PHASE_LABELS[phase]}</span>
 </div>
 <div className="w-full h-2 bg-[var(--surface-strong)] border border-[var(--border-color)] overflow-hidden rounded-full">
 <div
 className="h-full bg-[var(--accent)] transition-all duration-500"
 style={{ width: `${progress}%` }}
 />
 </div>
 <p className="text-[9px] text-[var(--text-muted)]">正在多轮生成中，请耐心等待（约 1-3 分钟）...</p>
 </div>
 )}

 {/* 错误 */}
 {phase === 'error' && (
 <div className="flex flex-col gap-2">
 <p className="text-xs text-rose-400">❌ {errorMsg}</p>
 <button
 onClick={() => setPhase('idle')}
 className="self-start px-3 py-1 text-[10px] border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-strong)] rounded"
 >
 重试
 </button>
 </div>
 )}

 {/* 结果预览 */}
 {phase === 'done' && results.length > 0 && (
 <div className="flex flex-col gap-3">
 <div className="flex items-center gap-2">
 <span className="text-xs text-emerald-500 font-bold">✅ 生成完毕！共 {results.length} 个设定模块</span>
 </div>
 <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto premium-scroll">
 {results.map((item) => (
 <div key={item.id} className="border border-[var(--border-color)] bg-[var(--surface)] p-3 rounded">
 <div className="text-[11px] font-bold text-[var(--accent)] mb-1">{item.title}</div>
 <div className="text-[10px] text-[var(--text-secondary)] line-clamp-4 whitespace-pre-wrap">{item.content.slice(0, 200)}...</div>
 </div>
 ))}
 </div>
 <div className="flex gap-2">
 <button
 onClick={handleApply}
 className="px-4 py-2 text-xs font-bold bg-emerald-500 text-white border border-emerald-600 hover:bg-emerald-600 transition-all rounded"
 >
 ✅ 填入大纲设定
 </button>
 <button
 onClick={() => { setPhase('idle'); setResults([]); }}
 className="px-3 py-2 text-[10px] border border-[var(--border-color)] text-[var(--text-muted)] hover:bg-[var(--surface-strong)] rounded"
 >
 重新生成
 </button>
 </div>
 </div>
 )}
 </div>
 );
}
