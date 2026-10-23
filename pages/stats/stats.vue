<template>
	<view class="page">
		<view class="loading" v-if="loading">
			<text class="hint-text">统计中...</text>
		</view>

		<view class="empty" v-else-if="!total">
			<text class="empty-icon">📊</text>
			<text class="hint-text">统计数据还没生成，稍后再来看看</text>
			<view class="btn" @click="getData(true)">重新加载</view>
		</view>

		<block v-else>
			<view class="head">
				<text class="year">{{ year }}</text>
				<text class="year-label">年度航天回顾</text>
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
					<text class="fail-name">{{ f.title }}</text>
					<text class="fail-meta">{{ f.meta }}</text>
				</view>
			</view>

			<view class="footer-hint">
				<text>统计范围：{{ year }} 年已发射任务 · 更新于 {{ freshText }}</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { formatShort } from '@/utils/format.js'

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

// LL2 的状态码里，Deployed 表示载荷已成功部署，算成功
const OK = ['Success', 'Deployed']
const BAD = ['Failure']
const PARTIAL = ['Partial']

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
			year: new Date().getFullYear(),
			list: [],
			servedCount: 0,
			freshText: ''
		}
	},

	computed: {
		// 只保留今年的记录，数据源是最近 400 次，跨年时会混进去年的
		yearList() {
			return this.list.filter((x) => {
				if (!x.net) return false
				return new Date(x.net).getFullYear() === this.year
			})
		},
		total() {
			return this.yearList.length
		},
		successCount() {
			return this.yearList.filter((x) => OK.indexOf(x.status) !== -1).length
		},
		failCount() {
			return this.yearList.filter(
				(x) => BAD.indexOf(x.status) !== -1 || PARTIAL.indexOf(x.status) !== -1
			).length
		},
		successRate() {
			const decided = this.successCount + this.failCount
			if (!decided) return '—'
			return ((this.successCount / decided) * 100).toFixed(1).replace(/\.0$/, '') + '%'
		},
		// 亚轨道在 LL2 里 orbit 标记为 Sub
		subCount() {
			return this.yearList.filter((x) => x.orbit === 'Sub').length
		},
		orbitalCount() {
			return this.total - this.subCount
		},
		months() {
			const buckets = new Array(12).fill(0)
			for (const x of this.yearList) {
				const m = new Date(x.net).getMonth()
				if (m >= 0 && m < 12) buckets[m]++
			}
			const max = Math.max(...buckets, 1)
			return buckets.map((count, i) => ({
				month: i + 1,
				label: MONTH_LABELS[i],
				count,
				// 最低留 8%，否则 1 次和 0 次在视觉上分不开
				pct: count ? Math.max(8, Math.round((count / max) * 100)) : 0
			}))
		},
		topRockets() {
			return rankBy(this.yearList, (x) => x.rocket, 10)
		},
		topSites() {
			return rankBy(this.yearList, (x) => x.site, 10)
		},
		topCountries() {
			// 先按机构聚合成国家，再排序
			const map = new Map()
			for (const x of this.yearList) {
				const c = countryOf(x.agency)
				map.set(c, (map.get(c) || 0) + 1)
			}
			const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
			const max = rows.length ? rows[0][1] : 1
			return rows.map(([name, count]) => ({
				name,
				count,
				pct: Math.max(6, Math.round((count / max) * 100))
			}))
		},
		topAgencies() {
			return rankBy(this.yearList, (x) => x.agency, 8)
		},
		topOrbits() {
			return rankBy(this.yearList, (x) => x.orbit, 6)
		},
		failures() {
			return this.yearList
				.filter((x) => BAD.indexOf(x.status) !== -1 || PARTIAL.indexOf(x.status) !== -1)
				.map((x) => ({
					id: x.id,
					dateText: formatShort(x.net),
					statusText: x.status === 'Partial' ? '部分成功' : '发射失败',
					isPartial: x.status === 'Partial',
					title: x.name || '未知任务',
					meta: [x.rocket, x.site].filter(Boolean).join(' · ')
				}))
				// 最近的排在前面
				.sort((a, b) => (a.dateText < b.dateText ? 1 : -1))
		}
	},

	onLoad() {
		this.getData()
	},

	onShow() {
		syncTabBar(4)
	},

	onPullDownRefresh() {
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	methods: {
		async getData(force) {
			this.loading = true
			try {
				const d = await spaceData.load('stats', { force: !!force })
				this.list = (d && d.list) || []
				this.servedCount = this.list.length
				this.freshText = spaceData.freshnessText(d && d.generatedAt)
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

/** 按某个字段计数并排序，返回 [{name, count, pct}] */
function rankBy(list, pick, limit) {
	const map = new Map()
	for (const item of list) {
		const key = (pick(item) || '未标注').trim()
		map.set(key, (map.get(key) || 0) + 1)
	}

	const rows = [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }))

	const max = rows.length ? rows[0].count : 1
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
</style>
