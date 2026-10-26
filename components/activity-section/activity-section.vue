<template>
	<view class="acts">
		<view class="acts-head">
			<text class="acts-title">近期活动</text>
			<view class="acts-more" hover-class="acts-more-hover" @click="goAll">
				<text>全部</text>
				<text class="acts-arrow">›</text>
			</view>
		</view>

		<view class="acts-list">
			<view class="card" v-for="item in items" :key="item.id" hover-class="card-hover" @click="goAll">
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
					<view class="tags" v-if="item.location">
						<text class="tag">{{ item.location }}</text>
					</view>
					<text class="desc" v-if="descOf(item)">{{ descOf(item) }}</text>
				</view>
			</view>
		</view>

		<view class="acts-foot" v-if="items.length" hover-class="acts-foot-hover" @click="goAll">
			<text>查看全部活动</text>
			<text class="acts-arrow">›</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { formatShort, truncate } from '@/utils/format.js'

/**
 * 首页底部的「近期活动」板块。
 *
 * 活动原本是单独一个 tab 页（pages/event/event），v3.1.17 起把入口搬回首页底部，
 * 这里只做「预览」：取前 4 条 + 一个「查看全部活动」跳到完整活动页。
 * 完整列表仍留在 event 页，避免首页出现第二套分页体系。
 */
export default {
	data() {
		return {
			items: []
		}
	},

	created() {
		this.load()
	},

	methods: {
		formatShort,

		async load() {
			try {
				const d = await spaceData.load('events')
				this.items = (d && d.list || []).slice(0, 4)
			} catch (e) {
				console.warn('[activity-section] 加载活动失败', e)
			}
		},

		descOf(item) {
			return truncate(item.descriptionZh || item.description, 50)
		},

		goAll() {
			uni.navigateTo({ url: '/pages/event/event' })
		}
	}
}
</script>

<style lang="scss" scoped>
.acts {
	margin-top: 44rpx;
}

.acts-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.acts-title {
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.acts-more {
	display: flex;
	align-items: center;
	color: #6b7891;
	font-size: 24rpx;
}

.acts-arrow {
	font-size: 30rpx;
	margin-left: 4rpx;
}

.card {
	margin-bottom: 24rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	overflow: hidden;
}

.card-hover {
	opacity: 0.85;
}

.cover {
	display: block;
	width: 100%;
	height: 260rpx;
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
	padding: 22rpx 28rpx 26rpx;
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
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.4;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 12rpx;
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

.desc {
	display: block;
	margin-top: 14rpx;
	color: #8a97a8;
	font-size: 26rpx;
	line-height: 1.6;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.acts-foot {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 76rpx;
	margin-top: 4rpx;
	color: #7fb6dc;
	font-size: 26rpx;
	background: rgba(56, 189, 248, 0.08);
	border: 1rpx solid rgba(56, 189, 248, 0.18);
	border-radius: 16rpx;
}

.acts-foot-hover {
	background: rgba(56, 189, 248, 0.14);
}
</style>
