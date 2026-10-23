<template>
	<view class="page">
		<!-- 太空背景：星星位置在 onLoad 里一次算好，写在模板里 Math.random() 会每次重渲染都变 -->
		<view class="space-bg">
			<view
				class="stars"
				v-for="(s, i) in stars"
				:key="i"
				:style="{ left: s.left, top: s.top, animationDelay: s.delay }"
			></view>
			<view class="planets"></view>
		</view>

		<view class="header">
			<image class="logo" src="/static/logo.png" mode="aspectFill"></image>
			<text class="title">太空发射任务</text>
			<text class="subtitle">探索宇宙的壮丽旅程</text>
		</view>

		<!-- 只有完全没有缓存时才整屏转圈，有缓存时下面直接出内容 -->
		<view class="loading" v-if="loading && list.length === 0">
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

		<view class="error" v-else-if="error && list.length === 0">
			<text class="error-icon">⚠️</text>
			<text class="error-text">{{ error }}</text>
			<view class="btn" @click="getData(true)">重新尝试</view>
		</view>

		<view class="content" v-else>
			<view class="stat" v-if="list.length">
				<text class="stat-main">共 {{ total }} 次发射</text>
				<text class="stat-sub">{{ freshText }}</text>
			</view>

			<view class="list">
				<launch-card
					v-for="item in visible"
					:key="item.id"
					:item="item"
					@tap="goDetail"
				/>
			</view>

			<view class="empty" v-if="list.length === 0">
				<text class="empty-icon">🚀</text>
				<text class="empty-text">暂无发射数据</text>
				<view class="btn" @click="getData(true)">重新获取</view>
			</view>

			<view class="foot-hint" v-if="visible.length > 0">
				<text>{{ hasMore ? '上拉加载更多' : '已显示 ' + visible.length + ' 条' }}</text>
			</view>
		</view>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'

export default {
	mixins: [createListMixin({ dataset: 'upcoming', pageSize: 12 })],

	data() {
		return {
			rocketY: 0,
			animationInterval: null,
			stars: []
		}
	},

	onLoad() {
		// 星星位置一次算好：写在模板里 Math.random() 会每次重渲染都变
		this.stars = Array.from({ length: 36 }, () => ({
			left: Math.random() * 100 + '%',
			top: Math.random() * 100 + '%',
			delay: (Math.random() * 2).toFixed(2) + 's'
		}))
		this.startRocketAnimation()
		this.getData()
	},

	onUnload() {
		this.stopRocketAnimation()
	},

	onPullDownRefresh() {
		this.resetPaging()
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		this.loadMore()
	},

	methods: {
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		},

		startRocketAnimation() {
			if (this.animationInterval) return
			let direction = 1
			this.animationInterval = setInterval(() => {
				this.rocketY += direction * 2
				if (this.rocketY > 10 || this.rocketY < -10) direction *= -1
			}, 50)
		},

		stopRocketAnimation() {
			if (this.animationInterval) {
				clearInterval(this.animationInterval)
				this.animationInterval = null
			}
		}
	},

	// 数据拉完就不再需要那个定时器了
	watch: {
		loading(v) {
			if (!v) this.stopRocketAnimation()
		}
	}
}
</script>

<style lang="scss" scoped>
/* 注意这里必须有 scoped：原文件是全局 <style>，
   .container / .title / .stars 这些通用类名一直在污染其它页面 */
@import '../../styles/list.scss';

.page {
	position: relative;
	min-height: 100vh;
	padding-bottom: 40rpx;
	background: #0a0e17;
	overflow: hidden;
}

.space-bg {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 0;
	pointer-events: none;
}

.stars {
	position: absolute;
	width: 2rpx;
	height: 2rpx;
	background: #ffffff;
	border-radius: 50%;
	animation: twinkle 2.4s infinite ease-in-out;
}

@keyframes twinkle {
	0%, 100% { opacity: 0.15; }
	50% { opacity: 0.9; }
}

.planets {
	position: absolute;
	width: 90rpx;
	height: 90rpx;
	right: 8%;
	top: 18%;
	border-radius: 50%;
	background: radial-gradient(circle at 35% 30%, #ffd479 0%, #f5a623 60%, #c97b1a 100%);
	box-shadow: 0 0 60rpx rgba(245, 195, 59, 0.35);
}

.header {
	position: relative;
	z-index: 1;
	text-align: center;
	padding: 50rpx 40rpx 30rpx;
}

.logo {
	display: block;
	width: 150rpx;
	height: 150rpx;
	margin: 0 auto 24rpx;
	border-radius: 50%;
	box-shadow: 0 0 40rpx rgba(56, 189, 248, 0.3);
}

.title {
	display: block;
	color: #ffffff;
	font-size: 44rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
	text-shadow: 0 0 24rpx rgba(56, 189, 248, 0.35);
}

.subtitle {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 24rpx;
	letter-spacing: 4rpx;
}

/* 加载 */
.loading {
	position: relative;
	z-index: 1;
	padding: 120rpx 40rpx;
}

.rocket-loading {
	position: relative;
	width: 100rpx;
	height: 200rpx;
	margin-bottom: 30rpx;
	display: flex;
	justify-content: center;
}

.rocket {
	width: 60rpx;
	height: 120rpx;
	transition: transform 0.1s ease;
	z-index: 2;
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
	color: #6b7891;
	font-size: 28rpx;
	letter-spacing: 2rpx;
}

/* 错误 / 空态：骨架在 styles/list.scss，这里只补定位 ——
   背景星空是 position: fixed，不把 z-index 抬起来会被盖住 */
.error,
.empty {
	position: relative;
	z-index: 1;
	padding: 140rpx 60rpx;
}

/* 列表 */
.content {
	position: relative;
	z-index: 1;
	padding: 0 24rpx;
}
</style>
