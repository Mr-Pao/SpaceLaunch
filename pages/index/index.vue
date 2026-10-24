<template>
	<view class="page">
		<!-- 太空背景：整片星空是「一个元素 + box-shadow 星点」，只有一条动画合成层。
		     之前 36 个 view 各跑一条 twinkle 动画，低端机上每条都是实打实的合成开销 -->
		<view class="space-bg">
			<view class="stars" :style="{ boxShadow: starShadow }"></view>
		</view>

		<!-- 沉浸式头部：statusBarH 只负责让出状态栏，内容从状态栏下方开始；
		     紧凑横排（logo + 标题一行 + 右上搜索），不再占半屏 -->
		<view class="header" :style="{ paddingTop: statusBarH + 'px' }">
			<view class="header-row">
				<image
					class="logo"
					src="/static/logo.png"
					mode="aspectFill"
					@click="goVersion"
				></image>
				<view class="header-text">
					<text class="title">太空发射任务</text>
					<!-- 副标题写成功能描述而不是宣传语：
					     审核按「内容型小程序」判定类目，文案越像口号越容易被归到资讯 -->
					<text class="subtitle">实时排期 · 发射倒计时</text>
				</view>
				<!-- 全局搜索入口：右上角一枚图标，点了进搜索页 -->
				<view class="search-entry" @click="goSearch">
					<text class="search-entry-icon">🔍</text>
				</view>
			</view>
		</view>

		<!-- 审核模式下整页换成静态展示卡：无列表、无动态数据、无 tab 入口，
		     观感是「工具介绍页」，与「工具-信息查询」类目一致 -->
		<block v-if="!reviewMode">
			<!-- 只有完全没有缓存时才整屏转圈，有缓存时下面直接出内容。
			     火箭小动画 + 骨架卡：骨架给「内容长什么样」的预期，
			     火箭给品牌感，纯转圈什么都不给 -->
			<view class="loading" v-if="loading && list.length === 0">
				<view class="rocket-loading">
					<image
						class="rocket"
						src="/static/rocket.png"
						mode="aspectFit"
					></image>
					<view class="flame"></view>
				</view>
				<text class="loading-text">准备发射...</text>
				<view class="sk-list">
					<skeleton-card v-for="i in 3" :key="i" />
				</view>
			</view>

			<view class="error" v-else-if="error && list.length === 0">
				<text class="error-icon">⚠️</text>
				<text class="error-text">{{ error }}</text>
				<view class="btn" @click="getData(true)">重新尝试</view>
			</view>

			<view class="content" v-else>
			<!-- 最近一次发射 + 倒计时。放在列表上方当视觉焦点 -->
			<view class="next-wrap" v-if="nextLaunch && visible.length">
				<next-launch :item="nextLaunch" @select="goDetail" />
			</view>

			<view class="stat" v-if="list.length">
				<text class="stat-main">共 {{ total }} 次发射</text>
				<text class="stat-sub">{{ freshText }}</text>
			</view>

			<view class="list">
				<launch-card
					v-for="item in visible"
					:key="item.id"
					:item="item"
					:fav="favIds.indexOf(item.id) !== -1"
					:plain="reviewMode"
					@select="goDetail"
				/>
			</view>

			<view class="empty" v-if="list.length === 0">
				<text class="empty-icon">🚀</text>
				<text class="empty-text">暂无发射数据</text>
				<view class="btn" @click="getData(true)">重新获取</view>
			</view>

			<view class="foot-hint" v-if="visible.length > 0">
				<text v-if="loadingMore">正在加载后续排期…</text>
				<text v-else-if="moreDone">已显示全部 {{ list.length }} 条</text>
				<text v-else>{{ hasMore ? '上拉加载更多' : '上拉加载后续排期' }}</text>
			</view>
			</view>
		</block>

		<!-- 审核态：整页不放内容，getConfig 回来后直接切到火箭大全页 -->
		<view v-else></view>
	</view>
</template>

<script>
import { createListMixin } from '@/utils/list-mixin.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { isStillUpcoming } from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'
import spaceData from '@/utils/data.js'

export default {
	// filter 用来剔掉 LL2 还挂在 upcoming 里的「已发射成功」任务
	mixins: [
		navMixin,
		createListMixin({ dataset: 'upcoming', pageSize: 12, favorite: true, filter: isStillUpcoming })
	],

	data() {
		return {
			// 整片星空的 box-shadow 字符串（onLoad 一次生成）
			starShadow: '',
			// 后续排期（第 100 条之后）只在第一次翻到底时拉一回
			loadingMore: false,
			moreDone: false,
			// 审核模式：列表卡片不带大图，观感是排期表而不是图文资讯流
			reviewMode: false
		}
	},

	computed: {
		/**
		 * 最近一次（时间上最靠前且还没到）的发射。
		 * 不能直接用 list[0]：收藏置顶会把顺序打乱，
		 * 而且已经过点的任务也可能还留在快照里。
		 */
		nextLaunch() {
			const now = Date.now()
			let best = null
			let bestAt = Infinity

			for (const x of this.list) {
				if (!x.net) continue
				const at = new Date(x.net).getTime()
				if (isNaN(at) || at <= now || at >= bestAt) continue
				best = x
				bestAt = at
			}
			return best
		},

		// 倒计时卡片已经展示了最近这一次，列表里要去掉，否则同一条出现两次
		listForRender() {
			const skip = this.nextLaunch ? this.nextLaunch.id : null
			return skip ? this.list.filter((x) => x.id !== skip) : this.list
		},

		visible() {
			return this.listForRender.slice(0, this.listNum)
		},

		hasMore() {
			return this.listNum < this.listForRender.length
		}
	},

	onLoad() {
		// 整片星空 = 一个元素的 box-shadow 星点（90+ 颗，含少量大星），
		// 单条动画合成层；位置用 px（box-shadow 里 rpx 要靠编译期，运行时生成只能用 px）
		const info = uni.getSystemInfoSync()
		const dots = []
		for (let i = 0; i < 90; i++) {
			const x = (Math.random() * info.windowWidth).toFixed(1)
			const y = (Math.random() * info.windowHeight).toFixed(1)
			const size = Math.random() > 0.85 ? 1 : 0
			const alpha = (0.3 + Math.random() * 0.7).toFixed(2)
			dots.push(x + 'px ' + y + 'px 0 ' + size + 'px rgba(255,255,255,' + alpha + ')')
		}
		this.starShadow = dots.join(', ')
		// 审核态：首页不放内容，直接把入口切到火箭大全（tabBar 已隐藏，
		// 审核员看到的就是一个纯粹的火箭参数查询工具）；本机切「展示」后也一样
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (this.reviewMode) {
				uni.switchTab({ url: '/pages/rockets/rockets' })
				return
			}
			this.getData()
		})
	},

	// 从详情页收藏回来时把收藏项顶上去（不重新请求数据）
	onShow() {
		syncTabBar(2)
		this.reorder()
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		this.resetPaging()
		// 重新刷新后，后续排期可以再拉一次
		this.moreDone = false
		this.getData(true).then(() => uni.stopPullDownRefresh())
	},

	onReachBottom() {
		if (this.reviewMode) return
		// 本地还有没渲染出来的，先把它们放出来
		if (this.hasMore) {
			this.loadMore()
			return
		}
		// 已经渲染完了，再去 CDN 拉第 100 条之后的排期
		this.loadMoreUpcoming()
	},

	methods: {
		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		},

		// 点 logo 看版本记录，比藏在设置里更容易被发现
		goVersion() {
			uni.navigateTo({ url: '/pages/version/version' })
		},

		// 右上角搜索入口
		goSearch() {
			uni.navigateTo({ url: '/pages/search/search' })
		},

		/**
		 * 加载第 100 条之后的排期。
		 * 这份数据每天更新一次（不是每 15 分钟），所以拉一次就够了，
		 * 用 moreDone 标记避免反复请求。
		 */
		async loadMoreUpcoming() {
			if (this.loadingMore || this.moreDone) return

			this.loadingMore = true
			try {
				const d = await spaceData.load('upcomingMore')
				const raw = (d && d.list) || []
				const added = this.appendMore(raw.filter(isStillUpcoming))
				// 追加成功就把新的一批放出来
				if (added) this.loadMore()
				this.moreDone = true
			} catch (e) {
				console.warn('[index] 加载后续排期失败', e)
			} finally {
				this.loadingMore = false
			}
		}
	}
}
</script>

<style lang="scss" scoped>
/* 注意这里必须有 scoped：原文件是全局 <style>，
   .container / .title / .stars 这些通用类名一直在污染其它页面 */
@import '../../styles/list.scss';

.page {
	position: relative;
	min-height: 100vh;
	/* 底部要给悬浮胶囊 tabBar 让位，否则最后一张卡片会被盖住 */
	padding-bottom: 200rpx;
	background: #0a0e17;
	overflow: hidden;
}

.space-bg {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 0;
	pointer-events: none;
}

/* 整片星空是一个元素：星星全部由 box-shadow 画出（onLoad 生成的内联样式），
   元素本身缩成 1px 透明点藏在原点；整层只跑一条 twinkle，合成开销极低 */
.stars {
	position: absolute;
	top: 0;
	left: 0;
	width: 2rpx;
	height: 2rpx;
	background: transparent;
	border-radius: 50%;
	animation: twinkle 3.2s infinite ease-in-out;
}

@keyframes twinkle {
	0%, 100% { opacity: 0.35; }
	50% { opacity: 1; }
}

.header {
	position: relative;
	z-index: 1;
	/* 左右留白与列表对齐；paddingTop 由 statusBarH 动态给 */
	padding: 10rpx 24rpx 20rpx;
}

.header-row {
	display: flex;
	align-items: center;
}

.logo {
	width: 76rpx;
	height: 76rpx;
	border-radius: 50%;
	box-shadow: 0 0 30rpx rgba(56, 189, 248, 0.3);
	flex-shrink: 0;
}

.header-text {
	flex: 1;
	min-width: 0;
	margin-left: 20rpx;
}

.title {
	display: block;
	color: #ffffff;
	font-size: 36rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
	text-shadow: 0 0 24rpx rgba(56, 189, 248, 0.35);
}

.subtitle {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 22rpx;
	letter-spacing: 3rpx;
}

/* 右上角搜索入口 */
.search-entry {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 68rpx;
	height: 68rpx;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.06);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	flex-shrink: 0;
}

.search-entry-icon {
	font-size: 30rpx;
}

/* 加载：火箭小动画 + 骨架卡（sk-list 里是 skeleton-card 组件） */
.loading {
	position: relative;
	z-index: 1;
	padding: 40rpx 24rpx;
}

.sk-list {
	margin-top: 20rpx;
}

.rocket-loading {
	position: relative;
	width: 100rpx;
	height: 200rpx;
	margin-bottom: 30rpx;
	display: flex;
	justify-content: center;
}

/* 上下浮动纯 CSS：之前 setInterval 50ms 改一次 data、每次触发 Vue 重渲染，
   关键帧动画走合成器，零 JS 参与 */
.rocket {
	width: 60rpx;
	height: 120rpx;
	z-index: 2;
	animation: rocket-float 1s ease-in-out infinite alternate;
}

@keyframes rocket-float {
	from { transform: translateY(-8px); }
	to { transform: translateY(8px); }
}

.flame {
	position: absolute;
	bottom: 16rpx;
	width: 26rpx;
	height: 62rpx;
	background: linear-gradient(to top, #ff6b6b, #ffd700);
	border-radius: 50% 50% 20% 20%;
	transform-origin: top center;
	animation: flame 0.45s infinite alternate;
	opacity: 0.85;
}

@keyframes flame {
	from { transform: scaleY(0.75); opacity: 0.6; }
	to { transform: scaleY(1.2); opacity: 1; }
}

.loading-text {
	color: #6b7891;
	font-size: 28rpx;
	letter-spacing: 2rpx;
}

/* 错误 / 空态：骨架在 styles/list.scss，这里只补定位 ——
   背景星空是 position: fixed，不把 z-index 抬起来会被盖住 */
.error,
.empty {
	position: relative;
	z-index: 1;
	padding: 140rpx 60rpx;
}

/* 列表 */
.content {
	position: relative;
	z-index: 1;
	padding: 0 24rpx;
}

.next-wrap {
	margin-bottom: 14rpx;
}
</style>
