<template>
	<view class="page">
		<view class="header">
			<text class="title">运载火箭</text>
			<text class="subtitle">{{ all.length }} 个型号 · 现役优先</text>
		</view>

		<!-- 532 个型号，没有搜索没法用 -->
		<view class="search">
			<text class="search-icon">🔍</text>
			<input
				class="search-input"
				v-model="keyword"
				type="text"
				placeholder="搜索型号、制造商，如 Falcon、长征"
				placeholder-class="search-ph"
				confirm-type="search"
			/>
			<text class="search-clear" v-if="keyword" @click="keyword = ''">✕</text>
		</view>

		<view class="loading" v-if="loading && !all.length">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!all.length">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">型号库还没同步好，稍后再来看看</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<view class="empty" v-else-if="!filtered.length">
			<text class="empty-icon">🔍</text>
			<text class="hint-text">没有匹配「{{ keyword }}」的型号</text>
		</view>

		<view class="list" v-else>
			<view
				class="card"
				v-for="r in visible"
				:key="r.id"
				hover-class="card-hover"
				@click="goRocket(r)"
			>
				<view class="info">
					<view class="name-line">
						<text class="name">{{ r.zhName || r.name }}</text>
						<text class="badge" :class="{ off: !r.active }">{{ r.active ? '现役' : '退役' }}</text>
					</view>

					<text class="sub" v-if="r.subName">{{ r.subName }}</text>

					<view class="meta">
						<text class="count" v-if="r.total_launch_count">{{ r.total_launch_count }} 次发射</text>
						<text class="count" v-else>暂无发射记录</text>
						<text class="dot" v-if="r.leoText">·</text>
						<text class="rate" v-if="r.leoText">LEO {{ r.leoText }}</text>
					</view>
				</view>

				<text class="arrow">›</text>
			</view>

			<view class="foot-hint">
				<text v-if="hasMore">上拉加载更多</text>
				<text v-else>已显示全部 {{ filtered.length }} 个型号</text>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { rocketName } from '@/utils/format.js'
import { syncTabBar } from '@/utils/tabbar.js'

const STEP = 14

export default {
	data() {
		return {
			all: [],
			loading: true,
			keyword: '',
			listNum: STEP
		}
	},

	computed: {
		filtered() {
			const q = this.keyword.trim().toLowerCase()
			if (!q) return this.all

			return this.all.filter((x) => {
				const hay = [x.zhName, x.name, x.full_name, x.manufacturer, (x.families || []).join(' ')]
					.join(' ')
					.toLowerCase()
				return hay.indexOf(q) !== -1
			})
		},
		visible() {
			return this.filtered.slice(0, this.listNum)
		},
		hasMore() {
			return this.listNum < this.filtered.length
		}
	},

	onLoad() {
		this.getData()
	},

	onShow() {
		syncTabBar(0)
	},

	onPullDownRefresh() {
		this.listNum = STEP
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (!this.hasMore) return
		this.listNum += STEP
	},

	methods: {
		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('launchers', { force: !!force })
				const list = (d && d.list) || []

				this.all = list
					.map((x) => {
						const zh = rocketName(x)
						const en = x.full_name || x.name || ''
						return {
							...x,
							zhName: zh,
							// 中文名和英文名不同就都显示，方便对照
							subName: en && en !== zh ? en : x.manufacturer || '',
							leoText: leoOf(x.leo_capacity)
						}
					})
					// 现役优先，同组内按发射次数倒序
					.sort((a, b) => {
						if (a.active !== b.active) return a.active ? -1 : 1
						return (b.total_launch_count || 0) - (a.total_launch_count || 0)
					})
			} catch (e) {
				console.warn('[rockets] 获取型号库失败', e)
			} finally {
				this.loading = false
			}
		},

		goRocket(r) {
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + r.id + '&name=' + encodeURIComponent(r.zhName || r.name)
			})
		}
	},

	watch: {
		// 换关键词时重新从第一批开始渲染
		keyword() {
			this.listNum = STEP
		}
	}
}

function leoOf(kg) {
	const v = Number(kg)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1000) return Math.round((v / 1000) * 10) / 10 + ' 吨'
	return v + ' kg'
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	padding: 0 24rpx 200rpx;
	background: #0a0e17;
	box-sizing: border-box;
}

.header {
	padding: 40rpx 8rpx 20rpx;
}

.title {
	display: block;
	color: #ffffff;
	font-size: 44rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
}

.subtitle {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 24rpx;
}

/* 搜索 */
.search {
	display: flex;
	align-items: center;
	height: 76rpx;
	margin: 0 0 20rpx;
	padding: 0 24rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 38rpx;
}

.search-icon {
	margin-right: 12rpx;
	font-size: 24rpx;
	opacity: 0.6;
}

.search-input {
	flex: 1;
	height: 76rpx;
	color: #e2e8f0;
	font-size: 27rpx;
}

.search-ph {
	color: #4a5568;
}

.search-clear {
	padding: 0 8rpx;
	color: #4a5568;
	font-size: 26rpx;
}

/* 卡片 */
.card {
	display: flex;
	align-items: center;
	margin-bottom: 16rpx;
	padding: 24rpx 26rpx;
	background: #141a26;
	border-radius: 18rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-hover {
	background: #1a2231;
}

.info {
	flex: 1;
	min-width: 0;
}

.name-line {
	display: flex;
	align-items: center;
}

.name {
	flex: 1;
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.badge {
	flex-shrink: 0;
	margin-left: 14rpx;
	padding: 3rpx 12rpx;
	border-radius: 6rpx;
	background: rgba(52, 199, 89, 0.12);
	color: #34c759;
	font-size: 20rpx;
}

.badge.off {
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
}

.sub {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 23rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.meta {
	display: flex;
	align-items: center;
	margin-top: 10rpx;
}

.count {
	color: #38bdf8;
	font-size: 23rpx;
}

.dot {
	margin: 0 10rpx;
	color: #3d4a5c;
	font-size: 20rpx;
}

.rate {
	color: #8a97a8;
	font-size: 22rpx;
}

.arrow {
	flex-shrink: 0;
	margin-left: 16rpx;
	color: #3d4a5c;
	font-size: 32rpx;
	line-height: 1;
}

.foot-hint {
	padding: 24rpx 0 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
