<template>
	<view class="page">
		<star-field />
		<nav-bar :solid="navSolid" :placeholder="true" title="太空资产" />

		<view class="hero">
			<text class="hero-title">太空资产</text>
			<text class="hero-sub">天上有什么、后来怎么样 · GCAT 在轨编目</text>
		</view>

		<view class="tabs">
			<view
				v-for="t in tabs"
				:key="t.key"
				class="tab"
				:class="{ on: tab === t.key }"
				@click="setTab(t.key)"
			>
				<text>{{ t.label }}</text>
			</view>
		</view>

		<orbit-section v-if="tab === 'orbit'" ref="orbitSec" />
		<catalog-section v-else-if="tab === 'catalog'" ref="catalogSec" />
		<debris-section v-else-if="tab === 'debris'" ref="debrisSec" />
	</view>
</template>

<script>
import orbitSection from '@/components/orbit-section/orbit-section.vue'
import catalogSection from '@/components/catalog-section/catalog-section.vue'
import debrisSection from '@/components/debris-section/debris-section.vue'

// 滚动多少 px 后导航栏变实色（仅 JS 常量，不进模板）
const NAV_SOLID_SCROLL = 80

export default {
	components: {
		orbitSection,
		catalogSection,
		debrisSection
	},

	data() {
		return {
			tab: 'catalog',
			navSolid: false,
			tabs: [
				{ key: 'orbit', label: '全球在轨' },
				{ key: 'catalog', label: '卫星百科' },
				{ key: 'debris', label: '解体 / 再入' }
			]
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onReachBottom() {
		// 滑到底自动续载：只有卫星百科（分片）和解体再入（事件流）需要，
		// 全球在轨一屏看完，无续载逻辑
		const t = this.tab
		if (t === 'catalog' && this.$refs.catalogSec) this.$refs.catalogSec.grow()
		else if (t === 'debris' && this.$refs.debrisSec) this.$refs.debrisSec.grow()
	},

	onPullDownRefresh() {
		if (this.tab === 'orbit' && this.$refs.orbitSec) {
			this.$refs.orbitSec.refresh(true).then(() => uni.stopPullDownRefresh())
		} else {
			uni.stopPullDownRefresh()
		}
	},

	methods: {
		setTab(key) {
			if (key === this.tab) return
			this.tab = key
			// 切到新 tab 回到顶部，避免沿用上一屏的滚动位置
			this.navSolid = false
			uni.pageScrollTo({ scrollTop: 0, duration: 0 })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	box-sizing: border-box;
}

.hero {
	padding: 28rpx 32rpx 18rpx;
}
.hero-title {
	display: block;
	color: #e2e8f0;
	font-size: 44rpx;
	font-weight: 700;
}
.hero-sub {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 23rpx;
}

.tabs {
	display: flex;
	margin: 8rpx 32rpx 0;
	padding: 4rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 18rpx;
}
.tab {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 64rpx;
	border-radius: 14rpx;
}
.tab text {
	color: #8a97ad;
	font-size: 25rpx;
}
.tab.on {
	background: #38bdf8;
}
.tab.on text {
	color: #06121f;
	font-weight: 600;
}
</style>
