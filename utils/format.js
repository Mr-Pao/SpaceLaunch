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
export function statusInfo(status) {
	if (!status) return { text: '未知', cls: 'normal' }

	const text = status.nameZh || status.name || status.abbrev || '未知'
	const a = status.abbrev || ''

	if (a === 'Success' || a === 'Deployed') return { text, cls: 'success' }
	if (a === 'Failure' || a === 'Partial') return { text, cls: 'failure' }
	if (a === 'In Flight') return { text, cls: 'flying' }
	if (a === 'Go') return { text, cls: 'go' }
	return { text, cls: 'pending' }
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
	// 长征五号B 的 B 是构型而不是「乙」，官方写法就是 5B，规则推导会推错，单独钉住
	'Long March 5B': '长征五号B',
	'Long March 5B/YZ-2': '长征五号B/YZ-2',

	'Zhuque-2': '朱雀二号',
	'Zhuque-2E': '朱雀二号E',
	'Zhuque-2E Block 2': '朱雀二号E',
	'Zhuque-3': '朱雀三号',
	'Ceres-1': '谷神星一号',
	'Ceres-1S': '谷神星一号S',
	'Kuaizhou 1A': '快舟一号甲',
	'Kuaizhou 11': '快舟十一号'
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
export function rocketName(config) {
	if (!config) return ''
	const raw = config.full_name || config.name || ''
	if (!raw) return ''
	return ROCKET_ZH[raw] || zhLongMarch(raw) || raw
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
export function launchTitle(item) {
	if (!item) return ''

	const rocket = rocketName(item.rocket && item.rocket.configuration)
	const m = item.mission || {}
	const mission = fixTerms(m.nameZh || m.name || '')

	if (mission && rocket) return rocket + ' | ' + mission
	if (mission) return mission
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
