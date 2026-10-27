<template>
	<!-- 事件名不能叫 tap / click：小程序端自定义组件上的 @tap 会被编译成原生
	     bindtap，$emit 出来时不一定能落到父页面的 handler 上，卡片就点不动了 -->
	<view
		class="card"
		:class="{ 'card-fav': fav, 'card-plain': plain }"
		hover-class="card-hover"
		@click="$emit('select', item)"
	>
		<!-- 收藏标记：左侧一道琥珀色竖条，比星标角标更不打扰，但一眼能看出 -->
		<view class="fav-mark" v-if="fav"></view>

		<!-- plain（审核模式）下不渲染缩略图：整列变成纯文字数据行，
		     观感是「排期表」而不是「图文资讯流」 -->
		<image
			v-if="!plain && item.image"
			class="thumb"
			:src="item.image"
			mode="aspectFill"
			lazy-load
		></image>
		<view v-else-if="!plain" class="thumb thumb-empty">
			<text class="thumb-icon">🚀</text>
		</view>

		<view class="info">
			<text class="title">{{ title }}</text>

			<view class="meta">
				<text class="time">{{ timeText }}</text>
				<!-- 老（>30 天）任务 timeText 会回退成带年份的完整时间，
				     与 dateText 相同时不重复展示 -->
				<text class="dot" v-if="showDate">·</text>
				<text class="date" v-if="showDate">{{ dateText }}</text>
			</view>

			<!-- 火箭名已经拼在 title 里（「猎鹰 9 号 Block 5 | 星链15-18」），
			     这里不再重复一行 -->

			<!-- 机构与状态同一行：机构靠左可省略，状态靠右永不换行 -->
			<view class="foot">
				<text class="flag" v-if="providerFlag">{{ providerFlag }}</text>
				<text class="provider" v-if="providerName">{{ providerName }}</text>
				<text class="status" :class="status.cls">{{ status.text }}</text>
			</view>
		</view>
	</view>
</template>

<script>
import { relativeTime, formatShort, statusInfo, launchTitle, rocketName, agencyLabel, countryFlag } from '@/utils/format.js'

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
	},
	// 纯文字模式（审核模式）：不带缩略图，列表更像数据排期表
	plain: {
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
		showDate() {
			const d = this.dateText
			// 时间待定 / 与 timeText 重复时不再显示第二份
			return Boolean(d) && d !== '时间待定' && d !== this.timeText
		},
		rocketName() {
			return rocketName(this.item.rocket && this.item.rocket.configuration)
		},
		providerName() {
			// 机构统一走 agencyLabel：命中中文表就用中文（中国航天科技 / 蓝箭航天…）
			const n = (this.item.launch_service_provider && this.item.launch_service_provider.name) || ''
			return agencyLabel(n)
		},
		// 国旗必须用英文原名去认，中文名里没有国籍信息
		providerFlag() {
			return countryFlag(this.item.launch_service_provider && this.item.launch_service_provider.name)
		},
		status() {
			return statusInfo(this.item.status, this.item.net)
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

/* 纯文字模式：没有缩略图，文字区占满整行 */
.card-plain .info {
	margin-left: 0;
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

/* 型号和机构都去掉胶囊底色，改成左对齐的纯文字，
   比一排小方块干净，也不会因为背景色块把版面切碎 */
.rocket {
	display: block;
	/* .info 是 column flex，这一行不加 align-self 就按内容宽度收缩，
	   实测只剩 30px —— 末尾的 ellipsis 把「长征八号甲」截成「长…」。
	   width:100% 在 flex item 上不足以撑开，必须显式 stretch */
	align-self: stretch;
	width: 100%;
	margin-top: 10rpx;
	color: #7bb8e0;
	font-size: 23rpx;
	line-height: 1.4;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.foot {
	/* auto 让它贴到卡片底部，标题只有一行时也不会浮在中间 */
	margin-top: auto;
	padding-top: 8rpx;
	display: flex;
	align-items: center;
}

/* 国旗：不参与收缩，机构名太长时由 provider 自己出省略号 */
.flag {
	flex-shrink: 0;
	margin-right: 8rpx;
	font-size: 22rpx;
	line-height: 1.4;
}

.provider {
	flex: 1;
	/* min-width: 0 是关键：不加这句 flex 子项不会收缩，省略号永远不出来 */
	min-width: 0;
	margin-right: 14rpx;
	color: #5d6a7d;
	font-size: 22rpx;
	line-height: 1.4;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.status {
	flex-shrink: 0;
	white-space: nowrap;
	/* 没有机构时也靠右 */
	margin-left: auto;
	font-size: 21rpx;
	padding: 3rpx 12rpx;
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
