'use strict'

/**
 * 历史分片的翻译回填
 *
 * 归档任务（archive.js）为了赶进度不翻译，所以老数据的任务名和描述是英文。
 * 这个任务专门把译文补回去 —— **不请求 LL2，只读 COS + 调翻译接口，
 * 完全不占 15 次/小时的额度**，可以和归档同时跑。
 *
 * 译文的永久缓存照旧存在 COS 的 translation-cache.json，
 * 同一句只翻一次，所以整体成本只有第一次的那一遍。
 *
 * 用法：
 *   node backfill.js               # 默认每轮处理 2 片
 *   node backfill.js --pages=1     # 只处理 1 片
 */

const path = require('path')
const fs = require('fs')
const { upload } = require('./lib/cos')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
const PREFIX = 'space-data/history'
// 每片 100 条 × 2 个字段 ≈ 200 次翻译，2 片约 5 分钟
const PAGES_PER_RUN = 2

function cdnBase() {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) throw new Error('缺少 COS_BUCKET / COS_REGION')
	return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${PREFIX}`
}

async function fetchJson(url) {
	const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
	if (!res.ok) throw new Error('HTTP ' + res.status)
	return res.json()
}

async function putJson(obj, key) {
	const file = path.join(OUT_DIR, key.replace(/\//g, '_'))
	fs.mkdirSync(OUT_DIR, { recursive: true })
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
	const base = cdnBase()

	await translate.loadCache()

	let index
	try {
		index = await fetchJson(`${base}/index.json`)
	} catch (e) {
		console.log('还没有归档索引，本轮跳过')
		return
	}

	const pageList = index.pages || []
	if (!pageList.length) {
		console.log('归档还没有任何分片，本轮跳过')
		return
	}

	// 回填进度单独记，和归档的 state.json 分开，互不影响
	let state = { cursor: 0, done: false, pages: 0 }
	try {
		state = await fetchJson(`${base}/backfill.json`)
	} catch (e) {
		// 首次运行
	}

	if (state.cursor >= pageList.length) {
		console.log(`回填已完成（${pageList.length} 片全部处理过），本轮跳过`)
		return
	}

	console.log(`\n=== 翻译回填 ===\n  分片 ${pageList.length} 个，从第 ${state.cursor} 个开始`)

	let touched = 0

	for (let i = 0; i < maxPages; i++) {
		if (state.cursor >= pageList.length) break

		const page = pageList[state.cursor]

		let data
		try {
			data = await fetchJson(`${base}/${page.file}`)
		} catch (e) {
			console.warn(`  ! 读取 ${page.file} 失败（${e.message}），本轮停下`)
			break
		}

		const list = data.list || []

		// 先把这一片缺译文的文本收齐，一次性丢给翻译管线（内部有去重与永久缓存）
		const needName = []
		const needDesc = []
		for (const x of list) {
			const m = x.mission || {}
			if (m.name && !m.nameZh) needName.push(m.name)
			if (m.description && !m.descriptionZh) needDesc.push(m.description)
		}

		if (!needName.length && !needDesc.length) {
			console.log(`  ${page.file} 已有译文，跳过`)
			state.cursor++
			continue
		}

		await translate.translateTexts(needName.concat(needDesc))

		let filled = 0
		for (const x of list) {
			const m = x.mission || {}
			if (m.name && !m.nameZh) {
				const zh = translate.getZh(m.name)
				if (zh) {
					m.nameZh = zh
					filled++
				}
			}
			if (m.description && !m.descriptionZh) {
				const zh = translate.getZh(m.description)
				if (zh) {
					m.descriptionZh = zh
					filled++
				}
			}
		}

		// 原样写回同一片。归档只会向新增片推进，不会重写已完成的片，所以安全
		await putJson(data, `${PREFIX}/${page.file}`)

		state.cursor++
		state.pages++
		touched += filled
		console.log(`  ${page.file} 回填 ${filled} 处译文`)
	}

	state.done = state.cursor >= pageList.length
	await putJson(state, `${PREFIX}/backfill.json`)

	const t = translate.summary()
	console.log(
		`\n  本轮回填 ${touched} 处 | 新翻成功 ${t.ok} / 失败 ${t.fail} / 缓存池 ${t.cached} 条` +
			(t.quotaExhausted ? '  ⚠️ 翻译接口限流，剩余下轮再补' : '') +
			`\n  进度 ${state.cursor}/${pageList.length} 片${state.done ? ' ✓ 全部完成' : ''}\n`
	)

	// 译文缓存必须回传，否则下一轮 CI 容器里零命中，等于白翻
	if (t.dirty) {
		const cachePath = translate.saveCache()
		try {
			await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
		} catch (e) {
			console.warn('  ! 翻译缓存上传失败（不影响已写入的分片）: ' + e.message)
		}
	}
})().catch((e) => {
	console.error('未捕获异常:', e)
	process.exit(1)
})
