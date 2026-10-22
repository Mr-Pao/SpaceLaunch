'use strict'

/**
 * 小样本验证 slimAgency / slimLaunch 的字段归一化
 *
 * ⚠️ 这个脚本会消耗 2 个正式配额。只在改了 slim.js 的字段映射后跑一次。
 *    想省配额就先设环境变量：LL2_BASE=dev
 */

const { getJson } = require('./lib/fetch')
const { slimAgency, slimLaunch } = require('./lib/slim')

function findUndefined(v, p, bag) {
	if (v === undefined) { bag.push(p || '(root)'); return }
	if (v === null || typeof v !== 'object') return
	if (Array.isArray(v)) { v.forEach((x, i) => findUndefined(x, `${p}[${i}]`, bag)); return }
	for (const k of Object.keys(v)) findUndefined(v[k], p ? `${p}.${k}` : k, bag)
}

;(async () => {
	// ---------- 机构 ----------
	const a = await getJson('/agencies/?limit=3&format=json')
	console.log('\n=== 原始机构（第 1 条的类型） ===')
	const raw = a.results[0]
	const brief = (v, n) => String(typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)).slice(0, n || 300)
	console.log('  type       =', brief(raw.type))
	console.log('  country    =', brief(raw.country))
	console.log('  launchers  =', brief(raw.launchers))
	console.log('  image_url  =', brief(raw.image_url, 60))
	console.log('  logo_url   =', brief(raw.logo_url, 60))
	console.log('  founding   =', brief(raw.founding_year, 40))

	console.log('\n=== 裁剪后 ===')
	for (const item of a.results) {
		const s = slimAgency(item)
		const bad = []
		findUndefined(s, '', bad)
		console.log(JSON.stringify(s, null, 1))
		console.log('  undefined 字段:', bad.length ? bad.join(',') : '无')
	}

	// ---------- 历史发射 ----------
	const p = await getJson('/launches/previous/?limit=3&mode=normal&format=json')
	console.log('\n=== 历史发射裁剪后（验证排序与字段） ===')
	for (const item of p.results) {
		const s = slimLaunch(item)
		const bad = []
		findUndefined(s, '', bad)
		console.log(`  ${s.net}  ${s.status.abbrev.padEnd(8)}  ${s.rocket.configuration.name}  |  ${s.name.slice(0, 40)}`)
		if (bad.length) console.log('    undefined:', bad.join(','))
	}
	console.log('  count =', p.count)
})().catch((e) => {
	console.error('验证失败:', e.message)
	process.exit(1)
})
