<template>
	<!-- 事件名不能叫 tap / click：小程序端自定义组件上的 @tap 会被编译成原生
	     bindtap，$emit 出来时不一定能落到父页面的 handler 上，卡片就点不动了 -->
	<view
		class="card"
		:class="{ 'card-fav': fav }"
		hover-class="card-hover"
		@click="$emit('select', item)"
	>
		<!-- 收藏标记：左侧一道琥珀色竖条，比星标角标更不打扰，但一眼能看出 -->
		<view class="fav-mark" v-if="fav"></view>

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
			<text class="title">{{ title }}</text>

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
import { relativeTime, formatShort, statusInfo, launchTitle, rocketName } from '@/utils/format.js'

export default {
	name: 'launch-card',
	props: {
		item: {
			type: Object,
			required: true
		},
		// 是否已收藏，只影响视觉标记
		fav: {
			type: Boolean,
			default: false
		}
	},
	emits: ['select'],
	computed: {
		// 「长征四号乙 | 未知载荷」这种组合，任务名没翻出来时回退原始英文串
		title() {
			return launchTitle(this.item)
		},
		timeText() {
			// 历史发射看「多久前」、未来发射看「多久后」，同一个函数两种语境都对
			return relativeTime(this.item.net)
		},
		dateText() {
			return formatShort(this.item.net)
		},
		rocketName() {
			return rocketName(this.item.rocket && this.item.rocket.configuration)
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
	/* 卡片间距放在组件自己身上，父页面就不用写 `.list > *` 这种
	   scoped 编译后会变成非法选择器的写法 */
	margin-bottom: 20rpx;
	padding: 20rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	/* 收藏竖条要跟着圆角裁切 */
	position: relative;
	overflow: hidden;
}

.card-fav {
	border-color: rgba(245, 195, 59, 0.28);
}

.fav-mark {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	width: 6rpx;
	background: linear-gradient(to bottom, #f5c33b, #d99e1f);
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

/* 型号和机构分两行：挤在一行时两个都会被截成「长…」「China Aerospace…」，
   什么都看不出来。竖排后各自按内容宽度，超长才截断 */
.tags {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	margin-top: 12rpx;
}

.tag {
	max-width: 100%;
	margin-bottom: 8rpx;
	padding: 4rpx 14rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7bb8e0;
	font-size: 22rpx;
	border-radius: 6rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tag:last-child {
	margin-bottom: 0;
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
