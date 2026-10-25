#!/usr/bin/env node
'use strict'

/**
 * 纯函数离线断言（可维护性 9）
 *
 * verify-slim.js 要拉真实的 LL2 数据、烧正式配额；
 * 这里给 aggregate.js / format.js 这类不联网就能测的纯函数补断言，
 * 改动它们之后本地跑一遍即可，CI / 日常都零成本：
 *
 *   node scripts/verify-pure.js
 *
 * format.js 是 ESM（uni-app 前端模块），CJS 里不能直接 require，
 * 复制成 .mjs 后用动态 import 加载 —— 同样不联网。
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { pathToFileURL } = require('url')

const { aggregateByYear } = require('./lib/aggregate')

let passed = 0
let failed = 0

function eq(actual, expected, label) {
	const a = JSON.stringify(actual)
	const b = JSON.stringify(expected)
	if (a === b) {
		passed++
		console.log('  ✓ ' + label)
	} else {
		failed++
		console.error(`  ✗ ${label}\n      期望: ${b}\n      实际: ${a}`)
	}
}

// ---------- aggregateByYear ----------

console.log('[aggregate] aggregateByYear')

const SLIM_LAUNCH = {
	// slimLaunch 形态：status 是对象、rocket.configuration、pad.location
	id: 1,
	name: 'Alpha-1',
	net: '2026-03-15T10:00:00Z',
	status: { abbrev: 'Success' },
	rocket: { configuration: { name: 'Falcon 9' } },
	pad: { location: { name: 'Cape Canaveral' } },
	mission: { orbit: { name: 'LEO' } },
	launch_service_provider: { name: 'SpaceX' }
}

const SLIM_STAT_LAUNCH = {
	// slimStatLaunch 形态（旧分片历史上混过）：status 是字符串、rocket 是字符串、site
	id: 2,
	name: 'Alpha-2',
	net: '2026-06-02T08:00:00Z',
	status: 'Failure',
	rocket: 'Electron',
	site: 'Mahia',
	orbit: 'Sub',
	launch_service_provider: 'Rocket Lab'
}

const years = aggregateByYear([SLIM_LAUNCH, SLIM_STAT_LAUNCH])

eq(years.length, 1, '两条同年的记录聚成一行')
const row = years[0]
eq(row.year, 2026, '年份取自 net')
eq(row.total, 2, 'total = 2')
eq(row.success, 1, 'Success 计入 success')
eq(row.fail, 1, 'Failure 计入 fail')
eq(row.orbital, 1, 'Suborbitals 不算入轨道（total - sub = 1）')
eq(row.sub, 1, 'Suborbitals 单独计数')
eq(row.months[2], 1, '3 月 1 次')
eq(row.months[5], 1, '6 月 1 次')
eq(row.rockets[0], { name: 'Falcon 9', count: 1 }, '对象形态的 rocket 被拍平')
eq(row.sites.some((s) => s.name === 'Mahia'), true, '字符串形态的 site 也被拍平')
eq(row.failures.length, 1, '失败任务进入 failures')
eq(row.failures[0].status, 'Failure', 'failures.status 取的是拍平后的字符串')

eq(aggregateByYear([]), [], '空输入 → 空输出')
eq(aggregateByYear([{ net: '不是日期' }]), [], '非法日期被跳过')
eq(aggregateByYear([null, undefined]), [], 'null 条目被跳过')

// ---------- format.js（ESM，复制成 .mjs 动态 import）----------

async function testFormat() {
	console.log('[format] 纯函数')
	const tmp = path.join(os.tmpdir(), 'sl-format-check.mjs')
	fs.copyFileSync(path.join(__dirname, '..', 'utils', 'format.js'), tmp)
	const f = await import(pathToFileURL(tmp).href)

	// relativeTime：一律向下取整（P2-8 的回归测试）
	const now = Date.now()
	eq(f.relativeTime(now - 1.6 * 86400000), '1 天前', '1.6 天前 → 「1 天前」（floor，不进位）')
	eq(f.relativeTime(now - 0.5 * 86400000), '12 小时前', '半天前按小时显示')
	eq(f.relativeTime(now + 2.9 * 86400000), '2 天后', '2.9 天后 → 「2 天后」')
	eq(f.relativeTime(now - 90 * 1000), '1 分钟前', '90 秒前 → 「1 分钟前」')
	eq(f.relativeTime(now - 30 * 1000), '即将发射', '不足 1 分钟 → 「即将发射」（既定边界）')
	eq(f.relativeTime('垃圾输入'), '时间待定', '解析不了 → 时间待定')

	eq(f.truncate('abcdef', 4), 'abcd…', 'truncate 截断补省略号')
	eq(f.truncate('ab', 4), 'ab', 'truncate 不超长原样返回')
	eq(f.truncate('', 4), '', 'truncate 空串')

	eq(f.isStillUpcoming({ net: new Date(now + 86400000).toISOString() }), true, '未来 → 仍在排期')
	eq(
		f.isStillUpcoming({ net: new Date(now - 86400000).toISOString(), status: { abbrev: 'Success' } }),
		false,
		'过去 + 终态 → 已不在排期'
	)
	eq(
		f.isStillUpcoming({ net: new Date(now - 86400000).toISOString(), status: { abbrev: 'Go' } }),
		true,
		'过去 + 状态未定（多半是推迟了 LL2 没更新）→ 保留'
	)

	// rocketName：长征系列走规则推导（44 个变体不逐个查表），其余保留原文
	eq(f.rocketName({ name: 'Long March 2C' }), '长征二号丙', '长征规则：2C → 二号丙')
	eq(f.rocketName({ name: 'Long March 3B/E' }), '长征三号乙/E', '长征规则：3B/E 保留构型后缀')
	eq(f.rocketName({ name: 'Long March 2F/G' }), '长征二号F/G', '长征规则：F 保留原字母不转「己」')
	eq(f.rocketName({ name: 'Long March 5B' }), '长征五号B', '长征五号B 是构型不是「乙」，查表钉死')
	eq(f.rocketName({ name: 'Long March 12A' }), '长征十二号甲', '长征规则：两位数字 + 甲')
	eq(f.rocketName({ name: 'Long March 8 (Core Only)' }), '长征八号（仅芯级）', '长征规则：仅芯级补注')
	eq(f.rocketName({ name: 'Long March' }), '长征', '长征规则：无编号不产生「长征号」')
	eq(f.rocketName({ name: 'Falcon 9 Block 5' }), 'Falcon 9 Block 5', '非中国型号保留英文原文')
	eq(f.rocketName({ full_name: 'Long March 5', name: 'Long March' }), '长征五号', 'full_name 优先于 name')

	// countryOf：国家只能从 pad.location.name 的末段推，末段不一定是国家名
	const loc = (name) => ({ pad: { location: { name } } })
	eq(f.countryOf(loc('Vandenberg SFB, CA, USA')), '美国', '国家：USA → 美国')
	eq(f.countryOf(loc('United States')), '美国', '国家：单段 United States 也命中')
	eq(f.countryOf(loc("Jiuquan, People's Republic of China")), '中国', '国家：PRC → 中国')
	eq(f.countryOf(loc('Haiyang Oriental Spaceport')), '中国', '国家：海上发射场归中国')
	eq(f.countryOf(loc('Mahia Peninsula, New Zealand')), '新西兰', '国家：新西兰')
	eq(f.countryOf(loc('Baikonur Cosmodrome, Republic of Kazakhstan')), '哈萨克斯坦', '国家：拜科努尔')
	eq(f.countryOf(loc('Plesetsk Cosmodrome, Russian Federation')), '俄罗斯', '国家：俄罗斯')
	eq(f.countryOf(loc('Kourou, French Guiana')), '法属圭亚那', '国家：法属圭亚那')
	eq(f.countryOf(loc('Andøya Spaceport')), '挪威', '国家：末段是发射场名也要能认')
	eq(f.countryOf(loc('Esrange Space Center')), '瑞典', '国家：Esrange → 瑞典')
	eq(f.countryOf(loc('Sea Launch')), '海上发射', '国家：海上平台不是国家')
	eq(f.countryOf({ pad: { location: null } }), '', '国家：location 为 null 返回空串')
	eq(f.countryOf(null), '', '国家：入参为空安全返回')
	eq(
		f.countryOf(loc('Somewhere, Velayat-e Semnan Space Center Province')),
		'Velayat-e S…',
		'国家：未命中映射时保留原文并截断'
	)

	// seriesKey：families 是「由粗到细」的层级，取第二层才是型号系列这一级。
	// 取错了会把 Falcon 1 和 Falcon 9 并成一组，详情页的「不同构型」就乱套。
	eq(f.seriesKey({ families: ['Falcon', 'Falcon 9'] }), 'Falcon 9', '系列：两层取第二层')
	eq(f.seriesKey({ families: ['Long March', 'Long March 2'] }), 'Long March 2', '系列：长征二号')
	eq(f.seriesKey({ families: ['Titan', 'Titan 34D', 'Titan III'] }), 'Titan 34D', '系列：三层也只取第二层')
	eq(f.seriesKey({ families: ['Falcon'] }), 'Falcon', '系列：只有一层就用它自己')
	eq(f.seriesKey({ families: [], name: 'Black Arrow' }), 'Black Arrow', '系列：没有 families 用 name 兜底')
	eq(f.seriesKey({ name: 'Ares I-X' }), 'Ares I-X', '系列：families 缺失也不炸')
	eq(f.seriesKey(null), '', '系列：入参为空安全返回')

	// seriesName：只收确定的中文名，未收录保留英文（译错比不译更糟）
	eq(f.seriesName('Falcon 9'), '猎鹰9号', '系列名：Falcon 9')
	eq(f.seriesName('Long March 2'), '长征二号', '系列名：Long March 2 走规则')
	eq(f.seriesName('Long March 12'), '长征十二号', '系列名：两位数字')
	eq(f.seriesName('Long March'), '长征', '系列名：无编号不产生「长征号」')
	eq(f.seriesName('Long March 2C'), 'Long March 2C', '系列名：带字母的是型号不是系列，保留原文')
	eq(f.seriesName('Vulcan'), '火神', '系列名：Vulcan')
	eq(f.seriesName('PSLV'), 'PSLV', '系列名：未收录保留英文')
	eq(f.seriesName(''), '', '系列名：空值安全返回')

	// coreStatus：芯级状态是 LL2 固定枚举（实测全库 5 种），查表不走翻译
	eq(f.coreStatus('active').text, '现役', '芯级：active 现役')
	eq(f.coreStatus('retired').text, '退役', '芯级：retired 退役')
	eq(f.coreStatus('expended').text, '已消耗', '芯级：expended 已消耗（设计上不回收）')
	eq(f.coreStatus('lost').cls, 'bad', '芯级：lost 坠毁标红')
	eq(f.coreStatus('destroyed').text, '炸毁', '芯级：destroyed 炸毁')
	eq(f.coreStatus('unknown-ish').text, 'unknown-ish', '芯级：未知枚举保留原文不猜')
	eq(f.coreStatus('').text, '未知', '芯级：空值安全返回')
	eq(f.coreStatus({ name: 'active' }).text, '现役', '芯级：对象形态也能取到 name')

	// nationZh：宇航员国籍查表（LL2 用 nationality_name / 缩写两种形态），未收录回退原文
	eq(f.nationZh('France'), '法国', '国籍：France 法国')
	eq(f.nationZh('USA'), '美国', '国籍：USA 缩写命中')
	eq(f.nationZh('United States'), '美国', '国籍：全称命中')
	eq(f.nationZh('Costa Rica'), 'Costa Rica', '国籍：未收录保留原文')
	eq(f.nationZh(''), '', '国籍：空值安全返回')

	// 视觉宽度：中文按双宽算，用来判断简介要不要折叠
	eq(f.textUnits(''), 0, '视觉宽度：空值 0')
	eq(f.textUnits('abc'), 3, '视觉宽度：纯英文按字母数')
	eq(f.textUnits('猎鹰九号'), 8, '视觉宽度：中文一字记 2')
	eq(f.textUnits('猎鹰 9 号'), 9, '视觉宽度：中英混排各按各的算')
	eq(f.textUnits(null), 0, '视觉宽度：null 安全返回 0')

	// 详情页的发射时刻 / 日期 / 窗口跨度。
	// 用本地时间构造再 toISOString()，断言就不受跑测试的机器时区影响
	const at = new Date(2026, 9, 27, 12, 45, 0)
	eq(f.clock(at.toISOString()), '12:45', '时刻：只取时分')
	eq(f.longDate(at.toISOString()), '2026年10月27日 星期二', '长日期：带星期')
	eq(f.clock(''), '', '时刻：空值返回空串')
	eq(f.spanText(at.toISOString(), new Date(2026, 9, 27, 16, 45).toISOString()), '4 小时', '窗口跨度：整小时不出现「0 分钟」')
	eq(f.spanText(at.toISOString(), new Date(2026, 9, 27, 13, 15).toISOString()), '30 分钟', '窗口跨度：不足一小时按分钟')
	eq(f.spanText(at.toISOString(), at.toISOString()), '', '窗口跨度：零长度返回空串')

	// 火箭参数格式化：LL2 给的是 kg 与美元整数
	eq(f.massText(22800), '22.8 吨', '运力：吨级保留一位小数')
	eq(f.massText(4200), '4.2 吨', '运力：四千二百公斤')
	eq(f.massText(500), '500 kg', '运力：小运力用 kg')
	eq(f.massText(0), '', '运力：0 不显示')
	eq(f.costText(50000000), '5000 万美元', '造价：五千万')
	eq(f.costText(150000000), '1.5 亿美元', '造价：亿级')
	eq(f.costText(null), '', '造价：空值不显示')

	// 轨道与任务类型：都是固定枚举，本地查表，不能交给机器翻译
	eq(f.orbitName('LEO'), 'LEO', '轨道：缩写保持缩写')
	eq(f.orbitName('Low Earth Orbit'), '近地轨道', '轨道：全称中文化')
	eq(f.orbitName('Geostationary Transfer Orbit'), '地球同步转移轨道', '轨道：GTO 全称')
	eq(f.orbitName('Some New Orbit'), 'Some New Orbit', '轨道：未收录保留原文')
	eq(f.missionTypeName('Communications'), '通信', '任务类型：通信')
	eq(f.missionTypeName('Government/Top Secret'), '政府/保密', '任务类型：带斜杠的也能命中')
	eq(f.missionTypeName('Weird Type'), 'Weird Type', '任务类型：未收录保留原文')

	// 航天器的三个枚举：名称本身不翻，只翻类型/状态/目的地
	eq(f.craftTypeName('Capsule'), '载人舱', '航天器类型：Capsule')
	eq(f.craftTypeName('Space Station'), '空间站', '航天器类型：带空格的也能命中')
	eq(f.craftTypeName('Hovercraft'), 'Hovercraft', '航天器类型：未收录保留原文')
	eq(f.craftStatusName('Active'), '在役', '航天器状态：Active')
	eq(f.craftStatusName('Destroyed'), '已损毁', '航天器状态：Destroyed（不能显示成在役）')
	eq(f.craftStatusName('Weird'), 'Weird', '航天器状态：未收录保留原文')
	eq(f.destName('International Space Station'), '国际空间站', '目的地：ISS')
	eq(f.destName('Lunar Orbit'), '月球轨道', '目的地：月球轨道')
	// ISS 不在轨道表里，月球既有目的地表也有轨道表，都得能命中
	eq(f.destName('Sun-Synchronous Orbit'), '太阳同步轨道', '目的地：回退到轨道表')
	eq(f.destName('Kepler-186f'), 'Kepler-186f', '目的地：未收录保留原文')

	fs.unlinkSync(tmp)
}

// ---------- search-match.js（依赖 format.js，两个文件一起拷进临时目录）----------

async function testSearchMatch() {
	console.log('[search-match] 中文命中（2026-10-24 复审 P1-1/P1-2 的回归断言）')
	const dir = os.tmpdir()

	// format.js 先落成 format.mjs，再把 search-match 里的相对导入改指向它
	fs.copyFileSync(path.join(__dirname, '..', 'utils', 'format.js'), path.join(dir, 'sl-format-dep.mjs'))
	let src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'search-match.js'), 'utf8')
	src = src.replace("from './format.js'", "from './sl-format-dep.mjs'")
	const tmp = path.join(dir, 'sl-search-match-check.mjs')
	fs.writeFileSync(tmp, src, 'utf8')
	const sm = await import(pathToFileURL(tmp).href)

	const launch = {
		id: 1,
		name: 'Long March 3B/E | GOES-15',
		net: '2026-03-15T10:00:00Z',
		mission: { name: 'GOES-15', nameZh: '戈斯-15' },
		rocket: { configuration: { name: 'Long March 3B/E', full_name: 'Long March 3B/E' } },
		launch_service_provider: { name: 'CASC' },
		pad: { location: { name: 'Xichang Satellite Launch Center' } }
	}

	eq(sm.launchMatch(launch, '戈斯'), true, '任务中文名（nameZh）可命中')
	eq(sm.launchMatch(launch, '长征'), true, '火箭中文名（launchTitle 兜底）可命中')
	eq(sm.launchMatch(launch, 'goes'), true, '英文任务名仍可命中')
	eq(sm.launchMatch(launch, 'xichang'), true, '发射场名仍可命中')

	// 归档老数据：没有 nameZh 时靠 launchTitle 的英文回退，不能漏
	const oldLaunch = {
		id: 2,
		name: 'Falcon 9 | Starlink 6-2',
		net: '2025-06-02T08:00:00Z',
		mission: { name: 'Starlink 6-2' },
		rocket: { configuration: { name: 'Falcon 9', full_name: 'Falcon 9' } }
	}
	eq(sm.launchMatch(oldLaunch, 'starlink'), true, '无中文名的英文任务仍可命中')
	eq(sm.launchMatch(oldLaunch, '嫦娥'), false, '不相关中文关键词不命中')

	const launcher = {
		id: 10,
		name: 'LM-3B/E',
		full_name: 'Long March 3B/E',
		variant: '3B/E',
		manufacturer: 'China Aerospace Science and Technology Corporation',
		families: ['Long March']
	}
	eq(sm.rocketMatch(launcher, '长征'), true, 'ROCKET_ZH 中文名可命中（P1-2）')
	eq(sm.rocketMatch(launcher, 'long march'), true, '英文型号名仍可命中')
	eq(sm.rocketMatch(launcher, 'titan'), false, '不相关关键词不命中')
	eq(sm.launchMatch(null, 'x'), false, '空对象安全返回 false')

	fs.unlinkSync(tmp)
	fs.unlinkSync(path.join(dir, 'sl-format-dep.mjs'))
}

// ---------- media.js（纯函数，不依赖其它模块）----------

async function testMedia() {
	console.log('[media] 图片库/视频库聚合')
	const dir = os.tmpdir()
	fs.copyFileSync(path.join(__dirname, '..', 'utils', 'media.js'), path.join(dir, 'sl-media.mjs'))
	const m = await import(pathToFileURL(path.join(dir, 'sl-media.mjs')).href)

	const configs = [
		{ name: 'Falcon 9 Block 5', image: 'c1.jpg', imageThumb: 'c1t.jpg', imageCredit: 'SpaceX' },
		{ name: 'Falcon 9 B4', image: '', imageThumb: '', imageCredit: '' }
	]
	const records = [
		{
			name: 'F9 | A',
			net: '2026-10-20T00:00:00Z',
			image: 'l1.jpg',
			imageThumb: 'l1t.jpg',
			imageCredit: 'SpaceX',
			imageName: 'Falcon 9 launch A',
			pad: { name: 'SLC-40', image: 'p1.jpg', imageThumb: 'p1t.jpg', imageCredit: 'CCTV' }
		},
		{
			// 和上面同一张发射图 + 同一张工位图：都必须被去重掉
			name: 'F9 | B',
			net: '2026-10-21T00:00:00Z',
			image: 'l1.jpg',
			imageThumb: 'l1t.jpg',
			imageCredit: 'SpaceX',
			pad: { name: 'SLC-40', image: 'p1.jpg', imageThumb: 'p1t.jpg', imageCredit: 'CCTV' },
			// 第一条带自己的封面（YouTube 缩略图），第二条没有 —— 用来测降级
			vid: [
				{
					url: 'https://youtu.be/x',
					title: 'Webcast B',
					publisher: 'SpaceX',
					priority: 1,
					tid: 1,
					kind: 'Official Webcast',
					cover: 'vc.jpg'
				},
				{
					url: 'https://youtu.be/y',
					title: 'Webcast B2',
					publisher: 'SpaceX',
					priority: 2,
					tid: 3,
					kind: 'Unofficial Webcast'
				}
			]
		},
		{
			// 更早的一次，图不同
			name: 'F9 | C',
			net: '2025-01-01T00:00:00Z',
			image: 'l2.jpg',
			imageThumb: 'l2t.jpg',
			infographic: 'ig.jpg'
		}
	]

	const r = m.collectMedia(configs, records)
	eq(r.images.length, 5, '去重后共 5 张（构型 1 + 发射 2 + 工位 1 + 信息图 1）')
	eq(r.images[0].url, 'c1.jpg', '构型图排最前')
	eq(r.images[0].kind, 'config', '构型图带 kind=config')
	eq(r.images[1].url, 'l1.jpg', '发射图按时间倒序，最近的在前')
	eq(r.images[r.images.length - 1].kind, 'infographic', '信息图排在最后')
	eq(r.images.filter((x) => x.url === 'l1.jpg').length, 1, '同一张发射图只出现一次')
	eq(r.images.filter((x) => x.url === 'p1.jpg').length, 1, '同一张工位图只出现一次')
	eq(r.images.find((x) => x.url === 'l1.jpg').credit, 'SpaceX', '署名透传')
	eq(r.videos.length, 2, '视频从 vid 展开')
	eq(r.videos[0].cover, 'vc.jpg', '视频封面优先用视频自己的缩略图')
	eq(r.videos[0].thumb, 'vc.jpg', '视频卡片的 thumb 同样指封面')
	eq(r.videos[1].cover, 'l1t.jpg', '没封面时退回发射缩略图（不能留灰块）')
	eq(r.videos[0].title, 'Webcast B', '视频标题取 vid.title')
	eq(r.videos[0].official, true, '官方直播打上 official 标记（type.id=1）')
	eq(r.videos[1].official, false, '第三方转播不打官方标记')
	eq(r.truncated, false, '未达上限不标记截断')

	// 空数据 / 脏数据都不能炸
	eq(m.collectMedia(null, null).images.length, 0, '入参为空安全返回')
	eq(m.collectMedia([], []).videos.length, 0, '空数组安全返回')

	// fullImageOf：由 COS 缩略图 hash 推导原图地址（2026-10-25 原图补齐）
	eq(
		m.fullImageOf('https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-img/ab12cd34ef567890.jpg'),
		'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-img/ab12cd34ef567890_2000.jpg',
		'原图：thumb 推导 _2000'
	)
	eq(
		m.fullImageOf('https://x.cos.myqcloud.com/space-img/ab12cd34ef567890.png'),
		'https://x.cos.myqcloud.com/space-img/ab12cd34ef567890_2000.png',
		'原图：png 同样推导'
	)
	eq(m.fullImageOf('https://x.cos.myqcloud.com/space-img/ab12cd34ef567890_1080.jpg'), '', '原图：信息图(带宽度后缀)不推导')
	eq(m.fullImageOf('https://x.cos.myqcloud.com/space-img/ab12cd34ef567890_750.jpg'), '', '原图：地图(带宽度后缀)不推导')
	eq(m.fullImageOf('https://thespacedevs-prod.nyc3.digitaloceanspaces.com/media/x.jpg'), '', '原图：非 COS 地址不推导')
	eq(m.fullImageOf(''), '', '原图：空值安全')
	eq(m.fullImageOf(null), '', '原图：null 安全')

	fs.unlinkSync(path.join(dir, 'sl-media.mjs'))
}

// ---------- timeline.js（发射时间线纯函数）----------

async function testTimeline() {
	console.log('[timeline] 发射时间线解析与展示挑选')
	const dir = os.tmpdir()
	const tmp = path.join(dir, 'sl-timeline-check.mjs')
	fs.copyFileSync(path.join(__dirname, '..', 'utils', 'timeline.js'), tmp)
	const t = await import(pathToFileURL(tmp).href)

	// LL2 的 relative_time 是 ISO 8601 时长，不是常见的 "-00:38:00"
	eq(t.parseDuration('-PT38M'), -38 * 60000, '时长：T-38 分钟')
	eq(t.parseDuration('PT2H48M28S'), (2 * 3600 + 48 * 60 + 28) * 1000, '时长：2 小时 48 分 28 秒')
	eq(t.parseDuration('P0D'), 0, '时长：P0D 就是 T-0')
	eq(t.parseDuration('P1DT2H'), 26 * 3600 * 1000, '时长：带天的写法')
	eq(t.parseDuration('garbage'), null, '时长：解析不出来返回 null，不能当 0')
	eq(t.parseDuration(null), null, '时长：空值返回 null')

	eq(t.tlRelative(-38 * 60000), 'T-38 分', '相对时间：分钟')
	eq(t.tlRelative(0), 'T+0 秒', '相对时间：T-0')
	eq(t.tlRelative(2 * 3600 * 1000), 'T+2 时 0 分', '相对时间：小时')
	eq(t.tlRelative(null), '', '相对时间：空值返回空串')

	eq(t.tlLabel({ a: 'Prop Load' }), '推进剂加注', '节点名：本地表命中')
	eq(t.tlLabel({ a: 'Prop Load', az: '支柱负载' }), '推进剂加注', '节点名：机器翻译的垃圾不参与显示')
	eq(t.tlLabel({ a: 'Starlink Deployment' }), '星链部署', '节点名：星链专属节点')
	eq(t.tlLabel({ a: 'Weird Step', az: '怪步骤' }), 'Weird Step', '节点名：表外一律保留英文')

	const items = [
		{ a: 'A', t: '-PT60M' },
		{ a: 'B', t: '-PT30M' },
		{ a: 'C', t: '-PT10M' },
		{ a: 'D', t: 'P0D' },
		{ a: 'E', t: 'PT10M' }
	]
	const net = new Date(2026, 9, 27, 12, 0).toISOString()
	const before = new Date(2026, 9, 27, 11, 35).getTime() // T-25 分钟

	const p1 = t.pickTimeline(items, net, before, 2)
	eq(p1.list.map((x) => x.a), ['C', 'D'], '挑选：只给还没发生的节点')
	eq(p1.more, 1, '挑选：剩余条数')
	eq(p1.total, 5, '挑选：总条数')

	const p2 = t.pickTimeline(items, net, new Date(2026, 9, 27, 12, 30).getTime(), 4)
	eq(p2.list.map((x) => x.a), ['B', 'C', 'D', 'E'], '挑选：全部已过时退回最后几条')

	const p3 = t.pickTimeline([], net, before, 4)
	eq(p3.list, [], '挑选：空时间线返回空数组')
	eq(p3.total, 0, '挑选：空时间线总数为 0')

	// 解析失败的节点必须跳过：否则会被当成 T-0 排到最前面
	const p4 = t.pickTimeline([{ a: 'X', t: 'bad' }, { a: 'Y', t: 'P0D' }], net, before, 4)
	eq(p4.list.map((x) => x.a), ['Y'], '挑选：解析失败的节点被跳过')

	const sorted = t.sortedTimeline(items)
	eq(sorted.map((x) => x.a), ['A', 'B', 'C', 'D', 'E'], '排序：按相对时间正序')
	eq(sorted[0].rel, -60 * 60000, '排序：带出毫秒偏移，页面据此判断「已发生」')

	fs.unlinkSync(tmp)
}

// ---------- slimCraft（航天器裁剪）----------

/**
 * 样本取自真实响应（launches/{DM-1 id}/），字段名都是实测的，别凭印象改。
 * 注意 spacecraft_stage 是**数组**，且列表端点完全没有这个键 ——
 * 只有单条详情才有，所以由 timeline 流程顺路抓。
 */
async function testCraft() {
	console.log('[timeline] 航天器裁剪')
	const { slimCraft } = require('./timeline')

	const stage = [
		{
			destination: 'International Space Station',
			spacecraft: {
				name: 'Crew Dragon C204',
				serial_number: 'C204',
				status: { id: 3, name: 'Destroyed' },
				description: 'Crew Dragon C204 is the Crew Dragon spacecraft launched on the SpaceX DM-1 mission.',
				image: { image_url: 'https://x/a.jpeg', thumbnail_url: 'https://x/a_thumb.jpeg', credit: 'NASA' },
				flights_count: 1,
				spacecraft_config: {
					name: 'Crew Dragon 2',
					type: { id: 2, name: 'Capsule' },
					agency: { name: 'SpaceX' },
					human_rated: true,
					crew_capacity: 4,
					payload_capacity: 6000,
					height: 7.2,
					diameter: 3.7,
					flight_life: 'Able to fly for up to one week',
					maiden_flight: '2019-03-02'
				}
			}
		}
	]

	const c = slimCraft(stage)
	eq(c !== null, true, '航天器：正常样本不返回 null')
	eq(c.name, 'Crew Dragon C204', '航天器：名称原样保留（官方代号不翻）')
	eq(c.serial, 'C204', '航天器：编号单独存')
	eq(c.config, 'Crew Dragon 2', '航天器：构型名单独存')
	eq(c.status, 'Destroyed', '航天器：状态存英文枚举，翻译在前端')
	eq(c.image, 'https://x/a_thumb.jpeg', '航天器：优先缩略图')
	eq([c.height, c.diameter, c.crew, c.payload], [7.2, 3.7, 4, 6000], '航天器：尺寸 / 载员 / 运力')
	eq(c.human, true, '航天器：可载人标记')

	// 长征这类不公开载荷的任务，spacecraft_stage 恒为 []，此时整卡不显示
	eq(slimCraft([]), null, '航天器：空数组 → null')
	eq(slimCraft(null), null, '航天器：null → null')
	eq(slimCraft([{ spacecraft: null }]), null, '航天器：空壳 → null（不能出只有标题的空卡）')

	// 超长描述会撑爆 timelines.json，必须截断
	const long = slimCraft([{ spacecraft: { name: 'X', description: 'a'.repeat(2000) } }])
	eq(long.desc.length, 221, '航天器：长描述截断到 220 字（含省略号 221）')
}

// ---------- 视频裁剪 + 镜像路径通配 ----------

/**
 * 样本取自真实响应（launches/previous/?mode=detailed 的**顶层** vid_urls）。
 *
 * 两个必须钉住的点：
 *   1. priority 与「官方优先」是反的 —— 官方那条 priority=10 最大，
 *      按它降序排会把第三方转播顶到第一个，所以按 type.id 排。
 *   2. vid_urls 在顶层，mission.vid_urls 恒空。早期版本读后者，
 *      于是视频库一条都没有。
 */
function testVideo() {
	console.log('[video] 视频裁剪与镜像路径通配')
	const { slimVids } = require('./videos')
	const { slotsOf } = require('./lib/image')

	const raw = [
		{
			url: 'https://www.youtube.com/watch?v=cyJtopOtMZA',
			title: 'SpaceX Starlink Group 15-15',
			publisher: 'The Space Devs',
			source: 'youtube.com',
			priority: 8,
			type: { id: 4, name: 'Unofficial Re-stream' },
			feature_image: 'https://i.ytimg.com/vi/a/hqdefault.jpg',
			start_time: '2026-10-23T23:06:42Z',
			end_time: '2026-10-23T23:27:15Z',
			live: false
		},
		{
			url: 'https://x.com/i/broadcasts/1qKDzWkEraoJV',
			title: 'Starlink Mission',
			publisher: 'SpaceX',
			source: 'x.com',
			priority: 10,
			type: { id: 1, name: 'Official Webcast' },
			feature_image: 'https://pbs.twimg.com/media/x.jpg',
			start_time: '2026-10-23T22:37:56Z',
			end_time: '2026-10-23T22:58:30Z',
			live: false
		}
	]

	const v = slimVids(raw)
	eq(v.length, 2, '视频：两条都保留')
	eq(v[0].publisher, 'SpaceX', '视频：官方直播排最前（不能按 priority 排，它是反的）')
	eq(v[0].kind, 'Official Webcast', '视频：类型枚举原样存，翻译在前端')
	eq(v[0].mins, 21, '视频：时长按起止时间算')
	eq(v[1].mins, 21, '视频：转播时长同样算')
	eq(v[0].cover, 'https://pbs.twimg.com/media/x.jpg', '视频：封面取 feature_image（X 的图也要镜像）')
	eq(v[0].title, 'Starlink Mission', '视频：标题保留')

	eq(slimVids(null).length, 0, '视频：null 安全返回空')
	eq(slimVids([]).length, 0, '视频：空数组返回空')
	eq(slimVids([{ title: '没有 url' }]).length, 0, '视频：缺 url 的丢掉（点了没反应）')
	eq(slimVids([{ url: 'u', type: { id: 1, name: 'Official Webcast' } }])[0].title, 'Official Webcast', '视频：没有标题时退回类型名')
	eq(slimVids([{ url: 'u', start_time: '2026-01-01T00:00:00Z' }])[0].mins, 0, '视频：只有开始时间时时长记 0，不瞎算')
	eq(slimVids([{ url: 'https://a'.repeat(200) }])[0].title, '', '视频：超长输入不炸')

	// 镜像路径：mirrorImages 原来只认点路径，拿不到 vids[].cover
	const row = { vids: [{ cover: 'a.jpg' }, { cover: 'b.jpg' }] }
	eq(slotsOf(row, 'vids.*.cover').length, 2, '镜像路径：* 展开数组每一项')
	eq(
		slotsOf(row, 'vids.*.cover').map((s) => s.obj[s.key]),
		['a.jpg', 'b.jpg'],
		'镜像路径：取到每一张封面'
	)
	eq(slotsOf({ craft: { image: 'x' } }, 'craft.image').length, 1, '镜像路径：普通点路径行为不变')
	eq(slotsOf(row, 'vids.nope').length, 0, '镜像路径：不存在的字段返回空，不炸')
	eq(slotsOf(null, 'a.b').length, 0, '镜像路径：null 安全')
	eq(slotsOf([{ cover: 'a' }], '*.cover').length, 1, '镜像路径：顶层就是数组时也能展开')
	eq(slotsOf({ vids: 'not-an-array' }, 'vids.*.cover').length, 0, '镜像路径：该是数组却是字符串，跳过')
}

;(async () => {
	await testFormat()
	await testSearchMatch()
	await testMedia()
	await testTimeline()
	await testCraft()
	testVideo()
})()
	.catch((e) => {
		failed++
		console.error('  ✗ format.js 加载失败: ' + e.message)
	})
	.finally(() => {
		console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
		process.exit(failed ? 1 : 0)
	})
