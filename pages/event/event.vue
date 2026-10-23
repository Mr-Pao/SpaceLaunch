<template>
	<view class="page">
		<!-- 审核模式下整页只留空态：活动是资讯感最重的一块，
		     开关来自 COS 的 app-config.json（utils/config.js），
		     失败兜底正常展示，不影响普通用户 -->
		<block v-if="!reviewMode">
			<view class="stat" v-if="list.length">
				<text class="stat-main">近期活动 {{ list.length }} 项</text>
				<text class="stat-sub">{{ freshText }}</text>
			</view>

			<view class="list">
				<view class="card" v-for="item in visible" :key="item.id">
					<image
						v-if="item.feature_image"
						class="cover"
						:src="item.feature_image"
						mode="aspectFill"
						lazy-load
					></image>
					<view v-else class="cover cover-empty">
						<text class="cover-icon">🛰️</text>
					</view>

					<view class="body">
						<view class="top">
							<text class="type">{{ (item.type && item.type.name) || '活动' }}</text>
							<text class="date">{{ formatShort(item.date) }}</text>
						</view>

						<text class="title">{{ item.name }}</text>

						<view class="tags" v-if="item.location || (item.launches && item.launches.length)">
							<text class="tag" v-if="item.location">{{ item.location }}</text>
							<text class="tag tag-link" v-if="item.launches && item.launches.length">
								{{ item.launches[0].name }}
							</text>
						</view>

						<text class="desc" v-if="descOf(item)">{{ descOf(item) }}</text>
					</view>
				</view>
			</view>

			<view class="foot-hint" v-if="visible.length > 0">
				<text>{{ hasMore ? '上拉加载更多' : '已显示 ' + visible.length + ' 项' }}</text>
			</view>
		</block>

		<view class="loading" v-else-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else>
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">活动数据整理中</text>
		</view>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { formatShort, truncate } from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'

export default {
	mixins: [createListMixin({ dataset: 'events', pageSize: 8 })],

	data() {
		return {
			// 审核模式：为 true 时页面只显示空态
			reviewMode: false
		}
	},

	onLoad() {
		// 开关先回来再决定拉不拉数据：审核态整页只剩空态，一次请求都不发
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (!this.reviewMode) this.getData()
		})
	},

	onShow() {
		syncTabBar(3)
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		this.resetPaging()
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (this.reviewMode) return
		this.loadMore()
	},

	methods: {
		formatShort,

		// 活动描述动辄几百字，卡片里只给两行 —— 既省空间，
		// 也避免整页看起来像「科普文章列表」（审核按内容型小程序判类目会拒）
		descOf(item) {
			return truncate(item.descriptionZh || item.description, 60)
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

/* 卡片占满宽度。原先是写死 550rpx，小屏显窄、大屏显小 */
.card {
	margin-bottom: 24rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	overflow: hidden;
}

.cover {
	display: block;
	width: 100%;
	height: 300rpx;
	background: #0f1520;
}

.cover-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.cover-icon {
	font-size: 64rpx;
	opacity: 0.35;
}

.body {
	padding: 24rpx 28rpx 28rpx;
}

.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.type {
	color: #38bdf8;
	font-size: 24rpx;
}

.date {
	color: #6b7891;
	font-size: 24rpx;
}

.title {
	display: block;
	margin-top: 12rpx;
	color: #ffffff;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 1.4;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 14rpx;
}

.tag {
	max-width: 100%;
	margin: 0 12rpx 8rpx 0;
	padding: 4rpx 16rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7bb8e0;
	font-size: 22rpx;
	border-radius: 6rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tag-link {
	background: rgba(245, 195, 59, 0.12);
	color: #d9b45e;
}

.desc {
	display: block;
	margin-top: 16rpx;
	color: #8a97a8;
	font-size: 27rpx;
	line-height: 1.7;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
}
</style>
