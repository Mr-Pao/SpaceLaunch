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
				// 型号（Block 5 / A / B 这种）和所属系列（Falcon / Long March），
				// 详情页在型号名下面补一行，比只有一个型号名有信息量
				variant: str(c.variant),
				families: Array.isArray(c.families)
					? c.families.map((f) => str(f && f.name)).filter(Boolean).slice(0, 2)
					: []
			}
		},

		pad: {
			name: str(l.pad && l.pad.name),
			latitude: (l.pad && l.pad.latitude) ?? null,
			longitude: (l.pad && l.pad.longitude) ?? null,
			location: { name: str(l.pad && l.pad.location && l.pad.location.name) }
		},
		// pad.map_image 已删：前端从未渲染，却要 CI 每轮下载+压缩+上传
		// （upcoming 每 15 分钟 100 张、upcomingMore 每天 376 张），纯浪费

		mission: {
			// 载荷名，比如 "Starlink Group 15-16"。之前整个 mission 只留了描述和类型，
			// 导致详情页根本看不到这次任务运的是什么
			name: str(l.mission && l.mission.name),
			// 任务名的中文，和描述一样由 localize 回填；翻不出来前端回退 name
			nameZh: '',
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

		// 发射窗口。窗口有 4 小时的时候只给一个 net 会让用户以为整点发射
		window_start: str(l.window_start),
		window_end: str(l.window_end),

		// LL2 直接给了各种累计次数，不用自己算，详情页拿来做「发射统计」四格
		// （location_* 与 agency_launch_attempt_count 前端从未展示，已删）
		orbital_launch_attempt_count: num(l.orbital_launch_attempt_count),
		orbital_launch_attempt_count_year: num(l.orbital_launch_attempt_count_year),
		agency_launch_attempt_count_year: num(l.agency_launch_attempt_count_year),

		pad_launch_attempt_count: num(l.pad_launch_attempt_count),
		pad_launch_attempt_count_year: num(l.pad_launch_attempt_count_year)
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

/**
 * 统计用的极简裁剪：一条发射只留聚合需要的字段。
 * 统计页要按年份 / 机构 / 火箭 / 发射场 / 轨道 随便切维度，
 * 与其在 CI 里把结果算死，不如把「原料」压到最小传给前端，
 * 前端想加什么维度都不用改同步脚本。
 */
function slimStatLaunch(l) {
	return {
		// id 和 name 是给「失败复盘」列表用的，要能点进详情
		id: l.id ?? null,
		name: str(l.name),
		net: str(l.net),
		// 只存 abbrev，前端按 Success / Failure / Partial 归类
		status: str(l.status && l.status.abbrev) || str(l.status && l.status.name),
		agency: str(l.launch_service_provider && l.launch_service_provider.name),
		rocket: str(l.rocket && l.rocket.configuration && l.rocket.configuration.name),
		orbit:
			str(l.mission && l.mission.orbit && l.mission.orbit.abbrev) ||
			str(l.mission && l.mission.orbit && l.mission.orbit.name),
		// pad.name 是工位（SLC-4E），location 才是发射场（范登堡太空军基地），
		// 「发射场 TOP 10」要用后者
		site: str(l.pad && l.pad.location && l.pad.location.name)
	}
}

/**
 * 火箭型号配置（/launcher_configurations/）
 *
 * 这个端点**只有 mode=detailed 才给技术参数**，normal 模式下 length / diameter /
 * launch_mass / leo_capacity 全是 undefined —— 之前正是踩了这个坑，
 * 以为 LL2 没有型号数据，其实是端点名写成了 /configurations/（404）。
 * 正确路径是 `/launcher_configurations/`（带下划线）。
 */
function slimLauncher(c) {
	const fams = Array.isArray(c.families)
		? c.families.map((f) => str(f && f.name)).filter(Boolean)
		: []

	return {
		id: c.id ?? null,
		name: str(c.name),
		full_name: str(c.full_name),
		variant: str(c.variant),
		families: fams,

		// manufacturer 在 detailed 下是字符串，也见过对象形态，两种都兜住
		manufacturer: str(c.manufacturer) || str(c.manufacturer && c.manufacturer.name),

		// 技术参数
		length: num(c.length),
		diameter: num(c.diameter),
		// 起飞质量单位是吨
		launch_mass: num(c.launch_mass),
		// 起飞推力单位 kN
		to_thrust: num(c.to_thrust),
		// 运力单位 kg
		leo_capacity: num(c.leo_capacity),
		gto_capacity: num(c.gto_capacity),
		maiden_flight: str(c.maiden_flight),
		min_stage: num(c.min_stage),
		max_stage: num(c.max_stage),
		launch_cost: num(c.launch_cost),
		reusable: Boolean(c.reusable),
		active: Boolean(c.active),

		// 战绩
		total_launch_count: num(c.total_launch_count),
		successful_launches: num(c.successful_launches),
		failed_launches: num(c.failed_launches),
		pending_launches: num(c.pending_launches),

		description: str(c.description),
		// 中文由 backfill 任务慢慢补，前端回退英文
		descriptionZh: '',

		// 只给现役型号保留图片：532 张全镜像会把 CI 顶到超时，
		// 退役型号的图访客也很少看，留空用占位图即可
		image: c.active ? imageUrl(c.image) : '',
		info_url: str(c.info_url),
		wiki_url: str(c.wiki_url)
	}
}

module.exports = {
	slimLaunch,
	slimEvent,
	slimAgency,
	slimLauncher,
	slimStatLaunch
}
