<template>
	<!-- 没数据就整块不渲染：否则今日页的空态判断会被这一块「有节点但没内容」的
	     空壳带偏，出现「空态提示 + 一个空标题」并排 -->
	<view class="acts" v-if="loading || visible.length">
		<view class="acts-head">
			<text class="acts-title">近期活动</text>
			<view class="acts-more" hover-class="acts-more-hover" @click="goAll">
				<text>全部</text>
				<text class="acts-arrow">›</text>
			</view>
		</view>

		<view class="acts-list">
			<!-- 骨架屏：形状对齐活动卡（上图下文、封面 260rpx），
			     不复用 skeleton-card —— 那个是发射卡的「图左文右」，形状对不上，
			     占位和真卡一换会整块往下跳 -->
			<template v-if="loading">
				<view class="sk-card" v-for="i in limit" :key="'sk' + i">
					<view class="sk-cover"></view>
					<view class="sk-body">
						<view class="sk-line" style="width: 42%"></view>
						<view class="sk-line" style="width: 76%"></view>
						<view class="sk-line" style="width: 58%"></view>
					</view>
				</view>
			</template>

			<template v-else>
				<view class="card" v-for="item in visible" :key="item.id" hover-class="card-hover" @click="goDetail(item)">
					<image
						v-if="item.feature_image"
						class="cover"
						:src="item.feature_image"
						mode="aspectFill"
						lazy-load
					></image>
					<view v-else class="cover cover-empty">
						<text class="cover-icon">🛰️</text>
					</view>

					<view class="body">
						<view class="top">
							<text class="type">{{ (item.type && item.type.name) || '活动' }}</text>
							<text class="date">{{ formatShort(item.date) }}</text>
						</view>
						<text class="title">{{ eventName(item) }}</text>
						<view class="tags" v-if="item.location">
							<text class="tag">{{ placeName(item.location) }}</text>
						</view>
						<text class="desc" v-if="descOf(item)">{{ descOf(item) }}</text>
					</view>
				</view>
			</template>
		</view>

		<!-- 下拉到底自动续上一批（宿主页 onReachBottom 驱动），
		     这一行只说清「还有没有」，不做可点按钮。加载期不显示，
		     否则骨架屏脚下会挂一句「已显示全部 0 条」 -->
		<view class="acts-hint" v-if="!loading">
			<text v-if="hasMore">上拉加载更多 · 已显示 {{ visible.length }}/{{ items.length }}</text>
			<text v-else>已显示全部 {{ items.length }} 条</text>
		</view>

		<view class="acts-foot" v-if="items.length && !loading" hover-class="acts-foot-hover" @click="goAll">
			<text>查看全部活动</text>
			<text class="acts-arrow">›</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { formatShort, truncate, stationName, placeZh, eventName as eventNameOf } from '@/utils/format.js'

/**
 * 首页底部的「近期活动」板块。
 *
 * 活动原本是单独一个 tab 页（pages/event/event），v3.1.17 起把入口搬回首页底部，
 * 这里只做「预览」：取前 4 条 + 一个「查看全部活动」跳到完整活动页。
 * 完整列表仍留在 event 页，避免首页出现第二套分页体系。
 */
export default {
	// limit 是「首屏露几条」，同时也是每次下拉追加的步长。
	// 今日页整页是滚动容器，活动排在最后一屏，滚到底就自动续上一批，
	// 直到 27 条全部出来为止 —— 不需要「加载更多」按钮。
	props: {
		limit: { type: Number, default: 4 }
	},

	data() {
		return {
			// 全量留在内存里，只控制露几条：events.json 就 27 条，
			// 与其为了翻页再请求一遍，不如一次拿全、按需展示
			items: [],
			shown: 0,
			// 首次拉取期间显示骨架屏：今日页其它块都是「数据没到就先占位」，
			// 这一块以前是真空白，滚到这儿会以为页面断了
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
		formatShort,

		eventName(ev) {
			return eventNameOf(ev)
		},

		/**
		 * 活动地点：可能是空间站、发射场或机构，两种表都试一遍。
		 * 都没命中原样返回 —— 宁可不翻，也别把地点翻错。
		 */
		placeName(s) {
			if (!s) return ''
			const st = stationName(s)
			if (st !== s) return st
			return placeZh(s) || s
		},

		async load() {
			try {
				const d = await spaceData.load('events')
				this.items = (d && d.list) || []
				this.shown = Math.min(this.limit, this.items.length)
			} catch (e) {
				console.warn('[activity-section] 加载活动失败', e)
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

		descOf(item) {
			return truncate(item.descriptionZh || item.description, 50)
		},

		/** 卡片进详情页；「全部 / 查看全部活动」仍然去列表页 */
		goDetail(item) {
			if (!item || item.id == null) return
			uni.navigateTo({ url: '/pages/event/eventInfo?id=' + item.id })
		},

		goAll() {
			uni.navigateTo({ url: '/pages/event/event' })
		}
	}
}
</script>

<style lang="scss" scoped>
.acts {
	margin-top: 44rpx;
}

.acts-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.acts-title {
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.acts-more {
	display: flex;
	align-items: center;
	color: #6b7891;
	font-size: 24rpx;
}

.acts-arrow {
	font-size: 30rpx;
	margin-left: 4rpx;
}

/* 骨架屏：封面高度、圆角、外边距全部对齐 .card，
   数据到位后从占位换成真卡不会产生一次跳动 */
.sk-card {
	margin-bottom: 24rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	overflow: hidden;
	animation: acts-breathe 1.4s ease-in-out infinite;
}

@keyframes acts-breathe {
	0%, 100% { opacity: 0.45; }
	50% { opacity: 1; }
}

.sk-cover {
	width: 100%;
	height: 260rpx;
	background: #1a2231;
}

.sk-body {
	padding: 22rpx 28rpx 26rpx;
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

.card {
	margin-bottom: 24rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	overflow: hidden;
}

.card-hover {
	opacity: 0.85;
}

.cover {
	display: block;
	width: 100%;
	height: 260rpx;
	background: #0f1520;
}

.cover-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.cover-icon {
	font-size: 64rpx;
	opacity: 0.35;
}

.body {
	padding: 22rpx 28rpx 26rpx;
}

.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.type {
	color: #38bdf8;
	font-size: 24rpx;
}

.date {
	color: #6b7891;
	font-size: 24rpx;
}

.title {
	display: block;
	margin-top: 12rpx;
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.4;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 12rpx;
}

.tag {
	max-width: 100%;
	margin: 0 12rpx 8rpx 0;
	padding: 4rpx 16rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7bb8e0;
	font-size: 22rpx;
	border-radius: 6rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.desc {
	display: block;
	margin-top: 14rpx;
	color: #8a97a8;
	font-size: 26rpx;
	line-height: 1.6;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.acts-hint {
	display: flex;
	align-items: center;
	justify-content: center;
	margin: 4rpx 0 20rpx;
	color: #4d596b;
	font-size: 22rpx;
}

.acts-foot {
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

.acts-foot-hover {
	background: rgba(56, 189, 248, 0.14);
}
</style>
