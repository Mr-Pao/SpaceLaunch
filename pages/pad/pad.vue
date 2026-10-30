<template>
	<view class="page">
		<nav-bar :solid="navSolid" :title="navSolid ? '发射工位' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!pad.id">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">未找到该工位信息</text>
		</view>

		<block v-else>
			<!-- 地图图：LL2 为每个工位生成了一张示意地图 -->
			<view class="hero" v-if="pad.map_image || pad.image">
				<image
					class="hero-img"
					:src="pad.map_image || pad.image"
					mode="widthFix"
					@click="preview(pad.map_image || pad.image)"
				></image>
			</view>

			<!-- 标题区 -->
			<view class="head">
				<text class="title">{{ padShort(pad.name) || pad.name }}</text>
				<view class="tags">
					<text class="tag" v-if="pad.location && pad.location.name">{{ placeZh(pad.location.name) }}</text>
					<text class="tag" v-if="pad.country_code">{{ pad.country_code }}</text>
					<text class="tag" :class="pad.active ? 'tag-on' : 'tag-off'">
						{{ pad.active ? '现役' : '停用' }}
					</text>
				</view>
			</view>

			<!-- 战绩：与火箭详情页的 KPI 格式一致 -->
			<view class="kpi" v-if="pad.total_launch_count != null">
				<view class="kpi-cell">
					<text class="kpi-num">{{ pad.total_launch_count }}</text>
					<text class="kpi-label">该工位累计发射</text>
				</view>
				<view class="kpi-cell" v-if="pad.location && pad.location.total_launch_count != null">
					<text class="kpi-num">{{ pad.location.total_launch_count }}</text>
					<text class="kpi-label">所在发射场累计</text>
				</view>
			</view>

			<!-- 坐标 -->
			<view class="card" v-if="pad.latitude != null">
				<view class="card-title">坐标</view>
				<view class="row">
					<text class="label">纬度</text>
					<text class="value">{{ pad.latitude }}</text>
				</view>
				<view class="row">
					<text class="label">经度</text>
					<text class="value">{{ pad.longitude }}</text>
				</view>
			</view>

			<!-- 简介：CI 回填 descriptionZh，缺失时回退英文原文 -->
			<view class="card" v-if="pad.description || pad.descriptionZh">
				<view class="card-title">简介</view>
				<text class="desc" :class="{ open: descExpanded }">{{ descText }}</text>
				<!-- 短简介不需要折叠：与 launchInfo 一致用 120 字阈值，
				     之前无判断，两行文字也挂着「展开全文」 -->
				<text class="desc-toggle" v-if="descOver" @click="descExpanded = !descExpanded">
					{{ descExpanded ? '收起' : '展开全文' }}
				</text>
			</view>

			<!-- 运营机构 -->
			<view class="card" v-if="pad.agencies && pad.agencies.length">
				<view class="card-title">运营机构</view>
				<view
					class="row row-link"
					v-for="a in pad.agencies"
					:key="a.id"
					@click="goAgency(a.id)"
				>
					<text class="label">机构</text>
					<view class="value-wrap">
						<text class="value value-link">{{ agencyLabel(a.name) }}</text>
						<text class="value-arrow">›</text>
					</view>
				</view>
			</view>

			<!-- 外部资料：审核态整块隐藏，与 rocket 页口径一致
			     （审核员从任务详情 → 发射台不该绕到引导外链的入口） -->
			<view class="card" v-if="!reviewMode && (pad.info_url || pad.wiki_url)">
				<view class="card-title">外部资料</view>
				<view class="row row-link" v-if="pad.wiki_url" @click="copyLink(pad.wiki_url)">
					<text class="label">Wikipedia</text>
					<text class="value value-link">复制链接</text>
				</view>
				<view class="row row-link" v-if="pad.info_url" @click="copyLink(pad.info_url)">
					<text class="label">官方页面</text>
					<text class="value value-link">复制链接</text>
				</view>
			</view>

			<view class="footer-hint">
				<text>数据来源 The Space Devs</text>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'
import { placeZh, agencyLabel as agencyLabelOf, padShort as padShortOf } from '@/utils/format.js'

// 导航栏变实色的滚动阈值（仅 JS 常量，不进模板，安全）
const NAV_SOLID_SCROLL = 180

// 简介折叠阈值：与 launchInfo 同口径，短简介不挂「展开全文」
const DESC_FOLD_LEN = 120

/**
 * 发射工位（pad）详情页。
 * 入口：发射任务详情页「发射台」卡片（工位名可点）。
 * 数据来自 CI 的 pads.json 全量快照（251 条），getById 命中 Storage 通常零网络。
 */
export default {
	mixins: [navMixin],

	data() {
		return {
			padId: '',
			pad: {},
			loading: true,
			navSolid: false,
			descExpanded: false,
			// 审核模式：隐藏外部资料（与 rocket 页同口径）
			reviewMode: false
		}
	},

	computed: {
		/** 简介优先用 CI 回填的中文，翻译没覆盖到再回退英文 */
		descText() {
			return this.pad.descriptionZh || this.pad.description || ''
		},
		/** 超过阈值才显示「展开全文」，两行的短简介折叠没有意义 */
		descOver() {
			return (this.descText || '').length > DESC_FOLD_LEN
		}
	},

	onPageScroll(e) {
		const solid = e.scrollTop > NAV_SOLID_SCROLL
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		this.padId = (query && query.id) || ''
		// 名字兜底：新工位可能还没进库，只有 id 查不到时用名字对一遍
		const qname = (query && query.name) ? decodeURIComponent(query.name) : ''
		// 展示开关：审核态下外部资料整块隐藏
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})
		try {
			let found = this.padId ? await spaceData.getById('pads', this.padId) : null
			if (!found && qname) {
				const d = await spaceData.load('pads')
				const list = (d && d.list) || []
				found = list.find((x) => x.name === qname) || null
			}
			if (found) this.pad = found
		} catch (e) {
			console.warn('[pad] 获取工位失败', e)
		}
		this.loading = false
	},

	// 标题「工位名 · 所属地点」，与页面标题、标签同源（padShort / placeZh 带缩写展开）
	onShareAppMessage() {
		const pad = this.pad || {}
		return {
			title: this.padShareTitle(),
			path: '/pages/pad/pad?id=' + (pad.id || this.padId),
			...((pad.map_image || pad.image) ? { imageUrl: pad.map_image || pad.image } : {})
		}
	},

	onShareTimeline() {
		const pad = this.pad || {}
		return {
			title: this.padShareTitle(),
			query: 'id=' + (pad.id || this.padId),
			...((pad.map_image || pad.image) ? { imageUrl: pad.map_image || pad.image } : {})
		}
	},

	methods: {
		// 模板只能看见实例成员，模块函数要转一层
		placeZh(loc) {
			return placeZh(loc)
		},

		/** 分享标题：工位短名 + 所在地点，缺哪个就少哪一段 */
		padShareTitle() {
			const pad = this.pad || {}
			const name = padShortOf(pad.name) || pad.name || '发射工位'
			const place = placeZh(pad.location && pad.location.name)
			return place ? name + ' · ' + place : name
		},

		agencyLabel(name) {
			return agencyLabelOf(name)
		},

		padShort(name) {
			return padShortOf(name)
		},

		goAgency(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/agencies/agencies?id=' + id })
		},

		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		},

		copyLink(url) {
			if (!url) return
			uni.setClipboardData({ data: url })
		}
	}
}
</script>

<style lang="scss" scoped>
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

.empty-text,
.hint-text {
	color: #6b7891;
	font-size: 28rpx;
}

/* 顶部地图 */
.hero {
	width: 100%;
}

.hero-img {
	display: block;
	width: 100%;
}

.head {
	padding: 24rpx 32rpx 8rpx;
}

.title {
	display: block;
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.35;
}

.tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 16rpx;
}

.tag {
	margin: 0 12rpx 10rpx 0;
	padding: 4rpx 16rpx;
	background: rgba(56, 189, 248, 0.1);
	color: #7bb8e0;
	font-size: 22rpx;
	border-radius: 6rpx;
}

.tag-on {
	background: rgba(74, 222, 128, 0.12);
	color: #6fcf97;
}

.tag-off {
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
}

/* KPI */
.kpi {
	display: flex;
	margin: 20rpx 24rpx;
}

.kpi-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 24rpx 0;
	background: #141a26;
	border-radius: 16rpx;
	margin-right: 16rpx;
}

.kpi-cell:last-child {
	margin-right: 0;
}

.kpi-num {
	color: #38bdf8;
	font-size: 44rpx;
	font-weight: 700;
}

.kpi-label {
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 23rpx;
}

/* 卡片 */
.card {
	margin: 20rpx 24rpx;
	padding: 24rpx 28rpx;
	background: #141a26;
	border-radius: 20rpx;
}

.card-title {
	margin-bottom: 14rpx;
	color: #8a97a8;
	font-size: 26rpx;
}

.row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.row-link {
	// 有箭头的行可以点
	cursor: pointer;
}

.label {
	color: #6b7891;
	font-size: 26rpx;
	flex-shrink: 0;
}

.value {
	text-align: right;
	color: #e2e8f0;
	font-size: 27rpx;
	word-break: break-all;
}

.value-wrap {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	min-width: 0;
}

.value-link {
	color: #38bdf8;
}

.value-arrow {
	color: #4a5568;
	font-size: 30rpx;
	margin-left: 8rpx;
}

.desc {
	display: block;
	color: #8a97a8;
	font-size: 27rpx;
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
	font-size: 25rpx;
}

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
