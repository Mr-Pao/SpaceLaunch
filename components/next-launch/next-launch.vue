<template>
	<view class="nl" hover-class="nl-hover" @click="$emit('select', item)">
		<!-- 图片在上、信息在下：参考站是桌面横排，手机上横排会挤成一团 -->
		<view class="nl-hero">
			<image v-if="item.image" class="nl-img" :src="item.image" mode="aspectFill" lazy-load></image>
			<view v-else class="nl-img nl-img-empty">
				<text class="nl-img-icon">🚀</text>
			</view>
			<view class="nl-mask"></view>

			<view class="nl-badge" :class="status.cls">{{ status.text }}</view>
		</view>

		<view class="nl-body">
			<text class="nl-title">{{ item.name }}</text>

			<view class="nl-meta" v-if="provider || padName">
				<text class="nl-meta-text">{{ metaText }}</text>
			</view>

			<view class="nl-cd">
				<countdown :net="item.net" size="lg" />
			</view>

			<view class="nl-foot">
				<text class="nl-time">{{ timeText }}</text>
				<text class="nl-more">查看详情 ›</text>
			</view>
		</view>
	</view>
</template>

<script>
import { formatDateTime, statusInfo } from '@/utils/format.js'

export default {
	name: 'next-launch',

	props: {
		item: { type: Object, required: true }
	},

	computed: {
		status() {
			return statusInfo(this.item.status)
		},
		provider() {
			return (this.item.launch_service_provider && this.item.launch_service_provider.name) || ''
		},
		padName() {
			const loc = this.item.pad && this.item.pad.location && this.item.pad.location.name
			return loc || (this.item.pad && this.item.pad.name) || ''
		},
		metaText() {
			return [this.provider, this.padName].filter(Boolean).join(' · ')
		},
		timeText() {
			const abs = formatDateTime(this.item.net)
			return abs ? '发射时间 ' + abs : '发射时间待定'
		}
	}
}
</script>

<style lang="scss" scoped>
.nl {
	background: #141a26;
	border-radius: 24rpx;
	border: 1rpx solid rgba(56, 189, 248, 0.14);
	overflow: hidden;
}

.nl-hover {
	opacity: 0.92;
}

/* 头图 */
.nl-hero {
	position: relative;
	width: 100%;
	height: 300rpx;
}

.nl-img {
	width: 100%;
	height: 100%;
	display: block;
}

.nl-img-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.nl-img-icon {
	font-size: 90rpx;
	opacity: 0.4;
}

/* 底部渐隐，让状态徽章和信息区过渡自然 */
.nl-mask {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 140rpx;
	background: linear-gradient(to bottom, rgba(20, 26, 38, 0) 0%, #141a26 100%);
}

.nl-badge {
	position: absolute;
	left: 24rpx;
	top: 24rpx;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	font-size: 22rpx;
	backdrop-filter: blur(8rpx);
}

.nl-badge.pending {
	background: rgba(56, 189, 248, 0.9);
	color: #04121f;
}

.nl-badge.success {
	background: rgba(52, 199, 89, 0.92);
	color: #04121f;
}

.nl-badge.failure {
	background: rgba(255, 59, 48, 0.92);
	color: #ffffff;
}

.nl-badge.flying {
	background: rgba(245, 195, 59, 0.92);
	color: #241a00;
}

.nl-badge.normal {
	background: rgba(255, 255, 255, 0.85);
	color: #141a26;
}

/* 信息区 */
.nl-body {
	padding: 4rpx 28rpx 26rpx;
}

.nl-title {
	display: block;
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	line-height: 1.4;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.nl-meta {
	margin-top: 10rpx;
}

.nl-meta-text {
	color: #6b7891;
	font-size: 24rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.nl-cd {
	margin-top: 26rpx;
}

.nl-foot {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 22rpx;
	padding-top: 20rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.nl-time {
	color: #4a5568;
	font-size: 23rpx;
}

.nl-more {
	color: #38bdf8;
	font-size: 25rpx;
}
</style>
