'use strict'

/**
 * 把「火箭技术参数」内联进发射快照
 *
 * 为什么在同步阶段 join，而不是让前端自己去拉 launchers.json：
 * launchers.json 有 568KB，只为详情页里一张「火箭介绍」卡下载它太贵；
 * 而 launchers 是每天刷一次的低频快照，发射详情页却是最常被打开的页面。
 *
 * 这里只取详情页真正展示的十几个字段，单条约 300 字节 ——
 * 100 条快照只多 30KB，比多拉一个 568KB 的文件划算得多。
 *
 * 参数本身几乎不变（型号定型后就固定了），
 * 所以即使 launchers 快照是几小时前的，join 出来的值也不会过时。
 */

// 详情页「火箭介绍」卡要展示的字段，别加没用的东西撑体积
const BRIEF_KEYS = [
	'id',
	'name',
	'variant',
	'active',
	'reusable',
	'min_stage',
	'max_stage',
	'length',
	'diameter',
	'launch_mass',
	'to_thrust',
	'leo_capacity',
	'gto_capacity',
	'launch_cost',
	'maiden_flight',
	'manufacturer',
	'image',
	'wiki_url',
	'info_url'
]

// 简介截断长度：卡片里大概 5 行，再长也没人读，想读全文点进型号页
const DESC_MAX = 260

/** 从一条 launchers 记录里抽出详情页需要的精简对象 */
function toBrief(c) {
	if (!c) return null
	const brief = {}
	for (const k of BRIEF_KEYS) {
		const v = c[k]
		if (v === undefined || v === null || v === '') continue
		brief[k] = v
	}
	const desc = (c.descriptionZh || c.description || '').trim()
	if (desc) brief.desc = desc.length > DESC_MAX ? desc.slice(0, DESC_MAX - 1) + '…' : desc
	return Object.keys(brief).length ? brief : null
}

/**
 * @param {Array} list 已 slim 的发射列表（会被就地修改）
 * @param {Function} readCosJson 读 COS 上 JSON 的函数，返回 Promise
 * @returns {Promise<number>} 成功挂上的条数
 */
async function enrichRockets(list, readCosJson) {
	if (!Array.isArray(list) || !list.length) return 0

	let launchers
	try {
		launchers = await readCosJson('space-data/launchers.json')
	} catch (e) {
		// 型号库拉不到不算致命：详情页的火箭卡会退化成只有名字
		console.warn(`  ! 型号库读取失败，火箭参数本次留空: ${e.message}`)
		return 0
	}

	const rows = (launchers && launchers.list) || []
	if (!rows.length) {
		console.warn('  ! 型号库为空，跳过火箭参数回填')
		return 0
	}

	const byId = new Map()
	for (const c of rows) {
		if (c && c.id != null) byId.set(String(c.id), toBrief(c))
	}

	let hit = 0
	for (const item of list) {
		const cfg = item && item.rocket && item.rocket.configuration
		const id = cfg && cfg.id
		if (id == null) continue
		const brief = byId.get(String(id))
		if (brief) {
			item.rocketBrief = brief
			hit++
		}
	}

	console.log(`  火箭参数: 命中 ${hit}/${list.length} 条（型号库 ${rows.length} 个构型）`)
	return hit
}

module.exports = { enrichRockets, toBrief }
