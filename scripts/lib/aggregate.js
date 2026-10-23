'use strict'

/**
 * 按年份聚合统计
 *
 * 为什么要放在 CI 侧预聚合：
 * 统计页要覆盖全部历史（7656 条），但把这些原始数据塞进一个文件是 9MB 起步，
 * 小程序下载完再 JSON.parse 会卡好几秒。而页面实际只需要「按年分组的排名和计数」，
 * 在 CI 里算完传下来只有几十 KB，前端秒开。
 *
 * 数据源 = 最新快照（launches-previous.json）+ 历史归档分片（history/pNN.json），
 * 归档还在逐小时补齐，所以这份统计会随着归档自动变全，代码不用改。
 */

const OK = ['Success', 'Deployed']
const BAD = ['Failure']
const PARTIAL = ['Partial']

/**
 * 统一两种 launch 结构
 *
 * stats 的数据源有两个，字段形态不一样：
 *   - launches-previous.json 用的是 slimLaunch（status 是对象、rocket.configuration、pad.location）
 *   - history/pNN.json       用的是 slimStatLaunch（status 是字符串、rocket 是字符串、site）
 * 必须先把字段拍平成同一种，否则聚合出来全是 `[object Object]`。
 */
function normalize(x) {
	const status =
		typeof x.status === 'string'
			? x.status
			: (x.status && (x.status.abbrev || x.status.name)) || ''

	const rocket =
		typeof x.rocket === 'string'
			? x.rocket
			: (x.rocket && x.rocket.configuration && x.rocket.configuration.name) || ''

	const site = x.site || (x.pad && x.pad.location && x.pad.location.name) || ''

	const orbit =
		x.orbit ||
		(x.mission && x.mission.orbit && (x.mission.orbit.abbrev || x.mission.orbit.name)) ||
		''

	const agency = x.agency || (x.launch_service_provider && x.launch_service_provider.name) || ''

	return { status, rocket, site, orbit, agency }
}

function bump(map, key) {
	if (!key) return
	map.set(key, (map.get(key) || 0) + 1)
}

function top(map, limit) {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name, count]) => ({ name: name || '未标注', count }))
}

/** @returns {object[]} 按年份倒序的统计行 */
function aggregateByYear(list) {
	const byYear = new Map()

	for (const x of list) {
		if (!x || !x.net) continue

		const at = new Date(x.net)
		const year = at.getFullYear()
		if (isNaN(year)) continue

		let row = byYear.get(year)
		if (!row) {
			row = {
				year,
				total: 0,
				success: 0,
				fail: 0,
				partial: 0,
				sub: 0,
				months: new Array(12).fill(0),
				rockets: new Map(),
				sites: new Map(),
				agencies: new Map(),
				orbits: new Map(),
				failures: []
			}
			byYear.set(year, row)
		}

		row.total++

		const f = normalize(x)
		const s = f.status

		if (OK.indexOf(s) !== -1) row.success++
		else if (BAD.indexOf(s) !== -1) row.fail++
		else if (PARTIAL.indexOf(s) !== -1) row.partial++

		if (f.orbit === 'Sub') row.sub++

		const m = at.getMonth()
		if (m >= 0 && m < 12) row.months[m]++

		bump(row.rockets, f.rocket)
		bump(row.sites, f.site)
		bump(row.agencies, f.agency)
		bump(row.orbits, f.orbit || '未标注')

		if (BAD.indexOf(s) !== -1 || PARTIAL.indexOf(s) !== -1) {
			row.failures.push({
				id: x.id || '',
				name: x.name || '',
				net: x.net,
				rocket: f.rocket,
				site: f.site,
				status: s
			})
		}
	}

	return [...byYear.values()]
		.sort((a, b) => b.year - a.year)
		.map((row) => ({
			year: row.year,
			total: row.total,
			success: row.success,
			fail: row.fail,
			partial: row.partial,
			orbital: row.total - row.sub,
			sub: row.sub,
			months: row.months,
			rockets: top(row.rockets, 10),
			sites: top(row.sites, 10),
			agencies: top(row.agencies, 8),
			orbits: top(row.orbits, 8),
			// 最近的排前面，最多留 20 条
			failures: row.failures.sort((a, b) => (a.net < b.net ? 1 : -1)).slice(0, 20)
		}))
}

module.exports = { aggregateByYear }
