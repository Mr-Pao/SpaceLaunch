'use strict'

/**
 * 只上传现成的 JSON 到 COS，不请求 LL2 API、不消耗任何配额。
 *
 * 用途：
 *   1. 桶刚建好时，把本地已跑好的快照先推上去，小程序立刻能连
 *   2. 抓取端（GitHub Actions）挂了，但本地还有数据时应急补传
 *   3. 单独更新 app-config.json（展示开关）—— 手机改仓库文件即可，见 config.yml
 *
 * 用法（在 scripts/ 目录）：
 *   npm install
 *   COS_SECRET_ID=xxx COS_SECRET_KEY=xxx node upload.js
 *   COS_SECRET_ID=xxx COS_SECRET_KEY=xxx node upload.js --only=app-config.json
 *
 * 桶名与地域已写死为项目的实际值，可用环境变量覆盖。
 */

const fs = require('fs')
const path = require('path')
const { upload } = require('./lib/cos')

const BUCKET = process.env.COS_BUCKET || 'spacelaunch-1258113633'
const REGION = process.env.COS_REGION || 'ap-chengdu'

// 与 sync.js 里的 cacheControl 保持一致
// fromScripts: 源文件在 scripts/ 下（不进 dist），用于仓库里手改的小配置
const FILES = {
	'launches-upcoming.json': { cache: 'public, max-age=300' },
	'launches-previous.json': { cache: 'public, max-age=3600' },
	'events.json': { cache: 'public, max-age=300' },
	'agencies.json': { cache: 'public, max-age=3600' },
	// 展示开关：手机/网页上改仓库里这份，config.yml 会自动推上来
	'app-config.json': { cache: 'public, max-age=60', fromScripts: true }
}

// --only=文件名：只传这一个（用于只改开关时避免碰数据文件）
const onlyArg = process.argv.find((a) => a.indexOf('--only=') === 0)
const ONLY = onlyArg ? onlyArg.slice('--only='.length) : ''

;(async () => {
	if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
		console.error('缺少 COS_SECRET_ID / COS_SECRET_KEY 环境变量，无法上传')
		process.exit(2)
	}

	// 这两个变量在 lib/cos.js 里读取，这里补进去
	process.env.COS_BUCKET = BUCKET
	process.env.COS_REGION = REGION

	const distDir = path.join(__dirname, '..', 'dist')
	const targets = Object.entries(FILES).filter(([f]) => !ONLY || f === ONLY)
	if (!targets.length) {
		console.error(`--only=${ONLY} 没有对应的文件，可选：${Object.keys(FILES).join(', ')}`)
		process.exit(2)
	}

	// 只有确实需要 dist 里的文件时才要求 dist 存在（只传开关时无需跑过 sync）
	const needDist = targets.some(([, opt]) => !opt.fromScripts)
	if (needDist && !fs.existsSync(distDir)) {
		console.error(`找不到 ${distDir}，先跑一次 sync.js`)
		process.exit(2)
	}

	console.log(`上传到 ${BUCKET}.cos.${REGION}.myqcloud.com/space-data/\n`)

	let ok = 0
	for (const [file, opt] of targets) {
		const local = opt.fromScripts ? path.join(__dirname, file) : path.join(distDir, file)
		if (!fs.existsSync(local)) {
			console.log(`  · 跳过（本地没有）${file}`)
			continue
		}

		const size = (fs.statSync(local).size / 1024).toFixed(1)
		try {
			await upload(local, `space-data/${file}`, opt.cache)
			console.log(`  ✓ ${file}  ${size} KB`)
			ok++
		} catch (e) {
			console.error(`  ✗ ${file} 上传失败: ${e.message}`)
		}
	}

	console.log(`\n完成 ${ok}/${targets.length}`)
	if (ok) {
		console.log(`验证地址：https://${BUCKET}.cos.${REGION}.myqcloud.com/space-data/${targets[0][0]}`)
		console.log('若返回 AccessDenied，说明桶还没改成公有读；NoSuchKey 说明对象没写进去。')
	}
})().catch((e) => {
	console.error('上传异常:', e.message)
	process.exit(1)
})
