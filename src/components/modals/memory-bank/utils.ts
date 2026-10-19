// 模块说明：记忆库子模块工具函数采集。
// 关键职责： HTML 剔除、时间线排序、伏笔判断、Tab 按钒样式计算与状态颜色推断等公共辅助逻辑。
export function stripHtml(html: string): string {
 return String(html || '').replace(/<[^>]+>/g, '');
}

export function parseTimelineOrder(value: string): number {
 const text = String(value || '').trim();
 const rankMap: Array<[RegExp, number]> = [
 [/(凌晨|清晨|黎明)/, 1],
 [/(早晨|上午)/, 2],
 [/(中午|午间|午后)/, 3],
 [/(下午)/, 4],
 [/(傍晚|黄昏)/, 5],
 [/(夜晚|晚上)/, 6],
 [/(深夜|午夜)/, 7]
 ];

 const explicitTime = text.match(/(\d{1,2})[:：点时]?(\d{1,2})?/);
 if (explicitTime) {
 const h = Number(explicitTime[1] || 0);
 const m = Number(explicitTime[2] || 0);
 return h * 60 + m;
 }

 for (const [reg, rank] of rankMap) {
 if (reg.test(text)) return rank * 100;
 }

 return 999;
}

export function isForeshadowLike(text: string): boolean {
 return /(伏笔|铺垫|暗线|回收|线索|埋下|呼应)/.test(String(text || ''));
}

export function tabButtonClass(active: boolean): string {
 return active
 ? 'border-b-2 border-[var(--accent)] text-[var(--text-primary)]'
 : 'border-b-2 border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]';
}

export function inferStatusColor(status: string): string {
 if (status === '已埋伏笔' || status === '已埋线索') return 'bg-sky-500/16 text-sky-300 border-sky-500/35';
 if (status === '疑似伏笔' || status === '疑似线索') return 'bg-violet-500/16 text-violet-300 border-violet-500/35';
 if (status === '已回收') return 'bg-emerald-500/16 text-emerald-300 border-emerald-500/35';
 if (status === '已闭环') return 'bg-emerald-500/16 text-emerald-300 border-emerald-500/35';
 if (status === '待推进') return 'bg-amber-500/16 text-amber-300 border-amber-500/35';
 return 'bg-sky-500/16 text-sky-300 border-sky-500/35';
}
