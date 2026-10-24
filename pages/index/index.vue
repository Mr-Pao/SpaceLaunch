<template>
	<view class="page">
		<!-- 全屏星空：组件化后各 tab 页共用同一套星点层 -->
		<star-field />

		<!-- 导航行：标题靠左，与右上角微信胶囊同排（右侧留白，避免重叠） -->
		<view class="nav-row" :style="{ paddingTop: statusBarH + 'px' }">
			<!-- 点 logo 看版本记录 -->
			<image
				class="nav-logo"
				src="/static/logo.png"
				mode="aspectFill"
				@click="goVersion"
			></image>
			<text class="nav-title">太空发射任务</text>
		</view>

		<!-- 审核模式下整页换成静态展示卡：无列表、无动态数据、无 tab 入口，
		     观感是「工具介绍页」，与「工具-信息查询」类目一致 -->
		<block v-if="!reviewMode">
			<!-- 只有完全没有缓存时才整屏转圈，有缓存时下面直接出内容。
			     火箭小动画 + 骨架卡：骨架给「内容长什么样」的预期，
			     火箭给品牌感，纯转圈什么都不给 -->
			<view class="loading" v-if="loading && list.length === 0">
				<view class="rocket-loading">
					<image
						class="rocket"
						src="/static/rocket.png"
						mode="aspectFit"
					></image>
					<view class="flame"></view>
				</view>
				<text class="loading-text">准备发射...</text>
				<view class="sk-list">
					<skeleton-card v-for="i in 3" :key="i" />
				</view>
			</view>

			<view class="error" v-else-if="error && list.length === 0">
				<text class="error-icon">⚠️</text>
				<text class="error-text">{{ error }}</text>
				<view class="btn" @click="reload">重新尝试</view>
			</view>

			<view class="content" v-else>
			<!-- 控制行：左边待发射/已发射，右边排期/日历。
			     搜索与筛选挪到右下角悬浮钮，这一行只留「看哪一批」和「怎么看」 -->
			<view class="mode-bar">
				<view class="feed-seg">
					<view
						class="feed-opt"
						:class="{ on: feed === 'upcoming' }"
						@click="setFeed('upcoming')"
					>待发射</view>
					<view
						class="feed-opt"
						:class="{ on: feed === 'previous' }"
						@click="setFeed('previous')"
					>已发射</view>
				</view>

				<view class="mode-seg">
					<view class="mode-opt" :class="{ on: viewMode === 'list' }" @click="viewMode = 'list'">排期</view>
					<view class="mode-opt" :class="{ on: viewMode === 'calendar' }" @click="viewMode = 'calendar'">日历</view>
				</view>
			</view>

			<template v-if="viewMode === 'calendar'">
				<!-- 日历模式：月网格打点 + 当日任务 -->
				<launch-calendar :items="filteredList" @pick="onPickDay" />
				<view class="day-head" v-if="dayLaunches.length">
					<text class="day-title">{{ pickedDate }} 的发射（{{ dayLaunches.length }}）</text>
				</view>
				<view class="list" v-if="dayLaunches.length">
					<launch-card
						v-for="item in dayLaunches"
						:key="'cal' + item.id"
						:item="item"
						:fav="favIds.indexOf(item.id) !== -1"
						@select="goDetail"
					/>
				</view>
				<view class="cal-hint" v-if="!dayLaunches.length">
					<text class="cal-hint-text">点有黄点的日期，看当天的发射任务</text>
				</view>
			</template>

			<template v-else>
			<!-- 最近一次发射 + 倒计时。放在列表上方当视觉焦点（只对「待发射」有意义） -->
			<view class="next-wrap" v-if="nextLaunch && visible.length">
				<next-launch :item="nextLaunch" @select="goDetail" />
			</view>

			<view class="stat" v-if="list.length">
				<text class="stat-main">{{ statMain }}</text>
				<text class="stat-sub">{{ statSub }}</text>
			</view>

			<!-- 已生效的筛选：给一行概览，点 × 一键清掉 -->
			<view class="on-filter" v-if="hasFilter">
				<view class="on-filter-tags">
					<text class="on-filter-tag">{{ filterSummary }}</text>
				</view>
				<view class="on-filter-clear" hover-class="on-filter-clear-hover" @click="clearFilter">
					<view class="on-filter-x"></view>
				</view>
			</view>

			<view class="list">
				<launch-card
					v-for="item in visible"
					:key="item.id"
					:item="item"
					:fav="favIds.indexOf(item.id) !== -1"
					:plain="reviewMode"
					@select="goDetail"
				/>
			</view>

			<view class="empty" v-if="list.length === 0">
				<text class="empty-icon">🚀</text>
				<text class="empty-text">暂无发射数据</text>
				<view class="btn" @click="reload">重新获取</view>
			</view>

			<view class="empty" v-else-if="visible.length === 0">
				<text class="empty-icon">🔍</text>
				<text class="empty-text">没有符合筛选条件的发射</text>
				<view class="btn" @click="clearFilter">清除筛选</view>
			</view>

			<view class="foot-hint" v-if="visible.length > 0">
				<text v-if="loadingMore">正在加载后续排期…</text>
				<text v-else-if="loadError">{{ loadError }}，上拉重试</text>
				<text v-else-if="hasMore">上拉加载更多</text>
				<text v-else-if="feed === 'previous' && index && index.total > list.length">已显示全部 {{ list.length }} 条</text>
				<text v-else>已显示全部 {{ list.length }} 条</text>
			</view>
			</template>
			</view>
		</block>

		<!-- 审核态：整页不放内容，getConfig 回来后直接切到火箭大全页 -->
		<view v-else></view>

		<!-- 右下角悬浮钮：搜索 + 筛选。原来右上角那个小放大镜太难发现，
		     而且和「排期/日历」挤在一行 -->
		<view class="fab" v-if="!reviewMode">
			<view class="fab-item" v-for="a in actions" :key="a.key" v-show="fabOpen" @click="onAction(a.key)">
				<text class="fab-label">{{ a.label }}</text>
				<view class="fab-icon">
					<view v-if="a.key === 'search'" class="fi-search"></view>
					<view v-else class="fi-filter">
						<view class="fi-line fi-line-1"></view>
						<view class="fi-line fi-line-2"></view>
						<view class="fi-line fi-line-3"></view>
					</view>
				</view>
			</view>

			<view class="fab-main" :class="{ open: fabOpen }" hover-class="fab-main-hover" @click="fabOpen = !fabOpen">
				<view class="fab-plus"></view>
			</view>
		</view>

		<filter-sheet
			:visible="sheetVisible"
			:groups="filterGroups"
			:value="filters"
			@close="sheetVisible = false"
			@apply="applyFilters"
			@reset="onResetFilters"
		/>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { isStillUpcoming } from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'
import spaceData from '@/utils/data.js'

const STEP = 12
// 筛选维度：键要跟 filters 对象、filterGroups 的 key 一致
const FILTER_KEYS = ['year', 'agency', 'rocket', 'orbit']
// 每个维度最多给多少个候选值（全量列出来会撑爆抽屉）
const OPT_LIMIT = { year: 30, agency: 24, rocket: 24, orbit: 16 }

/** 轨道取 abbrev，缺了退回全名 */
function orbitOf(x) {
	const o = x.mission && x.mission.orbit
	return (o && (o.abbrev || o.name)) || ''
}

/** 一条发射在某个维度上的取值；空串表示这条在该维度上没有信息 */
function dimValue(x, key) {
	if (key === 'year') return (x.net || '').slice(0, 4)
	if (key === 'agency') return (x.launch_service_provider && x.launch_service_provider.name) || ''
	if (key === 'rocket') return (x.rocket && x.rocket.configuration && x.rocket.configuration.name) || ''
	if (key === 'orbit') return orbitOf(x)
	return ''
}

export default {
	// 两个数据集共用一套分页/收藏/归档逻辑，靠 switchFeed 切换；
	// filter 用来剔掉 LL2 还挂在 upcoming 里的「已发射成功」任务
	mixins: [
		navMixin,
		createListMixin({
			feeds: {
				upcoming: { dataset: 'upcoming', pageSize: STEP, favorite: true, filter: isStillUpcoming },
				previous: { dataset: 'previous', pageSize: STEP, favorite: 'mark', archive: true }
			}
		})
	],

	data() {
		return {
			// 后续排期（第 100 条之后）只在第一次翻到底时拉一回
			loadingMore: false,
			moreDone: false,
			// 审核模式：列表卡片不带大图，观感是排期表而不是图文资讯流
			reviewMode: false,
			// 视图模式：排期列表 / 发射日历
			viewMode: 'list',
			// 日历模式选中的那天：{ dateStr, launches }
			pickedDate: '',
			dayLaunches: [],
			// 右下角悬浮钮
			fabOpen: false,
			sheetVisible: false,
			actions: [
				{ key: 'search', label: '搜索' },
				{ key: 'filter', label: '筛选' }
			],
			// 各维度选中值；'' = 不筛选。两个 feed 共用一套，切 feed 时清空
			filters: { year: '', agency: '', rocket: '', orbit: '' }
		}
	},

	computed: {
		/**
		 * 最近一次（时间上最靠前且还没到）的发射。
		 * 不能直接用 list[0]：收藏置顶会把顺序打乱，
		 * 而且已经过点的任务也可能还留在快照里。
		 * 「已发射」下没有倒计时卡，直接不算。
		 */
		nextLaunch() {
			if (this.feed !== 'upcoming') return null
			const now = Date.now()
			let best = null
			let bestAt = Infinity

			for (const x of this.list) {
				if (!x.net) continue
				const at = new Date(x.net).getTime()
				if (isNaN(at) || at <= now || at >= bestAt) continue
				best = x
				bestAt = at
			}
			return best
		},

		hasFilter() {
			return FILTER_KEYS.some((k) => this.filters[k])
		},

		/**
		 * 筛选后的列表。只过滤已加载的部分，
		 * 归档触底拉下来的新条目自动进入筛选范围。
		 */
		filteredList() {
			if (!this.hasFilter) return this.list
			const f = this.filters
			return this.list.filter((x) => {
				for (const k of FILTER_KEYS) {
					if (f[k] && dimValue(x, k) !== f[k]) return false
				}
				return true
			})
		},

		// 倒计时卡片已经展示了最近这一次，列表里要去掉，否则同一条出现两次
		listForRender() {
			const skip = this.nextLaunch ? this.nextLaunch.id : null
			if (!skip) return this.filteredList
			return this.filteredList.filter((x) => x.id !== skip)
		},

		visible() {
			return this.listForRender.slice(0, this.listNum)
		},

		hasMore() {
			if (this.listNum < this.listForRender.length) return true
			// 归档模式下，COS 上还有没下载的分片也算「还有」
			const idx = this.index
			if (this.archived && idx && idx.pages && this.pageIndex < idx.pages.length) return true
			// 待发射：快照 100 条之外还有一份 upcomingMore
			if (this.feed === 'upcoming' && !this.moreDone) return true
			return false
		},

		statMain() {
			if (this.feed === 'previous') return '已发射 ' + this.total + ' 次'
			return '共 ' + this.total + ' 次发射'
		},

		statSub() {
			// 归档还没跑完时把进度也显示出来，用户知道「更多」是慢慢补的
			const idx = this.index
			if (this.feed === 'previous' && idx && idx.total && !idx.done) {
				return '已归档 ' + idx.archived + ' / ' + idx.total + ' 条'
			}
			if (this.hasFilter) return '筛选出 ' + this.filteredList.length + ' 条'
			return this.freshText
		},

		filterSummary() {
			const parts = []
			for (const k of FILTER_KEYS) {
				if (this.filters[k]) parts.push(this.filters[k])
			}
			return parts.join(' · ')
		},

		/**
		 * 筛选面板的分组数据。
		 *
		 * 候选值从「当前已加载的 list」现算 —— 数据是渐进加载的
		 * （快照 100 条 → 归档分片 → 后续排期），翻得越多选项越全。
		 * 没有这个维度的条目（比如老数据缺轨道）不进候选。
		 */
		filterGroups() {
			const buckets = {}
			for (const k of FILTER_KEYS) buckets[k] = new Map()

			for (const x of this.list) {
				for (const k of FILTER_KEYS) {
					const v = dimValue(x, k)
					if (!v) continue
					buckets[k].set(v, (buckets[k].get(v) || 0) + 1)
				}
			}

			const labels = { year: '年份', agency: '发射机构', rocket: '运载火箭', orbit: '目标轨道' }
			const groups = []

			for (const k of FILTER_KEYS) {
				const entries = [...buckets[k].entries()]
				// 年份按时间倒序（近的在前），其余按出现次数
				if (k === 'year') entries.sort((a, b) => b[0].localeCompare(a[0]))
				else entries.sort((a, b) => b[1] - a[1])

				const options = entries.slice(0, OPT_LIMIT[k] || 20).map(([value, n]) => ({
					value,
					label: value + ' (' + n + ')'
				}))
				if (options.length > 1) groups.push({ key: k, label: labels[k], options })
			}

			return groups
		}
	},

	onLoad() {
		// 审核态：首页不放内容，直接把入口切到火箭大全（tabBar 已隐藏，
		// 审核员看到的就是一个纯粹的火箭参数查询工具）；本机切「展示」后也一样
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (this.reviewMode) {
				// switchTab 偶发失败（页面栈未就绪等）时审核员会停在空首页，
				// 兜底 reLaunch 重试一次
				uni.switchTab({
					url: '/pages/rockets/rockets',
					fail: () => {
						uni.reLaunch({ url: '/pages/rockets/rockets' })
					}
				})
				return
			}
			this.getData()
		})
	},

	// 从详情页收藏回来时把收藏项顶上去（不重新请求数据）
	onShow() {
		syncTabBar(1)
		this.reorder()
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		this.resetPaging()
		// 重新刷新后，后续排期可以再拉一次
		this.moreDone = false
		const tasks = [this.getData(true)]
		if (this.feed === 'previous') {
			this.pageIndex = 0
			this.index = null
			tasks.push(this.prepareArchive(true))
		}
		Promise.all(tasks).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (this.reviewMode) return
		// 日历模式下没有「加载更多」的概念
		if (this.viewMode !== 'list') return

		// 筛选会吃掉一部分原始条目：一次补足一页，避免连点触底没反应
		const before = this.visible.length
		let guard = 0
		while (guard < 20 && this.listNum < this.listForRender.length && this.visible.length < before + STEP) {
			this.loadMore()
			guard++
		}
		if (this.visible.length > before) return

		// 本地见底：已发射去拉归档分片，待发射去拉后续排期
		if (this.feed === 'previous') this.loadMore()
		else this.loadMoreUpcoming()
	},

	methods: {
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		},

		// 点 logo 看版本记录，比藏在设置里更容易被发现
		goVersion() {
			uni.navigateTo({ url: '/pages/version/version' })
		},

		reload() {
			this.moreDone = false
			this.getData(true)
		},

		/**
		 * 切换待发射 / 已发射。
		 *
		 * 两个 feed 的分页现场由 mixin 各自保管，切回来时列表位置不变。
		 * 筛选和日历选中项是「针对某一批数据」的状态，切换时必须清掉，
		 * 否则已发射里选了 2019 年，切回待发射会一条都不剩。
		 */
		setFeed(name) {
			if (name === this.feed) return
			this.fabOpen = false
			this.sheetVisible = false
			this.moreDone = false
			this.resetFilters()
			this.pickedDate = ''
			this.dayLaunches = []
			this.switchFeed(name)
		},

		// 日历选中某天：渲染当天任务
		onPickDay({ dateStr, launches }) {
			this.pickedDate = dateStr
			this.dayLaunches = launches || []
		},

		onAction(key) {
			this.fabOpen = false
			if (key === 'search') {
				uni.navigateTo({ url: '/pages/search/search' })
				return
			}
			this.sheetVisible = true
		},

		applyFilters(next) {
			this.filters = Object.assign({}, this.filters, next)
			this.sheetVisible = false
			// 筛选基线变了，分页从头开始
			this.resetPaging()
		},

		resetFilters() {
			const empty = {}
			for (const k of FILTER_KEYS) empty[k] = ''
			this.filters = empty
			this.resetPaging()
		},

		onResetFilters() {
			this.resetFilters()
			this.sheetVisible = false
		},

		clearFilter() {
			this.resetFilters()
		},

		/**
		 * 加载第 100 条之后的排期。
		 * 这份数据每天更新一次（不是每 15 分钟），所以拉一次就够了，
		 * 用 moreDone 标记避免反复请求。
		 */
		async loadMoreUpcoming() {
			if (this.loadingMore || this.moreDone) return

			this.loadingMore = true
			try {
				const d = await spaceData.load('upcomingMore')
				const raw = (d && d.list) || []
				const added = this.appendMore(raw.filter(isStillUpcoming))
				// 追加成功就把新的一批放出来
				if (added) this.loadMore()
				this.moreDone = true
			} catch (e) {
				console.warn('[index] 加载后续排期失败', e)
			} finally {
				this.loadingMore = false
			}
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
	/* 底部要给悬浮胶囊 tabBar 让位，否则最后一张卡片会被盖住 */
	padding-bottom: 200rpx;
	overflow: hidden;
}

/* 导航行：与胶囊同排，标题靠左（主体样式来自 App.vue 全局 .nav-row）；
   首页 .page 没有横向内边距，这里自己补 */
.nav-row {
	position: relative;
	z-index: 1;
	padding: 0 24rpx;
}

.nav-logo {
	width: 60rpx;
	height: 60rpx;
	border-radius: 50%;
	box-shadow: 0 0 24rpx rgba(56, 189, 248, 0.3);
	flex-shrink: 0;
	margin-right: 16rpx;
}

/* 加载：火箭小动画 + 骨架卡（sk-list 里是 skeleton-card 组件） */
.loading {
	position: relative;
	z-index: 1;
	padding: 40rpx 24rpx;
}

.sk-list {
	margin-top: 20rpx;
}

.rocket-loading {
	position: relative;
	width: 100rpx;
	height: 200rpx;
	margin-bottom: 30rpx;
	display: flex;
	justify-content: center;
}

/* 上下浮动纯 CSS：之前 setInterval 50ms 改一次 data、每次触发 Vue 重渲染，
   关键帧动画走合成器，零 JS 参与 */
.rocket {
	width: 60rpx;
	height: 120rpx;
	z-index: 2;
	animation: rocket-float 1s ease-in-out infinite alternate;
}

@keyframes rocket-float {
	from { transform: translateY(-8px); }
	to { transform: translateY(8px); }
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

/* 错误 / 空态 */
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

.next-wrap {
	margin-bottom: 14rpx;
}

/* ---- 控制行：左「待发射/已发射」，右「排期/日历」 ---- */
.mode-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 18rpx;
}

.feed-seg,
.mode-seg {
	display: inline-flex;
	padding: 4rpx;
	background: #141a26;
	border-radius: 32rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.feed-opt,
.mode-opt {
	padding: 10rpx 30rpx;
	border-radius: 28rpx;
	color: #6b7891;
	font-size: 25rpx;
	white-space: nowrap;
}

.feed-opt.on {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
	font-weight: 600;
}

.mode-opt {
	padding: 10rpx 24rpx;
}

.mode-opt.on {
	background: rgba(255, 255, 255, 0.08);
	color: #cbd5e0;
}

/* ---- 已生效筛选的概览条 ---- */
.on-filter {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 14rpx;
	padding: 12rpx 20rpx;
	background: rgba(56, 189, 248, 0.08);
	border: 1rpx solid rgba(56, 189, 248, 0.22);
	border-radius: 16rpx;
}

.on-filter-tags {
	flex: 1;
	min-width: 0;
}

.on-filter-tag {
	color: #7fb6dc;
	font-size: 24rpx;
	line-height: 1.5;
}

.on-filter-clear {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 48rpx;
	height: 48rpx;
	margin-left: 12rpx;
	flex-shrink: 0;
}

.on-filter-clear-hover {
	opacity: 0.6;
}

.on-filter-x {
	position: relative;
	width: 20rpx;
	height: 20rpx;
}

.on-filter-x::before,
.on-filter-x::after {
	content: '';
	position: absolute;
	left: 0;
	top: 50%;
	width: 100%;
	height: 2rpx;
	background: #7fb6dc;
}

.on-filter-x::before { transform: rotate(45deg); }
.on-filter-x::after { transform: rotate(-45deg); }

/* ---- 日历模式 ---- */
.day-head {
	margin: 20rpx 0 4rpx;
}

.day-title {
	color: #8a97a8;
	font-size: 26rpx;
}

.cal-hint {
	padding: 24rpx 0 60rpx;
	text-align: center;
}

.cal-hint-text {
	color: #3d4a5c;
	font-size: 24rpx;
}

/* ---- 右下角悬浮钮 ---- */
.fab {
	position: fixed;
	right: 32rpx;
	/* 停在悬浮胶囊 tabBar 上方（胶囊 112rpx + 内外边距） */
	bottom: calc(160rpx + env(safe-area-inset-bottom));
	z-index: 60;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
}

.fab-item {
	display: flex;
	align-items: center;
	margin-bottom: 18rpx;
}

.fab-label {
	margin-right: 14rpx;
	padding: 8rpx 18rpx;
	background: rgba(20, 26, 38, 0.92);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	border-radius: 24rpx;
	color: #cbd5e0;
	font-size: 23rpx;
}

.fab-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 84rpx;
	height: 84rpx;
	border-radius: 50%;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.4);
}

.fab-main {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 104rpx;
	height: 104rpx;
	border-radius: 50%;
	background: linear-gradient(135deg, #2f7ff5, #38bdf8);
	box-shadow: 0 10rpx 28rpx rgba(56, 189, 248, 0.35);
	transition: transform 0.24s ease;
}

.fab-main-hover {
	opacity: 0.85;
}

/* + 旋转 45° 就成了 × */
.fab-main.open {
	transform: rotate(45deg);
}

.fab-plus {
	position: relative;
	width: 40rpx;
	height: 40rpx;
}

.fab-plus::before,
.fab-plus::after {
	content: '';
	position: absolute;
	left: 50%;
	top: 50%;
	background: #ffffff;
	border-radius: 2rpx;
}

.fab-plus::before {
	width: 40rpx;
	height: 4rpx;
	margin: -2rpx 0 0 -20rpx;
}

.fab-plus::after {
	width: 4rpx;
	height: 40rpx;
	margin: -20rpx 0 0 -2rpx;
}

/* 搜索：圆 + 45° 手柄 */
.fi-search {
	position: relative;
	width: 26rpx;
	height: 26rpx;
	margin: -4rpx -4rpx 0 0;
	border: 3rpx solid #cbd5e0;
	border-radius: 50%;
}

.fi-search::after {
	content: '';
	position: absolute;
	right: -11rpx;
	bottom: -7rpx;
	width: 12rpx;
	height: 3rpx;
	background: #cbd5e0;
	border-radius: 2rpx;
	transform: rotate(45deg);
}

/* 筛选：三条递减横线 */
.fi-filter {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.fi-line {
	height: 3rpx;
	background: #cbd5e0;
	border-radius: 2rpx;
	margin: 2rpx 0;
}

.fi-line-1 { width: 32rpx; }
.fi-line-2 { width: 22rpx; }
.fi-line-3 { width: 12rpx; }
</style>
