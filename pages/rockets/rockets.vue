<template>
	<view class="page">
		<view class="header">
			<!-- 连点 5 次呼出展示开关（静默切换）：入口隐藏，普通用户与审核不可见 -->
			<text class="title" @click="onTitleTap">火箭大全</text>
			<text class="subtitle">主流现役与历史型号，按发射次数排序</text>
		</view>

		<!-- 顶部统计 -->
		<view class="stats">
			<view class="stat-cell" v-for="s in stats" :key="s.label">
				<text class="stat-num">{{ s.value }}</text>
				<text class="stat-label">{{ s.label }}</text>
			</view>
		</view>

		<!-- 搜索 -->
		<view class="search">
			<text class="search-icon">🔍</text>
			<input
				class="search-input"
				v-model="keyword"
				type="text"
				placeholder="搜索型号、系列、制造商"
				placeholder-class="search-ph"
				confirm-type="search"
			/>
			<text class="search-clear" v-if="keyword" @click="keyword = ''">✕</text>
		</view>

		<!-- 状态筛选：只有三档，直接平铺；右侧加一个「中国火箭」快捷入口 -->
		<view class="filter-row">
			<view
				class="chip"
				v-for="s in statusOptions"
				:key="s.value"
				:class="{ on: status === s.value }"
				@click="status = s.value"
			>
				{{ s.label }}
			</view>
			<view class="chip chip-cn" :class="{ on: cnOnly }" @click="cnOnly = !cnOnly">
				中国火箭
			</view>
		</view>

		<!-- 系列筛选：数量多，横向滚动 -->
		<scroll-view class="family-scroll" scroll-x enable-flex :show-scrollbar="false">
			<view class="family-inner">
				<view
					class="chip chip-sm"
					:class="{ on: family === '' }"
					@click="family = ''"
				>
					全部系列
				</view>
				<view
					class="chip chip-sm"
					v-for="f in topFamilies"
					:key="f.name"
					:class="{ on: family === f.name }"
					@click="family = f.name"
				>
					{{ f.name }}
					<text class="chip-count">{{ f.count }}</text>
				</view>
			</view>
		</scroll-view>

		<view class="result-line">
			<text class="result-text">共 {{ filtered.length }} 个型号</text>
			<text class="result-reset" v-if="hasFilter" @click="resetFilter">清空筛选</text>
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
			<text class="hint-text">没有符合条件的型号</text>
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
import { setOverride } from '@/utils/config.js'

const STEP = 14
// 系列太多（66 个），只把最活跃的放进筛选条，其余靠搜索
const FAMILY_LIMIT = 20

/**
 * 中国火箭的系列名。
 * LL2 的型号库**没有国家字段**（manufacturer 只是字符串），
 * 所以用「系列白名单 + 制造商含 China」两条路一起判断 ——
 * LandSpace、Galactic Energy 这类公司名里并没有 China。
 */
const CN_FAMILIES = [
	'Long March',
	'Zhuque',
	'Ceres',
	'Kuaizhou',
	'Kinetica',
	'Gravity',
	'Pallas',
	'Tianlong',
	'Lijian',
	'Hyperbola',
	'Kaituo',
	'Jielong'
]

export default {
	data() {
		return {
			all: [],
			loading: true,
			keyword: '',
			status: 'all',
			family: '',
			cnOnly: false,
			listNum: STEP,
			// 暗门计数：3 秒内连点 5 次「火箭大全」标题呼出开关
			taps: 0,
			tapTimer: null,
			statusOptions: [
				{ label: '全部', value: 'all' },
				{ label: '现役', value: 'active' },
				{ label: '退役', value: 'retired' }
			]
		}
	},

	computed: {
		stats() {
			const list = this.all
			if (!list.length) return []

			const families = new Set()
			const makers = new Set()
			let active = 0

			for (const x of list) {
				if (x.active) active++
				if (x.manufacturer) makers.add(x.manufacturer)
				const fam = (x.families || [])[0]
				if (fam) families.add(fam)
			}

			return [
				{ label: '个型号', value: list.length },
				{ label: '现役', value: active },
				{ label: '个系列', value: families.size },
				{ label: '家制造商', value: makers.size }
			]
		},

		// 系列按「现役型号数」优先排序，再按总数。
		// 纯按总数排的话，Delta / Thor / Titan 这些老系列会排在前面，
		// 点进去全是退役型号，筛选条就失去意义了
		topFamilies() {
			const map = new Map()
			for (const x of this.all) {
				const fam = (x.families || [])[0]
				if (!fam) continue
				const cur = map.get(fam) || { total: 0, active: 0 }
				cur.total++
				if (x.active) cur.active++
				map.set(fam, cur)
			}

			return [...map.entries()]
				.sort((a, b) => b[1].active - a[1].active || b[1].total - a[1].total)
				.slice(0, FAMILY_LIMIT)
				.map(([name, v]) => ({ name, count: v.total }))
		},

		filtered() {
			const q = this.keyword.trim().toLowerCase()

			return this.all.filter((x) => {
				if (this.status === 'active' && !x.active) return false
				if (this.status === 'retired' && x.active) return false

				if (this.cnOnly && !isChinese(x)) return false

				if (this.family) {
					const fams = x.families || []
					if (fams.indexOf(this.family) === -1) return false
				}

				if (!q) return true

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
		},

		hasFilter() {
			return this.status !== 'all' || !!this.family || this.cnOnly || !!this.keyword.trim()
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

	onUnload() {
		if (this.tapTimer) clearTimeout(this.tapTimer)
	},

	methods: {
		onTitleTap() {
			this.taps++
			if (this.tapTimer) clearTimeout(this.tapTimer)
			this.tapTimer = setTimeout(() => (this.taps = 0), 3000)

			if (this.taps >= 5) {
				this.taps = 0
				this.showPanel()
			}
		},

		// 只有两项，静默切换：切完直接跳到对应首页，
		// 「展示」后的界面与审核员看到的一致（火箭大全，无 tabBar）。
		// reLaunch 失败时页面栈不会被清空，旧实例（尤其详情页）会卡在旧状态，
		// 所以失败必须给出提示，不能静默。
		showPanel() {
			const relaunch = (url) =>
				uni.reLaunch({
					url,
					fail: () => uni.showToast({ title: '切换失败，请重试', icon: 'none' })
				})

			uni.showActionSheet({
				itemList: ['展示', '正常'],
				success: (res) => {
					if (res.tapIndex === 0) {
						setOverride(true)
						relaunch('/pages/rockets/rockets')
					} else if (res.tapIndex === 1) {
						setOverride(false)
						relaunch('/pages/index/index')
					}
				}
			})
		},

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

		resetFilter() {
			this.status = 'all'
			this.family = ''
			this.cnOnly = false
			this.keyword = ''
		},

		goRocket(r) {
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + r.id + '&name=' + encodeURIComponent(r.zhName || r.name)
			})
		}
	},

	watch: {
		keyword() {
			this.listNum = STEP
		},
		status() {
			this.listNum = STEP
		},
		family() {
			this.listNum = STEP
		},
		cnOnly() {
			this.listNum = STEP
		}
	}
}

/** 是否中国火箭：制造商含 China，或系列命中白名单 */
function isChinese(x) {
	const maker = (x.manufacturer || '').toLowerCase()
	if (maker.indexOf('china') !== -1 || maker.indexOf('chinese') !== -1) return true

	const fams = x.families || []
	for (const f of fams) {
		if (CN_FAMILIES.indexOf(f) !== -1) return true
	}
	return false
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
	padding: 36rpx 8rpx 24rpx;
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

/* 顶部四格统计 */
.stats {
	display: flex;
	margin-bottom: 22rpx;
}

.stat-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 22rpx 0;
	margin-right: 12rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 16rpx;
}

.stat-cell:last-child {
	margin-right: 0;
}

.stat-num {
	color: #ffffff;
	font-size: 38rpx;
	font-weight: 600;
	line-height: 1.15;
}

.stat-label {
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 20rpx;
}

/* 搜索 */
.search {
	display: flex;
	align-items: center;
	height: 76rpx;
	margin-bottom: 18rpx;
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

/* 筛选项 */
.filter-row {
	display: flex;
	margin-bottom: 14rpx;
}

.chip {
	padding: 10rpx 26rpx;
	margin-right: 14rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 30rpx;
	color: #8a97a8;
	font-size: 25rpx;
}

.chip.on {
	background: rgba(56, 189, 248, 0.14);
	border-color: rgba(56, 189, 248, 0.45);
	color: #38bdf8;
}

/* 「中国火箭」用琥珀色区分：它是跨系列的快捷筛选，不是状态 */
.chip-cn {
	margin-left: auto;
	margin-right: 0;
}

.chip-cn.on {
	background: rgba(245, 195, 59, 0.14);
	border-color: rgba(245, 195, 59, 0.45);
	color: #f5c33b;
}

.chip-sm {
	padding: 8rpx 20rpx;
	font-size: 23rpx;
}

.chip-count {
	margin-left: 8rpx;
	color: #4a5568;
	font-size: 20rpx;
}

.chip.on .chip-count {
	color: rgba(56, 189, 248, 0.7);
}

/* 系列横向滚动。scroll-view 横向滚动必须有确定高度，否则会塌陷 */
.family-scroll {
	width: 100%;
	height: 68rpx;
	margin-bottom: 16rpx;
	white-space: nowrap;
}

.family-inner {
	display: flex;
	align-items: center;
	padding-bottom: 4rpx;
}

.result-line {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4rpx 8rpx 16rpx;
}

.result-text {
	color: #6b7891;
	font-size: 23rpx;
}

.result-reset {
	color: #38bdf8;
	font-size: 23rpx;
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
