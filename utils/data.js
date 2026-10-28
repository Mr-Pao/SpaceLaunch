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
// v4: launch 增加任务名 / 轨道 / 发射概率 / 天气顾虑 / 失败原因 / 信息图
// v5: 增加发射窗口、四类累计发射次数、火箭系列与型号
// v6: 增加任务名中文 mission.nameZh
// v7: stats 增加任务 id / 名称 / 发射场
// v8: stats 改为按年预聚合输出
// v9: gallery 改为全量分片（索引带 chunks / chunkSize / launchTotal），
//     并新增按需拉分片的 galleryChunk()。不升版本的话，
//     老用户手里的单文件缓存 6 小时内不会刷新，全量页只翻得动第 0 片
// v13: 宇航员 slim 新增 missions/evas/生卒/外链（3.1.15），旧缓存 key 失效强制重拉
// v14: 缓存版本号升到 14（图库小版本随之变为 v14.1）；旧缓存 key 整体失效强制重拉。
//      DATA_VERSION 在 utils/data.js / scripts/sync.js / scripts/images.js 三处必须一致（当前 14）。
const DATA_VERSION = 14

/**
 * 图库自己的缓存版本戳。
 *
 * 图库和其它数据集不一样：它每天都在往上涨（CI 每小时补一批发射的照片），
 * 而 DATA_VERSION 只在「slim 结构变了」时才升。结果就是数据天天变、缓存里的
 * 那份旧快照却要挂满 TTL —— 用户看到「200 张」，服务端其实早就是别的数字了。
 * 拆一个独立后缀出来：以后图库数据有大变化只动这里，不用牵动全部数据集的缓存。
 */
const GALLERY_V = 1

// 各数据集对应的文件名，必须与 scripts/sync.js 里的 file 一致
const FILES = {
	upcoming: 'launches-upcoming.json',
	// 即将发射的第 100 条之后（每天更新一次，首页翻到底时加载）
	upcomingMore: 'launches-upcoming-more.json',
	previous: 'launches-previous.json',
	events: 'events.json',
	agencies: 'agencies.json',
	// 火箭型号库（532 个型号，含技术参数）
	launchers: 'launchers.json',
	// 芯级个体库（196 枚真实第一级硬件）：编号 / 状态 / 已飞次数 / 回收次数。
	// 只有 mode=detailed 才有 flights 与 launcher_config，CI 每天抓全量
	cores: 'cores.json',
	// 宇航员库（862 人，detailed）：in_space 筛「此刻在天上」，
	// bio 只保留了在轨人员的（详情页入口只有这张卡片）
	astronauts: 'astronauts.json',
	// 空间站（15 个，活性站 + 历史站），详情页展示乘组/远征队/对接史
	spacestations: 'spacestations.json',
	// 远征队（165 条，乘组 + 所属空间站），详情页乘组卡点宇航员跳转
	expeditions: 'expeditions.json',
	// 对接事件（飞船→空间站），按 stationId 过滤进空间站详情页
	dockings: 'dockings.json',
	// 发射工位库（251 个 pad，含地图图与累计发射数），pad 详情页用
	pads: 'pads.json',
	// 统计页数据：CI 侧按年预聚合好的结果，前端只负责展示与年度切换
	stats: 'stats-years.json',
	// 往年今日：CI 侧按「月-日」筛好的历史发射（今天这一天，最多 40 条）。
	// 全量 7656 条在前端筛要 2MB 起步，而页面一天只需要二十来条
	onthisday: 'onthisday.json',
	// 发射时间线（T- 序列）。LL2 只有单条详情才有，CI 每 3 小时抓 8 条，
	// 覆盖率靠时间累积；没抓到的任务详情页整块不显示
	timelines: 'timelines.json',
	// 发射视频（官方直播 / 回放 / 第三方转播）。只有 mode=detailed 才返回
	// vid_urls，CI 每小时抓 10 条发射，按 id 索引；媒体页拿它补记录上的 vid
	videos: 'videos.json',
	// 图库：CI 侧从发射列表顺路压好的「有图的发射」清单（缩略图 +
	// 署名 + 时间），按 net 倒序。这是**索引 + 第 0 片**，
	// 后面还有 gallery/1.json、gallery/2.json … 用 galleryChunk() 按需拉
	gallery: 'gallery.json',
	// 航天器/卫星百科（GCAT 活跃子集，分片）。satellites.json 是**索引 + 第 0 片**
	// （带 chunks/chunkSize/total），后面 satellites/1.json … 用 satelliteChunk() 按需拉
	satellites: 'satellites.json',
	// 全球在轨资产（GCAT 聚合统计）：total + byState/byOrbit/byDecade，无逐条 list
	orbitStats: 'orbit-stats.json',
	// 在轨解体 / 再入事件流（GCAT 已终结子集，按再入日期排序）
	debrisEvents: 'debris-events.json',
	// 航天资讯（SNAPI v4）。CI 每 3 小时抓一轮、保留最近 200 条；
	// 标题与摘要已中文化（翻不出来为空，前端回退英文）；
	// launches 里是可回连发射详情页的 LL2 UUID
	news: 'news.json'
}

// 软过期时间：超过就认为"可以先展示、但值得后台刷新一次"
// 与抓取频率对齐，略大于它，避免刚生成就判断为过期
const SOFT_TTL = {
	upcoming: 15 * 60 * 1000,
	previous: 60 * 60 * 1000,
	events: 30 * 60 * 1000,
	agencies: 24 * 60 * 60 * 1000,
	// 以下都是每天才更新一次的大数据集，默认 15 分钟会让每次进页
	// 都触发后台刷新白拉一遍（评审 P2-4），统一放宽到 12 小时
	upcomingMore: 12 * 60 * 60 * 1000,
	launchers: 12 * 60 * 60 * 1000,
	// 芯级库每天才刷一次，与 launchers 同待遇
	cores: 12 * 60 * 60 * 1000,
	// 宇航员库同上（在轨状态一天变一次足够）
	astronauts: 12 * 60 * 60 * 1000,
	spacestations: 12 * 60 * 60 * 1000,
	expeditions: 12 * 60 * 60 * 1000,
	dockings: 12 * 60 * 60 * 1000,
	pads: 12 * 60 * 60 * 1000,
	stats: 12 * 60 * 60 * 1000,
	// 往年今日：北京时间过 0 点就换一天，不能等 12 小时。
	// 1 小时既能及时换日，也不至于每次进页都重拉（3KB 一份）
	onthisday: 60 * 60 * 1000,
	// 时间线每 3 小时才补几条，TTL 给宽一点，别为了几条新记录反复拉
	timelines: 3 * 60 * 60 * 1000,
	// 视频每小时补 10 条，历史发射的 webcast 基本不会变，同样给宽
	videos: 6 * 60 * 60 * 1000,
	// 图库每小时都在补图，6 小时太久 —— 一份索引才几十 KB，
	// 超过 1 小时就顺手在后台换一次，页面不至于长期显示旧张数
	gallery: 60 * 60 * 1000,
	// GCAT 季度才更新一次，但数据集较大（satellites 数百条 × 多片），
	// 与 launchers 同待遇：12 小时软 TTL，别每次进页都白拉
	satellites: 12 * 60 * 60 * 1000,
	orbitStats: 12 * 60 * 60 * 1000,
	debrisEvents: 12 * 60 * 60 * 1000,
	// 资讯每 3 小时一轮，1 小时软过期已经够新；单份才 30~50KB
	news: 60 * 60 * 1000
}

// 硬过期（分级）：超过这个时间的缓存不再无限期驻留 Storage。
// 小数据集（upcoming/previous/events/stats）保持 7 天；
// 大体积、低频访问的数据集（launchers 435KB / upcomingMore 626KB / agencies 180KB，
// 合计约 1.2MB，占小程序 10MB Storage 配额的 1/8）只用 2 天——
// 到期后第一次访问就把它们从 Storage 腾出来，本会话先用内存里的渲染 + 后台刷新，
// 空间释放了，页面也不用白屏等网络（低频页面下次访问重新拉一次完全可接受）。
const HARD_TTL_DEFAULT = 7 * 24 * 60 * 60 * 1000
const HARD_TTL = {
	upcomingMore: 2 * 24 * 60 * 60 * 1000,
	agencies: 2 * 24 * 60 * 60 * 1000,
	launchers: 2 * 24 * 60 * 60 * 1000,
	// 芯级库单份不大（196 行 × ~200B ≈ 40KB），走默认 7 天即可
	// pads 变化极慢（每天刷一次），但它带 251 张地图图 URL，体积不小
	pads: 3 * 24 * 60 * 60 * 1000,
	// 评审 P2-5 补：这两个新增数据集单份 200KB+，不设硬 TTL 会永久驻留
	timelines: 2 * 24 * 60 * 60 * 1000,
	videos: 2 * 24 * 60 * 60 * 1000,
	gallery: 3 * 24 * 60 * 60 * 1000,
	// GCAT 三数据集：satellites 单份几十～上百 KB 且多片，硬 TTL 设 2 天；
	// 聚合统计与事件流极轻量，3 天足够
	satellites: 2 * 24 * 60 * 60 * 1000,
	orbitStats: 3 * 24 * 60 * 60 * 1000,
	debrisEvents: 3 * 24 * 60 * 60 * 1000,
	// 资讯是滚动列表，两天前的副本没有保留价值
	news: 2 * 24 * 60 * 60 * 1000,
	// 往年今日一天换一次，昨天的副本没有价值
	onthisday: 12 * 60 * 60 * 1000
}

function hardTtl(name) {
	return HARD_TTL[name] || HARD_TTL_DEFAULT
}

const REQUEST_TIMEOUT = 8000

// ============ 内部状态 ============

// 数据集名 → { data, savedAt }
const memory = {}

// 数据集名 → Promise，同一个数据集的并发请求只发一次。
// 前台路径（load 无缓存 / force）与后台刷新共用，避免冷启动时
// App 预热和页面 onLoad 同时 load 同一数据集发两次请求、写两次 Storage
const inflight = {}

// ============ 缓存读写 ============

// GCAT 三数据集的独立小版本：3.2.7 修正了数据口径（在轨 66781→34925 等），
// 老缓存里是错数字，靠这个小版本强制重拉一次。不动全局 DATA_VERSION，
// 否则会把 videos/timeline 等载荷的 v 一起顶掉、逼它们的缓存也全部作废。
const GCAT_V = 2
const GCAT_NAMES = { satellites: 1, orbitStats: 1, debrisEvents: 1 }

function cacheKey(name) {
	// 图库带自己的小版本（v14.x），GCAT 三数据集带 v14.y，其它数据集仍只有 DATA_VERSION
	let v = DATA_VERSION
	if (name === 'gallery') v = DATA_VERSION + '.' + GALLERY_V
	else if (GCAT_NAMES[name]) v = DATA_VERSION + '.' + GCAT_V
	return 'sl_data_' + name + '_v' + v
}

function readStorage(name) {
	try {
		const raw = uni.getStorageSync(cacheKey(name))
		if (!raw) return null

		// 微信小程序里 uni.setStorageSync 存对象会自动序列化，取回来已是对象
		// 但 H5 / 某些端可能拿到字符串，两种都兜住
		const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
		if (!obj || !Array.isArray(obj.list)) return null
		// 普通数据集 list 为空视为「无数据」不缓存，避免空结果被长期保留；
		// 但 orbitStats 这类聚合数据集本体 list 为空（数据在 byState/byOrbit/byDecade/total），
		// 必须允许它进缓存，否则每次打开都走网络
		if (obj.list.length === 0 && !obj.byState && !obj.byOrbit && !obj.total) return null
		if (!obj.savedAt) return null

		const age = Date.now() - obj.savedAt
		if (age > hardTtl(name)) {
			// 硬过期：立刻从 Storage 腾出空间（大数据集不再长期占配额），
			// 数据照样返回——本会话先渲染它，load() 会触发后台刷新重写缓存
			try {
				uni.removeStorageSync(cacheKey(name))
			} catch (e) {
				// 清不掉也无妨，下次再清
			}
			return { data: obj, age, expired: true }
		}

		return { data: obj, age }
	} catch (e) {
		console.warn('[spaceData] 读缓存失败', name, e)
		return null
	}
}

// 存储配额不够时的淘汰顺序：先丢体积大、非首屏的数据集。
// upcoming（首页首屏）永远不主动丢——它被清掉的话下次冷启动白屏等网络。
// onthisday 排在最后丢：它只有几 KB，首页首屏要用，丢了反而要等网络
const EVICT_ORDER = ['pads', 'cores', 'astronauts', 'launchers', 'satellites', 'agencies', 'gallery', 'videos', 'timelines', 'news', 'upcomingMore', 'stats', 'events', 'previous', 'onthisday', 'spacestations', 'expeditions', 'dockings']

function writeStorage(name, data) {
	try {
		uni.setStorageSync(cacheKey(name), data)
	} catch (e) {
		// 存储满了不能影响主流程，也绝不能 clear() 清空全部——
		// 那会把首页缓存一起带走，首屏体验从 0ms 退化到网络往返。
		// 改为按淘汰顺序逐个丢别的数据集，每丢一个就重试写入。
		console.warn('[spaceData] 写缓存失败，开始淘汰其它数据集', name, e)
		for (const victim of EVICT_ORDER) {
			if (victim === name) continue
			try {
				uni.removeStorageSync(cacheKey(victim))
				delete memory[victim]
				uni.setStorageSync(cacheKey(name), data)
				return
			} catch (e2) {
				// 还没挤出来就继续丢下一个
			}
		}
		console.warn('[spaceData] 淘汰后仍写不进去，仅保留内存缓存', name)
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

// GCAT 三数据集体量大、且季度才更新一次，用「小时级」缓存戳：
// 同一小时内所有用户命中同一份 CDN 边缘缓存，避免像分钟级那样每次打开都直连源站。
// 图库 / 卫星分片早就用小时级（见 galleryChunk / satelliteChunk），这里对齐，否则新页面比图库还慢。
const HOURLY_CACHE = new Set(['satellites', 'orbitStats', 'debrisEvents'])

function fetchDataset(name) {
	// 高频更新的数据集（即将发射等）仍用分钟级，保证新鲜度；
	// GCAT 体量大、变化慢，用小时级让 CDN 边缘缓存生效
	const granularity = HOURLY_CACHE.has(name) ? 3600000 : 60000
	const url = CDN_BASE + '/' + FILES[name] + '?t=' + Math.floor(Date.now() / granularity)

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
			// gallery 分片元信息：没有就是老的单文件版本，按 1 片处理
			chunks: body.chunks,
			chunkSize: body.chunkSize,
			launchTotal: body.launchTotal,
			// satellites 用 total（活跃总数），orbitStats 用 total + 四个聚合数组
			total: body.total,
			byState: body.byState,
			byOrbit: body.byOrbit,
			byClass: body.byClass,
			byDecade: body.byDecade,
			// debrisEvents：解体事件数与总条数
			breakupCount: body.breakupCount,
			count: body.count,
			list: body.list,
			savedAt: Date.now()
		}

		memory[name] = { data: cached, savedAt: cached.savedAt }
		writeStorage(name, cached)

		return cached
	})
}

/**
 * 带并发去重的网络抓取：同一数据集在途时复用同一个 Promise。
 * 无论成败都清理，失败后的下一次调用允许重新发请求。
 */
function fetchShared(name) {
	if (inflight[name]) return inflight[name]

	const p = fetchDataset(name)
	inflight[name] = p
	const clear = () => {
		if (inflight[name] === p) delete inflight[name]
	}
	p.then(clear, clear)
	return p
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
		return fetchShared(name).then((d) => decorate(d, false))
	}

	// ---------- 有缓存 ----------
	const hit = memory[name] || readStorage(name)
	if (hit) {
		const data = hit.data
		const age = hit.age != null ? hit.age : Date.now() - data.savedAt
		// 硬过期的缓存（Storage 副本已腾掉）按 stale 处理：照常渲染 + 后台刷新
		const isStale = hit.expired || age > ttl

		// 过期了就在后台刷一次，不阻塞本次返回
		if (isStale) {
			refreshInBackground(name, data.generatedAt, opts.onUpdate)
		}

		return Promise.resolve(decorate(data, isStale))
	}

	// ---------- 无缓存，必须等网络 ----------
	// fetchShared 去重：预热与页面 onLoad 同时到达只发一次请求
	return fetchShared(name).then((d) => decorate(d, false))
}

function refreshInBackground(name, oldGeneratedAt, onUpdate) {
	fetchShared(name)
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
}

function decorate(data, stale) {
	return {
		list: data.list,
		count: typeof data.count === 'number'
			? data.count
			: (typeof data.total === 'number' ? data.total : (data.list ? data.list.length : 0)),
		served: data.served || (data.list ? data.list.length : 0),
		generatedAt: data.generatedAt || '',
		// 只有 gallery 会带这三个，其它数据集拿到的是兜底值
		chunks: data.chunks || 1,
		chunkSize: data.chunkSize || 0,
		launchTotal: data.launchTotal || 0,
		// satellites：活跃总数；orbitStats：聚合统计（无 list）
		total: data.total || 0,
		byState: data.byState || [],
		byOrbit: data.byOrbit || [],
		byClass: data.byClass || [],
		byDecade: data.byDecade || [],
		breakupCount: data.breakupCount || 0,
		stale: !!stale
	}
}

// ============ 图库分片 ============

// 分片不进 Storage：一份 140KB，五片就把 10MB 配额吃掉一截，
// 而且滑到底才用得到。只活在本会话内存里，杀进程后重拉（一次请求而已）
const chunkMemory = {}
const chunkInflight = {}

/**
 * 拉图库的第 i 片（i 从 1 开始）
 *
 * 第 0 片就是 gallery 数据集本身（索引文件带 list），不要再拉一遍 ——
 * 那等于把第一屏下载两次。
 *
 * @param {number} i 分片号
 * @returns {Promise<{list:Array, chunk:number, count:number, chunks:number}>}
 */
export function galleryChunk(i) {
	i = Number(i) || 0
	if (i <= 0) return Promise.resolve({ list: [], chunk: 0, count: 0, chunks: 1 })
	if (chunkMemory[i]) return Promise.resolve(chunkMemory[i])
	if (chunkInflight[i]) return chunkInflight[i]

	// 时间戳按小时取整：同一小时内所有人命中同一份 CDN 缓存，
	// 按分钟取会让 CDN 每秒都是新 URL，等于没有缓存
	const url = CDN_BASE + '/gallery/' + i + '.json?t=' + Math.floor(Date.now() / 3600000)

	const p = request(url).then((body) => {
		const d = {
			list: body.list || [],
			chunk: body.chunk != null ? body.chunk : i,
			count: body.count || 0,
			chunks: body.chunks || 0
		}
		chunkMemory[i] = d
		return d
	})

	chunkInflight[i] = p
	const clear = () => {
		if (chunkInflight[i] === p) delete chunkInflight[i]
	}
	p.then(clear, clear)
	return p
}

/** 丢掉已加载的分片（图库下拉刷新整库时用） */
export function clearChunks() {
	Object.keys(chunkMemory).forEach((k) => delete chunkMemory[k])
}

// 卫星分片与图库分片索引独立，不能共用同一张内存表（否则第 i 片互相覆盖）
const satChunkMemory = {}
const satChunkInflight = {}

/**
 * 拉卫星百科的第 i 片（i 从 1 开始）。第 0 片就是 satellites 数据集本身
 * （索引文件带 list），不要再拉一遍。结构完全对齐 galleryChunk。
 *
 * @param {number} i 分片号
 * @returns {Promise<{list:Array, chunk:number, count:number, chunks:number}>}
 */
export function satelliteChunk(i) {
	i = Number(i) || 0
	if (i <= 0) return Promise.resolve({ list: [], chunk: 0, count: 0, chunks: 1 })
	if (satChunkMemory[i]) return Promise.resolve(satChunkMemory[i])
	if (satChunkInflight[i]) return satChunkInflight[i]

	const url = CDN_BASE + '/satellites/' + i + '.json?t=' + Math.floor(Date.now() / 3600000)

	const p = request(url).then((body) => {
		const d = {
			list: body.list || [],
			chunk: body.chunk != null ? body.chunk : i,
			count: body.count || 0,
			chunks: body.chunks || 0
		}
		satChunkMemory[i] = d
		return d
	})

	satChunkInflight[i] = p
	const clear = () => {
		if (satChunkInflight[i] === p) delete satChunkInflight[i]
	}
	p.then(clear, clear)
	return p
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
 * 跨 upcoming / previous / upcomingMore 找一条发射
 *
 * 详情页不要直接调两次 getById：那样第一次 miss 就会 force 拉网络，
 * 如果这条其实在另一个数据集里，等于白拉 55KB。
 * 这里先扫三个数据集的缓存，都没命中才依次拉网络。
 *
 * 第三个数据集是**远期待发**（375 条 / 757KB，net 一直到 2039）。
 * 少了它，Artemis、登月着陆器这类两年后的任务点进去必然「未找到该发射任务」——
 * 资讯里挂的这些远期任务就全成了死链，所以只能连最近 100 发范围内的。
 */
export async function findLaunchById(id, net) {
	if (id === undefined || id === null || id === '') return null
	const target = String(id)
	const names = ['upcoming', 'previous', 'upcomingMore']

	// 先看缓存，命中就零网络开销
	for (const name of names) {
		const hit = memory[name] || readStorage(name)
		if (!hit) continue
		const found = hit.data.list.find((x) => String(x.id) === target)
		if (found) return found
	}

	// 缓存里都没有（冷启动直接进详情），按需拉一次
	for (const name of ['upcoming', 'previous']) {
		try {
			const d = await load(name, { force: true })
			const found = d.list.find((x) => String(x.id) === target)
			if (found) return found
		} catch (e) {
			// 一个数据集失败不影响另一个
		}
	}

	// 远期待发放最后、且不 force：757KB 只为找一条，有 12 小时缓存就先用着。
	// 但调用方给了 net 且明显在过去时直接跳过 —— 十几年前的老任务不可能在
	// 待发列表里，为了它下一份 757KB 不值当（这类应该去归档分片找）。
	const past = net ? Date.parse(net) < Date.now() - 24 * 3600 * 1000 : false
	if (past) return null

	try {
		const d = await load('upcomingMore')
		return d.list.find((x) => String(x.id) === target) || null
	} catch (e) {
		return null
	}
}

/**
 * 只查缓存、不发请求地找一条发射（同步）。
 *
 * 用途：进详情页之前先判断「这条到底能不能打开」。
 * 资讯的「关联发射」来自 SNAPI，它只给 UUID 不给发射时间，
 * 而快照只覆盖 upcoming 100 条 + previous 100 条，剩下的大多是
 * 十几年前的老任务（好奇号 2011、Rosetta 2004 之类），
 * 归档查找又限深 12 片，翻不到就等于打不开。
 *
 * 与其让用户点进去看一屏「未找到该发射任务」，不如在这里先把话说清楚：
 * 返回 null 就代表「现在这份缓存里没有」，调用方据此收敛入口。
 *
 * 注意这是**快照缓存**，不含历史归档分片 —— 归档要一片片下载，不能同步判断。
 */
export function peekLaunchById(id) {
	if (id === undefined || id === null || id === '') return null
	const target = String(id)

	for (const name of ['upcoming', 'previous']) {
		const hit = memory[name] || readStorage(name)
		if (!hit) continue
		const found = hit.data.list.find((x) => String(x.id) === target)
		if (found) return found
	}
	return null
}

/**
 * 反查：这次发射被哪些报道提到过。
 *
 * 资讯的关联是单向的（文章 → launch id），发射详情页要反过来用，
 * 只能在 news.json 里筛一遍。两三百条的线性扫比另做一份索引文件划算：
 * 索引要新数据集 + CI 产物 + 版本对齐，而这里只是一个内存内 filter。
 *
 * 网络开销：news.json 40KB、TTL 一小时。首页的资讯块通常已经拉过了，
 * 进详情页时多半直接命中缓存。拿不到就返回空数组，页面上整块不显示。
 */
export async function newsForLaunch(id) {
	if (id === undefined || id === null || id === '') return []
	const target = String(id)

	let d = null
	try {
		d = await load('news')
	} catch (e) {
		return []
	}

	const list = (d && d.list) || []
	return list.filter(
		(a) => Array.isArray(a.launches) && a.launches.some((x) => String(x) === target)
	)
}

/** 下拉刷新：绕过缓存重新拉 */
export function refresh(name) {	return load(name, { force: true })
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
	clearChunks()

	Object.keys(FILES).forEach((name) => {
		delete memory[name]
		delete inflight[name]
		try {
			uni.removeStorageSync(cacheKey(name))
		} catch (e) {
			// ignore
		}
	})

	// cacheKey 带 DATA_VERSION，升版本后旧 key 上面清不到，会永久残留在
	// 用户的 Storage 里（评审 P2-6）。按前缀把历史版本一并扫掉
	try {
		const info = uni.getStorageInfoSync()
		for (const k of (info && info.keys) || []) {
			if (typeof k === 'string' && k.indexOf('sl_data_') === 0) {
				try {
					uni.removeStorageSync(k)
				} catch (e) {
					// 单个清不掉不影响其它
				}
			}
		}
	} catch (e) {
		// 拿不到 key 列表（个别端没实现）就只清当前版本
	}
}

export default {
	load,
	getById,
	getAgencyById,
	findLaunchById,
	peekLaunchById,
	newsForLaunch,
	refresh,
	freshnessText,
	clear,
	galleryChunk,
	clearChunks,
	satelliteChunk,
	CDN_BASE
}
