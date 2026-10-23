'use strict'

/**
 * 给快照回填中文描述
 *
 * 在 sync.js 里、写 JSON 之前调用，所以 COS 上的快照天然带中文，
 * 小程序端一行代码都不用改逻辑，只是多读一个字段。
 *
 * 机构描述默认不翻：182 条共 5.2 万字符，占全部翻译量的一大半，
 * 而机构页访问频率远低于发射列表。需要时把 AGENCY_LIMIT 调大即可。
 */

const { translateTexts, getZh } = require('./translate')

/**
 * 机构简介一共 182 条、5.2 万字符，是一次性的大头。
 * 但翻译结果按原文哈希永久缓存，实际只会翻一次，
 * 之后 CI 每轮都是零命中新文本，所以放行全量。
 */
const AGENCY_LIMIT = 400

async function fill(list, read, write) {
	if (!Array.isArray(list) || list.length === 0) return

	const texts = list.map(read).filter((t) => t && t.trim())
	if (texts.length === 0) return

	await translateTexts(texts)

	let filled = 0
	for (const item of list) {
		const en = read(item)
		if (!en) continue
		const zh = getZh(en)
		if (zh) {
			write(item, zh)
			filled++
		}
	}
	if (filled) console.log(`  ✓ 中文描述回填 ${filled}/${texts.length} 条`)
}

/** launch.mission.description → mission.descriptionZh
 *  顺带翻 weather_concerns / failreason：这两个量极小（只有临近发射和失败任务才有），
 *  走的是同一份永久缓存，不会额外占多少额度，但不翻就是纯英文长句摆在详情页上 */
async function localizeLaunches(list) {
	await fill(
		list,
		(x) => x.mission && x.mission.description,
		(x, zh) => {
			if (x.mission) x.mission.descriptionZh = zh
		}
	)
	await fill(
		list,
		(x) => x.weather_concerns,
		(x, zh) => {
			x.weather_concernsZh = zh
		}
	)
	await fill(
		list,
		(x) => x.failreason,
		(x, zh) => {
			x.failreasonZh = zh
		}
	)
}

/** event.description → descriptionZh */
function localizeEvents(list) {
	return fill(
		list,
		(x) => x.description,
		(x, zh) => {
			x.descriptionZh = zh
		}
	)
}

/** agency.description → descriptionZh */
function localizeAgencies(list) {
	if (!AGENCY_LIMIT) return Promise.resolve()

	const sliced = list.slice(0, AGENCY_LIMIT)
	return fill(
		sliced,
		(x) => x.description,
		(x, zh) => {
			x.descriptionZh = zh
		}
	)
}

module.exports = { localizeLaunches, localizeEvents, localizeAgencies }
