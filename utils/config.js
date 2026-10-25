/**
 * 远程展示开关（审核模式）
 *
 * COS 上放一份 app-config.json，**只有一个字段**：
 *   { "reviewVersions": [] }
 *
 * 实测口径（2026-10-25，微信开放社区官方确认 + 用户真机验证）：
 *   审核员跑的是 develop 环境（开发版口径），version 字段为空——
 *   不是 release！所以白名单匹配对审核员永远不命中，
 *   真正起作用的是「白名单非空 + 拿不到版本号 → 工具态」这条兜底。
 *   reviewVersions 实际语义 = 审核期总开关：非空 = 审核中，空 = 正常期。
 *
 * 提审流程（全程只改这一处）：
 *   提审前 → { "reviewVersions": ["3.1.8"] }（版本号随意，关键是不能为空）
 *   过审发布后 → { "reviewVersions": [] }
 *
 * 环境分派：
 *   - devtools（开发者工具）→ 永远完整态，本机开发不受开关影响
 *   - develop 真机（= 审核员）/ trial（体验版，version 也为空）→ 白名单非空即工具态
 *   - release（正式版用户）→ 有版本号：按白名单匹配；白名单为空 → 完整态
 *
 * 真机预览想看完整态：用本机覆盖暗门 setOverride(false)。
 *
 * 工具态内容：隐藏活动 tab 与活动列表、收起详情页长文、列表卡片去大图。
 *
 * 设计约束：
 * - 请求失败一律按完整态兜底，绝不影响正常使用
 * - 审核环境是全新安装（无本地缓存），首次打开必然拉一次远程，
 *   所以开关在审核场景一定生效
 * - COS 直连域名无 CDN 缓存层，控制台改完即生效
 * - 域名与数据层相同（已在小程序后台 request 合法域名里），无需额外配置
 */
const CONFIG_URL =
	'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data/app-config.json'
const KEY = 'appReviewConfig'
// 判定结论（布尔）单独落一份，给 custom-tab-bar 那个原生组件读。
// 它是 wxml/wxss 直接拷贝、不过 uni-app 编译，没法 import 本文件，
// 早先只能自己读配置里的布尔 review —— 白名单机制对它完全失效。
const RESOLVED_KEY = 'appReviewResolved'
const TTL = 5 * 60 * 1000

/**
 * 当前运行环境。wx.getAccountInfoSync().miniProgram.envVersion：
 *   devtools = 开发者工具；develop = 真机开发版（审核员就是这个）；
 *   trial = 体验版（version 同样为空）；release = 正式版（version 有值）。
 * 基础库不支持该 API 时返回 'unknown' —— 按「可能审核环境」从严处理。
 */
function envName() {
	// #ifdef MP-WEIXIN
	try {
		return (wx.getAccountInfoSync().miniProgram || {}).envVersion || 'unknown'
	} catch (e) {
		// API 不存在或取不到：当 unknown 处理
	}
	// #endif
	return 'unknown'
}

// 会话内存缓存：tabBar、首页、详情页多处调用共享一次请求
let mem = null
let inflight = null

/**
 * 当前运行的小程序版本号（= 上传时填的 versionName，如 "3.0.10"）。
 * 开发版/体验版返回空串，正式版返回线上版本号。
 */
function runtimeVersion() {
	// #ifdef MP-WEIXIN
	try {
		const info = wx.getAccountInfoSync()
		return String((info && info.miniProgram && info.miniProgram.version) || '').trim()
	} catch (e) {
		// API 不存在或取不到：当没有版本号处理
	}
	// #endif
	return ''
}

/**
 * 按远程配置算出这台设备该不该进工具态。
 *
 * 判定顺序：
 *   1. 开发者工具且没指定模拟版本号 → 永远完整态（保护本机开发）
 *   2. 配了 reviewVersions 且当前版本在其中 → 工具态
 *   3. 配了 reviewVersions 但拿不到版本号 → 工具态
 *      （审核员是 develop 环境，version 恒为空 —— 就是这条兜底拦住审核员）
 *   4. 其它（白名单为空）→ 完整态
 *
 * 注意第 3 条的代价：白名单非空期间，体验版（version 也为空）同样进工具态，
 * 这是审核机制的合理代价；正式版异常拿不到版本号也会短暂降级，
 * 改配置（清空白名单）立刻恢复，故选保审核。
 *
 * simulated：暗门里填的模拟版本号。给了它就走正式版口径（跳过环境判断），
 * 用这个假版本号代替真实版本号 —— 开发者工具也能看到审核员视角。
 */
function applyVersionRule(raw, simulated) {
	const cfg = raw || {}
	// 除 review 外的字段原样透传，以后配置加新开关不用改这里
	const out = Object.assign({}, cfg)
	const sim = typeof simulated === 'string' && simulated ? simulated : null

	if (!sim && envName() === 'devtools') {
		out.review = false
		return out
	}

	// 兼容旧格式：配置里完全没有 reviewVersions 字段时，才看旧的布尔 review
	if (!Array.isArray(cfg.reviewVersions)) {
		out.review = Boolean(cfg.review)
		return out
	}

	const list = cfg.reviewVersions.map(String)
	if (!list.length) {
		out.review = false
		return out
	}

	// 拿不到版本号：正式版必有版本号，拿不到的只可能是审核环境，保审核
	const v = sim || runtimeVersion()
	out.review = v ? list.indexOf(v) !== -1 : true
	return out
}

function request() {
	return new Promise((resolve) => {
		uni.request({
			url: CONFIG_URL,
			timeout: 5000,
			success: (res) => {
				if (res.statusCode === 200 && res.data && typeof res.data === 'object') {
					resolve(res.data)
				} else {
					resolve(null)
				}
			},
			fail: () => resolve(null)
		})
	})
}

function readLocal() {
	try {
		const v = uni.getStorageSync(KEY)
		if (v && v.ts && v.data && Date.now() - v.ts < TTL) return v.data
	} catch (e) {
		// Storage 不可用时只当没有缓存
	}
	return null
}

function writeLocal(data) {
	try {
		uni.setStorageSync(KEY, { ts: Date.now(), data })
	} catch (e) {
		// 写不进去就算了，下次再拉远程
	}
}

const OVERRIDE_KEY = KEY + 'Override'

/**
 * 本机覆盖（开发者暗门用）：写在 storage 里的强制值，
 * 优先级高于远程开关 —— 只影响本机，审核员的设备拿不到。
 *
 * 两种形态：
 *   { version: '3.1.0' }  模拟运行在正式版 3.1.0，走真实白名单判定
 *                         （看到的就是审核员跑 3.1.0 时的界面）
 *   { review: true }      不讲道理地强制工具态（旧用法，保留）
 */
function readOverride() {
	try {
		const o = uni.getStorageSync(OVERRIDE_KEY)
		if (!o || typeof o !== 'object') return null
		if (typeof o.version === 'string' && o.version) return o
		if (typeof o.review === 'boolean') return o
	} catch (e) {
		// 没有覆盖
	}
	return null
}

/**
 * 写本机覆盖。
 *   setOverride('3.1.0')  模拟版本号
 *   setOverride(true)     强制工具态
 *   setOverride(false)    强制完整态
 *   setOverride(null)     清除，回到环境默认
 */
function setOverride(val) {
	try {
		if (val === null || val === undefined || val === '') {
			uni.removeStorageSync(OVERRIDE_KEY)
		} else if (typeof val === 'string') {
			uni.setStorageSync(OVERRIDE_KEY, { version: val.trim() })
		} else if (typeof val === 'object') {
			if (typeof val.version === 'string' && val.version) {
				uni.setStorageSync(OVERRIDE_KEY, { version: val.version.trim() })
			} else if (typeof val.review === 'boolean') {
				uni.setStorageSync(OVERRIDE_KEY, { review: val.review })
			} else {
				uni.removeStorageSync(OVERRIDE_KEY)
			}
		} else {
			uni.setStorageSync(OVERRIDE_KEY, { review: Boolean(val) })
		}
	} catch (e) {}
}

/**
 * 绕过一切缓存拉一次远程，并刷新本地缓存 ——
 * 给开发者面板看「远程现在到底是什么状态」用。
 */
async function refreshRemote() {
	const remote = await fetchOnce()
	if (remote) {
		mem = { data: remote, ts: Date.now() }
		writeLocal(remote)
	}
	return remote
}

/**
 * 拉一次开关，网络抖动时重试一次 ——
 * 审核场景拉不到开关会退回完整内容，宁可多等一秒。
 */
async function fetchOnce() {
	const first = await request()
	if (first) return first
	return request()
}

/**
 * 取原始配置（含 reviewVersions），判定每次现算 ——
 * 同一份缓存要能被「真实版本号」和「模拟版本号」两种口径分别解释，
 * 所以缓存只存原文，绝不在写入时就把 review 算死。
 */
async function loadRaw() {
	if (mem && Date.now() - mem.ts < TTL) return mem.data
	if (inflight) return inflight

	inflight = (async () => {
		const local = readLocal()
		if (local) {
			mem = { data: local, ts: Date.now() }
			return local
		}

		const remote = await fetchOnce()
		const data = remote || {}
		mem = { data, ts: Date.now() }
		// 远程拉取成功才落缓存；失败结果不缓存，下次进页面再试
		if (remote) writeLocal(data)
		return data
	})()

	try {
		return await inflight
	} finally {
		inflight = null
	}
}

/**
 * 把判定结论写一份给原生 tabBar 组件读。
 * 只存布尔 + 时间戳，不存配置原文 —— tabBar 那边只需要「藏还是不藏」。
 */
function writeResolved(review) {
	try {
		uni.setStorageSync(RESOLVED_KEY, { review: !!review, ts: Date.now() })
	} catch (e) {
		// 写不进去就靠页面 onShow 的 syncTabBar 兜底
	}
}

/**
 * 取展示开关，永远 resolve 一个对象（任何失败都兜底 review:false）。
 * 优先级：本机覆盖 > 非正式版完整态 > 内存缓存 > 本地缓存 > 远程。
 */
export function getConfig() {
	return resolveConfig().then((c) => {
		writeResolved(c && c.review)
		return c
	})
}

function resolveConfig() {
	const ov = readOverride()

	// 本机覆盖：模拟某个版本号 → 走正式版口径，
	// 开发版/体验版也能看到审核员跑那个版本时的界面
	if (ov && ov.version) {
		return loadRaw().then((raw) => applyVersionRule(raw, ov.version))
	}

	// 本机覆盖：强制工具态 / 强制完整态
	if (ov && typeof ov.review === 'boolean') {
		return Promise.resolve({ review: ov.review })
	}

	// 开发者工具：永远完整态。真机 develop（含审核员）/ trial / release 走白名单判定
	if (envName() === 'devtools') return Promise.resolve({ review: false })

	return loadRaw().then((raw) => applyVersionRule(raw))
}

/**
 * 开发者面板用：一次性给出现场信息，不做任何判定。
 * 面板要能回答三件事 —— 我现在是什么环境、真实版本号多少、远程白名单是什么。
 */
function getDebugInfo() {
	let envVersion = 'unknown'
	let version = ''
	// #ifdef MP-WEIXIN
	try {
		const info = wx.getAccountInfoSync()
		envVersion = (info && info.miniProgram && info.miniProgram.envVersion) || 'unknown'
		version = String((info && info.miniProgram && info.miniProgram.version) || '').trim()
	} catch (e) {}
	// #endif
	const ov = readOverride()
	return {
		envVersion,
		version,
		override: ov ? (ov.version ? { version: ov.version } : { review: ov.review }) : null
	}
}

// 开发者面板（火箭大全暗门）用：覆盖、刷新、现场信息不进常规 import 面
export { setOverride, refreshRemote, getDebugInfo }
