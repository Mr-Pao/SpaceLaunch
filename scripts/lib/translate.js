'use strict'

/**
 * 任务描述中文化
 *
 * LL2 只提供英文，而描述在卡片和详情页占很大面积，不翻译体验很差。
 *
 * 设计要点：
 * 1. **按原文哈希缓存**。星链任务的描述高度重复（50 条里只有 40 种不同文本），
 *    缓存让绝大多数请求根本不会发出去。
 * 2. **缓存随数据一起同步到 COS**。CI 每次先下载缓存再增量翻译，
 *    这样每天真实翻译量只有个位数，不会撞限额。
 * 3. **失败静默降级**。翻不出来就留空，前端自动回退英文，绝不影响主流程。
 * 4. 长文本按句子切段（单次有长度上限），逐段翻译后拼接。
 *
 * 后端默认用 MyMemory（免费、免注册、国内可直连）。
 * 匿名限额约 1000 词/天，带 de 邮箱参数可到 50000 词/天：
 *   TRANSLATE_EMAIL=you@example.com node sync.js
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const ENDPOINT = 'https://api.mymemory.translated.net/get'
const GOOGLE = 'https://translate.googleapis.com/translate_a/single'
const EMAIL = process.env.TRANSLATE_EMAIL || ''
const MAX_SEG = 450 // MyMemory 单次请求的字符上限，留足余量
// 并发和间隔都压得很低：两条免费通道对突发请求都很敏感，
// 3 并发 + 200ms 间隔实测会吃到 429，宁可慢一点也不要整批失败
const CONCURRENCY = 2
const DELAY_MS = 350
const TIMEOUT_MS = 20000
const GOOGLE_TIMEOUT_MS = 6000
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'

/**
 * 翻译后端选择
 *   auto（默认）—— 先用 Google 免费端点，挂了自动降级到 MyMemory
 *   google      —— 只用 Google（CI 跑这个：GitHub 节点在海外，可直连且无额度限制）
 *   mymemory    —— 只用 MyMemory（本地调试用：国内可直连，但每天约 1000 词）
 *
 * 两个都是免费免注册接口，属于"能用就用"的定位，任何一边失联都不影响出数据。
 */
const PROVIDER = process.env.TRANSLATE_PROVIDER || 'auto'

const OUT_DIR = path.resolve(__dirname, '..', '..', 'dist')
const CACHE_FILE = path.join(OUT_DIR, 'translation-cache.json')

/** hash 原文 → 缓存键。djb2 加长度前缀，足够避免碰撞 */
function hash(str) {
	let h = 5381
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) + h + str.charCodeAt(i)) | 0
	}
	return (h >>> 0).toString(36) + '_' + str.length.toString(36)
}

/** 缓存：{ [hash]: { zh, at } }。只存中文，原文靠 hash 反查不回来，但也不需要 */
let cache = {}
let dirty = false
let quotaExhausted = false
let stats = { hit: 0, ok: 0, fail: 0 }

function httpGetJson(url, timeoutMs) {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{ timeout: timeoutMs || TIMEOUT_MS, headers: { 'User-Agent': UA } },
			(res) => {
				const chunks = []
				res.on('data', (c) => chunks.push(c))
				res.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8')
					if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
					try {
						resolve(JSON.parse(body))
					} catch (e) {
						reject(new Error('JSON 解析失败'))
					}
				})
			}
		)
		req.on('timeout', () => req.destroy(new Error('请求超时')))
		req.on('error', reject)
	})
}

/** 按句子边界切段，保证每段不超过 MAX_SEG */
function splitSegments(text) {
	if (text.length <= MAX_SEG) return [text]

	const sentences = text.split(/(?<=[.!?;:])\s+/)
	const out = []
	let cur = ''

	for (const s of sentences) {
		if (!cur) {
			cur = s
		} else if ((cur + ' ' + s).length <= MAX_SEG) {
			cur += ' ' + s
		} else {
			out.push(cur)
			cur = s
		}
	}
	if (cur) out.push(cur)

	// 单句仍然超长（极少见），按空格硬切
	const final = []
	for (const seg of out) {
		if (seg.length <= MAX_SEG) {
			final.push(seg)
			continue
		}
		let rest = seg
		while (rest.length > MAX_SEG) {
			let cut = rest.lastIndexOf(' ', MAX_SEG)
			if (cut < MAX_SEG * 0.5) cut = MAX_SEG
			final.push(rest.slice(0, cut))
			rest = rest.slice(cut).trimStart()
		}
		if (rest) final.push(rest)
	}
	return final
}

/** Google 免费端点。返回 [[["译文","原文",...]],...]，把所有分片的译文拼起来 */
async function translateByGoogle(seg) {
	const url = `${GOOGLE}?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(seg)}`
	const json = await httpGetJson(url, GOOGLE_TIMEOUT_MS)

	if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error('Google 返回格式异常')

	return json[0]
		.map((part) => (Array.isArray(part) ? part[0] : ''))
		.filter(Boolean)
		.join('')
}

async function translateByMyMemory(seg) {
	const params = new URLSearchParams({ q: seg, langpair: 'en|zh-CN' })
	if (EMAIL) params.set('de', EMAIL)

	const json = await httpGetJson(`${ENDPOINT}?${params.toString()}`)
	const data = json && json.responseData
	const text = data && data.translatedText

	if (!text || typeof text !== 'string') throw new Error('返回格式异常')
	// 配额耗尽时 MyMemory 会把警告塞进 translatedText，不会报错码
	if (json.quotaFinished || /MYMEMORY WARNING/i.test(text)) {
		quotaExhausted = true
		throw new Error('翻译配额已用尽')
	}
	return text
}

// Google 一旦连不上（比如本地网络），后续请求就别再白等 6 秒
let googleDown = false

async function translateSegment(seg) {
	if (PROVIDER === 'mymemory') return translateByMyMemory(seg)
	if (PROVIDER === 'google') return translateByGoogle(seg)

	// auto：先 Google，失败就永久降级到 MyMemory
	if (!googleDown) {
		try {
			return await translateByGoogle(seg)
		} catch (e) {
			googleDown = true
			console.warn(`  · Google 翻译不可用（${e.message}），本次改用 MyMemory`)
		}
	}
	return translateByMyMemory(seg)
}

/**
 * 批量翻译，返回前会把结果写进缓存（不落盘）
 * @param {string[]} texts
 */
async function translateTexts(texts) {
	const uniq = [...new Set((texts || []).filter((t) => t && t.trim()))]
	const todo = uniq.filter((t) => !cache[hash(t)])
	stats.hit += uniq.length - todo.length

	const skipped = !process.env.TRANSLATE_DISABLE ? '' : '（已禁用）'
	console.log(
		`  翻译: 去重 ${uniq.length} / 缓存命中 ${uniq.length - todo.length} / 待翻 ${todo.length}${skipped}`
	)

	if (!todo.length || process.env.TRANSLATE_DISABLE) return

	let idx = 0
	let consecutiveFail = 0

	const worker = async () => {
		while (idx < todo.length) {
			if (quotaExhausted) return
			const text = todo[idx++]
			try {
				const parts = []
				for (const seg of splitSegments(text)) {
					parts.push(await translateSegment(seg))
				}
				const zh = parts.join(' ').replace(/\s+/g, ' ').trim()
				if (zh) {
					cache[hash(text)] = { zh, at: new Date().toISOString() }
					dirty = true
					stats.ok++
				}
				consecutiveFail = 0
			} catch (e) {
				stats.fail++
				consecutiveFail++
				// 连续失败多半是被限流，早点收手，别把后面的也拖死
				if (consecutiveFail >= 5) {
					quotaExhausted = true
					console.warn(`  ! 连续 ${consecutiveFail} 次失败，中止本轮翻译: ${e.message}`)
					return
				}
				console.warn(`  ! 翻译失败: ${e.message}`)
			}
			// 温和一点，避免触发限流
			await new Promise((r) => setTimeout(r, DELAY_MS))
		}
	}

	await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

/** 查缓存，没有就返回空串（前端会回退英文） */
function getZh(text) {
	if (!text) return ''
	const hit = cache[hash(text)]
	return (hit && hit.zh) || ''
}

function cosCacheUrl() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) return ''
	return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/space-data/translation-cache.json`
}

/**
 * 读缓存，三层合并（后者覆盖前者）：
 *   1. scripts/data/translation-cache.json —— 提交在 git 里的种子，保证首次上线就有中文
 *   2. dist/translation-cache.json         —— 本地跑过之后的产物
 *   3. COS 上的缓存                        —— CI 增量累积的最新结果
 *
 * CI 每次都是全新容器，必须从 COS 拉最新缓存，否则每轮都要重翻、必然撞限额
 */
async function loadCache() {
	const seed = path.resolve(__dirname, '..', 'data', 'translation-cache.json')

	const mergeFile = (label, file) => {
		if (!fs.existsSync(file)) return
		try {
			const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
			if (obj && typeof obj === 'object') {
				Object.assign(cache, obj)
				console.log(`  翻译缓存: ${label} ${Object.keys(obj).length} 条`)
			}
		} catch (e) {
			console.warn(`  翻译缓存: ${label} 损坏，忽略`)
		}
	}

	mergeFile('种子', seed)
	mergeFile('本地', CACHE_FILE)

	const url = cosCacheUrl()
	if (!url) return

	try {
		const json = await httpGetJson(url)
		if (json && typeof json === 'object') {
			const before = Object.keys(cache).length
			Object.assign(cache, json)
			console.log(`  翻译缓存: COS ${Object.keys(json).length} 条（合并后 ${Object.keys(cache).length} 条）`)
			void before
		}
	} catch (e) {
		console.log(`  翻译缓存: COS 暂无（${e.message}）`)
	}
}

/** 落盘，返回文件路径 */
function saveCache() {
	fs.mkdirSync(OUT_DIR, { recursive: true })
	fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8')
	return CACHE_FILE
}

/** 导出当前缓存对象（种子脚本用） */
function dumpCache() {
	return cache
}

function summary() {
	return { ...stats, cached: Object.keys(cache).length, dirty, quotaExhausted }
}

module.exports = {
	translateTexts,
	getZh,
	loadCache,
	saveCache,
	dumpCache,
	summary,
	splitSegments
}
