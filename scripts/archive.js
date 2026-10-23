'use strict'

/**
 * 历史发射归档
 *
 * 为什么单独一个脚本：
 * LL2 免费额度是 **15 次/小时**，每次最多 100 条。全部历史 7654 条约 77 页，
 * 单次同步根本拉不完（还会把 upcoming 的配额挤光）。所以做成「每小时跑一小段、
 * 断点续传」的归档任务，约 10 小时补齐，之后只需处理新增。
 *
 * 分页用 offset（LL2 的 net__lt 参数实测无效），从新到旧推进。
 *
 * ⚠️ 为什么页数要按「距上次跑过多久」自适应：
 * GitHub 的 schedule 事件本身就不保证准时，实测还会整点漏触发，
 * 写死 8 页/轮的话，漏一小时就少 800 条，77 页能拖到几十小时。
 * 现在改成按实际间隔补跑：隔了 3 小时没跑成就一次性抓 24 页，把落后补回来。
 * 抓不完也不怕 —— 遇到 429 会退避重试，实在不行就保存断点，下一轮继续。
 *
 * ⚠️ 归档阶段**不做翻译**：800 条 × 每条约 1.5 秒，翻完就超 CI 的 15 分钟上限了。
 * 老数据的任务名会是英文，前端 launchTitle 已做 fallback；需要中文可以另跑回填任务。
 *
 * 全部抓完之后转维护模式：每次刷新最新 MAINT_PAGES 片。
 * 新发射会把整个列表往下顶，offset 分页会在头部留下一道空缺，重抓头部就能补上。
 * 重写旧片前会先把已回填的中文搬过来，否则会冲掉 backfill 的成果。
 *
 * 用法：
 *   node archive.js                # 自适应页数（默认）
 *   node archive.js --pages=3      # 强制本轮页数
 *   node archive.js --dry          # 只抓不传，用于本地验证
 */

const path = require('path')
const fs = require('fs')
const { slimLaunch } = require('./lib/slim')
const { upload } = require('./lib/cos')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const PREFIX = 'space-data/history'
const PAGE_SIZE = 100

// 干跑开关：只抓不传，方便本机验证改动
let DRY_RUN = false
// 每小时 15 次的预算里，upcoming 占 4、events 占 2、previous 占 1，
// 留 8 次给归档，大约每小时 800 条
const PAGES_PER_HOUR = 8
// 一轮最多抓这么多页。24 页约 6 分钟，留足 CI 的 20 分钟上限
const MAX_PAGES = 24
// 间隔太短就跳过，避免 push 触发时连着把配额打光
const MIN_INTERVAL_MS = 20 * 60 * 1000
// 抓完之后的维护模式：每次刷新最新 4 片。
// 新发射会把整个列表往下顶，offset 分页会因此在头部留下一道空缺，
// 头部几片重抓一次就能补上（前端按 id 去重，重复项无害）
const MAINT_PAGES = 4
// 覆盖 previous.json（最近 100 条）之后的数据，避免重复
const START_OFFSET = 100

function baseUrl() {
	return process.env.LL2_BASE === 'dev'
		? 'https://lldev.thespacedevs.com/2.3.0'
		: 'https://ll.thespacedevs.com/2.3.0'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 带退避的抓取
 * LL2 匿名限 15 次/小时，超限返回 429。以前是直接 break 放弃整轮，
 * 现在先等 30 秒重试一次，还是 429 才认输。
 * 返回 null 表示这一页拿不到，交给调用方收尾。
 */
async function getJsonWithRetry(pathAndQuery) {
	const headers = { 'User-Agent': 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)' }
	if (process.env.LL2_TOKEN) headers.Authorization = 'Token ' + process.env.LL2_TOKEN

	for (let attempt = 0; attempt < 2; attempt++) {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), 120000)

		try {
			const res = await fetch(baseUrl() + pathAndQuery, { headers, signal: ctrl.signal })

			if (res.status === 429 || res.status >= 500) {
				if (attempt === 0) {
					console.warn(`  ! 被限流（HTTP ${res.status}），等 30 秒重试`)
					await sleep(30000)
					continue
				}
				console.warn(`  ! 仍被限流（HTTP ${res.status}），本轮到此为止`)
				return null
			}

			if (!res.ok) throw new Error('HTTP ' + res.status)
			return await res.json()
		} catch (e) {
			if (e && e.name === 'AbortError') {
				console.warn('  ! 请求超时，本轮到此为止')
				return null
			}
			if (attempt === 0) {
				console.warn(`  ! 请求失败（${e.message}），等 10 秒重试`)
				await sleep(10000)
				continue
			}
			console.warn(`  ! 仍然失败（${e.message}），本轮到此为止`)
			return null
		} finally {
			clearTimeout(timer)
		}
	}
	return null
}

/** 读 COS 上的状态文件；没有就从头开始。桶是公有读，直接走 CDN 地址即可 */
async function readState() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) {
		throw new Error('缺少 COS_BUCKET / COS_REGION')
	}

	try {
		const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${PREFIX}/state.json`
		const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
		if (res.ok) {
			const s = await res.json()
			if (s && typeof s.next === 'number') return s
		}
	} catch (e) {
		// 首次运行时文件不存在，属于正常情况
	}

	console.log('  归档状态: 暂无，从头开始')
	return { next: START_OFFSET, total: 0, pages: [], done: false, updatedAt: '', refreshed: 0 }
}

/** 读 COS 上已有的分片。读不到返回 null，调用方按「没有旧内容」处理 */
async function readPage(key) {
	const { COS_BUCKET, COS_REGION } = process.env
	const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
		if (!res.ok) return null
		const j = await res.json()
		return Array.isArray(j.list) ? j : null
	} catch (e) {
		return null
	}
}

/**
 * 把旧片里已经回填好的中文搬到新抓的这一片上。
 *
 * 维护模式会重写头部几片，而译文是 backfill 任务另外补进去的，
 * 直接覆盖会把已经翻好的任务名/描述冲掉，且 backfill 的游标早已走过这几片，
 * 不会再来补 —— 于是这几片永久变回英文。
 * 所以在写回之前，按 id 把译文搬过来，一次网络翻译都不用做。
 */
function carryTranslations(list, old) {
	if (!old) return 0

	const zhMap = new Map()
	for (const x of old.list || []) {
		const m = x.mission || {}
		if (!x.id) continue
		zhMap.set(x.id, {
			nameZh: (m && m.nameZh) || '',
			descriptionZh: (m && m.descriptionZh) || '',
			weather_concernsZh: x.weather_concernsZh || '',
			failreasonZh: x.failreasonZh || ''
		})
	}
	if (!zhMap.size) return 0

	// 统计实际搬走了几个字段，不是匹配了几条：
	// 还没回填译文的片匹配上了也是 0，报成「保留 100 条」会让人以为译文齐全
	let moved = 0
	for (const x of list) {
		const saved = zhMap.get(x.id)
		if (!saved) continue

		const put = (holder, key, value) => {
			if (value && !holder[key]) {
				holder[key] = value
				moved++
			}
		}

		if (x.mission) {
			put(x.mission, 'nameZh', saved.nameZh)
			put(x.mission, 'descriptionZh', saved.descriptionZh)
		}
		put(x, 'weather_concernsZh', saved.weather_concernsZh)
		put(x, 'failreasonZh', saved.failreasonZh)
	}
	return moved
}

async function putJson(obj, key) {
	const file = path.join(OUT_DIR, key.replace(/\//g, '_'))
	fs.writeFileSync(file, JSON.stringify(obj), 'utf8')

	if (DRY_RUN) {
		console.log(`  · 干跑：已生成 ${file}（不上传）`)
		return
	}
	await upload(file, key, 'public, max-age=3600')
}

function parseArgs(argv) {
	let pages = null // null = 自适应
	let dry = false
	for (const a of argv.slice(2)) {
		// auto 走自适应，交给 planPages 按间隔折算
		if (a === '--pages=auto') continue
		const m = a.match(/^--pages=(\d+)$/)
		if (m) pages = Number(m[1])
		if (a === '--dry') dry = true
	}
	return { pages, dry }
}

/** 距上次归档过了多久。没有记录就当成一整小时（首次跑满） */
function elapsedMs(state) {
	if (!state.updatedAt) return 3600 * 1000
	const t = Date.parse(state.updatedAt)
	return Number.isNaN(t) ? 3600 * 1000 : Date.now() - t
}

/**
 * 本轮抓几页：按实际间隔折算，补回漏掉的那些小时。
 * 间隔不足 MIN_INTERVAL_MS 就返回 0（直接跳过），
 * 上限 MAX_PAGES 是为了不把 CI 的 20 分钟跑爆。
 */
function planPages(state, forced) {
	if (typeof forced === 'number') return Math.max(0, forced)

	const ms = elapsedMs(state)
	if (ms < MIN_INTERVAL_MS) return 0

	const pages = Math.floor((ms / 3600000) * PAGES_PER_HOUR)
	return Math.max(1, Math.min(MAX_PAGES, pages))
}

/**
 * 抓某一页并落盘。返回本页条数，拿不到返回 0。
 * @param {number} offset 在 LL2 全量列表里的起始位置
 * @param {string} name   要写入的分片文件名
 * @param {number} index  分片序号，写进 JSON 里方便排查
 */
async function pullPage(offset, name, index, keepZh) {
	const j = await getJsonWithRetry(
		`/launches/previous/?limit=${PAGE_SIZE}&offset=${offset}&mode=normal&format=json`
	)
	if (!j) return { count: 0, total: 0, ok: false }

	const results = j.results || []
	if (!results.length) return { count: 0, total: j.count || 0, ok: true }

	const list = results.map(slimLaunch)

	// 只有重写旧片时才需要搬译文，新片本来就没译文可搬
	let moved = 0
	if (keepZh) {
		const old = await readPage(`${PREFIX}/${name}`)
		moved = carryTranslations(list, old)
	}

	await putJson(
		{
			v: 6,
			dataset: 'history',
			page: index,
			generatedAt: new Date().toISOString(),
			count: list.length,
			list
		},
		`${PREFIX}/${name}`
	)

	return { count: results.length, total: j.count || 0, ok: true, list, moved }
}

/** 拿到的这一页，和上一页的边界衔接得上吗。用来验证分页没漂移 */
function checkChain(prevOldest, list) {
	if (!prevOldest) return true
	const newest = list[0].net
	return Date.parse(newest) <= Date.parse(prevOldest)
}

async function saveAndReport(state, pulled, note, head) {
	state.updatedAt = new Date().toISOString()
	await putJson(state, `${PREFIX}/state.json`)

	// 索引单独一份，前端只读它，避免把 state 的内部字段暴露出去
	await putJson(
		{
			v: 6,
			generatedAt: state.updatedAt,
			total: state.total,
			archived: state.next,
			done: state.done,
			startOffset: START_OFFSET,
			pages: state.pages
		},
		`${PREFIX}/index.json`
	)

	const pct = ((state.next / (state.total || 1)) * 100).toFixed(1)
	console.log(
		`\n${head || '本轮归档 ' + pulled + ' 条，累计 ' + state.next + '/' + (state.total || '?') + '（' + pct + '%）'}${note}\n`
	)
}

/**
 * 维护模式：整库抓完之后，每次刷新最新几片。
 * 新发射会把列表整体下推，offset 分页会在头部留下一道空缺，
 * 重抓头部就能补上；前端按 id 去重，重复项无害。
 */
async function maintain(state) {
	const total = state.pages.length
	const n = Math.min(MAINT_PAGES, total)
	let pulled = 0

	console.log(`\n=== 历史归档（维护模式）===\n  已归档 ${total} 片 / ${state.total} 条`)

	for (let i = 0; i < n; i++) {
		const offset = START_OFFSET + PAGE_SIZE * i
		// 最后一个参数 true = 重写旧片，先把已有译文搬过来再覆盖
		const r = await pullPage(offset, state.pages[i].file, i, true)
		if (!r.ok) break

		state.total = r.total || state.total
		state.pages[i].count = r.count
		if (r.list && r.list.length) {
			// list 是 net 倒序，首个最新、末个最旧
			state.pages[i].from = r.list[r.list.length - 1].net
			state.pages[i].to = r.list[0].net
		}
		// 注意不要动 state.next：全库已抓完，它记录的是归档总量，
		// 这里只是刷新头部几片的内容，改了会让进度显示倒退
		pulled += r.count
		state.refreshed = (state.refreshed || 0) + 1

		console.log(
			`  ${state.pages[i].file}  第 ${offset}-${offset + r.count} 条  ${r.count} 项` +
				(r.moved ? `  搬回译文 ${r.moved} 处` : '')
		)

		if (i < n - 1) await sleep(2000)
	}

	await saveAndReport(
		state,
		pulled,
		' · 维护模式',
		`本轮刷新 ${n} 片 / ${pulled} 条（全库 ${state.total || '?'} 条已归档）`
	)
}

async function run() {
	const args = parseArgs(process.argv)
	DRY_RUN = args.dry
	fs.mkdirSync(OUT_DIR, { recursive: true })

	const state = await readState()

	if (state.done) {
		if (planPages(state, args.pages) === 0) {
			console.log(`归档已完成且本轮无需维护（${state.pages.length} 片 / ${state.total} 条）`)
			return
		}
		await maintain(state)
		return
	}

	const maxPages = planPages(state, args.pages)
	console.log(
		`\n=== 历史归档 ===\n  进度 ${state.next} / ${state.total || '?'} 条，已归档 ${state.pages.length} 片\n  距上次更新 ${(elapsedMs(state) / 60000).toFixed(0)} 分钟，本轮计划 ${maxPages} 页`
	)

	if (maxPages === 0) {
		console.log('  间隔太短，本轮跳过')
		return
	}

	let pulled = 0
	let prevOldest = state.pages.length ? state.pages[state.pages.length - 1].from : ''
	let note = ''

	for (let i = 0; i < maxPages; i++) {
		const offset = state.next
		const name = `p${String(state.pages.length).padStart(2, '0')}.json`

		const r = await pullPage(offset, name, state.pages.length)
		state.total = r.total || state.total

		if (!r.ok) {
			note = ' · 本轮未完成，下轮继续'
			break
		}
		if (r.count === 0) {
			state.done = true
			note = ' ✓ 已全部完成'
			break
		}

		if (!checkChain(prevOldest, r.list)) {
			console.warn(`  ! 分页接缝异常：上一页最旧 ${prevOldest}，本页最新 ${r.list[0].net}`)
		}

		state.pages.push({
			file: name,
			count: r.count,
			// list 是 net 倒序，首个最新、末个最旧
			from: r.list[r.list.length - 1].net,
			to: r.list[0].net
		})

		state.next = offset + r.count
		pulled += r.count
		prevOldest = state.pages[state.pages.length - 1].from

		console.log(`  ${name}  第 ${offset}-${state.next} 条  ${r.count} 项`)

		if (r.total && state.next >= r.total) {
			state.done = true
			note = ' ✓ 已全部完成'
			break
		}

		// 别把 15 次/小时的额度一口气打光
		if (i < maxPages - 1) await sleep(2000)
	}

	await saveAndReport(state, pulled, note)
}

// 直接 node archive.js 时才自动执行；被 require 时只导出函数，方便写验证脚本
if (require.main === module) {
	run().catch((e) => {
		console.error('未捕获异常:', e)
		process.exit(1)
	})
}

module.exports = { run, maintain, pullPage, readPage, readState, carryTranslations, planPages, elapsedMs }
