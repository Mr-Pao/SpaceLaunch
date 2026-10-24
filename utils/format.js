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
