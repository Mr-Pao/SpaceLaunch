/**
 * SpaceLaunch 数据层
 *
 * 三级回退：
 *   L1 内存缓存     —— 同一页面生命周期内二次调用 0 消耗
 *   L2 Storage 缓存 —— 冷启动立刻渲染，不用等网络
 *   L3 CDN JSON     —— 后台静默刷新，成功后通过 onUpdate 回填
 *
 * 页面用法：
 *   const d = await spaceData.load('upcoming')
 *   this.launches = d.list
 *
 *   // 想先渲染缓存再静默刷新：
 *   const d = await spaceData.load('upcoming', {
 *     onUpdate: (fresh) => { this.launches = fresh.list }
 *   })
 *   this.launches = d.list
 *
 * 详情页不要传下标，传 id：
 *   uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + launch.id })
 *   const item = spaceData.findLaunchById(options.id)
 */

// ============ 配置 ============

// COS 桶：spacelaunch-1258113633，地域 ap-chengdu，对象前缀 space-data/
// 默认域名免备案，直接可配到小程序 downloadFile 白名单
//
// 本地联调（桶还没配好公有读时）：在项目根目录跑
//   npx serve dist -p 3000
// 然后临时把下面改成 http://localhost:3000，并在微信开发者工具勾选
//   「详情 → 本地设置 → 不校验合法域名」
export const CDN_BASE = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data'

// 数据结构变更时改这个值，所有旧缓存整体失效
// v3: 图片换成 COS 缩略图地址（原图域名无备案，真机加载不出来）
// v4: launch 增加任务名 / 轨道 / 发射概率 / 天气顾虑 / 失败原因 / 信息图 / 火箭参数
const DATA_VERSION = 4

// 各数据集对应的文件名，必须与 scripts/sync.js 里的 file 一致
const FILES = {
	upcoming: 'launches-upcoming.json',
	previous: 'launches-previous.json',
	events: 'events.json',
	agencies: 'agencies.json',
	// 统计页的原料：最近 400 次发射的极简字段，前端自己按年份/机构/轨道聚合
	stats: 'stats-launches.json'
}

// 软过期时间：超过就认为"可以先展示、但值得后台刷新一次"
// 与抓取频率对齐，略大于它，避免刚生成就判断为过期
const SOFT_TTL = {
	upcoming: 15 * 60 * 1000,
	previous: 60 * 60 * 1000,
	events: 30 * 60 * 1000,
	agencies: 24 * 60 * 60 * 1000
}

// 硬过期：超过这个时间连兜底展示都不做了，直接当没有缓存
const HARD_TTL = 7 * 24 * 60 * 60 * 1000

const REQUEST_TIMEOUT = 8000

// ============ 内部状态 ============

// 数据集名 → { data, savedAt }
const memory = {}

// 数据集名 → Promise，避免同一个数据集并发发多次请求
const inflight = {}

// ============ 缓存读写 ============

function cacheKey(name) {
	return 'sl_data_' + name + '_v' + DATA_VERSION
}

function readStorage(name) {
	try {
		const raw = uni.getStorageSync(cacheKey(name))
		if (!raw) return null

		// 微信小程序里 uni.setStorageSync 存对象会自动序列化，取回来已是对象
		// 但 H5 / 某些端可能拿到字符串，两种都兜住
		const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
		if (!obj || !Array.isArray(obj.list) || obj.list.length === 0) return null
		if (!obj.savedAt) return null

		const age = Date.now() - obj.savedAt
		if (age > HARD_TTL) return null

		return { data: obj, age }
	} catch (e) {
		console.warn('[spaceData] 读缓存失败', name, e)
		return null
	}
}

function writeStorage(name, data) {
	try {
		uni.setStorageSync(cacheKey(name), data)
	} catch (e) {
		// 存储满了不能影响主流程：清掉本项目其它缓存再试一次，仍失败就放内存
		console.warn('[spaceData] 写缓存失败，尝试清理旧缓存', name, e)
		try {
			clear()
			uni.setStorageSync(cacheKey(name), data)
		} catch (e2) {
			console.warn('[spaceData] 清理后仍失败，仅保留内存缓存', e2)
		}
	}
}

// ============ 网络 ============

function request(url) {
	return new Promise((resolve, reject) => {
		uni.request({
			url,
			method: 'GET',
			timeout: REQUEST_TIMEOUT,
			// 静态文件不需要携带任何凭证
			withCredentials: false,
			success(res) {
				if (res.statusCode !== 200) {
					reject(new Error('HTTP ' + res.statusCode))
					return
				}
				const body = res.data
				if (!body || !Array.isArray(body.list)) {
					reject(new Error('数据格式异常'))
					return
				}
				resolve(body)
			},
			fail(err) {
				reject(new Error((err && err.errMsg) || '网络请求失败'))
			}
		})
	})
}

function fetchDataset(name) {
	const url = CDN_BASE + '/' + FILES[name] + '?t=' + Math.floor(Date.now() / 60000)

	return request(url).then((body) => {
		// 版本不一致不拒绝，只提示：字段都是后加的，旧数据照样能用（前端对缺失字段有回退）。
		// 硬拒绝会让"前端先更新、后端还没跑"的窗口期整页报错。
		// 缓存 key 里带版本号，所以旧缓存不会被误用。
		if (body.v !== DATA_VERSION) {
			console.warn('[spaceData] 数据版本不一致，线上 ' + body.v + ' / 本地 ' + DATA_VERSION)
		}

		const cached = {
			v: body.v,
			dataset: body.dataset || name,
			generatedAt: body.generatedAt,
			count: body.count,
			served: body.served,
			list: body.list,
			savedAt: Date.now()
		}

		memory[name] = { data: cached, savedAt: cached.savedAt }
		writeStorage(name, cached)

		return cached
	})
}

// ============ 对外接口 ============

/**
 * 读取一个数据集
 *
 * @param {string} name upcoming / previous / events / agencies
 * @param {object} [opts]
 * @param {function} [opts.onUpdate] 后台刷新成功后的回调，参数是最新数据对象
 * @param {boolean}  [opts.force]    忽略缓存强制走网络（下拉刷新用）
 * @returns {Promise<{list:Array, count:number, served:number, generatedAt:string, stale:boolean}>}
 */
export function load(name, opts) {
	opts = opts || {}

	if (!FILES[name]) {
		return Promise.reject(new Error('未知数据集: ' + name))
	}

	const ttl = SOFT_TTL[name] || 15 * 60 * 1000

	// ---------- 强制刷新 ----------
	if (opts.force) {
		return fetchDataset(name).then((d) => decorate(d, false))
	}

	// ---------- 有缓存 ----------
	const hit = memory[name] || readStorage(name)
	if (hit) {
		const data = hit.data
		const age = hit.age != null ? hit.age : Date.now() - data.savedAt
		const isStale = age > ttl

		// 过期了就在后台刷一次，不阻塞本次返回
		if (isStale) {
			refreshInBackground(name, data.generatedAt, opts.onUpdate)
		}

		return Promise.resolve(decorate(data, isStale))
	}

	// ---------- 无缓存，必须等网络 ----------
	return fetchDataset(name).then((d) => decorate(d, false))
}

function refreshInBackground(name, oldGeneratedAt, onUpdate) {
	if (inflight[name]) return

	inflight[name] = fetchDataset(name)
		.then((fresh) => {
			// generatedAt 没变说明线上还没更新，不必打扰页面
			if (onUpdate && fresh.generatedAt !== oldGeneratedAt) {
				onUpdate(decorate(fresh, false))
			}
		})
		.catch((e) => {
			// 后台刷新失败必须静默，用户手里已经有数据了
			console.warn('[spaceData] 后台刷新失败', name, e && e.message)
		})
		.then(() => {
			delete inflight[name]
		})
}

function decorate(data, stale) {
	return {
		list: data.list,
		count: typeof data.count === 'number' ? data.count : data.list.length,
		served: data.served || data.list.length,
		generatedAt: data.generatedAt || '',
		stale: !!stale
	}
}

/**
 * 按 id 取单条。id 来自列表页跳转时带的参数，比传下标可靠
 * （列表刷新后下标会错位，id 不会）
 */
export function getById(name, id) {
	if (id === undefined || id === null || id === '') return Promise.resolve(null)
	const target = String(id)

	// 先查内存/缓存，命中就不用等网络
	const hit = memory[name] || readStorage(name)
	if (hit) {
		const found = hit.data.list.find((x) => String(x.id) === target)
		if (found) return Promise.resolve(found)
	}

	// 缓存里没有（可能是别的列表项），等一次网络再找
	return load(name, { force: true })
		.then((d) => d.list.find((x) => String(x.id) === target) || null)
		.catch(() => null)
}

/** 从机构快照里按 id 找机构，供详情页展示机构信息 */
export function getAgencyById(id) {
	return getById('agencies', id)
}

/**
 * 跨 upcoming / previous 找一条发射
 *
 * 详情页不要直接调两次 getById：那样第一次 miss 就会 force 拉网络，
 * 如果这条其实在另一个数据集里，等于白拉 55KB。
 * 这里先扫两个数据集的缓存，都没命中才依次拉网络。
 */
export async function findLaunchById(id) {
	if (id === undefined || id === null || id === '') return null
	const target = String(id)
	const names = ['upcoming', 'previous']

	// 先看缓存，命中就零网络开销
	for (const name of names) {
		const hit = memory[name] || readStorage(name)
		if (!hit) continue
		const found = hit.data.list.find((x) => String(x.id) === target)
		if (found) return found
	}

	// 缓存里都没有（冷启动直接进详情），按需拉一次
	for (const name of names) {
		try {
			const d = await load(name, { force: true })
			const found = d.list.find((x) => String(x.id) === target)
			if (found) return found
		} catch (e) {
			// 一个数据集失败不影响另一个
		}
	}
	return null
}

/** 下拉刷新：绕过缓存重新拉 */
export function refresh(name) {
	return load(name, { force: true })
}

/**
 * 首页文案用：把 generatedAt 转成"X 分钟前"
 * 用户能直观看到数据新鲜度，比"共 N 条"更诚实
 */
export function freshnessText(generatedAt) {
	if (!generatedAt) return ''
	const t = new Date(generatedAt).getTime()
	if (isNaN(t)) return ''

	const mins = Math.floor((Date.now() - t) / 60000)
	if (mins < 1) return '刚刚更新'
	if (mins < 60) return mins + ' 分钟前更新'

	const hours = Math.floor(mins / 60)
	if (hours < 24) return hours + ' 小时前更新'

	return Math.floor(hours / 24) + ' 天前更新'
}

/** 清空本项目所有缓存（调试或数据结构大改时用） */
export function clear() {
	Object.keys(FILES).forEach((name) => {
		delete memory[name]
		try {
			uni.removeStorageSync(cacheKey(name))
		} catch (e) {
			// ignore
		}
	})
}

export default {
	load,
	getById,
	getAgencyById,
	findLaunchById,
	refresh,
	freshnessText,
	clear,
	CDN_BASE
}
