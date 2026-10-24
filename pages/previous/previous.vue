<template>
	<view class="page">
		<star-field />
		<block v-if="!reviewMode">
		<view class="stat" v-if="total" :style="{ paddingTop: statusBarH + 10 + 'px' }">
			<text class="stat-main">已发射 {{ total }} 次</text>
			<text class="stat-sub">{{ progressText }}</text>
		</view>

		<!-- 筛选维度行：机构 / 火箭 / 轨道 / 年份 -->
		<view class="filter-block" v-if="!reviewMode">
			<scroll-view class="dim-scroll" scroll-x :show-scrollbar="false">
				<view class="dim-inner">
					<view
						class="chip"
						v-for="d in dims"
						:key="d.value"
						:class="{ on: dim === d.value && filters[d.value] }"
						@click="setDim(d.value)"
					>
						{{ d.label }}
					</view>
				</view>
			</scroll-view>

			<!-- 该维度下的候选值：来自已加载条目，横向滚动 -->
			<scroll-view class="dim-scroll dim-scroll-sm" scroll-x :show-scrollbar="false" v-if="dim">
				<view class="dim-inner">
					<view
						class="chip chip-sm"
						:class="{ on: !filters[dim] }"
						@click="setValue('')"
					>
						全部
					</view>
					<view
						class="chip chip-sm"
						v-for="v in valueOptions"
						:key="v.value"
						:class="{ on: filters[dim] === v.value }"
						@click="setValue(v.value)"
					>
						{{ v.label }}
					</view>
				</view>
			</scroll-view>
		</view>

		<view class="list" v-if="visible.length">
			<launch-card
				v-for="item in visible"
				:key="item.id"
				:item="item"
				:fav="favIds.indexOf(item.id) !== -1"
				@select="goDetail"
			/>
		</view>

		<view class="loading" v-if="loading && visible.length === 0">
			<skeleton-card v-for="i in 4" :key="i" />
		</view>

		<view class="empty" v-else-if="!loading && visible.length === 0">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">暂无历史发射数据</text>
		</view>

		<view class="foot-hint" v-if="visible.length > 0">
			<text v-if="loadingMore">正在加载更早的发射…</text>
			<text v-else-if="loadError">{{ loadError }}，上拉重试</text>
			<text v-else-if="hasMore">上拉加载更多</text>
			<text v-else-if="hasFilter">筛选结果 {{ filteredList.length }} 条（数据仍在继续加载）</text>
			<text v-else>已显示全部 {{ list.length }} 条</text>
		</view>
		</block>

		<!-- 审核模式：tabBar 已隐藏，本页正常情况到不了，留空态兜底 -->
		<view class="empty" v-else>
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">敬请期待</text>
		</view>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'

const STEP = 12

/** 轨道取 abbrev，缺了退回全名 */
function orbitOf(x) {
	const o = x.mission && x.mission.orbit
	return (o && (o.abbrev || o.name)) || ''
}

export default {
	// 数据获取 / 本地分页 / 收藏标记 / 归档分片全部来自 mixin；
	// favorite 用 'mark'：历史页只标记不置顶，置顶会打乱时间序（首页才置顶）
	mixins: [
		navMixin,
		createListMixin({ dataset: 'previous', pageSize: STEP, favorite: 'mark', archive: true })
	],

	data() {
		return {
			// 审核模式：整页只显示空态
			reviewMode: false,
			// ---- 筛选（纯前端过滤已加载数据，归档触底加载继续沿用）----
			// 当前展开候选值的维度；'' = 收起
			dim: '',
			// 各维度选中值；'' = 不筛选
			filters: { agency: '', rocket: '', orbit: '', year: '' }
		}
	},

	computed: {
		dims() {
			return [
				{ label: '机构', value: 'agency' },
				{ label: '火箭', value: 'rocket' },
				{ label: '轨道', value: 'orbit' },
				{ label: '年份', value: 'year' }
			]
		},

		hasFilter() {
			return Object.keys(this.filters).some((k) => this.filters[k])
		},

		/**
		 * 筛选后的列表。只过滤已加载的 this.list，
		 * 归档触底拉下来的新条目自动进入筛选范围。
		 */
		filteredList() {
			const f = this.filters
			if (!this.hasFilter) return this.list
			return this.list.filter((x) => {
				if (f.agency && ((x.launch_service_provider && x.launch_service_provider.name) || '') !== f.agency) return false
				if (f.rocket && ((x.rocket && x.rocket.configuration && x.rocket.configuration.name) || '') !== f.rocket) return false
				if (f.orbit && orbitOf(x) !== f.orbit) return false
				if (f.year && (x.net || '').slice(0, 4) !== f.year) return false
				return true
			})
		},

		// 覆盖 mixin 的 visible/hasMore：分页基线换成筛选后的列表
		visible() {
			return this.filteredList.slice(0, this.listNum)
		},

		hasMore() {
			// 本地筛选结果没放完，或 COS 上还有没下载的归档分片
			const idx = this.index
			const hasArchivePage = !!(idx && idx.pages && this.pageIndex < idx.pages.length)
			return this.listNum < this.filteredList.length || hasArchivePage
		},

		/**
		 * 当前维度的候选值：按出现次数取前 24 个。
		 * 数据是渐进加载的（快照 100 条 → 归档分片），
		 * 候选值只覆盖已加载部分，翻得越多选项越全。
		 */
		valueOptions() {
			if (!this.dim) return []
			const counter = new Map()
			for (const x of this.list) {
				let v = ''
				if (this.dim === 'agency') v = (x.launch_service_provider && x.launch_service_provider.name) || ''
				else if (this.dim === 'rocket') v = (x.rocket && x.rocket.configuration && x.rocket.configuration.name) || ''
				else if (this.dim === 'orbit') v = orbitOf(x)
				else if (this.dim === 'year') v = (x.net || '').slice(0, 4)
				if (!v) continue
				counter.set(v, (counter.get(v) || 0) + 1)
			}
			return [...counter.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 24)
				.map(([value, n]) => ({ value, label: value + ' (' + n + ')' }))
		},

		progressText() {
			const idx = this.index
			if (!idx || !idx.total) return this.freshText
			// 归档还没跑完时把进度也显示出来，用户知道「更多」是慢慢补的
			if (!idx.done) {
				return '已归档 ' + idx.archived + ' / ' + idx.total + ' 条'
			}
			return this.freshText
		}
	},

	onLoad() {
		// 审核态不拉任何数据，页面只剩空态
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (!this.reviewMode) {
				this.getData()
				this.prepareArchive()
			}
		})
	},

	onShow() {
		syncTabBar(1)
		// 从详情页收藏/取消收藏返回时，列表的琥珀色标记要跟着变
		this.reorder()
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		this.resetPaging()
		this.pageIndex = 0
		this.index = null
		Promise.all([this.getData(true), this.prepareArchive(true)]).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (this.reviewMode) return
		// 筛选会吃掉一部分原始条目：本地一次性补足 12 条可见，避免连点触底没反应
		const before = this.visible.length
		let guard = 0
		while (guard < 20 && this.listNum < this.list.length && this.visible.length < before + STEP) {
			this.loadMore()
			guard++
		}
		// 本地见底还不够，交给归档分片
		if (this.visible.length < before + STEP) this.loadMore()
	},

	methods: {
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		},

		// 切维度 = 打开该维度的候选值行（再点一次收起）
		setDim(v) {
			this.dim = this.dim === v ? '' : v
		},

		setValue(v) {
			if (!this.dim) return
			this.filters = Object.assign({}, this.filters, { [this.dim]: v })
			// 筛选基线变了，分页从头开始
			this.resetPaging()
		}
	}
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	/* 顶部留白由 .stat 的 statusBarH 动态给 */
	padding: 0 24rpx 200rpx;
	box-sizing: border-box;
}

/* ---- 筛选 ---- */
.filter-block {
	margin-bottom: 8rpx;
}

.dim-scroll {
	width: 100%;
	height: 68rpx;
	margin-bottom: 14rpx;
	white-space: nowrap;
}

.dim-scroll-sm {
	height: 60rpx;
}

.dim-inner {
	display: flex;
	align-items: center;
	padding-bottom: 4rpx;
}

.chip {
	flex-shrink: 0;
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

.chip-sm {
	padding: 8rpx 20rpx;
	font-size: 23rpx;
}
</style>
