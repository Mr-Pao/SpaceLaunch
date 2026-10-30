<template>
	<view class="page">
		<nav-bar :solid="navSolid" :placeholder="true" :title="navSolid ? '近地天体' : ''" />

		<view class="hero">
			<text class="hero-title">近地天体</text>
			<text class="hero-sub">未来一周掠过地球的小行星 · 按接近时间排</text>
		</view>

		<neo-section />
	</view>
</template>

<script>
const NAV_SOLID_SCROLL = 120

/**
 * 近地天体（NASA NeoWs）。
 *
 * 3.2.20 曾把它和「解体 / 再入」合成「太空环境」两 tab，理由是「外面飞来的 /
 * 上面掉下去的」是一体两面。实际用下来这是两类读者：关心小行星的人不会顺手
 * 去看再入事件，反之亦然，合成一页只是互相挡路。所以拆回独立入口 ——
 * 它和 GCAT 那三个数据集（卫星百科 / 全球在轨 / 解体再入）不是同一套东西。
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

	// 数据在 neo-section 组件里，页面拿不到条目：标题用这块内容的定位描述
	onShareAppMessage() {
		return {
			title: '近地天体 · 未来一周掠过地球的小行星',
			path: '/pages/neo/neo'
		}
	},

	onShareTimeline() {
		return {
			title: '近地天体 · 未来一周掠过地球的小行星',
			query: ''
		}
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
