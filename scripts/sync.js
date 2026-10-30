#!/usr/bin/env node
'use strict'

/**
 * LL2 → 静态 JSON 快照
 *
 * 用法：
 *   node sync.js --dataset=upcoming     只同步即将发射
 *   node sync.js --dataset=events       只同步事件
 *   node sync.js --dataset=previous     只同步历史发射
 *   node sync.js --dataset=agencies     只同步机构（4 页）
 *   node sync.js --dataset=all          全部同步（调试用，会消耗 7 个请求）
 *   node sync.js --dataset=all --base=dev   走开发端点，不消耗正式配额
 *
 * 环境变量：
 *   LL2_TOKEN        可选，LL2 免费 token，可提升限额
 *   LL2_BASE         设为 dev 等价于 --base=dev
 *   COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION   配置了才上传
 */

const fs = require('fs')
const path = require('path')
const { getJson } = require('./lib/fetch')
const { slimLaunch,
	slimPad,
	slimEvent,
	slimAgency,
	slimStatLaunch,
	slimLauncher,
	slimCore,
	slimAstronaut,
	slimStation,
	slimExpedition,
	slimDocking } = require('./lib/slim')
const { aggregateByYear } = require('./lib/aggregate')
const { pickOnThisDay } = require('./lib/onthisday')
const { upload } = require('./lib/cos')
const { localizeLaunches, localizeLaunchNames, localizeEvents, localizeAgencies, localizePads, localizeLaunchers, localizeCores, localizeAstronauts, localizeStations } = require('./lib/localize')
const { mirrorImages } = require('./lib/image')
// 发射快照本身不带火箭技术参数（normal 模式的 configuration 只有名字），
// 同步时用型号库按 config id 内联进去，前端就不用为一张卡多拉 568KB
const { enrichRockets } = require('./lib/enrich')
const { runTimelines } = require('./timeline')
const { runVideos } = require('./videos')
const { runImages } = require('./images')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
// v3: 图片改为 COS 托管的缩略图地址，旧缓存里的原图 URL 真机加载不出来
// v4: launch 增加 mission.name / mission.orbit / probability / weather_concerns /
//     failreason / infographic
// v5: 增加发射窗口 window_start/end、四类累计发射次数、火箭系列与型号代号
// v6: 增加 mission.nameZh（任务名中文），标题不再整行英文
// v7: stats 增加 id / name / site（发射场），支撑年度回顾
// v8: stats 改为「按年预聚合」输出，不再下发原始数据；数据源换成最新快照 + 历史归档
// v9: launcher 简介中文化（descriptionZh），型号图片全量镜像
// v10: launch 增加 imageThumb / imageCredit / pad.image* / vid
// v11: launch 增加 rocketBrief（火箭技术参数内联）、pad.map_image、机构累计发射数
// v12: gallery 改为全量分片（索引带 chunks / chunkSize / launchTotal），
//      images 轮从 2 小时 100 条提到每小时 150 条，两天扫全历史发射
const DATA_VERSION = 14

/** 读 COS 上已生成的 JSON。桶是公有读，直接走 CDN 地址 */
async function readCosJson(key) {
	const { COS_BUCKET, COS_REGION } = process.env
	if (!COS_BUCKET || !COS_REGION) throw new Error('缺少 COS_BUCKET / COS_REGION')

	const url = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`
	const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
	if (!res.ok) throw new Error('HTTP ' + res.status)
	return res.json()
}

// 各数据集的抓取策略。limit 与 mode 都是实测调优的结果，改之前先看规划文档第七节。
/**
 * 用发射记录反哺型号数据。
 *
 * 两件事一起做，只扫一遍：
 *   1. **补配图**：LL2 型号库里有一批型号没有 image_url（新构型、冷门型号），
 *      用它最近一次发射的现场图填上，比空占位有信息量。
 *   2. **聚合常用发射场**：型号表没有 pad 字段，但每条发射都带
 *      pad.name（工位）+ pad.location.name（发射场），按出现次数取前 3。
 *
 * 必须在 mirrorImages 之前跑：补进来的图是原始 URL，还要走一遍镜像。
 * 近期快照只覆盖最近 100 多条，冷门型号和完整发射场统计都要翻历史归档
 * （76 片 × 100 条）。读的是自家 COS，不耗 LL2 配额。
 */
async function enrichLaunchersFromLaunches(list, readCosJson) {
	const wantImg = new Map(list.filter((x) => !x.image).map((x) => [String(x.id), x]))
	// 发射场只给现役型号聚合：退役型号没人看，省掉三分之二数据量
	const wantPad = new Set(list.filter((x) => x.active).map((x) => String(x.id)))
	const padAgg = new Map()
	let scanned = 0

	const apply = (snap) => {
		const arr = snap && (snap.list || snap)
		if (!Array.isArray(arr)) return
		scanned += arr.length

		for (const l of arr) {
			if (!l || !l.rocket) continue
			const cfg = l.rocket.configuration
			if (!cfg || cfg.id == null) continue
			const k = String(cfg.id)

			if (wantImg.size) {
				const target = wantImg.get(k)
				if (target && l.image) {
					target.image = l.image
					wantImg.delete(k)
				}
			}

			if (!wantPad.has(k)) continue
			const padName = l.pad && l.pad.name
			if (!padName) continue

			let bucket = padAgg.get(k)
			if (!bucket) {
				bucket = new Map()
				padAgg.set(k, bucket)
			}
			const cur = bucket.get(padName) || { name: padName, location: '', count: 0 }
			cur.count++
			if (!cur.location && l.pad.location && l.pad.location.name) {
				cur.location = l.pad.location.name
			}
			bucket.set(padName, cur)
		}
	}

	// 1) 近期两批快照
	for (const key of ['space-data/launches-upcoming.json', 'space-data/launches-previous.json']) {
		try {
			apply(await readCosJson(key))
		} catch (e) {
			// 快照缺失不影响归档那一轮
		}
	}

	// 2) 历史归档：冷门型号的配图和长尾发射场都在这里
	try {
		const idx = await readCosJson('space-data/history/index.json')
		for (const p of (idx && idx.pages) || []) {
			if (!p || !p.file) continue
			try {
				apply(await readCosJson('space-data/history/' + p.file))
			} catch (e) {
				// 单片坏掉就跳过，别让一片拖垮整轮
			}
		}
	} catch (e) {
		console.warn(`  ! 历史归档不可读，发射场与补图跳过: ${e.message}`)
	}

	let padFilled = 0
	for (const x of list) {
		const bucket = padAgg.get(String(x.id))
		if (!bucket) continue
		x.pads = [...bucket.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, 5)
			.map((p) => ({ name: p.name, location: p.location, count: p.count }))
		padFilled++
	}

	console.log(
		`  · 扫发射 ${scanned} 条 → 发射场 ${padFilled} 个型号，仍缺图 ${wantImg.size} 个`
	)
}

/**
 * 清掉「已经飞完、状态却卡在半路」的条目。
 *
 * LL2 的 upcoming 端点按理会在发射结束后把条目移出列表，但状态同步有滞后：
 * 实测发射结束 3 小时后，upcoming 里仍然写着 "In Flight"，前端列表就一直
 * 挂着「飞行中」；而 previous 那边同一个 id 早就变成 Success 了。
 *
 * 处理：net 过去超过 3 小时、状态仍是 In Flight / Go 的，
 *   1) previous 有同 id 且已是终态 → 用它的状态和 net 顶上（显示「成功」）；
 *   2) previous 也还没有 → 整条删掉（它已经不属于「即将发射」，
 *      下一轮 previous 就会出现，列表不会长时间缺这一条）。
 *
 * 必须跑在 localize 之前：换上去的 status 要一起中文化。
 */
async function pruneStaleUpcoming(list, readCosJson) {
	const LIMIT = 3 * 3600 * 1000
	const now = Date.now()
	const stale = list.filter((x) => {
		const a = (x.status && x.status.abbrev) || ''
		if (a !== 'In Flight' && a !== 'Go') return false
		const t = x.net ? new Date(x.net).getTime() : 0
		return t > 0 && now - t > LIMIT
	})
	if (!stale.length) return

	const prev = new Map()
	let prevFailed = false
	try {
		const p = await readCosJson('space-data/launches-previous.json')
		for (const x of (p && (p.list || p)) || []) prev.set(String(x.id), x)
	} catch (e) {
		// previous 是真实终态来源。若读取瞬态失败（网络抖动 / 5xx / 非 200 即抛），
		// prev 会是空 —— 若不拦截，下面循环对每个 "Go/In Flight 且超 3h" 的条目都走
		// 删除分支，等于把一整批仍在飞的发射整体从 upcoming 抹掉。
		// 安全做法：本轮直接放弃 prune，全部保留，等下一轮 previous 可读时再修。
		prevFailed = true
		console.warn(`  ! 读取 previous 失败，本轮跳过陈旧清理（保留全部）: ${e.message}`)
	}

	// previous 没读到就别动任何条目，宁可列表多挂几小时「飞行中」，也不误删活跃发射
	if (prevFailed) return

	let patched = 0
	const drop = new Set()
	for (const x of stale) {
		const p = prev.get(String(x.id))
		const a = (p && p.status && p.status.abbrev) || ''
		if (a && a !== 'In Flight' && a !== 'Go') {
			x.status = p.status
			if (p.net) x.net = p.net
			patched++
		} else {
			drop.add(String(x.id))
		}
	}

	if (drop.size) {
		for (let i = list.length - 1; i >= 0; i--) {
			if (drop.has(String(list[i].id))) list.splice(i, 1)
		}
	}
	console.log(`  · 陈旧状态：修正 ${patched} 条 / 剔除 ${drop.size} 条`)
}

/**
 * 宇航员中文名（nameZh）
 *
 * 862 条里 LL2 只给英文 name，搜「阿姆斯特朗」「加加林」完全搜不到
 * （utils/search-match.js 早就写好 nameZh 判断，缺的只是数据）。
 * 三顺位补齐，前者命中就不往下走：
 *   1. lib/astro-names-zh.json —— 427 个知名宇航员的人工译名，质量基线，零成本
 *   2. translate.getZh()       —— 翻译缓存里的历史结果（上一轮机翻的）
 *   3. 机翻                    —— 剩下的冷门名字，每轮限量，靠缓存跨轮累积
 *
 * 中国籍整条跳过：前端 CHINA_ASTRO_ZH 是权威表，而 astroName 里 nameZh 优先级
 * 更高，机翻拼音名（Yang Liwei → 杨立伟 之类）写进去反而会盖掉正确译名。
 */
const ASTRO_NAME_FILE = path.resolve(__dirname, 'lib', 'astro-names-zh.json')

/**
 * 每轮机翻上限。
 *
 * MyMemory 匿名限额约 1000 词/天，而名字平均 2 个词 —— 人工表外还剩 403 个名字
 * （约 800 词），一口气跑完刚好把当天配额烧光，一旦后半段撞限额就整批白跑。
 * 280 条按 2 并发 + 350ms 间隔算约 2 分钟，给 9 个 LL2 分页请求（约 80 秒）
 * 和图片镜像留出余量，不会顶到 sync.yml 的 30 分钟上限。
 * 翻成的结果落进 translation-cache.json 并回传 COS，下一轮从这里继续，
 * CI 每天一轮的话两轮补全。
 */
const ASTRO_NAME_LIMIT = 280

let astroNamesZh = null

function loadAstroNamesZh() {
	if (astroNamesZh) return astroNamesZh
	astroNamesZh = {}
	try {
		const obj = JSON.parse(fs.readFileSync(ASTRO_NAME_FILE, 'utf8'))
		for (const [k, v] of Object.entries(obj || {})) {
			if (k.startsWith('_') || typeof v !== 'string' || !v.trim()) continue
			astroNamesZh[k] = v
		}
		console.log(`  宇航员译名: 人工表 ${Object.keys(astroNamesZh).length} 条`)
	} catch (e) {
		// 表坏了就全走机翻，不能因此让 astronauts 数据集失败
		console.warn(`  ! 宇航员译名表不可读，本轮全走机翻: ${e.message}`)
	}
	return astroNamesZh
}

/** 译文里至少得有一个汉字，否则等于没翻（免费接口偶尔原样回吐英文） */
function hasHan(s) {
	return /[\u4e00-\u9fa5]/.test(s)
}

async function fillAstronautNames(list) {
	if (!Array.isArray(list) || !list.length) return

	const table = loadAstroNamesZh()
	const queue = []
	const queued = new Set()
	let hitTable = 0
	let hitCache = 0

	// 先给每条一个确定的 ''，避免后面漏掉留下 undefined（validate 会报）
	for (const a of list) {
		a.nameZh = ''
		const en = String(a.name || '').trim()
		if (!en || a.nation === 'China') continue

		const human = table[en]
		if (human) {
			a.nameZh = human
			hitTable++
			continue
		}

		const zh = translate.getZh(en)
		if (zh && hasHan(zh)) {
			a.nameZh = zh
			hitCache++
			continue
		}

		// 同名重复条目（极少数重名）只排一次队，省额度
		if (!queued.has(en)) {
			queued.add(en)
			queue.push(en)
		}
	}

	console.log(
		`  宇航员中文名: 人工 ${hitTable} / 缓存 ${hitCache} / 待翻 ${queue.length}（本轮上限 ${ASTRO_NAME_LIMIT}）`
	)

	if (!queue.length) return

	const batch = queue.slice(0, ASTRO_NAME_LIMIT)
	await translate.translateTexts(batch)

	// 机翻结果不直接返回，统一从缓存回读：getZh 出口还会跑一遍术语纠正
	let filled = 0
	const echoed = new Set()
	for (const a of list) {
		if (a.nameZh) continue
		const en = String(a.name || '').trim()
		if (!en || a.nation === 'China') continue
		const zh = translate.getZh(en)
		if (zh && hasHan(zh)) {
			a.nameZh = zh
			filled++
		} else if (zh) {
			// 译文里没有汉字 —— 纯人名最常见的失败形态是原样回吐英文
			echoed.add(zh)
		}
	}
	console.log(`  ✓ 宇航员本轮新增中文名 ${filled} 条`)

	// 原样回吐的条目在缓存里等于一条「已翻完」的假记录，下一轮会被当成命中
	// 直接跳过、永远不再重试。MyMemory 就是这种表现（它不做人名音译），
	// Google 会正常音译，所以少量回吐按个例处理：从缓存剔除，下一轮换后端再试。
	//
	// 但如果过半都在回吐（含 Google 中途被限流、整批转 MyMemory 的情况），
	// 说明这次的出口就是不认人名，此时剔除只会让同一批名字每轮都排在队首重翻、
	// 后面的名字永远轮不上，不如留在缓存里当「已知翻不出来」的标记，
	// nameZh 留空、前端回落英文原文。
	if (echoed.size && echoed.size < batch.length * 0.5) {
		const bag = translate.dumpCache()
		let dropped = 0
		for (const key of Object.keys(bag)) {
			const row = bag[key]
			if (row && echoed.has(row.zh)) {
				delete bag[key]
				dropped++
			}
		}
		console.log(`  · 机翻原样回吐 ${echoed.size} 条，已从缓存剔除待重试（${dropped} 条）`)
	} else if (echoed.size) {
		console.warn(`  ! ${echoed.size} 个名字机翻原样回吐，本轮后端不做人名音译，先留空`)
	}
}

/**
 * 宇航员「浅字段」：列表卡片能显示出来的全部内容。
 *
 * 启动页「此刻在天上」= 头像 + 名字 + 在轨天数，名字走 format.js 的 astroName
 * （优先 nameZh，其次中国籍查本地表，兜底英文原文），所以卡片版要 img。
 *
 * 搜索页的结果行也带头像（68rpx 圆图，无图静默不显示）：不加 img 的话，
 * 轻量集上线后搜索结果会突然比「404 降级到全量库」那条路径少一圈头像，
 * 看起来像功能回归。862 条约 +80KB，换搜索页懒加载时多这 80KB 是值的。
 * 其余字段（missions 280KB / evas 96KB / bio+bioZh / wiki）只有详情页要，
 * 详情页本来就是拿 id 单独进 /pages/astronaut，不该让列表替它下载。
 *
 * 注意机构字段原名是 `agencyName`（slim.js:544），中文名在前端用 agencyLabel
 * 查表；线上 862 条的 nationZh / agencyZh 仍为空，不能挑这两个。
 * nameZh 是本仓库回填的（见 fillAstronautNames），必须带上 —— 搜索页靠它命中
 * 「阿姆斯特朗」这类中文词，缺了等于回到只能搜英文的老样子。
 */
const ASTRO_CARD_FIELDS = ['id', 'name', 'nameZh', 'nation', 'agencyName', 'days', 'inSpace', 'img']
const ASTRO_SEARCH_FIELDS = ['id', 'name', 'nameZh', 'nation', 'agencyName', 'days', 'inSpace', 'img']

function pickFields(fields) {
	return (a) => {
		const o = {}
		for (const k of fields) o[k] = a[k]
		return o
	}
}

const DATASETS = {
	/**
	 * 发射工位（pad）全量：/pads/ 共 251 条，**必须翻页**。
	 * 实测服务端把 limit 截到 100（limit=300 也只回 100 条），
	 * 早先按"一页拉完"写，结果只入库 100 个工位、少了 151 个。
	 * 变化极慢，每天刷一次足够；pad 详情页（地图 + 累计发射数）用。
	 * map_image 全量镜像首轮较慢，之后按 hash 跳过已上传、几乎零成本。
	 */
	pads: {
		file: 'pads.json',
		cacheControl: 'public, max-age=86400',
		// 工位简介也回填中文：251 条按原文哈希永久缓存，只有首轮是新翻译
		localize: localizePads,
		images: ['image', 'map_image'],
		async fetch() {
			const all = []
			let offset = 0
			let count = 0

			for (;;) {
				const j = await getJson(`/pads/?limit=100&offset=${offset}&mode=normal&format=json`)
				count = j.count
				all.push(...j.results)
				offset += j.results.length
				if (!j.next || j.results.length === 0 || offset >= count) break
				if (offset > 600) throw new Error('工位分页异常，已超过 600 条')
			}

			return { count, list: all.map(slimPad) }
		}
	},

	upcoming: {
		file: 'launches-upcoming.json',
		cacheControl: 'public, max-age=300',
		localize: localizeLaunches,
		// 发射结束后 LL2 的状态会滞后几小时，「飞行中」会一直挂在列表上，
		// 先清一遍陈旧状态再走中文化
		prune: pruneStaleUpcoming,
		// pad.map_image 是详情页「发射场地」卡的地图，按 750px 单独一档压。
		// imageThumb / pad.image / pad.imageThumb 三个字段以前没列进来，
		// 结果一直指向 LL2 海外域名 —— 而媒体聚合（火箭页轮播、媒体页、发射页
		// 轮播的补充图）首选的就是 imageThumb，等于那些图全是跨洋加载。
		// 它们与 image 同源同值，memo 按「URL+预设」命中同一份产物，不额外占空间。
		images: [
			'image',
			'imageThumb',
			'pad.image',
			'pad.imageThumb',
			{ path: 'infographic', preset: 'large' },
			{ path: 'pad.map_image', preset: 'map' }
		],
		enrich: true,
		async fetch() {
			// limit=100 仍然是 1 个请求，和原来的 limit=50 同价，首屏条数直接翻倍
			const j = await getJson('/launches/upcoming/?limit=100&mode=normal&format=json')
			return { count: j.count, list: j.results.map(slimLaunch) }
		}
	},

	/**
	 * 即将发射的后续排期（第 100 条之后）。
	 *
	 * LL2 的 upcoming 共有 476 条，主快照只取前 100 条（每 15 分钟刷一次）。
	 * 后面的 376 条变化很慢，单独拉一个文件、每天更新一次，
	 * 首页下拉到底时加载它 —— 这样不会因为「多拉 4 页」把 15 次/小时的配额吃光。
	 */
	upcomingMore: {
		file: 'launches-upcoming-more.json',
		cacheControl: 'public, max-age=21600',
		// 只翻任务名：400 条连描述一起翻会顶破 CI 的 15 分钟上限
		localize: localizeLaunchNames,
		// 这个数据集只用于「翻到底加载后续排期」的列表，卡片只显示 image；
		// imageThumb 一起镜像（同源同产物，零额外成本），pad 的两个字段仍不碰 ——
		// 376 条里 160 张工位图，为列表页看不到的东西白烧流量不值
		images: ['image', 'imageThumb', { path: 'infographic', preset: 'large' }],
		async fetch() {
			const all = []
			let count = 0

			for (let offset = 100; offset < 600; offset += 100) {
				const j = await getJson(
					`/launches/upcoming/?limit=100&offset=${offset}&mode=normal&format=json`
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}

			return { count: all.length, list: all.map(slimLaunch) }
		}
	},
	previous: {
		file: 'launches-previous.json',
		cacheControl: 'public, max-age=3600',
		localize: localizeLaunches,
		images: [
			'image',
			'imageThumb',
			'pad.image',
			'pad.imageThumb',
			{ path: 'infographic', preset: 'large' },
			{ path: 'pad.map_image', preset: 'map' }
		],
		enrich: true,
		async fetch() {
			// limit=100 仍是 1 个请求，和 limit=50 同价：已发射页首屏翻倍，
			// stats 的数据源也随之变大（stats 会读这个文件）
			const j = await getJson('/launches/previous/?limit=100&mode=normal&format=json')
			return { count: j.count, list: j.results.map(slimLaunch) }
		}
	},
	events: {
		file: 'events.json',
		cacheControl: 'public, max-age=300',
		localize: localizeEvents,
		images: ['feature_image'],
		async fetch() {
			const j = await getJson('/events/upcoming/?limit=50&format=json')
			return { count: j.count, list: j.results.map(slimEvent) }
		}
	},
	agencies: {
		file: 'agencies.json',
		// 机构图很少变，缓存一天；图片本身在 COS 上是一年
		cacheControl: 'public, max-age=86400',
		localize: localizeAgencies,
		images: ['image_url', 'logo_url'],
		// 机构是全项目唯一需要真翻页的：实测 count=350，limit=100 → 4 页
		// 每天只跑一次，4 个请求可以接受
		async fetch() {
			const all = []
			let offset = 0
			let count = 0

			for (;;) {
				const j = await getJson(`/agencies/?limit=100&offset=${offset}&format=json`)
				count = j.count
				all.push(...j.results)
				offset += j.results.length
				if (!j.next || j.results.length === 0 || offset >= count) break
				if (offset > 1000) throw new Error('机构分页异常，已超过 1000 条')
			}

			return { count, list: all.map(slimAgency) }
		}
	},

	/**
	 * 火箭型号库
	 *
	 * 端点必须是 `/launcher_configurations/`（带下划线）—— `/configurations/`
	 * 和 `/rocket-configurations/` 都是 404，之前据此误判「LL2 没有型号数据」。
	 * 技术参数（长度/直径/起飞质量/运力）**只在 mode=detailed 下返回**。
	 *
	 * 532 个型号、limit=100 → 6 页，型号参数几乎不变，每天跑一次足够。
	 * 图片全量镜像（约 400 张有图）：详情页的「不同构型」把同系列各型号并排列出，
	 * 只给现役留图的话，Falcon 9 v1.0 / Block 4 这些恰恰全成了占位图。
	 * 镜像按 COS 上是否已存在跳过，只有首次要下满，之后每天只做 headObject。
	 */
	launchers: {
		file: 'launchers.json',
		cacheControl: 'public, max-age=86400',
		images: ['image'],
		// 用发射记录补型号数据：缺图的补图，并把常用发射场聚合进来
		fromLaunches: enrichLaunchersFromLaunches,
		// 型号简介回填中文：471 条，首轮 20 万字符，之后按原文哈希零命中。
		// 详情页「简介」卡片只有这一段正文，不翻就永远是英文段落。
		localize: localizeLaunchers,
		async fetch() {
			const all = []
			let count = 0

			for (let offset = 0; offset < 700; offset += 100) {
				const j = await getJson(
					`/launcher_configurations/?limit=100&offset=${offset}&mode=detailed&format=json`
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}

			return { count, list: all.map(slimLauncher) }
		}
	},

	cores: {
		file: 'cores.json',
		cacheControl: 'public, max-age=86400',
		images: ['img'],
		localize: localizeCores,
		/**
		 * 芯级个体库：196 枚、limit=100 → 2 页。flights / launcher_config
		 * 只在 detailed 下返回（normal 里没有），好在 detailed 也不重，
		 * 实测一页 100 条约 1 分钟，每天一轮 2 个请求。
		 */
		async fetch() {
			const all = []
			let count = 0

			for (let offset = 0; offset < 500; offset += 100) {
				const j = await getJson(
					`/launchers/?limit=100&offset=${offset}&mode=detailed&format=json`
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}

			return { count, list: all.map(slimCore) }
		}
	},

	astronauts: {
		file: 'astronauts.json',
		cacheControl: 'public, max-age=86400',
		images: ['img'],
		localize: localizeAstronauts,
		// 英文名 → 中文名，人工表 + 缓存 + 限量机翻（见 fillAstronautNames）
		fillNames: fillAstronautNames,
		/**
		 * 宇航员库：862 人、limit=100 → 9 页。detailed 才有 in_space /
		 * time_in_space / bio 这些字段。单页实测约 8 秒，每天一轮可接受。
		 * 首页「此刻在天上」卡片筛 in_space=true； bio 只保留了在轨的
		 * 十几个人，翻译量也可控。
		 */
		async fetch() {
			const all = []
			let count = 0

			for (let offset = 0; offset < 1200; offset += 100) {
				const j = await getJson(
					`/astronauts/?limit=100&offset=${offset}&mode=detailed&format=json`
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}

			return { count, list: all.map(slimAstronaut) }
		},
		/**
		 * 两个派生轻量产物（主文件 719KB 对这两个页面都是白拉）：
		 *   astronauts-inspace.json 启动页用，只留 inSpace 的十来条（实测 11 条 / 2.2KB）
		 *   astronauts-search.json  搜索页用，862 条浅字段
		 *                           （172.7KB 含头像；带上 nameZh 后约 192KB）
		 * 三个文件在同一轮里生成，generatedAt 共用同一个时间戳。
		 */
		derive: [
			{
				file: 'astronauts-inspace.json',
				dataset: 'astronautsInspace',
				filter: (a) => a.inSpace === true,
				pick: pickFields(ASTRO_CARD_FIELDS)
			},
			{
				file: 'astronauts-search.json',
				dataset: 'astronautsSearch',
				pick: pickFields(ASTRO_SEARCH_FIELDS)
			}
		]
	},

	// 空间站（/space_stations/，mode=detailed，仅 15 个，一页抓完）。
	// 注意 LL2 2.3.0 的端点名是 space_stations（带下划线），不是 spacestations（404）。
	// active_expeditions 在 detailed 才有，含当前乘组；description 翻中文。
	spacestations: {
		file: 'spacestations.json',
		cacheControl: 'public, max-age=86400',
		images: ['img'],
		localize: localizeStations,
		async fetch() {
			const j = await getJson('/space_stations/?limit=100&mode=detailed&format=json')
			const all = j.results || []
			return { count: all.length, list: all.map(slimStation) }
		}
	},

	// 远征队（/expeditions/，mode=detailed，165 条，2 页）。crew 已内联宇航员，详情页直接渲染。
	expeditions: {
		file: 'expeditions.json',
		cacheControl: 'public, max-age=86400',
		images: [],
		async fetch() {
			const all = []
			let count = 0
			for (let offset = 0; offset < 1200; offset += 100) {
				const j = await getJson(
					`/expeditions/?limit=100&offset=${offset}&mode=detailed&format=json`
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}
			return { count, list: all.map(slimExpedition) }
		}
	},

	// 对接事件（/docking_events/，mode=detailed）。每条是「飞船→空间站」一次对接，
	// 详情页按 stationId 过滤展示某站的对接史。数量未知，上限 2000 防御。
	// 分页可能较多，开启 429 退避重试：匿名限额按小时滚动，等 30s 常能救回下一页。
	dockings: {
		file: 'dockings.json',
		cacheControl: 'public, max-age=86400',
		images: [],
		async fetch() {
			const all = []
			let count = 0
			for (let offset = 0; offset < 2000; offset += 100) {
				const j = await getJson(
					`/docking_events/?limit=100&offset=${offset}&mode=detailed&format=json`,
					{ retryOn429: true, backoffMs: 30000, retries: 1 }
				)
				count = j.count
				const results = j.results || []
				all.push(...results)
				if (!results.length || offset + results.length >= count) break
			}
			return { count, list: all.map(slimDocking) }
		}
	},

	stats: {
		// 输出的是「按年聚合好的结果」，不是原始数据
		file: 'stats-years.json',
		cacheControl: 'public, max-age=21600',
		async fetch() {
			// 不再自己拉 LL2：全量历史要 77 页请求，配额根本不够。
			// 直接用「最新快照 + 历史归档分片」，两者都是已有的数据。
			//
			// 归档是逐小时补齐的，所以这份统计会随着归档自动变全，
			// 代码不用改 —— 这就是把聚合放在 CI 侧的好处。
			let recent = []
			try {
				const p = await readCosJson('space-data/launches-previous.json')
				recent = p.list || []
			} catch (e) {
				console.warn('  ! 读取最新快照失败，只用归档数据: ' + e.message)
			}

			let archived = []
			try {
				const idx = await readCosJson('space-data/history/index.json')
				for (const page of idx.pages || []) {
					const d = await readCosJson('space-data/history/' + page.file)
					archived = archived.concat(d.list || [])
				}
				console.log(`  统计来源: 最新 ${recent.length} 条 + 归档 ${archived.length} 条`)
			} catch (e) {
				console.warn('  ! 读取归档分片失败，只用最新快照: ' + e.message)
			}

			const all = recent.concat(archived)
			const years = aggregateByYear(all)

			// list 装的是年份统计行，validate 只检查里面有没有 undefined，能通过
			return { count: all.length, list: years }
		}
	},

	/**
	 * 往年今日（今日页第 4 块）
	 *
	 * 数据源与 stats 完全一致：最新快照 + 历史归档分片。
	 * 那边要按年聚合，这边要按「月-日」筛今天 —— 同一个代价（读一遍全部归档），
	 * 所以每天的 cron 紧跟在 stats 后面（UTC 03:45 / 北京 11:45）。
	 *
	 * 不消耗 LL2 配额：只读自家 COS 上的两个已有数据集。
	 * 归档每小时在往前补，所以「50 年前的今天」会随着归档推进自己冒出来，
	 * 代码不用改。
	 */
	onthisday: {
		file: 'onthisday.json',
		// 一天只变一次，但跨小时后前端可能还拿着昨天的（北京时间 0 点换日），
		// 给 1 小时，比 6 小时更能及时换到新的一天
		cacheControl: 'public, max-age=3600',
		// 归档里的图是原图地址，真机加载不出来，和发射快照一样统一镜像成 COS 缩略图
		images: ['img'],
		async fetch() {
			let recent = []
			try {
				const p = await readCosJson('space-data/launches-previous.json')
				recent = p.list || []
			} catch (e) {
				console.warn('  ! 读取最新快照失败，只用归档数据: ' + e.message)
			}

			let archived = []
			try {
				const idx = await readCosJson('space-data/history/index.json')
				for (const page of idx.pages || []) {
					const d = await readCosJson('space-data/history/' + page.file)
					archived = archived.concat(d.list || [])
				}
			} catch (e) {
				console.warn('  ! 读取归档分片失败，只用最新快照: ' + e.message)
			}

			const { md, list } = pickOnThisDay(recent.concat(archived), Date.now())
			console.log(`  往年今日: ${md} · 来源 ${recent.length + archived.length} 条 · 命中 ${list.length} 条`)

			return { count: list.length, list }
		}
	}
}

function parseArgs(argv) {
	const out = { dataset: 'all', base: 'prod' }
	for (const a of argv.slice(2)) {
		let m = a.match(/^--dataset=(.+)$/)
		if (m) out.dataset = m[1]
		m = a.match(/^--base=(dev|prod)$/)
		if (m) out.base = m[1]
	}
	return out
}

/** 递归找出 undefined 值 —— 裁剪函数写错时最容易产生 undefined，序列化后会变 null */
function findUndefined(value, prefix, bag) {
	if (value === undefined) {
		bag.push(prefix || '(root)')
		return
	}
	if (value === null || typeof value !== 'object') return
	if (Array.isArray(value)) {
		value.forEach((v, i) => findUndefined(v, `${prefix}[${i}]`, bag))
		return
	}
	for (const k of Object.keys(value)) {
		findUndefined(value[k], prefix ? `${prefix}.${k}` : k, bag)
	}
}

// 允许空结果的数据集。onthisday 是「往年今日」，归档还没补到 365 天全覆盖时
// 某些日期确实可能一条都没有 —— 那是正常结果，不是抓取失败。
const ALLOW_EMPTY = new Set(['onthisday'])

function validate(name, list) {
	if (!Array.isArray(list) || list.length === 0) {
		if (ALLOW_EMPTY.has(name)) return
		throw new Error(`${name}: list 为空，抓取可能失败`)
	}

	const bad = []
	list.forEach((item, i) => findUndefined(item, `[${i}]`, bad))
	if (bad.length) {
		throw new Error(`${name}: 存在 undefined 字段 → ${bad.slice(0, 5).join(', ')}`)
	}

	// 抽样检查关键字段是否为空，防止 API 结构变更导致整页空白
	const first = list[0]
	if (name === 'upcoming' || name === 'previous') {
		const required = ['id', 'name', 'net']
		const missing = required.filter((k) => !first[k])
		if (missing.length) throw new Error(`${name}: 关键字段缺失 ${missing.join(', ')}`)
		if (!first.status.name) throw new Error(`${name}: status.name 为空`)
		if (!first.rocket.configuration.name) throw new Error(`${name}: rocket.configuration.name 为空`)
	}
}

async function runDataset(name) {
	const ds = DATASETS[name]
	if (!ds) throw new Error(`未知数据集: ${name}`)

	const started = Date.now()
	const { count, list } = await ds.fetch()

	validate(name, list)

	// 陈旧状态清理：必须在 localize 之前 —— 从 previous 顶上来的 status
	// 是英文对象，还要走一遍中文化
	if (ds.prune) {
		try {
			await ds.prune(list, readCosJson)
		} catch (e) {
			console.warn(`  ! 陈旧状态清理失败（不影响其它字段）: ${e.message}`)
		}
	}

	// 中文化必须在写 JSON 之前完成，这样 COS 上的快照本身就带中文，
	// 小程序端不需要任何翻译逻辑，也没有额外请求
	if (ds.localize) {
		try {
			await ds.localize(list)
		} catch (e) {
			// 翻译是增强项，失败不能拖垮整个同步
			console.warn(`  ! 中文回填失败，本次仍输出英文: ${e.message}`)
		}
	}

	// 宇航员中文名：翻译全挂了也只能让 nameZh 退化成空串，
	// 绝不能让 astronauts 这份数据集整体失败（搜索会连带掉回只能搜英文）
	if (ds.fillNames) {
		try {
			await ds.fillNames(list)
		} catch (e) {
			console.warn(`  ! 宇航员中文名回填失败（本轮 nameZh 全空）: ${e.message}`)
		}
		for (const item of list) {
			if (typeof item.nameZh !== 'string') item.nameZh = ''
		}
	}

	// 火箭技术参数：launchers.json 是每天一刷的低频快照，发射快照却是高频的，
	// 在这里 join 一次，前端拿到的每条发射就自带参数，详情页零额外请求
	if (ds.enrich) {
		try {
			await enrichRockets(list, readCosJson)
		} catch (e) {
			console.warn(`  ! 火箭参数回填失败（详情页退化为只有型号名）: ${e.message}`)
		}
	}

	// 型号数据反哺：必须在 mirrorImages 之前，补进来的原始 URL 还要走一遍镜像
	if (ds.fromLaunches) {
		try {
			await ds.fromLaunches(list, readCosJson)
		} catch (e) {
			console.warn(`  ! 发射记录反哺失败（不影响其它字段）: ${e.message}`)
		}
	}

	// 图片统一换成 COS 上的缩略图地址：原域名没备案，真机加载不出来；
	// 而且原图太大，直接走 COS 流量会把预算吃穿
	if (ds.images) {
		try {
			await mirrorImages(list, ds.images)
		} catch (e) {
			console.warn(`  ! 图片镜像失败，保留原始地址: ${e.message}`)
		}
	}

	// 主文件与派生产物必须共用这一个时间戳：前端靠 generatedAt 判断
	// 「线上是否已更新」（data.js 的 refreshInBackground 里比对），
	// 各取一次 new Date() 会让三个文件的更新时刻对不上
	const generatedAt = new Date().toISOString()

	const payload = {
		v: DATA_VERSION,
		dataset: name,
		generatedAt,
		count: count ?? list.length,
		served: list.length,
		list
	}

	const filePath = path.join(OUT_DIR, ds.file)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')

	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(`  → ${ds.file}  ${list.length} 条 / ${kb} KB / ${((Date.now() - started) / 1000).toFixed(1)}s`)

	await upload(filePath, `space-data/${ds.file}`, ds.cacheControl)

	// 派生产物：从刚生成的全量 list 里裁，独立落盘 + 独立上传
	// （上传是逐个文件显式调的，不是扫 dist 目录，漏一条就上不去）
	for (const d of ds.derive || []) {
		const sub = (d.filter ? list.filter(d.filter) : list).map(d.pick)
		const body = { v: DATA_VERSION, dataset: d.dataset, generatedAt, count: sub.length, list: sub }
		const subPath = path.join(OUT_DIR, d.file)
		fs.writeFileSync(subPath, JSON.stringify(body), 'utf8')

		const subKb = (fs.statSync(subPath).size / 1024).toFixed(1)
		console.log(`  → ${d.file}  ${sub.length} 条 / ${subKb} KB`)

		await upload(subPath, `space-data/${d.file}`, ds.cacheControl)
	}

	return { name, count: payload.count, served: payload.served, kb, file: ds.file }
}

(async () => {
	const { dataset, base } = parseArgs(process.argv)

	// 切到开发端点：本地反复调试不消耗正式配额（15 次/小时按 IP 计，很容易烧光）
	if (base === 'dev') {
		process.env.LL2_BASE = 'dev'
		console.log('\n⚠️  使用开发端点 lldev（不限速，但数据可能陈旧），仅用于联调')
	}

	// 时间线是「逐条抓单条详情」的独立流程，产物也不是 list 而是按 id 索引的 map，
	// 塞不进 DATASETS 的通用管线，单独走一条分支
	if (dataset === 'timeline') {
		fs.mkdirSync(OUT_DIR, { recursive: true })
		console.log('\n=== 同步 timeline ===')
		const r = await runTimelines()
		console.log('\n=== 汇总 ===')
		console.log(`  timelines.json  新增 ${r.added} 条 / 空 ${r.empty} / 失败 ${r.failed} / 累计 ${r.total} 条`)
		return
	}

	// 视频同理，而且更麻烦：只有 mode=detailed 才返回 vid_urls，
	// 体积大、响应慢，必须单独按页抓，不能混进普通同步
	if (dataset === 'video') {
		fs.mkdirSync(OUT_DIR, { recursive: true })
		console.log('\n=== 同步 video ===')
		const r = await runVideos()
		console.log('\n=== 汇总 ===')
		console.log(`  videos.json  本轮扫 ${r.got} / 新增有视频 ${r.withVid} / 失败 ${r.failed} / 累计 ${r.total} 条`)
		return
	}

	// 原图全量补齐 + 全量图库分片。与 video 一样靠游标循环慢慢扫全量，
	// 独立 cron（每小时）的原因见 sync.yml 头部的请求预算表
	if (dataset === 'images') {
		fs.mkdirSync(OUT_DIR, { recursive: true })
		console.log('\n=== 同步 images（原图全量 + gallery 分片） ===')
		const im = await runImages()
		console.log(
			`  gallery  本轮扫到 ${im.rows} 条 / 图库累计 ${im.total} 张唯一图 / ${im.chunks || 0} 片${im.rejected ? '（拒传）' : ''}`
		)
		return
	}

	const targets = dataset === 'all' ? Object.keys(DATASETS) : [dataset]

	if (targets.some((t) => !DATASETS[t])) {
		console.error(`未知数据集: ${dataset}，可选 ${Object.keys(DATASETS).join(' / ')} / timeline / video / images / all`)
		process.exit(2)
	}

	fs.mkdirSync(OUT_DIR, { recursive: true })

	// 先读翻译缓存：CI 每次都是全新容器，不读的话每轮都要全量重翻，必然撞限额
	await translate.loadCache()

	console.log(`\n=== 同步 ${targets.join(', ')} ===`)
	const summary = []
	let failed = false

	for (const name of targets) {
		try {
			summary.push(await runDataset(name))
		} catch (e) {
			failed = true
			console.error(`  ✗ ${name} 失败: ${e.message}`)
		}
	}

	console.log('\n=== 汇总 ===')
	for (const s of summary) {
		console.log(`  ${s.file.padEnd(26)} ${String(s.served).padStart(3)}/${String(s.count).padEnd(5)} 条  ${s.kb} KB`)
	}

	// 翻译缓存要回传 COS，否则下一轮 CI 又是零命中
	const t = translate.summary()
	console.log(
		`\n  翻译: 命中缓存 ${t.hit} / 新翻成功 ${t.ok} / 失败 ${t.fail} / 缓存池 ${t.cached} 条` +
			(t.quotaExhausted ? '  ⚠️ 配额已用尽，剩余条目下轮再补' : '')
	)

	if (t.dirty) {
		const cachePath = translate.saveCache()
		try {
			await upload(cachePath, 'space-data/translation-cache.json', 'public, max-age=3600')
		} catch (e) {
			console.warn('  ! 翻译缓存上传失败（不影响数据）: ' + e.message)
		}
	}

	// 品牌资源也放一份到 COS。
	// 小程序端仍然读 static/logo.png（本地资源零请求、首屏秒出，18KB 也没必要走网络），
	// COS 这份是给后续 H5、分享页、或其他端复用的，不参与小程序渲染。
	if (dataset === 'all' || dataset === 'agencies') {
		const logoPath = path.resolve(__dirname, '..', 'static', 'logo.png')
		if (fs.existsSync(logoPath)) {
			try {
				await upload(logoPath, 'brand/logo.png', 'public, max-age=604800', 'image/png')
			} catch (e) {
				console.warn('  ! logo 上传失败（不影响数据）: ' + e.message)
			}
		}
	}

	if (failed) {
		console.error('\n部分数据集失败，退出码 1')
		process.exit(1)
	}

	console.log('\n全部完成\n')
})().catch((e) => {
	console.error('未捕获异常:', e)
	process.exit(1)
})
