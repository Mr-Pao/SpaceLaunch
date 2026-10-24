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
	slimLauncher } = require('./lib/slim')
const { aggregateByYear } = require('./lib/aggregate')
const { upload } = require('./lib/cos')
const { localizeLaunches, localizeLaunchNames, localizeEvents, localizeAgencies, localizePads, localizeLaunchers } = require('./lib/localize')
const { mirrorImages } = require('./lib/image')
const translate = require('./lib/translate')

const OUT_DIR = path.resolve(__dirname, '..', 'dist')
// v3: 图片改为 COS 托管的缩略图地址，旧缓存里的原图 URL 真机加载不出来
// v4: launch 增加 mission.name / mission.orbit / probability / weather_concerns /
//     failreason / infographic
// v5: 增加发射窗口 window_start/end、四类累计发射次数、火箭系列与型号代号
// v6: 增加 mission.nameZh（任务名中文），标题不再整行英文
// v7: stats 增加 id / name / site（发射场），支撑年度回顾
// v8: stats 改为「按年预聚合」输出，不再下发原始数据；数据源换成最新快照 + 历史归档
const DATA_VERSION = 9

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
		images: ['image', { path: 'infographic', preset: 'large' }],
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
		images: ['image', { path: 'infographic', preset: 'large' }],
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
		images: ['image', { path: 'infographic', preset: 'large' }],
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

function validate(name, list) {
	if (!Array.isArray(list) || list.length === 0) {
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

	// 图片统一换成 COS 上的缩略图地址：原域名没备案，真机加载不出来；
	// 而且原图太大，直接走 COS 流量会把预算吃穿
	if (ds.images) {
		try {
			await mirrorImages(list, ds.images)
		} catch (e) {
			console.warn(`  ! 图片镜像失败，保留原始地址: ${e.message}`)
		}
	}

	const payload = {
		v: DATA_VERSION,
		dataset: name,
		generatedAt: new Date().toISOString(),
		count: count ?? list.length,
		served: list.length,
		list
	}

	const filePath = path.join(OUT_DIR, ds.file)
	fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')

	const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
	console.log(`  → ${ds.file}  ${list.length} 条 / ${kb} KB / ${((Date.now() - started) / 1000).toFixed(1)}s`)

	await upload(filePath, `space-data/${ds.file}`, ds.cacheControl)

	return { name, count: payload.count, served: payload.served, kb, file: ds.file }
}

(async () => {
	const { dataset, base } = parseArgs(process.argv)
	const targets = dataset === 'all' ? Object.keys(DATASETS) : [dataset]

	if (targets.some((t) => !DATASETS[t])) {
		console.error(`未知数据集: ${dataset}，可选 ${Object.keys(DATASETS).join(' / ')} / all`)
		process.exit(2)
	}

	// 切到开发端点：本地反复调试不消耗正式配额（15 次/小时按 IP 计，很容易烧光）
	if (base === 'dev') {
		process.env.LL2_BASE = 'dev'
		console.log('\n⚠️  使用开发端点 lldev（不限速，但数据可能陈旧），仅用于联调')
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
