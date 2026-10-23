<template>
	<view class="page">
		<view class="stat" v-if="total">
			<text class="stat-main">已发射 {{ total }} 次</text>
			<text class="stat-sub">{{ freshText }}</text>
		</view>

		<view class="list">
			<launch-card
				v-for="item in visible"
				:key="item.id"
				:item="item"
				:fav="favIds.indexOf(item.id) !== -1"
				@select="goDetail"
			/>
		</view>

		<view class="loading" v-if="loading && visible.length === 0">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!loading && visible.length === 0">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">暂无历史发射数据</text>
		</view>

		<view class="foot-hint" v-if="visible.length > 0">
			<text>{{ hasMore ? '上拉加载更多' : '已显示 ' + visible.length + ' 条' }}</text>
		</view>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'
import { syncTabBar } from '@/utils/tabbar.js'

export default {
	mixins: [createListMixin({ dataset: 'previous', pageSize: 12, favorite: true })],

	onLoad() {
		// 快照来自 /launches/previous/，本身已按 net 倒序，不需要再排序
		this.getData()
	},

	onShow() {
		syncTabBar(1)
		this.reorder()
	},

	onPullDownRefresh() {
		this.resetPaging()
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
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
	padding: 20rpx 24rpx 200rpx;
	background: #0a0e17;
	box-sizing: border-box;
}
</style>
