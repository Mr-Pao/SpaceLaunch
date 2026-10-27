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

/**
 * 缩略图：图片库里一屏要挂十几张，原图动辄 1-3MB 根本渲不出来。
 * LL2 的每张图都另存了一份 *_thumbnail_ 版本（宽度约 300px，几十 KB），
 * 优先用它；老数据没有缩略图时回退原图，至少不会空着。
 */
function thumbUrl(image) {
	if (!image || typeof image === 'string') return imageUrl(image)
	return image.thumbnail_url || image.image_url || ''
}

/** 图片署名（"CCTV" / "SpaceX" / "Xinhua/Wang Jiangbo"），图片库右下角当水印用 */
function imageCredit(image) {
	if (!image || typeof image === 'string') return ''
	return str(image.credit)
}

/**
 * 视频链接
 *
 * 字段在 launch **顶层** 的 `vid_urls`，元素形如
 * { priority, source, publisher, title, url, feature_image,
 *   type:{id,name}, start_time, end_time, live }。
 * 早期版本读的是 `mission.vid_urls` —— 那个在任何模式下都是空数组，
 * 这就是「视频库一条都没有」的真正原因，不是数据源不提供。
 *
 * 另一条实测结论：`mode=normal` **连 vid_urls 这个键都不返回**，
 * 只有 `mode=detailed` 才给。所以视频没法跟着普通同步顺路带回来，
 * 由 scripts/videos.js 专门用 detailed 分页抓，产物是 videos.json。
 * 这里仍然保留映射：launch 对象若是 detailed 来的，就不会把视频丢掉。
 */
function vidList(v) {
	if (!Array.isArray(v)) return []
	return v
		.filter((x) => x && (x.url || typeof x === 'string'))
		.map((x) =>
			typeof x === 'string'
				? { url: x, title: '', publisher: '', priority: 99 }
				: {
						url: str(x.url),
						title: str(x.title),
						publisher: str(x.publisher) || str(x.source),
						priority: Number(x.priority) || 99
					}
		)
		// priority 与「官方优先」是反的（官方那条数值最大），
		// 但前端不靠这个排序，交给 videos.js 按 type.id 排，这里只定个稳定次序
		.sort((a, b) => a.priority - b.priority)
		.slice(0, 3)
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
		// 图片库用的三个附加字段：缩略图省流量、署名当水印、图片名当图注
		//
		// imageThumb 刻意**不用** LL2 的 thumbnail_url：那个域名
		// （thespacedevs-prod.nyc3.digitaloceanspaces.com）国内拉一张要好几秒，
		// 而 sync.js 的镜像只改写配置里列出的字段，imageThumb 不在其中就等于永远漏网。
		// 让它和 image 同源同值 —— 镜像时 memo 按「URL + 预设」命中同一份产物，
		// 只上传一次，两个字段指向同一个 COS 地址。
		imageThumb: imageUrl(l.image),
		imageCredit: imageCredit(l.image),
		imageName: str(l.image && l.image.name),
		// 任务信息图（一张竖版长图）。LL2 里是 URL 字符串，也可能为 null
		infographic: imageUrl(l.infographic),
		// 视频库数据源（挂在 mission 下，不在 launch 顶层）
		vid: vidList(l.vid_urls || (l.mission && l.mission.vid_urls)),

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
			// 工位照片：图片库里「更多火箭照片」的主力来源之一，
			// 而且很多是 CCTV / Xinhua 这类现场实拍，正好带 credit 署名
			image: imageUrl(l.pad && l.pad.image),
			// 同上：不用 LL2 的 thumbnail_url，与 image 同源同值，
			// 镜像时命中同一份 COS 产物（见 slimLaunch 里的说明）
			imageThumb: imageUrl(l.pad && l.pad.image),
			imageCredit: imageCredit(l.pad && l.pad.image),
			imageName: str(l.pad && l.pad.image && l.pad.image.name),
			// 工位地图（卫星示意图）。详情页「发射场地」卡需要它 ——
			// 之前删掉是因为当时没地方用；现在要用，就只对 upcoming/previous
			// 这两个真正会展示的集开启镜像（见 sync.js 的 images 配置），
			// upcomingMore 那 376 条仍然不镜像，避免白烧流量
			map_image: imageUrl(l.pad && l.pad.map_image),
			total_launch_count: num(l.pad && l.pad.total_launch_count),
			location: {
				name: str(l.pad && l.pad.location && l.pad.location.name),
				total_launch_count: num(l.pad && l.pad.location && l.pad.location.total_launch_count)
			}
		},

		// 火箭技术参数（起飞推力 / 长度 / LEO / GTO / 造价…）不在这次的响应里：
		// normal 模式的 configuration 只给名字。同步阶段用 lib/enrich.js
		// 拿 launchers.json 按 config id 回填，前端因此零额外请求
		rocketBrief: null,

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

		// LL2 直接给了各种累计次数，不用自己算。
		// 详情页底部「统计概览」用 6 格：全球 / 本机构 / 本工位 的累计与本年
		orbital_launch_attempt_count: num(l.orbital_launch_attempt_count),
		orbital_launch_attempt_count_year: num(l.orbital_launch_attempt_count_year),
		agency_launch_attempt_count: num(l.agency_launch_attempt_count),
		agency_launch_attempt_count_year: num(l.agency_launch_attempt_count_year),
		pad_launch_attempt_count: num(l.pad_launch_attempt_count),
		pad_launch_attempt_count_year: num(l.pad_launch_attempt_count_year)
	}
}

/**
 * 发射工位（pad）—— /pads/ 端点，normal 模式就带全部所需字段
 * （实测 detailed 无额外字段，别浪费体积）。
 * pad 详情页用：地图图 + 坐标 + 累计发射数。
 */
function slimPad(p) {
	return {
		id: p.id ?? null,
		name: str(p.name),
		// pad 自身示意图（少部分有）与地图截图（251 张几乎全有）
		image: imageUrl(p.image),
		map_image: imageUrl(p.map_image),
		description: str(p.description),
		info_url: str(p.info_url),
		wiki_url: str(p.wiki_url),
		latitude: num(p.latitude),
		longitude: num(p.longitude),
		active: Boolean(p.active),
		// 实测 country 是**对象**（{id,name,alpha_2_code,...}），不是数组。
		// 早先按 p.country[0].alpha_2_code 取，Array.isArray 恒为假 → 国家代码全空
		country_code: (p.country && p.country.alpha_2_code) || '',
		total_launch_count: num(p.total_launch_count),
		location: {
			id: (p.location && p.location.id) ?? null,
			name: (p.location && p.location.name) || '',
			total_launch_count: num(p.location && p.location.total_launch_count)
		},
		// 只留前两个机构的 id+name，前端可跳机构页
		agencies: Array.isArray(p.agencies)
			? p.agencies.slice(0, 2).map((a) => ({ id: (a && a.id) ?? null, name: str(a && a.name) })).filter((a) => a.id)
			: []
	}
}

function slimEvent(e) {
	return {
		id: e.id ?? null,
		name: str(e.name),
		// 中文名由同步阶段回填，前端回退英文原名
		nameZh: '',
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
		// 高轨 / 太阳同步轨道：详情页参数表补齐这两档，免得只有 LEO/GTO 半张表
		geo_capacity: num(c.geo_capacity),
		sso_capacity: num(c.sso_capacity),
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
		// 连续成功次数：和「累计成功」是两个口径，榜单卡片和详情页都用得上
		consecutive_successful_launches: num(c.consecutive_successful_launches),

		// 回收记录：只有可复用型号有值，其余为 0
		attempted_landings: num(c.attempted_landings),
		successful_landings: num(c.successful_landings),
		failed_landings: num(c.failed_landings),
		consecutive_successful_landings: num(c.consecutive_successful_landings),
		// 最快周转（天），回收复用的硬指标
		fastest_turnaround: num(c.fastest_turnaround),

		description: str(c.description),
		// 中文由 backfill 任务慢慢补，前端回退英文
		descriptionZh: '',

		// 每个构型都要在详情页露脸，退役型号也不例外（Falcon 9 v1.0 / Block 4
		// 这些正是「不同构型」列表的主角，全空着就成了一排占位图）。
		// 镜像按 COS 已存在跳过，所以只有首次会真的下载 400 多张，
		// 之后每天那一轮只做 headObject，几秒钟就过。
		image: imageUrl(c.image),
		info_url: str(c.info_url),
		wiki_url: str(c.wiki_url)
	}
}

/**
 * 芯级个体（/launchers/）：每一枚真实存在过的第一级硬件。
 * 与 /launcher_configurations/（slimLauncher，型号库）是两个实体 ——
 * 这里是「B1067」这样的单枚编号。flights / successful_landings /
 * first_launch_date / last_launch_date / launcher_config **只在
 * mode=detailed 下返回**，normal 里连 flights 都没有（实测）。
 * launcher_config.id 与发射快照 rocket.configuration.id 同源，
 * 前端火箭详情页按型号 id 聚合出「这型火箭的全部芯级」。
 */
function slimCore(l) {
	const cfg = l.launcher_config || {}
	return {
		id: l.id ?? null,
		serial: str(l.serial_number),
		// 固定枚举：active / retired / expended / lost / destroyed，
		// 前端 format.coreStatusZh 查表中文化，不走翻译接口
		status: str(l.status && l.status.name),
		proven: Boolean(l.flight_proven),
		flights: num(l.flights),
		landed: num(l.successful_landings),
		landedTry: num(l.attempted_landings),
		first: str(l.first_launch_date),
		last: str(l.last_launch_date),
		configId: cfg.id ?? null,
		configName: str(cfg.full_name) || str(cfg.name),
		img: thumbUrl(l.image),
		credit: imageCredit(l.image),
		details: str(l.details),
		// 中文由 localize 按原文哈希回填，前端 detailsZh || details 回退
		detailsZh: ''
	}
}

/**
 * ISO 8601 时长 → 天数（LL2 的 time_in_space 是 P396DT11H33M45S 这种形态，
 * 前端不做解析，同步阶段一次算好）。解析失败返回 0。
 */
function isoDurationDays(s) {
	if (typeof s !== 'string') return 0
	const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/)
	if (!m) return 0
	const d = Number(m[1]) || 0
	const h = Number(m[2]) || 0
	const mi = Number(m[3]) || 0
	const sec = Number(m[4]) || 0
	return (d * 86400 + h * 3600 + mi * 60 + sec) / 86400
}

/**
 * 宇航员（/astronauts/，mode=detailed）。
 *
 * in_space 是「此刻在不在天上」的布尔（首页在轨卡片就是筛它）；
 * time_in_space / eva_time 是 ISO 时长， Slim 阶段换算成天 / 小时，
 * 前端零解析。flights/landings/spacewalks 三个**数组**（detailed 才有，
 * 每条都是大对象）必须在这里裁成一行任务/一次出舱的形状——
 * 原样带回去一张 astronauts.json 要涨好几 MB。
 * bio 只保留在轨人员的：862 条 bio 全存要 1MB+，翻译量也可控。
 */
/**
 * 出舱时长 → 小时。LL2 的 Spacewalk.duration 文档上没有钉死类型，
 * 实测见过秒数，也防一手 ISO 时长（PT6H30M），两种都兜住。解析失败返回 0。
 */
function evaHoursOf(v) {
	if (typeof v === 'number' && isFinite(v)) return Math.round((v / 3600) * 10) / 10
	if (typeof v === 'string') {
		const m = v.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/)
		if (m) {
			const h = Number(m[1]) || 0
			const mi = Number(m[2]) || 0
			const s = Number(m[3]) || 0
			return Math.round((h + mi / 60 + s / 3600) * 10) / 10
		}
	}
	return 0
}

/**
 * 乘组飞行（flights/landings 数组的元素，spacecraftflight 结构）→ 一行任务。
 *
 * 两数组元素同构：destination + spacecraft + launch。对详情页而言重要的是
 * 「坐什么火箭、哪天、去哪」——launch 只留 id/name/net/状态缩写和火箭短名。
 * landings 里偶有 launch 为 null 的（占位记录），整条丢弃。
 * missions ≤ 10：一般人也到不了，个别人（俄罗斯老将）飞行次数多，
 * 多的按时间倒序截断 —— 详情页展示用，不是档案库。
 */
function astroMission(f) {
	const l = (f && f.launch) || null
	if (!l || !l.id) return null
	const parts = String(l.name || '').split('|')
	const task = parts.length > 1 ? parts[1].trim() : String(l.name || '').trim()
	return {
		id: String(l.id),
		net: l.net || '',
		st: (l.status && l.status.abbrev) || '',
		name: task || l.name || '',
		rk: ((l.rocket && l.rocket.configuration) || {}).full_name || ((l.rocket && l.rocket.configuration) || {}).name || '',
		dest: str(f.destination)
	}
}

function slimAstronaut(a) {
	const nat = Array.isArray(a.nationality) && a.nationality[0]
	const ag = a.agency || {}
	const inSpace = Boolean(a.in_space)
	const days = Math.floor(isoDurationDays(a.time_in_space))
	const evaHours = Math.round(isoDurationDays(a.eva_time) * 24)

	// 飞行任务：flights（计划/在飞）+ landings（已返回）合并去重，新→旧排序
	const seen = {}
	const missions = []
	for (const f of [].concat(a.flights || [], a.landings || [])) {
		const m = astroMission(f)
		if (!m || seen[m.id]) continue
		seen[m.id] = true
		missions.push(m)
	}
	missions.sort((x, y) => (y.net || '').localeCompare(x.net || ''))

	// 出舱记录：LL2 给的就是「这一舱走了几次」的日志，按时间倒序留前 8 条
	const evas = (a.spacewalks || [])
		.filter((s) => s && (s.name || s.start))
		.map((s) => ({
			name: str(s.name),
			start: str(s.start),
			h: evaHoursOf(s.duration),
			loc: str(s.location)
		}))
		.sort((x, y) => y.start.localeCompare(x.start))
		.slice(0, 8)

	return {
		id: a.id ?? null,
		name: str(a.name),
		status: str(a.status && a.status.name),
		inSpace,
		days,
		evaHours,
		age: num(a.age),
		flights: num(a.flights_count),
		spacewalks: num(a.spacewalks_count),
		// 优先国名（France），nationality_name 是 French 这种形容词形态，
		// 前端的映射表按国名组织、形容词做兜底
		nation: str(nat && (nat.name || nat.nationality_name)),
		agencyName: str(ag.abbrev) || str(ag.name),
		img: thumbUrl(a.image),
		credit: imageCredit(a.image),
		bio: inSpace ? str(a.bio) : '',
		bioZh: '',
		// ---- 详情页增补（2026-10-26）：生日/纪念、外链、任务与出舱 ----
		dob: str(a.date_of_birth),
		dod: str(a.date_of_death),
		wiki: str(a.wiki),
		twitter: str(a.twitter),
		instagram: str(a.instagram),
		// 体积守门：空数组不落字段，862 人里大半是没飞过/没出过舱的
		...(missions.length ? { missions: missions.slice(0, 10) } : {}),
		...(evas.length ? { evas } : {})
	}
}

/**
 * 远征队 / 空间站当前乘员共用的「乘员一行」裁剪。
 *
 * LL2 里 crew 元素是 { role:{role}, astronaut:{...} }，astronaut 自带缩略图
 * profile_image_thumbnail，直接取字符串（thumbUrl 期望对象，这里绕过）。
 * 宇航员详情页点乘员按 id 跳；img 给列表头像用。
 */
function slimCrewMember(c) {
	const a = (c && c.astronaut) || {}
	const role = (c && c.role && c.role.role) || ''
	const ag = a.agency || {}
	return {
		id: a.id ?? null,
		name: str(a.name),
		role: str(role),
		agency: str(ag.abbrev || ag.name),
		img: str(a.profile_image_thumbnail) || str(a.profile_image)
	}
}

/**
 * 空间站（/space_stations/，mode=detailed，仅 15 个）。
 *
 * 关键字段：active_expeditions（当前远征队，detailed 才有，自带 crew）——直接内联，
 * 详情页就不必跨数据集查乘组了。owners 是完整 agency 数组（含长 description），
 * 只留缩写/国别/徽标。description 走 localize 翻中文（前端 descZh 回退）。
 */
function slimStation(s) {
	const owners = Array.isArray(s.owners)
		? s.owners.map((o) => ({
				name: str(o.name),
				abbrev: str(o.abbrev),
				cc: str(o.country_code),
				logo: str(o.logo_url || o.image_url)
		  }))
		: []

	const exps = Array.isArray(s.active_expeditions)
		? s.active_expeditions.map((e) => ({
				id: e.id ?? null,
				name: str(e.name),
				start: str(e.start),
				end: str(e.end),
				crew: (e.crew || []).map(slimCrewMember)
		  }))
		: []

	// 当前乘组：合并所有 active expedition 的 crew（ISS 偶有多条远征队并行），按 id 去重
	const crew = []
	const seen = {}
	for (const e of exps) {
		for (const m of e.crew) {
			if (m.id != null && seen[m.id]) continue
			seen[m.id] = true
			crew.push(m)
		}
	}

	return {
		id: s.id ?? null,
		name: str(s.name),
		status: str(s.status && s.status.name),
		type: str(s.type && s.type.name),
		founded: str(s.founded),
		deorbited: str(s.deorbited),
		orbit: str(s.orbit),
		height: num(s.height),
		width: num(s.width),
		mass: num(s.mass),
		volume: num(s.volume),
		onboardCrew: num(s.onboard_crew),
		docked: num(s.docked_vehicles),
		img: str(s.image_url),
		desc: str(s.description),
		descZh: '',
		owners,
		crew: exps.length ? crew : [],
		expeditions: exps.map((e) => ({ id: e.id, name: e.name, start: e.start, end: e.end }))
	}
}

/**
 * 远征队（/expeditions/，mode=detailed，165 条）。
 *
 * crew 元素含 role + astronaut 完整对象；station 是 {id,name} 或直接 null（老数据）。
 * mission_patches 是徽章图数组，只留 image_url。详情页乘组卡点宇航员 id 跳详情；
 * 空间站链接按 stationId 跳 station 页。
 */
function slimExpedition(e) {
	const ss = e.spacestation || {}
	return {
		id: e.id ?? null,
		name: str(e.name),
		start: str(e.start),
		end: str(e.end),
		stationId: ss.id ?? null,
		stationName: str(ss.name),
		crew: (e.crew || []).map(slimCrewMember),
		patches: (e.mission_patches || []).map((p) => str(p.image_url)).filter(Boolean)
	}
}

/**
 * 对接事件（/docking_events/，mode=detailed）。
 *
 * 字段干净：docking/departure 时间、flight_vehicle.spacecraft（飞船本体，
 * 含 serial + spacecraft_config 型号 + agency）、space_station 目标站。
 * 数量随正式库可能几百条，slim 后每条 ~200B，整体可控。
 */
function slimDocking(d) {
	const sv = (d.flight_vehicle && d.flight_vehicle.spacecraft) || {}
	const cfg = sv.spacecraft_config || {}
	const ag = cfg.agency || {}
	const ss = d.space_station || {}
	return {
		id: d.id ?? null,
		docking: str(d.docking),
		departure: str(d.departure),
		vehicle: str(sv.name),
		serial: str(sv.serial_number),
		config: str(cfg.name),
		agency: str(ag.abbrev || ag.name),
		stationId: ss.id ?? null,
		stationName: str(ss.name),
		location: str(d.docking_location)
	}
}

/**
 * 航天器型号（/spacecraft_configurations/，mode=detailed，仅 46 条，一页抓完）。
 *
 * 坑一：端点名。型号库是 spacecraft_configurations（复数 + 下划线），
 * 而 /spacecraft/ 是「个体飞船」610 条（Soyuz MS-28 这种带编号的实物），
 * 两者完全不是一回事，写错了会拿到一堆单艘飞船。
 *
 * 坑二：normal 模式只给 name / type / agency / family / in_use / image，
 * 高度、直径、载员、运力、成功率全在 detailed 里 —— 不带宽高参数，
 * 「型号库」就退化成一张名字清单，必须带 mode=detailed。
 *
 * 坑三：family 是从宽到窄的数组（Dragon → Dragon 2），取最后一层才是具体系列；
 * 21 条型号压根没有 family，这时留空串，前端按「无系列」处理。
 */
function slimSpacecraft(c) {
	const ag = c.agency || {}
	const country = Array.isArray(ag.country) ? ag.country[0] || {} : {}
	const fam = Array.isArray(c.family) ? c.family : []
	const img = c.image || {}

	// history 常常是 details 的开头一段（Apollo 那条完全一样），
	// 详情页会把两段连着排，这里把重复的前缀从 details 里切掉，省一半正文
	const history = str(c.history)
	let details = str(c.details)
	if (history && details.indexOf(history) === 0) details = details.slice(history.length).trim()

	return {
		id: c.id ?? null,
		name: str(c.name),
		type: str(c.type && c.type.name),
		// abbrev 是 SpX / RFSA 这种，全名留在 agencyFull 给详情页用
		agency: str(ag.abbrev || ag.name),
		agencyFull: str(ag.name),
		country: str(country.name),
		cc: str(country.alpha_2_code),
		family: fam.length ? str(fam[fam.length - 1].name) : '',
		inUse: !!c.in_use,
		img: str(img.image_url),
		// 尺寸：米；crew 人；payload 千克。null 表示该型号不适用
		//（货运飞船没有 crew_capacity，载人飞船没有 payload_capacity 的情况都有）
		height: num(c.height),
		diameter: num(c.diameter),
		crew: num(c.crew_capacity),
		humanRated: !!c.human_rated,
		payload: num(c.payload_capacity),
		payloadBack: num(c.payload_return_capacity),
		life: str(c.flight_life),
		maiden: str(c.maiden_flight),
		capability: str(c.capability),
		history,
		details,
		// 统计：46 条全有，详情页直接算成功率，前端不做除零
		flown: num(c.spacecraft_flown),
		launches: num(c.total_launch_count),
		ok: num(c.successful_launches),
		fail: num(c.failed_launches),
		landings: num(c.attempted_landings),
		landOk: num(c.successful_landings),
		landFail: num(c.failed_landings),
		turnaround: str(c.fastest_turnaround),
		wiki: str(c.wiki_link),
		info: str(c.info_link),
		// 以下由 localize 回填
		capZh: '',
		historyZh: '',
		detailsZh: '',
		lifeZh: ''
	}
}

module.exports = {
	slimLaunch,
	slimEvent,
	slimAgency,
	slimLauncher,
	slimCore,
	slimAstronaut,
	slimPad,
	slimStatLaunch,
	slimStation,
	slimExpedition,
	slimDocking,
	slimSpacecraft
}
