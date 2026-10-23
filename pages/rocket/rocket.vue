<template>
	<view class="page">
		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!records.length">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">当前数据里还没有这款火箭的发射记录</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<!-- 头图：火箭参数在 normal 模式下拿不到，所以不摆空参数，只做视觉头部 -->
			<view class="hero">
				<text class="hero-icon">🚀</text>
				<text class="hero-name">{{ displayName }}</text>
				<text class="hero-sub">共 {{ records.length }} 次发射记录</text>
			</view>

			<view class="body">
				<!-- 统计 -->
				<view class="stat-card">
					<view class="stat-item">
						<text class="stat-num">{{ records.length }}</text>
						<text class="stat-label">发射</text>
					</view>
					<view class="stat-item">
						<text class="stat-num c-green">{{ successCount }}</text>
						<text class="stat-label">成功</text>
					</view>
					<view class="stat-item">
						<text class="stat-num c-red">{{ failCount }}</text>
						<text class="stat-label">失败</text>
					</view>
					<view class="stat-item">
						<text class="stat-num c-blue">{{ successRate }}</text>
						<text class="stat-label">成功率</text>
					</view>
				</view>

				<!-- 时间跨度 -->
				<view class="card">
					<view class="card-title">记录范围</view>
					<view class="row">
						<text class="label">最早一次</text>
						<text class="value">{{ firstNet }}</text>
					</view>
					<view class="row">
						<text class="label">最近一次</text>
						<text class="value">{{ lastNet }}</text>
					</view>
					<view class="row" v-if="agencyNames">
						<text class="label">发射机构</text>
						<text class="value">{{ agencyNames }}</text>
					</view>
				</view>

				<view class="section-title">
					<text>发射记录</text>
				</view>

				<view class="list">
					<launch-card
						v-for="item in records"
						:key="item.id"
						:item="item"
						@select="goDetail"
					/>
				</view>

				<view class="footer-hint">
					<text>统计基于小程序当前缓存的最近 100 次发射</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { formatDateTime, rocketName as rocketNameOf } from '@/utils/format.js'

export default {
	data() {
		return {
			rocketId: '',
			rocketName: '',
			loading: true,
			records: []
		}
	},

	computed: {
		displayName() {
			if (this.rocketName) return this.rocketName
			const first = this.records[0]
			if (!first) return '运载火箭'
			return rocketNameOf(first.rocket && first.rocket.configuration) || '运载火箭'
		},
		// 只统计已有结果的任务，未发射的不该算进成功率分母
		successCount() {
			return this.records.filter((x) => x.status && x.status.abbrev === 'Success').length
		},
		failCount() {
			return this.records.filter(
				(x) => x.status && (x.status.abbrev === 'Failure' || x.status.abbrev === 'Partial')
			).length
		},
		successRate() {
			const decided = this.successCount + this.failCount
			if (!decided) return '—'
			return Math.round((this.successCount / decided) * 100) + '%'
		},
		firstNet() {
			return this.edgeTime(true)
		},
		lastNet() {
			return this.edgeTime(false)
		},
		agencyNames() {
			const set = new Set()
			for (const x of this.records) {
				const n = x.launch_service_provider && x.launch_service_provider.name
				if (n) set.add(n)
			}
			return [...set].join('、')
		}
	},

	async onLoad(query) {
		this.rocketId = (query && query.id) || ''
		this.rocketName = (query && query.name) ? decodeURIComponent(query.name) : ''

		if (!this.rocketId) {
			this.loading = false
			return
		}

		// 一个型号的发射会分散在 upcoming 和 previous 两边，两边都要扫
		const [prev, up] = await Promise.all([
			spaceData.load('previous').catch(() => null),
			spaceData.load('upcoming').catch(() => null)
		])

		const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]
		const id = String(this.rocketId)

		this.records = all
			.filter((x) => {
				const c = x.rocket && x.rocket.configuration
				return c && String(c.id) === id
			})
			// LL2 的 previous 是倒序、upcoming 是正序，合起来后统一按 net 倒序
			.sort((a, b) => new Date(b.net || 0) - new Date(a.net || 0))

		this.loading = false
	},

	methods: {
		edgeTime(wantEarliest) {
			const list = this.records.filter((x) => x.net)
			if (!list.length) return '—'
			// records 已按 net 倒序，所以末位是最早、首位是最近
			const item = wantEarliest ? list[list.length - 1] : list[0]
			return formatDateTime(item.net) || '—'
		},
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
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
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 40rpx;
}

/* 头部 */
.hero {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 60rpx 40rpx 70rpx;
	background: linear-gradient(180deg, #16233a 0%, #0a0e17 100%);
}

.hero-icon {
	font-size: 88rpx;
	margin-bottom: 20rpx;
}

.hero-name {
	color: #ffffff;
	font-size: 42rpx;
	font-weight: 600;
	text-align: center;
	line-height: 1.3;
}

.hero-sub {
	margin-top: 14rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.body {
	padding: 0 24rpx;
	margin-top: -30rpx;
	position: relative;
}

/* 四格统计 */
.stat-card {
	display: flex;
	padding: 30rpx 0;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.stat-item {
	flex: 1;
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

.c-green { color: #34c759; }
.c-red { color: #ff3b30; }
.c-blue { color: #38bdf8; }

.stat-label {
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 24rpx;
}

.card {
	margin-top: 24rpx;
	padding: 28rpx 30rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 12rpx;
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
}

.section-title {
	margin: 36rpx 8rpx 16rpx;
	color: #8a97a8;
	font-size: 28rpx;
}

.footer-hint {
	margin-top: 30rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
