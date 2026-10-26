'use strict'

/**
 * 发射图片全量补齐 + 全量图库分片
 *
 * 三件事一次请求顺路做完（共用同一批 normal 列表响应，不额外耗配额）：
 *
 * 1. **原图镜像（preset full）**：把每条发射的 image.image_url 镜像到 COS，
 *    宽 2000 / 上限 1.2MB。列表和瀑布流继续用缩略图（几十 KB），
 *    用户点开全屏时前端按 hash 推导原图地址（utils/media.js 的 fullImageOf）：
 *    COS key 的 hash 只依赖原始 URL、后缀只依赖宽度，所以同一张图
 *    thumb = space-img/{hash}.jpg 与 full = space-img/{hash}_2000.jpg
 *    可以纯字符串互推，**不需要任何 schema 变更和 DATA_VERSION 升级**。
 *
 * 2. **全量累积库**（gallery-all.json，**不对外**）：跨轮累积图库的全部记录。
 *    CI 是干净环境，每轮都要先从 COS 读回来、合并本轮新扫到的、再写回去。
 *
 * 3. **对外分片**：
 *      space-data/gallery.json     索引 + 第 0 片（最新 500 张），旧前端照样能读 list
 *      space-data/gallery/1.json   第 1 片 … 依此类推
 *    分片按 net 倒序切，**片号越小越新**。前端先拉索引出第一屏，
 *    滑到底再按需拉下一片，不用一次吞下整个图库。
 *
 * 为什么不像 v3.1.9 那样截断（当时是 KEEP=800 硬砍）：
 *   那是"最近 800 次有图的发射"，不是图库。游标继续往 1957 年扫也没用，
 *   老图扫进来立刻被 slice 挤掉。全量约 7654 条发射，按图去重后约 2500 张，
 *   单文件 700KB 一次性下发不可接受 —— 所以改分片，而不是砍数据。
 *
 * 去重：LL2 严重复用配图（实测 200 条发射只有 73 张不同图，重复率 64%）。
 *   同一张图只留 net 最新那次发射，否则图库横滚三屏都在放同一枚火箭。
 *
 * 游标策略：与 videos.js 同款游标循环 —— previous 按 net 降序稳定排列，
 * 从最新往最老扫（最近发射的原图最先可用），扫完一圈归零重扫，
 * 顺带把新发射、以及之前镜像失败漏掉的图补上。新发射永远在 offset=0
 * 附近，所以"新数据自动进来"是游标归零后的第一轮就生效的。
 *
 * 配额：每轮 4 个请求（1 页最新 + 游标 3 页 × limit50）。与 video 轮合计 6 次，
 * 常规小时仍在 15 次预算内；和 timeline 撞在同一小时会短暂超（见 sync.yml 头部）。
 * 单页失败只跳过该页（continue），整轮不中断，下一圈自然补上。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const STATE_KEY = 'space-data/history/state-images.json'
const INDEX_KEY = 'space-data/gallery.json'
// 内部累积库，不上前端白名单，只给本脚本自己读回来续写
const ALL_KEY = 'space-data/gallery-all.json'
const chunkKey = (i) => 'space-data/gallery/' + i + '.json'

// 每轮扫多少条发射 = 6 个请求（limit 50 × 6）+ 1 个「补最新」请求。
// 原先是 150（4 个请求），但 7659 条全量要扫 51 小时，图库一直是几百张的量级。
// 15 次/小时的匿名配额挤不下更多，所以 sync.yml 里把 timeline 从每 3 小时放到每 6 小时，
// 腾出的额度换到这边 —— 图库是用户能直接看到的东西，优先给它。
// 需要临时猛灌时用 IMAGE_PER_RUN=750 node images.js（本地有密钥时）。
const PER_RUN = Number(process.env.IMAGE_PER_RUN || 300)
const PAGE = 50
// 每个分片多少条。500 × ~280B ≈ 140KB，一次拉一片对小程序来说刚好
const CHUNK = 500

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))

// 必须与 utils/data.js 和 scripts/sync.js 的 DATA_VERSION 一致。
// gallery 单独产出，不走 sync.js 的写文件路径，容易漏改 —— verify-pure 有对拍
const DATA_VERSION = 13

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 12)

/**
 * 图片去重用的 key：剥掉尺寸后缀再比。
 *
 * thumb = space-img/{hash}.jpg、full = space-img/{hash}_2000.jpg 是同一张图，
 * 万一哪天 thumb 预设宽度变了（{hash}_400.jpg），按完整 URL 去重就失效了。
 * 剥掉 `_数字` 后缀才能一直对上。
 */
function thumbKey(url) {
	return str(url).replace(/_\d+(?=\.[a-z0-9]+$)/i, '')
}

const timeOf = (r) => {
	const t = new Date(str(r && r.net)).getTime()
	return isNaN(t) ? 0 : t
}

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

/**
 * 读回累积库。首次上线（v3.1.9 → v3.1.10）时 gallery-all.json 还不存在，
 * 退回旧的 gallery.json 继承那 200 条，不然要从零重扫。
 */
async function readAccum() {
	let all = null
	try {
		all = await readCosJson(ALL_KEY)
	} catch (e) {
		console.warn('  ! 累积库读取失败，本轮按空库处理: ' + e.message)
	}
	if (all && Array.isArray(all.list)) return all

	// 本地干跑（无 COS 密钥）：继承上一轮写到 dist 的图库，不然每跑一次都从零开始
	try {
		const local = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'gallery.json'), 'utf8'))
		if (local && Array.isArray(local.list) && local.list.length) {
			return { v: 1, list: local.list }
		}
	} catch (e) {
		// 第一次跑，dist 里什么都没有
	}

	try {
		const legacy = await readCosJson(INDEX_KEY)
		if (legacy && Array.isArray(legacy.list) && legacy.list.length) {
			console.log(`  · 迁移旧 gallery.json 的 ${legacy.list.length} 条到累积库`)
			return { v: 1, list: legacy.list }
		}
	} catch (e) {
		// 旧文件不存在是正常的
	}
	return { v: 1, list: [] }
}

async function runImages() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS 密钥，只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })
	fs.mkdirSync(path.join(OUT_DIR, 'gallery'), { recursive: true })

	const state = await readState()
	let cursor = Number(state.cursor) || 0
	let total = Number(state.total) || 0
	const prevSig = state.sig && typeof state.sig === 'object' ? state.sig : {}

	const accum = await readAccum()
	const byId = new Map()
	for (const x of accum.list) {
		if (x && x.id) byId.set(str(x.id), x)
	}
	const before = byId.size

	// image 与 imageFull 铺的是**同一个原始 URL**：
	// mirrorImages 按字段路径 + 预设原地改写，两个字段各走各的预设，
	// 镜像完 image 变成 COS 缩略图地址（进 gallery），imageFull 的结果
	// 已经落在 COS 上、不需要进任何 JSON（前端用 fullImageOf 推导）。
	const rawRows = []

	// 本轮的抓取位置：**固定先扫一页最新的（offset=0），再扫游标**。
	//
	// 为什么必须多花这一个请求：新发射永远出现在列表最前端。
	// 游标如果正在 3000 的位置，新发射要等整圈扫完（51 小时）才轮到 ——
	// 用户看到的图库会一直缺最近几天的图。这一页把延迟压到 1 小时内。
	const offsets = []
	const seenOff = new Set()
	const addOff = (o) => {
		if (o >= 0 && !seenOff.has(o)) {
			seenOff.add(o)
			offsets.push(o)
		}
	}
	addOff(0)
	for (let off = cursor; off < cursor + PER_RUN; off += PAGE) addOff(off)

	// 游标页失败时不能无条件推进 cursor。
	// 425/429 撞在 images 上是常态（15 次/小时的匿名配额里要挤 4 个请求），
	// 以前这里只 continue 跳过、游标照旧 +PER_RUN，那 150 条发射就永远不会再被扫到 ——
	// 图库一直长不大的真正原因不是"扫得慢"，是"扫过的地方留了洞"。
	// 现在记下最后一个成功页的结束位置，本轮有失败就停在原地重试，宁可慢也不漏。
	let maxOk = cursor
	let cursorPageFailed = false

	for (const off of offsets) {
		let d
		try {
			d = await getJson(
				`/launches/previous/?mode=normal&limit=${PAGE}&offset=${off}&format=json`,
				{ retries: 1 }
			)
		} catch (e) {
			// 单页失败不影响整轮：已抓到的照常入库，游标只推进到成功的位置
			console.warn(`  ! offset=${off} 抓取失败: ${e.message}`)
			if (off >= cursor) cursorPageFailed = true
			continue
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
		// offset=0 那页是"补最新"的额外请求，不参与游标推进
		if (off >= cursor) maxOk = off + results.length
		if (results.length < PAGE) break
	}

	console.log(
		`  图片: 游标 ${cursor}/${total || '?'} / 本轮有图 ${rawRows.length} 条 / 累积库 ${before} 条`
	)

	if (rawRows.length) {
		await mirrorImages(rawRows, [
			{ path: 'image', preset: 'thumb' },
			{ path: 'imageFull', preset: 'full' }
		])
	}

	// ---- 历史遗留回填 ----
	// mirrorImages 早年有个 bug：同一张原图同时喂给 thumb 和 full 两个预设时，
	// 后一个会把前一个覆盖掉（那时用 URL 当去重 key）。结果只有 full 真跑过，
	// thumb 静默失败，累积库里存下一批指向 LL2 海外域名的原始地址 ——
	// 国内一张 100KB+ 从纽约拉，这就是图库一直"加载好久"的根因。
	//
	// 这些老记录不会被游标重新扫到（一圈 25 小时），所以每轮顺带修一批。
	// 判断依据用 /space-img/：那是镜像产物的固定前缀，比比对域名稳。
	const MIRROR_TAG = '/space-img/'
	const pending = []
	for (const x of byId.values()) {
		if (x && x.thumb && x.thumb.indexOf(MIRROR_TAG) === -1) pending.push(x)
	}
	if (pending.length) {
		// 一次全修完：这批一共百来条，比拖着好几轮更省事；
		// 真要上千条时它也只是每轮多花几十秒
		const batch = pending.slice(0, 400)
		console.log(`  历史回填: 待修 ${pending.length} 条，本轮处理 ${batch.length} 条`)
		await mirrorImages(batch, [{ path: 'thumb', preset: 'thumb' }])
		const fixed = batch.filter((x) => x.thumb && x.thumb.indexOf(MIRROR_TAG) > -1).length
		console.log(`  历史回填: ${fixed}/${batch.length} 张已转 COS（剩 ${pending.length - fixed} 张）`)
	}

	// ---- 合并进累积库 ----
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

	// ---- 按图去重 + 时间倒序 ----
	// 同一张配图可能被几十次发射复用，只留 net 最新那次：
	// 点开大图时看到的任务信息才跟"最近一次用这张图"对得上
	const byThumb = new Map()
	for (const x of byId.values()) {
		if (!x || !x.thumb) continue
		const k = thumbKey(x.thumb)
		const prev = byThumb.get(k)
		if (!prev || timeOf(x) > timeOf(prev)) byThumb.set(k, x)
	}

	const list = [...byThumb.values()].sort((a, b) => timeOf(b) - timeOf(a))
	const chunks = Math.max(1, Math.ceil(list.length / CHUNK))

	console.log(
		`  图库: ${list.length} 张唯一图（原始 ${byId.size} 条记录，去重省掉 ${byId.size - list.length} 条）/ ${chunks} 片`
	)

	// ---- 写分片：内容没变的跳过上传 ----
	// 老图扫完后绝大多数分片不会变，不比对的话每小时白传 700KB。
	//
	// generatedAt 必须跟着**数据变化**走，不能每轮取 now：它一旦每轮都变，
	// 每个分片的 JSON 每轮都不同，比对就永远判定"变了"，等于白比对。
	// 所以先看整个 list 有没有变，没变就沿用上一轮的时间戳。
	const listSig = md5(JSON.stringify(list))
	const dataAt =
		listSig === state.listSig && state.dataAt
			? state.dataAt
			: new Date().toISOString()

	const sig = {}
	const written = []
	for (let i = 0; i < chunks; i++) {
		const slice = list.slice(i * CHUNK, (i + 1) * CHUNK)
		// 片级签名只算内容：片号/总数变了才需要重传
		const s = md5(JSON.stringify(slice))
		sig[i] = s

		const body = {
			v: DATA_VERSION,
			dataset: 'gallery',
			chunk: i,
			count: list.length,
			chunks,
			generatedAt: dataAt,
			list: slice
		}

		// 第 0 片挂索引元信息，别让前端为了 count/chunks 多拉一个文件
		const out =
			i === 0
				? Object.assign({}, body, {
						launchTotal: total,
						chunkSize: CHUNK,
						served: slice.length
					})
				: body

		const text = JSON.stringify(out)
		const file =
			i === 0
				? path.join(OUT_DIR, 'gallery.json')
				: path.join(OUT_DIR, 'gallery', i + '.json')

		fs.writeFileSync(file, text, 'utf8')
		written.push({ i, file, sig: s, bytes: text.length })
	}

	// 累积库落在 dist 里，本地干跑时也能续写。
	// 这里的 v 是**内部文件格式版本**，与前端 DATA_VERSION 语义无关
	// （同 archive.js 的 av：内部格式自己演进，不牵动前端缓存）
	const allFile = path.join(OUT_DIR, 'gallery-all.json')
	const allText = JSON.stringify({
		v: 1,
		count: list.length,
		updatedAt: new Date().toISOString(),
		list
	})
	fs.writeFileSync(allFile, allText, 'utf8')

	// 有游标页失败就停在最后一个成功位置，那段下轮重来；全部成功才整段推进
	const next = cursorPageFailed ? maxOk : cursor + PER_RUN
	if (cursorPageFailed) {
		console.warn(`  ! 游标页有失败，游标只推进到 ${next}（原计划 ${cursor + PER_RUN}），下轮补扫`)
	}
	const payloadCursor = total ? (next >= total ? 0 : next) : next

	fs.writeFileSync(
		path.join(OUT_DIR, 'state-images.json'),
		JSON.stringify({
			v: 1,
			cursor: payloadCursor,
			total,
			sig,
			// 图数基线：下轮判断"产出缩水"要用它，不能用累积库条数
			pics: list.length,
			// list 签名与它的时间戳：两者都没变才说明本轮数据真没动
			listSig,
			dataAt,
			at: new Date().toISOString()
		}),
		'utf8'
	)

	// 产出缩水保险（与 videos.js 同思路）：存量 >20 时骤减按事故处理，拒传。
	// 基线与上轮的**去重后图数**比，不能用累积库条数 ——
	// LL2 配图重复率高，累积 7000 条可能只对应 2500 张图，拿 7000 当基线会永远误判
	const prevPics = Number(state.pics) || 0
	if (prevPics > 20 && list.length < Math.floor(prevPics * 0.6)) {
		console.error(`  ! 图库产出 ${list.length} 远小于上轮 ${prevPics}，疑似丢失，拒传`)
		return { rows: rawRows.length, total: prevPics, rejected: true }
	}

	// ---- 上传 ----
	// 顺序：累积库 → 分片（含索引/第 0 片）→ 游标状态。
	// 数据传了游标没传，下一轮重扫这一批（无害）；
	// 游标传了数据没传，中间一段就永远没人扫了 —— 所以游标必须最后
	if (hasCosConfig()) {
		await upload(allFile, ALL_KEY, 'no-cache', 'application/json')

		let uploaded = 0
		for (const w of written) {
			if (prevSig[w.i] === w.sig) continue
			const key = w.i === 0 ? INDEX_KEY : chunkKey(w.i)
			await upload(w.file, key, 'public, max-age=1800', 'application/json')
			uploaded++
		}
		console.log(`  → 分片上传 ${uploaded}/${written.length}（其余内容未变，跳过）`)

		await upload(
			path.join(OUT_DIR, 'state-images.json'),
			STATE_KEY,
			'no-cache',
			'application/json'
		)
	}

	const kb = (allText.length / 1024).toFixed(1)
	console.log(`  → 图库  ${list.length} 张 / ${chunks} 片 / 累积库 ${kb} KB`)

	return {
		rows: rawRows.length,
		total: list.length,
		chunks,
		cursor: payloadCursor
	}
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
