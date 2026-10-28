<template>
	<view class="page">
		<nav-bar :solid="navSolid" :placeholder="true" :title="navSolid ? '解体 / 再入事件' : ''" />

		<view class="hero">
			<text class="hero-title">在轨解体 / 再入事件</text>
			<text class="hero-sub">火箭残骸、太空垃圾与解体记录 · 共 {{ total }} 起</text>
		</view>

		<view class="search">
			<text class="search-ico">🔍</text>
			<input class="search-in" v-model="q" placeholder="搜名称 / 国际编号 / 国家" placeholder-class="ph" confirm-type="search" />
			<text v-if="q" class="search-clear" @click="q=''">✕</text>
		</view>

		<scroll-view class="chips" scroll-x>
			<view class="chip" :class="{on: stateCat===''}" @click="setState('')">全部国家</view>
			<view class="chip" v-for="c in stateCats" :key="c" :class="{on: stateCat===c}" @click="setState(c)">{{ c }}</view>
		</scroll-view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="displayList.length===0">
			<text class="empty-text">没有匹配的事件</text>
		</view>

		<view class="timeline" v-else>
			<view class="item" v-for="(e, i) in displayList" :key="e.id + '-' + i">
				<view class="rail">
					<view class="dot" :class="e.status === 'DSO' ? 'boom' : 'fall'"></view>
					<view class="line" v-if="i < displayList.length - 1"></view>
				</view>
				<view class="card">
					<view class="row1">
						<text class="date">{{ e.reentry }}</text>
						<text class="badge" :class="e.status === 'DSO' ? 'boom' : 'fall'">{{ e.statusZh }}</text>
					</view>
					<text class="name">{{ e.name }}</text>
					<text class="meta" v-if="e.intl || e.stateZh || e.orbitZh">{{ [e.intl, e.stateZh, e.orbitZh].filter(Boolean).join(' · ') }}</text>
				</view>
			</view>

			<view class="foot"><text class="hint-text">已显示 {{ displayList.length }} / {{ total }} 起</text></view>
		</view>

		<view class="gcat-note">数据来源：GCAT (J. McDowell, planet4589.org/space/gcat) · CC-BY<text v-if="freshAt"> · {{ freshText() }}</text></view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'

const NAV_SOLID_SCROLL = 120
const STATE_CATS = ['美国', '中国', '俄罗斯', '欧空局', '日本', '印度']

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			q: '',
			stateCat: '',
			events: [],
			total: 0,
			freshAt: '',
			stateCats: STATE_CATS
		}
	},

	computed: {
		displayList() {
			const q = this.q.trim().toLowerCase()
			const state = this.stateCat
			return this.events.filter((e) => {
				if (state && e.stateZh !== state) return false
				if (q) {
					const hay = (e.name + ' ' + e.intl + ' ' + e.stateZh).toLowerCase()
					if (hay.indexOf(q) < 0) return false
				}
				return true
			})
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad() {
		try {
			const d = await spaceData.load('debrisEvents')
			// 数据按再入日期升序，倒过来让最新事件在顶部
			this.events = ((d && d.list) || []).slice().reverse()
			this.total = d.count || this.events.length
			this.freshAt = d.generatedAt
		} catch (e) {
			console.warn('[debris] 加载失败', e)
		}
		this.loading = false
	},

	methods: {
		setState(k) { this.stateCat = k },

		freshText() {
			return spaceData.freshnessText(this.freshAt)
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

.search {
	display: flex;
	align-items: center;
	margin-top: 18rpx;
	padding: 0 20rpx;
	height: 72rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
	border-radius: 36rpx;
}
.search-ico { font-size: 26rpx; margin-right: 12rpx; }
.search-in { flex: 1; color: #e2e8f0; font-size: 26rpx; }
.ph { color: #55617a; }
.search-clear { color: #6b7891; font-size: 26rpx; padding: 0 8rpx; }

.chips {
	white-space: nowrap;
	margin-top: 16rpx;
}
.chip {
	display: inline-block;
	margin-right: 14rpx;
	padding: 10rpx 22rpx;
	font-size: 23rpx;
	color: #8a97ad;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 30rpx;
}
.chip.on { color: #06121f; background: #38bdf8; border-color: #38bdf8; font-weight: 600; }

.loading,
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 160rpx 40rpx;
}
.hint-text { color: #6b7891; font-size: 26rpx; }
.empty-text { color: #8a97ad; font-size: 28rpx; }

.timeline { margin-top: 12rpx; }

.item {
	display: flex;
	align-items: stretch;
}

.rail {
	width: 40rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	flex-shrink: 0;
}
.dot {
	width: 18rpx;
	height: 18rpx;
	margin-top: 30rpx;
	border-radius: 50%;
	flex-shrink: 0;
}
.dot.boom { background: #ff6b6b; box-shadow: 0 0 12rpx rgba(255, 107, 107, 0.6); }
.dot.fall { background: #38bdf8; }
.line {
	width: 2rpx;
	flex: 1;
	margin: 6rpx 0;
	background: rgba(255, 255, 255, 0.08);
}

.card {
	flex: 1;
	margin: 18rpx 0 18rpx 16rpx;
	padding: 22rpx 22rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 18rpx;
}
.row1 { display: flex; align-items: center; justify-content: space-between; }
.date { color: #8a97ad; font-size: 24rpx; }
.badge {
	padding: 3rpx 14rpx;
	border-radius: 6rpx;
	font-size: 19rpx;
}
.badge.boom { background: rgba(255, 107, 107, 0.14); color: #ff8a8a; }
.badge.fall { background: rgba(56, 189, 248, 0.14); color: #38bdf8; }
.name {
	display: block;
	margin-top: 10rpx;
	color: #e2e8f0;
	font-size: 29rpx;
	font-weight: 600;
}
.meta {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.foot { text-align: center; padding: 24rpx 0; }

.gcat-note {
	margin-top: 30rpx;
	text-align: center;
	color: #4a5670;
	font-size: 20rpx;
	line-height: 1.6;
}
</style>
