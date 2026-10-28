<template>
	<view class="page">
		<nav-bar :solid="navSolid" :placeholder="true" :title="navSolid ? '解体 / 再入' : ''" />

		<view class="hero">
			<text class="hero-title">解体 / 再入</text>
			<text class="hero-sub">航天器在轨解体与再入记录 · 数据来自 GCAT</text>
		</view>

		<debris-section ref="sec" />
	</view>
</template>

<script>
const NAV_SOLID_SCROLL = 120

/**
 * 解体 / 再入事件流（GCAT 已终结子集）。
 *
 * 和「卫星百科」「全球在轨」同一套数据源、同一类读者：都是查「天上有哪些东西、
 * 它们的下场如何」。3.2.20 一度并进「太空环境」和近地天体共用两 tab，
 * 3.2.22 拆回来各占一个入口。
 */
export default {
	data() {
		return {
			navSolid: false
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	// 事件有上千条，上拉续载由内容组件负责展开
	onReachBottom() {
		const sec = this.$refs && this.$refs.sec
		if (sec && sec.grow) sec.grow()
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding: 0 32rpx 120rpx;
	box-sizing: border-box;
}

.hero {
	padding: 24rpx 8rpx 14rpx;
}
.hero-title {
	display: block;
	color: #e2e8f0;
	font-size: 38rpx;
	font-weight: 700;
}
.hero-sub {
	display: block;
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 22rpx;
}
</style>
