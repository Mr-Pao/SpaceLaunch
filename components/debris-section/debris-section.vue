<template>
	<view class="debris-sec">
		<view class="stat-line">
			<text class="stat-text">共 {{ total }} 起（含解体 {{ breakupCount }}）</text>
			<text class="stat-text" v-if="freshAt">· {{ freshText() }}</text>
		</view>

		<view class="search">
			<text class="search-ico">🔍</text>
			<input class="search-in" v-model="q" placeholder="搜名称 / 国际编号 / 国家" placeholder-class="ph" confirm-type="search" />
			<text v-if="q" class="search-clear" @click="q=''">✕</text>
		</view>

		<scroll-view class="chips" scroll-x>
			<view class="chip" v-for="c in kindCats" :key="c.key" :class="{on: kindCat===c.key}" @click="setKind(c.key)">{{ c.label }}</view>
		</scroll-view>

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
			<view class="item" v-for="(e, i) in visibleList" :key="e.id + '-' + i">
				<view class="rail">
					<view class="dot" :class="dotClass(e)"></view>
					<view class="line" v-if="i < visibleList.length - 1"></view>
				</view>
				<view class="card">
					<view class="row1">
						<text class="date">{{ e.reentry || '日期未知' }}</text>
						<text class="badge" :class="dotClass(e)">{{ e.statusZh }}</text>
					</view>
					<text class="name">{{ e.name }}</text>
					<text class="meta" v-if="e.intl || e.stateZh || e.orbitZh">{{ [e.clsZh, e.intl, e.stateZh, e.orbitZh].filter(Boolean).join(' · ') }}</text>
				</view>
			</view>

			<view class="foot" v-if="visibleList.length < displayList.length" @click="grow"><text class="hint-text">加载更多 · 已显示 {{ visibleList.length }} / {{ displayList.length }} 起</text></view>
			<view class="foot" v-else><text class="hint-text">已显示全部 {{ displayList.length }} 起</text></view>
		</view>

		<view class="gcat-note">数据来源：GCAT (J. McDowell, planet4589.org/space/gcat) · CC-BY</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

const STATE_CATS = ['美国', '中国', '俄罗斯', '欧空局', '日本', '印度']
// 事件分型（与 gcat.js 的 kind 字段对应）
const KIND_CATS = [
	{ key: '', label: '全部' },
	{ key: 'breakup', label: '解体' },
	{ key: 'reentry', label: '再入' },
	{ key: 'deorbit', label: '离轨' },
	{ key: 'landing', label: '落地' }
]

/**
 * 「解体 / 再入」的内容主体（GCAT 已终结事件）。
 *
 * 壳（导航栏、页面滚动、上拉加载）由 pages/debris 负责，这里只管内容。
 * 3.2.20 ~ 3.2.21 期间它曾被塞进「太空环境」页当一个 tab，3.2.22 拆回独立页面。
 */
export default {
	data() {
		return {
			loading: true,
			q: '',
			stateCat: '',
			kindCat: '',
			events: [],
			total: 0,
			breakupCount: 0,
			freshAt: '',
			stateCats: STATE_CATS,
			kindCats: KIND_CATS,
			// 渲染窗口：事件有 1600 条，一次性渲染所有卡片会卡死首屏，
			// 只先画前 80 条，滑到底 / 点「加载更多」再增量展开
			renderCount: 80
		}
	},

	computed: {
		displayList() {
			const q = this.q.trim().toLowerCase()
			const state = this.stateCat
			const kind = this.kindCat
			return this.events.filter((e) => {
				if (kind && e.kind !== kind) return false
				if (state && e.stateZh !== state) return false
				if (q) {
					const hay = (e.name + ' ' + e.intl + ' ' + e.stateZh).toLowerCase()
					if (hay.indexOf(q) < 0) return false
				}
				return true
			})
		},
		// 真正渲染用裁剪后的窗口，避免 1600+ 节点一次性进 DOM
		visibleList() {
			return this.displayList.slice(0, this.renderCount)
		}
	},

	watch: {
		// 筛选条件变化时窗口回到顶部，避免残留一大段已筛选掉的旧列表
		q() { this.renderCount = 80 },
		stateCat() { this.renderCount = 80 },
		kindCat() { this.renderCount = 80 }
	},

	mounted() {
		this.getData()
	},

	methods: {
		async getData() {
			try {
				const d = await spaceData.load('debrisEvents')
				// gcat.js 产出时已按再入日期倒序（最新在前），直接使用
				this.events = (d && d.list) || []
				this.total = d.count || this.events.length
				this.breakupCount = d.breakupCount || 0
				this.freshAt = d.generatedAt
			} catch (e) {
				console.warn('[debris] 加载失败', e)
			}
			this.loading = false
		},

		setState(k) { this.stateCat = k },
		setKind(k) { this.kindCat = k },

		// 解体=红（爆炸），落地/离轨=绿，普通再入=蓝
		dotClass(e) {
			if (e.kind === 'breakup') return 'boom'
			if (e.kind === 'landing' || e.kind === 'deorbit') return 'land'
			return 'fall'
		},

		// 增量展开渲染窗口（最多再露 60 条），数据全在内存里，只是少画几张卡。
		// 页面 onReachBottom 会来调它
		grow() {
			if (this.renderCount < this.displayList.length) {
				this.renderCount += 60
			}
		},

		freshText() {
			return spaceData.freshnessText(this.freshAt)
		}
	}
}
</script>

<style scoped>
.stat-line {
	padding: 4rpx 8rpx 0;
}
.stat-text {
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
.dot.land { background: #34c759; }
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
.badge.land { background: rgba(52, 199, 89, 0.14); color: #34c759; }
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
