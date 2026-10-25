<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? '空间站' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>
		<view class="empty" v-else-if="!list.length">
			<text class="empty-text">暂无空间站数据</text>
		</view>

		<view class="list" v-else>
			<view class="card" v-for="s in list" :key="s.id" @click="go(s)">
				<image v-if="s.img" class="thumb" :src="s.img" mode="aspectFill" />
				<view v-else class="thumb thumb-ph"><text>🛰️</text></view>
				<view class="info">
					<view class="row1">
						<text class="name">{{ s.name }}</text>
						<text class="badge" :class="s.status === 'Active' ? 'on' : 'dim'">{{ statusZh(s.status) }}</text>
					</view>
					<text class="meta">{{ s.orbit || '未知轨道' }}<text v-if="s.onboardCrew"> · 在轨 {{ s.onboardCrew }} 人</text></text>
				</view>
				<text class="arrow">›</text>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			list: []
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 120
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad() {
		try {
			const d = await spaceData.load('spacestations')
			const list = (d && d.list) || []
			// 在役站排前面，一眼看到当前能上去的
			list.sort((a, b) => (b.status === 'Active') - (a.status === 'Active'))
			this.list = list
		} catch (e) {
			console.warn('[stations] 加载失败', e)
		}
		this.loading = false
	},

	methods: {
		statusZh(s) {
			if (s === 'Active') return '在役'
			if (s === 'Retired') return '退役'
			if (s === 'Under Construction') return '建造中'
			return s || ''
		},
		go(s) {
			uni.navigateTo({ url: '/pages/station/station?id=' + s.id })
		}
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding: 0 32rpx 80rpx;
	box-sizing: border-box;
}

.loading,
.empty {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 200rpx 40rpx;
}

.hint-text,
.empty-text {
	color: #6b7891;
	font-size: 26rpx;
}

.list {
	margin-top: 20rpx;
}

.card {
	display: flex;
	align-items: center;
	padding: 20rpx;
	margin-bottom: 18rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.thumb {
	width: 120rpx;
	height: 120rpx;
	flex-shrink: 0;
	border-radius: 16rpx;
	background: #0a0e17;
}

.thumb-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 56rpx;
}

.info {
	flex: 1;
	min-width: 0;
	margin: 0 18rpx;
}

.row1 {
	display: flex;
	align-items: center;
}

.name {
	color: #e2e8f0;
	font-size: 30rpx;
	font-weight: 600;
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.badge {
	flex-shrink: 0;
	margin-left: 12rpx;
	padding: 3rpx 12rpx;
	border-radius: 6rpx;
	font-size: 19rpx;
}

.badge.on {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

.badge.dim {
	background: rgba(255, 255, 255, 0.05);
	color: #55617a;
}

.meta {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.arrow {
	color: #3d4a5c;
	font-size: 34rpx;
	flex-shrink: 0;
}
</style>
