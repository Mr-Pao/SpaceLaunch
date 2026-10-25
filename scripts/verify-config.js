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
 *   - 审核员 develop 环境（version 恒为空）→ 工具态
 *   - 旧布尔开关兼容
 *   - 仅开发者工具放行；trial/develop 真机白名单非空即工具态
 */

const path = require('path')
const { pathToFileURL } = require('url')

const CONFIG_URL = pathToFileURL(path.join(__dirname, '..', 'utils', 'config.js')).href

function stub(envVersion, version, remote, override) {
	globalThis.wx = {
		// envVersion 传 'legacy' 模拟基础库 < 2.2.2：getAccountInfoSync 直接不存在
		getAccountInfoSync:
			envVersion === 'legacy'
				? () => {
						throw new Error('not supported')
					}
				: () => ({ miniProgram: { envVersion, version } })
	}
	globalThis.uni = {
		// 暗门覆盖存在 storage 的这个键下（config.js 的 OVERRIDE_KEY）
		getStorageSync: (k) =>
			override && k === 'appReviewConfigOverride' ? override : '',
		setStorageSync: () => {},
		removeStorageSync: () => {},
		request: (o) => o.success({ statusCode: 200, data: remote })
	}
}

let seq = 0
async function decide(envVersion, version, remote, override) {
	stub(envVersion, version, remote, override)
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
	['开发者工具永远完整态', 'devtools', '', { reviewVersions: ['3.0.10'] }, false],
	// 实测：审核员是 develop 环境、version 为空（微信官方社区确认），
	// trial 体验版同样没有 version —— 白名单非空时都进工具态
	['体验版(trial)白名单非空 → 工具态', 'trial', '', { reviewVersions: ['3.0.10'] }, true],
	['审核员(develop)白名单非空 → 工具态', 'develop', '', { reviewVersions: ['3.0.10'] }, true],
	// 基础库 < 2.2.2 没有 getAccountInfoSync：这类极老用户按完整态放行，
	// 不误伤（审核员设备基础库必然是新的）
	['老基础库(API不存在) → 完整态', 'legacy', '', { reviewVersions: ['3.0.10'] }, false],

	// 暗门：模拟版本号（开发版也能看审核员视角）
	['模拟 3.1.0 命中白名单（开发版）', 'develop', '', { reviewVersions: ['3.1.0'] }, true, { version: '3.1.0' }],
	['模拟 3.0.9 未命中（开发版）', 'develop', '', { reviewVersions: ['3.1.0'] }, false, { version: '3.0.9' }],
	['模拟版本号覆盖真实版本号（正式版）', 'release', '3.1.0', { reviewVersions: ['3.1.0'] }, false, { version: '3.0.9' }],
	['模拟版本号遇空白名单 → 完整态', 'develop', '', { reviewVersions: [] }, false, { version: '3.1.0' }],
	// 暗门：强制布尔（旧用法仍要能用）
	['强制工具态优先于空白名单', 'develop', '', { reviewVersions: [] }, true, { review: true }],
	['强制完整态优先于命中白名单', 'release', '3.1.0', { reviewVersions: ['3.1.0'] }, false, { review: false }]
]

/**
 * 与 custom-tab-bar 的判定对拍
 *
 * custom-tab-bar 是原生组件（uni-app 直接拷贝目录、不打包），
 * 没法 import utils/config.js，只能自带一份同规则实现。
 * 这里把那份实现的源码抠出来跑同一组用例，两边结果必须逐条相等 ——
 * 否则「审核员看不到 tabBar、普通用户看得到」这条就会分叉。
 */
function loadBarRule() {
	const file = path.join(__dirname, '..', 'custom-tab-bar', 'index.js')
	const src = require('fs').readFileSync(file, 'utf8')

	const pick = (name) => {
		const start = src.indexOf('function ' + name + '(')
		if (start === -1) throw new Error('custom-tab-bar 里找不到 ' + name)
		let depth = 0
		let opened = false
		for (let i = start; i < src.length; i++) {
			const ch = src[i]
			if (ch === '{') {
				depth++
				opened = true
			} else if (ch === '}') {
				depth--
				if (opened && depth === 0) return src.slice(start, i + 1)
			}
		}
		throw new Error(name + ' 未闭合')
	}

	// eslint-disable-next-line no-new-func
	return new Function(
		pick('matchVersionList') +
			'\n' +
			pick('resolveReview') +
			'\nreturn { matchVersionList: matchVersionList, resolveReview: resolveReview }'
	)()
}

;(async () => {
	const bar = loadBarRule()

	let ok = 0
	for (const [name, env, v, cfg, want, ov] of CASES) {
		let got, gotBar
		try {
			got = await decide(env, v, cfg, ov)
			// decide() 已经设过 wx 桩，这里直接复用
			gotBar = bar.resolveReview(cfg, ov || null)
		} catch (e) {
			console.log(`✗ ${name}  抛错: ${e.message}`)
			continue
		}
		const pass = got === want && gotBar === got
		if (pass) ok++
		const note = gotBar === got ? '' : `  ⚠ tabBar 判成 ${gotBar}，与页面端不一致`
		console.log(`${pass ? '✓' : '✗'} ${name}  review=${got}（期望 ${want}）${note}`)
	}
	console.log(`\n${ok}/${CASES.length} 通过（含 custom-tab-bar 一致性对拍）`)
	process.exit(ok === CASES.length ? 0 : 1)
})()
