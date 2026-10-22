'use strict'

/**
 * 只上传 dist/ 里已有的 JSON 到 COS，不请求 LL2 API、不消耗任何配额。
 *
 * 用途：
 *   1. 桶刚建好时，把本地已跑好的快照先推上去，小程序立刻能连
 *   2. 抓取端（GitHub Actions）挂了，但本地还有数据时应急补传
 *
 * 用法（在 scripts/ 目录）：
 *   npm install
 *   COS_SECRET_ID=xxx COS_SECRET_KEY=xxx node upload.js
 *
 * 桶名与地域已写死为项目的实际值，可用环境变量覆盖。
 */

const fs = require('fs')
const path = require('path')
const { upload } = require('./lib/cos')

const BUCKET = process.env.COS_BUCKET || 'spacelaunch-1258113633'
const REGION = process.env.COS_REGION || 'ap-chengdu'

// 与 sync.js 里的 cacheControl 保持一致
const FILES = {
	'launches-upcoming.json': 'public, max-age=300',
	'launches-previous.json': 'public, max-age=3600',
	'events.json': 'public, max-age=300',
	'agencies.json': 'public, max-age=3600'
}

;(async () => {
	if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
		console.error('缺少 COS_SECRET_ID / COS_SECRET_KEY 环境变量，无法上传')
		process.exit(2)
	}

	// 这两个变量在 lib/cos.js 里读取，这里补进去
	process.env.COS_BUCKET = BUCKET
	process.env.COS_REGION = REGION

	const distDir = path.join(__dirname, '..', 'dist')
	if (!fs.existsSync(distDir)) {
		console.error(`找不到 ${distDir}，先跑一次 sync.js`)
		process.exit(2)
	}

	console.log(`上传到 ${BUCKET}.cos.${REGION}.myqcloud.com/space-data/\n`)

	let ok = 0
	for (const [file, cacheControl] of Object.entries(FILES)) {
		const local = path.join(distDir, file)
		if (!fs.existsSync(local)) {
			console.log(`  · 跳过（本地没有）${file}`)
			continue
		}

		const size = (fs.statSync(local).size / 1024).toFixed(1)
		try {
			await upload(local, `space-data/${file}`, cacheControl)
			console.log(`    ${size} KB`)
			ok++
		} catch (e) {
			console.error(`  ✗ ${file} 上传失败: ${e.message}`)
		}
	}

	console.log(`\n完成 ${ok}/${Object.keys(FILES).length}`)
	if (ok) {
		console.log(`验证地址：https://${BUCKET}.cos.${REGION}.myqcloud.com/space-data/launches-upcoming.json`)
		console.log('若返回 AccessDenied，说明桶还没改成公有读。')
	}
})().catch((e) => {
	console.error('上传异常:', e.message)
	process.exit(1)
})
