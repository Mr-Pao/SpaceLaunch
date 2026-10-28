<template>
	<view class="page">
		<nav-bar :solid="navSolid" :placeholder="true" :title="navSolid ? '航天器 / 卫星百科' : ''" />

		<view class="hero">
			<text class="hero-title">航天器 / 卫星百科</text>
			<text class="hero-sub">在轨航天器与载荷编目 · 共 {{ total }} 颗</text>
		</view>

		<view class="search">
			<text class="search-ico">🔍</text>
			<input class="search-in" v-model="q" placeholder="搜名称 / 国际编号 / 运营方 / 国家" placeholder-class="ph" confirm-type="search" />
			<text v-if="q" class="search-clear" @click="q=''">✕</text>
		</view>

		<scroll-view class="chips" scroll-x>
			<view class="chip" :class="{on: orbitCat===''}" @click="setOrbit('')">全部轨道</view>
			<view class="chip" v-for="c in orbitCats" :key="c.key" :class="{on: orbitCat===c.key}" @click="setOrbit(c.key)">{{ c.label }}</view>
		</scroll-view>
		<scroll-view class="chips" scroll-x>
			<view class="chip" :class="{on: stateCat===''}" @click="setState('')">全部国家</view>
			<view class="chip" v-for="c in stateCats" :key="c" :class="{on: stateCat===c}" @click="setState(c)">{{ c }}</view>
		</scroll-view>
		<scroll-view class="chips" scroll-x>
			<view class="chip" :class="{on: statusCat===''}" @click="setStatus('')">全部状态</view>
			<view class="chip" v-for="c in statusCats" :key="c.key" :class="{on: statusCat===c.key}" @click="setStatus(c.key)">{{ c.label }}</view>
		</scroll-view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="displayList.length===0">
			<text class="empty-text">没有匹配的航天器</text>
			<text class="empty-sub" v-if="loadedChunks < totalChunks">已加载 {{ loadedChunks }}/{{ totalChunks }} 片，下滑可加载更多再筛选</text>
		</view>

		<view class="list" v-else>
			<view class="card" v-for="s in visible" :key="s.id" @click="openDetail(s)">
				<view class="info">
					<view class="row1">
						<text class="name">{{ s.name }}</text>
						<text class="badge" :class="badgeClass(s)">{{ s.statusZh }}</text>
					</view>
					<text class="meta">{{ s.ownerZh || s.owner }}<text v-if="s.intl"> · {{ s.intl }}</text></text>
					<text class="meta">{{ s.orbitZh || '未知轨道' }}<text v-if="s.launch"> · {{ s.launch }} 入轨</text></text>
				</view>
				<text class="arrow">›</text>
			</view>

			<view class="foot" v-if="loadingMore"><text class="hint-text">加载更多在轨航天器...</text></view>
			<view class="foot" v-else-if="visible.length < displayList.length" @click="grow"><text class="hint-text">加载更多 · 已显示 {{ visible.length }} / {{ displayList.length }} 颗</text></view>
			<view class="foot" v-else-if="loadedChunks >= totalChunks"><text class="hint-text">已加载全部 {{ total }} 颗</text></view>
			<view class="foot" v-else><text class="hint-text">下滑加载更多…</text></view>
		</view>

		<view class="gcat-note">数据来源：GCAT (J. McDowell, planet4589.org/space/gcat) · CC-BY<text v-if="freshAt"> · {{ freshText() }}</text></view>

		<!-- 底部详情抽屉 -->
		<view v-if="detail" class="mask" @click="closeDetail">
			<view class="sheet" @click.stop>
				<view class="sheet-bar" @click="closeDetail"><view class="sheet-handle"></view></view>
				<scroll-view class="sheet-body" scroll-y>
					<text class="d-name">{{ detail.name }}</text>
					<text class="d-sub" v-if="detail.alt && detail.alt !== detail.name">{{ detail.alt }}</text>
					<view class="d-badges">
						<text class="d-badge" :class="badgeClass(detail)">{{ detail.statusZh }}</text>
						<text class="d-badge dim">{{ detail.orbitZh || '未知轨道' }}</text>
					</view>
					<view class="d-grid">
						<view class="d-cell" v-if="detail.intl"><text class="d-k">国际编号</text><text class="d-v">{{ detail.intl }}</text></view>
						<view class="d-cell" v-if="detail.ownerZh || detail.owner"><text class="d-k">运营方</text><text class="d-v">{{ detail.ownerZh || detail.owner }}</text></view>
						<view class="d-cell" v-if="detail.stateZh || detail.state"><text class="d-k">国家 / 地区</text><text class="d-v">{{ detail.stateZh || detail.state }}</text></view>
						<view class="d-cell" v-if="detail.launch"><text class="d-k">发射时间</text><text class="d-v">{{ detail.launch }}</text></view>
						<view class="d-cell" v-if="detail.reentry"><text class="d-k">再入时间</text><text class="d-v">{{ detail.reentry }}</text></view>
						<view class="d-cell" v-if="detail.perigee"><text class="d-k">近地点</text><text class="d-v">{{ detail.perigee }} km</text></view>
						<view class="d-cell" v-if="detail.apogee"><text class="d-k">远地点</text><text class="d-v">{{ detail.apogee }} km</text></view>
						<view class="d-cell" v-if="detail.inc"><text class="d-k">轨道倾角</text><text class="d-v">{{ detail.inc }}°</text></view>
						<view class="d-cell" v-if="detail.mass"><text class="d-k">质量</text><text class="d-v">{{ detail.mass }} kg</text></view>
					</view>
					<text class="d-src">数据来源：GCAT (J. McDowell, planet4589.org/space/gcat) · CC-BY</text>
				</scroll-view>
			</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'

// 滚动多少 px 后导航栏变实色（仅 JS 常量，不进模板）
const NAV_SOLID_SCROLL = 120

// 轨道大类（基于 orbitZh 中文描述归类，避免 71 种原始码直接暴露给用户）
const ORBIT_CATS = [
	{ key: 'near', label: '近地', test: (o) => o.includes('近地') },
	{ key: 'geo', label: '同步轨道', test: (o) => o.includes('同步') },
	{ key: 'meo', label: '中地球', test: (o) => o.includes('中地球') },
	{ key: 'heo', label: '大椭圆', test: (o) => o.includes('大椭圆') },
	{ key: 'deep', label: '深空 / 月球', test: (o) => o.includes('深空') || o.includes('太阳') || o.includes('月') }
]

// 状态大类
const STATUS_CATS = [
	{ key: 'crew', label: '载人', test: (s) => s.status === 'P M' },
	{ key: 'cargo', label: '货运', test: (s) => s.status === 'P C' },
	{ key: 'payload', label: '载荷', test: (s) => /^P/.test(s.status) && s.status !== 'P M' && s.status !== 'P C' },
	{ key: 'active', label: '活跃', test: (s) => ['A', 'AR', 'AO', 'XP'].indexOf(s.status) >= 0 },
	{ key: 'other', label: '其它', test: (s) => ['P M', 'P C', 'A', 'AR', 'AO', 'XP'].indexOf(s.status) < 0 && !/^P/.test(s.status) }
]

// 主要航天实体（国家/地区筛选用，stateZh 精确匹配）
const STATE_CATS = ['美国', '中国', '俄罗斯', '欧空局', '日本', '印度']

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			q: '',
			orbitCat: '',
			stateCat: '',
			statusCat: '',
			allList: [],
			total: 0,
			totalChunks: 1,
			loadedChunks: 0,
			loadingMore: false,
			// 首屏只渲染 60 张卡，避免 800+ 节点一次性进 DOM 拖慢打开；
			// 滑到底 / 点「加载更多」再增量展开，或触发拉下一片
			renderCap: 60,
			freshAt: '',
			detail: null,
			// 供模板迭代的静态选项（数组本身不进模板作用域守卫，安全）
			orbitCats: ORBIT_CATS,
			stateCats: STATE_CATS,
			statusCats: STATUS_CATS
		}
	},

	computed: {
		displayList() {
			const q = this.q.trim().toLowerCase()
			const orbit = this.orbitCat ? ORBIT_CATS.find((c) => c.key === this.orbitCat) : null
			const status = this.statusCat ? STATUS_CATS.find((c) => c.key === this.statusCat) : null
			const state = this.stateCat
			if (!q && !orbit && !status && !state) return this.allList
			const out = []
			for (const s of this.allList) {
				if (q) {
					const hay = (s.name + ' ' + s.alt + ' ' + s.intl + ' ' + s.owner + ' ' + s.ownerZh + ' ' + s.stateZh).toLowerCase()
					if (hay.indexOf(q) < 0) continue
				}
				if (orbit && !orbit.test(s.orbitZh || '')) continue
				if (state && s.stateZh !== state) continue
				if (status && !status.test(s)) continue
				out.push(s)
			}
			return out
		},
		// 真正渲染用裁剪后的窗口，首屏只画 renderCap 张卡
		visible() {
			return this.displayList.slice(0, this.renderCap)
		}
	},

	watch: {
		// 筛选变化时窗口回到顶部，并自动续拉命中片（与之前行为一致）
		q() { this.onFilter() },
		orbitCat() { this.onFilter() },
		stateCat() { this.onFilter() },
		statusCat() { this.onFilter() }
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad() {
		try {
			const d = await spaceData.load('satellites')
			this.allList = (d && d.list) || []
			this.total = d.total || this.allList.length
			this.totalChunks = d.chunks || 1
			this.loadedChunks = 1
			this.freshAt = d.generatedAt
		} catch (e) {
			console.warn('[catalog] 加载失败', e)
		}
		this.loading = false
	},

	onReachBottom() {
		this.grow()
	},

	methods: {
		badgeClass(s) {
			if (s.status === 'P M' || s.status === 'P C' || s.status === 'A') return 'on'
			if (/^P/.test(s.status)) return 'hot'
			return 'dim'
		},

		setOrbit(k) { this.orbitCat = k },
		setState(k) { this.stateCat = k },
		setStatus(k) { this.statusCat = k },

		// 筛选变化：窗口回到顶部，并自动续拉命中片（沿用旧 autoExpand 逻辑）
		onFilter() {
			this.renderCap = 60
			this.autoExpand()
		},

		// 增量展开：先把已加载的更多命中项画出来；已画完但还有未拉的分片时，去拉下一片
		grow() {
			if (this.renderCap < this.displayList.length) {
				this.renderCap += 60
			} else if (this.loadedChunks < this.totalChunks) {
				this.loadMore()
			}
		},

		// 筛选后若当前已加载片里没有命中，自动续拉几片（最多 8 片），避免用户只见空列表
		async autoExpand() {
			let guard = 0
			while (this.displayList.length === 0 && this.loadedChunks < this.totalChunks && !this.loadingMore && guard < 8) {
				await this.loadMore()
				guard++
			}
		},

		async loadMore() {
			if (this.loadingMore || this.loadedChunks >= this.totalChunks) return
			this.loadingMore = true
			try {
				const next = this.loadedChunks + 1
				const c = await spaceData.satelliteChunk(next)
				if (c && c.list && c.list.length) {
					this.allList = this.allList.concat(c.list)
					this.loadedChunks = next
				} else {
					this.loadedChunks = this.totalChunks
				}
			} catch (e) {
				console.warn('[catalog] 分片加载失败', e)
			}
			this.loadingMore = false
		},

		openDetail(s) {
			this.detail = s
		},
		closeDetail() {
			this.detail = null
		},

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
	font-size: 40rpx;
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
.search-in {
	flex: 1;
	color: #e2e8f0;
	font-size: 26rpx;
}
.ph { color: #55617a; }
.search-clear {
	color: #6b7891;
	font-size: 26rpx;
	padding: 0 8rpx;
}

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
.chip.on {
	color: #06121f;
	background: #38bdf8;
	border-color: #38bdf8;
	font-weight: 600;
}

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
.empty-sub { margin-top: 12rpx; color: #55617a; font-size: 22rpx; }

.list { margin-top: 8rpx; }

.card {
	display: flex;
	align-items: center;
	padding: 22rpx 20rpx;
	margin-bottom: 16rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}
.info { flex: 1; min-width: 0; margin-right: 14rpx; }
.row1 { display: flex; align-items: center; }
.name {
	color: #e2e8f0;
	font-size: 30rpx;
	font-weight: 600;
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.badge {
	flex-shrink: 0;
	margin-left: 12rpx;
	padding: 3rpx 12rpx;
	border-radius: 6rpx;
	font-size: 19rpx;
}
.badge.on { background: rgba(56, 189, 248, 0.16); color: #38bdf8; }
.badge.hot { background: rgba(52, 211, 153, 0.14); color: #34d399; }
.badge.dim { background: rgba(255, 255, 255, 0.05); color: #55617a; }
.meta {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.arrow { color: #3d4a5c; font-size: 34rpx; flex-shrink: 0; }

.foot { text-align: center; padding: 24rpx 0; }

.gcat-note {
	margin-top: 30rpx;
	text-align: center;
	color: #4a5670;
	font-size: 20rpx;
	line-height: 1.6;
}

/* 底部抽屉 */
.mask {
	position: fixed;
	left: 0; right: 0; top: 0; bottom: 0;
	background: rgba(2, 5, 10, 0.6);
	z-index: 50;
	display: flex;
	align-items: flex-end;
}
.sheet {
	width: 100%;
	max-height: 78vh;
	background: #10151f;
	border-radius: 28rpx 28rpx 0 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.08);
	display: flex;
	flex-direction: column;
}
.sheet-bar {
	padding: 16rpx 0 6rpx;
	display: flex;
	justify-content: center;
}
.sheet-handle {
	width: 80rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background: #2a3344;
}
.sheet-body {
	padding: 16rpx 36rpx calc(30rpx + env(safe-area-inset-bottom));
	overflow-y: auto;
}
.d-name {
	display: block;
	color: #e2e8f0;
	font-size: 34rpx;
	font-weight: 700;
}
.d-sub {
	display: block;
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 23rpx;
}
.d-badges { margin-top: 16rpx; }
.d-badge {
	display: inline-block;
	margin-right: 12rpx;
	padding: 5rpx 16rpx;
	border-radius: 8rpx;
	font-size: 21rpx;
}
.d-badge.on { background: rgba(56, 189, 248, 0.16); color: #38bdf8; }
.d-badge.dim { background: rgba(255, 255, 255, 0.05); color: #6b7891; }
.d-grid {
	display: flex;
	flex-wrap: wrap;
	margin-top: 22rpx;
}
.d-cell {
	width: 50%;
	padding: 14rpx 0;
	box-sizing: border-box;
}
.d-cell:nth-child(odd) { padding-right: 16rpx; }
.d-k {
	display: block;
	color: #55617a;
	font-size: 20rpx;
}
.d-v {
	display: block;
	margin-top: 4rpx;
	color: #cbd5e1;
	font-size: 26rpx;
}
.d-src {
	display: block;
	margin-top: 24rpx;
	color: #4a5670;
	font-size: 19rpx;
}
</style>
