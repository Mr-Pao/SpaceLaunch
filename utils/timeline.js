/**
 * 发射时间线（T- 序列）
 *
 * 数据来自 LL2 单条详情里的 `timeline`（列表端点恒为空，见 scripts/timeline.js）。
 * 原始结构：{ type: { abbrev, description }, relative_time: "-PT38M" }
 * relative_time 是 **ISO 8601 时长**，不是常见的 "-00:38:00"，
 * 所以必须自己解析；`P0D` 表示 T-0 那一刻。
 *
 * 本文件只放纯函数，方便 scripts/verify-pure.js 直接断言。
 */

// 常见节点的中文短名。LL2 的 abbrev 就那几十种，本地查表比调翻译准也快；
// 表里没有的用同步阶段翻好的 az，再没有就退回英文原文
const TL_ZH = {
	'go for prop load': '推进剂加注许可',
	'prop load': '推进剂加注',
	'lox load': '液氧加注',
	'stage 1 lox load': '一级液氧加注',
	'stage 2 lox load': '二级液氧加注',
	'rp-1 load': '煤油加注',
	'go for launch': '发射许可',
	'weather briefing': '天气会商',
	'terminal count': '终端计数',
	'strongback retract': '发射架撤收',
	'crew ingress': '航天员进舱',
	'hatch close': '舱门关闭',
	'engine chill': '发动机预冷',
	'tank press': '贮箱增压',
	startup: '发动机启动',
	ignition: '点火',
	liftoff: '起飞',
	'max-q': '最大动压',
	meco: '一级关机',
	'stage separation': '级间分离',
	'stage 2 separation': '级间分离',
	'ses-1': '二级点火',
	'ses-2': '二级二次点火',
	'seco-1': '二级关机',
	'seco-2': '二级二次关机',
	'fairing deploy': '整流罩分离',
	'fairing separation': '整流罩分离',
	'entry burn': '再入点火',
	'entry burn startup': '再入点火',
	'entry burn shutdown': '再入点火结束',
	'landing burn': '着陆点火',
	'stage 1 landing burn': '一级着陆点火',
	landing: '一级着陆',
	'stage 1 landing': '一级着陆',
	'payload deploy': '载荷分离',
	'payload separation': '载荷分离',
	'payload deployment sequence start': '载荷部署开始',
	'payload deployment sequence end': '载荷部署结束',
	'dragon separation': '飞船分离',
	docking: '对接',
	hold: '暂缓'
}

/**
 * 解析 ISO 8601 时长，返回毫秒（负号表示发射前）
 * 支持 `-PT38M`、`PT2H48M28S`、`P0D`、`P1DT2H`
 * 解析不出来返回 null（调用方要按「无时间」处理，不能当 0）
 */
export function parseDuration(s) {
	if (!s || typeof s !== 'string') return null
	const m = /^(-)?P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/.exec(s.trim())
	if (!m) return null
	const sign = m[1] ? -1 : 1
	const sec = (Number(m[2] || 0) * 24 + Number(m[3] || 0)) * 3600 + Number(m[4] || 0) * 60 + Number(m[5] || 0)
	return sign * sec * 1000
}

/** 节点显示名：本地表 → 同步翻译 → 英文原文 */
export function tlLabel(item) {
	if (!item) return ''
	const raw = String(item.a || '').trim()
	const hit = TL_ZH[raw.toLowerCase()]
	if (hit) return hit
	if (item.az) return item.az
	return raw
}

/** 相对时间的展示串：T-38 分 / T-0 / T+5 分 / T+2 时 48 分 */
export function tlRelative(ms) {
	if (ms == null || isNaN(ms)) return ''
	const sign = ms < 0 ? '-' : '+'
	const sec = Math.round(Math.abs(ms) / 1000)
	const d = Math.floor(sec / 86400)
	const h = Math.floor((sec % 86400) / 3600)
	const m = Math.floor((sec % 3600) / 60)
	if (d) return 'T' + sign + d + ' 天 ' + h + ' 时'
	if (h) return 'T' + sign + h + ' 时 ' + m + ' 分'
	if (m) return 'T' + sign + m + ' 分'
	return 'T' + sign + sec + ' 秒'
}

/**
 * 挑选要展示的节点
 *
 * 默认只给「接下来要发生的」几条 —— 用户打开详情页最想知道的是
 * 「现在到发射还有哪几步」，而不是从头看一遍已经做完的流程。
 * 全部已过（发射完成）则退回到最后几条，把起飞到入轨这段留下来。
 *
 * @param {Array} items 原始 timeline
 * @param {String} net  发射时刻
 * @param {Number} now  当前时间戳
 * @param {Number} limit 展示条数
 * @returns {{ list: Array, more: Number, total: Number }}
 */
export function pickTimeline(items, net, now, limit) {
	const n = limit > 0 ? limit : 4
	const rows = (Array.isArray(items) ? items : [])
		.map((it) => ({ it, ms: parseDuration(it && it.t) }))
		.filter((x) => x.ms !== null)
		.sort((a, b) => a.ms - b.ms)

	if (!rows.length) return { list: [], more: 0, total: 0 }

	const t0 = net ? new Date(net).getTime() : NaN
	const cur = typeof now === 'number' ? now : Date.now()

	let start = 0
	if (!isNaN(t0)) {
		const idx = rows.findIndex((x) => t0 + x.ms >= cur)
		start = idx < 0 ? Math.max(0, rows.length - n) : idx
	}

	const list = rows.slice(start, start + n).map((x) => x.it)
	return { list, more: Math.max(0, rows.length - start - list.length), total: rows.length }
}

/** 整条时间线按时间正序排好（「查看全部」时用） */
export function sortedTimeline(items) {
	return (Array.isArray(items) ? items : [])
		.map((it) => ({ it, ms: parseDuration(it && it.t) }))
		.filter((x) => x.ms !== null)
		.sort((a, b) => a.ms - b.ms)
		.map((x) => Object.assign({}, x.it, { rel: x.ms }))
}
