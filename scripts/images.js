'use strict'

/**
 * 发射图片全量补齐 + 图库聚合数据
 *
 * 两件事一次请求顺路做完（共用同一批 normal 列表响应，不额外耗配额）：
 *
 * 1. **原图镜像（preset full）**：把每条发射的 image.image_url 镜像到 COS，
 *    宽 2000 / 上限 1.2MB。列表和瀑布流继续用缩略图（几十 KB），
 *    用户点开全屏时前端按 hash 推导原图地址（utils/media.js 的 fullImageOf）：
 *    COS key 的 hash 只依赖原始 URL、后缀只依赖宽度，所以同一张图
 *    thumb = space-img/{hash}.jpg 与 full = space-img/{hash}_2000.jpg
 *    可以纯字符串互推，**不需要任何 schema 变更和 DATA_VERSION 升级**。
 *    前端推导失败的（还没扫到的）由调用方回退缩略图。
 *
 * 2. **gallery.json**：图库聚合页的数据源。从同一批响应里收集
 *    「有图的发射」压成 {id, name, net, thumb, credit, cname} 行，
 *    按 net 倒序累积。聚合页一个请求就能出瀑布流，
 *    不用为了拼图把 upcoming/previous/归档分片全拉一遍。
 *
 * 游标策略：与 videos.js 同款游标循环 —— previous 按 net 降序稳定排列，
 * 从最新往最老扫（最近发射的原图最先可用），扫完一圈归零重扫，
 * 顺带把新发射、以及之前镜像失败漏掉的图补上。
 * 全量约 7654 条 / 每轮 100 条 = 77 轮；挂在 video 轮（每小时 1 次）上，3 天出头扫完。
 *
 * 配额：每轮 2 个请求（2 页 × limit50）。与 video 轮合计 4 次，
 * 小时预算仍然在 15 次以内（见 sync.yml 头部注释）。
 */

const fs = require('fs')
const path = require('path')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const STATE_KEY = 'space-data/history/state-images.json'
const GALLERY_KEY = 'space-data/gallery.json'

// 每轮扫多少条发射 = 2 个请求（limit 50 × 2）
const PER_RUN = Number(process.env.IMAGE_PER_RUN || 100)
const PAGE = 50
// 图库聚合保留上限。800 张 × ~150B ≈ 120KB，两列瀑布流够翻很久
const KEEP = 800

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))

async function readState() {
	try {
		const s = await readCosJson(STATE_KEY)
		if (s && typeof s.cursor === 'number') return s
	} catch (e) {
		// 状态读不到（网络问题）时中止本轮，别把游标当 0 重扫——那会整圈白扫
		console.error('  ! 图片游标状态读取失败，本轮放弃: ' + e.message)
		throw e
	}
	return { cursor: 0, total: 0 }
}

async function runImages() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS 密钥，只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	const state = await readState()
	let cursor = Number(state.cursor) || 0
	let total = Number(state.total) || 0

	// 线上 gallery 优先；本地干跑时 COS 上还没有，退回上次写的 dist
	let gallery = await readCosJson(GALLERY_KEY)
	if (!gallery) {
		try {
			gallery = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'gallery.json'), 'utf8'))
		} catch (e) {
			gallery = null
		}
	}
	const byId = new Map()
	for (const x of (gallery && gallery.list) || []) {
		if (x && x.id) byId.set(String(x.id), x)
	}
	const before = byId.size

	// image 与 imageFull 铺的是**同一个原始 URL**：
	// mirrorImages 按字段路径 + 预设原地改写，两个字段各走各的预设，
	// 镜像完 image 变成 COS 缩略图地址（进 gallery），imageFull 的结果
	// 已经落在 COS 上、不需要进任何 JSON（前端用 fullImageOf 推导）。
	const rawRows = []
	for (let off = cursor; off < cursor + PER_RUN; off += PAGE) {
		let d
		try {
			d = await getJson(
				`/launches/previous/?mode=normal&limit=${PAGE}&offset=${off}&format=json`,
				{ retries: 1 }
			)
		} catch (e) {
			// 单页失败不影响整轮：游标照常推进，下一圈补上
			console.warn(`  ! offset=${off} 抓取失败: ${e.message}`)
			break
		}
		if (!total && d.count) total = d.count
		const results = d.results || []
		for (const r of results) {
			if (!r || !r.id || !r.image || !r.image.image_url) continue
			rawRows.push({
				id: str(r.id),
				name: str(r.name),
				net: str(r.net),
				credit: str(r.image.credit),
				image: str(r.image.image_url),
				imageFull: str(r.image.image_url),
				cname: str(r.rocket && r.rocket.configuration && r.rocket.configuration.name)
			})
		}
		if (results.length < PAGE) break
	}

	console.log(`  图片: 游标 ${cursor}/${total || '?'} / 本轮有图 ${rawRows.length} 条 / 已聚合 ${before} 张`)

	if (rawRows.length) {
		await mirrorImages(rawRows, [
			{ path: 'image', preset: 'thumb' },
			{ path: 'imageFull', preset: 'full' }
		])
	}

	// ---- 组装 gallery ----
	for (const r of rawRows) {
		if (!r.image) continue // 原始图镜像失败时 image 保持原地址，仍可进 gallery
		byId.set(r.id, {
			id: r.id,
			name: r.name,
			net: r.net,
			thumb: r.image,
			credit: r.credit,
			cname: r.cname
		})
	}

	const next = cursor + PER_RUN
	const list = [...byId.values()]
		.sort((a, b) => new Date(b.net || 0) - new Date(a.net || 0))
		.slice(0, KEEP)

	const payload = {
		v: 1,
		dataset: 'gallery',
		generatedAt: new Date().toISOString(),
		count: list.length,
		served: list.length,
		cursor: total ? (next >= total ? 0 : next) : next,
		total,
		list
	}

	const filePath = path.join(OUT_DIR, 'gallery.json')
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(`  → gallery.json  ${list.length} 张 / ${kb} KB`)

	// 游标状态也要落盘。CI 是干净环境，dist 里不会有历史文件，
	// 忘了写这行、只在上传时引用，就会 ENOENT 崩掉（v3.1.9 首跑实测）
	fs.writeFileSync(
		path.join(OUT_DIR, 'state-images.json'),
		JSON.stringify({ v: 1, cursor: payload.cursor, total, at: payload.generatedAt }),
		'utf8'
	)

	// 产出缩水保险（与 videos.js 同思路）：存量 >20 时骤减按事故处理，拒传
	if (before > 20 && list.length < Math.floor(before * 0.3)) {
		console.error(`  ! gallery 产出 ${list.length} 远小于存量 ${before}，疑似丢失，拒传`)
		return { rows: rawRows.length, total: before, rejected: true }
	}

	await upload(filePath, GALLERY_KEY, 'public, max-age=1800')

	// 游标最后落盘：数据传了游标没传，下一轮会重扫这一批（probe 会兜住，无害）；
	// 游标传了数据没传，中间一段就永远没人扫了 —— 所以顺序必须是先数据后游标
	await upload(
		path.join(OUT_DIR, 'state-images.json'),
		STATE_KEY,
		'no-cache',
		'application/json'
	)

	return { rows: rawRows.length, total: list.length, cursor: payload.cursor }
}

module.exports = { runImages }

if (require.main === module) {
	runImages()
		.then((r) => {
			console.log('完成:', JSON.stringify(r))
			process.exit(0)
		})
		.catch((e) => {
			console.error('失败:', e)
			process.exit(1)
		})
}
