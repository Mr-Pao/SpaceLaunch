'use strict'

/**
 * NASA Image Library 主题精选（3.2.26）
 *
 * 用户选「按主题精选」而非全量爬：NASA Image Library 有 15 万+ 张图，
 * 全量没有任何意义，按固定主题抓一批最能镇住场面的（阿波罗 / 哈勃 / 韦伯 /
 * 火星 / 星云 / 地球）。图和「发射」是两个完全不同的语境，所以不混进发射
 * 图库漂流墙，单开一个 NASA 影像页，从图库 dock 进去。
 *
 * API：https://images-api.nasa.gov/search?q=...&media_type=image
 * 返回 collection.items[]，每项：
 *   - data[0]：nasa_id / title / description(可能带 HTML) / date_created / center / keywords
 *   - links[]：rel=preview 是缩略图、rel=canonical 是原图，
 *     真实地址都在 images-assets.nasa.gov/image/{nasa_id}/{nasa_id}~{size}.jpg
 *
 * 图片必须镜像到 COS（images-assets.nasa.gov 未备中国 ICP 案，小程序端
 * downloadFile 白名单加不进去，真机直连必黑）。复用 image.js 的 mirrorImages：
 * 缩略图走 thumb 预设（480px），点开大图走 large 预设（1080px）。
 * 不存 orig（多 MB、几千像素，压缩后还是 1080 封顶，没必要扛原图）。
 */

const fs = require('fs')
const path = require('path')
const { hasCosConfig, readCosJson, upload } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')
const { loadCache, translateTexts, getZh, saveCache } = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const FILE = 'nasa-images.json'
const KEY = 'space-data/nasa-images.json'

// 固定主题：精选而非全量。q 用 NASA 站内检索词，挑最能出好图的表述
// 目前只保留「星云」；其余主题（阿波罗 / 哈勃 / 韦伯 / 火星 / 地球）按需加回即可
const THEMES = [
	{ key: 'nebula', name: '星云', q: 'nebula' }
]

// 每个主题最多取多少张。默认 400：星云检索总命中约 316，够取满；
// API 每页 100，需要翻页
const PER_THEME = Number(process.env.NASA_IMG_PER_THEME || 400)
// 翻页上限，防止某主题命中数异常大时把 CI 拖死
const MAX_PAGES = Number(process.env.NASA_IMG_MAX_PAGES || 10)

const API = 'https://images-api.nasa.gov/search'
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

/** 抓一个 JSON，带超时与一次重试（NASA 这台偶尔抽风）*/
async function fetchJson(url, retries = 1) {
	for (let i = 0; i <= retries; i++) {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })
			if (!res.ok) throw new Error('HTTP ' + res.status)
			return await res.json()
		} catch (e) {
			if (i === retries) throw e
			console.warn(`  ! ${url} 第 ${i + 1} 次失败: ${e.message}，重试`)
			await new Promise((r) => setTimeout(r, 2000))
		}
	}
}

/** 从 links 里挑缩略图（preview）和原图（canonical，退而取最大 alternate）*/
function pickLinks(links) {
	if (!Array.isArray(links)) return { thumb: '', full: '' }
	const preview = links.find((l) => l.rel === 'preview') || links.find((l) => /thumb/i.test(l.href || ''))
	const canon = links.find((l) => l.rel === 'canonical')
	let full = canon ? canon.href : ''
	if (!full) {
		// 没有 canonical 就取 alternate 里宽度最大的
		const alts = links
			.filter((l) => l.rel === 'alternate')
			.sort((a, b) => (b.width || 0) - (a.width || 0))
		full = alts.length ? alts[0].href : ''
	}
	return { thumb: preview ? preview.href : full, full }
}

/** 去掉 description 里的 HTML 标签并收敛空白 */
function clean(s, n) {
	if (!s) return ''
	const t = String(s)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	return t.length > n ? t.slice(0, n - 1) + '…' : t
}

async function runNasaImages() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS 密钥，NASA 影像只写本地 dist，不上传')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	const collected = []
	const seen = new Set()

	for (const theme of THEMES) {
		console.log(`  · 主题「${theme.name}」抓取（上限 ${PER_THEME} 张）`)
		let taken = 0
		let page = 1

		// API 每页 100 条，翻页直到取满上限或没有更多
		while (taken < PER_THEME && page <= MAX_PAGES) {
			const url = `${API}?q=${encodeURIComponent(theme.q)}&media_type=image&page=${page}`
			let items = []
			try {
				const json = await fetchJson(url)
				items = (json && json.collection && json.collection.items) || []
			} catch (e) {
				console.warn(`  ! 主题「${theme.name}」第 ${page} 页抓取失败: ${e.message}`)
				break
			}
			if (!items.length) break

			for (const it of items) {
				if (taken >= PER_THEME) break
				const d = (it.data && it.data[0]) || {}
				const nasaId = d.nasa_id
				if (!nasaId || seen.has(nasaId)) continue
				const { thumb, full } = pickLinks(it.links)
				if (!full) continue
				seen.add(nasaId)
				collected.push({
					id: nasaId,
					theme: theme.key,
					themeName: theme.name,
					title: clean(d.title, 80) || theme.name,
					desc: clean(d.description, 160),
					date: (d.date_created || '').slice(0, 10),
					center: d.center || '',
					// 这两个字段先放 NASA 原地址，下面统一镜像到 COS 再原地替换
					thumb: thumb || full,
					full,
					nasaId
				})
				taken++
			}

			// 不满一页说明已经到底
			if (items.length < 100) break
			page++
		}
		console.log(`    → 取 ${taken} 张（翻到第 ${page} 页）`)
	}

	console.log(`  共 ${collected.length} 张，开始翻译标题与简介`)
	// 标题与简介中文化：NASA 原文是英文，详情页要中文；翻不出来前端自动回退英文。
	// 复用 sync.js 的哈希缓存，按月跑一次、只翻新增内容
	if (collected.length) {
		try {
			await loadCache()
			const texts = []
			for (const x of collected) {
				if (x.title) texts.push(x.title)
				if (x.desc) texts.push(x.desc)
			}
			await translateTexts(texts)
			for (const x of collected) {
				x.titleZh = getZh(x.title)
				x.descZh = getZh(x.desc)
			}
			const cachePath = saveCache()
			// 缓存必须回写 COS：CI 每次全新容器，不上传等于每轮重翻
			if (hasCosConfig() && cachePath) {
				await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
			}
		} catch (e) {
			console.warn(`  ! 翻译失败，保留英文: ${e.message}`)
		}
	}

	console.log(`  开始镜像到 COS（thumb 480px + full 1080px）`)
	if (hasCosConfig() && collected.length) {
		await mirrorImages(collected, [
			{ path: 'thumb', preset: 'thumb' },
			{ path: 'full', preset: 'large' }
		])
	}

	// 按主题统计数量（用于前端 tab 角标）
	const themeStats = THEMES.map((t) => ({
		key: t.key,
		name: t.name,
		count: collected.filter((x) => x.theme === t.key).length
	})).filter((t) => t.count > 0)

	const payload = {
		// 须与 DATA_VERSION(=14) 同步
		v: 14,
		dataset: 'nasaImages',
		generatedAt: new Date().toISOString(),
		count: collected.length,
		// 主题顺序固定，前端按 key 切分显示
		themes: themeStats,
		list: collected
	}

	const filePath = path.join(OUT_DIR, FILE)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(`  → ${FILE}  ${collected.length} 张 / ${kb} KB（主题：${themeStats.map((t) => t.name + t.count).join('、')}）`)

	await upload(filePath, KEY, 'public, max-age=86400')
	return { count: collected.length }
}

module.exports = { runNasaImages }

if (require.main === module) {
	runNasaImages()
		.then((r) => {
			console.log('完成:', JSON.stringify(r))
			process.exit(0)
		})
		.catch((e) => {
			console.error('失败:', e)
			process.exit(1)
		})
}
