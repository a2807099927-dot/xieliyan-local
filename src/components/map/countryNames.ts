// countryNames.ts — 世界国家/地区英文→中文名称映射
// 覆盖 MapSVG world.svg 中的 title 属性值

export const COUNTRY_CN: Record<string, string> = {
 // 东亚
 'China': '中国', 'Japan': '日本', 'South Korea': '韩国', 'North Korea': '朝鲜',
 'Mongolia': '蒙古', 'Taiwan': '台湾',
 // 东南亚
 'Vietnam': '越南', 'Laos': '老挝', 'Cambodia': '柬埔寨', 'Thailand': '泰国',
 'Myanmar': '缅甸', 'Malaysia': '马来西亚', 'Singapore': '新加坡', 'Indonesia': '印度尼西亚',
 'Philippines': '菲律宾', 'Brunei': '文莱', 'East Timor': '东帝汶', 'Timor-Leste': '东帝汶',
 // 南亚
 'India': '印度', 'Pakistan': '巴基斯坦', 'Bangladesh': '孟加拉国', 'Sri Lanka': '斯里兰卡',
 'Nepal': '尼泊尔', 'Bhutan': '不丹', 'Maldives': '马尔代夫', 'Afghanistan': '阿富汗',
 // 中亚
 'Kazakhstan': '哈萨克斯坦', 'Uzbekistan': '乌兹别克斯坦', 'Turkmenistan': '土库曼斯坦',
 'Kyrgyzstan': '吉尔吉斯斯坦', 'Tajikistan': '塔吉克斯坦',
 // 西亚/中东
 'Iran': '伊朗', 'Iraq': '伊拉克', 'Saudi Arabia': '沙特阿拉伯', 'Yemen': '也门',
 'Oman': '阿曼', 'United Arab Emirates': '阿联酋', 'Qatar': '卡塔尔', 'Bahrain': '巴林',
 'Kuwait': '科威特', 'Jordan': '约旦', 'Israel': '以色列', 'Lebanon': '黎巴嫩',
 'Syria': '叙利亚', 'Turkey': '土耳其', 'Cyprus': '塞浦路斯', 'Georgia': '格鲁吉亚',
 'Armenia': '亚美尼亚', 'Azerbaijan': '阿塞拜疆', 'Palestine': '巴勒斯坦',
 // 欧洲
 'Russia': '俄罗斯', 'Ukraine': '乌克兰', 'Belarus': '白俄罗斯', 'Poland': '波兰',
 'Germany': '德国', 'France': '法国', 'United Kingdom': '英国', 'Spain': '西班牙',
 'Portugal': '葡萄牙', 'Italy': '意大利', 'Greece': '希腊', 'Netherlands': '荷兰',
 'Belgium': '比利时', 'Switzerland': '瑞士', 'Austria': '奥地利', 'Czech Republic': '捷克',
 'Czechia': '捷克', 'Slovakia': '斯洛伐克', 'Hungary': '匈牙利', 'Romania': '罗马尼亚',
 'Bulgaria': '保加利亚', 'Serbia': '塞尔维亚', 'Croatia': '克罗地亚', 'Slovenia': '斯洛文尼亚',
 'Bosnia and Herzegovina': '波黑', 'Montenegro': '黑山', 'North Macedonia': '北马其顿',
 'Macedonia': '北马其顿', 'Albania': '阿尔巴尼亚', 'Kosovo': '科索沃',
 'Moldova': '摩尔多瓦', 'Lithuania': '立陶宛', 'Latvia': '拉脱维亚', 'Estonia': '爱沙尼亚',
 'Finland': '芬兰', 'Sweden': '瑞典', 'Norway': '挪威', 'Denmark': '丹麦',
 'Iceland': '冰岛', 'Ireland': '爱尔兰', 'Luxembourg': '卢森堡', 'Malta': '马耳他',
 'Andorra': '安道尔', 'Monaco': '摩纳哥', 'San Marino': '圣马力诺', 'Vatican': '梵蒂冈',
 'Liechtenstein': '列支敦士登',
 // 非洲
 'Egypt': '埃及', 'Libya': '利比亚', 'Tunisia': '突尼斯', 'Algeria': '阿尔及利亚',
 'Morocco': '摩洛哥', 'Sudan': '苏丹', 'South Sudan': '南苏丹', 'Ethiopia': '埃塞俄比亚',
 'Somalia': '索马里', 'Kenya': '肯尼亚', 'Tanzania': '坦桑尼亚', 'Uganda': '乌干达',
 'Rwanda': '卢旺达', 'Burundi': '布隆迪', 'Democratic Republic of the Congo': '刚果(金)',
 'Dem. Rep. Congo': '刚果(金)', 'Republic of the Congo': '刚果(布)', 'Congo': '刚果',
 'Nigeria': '尼日利亚', 'Niger': '尼日尔', 'Chad': '乍得', 'Cameroon': '喀麦隆',
 'Central African Republic': '中非', 'Gabon': '加蓬', 'Equatorial Guinea': '赤道几内亚',
 'Ghana': '加纳', 'Ivory Coast': '科特迪瓦', "Côte d'Ivoire": '科特迪瓦',
 'Senegal': '塞内加尔', 'Mali': '马里', 'Burkina Faso': '布基纳法索',
 'Guinea': '几内亚', 'Sierra Leone': '塞拉利昂', 'Liberia': '利比里亚',
 'Togo': '多哥', 'Benin': '贝宁', 'Mauritania': '毛里塔尼亚',
 'Gambia': '冈比亚', 'Guinea-Bissau': '几内亚比绍', 'Cape Verde': '佛得角',
 'South Africa': '南非', 'Namibia': '纳米比亚', 'Botswana': '博茨瓦纳',
 'Zimbabwe': '津巴布韦', 'Zambia': '赞比亚', 'Mozambique': '莫桑比克',
 'Madagascar': '马达加斯加', 'Malawi': '马拉维', 'Angola': '安哥拉',
 'Swaziland': '斯威士兰', 'Eswatini': '斯威士兰', 'Lesotho': '莱索托',
 'Eritrea': '厄立特里亚', 'Djibouti': '吉布提', 'Comoros': '科摩罗',
 'Mauritius': '毛里求斯', 'Seychelles': '塞舌尔', 'Western Sahara': '西撒哈拉',
 // 北美
 'United States': '美国', 'United States of America': '美国', 'Canada': '加拿大',
 'Mexico': '墨西哥', 'Cuba': '古巴', 'Haiti': '海地', 'Dominican Republic': '多米尼加',
 'Jamaica': '牙买加', 'Guatemala': '危地马拉', 'Honduras': '洪都拉斯',
 'El Salvador': '萨尔瓦多', 'Nicaragua': '尼加拉瓜', 'Costa Rica': '哥斯达黎加',
 'Panama': '巴拿马', 'Belize': '伯利兹', 'Trinidad and Tobago': '特立尼达和多巴哥',
 'Bahamas': '巴哈马', 'Barbados': '巴巴多斯', 'Antigua and Barbuda': '安提瓜和巴布达',
 // 南美
 'Brazil': '巴西', 'Argentina': '阿根廷', 'Chile': '智利', 'Colombia': '哥伦比亚',
 'Peru': '秘鲁', 'Venezuela': '委内瑞拉', 'Ecuador': '厄瓜多尔', 'Bolivia': '玻利维亚',
 'Paraguay': '巴拉圭', 'Uruguay': '乌拉圭', 'Guyana': '圭亚那', 'Suriname': '苏里南',
 'French Guiana': '法属圭亚那',
 // 大洋洲
 'Australia': '澳大利亚', 'New Zealand': '新西兰', 'Papua New Guinea': '巴布亚新几内亚',
 'Fiji': '斐济', 'Solomon Islands': '所罗门群岛',
 // 其他
 'Greenland': '格陵兰', 'Antarctica': '南极洲',
};
