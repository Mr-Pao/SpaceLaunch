<template>
	<view class="page">
		<view class="head">
			<text class="title">版本记录</text>
			<text class="sub">当前版本 {{ current }}</text>
		</view>

		<view class="timeline">
			<!-- 用真实的 view 画竖线，不用 ::before —— scoped 下的伪元素在 WXSS 里容易出问题 -->
			<view class="line"></view>

			<view class="entry" v-for="(item, i) in versions" :key="item.version">
				<view class="dot" :class="{ latest: i === 0 }"></view>

				<view class="entry-head">
					<text class="version" :class="{ latest: i === 0 }">{{ item.version }}</text>
					<text class="date">{{ item.date }}</text>
				</view>

				<text class="entry-title">{{ item.title }}</text>

				<view class="items">
					<view class="item" v-for="(line, j) in item.items" :key="j">
						<text class="bullet">·</text>
						<text class="item-text">{{ line }}</text>
					</view>
				</view>
			</view>
		</view>

		<view class="footer">
			<text>数据来源 The Space Devs · 每日自动同步</text>
		</view>
	</view>
</template>

<script>
import { CHANGELOG } from '@/utils/changelog.js'

export default {
	computed: {
		// 数组尾部是最新版，页面要从上往下显示「新 → 旧」
		versions() {
			return [...CHANGELOG].reverse()
		},
		current() {
			const last = CHANGELOG[CHANGELOG.length - 1]
			return last ? last.version : '—'
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding: 40rpx 32rpx 60rpx;
	box-sizing: border-box;
}

.head {
	padding: 20rpx 8rpx 44rpx;
}

.title {
	display: block;
	color: #ffffff;
	font-size: 44rpx;
	font-weight: 600;
	letter-spacing: 2rpx;
}

.sub {
	display: block;
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 24rpx;
}

/* 时间线 */
.timeline {
	position: relative;
	padding-left: 44rpx;
}

.line {
	position: absolute;
	left: 9rpx;
	top: 18rpx;
	bottom: 20rpx;
	width: 2rpx;
	background: rgba(56, 189, 248, 0.18);
}

.entry {
	position: relative;
	margin-bottom: 52rpx;
}

.entry:last-child {
	margin-bottom: 0;
}

.dot {
	position: absolute;
	left: -42rpx;
	top: 12rpx;
	width: 16rpx;
	height: 16rpx;
	border-radius: 50%;
	background: #2a3646;
	border: 2rpx solid #0a0e17;
}

.dot.latest {
	background: #38bdf8;
	box-shadow: 0 0 16rpx rgba(56, 189, 248, 0.6);
}

.entry-head {
	display: flex;
	align-items: baseline;
}

.version {
	color: #8a97a8;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.version.latest {
	color: #38bdf8;
}

.date {
	margin-left: 18rpx;
	color: #4a5568;
	font-size: 24rpx;
}

.entry-title {
	display: block;
	margin-top: 10rpx;
	color: #cbd5e0;
	font-size: 28rpx;
}

.items {
	margin-top: 16rpx;
	padding: 22rpx 24rpx;
	background: #141a26;
	border-radius: 16rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.item {
	display: flex;
	align-items: flex-start;
	padding: 6rpx 0;
}

.bullet {
	flex-shrink: 0;
	margin-right: 12rpx;
	color: #38bdf8;
	font-size: 26rpx;
	line-height: 1.7;
}

.item-text {
	flex: 1;
	color: #8a97a8;
	font-size: 26rpx;
	line-height: 1.7;
}

.footer {
	margin-top: 50rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
