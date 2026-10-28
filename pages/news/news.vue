<template>
	<view class="page">
		<star-field />
		<nav-bar :solid="navSolid || focus" :title="navSolid || focus ? '航天资讯' : ''" :placeholder="true" />

		<!-- focus 态：带 ?id= 进来（发射详情页的「相关报道」、首页资讯卡点进来）。
		     用户的意图是「看这一篇」，不是「逛资讯」，所以列表整块不渲染 ——
		     底下留着一屏列表只会让人以为点错了。关掉抽屉直接返回上一页 -->
		<block v-if="!focus">
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
					<image v-if="n.image" class="thumb" :src="n.image" mode="aspectFill" lazy-load />
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
							<text class="tag" v-if="n.launchRef">发射</text>
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
		</block>

		<!-- focus 态没有抽屉可看时（数据还没到 / 那篇已被挤出最新列表）给一句话，
		     不能留一屏纯黑。列表整个空 = 请求失败，跟「文章没了」是两回事 -->
		<view class="focus-miss" v-if="focus && !detail">
			<text class="empty-text">{{
				focusMissed ? (items.length ? '这篇报道已不在最新列表中' : '资讯加载失败，请返回重试') : '正在加载…'
			}}</text>
		</view>

		<!-- 详情抽屉 -->
		<view class="mask" v-if="detail" @click="closeDetail"></view>
		<view class="sheet" :class="{ focus: focus }" v-if="detail">
			<view class="sheet-grab"></view>
			<scroll-view scroll-y class="sheet-body">
				<image v-if="detail.image" class="d-img" :src="detail.image" mode="widthFix" />
				<text class="d-title">{{ detail.titleZh || detail.title }}</text>
				<view class="d-meta">
					<text class="d-site">{{ detail.site }}</text>
					<text class="d-sep">·</text>
					<text class="d-time">{{ detail.at }}</text>
				</view>
				<text class="d-sum" v-if="detail.summaryZh">{{ detail.summaryZh }}</text>
				<text class="d-sum d-en" v-else-if="detail.summary">{{ detail.summary }}</text>

				<!-- 主次按「这页最想让你干什么」定：能跳发射时，跳转才是主线
				     （资讯一半的价值在于能回连发射详情），复制链接退居次要；
				     打不开时复制就是唯一能用的动作，于是把主色还给它 -->
				<view class="d-acts">
					<view class="act" :class="{ primary: !hasLaunchRef }" @click="copyUrl">
						<text class="act-text">复制原文链接</text>
					</view>
					<!-- 与列表的「发射」标签同源（都看 launchRef）。
				     以前这里挂的是运行时网络查询结果，导致列表打着标签、
				     详情里按钮却凭空消失 -->
					<view v-if="hasLaunchRef" class="act primary" @click="goLaunch">
						<text class="act-text">查看相关发射</text>
					</view>
				</view>

				<text class="d-hint">小程序内不转载正文，复制链接到浏览器可读全文</text>
			</scroll-view>
		</view>
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
			// focus 态：带 ?id= 进来，只显示那一条（列表整块不渲染）。
			// 从发射详情页的「相关报道」或首页资讯卡点进来时用
			focus: false,
			// 数据到了但找不到那一篇（被挤出最新 200 条）
			focusMissed: false,
			// 渲染窗口：最多 200 条，一次性全画会拖慢首屏，先 30 条
			renderCount: RENDER_STEP
		}
	},

	computed: {
		// 「这次发射可以点开看」——列表的「发射」标签、抽屉的「查看相关发射」按钮、
		// 「关联发射」筛选，全部只看这一个字段，三者永远同进同出。
		// launchRef 由 CI 在同步资讯时查归档填好（带 net），前端零查询
		hasLaunchRef() {
			return !!(this.detail && this.detail.launchRef && this.detail.launchRef.id)
		},
		filteredList() {
			if (!this.onlyLaunch) return this.items
			return this.items.filter((n) => n.launchRef)
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
	 * 带 ?id= 进来就是「只看这一篇」：发射详情页的「相关报道」、首页资讯卡都走这条。
	 *
	 * focus 必须**在 await 之前**置位 —— onLoad 早于首次渲染，这样列表一帧都不会闪出来。
	 * 找不到就停在 focusMissed，给一句人话 + 顶部返回，而不是把用户扔进列表页。
	 */
	async onLoad(options) {
		const wantId = options && options.id
		if (wantId) this.focus = true

		await this.getData(false)

		if (!wantId) return

		const hit = this.items.find((x) => x && String(x.id) === String(wantId))
		if (hit) this.open(hit)
		else this.focusMissed = true
	},

	methods: {
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
		 * 「查看相关发射」这个入口以前有个矛盾：列表打了「发射」标签，
		 * 点进去按钮却没了。
		 *
		 * 根子在于两处用了不同判据 —— 列表看「有没有关联 id」，详情看
		 * 「运行时能不能查到」。而 SNAPI 只给 launch_id（UUID）不给发射时间，
		 * 本地快照只有 upcoming 100 + previous 100，归档查找又限深 12 片，
		 * 于是十几年前的老任务（好奇号 2011 在 p16）数据明明在库里也查不到。
		 *
		 * 现在统一交给 CI：同步资讯时扫一遍归档分片，把能打开的发射连 net
		 * 一起算出来存进 launchRef。前端三个地方（标签 / 按钮 / 筛选）都只
		 * 看 launchRef，不再有任何运行时判定，打开抽屉也就零网络开销。
		 */
		open(n) {
			this.detail = n
		},

		closeDetail() {
			// focus 态本来就没有列表可回，关掉就是「看完了」→ 退回上一页（发射详情）。
			// 页面栈只有一层（分享直达之类）时 navigateBack 会失败，那就退回列表态
			if (this.focus) {
				uni.navigateBack({
					fail: () => {
						this.focus = false
						this.detail = null
					}
				})
				return
			}
			this.detail = null
		},

		copyUrl() {
			const u = this.detail && this.detail.url
			if (!u) return
			uni.setClipboardData({
				data: u,
				success: () => {
					uni.showToast({ title: '链接已复制，请到浏览器打开', icon: 'none', duration: 2000 })
				}
			})
		},

		/**
		 * 跳发射详情。launchRef 是 CI 算好的「能打开的那一个」，
		 * 带上 net 让详情页直达归档分片（否则从最新往回翻，限深 12 片）。
		 */
		goLaunch() {
			const ref = this.detail && this.detail.launchRef
			if (!ref || !ref.id) return

			let url = '/pages/launch/launchInfo?id=' + encodeURIComponent(ref.id)
			if (ref.net) url += '&net=' + encodeURIComponent(ref.net)
			const fail = () => uni.showToast({ title: '该发射未收录', icon: 'none' })

			// focus 态本来就是从发射详情页点进来的，再 navigateTo 会「发射→资讯→发射→资讯」
			// 一层层往上叠，页面栈满 10 层就再也点不动。直接替换当前页，返回刚好回到最初那页
			if (this.focus) {
				uni.redirectTo({ url, fail })
				return
			}

			this.detail = null
			uni.navigateTo({ url, fail })
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
	background: #04060a;
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

/* ---- 详情抽屉 ---- */
.mask {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.62);
	z-index: 40;
}

.sheet {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	max-height: 82vh;
	background: #0a0f16;
	border-radius: 28rpx 28rpx 0 0;
	z-index: 41;
	overflow: hidden;
	padding-bottom: env(safe-area-inset-bottom);
}

.sheet-grab {
	width: 72rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background: rgba(255, 255, 255, 0.18);
	margin: 18rpx auto 6rpx;
}

/* focus 态：底下没有列表衬着，抽屉再留着 82vh 会露出一块空屏，干脆铺到近满 */
.sheet.focus {
	max-height: 90vh;
}

.sheet.focus .sheet-grab {
	/* 这种形态拖不下来（关掉就返回上一页），小横杠会误导，藏掉 */
	display: none;
}

/* focus 态但拿不到那篇（数据未到 / 已被挤出最新列表） */
.focus-miss {
	padding: 220rpx 48rpx 0;
	text-align: center;
}

.sheet-body {
	max-height: 76vh;
	padding: 12rpx 32rpx 40rpx;
	box-sizing: border-box;
}

.sheet.focus .sheet-body {
	max-height: 84vh;
	/* focus 态藏了上面那条小横杠，顶部不留点空隙图片会顶到圆角上 */
	padding-top: 28rpx;
}

.d-img {
	width: 100%;
	border-radius: 18rpx;
	margin-bottom: 24rpx;
	background: #0b1118;
}

.d-title {
	display: block;
	font-size: 36rpx;
	line-height: 1.4;
	font-weight: 600;
	color: #f2f6fa;
}

.d-meta {
	margin-top: 16rpx;
	display: flex;
	align-items: center;
}
.d-site {
	font-size: 23rpx;
	color: #5c8fb3;
}
.d-sep {
	font-size: 23rpx;
	color: #3d4a58;
	margin: 0 10rpx;
}
.d-time {
	font-size: 23rpx;
	color: #5d6a7a;
}

.d-sum {
	display: block;
	margin-top: 26rpx;
	font-size: 28rpx;
	line-height: 1.72;
	color: #b9c6d4;
}
.d-en {
	color: #8593a3;
}

.d-acts {
	margin-top: 36rpx;
	display: flex;
	flex-wrap: wrap;
}
.act {
	padding: 20rpx 34rpx;
	margin-right: 18rpx;
	margin-bottom: 16rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.07);
	border: 1rpx solid rgba(255, 255, 255, 0.1);
}
.act.primary {
	background: #38bdf8;
	border-color: #38bdf8;
}
.act-text {
	font-size: 26rpx;
	color: #cfe0ee;
}
.act.primary .act-text {
	color: #04121c;
	font-weight: 600;
}

.d-hint {
	display: block;
	margin-top: 14rpx;
	font-size: 21rpx;
	color: #4f5b6b;
	line-height: 1.6;
}
</style>
