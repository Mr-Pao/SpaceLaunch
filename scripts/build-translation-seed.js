'use strict'

/**
 * 一次性生成翻译种子缓存
 *
 * 目的：让首次上线就是中文，不必等 CI 在后续几轮里慢慢补齐。
 * 产出的 scripts/data/translation-cache.json 会提交到 git，
 * sync.js 启动时优先读它，命中不了才走网络翻译。
 *
 * 用法：node build-translation-seed.js
 *       TRANSLATE_EMAIL=you@example.com node build-translation-seed.js
 */

const fs = require('fs')
const path = require('path')
const translate = require('./lib/translate')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const OUT_DIR = path.join(__dirname, 'data')
const OUT = path.join(OUT_DIR, 'translation-cache.json')

const SOURCES = [
	{ file: 'launches-upcoming.json', read: (x) => x.mission && x.mission.description },
	{ file: 'launches-previous.json', read: (x) => x.mission && x.mission.description },
	{ file: 'events.json', read: (x) => x.description }
]

;(async () => {
	const texts = []

	for (const s of SOURCES) {
		const p = path.join(DIST, s.file)
		if (!fs.existsSync(p)) {
			console.log(`跳过（不存在）${s.file}`)
			continue
		}
		const d = JSON.parse(fs.readFileSync(p, 'utf8'))
		const list = (d.list || []).map(s.read).filter((t) => t && t.trim())
		console.log(`${s.file}: ${list.length} 条描述`)
		texts.push(...list)
	}

	const uniq = [...new Set(texts)]
	console.log(`\n去重后 ${uniq.length} 条，开始翻译…\n`)

	await translate.translateTexts(uniq)

	const stats = translate.summary()
	console.log('\n统计:', stats)

	fs.mkdirSync(OUT_DIR, { recursive: true })
	fs.writeFileSync(OUT, JSON.stringify(translate.dumpCache()), 'utf8')

	const kb = (fs.statSync(OUT).size / 1024).toFixed(1)
	console.log(`已写入 ${OUT}（${kb} KB）`)

	if (stats.fail > 0) {
		console.log(`\n有 ${stats.fail} 条失败，重跑本脚本即可续翻（已成功的会命中缓存）`)
	}
})()
