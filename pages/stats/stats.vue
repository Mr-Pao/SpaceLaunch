<template>
	<view class="page">
		<block v-if="!reviewMode">
		<view class="loading" v-if="loading">
			<text class="hint-text">统计中...</text>
		</view>

		<view class="empty" v-else-if="!years.length">
			<text class="empty-icon">📊</text>
			<text class="hint-text">统计数据还没生成，稍后再来看看</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<block v-else>
			<view class="head">
				<text class="year">{{ year }}</text>
				<text class="year-label">年度航天回顾</text>
			</view>

			<!-- 年度切换。可选年份直接来自 CI 预聚合好的结果 -->
			<view class="year-picker" v-if="availableYears.length > 1">
				<view
					class="year-chip"
					v-for="y in availableYears"
					:key="y"
					:class="{ on: year === y }"
					@click="year = y"
				>
					{{ y }}
				</view>
			</view>

			<!-- 主数字 -->
			<view class="hero-card">
				<text class="hero-num">{{ total }}</text>
				<text class="hero-unit">次发射</text>
				<view class="hero-sub">
					<text class="ok">成功 {{ successCount }}</text>
					<text class="sep">·</text>
					<text class="bad" v-if="failCount">失败 {{ failCount }}</text>
					<text class="sep" v-if="failCount">·</text>
					<text class="rate">成功率 {{ successRate }}</text>
				</view>
				<view class="hero-split">
					<text class="split-text">轨道发射 {{ orbitalCount }}</text>
					<text class="split-text" v-if="subCount"> · 亚轨道 {{ subCount }}</text>
				</view>
			</view>

			<!-- 月度分布 -->
			<view class="card">
				<view class="card-title">月度分布</view>
				<view class="chart">
					<view class="bar-col" v-for="m in months" :key="m.month">
						<text class="bar-num" v-if="m.count">{{ m.count }}</text>
						<view class="bar-slot">
							<view class="bar" :style="{ height: m.pct + '%' }"></view>
						</view>
						<text class="bar-label">{{ m.label }}</text>
					</view>
				</view>
			</view>

			<!-- 火箭型号 TOP 10 -->
			<view class="card" v-if="topRockets.length">
				<view class="card-title">火箭型号 TOP 10</view>
				<view class="rank" v-for="(r, i) in topRockets" :key="r.name">
					<view class="rank-line">
						<text class="rank-idx" :class="{ top: i === 0 }">{{ i + 1 }}</text>
						<text class="rank-name">{{ r.name }}</text>
						<text class="rank-count">{{ r.count }}</text>
					</view>
					<view class="rank-track">
						<view class="rank-fill" :style="{ width: r.pct + '%' }"></view>
					</view>
				</view>
			</view>

			<!-- 发射场 TOP 10 -->
			<view class="card" v-if="topSites.length">
				<view class="card-title">发射场 TOP 10</view>
				<view class="rank" v-for="(s, i) in topSites" :key="s.name">
					<view class="rank-line">
						<text class="rank-idx" :class="{ top: i === 0 }">{{ i + 1 }}</text>
						<text class="rank-name">{{ s.name }}</text>
						<text class="rank-count">{{ s.count }}</text>
					</view>
					<view class="rank-track">
						<view class="rank-fill fill-amber" :style="{ width: s.pct + '%' }"></view>
					</view>
				</view>
			</view>

			<!-- 国家分布 -->
			<view class="card" v-if="topCountries.length">
				<view class="card-title">国家 / 地区</view>
				<view class="country" v-for="c in topCountries" :key="c.name">
					<text class="country-name">{{ c.name }}</text>
					<view class="country-track">
						<view class="country-fill" :style="{ width: c.pct + '%' }"></view>
					</view>
					<text class="country-count">{{ c.count }}</text>
				</view>
			</view>

			<!-- 机构排行 -->
			<view class="card" v-if="topAgencies.length">
				<view class="card-title">机构排行</view>
				<view class="rank" v-for="(a, i) in topAgencies" :key="a.name">
					<view class="rank-line">
						<text class="rank-idx" :class="{ top: i === 0 }">{{ i + 1 }}</text>
						<text class="rank-name">{{ a.name }}</text>
						<text class="rank-count">{{ a.count }}</text>
					</view>
					<view class="rank-track">
						<view class="rank-fill" :style="{ width: a.pct + '%' }"></view>
					</view>
				</view>
			</view>

			<!-- 轨道分布 -->
			<view class="card" v-if="topOrbits.length">
				<view class="card-title">目标轨道</view>
				<view class="orbit" v-for="o in topOrbits" :key="o.name">
					<text class="orbit-name">{{ o.name }}</text>
					<view class="orbit-track">
						<view class="orbit-fill" :style="{ width: o.pct + '%' }"></view>
					</view>
					<text class="orbit-count">{{ o.count }}</text>
				</view>
			</view>

			<!-- 失败复盘 -->
			<view class="card" v-if="failures.length">
				<view class="card-title">失败 / 部分成功复盘</view>
				<view class="fail" v-for="f in failures" :key="f.id" @click="goDetail(f)">
					<view class="fail-top">
						<text class="fail-date">{{ f.dateText }}</text>
						<text class="fail-tag" :class="{ partial: f.isPartial }">{{ f.statusText }}</text>
					</view>
					<text class="fail-name">{{ f.name }}</text>
					<text class="fail-meta">{{ f.meta }}</text>
				</view>
			</view>

			<view class="footer-hint">
				<text>数据源：最新快照 + 历史归档，共 {{ sourceCount }} 条 · {{ freshText }}</text>
				<text v-if="isEarliestYear" class="footer-note">该年度只覆盖到归档边界，非全年完整统计</text>
			</view>
		</block>
		</block>

		<!-- 审核模式：tabBar 已隐藏，本页正常情况到不了，留空态兜底 -->
		<view class="empty" v-else>
			<text class="empty-icon">📊</text>
			<text class="hint-text">敬请期待</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { formatShort } from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

/**
 * 机构 → 国家/地区
 *
 * LL2 的 launch 没有国家字段，只能从发射服务商推断。
 * 用「包含匹配」而不是精确匹配：LL2 的机构全名偶尔会变（加后缀、改大小写）。
 */
const COUNTRY_RULES = [
	// 俄罗斯必须排在「美国」前面：「Russian Space Forces」里也含 space force
	[/russian|roscosmos|kosmotras|khrunichev/i, '俄罗斯'],
	[/china|cas space|galactic energy|landspace|expace|orienspace|space pioneer|kuaizhou/i, '中国'],
	[/spacex|rocket lab|united launch|blue origin|firefly|virgin|astra|relativity|nasa|us space force/i, '美国'],
	[/indian space|isro/i, '印度'],
	[/japan|mitsubishi|jaxa|interstellar/i, '日本'],
	[/korea|kari|defense development/i, '韩国'],
	[/arianespace|european space|avio/i, '欧洲'],
	[/isar/i, '德国'],
	[/israel|iai/i, '以色列'],
	[/iran/i, '伊朗'],
	[/new zealand/i, '新西兰']
]

export default {
	data() {
		return {
			loading: true,
			// CI 已经按年聚合好，前端只负责挑一年出来渲染
			years: [],
			year: new Date().getFullYear(),
			sourceCount: 0,
			freshText: '',
			// 审核模式：整页只显示空态
			reviewMode: false
		}
	},

	computed: {
		availableYears() {
			return this.years.map((y) => y.year)
		},

		current() {
			const hit = this.years.find((y) => y.year === this.year)
			return hit || this.years[0] || null
		},

		total() {
			return this.current ? this.current.total : 0
		},
		successCount() {
			return this.current ? this.current.success : 0
		},
		failCount() {
			if (!this.current) return 0
			return (this.current.fail || 0) + (this.current.partial || 0)
		},
		successRate() {
			const decided = this.successCount + this.failCount
			if (!decided) return '—'
			return ((this.successCount / decided) * 100).toFixed(1).replace(/\.0$/, '') + '%'
		},
		subCount() {
			return this.current ? this.current.sub || 0 : 0
		},
		orbitalCount() {
			return this.current ? this.current.orbital || 0 : 0
		},

		months() {
			const arr = this.current ? this.current.months || [] : []
			const max = Math.max(...arr, 1)
			return arr.map((count, i) => ({
				month: i + 1,
				label: MONTH_LABELS[i],
				count,
				// 最低留 8%，否则 1 次和 0 次在视觉上分不开
				pct: count ? Math.max(8, Math.round((count / max) * 100)) : 0
			}))
		},

		topRockets() {
			return withPct(this.current ? this.current.rockets : [])
		},
		topSites() {
			return withPct(this.current ? this.current.sites : [])
		},
		topAgencies() {
			return withPct(this.current ? this.current.agencies : [])
		},
		topOrbits() {
			return withPct(this.current ? this.current.orbits : [])
		},

		// 国家不在 CI 侧聚合：规则是前端维护的，而且只需读机构那十来行，开销可忽略
		topCountries() {
			const rows = this.current ? this.current.agencies || [] : []

			const map = new Map()
			for (const a of rows) {
				const c = countryOf(a.name)
				map.set(c, (map.get(c) || 0) + a.count)
			}
			const out = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
			const max = out.length ? out[0][1] : 1
			return out.map(([name, count]) => ({
				name,
				count,
				pct: Math.max(6, Math.round((count / max) * 100))
			}))
		},

		failures() {
			const rows = this.current ? this.current.failures || [] : []
			return rows.map((x) => ({
				id: x.id,
				dateText: formatShort(x.net),
				statusText: x.status === 'Partial' ? '部分成功' : '发射失败',
				isPartial: x.status === 'Partial',
				name: x.name || '未知任务',
				meta: [x.rocket, x.site].filter(Boolean).join(' · ')
			}))
		},

		// 最早的年份往往只覆盖了一部分（归档还没跑完），要如实说明
		isEarliestYear() {
			if (!this.years.length) return false
			return this.year === this.years[this.years.length - 1].year
		}
	},

	onLoad() {
		// 审核态不拉任何数据
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (!this.reviewMode) this.getData()
		})
	},

	onShow() {
		syncTabBar(4)
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	methods: {
		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('stats', { force: !!force })
				this.years = (d && d.list) || []
				this.sourceCount = (d && d.count) || 0
				this.freshText = spaceData.freshnessText(d && d.generatedAt)

				// 数据里的年份可能还没有当前年（跨年后统计没更新），退回最新的一年
				if (this.years.length && !this.years.some((y) => y.year === this.year)) {
					this.year = this.years[0].year
				}
			} catch (e) {
				console.warn('[stats] 获取统计失败', e)
			} finally {
				this.loading = false
			}
		},

		goDetail(f) {
			if (!f.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + f.id })
		}
	}
}

/** 给排名补上百分比，进度条要用 */
function withPct(rows) {
	if (!rows || !rows.length) return []
	const max = rows[0].count || 1
	return rows.map((r) => ({ ...r, pct: Math.max(6, Math.round((r.count / max) * 100)) }))
}

/** 机构名 → 国家；匹配不上就归「其他」 */
function countryOf(agency) {
	if (!agency) return '未知'
	for (const [re, name] of COUNTRY_RULES) {
		if (re.test(agency)) return name
	}
	return '其他'
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 200rpx;
	box-sizing: border-box;
}

.head {
	padding: 40rpx 32rpx 24rpx;
}

.year {
	display: block;
	color: #ffffff;
	font-size: 46rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
}

.year-label {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 24rpx;
	letter-spacing: 2rpx;
}

/* 年度切换 */
.year-picker {
	display: flex;
	flex-wrap: wrap;
	padding: 4rpx 32rpx 22rpx;
}

.year-chip {
	padding: 8rpx 24rpx;
	margin: 0 14rpx 10rpx 0;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 30rpx;
	color: #8a97a8;
	font-size: 24rpx;
}

.year-chip.on {
	background: rgba(56, 189, 248, 0.14);
	border-color: rgba(56, 189, 248, 0.45);
	color: #38bdf8;
	font-weight: 600;
}

.hero-card {
	margin: 0 24rpx;
	padding: 40rpx 32rpx;
	background: linear-gradient(135deg, #17263d 0%, #141a26 100%);
	border-radius: 24rpx;
	border: 1rpx solid rgba(56, 189, 248, 0.12);
}

.hero-num {
	color: #ffffff;
	font-size: 88rpx;
	font-weight: 600;
	line-height: 1;
}

.hero-unit {
	margin-left: 12rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.hero-sub {
	margin-top: 20rpx;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
}

.ok {
	color: #34c759;
	font-size: 26rpx;
}

.bad {
	color: #ff3b30;
	font-size: 26rpx;
}

.rate {
	color: #38bdf8;
	font-size: 26rpx;
}

.sep {
	margin: 0 12rpx;
	color: #3d4a5c;
	font-size: 22rpx;
}

.hero-split {
	margin-top: 12rpx;
}

.split-text {
	color: #4a5568;
	font-size: 23rpx;
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

/* 月度柱状图 */
.chart {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
}

.bar-col {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.bar-num {
	color: #8a97a8;
	font-size: 18rpx;
	margin-bottom: 6rpx;
}

.bar-slot {
	width: 100%;
	height: 200rpx;
	display: flex;
	align-items: flex-end;
	justify-content: center;
}

.bar {
	width: 60%;
	min-height: 4rpx;
	background: linear-gradient(to top, #1e5f86, #38bdf8);
	border-radius: 6rpx 6rpx 2rpx 2rpx;
}

.bar-label {
	margin-top: 10rpx;
	color: #4a5568;
	font-size: 20rpx;
}

/* 排行 */
.rank {
	margin-bottom: 24rpx;
}

.rank:last-child {
	margin-bottom: 0;
}

.rank-line {
	display: flex;
	align-items: center;
	margin-bottom: 10rpx;
}

.rank-idx {
	flex-shrink: 0;
	width: 36rpx;
	height: 36rpx;
	margin-right: 14rpx;
	line-height: 36rpx;
	text-align: center;
	border-radius: 8rpx;
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
	font-size: 22rpx;
}

.rank-idx.top {
	background: rgba(245, 195, 59, 0.16);
	color: #f5c33b;
}

.rank-name {
	flex: 1;
	min-width: 0;
	color: #e2e8f0;
	font-size: 26rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rank-count {
	flex-shrink: 0;
	margin-left: 16rpx;
	color: #38bdf8;
	font-size: 26rpx;
}

.rank-track {
	height: 8rpx;
	margin-left: 50rpx;
	background: rgba(255, 255, 255, 0.05);
	border-radius: 4rpx;
	overflow: hidden;
}

.rank-fill {
	height: 100%;
	background: linear-gradient(to right, #1e5f86, #38bdf8);
	border-radius: 4rpx;
}

.fill-amber {
	background: linear-gradient(to right, #7a5c14, #f5c33b);
}

/* 国家 */
.country {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}

.country:last-child {
	margin-bottom: 0;
}

.country-name {
	flex-shrink: 0;
	width: 120rpx;
	color: #cbd5e0;
	font-size: 24rpx;
}

.country-track {
	flex: 1;
	height: 10rpx;
	margin: 0 16rpx;
	background: rgba(255, 255, 255, 0.05);
	border-radius: 5rpx;
	overflow: hidden;
}

.country-fill {
	height: 100%;
	background: linear-gradient(to right, #4a2b5e, #a06bd8);
	border-radius: 5rpx;
}

.country-count {
	flex-shrink: 0;
	width: 60rpx;
	text-align: right;
	color: #8a97a8;
	font-size: 24rpx;
}

/* 轨道 */
.orbit {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}

.orbit:last-child {
	margin-bottom: 0;
}

.orbit-name {
	flex-shrink: 0;
	width: 120rpx;
	color: #cbd5e0;
	font-size: 24rpx;
}

.orbit-track {
	flex: 1;
	height: 10rpx;
	margin: 0 16rpx;
	background: rgba(255, 255, 255, 0.05);
	border-radius: 5rpx;
	overflow: hidden;
}

.orbit-fill {
	height: 100%;
	background: linear-gradient(to right, #2f6f4f, #34c759);
	border-radius: 5rpx;
}

.orbit-count {
	flex-shrink: 0;
	width: 60rpx;
	text-align: right;
	color: #8a97a8;
	font-size: 24rpx;
}

/* 失败复盘 */
.fail {
	padding: 20rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.fail:first-of-type {
	border-top: none;
	padding-top: 0;
}

.fail-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.fail-date {
	color: #6b7891;
	font-size: 22rpx;
}

.fail-tag {
	padding: 2rpx 12rpx;
	border-radius: 6rpx;
	background: rgba(255, 59, 48, 0.14);
	color: #ff3b30;
	font-size: 20rpx;
}

.fail-tag.partial {
	background: rgba(245, 195, 59, 0.14);
	color: #f5c33b;
}

.fail-name {
	display: block;
	margin-top: 8rpx;
	color: #e2e8f0;
	font-size: 27rpx;
	line-height: 1.5;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.fail-meta {
	display: block;
	margin-top: 6rpx;
	color: #4a5568;
	font-size: 22rpx;
}

.footer-hint {
	margin-top: 30rpx;
	padding: 0 32rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
	line-height: 1.6;
}

.footer-note {
	display: block;
	margin-top: 6rpx;
	color: #3d4a5c;
}
</style>
