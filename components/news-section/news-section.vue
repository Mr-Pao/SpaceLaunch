<template>
	<!-- 没数据就整块不渲染：否则今日页的空态判断会被这一块「有节点但没内容」的
	     空壳带偏，出现「空态提示 + 一个空标题」并排 -->
	<view class="news" v-if="loading || visible.length">
		<view class="news-head">
			<text class="news-title">航天资讯</text>
			<view class="news-more" hover-class="news-more-hover" @click="goAll">
				<text>全部</text>
				<text class="news-arrow">›</text>
			</view>
		</view>

		<view class="news-list">
			<!-- 骨架屏形状对齐真实行（左缩略图 + 右两行文字），
			     不然数据到位时整块会往下跳一次 -->
			<template v-if="loading">
				<view class="sk-row" v-for="i in limit" :key="'sk' + i">
					<view class="sk-thumb"></view>
					<view class="sk-info">
						<view class="sk-line" style="width: 92%"></view>
						<view class="sk-line" style="width: 58%"></view>
					</view>
				</view>
			</template>

			<template v-else>
				<view class="row" v-for="n in visible" :key="n.id" hover-class="row-hover" @click="goDetail(n)">
					<image v-if="n.image" class="thumb" :src="n.image" mode="aspectFill" lazy-load></image>
					<view v-else class="thumb thumb-empty">
						<text class="thumb-ico">🛰</text>
					</view>
					<view class="info">
						<text class="title">{{ n.titleZh || n.title }}</text>
						<view class="meta">
							<text class="site">{{ n.site }}</text>
							<text class="sep">·</text>
							<text class="time">{{ n.atShort }}</text>
							<text class="tag" v-if="n.launches && n.launches.length">发射</text>
						</view>
					</view>
				</view>
			</template>
		</view>

		<!-- 下拉到底自动续上一批（宿主页 onReachBottom 驱动），
		     这一行只说清「还有没有」，不做可点按钮 -->
		<view class="news-hint" v-if="!loading">
			<text v-if="hasMore">上拉加载更多 · 已显示 {{ visible.length }}/{{ items.length }}</text>
			<text v-else>已显示全部 {{ items.length }} 条</text>
		</view>

		<view class="news-foot" v-if="items.length && !loading" hover-class="news-foot-hover" @click="goAll">
			<text>查看全部资讯</text>
			<text class="news-arrow">›</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

/**
 * 首页底部的「航天资讯」板块。
 *
 * 资讯原本挂在「我的 → 探索」网格末位，那里是管理收藏/提醒的地方，
 * 没人会去那儿刷新闻 —— 而资讯恰好是全站唯一高频滚动、有时效性的内容
 * （每 3 小时一轮，近七成能回连发射详情）。所以把它提到今日页底部，
 * 和「近期活动」对调：活动是要照做的日程，放探索当资料更合适。
 *
 * 这里只做「预览」：默认露 3 条，滚到底自动续，点卡片直接打开资讯页
 * 并弹出那一条的详情抽屉，不另外做一套阅读界面。
 */
export default {
	// limit 是「首屏露几条」，同时也是每次下拉追加的步长
	props: {
		limit: { type: Number, default: 3 }
	},

	data() {
		return {
			// 全量留在内存（news.json 几十 KB），只控制露几条
			items: [],
			shown: 0,
			// 首次拉取期间显示骨架屏：今日页其它块都是「数据没到就先占位」，
			// 这一块如果真空白，滚到这儿会以为页面断了
			loading: true
		}
	},

	computed: {
		visible() {
			return this.items.slice(0, this.shown)
		},
		hasMore() {
			return this.shown < this.items.length
		}
	},

	created() {
		this.load()
	},

	methods: {
		/**
		 * @param {boolean} force 下拉刷新时传 true，绕过 TTL 缓存真去拉。
		 *   不传就只读缓存 —— 首次进首页不该为了「可能没变」的资讯空跑一次网络。
		 */
		async load(force) {
			try {
				const d = await spaceData.load('news', { force: !!force })
				this.items = (d && d.list) || []
				this.shown = Math.min(this.limit, this.items.length)
			} catch (e) {
				console.warn('[news-section] 加载资讯失败', e)
			} finally {
				// 失败也要收骨架屏，否则它会一直呼吸、像是永远在加载
				this.loading = false
			}
		},

		// 由宿主页的 onReachBottom 调用（组件自己拿不到页面滚动事件）
		loadMore() {
			if (!this.hasMore) return 0
			const before = this.shown
			this.shown = Math.min(this.shown + this.limit, this.items.length)
			return this.shown - before
		},

		/**
		 * 宿主下拉刷新时调用。
		 * 已展开的条数要保留 —— 用户滚到第 9 条时下拉一下，
		 * 列表被收回 3 条会显得「刷新把我位置弄丢了」。
		 * 也不重开骨架屏：有旧内容在，闪一下占位比不闪更糟。
		 *
		 * 必须传 force：不传的话 load 只读 TTL 缓存，
		 * 用户下拉了却看到一模一样的内容，等于这个手势没反应。
		 */
		async reload() {
			const keep = this.shown
			await this.load(true)
			this.shown = Math.max(this.limit, Math.min(keep, this.items.length))
		},

		/** 点卡片：进资讯页并直接展开这一条，省掉「再找一遍」的一步 */
		goDetail(n) {
			if (!n || n.id == null) return
			uni.navigateTo({ url: '/pages/news/news?id=' + encodeURIComponent(n.id) })
		},

		goAll() {
			uni.navigateTo({ url: '/pages/news/news' })
		}
	}
}
</script>

<style lang="scss" scoped>
.news {
	margin-top: 44rpx;
}

.news-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.news-title {
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.news-more {
	display: flex;
	align-items: center;
	color: #6b7891;
	font-size: 24rpx;
}

.news-arrow {
	font-size: 30rpx;
	margin-left: 4rpx;
}

/* 骨架屏：缩略图尺寸、圆角、外边距全部对齐 .row */
.sk-row {
	display: flex;
	align-items: center;
	padding: 20rpx 22rpx;
	margin-bottom: 16rpx;
	border-radius: 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	animation: news-breathe 1.4s ease-in-out infinite;
}

@keyframes news-breathe {
	0%, 100% { opacity: 0.45; }
	50% { opacity: 1; }
}

.sk-thumb {
	width: 176rpx;
	height: 132rpx;
	border-radius: 14rpx;
	background: #1a2231;
	flex-shrink: 0;
}

.sk-info {
	flex: 1;
	margin-left: 20rpx;
}

.sk-line {
	height: 24rpx;
	margin-bottom: 16rpx;
	border-radius: 8rpx;
	background: #1a2231;
}

.sk-line:last-child {
	margin-bottom: 0;
}

.row {
	display: flex;
	align-items: center;
	padding: 20rpx 22rpx;
	margin-bottom: 16rpx;
	border-radius: 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.row-hover {
	opacity: 0.82;
}

.thumb {
	width: 176rpx;
	height: 132rpx;
	border-radius: 14rpx;
	flex-shrink: 0;
	background: #0b1118;
}

.thumb-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.thumb-ico {
	font-size: 44rpx;
	opacity: 0.35;
}

.info {
	flex: 1;
	margin-left: 20rpx;
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

.meta {
	margin-top: 10rpx;
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	color: #6b7891;
	font-size: 22rpx;
}

.site {
	max-width: 240rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.sep {
	margin: 0 8rpx;
	opacity: 0.6;
}

.tag {
	margin-left: 12rpx;
	padding: 2rpx 12rpx;
	background: rgba(56, 189, 248, 0.12);
	color: #7bb8e0;
	font-size: 20rpx;
	border-radius: 6rpx;
}

.news-hint {
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 4rpx 0 20rpx;
	color: #4d596b;
	font-size: 22rpx;
}

.news-foot {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 76rpx;
	margin-top: 4rpx;
	color: #7fb6dc;
	font-size: 26rpx;
	background: rgba(56, 189, 248, 0.08);
	border: 1rpx solid rgba(56, 189, 248, 0.18);
	border-radius: 16rpx;
}

.news-foot-hover {
	background: rgba(56, 189, 248, 0.14);
}
</style>
