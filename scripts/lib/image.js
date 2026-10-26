'use strict'

/**
 * 图片镜像 + 压缩
 *
 * 为什么必须自己托管，而不是直接引用 LL2 的图：
 *
 * 1. **白名单**：LL2 的图挂在 thespacedevs-prod.nyc3.digitaloceanspaces.com，
 *    这个域名没有中国大陆 ICP 备案，微信小程序根本不让加进 downloadFile 白名单，
 *    真机上所有图片都是空白。这是死路，不是配置问题。
 *
 * 2. **流量**：原图动辄 200KB+，50 张就是 10MB/人。COS 外网下行 0.5 元/GB，
 *    100 个日活一个月就是 15 元，直接击穿 5 元预算。
 *
 * 做法：下载 → 压到宽 480 / 30KB 以内 → 传 COS → 把 JSON 里的 URL 换成 COS 地址。
 * 文件名取原始 URL 的 hash，内容不变就永远同一个地址，所以可以按 COS 上是否已存在来跳过。
 *
 * 实测压缩效果（宽 480 / JPEG q72）：
 *   244KB → 15.2KB    136KB → 11.1KB    PNG logo 47KB → 6.8KB（palette 保留透明）
 */

const crypto = require('crypto')
const https = require('https')
const sharp = require('sharp')
const { hasCosConfig, headObject, putBuffer } = require('./cos')

const PREFIX = 'space-img'

/**
 * 两套压缩预设：
 *   thumb —— 列表缩略图和机构 logo，宽 480 / 30KB 以内
 *   large —— 任务信息图。那是竖版长图，480 宽会把里面的字压成马赛克，
 *            给到 1080 宽、300KB。这类图极少（实测 50 条里 1 条），不会撑爆流量
 */
const PRESETS = {
	thumb: { maxWidth: 480, maxBytes: 30 * 1024, qualities: [72, 64, 56, 48, 40], fallbackWidth: 320, fallbackQuality: 55 },
	large: { maxWidth: 1080, maxBytes: 300 * 1024, qualities: [85, 78, 70, 60, 50], fallbackWidth: 720, fallbackQuality: 60 },
	// 工位地图：要用来看清跑道、塔架和周边地形，480px 糊成一片；
	// 但也不值得按 1080px 传 —— 750px 正好是 375pt 屏的 2 倍图
	map: { maxWidth: 750, maxBytes: 120 * 1024, qualities: [78, 70, 62, 54], fallbackWidth: 600, fallbackQuality: 55 },
	// 原图（full）：给「点击看大图」用。2000px 覆盖 LL2 绝大多数横图原始宽度
	// （withoutEnlargement 不会放大小图），q85 起步、上限 1.2MB。
	// 全量约 8000 条发射 × 60% 有图 × 去重后约 3-4 千张 × 500KB ≈ 2GB 存储，
	// 按 0.1 元/GB/月完全无感；点击率低，下行流量也出不了几块钱
	full: { maxWidth: 2000, maxBytes: 1.2 * 1024 * 1024, qualities: [85, 80, 75, 70, 62], fallbackWidth: 1280, fallbackQuality: 80 }
}

const MAX_WIDTH = PRESETS.thumb.maxWidth
const MAX_BYTES = PRESETS.thumb.maxBytes
// 原图上限。LL2 里有单张 10.5MB 的图（long_march_4b_l），设 8MB 会直接把它砍掉，
// 表现为列表里固定有一张图镜像失败。15MB 能覆盖目前见过的最大图。
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const CONCURRENCY = 4
// 大图在慢网络下要下很久，20 秒不够；CI 海外节点通常几秒就完
const TIMEOUT_MS = 45000
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const stats = { reuse: 0, uploaded: 0, skipped: 0, failed: 0 }

function cdnBase() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return ''
	return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`
}

/**
 * thumb 沿用一个哈希就够；large 加尺寸后缀，避免同一张图在两种预设下撞到同一个 key。
 * 注意：thumb 的 key 规则不能动，线上已经传好的图靠它命中去重复用。
 */
function keyOf(url, ext, maxWidth) {
	const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 16)
	const suffix = maxWidth === PRESETS.thumb.maxWidth ? '' : '_' + maxWidth
	return `${PREFIX}/${h}${suffix}.${ext}`
}

/**
 * 探测某 URL 在某预设下是否已经镜像过（COS 上按 hash 命中）。
 *
 * key 的 hash 只依赖原始 URL、后缀只依赖宽度，而 ext 取决于压缩结果
 * （透明图 png、其余 jpg），所以探测时 jpg / png 各试一次。
 * 命中就完全跳过「下载 2MB 原图 + 压缩」——全量补齐扫历史发射时，
 * 绝大多数图早就传过（LL2 大量复用同一张图），没有这一步每轮都在白下载。
 */
async function probeExisting(url, preset) {
	const base = cdnBase()
	if (!base || !hasCosConfig()) return null
	const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 16)
	const suffix = preset.maxWidth === PRESETS.thumb.maxWidth ? '' : '_' + preset.maxWidth
	for (const ext of ['jpg', 'png']) {
		const key = `${PREFIX}/${h}${suffix}.${ext}`
		try {
			if (await headObject(key)) return `${base}/${key}`
		} catch (e) {
			// 探测失败按没有处理，走正常镜像流程
		}
	}
	return null
}

// 同一进程内同一个 URL 只处理一次（列表里经常多张图指向同一个地址）
const memo = new Map()

function download(url, depth = 0) {
	return new Promise((resolve, reject) => {
		if (depth > 3) return reject(new Error('重定向次数过多'))

		const req = https.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': UA } }, (res) => {
			// LL2 的图偶尔会 302 到别的节点
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				res.resume()
				return resolve(download(res.headers.location, depth + 1))
			}
			if (res.statusCode !== 200) {
				res.resume()
				return reject(new Error('HTTP ' + res.statusCode))
			}

			const chunks = []
			let size = 0
			res.on('data', (c) => {
				size += c.length
				if (size > MAX_SOURCE_BYTES) {
					req.destroy(new Error('原图超过 15MB'))
					return
				}
				chunks.push(c)
			})
			res.on('end', () => resolve(Buffer.concat(chunks)))
		})

		req.on('timeout', () => req.destroy(new Error('下载超时')))
		req.on('error', reject)
	})
}

/**
 * 压到 preset.maxBytes 以内。
 * 先按固定宽度/质量压一次，超标就逐档降质量，还超标再缩尺寸。
 */
async function compress(buf, preset = PRESETS.thumb) {
	const { maxWidth, maxBytes, qualities, fallbackWidth, fallbackQuality } = preset
	const meta = await sharp(buf).metadata()
	// 带透明通道的多是机构 logo，转 JPEG 会变黑底，必须保留 PNG
	const keepAlpha = Boolean(meta.hasAlpha)

	if (keepAlpha) {
		const png = await sharp(buf)
			.resize({ width: maxWidth, withoutEnlargement: true })
			.png({ compressionLevel: 9, palette: true, quality: 80, effort: 7 })
			.toBuffer()
		if (png.length <= maxBytes) return { buffer: png, ext: 'png', mime: 'image/png' }
	}

	for (const quality of qualities) {
		const jpg = await sharp(buf)
			.resize({ width: maxWidth, withoutEnlargement: true })
			.jpeg({ quality, mozjpeg: true })
			.toBuffer()
		if (jpg.length <= maxBytes) return { buffer: jpg, ext: 'jpg', mime: 'image/jpeg' }
	}

	// 兜底：尺寸再砍一档
	const fallback = await sharp(buf)
		.resize({ width: fallbackWidth, withoutEnlargement: true })
		.jpeg({ quality: fallbackQuality, mozjpeg: true })
		.toBuffer()
	return { buffer: fallback, ext: 'jpg', mime: 'image/jpeg' }
}

/** 单张：下载 → 压缩 → (按需) 上传，返回可访问的 URL；失败返回 null */
async function mirrorOne(url, preset = PRESETS.thumb) {
	// 同一 URL 在两种预设下结果不同，memo 的 key 必须带上宽度
	const memoKey = url + '|' + preset.maxWidth
	if (memo.has(memoKey)) return memo.get(memoKey)

	const base = cdnBase()
	if (!base || !hasCosConfig()) return null

	// 已经是自家地址，不要再折腾一遍
	if (url.startsWith(base)) {
		memo.set(memoKey, url)
		return url
	}

	// COS 上已经有这张图（同 hash 同宽度的历史产物）就直接复用，
	// 省掉整趟「下载 + 压缩」——全量补齐模式靠它把每轮耗时压在分钟级
	const probed = await probeExisting(url, preset)
	if (probed) {
		stats.reuse++
		memo.set(memoKey, probed)
		return probed
	}

	try {
		const raw = await download(url)
		const { buffer, ext, mime } = await compress(raw, preset)
		const key = keyOf(url, ext, preset.maxWidth)

		if (await headObject(key)) {
			stats.reuse++
		} else {
			await putBuffer(buffer, key, mime, 'public, max-age=31536000')
			stats.uploaded++
		}

		const out = `${base}/${key}`
		memo.set(memoKey, out)
		return out
	} catch (e) {
		stats.failed++
		// 失败保留原地址：开发工具里至少还能看到图，只是真机不会显示
		console.warn(`  ! 图片镜像失败 ${url.slice(-40)}: ${e.message}`)
		memo.set(memoKey, null)
		return null
	}
}

/**
 * 按路径取出所有可写槽位，路径里的 `*` 代表数组的每个元素。
 *
 * 原来只支持 'pad.map_image' 这种点路径，拿不到「数组里的每一项」——
 * 而视频的封面正好长在 `vids[].cover` 上。普通路径（如 `craft.image`）
 * 在这里退化成单个槽位，行为和之前的 getPath/setPath 完全一致。
 */
function slotsOf(obj, path) {
	const segs = path.split('.')
	const out = []
	const walk = (node, i) => {
		if (node == null || i >= segs.length) return
		if (segs[i] === '*') {
			if (Array.isArray(node)) for (const el of node) walk(el, i + 1)
			return
		}
		if (typeof node !== 'object' || Array.isArray(node)) return
		if (i === segs.length - 1) {
			out.push({ obj: node, key: segs[i] })
			return
		}
		walk(node[segs[i]], i + 1)
	}
	walk(obj, 0)
	return out
}

/**
 * 把一批条目里的图片字段改写为 COS 地址
 *
 * @param {object[]} list
 * @param {(string|{path:string, preset?:string})[]} fields
 *   字段路径，如 ['image', 'pad.map_image']；
 *   需要大图就传 { path: 'infographic', preset: 'large' }
 */
async function mirrorImages(list, fields) {
	if (!Array.isArray(list) || !list.length || !fields || !fields.length) return

	if (!hasCosConfig()) {
		console.log('  · 未配置 COS，跳过图片镜像（保留原始地址）')
		return
	}

	// 统一成 { path, preset } 形式
	const specs = fields.map((f) => {
		if (typeof f === 'string') return { path: f, preset: PRESETS.thumb }
		return { path: f.path, preset: PRESETS[f.preset] || PRESETS.thumb }
	})

	// 先把所有待处理的 URL 收齐去重，避免同一张图被并发处理多次。
	//
	// key 必须带预设宽度，不能只用 URL：同一张原图可能同时喂给两个预设
	// （images.js 的 image 与 imageFull 铺的是同一个原始地址，只是产出宽度不同）。
	// 早先用 URL 当 key，后一个预设会把前一个覆盖掉 —— 结果只有 full 真跑过，
	// thumb 那一路在 memo 里查不到结果，回填时静默跳过，gallery 里的图
	// 全部留在 LL2 的海外原始域名上（国内一张 100KB+ 从纽约拉，图库因此一直很慢）。
	const urls = new Map()
	for (const item of list) {
		for (const s of specs) {
			for (const sl of slotsOf(item, s.path)) {
				const v = sl.obj[sl.key]
				if (typeof v === 'string' && /^https?:\/\//.test(v)) {
					urls.set(v + '|' + s.preset.maxWidth, { url: v, preset: s.preset })
				}
			}
		}
	}

	const all = [...urls.values()]
	if (!all.length) return

	console.log(`  图片: ${all.length} 个地址待处理`)

	let idx = 0
	const worker = async () => {
		while (idx < all.length) {
			const { url, preset } = all[idx++]
			await mirrorOne(url, preset)
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker))

	// 回填
	let replaced = 0
	for (const item of list) {
		for (const s of specs) {
			for (const sl of slotsOf(item, s.path)) {
				const v = sl.obj[sl.key]
				if (typeof v !== 'string' || !v) continue
				const mapped = memo.get(v + '|' + s.preset.maxWidth)
				if (mapped && mapped !== v) {
					sl.obj[sl.key] = mapped
					replaced++
				}
			}
		}
	}

	console.log(
		`  图片: 替换 ${replaced} 处 / 命中已有 ${stats.reuse} / 新传 ${stats.uploaded} / 失败 ${stats.failed}`
	)
}

function summary() {
	return { ...stats }
}

module.exports = { mirrorImages, slotsOf }
