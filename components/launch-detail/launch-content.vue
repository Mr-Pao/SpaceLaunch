<template>
	<!-- 正文：简介 / 发射周期 / 发射时刻 / 任务 / 火箭 / 航天器 / 场地 / 统计。
	     跳转类（火箭 / 机构 / 工位 / 看大图）自己就能做，
	     会改到父组件状态的操作（收藏 / 提醒 / 分享 / 海报 / 折叠态）一律 emit 回传 -->
	<view>
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
						<text class="tl-more" v-if="tlOpen" @click="$emit('set-tl-open', false)">收起</text>
						<text class="tl-more" v-else-if="tlMore > 0" @click="$emit('set-tl-open', true)">
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
							<button class="share-btn" open-type="share" @tap="$emit('share-tap')">
								<text class="share-icon">⤴</text>
								<text class="share-text">分享</text>
							</button>
							<view class="fav" :class="{ on: isFav }" @click="$emit('fav')">
								<text class="fav-icon">{{ isFav ? '★' : '☆' }}</text>
								<text class="fav-text">{{ isFav ? '已收藏' : '收藏' }}</text>
							</view>
							<view class="remind" :class="{ on: isReminded }" v-if="isUpcoming" @click="$emit('remind')">
								<view class="remind-bell"></view>
								<text class="remind-text">{{ isReminded ? '已提醒' : '提醒' }}</text>
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
						<view class="desc-toggle" v-if="descOverflow" @click="$emit('toggle-desc')">
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
						<image class="ragency-flag" v-if="agencyFlag" :src="agencyFlag" mode="aspectFit"></image>
						<text class="ragency-name">{{ agencyLabel(agency.name) }}</text>
						<text class="arrow">›</text>
					</view>
				</view>

			<!-- 航天器：这次运的飞船/载荷本体。数据只在单条详情里有，
			     由 scripts/timeline.js 顺路抓（和时间线一起），没抓到整卡不显示。
			     排版直接复用火箭卡的 .rhead/.rspec，两卡视觉保持一致 -->
			<view class="card" v-if="craftTitle">
				<view class="card-title">航天器</view>

				<view class="rhead">
					<image
						class="rimg"
						v-if="craftImage"
						:src="craftImage"
						mode="aspectFill"
						lazy-load
						@click="preview(craftImage)"
					></image>
					<view class="rmain">
						<view class="rname-row">
							<text class="rname">{{ craftTitle }}</text>
							<text class="rtag" v-if="craftStatusText" :class="craftLive ? 'rtag-on' : 'rtag-off'">
								{{ craftStatusText }}
							</text>
						</view>
						<text class="rsub" v-if="craftSub">{{ craftSub }}</text>
						<view class="rtag-row" v-if="craftDest">
							<text class="rtag">目的地 · {{ craftDest }}</text>
						</view>
					</view>
				</view>

				<text class="rdesc" v-if="craftDesc">{{ craftDesc }}</text>

				<view class="rspec" v-if="craftSpecs.length">
					<view class="rspec-cell" v-for="(p, i) in craftSpecs" :key="i">
						<text class="rspec-v">{{ p.v }}</text>
						<text class="rspec-k">{{ p.k }}</text>
					</view>
				</view>

				<view class="rmeta" v-if="craftMeta.length">
					<text class="rmeta-item" v-for="(m, i) in craftMeta" :key="i">{{ m }}</text>
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

				<!-- 相关报道：资讯流里提到过本次发射的文章，点开进资讯详情。
				     关联来自 SNAPI 的 launch_id，绝大多数老任务一条都没有，
				     拿不到就整块不显示 —— 宁可不出现，也不给一个空卡片 -->
				<view class="card" v-if="news.length">
					<view class="card-title">
						相关报道
						<text class="news-count">{{ news.length }} 篇</text>
					</view>
					<view
						class="news-row"
						v-for="n in news"
						:key="n.id"
						hover-class="news-hover"
						@click="tapNews(n)"
					>
						<view class="news-body">
							<text class="news-title">{{ n.titleZh || n.title }}</text>
							<text class="news-meta">{{ n.site }} · {{ n.atShort || n.at }}</text>
						</view>
						<text class="news-go">›</text>
					</view>
				</view>
	</view>
</template>

<script>
import {
	launchTitle,
	relativeTime,
	rocketFullName,
	orbitName,
	missionTypeName,
	craftTypeName,
	craftStatusName,
	destName,
	agencyLabel as agencyLabelOf,
	countryOf,
	clock,
	longDate,
	spanText,
	massText,
	costText,
	isStillUpcoming,
	flagSrc
} from '@/utils/format.js'
import { pickTimeline, sortedTimeline, parseDuration, tlLabel, tlRelative } from '@/utils/timeline.js'

export default {
	name: 'launch-content',

	props: {
		// 发射详情原始数据（mission / rocket / pad 都在里面）
		detail: { type: Object, default: null },
		// 发射机构（异步补的，可能为 null）
		agency: { type: Object, default: null },
		// 本次任务的航天器（飞船本体），和 timeline 同一个来源，可能为 null
		craft: { type: Object, default: null },
		// 提到过本次发射的报道（来自资讯流反查），没有就是空数组
		news: { type: Array, default: () => [] },
		// 发射周期（T- 序列）原始节点，来自 timelines.json，可能为空
		timeline: { type: Array, default: () => [] },
		// 审核模式：隐藏任务描述 / 天气顾虑 / 失败原因等长文，只留参数
		reviewMode: { type: Boolean, default: false },
		isFav: { type: Boolean, default: false },
		isReminded: { type: Boolean, default: false },
		// 任务描述折叠态 / 时间线展开态都在父组件里（换任务时要复位）
		descExpanded: { type: Boolean, default: false },
		tlOpen: { type: Boolean, default: false }
	},

	emits: ['fav', 'remind', 'share-tap', 'poster', 'toggle-desc', 'set-tl-open'],

	computed: {
		// 机构国旗：要用英文原名认，中文名里没有国别信息
		agencyFlag() {
			return flagSrc(this.agency && this.agency.name)
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
		rocketName() {
			// 用完整名带构型：只写「猎鹰 9 号」的话，Block 5 和 v1.0 在同一次发射里分不出来
			return rocketFullName(this.detail && this.detail.rocket && this.detail.rocket.configuration)
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
		// 副标题给英文全名（含构型）：中文名有时是意译，两行并排一看就对得上英文资料
		rocketSub() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c) return ''
			const en = c.full_name || c.name || ''
			const zh = this.rocketName
			return en && en !== zh ? en : ''
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
		/* ---------- 航天器 ---------- */

		// 飞船名就是官方代号（Crew Dragon C204），不翻译；
		// 没有 name 的极少见，退回构型名
		craftTitle() {
			const c = this.craft
			if (!c) return ''
			return c.name || c.config || ''
		},
		// 副行：构型 · 类型 · 承制方（名称里已经含构型时不重复）
		craftSub() {
			const c = this.craft
			if (!c) return ''
			const out = []
			if (c.config && c.config !== c.name) out.push(c.config)
			if (c.type) out.push(craftTypeName(c.type))
			if (c.agency) out.push(agencyLabelOf(c.agency))
			return out.join(' · ')
		},
		craftStatusText() {
			const c = this.craft
			return (c && c.status && craftStatusName(c.status)) || ''
		},
		// 只有 Active 算「在役」，Destroyed / Lost / Retired 都用灰标签 ——
		// 别把「已损毁」染成绿色
		craftLive() {
			const s = (this.craft && this.craft.status) || ''
			return /^active$/i.test(s)
		},
		craftDest() {
			const c = this.craft
			return (c && c.dest && destName(c.dest)) || ''
		},
		craftDesc() {
			return (this.craft && this.craft.desc) || ''
		},
		craftImage() {
			return (this.craft && this.craft.image) || ''
		},
		craftSpecs() {
			const c = this.craft
			if (!c) return []
			const cells = []
			const push = (k, v) => {
				if (v) cells.push({ k, v })
			}
			push('高度', c.height ? c.height + ' 米' : '')
			push('直径', c.diameter ? c.diameter + ' 米' : '')
			// crew_capacity 是「能坐几个人」，无人飞船是 0，这里不显示 0
			push('载员', c.crew ? c.crew + ' 人' : '')
			push('运载能力', c.payload ? massText(c.payload) : '')
			// 值和标签上下排，别写成 push('本次是第', '1 次飞行') ——
			// 那样读起来是「本次是第 / 1 次飞行」，主谓被拆到两行
			push('本次飞行', c.flights ? '第 ' + c.flights + ' 次' : '')
			return cells
		},
		craftMeta() {
			const c = this.craft
			if (!c) return []
			const out = []
			if (c.human) out.push('可载人')
			// flight_life 是英文长句（"Able to fly for up to one week of free
			// flight or two years docked."），混在中文参数里像没切干净，
			// 又不值得为它引机器翻译，直接不显示
			if (c.maiden) out.push('构型首飞 ' + c.maiden)
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
		// 发射周期：默认只展示「接下来要发生的」几步，点「展开全部」铺开。
		// 排序 + 挑选只算一次，三个展示用的属性都从这里取
		tlPick() {
			return pickTimeline(this.timeline, this.detail && this.detail.net, Date.now(), 4)
		},
		tlDisplay() {
			if (!this.timeline.length) return []
			const src = this.tlOpen ? sortedTimeline(this.timeline) : this.tlPick.list

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
			return this.tlPick.total
		},
		tlMore() {
			return this.tlPick.more
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
	},

	methods: {
		/**
		 * 机构国的中文简称。
		 *
		 * 模板只能看到实例成员，模块作用域里 import 进来的函数它是看不见的
		 * （之前 astroName 就是这么崩过一次），所以这里要给一层壳。
		 */
		agencyLabel(name) {
			return agencyLabelOf(name)
		},

		// 点开图片能双指放大，长图信息不点开根本看不清
		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		},

		// 报道交给壳组件跳转：这里只管把选中项抛上去，不碰路由
		tapNews(n) {
			this.$emit('news-tap', n)
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
	}
}
</script>

<style lang="scss" scoped>
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

.ragency-flag {
	flex-shrink: 0;
	width: 36rpx;
	height: 25rpx;
	margin-right: 10rpx;
	border-radius: 3rpx;
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
	flex-wrap: wrap;
	justify-content: flex-end;
	row-gap: 12rpx;
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

/* 提醒按钮：品牌蓝胶囊，与收藏的琥珀色区分 */
.remind {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: 20rpx;
	/* 20rpx 与分享/收藏对齐（原来是 22rpx，三个胶囊并排时右边会多出一点） */
	padding: 8rpx 20rpx;
	border-radius: 40rpx;
	background: rgba(56, 189, 248, 0.1);
	border: 1rpx solid rgba(56, 189, 248, 0.28);
}

/* 提醒图标：纯 CSS 画的钟形，线宽 2rpx，与 ★ / ⤴ 是同一套线条语言。
   不用 ⏰ 🔔 —— 这两个码位在 iOS/Android 上都按彩色 emoji 渲染，
   旁边是单色符号，三个胶囊摆一起会明显粗细不齐、还凭空多一块底色 */
.remind-bell {
	position: relative;
	flex-shrink: 0;
	/* 20×19rpx：26rpx 的字符（★ ⤴）字形高约 19rpx，
	   矮一点点是为了让底横线和文字基线看起来齐 */
	width: 20rpx;
	height: 19rpx;
	margin-right: 8rpx;
	box-sizing: border-box;
	border: 2rpx solid #38bdf8;
	border-bottom: none;
	border-radius: 10rpx 10rpx 0 0;
}

/* 铃口横线：比铃身左右各宽一点，才像倒扣的钟，不是半个圆环 */
.remind-bell::after {
	content: '';
	position: absolute;
	left: -3rpx;
	right: -3rpx;
	bottom: -2rpx;
	height: 2rpx;
	background: #38bdf8;
	border-radius: 2rpx;
}

/* 已提醒：铃身填满，不用读文字也能看出状态 */
.remind.on .remind-bell {
	background: rgba(56, 189, 248, 0.55);
}

.remind.on {
	background: rgba(56, 189, 248, 0.18);
	border-color: rgba(56, 189, 248, 0.5);
}

.remind-text {
	color: #38bdf8;
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



.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 20rpx;
}

/* 相关报道：一条一行，标题最多两行，meta 一行。
   描述是长文、报道是链接，视觉上要明显更轻，不能抢任务描述的注意力 */
.news-count {
	margin-left: 12rpx;
	color: #6b7891;
	font-size: 22rpx;
	font-weight: 400;
}

.news-row {
	display: flex;
	align-items: center;
	padding-bottom: 20rpx;
}

/* 行间用相邻兄弟选择器画分割线（wxss 对 :first-of-type 支持不稳，
   这种写法天然只作用于第二行起，首行不会多一条线） */
.news-row + .news-row {
	margin-top: 20rpx;
	padding-top: 20rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}

.news-hover {
	opacity: 0.6;
}

.news-body {
	flex: 1;
	/* 窄屏下没有 min-width: 0，长标题会把右侧箭头挤出屏幕 */
	min-width: 0;
}

.news-title {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	color: #dfe7f0;
	font-size: 28rpx;
	line-height: 1.5;
}

.news-meta {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.news-go {
	flex-shrink: 0;
	margin-left: 16rpx;
	color: #4a5568;
	font-size: 34rpx;
	line-height: 1;
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

</style>
