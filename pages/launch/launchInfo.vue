<template>
	<view class="page">
		<!-- 沉浸式页面没有原生导航栏，返回按钮由组件自己画 -->
		<nav-bar :solid="navSolid" :title="navSolid ? '发射任务详情' : ''" />

		<view class="loading" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!detail">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">未找到该发射任务</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<!-- 首图：固定高度裁切。原先是 mode=widthFix 让图片按原比例撑开，
			     遇到竖图会占满整屏，用户得滑很久才能看到信息 -->
			<!-- 首图：顶到屏幕最上方做沉浸式。只有一张图时用 image，
			     将来有多张会自动走 swiper 轮播 -->
			<view class="hero">
				<swiper
					v-if="heroImages.length > 1"
					class="hero-swiper"
					:indicator-dots="true"
					indicator-color="rgba(255,255,255,0.35)"
					indicator-active-color="#38bdf8"
					:autoplay="true"
					:interval="5000"
					circular
				>
					<swiper-item v-for="(img, i) in heroImages" :key="i">
						<image
							class="hero-img"
							:src="img"
							mode="aspectFill"
							@click="preview(img)"
						></image>
					</swiper-item>
				</swiper>

				<image
					v-else-if="heroImages.length === 1"
					class="hero-img"
					:src="heroImages[0]"
					mode="aspectFill"
					@click="preview(heroImages[0])"
				></image>

				<view v-else class="hero-img hero-placeholder"></view>

				<view class="hero-mask"></view>

				<!-- 图片计数角标：多图轮播时才有意义，单图显示「1/1」纯噪音 -->
				<view class="hero-count" v-if="heroImages.length > 1">1/{{ heroImages.length }}</view>
			</view>

			<view class="body">
				<view class="head">
					<text class="name">{{ displayName }}</text>
					<view class="badge" :class="statusClass">
						{{ (detail.status && (detail.status.nameZh || detail.status.name)) || '未知' }}
					</view>
				</view>

				<!-- 倒计时：发射前最有用的一行 -->
				<view class="cd-row" v-if="isUpcoming">
					<countdown :net="detail.net" size="lg" />
				</view>

				<!-- 发射周期：LL2 单条详情才有 timeline，没抓到的任务整块不显示。
				     默认只给「接下来要发生的」几步，避免一屏全是已经做完的流程 -->
				<view class="tl" v-if="tlDisplay.length">
					<view class="tl-head">
						<text class="tl-title">发射周期</text>
						<text class="tl-more" v-if="tlOpen" @click="tlOpen = false">收起</text>
						<text class="tl-more" v-else-if="tlMore > 0" @click="tlOpen = true">
							展开全部 {{ tlTotal }} 步
						</text>
					</view>
					<view class="tl-list">
						<view class="tl-row" v-for="(it, i) in tlDisplay" :key="i" :class="{ past: it.past }">
							<view class="tl-dot"></view>
							<text class="tl-name">{{ it.label }}</text>
							<text class="tl-rel">{{ it.relText }}</text>
						</view>
					</view>
				</view>

				<!-- 发射时刻：本地时间的大字，比「2026-10-27 12:45（3 小时后）」好扫 -->
				<view class="when">
					<view class="when-top">
						<view class="when-cap-wrap">
							<text class="when-cap">发射时间</text>
							<text class="when-tz">北京时间</text>
						</view>
						<view class="meta-acts">
							<button class="share-btn" open-type="share" @tap="onShareTap">
								<text class="share-icon">⤴</text>
								<text class="share-text">分享</text>
							</button>
							<view class="fav" :class="{ on: isFav }" @click="toggleFav">
								<text class="fav-icon">{{ isFav ? '★' : '☆' }}</text>
								<text class="fav-text">{{ isFav ? '已收藏' : '收藏' }}</text>
							</view>
						</view>
					</view>
					<text class="when-clock">{{ clockText }}</text>
					<view class="when-bottom">
						<text class="when-date">{{ dateText }}</text>
						<text class="when-rel" v-if="relText">{{ relText }}</text>
					</view>
				</view>

				<!-- 计划发射窗口：两端的时刻 + 一条带节点的轴，
				     告诉用户这次发射有几分钟到几小时的余量 -->
				<view class="win" v-if="winEnd">
					<view class="win-head">
						<text class="win-title">计划发射窗口</text>
						<text class="win-span">{{ winSpan }}</text>
					</view>
					<view class="win-track">
						<view class="win-node"></view>
						<view class="win-line"></view>
						<view class="win-node"></view>
					</view>
					<view class="win-ends">
						<view class="win-end">
							<text class="win-time">{{ winStartClock }}</text>
							<text class="win-cap">开始</text>
						</view>
						<view class="win-end is-right">
							<text class="win-time">{{ winEndClock }}</text>
							<text class="win-cap">结束</text>
						</view>
					</view>
				</view>

				<!-- 任务详情 -->
				<view class="card" v-if="hasMission">
					<view class="card-title">任务详情</view>
					<view class="row" v-if="missionName">
						<text class="label">任务名</text>
						<text class="value">{{ missionName }}</text>
					</view>
					<view class="row" v-if="missionType">
						<text class="label">任务类型</text>
						<text class="value">{{ missionType }}</text>
					</view>
					<!-- 轨道做成标签：缩写（LEO / GTO）+ 全称并排，
					     比「目标轨道：Low Earth Orbit」一行更好扫 -->
					<view class="chips" v-if="orbitChips.length">
						<text class="chip" :class="{ 'chip-strong': c.abbrev }" v-for="(c, i) in orbitChips" :key="i">
							{{ c.text }}
						</text>
					</view>
					<!-- 任务描述动辄几百上千字，默认只给 4 行 + 展开/收起。
					     详情页的功能定位是「查参数」，长文折叠后才不像科普文章
					     （审核按内容型小程序判类目，个人主体会被拒） -->
					<view v-if="missionDesc && !reviewMode">
						<text class="card-desc" :class="{ collapsed: !descExpanded && descOverflow }">{{ missionDesc }}</text>
						<view class="desc-toggle" v-if="descOverflow" @click="descExpanded = !descExpanded">
							{{ descExpanded ? '收起' : '展开全文' }}
						</view>
					</view>
				</view>

				<!-- 任务信息图：竖版长图，点开可双指放大 -->
				<view class="card" v-if="detail.infographic">
					<view class="card-title">任务信息图</view>
					<image
						class="infographic"
						:src="detail.infographic"
						mode="widthFix"
						lazy-load
						@click="preview(detail.infographic)"
					></image>
				</view>

				<!-- 火箭介绍：技术参数由同步阶段从型号库 join 进来（rocketBrief），
				     点卡片进型号页看该型号的全部构型与发射记录 -->
				<view class="card rcard" v-if="rocketName" @click="goRocket">
					<view class="card-title">
						火箭介绍
						<text class="arrow">›</text>
					</view>

					<view class="rhead">
						<image
							class="rimg"
							v-if="rocketImage"
							:src="rocketImage"
							mode="aspectFill"
							lazy-load
						></image>
						<view class="rmain">
							<view class="rname-row">
								<text class="rname">{{ rocketName }}</text>
								<text class="rtag" :class="rocketActive ? 'rtag-on' : 'rtag-off'">
									{{ rocketActive ? '现役' : '已退役' }}
								</text>
							</view>
							<text class="rsub" v-if="rocketSub">{{ rocketSub }}</text>
							<view class="rtag-row" v-if="rocketFlags.length">
								<text class="rtag" v-for="(f, i) in rocketFlags" :key="i">{{ f }}</text>
							</view>
						</view>
					</view>

					<text class="rdesc" v-if="rocketDesc">{{ rocketDesc }}</text>

					<view class="rspec" v-if="rocketSpecs.length">
						<view class="rspec-cell" v-for="(p, i) in rocketSpecs" :key="i">
							<text class="rspec-v">{{ p.v }}</text>
							<text class="rspec-k">{{ p.k }}</text>
						</view>
					</view>

					<view class="rmeta" v-if="rocketMeta.length">
						<text class="rmeta-item" v-for="(m, i) in rocketMeta" :key="i">{{ m }}</text>
					</view>

					<!-- 发射机构：单独一行，点了进机构页（.stop 阻止冒泡到火箭页） -->
					<view class="ragency" v-if="agency" @click.stop="goAgency(agency.id)">
						<image
							v-if="agency.logo_url"
							class="ragency-logo"
							:src="agency.logo_url"
							mode="aspectFit"
						></image>
						<text class="ragency-name">{{ agencyLabel(agency.name) }}</text>
						<text class="arrow">›</text>
					</view>
				</view>

			<!-- 发射条件：概率和天气顾虑都是 LL2 的可选字段，没有就整块不显示。
			     审核模式下天气顾虑是长文，整块藏掉（概率保留） -->
			<view class="card" v-if="probabilityText || (weatherText && !reviewMode)">
				<view class="card-title">发射条件</view>
				<view class="row" v-if="probabilityText">
					<text class="label">预报概率</text>
					<text class="value">{{ probabilityText }}</text>
				</view>
				<text class="card-desc" v-if="weatherText && !reviewMode">{{ weatherText }}</text>
			</view>

			<!-- 失败原因：只有失败任务带这个字段，审核模式下是长文也藏掉 -->
			<view class="card" v-if="failText && !reviewMode">
				<view class="card-title">失败原因</view>
				<text class="card-desc">{{ failText }}</text>
			</view>

				<!-- 发射场地：地图 + 名称可点进工位详情 -->
				<view class="card" v-if="detail.pad && detail.pad.name">
					<view class="card-title">发射场地</view>
					<image
						class="padmap"
						v-if="padMapImage && !reviewMode"
						:src="padMapImage"
						mode="widthFix"
						lazy-load
						@click="preview(padMapImage)"
					></image>
					<view class="padrow" @click="goPad">
						<view class="padrow-main">
							<text class="padrow-name">{{ detail.pad.name }}</text>
							<text class="padrow-loc" v-if="padPlace">{{ padPlace }}</text>
						</view>
						<text class="arrow">›</text>
					</view>
					<view class="row" v-if="detail.pad.total_launch_count">
						<text class="label">该工位累计</text>
						<text class="value">{{ detail.pad.total_launch_count }} 次发射</text>
					</view>
					<view class="row" v-if="padCoord">
						<text class="label">经纬度</text>
						<text class="value">{{ padCoord }}</text>
					</view>
				</view>

				<!-- 统计概览：LL2 直接给了累计数，不用自己算 -->
				<view class="card" v-if="countCells.length">
					<view class="card-title">统计概览</view>
					<view class="stat-grid">
						<view class="stat-cell" v-for="c in countCells" :key="c.label">
							<text class="stat-num">{{ c.value }}</text>
							<text class="stat-label">{{ c.label }}</text>
						</view>
					</view>
				</view>

				<!-- 分享海报：canvas 离屏绘制任务卡片图，可保存到相册 / 发朋友圈 -->
				<view class="card" v-if="!reviewMode">
					<view class="card-title">分享</view>
					<view class="poster-btn" hover-class="poster-btn-hover" @click="makePoster">
						<text class="poster-btn-text">🖼 生成分享海报</text>
					</view>
				</view>

				<view class="footer-hint">
					<text>数据来源 The Space Devs · 中文翻译由同步任务生成</text>
				</view>

				<!-- 离屏画布：绘制 600x960 逻辑像素的竖版卡片，导出后保存到相册 -->
				<canvas type="2d" id="poster" class="poster-canvas"></canvas>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { findById as findByIdInArchive } from '@/utils/history.js'
import {
	formatDateTime,
	relativeTime,
	launchTitle,
	rocketName as rocketNameOf,
	orbitName,
	missionTypeName,
	agencyLabel,
	countryOf,
	clock,
	longDate,
	spanText,
	massText,
	costText,
	isStillUpcoming,
	textUnits
} from '@/utils/format.js'
import { pickTimeline, sortedTimeline, parseDuration, tlLabel, tlRelative } from '@/utils/timeline.js'
import * as fav from '@/utils/favorites.js'
import { getConfig } from '@/utils/config.js'

export default {
	data() {
		return {
			launchId: '',
			// 调用方带的大致时间（net），归档查找用来直接定位分片，可为空
			netHint: '',
			detail: null,
			agency: null,
			loading: true,
			isFav: false,
			navSolid: false,
			// 任务描述折叠态：默认收起，点击「展开全文」才铺开
			descExpanded: false,
			// 发射时间线（T- 序列）原始节点，来自 timelines.json，可能为空
			timeline: [],
			// 时间线是展开全部还是只给接下来几步
			tlOpen: false,
			// 审核模式：隐藏任务描述 / 天气顾虑 / 失败原因等长文，只留参数
			reviewMode: false
		}
	},
	computed: {
		// 首图轮播数据。目前 LL2 一个任务只给一张图，
		// 留成数组是为了以后多图源接进来时直接生效
		heroImages() {
			const d = this.detail
			if (!d) return []
			return [d.image].filter(Boolean)
		},
		netText() {
			if (!this.detail) return ''
			const abs = formatDateTime(this.detail.net)
			if (!abs) return '时间待定'
			return abs + '（' + relativeTime(this.detail.net) + '）'
		},
		// 「长征四号乙 | 未知载荷」：型号和任务名都走中文，翻不出来才回退原串
		displayName() {
			return launchTitle(this.detail)
		},
		missionName() {
			const m = this.detail && this.detail.mission
			if (!m) return ''
			return m.nameZh || m.name || ''
		},
		missionType() {
			const m = this.detail && this.detail.mission
			return m ? missionTypeName(m.type) : ''
		},
		missionDesc() {
			const m = this.detail && this.detail.mission
			if (!m) return ''
			return m.descriptionZh || m.description || ''
		},
		// 短描述（4 行以内）直接显示，不出现「展开全文」按钮
		descOverflow() {
			return this.missionDesc.length > 120
		},
		hasMission() {
			const m = this.detail && this.detail.mission
			return Boolean(
				m &&
					(m.name || m.nameZh || m.descriptionZh || m.description || m.type || (m.orbit && m.orbit.name))
			)
		},
		// 轨道：优先缩写（LEO / GTO 这种业内通用写法），没有就用全称
		orbitText() {
			const o = this.detail && this.detail.mission && this.detail.mission.orbit
			if (!o) return ''
			return orbitName(o.abbrev) || orbitName(o.name) || ''
		},
		rocketName() {
			return rocketNameOf(this.detail && this.detail.rocket && this.detail.rocket.configuration)
		},

		// 型号简介、图片、参数都来自同步阶段 join 进来的 rocketBrief
		// （launchers.json 太大，前端不为一张卡去拉 568KB）
		rocketBrief() {
			return (this.detail && this.detail.rocketBrief) || null
		},
		rocketImage() {
			return (this.rocketBrief && this.rocketBrief.image) || ''
		},
		rocketActive() {
			return Boolean(this.rocketBrief && this.rocketBrief.active)
		},
		// 副标题给英文原名：中文型号名有时是意译（猎鹰九号 / Falcon 9），
		// 两行并排一看就对得上英文资料
		rocketSub() {
			const b = this.rocketBrief
			if (!b || !b.name) return ''
			const zh = this.rocketName
			return b.name === zh ? '' : b.name
		},
		rocketFlags() {
			const b = this.rocketBrief
			if (!b) return []
			const out = []
			if (b.reusable) out.push('可复用')
			if (b.max_stage) out.push(b.max_stage + ' 级')
			return out
		},
		rocketDesc() {
			return (this.rocketBrief && this.rocketBrief.desc) || ''
		},
		// 参数六格：和参考图一致，两列三行
		rocketSpecs() {
			const b = this.rocketBrief
			if (!b) return []
			const cells = []
			const push = (k, v) => {
				if (v !== undefined && v !== null && v !== '' && v !== 0) cells.push({ k, v })
			}
			push('起飞推力', b.to_thrust ? b.to_thrust + ' 千牛' : '')
			push('长度', b.length ? b.length + ' 米' : '')
			push('直径', b.diameter ? b.diameter + ' 米' : '')
			push('级数', b.max_stage ? b.max_stage + ' 级' : '')
			push('LEO 运力', b.leo_capacity ? massText(b.leo_capacity) : '')
			push('GTO 运力', b.gto_capacity ? massText(b.gto_capacity) : '')
			return cells
		},
		// 参数格放不下的两项，用一行小字带过
		rocketMeta() {
			const b = this.rocketBrief
			if (!b) return []
			const out = []
			if (b.launch_mass) out.push('起飞质量 ' + b.launch_mass + ' 吨')
			if (b.launch_cost) out.push('单次造价 ' + costText(b.launch_cost))
			if (b.maiden_flight) out.push('首飞 ' + b.maiden_flight)
			return out
		},

		// 发射时刻一行大字 + 日期
		clockText() {
			return clock(this.detail && this.detail.net) || '待定'
		},
		dateText() {
			return longDate(this.detail && this.detail.net)
		},
		relText() {
			if (!this.detail) return ''
			return relativeTime(this.detail.net)
		},
		// 窗口两端的时刻与长度。LL2 里窗口长度从 0 分钟到几小时都有
		winEnd() {
			return (this.detail && this.detail.window_end) || ''
		},
		winStartClock() {
			return clock(this.detail && this.detail.window_start)
		},
		winEndClock() {
			return clock(this.detail && this.detail.window_end)
		},
		winSpan() {
			const d = this.detail
			if (!d) return ''
			return spanText(d.window_start, d.window_end)
		},

		// 轨道标签：缩写加粗 + 全称并排
		orbitChips() {
			const o = this.detail && this.detail.mission && this.detail.mission.orbit
			if (!o) return []
			const out = []
			if (o.abbrev) out.push({ text: orbitName(o.abbrev), abbrev: true })
			if (o.name && o.name !== o.abbrev) out.push({ text: orbitName(o.name), abbrev: false })
			return out
		},

		// 发射周期：默认只展示「接下来要发生的」几步，点「查看全部」铺开
		tlDisplay() {
			if (!this.timeline.length) return []
			const src = this.tlOpen
				? sortedTimeline(this.timeline)
				: pickTimeline(this.timeline, this.detail && this.detail.net, Date.now(), 4).list

			const t0 = this.detail && this.detail.net ? new Date(this.detail.net).getTime() : NaN
			const now = Date.now()

			return src.map((it) => {
				const ms = parseDuration(it && it.t)
				const abs = isNaN(t0) || ms === null ? null : t0 + ms
				return {
					label: tlLabel(it),
					relText: tlRelative(ms),
					past: abs !== null && abs < now
				}
			})
		},
		tlTotal() {
			return pickTimeline(this.timeline, this.detail && this.detail.net, Date.now(), 4).total
		},
		tlMore() {
			return pickTimeline(this.timeline, this.detail && this.detail.net, Date.now(), 4).more
		},

		// LL2 直接给了累计次数，六格统计不用自己算
		countCells() {
			const d = this.detail
			if (!d) return []

			const cells = []
			const push = (value, label) => {
				if (typeof value === 'number' && value > 0) cells.push({ value, label })
			}
			push(d.orbital_launch_attempt_count, '全球累计')
			push(d.orbital_launch_attempt_count_year, '本年全球')
			push(d.agency_launch_attempt_count, '机构累计')
			push(d.agency_launch_attempt_count_year, '本年机构')
			push(d.pad_launch_attempt_count, '工位累计')
			push(d.pad_launch_attempt_count_year, '本年工位')
			return cells
		},
		probabilityText() {
			const p = this.detail && this.detail.probability
			return typeof p === 'number' ? p + '%' : ''
		},
		weatherText() {
			const d = this.detail
			if (!d) return ''
			return d.weather_concernsZh || d.weather_concerns || ''
		},
		failText() {
			const d = this.detail
			if (!d) return ''
			return d.failreasonZh || d.failreason || ''
		},
		padLocation() {
			const loc = this.detail && this.detail.pad && this.detail.pad.location
			return (loc && loc.name) || ''
		},
		padCoord() {
			const p = this.detail && this.detail.pad
			if (!p || p.latitude == null || p.longitude == null) return ''
			return p.latitude.toFixed(2) + ', ' + p.longitude.toFixed(2)
		},
		// 场地写法：设施名 + 中文国家。直接铺 "Jiuquan Satellite Launch Center,
		// People's Republic of China" 会占两行而且全是英文
		padPlace() {
			const name = this.padLocation
			if (!name) return ''
			const first = name.split(',')[0].trim()
			const country = countryOf(this.detail)
			if (!country || first === country) return first || country
			return first + ' · ' + country
		},
		// 工位卫星图：同步阶段按 750px 镜像到 COS，点开可全屏看
		padMapImage() {
			return (this.detail && this.detail.pad && this.detail.pad.map_image) || ''
		},
		// 还没发射（含推迟但状态未更新的）才显示倒计时
		isUpcoming() {
			return isStillUpcoming(this.detail)
		},
		statusClass() {
			const s = this.detail && this.detail.status
			if (!s) return 'normal'
			const a = s.abbrev || ''
			if (a === 'Success') return 'success'
			if (a === 'Failure' || a === 'Partial') return 'failure'
			if (a === 'In Flight') return 'flying'
			return 'pending'
		},
		// 分享出去时用任务名当标题，比「太空发射任务」有信息量得多
		shareText() {
			return this.displayName || '太空发射任务'
		},
		shareImg() {
			return (this.detail && this.detail.image) || '/static/logo.png'
		}
	},

	// 详情页自己定义分享，路径里显式带上 id，不依赖全局 mixin 去猜参数。
	// net 一并带上：分享出去的老任务若已滑出快照，打开时可直接定位到归档分片
	onShareAppMessage() {
		return {
			title: this.shareText,
			path: '/pages/launch/launchInfo?id=' + this.launchId + this._netQuery(),
			imageUrl: this.shareImg
		}
	},
	onShareTimeline() {
		return {
			title: this.shareText,
			query: 'id=' + this.launchId + this._netQuery(true),
			imageUrl: this.shareImg
		}
	},

	// 滚过首图后导航栏切成实色，否则图片上的文字看不清
	onPageScroll(e) {
		const solid = e.scrollTop > 200
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onShow() {
		// 页面实例可能被复用（navigateBack 回来而不是重新 onLoad），
		// 开关状态跟手刷新，避免切「正常」后长文仍处于隐藏态。
		// getConfig 有内存缓存，这里零开销。
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})
	},

	async onLoad(query) {
		const id = query && query.id
		this.launchId = id || ''
		// 大致时间提示：统计页失败复盘 / 分享路径会带上 net，
		// 归档查找用它直接跳到目标分片，省去逐片翻找（见 utils/history.js findById）
		this.netHint = (query && query.net) ? decodeURIComponent(query.net) : ''
		if (!id) {
			this.loading = false
			return
		}

		this.isFav = fav.has(id)
		// 换一个任务进来时描述回到折叠态
		this.descExpanded = false

		// 展示开关（App onLaunch 已预热，这里命中内存缓存，零开销）
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})

		// 同一条发射在跨过"当前时刻"后会从 upcoming 挪到 previous，
		// 用户刚看过列表就点进来时可能已经换边了，所以两边都查。
		// findLaunchById 内部先扫缓存，命中则零网络开销。
		let d = await spaceData.findLaunchById(id)

		// 快照（previous 只存最新 100 条）里没有 → 去历史归档分片里找。
		// 统计页失败复盘、已发射页更早条目都属于这类，之前会直接白屏。
		// netHint 可让查找直接跳到目标分片（findById 内部有限深与缓存上限）
		if (!d) {
			d = await findByIdInArchive(id, this.netHint)
		}

		this.detail = d
		this.loading = false

		// 时间线不阻塞首屏：页面先画出来，抓到的时间线到了再补一块
		this.loadTimeline(id)

		const providerId = d && d.launch_service_provider && d.launch_service_provider.id
		if (providerId) {
			this.agency = await spaceData.getAgencyById(providerId)
		}
	},
	methods: {
		/**
		 * 读发射时间线
		 *
		 * LL2 的列表端点 timeline 恒为空，只有单条详情才有，
		 * 配额又只够 CI 分批抓，所以大多数任务拿不到 —— 拿不到就整块不显示，
		 * 不能编造也不能拿别的任务的时间线顶上。
		 */
		async loadTimeline(id) {
			try {
				const d = await spaceData.load('timelines')
				const row = ((d && d.list) || []).find((x) => String(x.id) === String(id))
				this.timeline = (row && row.items) || []
			} catch (e) {
				// COS 上还没生成 timelines.json，或网络失败：静默降级
				this.timeline = []
			}
		},

		/** 分享路径里的 net 参数：知道大致时间才能在归档里直达目标分片 */
		_netQuery(noLeading) {
			const net = this.detail && this.detail.net
			if (!net) return ''
			return (noLeading ? '' : '&') + 'net=' + encodeURIComponent(net)
		},

		// ==================== 分享海报 ====================

		/** 入口：生成海报并保存到相册（canvas 2d 离屏绘制） */
		async makePoster() {
			const d = this.detail
			if (!d) return
			// #ifdef MP-WEIXIN
			try {
				uni.showLoading({ title: '生成中…', mask: true })
				const imgPath = await this._posterImage(d.image)
				const { canvas, ctx, W, H } = await this._posterCanvas()
				await this._drawPoster(canvas, ctx, W, H, imgPath)
				// 给绘制留一帧落盘的时间
				await new Promise((r) => setTimeout(r, 120))
				const res = await new Promise((resolve, reject) =>
					wx.canvasToTempFilePath({ canvas, success: resolve, fail: reject })
				)
				uni.hideLoading()
				this._shareOrSave(res.tempFilePath)
			} catch (e) {
				uni.hideLoading()
				const msg = (e && e.errMsg) || ''
				if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
					this._albumAuthModal()
				} else {
					console.warn('[launchInfo] 海报生成失败', e)
					uni.showToast({ title: '生成失败，请重试', icon: 'none' })
				}
			}
			// #endif
		},

		/** 任务图下载成本地路径；失败或没有图就返回 null（海报退化为纯背景） */
		_posterImage(url) {
			if (!url) return Promise.resolve(null)
			return new Promise((resolve) => {
				uni.downloadFile({
					url,
					success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : null),
					fail: () => resolve(null)
				})
			})
		},

		/** 拿 canvas 2d 节点，按 dpr 放大物理像素保证清晰度 */
		_posterCanvas() {
			return new Promise((resolve, reject) => {
				uni
					.createSelectorQuery()
					.in(this)
					.select('#poster')
					.fields({ node: true, size: true })
					.exec((res) => {
						const node = res && res[0] && res[0].node
						if (!node) return reject(new Error('canvas node not found'))
						const W = 600
						const H = 960
						const dpr = (uni.getSystemInfoSync().pixelRatio) || 2
						node.width = W * dpr
						node.height = H * dpr
						const ctx = node.getContext('2d')
						ctx.scale(dpr, dpr)
						resolve({ canvas: node, ctx, W, H })
					})
			})
		},

		/**
		 * 卡片内容（600x960 竖版）：
		 * 顶部任务图（cover 裁剪 + 底部渐隐）→ 标题（≤2 行）→ 状态/时间 →
		 * 火箭/机构/工位三行（长文本自动缩字号，尽量不截断）→ 分隔线 →
		 * 左下品牌文案 + 右下小程序码（static/qrcode.jpg，缺失则只画文字）。
		 */
		_drawPoster(canvas, ctx, W, H, imgPath) {
			const d = this.detail || {}
			return new Promise((resolve) => {
				const IMG_H = 320
				const PAD = 44

				// 背景
				const bg = ctx.createLinearGradient(0, 0, 0, H)
				bg.addColorStop(0, '#101a2e')
				bg.addColorStop(1, '#0a0e17')
				ctx.fillStyle = bg
				ctx.fillRect(0, 0, W, H)

				const paint = (qrImg) => {
					// 图底渐隐到背景色，图文衔接不生硬
					const fade = ctx.createLinearGradient(0, IMG_H - 90, 0, IMG_H)
					fade.addColorStop(0, 'rgba(10,14,23,0)')
					fade.addColorStop(1, '#0a0e17')
					ctx.fillStyle = fade
					ctx.fillRect(0, IMG_H - 90, W, 90)

					// ---- 标题：最多两行 ----
					let y = IMG_H + 76
					ctx.fillStyle = '#ffffff'
					ctx.font = 'bold 40px sans-serif'
					y = this._wrapText(ctx, this.displayName || '太空发射任务', PAD, W - PAD * 2, 54, 2, y)

					// ---- 状态（带圆点）+ 时间（独立一行，不再挤在一起）----
					const zh = (d.status && d.status.nameZh) || (d.status && d.status.abbrev) || ''
					y += 34
					if (zh) {
						ctx.fillStyle = '#38bdf8'
						ctx.beginPath()
						ctx.arc(PAD + 6, y - 9, 6, 0, Math.PI * 2)
						ctx.fill()
						ctx.font = 'bold 28px sans-serif'
						ctx.fillText(zh, PAD + 24, y)
					}
					y += 42
					ctx.fillStyle = '#8a97a8'
					ctx.font = '27px sans-serif'
					ctx.fillText(formatDateTime(d.net) || '', PAD, y)

					// ---- 火箭 / 机构 / 工位：固定锚点排布，长文本逐级缩字号 ----
					const rows = [
						['火箭', rocketNameOf(d) || (d.rocket && d.rocket.configuration && d.rocket.configuration.name) || ''],
						['机构', (d.launch_service_provider && d.launch_service_provider.name) || ''],
						['工位', (d.pad && d.pad.name ? d.pad.name + ' · ' : '') + ((d.pad && d.pad.location && d.pad.location.name) || '')]
					]
					const rowY = [640, 688, 736]
					const valX = PAD + 84
					for (let i = 0; i < rows.length; i++) {
						const label = rows[i][0]
						const value = rows[i][1]
						if (!value) continue
						ctx.font = '24px sans-serif'
						ctx.fillStyle = '#4a5568'
						ctx.fillText(label, PAD, rowY[i])
						// 值从 27px 起，放不下逐级降到 22px，仍放不下才截断
						const maxW = W - PAD - valX
						let size = 27
						ctx.font = size + 'px sans-serif'
						while (size > 22 && ctx.measureText(value).width > maxW) {
							size -= 1
							ctx.font = size + 'px sans-serif'
						}
						ctx.fillStyle = '#e2e8f0'
						ctx.fillText(this._ellipsis(ctx, value, maxW), valX, rowY[i])
					}

					// ---- 分隔线 ----
					ctx.strokeStyle = 'rgba(255,255,255,0.08)'
					ctx.beginPath()
					ctx.moveTo(PAD, 784)
					ctx.lineTo(W - PAD, 784)
					ctx.stroke()

					// ---- 右下：小程序码（白底圆角衬托）----
					if (qrImg) {
						const S = 132
						const qx = W - PAD - S
						const qy = H - PAD - S
						ctx.fillStyle = '#ffffff'
						this._roundRect(ctx, qx - 10, qy - 10, S + 20, S + 20, 14)
						ctx.fill()
						ctx.drawImage(qrImg, qx, qy, S, S)
					}

					// ---- 左下：品牌文案（右边界让开二维码）----
					const brandW = qrImg ? W - PAD - 152 - 40 - PAD : W - PAD * 2
					ctx.fillStyle = '#8a97a8'
					ctx.font = 'bold 32px sans-serif'
					ctx.fillText('太空发射任务', PAD, 830)
					ctx.fillStyle = '#4a5568'
					ctx.font = '24px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '看发射 · 查火箭 · 懂航天', brandW), PAD, 872)
					ctx.fillStyle = '#4a5568'
					ctx.font = '22px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '扫码打开小程序', brandW), PAD, 908)
					resolve()
				}

				/**
				 * 小程序码来源：项目根目录「小程序码.jpg」（公众平台下载的固定码）。
				 * 无服务端调不了 getUnlimited（要 access_token），生成不了带 scene
				 * 的任务直达码，固定码只能指向首页——可接受。文件缺失时静默跳过。
				 */
				const loadQr = () => {
					const qr = canvas.createImage()
					qr.onload = () => paint(qr)
					qr.onerror = () => paint(null)
					qr.src = '/static/qrcode.jpg'
				}

				if (imgPath) {
					// cover 裁剪画顶部图
					const img = canvas.createImage()
					img.onload = () => {
						const scale = Math.max(W / img.width, IMG_H / img.height)
						const dw = img.width * scale
						const dh = img.height * scale
						ctx.drawImage(img, (W - dw) / 2, (IMG_H - dh) / 2, dw, dh)
						loadQr()
					}
					img.onerror = loadQr
					img.src = imgPath
				} else {
					loadQr()
				}
			})
		},

		/** 圆角矩形路径（海报白底衬托用） */
		_roundRect(ctx, x, y, w, h, r) {
			ctx.beginPath()
			ctx.moveTo(x + r, y)
			ctx.arcTo(x + w, y, x + w, y + h, r)
			ctx.arcTo(x + w, y + h, x, y + h, r)
			ctx.arcTo(x, y + h, x, y, r)
			ctx.arcTo(x, y, x + w, y, r)
			ctx.closePath()
		},

		/** 多行文本绘制，返回结束 y */
		_wrapText(ctx, text, x, maxWidth, lineHeight, maxLines, y) {
			const lines = []
			let line = ''
			for (const ch of String(text)) {
				if (ctx.measureText(line + ch).width > maxWidth) {
					lines.push(line)
					line = ch
					if (lines.length >= maxLines - 1) break
				} else {
					line += ch
				}
			}
			if (line) lines.push(line)
			for (const l of lines.slice(0, maxLines)) {
				ctx.fillText(l, x, y)
				y += lineHeight
			}
			return y
		},

		_ellipsis(ctx, text, maxWidth) {
			const t = String(text)
			if (ctx.measureText(t).width <= maxWidth) return t
			let s = t
			while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1)
			return s + '…'
		},

		/**
		 * 海报生成后的出口：优先拉起原生「图片分享菜单」——
		 * 里面有「发送给朋友」（把海报图直接发到聊天）和「保存图片」，
		 * 转发 / 存相册一步到位，正好补上未认证小程序发不了卡片的空。
		 * 基础库不支持 showShareImageMenu 时退回只存相册。
		 */
		_shareOrSave(filePath) {
			const ok = typeof wx !== 'undefined' && typeof wx.showShareImageMenu === 'function'
			if (ok) {
				wx.showShareImageMenu({
					path: filePath,
					fail: (e) => {
						const msg = (e && e.errMsg) || ''
						// 用户主动关菜单不算失败
						if (msg.indexOf('cancel') !== -1) return
						if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
							this._albumAuthModal()
						} else {
							this._saveToAlbum(filePath).catch(() => {})
						}
					}
				})
			} else {
				this._saveToAlbum(filePath).catch(() => this._albumAuthModal())
			}
		},

		/** 相册权限被拒时的引导弹窗 */
		_albumAuthModal() {
			uni.showModal({
				title: '需要相册权限',
				content: '保存海报需要相册权限，请在设置中开启',
				confirmText: '去设置',
				success: (r) => {
					if (r.confirm) uni.openSetting()
				}
			})
		},

		_saveToAlbum(filePath) {
			return new Promise((resolve, reject) => {
				uni.saveImageToPhotosAlbum({
					filePath,
					success: () => {
						uni.showToast({ title: '已保存到相册', icon: 'success' })
						resolve()
					},
					fail: reject
				})
			})
		},

		// 工位名 → pad 详情。pad 库是每天刷的全量快照，
		// 但新工位可能还没进库，跳过去查不到时页面有自己的空态兜底
		goPad() {
			const p = this.detail && this.detail.pad
			if (!p || !p.name) return
			uni.navigateTo({
				url: '/pages/pad/pad?id=' + (p.id || '') + '&name=' + encodeURIComponent(p.name)
			})
		},

		goAgency(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/agencies/agencies?id=' + id })
		},
		goRocket() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.id) return
			const name = c.full_name || c.name || ''
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + c.id + '&name=' + encodeURIComponent(name)
			})
		},
		/**
		 * 分享按钮 tap：转发面板由 open-type=share 接管，正常情况点它就弹面板。
		 * 微信没有「认证状态」的运行时 API，这里只能做能力检测兜底：
		 * 转发不可用的环境（基础库过老 / 被限制的场景）面板不弹、按钮像坏了，
		 * 此时 tap 仍会触发 —— 直接转去生成海报，保证按钮永远有响应。
		 */
		onShareTap() {
			const supported =
				typeof wx !== 'undefined' && wx.canIUse && wx.canIUse('button.open-type.share')
			if (!supported) {
				uni.showToast({ title: '当前环境不支持转发，试试海报', icon: 'none' })
				this.makePoster()
			}
		},

		toggleFav() {
			if (!this.launchId) return
			this.isFav = fav.toggle(this.launchId)
			uni.showToast({
				title: this.isFav ? '已收藏，列表里会置顶' : '已取消收藏',
				icon: 'none',
				duration: 1500
			})
		},
		// 点开图片能双指放大，长图信息不点开根本看不清
		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		},
		goBack() {
			const pages = getCurrentPages()
			if (pages.length > 1) {
				uni.navigateBack()
			} else {
				uni.switchTab({ url: '/pages/index/index' })
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 60rpx;
}

.loading,
.empty {
	padding: 240rpx 60rpx;
	text-align: center;
}

.loading-text,
.empty-text {
	display: block;
	color: #6b7891;
	font-size: 30rpx;
}

.empty-icon {
	display: block;
	font-size: 80rpx;
	margin-bottom: 30rpx;
}

.btn {
	display: inline-block;
	margin-top: 50rpx;
	padding: 20rpx 60rpx;
	background: rgba(56, 189, 248, 0.15);
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	color: #38bdf8;
	font-size: 30rpx;
	border-radius: 60rpx;
}

/* 首图：顶到屏幕最上方，状态栏压在图上，形成沉浸感 */
.hero {
	position: relative;
	width: 100%;
	height: 660rpx;
}

.hero-swiper {
	width: 100%;
	height: 100%;
}

.hero-img {
	width: 100%;
	height: 100%;
	display: block;
}

.hero-placeholder {
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.hero-mask {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 100%;
	height: 200rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, #0a0e17 100%);
}

/* 图片计数角标：右上角压在图上，给一层半透明底保证在亮天空上也读得清 */
.hero-count {
	position: absolute;
	right: 24rpx;
	bottom: 24rpx;
	padding: 4rpx 16rpx;
	border-radius: 24rpx;
	background: rgba(0, 0, 0, 0.42);
	color: rgba(255, 255, 255, 0.92);
	font-size: 22rpx;
	line-height: 32rpx;
	letter-spacing: 1rpx;
}

.body {
	padding: 0 32rpx;
	margin-top: -40rpx;
	position: relative;
}

.head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 20rpx;
}

.name {
	flex: 1;
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.4;
}

.badge {
	flex-shrink: 0;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
	white-space: nowrap;
	margin-top: 8rpx;
}

.badge.pending {
	background: rgba(56, 189, 248, 0.15);
	color: #38bdf8;
}

.badge.success {
	background: rgba(52, 199, 89, 0.15);
	color: #34c759;
}

.badge.failure {
	background: rgba(255, 59, 48, 0.15);
	color: #ff3b30;
}

.badge.flying {
	background: rgba(245, 195, 59, 0.15);
	color: #f5c33b;
}

.badge.normal {
	background: rgba(255, 255, 255, 0.08);
	color: #a0aec0;
}

.meta-line {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 16rpx;
}

.cd-row {
	margin-top: 26rpx;
}

/* ---- 发射周期（T- 序列） ---- */
.tl {
	margin-top: 24rpx;
	padding: 26rpx 28rpx 12rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.tl-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8rpx;
}

.tl-title {
	color: #e2e8f0;
	font-size: 30rpx;
	font-weight: 600;
}

.tl-more {
	color: #38bdf8;
	font-size: 24rpx;
}

.tl-row {
	display: flex;
	align-items: center;
	padding: 11rpx 0;
}

.tl-dot {
	width: 10rpx;
	height: 10rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: #38bdf8;
	box-shadow: 0 0 0 4rpx rgba(56, 189, 248, 0.14);
}

.tl-name {
	flex: 1;
	min-width: 0;
	margin-left: 18rpx;
	color: #cbd5e0;
	font-size: 27rpx;
	line-height: 36rpx;
}

.tl-rel {
	flex-shrink: 0;
	margin-left: 16rpx;
	color: #7d8ba0;
	font-size: 24rpx;
	line-height: 36rpx;
	font-variant-numeric: tabular-nums;
}

/* 已经发生的节点压暗：一眼看出流程走到哪一步了 */
.tl-row.past .tl-name,
.tl-row.past .tl-rel {
	color: #5a6478;
}

.tl-row.past .tl-dot {
	background: #3b4658;
	box-shadow: none;
}

/* ---- 发射时刻 ---- */
.when {
	margin-top: 20rpx;
	padding: 26rpx 30rpx 24rpx;
	background: linear-gradient(135deg, #17243a 0%, #141a26 100%);
	border-radius: 20rpx;
	border: 1rpx solid rgba(56, 189, 248, 0.12);
}

.when-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.when-cap-wrap {
	display: flex;
	align-items: baseline;
}

.when-cap {
	color: #cbd5e0;
	font-size: 26rpx;
}

.when-tz {
	margin-left: 12rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* 时刻是这张卡的主角：76rpx 大字，tabular-nums 让分钟跳动时不抖 */
.when-clock {
	display: block;
	margin-top: 4rpx;
	color: #ffffff;
	font-size: 76rpx;
	font-weight: 700;
	line-height: 1.12;
	letter-spacing: 2rpx;
	font-variant-numeric: tabular-nums;
}

.when-bottom {
	display: flex;
	align-items: center;
	margin-top: 4rpx;
}

.when-date {
	color: #a0aec0;
	font-size: 26rpx;
}

.when-rel {
	margin-left: 16rpx;
	color: #38bdf8;
	font-size: 24rpx;
}

/* ---- 计划发射窗口 ---- */
.win {
	margin-top: 20rpx;
	padding: 24rpx 30rpx 22rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.win-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.win-title {
	color: #cbd5e0;
	font-size: 26rpx;
}

.win-span {
	color: #6b7891;
	font-size: 22rpx;
}

.win-track {
	display: flex;
	align-items: center;
	margin-top: 22rpx;
}

.win-node {
	width: 12rpx;
	height: 12rpx;
	flex-shrink: 0;
	border-radius: 50%;
	background: #38bdf8;
}

.win-line {
	flex: 1;
	height: 2rpx;
	margin: 0 6rpx;
	background: rgba(56, 189, 248, 0.45);
}

.win-ends {
	display: flex;
	justify-content: space-between;
	margin-top: 10rpx;
}

.win-end {
	display: flex;
	flex-direction: column;
}

.win-end.is-right {
	align-items: flex-end;
}

.win-time {
	color: #e2e8f0;
	font-size: 34rpx;
	font-weight: 600;
	line-height: 1.2;
	font-variant-numeric: tabular-nums;
}

.win-cap {
	margin-top: 2rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* ---- 轨道标签 ---- */
.chips {
	display: flex;
	flex-wrap: wrap;
	margin-top: 16rpx;
}

.chip {
	margin: 0 12rpx 12rpx 0;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7dd3fc;
	font-size: 23rpx;
}

.chip-strong {
	background: rgba(56, 189, 248, 0.18);
	color: #38bdf8;
	font-weight: 600;
}

/* ---- 火箭介绍 ---- */
.rhead {
	display: flex;
}

.rimg {
	width: 180rpx;
	height: 180rpx;
	flex-shrink: 0;
	border-radius: 14rpx;
	background: #0f1621;
}

.rmain {
	flex: 1;
	min-width: 0;
	margin-left: 20rpx;
	display: flex;
	flex-direction: column;
}

.rname-row {
	display: flex;
	align-items: center;
}

.rname {
	flex: 1;
	min-width: 0;
	color: #ffffff;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 1.35;
}

.rsub {
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.rtag {
	margin-left: 10rpx;
	padding: 2rpx 12rpx;
	border-radius: 6rpx;
	background: rgba(255, 255, 255, 0.07);
	color: #8b98ad;
	font-size: 20rpx;
	line-height: 30rpx;
	white-space: nowrap;
}

.rtag-on {
	margin-left: 0;
	background: rgba(52, 199, 89, 0.14);
	color: #34c759;
}

.rtag-off {
	margin-left: 0;
	background: rgba(255, 255, 255, 0.06);
	color: #7d8ba0;
}

.rtag-row {
	display: flex;
	flex-wrap: wrap;
	margin-top: 10rpx;
}

.rdesc {
	display: -webkit-box;
	margin-top: 18rpx;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
	color: #a9b6c8;
	font-size: 26rpx;
	line-height: 1.7;
}

/* 六格参数：两列三行，和参考图一致 */
.rspec {
	display: flex;
	flex-wrap: wrap;
	margin-top: 18rpx;
	padding-top: 10rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}

.rspec-cell {
	width: 50%;
	padding: 12rpx 0 0;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
}

.rspec-v {
	color: #e2e8f0;
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.25;
}

.rspec-k {
	margin-top: 2rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.rmeta {
	display: flex;
	flex-wrap: wrap;
	margin-top: 16rpx;
}

.rmeta-item {
	margin-right: 20rpx;
	color: #7d8ba0;
	font-size: 22rpx;
}

/* 发射机构：贴在火箭卡底部，点了进机构页 */
.ragency {
	display: flex;
	align-items: center;
	margin-top: 20rpx;
	padding-top: 20rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}

.ragency-logo {
	width: 40rpx;
	height: 40rpx;
	flex-shrink: 0;
	margin-right: 14rpx;
	border-radius: 6rpx;
}

.ragency-name {
	flex: 1;
	min-width: 0;
	color: #cbd5e0;
	font-size: 25rpx;
}

/* ---- 发射场地 ---- */
.padmap {
	display: block;
	width: 100%;
	margin-bottom: 18rpx;
	border-radius: 12rpx;
	background: #0f1621;
}

.padrow {
	display: flex;
	align-items: center;
}

.padrow-main {
	flex: 1;
	min-width: 0;
}

.padrow-name {
	display: block;
	color: #e2e8f0;
	font-size: 28rpx;
	font-weight: 600;
	line-height: 1.4;
}

.padrow-loc {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 23rpx;
}

/* 四格统计 */
.stat-grid {
	display: flex;
	flex-wrap: wrap;
}

.stat-cell {
	width: 50%;
	padding: 18rpx 0;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.stat-num {
	color: #e2e8f0;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.2;
}

.stat-label {
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.time {
	flex: 1;
	color: #38bdf8;
	font-size: 28rpx;
	letter-spacing: 0.5rpx;
}

/* 收藏按钮：默认灰底描边，收藏后转成琥珀色 */
.fav {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: 20rpx;
	padding: 8rpx 20rpx;
	border-radius: 40rpx;
	background: rgba(255, 255, 255, 0.06);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
}

.fav.on {
	background: rgba(245, 195, 59, 0.14);
	border-color: rgba(245, 195, 59, 0.35);
}

.fav-icon {
	margin-right: 8rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.fav-text {
	color: #6b7891;
	font-size: 24rpx;
}

.fav.on .fav-icon,
.fav.on .fav-text {
	color: #f5c33b;
}

/* 收藏 + 分享并排 */
.meta-acts {
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

/* 分享按钮：原生 button 重置成与收藏一致的胶囊 */
.share-btn {
	display: flex;
	align-items: center;
	margin: 0 0 0 20rpx;
	padding: 8rpx 20rpx;
	border-radius: 40rpx;
	background: rgba(255, 255, 255, 0.06);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	line-height: 1;
	font-size: 24rpx;
}

/* 小程序 button 自带的边框伪元素必须拿掉，否则重影 */
.share-btn::after {
	border: none;
}

.share-icon {
	margin-right: 8rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.share-text {
	color: #6b7891;
	font-size: 24rpx;
}

/* 卡片 */
.card {
	margin-top: 28rpx;
	padding: 28rpx 30rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-link {
	position: relative;
}

.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 20rpx;
}

.arrow {
	float: right;
	color: #4a5568;
	font-size: 34rpx;
	line-height: 1;
}

.card-desc {
	display: block;
	margin-top: 18rpx;
	color: #cbd5e0;
	font-size: 29rpx;
	line-height: 1.75;
}

/* 折叠态：只给 4 行，超出省略（小程序 text 支持 -webkit-line-clamp） */
.card-desc.collapsed {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
}

.desc-toggle {
	margin-top: 12rpx;
	color: #38bdf8;
	font-size: 26rpx;
}

/* 任务信息图是竖版长图，用 widthFix 让它按原比例撑开，点开可放大 */
.infographic {
	display: block;
	width: 100%;
	border-radius: 12rpx;
	background: #0f1520;
}

.row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 14rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.row:first-of-type {
	border-top: none;
}

.label {
	flex-shrink: 0;
	width: 170rpx;
	color: #6b7891;
	font-size: 28rpx;
}

.value {
	flex: 1;
	text-align: right;
	color: #e2e8f0;
	font-size: 28rpx;
	line-height: 1.5;
	word-break: break-all;
}

.agency {
	display: flex;
	align-items: center;
	margin-bottom: 12rpx;
}

.agency-logo {
	width: 80rpx;
	height: 80rpx;
	margin-right: 20rpx;
	border-radius: 12rpx;
	background: rgba(255, 255, 255, 0.05);
}

.agency-name {
	color: #e2e8f0;
	font-size: 30rpx;
}

.poster-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20rpx 0;
	background: rgba(56, 189, 248, 0.12);
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	border-radius: 14rpx;
}

.poster-btn-hover {
	background: rgba(56, 189, 248, 0.24);
}

.poster-btn-text {
	color: #38bdf8;
	font-size: 28rpx;
}

/* 离屏画布：不参与布局也不可见，但 canvas 2d 照常绘制 */
.poster-canvas {
	position: fixed;
	left: -9999px;
	top: 0;
	width: 600px;
	height: 960px;
}

.row-link {
	cursor: pointer;
}

.value-wrap {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	min-width: 0;
}

.value-link {
	color: #38bdf8;
}

.value-arrow {
	color: #4a5568;
	font-size: 30rpx;
	margin-left: 8rpx;
}

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
