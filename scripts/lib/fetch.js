'use strict'

/**
 * LL2 API 请求封装
 *
 * 关键约束（实测得出，勿随意修改）：
 * - 必须用 mode=normal，mode=detailed 实测 72 秒超时，mode=list 又缺 rocket/pad/mission 字段
 * - mode=normal & limit=50 实测耗时约 28 秒，所以超时不能小于 120 秒
 * - 未认证限额 15 次/小时，重试次数必须保守
 */

const https = require('https')

const BASE = 'https://ll.thespacedevs.com/2.3.0'
const TIMEOUT_MS = 120000
const UA = 'SpaceLaunch/1.1 (+https://github.com/Mr-Pao/SpaceLaunch)'
const TOKEN = process.env.LL2_TOKEN || ''

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
	const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : BASE + pathOrUrl
	let lastErr

	for (let i = 0; i <= retries; i++) {
		const started = Date.now()
		try {
			const json = await request(url)
			const cost = Date.now() - started
			console.log(`  ✓ ${url.replace(BASE, '')} → ${json.count ?? '-'} 条 / ${cost}ms`)
			return json
		} catch (e) {
			lastErr = e
			console.warn(`  ! 第 ${i + 1} 次失败: ${e.message}`)
			// 429 不要重试，等下一轮定时任务
			if (e.message.includes('429')) break
			if (i < retries) await new Promise((r) => setTimeout(r, 3000))
		}
	}

	throw lastErr
}

module.exports = { getJson, BASE }
