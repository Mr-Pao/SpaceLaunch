<template>
	<view class="container">
		<!-- 太空背景 -->
		<view class="space-bg">
			<view
				class="stars"
				v-for="(s, i) in stars"
				:key="i"
				:style="{ left: s.left, top: s.top, animationDelay: s.delay }"
			></view>
			<view class="planets"></view>
		</view>

		<!-- 标题区域 -->
		<view class="header">
			<view class="logo-badge">
				<image class="rocket logo-rocket" src="/static/rocket.png" mode="aspectFit"></image>
			</view>
			<text class="title">太空发射任务</text>
			<text class="subtitle">探索宇宙的壮丽旅程</text>
		</view>

		<!-- 加载状态：只有完全没有缓存时才出现 -->
		<view class="loading" v-if="loading && launches.length === 0">
			<view class="rocket-loading">
				<image
					class="rocket"
					src="/static/rocket.png"
					mode="aspectFit"
					:style="{ transform: 'translateY(' + rocketY + 'px)' }"
				></image>
				<view class="flame"></view>
			</view>
			<text class="loading-text">准备发射...</text>
		</view>

		<!-- 错误状态 -->
		<view class="error" v-else-if="error && launches.length === 0">
			<view class="error-content">
				<text class="error-icon">⚠️</text>
				<text class="error-text">{{ error }}</text>
				<button class="retry-btn" @click="fetchLaunches">重新尝试</button>
			</view>
		</view>

		<!-- 数据显示 -->
		<view class="content" v-else>
			<view class="launches-container" v-if="launches.length > 0">
				<!-- 总量是 API 的全部未来发射数，我们只提供前 50 条，所以必须写明"显示范围" -->
				<text class="total">共 {{ total }} 次发射 · {{ freshText }}</text>

				<view
					class="launch-card"
					v-for="launch in launches"
					:key="launch.id"
					@click="goDetail(launch.id)"
				>
					<view class="card-header">
						<text class="mission-name">{{ launch.name }}</text>
						<view class="status-badge" :class="getStatusClass(launch.status && launch.status.name)">
							{{ (launch.status && (launch.status.nameZh || launch.status.abbrev)) || '未知' }}
						</view>
					</view>

					<view class="card-body">
						<view class="launch-details">
							<view class="detail-item">
								<text class="detail-label">发射时间</text>
								<text class="detail-value">{{ formatDate(launch.net) }}</text>
							</view>
							<view class="detail-item" v-if="launch.rocket && launch.rocket.configuration && launch.rocket.configuration.name">
								<text class="detail-label">火箭型号</text>
								<text class="detail-value">{{ launch.rocket.configuration.name }}</text>
							</view>
							<view class="detail-item" v-if="launch.pad && launch.pad.name">
								<text class="detail-label">发射地点</text>
								<text class="detail-value">{{ launch.pad.name }}</text>
							</view>
						</view>

						<view class="card-description" v-if="launch.mission && (launch.mission.descriptionZh || launch.mission.description)">
							<text>{{ truncateText(launch.mission.descriptionZh || launch.mission.description, 120) }}</text>
						</view>
					</view>

					<view class="card-footer">
						<text class="provider">{{ (launch.launch_service_provider && launch.launch_service_provider.name) || '未知机构' }}</text>
						<text class="date">更新 {{ formatDate(launch.last_updated) }}</text>
					</view>
				</view>

				<!-- 说明：静态快照只取前 50 条，不是全部 -->
				<view class="no-more">
					<text class="no-more-text">已显示最近 {{ launches.length }} 次发射</text>
				</view>
			</view>

			<!-- 无数据状态 -->
			<view class="no-data" v-else>
				<view class="no-data-content">
					<text class="no-data-icon">🚀</text>
					<text class="no-data-text">暂无发射数据</text>
					<button class="refresh-btn" @click="fetchLaunches">重新获取</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

export default {
	data() {
		return {
			launches: [],
			total: 0,
			generatedAt: '',
			freshText: '',
			loading: true,
			error: '',
			rocketY: 0,
			animationInterval: null,
			// 星星位置必须提前算好。写在模板里 Math.random() 会在每次重新渲染时变化，
			// 表现为背景星星乱跳
			stars: []
		}
	},
	onLoad() {
		this.stars = Array.from({ length: 50 }, () => ({
			left: Math.random() * 100 + '%',
			top: Math.random() * 100 + '%',
			delay: (Math.random() * 2).toFixed(2) + 's'
		}))
		this.startRocketAnimation()
		this.fetchLaunches()
	},
	onUnload() {
		this.stopRocketAnimation()
	},
	onPullDownRefresh() {
		this.fetchLaunches(true).then(() => {
			uni.stopPullDownRefresh()
		})
	},
	methods: {
		async fetchLaunches(force) {
			this.loading = true
			this.error = ''

			try {
				// 有缓存时 load 会立刻返回缓存，同时后台静默刷新并通过 onUpdate 回填
				const d = await spaceData.load('upcoming', {
					force: !!force,
					onUpdate: (fresh) => this.applyData(fresh)
				})
				this.applyData(d)
			} catch (e) {
				console.warn('获取即将发射失败', e)
				this.error = '获取数据失败，请检查网络后重试'
			} finally {
				this.loading = false
				this.stopRocketAnimation()
			}
		},

		applyData(d) {
			this.launches = d.list || []
			this.total = d.count || this.launches.length
			this.generatedAt = d.generatedAt
			this.freshText = spaceData.freshnessText(d.generatedAt)
		},

		goDetail(id) {
			if (!id) return
			uni.navigateTo({
				// 传 id 而不是下标：列表刷新后下标会错位，id 不会
				url: '/pages/upcoming/upcomingInfo?id=' + id
			})
		},

		startRocketAnimation() {
			if (this.animationInterval) return
			let direction = 1
			this.animationInterval = setInterval(() => {
				this.rocketY += direction * 2
				if (this.rocketY > 10 || this.rocketY < -10) {
					direction *= -1
				}
			}, 50)
		},

		stopRocketAnimation() {
			if (this.animationInterval) {
				clearInterval(this.animationInterval)
				this.animationInterval = null
			}
		},

		getStatusClass(status) {
			if (!status) return 'normal'
			const s = String(status)
			if (s.indexOf('Success') > -1) return 'success'
			if (s.indexOf('Failure') > -1) return 'failure'
			if (s.indexOf('Go') > -1 || s.indexOf('TBD') > -1 || s.indexOf('TBC') > -1) return 'pending'
			return 'normal'
		},

		formatDate(dateString) {
			if (!dateString) return ''
			try {
				const date = new Date(dateString)
				if (isNaN(date.getTime())) return ''

				const pad = (n) => (n < 10 ? '0' + n : '' + n)
				return (
					date.getFullYear() +
					'-' + pad(date.getMonth() + 1) +
					'-' + pad(date.getDate()) +
					' ' + pad(date.getHours()) +
					':' + pad(date.getMinutes())
				)
			} catch (e) {
				return ''
			}
		},

		truncateText(text, maxLength) {
			if (!text) return ''
			const s = String(text)
			return s.length > maxLength ? s.substring(0, maxLength) + '...' : s
		}
	}
}
</script>

<style>
/* 全局样式 */
.container {
	position: relative;
	min-height: 100vh;
	width: 100%;
	overflow: hidden;
	padding-bottom: 40rpx;
	box-sizing: border-box;
}

/* 太空背景 */
.space-bg {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: #0a0e17;
	z-index: -1;
}

.stars {
	position: absolute;
	width: 2rpx;
	height: 2rpx;
	background: #ffffff;
	border-radius: 50%;
	animation: twinkle 2s infinite ease-in-out;
}

@keyframes twinkle {
	0%, 100% { opacity: 0.2; }
	50% { opacity: 1; }
}

.planets {
	position: absolute;
	width: 100rpx;
	height: 100rpx;
	background: radial-gradient(circle, #f5c33b 0%, #ff9500 70%);
	border-radius: 50%;
	right: 10%;
	top: 20%;
	box-shadow: 0 0 50rpx rgba(245, 195, 59, 0.5);
}

/* 标题区域 */
.header {
	text-align: center;
	padding: 60rpx 20rpx 40rpx;
}

/* 品牌徽章（替代原 uview 默认 logo） */
.logo-badge {
	width: 180rpx;
	height: 180rpx;
	margin: 0 auto 30rpx;
	border-radius: 50%;
	background: radial-gradient(circle at 50% 32%, #1e3a5f 0%, #0b1220 72%);
	border: 2rpx solid rgba(96, 165, 250, 0.35);
	box-shadow: 0 0 40rpx rgba(56, 189, 248, 0.28), inset 0 0 30rpx rgba(56, 189, 248, 0.12);
	display: flex;
	align-items: center;
	justify-content: center;
}

.logo-rocket {
	transform: scale(0.86);
}

/* 火箭图标（static/rocket.png，透明底） */
.rocket {
	width: 60rpx;
	height: 120rpx;
	transition: transform 0.1s ease;
	z-index: 2;
}

.title {
	font-size: 48rpx;
	font-weight: bold;
	color: #ffffff;
	text-shadow: 0 0 20rpx rgba(255, 255, 255, 0.5);
	display: block;
	margin-bottom: 10rpx;
}

.subtitle {
	font-size: 28rpx;
	color: #a0a0a0;
	display: block;
}

/* 加载状态 */
.loading {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 100rpx 20rpx;
}

.rocket-loading {
	position: relative;
	width: 100rpx;
	height: 200rpx;
	margin-bottom: 40rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.flame {
	position: absolute;
	bottom: 16rpx;
	width: 26rpx;
	height: 62rpx;
	background: linear-gradient(to top, #ff6b6b, #ffd700);
	border-radius: 50% 50% 20% 20%;
	transform-origin: top center;
	animation: flame 0.45s infinite alternate;
	opacity: 0.85;
}

@keyframes flame {
	from { transform: scaleY(0.75); opacity: 0.6; }
	to { transform: scaleY(1.2); opacity: 1; }
}

.loading-text {
	color: #ffffff;
	font-size: 32rpx;
	text-shadow: 0 0 10rpx rgba(255, 255, 255, 0.5);
}

/* 错误状态 */
.error {
	padding: 100rpx 20rpx;
	display: flex;
	justify-content: center;
	align-items: center;
}

.error-content {
	background: rgba(255, 59, 48, 0.1);
	border: 2rpx solid rgba(255, 59, 48, 0.3);
	border-radius: 20rpx;
	padding: 50rpx;
	text-align: center;
	width: 80%;
}

.error-icon {
	font-size: 80rpx;
	display: block;
	margin-bottom: 30rpx;
}

.error-text {
	color: #ffffff;
	font-size: 32rpx;
	margin-bottom: 30rpx;
	display: block;
}

.retry-btn {
	background: #ff3b30;
	color: #ffffff;
	border: none;
	padding: 20rpx 60rpx;
	border-radius: 10rpx;
	font-size: 28rpx;
}

/* 主内容区域 */
.content {
	padding: 0 30rpx 60rpx;
}

.total {
	color: #a0a0a0;
	font-size: 26rpx;
	text-align: center;
	margin-bottom: 30rpx;
	display: block;
}

/* 发射卡片 */
.launch-card {
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
	border: 1rpx solid rgba(255, 255, 255, 0.1);
	border-radius: 20rpx;
	margin-bottom: 30rpx;
	padding: 30rpx;
	box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.3);
	transition: transform 0.2s ease;
}

.launch-card:active {
	transform: scale(0.98);
}

.card-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 20rpx;
}

.mission-name {
	font-size: 34rpx;
	font-weight: bold;
	color: #ffffff;
	flex: 1;
	margin-right: 20rpx;
	line-height: 1.4;
}

.status-badge {
	padding: 8rpx 20rpx;
	border-radius: 20rpx;
	font-size: 24rpx;
	font-weight: bold;
	flex-shrink: 0;
}

.status-badge.success {
	background: rgba(52, 199, 89, 0.2);
	color: #34c759;
	border: 1rpx solid rgba(52, 199, 89, 0.3);
}

.status-badge.failure {
	background: rgba(255, 59, 48, 0.2);
	color: #ff3b30;
	border: 1rpx solid rgba(255, 59, 48, 0.3);
}

.status-badge.pending {
	background: rgba(255, 149, 0, 0.2);
	color: #ff9500;
	border: 1rpx solid rgba(255, 149, 0, 0.3);
}

.status-badge.normal {
	background: rgba(142, 142, 147, 0.2);
	color: #8e8e93;
	border: 1rpx solid rgba(142, 142, 147, 0.3);
}

.card-body {
	margin-bottom: 20rpx;
}

.launch-details {
	margin-bottom: 20rpx;
}

.detail-item {
	display: flex;
	margin-bottom: 15rpx;
	align-items: flex-start;
}

.detail-label {
	font-size: 26rpx;
	color: #a0a0a0;
	width: 180rpx;
	flex-shrink: 0;
}

.detail-value {
	font-size: 26rpx;
	color: #ffffff;
	flex: 1;
}

.card-description {
	background: rgba(255, 255, 255, 0.05);
	padding: 20rpx;
	border-radius: 10rpx;
	border-left: 4rpx solid #007aff;
}

.card-description text {
	font-size: 26rpx;
	color: #e0e0e0;
	line-height: 1.6;
}

.card-footer {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-top: 1rpx solid rgba(255, 255, 255, 0.1);
	padding-top: 20rpx;
}

.provider {
	font-size: 24rpx;
	color: #007aff;
	font-weight: 500;
}

.date {
	font-size: 22rpx;
	color: #8e8e93;
}

/* 无数据状态 */
.no-data {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 150rpx 20rpx;
}

.no-data-content {
	text-align: center;
}

.no-data-icon {
	font-size: 120rpx;
	display: block;
	margin-bottom: 40rpx;
}

.no-data-text {
	color: #a0a0a0;
	font-size: 32rpx;
	margin-bottom: 30rpx;
	display: block;
}

.refresh-btn {
	background: linear-gradient(90deg, #007aff, #5856d6);
	color: #ffffff;
	border: none;
	padding: 20rpx 60rpx;
	border-radius: 10rpx;
	font-size: 28rpx;
}

.no-more {
	text-align: center;
	padding: 20rpx 0 40rpx;
}

.no-more-text {
	color: #8e8e93;
	font-size: 24rpx;
}
</style>
