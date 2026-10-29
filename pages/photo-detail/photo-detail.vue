<template>
	<view class="page">
		<!-- 全局是 custom 导航，必须自己画返回键 -->
		<nav-bar :solid="true" :title="navTitle" placeholder />

		<!-- 图片舞台：黑底居中，点一下进系统看图器可缩放 -->
		<view class="stage" @click="zoom">
			<image v-if="full" class="img" :src="full" mode="aspectFit"></image>
			<text v-else class="tip">图片暂不可用</text>
		</view>

		<!-- 底部信息条：标题 + 一行副标题 + 可滚动的中文介绍，不放按钮 -->
		<view class="bar">
			<text class="bar-title">{{ title }}</text>
			<text class="bar-sub" v-if="sub">{{ sub }}</text>
			<scroll-view class="bar-desc" scroll-y>
				<text class="desc-text">{{ intro || '暂无介绍' }}</text>
			</scroll-view>
		</view>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'

/**
 * 每日天文 / 每日地球 的全屏看图页
 *
 * 只接收 type（apod / epic），数据自己从 spaceData 取第一条，
 * 不通过 URL 传长文本 —— 说明上千字，塞 query 会被截断。
 */
export default {
	data() {
		return {
			type: 'apod',
			navTitle: '每日天文',
			title: '',
			sub: '',
			intro: '',
			full: ''
		}
	},

	onLoad(options) {
		// 图库点图进来：数据在 Storage 里（可能上千字，不能塞 URL）
		if (options && options.from === 'gallery') {
			const c = uni.getStorageSync('_photo_detail') || {}
			try {
				uni.removeStorageSync('_photo_detail')
			} catch (e) {
				// 清不掉无所谓，下次会被覆盖
			}
			this.navTitle = c.tag || '图片详情'
			this.title = c.title || ''
			this.intro = this.cleanIntro(c.intro)
			this.full = c.full || ''
			const parts = [c.tag, c.date, c.credit ? '@' + String(c.credit).replace(/^@/, '') : '']
			this.sub = parts.filter(Boolean).join(' · ')
			return
		}

		const type = options && options.type === 'epic' ? 'epic' : 'apod'
		this.type = type
		this.navTitle = type === 'epic' ? '每日地球' : '每日天文'
		this.fetch()
	},

	methods: {
		/** 去掉介绍开头的「说明：/解释：/Explanation:」标签词 */
		cleanIntro(s) {
			return String(s || '').replace(/^\s*(说明|解释|Explanation)\s*[:：]\s*/i, '')
		},

		async fetch() {
			const d = await spaceData.load(this.type).catch(() => null)
			const x = ((d && d.list) || [])[0]
			if (!x) return

			const isEpic = this.type === 'epic'
			this.title = x.titleZh || x.title || (isEpic ? '地球 · DSCOVR' : '未命名')
			this.full = x.full || x.thumb || ''
			this.intro = this.cleanIntro(x.explanationZh || x.explanation || x.captionZh || x.caption)

			// 副标题合成一行：来源 · 日期 · 图源，缺哪个就跳过
			const parts = [isEpic ? '每日地球' : '每日天文']
			const date = (x.date || '').slice(0, 10)
			if (date) parts.push(date)
			const credit = x.credit || (isEpic ? 'NASA EPIC' : '')
			if (credit) parts.push('@' + credit.replace(/^@/, ''))
			this.sub = parts.join(' · ')
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
	height: 100vh;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	background: #04060a;
}

/* 图片区占满剩余空间，aspectFit 完整显示、不裁切 */
.stage {
	flex: 1;
	min-height: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.img {
	width: 100%;
	height: 100%;
	display: block;
}

.tip {
	color: #4d5a6e;
	font-size: 26rpx;
}

/* 底部信息条：纯黑，与图片区分开 */
.bar {
	flex-shrink: 0;
	padding: 26rpx 32rpx 30rpx;
	background: #000000;
	padding-bottom: calc(30rpx + env(safe-area-inset-bottom));
}

.bar-title {
	color: #ffffff;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 44rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.bar-sub {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 22rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* 介绍限高可滚：图片仍是主体，长文不挤压画面 */
.bar-desc {
	height: 30vh;
	margin-top: 20rpx;
}

.desc-text {
	color: #b9c2d0;
	font-size: 26rpx;
	line-height: 44rpx;
	white-space: pre-wrap;
}
</style>
