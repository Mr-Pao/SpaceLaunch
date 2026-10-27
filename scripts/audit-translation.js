'use strict'

/**
 * 译文巡检：把「机翻可能出错」的地方主动找出来。
 *
 * 背景：译文是 Google 免费端点批量产的，结果按原文哈希永久缓存 ——
 * 一旦译错（JUICE 译成「果汁」），错误会一直留在 COS 上，而且没有任何
 * 机制会提醒。之前的做法是用户截图发现、我加正则补丁，属于人肉兜底。
 *
 * 这个脚本做的是「发现层」：扫全部快照里的 *Zh 字段，按可疑度分级列出，
 * 输出待校对清单。只读，不改数据。
 *
 *   node scripts/audit-translation.js            扫线上 COS
 *   node scripts/audit-translation.js --local    扫本地 dist（不联网）
 *   node scripts/audit-translation.js --full     连 info 级也列出来
 */

const fs = require('fs')
const path = require('path')

const BASE = 'https://spacelaunch-1258113633.cos.ap-chengdu.myqcloud.com/space-data/'
const DIST = path.resolve(__dirname, '..', 'dist')

/**
 * 已知会让机翻翻车的词。
 * 只放「出现在译文里就一定是错的」组合，避免误报把清单刷成一团噪音。
 */
const BAD_TERMS = [
	['果汁', 'JUICE 探测器被逐词直译'],
	['轨道插入', '应为「入轨」'],
	['快艇', 'Europa Clipper 官方译名是「快船」'],
	['释放和重返', '应为「释放与再入」'],
	['重返大气', '应为「再入大气」'],
	['太空梭', '港台译法，大陆用「航天飞机」'],
	['飞行器失事', '表述不当'],
	['冲击$', 'Impact 应译作「撞击」'],
	['二号号', '叠字，规则推导重复'],
	['的的', '叠字'],
	['，，', '重复标点']
]

/** 每个数据集的字段配对：英文源 → 中文字段 */
const TARGETS = [
	{
		file: 'launches-upcoming.json',
		pairs: [
			['mission.name', 'mission.nameZh'],
			['mission.description', 'mission.descriptionZh'],
			['weather_concerns', 'weather_concernsZh'],
			['failreason', 'failreasonZh']
		]
	},
	{
		file: 'launches-previous.json',
		pairs: [
			['mission.name', 'mission.nameZh'],
			['mission.description', 'mission.descriptionZh'],
			['weather_concerns', 'weather_concernsZh'],
			['failreason', 'failreasonZh']
		]
	},
	{ file: 'events.json', pairs: [['name', 'nameZh'], ['description', 'descriptionZh']] },
	{ file: 'launchers.json', pairs: [['description', 'descriptionZh']] },
	{ file: 'agencies.json', pairs: [['description', 'descriptionZh']] },
	{ file: 'pads.json', pairs: [['description', 'descriptionZh']] },
	{ file: 'cores.json', pairs: [['details', 'detailsZh']] },
	{ file: 'astronauts.json', pairs: [['bio', 'bioZh']] },
	{ file: 'spacestations.json', pairs: [['desc', 'descZh']] }
]

const HAN = /[\u4e00-\u9fa5]/

function dig(obj, dotted) {
	let cur = obj
	for (const k of dotted.split('.')) {
		if (!cur || typeof cur !== 'object') return null
		cur = cur[k]
	}
	return typeof cur === 'string' ? cur : null
}

/** 汉字个数，用来判断「到底翻没翻」 */
function hanCount(s) {
	let n = 0
	for (const ch of String(s)) if (HAN.test(ch)) n++
	return n
}

/**
 * 判定一条译文的可疑度。
 * 返回 { level, reason } 或 null（正常）。
 */
function inspect(en, zh) {
	if (!zh || !zh.trim()) return null // 没译文不算错，前端会回退英文

	// zh === en 多半是任务代号（NROL-195 / USSF-432 / OSE HS-01 & 02），本来就不该翻。
	// 判定「像句子」要同时满足：4 个词以上，且含小写字母 —— 全大写的都是代号。
	if (en === zh) {
		const words = String(en).trim().split(/\s+/).length
		if (words >= 4 && /[a-z]/.test(en)) return { level: 'error', reason: '未翻译（译文=原文）' }
		return null
	}

	const hz = hanCount(zh)
	// 短词（型号名、任务代号）本来就该留英文，只对长文本要求必须中文化
	if (hz === 0 && en.length > 24) return { level: 'error', reason: '整段未翻译' }
	// 中文占比过低：长句里只剩几个汉字。但专名密集的句子天然偏低
	// （"Booster 推出了 Crew-1、Crew-2 和 IXPE"），汉字少到个位数才算真没翻完
	if (en.length > 60 && hz > 0 && hz / en.length < 0.12) {
		const level = hz < 6 ? 'warn' : 'info'
		return { level, reason: `中文占比偏低（${hz} 字 / 原文 ${en.length} 字符）` }
	}

	for (const pair of BAD_TERMS) {
		const re = pair[0].endsWith('$') ? new RegExp(pair[0]) : new RegExp(pair[0])
		if (re.test(zh)) return { level: 'warn', reason: pair[1] }
	}

	// 译文比原文长太多：常见于重复翻译或把括号注释也翻了
	if (en.length > 20 && zh.length > en.length * 1.8) {
		return { level: 'info', reason: `译文偏长（${zh.length} 字符 / 原文 ${en.length}）` }
	}

	return null
}

async function loadLocal(name) {
	const p = path.join(DIST, name)
	if (!fs.existsSync(p)) return null
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8'))
	} catch (e) {
		return null
	}
}

async function loadRemote(name) {
	const url = BASE + name + '?t=' + Date.now()
	const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
	if (!res.ok) throw new Error('HTTP ' + res.status)
	return res.json()
}

async function main() {
	const local = process.argv.includes('--local')
	const full = process.argv.includes('--full')
	const load = local ? loadLocal : loadRemote

	const buckets = { error: [], warn: [], info: [] }
	let scanned = 0
	let pairsChecked = 0

	for (const t of TARGETS) {
		let json
		try {
			json = await load(t.file)
		} catch (e) {
			console.log(`  ! ${t.file} 读取失败：${e.message}`)
			continue
		}
		const list = json && (json.list || json)
		if (!Array.isArray(list)) continue
		scanned += list.length

		for (const item of list) {
			if (!item) continue
			for (const [enKey, zhKey] of t.pairs) {
				const en = dig(item, enKey)
				const zh = dig(item, zhKey)
				if (!en || !zh) continue
				pairsChecked++
				const hit = inspect(en, zh)
				if (!hit) continue
				buckets[hit.level].push({
					file: t.file,
					id: item.id,
					en,
					zh,
					reason: hit.reason
				})
			}
		}
	}

	const show = (level, label) => {
		const arr = buckets[level]
		if (!arr.length) {
			console.log(`\n${label}：无`)
			return
		}
		console.log(`\n${label}（${arr.length} 条）`)
		for (const r of arr.slice(0, 60)) {
			const en = r.en.length > 70 ? r.en.slice(0, 70) + '…' : r.en
			const zh = r.zh.length > 40 ? r.zh.slice(0, 40) + '…' : r.zh
			console.log(`  · [${r.file}] ${r.reason}`)
			console.log(`    EN ${en}`)
			console.log(`    ZH ${zh}`)
		}
		if (arr.length > 60) console.log(`  …另有 ${arr.length - 60} 条`)
	}

	console.log(`巡检范围：${local ? '本地 dist' : '线上 COS'}`)
	console.log(`扫过 ${scanned} 条记录、${pairsChecked} 组中英配对`)

	show('error', '❌ 确定有问题')
	show('warn', '⚠️ 疑似有问题')
	if (full) show('info', 'ℹ️ 值得看一眼')

	const total = buckets.error.length + buckets.warn.length
	console.log('\n' + '-'.repeat(46))
	console.log(`需要人工校对：${total} 条（${buckets.error.length} 硬错误 / ${buckets.warn.length} 疑似）`)
	if (total) {
		console.log('改法：把 原文 → 人工译文 写进 scripts/translation-overrides.json，')
		console.log('      下次同步时直接命中，不再走机翻，也不用清缓存。')
	}
}

main().catch((e) => {
	console.error('巡检失败：', e.message)
	process.exit(1)
})
