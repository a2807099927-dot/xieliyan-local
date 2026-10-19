// 模块说明：角色面板纯函数助手。
// 架构定位：从 RolesPanel.tsx 抽离的无状态文本处理工具，不依赖 React 与 store，便于复用与单测。
// 功能：装备/技能详情格式化、详情映射解析、资产名去重。
import { cleanRoleText } from './rolePanelLogic';

// 格式化装备/技能详情：把"攻击：9-17，力量：+5"这种紧凑文本拆成多行，便于阅读
export function formatAssetDetail(text: string): string {
 if (!text) return '';
 const STAT_KEYWORDS = ['攻击', '防御', '敏捷', '力量', '智力', '体质', '精神', '暴击', '命中', '闪避', '耐久', '需要等级', '冷却时间', '消耗', '效果', '范围', '触发', '持续时间', '品阶'];
 let result = text.replace(/\r\n/g, '\n');
 // 在关键属性前换行
 for (const kw of STAT_KEYWORDS) {
 const reg = new RegExp(`[，,；;]\\s*(?=${kw}[：:])`, 'g');
 result = result.replace(reg, '\n');
 }
 return result.replace(/\n{3,}/g, '\n\n').trim();
}

// 解析装备/技能详情映射：接受对象或 JSON 字符串，规整为 {名称:详情} 并过滤空键；解析失败安全返回空对象。
export function parseAssetDetailMap(value: unknown): Record<string, string> {
 if (!value) return {};
 if (typeof value === 'object' && !Array.isArray(value)) {
 return Object.fromEntries(
 Object.entries(value as Record<string, unknown>)
 .map(([key, item]) => [String(key || '').trim(), String(item ?? '').trim()])
 .filter(([key]) => Boolean(key))
 );
 }
 try {
 const parsed = JSON.parse(String(value || '{}')) as unknown;
 return parseAssetDetailMap(parsed);
 } catch {
 return {};
 }
}

// 资产名去重：按 cleanRoleText 清洗后保留首次出现顺序去重，剔除空名。
export function uniqueAssetList(values: string[]): string[] {
 const seen = new Set<string>();
 const out: string[] = [];
 for (const raw of values) {
 const name = cleanRoleText(raw);
 if (!name || seen.has(name)) continue;
 seen.add(name);
 out.push(name);
 }
 return out;
}
