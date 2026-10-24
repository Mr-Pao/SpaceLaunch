'use strict'

/**
 * 展示开关（审核模式）判定断言
 *
 * utils/config.js 的判定依赖 wx / uni 两个全局，这里用桩函数模拟运行环境，
 * 每次以不同 query 重新 import 模块，绕过模块内的内存缓存。
 *
 * 用法（在项目根目录）：
 *   node scripts/verify-config.js
 *
 * 覆盖的关键场景：
 *   - 白名单命中/未命中
 *   - 正式版拿不到版本号（审核环境）
 *   - 旧布尔开关兼容
 *   - 开发版/体验版永远完整态
 */

const path = require('path')
const { pathToFileURL } = require('url')

const CONFIG_URL = pathToFileURL(path.join(__dirname, '..', 'utils', 'config.js')).href

function stub(envVersion, version, remote) {
	globalThis.wx = {
		getAccountInfoSync: () => ({ miniProgram: { envVersion, version } })
	}
	globalThis.uni = {
		getStorageSync: () => '',
		setStorageSync: () => {},
		removeStorageSync: () => {},
		request: (o) => o.success({ statusCode: 200, data: remote })
	}
}

let seq = 0
async function decide(envVersion, version, remote) {
	stub(envVersion, version, remote)
	const mod = await import(CONFIG_URL + '?t=' + ++seq)
	const cfg = await mod.getConfig()
	return cfg.review
}

const CASES = [
	['正式版在白名单', 'release', '3.0.10', { review: false, reviewVersions: ['3.0.10'] }, true],
	['正式版不在白名单', 'release', '3.0.9', { reviewVersions: ['3.0.10'] }, false],
	['正式版无版本号（审核环境）', 'release', '', { reviewVersions: ['3.0.10'] }, true],
	['白名单为空 → 完整态', 'release', '3.0.10', { reviewVersions: [] }, false],
	['兼容旧格式 review:true', 'release', '3.0.9', { review: true }, true],
	['兼容旧格式 review:false', 'release', '3.0.9', { review: false }, false],
	['多版本白名单命中', 'release', '3.0.10', { reviewVersions: ['3.0.9', '3.0.10'] }, true],
	['体验版永远完整态', 'trial', '3.0.10', { reviewVersions: ['3.0.10'] }, false],
	['开发版永远完整态', 'develop', '3.0.10', { reviewVersions: ['3.0.10'] }, false]
]

;(async () => {
	let ok = 0
	for (const [name, env, v, cfg, want] of CASES) {
		let got
		try {
			got = await decide(env, v, cfg)
		} catch (e) {
			console.log(`✗ ${name}  抛错: ${e.message}`)
			continue
		}
		const pass = got === want
		if (pass) ok++
		console.log(`${pass ? '✓' : '✗'} ${name}  review=${got}（期望 ${want}）`)
	}
	console.log(`\n${ok}/${CASES.length} 通过`)
	process.exit(ok === CASES.length ? 0 : 1)
})()
