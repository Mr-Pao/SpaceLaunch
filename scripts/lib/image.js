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
const MAX_WIDTH = 480
const MAX_BYTES = 30 * 1024
const MAX_SOURCE_BYTES = 8 * 1024 * 1024 // 原图上限，防止拿到异常大文件把 CI 拖死
const CONCURRENCY = 4
const TIMEOUT_MS = 20000
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

const stats = { reuse: 0, uploaded: 0, skipped: 0, failed: 0 }

function cdnBase() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return ''
	return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com`
}

function keyOf(url, ext) {
	const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 16)
	return `${PREFIX}/${h}.${ext}`
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
					req.destroy(new Error('原图超过 8MB'))
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
 * 压到 MAX_BYTES 以内。
 * 先按固定宽度/质量压一次，超标就逐档降质量，还超标再缩尺寸。
 */
async function compress(buf) {
	const meta = await sharp(buf).metadata()
	// 带透明通道的多是机构 logo，转 JPEG 会变黑底，必须保留 PNG
	const keepAlpha = Boolean(meta.hasAlpha)

	if (keepAlpha) {
		const png = await sharp(buf)
			.resize({ width: MAX_WIDTH, withoutEnlargement: true })
			.png({ compressionLevel: 9, palette: true, quality: 80, effort: 7 })
			.toBuffer()
		if (png.length <= MAX_BYTES) return { buffer: png, ext: 'png', mime: 'image/png' }
	}

	for (const quality of [72, 64, 56, 48, 40]) {
		const jpg = await sharp(buf)
			.resize({ width: MAX_WIDTH, withoutEnlargement: true })
			.jpeg({ quality, mozjpeg: true })
			.toBuffer()
		if (jpg.length <= MAX_BYTES) return { buffer: jpg, ext: 'jpg', mime: 'image/jpeg' }
	}

	// 兜底：尺寸砍到 320 宽再压
	const fallback = await sharp(buf)
		.resize({ width: 320, withoutEnlargement: true })
		.jpeg({ quality: 55, mozjpeg: true })
		.toBuffer()
	return { buffer: fallback, ext: 'jpg', mime: 'image/jpeg' }
}

/** 单张：下载 → 压缩 → (按需) 上传，返回可访问的 URL；失败返回 null */
async function mirrorOne(url) {
	if (memo.has(url)) return memo.get(url)

	const base = cdnBase()
	if (!base || !hasCosConfig()) return null

	// 已经是自家地址，不要再折腾一遍
	if (url.startsWith(base)) {
		memo.set(url, url)
		return url
	}

	try {
		const raw = await download(url)
		const { buffer, ext, mime } = await compress(raw)
		const key = keyOf(url, ext)

		if (await headObject(key)) {
			stats.reuse++
		} else {
			await putBuffer(buffer, key, mime, 'public, max-age=31536000')
			stats.uploaded++
		}

		const out = `${base}/${key}`
		memo.set(url, out)
		return out
	} catch (e) {
		stats.failed++
		// 失败保留原地址：开发工具里至少还能看到图，只是真机不会显示
		console.warn(`  ! 图片镜像失败 ${url.slice(-40)}: ${e.message}`)
		memo.set(url, null)
		return null
	}
}

/** 支持 'pad.map_image' 这种点路径 */
function getPath(obj, path) {
	return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function setPath(obj, path, value) {
	const keys = path.split('.')
	const last = keys.pop()
	const target = keys.reduce((o, k) => (o == null ? undefined : o[k]), obj)
	if (target && typeof target === 'object') target[last] = value
}

/**
 * 把一批条目里的图片字段改写为 COS 地址
 *
 * @param {object[]} list
 * @param {string[]} fields 字段路径，如 ['image', 'pad.map_image']
 */
async function mirrorImages(list, fields) {
	if (!Array.isArray(list) || !list.length || !fields || !fields.length) return

	if (!hasCosConfig()) {
		console.log('  · 未配置 COS，跳过图片镜像（保留原始地址）')
		return
	}

	// 先把所有待处理的 URL 收齐去重，避免同一张图被并发处理多次
	const urls = new Set()
	for (const item of list) {
		for (const f of fields) {
			const v = getPath(item, f)
			if (typeof v === 'string' && /^https?:\/\//.test(v)) urls.add(v)
		}
	}

	const all = [...urls]
	if (!all.length) return

	console.log(`  图片: ${all.length} 个地址待处理`)

	let idx = 0
	const worker = async () => {
		while (idx < all.length) {
			await mirrorOne(all[idx++])
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker))

	// 回填
	let replaced = 0
	for (const item of list) {
		for (const f of fields) {
			const v = getPath(item, f)
			if (typeof v !== 'string' || !v) continue
			const mapped = memo.get(v)
			if (mapped && mapped !== v) {
				setPath(item, f, mapped)
				replaced++
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

module.exports = { mirrorImages, mirrorOne, summary, MAX_BYTES }
