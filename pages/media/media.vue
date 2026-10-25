<template>
	<view class="page">
		<nav-bar :solid="true" :title="pageTitle" placeholder />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!config">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">未找到该型号</text>
		</view>

		<block v-else>
			<!-- 顶部两个等宽 tab：选中的字更亮、底下压一条短粗线 -->
			<view class="tabs">
				<view class="tab" @click="tab = 'image'">
					<text class="tab-text" :class="{ on: tab === 'image' }">图片库</text>
					<view class="tab-ink" v-if="tab === 'image'"></view>
				</view>
				<view class="tab" @click="tab = 'video'">
					<text class="tab-text" :class="{ on: tab === 'video' }">视频库</text>
					<view class="tab-ink" v-if="tab === 'video'"></view>
				</view>
			</view>

			<!-- 图片库：两列瀑布流。图片按原始比例撑高（widthFix），
			     所以只会一列比另一列长一点，不会出现拉伸变形 -->
			<view class="grid" v-if="tab === 'image'">
				<block v-if="images.length">
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
					<text class="empty-text">该型号暂时没有图片</text>
					<text class="empty-sub">历史发射记录补齐后会陆续出现</text>
				</view>
			</view>

			<!-- 视频库 -->
			<view class="grid" v-else>
				<block v-if="videos.length">
					<view class="col">
						<view class="vcard" v-for="(v, i) in vcolLeft" :key="'vl' + i" @click="openVideo(v)">
							<view class="vcover">
								<image class="vcover-img" :src="v.thumb" mode="aspectFill" lazy-load></image>
								<view class="vplay"></view>
								<text class="vtag" v-if="v.official">官方</text>
							</view>
							<text class="vtitle">{{ v.title }}</text>
							<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						</view>
					</view>
					<view class="col">
						<view class="vcard" v-for="(v, i) in vcolRight" :key="'vr' + i" @click="openVideo(v)">
							<view class="vcover">
								<image class="vcover-img" :src="v.thumb" mode="aspectFill" lazy-load></image>
								<view class="vplay"></view>
								<text class="vtag" v-if="v.official">官方</text>
							</view>
							<text class="vtitle">{{ v.title }}</text>
							<text class="vmeta" v-if="v.publisher">@{{ v.publisher }}</text>
						</view>
					</view>
				</block>
				<view class="empty-box" v-else>
					<text class="empty-text">该型号暂时没有视频</text>
					<text class="empty-sub">数据源只收录部分任务的直播回放</text>
				</view>
			</view>

			<view class="tail" v-if="tab === 'image' && truncated">
				<text class="tail-text">仅显示最近 {{ images.length }} 张</text>
			</view>
		</block>
	</view>
</template>

<script>
	import spaceData from '@/utils/data.js'
	import { seriesKey, seriesName, rocketName } from '@/utils/format.js'
	import { collectMedia, fullImageOf } from '@/utils/media.js'

export default {
	data() {
		return {
			rocketId: '',
			config: null,
			series: [],
			images: [],
			videos: [],
			truncated: false,
			tab: 'image',
			loading: true
		}
	},

	computed: {
		/** 系列里有多个构型时用系列名（猎鹰9号），只有自己就用型号名（Falcon 1） */
		pageTitle() {
			const c = this.config
			if (!c) return '图片库'
			if (this.series.length >= 3) return seriesName(seriesKey(c)) || c.name || '图片库'
			return rocketName(c) || c.name || '图片库'
		},

		// 交替分列：简单但足够，图片本身高度不一，视觉上就是瀑布流
		colLeft() {
			return this.images.filter((_, i) => i % 2 === 0)
		},

		colRight() {
			return this.images.filter((_, i) => i % 2 === 1)
		},

		vcolLeft() {
			return this.videos.filter((_, i) => i % 2 === 0)
		},

		vcolRight() {
			return this.videos.filter((_, i) => i % 2 === 1)
		}
	},

	async onLoad(query) {
		this.rocketId = (query && query.id) || ''
		// 详情页点「视频库」进来时直接落在第二个 tab
		if (query && query.tab === 'video') this.tab = 'video'
		if (!this.rocketId) {
			this.loading = false
			return
		}
		await this.load()
		this.loading = false
	},

	methods: {
		async load() {
			try {
				const d = await spaceData.load('launchers')
				const list = (d && d.list) || []
				const id = String(this.rocketId)
				this.config = list.find((x) => String(x.id) === id) || null
				if (!this.config) return

				// 同一个系列的构型共用一批发射记录，媒体也一起看
				const key = seriesKey(this.config)
				this.series = list.filter((x) => seriesKey(x) === key)
				const ids = {}
				this.series.forEach((x) => {
					ids[String(x.id)] = 1
				})

				const [prev, up, vd] = await Promise.all([
					spaceData.load('previous').catch(() => null),
					spaceData.load('upcoming').catch(() => null),
					spaceData.load('videos').catch(() => null)
				])

				// 视频单独存在 videos.json 里（列表端点不返回 vid_urls），
				// 按 id 索引，这里合并回记录上再交给 collectMedia。
				// 没抓到的记录就是没视频，不做占位
				const vmap = {}
				for (const row of (vd && vd.list) || []) {
					if (row && row.id && (row.vids || []).length) vmap[String(row.id)] = row.vids
				}

				const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]
				const records = all
					.filter((x) => {
						const c = x.rocket && x.rocket.configuration
						return c && ids[String(c.id)]
					})
					.map((x) => {
						const vids = vmap[String(x.id)]
						return vids ? Object.assign({}, x, { vid: vids }) : x
					})

				const media = collectMedia(this.series, records)
				this.images = media.images
				this.videos = media.videos
				this.truncated = media.truncated
			} catch (e) {
				console.warn('[media] 加载失败', e)
			}
		},

		preview(img) {
			// 全屏看原图：COS 上同 hash 的 _2000 版本（CI 全量补齐后可用），
			// 还没补到的图推导地址 404，回退缩略图
			const urls = this.images.map((x) => x.full || fullImageOf(x.thumb) || x.url).filter(Boolean)
			uni.previewImage({
				urls,
				current: img.full || fullImageOf(img.thumb) || img.url
			})
		},

		/**
		 * 小程序里放不了 YouTube，web-view 也要配业务域名，所以只能复制链接。
		 * 与其给个点了没反应的播放键，不如老实告诉用户下一步怎么做。
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

/* 图片来源署名：压在图片底部居中，和参考图一样。
   图片背景明暗不定，所以除了半透明底再加一层文字阴影 */
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

/* 三角形用边框画，省一个图片资源 */
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

/* 「官方」角标压在封面左上角。和播放键一样用半透明黑底，
   不抢画面，但一眼能分出哪个是火箭公司的官方源 */
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

.vtitle {
	display: block;
	padding: 12rpx 12rpx 0;
	color: #e2e8f0;
	font-size: 23rpx;
	line-height: 32rpx;
}

.vmeta {
	display: block;
	padding: 4rpx 12rpx 12rpx;
	color: #7d8ba0;
	font-size: 20rpx;
	line-height: 28rpx;
}

/* ---- 空态 ---- */
.empty-box {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 120rpx 0;
}

.empty-text {
	color: #8b95a8;
	font-size: 26rpx;
}

.empty-sub {
	margin-top: 10rpx;
	color: #4d5a6e;
	font-size: 22rpx;
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
