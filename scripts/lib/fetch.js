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
				// 非 200 / 429 / JSON 解析失败时，先消费完响应体再 reject，
				// 否则连接可能被挂起泄漏（P2-18）。body 已通过 'data' 收完，resume 是兜底保险
				const fail = (msg) => {
					try { res.resume() } catch (_) {}
					reject(new Error(msg))
				}
				if (res.statusCode === 429) {
					return fail(`HTTP 429 超出配额: ${body.slice(0, 200)}`)
				}
				if (res.statusCode !== 200) {
					return fail(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`)
				}
				try {
					resolve(JSON.parse(body))
				} catch (e) {
					fail('JSON 解析失败: ' + e.message)
				}
			})
		})

		req.on('timeout', () => req.destroy(new Error(`请求超时 ${TIMEOUT_MS}ms`)))
		req.on('error', reject)
	})
}

/**
 * 抓取一个 JSON（带指数退避重试）
 *
 * @param {string} pathOrUrl 站内路径（自动拼 base）或完整 URL
 * @param {object} [opts]
 * @param {number}  [opts.retries=2]      失败后的重试次数（含 429）
 * @param {number}  [opts.backoffMs=30000] 退避基数，第 i 次重试等待 backoffMs * 2^i（30s→60s）
 * @param {boolean} [opts.retryOn429=true]
 *   429 默认重试（P2-14）：匿名限额 15 次/小时按 IP，多个数据集同小时 cron 漂移极易超配额，
 *   单点 429 直接判失败会让整数据集当轮报废；指数退避等待常能跨过配额窗口救回。
 *   不无限重试（避免 GitHub Actions 超时），retries 即上限；调用方仍可显式传 false 关掉。
 */
async function getJson(pathOrUrl, { retries = 2, backoffMs = 30000, retryOn429 = true } = {}) {
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
			const is429 = e.message.includes('429')
			// 显式关闭 429 重试时（如 dockings 之外需要快速失败的场景），直接放弃本轮
			if (is429 && !retryOn429) {
				console.warn(`  ! 第 ${i + 1} 次失败（429，且未开启重试）: ${e.message}`)
				break
			}
			console.warn(`  ! 第 ${i + 1} 次失败: ${e.message}`)
			// 指数退避：第 1 次重试等 backoffMs，第 2 次等 2*backoffMs（30s→60s）
			if (i < retries) {
				const wait = backoffMs * Math.pow(2, i)
				console.warn(`  · ${is429 ? '429 配额，' : ''}退避 ${wait}ms 后重试（第 ${i + 1}/${retries} 次）`)
				await new Promise((r) => setTimeout(r, wait))
			}
		}
	}

	throw lastErr
}

module.exports = { getJson, base, PROD_BASE, DEV_BASE }
