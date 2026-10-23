'use strict'

/**
 * 字段裁剪 —— 必须与页面模板逐字段对齐，少一个字段页面就是空白
 *
 * 三个实测出来的坑（都是旧代码踩过的）：
 * 1. 图片字段是对象不是字符串：
 *    launch.image / event.image / agency.image / agency.logo 都是 { image_url, thumbnail_url }
 *    event 的字段名是 image（不是 feature_image），agency 根本没有 image_url / logo_url
 *    不拍平会渲染成 [object Object]
 * 2. agency.type 是对象、agency.country 是数组，直接插值会变 [object Object]
 * 3. agency.founding_year 是 number，agency.launchers 是字符串 —— 类型判断错了就是空值
 */

const str = (v) => (typeof v === 'string' ? v : '')
const num = (v) => (typeof v === 'number' ? v : null)

/**
 * 发射状态的中文名。LL2 给的是英文全称（status.name），
 * abbrev 是 Go / TBC / Success 这种缩写，直接显示对中文用户不友好。
 *
 * 用词刻意压到 2–3 个字：状态徽章是个小胶囊，超过 3 字会撑破布局。
 * 找不到就回退英文全称，前端不必再做判断。
 */
const STATUS_ZH = {
	// abbrev → 中文
	Go: '就绪',
	TBC: '待定',
	TBD: '待定',
	Success: '成功',
	Failure: '失败',
	Partial: '部分成功',
	Deployed: '已部署',
	'In Flight': '飞行中',
	Hold: '暂停',
	Scheduled: '已排期',
	// name → 中文（LL2 的 abbrev 偶尔和 name 对不上，两套都兜住）
	'Go for Launch': '就绪',
	'To Be Confirmed': '待定',
	'To Be Determined': '待定',
	'Launch Successful': '成功',
	'Launch Failure': '失败',
	'Payload Deployed': '已部署',
	'Partial Failure': '部分成功'
}

function statusZh(status) {
	if (!status) return ''
	return (
		STATUS_ZH[status.abbrev] ||
		STATUS_ZH[status.name] ||
		STATUS_ZH[status.description] ||
		str(status.name)
	)
}

/**
 * 数字或字符串都转成展示字符串
 * 坑：agency.founding_year 在 API 里是 number（如 1960），只判断 string 会得到空值，
 * 表现为"成立时间"永远空白
 */
const strOrNum = (v) => {
	if (typeof v === 'number') return String(v)
	if (typeof v === 'string') return v
	return ''
}

/** image 可能是对象、字符串或 null，统一成 URL 字符串 */
function imageUrl(image) {
	if (!image) return ''
	if (typeof image === 'string') return image
	return image.image_url || image.thumbnail_url || ''
}

/** 名称数组 → 顿号连接的字符串；本来已经是字符串的原样返回 */
function joinNames(arr) {
	// 实测 agency.launchers 是 "A | B" 这样的字符串，不是数组
	if (typeof arr === 'string') return arr
	if (!Array.isArray(arr)) return ''
	return arr
		.map((x) => (typeof x === 'string' ? x : x && (x.name || x.abbrev)))
		.filter(Boolean)
		.join('、')
}

function slimLaunch(l) {
	const c = (l.rocket && l.rocket.configuration) || {}
	const orbit = (l.mission && l.mission.orbit) || {}

	return {
		id: l.id ?? null,
		name: str(l.name),
		net: str(l.net),
		last_updated: str(l.last_updated),
		image: imageUrl(l.image),
		// 任务信息图（一张竖版长图）。LL2 里是 URL 字符串，也可能为 null
		infographic: imageUrl(l.infographic),

		status: {
			name: str(l.status && l.status.name),
			abbrev: str(l.status && l.status.abbrev),
			// 状态是固定枚举，本地查表即可，不需要走翻译接口
			nameZh: statusZh(l.status)
		},

		rocket: {
			configuration: {
				id: c.id ?? null,
				name: str(c.name),
				full_name: str(c.full_name),
				// 火箭参数，目前只用在详情页的「运载火箭」卡片里，没有就整行不显示
				length: num(c.length),
				diameter: num(c.diameter),
				launch_mass: num(c.launch_mass),
				leo_capacity: num(c.leo_capacity)
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
			// 载荷名，比如 "Starlink Group 15-16"。之前整个 mission 只留了描述和类型，
			// 导致详情页根本看不到这次任务运的是什么
			name: str(l.mission && l.mission.name),
			description: str(l.mission && l.mission.description),
			// 中文描述由 lib/localize.js 在同步阶段回填，翻不出来就留空，
			// 前端用 descriptionZh || description 回退英文
			descriptionZh: '',
			type: str(l.mission && l.mission.type),
			orbit: {
				name: str(orbit.name),
				abbrev: str(orbit.abbrev)
			}
		},

		// 发射概率（0-100 的整数）。LL2 只有部分任务会填，null 表示没有预报
		probability: num(l.probability),
		// 天气顾虑，英文长句；中文由 localize 回填 weather_concernsZh
		weather_concerns: str(l.weather_concerns),
		weather_concernsZh: '',
		// 失败原因，只有历史发射里的失败任务有；同样回填 failreasonZh
		failreason: str(l.failreason),
		failreasonZh: '',

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
		descriptionZh: '',
		// 实测字段名是 image（对象），不是 feature_image。
		// 读错字段的后果是活动列表 29 条全部无图
		feature_image: imageUrl(e.image) || str(e.feature_image),
		type: {
			name: str(e.type && e.type.name),
			abbrev: str(e.type && e.type.abbrev)
		},
		// event.location 在 LL2 里是字符串，但也可能是 null
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
		founding_year: strOrNum(a.founding_year),
		description: str(a.description),
		descriptionZh: '',
		// 实测真实字段名是 image / logo / social_logo，都是对象或 null，
		// 根本没有 image_url / logo_url 这两个字段（旧页面一直读错，机构图从来没显示过）
		image_url: imageUrl(a.image) || str(a.image_url),
		logo_url: imageUrl(a.logo) || str(a.logo_url),
		// country 是数组 [{ id, name, alpha_2_code }]
		country_code:
			(Array.isArray(a.country) && a.country.length && (a.country[0].alpha_2_code || a.country[0].name)) ||
			str(a.country_code) ||
			'',
		// launchers 实测是字符串（"A | B"），空值是 ""，不是数组
		launchers: joinNames(a.launchers)
	}
}

module.exports = { slimLaunch, slimEvent, slimAgency, imageUrl, joinNames, statusZh, STATUS_ZH }
