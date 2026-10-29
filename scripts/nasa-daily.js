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
const { upload, hasCosConfig } = require('./lib/cos')
const { mirrorImages } = require('./lib/image')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const APOD_DAYS = Number(process.env.APOD_DAYS || 7)
const EPIC_KEEP = Number(process.env.EPIC_KEEP || 4)

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

async function runApod() {
	const items = []
	// 按图片 URL 去重：NASA 接口偶发降级时会对所有日期返回同一条占位响应，
	// 不在此去重就会写出 N 张一模一样的图
	const seen = new Set()
	for (let i = 0; i < APOD_DAYS; i++) {
		const date = ymd(Date.now() - i * 86400000)
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
				explanation: stripHtml(a.explanation),
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

	const apodItems = await runApod()
	const epicItems = await runEpic()

	// 图片镜像 COS：缩略图（480px）+ 原图（全尺寸）。无 COS 配置时跳过，保留原 URL
	if (hasCosConfig()) {
		if (apodItems.length) {
			await mirrorImages(apodItems, [
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
		await upload(apodPath, APOD_KEY_COS, 'public, max-age=3600')
		await upload(epicPath, EPIC_KEY_COS, 'public, max-age=3600')
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
