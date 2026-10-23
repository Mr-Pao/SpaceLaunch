<template>
	<view class="card" hover-class="card-hover" @click="$emit('tap', item)">
		<!-- lazy-load：列表滚动到可视区才真正下载图片，50 条卡片一次性触发下载会很卡 -->
		<image
			v-if="item.image"
			class="thumb"
			:src="item.image"
			mode="aspectFill"
			lazy-load
		></image>
		<view v-else class="thumb thumb-empty">
			<text class="thumb-icon">🚀</text>
		</view>

		<view class="info">
			<text class="title">{{ item.name }}</text>

			<view class="meta">
				<text class="time">{{ timeText }}</text>
				<text class="dot">·</text>
				<text class="date">{{ dateText }}</text>
			</view>

			<view class="tags">
				<text class="tag" v-if="rocketName">{{ rocketName }}</text>
				<text class="tag tag-provider" v-if="providerName">{{ providerName }}</text>
			</view>

			<view class="foot">
				<text class="status" :class="status.cls">{{ status.text }}</text>
			</view>
		</view>
	</view>
</template>

<script>
import { relativeTime, formatShort, statusInfo } from '@/utils/format.js'

export default {
	name: 'launch-card',
	props: {
		item: {
			type: Object,
			required: true
		}
	},
	emits: ['tap'],
	computed: {
		timeText() {
			// 历史发射看「多久前」、未来发射看「多久后」，同一个函数两种语境都对
			return relativeTime(this.item.net)
		},
		dateText() {
			return formatShort(this.item.net)
		},
		rocketName() {
			const c = this.item.rocket && this.item.rocket.configuration
			return (c && (c.name || c.full_name)) || ''
		},
		providerName() {
			return (this.item.launch_service_provider && this.item.launch_service_provider.name) || ''
		},
		status() {
			return statusInfo(this.item.status)
		}
	}
}
</script>

<style lang="scss" scoped>
.card {
	display: flex;
	width: 100%;
	box-sizing: border-box;
	padding: 20rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-hover {
	background: #1a2231;
}

.thumb {
	width: 200rpx;
	height: 200rpx;
	flex-shrink: 0;
	border-radius: 14rpx;
	background: #0f1520;
}

.thumb-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.thumb-icon {
	font-size: 56rpx;
	opacity: 0.35;
}

.info {
	flex: 1;
	margin-left: 22rpx;
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.title {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.4;
	/* 两行截断，标题很长时不会把卡片撑变形 */
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.meta {
	margin-top: 10rpx;
	display: flex;
	align-items: center;
}

.time {
	color: #38bdf8;
	font-size: 26rpx;
}

.dot {
	color: #3d4a5c;
	margin: 0 10rpx;
	font-size: 22rpx;
}

.date {
	color: #6b7891;
	font-size: 24rpx;
}

.tags {
	margin-top: 12rpx;
	display: flex;
	flex-wrap: nowrap;
	overflow: hidden;
}

.tag {
	max-width: 100%;
	padding: 4rpx 14rpx;
	margin-right: 10rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7bb8e0;
	font-size: 22rpx;
	border-radius: 6rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tag-provider {
	background: rgba(255, 255, 255, 0.06);
	color: #8a97a8;
}

.foot {
	margin-top: auto;
	display: flex;
	justify-content: flex-end;
}

.status {
	font-size: 22rpx;
	padding: 4rpx 14rpx;
	border-radius: 6rpx;
}

.status.go {
	background: rgba(56, 189, 248, 0.15);
	color: #38bdf8;
}

.status.pending {
	background: rgba(255, 255, 255, 0.06);
	color: #8a97a8;
}

.status.success {
	background: rgba(52, 199, 89, 0.14);
	color: #34c759;
}

.status.failure {
	background: rgba(255, 59, 48, 0.14);
	color: #ff3b30;
}

.status.flying {
	background: rgba(245, 195, 59, 0.14);
	color: #f5c33b;
}

.status.normal {
	background: rgba(255, 255, 255, 0.06);
	color: #8a97a8;
}
</style>
