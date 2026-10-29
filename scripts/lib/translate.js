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

/**
 * 两张人工干预表，优先级高于机翻：
 *
 *   translation-overrides.json —— 原文 → 人工译文。命中就完全不走机翻，
 *                                 也不进缓存。改一个词只要改 JSON + push。
 *   data/i18n-terms.json       —— 机翻错译 → 正确译法。写缓存之前、
 *                                 以及 getZh 返回之前各跑一遍，
 *                                 所以历史脏数据不用清缓存也会被修正。
 *
 * 都没有就是纯机翻。两张表都是可选的，缺文件不影响主流程。
 */
const OVERRIDE_FILE = path.resolve(__dirname, '..', 'translation-overrides.json')
const TERMS_FILE = path.resolve(__dirname, '..', 'data', 'i18n-terms.json')

let overrides = {}
let termRules = []

function loadHumanTables() {
	try {
		if (fs.existsSync(OVERRIDE_FILE)) {
			const obj = JSON.parse(fs.readFileSync(OVERRIDE_FILE, 'utf8'))
			for (const [k, v] of Object.entries(obj || {})) {
				if (k.startsWith('_') || typeof v !== 'string' || !v.trim()) continue
				overrides[k] = v
			}
			console.log(`  人工译文: ${Object.keys(overrides).length} 条`)
		}
	} catch (e) {
		console.warn(`  人工译文表损坏，忽略: ${e.message}`)
	}

	try {
		if (fs.existsSync(TERMS_FILE)) {
			const obj = JSON.parse(fs.readFileSync(TERMS_FILE, 'utf8'))
			for (const [from, to] of obj.fixes || []) {
				termRules.push([new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to])
			}
			for (const [re, to] of obj._regexFixes || []) {
				try {
					termRules.push([new RegExp(re, 'g'), to])
				} catch (e) {
					console.warn(`  术语规则无效（${re}）`)
				}
			}
			console.log(`  术语纠正: ${termRules.length} 条规则`)
		}
	} catch (e) {
		console.warn(`  术语表损坏，忽略: ${e.message}`)
	}
}

/** 把机翻的常见错译拉回来。纯字符串替换，不会引入新的错误 */
function fixTerms(zh) {
	if (!zh) return zh
	let s = zh
	for (const [re, to] of termRules) s = s.replace(re, to)
	// MyMemory 的记忆库里混进了 CAT 工具的占位符，短标题经常返回
	// 「蟹状星云object name (optional)」，直接摘掉这截脏尾巴
	s = String(s)
		.replace(/object\s*name\s*\(\s*optional\s*\)/gi, '')
		.replace(/\s*\(\s*optional\s*\)\s*$/i, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
	return s
}

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
					if (res.statusCode !== 200) {
						const err = new Error('HTTP ' + res.statusCode)
						// 带上状态码，上层才能区分「瞬时限流」和「这后端彻底不通」
						err.status = res.statusCode
						return reject(err)
					}
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

/** 429 / 5xx 属于瞬时限流，退避一下还能继续；其它错误视为后端不可用 */
function isTransient(e) {
	return e && (e.status === 429 || (e.status >= 500 && e.status < 600))
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
// 连续被 Google 限流的次数。差量任务（每天几十条）撞几次 429 退避一下就过去了，
// 但 NASA 星云这种一次六百多段的大批量，CI 的 IP 段会被持续限流，
// 此时死磕 Google 只会把整批耗光 —— 攒够次数就转 MyMemory
let google429 = 0
const GOOGLE_429_LIMIT = Number(process.env.TRANSLATE_429_LIMIT || 12)

async function translateSegment(seg) {
	if (PROVIDER === 'mymemory') return translateByMyMemory(seg)
	if (PROVIDER === 'google') return translateByGoogle(seg)

	// auto：先 Google，失败就永久降级到 MyMemory
	if (!googleDown) {
		try {
			const out = await translateByGoogle(seg)
			google429 = 0
			return out
		} catch (e) {
			// 瞬时限流先退避重试，仍然优先用 Google（质量比 MyMemory 好）；
			// 但连续撞太多次说明这个出口被盯上了，转 MyMemory 保住产出
			if (isTransient(e)) {
				google429++
				if (google429 < GOOGLE_429_LIMIT) throw e
				googleDown = true
				console.warn(`  · Google 连续限流 ${google429} 次，本次改用 MyMemory`)
			} else {
				googleDown = true
				console.warn(`  · Google 翻译不可用（${e.message}），本次改用 MyMemory`)
			}
		}
	}
	return translateByMyMemory(seg)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RETRY_DELAYS = [2000, 6000]

/**
 * 限流退避重试。
 * 实测尾部总有一二十条撞 429，之前直接计入失败、连挂 5 条就整轮中止，
 * 导致机构简介长期停在 87%。加两层退避后基本能跑满。
 */
async function translateWithRetry(seg) {
	let lastErr
	for (let i = 0; i <= RETRY_DELAYS.length; i++) {
		try {
			return await translateSegment(seg)
		} catch (e) {
			lastErr = e
			// 配额真的用尽时重试只会让情况更糟，直接放弃
			if (quotaExhausted) break
			if (i < RETRY_DELAYS.length) {
				await sleep(RETRY_DELAYS[i] + Math.floor(Math.random() * 800))
			}
		}
	}
	throw lastErr
}

/**
 * 批量翻译，返回前会把结果写进缓存（不落盘）
 * @param {string[]} texts
 */
async function translateTexts(texts) {
	const uniq = [...new Set((texts || []).filter((t) => t && t.trim()))]
	// 人工译文优先：命中的既不发请求，也不进缓存，永远以表里为准
	const todo = uniq.filter((t) => !overrides[t] && !cache[hash(t)])
	stats.hit += uniq.length - todo.length

	const skipped = !process.env.TRANSLATE_DISABLE ? '' : '（已禁用）'
	console.log(
		`  翻译: 去重 ${uniq.length} / 缓存命中 ${uniq.length - todo.length} / 待翻 ${todo.length}${skipped}`
	)

	if (!todo.length || process.env.TRANSLATE_DISABLE) return

	let idx = 0
	let consecutiveFail = 0
	// 连续失败多少条才收手。差量任务几十条时 5 条足够早停，
	// 但 NASA 星云一次六百多段，5 条就中止等于整批全废 —— 按批量放大
	const FAIL_LIMIT = Math.max(
		Number(process.env.TRANSLATE_MAX_FAIL || 30),
		Math.ceil(todo.length * 0.15)
	)

	const worker = async () => {
		while (idx < todo.length) {
			if (quotaExhausted) return
			const text = todo[idx++]
			try {
				const parts = []
				for (const seg of splitSegments(text)) {
					parts.push(await translateWithRetry(seg))
				}
				// 落缓存前先过术语纠正：脏译文从此不再进库，
				// 以后即使有人从旧缓存里再读出来，getZh 出口还有一道
				const zh = fixTerms(parts.join(' ').replace(/\s+/g, ' ').trim())
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
				if (consecutiveFail >= FAIL_LIMIT) {
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

/** 查译文：人工表 → 缓存 → 术语纠正。都没有就返回空串（前端回退英文） */
function getZh(text) {
	if (!text) return ''
	const human = overrides[text]
	if (human) return human
	const hit = cache[hash(text)]
	return fixTerms((hit && hit.zh) || '')
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
	// 先装人工表：后面 translateTexts 要靠 overrides 判断哪些不用翻
	loadHumanTables()

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
