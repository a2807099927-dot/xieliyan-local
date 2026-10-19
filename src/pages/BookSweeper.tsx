import { sanitizeHtml } from '../utils/sanitizeHtml';
import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { tauriAPI } from '../utils/tauri-bridge';

// 起点榜单分类
const QIDIAN_RANKS = [
 { id: 'sanjiang', name: '三江推荐', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> },
 { id: 'newbook', name: '新书榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
 { id: 'newsign', name: '签约榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
 { id: 'newp', name: '新锐人气', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
 { id: 'yuepiao', name: '月票榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg> },
 { id: 'hotsales', name: '畅销榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg> },
 { id: 'recom', name: '推荐榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg> },
];

// 番茄榜单分类 - 默认定位极具研究价值的“新秀/新书榜”
const FANQIE_RANKS = [
 { id: '1_1', name: '男频新秀榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
 { id: '2_1', name: '女频新秀榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg> },
 { id: '1_2', name: '男频最热榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg> },
 { id: '2_2', name: '女频最热榜', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg> },
];

// 番茄男频分类
const MALE_CATEGORIES = [
 { id: '1141', name: '西幻' },
 { id: '1140', name: '东方仙侠' },
 { id: '258', name: '传统玄幻' },
 { id: '257', name: '玄幻脑洞' },
 { id: '1014', name: '都市高武' },
 { id: '261', name: '都市日常' },
 { id: '262', name: '都市脑洞' },
 { id: '124', name: '都市修真' },
 { id: '263', name: '都市种田' },
 { id: '273', name: '历史古代' },
 { id: '272', name: '历史脑洞' },
 { id: '8', name: '科幻末世' },
 { id: '539', name: '悬疑脑洞' },
 { id: '751', name: '悬疑灵异' },
 { id: '746', name: '游戏体育' },
 { id: '718', name: '动漫衍生' },
 { id: '1016', name: '男频衍生' },
];

// 番茄女频分类
const FEMALE_CATEGORIES = [
 { id: '1139', name: '古风世情' },
 { id: '253', name: '古言脑洞' },
 { id: '246', name: '宫斗宅斗' },
 { id: '248', name: '玄幻言情' },
 { id: '267', name: '现言脑洞' },
 { id: '749', name: '青春甜宠' },
 { id: '748', name: '豪门总裁' },
 { id: '750', name: '职场婚恋' },
 { id: '23', name: '种田' },
 { id: '79', name: '年代' },
 { id: '24', name: '快穿' },
 { id: '8', name: '科幻末世' },
 { id: '539', name: '悬疑脑洞' },
 { id: '747', name: '女频悬疑' },
 { id: '745', name: '星光璀璨' },
 { id: '746', name: '游戏体育' },
 { id: '1015', name: '女频衍生' },
 { id: '1017', name: '民国言情' },
];

// 番茄小说自定义混淆字形解密映射表 (100% 完美反混淆)
const FANQIE_DECRYPT_MAP: Record<number, string> = {
 58344: 'd', 58345: '在', 58346: '主', 58347: '特', 58348: '家', 58349: '军', 58350: '然', 58351: '表', 58352: '场', 58353: '4',
 58354: '要', 58355: '只', 58356: 'v', 58357: '和', 58359: '6', 58360: '别', 58361: '还', 58362: 'g', 58363: '现', 58364: '儿',
 58365: '岁', 58368: '此', 58369: '象', 58370: '月', 58371: '3', 58372: '出', 58373: '战', 58374: '工', 58375: '相', 58376: 'o',
 58377: '男', 58378: '直', 58379: '失', 58380: '世', 58381: 'F', 58382: '都', 58383: '平', 58384: '文', 58385: '什', 58386: 'v',
 58387: 'o', 58388: '将', 58389: '真', 58390: 't', 58391: '那', 58392: '当', 58394: '会', 58395: '立', 58396: '些', 58397: 'u',
 58398: '是', 58399: '十', 58400: '张', 58401: '学', 58402: '气', 58403: '大', 58404: '爱', 58405: '两', 58406: '命', 58407: '全',
 58408: '后', 58409: '东', 58410: '性', 58411: '通', 58412: '被', 58413: '1', 58414: '它', 58415: '乐', 58416: '接', 58417: '源',
 58418: '感', 58419: '车', 58420: '山', 58421: '公', 58422: '了', 58423: '常', 58424: '以', 58425: '何', 58426: '可', 58427: '话',
 58428: '先', 58429: 'p', 58430: 'i', 58431: '叫', 58432: '轻', 58433: 'm', 58434: '土', 58435: 'w', 58436: '着', 58437: '变',
 58438: '尔', 58439: '快', 58440: 'l', 58441: '个', 58442: '说', 58443: '少', 58444: '色', 58445: '里', 58446: '安', 58447: '花',
 58448: '远', 58449: '7', 58450: '难', 58451: '师', 58452: '放', 58453: 't', 58454: '报', 58455: '认', 58456: '面', 58457: '道',
 58458: 's', 58460: '克', 58461: '地', 58462: '度', 58463: 'l', 58464: '好', 58465: '机', 58466: 'U', 58467: '民', 58468: '写',
 58469: '把', 58470: '万', 58471: '同', 58472: '水', 58473: '新', 58474: '没', 58475: '书', 58476: '电', 58477: '吃', 58478: '像',
 58479: '斯', 58480: '5', 58481: '为', 58482: 'y', 58483: '自', 58484: '几', 58485: '日', 58486: '教', 58487: '看', 58488: '但',
 58489: '第', 58490: '加', 58491: '候', 58492: '作', 58493: '上', 58494: '拉', 58495: '住', 58496: '有', 58497: '法', 58498: 'r',
 58499: '事', 58500: '应', 58501: '位', 58502: '利', 58503: '你', 58504: '声', 58505: '身', 58506: '国', 58507: '问', 58508: '马',
 58509: '女', 58510: '他', 58511: 'y', 58512: '比', 58513: '父', 58514: 'x', 58515: 'a', 58516: 'H', 58517: 'N', 58518: 's',
 58519: 'x', 58520: '边', 58521: '美', 58522: '对', 58523: '所', 58524: '金', 58525: '活', 58526: '回', 58527: '意', 58528: '到',
 58529: 'z', 58530: '从', 58531: 'j', 58532: '知', 58533: '又', 58534: '内', 58535: '因', 58536: '点', 58537: 'Q', 58538: '三',
 58539: '定', 58540: '8', 58541: 'r', 58542: 'b', 58543: '正', 58544: '或', 58545: '夫', 58546: '向', 58547: '德', 58548: '听',
 58549: '更', 58551: '得', 58552: '告', 58553: '并', 58554: '本', 58555: 'q', 58556: '过', 58557: '记', 58558: 'L', 58559: '让',
 58560: '打', 58561: 'f', 58562: '人', 58563: '就', 58564: '者', 58565: '去', 58566: '原', 58567: '满', 58568: '体', 58569: '做',
 58570: '经', 58571: 'k', 58572: '走', 58573: '如', 58574: '孩', 58575: 'c', 58576: 'g', 58577: '给', 58578: '使', 58579: '物',
 58581: '最', 58582: '笑', 58583: '部', 58585: '员', 58586: '等', 58587: '受', 58588: 'k', 58589: '行', 58590: '一', 58591: '条',
 58592: '果', 58593: '动', 58594: '光', 58595: '门', 58596: '头', 58597: '见', 58598: '往', 58599: '自', 58600: '解', 58601: '成',
 58602: '处', 58603: '天', 58604: '能', 58605: '于', 58606: '名', 58607: '其', 58608: '发', 58609: '总', 58610: '母', 58611: '的',
 58612: '死', 58613: '手', 58614: '入', 58615: '路', 58616: '进', 58617: '心', 58618: '来', 58619: 'h', 58620: '时', 58621: '力',
 58622: '多', 58623: '开', 58624: '已', 58625: '许', 58626: 'd', 58627: '至', 58628: '由', 58629: '很', 58630: '界', 58631: 'n',
 58632: '小', 58633: '与', 58634: 'z', 58635: '想', 58636: '代', 58637: '么', 58638: '分', 58639: '生', 58640: '口', 58641: '再',
 58642: '妈', 58643: '望', 58644: '次', 58645: '西', 58646: '风', 58647: '种', 58648: '带', 58649: 'J', 58651: '实', 58652: '情',
 58653: '才', 58654: '这', 58656: 'e', 58657: '我', 58658: '神', 58659: '格', 58660: '长', 58661: '觉', 58662: '间', 58663: '年',
 58664: '眼', 58665: '无', 58666: '不', 58667: '亲', 58668: '关', 58669: '结', 58670: '0', 58671: '友', 58672: '信', 58673: '下',
 58674: '却', 58675: '重', 58676: '己', 58677: '老', 58678: '2', 58679: '音', 58680: '字', 58681: 'm', 58682: '呢', 58683: '明',
 58684: '之', 58685: '前', 58686: '高', 58687: 'p', 58688: 'b', 58689: '目', 58690: '太', 58691: 'e', 58692: '9', 58693: '起',
 58694: '棱', 58695: '她', 58696: '也', 58697: 'w', 58698: '用', 58699: '方', 58700: '子', 58701: '英', 58702: '每', 58703: '理',
 58704: '便', 58705: '四', 58706: '数', 58707: '期', 58708: '中', 58709: 'c', 58710: '外', 58711: '样', 58712: 'a', 58713: '海',
 58714: '们', 58715: '任'
};

function decryptFanqieText(str: string): string {
 if (!str) return "";
 let res = "";
 for (let i = 0; i < str.length; i++) {
 const code = str.charCodeAt(i);
 if (FANQIE_DECRYPT_MAP[code]) {
 res += FANQIE_DECRYPT_MAP[code];
 } else {
 res += str[i];
 }
 }
 return res;
}

function formatCount(n: number): string {
 if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
 if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
 return n.toLocaleString();
}

interface BookItem {
 id: string;
 title: string;
 author: string;
 category: string;
 description: string;
 rankNum: number;
 extraInfo?: string;
 coverUrl?: string;
 collectCount?: number; // 起点三江榜收藏数
 readCount?: number; // 番茄在读人数
}

export default function BookSweeper() {
 const [activePlatform, setActivePlatform] = useState<'qidian' | 'fanqie'>('qidian');
 const [activeRankId, setActiveRankId] = useState<string | number>('sanjiang');
 const [activeCategoryId, setActiveCategoryId] = useState<string>('1141');
 const [books, setBooks] = useState<BookItem[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // AI 报告状态
 const [aiReport, setAiReport] = useState<string | null>(null);
 const [aiLoading, setAiLoading] = useState(false);
 const [showAiModal, setShowAiModal] = useState(false);

 // 侧边栏书籍详情及章节阅读状态
 const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
 const [chapters, setChapters] = useState<any[]>([]);
 const [chaptersLoading, setChaptersLoading] = useState(false);
 const [chaptersError, setChaptersError] = useState<string | null>(null);

 const [currentChapter, setCurrentChapter] = useState<{ id: string; title: string; vip: boolean } | null>(null);
 const [chapterContent, setChapterContent] = useState<string>('');
 const [contentLoading, setContentLoading] = useState(false);
 const [contentError, setContentError] = useState<string | null>(null);

 const [readerTheme, setReaderTheme] = useState<'dark' | 'light' | 'sepia'>('dark');
 const [readerFontSize, setReaderFontSize] = useState<number>(16);

 // AI 章节技法分析
 const [techniqueReport, setTechniqueReport] = useState<string | null>(null);
 const [techniqueLoading, setTechniqueLoading] = useState(false);
 const [showTechniquePanel, setShowTechniquePanel] = useState(false);
 const [showTechniqueMenu, setShowTechniqueMenu] = useState(false);

 // 抓取榜单数据
 const fetchData = async (platform: 'qidian' | 'fanqie', rankId: string | number, categoryId?: string) => {
 setLoading(true);
 setError(null);
 setSelectedBook(null); // 关闭旧面板
 try {
 if (platform === 'qidian') {
 const records = await tauriAPI.system.fetchQidianRank(String(rankId));
 if (Array.isArray(records)) {
 const mapped: BookItem[] = records.map((item: any, idx: number) => {
 const bid = item.bid || item.bookId;
 const coverUrl = bid 
 ? `https://bookcover.yuewen.com/qdbimg/349573/${bid}/180`
 : undefined;
 return {
 id: String(bid || idx),
 title: item.bName || item.bookName || '未知书名',
 author: item.bAuth || item.authorName || '未知作者',
 category: item.catName || item.cat || '其它',
 description: item.desc || item.description || '暂无简介描述...',
 rankNum: item.rankNum || idx + 1,
 extraInfo: item.cnt || item.wordCount || undefined,
 coverUrl,
 collectCount: item.collect ? Number(item.collect) : undefined,
 };
 });
 setBooks(mapped);
 } else {
 setBooks([]);
 }
 } else {
 const list = await tauriAPI.system.fetchFanqieRank(String(rankId), categoryId);
 if (Array.isArray(list)) {
 const mapped: BookItem[] = list.map((item: any, idx: number) => ({
 id: item.bookId || String(idx),
 title: decryptFanqieText(item.bookName || '未知书名'),
 author: decryptFanqieText(item.author || '未知作者'),
 category: decryptFanqieText(item.category || '其它'),
 description: decryptFanqieText(item.abstract || '暂无简介描述...'),
 rankNum: idx + 1,
 extraInfo: item.score ? `${item.score}分` : undefined,
 coverUrl: item.thumbUri || undefined,
 readCount: item.read_count ? Number(item.read_count) : undefined,
 }));
 setBooks(mapped);
 } else {
 setBooks([]);
 }
 }
 } catch (err: any) {
 console.error(err);
 setError(err?.message || String(err) || '抓取榜单数据失败，请重试');
 } finally {
 setLoading(false);
 }
 };

 // 监听平台、榜单和分类切换
 useEffect(() => {
 fetchData(activePlatform, activeRankId, activeCategoryId);
 }, [activePlatform, activeRankId, activeCategoryId]);

 const handlePlatformChange = (platform: 'qidian' | 'fanqie') => {
 setActivePlatform(platform);
 setActiveCategoryId('1141');
 if (platform === 'qidian') {
 setActiveRankId('sanjiang');
 } else {
 setActiveRankId('1_1'); // 默认男频新秀榜，极具研究价值
 }
 };

 // 监听书籍详情页，抓取章节目录
 useEffect(() => {
 if (!selectedBook) {
 setChapters([]);
 setChaptersError(null);
 setCurrentChapter(null);
 return;
 }

 const loadChapters = async () => {
 setChaptersLoading(true);
 setChaptersError(null);
 try {
 if (activePlatform === 'qidian') {
 const [vs, fullDesc] = await Promise.all([
 tauriAPI.system.fetchQidianChapters(selectedBook.id),
 tauriAPI.system.fetchQidianDescription(selectedBook.id).catch(() => null)
 ]);

 if (fullDesc) {
 setSelectedBook(prev => prev ? { ...prev, description: fullDesc } : null);
 }

 if (Array.isArray(vs)) {
 // 起点按卷层级封装
 const formatted = vs.map((vol: any) => ({
 volumeName: vol.vN || '正文卷',
 chapters: (vol.cs || []).map((ch: any) => {
 // id 可能是数字或字符串，统一转为非空字符串
 const rawId = ch.id ?? ch.cId ?? ch.cid ?? ch.chapterId ?? '';
 const id = rawId === 0 ? '0' : String(rawId || '');
 return {
 id,
 title: ch.cN || ch.name || '',
 vip: ch.sS === 0,
 };
 }).filter((ch: any) => ch.id && ch.id !== 'undefined' && ch.id !== 'null' && ch.id !== ''),
 }));
 setChapters(formatted);
 } else {
 setChapters([]);
 }
 } else {
 const list = await tauriAPI.system.fetchFanqieChapters(selectedBook.id);
 if (Array.isArray(list)) {
 // 平铺的番茄目录按照 volume_name 聚合
 const groups: Record<string, any[]> = {};
 
 // 递归展开嵌套的双重章节数组
 const flatList: any[] = [];
 list.forEach((item: any) => {
 if (Array.isArray(item)) {
 flatList.push(...item);
 } else {
 flatList.push(item);
 }
 });

 flatList.forEach((ch: any) => {
 const volName = decryptFanqieText(ch.volume_name || ch.volumeName || '正文默认卷');
 if (!groups[volName]) groups[volName] = [];
 groups[volName].push({
 id: String(ch.itemId || ch.id),
 title: decryptFanqieText(ch.title),
 vip: ch.needPay === 1 || ch.isChapterLock === true,
 });
 });
 const formatted = Object.keys(groups).map(volName => ({
 volumeName: volName,
 chapters: groups[volName],
 }));
 setChapters(formatted);
 } else {
 setChapters([]);
 }
 }
 } catch (err: any) {
 console.error(err);
 setChaptersError(err?.message || String(err) || '加载目录失败');
 } finally {
 setChaptersLoading(false);
 }
 };

 loadChapters();
 }, [selectedBook?.id, activePlatform]);

 // 监听章节阅读，抓取章节正文
 useEffect(() => {
 if (!currentChapter || !selectedBook) {
 setChapterContent('');
 setContentError(null);
 return;
 }

 // 切换章节时清除旧的技法分析
 setTechniqueReport(null);
 setShowTechniquePanel(false);

 const loadContent = async () => {
 setContentLoading(true);
 setContentError(null);
 try {
 if (!currentChapter.id) throw new Error('章节 ID 为空');
 if (activePlatform === 'qidian') {
 const content = await tauriAPI.system.fetchQidianChapterContent(selectedBook.id, currentChapter.id);
 setChapterContent(content);
 } else {
 const rawContent = await tauriAPI.system.fetchFanqieChapterContent(currentChapter.id);
 const decrypted = decryptFanqieText(rawContent);
 setChapterContent(decrypted);
 }
 } catch (err: any) {
 console.error(err);
 setContentError(err?.message || String(err) || '加载章节内容失败，该章节可能为 VIP 收费章节。');
 } finally {
 setContentLoading(false);
 }
 };

 loadContent();
 }, [currentChapter]);

 // 生成 AI 题材风向报告
 const generateAiReport = async () => {
 if (books.length === 0) return;
 setAiLoading(true);
 setAiReport(null);
 setShowAiModal(true);

 const platformName = activePlatform === 'qidian' ? '起点中文网' : '番茄小说';
 const rankName = activePlatform === 'qidian' 
 ? QIDIAN_RANKS.find(r => r.id === activeRankId)?.name 
 : FANQIE_RANKS.find(r => r.id === activeRankId)?.name;

 const dataSnapshot = books.slice(0, 15).map(b => ({
 排名: b.rankNum,
 书名: b.title,
 作者: b.author,
 分类: b.category,
 核心数据: b.extraInfo || '',
 简介: b.description.slice(0, 100),
 }));

 const systemPrompt = `你是一位顶尖的网文行业分析师和网文大主编。请针对以下抓取的 ${platformName}【${rankName}】前15名作品的最新实时数据进行极深度的“网文题材风向洞察报告”。`;

 const userPrompt = `
以下是实时抓取的书籍排行数据：
${JSON.stringify(dataSnapshot, null, 2)}

请为创作者输出一份包含以下核心维度的实战洞察报告：
1. 【市场核心爆款题材 & 设定归纳】：当前上榜作品最热的二级细分题材、最核心的高频金手指类型/标签系统（如：长生、情报系统、爽文、反派）是什么？
2. 【爆款主角人设 & 核心冲突】：当前最受读者欢迎的主角性格特征（如：苟道稳健、极致利己、幽默老六、杀伐果断）与核心剧情冲突（如：家族修仙、反派自救）是什么？
3. 【黄金三章与爽点设计要诀】：结合以上书籍的简介，总结当前最容易抓住读者目光的开局与前期的爽点节奏逻辑。
4. 【网文开新书决策指南】：对于写作者，给出红海需要规避的类型和推荐尝试的细分题材，并推荐1个具体的极具创意的新书选题、人设与外挂设计方案。

要求：
- 语言风格：专业、具有实战借鉴意义、一针见血，避免废话。
- 格式：使用非常高档且清晰的 Markdown 结构，多使用加粗、列表，让报告富有专业权威度。
`;

 try {
 const messages = [
 { role: 'system', content: systemPrompt },
 { role: 'user', content: userPrompt },
 ];
 
 const resp = await tauriAPI.ai.chat({
 messages,
 
 });
 setAiReport(resp.text || '生成报告失败，请检查网络或 AI 接口连接情况。');
 } catch (err: any) {
 console.error(err);
 setAiReport(`生成报告出错: ${err?.message || String(err)}`);
 } finally {
 setAiLoading(false);
 }
 };

 // AI 技法分析
 const analyzeChapterTechnique = async (chapterCount: number = 1) => {
 if (!chapterContent || techniqueLoading || !currentChapter || !selectedBook) return;

 // VIP 门控
 const { requireFeatureAccess } = await import('../utils/featureCheck');
 if (!(await requireFeatureAccess('sweeper'))) {
 return;
 }

 setTechniqueLoading(true);
 setTechniqueReport(null);
 setShowTechniquePanel(true);

 // 收集多章内容
 const currentIdx = chapters.findIndex((ch: any) => ch.id === currentChapter.id);
 const chaptersToAnalyze = chapters.slice(currentIdx, currentIdx + chapterCount);
 const allTexts: string[] = [];

 // 当前章内容已有
 allTexts.push(`【${currentChapter.title}】\n${chapterContent.replace(/<[^>]+>/g, '')}`);

 // 加载后续章节内容
 for (let i = 1; i < chaptersToAnalyze.length; i++) {
 const ch = chaptersToAnalyze[i];
 try {
 let content = '';
 if (activePlatform === 'qidian') {
 content = await tauriAPI.system.fetchQidianChapterContent(selectedBook.id, ch.id);
 } else {
 const raw = await tauriAPI.system.fetchFanqieChapterContent(ch.id);
 content = decryptFanqieText(raw);
 }
 allTexts.push(`【${ch.title}】\n${content.replace(/<[^>]+>/g, '')}`);
 } catch {
 allTexts.push(`【${ch.title}】\n（加载失败，跳过）`);
 }
 }

 const fullText = allTexts.join('\n\n---\n\n');
 const chapterTitles = chaptersToAnalyze.map((ch: any) => ch.title).join('、');

 try {
 // 从 Rust 后端获取提示词（编译进二进制，前端不暴露）
 const prompts = await (window as any).__TAURI_INTERNALS__?.invoke('get_technique_analysis_prompt', {
 chapterTitles,
 chapterCount,
 fullText
 });
 const resp = await tauriAPI.ai.chat({
 messages: [
 { role: 'system', content: prompts.systemPrompt },
 { role: 'user', content: prompts.userPrompt },
 ],
 });
 setTechniqueReport(resp.text || '分析失败，请检查 AI 接口。');
 } catch (err: any) {
 setTechniqueReport(`分析出错: ${err?.message || String(err)}`);
 } finally {
 setTechniqueLoading(false);
 }
 };

 // 渲染章节正文（自适应纯文本及段落 HTML）
 const renderChapterContentText = () => {
 if (!chapterContent) return null;
 if (chapterContent.includes('<p>')) {
 return (
 <div 
 className="space-y-4"
 dangerouslySetInnerHTML={{ __html: sanitizeHtml(chapterContent) }} 
 />
 );
 } else {
 return (
 <div className="space-y-4">
 {chapterContent.split('\n').map((para, idx) => {
 const trimmed = para.trim();
 if (!trimmed) return null;
 return <p key={idx}>{trimmed}</p>;
 })}
 </div>
 );
 }
 };

 const closeWindow = () => {
 (window as any).__TAURI_INTERNALS__?.invoke('window_close');
 };

 return (
 <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-secondary,_#16161a)] font-sans text-[var(--text-primary,_#ffffff)] subpixel-antialiased selection:bg-[var(--accent)]/40 selection:text-white transition-all duration-300">
 {/* 顶部 Flat 无边框拖拽栏 */}
 <header className="wz-titlebar flex h-11 shrink-0 select-none items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary,_#16161a)] px-4 z-[900]">
 <div className="flex items-center gap-2">
 <div className="flex items-center gap-1.5 text-[var(--accent)]">
 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12z"/><path d="M12 2A15.3 15.3 0 0 1 16 12A15.3 15.3 0 0 1 12 22A15.3 15.3 0 0 1 8 12A15.3 15.3 0 0 1 12 2z"/><path d="M2 12L22 12"/>
 </svg>
 <span className="text-sm font-bold tracking-wide">网文风向标</span>
 </div>
 <span className="text-[9px] rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1.5 py-0.5 text-[var(--accent)] font-bold uppercase tracking-wider ml-1">扫榜神器</span>
 </div>
 
 {/* 平台选择器 Tabs */}
 <div className="flex rounded border border-[var(--border-color)] bg-[var(--surface-strong)] p-0.5 scale-90">
 <button
 onClick={() => handlePlatformChange('qidian')}
 className={clsx(
 'px-4 py-1 text-xs font-semibold rounded transition-all duration-200',
 activePlatform === 'qidian' 
 ? 'bg-[var(--accent)] text-white shadow-sm' 
 : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
 )}
 >
 起点中文网
 </button>
 <button
 onClick={() => handlePlatformChange('fanqie')}
 className={clsx(
 'px-4 py-1 text-xs font-semibold rounded transition-all duration-200',
 activePlatform === 'fanqie' 
 ? 'bg-[var(--accent)] text-white shadow-sm' 
 : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
 )}
 >
 番茄小说
 </button>
 </div>

 {/* 顶部控制按钮 */}
 <div className="flex items-center gap-2">
 <button
 onClick={closeWindow}
 className="wz-control-btn flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] transition-colors"
 title="关闭窗口"
 >
 <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>
 </header>

 {/* 主体工作区 */}
 <div className="flex flex-1 overflow-hidden">
 {/* 左侧榜单导航栏 */}
 <aside className="w-52 shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 premium-scroll overflow-y-auto">
 <div className="mb-4 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] pl-1 opacity-80">
 热度排行榜分类
 </div>
 <nav className="flex flex-col gap-1.5">
 {activePlatform === 'qidian' ? (
 QIDIAN_RANKS.map(rank => (
 <button
 key={rank.id}
 onClick={() => setActiveRankId(rank.id)}
 className={clsx(
 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-all duration-200',
 activeRankId === rank.id
 ? 'bg-[var(--surface-strong)] text-[var(--accent)] shadow-[inset_3px_0_0_var(--accent)] font-bold'
 : 'text-[var(--text-secondary)] font-semibold hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
 )}
 >
 <span className="text-sm">{rank.icon}</span>
 <span>{rank.name}</span>
 </button>
 ))
 ) : (
 FANQIE_RANKS.map(rank => (
 <button
 key={rank.id}
 onClick={() => setActiveRankId(rank.id)}
 className={clsx(
 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-all duration-200',
 activeRankId === rank.id
 ? 'bg-[var(--surface-strong)] text-[var(--accent)] shadow-[inset_3px_0_0_var(--accent)] font-bold'
 : 'text-[var(--text-secondary)] font-semibold hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
 )}
 >
 <span className="text-sm">{rank.icon}</span>
 <span>{rank.name}</span>
 </button>
 ))
 )}
 </nav>
 </aside>

 {/* 右侧主面板 */}
 <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
 {/* 排行顶部控制条 */}
 <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/30 px-6">
 <div className="flex items-center gap-2">
 <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
 当前数据源：
 </span>
 <span className="text-[10px] font-bold rounded-full bg-[var(--surface-strong)] border border-[var(--border-color)] px-2 py-0.5 text-[var(--text-primary)]">
 {activePlatform === 'qidian' ? '起点手机端 JSON 数据源' : '番茄 HTML 反爬逆向解密数据源'}
 </span>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={() => fetchData(activePlatform, activeRankId)}
 disabled={loading}
 className={clsx(
 "flex items-center gap-1.5 rounded bg-[var(--surface)] hover:bg-[var(--surface-strong)] border border-[var(--border-color)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all duration-200 disabled:opacity-50",
 loading && "cursor-not-allowed"
 )}
 >
 <svg className={clsx("h-3.5 w-3.5", loading && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
 </svg>
 <span>刷新数据</span>
 </button>

 <button
 onClick={generateAiReport}
 disabled={loading || books.length === 0}
 className="flex items-center gap-1.5 rounded bg-[var(--accent)] hover:brightness-110 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <path d="M21 12c-2.4 0-4.6.9-6.4 2.4-1.8-1.5-4-2.4-6.4-2.4-2.4 0-4.6.9-6.4 2.4V4c1.8-1.5 4-2.4 6.4-2.4 2.4 0 4.6.9 6.4 2.4v10.4z"/>
 <path d="M14.6 14.4L18 21l-3.4-6.6zM9.4 14.4L6 21l3.4-6.6z"/>
 </svg>
 <span>AI 风向报告</span>
 </button>
 </div>
 </div>

 {/* 番茄分类的横向滑移药丸过滤器 */}
 {activePlatform === 'fanqie' && (
 <div className="flex shrink-0 flex-wrap items-center border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/10 px-6 py-2 gap-2">
 {(activeRankId === '1_1' || activeRankId === '1_2' ? MALE_CATEGORIES : FEMALE_CATEGORIES).map((cat) => (
 <button
 key={cat.id}
 onClick={() => setActiveCategoryId(cat.id)}
 className={clsx(
 'whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200',
 activeCategoryId === cat.id
 ? 'bg-[var(--accent)] text-white shadow-sm'
 : 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--surface-strong)] hover:text-[var(--accent)]'
 )}
 >
 {cat.name}
 </button>
 ))}
 </div>
 )}

 {/* 列表主体区域 */}
 <div className="flex-1 overflow-y-auto px-6 py-4">
 {loading ? (
 <div className="flex h-64 w-full flex-col items-center justify-center gap-3">
 <div className="h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
 <span className="text-xs font-medium text-[var(--text-secondary)]">正在实时抓取并解密最新榜单数据...</span>
 </div>
 ) : error ? (
 <div className="flex h-64 w-full flex-col items-center justify-center gap-4 text-center">
 <span className="text-3xl">⚠️</span>
 <div className="text-sm font-semibold text-red-400">{error}</div>
 <button
 onClick={() => fetchData(activePlatform, activeRankId)}
 className="rounded bg-purple-600 hover:bg-purple-500 px-4 py-1 text-xs font-medium text-white transition-colors"
 >
 重试抓取
 </button>
 </div>
 ) : books.length === 0 ? (
 <div className="flex h-64 w-full items-center justify-center text-xs text-[var(--text-muted)]">
 暂无排行数据
 </div>
 ) : (
 <div className="grid grid-cols-1 gap-3 pb-8">
 {books.map((book) => (
 <div
 key={book.id}
 onClick={() => setSelectedBook(book)}
 className="group relative flex items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--surface)] px-4 py-3 transition-all duration-300 hover:border-[var(--accent)]/50 hover:bg-[var(--surface-strong)] hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
 >
 {/* 左侧：排名、封面图、书名信息 */}
 <div className="flex flex-1 items-center gap-4 overflow-hidden">
 {/* 排名徽章 */}
 <div className="flex h-8 w-8 shrink-0 items-center justify-center">
 {book.rankNum === 1 ? (
 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-400">1</span>
 ) : book.rankNum === 2 ? (
 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-400/20 border border-slate-400/30 text-xs font-bold text-slate-300">2</span>
 ) : book.rankNum === 3 ? (
 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-700/20 border border-amber-700/30 text-xs font-bold text-amber-600">3</span>
 ) : (
 <span className="text-xs font-semibold text-[var(--text-muted)]">{book.rankNum}</span>
 )}
 </div>

 {/* 封面缩略图 */}
 {book.coverUrl ? (
 <div className="h-[88px] w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] shadow-md">
 <img
 src={book.coverUrl}
 alt={book.title}
 className="h-full w-full object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).style.display = 'none';
 }}
 />
 </div>
 ) : (
 <div className="flex h-[88px] w-16 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-muted)] shadow-md">
 <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
 </div>
 )}

 {/* 标题 & 作者信息 */}
 <div className="flex flex-col gap-1 overflow-hidden pr-4">
 <div className="flex items-center gap-2 overflow-hidden">
 <span className="truncate text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
 {book.title}
 </span>
 <span className="shrink-0 rounded-full border border-[var(--border-color)] bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] font-semibold">
 {book.category}
 </span>
 </div>
 <div className="text-xs text-[var(--text-secondary)] truncate">
 <span>作者：{book.author}</span>
 </div>
 </div>
 </div>

 {/* 中间：书籍简介描述 */}
 <div className="hidden md:block flex-[2.2] px-6 text-xs text-[var(--text-secondary)] line-clamp-2 transition-all duration-300 group-hover:text-[var(--text-primary)]">
 {book.description}
 </div>

 {/* 右侧：数值标签 */}
 <div className="shrink-0 text-right pr-2 flex flex-col items-end gap-1.5">
 {/* 起点三江：收藏人数 */}
 {book.collectCount != null && (
 <span className="flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-rose-300">
 <span>♥</span>
 <span>{formatCount(book.collectCount)}收藏</span>
 </span>
 )}
 {/* 番茄：在读人数 */}
 {book.readCount != null && (
 <span className="flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-sky-300">
 <span>👁</span>
 <span>{formatCount(book.readCount)}在读</span>
 </span>
 )}
 {/* 通用字数标签 */}
 {book.extraInfo && book.collectCount == null && book.readCount == null && (
 <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-purple-300">
 {book.extraInfo}
 </span>
 )}
 {!book.extraInfo && book.collectCount == null && book.readCount == null && (
 <span className="text-[10px] font-bold text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">查阅作品 →</span>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>

 {/* 侧边书籍详情及免费章节滑动面板 (极度高档的 Glassmorphism) */}
 <div
 className={clsx(
 "absolute inset-y-0 right-0 z-40 flex w-[550px] flex-col border-l border-[var(--border-color)] bg-white/95 dark:bg-[#0f1115]/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 ease-out selection:bg-purple-500/30 selection:text-purple-900 dark:selection:bg-purple-500/40 dark:selection:text-purple-100"
 )}
 style={{
 transform: selectedBook ? 'translateX(0)' : 'translateX(100%)'
 }}
 >
 {selectedBook && (
 <>
 {/* 侧边栏头部 */}
 <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border-color)] bg-white/50 dark:bg-[#0f1115]/50 px-6 select-none">
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 if (currentChapter) {
 setCurrentChapter(null);
 } else {
 setSelectedBook(null);
 }
 }}
 className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--surface-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-colors"
 >
 <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
 </svg>
 </button>
 <span className="text-xs font-semibold text-[var(--text-primary)]">
 {currentChapter ? '章节正文阅读' : '书籍详情与免费章节'}
 </span>
 </div>
 <button
 onClick={() => setSelectedBook(null)}
 className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] transition-colors"
 >
 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 {/* 侧边栏主内容区 */}
 <div className="flex-1 overflow-y-auto">
 {!currentChapter ? (
 // 书籍详情 & 目录模式
 <div className="p-6 space-y-6">
 {/* 书籍名片 */}
 <div className="flex gap-4">
 {selectedBook.coverUrl ? (
 <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-800 shadow-lg">
 <img
 src={selectedBook.coverUrl}
 alt={selectedBook.title}
 className="h-full w-full object-cover"
 />
 </div>
 ) : (
 <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-slate-800 text-xl shadow-lg">
 📕
 </div>
 )}
 <div className="flex flex-col justify-between py-1">
 <div className="space-y-1">
 <h2 className="text-base font-bold text-[var(--text-primary)] line-clamp-1">{selectedBook.title}</h2>
 <p className="text-xs text-[var(--text-secondary)]">作者：{selectedBook.author}</p>
 <p className="text-xs text-[var(--text-secondary)]">分类：{selectedBook.category}</p>
 </div>
 {selectedBook.extraInfo && (
 <div>
 <span className="inline-block rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-300">
 {selectedBook.extraInfo}
 </span>
 </div>
 )}
 </div>
 </div>

 {/* 简介 */}
 <div className="space-y-2">
 <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">作品简介</h3>
 <p className="text-xs leading-relaxed text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border-color)] rounded-lg p-3">
 {selectedBook.description}
 </p>
 </div>

 {/* 章节目录列表 */}
 <div className="space-y-3">
 <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
 免费章节目录
 </h3>
 {chaptersLoading ? (
 <div className="flex h-32 flex-col items-center justify-center gap-2">
 <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
 <span className="text-[10px] text-[var(--text-muted)]">正在拉取最新章节目录...</span>
 </div>
 ) : chaptersError ? (
 <div className="text-center py-6">
 <p className="text-xs text-red-400">{chaptersError}</p>
 </div>
 ) : chapters.length === 0 ? (
 <p className="text-xs text-[var(--text-muted)] py-4 text-center">暂未获取到任何免费章节</p>
 ) : (
 <div className="space-y-5">
 {chapters.map((vol, vIdx) => (
 <div key={vIdx} className="space-y-2">
 <h4 className="text-xs font-semibold text-[var(--text-secondary)] border-b border-[var(--border-color)] pb-1">
 {vol.volumeName}
 </h4>
 <div className="grid grid-cols-1 gap-1">
 {vol.chapters.slice(0, 30).map((ch: any) => (
 <button
 key={ch.id}
 onClick={() => setCurrentChapter(ch)}
 className="flex items-center justify-between rounded-md px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-strong)] hover:text-[var(--accent)] transition-colors"
 >
 <span className="truncate pr-4">{ch.title}</span>
 {ch.vip ? (
 <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">锁 🔒</span>
 ) : (
 <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-green-500/20 bg-green-500/10 text-green-400">免费</span>
 )}
 </button>
 ))}
 {vol.chapters.length > 30 && (
 <p className="text-[10px] text-[var(--text-muted)] pt-1 pl-3">
 已自动为您精简后续 {vol.chapters.length - 30} 章，可在原平台深入阅读
 </p>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 ) : (
 // 独立章节阅读模式
 <div 
 className={clsx(
 "p-8 transition-colors duration-300",
 readerTheme === 'dark' && "bg-[#0b101c] text-slate-200",
 readerTheme === 'light' && "bg-slate-50 text-slate-800",
 readerTheme === 'sepia' && "bg-[#f4eccf] text-[#4f3824]"
 )}
 >
 {/* 阅读控制面板 */}
 <div className="mb-6 flex items-center justify-between border-b border-slate-500/20 pb-4 select-none">
 {/* 字体大小控制 */}
 <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-md p-1 border border-slate-500/10">
 <button
 onClick={() => setReaderFontSize(Math.max(12, readerFontSize - 1))}
 className="flex h-6 w-6 items-center justify-center text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 rounded"
 >
 A-
 </button>
 <span className="text-[10px] px-1 font-semibold">{readerFontSize}px</span>
 <button
 onClick={() => setReaderFontSize(Math.min(24, readerFontSize + 1))}
 className="flex h-6 w-6 items-center justify-center text-xs font-bold hover:bg-white/5 rounded"
 >
 A+
 </button>
 </div>

 {/* 主题配色切换 */}
 <div className="flex gap-1.5 bg-black/5 dark:bg-white/5 rounded-md p-1 border border-slate-500/10">
 <button
 onClick={() => setReaderTheme('dark')}
 className={clsx(
 "h-5 w-5 rounded-full border bg-[#0b101c]",
 readerTheme === 'dark' ? "border-purple-500 scale-110" : "border-transparent"
 )}
 title="深色主题"
 />
 <button
 onClick={() => setReaderTheme('sepia')}
 className={clsx(
 "h-5 w-5 rounded-full border bg-[#f4eccf]",
 readerTheme === 'sepia' ? "border-purple-500 scale-110" : "border-transparent"
 )}
 title="护眼护肤"
 />
 <button
 onClick={() => setReaderTheme('light')}
 className={clsx(
 "h-5 w-5 rounded-full border bg-slate-50",
 readerTheme === 'light' ? "border-purple-500 scale-110" : "border-transparent"
 )}
 title="明亮模式"
 />
 </div>

 {/* AI 技法分析按钮 + 章数选择 */}
 <div className="relative">
 <button
 onClick={() => setShowTechniqueMenu((prev) => !prev)}
 disabled={techniqueLoading || !chapterContent}
 className={clsx(
 "flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold border transition-all",
 techniqueLoading
 ? "border-purple-500/30 bg-purple-500/20 text-purple-300 cursor-wait"
 : "border-purple-500/20 bg-purple-500/10 text-purple-400 hover:bg-purple-500/25 hover:text-purple-300"
 )}
 title="AI 分析写作技法"
 >
 {techniqueLoading ? (
 <span className="h-3 w-3 animate-spin rounded-full border border-purple-400 border-t-transparent" />
 ) : (
 <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
 </svg>
 )}
 技法分析
 </button>
 {showTechniqueMenu && !techniqueLoading && (
 <div className="absolute right-0 top-full z-50 mt-1 w-32 border border-purple-500/20 bg-[#1a1c22] shadow-xl">
 {[1, 3, 5].map((n) => (
 <button
 key={n}
 onClick={() => { setShowTechniqueMenu(false); void analyzeChapterTechnique(n); }}
 className="w-full px-3 py-1.5 text-left text-[11px] text-purple-200 hover:bg-purple-500/15 transition"
 >
 分析 {n} 章
 </button>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* AI 技法分析结果面板 */}
 {showTechniquePanel && (
 <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
 <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10">
 <span className="text-[11px] font-bold text-purple-400">💡 AI 技法分析</span>
 <button
 onClick={() => setShowTechniquePanel(false)}
 className="text-slate-400 hover:text-slate-200 text-xs"
 >
 收起
 </button>
 </div>
 <div className="p-4 text-xs leading-relaxed max-h-[50vh] overflow-y-auto space-y-2">
 {techniqueLoading ? (
 <div className="flex items-center gap-2 py-6 justify-center">
 <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
 <span className="text-slate-400">正在分析写作技法...</span>
 </div>
 ) : techniqueReport ? (
 techniqueReport.split('\n').map((line, idx) => {
 const renderInline = (text: string) =>
 text.split(/(\*\*[^*]+\*\*)/).map((seg, i) =>
 seg.startsWith('**') && seg.endsWith('**')
 ? <strong key={i} className="text-purple-300 font-semibold">{seg.slice(2, -2)}</strong>
 : <span key={i}>{seg}</span>
 );
 if (line.startsWith('# ')) return <h2 key={idx} className="text-sm font-bold text-purple-400 pt-3 pb-1 border-b border-purple-500/10">{renderInline(line.slice(2))}</h2>;
 if (line.startsWith('## ')) return <h3 key={idx} className="text-xs font-bold text-purple-300 pt-2">{renderInline(line.slice(3))}</h3>;
 if (line.startsWith('### ')) return <h4 key={idx} className="text-xs font-bold text-indigo-300 pt-1.5">{renderInline(line.slice(4))}</h4>;
 if (line.startsWith('- ') || line.startsWith('* ')) return <li key={idx} className="ml-4 list-disc text-slate-300">{renderInline(line.slice(2))}</li>;
 if (/^\d+\.\s/.test(line)) return <li key={idx} className="ml-4 list-decimal text-slate-300">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>;
 if (line.startsWith('---') || line.startsWith('———')) return <hr key={idx} className="border-white/5 my-2" />;
 if (line.trim() === '') return <div key={idx} className="h-1.5" />;
 return <p key={idx} className="text-slate-300">{renderInline(line)}</p>;
 })
 ) : null}
 </div>
 </div>
 )}

 {/* 章节标题 */}
 <h3 className="mb-8 text-center text-lg font-bold">
 {currentChapter.title}
 </h3>

 {/* 章节正文 */}
 <div 
 className="leading-relaxed whitespace-pre-wrap select-text pr-2"
 style={{ fontSize: `${readerFontSize}px` }}
 >
 {contentLoading ? (
 <div className="flex h-64 flex-col items-center justify-center gap-3">
 <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
 <span className="text-xs text-slate-400">正在极速抓取并实时解密排版正文...</span>
 </div>
 ) : contentError ? (
 <div className="text-center py-12 space-y-4">
 <p className="text-xs text-red-400">{contentError}</p>
 <button
 onClick={() => {
 // 触发刷新
 setCurrentChapter({ ...currentChapter });
 }}
 className="rounded bg-purple-600 hover:bg-purple-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
 >
 重新尝试加载
 </button>
 </div>
 ) : (
 renderChapterContentText()
 )}
 </div>
 
 {/* 正文尾部控制 */}
 {!contentLoading && !contentError && (
 <div className="mt-12 flex items-center justify-center gap-3 border-t border-slate-500/20 pt-6">
 <button
 onClick={() => {
 if (!currentChapter || !chapters.length) return;
 const flat = chapters.flatMap((vol: any) => vol.chapters || []);
 const idx = flat.findIndex((ch: any) => ch.id === currentChapter.id);
 if (idx > 0) {
 const prev = flat[idx - 1];
 setCurrentChapter(prev);
 }
 }}
 disabled={!currentChapter || (() => { const flat = chapters.flatMap((vol: any) => vol.chapters || []); return flat.findIndex((ch: any) => ch.id === currentChapter?.id) <= 0; })()}
 className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30 disabled:cursor-not-allowed"
 >
 ← 上一章
 </button>
 <button
 onClick={() => setCurrentChapter(null)}
 className="rounded-lg border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 px-6 py-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
 >
 返回章节目录
 </button>
 <button
 onClick={() => {
 if (!currentChapter || !chapters.length) return;
 const flat = chapters.flatMap((vol: any) => vol.chapters || []);
 const idx = flat.findIndex((ch: any) => ch.id === currentChapter.id);
 if (idx >= 0 && idx < flat.length - 1) {
 const next = flat[idx + 1];
 setCurrentChapter(next);
 }
 }}
 disabled={!currentChapter || (() => { const flat = chapters.flatMap((vol: any) => vol.chapters || []); return flat.findIndex((ch: any) => ch.id === currentChapter?.id) >= flat.length - 1; })()}
 className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-strong)] hover:bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-30 disabled:cursor-not-allowed"
 >
 下一章 →
 </button>
 </div>
 )}
 </div>
 )}
 </div>
 </>
 )}
 </div>
 </main>
 </div>

 {/* AI 风向报告全屏毛玻璃 Modal */}
 {showAiModal && (
	<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
 <div className="flex h-[90%] w-[85%] max-w-4xl flex-col rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/95 shadow-2xl ">
 {/* Modal 头部 */}
 <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border-color)] px-6">
 <div className="flex items-center gap-2">
 <span className="text-lg">📊</span>
 <span className="text-sm font-bold tracking-wide text-[var(--text-primary)]">
 {activePlatform === 'qidian' ? '起点中文网' : '番茄小说'} 排行榜题材风向 AI 报告
 </span>
 </div>
 <button
 onClick={() => setShowAiModal(false)}
 className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text-primary)] transition-colors"
 >
 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
 </svg>
 </button>
 </div>

 {/* Modal 内容区 */}
 <div className="flex-1 overflow-y-auto p-8 font-serif leading-relaxed text-[var(--text-secondary)]">
 {aiLoading ? (
 <div className="flex h-full w-full flex-col items-center justify-center gap-4">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
 <div className="text-sm text-[var(--text-muted)] animate-pulse">
 网文 AI 资深主编正在深度阅读并提炼上榜书目，构建核心题材洞察风向标...
 </div>
 </div>
 ) : (
 <div className="prose prose-invert prose-purple max-w-none text-sm space-y-4">
 {aiReport?.split('\n').map((line, idx) => {
 if (line.startsWith('# ')) {
 return <h1 key={idx} className="text-xl font-bold text-[var(--accent)] pt-4 border-b border-[var(--border-color)] pb-1">{line.slice(2)}</h1>;
 }
 if (line.startsWith('## ')) {
 return <h2 key={idx} className="text-base font-bold text-purple-300 pt-3">{line.slice(3)}</h2>;
 }
 if (line.startsWith('### ')) {
 return <h3 key={idx} className="text-sm font-bold text-indigo-300 pt-2">{line.slice(4)}</h3>;
 }
 if (line.startsWith('- ') || line.startsWith('* ')) {
 return <li key={idx} className="ml-4 list-disc text-[var(--text-primary)]">{line.slice(2)}</li>;
 }
 if (line.trim() === '') {
 return <div key={idx} className="h-2" />;
 }
 return <p key={idx} className="text-[var(--text-secondary)]">{line}</p>;
 })}
 </div>
 )}
 </div>

 {/* Modal 尾部 */}
 <div className="flex h-14 shrink-0 items-center justify-end border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/30 px-6">
 <button
 onClick={() => setShowAiModal(false)}
 className="rounded-lg bg-[var(--surface-strong)] border border-[var(--border-color)] hover:bg-[var(--surface)] px-5 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors"
 >
 关闭报告
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}
