'use strict'

/**
 * 发射时间线（T- 序列）+ 航天器 增量抓取
 *
 * 背景（实测，别再重复踩）：
 * LL2 的 launch 有 timeline 字段，但**列表端点里恒为空数组**，
 * 只有单条详情 /launches/{id}/ 才返回真实内容。也不存在 /timeline/ 端点
 * （`/timelines/` 直接 404，`/timeline/` 挂死）。
 * 更坑的是单条详情会忽略 `?mode=normal`，一律按 detailed 返回（响应 20KB+）。
 *
 * rocket.spacecraft_stage 完全同理：列表端点根本没有这个键，单条详情才有。
 * 既然都要单独请求了，就一趟车全抓回来 —— 时间线和航天器共用一次配额。
 *
 * 所以只能逐条抓，而配额是 15 次/小时（未认证，按 IP 计）。
 * 做法：每个运行窗口只抓 PER_RUN 条，优先抓「离当前时刻最近」的发射 ——
 * 用户点开详情页的概率和这个基本正相关。一条抓过就不再抓（除空结果有 TTL）。
 *
 * 抓到的结构：{ type: {abbrev, description}, relative_time: "-PT38M" }
 * relative_time 是 ISO 8601 时长，`P0D` 表示 T-0。
 */

const fs = require('fs')
const path = require('path')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')

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
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null)

/** image 是对象 { image_url, thumbnail_url, credit }，也可能为 null */
function imgUrl(image) {
	if (!image) return ''
	if (typeof image === 'string') return image
	return image.thumbnail_url || image.image_url || ''
}

/** 描述字段要限长：spacecraft_config.details 有的能到 2000 字，
 *  一屏只显示三四行，存全量纯属浪费流量 */
const cut = (s, n) => {
	const t = String(s || '').replace(/\s+/g, ' ').trim()
	return t.length > n ? t.slice(0, n) + '…' : t
}

async function loadSnapshot(file) {
	const d = await readCosJson('space-data/' + file)
	return (d && d.list) || []
}

/**
 * 这次的航天器（飞船 / 载荷本体）
 *
 * 列表端点**完全没有**这个字段，只有单条详情的 rocket.spacecraft_stage 才给 ——
 * 和 timeline 一个套路，所以搭同一趟车抓回来，零额外请求。
 * 结构上 spacecraft_stage 是数组（一次发多个飞船的情况），这里只留第一艘：
 * 详情页一张卡，多了也没地方放。长征这类不公开载荷的任务恒为 []。
 */
function slimCraft(stage) {
	const st = Array.isArray(stage) ? stage[0] : stage
	if (!st || typeof st !== 'object') return null
	const s = st.spacecraft || {}
	const cfg = s.spacecraft_config || {}
	const img = s.image || cfg.image

	const craft = {
		name: str(s.name),
		// 飞船编号（C204）与构型名（Crew Dragon 2）是两回事，分开展示
		serial: str(s.serial_number),
		config: str(cfg.name),
		type: str(cfg.type && cfg.type.name),
		agency: str(cfg.agency && cfg.agency.name),
		status: str(s.status && s.status.name),
		dest: str(st.destination),
		desc: cut(s.description || cfg.details || cfg.capability, 220),
		image: imgUrl(img),
		credit: str(img && img.credit),
		crew: num(cfg.crew_capacity),
		payload: num(cfg.payload_capacity),
		height: num(cfg.height),
		diameter: num(cfg.diameter),
		life: cut(cfg.flight_life, 80),
		maiden: str(cfg.maiden_flight),
		human: Boolean(cfg.human_rated),
		flights: num(s.flights_count)
	}

	// 全空就当没有 —— 免得详情页出现一张只有标题的空卡
	const has = Object.keys(craft).some((k) => typeof craft[k] === 'boolean' ? craft[k] : craft[k] !== '' && craft[k] != null)
	return has ? craft : null
}

/** 抓一条发射：时间线 + 航天器，一次请求两个产物 */
async function fetchOneFull(id) {
	const j = await getJson(`/launches/${id}/?mode=normal&format=json`, { retries: 0 })
	const rows = Array.isArray(j.timeline) ? j.timeline : []
	const items = rows
		.map((t) => ({
			a: str(t && t.type && t.type.abbrev),
			d: str(t && t.type && t.type.description),
			t: str(t && t.relative_time)
		}))
		.filter((x) => x.a && x.t)
	return { items, craft: slimCraft(j.rocket && j.rocket.spacecraft_stage) }
}

async function runTimelines() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS，时间线只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	const old = (await readCosJson(KEY)) || { list: [] }
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
			// v2 起每行都带 craft 键（值可能是 null）。没这个键 = v1 的老记录，
			// 时间线有内容却没抓过航天器 —— 放行重抓一次把它补齐
			const craftKnown = 'craft' in prev
			const hasData = Boolean((prev.items || []).length || prev.craft)
			if (hasData && craftKnown) continue
			// 抓过、确实什么都没有（长征这类不公开载荷的任务），先放一放
			if (craftKnown && now - new Date(prev.at || 0).getTime() < EMPTY_TTL_MS) continue
		}
		todo.push(c)
		if (todo.length >= PER_RUN) break
	}

	console.log(`  时间线: 快照 ${snap.length} 条 / 已存 ${before} 条 / 本轮抓 ${todo.length} 条`)

	let added = 0
	let empty = 0
	let failed = 0
	let crafts = 0

	for (const c of todo) {
		try {
			const r = await fetchOneFull(c.id)
			byId.set(c.id, {
				id: c.id,
				name: c.name,
				net: c.net,
				at: new Date().toISOString(),
				items: r.items,
				craft: r.craft
			})
			if (r.items.length) added++
			else empty++
			if (r.craft) crafts++
			await new Promise((r2) => setTimeout(r2, 800))
		} catch (e) {
			// 单条失败不影响整轮；不写入，下轮会重试
			failed++
			console.warn(`  ! ${String(c.name).slice(0, 40)} 抓取失败: ${e.message}`)
		}
	}

	// 飞船图同样要落到 COS：LL2 的域名不在小程序的合法域名白名单里，
	// 直连会全军覆没。失败的保留原地址，前端 onerror 兜底不显示
	const fresh = todo.map((c) => byId.get(c.id)).filter((x) => x && x.craft && x.craft.image)
	if (fresh.length) await mirrorImages(fresh, [{ path: 'craft.image', preset: 'thumb' }])

	// 这里**不翻译**节点名。
	// 第一版试过走机器翻译，结果 "Prop Load" → 「支柱负载」、"GO for Prop Load" →
	// 「GO 进行支柱负载」，全是航天术语被通用翻译毁掉的样子。
	// 节点名就那几十种，交给 utils/timeline.js 的本地表；表外的显示英文原文更诚实。
	const list = [...byId.values()]
		.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
		.slice(0, KEEP)

	const payload = {
		// v2: 每行多了 craft（航天器）。前端按字段有无降级，不需要版本判断，
		// 这里只是留个记号方便排查数据是哪一版抓的。
		// 须与 DATA_VERSION(=14) 同步：前端缓存/数据版本一致性依赖它
		v: 14,
		dataset: 'timeline',
		generatedAt: new Date().toISOString(),
		count: list.length,
		served: list.length,
		list
	}

	const filePath = path.join(OUT_DIR, FILE)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(
		`  → ${FILE}  ${list.length} 条 / ${kb} KB（本轮新增时间线 ${added}、航天器 ${crafts}、空 ${empty}、失败 ${failed}）`
	)

	// 第二层保险（P1-1）：哪怕 readCosJson 之后的链路还有未知的清空路径，
	// 产出比存量缩水太多时宁可这轮不更新 —— 线上数据比时效重要
	if (before > 20 && list.length < Math.floor(before * 0.3)) {
		console.error(`  ! 产出 ${list.length} 条远小于存量 ${before} 条，疑似数据丢失，拒传（线上旧数据保留）`)
		return { added, empty, failed, total: before, rejected: true }
	}

	await upload(filePath, KEY, 'public, max-age=1800')

	return { added, crafts, empty, failed, total: list.length }
}

module.exports = { runTimelines, slimCraft }

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
