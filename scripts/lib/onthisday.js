'use strict'

/**
 * 「往年今日」
 *
 * 把全量历史发射（最新快照 + 历史归档分片）按「月-日」分组，取出与今天
 * 同月同日的那一批，交给前端做「12 年前的今天」卡片。
 *
 * 为什么不在前端算：
 *   全量 7656 条压成前端能用的体积也要 2MB 起步，而页面一天只需要二十来条。
 *   在 CI 侧筛完再下发只有几 KB，和小程序「数据在 CI 里算好」的既有架构一致。
 *
 * 为什么按北京时间算「今天」：
 *   用户在中国，晚上 21 点看的时候 UTC 还是前一天的 13 点，
 *   用 UTC 会把「今天」算成昨天，卡片直接错一天。
 */

const BJ_OFFSET = 8 * 60 * 60 * 1000
const MAX_ITEMS = 40

function pad2(n) {
	return n < 10 ? '0' + n : String(n)
}

/**
 * ISO 时间 → 北京时间的「月-日」与年份
 * @returns {{md:string, y:number}|null}
 */
function bjParts(iso) {
	const t = Date.parse(iso)
	if (isNaN(t)) return null
	const d = new Date(t + BJ_OFFSET)
	return { md: pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()), y: d.getUTCFullYear() }
}

function str(v) {
	return typeof v === 'string' ? v.trim() : ''
}

/**
 * 把两种来源的 launch 拍平成 onthisday 的精简条目。
 *
 * 两种来源：
 *   - launches-previous.json   slimLaunch（status 对象 / rocket.configuration / pad.location）
 *   - history/pNN.json         也是 slimLaunch，但历史上混过 slimStatLaunch
 *                              （status 是字符串、rocket 是字符串、site 直接给）
 * 字段一律「对象优先取深层，取不到就当字符串」，两种都兜住。
 */
function normalize(x) {
	if (!x || typeof x !== 'object') return null

	const when = bjParts(str(x.net))
	if (!when) return null

	const st = x.status
	const status = typeof st === 'string' ? st : str(st && (st.abbrev || st.name))

	const rk = x.rocket
	const rocket =
		typeof rk === 'string'
			? rk
			: str(rk && rk.configuration && (rk.configuration.name || rk.configuration.full_name))

	const lsp = x.launch_service_provider
	const agency = typeof lsp === 'string' ? lsp : str(lsp && lsp.name) || str(x.agency)

	const pad = x.pad
	const site = str(pad && pad.location && pad.location.name) || str(x.site)

	const mission = x.mission || {}

	return {
		id: x.id ?? null,
		// 任务名优先用已有中文（previous 快照带 mission.nameZh；
		// 归档分片没有，就退回英文原名，卡片上英文任务名本来就是常态）
		name: str(mission.name) || str(x.name),
		nameZh: str(mission.nameZh),
		net: str(x.net),
		md: when.md,
		y: when.y,
		status,
		rocket,
		agency,
		site,
		// image 在快照里已经是 COS 缩略图地址（480px），归档里是原图，
		// 由 sync 的 mirrorImages 统一换掉
		img: str(x.image) || str(x.imageThumb),
		credit: str(x.imageCredit)
	}
}

/**
 * 从全量历史里挑出「往年今日」
 *
 * @param {object[]} items    previous 快照 + 归档分片的并集
 * @param {number}   nowMs    当前时间戳（测试用）
 * @param {number}   [limit]
 * @returns {{md:string, list:object[]}}
 */
function pickOnThisDay(items, nowMs, limit) {
	const cap = limit || MAX_ITEMS
	const today = bjParts(new Date(nowMs).toISOString())
	if (!today) return { md: '', list: [] }

	const seen = new Set()
	const out = []

	for (const raw of items || []) {
		const x = normalize(raw)
		if (!x || x.md !== today.md) continue
		// 今年的不算「往年」
		if (x.y >= today.y) continue
		// 快照与归档会重叠（归档从第 100 条往后，理论上不重，但 id 去重最稳）
		const key = String(x.id || x.name + x.net)
		if (seen.has(key)) continue
		seen.add(key)
		delete x.md
		out.push(x)
	}

	// 最近的一年排最前：「5 年前的今天」比「58 年前的今天」更有代入感
	out.sort((a, b) => b.y - a.y)

	return { md: today.md, list: out.slice(0, cap) }
}

module.exports = { bjParts, normalize, pickOnThisDay, pad2 }
