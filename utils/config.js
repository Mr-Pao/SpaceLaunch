/**
 * 远程展示开关（审核模式）
 *
 * COS 上放一份 app-config.json：{ "review": false }
 * - 提审前把 review 改成 true，小程序自动切「工具态」：
 *   隐藏活动 tab 与活动列表、收起详情页长文、列表卡片去大图
 * - 过审后改回 false，已打开的用户最迟 5 分钟恢复完整展示
 *
 * 设计约束：
 * - 请求失败一律按 review:false 兜底，绝不影响正常使用
 * - 审核环境是全新安装（无本地缓存），首次打开必然拉一次远程，
 *   所以开关在审核场景一定生效
 * - COS 直连域名无 CDN 缓存层，控制台改完即生效
 * - 域名与数据层相同（已在小程序后台 request 合法域名里），无需额外配置
 */
const CONFIG_URL =
	'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data/app-config.json'
const KEY = 'appReviewConfig'
const TTL = 5 * 60 * 1000

/**
 * 审核态只在正式版（release）生效。
 * 审核员跑的提审包、线上用户拿到的包都是 release；
 * 开发版（HBuilderX 运行/预览/开发者工具）与体验版一律完整态——
 * COS 上停着 review:true 也不影响本机开发与自测。
 * 基础库不支持该 API 时按非 release 处理（宁可审核态失效，不卡开发）。
 */
function isReleaseBuild() {
	// #ifdef MP-WEIXIN
	try {
		return wx.getAccountInfoSync().miniProgram.envVersion === 'release'
	} catch (e) {
		// API 不存在或取不到：当非 release 处理
	}
	// #endif
	return false
}

// 会话内存缓存：tabBar、首页、详情页多处调用共享一次请求
let mem = null
let inflight = null

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
 */
function readOverride() {
	try {
		const o = uni.getStorageSync(OVERRIDE_KEY)
		if (o && typeof o.review === 'boolean') return o
	} catch (e) {
		// 没有覆盖
	}
	return null
}

function setOverride(review) {
	try {
		if (review === null) {
			uni.removeStorageSync(OVERRIDE_KEY)
		} else {
			uni.setStorageSync(OVERRIDE_KEY, { review: Boolean(review) })
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
 * 取展示开关，永远 resolve 一个对象（任何失败都兜底 review:false）。
 * 优先级：本机覆盖 > 非正式版完整态 > 内存缓存 > 本地缓存 > 远程。
 */
export function getConfig() {
	const ov = readOverride()
	if (ov) return Promise.resolve(ov)

	// 审核态只在正式版生效：开发版/体验版永远完整态，不读 COS
	if (!isReleaseBuild()) return Promise.resolve({ review: false })

	if (mem && Date.now() - mem.ts < TTL) return Promise.resolve(mem.data)
	if (inflight) return inflight

	inflight = (async () => {
		const local = readLocal()
		if (local) {
			mem = { data: local, ts: Date.now() }
			inflight = null
			return local
		}

		const remote = await fetchOnce()
		const data = remote || { review: false }
		mem = { data, ts: Date.now() }
		// 远程拉取成功才落缓存；失败结果不缓存，下次进页面再试
		if (remote) writeLocal(data)
		inflight = null
		return data
	})()

	return inflight
}

// 开发者面板（版本页暗门）用：覆盖与刷新不进常规 import 面
export { setOverride, refreshRemote }
