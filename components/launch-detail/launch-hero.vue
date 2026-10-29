<template>
			<!-- 首图：固定高度裁切。原先是 mode=widthFix 让图片按原比例撑开，
			     遇到竖图会占满整屏，用户得滑很久才能看到信息 -->
			<!-- 首图：顶到屏幕最上方做沉浸式。只有一张图时用 image，
			     将来有多张会自动走 swiper 轮播 -->
			<view class="hero">
				<swiper
					v-if="heroImages.length > 1"
					class="hero-swiper"
					:autoplay="true"
					:interval="5000"
					circular
					@change="onHeroChange"
				>
					<swiper-item v-for="(img, i) in heroImages" :key="i">
						<image
							class="hero-img"
							:src="img"
							mode="aspectFill"
							@click="preview(img)"
						></image>
					</swiper-item>
				</swiper>

				<image
					v-else-if="heroImages.length === 1"
					class="hero-img"
					:src="heroImages[0]"
					mode="aspectFill"
					@click="preview(heroImages[0])"
				></image>

				<view v-else class="hero-img hero-placeholder"></view>

				<view class="hero-mask"></view>

				<!-- 轮播指示点：照火箭详情页那一套 —— 右上角一排小圆点，
				     当前那张拉成短胶囊。比「1/8」这种数字角标安静得多，
				     也不会和下面的状态徽章抢位置。
				     必须放在渐变遮罩之后渲染，否则会被压暗到看不见 -->
				<view
					class="hero-dots"
					v-if="heroImages.length > 1"
					:style="{ top: statusBarH + 56 + 'px' }"
				>
					<view
						class="hero-dot"
						v-for="(img, i) in heroImages"
						:key="'d' + i"
						:class="{ on: i === heroIdx }"
					></view>
				</view>

				<!-- 首图右下角：图片库入口（计数已去掉，圆点负责表示进度） -->
				<view class="hero-tools">
					<!-- 图片库入口：只在该系列确实有图时显示，
					     避免「入口有数字、进去是空」的割裂感 -->
					<view
						class="hero-media"
						v-if="!reviewMode && heroMediaCount && heroImages.length"
						hover-class="hero-media-hover"
						@click="goMedia('image')"
					>
						<view class="hm-icon">
							<view class="hm-dot"></view>
							<view class="hm-dot"></view>
							<view class="hm-dot"></view>
							<view class="hm-dot"></view>
						</view>
						<text class="hm-text">图片库</text>
						<text class="hm-count">{{ heroMediaCount }}</text>
					</view>
				</view>
			</view>
</template>

<script>
import { thumbOf, fullImageOf } from '@/utils/media.js'

export default {
	name: 'launch-hero',

	props: {
		detail: { type: Object, default: null },
		// 同系列媒体聚合（图片库入口的数字来自这里），没算出来时入口不显示
		media: { type: Object, default: null },
		// 当前轮播下标由父组件持有（换发射时归零），翻页只 emit 回传
		heroIdx: { type: Number, default: 0 },
		// 状态栏高度：轮播圆点要避开右上角微信胶囊
		statusBarH: { type: Number, default: 20 },
		reviewMode: { type: Boolean, default: false }
	},

	emits: ['hero-change'],

	computed: {
		// 首图轮播数据。目前 LL2 一个任务只给一张图，
		// 留成数组是为了以后多图源接进来时直接生效
		heroImages() {
			const d = this.detail
			if (!d) return []

			const out = []
			const seen = {}
			const push = (u) => {
				if (!u || seen[u]) return
				seen[u] = 1
				out.push(u)
			}

			// 首图固定是本任务自己的图，无论聚合结果怎么排都压在最前。
			// 用 480px 缩略版而不是 2000px 原图：首图区一屏要放好几张，
			// 原图每张几百 KB，弱网下就是盯着黑板等 —— 点开预览时会给原图
			push(thumbOf(d.image))

			// 再补同系列的照片，让首图区真的轮播起来（以前这里恒返回 1 张，
			// swiper 分支等于死代码）。信息图是长图、字多，塞进首图很跳，跳过；
			// 上限 5 张：首屏流量与「轮播」的观感在这里取平衡，也和火箭详情页一致。
			// 想看全的走「图片库」入口，那边是完整聚合
			const imgs = (this.media && this.media.images) || []
			for (const it of imgs) {
				if (out.length >= 5) break
				if (it.kind === 'infographic') continue
				push(it.thumb || it.url)
			}

			return out
		},
		// 首图上的「图片库」入口数字：和媒体页同一口径（那边用 collectMedia 聚合）。
		// 没有火箭型号（极少数任务）或型号不在快照里时，media 为 null，入口不显示
		heroMediaCount() {
			return (this.media && this.media.images.length) || 0
		},
	},

	methods: {
		// 点开图片能双指放大，长图信息不点开根本看不清
		/** 首图区内是 480px 缩略版，点开看大图时换回 2000px 原图 */
		preview(url) {
			if (!url) return
			const full = fullImageOf(url) || url
			uni.previewImage({ urls: [full], current: full })
		},

		/** 首图轮播翻页：下标在父组件里，这里只回传当前页 */
		onHeroChange(e) {
			const i = e && e.detail && e.detail.current
			this.$emit('hero-change', typeof i === 'number' && i >= 0 ? i : 0)
		},

		/** 进图片库 / 视频库：传发射的型号 id，媒体页按系列聚合展示 */
		goMedia(tab) {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.id) return
			uni.navigateTo({
				url: '/pages/media/media?id=' + c.id + '&tab=' + (tab || 'image')
			})
		},
	}
}
</script>

<style lang="scss" scoped>
/* 首图：顶到屏幕最上方，状态栏压在图上，形成沉浸感 */
.hero {
	position: relative;
	width: 100%;
	height: 660rpx;
}

.hero-swiper {
	width: 100%;
	height: 100%;
}

.hero-img {
	width: 100%;
	height: 100%;
	display: block;
}

.hero-placeholder {
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.hero-mask {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 100%;
	height: 200rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, #0a0e17 100%);
	/* 纯装饰渐变，必须让事件穿透 —— 否则首图底部一截滑不动 */
	pointer-events: none;
}

/* 轮播指示点：与火箭详情页同一套 —— 右上角一排小圆点，当前那张拉成短胶囊 */
.hero-dots {
	position: absolute;
	right: 32rpx;
	z-index: 2;
	/* 纯指示，不接事件，否则右上角那一小条会截走滑动 */
	pointer-events: none;
	display: flex;
	align-items: center;
	gap: 10rpx;
}

.hero-dot {
	width: 10rpx;
	height: 10rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.38);
	transition: all 0.3s ease;
}

.hero-dot.on {
	width: 26rpx;
	background: rgba(255, 255, 255, 0.95);
}

/* 首图右下角：图片库入口（进度由圆点表示，这里只剩入口本身） */
.hero-tools {
	position: absolute;
	right: 24rpx;
	bottom: 80rpx;
	z-index: 2;
	display: flex;
	align-items: center;
}

/* 图片库入口：磨砂胶囊，与火箭详情页同一套语言 */
.hero-media {
	display: flex;
	align-items: center;
	padding: 7rpx 18rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.14);
	-webkit-backdrop-filter: blur(20rpx) saturate(150%);
	backdrop-filter: blur(20rpx) saturate(150%);
	border: 1rpx solid rgba(255, 255, 255, 0.22);
	box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.18);
}

.hero-media-hover {
	background: rgba(255, 255, 255, 0.24);
}

/* 2×2 小方格当图标，纯 CSS，比图片省一次请求 */
.hm-icon {
	display: flex;
	flex-wrap: wrap;
	width: 18rpx;
	height: 18rpx;
	margin-right: 10rpx;
}

.hm-dot {
	width: 6rpx;
	height: 6rpx;
	margin: 0 3rpx 3rpx 0;
	border-radius: 1.5rpx;
	background: rgba(255, 255, 255, 0.9);
}

.hm-text {
	color: #ffffff;
	font-size: 22rpx;
	line-height: 1.2;
}

.hm-count {
	margin-left: 8rpx;
	color: rgba(255, 255, 255, 0.6);
	font-size: 22rpx;
	line-height: 1.2;
}
</style>
