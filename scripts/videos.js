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
 *
 * ---------------------------------------------------------------------------
 * 视频本体存 COS（3.2.25 新增）
 * ---------------------------------------------------------------------------
 * 以前只把 YouTube 封面镜像到 COS、点开复制链接 —— 小程序里放不了 YouTube，
 * web-view 又得配业务域名，等于没做。现在改成：**能存的视频就存到 COS，
 * 小程序内直接 <video> 播放**。
 *
 * - 直链媒体（.mp4/.webm/.mov...）：直接下载到 COS（key = space-video/{md5}.ext），
 *   记录 cosUrl + playable:true。
 * - YouTube：在 `YT_DL=1` 且本机有 yt-dlp 时尽力下载（需 ffmpeg 才能合并 DASH）；
 *   没有就留 url + 封面、playable:false。
 * - 其它/失败：playable:false，前端退回「复制链接」。
 *
 * 下载只对本轮**新抓到**的 vid 触发（每轮 10 条发射的 vid），按 URL 建 vidCache
 * 跨轮保留已下载结果 —— 既不会每轮重复拉同一段视频，也不会首轮风暴式连下上千条。
 * 游标转一圈（~120 轮）自然把所有发射的 webcast 都尝试一遍。
 * 下载失败不写 cosUrl，下个周期还会再试，不会永久判死。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const http = require('http')
const https = require('https')
const os = require('os')
const { execFileSync } = require('child_process')
const { getJson } = require('./lib/fetch')
const { upload, hasCosConfig, readCosJson, putBuffer, headObject } = require('./lib/cos')
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

// ---- 视频本体下载（3.2.25）----
// COS 上的对象键前缀（落在 space-data/ 下，与 CDN_BASE 同级）
const VIDEO_PREFIX = 'space-video'
// 单段视频大小上限：火箭直播回放常 50-150MB，给 200MB 余量；再大就放弃（存储/流量不值）
const VIDEO_MAX_BYTES = Number(process.env.VIDEO_MAX_BYTES || 200 * 1024 * 1024)
// 每轮最多实际发起几次下载（直链 + YouTube 合计），给 LL2 抓取和脚本其余部分留时间
const DL_MAX_PER_RUN = Number(process.env.DL_MAX_PER_RUN || 6)
// 是否尝试下载 YouTube：默认关，开了且本机有 yt-dlp 才真正跑（CI 侧可装）
const YT_DL = process.env.YT_DL === '1' || process.env.YT_DL === 'true'

const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const cut = (s, n) => {
	const t = str(s).replace(/\s+/g, ' ').trim()
	return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function cdnBase() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return ''
	return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`
}

/** 视频本体对象键：space-video/{md5_16}.{ext} */
function vidKey(hash, ext) {
	return `${VIDEO_PREFIX}/${hash}.${ext}`
}

/**
 * 由 URL 判断视频来源：direct = 直链媒体文件，youtube = YouTube，other = 未知
 * 不知来源的不强行下载（可能是 Vimeo / 官网内嵌播放器，下载下来也播不了）
 */
function classifyVideo(url) {
	if (!url) return 'other'
	if (/youtube\.com|youtu\.be|ytimg/i.test(url)) return 'youtube'
	if (/\.(mp4|webm|mov|m4v|ogg|ogv|mkv)(\?|$)/i.test(url)) return 'direct'
	return 'other'
}

/** 把一段 http(s) 响应体整段读进 Buffer，带重定向跟随与大小上限（视频用，比图片宽松得多） */
function fetchBuffer(url, maxBytes, timeoutMs) {
	return new Promise((resolve, reject) => {
		const mod = /^http:\/\//i.test(url) ? http : https
		const req = mod.get(
			url,
			{ timeout: timeoutMs, headers: { 'User-Agent': UA, Accept: '*/*' } },
			(res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					res.resume()
					let next = res.headers.location
					try {
						next = new URL(next, url).toString()
					} catch (e) {
						// 解析失败就按原样试
					}
					return resolve(fetchBuffer(next, maxBytes, timeoutMs))
				}
				if (res.statusCode !== 200) {
					res.resume()
					return reject(new Error('HTTP ' + res.statusCode))
				}
				const ct = res.headers['content-type'] || ''
				const chunks = []
				let size = 0
				res.on('data', (c) => {
					size += c.length
					if (size > maxBytes) {
						req.destroy(new Error('视频超过 ' + Math.round(maxBytes / 1048576) + 'MB'))
						return
					}
					chunks.push(c)
				})
				res.on('end', () => resolve({ buf: Buffer.concat(chunks), contentType: ct }))
			}
		)
		req.on('timeout', () => req.destroy(new Error('下载超时')))
		req.on('error', reject)
	})
}

/** 直链媒体：下载到 COS，返回可播放的 COS 地址；失败/跳过返回 null */
async function tryDirect(url) {
	const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 16)
	const extFromUrl = (url.match(/\.(mp4|webm|mov|m4v|ogg|ogv|mkv)(\?|$)/i) || [])[1] || 'mp4'
	const key = vidKey(h, extFromUrl.toLowerCase())
	if (await headObject(key)) return `${cdnBase()}/${key}`
	try {
		const { buf, contentType } = await fetchBuffer(url, VIDEO_MAX_BYTES, 90000)
		if (!buf || !buf.length) return null
		// 内容类型若与 URL 后缀冲突（少数站点用 .mp4 却给 video/webm），以 URL 后缀为准，避免 key 对不上
		const realKey = /webm/i.test(contentType) && extFromUrl.toLowerCase() !== 'webm' ? vidKey(h, 'webm') : key
		await putBuffer(buf, realKey, contentType || 'video/mp4', 'public, max-age=31536000')
		return `${cdnBase()}/${realKey}`
	} catch (e) {
		console.warn(`  ! 直链视频下载失败 ${url.slice(-36)}: ${e.message}`)
		return null
	}
}

/** 本机是否已装 yt-dlp（没装就别浪费时间尝试）*/
function ytDlpAvailable() {
	try {
		execFileSync('yt-dlp', ['--version'], { stdio: 'ignore', timeout: 8000 })
		return true
	} catch (e) {
		return false
	}
}

/** YouTube：借 yt-dlp 下载到本地临时文件再传 COS；需 ffmpeg 才能合并 DASH，没有则很多视频下不下来 */
async function tryYoutube(url) {
	const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 16)
	const key = vidKey(h, 'mp4')
	if (await headObject(key)) return `${cdnBase()}/${key}`
	const tmp = path.join(os.tmpdir(), `sl-vid-${h}.mp4`)
	try {
		execFileSync(
			'yt-dlp',
			[
				'-f',
				'best[ext=mp4]/best',
				'--no-playlist',
				'--max-filesize',
				String(VIDEO_MAX_BYTES),
				'-o',
				tmp,
				url
			],
			{ stdio: 'ignore', timeout: 120000 }
		)
		let stat
		try {
			stat = fs.statSync(tmp)
		} catch (e) {
			return null
		}
		if (!stat.size) return null
		const buf = fs.readFileSync(tmp)
		await putBuffer(buf, key, 'video/mp4', 'public, max-age=31536000')
		return `${cdnBase()}/${key}`
	} catch (e) {
		// 超时 / 需要登录 / 地区限制 / 没 ffmpeg 合并失败 —— 都按「这次下不下来」处理
		return null
	} finally {
		try {
			fs.unlinkSync(tmp)
		} catch (e) {
			// 临时文件清不掉也无妨
		}
	}
}

/**
 * 给一条 vid 补 cosUrl / playable / sourceType。
 * 已下载过的（vidCache 命中）直接复用，不再重复下载。
 * budget.n 是本轮剩余下载额度，每真正发起一次下载就 -1。
 */
async function enrichVid(vid, cache, budget) {
	const url = vid.url
	if (!url) {
		vid.playable = false
		vid.sourceType = 'other'
		return vid
	}
	// 以前已经存过 → 直接复用，省一次下载
	if (cache.has(url)) {
		const c = cache.get(url)
		vid.cosUrl = c.cosUrl || ''
		vid.playable = Boolean(c.cosUrl)
		vid.sourceType = c.sourceType || classifyVideo(url)
		return vid
	}

	const type = classifyVideo(url)
	vid.sourceType = type

	let cosUrl = ''
	if (hasCosConfig() && budget.n > 0) {
		if (type === 'direct') {
			budget.n--
			cosUrl = (await tryDirect(url)) || ''
		} else if (type === 'youtube' && YT_DL && ytDlpAvailable()) {
			budget.n--
			cosUrl = (await tryYoutube(url)) || ''
		}
	}

	vid.cosUrl = cosUrl
	vid.playable = Boolean(cosUrl)
	// 成功才进缓存（失败下次周期再试）；下载额度用尽时也不缓存失败，留给下轮
	if (cosUrl) cache.set(url, { cosUrl, sourceType: type })
	return vid
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
			// cosUrl / playable / sourceType 由 runVideos 的 enrichVid 补，这里不写
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
	// vidCache：url → { cosUrl, sourceType }，跨轮保留已下载结果
	const vidCache = new Map()
	for (const x of old.list || []) {
		if (!x || !x.id) continue
		// 只保留有视频的行：游标本身就是「扫到哪了」的状态，
		// 没有视频的发射不需要占 JSON 体积，扫到它们时直接丢弃
		if ((x.vids || []).length) {
			byId.set(String(x.id), x)
			vidsBefore++
			for (const v of x.vids) {
				if (v && v.url && v.cosUrl) vidCache.set(v.url, { cosUrl: v.cosUrl, sourceType: v.sourceType })
			}
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
	// 下载预算：本轮最多真正发起几次视频本体下载
	const budget = { n: DL_MAX_PER_RUN }
	let dlOk = 0
	let dlSkip = 0

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
				// 给每条 vid 补 cosUrl / playable（在读图封面之前，省一次网络）
				for (const v of vids) {
					await enrichVid(v, vidCache, budget)
					if (v.cosUrl) dlOk++
					else dlSkip++
				}
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
		`  → ${FILE}  ${list.length} 条 / ${kb} KB` +
			`（本轮扫 ${got}、新增有视频 ${withVid}、失败 ${failed}、total=${total}` +
			`、视频本体 已存 ${dlOk} / 未存(链接兜底) ${dlSkip}）`
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
