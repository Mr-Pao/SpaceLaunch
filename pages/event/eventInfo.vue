<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? '活动详情' : ''" />

		<view class="state" v-if="loading">
			<text class="state-text">加载中...</text>
		</view>

		<view class="state" v-else-if="!ev">
			<text class="state-icon">🛰️</text>
			<text class="state-text">没有找到这项活动</text>
		</view>

		<block v-else>
			<!-- 首图直接顶到状态栏下面：和发射/航天器详情页一样是沉浸式，
			     滚动后导航栏才变实色并出标题 -->
			<view class="hero">
				<image
					v-if="ev.feature_image"
					class="hero-img"
					:src="ev.feature_image"
					mode="aspectFill"
					@click="preview"
				></image>
				<view v-else class="hero-img hero-ph">
					<text class="ph-icon">🛰️</text>
				</view>

				<view class="hero-mask"></view>

				<view class="hero-body">
					<view class="hero-tags">
						<text class="tag">{{ typeText }}</text>
						<text class="tag tag-loc" v-if="ev.location">{{ placeName(ev.location) }}</text>
					</view>
					<text class="hero-name">{{ eventName(ev) }}</text>
					<text class="hero-en" v-if="ev.nameZh && ev.name">{{ ev.name }}</text>
				</view>
			</view>

			<view class="body">
				<view class="card">
					<view class="card-title">时间</view>
					<view class="row">
						<text class="label">日期</text>
						<text class="value">{{ dateText }}</text>
					</view>
					<view class="row" v-if="relText">
						<text class="label">距今</text>
						<text class="value value-hl">{{ relText }}</text>
					</view>
					<view class="row" v-if="ev.location">
						<text class="label">地点</text>
						<text class="value">{{ ev.location }}</text>
					</view>
					<view class="row" v-if="ev.type && ev.type.name">
						<text class="label">类型</text>
						<text class="value">{{ typeText }}</text>
					</view>
				</view>

				<!-- 简介：CI 阶段翻好了中文，缺失回退英文原文。
				     整段直接铺开，不做折叠 —— 活动描述本来就不长（实测最长 152 字），
				     为了两行去点「展开全文」纯属多一道手 -->
				<view class="card" v-if="descText">
					<view class="card-title">简介</view>
					<text class="desc">{{ descText }}</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import navMixin from '@/utils/nav-mixin.js'
// 导入改名：模板只能看见实例成员，想直接调就得在 methods 里挂一层
import { formatDateTime, relativeTime, eventTypeName as eventTypeNameOf, stationName, placeZh, eventName as eventNameOf } from '@/utils/format.js'

/**
 * 活动详情页。
 *
 * 活动（events）是 LL2 里「不是发射、但同样值得看」的那些事：
 * 舱外活动、飞掠、轨道插入、航天器对接/分离。27 条数据里没有任何一条
 * 带关联发射（launches 全空），所以页面只讲这一件事本身，不去伪造关联。
 *
 * id 用 String 比较：快照里是数字，但分享出去再进来可能被当成字符串。
 */
export default {
	mixins: [navMixin],

	data() {
		return {
			id: '',
			loading: true,
			navSolid: false,
			ev: null
		}
	},

	computed: {
		typeText() {
			const t = this.ev && this.ev.type && this.ev.type.name
			return this.eventTypeName(t) || '活动'
		},
		dateText() {
			return (this.ev && this.fmtDateTime(this.ev.date)) || '时间待定'
		},
		relText() {
			return (this.ev && this.relTime(this.ev.date)) || ''
		},
		descText() {
			const e = this.ev
			if (!e) return ''
			return e.descriptionZh || e.description || ''
		}
	},

	onLoad(query) {
		this.id = (query && query.id) || ''
		this.load()
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 120
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onShareAppMessage() {
		const e = this.ev
		return {
			title: e ? e.name : '近期活动',
			path: '/pages/event/eventInfo?id=' + this.id,
			imageUrl: (e && e.feature_image) || ''
		}
	},

	methods: {
		eventName(ev) {
			return eventNameOf(ev)
		},

		// 活动地点可能是空间站或发射场，两张表都试，未命中保留原文
		placeName(s) {
			if (!s) return ''
			const st = stationName(s)
			if (st !== s) return st
			return placeZh(s) || s
		},
		// 模板作用域：这三个必须在实例上
		eventTypeName(v) {
			return eventTypeNameOf(v)
		},
		fmtDateTime(v) {
			return formatDateTime(v)
		},
		relTime(v) {
			return relativeTime(v)
		},

		async load() {
			try {
				const d = await spaceData.load('events')
				const list = (d && d.list) || []
				this.ev = list.find((x) => String(x.id) === String(this.id)) || null
			} catch (e) {
				// 数据集没生成 / 网络失败：走空态，不白屏
				console.warn('[eventInfo] 加载失败', e)
			}
			this.loading = false
		},

		preview() {
			const u = this.ev && this.ev.feature_image
			if (u) uni.previewImage({ urls: [u] })
		}
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
}

.state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 220rpx 40rpx;
}

.state-icon {
	font-size: 64rpx;
	opacity: 0.35;
	margin-bottom: 16rpx;
}

.state-text {
	color: #6b7891;
	font-size: 26rpx;
}

/* ---- 首图 ---- */
.hero {
	position: relative;
	height: 470rpx;
}

.hero-img {
	display: block;
	width: 100%;
	height: 100%;
	background: #0f1520;
}

.hero-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.ph-icon {
	font-size: 88rpx;
	opacity: 0.28;
}

.hero-mask {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 100%;
	height: 300rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, #0a0e17 100%);
}

.hero-body {
	position: absolute;
	left: 32rpx;
	right: 32rpx;
	bottom: 26rpx;
}

.hero-tags {
	display: flex;
	flex-wrap: wrap;
	margin-bottom: 12rpx;
}

.tag {
	margin: 0 12rpx 8rpx 0;
	padding: 4rpx 16rpx;
	border-radius: 6rpx;
	font-size: 22rpx;
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

.tag-loc {
	background: rgba(255, 255, 255, 0.08);
	color: #9aa7b8;
}

.hero-name {
	display: block;
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.35;
}

/* 英文原名：中文译名之外给一行原文，专有事件名不至于失真 */
.hero-en {
	display: block;
	margin-top: 8rpx;
	color: #93a3b8;
	font-size: 22rpx;
	line-height: 1.5;
}

/* ---- 正文 ---- */
.body {
	/* 底部不再有「查看全部活动」按钮，留白收到 60rpx */
	padding: 6rpx 32rpx 60rpx;
}

.card {
	margin-top: 24rpx;
	padding: 28rpx 30rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 16rpx;
}

.row {
	display: flex;
	align-items: flex-start;
	padding: 10rpx 0;
}

.label {
	width: 110rpx;
	flex-shrink: 0;
	color: #6b7891;
	font-size: 26rpx;
}

.value {
	flex: 1;
	min-width: 0;
	color: #e2e8f0;
	font-size: 27rpx;
	line-height: 1.55;
}

.value-hl {
	color: #38bdf8;
}

/* 整段铺开：活动描述实测最长 152 字，没有必要折叠 */
.desc {
	display: block;
	color: #cbd5e0;
	font-size: 29rpx;
	line-height: 1.75;
}
</style>
