<template>
	<view class="page">
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
			<view class="hero">
				<image
					v-if="detail.image"
					class="hero-img"
					:src="detail.image"
					mode="aspectFill"
					@click="preview(detail.image)"
				></image>
				<view v-else class="hero-img hero-placeholder"></view>
				<view class="hero-mask"></view>
			</view>

			<view class="body">
				<view class="head">
					<text class="name">{{ detail.name }}</text>
					<view class="badge" :class="statusClass">
						{{ (detail.status && (detail.status.nameZh || detail.status.name)) || '未知' }}
					</view>
				</view>

				<view class="time">
					{{ netText }}
				</view>

				<!-- 任务信息 -->
				<view class="card" v-if="hasMission">
					<view class="card-title">任务信息</view>
					<view class="row" v-if="missionName">
						<text class="label">任务名</text>
						<text class="value">{{ missionName }}</text>
					</view>
					<view class="row" v-if="detail.mission.type">
						<text class="label">类型</text>
						<text class="value">{{ detail.mission.type }}</text>
					</view>
					<view class="row" v-if="orbitText">
						<text class="label">目标轨道</text>
						<text class="value">{{ orbitText }}</text>
					</view>
					<text class="card-desc" v-if="missionDesc">{{ missionDesc }}</text>
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

				<!-- 火箭 -->
				<view class="card" v-if="rocketName">
					<view class="card-title">运载火箭</view>
					<view class="row">
						<text class="label">型号</text>
						<text class="value">{{ rocketName }}</text>
					</view>
					<view class="row" v-if="detail.rocket.configuration.name">
						<text class="label">配置</text>
						<text class="value">{{ detail.rocket.configuration.name }}</text>
					</view>
				</view>

				<!-- 发射条件：概率和天气顾虑都是 LL2 的可选字段，没有就整块不显示 -->
				<view class="card" v-if="probabilityText || weatherText">
					<view class="card-title">发射条件</view>
					<view class="row" v-if="probabilityText">
						<text class="label">预报概率</text>
						<text class="value">{{ probabilityText }}</text>
					</view>
					<text class="card-desc" v-if="weatherText">{{ weatherText }}</text>
				</view>

				<!-- 失败原因：只有失败任务带这个字段 -->
				<view class="card" v-if="failText">
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

				<view class="footer-hint">
					<text>数据来源 The Space Devs · 中文翻译由同步任务生成</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { formatDateTime, relativeTime } from '@/utils/format.js'

export default {
	data() {
		return {
			launchId: '',
			detail: null,
			agency: null,
			loading: true
		}
	},
	computed: {
		netText() {
			if (!this.detail) return ''
			const abs = formatDateTime(this.detail.net)
			if (!abs) return '时间待定'
			return abs + '（' + relativeTime(this.detail.net) + '）'
		},
		missionName() {
			return (this.detail && this.detail.mission && this.detail.mission.name) || ''
		},
		missionDesc() {
			const m = this.detail && this.detail.mission
			if (!m) return ''
			return m.descriptionZh || m.description || ''
		},
		hasMission() {
			const m = this.detail && this.detail.mission
			return Boolean(m && (m.name || m.descriptionZh || m.description || m.type || (m.orbit && m.orbit.name)))
		},
		// 轨道：优先缩写（LEO / GTO 这种业内通用写法），没有就用全称
		orbitText() {
			const o = this.detail && this.detail.mission && this.detail.mission.orbit
			if (!o) return ''
			return o.abbrev || o.name || ''
		},
		rocketName() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			return c ? c.full_name || c.name || '' : ''
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
			return (this.detail && this.detail.name) || '太空发射任务'
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

	async onLoad(query) {
		const id = query && query.id
		this.launchId = id || ''
		if (!id) {
			this.loading = false
			return
		}

		// 同一条发射在跨过"当前时刻"后会从 upcoming 挪到 previous，
		// 用户刚看过列表就点进来时可能已经换边了，所以两边都查。
		// findLaunchById 内部先扫缓存，命中则零网络开销。
		const d = await spaceData.findLaunchById(id)

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

/* 首图 */
.hero {
	position: relative;
	width: 100%;
	height: 420rpx;
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

.time {
	display: block;
	margin-top: 16rpx;
	color: #38bdf8;
	font-size: 28rpx;
	letter-spacing: 0.5rpx;
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
