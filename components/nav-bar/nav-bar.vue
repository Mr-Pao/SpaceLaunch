<template>
	<view>
		<view class="nav" :class="{ solid: solid }" :style="{ paddingTop: statusBar + 'px' }">
			<view class="nav-inner">
				<view class="nav-back" @click="back">
					<text class="nav-arrow">‹</text>
				</view>

				<text class="nav-title" v-if="title && solid">{{ title }}</text>
			</view>
		</view>
		<!-- fixed 导航不占文档流：需要占位的页面（内容从头开始的普通页）打开此项 -->
		<view v-if="placeholder" class="nav-placeholder" :style="{ height: statusBar + 44 + 'px' }"></view>
	</view>
</template>

<script>
/**
 * 沉浸式页面的自定义导航栏
 *
 * 页面在 pages.json 里设了 navigationStyle: custom，就没有原生导航栏了，
 * 返回按钮得自己画 —— 当年就是因为「custom + 没有返回按钮」导致详情页进得去出不来。
 *
 * statusBar 高度各机型不一样（刘海屏 44 / 普通 20），必须动态取，
 * 写死会在某类机型上顶到状态栏里。
 */
export default {
	name: 'nav-bar',

	props: {
		title: { type: String, default: '' },
		// 页面向下滚动后切成实色，避免图片上的文字看不清
		solid: { type: Boolean, default: false },
		// 渲染一段等高占位，内容页不用再自己算 padding
		placeholder: { type: Boolean, default: false }
	},

	data() {
		return {
			statusBar: 20
		}
	},

	created() {
		try {
			const info = uni.getSystemInfoSync()
			this.statusBar = info.statusBarHeight || 20
		} catch (e) {
			// 取不到就用 20，绝大多数机型在这个值附近
		}
	},

	methods: {
		back() {
			const pages = getCurrentPages()
			if (pages.length > 1) {
				uni.navigateBack()
			} else {
				// 从分享卡片 / 朋友圈单页模式直接进来的，栈里只有自己
				uni.switchTab({ url: '/pages/index/index' })
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.nav {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	z-index: 100;
	background: transparent;
	transition: background 0.2s ease;
}

.nav.solid {
	background: rgba(10, 14, 23, 0.96);
	border-bottom: 1rpx solid rgba(255, 255, 255, 0.05);
}

.nav-inner {
	position: relative;
	display: flex;
	align-items: center;
	/* 固定 px 而不是 88rpx：占位高度按 44px 算，宽屏上两者必须一致 */
	height: 44px;
	padding: 0 20rpx;
}

.nav-placeholder {
	width: 100%;
}

.nav-back {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64rpx;
	height: 64rpx;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.32);
}

.nav.solid .nav-back {
	background: transparent;
}

.nav-arrow {
	color: #ffffff;
	font-size: 46rpx;
	line-height: 1;
	margin-top: -6rpx;
	margin-left: -2rpx;
}

/* 绝对定位的 text 不会吃 flex 的 align-items，
   不显式给高度就会从容器顶部往下排，视觉上「歪」在中间偏下。
   top + height + line-height 三者对齐 44px 才是真垂直居中。 */
.nav-title {
	position: absolute;
	left: 120rpx;
	right: 120rpx;
	top: 0;
	height: 44px;
	line-height: 44px;
	color: #ffffff;
	font-size: 46rpx;
	font-weight: 600;
	text-align: center;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
