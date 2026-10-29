'use strict'

/**
 * NASA 每日天文（APOD）+ 每日地球（EPIC）抓取
 *
 * 两个都是「每天一张（或一组）」的外部 NASA 数据源，和 LL2 无关，
 * 所以单独一条 workflow（nasa-daily.yml），不挤占 sync.yml 的 LL2 配额。
 *
 * APOD：
 *   用 date 参数遍历最近 N 天（默认 7），每天一张当天的天文图。
 *   不用 count 模式（它返回的是随机历史日期，不是「近期」）。
 *   只保留 media_type=image 的（APOD 偶尔是视频，小程序播不了）。
 *   使用 NASA APOD Basic JSON，不需要 API key；图片 url 镜像到 COS。
 *
 * EPIC：
 *   DSCOVR 卫星拍的地球，每天一组（约 13 张不同角度）。取最新一天的前几张，
 *   图片按 date 拼 archive URL：.../archive/natural/YYYY/MM/DD/png/{image}.png，
 *   同样镜像 COS。
 *
 * 产物（space-data/）：
 *   apod.json  { list:[{date,title,explanation,thumb,full,credit}] }
 *   epic.json  { list:[{date,caption,thumb,full}] }
 * 前端首页「每日一览」把这两份和现有「每日一图」混排成轮播。
 *
 * 注意：APOD Basic JSON 是 NASA Science 的公开 WordPress 接口，无需 API key。
 */

const fs = require('fs')
const path = require('path')
const { upload, hasCosConfig, readCosJson } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')
const { loadCache, translateTexts, getZh, saveCache } = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
// 首轮抓最近 100 天，之后每天补 1 条累积；更早的历史不要
const APOD_DAYS = Number(process.env.APOD_DAYS || 100)
// 累积上限只作防膨胀保护（防 JSON 无限增长），1000 条约 2.7 年，
// 正常使用不会触发；真要更长历史把它调大即可
const APOD_MAX = Number(process.env.APOD_MAX || 1000)
// EPIC 一天一组约 13 张（DSCOVR 一次完整自转扫描），全取
const EPIC_KEEP = Number(process.env.EPIC_KEEP || 13)

const APOD_FILE = 'apod.json'
const EPIC_FILE = 'epic.json'
const APOD_KEY_COS = 'space-data/apod.json'
const EPIC_KEY_COS = 'space-data/epic.json'

// 必须与 utils/data.js 的 DATA_VERSION 一致（新数据集沿用 14）
const DATA_VERSION = 14

function ymd(ms) {
	return new Date(ms).toISOString().slice(0, 10)
}

function apodCode(date) {
	return date.slice(2).replace(/-/g, '')
}

function stripHtml(value) {
	return String(value || '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.trim()
}

async function fetchJson(url, retries = 2) {
	let lastErr
	for (let i = 0; i <= retries; i++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
			if (!res.ok) throw new Error('HTTP ' + res.status)
			return await res.json()
		} catch (e) {
			lastErr = e
			console.warn(`  ! 第 ${i + 1} 次失败: ${e.message}`)
			if (i < retries) {
				const wait = 30000 * Math.pow(2, i)
				console.warn(`  · 退避 ${wait}ms 后重试`)
				await new Promise((r) => setTimeout(r, wait))
			}
		}
	}
	throw lastErr
}

async function runApod(haveDates) {
	const items = []
	// 按图片 URL 去重：NASA 接口偶发降级时会对所有日期返回同一条占位响应，
	// 不在此去重就会写出 N 张一模一样的图
	const seen = new Set()
	const have = haveDates || new Set()
	for (let i = 0; i < APOD_DAYS; i++) {
		const date = ymd(Date.now() - i * 86400000)
		// 历史里已有这天就跳过：增量运行只补最新的那几天，
		// 首轮 APOD_DAYS=100 会把过去三个月一次抓齐
		if (have.has(date)) continue
		try {
			const a = await fetchJson(
				`https://science.nasa.gov/wp-json/wp/v2/apod-basic/${apodCode(date)}`
			)
			const url = (a && a.hdurl) || ''
			// 真实性校验：必须 image 类型、且 url 指向真实图片。
			const bad =
				!a ||
				a.media_type !== 'image' ||
				!url ||
				!/^https?:\/\//i.test(url)
			if (bad) {
				console.log(`  · APOD ${date}: 非图片/占位响应，跳过`)
				continue
			}
			if (seen.has(url)) {
				console.log(`  · APOD ${date}: 与已有条目重复，跳过`)
				continue
			}
			seen.add(url)
			items.push({
				date: a.date || date,
				title: a.title || '',
				// APOD 原文以 "Explanation:" 开头，去掉这层标签词，正文直接开始；
				// 先去掉再翻译，中文就不会出现「说明：」前缀
				explanation: stripHtml(a.explanation).replace(/^\s*Explanation\s*[:：]\s*/i, ''),
				thumb: url,
				full: url,
				credit: stripHtml(a.credit || a.copyright || '')
			})
			console.log(`  ✓ APOD ${date}: ${a.title}`)
		} catch (e) {
			console.warn(`  ! APOD ${date} 抓取失败: ${e.message}`)
		}
	}
	return items
}

async function runEpic() {
	try {
		const raw = await fetchJson('https://epic.gsfc.nasa.gov/api/natural')
		if (!Array.isArray(raw) || !raw.length) {
			console.warn('  ! EPIC 返回空')
			return []
		}
		// 取最新一天（数组按时间倒序，第一项即最新）
		const day = (raw[0].date || '').slice(0, 10)
		const parts = day.split('-')
		if (parts.length !== 3) {
			console.warn('  ! EPIC 日期解析失败:', raw[0].date)
			return []
		}
		const [Y, M, D] = parts
		const items = raw.slice(0, EPIC_KEEP).map((e) => {
			const png = `https://epic.gsfc.nasa.gov/archive/natural/${Y}/${M}/${D}/png/${e.image}.png`
			return {
				date: e.date || '',
				caption: e.caption || '',
				thumb: png,
				full: png
			}
		})
		console.log(`  ✓ EPIC ${day}: 取 ${items.length} 张`)
		return items
	} catch (e) {
		console.warn(`  ! EPIC 抓取失败: ${e.message}`)
		return []
	}
}

function writeJson(file, payload) {
	const filePath = path.join(OUT_DIR, file)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
	return filePath
}

async function main() {
	if (!hasCosConfig()) {
		console.log('  · 未配置 COS 密钥，JSON 只写本地 dist，图片保留原始 URL')
	}
	fs.mkdirSync(OUT_DIR, { recursive: true })

	// 先读 COS 上已有的 apod.json 当历史底座：每轮只补缺失日期，不重抓、不丢旧图
	let existing = []
	try {
		const old = await readCosJson(APOD_KEY_COS)
		existing = (old && old.list) || []
		if (existing.length) console.log(`  · 历史 APOD ${existing.length} 条（${existing[existing.length - 1].date} ~ ${existing[0].date}）`)
	} catch (e) {
		console.warn(`  ! 读取历史 APOD 失败，本轮按全新处理: ${e.message}`)
	}

	const haveDates = new Set(existing.map((x) => x.date).filter(Boolean))
	const apodFresh = await runApod(haveDates)
	const epicItems = await runEpic()

	// 翻译标题与说明：卡片和详情页都要求中文，翻不出来就在前端回退英文。
	// 沿用 sync.js 那套哈希缓存，CI 每轮只增量翻新内容，不会撞免费额度
	if (apodFresh.length || epicItems.length) {
		try {
			await loadCache()
			const texts = []
			for (const x of apodFresh) {
				if (x.title) texts.push(x.title)
				if (x.explanation) texts.push(x.explanation)
			}
			for (const x of epicItems) {
				if (x.caption) texts.push(x.caption)
			}
			if (texts.length) await translateTexts(texts)
			for (const x of apodFresh) {
				x.titleZh = getZh(x.title)
				x.explanationZh = getZh(x.explanation)
			}
			for (const x of epicItems) {
				x.captionZh = getZh(x.caption)
			}
			const cachePath = saveCache()
			// 缓存回写 COS：CI 每次全新容器，不上传等于每轮重翻
			if (hasCosConfig() && cachePath) {
				await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
			}
		} catch (e) {
			// 翻译失败绝不能影响出数据，前端会回退英文
			console.warn(`  ! 翻译失败，保留英文: ${e.message}`)
		}
	}

	// 图片镜像 COS：缩略图（480px）+ 原图（全尺寸）。无 COS 配置时跳过，保留原 URL
	// 只镜像本轮新抓的条目，历史条目上一轮已经镜像过
	if (hasCosConfig()) {
		if (apodFresh.length) {
			await mirrorImages(apodFresh, [
				{ path: 'thumb', preset: 'thumb' },
				{ path: 'full', preset: 'full' }
			])
		}
		if (epicItems.length) {
			await mirrorImages(epicItems, [
				{ path: 'thumb', preset: 'thumb' },
				{ path: 'full', preset: 'full' }
			])
		}
	}

	// 合并历史 + 新增：同日期以新数据为准，按日期倒序，超出上限的旧图丢弃
	const apodMap = new Map()
	for (const x of existing) if (x && x.date) apodMap.set(x.date, x)
	for (const x of apodFresh) if (x && x.date) apodMap.set(x.date, x)
	const apodItems = [...apodMap.values()]
		.sort((a, b) => String(b.date).localeCompare(String(a.date)))
		.slice(0, APOD_MAX)
	console.log(`  · APOD 合并后 ${apodItems.length} 条（本轮新增 ${apodFresh.length}，上限 ${APOD_MAX}）`)

	const at = new Date().toISOString()
	const apodPayload = {
		v: DATA_VERSION,
		dataset: 'apod',
		generatedAt: at,
		count: apodItems.length,
		list: apodItems
	}
	const epicPayload = {
		v: DATA_VERSION,
		dataset: 'epic',
		generatedAt: at,
		count: epicItems.length,
		list: epicItems
	}

	const apodPath = writeJson(APOD_FILE, apodPayload)
	const epicPath = writeJson(EPIC_FILE, epicPayload)

	console.log(`  → ${APOD_FILE} ${apodItems.length} 条 / ${EPIC_FILE} ${epicItems.length} 条`)

	if (hasCosConfig()) {
		// 显式 no-cache：这两份每天才变一次，回源成本可忽略；
		// 若用 max-age，上游故障期写入的空数据会被客户端压住整个缓存周期
		await upload(apodPath, APOD_KEY_COS, 'no-cache')
		await upload(epicPath, EPIC_KEY_COS, 'no-cache')
	}
}

module.exports = { main, runApod, runEpic }

if (require.main === module) {
	main()
		.then(() => {
			console.log('APOD/EPIC 抓取完成')
			process.exit(0)
		})
		.catch((e) => {
			console.error('失败:', e)
			process.exit(1)
		})
}
