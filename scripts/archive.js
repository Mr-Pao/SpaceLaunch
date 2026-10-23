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
 * ⚠️ 归档阶段**不做翻译**：800 条 × 每条约 1.5 秒，翻完就超 CI 的 15 分钟上限了。
 * 老数据的任务名会是英文，前端 launchTitle 已做 fallback；需要中文可以另跑回填任务。
 *
 * 用法：
 *   node archive.js                # 跑一轮（默认 8 页）
 *   node archive.js --pages=3      # 自定义本轮页数
 */

const path = require('path')
const fs = require('fs')
const { slimLaunch } = require('./lib/slim')
const { upload } = require('./lib/cos')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const PREFIX = 'space-data/history'
const PAGE_SIZE = 100
// 每小时 15 次的预算里，upcoming 占 4、events 占 2、previous 占 1，
// 留 8 次给归档，大约每小时 800 条
const PAGES_PER_RUN = 8
// 覆盖 previous.json（最近 100 条）之后的数据，避免重复
const START_OFFSET = 100

function baseUrl() {
	return process.env.LL2_BASE === 'dev'
		? 'https://lldev.thespacedevs.com/2.3.0'
		: 'https://ll.thespacedevs.com/2.3.0'
}

async function getJson(pathAndQuery) {
	const headers = { 'User-Agent': 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)' }
	if (process.env.LL2_TOKEN) headers.Authorization = 'Token ' + process.env.LL2_TOKEN

	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), 120000)

	try {
		const res = await fetch(baseUrl() + pathAndQuery, { headers, signal: ctrl.signal })
		if (!res.ok) throw new Error('HTTP ' + res.status)
		return await res.json()
	} finally {
		clearTimeout(timer)
	}
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
	return { next: START_OFFSET, total: 0, pages: [], done: false, updatedAt: '' }
}

async function putJson(obj, key) {
	const file = path.join(OUT_DIR, key.replace(/\//g, '_'))
	fs.writeFileSync(file, JSON.stringify(obj), 'utf8')
	await upload(file, key, 'public, max-age=3600')
}

function parseArgs(argv) {
	let pages = PAGES_PER_RUN
	for (const a of argv.slice(2)) {
		const m = a.match(/^--pages=(\d+)$/)
		if (m) pages = Number(m[1])
	}
	return { pages }
}

;(async () => {
	const { pages: maxPages } = parseArgs(process.argv)
	fs.mkdirSync(OUT_DIR, { recursive: true })

	const state = await readState()

	if (state.done) {
		console.log(`归档已完成（${state.pages.length} 片 / ${state.total} 条），本轮跳过`)
		return
	}

	console.log(
		`\n=== 历史归档 ===\n  进度 ${state.next} / ${state.total || '?'} 条，已归档 ${state.pages.length} 片`
	)

	let pulled = 0

	for (let i = 0; i < maxPages; i++) {
		const offset = state.next

		let j
		try {
			j = await getJson(
				`/launches/previous/?limit=${PAGE_SIZE}&offset=${offset}&mode=normal&format=json`
			)
		} catch (e) {
			console.warn(`  ! 第 ${offset} 条起抓取失败（${e.message}），本轮到此为止`)
			break
		}

		const results = j.results || []
		state.total = j.count || state.total

		if (!results.length) {
			state.done = true
			console.log('  已到末页，归档完成')
			break
		}

		const list = results.map(slimLaunch)
		const name = `p${String(state.pages.length).padStart(2, '0')}.json`

		await putJson(
			{
				v: 6,
				dataset: 'history',
				page: state.pages.length,
				generatedAt: new Date().toISOString(),
				count: list.length,
				list
			},
			`${PREFIX}/${name}`
		)

		state.pages.push({
			file: name,
			count: list.length,
			// list 是 net 倒序，首个最新、末个最旧
			from: list[list.length - 1].net,
			to: list[0].net
		})

		state.next = offset + results.length
		pulled += results.length

		console.log(`  ${name}  第 ${offset}-${state.next} 条  ${list.length} 项`)

		if (state.next >= j.count) {
			state.done = true
			console.log('  已到末页，归档完成')
			break
		}
	}

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

	console.log(
		`\n本轮归档 ${pulled} 条，累计 ${state.next}/${state.total}（${((state.next / (state.total || 1)) * 100).toFixed(1)}%）${state.done ? ' ✓ 已全部完成' : ''}\n`
	)
})().catch((e) => {
	console.error('未捕获异常:', e)
	process.exit(1)
})
