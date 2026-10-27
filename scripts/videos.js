'use strict'

/**
 * 发射视频（官方直播 / 回放 / 第三方转播）增量抓取
 *
 * 四条实测结论，别再重复踩：
 *
 * 1. 视频挂在 launch **顶层** 的 `vid_urls`，**不是** `mission.vid_urls`。
 *    后者在任何模式下都是空数组 —— slim.js 之前读的就是它，
 *    所以「视频库 0 条」不是数据源没有，是读错了位置。
 * 2. `mode=normal` **完全不返回** 顶层 vid_urls（连这个键都没有），
 *    只有 `mode=detailed` 才给。也就是说视频没法跟着普通同步顺路带回来。
 * 3. 好在 detailed 的**列表端点**一次能带多条（limit=3 实测 12 秒），
 *    不用像时间线那样逐条抓单条详情 —— 一个请求换 5 条发射的全部视频。
 * 4. 元素字段很全：url / title / publisher / source / priority /
 *    type{id,name} / feature_image / start_time / end_time / live。
 *    feature_image 是 YouTube 缩略图，尺寸正好当卡片封面。
 *
 * 策略：按 previous 的默认排序（net 降序）分页扫，游标循环推进。
 * 扫完一圈回到头部 —— 那时最新的一批发射已经换人，顺便把
 * 新挂上去的 webcast 补进来。不按「热门系列」过滤：LL2 的时间过滤
 * 参数实测无效，按配置过滤更是没有，而 previous 的排序本身
 * 就已经是「最近最多人关心的」—— 猎鹰 9 号能占到四成。
 */

const fs = require('fs')
const path = require('path')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const FILE = 'videos.json'
const KEY = 'space-data/videos.json'

// 每轮抓多少条发射的详情。detailed 一页 5 条（约 12 秒），10 条 = 2 个请求；
// sync 自身每小时约 6 次，合计 8 次，离 15 次/小时的限额还有余量
const PER_RUN = Number(process.env.VIDEO_PER_RUN || 10)
const PAGE = 5

// 文件保留上限。全量扫完后「有视频的发射」约 1000-1500 条（远古发射没有
// webcast），按 net 倒序留最近的 1200 条，约 500KB。太老的前端也几乎不翻。
const KEEP = 1200

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const cut = (s, n) => {
	const t = str(s).replace(/\s+/g, ' ').trim()
	return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/**
 * 官方直播排最前
 *
 * type.id：1 = Official Webcast、3 = Unofficial Webcast、4 = Unofficial Re-stream。
 * 别按 priority 排 —— 它是反的，官方那条 priority 反而最大（10），
 * 按它降序会把第三方转播顶到第一个。
 */
const KIND_RANK = { 1: 0, 3: 1, 4: 2 }

/** 一条发射的 webcast 列表 → 前端卡片直接能用的形状 */
function slimVids(raw) {
	if (!Array.isArray(raw)) return []
	const out = []
	for (const v of raw) {
		if (!v || !v.url) continue
		const st = v.start_time ? new Date(v.start_time).getTime() : 0
		const en = v.end_time ? new Date(v.end_time).getTime() : 0
		// 直播时长：有起止时间才算，算不出来就留 0（前端不显示）
		const mins = st && en && en > st ? Math.round((en - st) / 60000) : 0
		out.push({
			url: str(v.url),
			title: cut(v.title || (v.type && v.type.name), 70),
			publisher: str(v.publisher) || str(v.source),
			kind: str(v.type && v.type.name),
			tid: Number(v.type && v.type.id) || 9,
			cover: str(v.feature_image),
			start: str(v.start_time),
			mins,
			live: Boolean(v.live)
		})
	}
	out.sort((a, b) => (KIND_RANK[a.tid] ?? 3) - (KIND_RANK[b.tid] ?? 3))
	return out
}

async function runVideos() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS 密钥，视频只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	// 线上那份优先；本地干跑时 COS 上还没有这个文件，退回上次写的 dist，
	// 否则游标永远停在 0，每轮都在抓同一批发射
	let old = await readCosJson(KEY)
	if (!old) {
		try {
			old = JSON.parse(fs.readFileSync(path.join(OUT_DIR, FILE), 'utf8'))
		} catch (e) {
			old = null
		}
	}
	old = old || { list: [] }

	const byId = new Map()
	let vidsBefore = 0
	for (const x of old.list || []) {
		if (!x || !x.id) continue
		// 只保留有视频的行：游标本身就是「扫到哪了」的状态，
		// 没有视频的发射不需要占 JSON 体积，扫到它们时直接丢弃
		if ((x.vids || []).length) {
			byId.set(String(x.id), x)
			vidsBefore++
		}
	}

	// 全量游标：直接对着 LL2 previous 端点扫，不依赖本地快照的长度。
	// 快照只留最新 100 条，按它当界只会永远在头部打转；
	// 全量 7654 条靠 count 校正，扫完一圈归零重扫（顺带补新发射和漏网的）
	let cursor = Number(old.cursor) || 0
	if (!(cursor >= 0)) cursor = 0

	// 从 cursor 起取 PER_RUN 条，按 PAGE 切成分页请求
	const jobs = []
	for (let i = 0; i < PER_RUN && cursor + i < (old.total || Infinity); i += PAGE) {
		jobs.push({ offset: cursor + i, limit: Math.min(PAGE, PER_RUN - i) })
	}

	console.log(`  视频: 已存 ${vidsBefore} 条有视频 / 游标 ${cursor} / 本轮 ${jobs.length} 个请求`)

	let got = 0
	let withVid = 0
	let failed = 0
	let total = Number(old.total) || 0
	const fresh = []

	for (const j of jobs) {
		try {
			const d = await getJson(
				`/launches/previous/?mode=detailed&limit=${j.limit}&offset=${j.offset}&format=json`,
				{ retries: 0 }
			)
			if (d.count) total = d.count
			for (const r of d.results || []) {
				if (!r || !r.id) continue
				const vids = slimVids(r.vid_urls)
				got++
				if (!vids.length) continue
				const row = {
					id: str(r.id),
					name: str(r.name),
					net: str(r.net),
					at: new Date().toISOString(),
					vids
				}
				byId.set(row.id, row)
				fresh.push(row)
				withVid++
			}
			// detailed 很吃后端，两个请求之间喘一口气
			await new Promise((res) => setTimeout(res, 1200))
		} catch (e) {
			// 单个分页失败不影响整轮；cursor 照常前进，下一圈会补上
			failed++
			console.warn(`  ! offset=${j.offset} 抓取失败: ${e.message}`)
		}
	}

	// 封面是 YouTube 的 i.ytimg.com，不在小程序合法域名白名单里，
	// 直连会全部加载失败，必须落到自家 COS
	const need = fresh.filter((r) => (r.vids || []).some((v) => v.cover))
	if (need.length) await mirrorImages(need, [{ path: 'vids.*.cover', preset: 'thumb' }])

	const next = total ? (cursor + PER_RUN >= total ? 0 : cursor + PER_RUN) : cursor + PER_RUN
	const list = [...byId.values()]
		.sort((a, b) => new Date(b.net || b.at || 0) - new Date(a.net || a.at || 0))
		.slice(0, KEEP)

	const payload = {
		// 须与 DATA_VERSION(=14) 同步：前端缓存/数据版本一致性依赖它
		v: 14,
		dataset: 'video',
		generatedAt: new Date().toISOString(),
		count: list.length,
		served: list.length,
		// 游标：全量 offset。扫到尽头归零，从头再刷新一遍
		cursor: next,
		total,
		list
	}

	const filePath = path.join(OUT_DIR, FILE)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(
		`  → ${FILE}  ${list.length} 条 / ${kb} KB（本轮扫 ${got}、新增有视频 ${withVid}、失败 ${failed}、total=${total}）`
	)

	// 第二层保险（P1-1）：**有视频条目**比存量缩水太多时宁可这轮不更新。
	// 比较对象必须是「有视频条数」而不是总条数——本版起无视频的行不再入库，
	// 总数天然下降，按总数比会误触发拒传
	if (vidsBefore > 20 && list.length < Math.floor(vidsBefore * 0.3)) {
		console.error(`  ! 产出 ${list.length} 条远小于存量 ${vidsBefore} 条，疑似数据丢失，拒传（线上旧数据保留）`)
		return { got, withVid, failed, total: vidsBefore, rejected: true }
	}

	await upload(filePath, KEY, 'public, max-age=1800')

	return { got, withVid, failed, total: list.length }
}

module.exports = { runVideos, slimVids }

if (require.main === module) {
	runVideos()
		.then((r) => {
			console.log('完成:', JSON.stringify(r))
			process.exit(0)
		})
		.catch((e) => {
			console.error('失败:', e)
			process.exit(1)
		})
}
