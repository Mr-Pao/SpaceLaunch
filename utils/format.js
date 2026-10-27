/**
 * 时间与文本格式化
 *
 * 之前每个页面各写一份 formatDate，格式还不一致（有的带秒、有的不带）。
 * 统一收在这里，页面只管调用。
 */

const pad = (n) => (n < 10 ? '0' + n : String(n))

/** 解析成 Date，失败返回 null。LL2 的时间是带时区的 ISO 串 */
export function toDate(value) {
	if (!value) return null
	const d = new Date(value)
	return isNaN(d.getTime()) ? null : d
}

/** 2026-10-23 06:51 */
export function formatDateTime(value) {
	const d = toDate(value)
	if (!d) return ''
	return (
		d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
		' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
	)
}

/** 10-23 06:51（列表卡片用，省掉年份）；跨年任务自动带年份：2025-04-12 08:00 */
export function formatShort(value) {
	const d = toDate(value)
	if (!d) return '时间待定'
	const hm =
		pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
		pad(d.getHours()) + ':' + pad(d.getMinutes())
	// 老任务不带年份分不清哪年（复审 P2-6）；当年任务保持短格式
	if (d.getFullYear() !== new Date().getFullYear()) {
		return d.getFullYear() + '-' + hm
	}
	return hm
}

/**
 * 相对时间：发射列表最该先看的是「还有多久发射」，而不是一串年份数字
 *   未来  -> 「3 天后」「2 小时后」「18 分钟后」
 *   过去  -> 「3 天前」
 */
export function relativeTime(value) {
	const d = toDate(value)
	if (!d) return '时间待定'

	const diff = d.getTime() - Date.now()
	const abs = Math.abs(diff)
	const future = diff > 0

	// 一律向下取整：「1 天前」允许少报（1.6 天显示 1 天），
	// round 会把 1.6 天报成 2 天，明明还差 10 小时才满两天却看着像过了两天
	const mins = Math.floor(abs / 60000)
	const hours = Math.floor(abs / 3600000)
	const days = Math.floor(abs / 86400000)

	if (mins < 1) return '即将发射'
	if (mins < 60) return future ? `${mins} 分钟后` : `${mins} 分钟前`
	if (hours < 24) return future ? `${hours} 小时后` : `${hours} 小时前`
	if (days < 30) return future ? `${days} 天后` : `${days} 天前`

	// 超过 30 天回退短格式：formatShort 对跨年任务会自动带年份
	return formatShort(value)
}

/** 超长文本截断，末位补省略号 */
export function truncate(text, max) {
	if (!text) return ''
	const s = String(text)
	return s.length > max ? s.slice(0, max) + '…' : s
}

/**
 * 状态 -> 展示文案与样式类
 * 优先用同步阶段写入的 nameZh，缺失时回退英文缩写
 */
/**
 * 发射状态 → 文案 + 配色类名。
 *
 * 第二个参数 net 是兜底用的：真实飞行阶段只有十几分钟到几小时，
 * 如果状态还是 In Flight 但 net 已经过去大半天，那一定是数据没跟上
 * （LL2 的 upcoming 快照会滞后几小时），不能一直把「飞行中」挂在列表上。
 * 数据层已经会清这类陈旧状态，这里是冷缓存和旧快照的最后一道。
 */
export function statusInfo(status, net) {
	if (!status) return { text: '未知', cls: 'normal' }

	const text = status.nameZh || status.name || status.abbrev || '未知'
	const a = status.abbrev || ''

	if (a === 'Success' || a === 'Deployed') return { text, cls: 'success' }
	if (a === 'Failure' || a === 'Partial') return { text, cls: 'failure' }
	if (a === 'In Flight') {
		const t = net ? new Date(net).getTime() : 0
		if (t > 0 && Date.now() - t > 6 * 3600 * 1000) return { text: '状态待更新', cls: 'pending' }
		return { text, cls: 'flying' }
	}
	if (a === 'Go') return { text, cls: 'go' }
	return { text, cls: 'pending' }
}

/**
 * 芯级个体状态中文化。
 *
 * LL2 /launchers/ 的 status 是固定枚举（实测全库只出现 5 种）：
 * active 现役 / retired 退役 / expended 已消耗（设计上不回收，飞完即弃）/
 * lost 坠毁（回收失败）/ destroyed 炸毁（地面事故等）。查表不走翻译。
 */
const CORE_STATUS = {
	active: { text: '现役', cls: 'ok' },
	retired: { text: '退役', cls: 'dim' },
	expended: { text: '已消耗', cls: 'dim' },
	lost: { text: '坠毁', cls: 'bad' },
	destroyed: { text: '炸毁', cls: 'bad' }
}

export function coreStatus(status) {
	const key = typeof status === 'string' ? status : (status && status.name) || ''
	const hit = CORE_STATUS[key]
	if (hit) return { text: hit.text, cls: hit.cls }
	return { text: key || '未知', cls: 'dim' }
}

/**
 * 宇航员国籍中文化。LL2 的 nationality_name 是 France / USA / Russia
 * 这类英文国名，只收航天员出过或常出的国家，未收录保留原文。
 */
const NATION_ZH = {
	France: '法国',
	USA: '美国',
	'United States': '美国',
	Russia: '俄罗斯',
	China: '中国',
	Japan: '日本',
	Italy: '意大利',
	Germany: '德国',
	Canada: '加拿大',
	'United Kingdom': '英国',
	Sweden: '瑞典',
	Netherlands: '荷兰',
	Spain: '西班牙',
	Belgium: '比利时',
	Denmark: '丹麦',
	Norway: '挪威',
	Finland: '芬兰',
	Poland: '波兰',
	Czechia: '捷克',
	Australia: '澳大利亚',
	India: '印度',
	Brazil: '巴西',
	Israel: '以色列',
	Kazakhstan: '哈萨克斯坦',
	Ukraine: '乌克兰',
	UAE: '阿联酋',
	'Saudi Arabia': '沙特阿拉伯',
	'South Korea': '韩国',
	Vietnam: '越南',
	Cuba: '古巴',
	Mongolia: '蒙古',
	Syria: '叙利亚',
	Afghanistan: '阿富汗',
	'South Africa': '南非',
	Mexico: '墨西哥',
	Switzerland: '瑞士',
	Austria: '奥地利',
	Bulgaria: '保加利亚',
	Romania: '罗马尼亚',
	Hungary: '匈牙利',
	Slovakia: '斯洛伐克',
	// 形容词兜底：LL2 的 nationality_name 是这一形态，slim 优先取国名，
	// 但国名缺失或旧数据只有形容词时也能命中
	American: '美国',
	French: '法国',
	Russian: '俄罗斯',
	Chinese: '中国',
	British: '英国',
	Swiss: '瑞士',
	Swedish: '瑞典',
	Italian: '意大利',
	German: '德国',
	Japanese: '日本',
	Canadian: '加拿大',
	Spanish: '西班牙',
	Dutch: '荷兰',
	Belgian: '比利时',
	Danish: '丹麦',
	Norwegian: '挪威',
	Finnish: '芬兰',
	Polish: '波兰',
	Australian: '澳大利亚',
	'United States of America': '美国'
}

export function nationZh(nation) {
	if (!nation) return ''
	return NATION_ZH[nation] || nation
}

/**
 * 中国航天员的中文名。
 *
 * LL2 全站只给拼音（Zhu Yangzhu），中国用户看到「Zhu Yangzhu」基本认不出是谁，
 * 而拼音转汉字有大量同音字，程序推不出来，只能查表。
 *
 * 全表已按神舟一号至神舟二十三号的乘组名单逐个核对（2026-10-25）。
 * 香港用粤语拼音（Lai Ka-ying），与普通话拼音规律不同。
 * LL2 里还有一位 'Justin Sun' 标为中国籍，身份无法确认，故意不收录 ——
 * 表里没有的中国人保留拼音原文：宁可显示拼音，也不要编一个错的名字。
 *
 * 表里没有的中国人保留拼音原文：宁可显示拼音，也不要编一个错的名字。
 */
const CHINA_ASTRO_ZH = {
	'Yang Liwei': '杨利伟',
	'Fei Junlong': '费俊龙',
	'Nie Haisheng': '聂海胜',
	'Zhai Zhigang': '翟志刚',
	'Liu Boming': '刘伯明',
	'Jing Haipeng': '景海鹏',
	'Liu Wang': '刘旺',
	'Liu Yang': '刘洋',
	'Wang Yaping': '王亚平',
	'Zhang Xiaoguang': '张晓光',
	'Chen Dong': '陈冬',
	'Deng Qingming': '邓清明',
	'Zhang Lu': '张陆',
	'Ye Guangfu': '叶光富',
	'Tang Hongbo': '汤洪波',
	'Cai Xuzhe': '蔡旭哲',
	'Zhu Yangzhu': '朱杨柱',
	'Gui Haichao': '桂海潮',
	'Tang Shengjie': '唐胜杰',
	'Jiang Xinlin': '江新林',
	'Li Cong': '李聪',
	'Li Guangsu': '李广苏',
	'Song Lingdong': '宋令东',
	'Wang Haozhe': '王浩泽',
	'Chen Zhongrui': '陈中瑞',
	// —— 神舟二十一号及以后（LL2 新录入批次，已核对） ——
	'Wang Jie': '王杰',
	'Chen Quan': '陈全', // 尚未飞行，LL2 已收录
	'Wu Fei': '武飞',
	'Zhang Hongzhang': '张洪章',
	'Zhang Zhiyuan': '张志远',
	'Lai Ka-ying': '黎家盈'
}

/**
 * 航天员显示名：中国籍换成中文，其余保留原拼写。
 * 只认 nation === 'China'，避免同名的外籍人士被误译。
 */
export function astroName(a) {
	if (!a) return ''
	// 上游个别条目会带首尾空格（历史上 'Liu Boming ' 就是这样），不 trim 查不到表
	const raw = (a.name || '').trim()
	if (a.nation !== 'China') return raw
	return CHINA_ASTRO_ZH[raw] || raw
}

/**
 * 中国运载火箭的中文名。
 *
 * 只收「确定无疑」的型号：朱雀、谷神星、快舟。
 * Kinetica / Pallas / Gravity 这类英文译名在不同资料里对不上具体中文名，
 * 与其猜错不如保留英文原文 —— 译错了比不译更糟。
 *
 * 长征系列不写在这里：型号库里有 44 个 Long March 变体（含上面级组合），
 * 一条条列既列不全又容易漏改，改成下面的规则推导。
 * 型号名属于固定枚举，走本地查表，不占翻译额度。
 */
const ROCKET_ZH = {
	// ---- 美国 ----
	'Falcon 9': '猎鹰 9 号',
	'Falcon Heavy': '猎鹰重型',
	'Falcon 1': '猎鹰 1 号',
	Starship: '星舰',
	'Space Launch System (SLS)': '太空发射系统',
	'Space Launch System': '太空发射系统',
	Electron: '电子号',
	'Atlas V': '宇宙神 5 号',
	'Atlas V N22': '宇宙神 5 号',
	'Atlas III': '宇宙神 3 号',
	'Delta IV': '德尔塔 4 号',
	'Delta IV Heavy': '德尔塔 4 重型',
	'Delta II': '德尔塔 2 号',
	Vulcan: '火神',
	'Vulcan VC2S': '火神',
	'Vulcan VC4L': '火神',
	'New Glenn': '新格伦',
	Antares: '心宿二',
	Pegasus: '飞马座',
	'Minotaur I': '牛头怪 1 号',
	'Minotaur IV': '牛头怪 4 号',
	'Minotaur V': '牛头怪 5 号',
	'Minotaur-C': '牛头怪 C',
	Alpha: '阿尔法',
	'Terran 1': '人族 1 号',
	Neutron: '中子',
	SpaceShipTwo: '太空船二号',
	'Space Shuttle': '航天飞机',
	'Saturn V': '土星五号',
	Titan: '泰坦',

	// ---- 欧洲 ----
	'Ariane 1': '阿丽亚娜 1 号',
	'Ariane 2': '阿丽亚娜 2 号',
	'Ariane 3': '阿丽亚娜 3 号',
	'Ariane 4': '阿丽亚娜 4 号',
	'Ariane 5': '阿丽亚娜 5 号',
	'Ariane 6': '阿丽亚娜 6 号',
	'Ariane 62': '阿丽亚娜 62',
	'Ariane 64': '阿丽亚娜 64',
	Vega: '织女星',
	'Vega-C': '织女星 C',

	// ---- 俄罗斯 ----
	Soyuz: '联盟号',
	'Soyuz 2': '联盟 2 号',
	'Soyuz-FG': '联盟 FG',
	'Soyuz-U': '联盟 U',
	'Proton-M': '质子 M',
	'Proton-M Briz-M': '质子 M',
	Proton: '质子号',
	'Angara A5': '安加拉 A5',
	'Angara A5/Briz-M': '安加拉 A5',
	Angara: '安加拉',
	'Soyuz 2.1a': '联盟 2.1a',
	'Soyuz 2.1b': '联盟 2.1b',
	'Soyuz-5': '联盟 5 号',
	'Soyuz-2': '联盟 2 号',
	Zenit: '天顶号',
	Rokot: '轰鸣',
	Energia: '能源号',

	// ---- 日本 ----
	Epsilon: '艾普西龙',

	// ---- 印度 ----
	PSLV: '极地卫星运载火箭',
	'LVM-3 (GSLV Mk III)': 'LVM-3',
	GSLV: '地球同步卫星运载火箭',

	// ---- 中国商业航天（长征走 zhLongMarch 规则推导，这里只钉特例）----
	'Long March 5B': '长征五号B',
	'Long March 5B/YZ-2': '长征五号B/YZ-2',

	'Zhuque-2': '朱雀二号',
	'Zhuque-2E': '朱雀二号E',
	'Zhuque-2E Block 2': '朱雀二号E',
	'Zhuque-3': '朱雀三号',
	'Ceres-1': '谷神星一号',
	'Ceres-1S': '谷神星一号S',
	'Ceres-2': '谷神星二号',
	'Kuaizhou 1A': '快舟一号甲',
	'Kuaizhou 11': '快舟十一号',
	'Kinetica 1': '力箭一号',
	'Firefly Alpha': '萤火虫阿尔法',
	'Miura 5': '米乌拉 5 号',
	'Astra Rocket 4': '阿斯特拉火箭 4 号',
	Nova: '新星',
	Nuri: '世界号',
	'KSLV-2 Nuri': '世界号',
	'Hyperbola-1': '双曲线一号',
	'Hyperbola-2': '双曲线二号',
	'Hyperbola-3': '双曲线三号',
	'Gravity-1': '引力一号',
	'Gravity-2': '引力二号',
	'Tianlong-2': '天龙二号',
	'Tianlong-3': '天龙三号',
	'Lijian-1': '力箭一号',
	'Kinetica-1': '力箭一号',
	'Kinetica 2': '力箭二号',
	'Kaituo-1A': '开拓一号甲',
	'Jielong-3': '捷龙三号',
	'Smart Dragon 1': '捷龙一号',
	'Smart Dragon 3': '捷龙三号',
	'Pallas-1': '帕拉斯一号',
	'Nebula-1': '星云一号'
}

const CN_NUM = {
	1: '一',
	2: '二',
	3: '三',
	4: '四',
	5: '五',
	6: '六',
	7: '七',
	8: '八',
	9: '九',
	10: '十',
	11: '十一',
	12: '十二'
}

/* 型号后缀字母：A=甲 B=乙 C=丙 D=丁 E=戊。
   F 是载人专型（长征二号F），G 只出现在 2F/G，两者都保留原字母。 */
const CN_TAIL = { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' }

/**
 * 长征系列规则推导：
 *   Long March 5            → 长征五号
 *   Long March 3B/E         → 长征三号乙/E     （斜杠后是构型/上面级，保留原文）
 *   Long March 2F/G         → 长征二号F/G
 *   Long March 2C/YZ-1S     → 长征二号丙/YZ-1S
 *   Long March 8 (Core Only)→ 长征八号（仅芯级）
 * 对不上格式就返回空串，调用方回退英文原文。
 */
function zhLongMarch(raw) {
	const m = /^Long March(?:\s+(\d+)([A-Z])?)?(\s*\/\s*[A-Za-z0-9][\w\-]*)?(\s*\(Core Only\))?$/i.exec(
		String(raw).trim()
	)
	if (!m) return ''

	const num = m[1] ? CN_NUM[m[1]] : ''
	// 型号库里有一条光秃秃的 "Long March"（没有编号）
	if (!m[1]) return '长征'
	if (!num) return ''

	const tail = m[2] ? CN_TAIL[m[2].toUpperCase()] || m[2] : ''
	const extra = m[3] ? m[3].replace(/\s+/g, '').toUpperCase() : ''
	const core = m[4] ? '（仅芯级）' : ''

	return '长征' + num + '号' + tail + extra + core
}

/** 火箭型号名，中国型号换成中文，其余保留原文 */
/**
 * 长后缀兜底：型号表里只有基础名时，按前缀认。
 *
 * Atlas V 551 / Atlas V 401 这些配置代号不可能逐个入库，
 * 但都该归到「宇宙神 5 号」；后面的数字保留，因为它是真的配置差异。
 * 从最长 key 开始试，避免 "Atlas" 抢在 "Atlas V" 前面。
 */
function rocketByPrefix(s) {
	const str = String(s == null ? '' : s)
	if (!str) return ''
	const keys = Object.keys(ROCKET_ZH).sort((a, b) => b.length - a.length)
	for (const k of keys) {
		if (str === k || !str.startsWith(k + ' ')) continue
		const tail = str.slice(k.length + 1).trim()
		// Block 5 / V3 这类构型词不拼，中文名本身已经够用
		if (/^(Block|V)\s*\d+$/i.test(tail)) return ROCKET_ZH[k]
		return ROCKET_ZH[k] + ' ' + tail
	}
	return ''
}

export function rocketName(config) {
	if (!config) return ''
	const full = config.full_name || config.name || ''
	const base = config.name || full
	if (!full) return ''

	// 查表顺序有讲究：LL2 的 full_name 常带构型后缀（Falcon 9 Block 5），
	// 中文名却是钉在基础型号上的（猎鹰 9 号），所以先用 name 查。
	// 再剥掉 "Block 5 / V3" 这类后缀兜一次，覆盖 name 自己就带后缀的情况。
	const bare = String(base).replace(/\s+(V\d+|Block\s*\d+)$/i, '')
	// 上面级写法（Soyuz 2.1b/Fregat-M、Angara A5/Briz-M）剥掉斜杠后半段再查
	const noUpper = String(base).split('/')[0].trim()

	return (
		ROCKET_ZH[full] ||
		ROCKET_ZH[base] ||
		ROCKET_ZH[bare] ||
		ROCKET_ZH[noUpper] ||
		// 长征走规则推导时 full_name 优先：{name:'Long March', full_name:'Long March 5'}
		// 必须先试 full，否则 base 会先命中「长征」而丢掉编号
		zhLongMarch(full) ||
		zhLongMarch(bare) ||
		zhLongMarch(base) ||
		zhLongMarch(noUpper) ||
		rocketByPrefix(base) ||
		rocketByPrefix(full) ||
		full
	)
}

/**
 * 型号所属「系列」的聚合键。
 *
 * LL2 的 families 是层级路径，由粗到细：
 *   Falcon 9 Block 5 → ["Falcon", "Falcon 9"]
 *   Long March 2C    → ["Long March", "Long March 2"]
 *   Titan 34D IUS    → ["Titan", "Titan 34D", "Titan III"]
 *
 * 取第二层刚好是「型号系列」这一级：Falcon 9 / Long March 2 / Titan 34D，
 * 同系列的各构型（v1.0、v1.1、Block 5…）就能聚合到一起。
 * 只有一层的（Falcon 1 → ["Falcon"]）退回第一层；
 * 连系列都没有的（74 个早期探空火箭）用 name 自成一组。
 */
export function seriesKey(config) {
	if (!config) return ''
	const fams = (config.families || []).filter(Boolean)
	if (fams.length >= 2) return fams[1]
	return fams[0] || config.name || ''
}

/**
 * 系列名的中文显示。
 *
 * 和 rocketName 一样只收确定的译名：译错比不译更糟。
 * 长征走规则推导（"Long March 2" → 长征二号），其余查表，未命中保留英文。
 */
const SERIES_ZH = {
	Falcon: '猎鹰',
	'Falcon 1': '猎鹰1号',
	'Falcon 9': '猎鹰9号',
	'Falcon Heavy': '猎鹰重型',
	Starship: '星舰',
	Electron: '电子号',
	Neutron: '中子号',
	'Soyuz 2': '联盟二号',
	'Soyuz': '联盟号',
	'Proton / UR-500': '质子号',
	'Ariane 1': '阿丽亚娜1号',
	'Ariane 2': '阿丽亚娜2号',
	'Ariane 3': '阿丽亚娜3号',
	'Ariane 4': '阿丽亚娜4号',
	'Ariane 5': '阿丽亚娜5号',
	'Ariane 6': '阿丽亚娜6号',
	Vulcan: '火神',
	'New Glenn': '新格伦',
	'Atlas V': '宇宙神五号',
	'Delta II': '德尔塔二号',
	'Delta IV': '德尔塔四号',
	Zhuque: '朱雀',
	'Zhuque-2': '朱雀二号',
	'Zhuque-3': '朱雀三号',
	'Ceres-1': '谷神星一号',
	'Kuaizhou 1': '快舟一号',
	'Kuaizhou 11': '快舟十一号'
}

/** 长征系列：Long March 2 → 长征二号；没有编号的 Long March → 长征 */
function zhLongMarchSeries(raw) {
	const m = /^Long March(?:\s+(\d+))?$/i.exec(String(raw).trim())
	if (!m) return ''
	if (!m[1]) return '长征'
	const num = CN_NUM[m[1]]
	return num ? '长征' + num + '号' : ''
}

/** 系列名的中文显示，未收录的保留英文原文 */
export function seriesName(raw) {
	if (!raw) return ''
	const s = String(raw).trim()
	return SERIES_ZH[s] || zhLongMarchSeries(s) || s
}

/**
 * 机翻术语修正
 *
 * 任务名走的是通用翻译接口，几个高频词固定译错：
 *   Starlink Group 15-15 → 「星链集团 15-15」（Group 是「组」不是「集团」）
 *   Unknown Payload      → 「未知有效负载」（航天标准说法是「有效载荷」）
 * 只修这两种最常见的，不追求逐条人工润色。
 */
const TERM_FIX = [
	[/星链集团/g, '星链'],
	[/有效负载/g, '有效载荷'],
	[/未知负载/g, '未知载荷']
]

function fixTerms(text) {
	if (!text) return ''
	let s = String(text)
	for (const [re, to] of TERM_FIX) s = s.replace(re, to)
	return s
}

/**
 * 列表/详情页的标题
 *
 * LL2 的 launch.name 是「型号 | 任务名」拼好的英文串，直接显示全英文。
 * 这里用「中文型号 + 中文任务名」重新拼，任务名没翻出来时才回退原始串。
 */
/**
 * 任务名清理。
 *
 * LL2 里未定名的任务会写成 "SatNet LEO Group TBD?"，机翻之后变成
 * 「SatNet LEO 集团待定?」—— 问号留在标题里很像表单没填完。
 * 这里把末尾的 TBD / 待定（含问号）摘掉，任务名本身保留。
 */
function cleanMission(text) {
	return String(text == null ? '' : text)
		.replace(/[\s,，]*[(（]?\s*(TBD|TBC|待定|待公布)\s*[)）]?\s*[?？]?\s*$/i, '')
		.trim()
}

export function launchTitle(item) {
	if (!item) return ''

	// 用完整名：只有「猎鹰 9 号」的话，同系列各构型在列表里长得一模一样
	const rocket = rocketFullName(item.rocket && item.rocket.configuration)
	const m = item.mission || {}
	const mission = cleanMission(fixTerms(m.nameZh || m.name || ''))

	if (mission && rocket) return rocket + ' | ' + mission
	if (mission) return mission
	// 任务名被清空（原来只有 TBD）时只留型号，别回退到含 TBD 的英文原串
	if (rocket) return rocket
	return item.name || ''
}

/** Unknown / N/A 这类占位值统一说成「未知」，直接显示英文很突兀 */
export function zhValue(value) {
	if (!value) return ''
	const s = String(value).trim()
	if (/^(unknown|n\/a|none|tbd|tbc)$/i.test(s)) return '未知'
	return s
}

/**
 * 目标轨道的中文名
 *
 * LL2 的 orbit 是固定枚举（约 15 个），本地查表最稳：
 * 走翻译接口反而会把 LEO 翻成乱七八糟的东西。
 * 查不到就原样返回，别瞎编。
 */
const ORBIT_ZH = {
	'low earth orbit': '近地轨道',
	'medium earth orbit': '中地球轨道',
	'geostationary orbit': '地球同步轨道',
	'geostationary transfer orbit': '地球同步转移轨道',
	'geosynchronous orbit': '地球同步轨道',
	'geosynchronous transfer orbit': '地球同步转移轨道',
	'highly elliptical orbit': '高椭圆轨道',
	'elliptical orbit': '椭圆轨道',
	'polar orbit': '极地轨道',
	'sun-synchronous orbit': '太阳同步轨道',
	'solar synchronous orbit': '太阳同步轨道',
	'lunar orbit': '月球轨道',
	'heliocentric orbit': '日心轨道',
	'suborbital': '亚轨道',
	'suborbital trajectory': '亚轨道',
	'unknown': '未知',
	'retrograde orbit': '逆行轨道',
	'equatorial orbit': '赤道轨道'
}

export function orbitName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return ORBIT_ZH[s.toLowerCase()] || s
}

/**
 * 任务类型的中文名
 *
 * LL2 的 mission.type 是英文枚举（"Communications" / "Government/Top Secret"…），
 * 同步阶段没翻它（只翻了任务名和描述），本地表兜住常见的，
 * 表外的保留英文 —— 总比翻错了强。
 */
const MISSION_TYPE_ZH = {
	communications: '通信',
	'earth observation': '对地观测',
	'navigation': '导航',
	'science': '科学',
	'astrophysics': '天体物理',
	'planetary science': '行星科学',
	'human exploration': '载人探索',
	'lunar exploration': '月球探索',
	'robotic exploration': '机器人探索',
	'solar physics': '太阳物理',
	'government/top secret': '政府/保密',
	'government': '政府',
	'military': '军事',
	'test flight': '试飞',
	'test': '试验',
	'resupply': '货运补给',
	'crew': '载人',
	'dedicated rideshare': '专享拼车',
	'rideshare': '拼车',
	'technology': '技术验证',
	'materials science': '材料科学',
	'biology': '生物',
	'education': '教育',
	'engineering': '工程',
	'demonstration': '演示验证',
	'other': '其他'
}

export function missionTypeName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return MISSION_TYPE_ZH[s.toLowerCase()] || s
}

/**
 * 航天器（飞船 / 载荷本体）的三个封闭枚举
 *
 * 只在单条详情里才有（rocket.spacecraft_stage），由 scripts/timeline.js 顺路抓。
 * 名称本身（Crew Dragon C204 / 长征 XX）保留原文：航天器的官方代号没有约定俗成的
 * 中译，硬翻反而认不出来。只翻「类型 / 状态 / 目的地」这种有限集合。
 */
const CRAFT_TYPE_ZH = {
	capsule: '载人舱',
	spaceplane: '航天飞机',
	lander: '着陆器',
	rover: '巡视器',
	satellite: '卫星',
	probe: '探测器',
	'space station': '空间站',
	'station module': '空间站舱段',
	tug: '太空拖船',
	'cargo spacecraft': '货运飞船',
	'manned spacecraft': '载人飞船',
	'unmanned spacecraft': '无人飞船'
}

const CRAFT_STATUS_ZH = {
	active: '在役',
	retired: '已退役',
	destroyed: '已损毁',
	lost: '已失联',
	preserved: '封存展示',
	'under construction': '建造中',
	'in development': '研制中'
}

const DEST_ZH = {
	'international space station': '国际空间站',
	moon: '月球',
	'lunar orbit': '月球轨道',
	'lunar surface': '月面',
	mars: '火星',
	'mars orbit': '火星轨道',
	mercury: '水星',
	'mercury orbit': '水星轨道',
	venus: '金星',
	'venus orbit': '金星轨道',
	jupiter: '木星',
	'jupiter orbit': '木星轨道',
	saturn: '土星',
	'saturn orbit': '土星轨道',
	ganymede: '木卫三',
	'ganymede orbit': '木卫三轨道',
	europa: '木卫二',
	'titan': '土卫六',
	'sun-earth l1': '日地 L1 点',
	'sun-earth l2': '日地 L2 点',
	'trans-lunar injection': '地月转移轨道',
	'low earth orbit': '近地轨道',
	'suborbital trajectory': '亚轨道',
	'heliocentric orbit': '日心轨道'
}

export function craftTypeName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return CRAFT_TYPE_ZH[s.toLowerCase()] || s
}

export function craftStatusName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return CRAFT_STATUS_ZH[s.toLowerCase()] || s
}

/**
 * 活动类型中文名（events.json 里的 type.name）。
 *
 * 实测 27 条活动只有 9 种类型，全是「航天器正在做什么」这类描述：
 * Orbital Insertion / Spacecraft Berthing / Flyby —— 直接摆英文，
 * 中文用户读不出重点。命中不到就回英文原串，不硬归成「其他」。
 */
const EVENT_TYPE_ZH = {
	eva: '舱外活动',
	flyby: '飞掠',
	docking: '对接',
	undocking: '分离',
	landing: '着陆',
	launch: '发射',
	'orbital insertion': '入轨',
	'spacecraft landing': '航天器着陆',
	'spacecraft docking': '航天器对接',
	'spacecraft undocking': '航天器分离',
	'spacecraft berthing': '航天器停靠',
	'spacecraft release': '航天器释放',
	'spacecraft event': '航天器事件',
	'deep space maneuver': '深空机动',
	'trajectory correction maneuver': '轨道修正'
}

export function eventTypeName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return EVENT_TYPE_ZH[s.toLowerCase()] || s
}

/** 目的地：先查航天器专用表（ISS / 月球这类不是轨道），再回退轨道表 */
export function destName(value) {
	const s = zhValue(value)
	if (!s) return ''
	return DEST_ZH[s.toLowerCase()] || ORBIT_ZH[s.toLowerCase()] || s
}

/**
 * 活动地点中文化。
 *
 * 活动的 location 是自由字符串，实测有三类来源：
 *   空间站名（International Space Station）
 *   天体 / 轨道（Mercury、Ganymede Orbit）
 *   发射场（Cape Canaveral SFS, FL, USA）
 * 三张表依次试，都不中就保留原文 —— 宁可显示英文，也不猜着翻。
 *
 * 之前事件页、活动列表、近期活动卡各写了一份 placeName，
 * 都只查了「空间站 + 场地」，天体类的 Mercury 一条都认不出，所以统一到这里。
 */
export function eventPlace(loc) {
	const s = String(loc == null ? '' : loc).trim()
	if (!s) return ''
	const st = stationName(s)
	if (st !== s) return st
	const dest = destName(s)
	if (dest !== s) return dest
	return placeZh(s) || s
}

/**
 * 发射所在国家/地区的中文名。
 *
 * 快照里的国家信息只有一个来源：`pad.location.name`，形如
 * "Vandenberg SFB, CA, USA" / "Jiuquan, People's Republic of China"，
 * 取最后一个逗号后面的那一段。没有独立的 country 字段（LL2 有，但瘦身后没留）。
 *
 * 这一段的取值并不总是国家名：
 *   - "Andøya Spaceport" / "Esrange Space Center" 是发射场名（挪威 / 瑞典）；
 *   - "Sea Launch" 是海上平台，没有国家；
 *   - "Moon" 是目的地，出现在月球任务上。
 * 所以既要有映射表，也要有无命中时的原文兜底 —— 宁可显示英文，也不要瞎归因。
 */
const COUNTRY_ZH = {
	USA: '美国',
	'United States': '美国',
	'United States of America': '美国',
	"People's Republic of China": '中国',
	China: '中国',
	'Haiyang Oriental Spaceport': '中国',
	'Russian Federation': '俄罗斯',
	Russia: '俄罗斯',
	USSR: '苏联',
	'Republic of Kazakhstan': '哈萨克斯坦',
	Kazakhstan: '哈萨克斯坦',
	'New Zealand': '新西兰',
	India: '印度',
	Japan: '日本',
	'South Korea': '韩国',
	'Republic of Korea': '韩国',
	'French Guiana': '法属圭亚那',
	'Andøya Spaceport': '挪威',
	Norway: '挪威',
	'Esrange Space Center': '瑞典',
	Sweden: '瑞典',
	'Sea Launch': '海上发射',
	Kenya: '肯尼亚',
	Iran: '伊朗',
	Israel: '以色列',
	Brazil: '巴西',
	Alcantara: '巴西',
	Australia: '澳大利亚',
	'Marshall Islands': '马绍尔群岛',
	Kwajalein: '马绍尔群岛',
	'Wallops Island': '美国',
	Mexico: '墨西哥',
	Argentina: '阿根廷',
	Spain: '西班牙',
	Italy: '意大利',
	Germany: '德国',
	'United Kingdom': '英国',
	Moon: '月球'
}

/** 一条发射的发射国家/地区（中文，用于显示和筛选，同义值会合并） */
export function countryOf(item) {
	const loc = item && item.pad && item.pad.location && item.pad.location.name
	if (!loc) return ''
	const segs = String(loc).split(',')
	const last = segs[segs.length - 1].trim()
	if (!last) return ''
	if (COUNTRY_ZH[last]) return COUNTRY_ZH[last]
	// 没命中就保留原文，太长截断（"XX Space Center" 之类会撑爆一个 chip）
	return last.length > 12 ? last.slice(0, 11) + '…' : last
}

/**
 * 常见发射机构的中文短名。
 *
 * LL2 给的是官方长名，比如 "China Aerospace Science and Technology Corporation"，
 * 在筛选抽屉的横向 chip 里一行都放不下一个，一排英文长句看着就是一团乱。
 * 这里只收常见的大机构，其余保留原文 —— 译错机构名比不译更糟。
 * 只影响显示，筛选用的值始终是原始英文名。
 */
const AGENCY_ZH = {
	'China Aerospace Science and Technology Corporation': '中国航天科技',
	'China Aerospace Science and Industry Corporation': '中国航天科工',
	'China Rocket Co. Ltd.': '中国火箭',
	ExPace: '航天科工火箭',
	Landspace: '蓝箭航天',
	'Galactic Energy': '星河动力',
	'Space Pioneer': '天兵科技',
	'i-Space': '星际荣耀',
	'Deep Blue Aerospace': '深蓝航天',
	Orienspace: '东方空间',
	'United Launch Alliance': 'ULA',
	'Rocket Lab': '火箭实验室',
	'Indian Space Research Organization': '印度空间研究组织',
	'Russian Federal Space Agency (ROSCOSMOS)': '俄罗斯航天局',
	'European Space Agency': '欧空局',
	'Japan Aerospace Exploration Agency': 'JAXA',
	'National Aeronautics and Space Administration': 'NASA',
	'Agency for Defense Development': '韩国国防科学研究所',
	'Korea Aerospace Research Institute': '韩国航空宇宙研究院',
	'Mitsubishi Heavy Industries': '三菱重工',
	'Firefly Aerospace': '萤火虫航天',
	'Relativity Space': '相对论空间',
	'Blue Origin': '蓝色起源',
	'Rocket Factory Augsburg': 'RFA',
	'Isar Aerospace': 'Isar',
	ArianeGroup: '阿丽亚娜集团',
	'Space One': '太空一号',
	'Interstellar Technologies': '星际科技',
	'Virgin Galactic': '维珍银河',
	'Sea Launch': '海上发射'
}

/** 机构显示名：命中中文表用中文，否则原文（超长截断，一个 chip 别占满屏） */
export function agencyLabel(name) {
	if (!name) return ''
	if (AGENCY_ZH[name]) return AGENCY_ZH[name]
	return name.length > 16 ? name.slice(0, 15) + '…' : name
}

/**
 * 一段文字的「视觉宽度」：半角记 1，中日韩全角记 2。
 *
 * 为什么不用 length：详情页简介按行数折叠（CSS 里 line-clamp 4），
 * 而中文一个字占的位置差不多是英文的两倍。纯按字符数判断，
 * 英文 160 字大约是 3 行、中文 160 字已经是 6 行——中文会被悄悄截掉
 * 却因为没到阈值而不显示「展开全部」，那就真的读不到了。
 * 用统一单位算，中英文落在同一把尺子上。
 */
export function textUnits(s) {
	let n = 0
	for (const ch of String(s == null ? '' : s)) {
		const c = ch.codePointAt(0)
		// CJK 统一表意文字、假名、谚文、全角标点都算双宽
		n += c >= 0x2e80 ? 2 : 1
	}
	return n
}

const FINAL_STATUS = ['Success', 'Failure', 'Deployed', 'Partial']

/**
 * 是否还该出现在「即将发射」列表里。
 *
 * LL2 的 /launches/upcoming/ 会把刚发射完的任务再挂一段时间（状态已经是 Success），
 * 不过滤的话首页顶部会冒出「8 小时前 · 成功」的历史任务，看着像串台了。
 *
 * 但时间过了、状态还是 Go / TBD 的必须保留 —— 那多半是推迟了、LL2 还没更新 net。
 */
export function isStillUpcoming(item) {
	if (!item) return false

	const d = toDate(item.net)
	if (!d) return true
	if (d.getTime() > Date.now()) return true

	const a = (item.status && item.status.abbrev) || ''
	return FINAL_STATUS.indexOf(a) === -1
}

/**
 * 只取时刻：12:45
 * 详情页把发射时刻做成一行大字，和「2026-10-27 12:45」那种混排比，
 * 一眼就能看到几点发。
 */
export function clock(value) {
	const d = toDate(value)
	if (!d) return ''
	return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

const WEEK_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** 长日期：2026年10月27日 星期二 */
export function longDate(value) {
	const d = toDate(value)
	if (!d) return ''
	return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK_ZH[d.getDay()]
}

/** 两个时间的时间跨度，用「X 小时 Y 分钟」表示；非法或非正返回空串 */
export function spanText(from, to) {
	const a = toDate(from)
	const b = toDate(to)
	if (!a || !b) return ''
	const ms = b.getTime() - a.getTime()
	if (!(ms > 0)) return ''
	const min = Math.round(ms / 60000)
	if (min < 60) return min + ' 分钟'
	const h = Math.floor(min / 60)
	const m = min % 60
	return m ? h + ' 小时 ' + m + ' 分钟' : h + ' 小时'
}

/** 千分位，火箭参数动辄上万，不加逗号读不出来 */
function thousands(v) {
	return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 运力 / 质量：大于 1 吨用吨，小运力保留 kg 更直观
 * （和火箭详情页 mass() 同口径，那边暂时还留着自己的副本，收敛时再合并）
 */
export function massText(kg) {
	const v = Number(kg)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1000) {
		const t = v / 1000
		return thousands(t >= 100 ? Math.round(t) : Math.round(t * 10) / 10) + ' 吨'
	}
	return Math.round(v) + ' kg'
}

/** 造价：LL2 给的是美元整数，按中文习惯折成亿 / 万 */
export function costText(usd) {
	const v = Number(usd)
	if (!isFinite(v) || v <= 0) return ''
	// 折成亿 / 万之后数值都不大，再加千分位反而像排版错误
	if (v >= 1e8) return Math.round((v / 1e8) * 10) / 10 + ' 亿美元'
	if (v >= 1e4) return Math.round(v / 1e4) + ' 万美元'
	return Math.round(v) + ' 美元'
}

/**
 * 发射场地名中文化。
 *
 * pad.location 是「场地, 州, 国」的整串（"Cape Canaveral SFS, FL, USA"），
 * 和机构那种精确 key 不同，只能拿已知地名的子串去比。
 * 命不中就原样返回 —— 宁可不翻，也不要把地点翻错。
 */
const PLACE_ZH = [
	['cape canaveral', '卡纳维拉尔角'],
	['kennedy space center', '肯尼迪航天中心'],
	['vandenberg', '范登堡'],
	['starbase', '星际基地'],
	['boca chica', '博卡奇卡'],
	['wallops', '沃洛普斯'],
	['pacific spaceport', '太平洋航天港'],
	['mojave', '莫哈韦'],
	['jiuquan', '酒泉卫星发射中心'],
	['taiyuan', '太原卫星发射中心'],
	['xichang', '西昌卫星发射中心'],
	['wenchang', '文昌航天发射场'],
	['hainan commercial', '海南商业航天发射场'],
	['baikonur', '拜科努尔航天发射场'],
	['plesetsk', '普列谢茨克航天发射场'],
	['vostochny', '东方航天发射场'],
	['kapustin yar', '卡普斯京亚尔'],
	['kourou', '库鲁航天中心'],
	['tanegashima', '种子岛宇宙中心'],
	['uchinoura', '内之浦宇宙空间观测所'],
	['satish dhawan', '萨迪什·达万航天中心'],
	['sriharikota', '斯里哈里科塔'],
	['mahia', '马希亚半岛'],
	['naro', '罗老宇宙中心'],
	['semnan', '塞姆南'],
	['imam khomeini', '伊玛目霍梅尼航天中心'],
	['palmachim', '帕勒马希姆'],
	['alcantara', '阿尔坎塔拉发射中心'],
	['esrange', '埃斯兰奇'],
	['andoya', '安岛航天港'],
	['woomera', '伍默拉'],
	['sutherland', '萨瑟兰']
]

export function placeZh(loc) {
	const s = String(loc == null ? '' : loc)
	if (!s) return ''
	const low = s.toLowerCase()
	for (const pair of PLACE_ZH) {
		if (low.indexOf(pair[0]) !== -1) return pair[1]
	}
	return s
}

/** 工位名缩写：Space Launch Complex 40 → SLC-40，Launch Complex 39A → LC-39A */
export function padShort(name) {
	return String(name == null ? '' : name)
		.replace(/^Space Launch Complex\s+/i, 'SLC-')
		.replace(/^Launch Complex\s+/i, 'LC-')
		.replace(/^Launch Pad\s+/i, 'LP-')
}

/**
 * 型号的「完整中文名」。
 *
 * rocketName 只负责基础名，于是 Falcon 9 的每个构型都变成「猎鹰 9 号」——
 * 五张卡片全长一样，分不出 Block 5 和 v1.0。
 * 这里把构型后缀拼回去：「猎鹰 9 号 Block 5」。
 *
 * 拼之前先判断基础名到底是中文还是英文：
 *   - 基础名没译（仍是英文），直接给 full_name，别拼成 "Falcon 9 Block 5 Block 5"；
 *   - 基础名已含该后缀（例如名称本身就叫 "Starship V3"），不重复拼。
 */
export function rocketFullName(config) {
	if (!config) return ''
	const zh = rocketName(config)
	if (!zh) return ''

	// 基础名里没有汉字 = 没译出来，用原始全名更准确
	if (!/[\u4e00-\u9fa5]/.test(zh)) {
		return config.full_name || config.name || zh
	}

	const variant = String(config.variant || '').trim()
	if (variant && zh.indexOf(variant) === -1) return zh + ' ' + variant
	return zh
}

/**
 * 空间站中文名。
 *
 * LL2 的空间站数据只有简介（descZh）中文化了，名称本身没有译文字段，
 * 一共 15 个站，手写对照表最准：Salyut 1-7 用规则推导，其余逐个钉住。
 */
const STATION_ZH = {
	'International Space Station': '国际空间站',
	'Tiangong space station': '中国空间站',
	'Tiangong 1': '天宫一号',
	'Tiangong 2': '天宫二号',
	Mir: '和平号空间站',
	Skylab: '天空实验室',
	'Genesis I': '创世纪一号',
	'Genesis II': '创世纪二号'
}

export function stationName(raw) {
	const s = String(raw == null ? '' : raw).trim()
	if (!s) return ''
	if (STATION_ZH[s]) return STATION_ZH[s]

	// Salyut 1-7 → 礼炮一~七号
	const m = /^Salyut\s+(\d+)$/i.exec(s)
	if (m) {
		const cn = CN_NUM[Number(m[1])]
		if (cn) return '礼炮' + cn + '号'
	}

	return s
}

/** 远征队名：Expedition 70 → 第 70 次远征 */
export function expeditionName(raw) {
	const s = String(raw == null ? '' : raw).trim()
	if (!s) return ''
	const m = /^Expedition\s+(\d+)$/i.exec(s)
	return m ? '第 ' + m[1] + ' 次远征' : s
}

/**
 * 活动名术语纠正。
 *
 * 机翻在几个航天专名上会翻车：
 *   JUICE（木星冰月探测器）→ 「果汁」
 *   Europa Clipper → 「欧罗巴快艇」（官方是「欧罗巴快船」）
 *   Orbit Insertion → 「轨道插入」（应作「入轨」）
 *   Reentry → 「重返」（应作「再入」）
 * 数据层的 nameZh 是批量生成的，改一次要重跑整轮，所以在展示层做后处理，
 * 新增活动也自动生效。
 */
const EVENT_TERM_FIX = [
	// 顺序有讲究：先把 JUICE 修好，后面的「...冲击」才轮得到
	[/果汁/g, 'JUICE '],
	[/欧罗巴快艇/g, '欧罗巴快船'],
	[/木星冰冷卫星探测器/g, '木星冰月探测器'],
	[/木星冰卫星探测器/g, '木星冰月探测器'],
	[/轨道插入/g, '入轨'],
	[/释放和重返/g, '释放与再入'],
	[/重返大气/g, '再入大气'],
	[/重新进入地球大气层/g, '再入地球大气层'],
	[/脱轨燃烧/g, '离轨点火'],
	[/发动机燃烧/g, '发动机点火'],
	// 航天术语固定用法：gravity assist 是「引力助推」，不是「重力辅助」
	[/重力辅助/g, '引力助推'],
	[/贝皮科伦坡(?!号)/g, '贝皮科伦坡号'],
	[/隼鸟二号/g, '隼鸟 2 号'],
	[/露西(?:·)?特洛伊/g, '露西号 · 特洛伊'],
	[/波音\s*Starliner/g, '波音星际客机'],
	[/SNC-1追梦者/g, 'SNC-1 追梦者'],
	[/美国EVA/g, '美国 EVA'],
	[/冲击$/g, '撞击'],
	[/的的/g, '的']
]

function fixEventTerms(text) {
	let s = String(text == null ? '' : text)
	for (const pair of EVENT_TERM_FIX) s = s.replace(pair[0], pair[1])
	return s
}

/** 活动显示名：中文名 + 术语纠正，没有中文名则用原文 */
export function eventName(ev) {
	if (!ev) return ''
	return fixEventTerms(ev.nameZh || ev.name || '')
}

/**
 * 机构国籍 → 国旗 emoji。
 *
 * 数据里没有国别字段：launcher 只有 manufacturer 字符串，
 * launch_service_provider 只有 id + name，所以只能靠名字认。
 * 认不出返回空串，模板里对应节点直接不渲染，不会留空位。
 *
 * 顺序有讲究：
 *   · 朝鲜必须排在韩国前面，否则 "Korean Committee" 会被 🇰🇷 吃掉；
 *   · 乌克兰排在俄罗斯前面，Yuzhnoye / Yuzhmash 是乌克兰的；
 *   · 具体国家排在「欧洲」前面，否则 ArianeGroup 会全落到 🇪🇺；
 *   · "Rocket Lab USA" 要在中国 / 美国组里先拦掉，剩下的 Rocket Lab 才是新西兰。
 */
const FLAG_RULES = [
	[/china|casc|casic|land ?space|galactic energy|i-?space|cas space|expace|orienspace|space pioneer|deep blue|one ?space|kuaizhou|zhuque|ceres|hyperbola|gravity|tianlong|jielong|kinetica|pallas|lijian|kaituo|chinese/i, '🇨🇳'],
	[/spacex|united launch|\bula\b|blue origin|northrop|orbital (sciences|atk)|firefly|astra space|relativity|stoke|masten|lockheed|martin marietta|mcdonnell|convair|vought|chrysler|boeing|general dynamics|nasa|national aeronautics|air force|virgin (orbit|galactic)|abl space|phantom space|kodiak|rocket lab usa|space systems|spacex/i, '🇺🇸'],
	[/yuzhnoye|yuzhmash|ukrain/i, '🇺🇦'],
	[/khrunichev|progress rocket|energia|roskosmos|russian|makeyev|strategic rocket|soviet|moscow institute|chemical automatics/i, '🇷🇺'],
	[/dprk|north korea|korean committee of space/i, '🇰🇵'],
	[/korea|kari|innospace|perigee/i, '🇰🇷'],
	[/mitsubishi|jaxa|japan aerospace|isas|institute of space and astronautical|interstellar technologies|ihi|japanese/i, '🇯🇵'],
	[/indian space|isro|skyroot|agnikul|dhruva|india/i, '🇮🇳'],
	[/rocket lab/i, '🇳🇿'],
	[/israel|\biai\b/i, '🇮🇱'],
	[/iran/i, '🇮🇷'],
	[/brazil|conae|argentina/i, '🇧🇷'],
	[/aérospatiale|aerospatiale|latitude|maia space|hyprspace/i, '🇫🇷'],
	[/hyimpulse|isar aerospace|rocket factory|ohb|augsburg/i, '🇩🇪'],
	[/avio/i, '🇮🇹'],
	[/skyrora|orbex/i, '🇬🇧'],
	[/pld space|payload aerospace/i, '🇪🇸'],
	[/swedish space|andøya|andoya|esrange/i, '🇸🇪'],
	[/\besa\b|european (space|launcher)|arianespace|arianegroup|eldo/i, '🇪🇺']
]

export function countryFlag(name) {
	const s = String(name == null ? '' : name).trim()
	if (!s) return ''
	for (const [re, flag] of FLAG_RULES) {
		if (re.test(s)) return flag
	}
	return ''
}
