'use strict'

/**
 * 字段裁剪 —— 必须与页面模板逐字段对齐，少一个字段页面就是空白
 *
 * 两个容易踩的坑：
 * 1. launch.image 是对象 { image_url, thumbnail_url, ... }，模板写的是 <image :src="detail.image">
 *    不拍平会渲染成 [object Object]
 * 2. agency.type 是对象、agency.launchers 是对象数组、agency.country 是数组
 *    模板直接插值，不归一化会渲染成 [object Object]
 */

const str = (v) => (typeof v === 'string' ? v : '')
const num = (v) => (typeof v === 'number' ? v : null)

/** image 可能是对象、字符串或 null，统一成 URL 字符串 */
function imageUrl(image) {
	if (!image) return ''
	if (typeof image === 'string') return image
	return image.image_url || image.thumbnail_url || ''
}

/** 名称数组 → 顿号连接的字符串 */
function joinNames(arr) {
	if (!Array.isArray(arr)) return ''
	return arr
		.map((x) => (typeof x === 'string' ? x : x && (x.name || x.abbrev)))
		.filter(Boolean)
		.join('、')
}

function slimLaunch(l) {
	return {
		id: l.id ?? null,
		name: str(l.name),
		net: str(l.net),
		last_updated: str(l.last_updated),
		image: imageUrl(l.image),

		status: {
			name: str(l.status && l.status.name),
			abbrev: str(l.status && l.status.abbrev)
		},

		rocket: {
			configuration: {
				id: (l.rocket && l.rocket.configuration && l.rocket.configuration.id) ?? null,
				name: str(l.rocket && l.rocket.configuration && l.rocket.configuration.name),
				full_name: str(l.rocket && l.rocket.configuration && l.rocket.configuration.full_name)
			}
		},

		pad: {
			name: str(l.pad && l.pad.name),
			latitude: (l.pad && l.pad.latitude) ?? null,
			longitude: (l.pad && l.pad.longitude) ?? null,
			map_image: imageUrl(l.pad && l.pad.map_image),
			location: { name: str(l.pad && l.pad.location && l.pad.location.name) }
		},

		mission: {
			description: str(l.mission && l.mission.description),
			type: str(l.mission && l.mission.type)
		},

		launch_service_provider: {
			id: (l.launch_service_provider && l.launch_service_provider.id) ?? null,
			name: str(l.launch_service_provider && l.launch_service_provider.name)
		},

		pad_launch_attempt_count: num(l.pad_launch_attempt_count),
		pad_launch_attempt_count_year: num(l.pad_launch_attempt_count_year),
		orbital_launch_attempt_count_year: num(l.orbital_launch_attempt_count_year)
	}
}

function slimEvent(e) {
	return {
		id: e.id ?? null,
		name: str(e.name),
		date: str(e.date),
		description: str(e.description),
		feature_image: imageUrl(e.feature_image),
		type: {
			name: str(e.type && e.type.name),
			abbrev: str(e.type && e.type.abbrev)
		},
		// event.location 在 LL2 里是字符串
		location: str(e.location),
		// 模板只取 launches[0].name，留 3 条冗余
		launches: Array.isArray(e.launches)
			? e.launches.slice(0, 3).map((x) => ({ name: str(x && x.name) }))
			: []
	}
}

function slimAgency(a) {
	return {
		id: a.id ?? null,
		name: str(a.name),
		abbrev: str(a.abbrev),
		// type 是对象 { id, name }
		type: str(a.type && a.type.name) || str(a.type),
		founding_year: str(a.founding_year),
		description: str(a.description),
		image_url: str(a.image_url),
		logo_url: str(a.logo_url),
		// country 是数组 [{ id, name, alpha_2_code }]，模板用 country_code 显示"国家/地区"
		country_code:
			(Array.isArray(a.country) && a.country.length && (a.country[0].alpha_2_code || a.country[0].name)) ||
			str(a.country_code) ||
			'',
		// launchers 是对象数组，模板直接插值
		launchers: joinNames(a.launchers)
	}
}

module.exports = { slimLaunch, slimEvent, slimAgency, imageUrl, joinNames }
