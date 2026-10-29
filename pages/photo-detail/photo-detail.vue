<template>
	<view class="page">
		<!-- 原图区：点击放大到系统看图器，可双指缩放 -->
		<view class="hero" v-if="full" @click="zoom">
			<image class="hero-img" :src="full" mode="aspectFit"></image>
		</view>

		<view class="info">
			<view class="meta-row">
				<text class="tag">{{ tag }}</text>
				<text class="date" v-if="date">{{ date }}</text>
			</view>
			<text class="title">{{ title }}</text>
			<text class="intro">{{ intro || '暂无介绍' }}</text>
			<text class="credit" v-if="credit">图源：{{ credit }}</text>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

/**
 * 每日天文 / 每日地球 的图片详情页
 *
 * 只接收 type（apod / epic），不通过 URL 传长文本 —— 说明文字上千字，
 * 塞进 query 会被长度截断。数据都在 spaceData 里，页面自己取第一条即可。
 */
export default {
	data() {
		return {
			type: 'apod',
			tag: '每日天文',
			title: '',
			date: '',
			intro: '',
			credit: '',
			full: ''
		}
	},

	onLoad(options) {
		const type = options && options.type === 'epic' ? 'epic' : 'apod'
		this.type = type
		this.tag = type === 'epic' ? '每日地球' : '每日天文'
		uni.setNavigationBarTitle({ title: this.tag })
		this.fetch()
	},

	methods: {
		async fetch() {
			const d = await spaceData.load(this.type).catch(() => null)
			const x = ((d && d.list) || [])[0]
			if (!x) return

			const isEpic = this.type === 'epic'
			this.title = x.titleZh || x.title || (isEpic ? '地球 · DSCOVR' : '未命名')
			this.date = (x.date || '').slice(0, 10)
			this.intro = x.explanationZh || x.explanation || x.captionZh || x.caption || ''
			this.credit = x.credit || (isEpic ? 'NASA EPIC' : '')
			this.full = x.full || x.thumb || ''
		},

		zoom() {
			if (!this.full) return
			uni.previewImage({ urls: [this.full], current: this.full })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 70rpx;
	box-sizing: border-box;
}

/* 原图区固定在顶部，图本身用 aspectFit 完整显示，不裁切 */
.hero {
	width: 100%;
	height: 640rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #000000;
}

.hero-img {
	width: 100%;
	height: 100%;
	display: block;
}

.info {
	padding: 30rpx 32rpx 0;
}

.meta-row {
	display: flex;
	align-items: center;
}

.tag {
	padding: 6rpx 18rpx;
	border-radius: 20rpx;
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
	font-size: 22rpx;
}

.date {
	margin-left: 16rpx;
	color: #8b95a8;
	font-size: 22rpx;
}

.title {
	display: block;
	margin-top: 18rpx;
	color: #ffffff;
	font-size: 36rpx;
	font-weight: 600;
	line-height: 48rpx;
}

.intro {
	display: block;
	margin-top: 22rpx;
	color: #b9c2d0;
	font-size: 27rpx;
	line-height: 46rpx;
	white-space: pre-wrap;
}

.credit {
	display: block;
	margin-top: 26rpx;
	color: #6b7891;
	font-size: 22rpx;
}
</style>
