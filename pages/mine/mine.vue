<template>
	<view class="page">
		<star-field />

		<!-- 去掉「我的」标题：这一页本来就只有一个 tab，标题只是重复。
		     内容直接从状态栏下方开始，身份区铺满整宽、不留卡片边框，
		     和背景融成一片 —— 这是「沉浸」和「一张浮起来的卡」的区别 -->
		<view class="hero" :style="{ paddingTop: statusBarH + 26 + 'px' }">
			<view class="hero-glow"></view>
			<image class="logo" src="/static/logo.png" mode="aspectFill"></image>
			<!-- 品牌字标：Space 白 + Launch 青。两个 text 内联不换行，
			     中间不能留空格/换行，否则会出现一道缝 -->
			<view class="brand"><text class="brand-a">Space</text><text class="brand-b">Launch</text></view>
			<text class="slogan">记录人类成为多星球物种的进程</text>

			<view class="stats">
				<view class="stat">
					<text class="stat-num">{{ favCount }}</text>
					<text class="stat-label">收藏</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="stat-num">{{ remCount }}</text>
					<text class="stat-label">提醒</text>
				</view>
				<view class="stat-line"></view>
				<view class="stat">
					<text class="stat-num stat-ver">{{ current }}</text>
					<text class="stat-label">当前版本</text>
				</view>
			</view>
		</view>

		<view class="content">

		<!-- 我的收藏：只列快照里查得到的，查不到的（太老的发射）不占位 -->
		<view class="block" v-if="favs.length">
			<view class="block-head">
				<text class="block-title">我的收藏</text>
				<text class="block-sub">{{ favCount }} 条</text>
			</view>
			<view class="rows">
				<view
					class="row"
					v-for="x in favs"
					:key="'f' + x.id"
					hover-class="row-hover"
					@click="goLaunch(x.id)"
				>
					<image v-if="x.imageThumb" class="row-img" :src="x.imageThumb" mode="aspectFill" lazy-load></image>
					<view v-else class="row-img row-ph"><text class="row-ph-icon">🚀</text></view>
					<view class="row-body">
						<text class="row-name">{{ x.name }}</text>
						<text class="row-meta">{{ metaOf(x) }}</text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>

		<!-- 收藏的火箭：型号库反查名字与配图，查不到的不占位 -->
		<view class="block" v-if="rockets.length">
			<view class="block-head">
				<text class="block-title">收藏的火箭</text>
				<text class="block-sub">{{ rocketCount }} 个型号</text>
			</view>
			<view class="rows">
				<view
					class="row"
					v-for="x in rockets"
					:key="'rk' + x.id"
					hover-class="row-hover"
					@click="goRocket(x.id)"
				>
					<image v-if="x.image" class="row-img" :src="x.image" mode="aspectFill" lazy-load></image>
					<view v-else class="row-img row-ph"><text class="row-ph-icon">🚀</text></view>
					<view class="row-body">
						<text class="row-name">{{ x.name }}</text>
						<text class="row-meta">运载火箭</text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>

		<view class="block" v-if="rems.length">
			<view class="block-head">
				<text class="block-title">我的提醒</text>
				<text class="block-sub">{{ remCount }} 条</text>
			</view>
			<view class="rows">
				<view
					class="row"
					v-for="x in rems"
					:key="'r' + x.id"
					hover-class="row-hover"
					@click="goLaunch(x.id)"
				>
					<image v-if="x.imageThumb" class="row-img" :src="x.imageThumb" mode="aspectFill" lazy-load></image>
					<view v-else class="row-img row-ph"><text class="row-ph-icon">🔔</text></view>
					<view class="row-body">
						<text class="row-name">{{ x.name }}</text>
						<text class="row-meta">{{ metaOf(x) }}</text>
					</view>
					<text class="arrow">›</text>
				</view>
			</view>
		</view>

		<!-- 三份清单都空时给一句引导，而不是什么都不放 -->
		<view class="tips" v-if="!favs.length && !rems.length && !rockets.length">
			<text class="tips-icon">☆</text>
			<text class="tips-text">在详情页点「☆ 收藏」或「提醒」，你的清单会出现在这里</text>
		</view>

		<view class="block">
			<text class="block-title block-title-standalone">探索</text>
			<view class="grid">
				<view
					class="cell"
					v-for="e in entries"
					:key="e.name"
					hover-class="cell-hover"
					@click="go(e)"
				>
					<text class="cell-icon">{{ e.icon }}</text>
					<text class="cell-name">{{ e.name }}</text>
					<text class="cell-desc">{{ e.desc }}</text>
				</view>
			</view>
		</view>

		<view class="block">
			<text class="block-title block-title-standalone">关于</text>

			<view class="about">
				<view class="about-row" hover-class="about-hover" @click="goVersion">
					<text class="about-label">版本记录</text>
					<view class="about-right">
						<text class="about-value">{{ current }}</text>
						<text class="arrow">›</text>
					</view>
				</view>

				<view class="about-divider"></view>

				<view class="about-row">
					<text class="about-label">数据来源</text>
					<text class="about-value">The Space Devs</text>
				</view>

				<view class="about-divider"></view>

				<view class="about-row">
					<text class="about-label">卫星编目</text>
					<text class="about-value">GCAT</text>
				</view>

				<view class="about-divider"></view>

				<view class="about-row">
					<text class="about-label">同步频率</text>
					<text class="about-value">每日自动</text>
				</view>

				<view class="about-divider"></view>

				<!-- 「联系作者」走的仍是微信客服通道（open-type=contact）：
				     小程序没有直接给个人发消息的 API，作者在客服后台收消息即可。
				     必须是原生 button，换成 view 点了不会动 -->
				<button class="about-row contact-btn" open-type="contact" hover-class="about-hover">
					<text class="about-label">联系作者</text>
					<view class="about-right">
						<text class="about-value">发消息</text>
						<text class="arrow">›</text>
					</view>
				</button>
			</view>

			<text class="about-note">发射与活动数据来自 Launch Library 2 API，活动信息以官方发布为准。卫星编目与在轨资产统计数据来自 GCAT (J. McDowell, planet4589.org/space/gcat)，采用 CC-BY 授权。</text>
		</view>

		<view class="footer">
			<text class="footer-text">SpaceLaunch · 为航天爱好者而做</text>
		</view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { CHANGELOG } from '@/utils/changelog.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { snapshot as favSnapshot, rocketSnapshot as rocketFavSnapshot } from '@/utils/favorites.js'
import { formatShort, relativeTime } from '@/utils/format.js'
import navMixin from '@/utils/nav-mixin.js'

const REMIND_KEY = 'reminded_launches'
// 每份清单最多露几条：收藏可能是几十条，全铺开这一页就成了列表页
const SHOW_MAX = 5
// tab 页在 tabBar 里的位置（今日 0 / 发射 1 / 图库 2 / 火箭 3 / 我的 4）
const TAB_INDEX = 4

export default {
	mixins: [navMixin],

	data() {
		return {
			favCount: 0,
			remCount: 0,
			rocketCount: 0,
			favs: [],
			rems: [],
			rockets: [],
			// 探索区：数据统计是老入口；卫星百科 / 全球在轨 / 解体再入
			// 来自 GCAT 季度编目（CC-BY），各详情页都带 GCAT 署名。
			// 图库本身是底部 tab，不再放进探索网格，避免和 tabBar 重复。
			// 航天资讯 v3.2.10 起移到今日页底部（那儿才是它该在的位置），
			// 空出的席位给「近期活动」—— 活动是需要照做的日程，当资料查更合适
			entries: [
				{ icon: '📊', name: '数据统计', desc: '历年发射量', url: '/pages/stats/stats' },
				// GCAT 三项同一套数据源、同一批读者：查天上有什么、后来怎么样，合成一个入口
				{ icon: '🛰️', name: '太空资产', desc: '在轨统计 · 卫星百科 · 解体再入', url: '/pages/space-assets/space-assets' },
				// 近地天体不是同一套东西（NASA NeoWs，外面的小天体飞过来），单独一格
				{ icon: '☄️', name: '近地天体', desc: '未来一周掠地日程', url: '/pages/neo/neo' },
				{ icon: '📅', name: '近期活动', desc: 'EVA · 轨道插入 · 飞掠', url: '/pages/event/event' }
			]
		}
	},

	// 收藏和提醒都可能在其他页面被改动，回到这个 tab 时重新读一次
	onShow() {
		syncTabBar(TAB_INDEX)
		this.loadMine()
	},

	// tab 页不能带参数（也不该把别人的收藏带出去）；标题只说自己的足迹规模
	onShareAppMessage() {
		return {
			title: this.mineShareTitle(),
			path: '/pages/mine/mine'
		}
	},

	onShareTimeline() {
		return {
			title: this.mineShareTitle(),
			query: ''
		}
	},

	computed: {
		current() {
			const last = CHANGELOG[CHANGELOG.length - 1]
			return last ? last.version : '—'
		}
	},

	methods: {
		mineShareTitle() {
			const parts = []
			if (this.favCount) parts.push('收藏 ' + this.favCount + ' 次发射')
			if (this.rocketCount) parts.push('关注 ' + this.rocketCount + ' 型火箭')
			return parts.length ? '我的太空足迹 · ' + parts.join(' · ') : 'SpaceLaunch · 追踪全球航天发射'
		},

		fmtShort(v) {
			return formatShort(v)
		},
		relTime(v) {
			return relativeTime(v)
		},

		metaOf(x) {
			const parts = [this.fmtShort(x.net), this.relTime(x.net)]
			const st = x.status && (x.status.nameZh || x.status.name)
			if (st) parts.push(st)
			return parts.filter(Boolean).join(' · ')
		},

		goLaunch(id) {
			if (id == null) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + id })
		},

		goRocket(id) {
			if (id == null) return
			uni.navigateTo({ url: '/pages/rocket/rocket?id=' + id })
		},

		goVersion() {
			uni.navigateTo({ url: '/pages/version/version' })
		},

		go(e) {
			if (e.tab) {
				uni.switchTab({ url: e.url })
				return
			}
			uni.navigateTo({ url: e.url })
		},

		/**
		 * 读本地收藏 / 提醒，再从发射快照里补上名字和图片。
		 *
		 * 两边都只存 id（favorites.js 的既定设计：快照天天变，存对象会过期），
		 * 所以必须反查一次。upcoming 与 previous 各拉一次就够，
		 * 不用逐条 findLaunchById —— 那是 N 次网络往返。
		 */
		async loadMine() {
			// 火箭收藏是独立清单，和发射快照没有依赖，先并行拉起来
			this.loadRockets()

			let favIds = []
			let remIds = []
			try {
				favIds = Array.from(favSnapshot())
			} catch (e) {
				favIds = []
			}
			try {
				const raw = uni.getStorageSync(REMIND_KEY)
				remIds = Array.isArray(raw) ? raw : []
			} catch (e) {
				remIds = []
			}

			// 计数按记录条数算（哪怕快照里已经查不到这条的详情）
			this.favCount = favIds.length
			this.remCount = remIds.length

			if (!favIds.length && !remIds.length) {
				this.favs = []
				this.rems = []
				return
			}

			let up = null
			let prev = null
			try {
				const r = await Promise.all([
					spaceData.load('upcoming').catch(() => null),
					spaceData.load('previous').catch(() => null)
				])
				up = r[0]
				prev = r[1]
			} catch (e) {
				// 两个都拿不到就只显示计数，不显示清单
			}

			const map = new Map()
			for (const d of [up, prev]) {
				for (const x of (d && d.list) || []) map.set(String(x.id), x)
			}

			const pick = (ids) =>
				ids
					.map((id) => map.get(String(id)))
					.filter(Boolean)
					.slice(0, SHOW_MAX)

			this.favs = pick(favIds)
			this.rems = pick(remIds)
		},

		/**
		 * 收藏的火箭：同样只存 id，靠 launchers 型号库反查名字和配图。
		 * 型号库里查不到的（已下架构型）不占位，和发射收藏的处理一致。
		 */
		async loadRockets() {
			let ids = []
			try {
				ids = Array.from(rocketFavSnapshot())
			} catch (e) {
				ids = []
			}
			// 计数按记录条数算（哪怕型号库里已经查不到这条）
			this.rocketCount = ids.length
			if (!ids.length) {
				this.rockets = []
				return
			}

			let list = []
			try {
				const d = await spaceData.load('launchers')
				list = (d && d.list) || []
			} catch (e) {
				list = []
			}

			const map = new Map()
			for (const x of list) map.set(String(x.id), x)

			this.rockets = ids
				.map((id) => map.get(String(id)))
				.filter(Boolean)
				.slice(0, SHOW_MAX)
				.map((x) => ({
					id: x.id,
					name: x.name || x.full_name || '未知型号',
					image: x.image || ''
				}))
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	position: relative;
	min-height: 100vh;
	/* 这里不能设 background：星空组件是 z-index:-1，页面一旦有不透明底色，
	   160 颗星就会被整块盖住（其它 tab 页都是靠 pages.json 的 globalStyle 兜底色）。
	   左右内边距不放在 page 上：身份区要铺满整宽，
	   排版留白由 .hero 与 .content 各自负责 */
}

/* ---- 沉浸式身份区 ----
   没有卡片边框、没有圆角、没有左右留白，辉光和背景直接连着页面，
   视觉上是「这个人属于这个空间」，而不是「一张浮在背景上的名片」 */
.hero {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-left: 32rpx;
	padding-right: 32rpx;
	padding-bottom: 40rpx;
	overflow: hidden;
}

/* 顶部一团青色辉光，纯装饰；overflow:hidden 保证它不会溢出到别的区域 */
.hero-glow {
	position: absolute;
	top: -180rpx;
	left: 50%;
	width: 760rpx;
	height: 620rpx;
	margin-left: -380rpx;
	background: radial-gradient(
		circle at 50% 46%,
		rgba(56, 189, 248, 0.26) 0%,
		rgba(56, 189, 248, 0.07) 42%,
		rgba(56, 189, 248, 0) 68%
	);
	pointer-events: none;
}

.content {
	padding: 0 32rpx 90rpx;
}

.logo {
	position: relative;
	width: 152rpx;
	height: 152rpx;
	border-radius: 50%;
	border: 2rpx solid rgba(56, 189, 248, 0.3);
}

/* 品牌字标：Space 白 + Launch 青，参考航天媒体的双色站标做法。
   系统字体在 iOS 上 900 会落到 SF Pro Black，安卓多数机型只有 Bold，
   退一级也不会塌 —— 所以字重比配色调得更激进一点才稳 */
.brand {
	position: relative;
	display: flex;
	align-items: baseline;
	margin-top: 26rpx;
	font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
	font-size: 56rpx;
	font-weight: 900;
	line-height: 1.16;
	letter-spacing: -1rpx;
}

.brand-a {
	color: #ffffff;
}

.brand-b {
	color: #22d3ee;
	text-shadow: 0 0 28rpx rgba(34, 211, 238, 0.42);
}

.slogan {
	margin-top: 14rpx;
	color: #7d8ba0;
	font-size: 24rpx;
	letter-spacing: 1rpx;
}

.stats {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	margin-top: 40rpx;
	padding: 26rpx 0 30rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.06);
}

.stat {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.stat-num {
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.1;
}

/* 版本号是 3.1.18 这种长串，字号降一档才排得进三分之一格 */
.stat-ver {
	font-size: 32rpx;
	letter-spacing: 1rpx;
}

.stat-label {
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.stat-line {
	width: 1rpx;
	height: 46rpx;
	background: rgba(255, 255, 255, 0.07);
}

/* ---- 通用区块 ---- */
.block {
	margin-top: 44rpx;
}

.block-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.block-title {
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.block-title-standalone {
	display: block;
	margin-bottom: 20rpx;
}

.block-sub {
	color: #6b7891;
	font-size: 24rpx;
}

/* ---- 收藏 / 提醒清单 ---- */
.rows {
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 22rpx;
	overflow: hidden;
}

.row {
	display: flex;
	align-items: center;
	padding: 20rpx 24rpx;
}

.row-hover {
	background: rgba(255, 255, 255, 0.04);
}

.row-img {
	width: 96rpx;
	height: 96rpx;
	flex-shrink: 0;
	border-radius: 14rpx;
	background: #0f1520;
}

.row-ph {
	display: flex;
	align-items: center;
	justify-content: center;
}

.row-ph-icon {
	font-size: 44rpx;
	opacity: 0.45;
}

.row-body {
	flex: 1;
	min-width: 0;
	margin: 0 18rpx;
}

/* 发射名是「型号 | 任务名」，单行放不下时留两行 ——
   截成一个 「Falcon 9 Block 5 | Starlink Group 15…」 看不出是哪次任务 */
.row-name {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
	color: #e2e8f0;
	font-size: 28rpx;
	font-weight: 500;
	line-height: 1.4;
}

.row-meta {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 23rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.arrow {
	flex-shrink: 0;
	color: #3d4a5c;
	font-size: 32rpx;
}

/* ---- 空态引导 ---- */
.tips {
	display: flex;
	align-items: center;
	margin-top: 34rpx;
	padding: 30rpx 28rpx;
	background: rgba(56, 189, 248, 0.05);
	border: 1rpx dashed rgba(56, 189, 248, 0.2);
	border-radius: 20rpx;
}

.tips-icon {
	flex-shrink: 0;
	margin-right: 16rpx;
	color: #38bdf8;
	font-size: 34rpx;
}

.tips-text {
	flex: 1;
	color: #7d8ba0;
	font-size: 25rpx;
	line-height: 1.6;
}

/* ---- 探索网格 ---- */
.grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
}

.cell {
	width: 48.6%;
	margin-bottom: 18rpx;
	padding: 26rpx 24rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
	box-sizing: border-box;
}

.cell-hover {
	background: #1a2231;
}

.cell-icon {
	display: block;
	font-size: 38rpx;
	line-height: 1;
}

.cell-name {
	display: block;
	margin-top: 16rpx;
	color: #e2e8f0;
	font-size: 29rpx;
	font-weight: 600;
}

.cell-desc {
	display: block;
	margin-top: 6rpx;
	color: #5f6b80;
	font-size: 22rpx;
}

/* ---- 关于 ---- */
.about {
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 22rpx;
	overflow: hidden;
}

.about-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 28rpx 26rpx;
}

.about-hover {
	background: rgba(255, 255, 255, 0.04);
}

.about-label {
	color: #e2e8f0;
	font-size: 28rpx;
}

.about-right {
	display: flex;
	align-items: center;
}

.about-value {
	color: #6b7891;
	font-size: 26rpx;
}

.about-right .arrow {
	margin-left: 10rpx;
}

.about-divider {
	height: 1rpx;
	margin: 0 26rpx;
	background: rgba(255, 255, 255, 0.045);
}

/* 客服行：原生 button 自带的背景、边框、圆角、字号、居中全要清掉，
   才能和上面几行 view 长得一模一样 */
.contact-btn {
	width: 100%;
	margin: 0;
	padding: 28rpx 26rpx;
	background: transparent;
	border-radius: 0;
	line-height: normal;
	font-size: inherit;
	font-weight: normal;
	color: inherit;
	text-align: left;
	box-sizing: border-box;
}

/* 小程序 button 默认有一条 ::after 边框，不去掉会和分隔线重影 */
.contact-btn::after {
	border: none;
}

.about-note {
	display: block;
	margin-top: 18rpx;
	padding: 0 6rpx;
	color: #4d596b;
	font-size: 22rpx;
	line-height: 1.7;
}

.footer {
	margin-top: 56rpx;
	text-align: center;
}

.footer-text {
	color: #35404f;
	font-size: 21rpx;
	letter-spacing: 1rpx;
}
</style>
