<template>
	<view class="page">
		<nav-bar :solid="navSolid" :placeholder="true" :title="navSolid ? '太空环境' : ''" />

		<view class="hero">
			<text class="hero-title">太空环境</text>
			<text class="hero-sub">飞过来的小天体 · 掉下去的航天器</text>
		</view>

		<!-- 两个 tab 是同一条分界线：地球外面进来的，和地球上面掉下去的 -->
		<view class="tabs">
			<view class="tab" :class="{ on: tab === 'neo' }" @click="setTab('neo')">
				<text class="tab-text">近地天体</text>
			</view>
			<view class="tab" :class="{ on: tab === 'debris' }" @click="setTab('debris')">
				<text class="tab-text">解体 · 再入</text>
			</view>
		</view>

		<!-- v-if 而不是 v-show：两块数据体量差很大（近地天体 12KB / 事件流上千条），
		     没必要为了切 tab 快一点把两份都渲染出来。都有 Storage 缓存，来回切不痛 -->
		<neo-section v-if="tab === 'neo'" />
		<debris-section v-else ref="debris" />
	</view>
</template>

<script>
const NAV_SOLID_SCROLL = 120

/**
 * 「太空环境」栏目。
 *
 * 由两块合并而来，因为它们是同一个问题的两面：
 *   · 近地天体（NASA NeoWs）：外面的东西飞过来，未来一周的接近日程
 *   · 解体 / 再入（GCAT）：地球周围的航天器掉下去，历史事件流
 * 原先是探索页里两个独立入口（「解体 / 再入」已上线，近地天体是新加的），
 * 合并成一个页面两个 tab，避免探索页入口继续膨胀。
 *
 * 老路径 pages/debris 保留为转发壳（已分享出去的链接不能失效）。
 */
export default {
	data() {
		return {
			navSolid: false,
			tab: 'neo'
		}
	},

	onLoad(options) {
		const t = (options && options.tab) || ''
		this.tab = t === 'debris' ? 'debris' : 'neo'
		this.syncShareTitle()
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	// 只有「解体 / 再入」是长列表、能上拉续载；近地天体一周就几十条，一次给完
	onReachBottom() {
		const sec = this.$refs && this.$refs.debris
		if (this.tab === 'debris' && sec && sec.grow) sec.grow()
	},

	methods: {
		setTab(t) {
			if (this.tab === t) return
			this.tab = t
			this.syncShareTitle()
			// 换 tab 后滚回顶部，否则会落在另一个 tab 的中段
			uni.pageScrollTo({ scrollTop: 0, duration: 0 })
		},

		// 分享出去的标题跟着当前 tab 走，别让「解体 / 再入」的分享写着近地天体
		syncShareTitle() {
			this.shareTitle = this.tab === 'debris' ? '太空环境 · 解体与再入事件' : '太空环境 · 近地天体掠地日程'
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
	padding: 24rpx 8rpx 8rpx;
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

.tabs {
	display: flex;
	margin-top: 20rpx;
	padding: 6rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 34rpx;
}
.tab {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 60rpx;
	border-radius: 28rpx;
}
.tab-text {
	color: #8a97ad;
	font-size: 25rpx;
}
.tab.on {
	background: #38bdf8;
}
.tab.on .tab-text {
	color: #06121f;
	font-weight: 600;
}
</style>
