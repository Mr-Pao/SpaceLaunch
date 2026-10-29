<template>
	<view class="page">
		<star-field />
		<nav-bar :solid="navSolid" :title="navSolid ? '航天资讯' : ''" :placeholder="true" />

		<view class="hero">
			<text class="hero-title">航天资讯</text>
			<text class="hero-sub">{{ total }} 条报道 · {{ siteCount }} 家媒体 · 已中文编译</text>
		</view>

		<view class="tabs">
			<view class="tab" :class="{ on: !onlyLaunch }" @click="setTab(false)">全部</view>
			<view class="tab" :class="{ on: onlyLaunch }" @click="setTab(true)">关联发射</view>
		</view>

		<view class="loading" v-if="loading">
			<text class="loading-text">正在加载资讯…</text>
		</view>

		<view class="empty" v-else-if="!visibleList.length">
			<text class="empty-text">{{ onlyLaunch ? '暂无关联发射的报道' : '暂无资讯' }}</text>
		</view>

		<view class="list" v-else>
			<view class="card" v-for="n in visibleList" :key="n.id" @click="open(n)">
				<image
					v-if="n.image && !imgErr[n.id]"
					class="thumb"
					:src="n.image"
					mode="aspectFill"
					lazy-load
					@error="onImgErr(n)"
				/>
				<view v-else class="thumb thumb-empty"><text class="thumb-ico">🛰</text></view>
				<view class="info">
					<text class="title">{{ n.titleZh || n.title }}</text>
					<text class="sum" v-if="n.summaryZh || n.summary">{{ n.summaryZh || n.summary }}</text>
					<view class="meta">
						<text class="site">{{ n.site }}</text>
						<text class="sep">·</text>
						<text class="time">{{ n.atShort }}</text>
						<!-- 只在真能跳的时候打「发射」标签：标签的意义是「点开能看那次发射」，
						     打着标签却打不开，比不打更让人困惑 -->
						<text class="tag" v-if="hasLaunch(n)">发射</text>
					</view>
				</view>
			</view>

			<view class="foot" v-if="renderCount < filteredList.length">
				<text class="foot-text">上滑加载更多（{{ renderCount }} / {{ filteredList.length }}）</text>
			</view>
			<view class="foot" v-else>
				<text class="foot-text">{{ freshText }}</text>
			</view>

			<view class="src">
				<text class="src-text">资讯来自 Spaceflight News API（The Space Devs），版权归各原始媒体所有</text>
			</view>
		</view>

		<!-- 详情弹窗：和今日页资讯卡、发射详情页的「相关报道」共用同一个组件，
		     三处都是就地弹，不再跳页 -->
		<news-detail :article="detail" @close="closeDetail" />
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'

const NAV_SOLID_SCROLL = 120
const RENDER_STEP = 30

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			navSolid: false,
			onlyLaunch: false,
			items: [],
			total: 0,
			freshAt: '',
			detail: null,
			// 渲染窗口：最多 200 条，一次性全画会拖慢首屏，先 30 条
			renderCount: RENDER_STEP,
			// 加载失败的封面（按 id 记）：image 组件出错只会留一块底色，
			// 深色主题下就是纯黑，必须自己接 error 换占位
			imgErr: {}
		}
	},

	computed: {
		// 「关联发射」筛选只看 launchRefs：它由 CI 在同步资讯时查归档算好
		// （带 net），和列表的「发射」标签、弹窗里的「查看相关发射」同源
		filteredList() {
			if (!this.onlyLaunch) return this.items
			return this.items.filter((n) => this.hasLaunch(n))
		},
		visibleList() {
			return this.filteredList.slice(0, this.renderCount)
		},
		siteCount() {
			const s = new Set()
			for (const n of this.items) if (n.site) s.add(n.site)
			return s.size
		}
	},

	watch: {
		// 切换筛选时窗口回到顶部，避免残留一屏空
		onlyLaunch() {
			this.renderCount = RENDER_STEP
		}
	},

	onPageScroll(e) {
		const solid = (e && e.scrollTop) > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onReachBottom() {
		this.grow()
	},

	// 资讯是全站唯一「会变」的内容源，用户看到旧数据的可能性最大，
	// 必须给一个手动拉新的手势（getData(true) 绕过 TTL 直接打 CDN）
	onPullDownRefresh() {
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	/**
	 * 带 ?id= 进来就顺手弹出那一条（列表仍留在下面）。
	 * 现在今日页资讯卡和发射详情页的「相关报道」都改成就地弹窗了，
	 * 这条路径只留给外部旧链接，找不到就安静停在列表，不报错。
	 */
	async onLoad(options) {
		await this.getData(false)

		const wantId = options && options.id
		if (!wantId) return

		const hit = this.items.find((x) => x && String(x.id) === String(wantId))
		if (hit) this.open(hit)
	},

	methods: {
		/** 封面加载失败：记住这一条，模板会换成占位图标 */
		onImgErr(n) {
			if (!n || n.id == null) return
			this.imgErr[n.id] = true
		},

		/**
		 * 这条资讯是否挂着**能跳转的**发射。CI 把定位不到 net 的都剔掉了，
		 * 所以有 launchRefs 就一定打得开。兼容旧数据的单值 launchRef。
		 */
		hasLaunch(n) {
			if (!n) return false
			if (Array.isArray(n.launchRefs) && n.launchRefs.length) return true
			return !!(n.launchRef && n.launchRef.id)
		},

		async getData(force) {
			try {
				const d = await spaceData.load('news', { force: !!force })
				this.items = (d && d.list) || []
				this.total = (d && d.count) || this.items.length
				this.freshAt = (d && d.generatedAt) || ''
			} catch (e) {
				console.warn('[news] 加载失败', e)
			}
			this.loading = false
		},

		setTab(v) {
			this.onlyLaunch = v
		},

		grow() {
			if (this.renderCount < this.filteredList.length) {
				this.renderCount += RENDER_STEP
			}
		},

		/**
		 * 打开某一条的详情弹窗。判据全部交给 CI 预先算好的 launchRef，
		 * 打开时零网络开销（详见 components/news-detail）。
		 */
		open(n) {
			this.detail = n
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

<style lang="scss">
.page {
	min-height: 100vh;
	/* 不设 background：星空是 z-index:-1，页面有不透明底色就会把星点整块盖住。
	   底色由 pages.json 的 globalStyle 兜住 */
	padding-bottom: 60rpx;
}

.hero {
	padding: 20rpx 32rpx 8rpx;
	display: flex;
	flex-direction: column;
}
.hero-title {
	font-size: 48rpx;
	font-weight: 600;
	color: #f2f6fa;
	letter-spacing: 1rpx;
}
.hero-sub {
	margin-top: 10rpx;
	font-size: 24rpx;
	color: #7b8898;
}

.tabs {
	display: flex;
	padding: 18rpx 32rpx 6rpx;
}
.tab {
	padding: 10rpx 26rpx;
	margin-right: 16rpx;
	border-radius: 999rpx;
	font-size: 25rpx;
	color: #93a1b1;
	background: rgba(255, 255, 255, 0.05);
	border: 1rpx solid rgba(255, 255, 255, 0.07);
}
.tab.on {
	color: #04121c;
	background: #38bdf8;
	border-color: #38bdf8;
	font-weight: 600;
}

.loading,
.empty {
	padding: 160rpx 0;
	display: flex;
	justify-content: center;
}
.loading-text,
.empty-text {
	font-size: 26rpx;
	color: #6b7787;
}

.list {
	padding: 12rpx 24rpx 0;
}

.card {
	display: flex;
	padding: 22rpx;
	margin-bottom: 18rpx;
	border-radius: 20rpx;
	background: rgba(255, 255, 255, 0.035);
	border: 1rpx solid rgba(255, 255, 255, 0.06);
}
.card:active {
	background: rgba(255, 255, 255, 0.07);
}

.thumb {
	width: 200rpx;
	height: 150rpx;
	border-radius: 14rpx;
	flex-shrink: 0;
	background: #0b1118;
}
.thumb-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #0d1620, #101c28);
}
.thumb-ico {
	font-size: 44rpx;
	opacity: 0.4;
}

.info {
	flex: 1;
	margin-left: 20rpx;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	min-width: 0;
}

.title {
	font-size: 28rpx;
	line-height: 1.42;
	color: #eaf0f6;
	font-weight: 500;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.sum {
	margin-top: 8rpx;
	font-size: 23rpx;
	line-height: 1.45;
	color: #7f8c9c;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.meta {
	margin-top: 12rpx;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
}
.site {
	font-size: 21rpx;
	color: #5c8fb3;
}
.sep {
	font-size: 21rpx;
	color: #3d4a58;
	margin: 0 8rpx;
}
.time {
	font-size: 21rpx;
	color: #5d6a7a;
}
.tag {
	margin-left: 14rpx;
	font-size: 19rpx;
	color: #38bdf8;
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	border-radius: 6rpx;
	padding: 1rpx 8rpx;
}

.foot {
	padding: 34rpx 0 10rpx;
	display: flex;
	justify-content: center;
}
.foot-text {
	font-size: 22rpx;
	color: #59667a;
}

.src {
	padding: 8rpx 24rpx 20rpx;
	display: flex;
	justify-content: center;
}
.src-text {
	font-size: 20rpx;
	color: #44526a;
	line-height: 1.5;
	text-align: center;
}

/* 详情弹窗的样式整体搬到了 components/news-detail（三个入口共用一份），
   页面这边不再保留任何 .mask / .sheet / .d-* 定义 */
</style>
