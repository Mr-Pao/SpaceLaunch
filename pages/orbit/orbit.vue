<template>
	<view class="page">
		<star-field />
		<view class="nav-row" :style="{ paddingTop: statusBarH + 'px' }">
			<view class="nav-back" @click="goBack"><text class="nav-arrow">‹</text></view>
			<text class="nav-title">全球在轨资产</text>
		</view>

		<view class="loading" v-if="loading">
			<text class="hint-text">统计中...</text>
		</view>

		<view class="empty" v-else-if="!total">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">在轨资产数据还没生成，稍后再来看看</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<block v-else>
			<view class="head">
				<text class="big">{{ total }}</text>
				<text class="big-unit">个在轨物体</text>
				<text class="sub">数据来自 GCAT 季度编目快照（含火箭体、载荷与残骸）</text>
			</view>

			<!-- 按国家 / 地区 -->
			<view class="card" v-if="topStates.length">
				<view class="card-title">按国家 / 地区</view>
				<view class="bar" v-for="c in topStates" :key="c.k">
					<text class="bar-name">{{ c.k }}</text>
					<view class="bar-track">
						<view class="bar-fill" :style="{ width: c.pct + '%' }"></view>
					</view>
					<text class="bar-count">{{ c.v }}</text>
				</view>
			</view>

			<!-- 按轨道类型 -->
			<view class="card" v-if="topOrbits.length">
				<view class="card-title">按轨道类型</view>
				<view class="bar" v-for="c in topOrbits" :key="c.k">
					<text class="bar-name">{{ c.k }}</text>
					<view class="bar-track">
						<view class="bar-fill fill-green" :style="{ width: c.pct + '%' }"></view>
					</view>
					<text class="bar-count">{{ c.v }}</text>
				</view>
			</view>

			<!-- 按年代入轨 -->
			<view class="card" v-if="decades.length">
				<view class="card-title">按年代入轨</view>
				<view class="chart">
					<view class="col" v-for="d in decades" :key="d.k">
						<text class="col-num" v-if="d.v">{{ d.v }}</text>
						<view class="col-slot">
							<view class="col-bar" :style="{ height: d.pct + '%' }"></view>
						</view>
						<text class="col-label">{{ d.k }}s</text>
					</view>
				</view>
			</view>

			<view class="footer-hint">
				<text>数据源：GCAT (J. McDowell, planet4589.org/space/gcat) · CC-BY</text>
				<text class="footer-note">{{ freshText }}</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'

// 列表最多展示的条数（byOrbit 原始有 71 种，byState 取前 25）
const MAX_BARS = 12

function withPct(rows, key) {
	if (!rows || !rows.length) return []
	const max = rows[0].v || 1
	return rows.slice(0, MAX_BARS).map((r) => ({
		k: r.k,
		v: r.v,
		pct: Math.max(5, Math.round((r.v / max) * 100))
	}))
}

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			total: 0,
			freshText: '',
			topStates: [],
			topOrbits: [],
			decades: []
		}
	},

	onLoad() {
		this.getData()
	},

	onPullDownRefresh() {
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	methods: {
		goBack() {
			const pages = getCurrentPages()
			if (pages.length > 1) {
				uni.navigateBack()
			} else {
				uni.switchTab({ url: '/pages/mine/mine' })
			}
		},

		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('orbitStats', { force: !!force })
				this.total = d.total || 0
				this.freshText = spaceData.freshnessText(d.generatedAt)
				this.topStates = withPct(d.byState, 'k')
				this.topOrbits = withPct(d.byOrbit, 'k')
				this.decades = withDecadePct(d.byDecade)
			} catch (e) {
				console.warn('[orbit] 获取在轨资产失败', e)
			} finally {
				this.loading = false
			}
		}
	}
}

// 年代柱状图：byDecade 是 [{k:1950,v:34},...]，按值算百分比
function withDecadePct(rows) {
	if (!rows || !rows.length) return []
	const max = Math.max(...rows.map((r) => r.v), 1)
	return rows.map((r) => ({
		k: r.k,
		v: r.v,
		pct: Math.max(4, Math.round((r.v / max) * 100))
	}))
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	padding-bottom: 60rpx;
	box-sizing: border-box;
}

.nav-row {
	padding: 0 24rpx;
}
.nav-back {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 60rpx;
	height: 60rpx;
	margin-left: -10rpx;
}
.nav-arrow {
	color: #ffffff;
	font-size: 54rpx;
	font-weight: 300;
	line-height: 1;
	margin-top: -6rpx;
}
.nav-title {
	font-size: 36rpx;
	padding-right: 160rpx;
}

.loading,
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 200rpx 40rpx;
}
.hint-text { color: #6b7891; font-size: 26rpx; }
.empty-icon { font-size: 64rpx; margin-bottom: 16rpx; }
.btn {
	margin-top: 24rpx;
	padding: 14rpx 40rpx;
	background: rgba(56, 189, 248, 0.14);
	color: #38bdf8;
	border-radius: 30rpx;
	font-size: 24rpx;
}

.head {
	padding: 40rpx 24rpx 24rpx;
}
.big {
	color: #ffffff;
	font-size: 72rpx;
	font-weight: 700;
	line-height: 1;
}
.big-unit {
	margin-left: 14rpx;
	color: #6b7891;
	font-size: 26rpx;
}
.sub {
	display: block;
	margin-top: 14rpx;
	color: #4a5568;
	font-size: 22rpx;
	line-height: 1.5;
}

.card {
	margin: 24rpx;
	padding: 30rpx 28rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}
.card-title {
	margin-bottom: 26rpx;
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
}

.bar {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}
.bar:last-child { margin-bottom: 0; }
.bar-name {
	flex-shrink: 0;
	width: 150rpx;
	color: #cbd5e0;
	font-size: 23rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.bar-track {
	flex: 1;
	height: 12rpx;
	margin: 0 16rpx;
	background: rgba(255, 255, 255, 0.05);
	border-radius: 6rpx;
	overflow: hidden;
}
.bar-fill {
	height: 100%;
	background: linear-gradient(to right, #1e5f86, #38bdf8);
	border-radius: 6rpx;
}
.bar-fill.fill-green {
	background: linear-gradient(to right, #2f6f4f, #34c759);
}
.bar-count {
	flex-shrink: 0;
	width: 70rpx;
	text-align: right;
	color: #8a97a8;
	font-size: 23rpx;
}

.chart {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
}
.col {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}
.col-num {
	color: #8a97a8;
	font-size: 17rpx;
	margin-bottom: 6rpx;
}
.col-slot {
	width: 100%;
	height: 220rpx;
	display: flex;
	align-items: flex-end;
	justify-content: center;
}
.col-bar {
	width: 56%;
	min-height: 4rpx;
	background: linear-gradient(to top, #1e5f86, #38bdf8);
	border-radius: 6rpx 6rpx 2rpx 2rpx;
}
.col-label {
	margin-top: 10rpx;
	color: #4a5568;
	font-size: 19rpx;
}

.footer-hint {
	margin-top: 30rpx;
	padding: 0 24rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 20rpx;
	line-height: 1.6;
}
.footer-note {
	display: block;
	margin-top: 6rpx;
}
</style>
