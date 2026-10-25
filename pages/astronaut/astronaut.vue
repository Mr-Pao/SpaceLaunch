<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? '航天员' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!a.id">
			<text class="empty-icon">🧑‍🚀</text>
			<text class="empty-text">未找到该航天员信息</text>
		</view>

		<block v-else>
			<!-- 顶部：证件照 + 名字 + 徽标。在轨的挂亮蓝「在轨」章 -->
			<view class="head">
				<image
					v-if="a.img"
					class="avatar"
					:src="a.img"
					mode="aspectFill"
					@click="preview(a.img)"
				></image>
				<view v-else class="avatar avatar-ph"><text>🧑‍🚀</text></view>

				<view class="head-body">
					<text class="name">{{ a.name }}</text>
					<view class="tags">
						<text class="tag tag-on" v-if="a.inSpace">在轨</text>
						<text class="tag" v-if="agencyLabel">{{ agencyLabel }}</text>
						<text class="tag" v-if="nation">{{ nation }}</text>
						<text class="tag" v-if="a.age">{{ a.age }} 岁</text>
					</view>
				</view>
			</view>

			<!-- 战绩：与工位 / 火箭详情页的 KPI 口径一致 -->
			<view class="kpi">
				<view class="kpi-cell" v-if="a.days">
					<text class="kpi-num">{{ a.days }}</text>
					<text class="kpi-label">累计在轨（天）</text>
				</view>
				<view class="kpi-cell">
					<text class="kpi-num">{{ a.flights || 0 }}</text>
					<text class="kpi-label">飞行次数</text>
				</view>
				<view class="kpi-cell" v-if="a.spacewalks">
					<text class="kpi-num">{{ a.spacewalks }}</text>
					<text class="kpi-label">出舱次数</text>
				</view>
				<view class="kpi-cell" v-if="a.evaHours">
					<text class="kpi-num">{{ a.evaHours }}h</text>
					<text class="kpi-label">累计出舱</text>
				</view>
			</view>

			<!-- 简介：CI 只给在轨人员翻了中文，缺失回退英文 -->
			<view class="card" v-if="bioText">
				<view class="card-title">简介</view>
				<text class="desc" :class="{ open: descExpanded }">{{ bioText }}</text>
				<text class="desc-toggle" v-if="descOver" @click="descExpanded = !descExpanded">
					{{ descExpanded ? '收起' : '展开全文' }}
				</text>
			</view>

			<view class="footer-hint">
				<text>数据来源 The Space Devs</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { agencyLabel, nationZh } from '@/utils/format.js'
import navMixin from '@/utils/nav-mixin.js'

/**
 * 航天员详情页。
 * 入口：首页「此刻在天上」横滑卡。数据来自 CI 的 astronauts.json，
 * bio 只有人在轨才有（slim 阶段裁剪过），历史航天员进来只有战绩格。
 */
export default {
	mixins: [navMixin],

	data() {
		return {
			a: {},
			loading: true,
			navSolid: false,
			descExpanded: false
		}
	},

	computed: {
		agencyLabel() {
			return agencyLabel(this.a && this.a.agencyName)
		},

		nation() {
			return nationZh(this.a && this.a.nation)
		},

		bioText() {
			return this.a.bioZh || this.a.bio || ''
		},

		descOver() {
			return (this.bioText || '').length > 120
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 180
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		this.id = (query && query.id) || ''
		try {
			const found = this.id ? await spaceData.getById('astronauts', this.id) : null
			if (found) this.a = found
		} catch (e) {
			console.warn('[astronaut] 获取失败', e)
		}
		this.loading = false
	},

	methods: {
		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		}
	}
}
</script>

<style scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 80rpx;
	box-sizing: border-box;
}

.loading,
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 200rpx 40rpx;
}

.empty-icon {
	font-size: 72rpx;
	margin-bottom: 24rpx;
}

.hint-text,
.empty-text {
	color: #6b7891;
	font-size: 26rpx;
}

/* 头部 */
.head {
	display: flex;
	align-items: center;
	padding: 36rpx 32rpx 8rpx;
}

.avatar {
	width: 168rpx;
	height: 168rpx;
	flex-shrink: 0;
	border-radius: 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
}

.avatar-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 72rpx;
}

.head-body {
	flex: 1;
	min-width: 0;
	margin-left: 28rpx;
}

.name {
	display: block;
	color: #e2e8f0;
	font-size: 36rpx;
	font-weight: 600;
	line-height: 1.3;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 14rpx;
}

.tag {
	padding: 4rpx 14rpx;
	margin: 0 10rpx 8rpx 0;
	border-radius: 6rpx;
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
	font-size: 20rpx;
}

.tag-on {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

/* KPI */
.kpi {
	display: flex;
	margin: 28rpx 32rpx 0;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
	padding: 24rpx 0;
}

.kpi-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.kpi-num {
	color: #38bdf8;
	font-size: 32rpx;
	font-weight: 600;
}

.kpi-label {
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 20rpx;
}

/* 卡片 */
.card {
	margin: 24rpx 32rpx 0;
	padding: 26rpx 28rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.card-title {
	color: #94a3b8;
	font-size: 24rpx;
	margin-bottom: 14rpx;
}

.desc {
	color: #c6cfdd;
	font-size: 26rpx;
	line-height: 1.7;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
}

.desc.open {
	display: block;
	-webkit-line-clamp: unset;
}

.desc-toggle {
	display: block;
	margin-top: 12rpx;
	color: #38bdf8;
	font-size: 24rpx;
}

.footer-hint {
	margin-top: 48rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 20rpx;
}
</style>
