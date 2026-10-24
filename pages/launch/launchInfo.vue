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
			</view>

			<view class="body">
				<view class="head">
					<text class="name">{{ displayName }}</text>
					<view class="badge" :class="statusClass">
						{{ (detail.status && (detail.status.nameZh || detail.status.name)) || '未知' }}
					</view>
				</view>

				<!-- 倒计时：发射前最有用的一行 -->
				<view class="cd-row">
					<countdown :net="detail.net" size="lg" />
				</view>

				<view class="meta-line">
					<text class="time">{{ netText }}</text>
					<view class="fav" :class="{ on: isFav }" @click="toggleFav">
						<text class="fav-icon">{{ isFav ? '★' : '☆' }}</text>
						<text class="fav-text">{{ isFav ? '已收藏' : '收藏' }}</text>
					</view>
				</view>

				<!-- 任务信息 -->
				<view class="card" v-if="hasMission">
					<view class="card-title">任务信息</view>
					<view class="row" v-if="missionName">
						<text class="label">任务名</text>
						<text class="value">{{ missionName }}</text>
					</view>
					<view class="row" v-if="missionType">
						<text class="label">类型</text>
						<text class="value">{{ missionType }}</text>
					</view>
					<view class="row" v-if="orbitText">
						<text class="label">目标轨道</text>
						<text class="value">{{ orbitText }}</text>
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

				<!-- 火箭：可点进型号页看该型号的全部发射记录 -->
				<view class="card card-link" v-if="rocketName" @click="goRocket">
					<view class="card-title">
						运载火箭
						<text class="arrow">›</text>
					</view>
					<view class="row">
						<text class="label">型号</text>
						<text class="value">{{ rocketName }}</text>
					</view>
					<view class="row" v-if="showConfig">
						<text class="label">配置</text>
						<text class="value">{{ detail.rocket.configuration.name }}</text>
					</view>
					<view class="row" v-if="rocketFamily">
						<text class="label">系列</text>
						<text class="value">{{ rocketFamily }}</text>
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

				<!-- 发射台 -->
				<view class="card" v-if="detail.pad && detail.pad.name">
					<view class="card-title">发射台</view>
					<view class="row">
						<text class="label">名称</text>
						<text class="value">{{ detail.pad.name }}</text>
					</view>
					<view class="row" v-if="padLocation">
						<text class="label">位置</text>
						<text class="value">{{ padLocation }}</text>
					</view>
					<view class="row" v-if="padCoord">
						<text class="label">经纬度</text>
						<text class="value">{{ padCoord }}</text>
					</view>
					<view class="row" v-if="detail.pad_launch_attempt_count">
						<text class="label">该台累计</text>
						<text class="value">{{ detail.pad_launch_attempt_count }} 次发射</text>
					</view>
				</view>

				<!-- 发射窗口：只给 net 一个点会让用户以为窗口就是那一秒 -->
				<view class="card" v-if="windowEnd">
					<view class="card-title">发射窗口</view>
					<view class="row">
						<text class="label">开始</text>
						<text class="value">{{ windowStart }}</text>
					</view>
					<view class="row">
						<text class="label">结束</text>
						<text class="value">{{ windowEnd }}</text>
					</view>
					<view class="row" v-if="windowSpan">
						<text class="label">窗口长度</text>
						<text class="value">{{ windowSpan }}</text>
					</view>
				</view>

				<!-- 发射机构：可点进机构详情 -->
				<view class="card card-link" v-if="agency" @click="goAgency(agency.id)">
					<view class="card-title">
						发射机构
						<text class="arrow">›</text>
					</view>
					<view class="agency">
						<image v-if="agency.logo_url" class="agency-logo" :src="agency.logo_url" mode="aspectFit"></image>
						<text class="agency-name">{{ agency.name }}</text>
					</view>
					<view class="row" v-if="agency.country_code">
						<text class="label">国家/地区</text>
						<text class="value">{{ agency.country_code }}</text>
					</view>
					<view class="row" v-if="agency.founding_year">
						<text class="label">成立年份</text>
						<text class="value">{{ agency.founding_year }} 年</text>
					</view>
				</view>

				<!-- 发射统计：LL2 直接给了累计数，不用自己算 -->
				<view class="card" v-if="countCells.length">
					<view class="card-title">发射统计</view>
					<view class="stat-grid">
						<view class="stat-cell" v-for="c in countCells" :key="c.label">
							<text class="stat-num">{{ c.value }}</text>
							<text class="stat-label">{{ c.label }}</text>
						</view>
					</view>
				</view>

				<view class="footer-hint">
					<text>数据来源 The Space Devs · 中文翻译由同步任务生成</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { findById as findByIdInArchive } from '@/utils/history.js'
import { formatDateTime, relativeTime, launchTitle, rocketName as rocketNameOf, zhValue } from '@/utils/format.js'
import * as fav from '@/utils/favorites.js'
import { getConfig } from '@/utils/config.js'

export default {
	data() {
		return {
			launchId: '',
			detail: null,
			agency: null,
			loading: true,
			isFav: false,
			navSolid: false,
			// 任务描述折叠态：默认收起，点击「展开全文」才铺开
			descExpanded: false,
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
			return m ? zhValue(m.type) : ''
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
			return zhValue(o.abbrev) || zhValue(o.name) || ''
		},
		rocketName() {
			return rocketNameOf(this.detail && this.detail.rocket && this.detail.rocket.configuration)
		},
		// full_name 和 name 往往一模一样（"Long March 4B"），这时不重复摆一行
		showConfig() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.name) return false
			return c.name !== (c.full_name || c.name)
		},
		// 火箭所属系列 + 型号代号，比如「长征四号 · B」
		// families 从大到小返回（Long March、Long March 4），只取最后一个更具体
		rocketFamily() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c) return ''

			const fams = c.families || []
			const last = fams.length ? fams[fams.length - 1] : ''
			const variant = c.variant || ''

			if (last && variant) return last + ' · ' + variant
			return last || variant
		},
		windowStart() {
			const d = this.detail
			return d && d.window_start ? formatDateTime(d.window_start) : ''
		},
		windowEnd() {
			const d = this.detail
			return d && d.window_end ? formatDateTime(d.window_end) : ''
		},
		windowSpan() {
			const d = this.detail
			if (!d || !d.window_start || !d.window_end) return ''

			const ms = new Date(d.window_end).getTime() - new Date(d.window_start).getTime()
			if (!(ms > 0)) return ''

			const min = Math.round(ms / 60000)
			if (min < 60) return min + ' 分钟'

			const h = Math.floor(min / 60)
			const m = min % 60
			return m ? h + ' 小时 ' + m + ' 分钟' : h + ' 小时'
		},
		// LL2 直接给了累计次数，四格统计不用自己算
		countCells() {
			const d = this.detail
			if (!d) return []

			const cells = []
			const push = (value, label) => {
				if (typeof value === 'number' && value > 0) cells.push({ value, label })
			}
			push(d.orbital_launch_attempt_count, '全球累计')
			push(d.orbital_launch_attempt_count_year, '本年全球')
			push(d.agency_launch_attempt_count_year, '本年本机构')
			push(d.pad_launch_attempt_count_year, '本年本工位')
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

	// 详情页自己定义分享，路径里显式带上 id，不依赖全局 mixin 去猜参数
	onShareAppMessage() {
		return {
			title: this.shareText,
			path: '/pages/launch/launchInfo?id=' + this.launchId,
			imageUrl: this.shareImg
		}
	},
	onShareTimeline() {
		return {
			title: this.shareText,
			query: 'id=' + this.launchId,
			imageUrl: this.shareImg
		}
	},

	// 滚过首图后导航栏切成实色，否则图片上的文字看不清
	onPageScroll(e) {
		const solid = e.scrollTop > 200
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		const id = query && query.id
		this.launchId = id || ''
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
		if (!d) {
			d = await findByIdInArchive(id)
		}

		this.detail = d
		this.loading = false

		const providerId = d && d.launch_service_provider && d.launch_service_provider.id
		if (providerId) {
			this.agency = await spaceData.getAgencyById(providerId)
		}
	},
	methods: {
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

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
