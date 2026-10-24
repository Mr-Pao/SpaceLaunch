'use strict'

/**
 * 发射时间线（T- 序列）增量抓取
 *
 * 背景（实测，别再重复踩）：
 * LL2 的 launch 有 timeline 字段，但**列表端点里恒为空数组**，
 * 只有单条详情 /launches/{id}/ 才返回真实内容。也不存在 /timeline/ 端点
 * （`/timelines/` 直接 404，`/timeline/` 挂死）。
 *
 * 所以时间线只能逐条抓，而配额是 15 次/小时（未认证，按 IP 计）。
 * 做法：每个运行窗口只抓 PER_RUN 条，优先抓「离当前时刻最近」的发射 ——
 * 用户点开详情页的概率和这个基本正相关。一条抓过就不再抓（除空结果有 TTL）。
 *
 * 抓到的结构：{ type: {abbrev, description}, relative_time: "-PT38M" }
 * relative_time 是 ISO 8601 时长，`P0D` 表示 T-0。
 */

const fs = require('fs')
const path = require('path')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig } = require('./lib/cos')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const FILE = 'timelines.json'
const KEY = 'space-data/timelines.json'

// 每轮抓取条数。sync.yml 自身每小时约用 6 次请求（upcoming 4 + events 1 + previous 1），
// 这里 8 条合计 14 次，仍在 15 次/小时的限额内；配了 LL2_TOKEN 就宽裕得多
const PER_RUN = Number(process.env.TIMELINE_PER_RUN || 8)

// 抓回来是空的（任务还没编排时间线）就先放一放，别每小时重复烧配额
const EMPTY_TTL_MS = 12 * 3600 * 1000

// 文件保留上限：只留最近抓的这么多条，避免无限增长
const KEEP = 600

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** 读 COS 上的 JSON；文件不存在或没配桶都返回 null。
 *  注意只要求 COS_BUCKET / COS_REGION —— 桶是公有读，读取不需要密钥，
 *  本地想干跑时给这两个环境变量就够，不必暴露写权限 */
async function readCos(key) {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return null
	const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
		if (!res.ok) return null
		return await res.json()
	} catch (e) {
		console.warn(`  · 读取 ${key} 失败（按空处理）: ${e.message}`)
		return null
	}
}

async function loadSnapshot(file) {
	const d = await readCos('space-data/' + file)
	return (d && d.list) || []
}

/** 抓一条发射的时间线，返回 [{a,d,t}] */
async function fetchOne(id) {
	const j = await getJson(`/launches/${id}/?mode=normal&format=json`, { retries: 0 })
	const rows = Array.isArray(j.timeline) ? j.timeline : []
	return rows
		.map((t) => ({
			a: str(t && t.type && t.type.abbrev),
			d: str(t && t.type && t.type.description),
			t: str(t && t.relative_time)
		}))
		.filter((x) => x.a && x.t)
}

async function runTimelines() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS，时间线只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	await translate.loadCache()

	const old = (await readCos(KEY)) || { list: [] }
	const byId = new Map()
	for (const x of old.list || []) {
		if (x && x.id) byId.set(x.id, x)
	}
	const before = byId.size

	const now = Date.now()
	const snap = [...(await loadSnapshot('launches-upcoming.json')), ...(await loadSnapshot('launches-previous.json'))]

	if (!snap.length) {
		console.warn('  ! 发射快照为空，无法确定抓取目标')
		return { added: 0, total: byId.size }
	}

	// 候选按「离现在多近」排序：快发射的、刚发完的最可能被点开
	const cand = snap
		.filter((x) => x && x.id)
		.map((x) => {
			const t = new Date(x.net || 0).getTime()
			return { id: x.id, name: x.name, net: x.net, d: Math.abs(t - now) }
		})
		.filter((x) => !isNaN(x.d))
		.sort((a, b) => a.d - b.d)

	const todo = []
	for (const c of cand) {
		const prev = byId.get(c.id)
		if (prev) {
			if ((prev.items || []).length) continue
			const age = now - new Date(prev.at || 0).getTime()
			if (age < EMPTY_TTL_MS) continue
		}
		todo.push(c)
		if (todo.length >= PER_RUN) break
	}

	console.log(`  时间线: 快照 ${snap.length} 条 / 已存 ${before} 条 / 本轮抓 ${todo.length} 条`)

	let added = 0
	let empty = 0
	let failed = 0
	const fresh = []

	for (const c of todo) {
		try {
			const items = await fetchOne(c.id)
			byId.set(c.id, { id: c.id, name: c.name, net: c.net, at: new Date().toISOString(), items })
			if (items.length) {
				added++
				fresh.push(...items.map((x) => x.a), ...items.map((x) => x.d))
			} else {
				empty++
			}
			await new Promise((r) => setTimeout(r, 800))
		} catch (e) {
			// 单条失败不影响整轮；不写入，下轮会重试
			failed++
			console.warn(`  ! ${String(c.name).slice(0, 40)} 抓取失败: ${e.message}`)
		}
	}

	// 翻译节点名与说明。同一条时间线会反复出现同样的短语（Prop Load / Ignition…），
	// 按原文哈希缓存，实际只有头几十条会产生新翻译
	if (fresh.length) {
		try {
			await translate.translateTexts(fresh)
		} catch (e) {
			console.warn(`  ! 时间线翻译失败，保留英文: ${e.message}`)
		}
	}

	const list = [...byId.values()]
		.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
		.slice(0, KEEP)

	// 回填中文：abbrev 走 az、description 走 z，前端优先本地表、其次 az
	for (const row of list) {
		for (const it of row.items || []) {
			if (!it.az) it.az = translate.getZh(it.a) || ''
			if (!it.z) it.z = translate.getZh(it.d) || ''
		}
	}

	const payload = {
		v: 1,
		dataset: 'timeline',
		generatedAt: new Date().toISOString(),
		count: list.length,
		served: list.length,
		list
	}

	const filePath = path.join(OUT_DIR, FILE)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(`  → ${FILE}  ${list.length} 条 / ${kb} KB（本轮新增 ${added}、空 ${empty}、失败 ${failed}）`)

	await upload(filePath, KEY, 'public, max-age=1800')

	// 翻译缓存同样要回传，否则下一轮 CI 又是零命中
	const t = translate.summary()
	if (t.dirty) {
		try {
			const cachePath = translate.saveCache()
			await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
		} catch (e) {
			console.warn('  ! 翻译缓存上传失败（不影响数据）: ' + e.message)
		}
	}

	return { added, empty, failed, total: list.length }
}

module.exports = { runTimelines }

// 允许单独跑：node timeline.js
if (require.main === module) {
	runTimelines()
		.then((r) => {
			console.log('\n完成:', JSON.stringify(r))
		})
		.catch((e) => {
			console.error('失败:', e.message)
			process.exit(1)
		})
}
