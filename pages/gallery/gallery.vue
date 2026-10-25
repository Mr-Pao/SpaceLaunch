<template>
	<view class="page">
		<nav-bar :solid="true" title="图库" placeholder />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<block v-else>
			<!-- 顶部 tab：与型号图片库同款样式 -->
			<view class="tabs">
				<view class="tab" @click="tab = 'image'">
					<text class="tab-text" :class="{ on: tab === 'image' }">图片</text>
					<view class="tab-ink" v-if="tab === 'image'"></view>
				</view>
				<view class="tab" @click="tab = 'video'">
					<text class="tab-text" :class="{ on: tab === 'video' }">视频</text>
					<view class="tab-ink" v-if="tab === 'video'"></view>
				</view>
			</view>

			<!-- 图片瀑布流：本地分页，每次往下追加一批，避免一次渲染 800 张 -->
			<view class="grid" v-if="tab === 'image'">
				<block v-if="shown.length">
					<view class="col">
						<view class="shot" v-for="(img, i) in colLeft" :key="'l' + i" @click="preview(img)">
							<image class="shot-img" :src="img.thumb" mode="widthFix" lazy-load></image>
							<text class="shot-credit" v-if="img.credit">@{{ img.credit }}</text>
						</view>
					</view>
					<view class="col">
						<view class="shot" v-for="(img, i) in colRight" :key="'r' + i" @click="preview(img)">
							<image class="shot-img" :src="img.thumb" mode="widthFix" lazy-load></image>
							<text class="shot-credit" v-if="img.credit">@{{ img.credit }}</text>
						</view>
					</view>
				</block>
				<view class="empty-box" v-else>
					<text class="empty-icon">🛰️</text>
					<text class="empty-text">还没有图片</text>
					<text class="empty-sub">历史图片正在由后台逐批补齐，过几个小时再来看看</text>
				</view>
			</view>

			<!-- 视频瀑布流：videos.json 里每条发射的 webcast 摊平 -->
			<view class="grid" v-else>
				<block v-if="videos.length">
					<view class="col">
						<view class="vcard" v-for="(v, i) in vcolLeft" :key="'vl' + i" @click="openVideo(v)">
							<view class="vcover">
								<image class="vcover-img" :src="v.cover" mode="aspectFill" lazy-load></image>
								<view class="vplay"></view>
								<text class="vtag" v-if="v.official">官方</text>
								<text class="vdur" v-if="v.mins">{{ v.mins }} 分钟</text>
							</view>
							<text class="vtitle">{{ v.title }}</text>
							<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						</view>
					</view>
					<view class="col">
						<view class="vcard" v-for="(v, i) in vcolRight" :key="'vr' + i" @click="openVideo(v)">
							<view class="vcover">
								<image class="vcover-img" :src="v.cover" mode="aspectFill" lazy-load></image>
								<view class="vplay"></view>
								<text class="vtag" v-if="v.official">官方</text>
								<text class="vdur" v-if="v.mins">{{ v.mins }} 分钟</text>
							</view>
							<text class="vtitle">{{ v.title }}</text>
							<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						</view>
					</view>
				</block>
				<view class="empty-box" v-else>
					<text class="empty-icon">📺</text>
					<text class="empty-text">还没有视频</text>
					<text class="empty-sub">数据源只收录部分任务的直播回放，抓取在持续进行</text>
				</view>
			</view>

			<view class="tail" v-if="tab === 'image' && shown.length < images.length">
				<text class="tail-text">上拉加载更多（{{ shown.length }}/{{ images.length }}）</text>
			</view>
			<view class="tail" v-else-if="tab === 'image' && images.length">
				<text class="tail-text">已经到底啦</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { fullImageOf } from '@/utils/media.js'
import { syncTabBar } from '@/utils/tabbar.js'

// 本地分页步长：一次渲染 40 张，翻到底再追加，首屏只下图片不渲染 DOM
const PAGE_STEP = 40

export default {
	data() {
		return {
			tab: 'image',
			loading: true,
			images: [],
			videos: [],
			shownCount: PAGE_STEP
		}
	},

	computed: {
		shown() {
			return this.images.slice(0, this.shownCount)
		},

		colLeft() {
			return this.shown.filter((_, i) => i % 2 === 0)
		},

		colRight() {
			return this.shown.filter((_, i) => i % 2 === 1)
		},

		vcolLeft() {
			return this.videos.filter((_, i) => i % 2 === 0)
		},

		vcolRight() {
			return this.videos.filter((_, i) => i % 2 === 1)
		}
	},

	onShow() {
		syncTabBar(2)
	},

	onReachBottom() {
		if (this.shownCount < this.images.length) {
			this.shownCount += PAGE_STEP
		}
	},

	async onLoad() {
		// gallery 与 videos 互相独立，一个失败不影响另一个
		const [g, v] = await Promise.all([
			spaceData.load('gallery').catch(() => null),
			spaceData.load('videos').catch(() => null)
		])

		this.images = ((g && g.list) || []).filter((x) => x && x.thumb)
		this.videos = flattenVideos((v && v.list) || [])
		this.loading = false
	},

	methods: {
		preview(img) {
			// 全屏看原图：COS 上同 hash 的 _2000 版本，还没补齐到的回退缩略图
			const full = fullImageOf(img.thumb)
			const urls = this.shown.map((x) => fullImageOf(x.thumb) || x.thumb)
			uni.previewImage({
				urls,
				current: full || img.thumb
			})
		},

		/**
		 * 小程序里放不了 YouTube（web-view 也要配业务域名），
		 * 复制链接让用户去浏览器看 —— 与型号视频库同一套交互
		 */
		openVideo(v) {
			uni.setClipboardData({
				data: v.url,
				success: () => {
					uni.showToast({ title: '链接已复制，可到浏览器打开', icon: 'none' })
				}
			})
		}
	}
}

/** videos.json 的行是「一条发射一组 vids」，摊平成单张卡片列表 */
function flattenVideos(rows) {
	const out = []
	const seen = {}
	for (const row of rows) {
		if (!row || !Array.isArray(row.vids)) continue
		for (const v of row.vids) {
			if (!v || !v.url || !v.cover || seen[v.url]) continue
			seen[v.url] = 1
			out.push({
				url: v.url,
				title: v.title || row.name || '',
				publisher: v.publisher || '',
				official: v.tid === 1 || v.kind === 'Official Webcast',
				cover: v.cover,
				mins: v.mins || 0
			})
		}
	}
	return out
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
}

/* ---- 顶部 tab ---- */
.tabs {
	display: flex;
	align-items: center;
	padding: 8rpx 0 12rpx;
}

.tab {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.tab-text {
	color: #7d8ba0;
	font-size: 28rpx;
	line-height: 40rpx;
}

.tab-text.on {
	color: #ffffff;
	font-weight: 600;
}

.tab-ink {
	width: 40rpx;
	height: 4rpx;
	margin-top: 8rpx;
	border-radius: 2rpx;
	background: #38bdf8;
}

/* 两列瀑布流 */
.grid {
	display: flex;
	align-items: flex-start;
	padding: 0 8rpx;
}

.col {
	flex: 1;
	min-width: 0;
	padding: 0 4rpx;
}

.shot {
	position: relative;
	margin-bottom: 10rpx;
	border-radius: 8rpx;
	overflow: hidden;
	background: #131a26;
}

.shot-img {
	display: block;
	width: 100%;
}

.shot-credit {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 8rpx;
	color: rgba(255, 255, 255, 0.92);
	font-size: 19rpx;
	line-height: 26rpx;
	text-align: center;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-shadow: 0 1rpx 5rpx rgba(0, 0, 0, 0.9);
}

/* ---- 视频卡片 ---- */
.vcard {
	margin-bottom: 10rpx;
	border-radius: 8rpx;
	overflow: hidden;
	background: #131a26;
}

.vcover {
	position: relative;
	width: 100%;
	height: 220rpx;
}

.vcover-img {
	display: block;
	width: 100%;
	height: 100%;
}

.vplay {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 64rpx;
	height: 64rpx;
	margin: -32rpx 0 0 -32rpx;
	border-radius: 50%;
	background: rgba(0, 0, 0, 0.45);
}

.vplay::after {
	content: '';
	position: absolute;
	left: 24rpx;
	top: 20rpx;
	width: 0;
	height: 0;
	border-left: 20rpx solid rgba(255, 255, 255, 0.95);
	border-top: 12rpx solid transparent;
	border-bottom: 12rpx solid transparent;
}

.vtag {
	position: absolute;
	left: 10rpx;
	top: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	background: rgba(0, 0, 0, 0.55);
	color: #ffffff;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vdur {
	position: absolute;
	right: 10rpx;
	bottom: 10rpx;
	padding: 2rpx 10rpx;
	border-radius: 4rpx;
	background: rgba(0, 0, 0, 0.55);
	color: #ffffff;
	font-size: 18rpx;
	line-height: 26rpx;
}

.vtitle {
	display: block;
	padding: 12rpx 12rpx 0;
	color: #e2e8f0;
	font-size: 23rpx;
	line-height: 32rpx;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	overflow: hidden;
}

.vmeta {
	display: block;
	padding: 4rpx 12rpx 12rpx;
	color: #7d8ba0;
	font-size: 20rpx;
	line-height: 28rpx;
}

/* ---- 空态 / 尾部 ---- */
.empty-box {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 120rpx 0;
}

.empty-icon {
	font-size: 60rpx;
	margin-bottom: 16rpx;
}

.empty-text {
	color: #8b95a8;
	font-size: 26rpx;
}

.empty-sub {
	margin-top: 10rpx;
	color: #4d5a6e;
	font-size: 22rpx;
	padding: 0 60rpx;
	text-align: center;
}

.tail {
	display: flex;
	justify-content: center;
	padding: 20rpx 0 40rpx;
}

.tail-text {
	color: #4d5a6e;
	font-size: 22rpx;
}
</style>
