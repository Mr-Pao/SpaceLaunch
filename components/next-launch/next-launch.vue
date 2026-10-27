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
			<text class="nl-title">{{ title }}</text>

			<view class="nl-meta" v-if="provider || padName">
				<image class="nl-flag" v-if="providerFlag" :src="providerFlag" mode="aspectFit"></image>
				<text class="nl-meta-text">{{ metaText }}</text>
			</view>

			<view class="nl-cd">
				<countdown :net="item.net" size="lg" />
			</view>

			<view class="nl-foot">
				<text class="nl-time">{{ timeText }}</text>
				<!-- 出口放在卡内右下角：整卡点击也是看详情，「查看详情」只是把去处写明白。
				     发射页不需要「更多发射」（那页本来就是全部），所以用 more 开关 -->
				<view class="nl-acts">
					<text class="nl-more">查看详情 ›</text>
					<text v-if="more" class="nl-more" @click.stop="$emit('more')">更多发射 ›</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { formatDateTime, statusInfo, launchTitle, agencyLabel, placeZh, flagSrc } from '@/utils/format.js'

export default {
	name: 'next-launch',

	props: {
		item: { type: Object, required: true },
		// 底部右下角是否多给一个「更多发射」（今日页只放一条，需要换页看全部）
		more: { type: Boolean, default: false }
	},

	computed: {
		title() {
			return launchTitle(this.item)
		},
		status() {
			return statusInfo(this.item.status, this.item.net)
		},
		provider() {
			const n = (this.item.launch_service_provider && this.item.launch_service_provider.name) || ''
			// 机构优先中文（中国航天科技 / 蓝箭航天…），没词条回原文
			return agencyLabel(n)
		},
		padName() {
			const loc = this.item.pad && this.item.pad.location && this.item.pad.location.name
			// 场地也中文化：Vandenberg SFB, CA, USA → 范登堡
			return placeZh(loc) || (this.item.pad && this.item.pad.name) || ''
		},
		// 国旗用英文原名认；接在机构前面，仍用「·」和场地分开
		providerFlag() {
			return flagSrc(this.item.launch_service_provider && this.item.launch_service_provider.name)
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

.nl-flag {
	flex-shrink: 0;
	width: 34rpx;
	height: 24rpx;
	margin-right: 10rpx;
	border-radius: 3rpx;
}

.nl-meta {
	/* 国旗和机构名必须同一行：这一行原来是纯文字块，
	   加了图片后不改 flex 会让国旗独占一行 */
	display: flex;
	align-items: center;
	margin-top: 10rpx;
}

.nl-meta-text {
	flex: 1;
	min-width: 0;
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

.nl-acts {
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

.nl-time {
	color: #4a5568;
	font-size: 23rpx;
	/* 时间可能到分钟，别把两个出口挤掉 */
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.nl-more {
	color: #38bdf8;
	font-size: 25rpx;
}

/* 两个出口之间留一口气，紧贴着会看起来像一个词 */
.nl-more + .nl-more {
	margin-left: 22rpx;
}
</style>
