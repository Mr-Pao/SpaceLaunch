<template>
	<view class="page">
		<block v-if="!reviewMode">
		<view class="stat" v-if="total" :style="{ paddingTop: statusBarH + 10 + 'px' }">
			<text class="stat-main">已发射 {{ total }} 次</text>
			<text class="stat-sub">{{ progressText }}</text>
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
			reviewMode: false
		}
	},

	computed: {
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
		this.loadMore()
	},

	methods: {
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
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
	background: #0a0e17;
	box-sizing: border-box;
}
</style>
