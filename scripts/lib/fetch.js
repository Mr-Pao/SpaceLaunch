'use strict'

/**
 * LL2 API 请求封装
 *
 * 关键约束（实测得出，勿随意修改）：
 * - 必须用 mode=normal，mode=detailed 实测 72 秒超时，mode=list 又缺 rocket/pad/mission 字段
 * - mode=normal & limit=50 实测耗时 27–120 秒（随网络波动很大），超时不能小于 120 秒
 * - 未认证限额 15 次/小时，且是**按 IP** 计。本地调试和 CI 各算各的
 * - 本地反复调试很容易把配额烧光，调试请用 --base=dev
 */

const https = require('https')

// 正式端点：受限 15 次/小时（未认证）
const PROD_BASE = 'https://ll.thespacedevs.com/2.3.0'
// 开发端点：官方文档说明不受速率限制，代价是"数据陈旧且有限"
// 只能用于本地联调，不要用于生产快照
const DEV_BASE = 'https://lldev.thespacedevs.com/2.3.0'

const TIMEOUT_MS = 120000
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'
const TOKEN = process.env.LL2_TOKEN || ''

// 每次请求时现算，这样 --base=dev 能在进程内切换而不必重新加载模块
function base() {
	return process.env.LL2_BASE === 'dev' ? DEV_BASE : PROD_BASE
}

function request(url) {
	return new Promise((resolve, reject) => {
		const headers = {
			'User-Agent': UA,
			'Accept': 'application/json'
		}
		// LL2 免费 token 可提升限额，配了就用
		if (TOKEN) headers['Authorization'] = `Token ${TOKEN}`

		const req = https.get(url, { headers, timeout: TIMEOUT_MS }, (res) => {
			const chunks = []
			res.on('data', (c) => chunks.push(c))
			res.on('end', () => {
				const body = Buffer.concat(chunks).toString('utf8')
				if (res.statusCode === 429) {
					return reject(new Error(`HTTP 429 超出配额: ${body.slice(0, 200)}`))
				}
				if (res.statusCode !== 200) {
					return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
				}
				try {
					resolve(JSON.parse(body))
				} catch (e) {
					reject(new Error('JSON 解析失败: ' + e.message))
				}
			})
		})

		req.on('timeout', () => req.destroy(new Error(`请求超时 ${TIMEOUT_MS}ms`)))
		req.on('error', reject)
	})
}

async function getJson(pathOrUrl, { retries = 1 } = {}) {
	const b = base()
	const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : b + pathOrUrl
	let lastErr

	for (let i = 0; i <= retries; i++) {
		const started = Date.now()
		try {
			const json = await request(url)
			const cost = Date.now() - started
			console.log(`  ✓ ${url.replace(b, '')} → ${json.count ?? '-'} 条 / ${cost}ms`)
			return json
		} catch (e) {
			lastErr = e
			console.warn(`  ! 第 ${i + 1} 次失败: ${e.message}`)
			// 429 不要重试，重试只会继续消耗并且仍然失败，等下一轮定时任务
			if (e.message.includes('429')) break
			if (i < retries) await new Promise((r) => setTimeout(r, 3000))
		}
	}

	throw lastErr
}

module.exports = { getJson, base, PROD_BASE, DEV_BASE }
