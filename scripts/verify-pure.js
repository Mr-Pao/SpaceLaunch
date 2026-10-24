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

;(async () => {
	await testFormat()
	await testSearchMatch()
})()
	.catch((e) => {
		failed++
		console.error('  ✗ format.js 加载失败: ' + e.message)
	})
	.finally(() => {
		console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
		process.exit(failed ? 1 : 0)
	})
