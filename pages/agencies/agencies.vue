<template>
	<view class="page">
		<nav-bar title="机构信息" solid placeholder />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!agency.id">
			<text class="empty-icon">🏢</text>
			<text class="hint-text">未找到该机构信息</text>
		</view>

		<block v-else>
			<view class="hero">
				<!-- 350 家里只有 44 家有 image_url、127 家有 logo_url，
				     所以主图优先 logo（标识），缺失时再用 image -->
				<image v-if="mainImage" class="hero-logo" :src="mainImage" mode="aspectFit"></image>
				<view v-else class="hero-logo hero-empty">
					<text class="hero-icon">🏢</text>
				</view>

				<text class="name">{{ agency.name }}</text>
				<text class="sub" v-if="subline">{{ subline }}</text>
			</view>

			<view class="card" v-if="desc">
				<view class="card-title">机构简介</view>
				<text class="card-desc">{{ desc }}</text>
			</view>

			<view class="card">
				<view class="card-title">基本信息</view>

				<view class="row" v-if="agency.abbrev">
					<text class="label">缩写</text>
					<text class="value">{{ agency.abbrev }}</text>
				</view>
				<view class="row" v-if="agency.type">
					<text class="label">机构类型</text>
					<text class="value">{{ agency.type }}</text>
				</view>
				<view class="row" v-if="agency.founding_year">
					<text class="label">成立年份</text>
					<text class="value">{{ agency.founding_year }} 年</text>
				</view>
				<view class="row" v-if="agency.country_code">
					<text class="label">国家/地区</text>
					<text class="value">{{ agency.country_code }}</text>
				</view>
				<view class="row" v-if="agency.launchers">
					<text class="label">现役火箭</text>
					<text class="value">{{ agency.launchers }}</text>
				</view>
			</view>

			<!-- 该机构的火箭：从型号库按制造方名字匹配，点了去火箭详情 -->
			<view class="card" v-if="relatedRockets.length">
				<view class="card-title">该机构的火箭</view>
				<view class="rk-list">
					<view
						class="rk-chip"
						hover-class="rk-chip-hover"
						v-for="r in relatedRockets"
						:key="r.id"
						@click="goRocket(r.id)"
					>
						<text class="rk-name">{{ r.full_name || r.name }}</text>
						<text class="rk-arrow">›</text>
					</view>
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

export default {
	data() {
		return {
			agency: {},
			loading: true,
			// 型号库全量，relatedRockets 从这里过滤
			allLaunchers: []
		}
	},
	computed: {
		/**
		 * 该机构的火箭：slimLauncher 的 manufacturer 是名字不是 id，
		 * 用「全等 → 包含 → 缩写」三级匹配对上机构名。
		 */
		relatedRockets() {
			const a = this.agency
			if (!a || !a.name || !this.allLaunchers.length) return []
			return this.allLaunchers
				.filter(
					(x) =>
						x.manufacturer &&
						(x.manufacturer === a.name ||
							x.manufacturer.indexOf(a.name) !== -1 ||
							(a.abbrev && x.manufacturer.indexOf(a.abbrev) !== -1))
				)
				.slice(0, 12)
		},

		mainImage() {
			return this.agency.logo_url || this.agency.image_url || ''
		},
		desc() {
			return this.agency.descriptionZh || this.agency.description || ''
		},
		subline() {
			const parts = []
			if (this.agency.abbrev) parts.push(this.agency.abbrev)
			if (this.agency.country_code) parts.push(this.agency.country_code)
			if (this.agency.founding_year) parts.push(this.agency.founding_year + ' 年成立')
			return parts.join(' · ')
		}
	},
	async onLoad(query) {
		const id = query && query.id
		if (id) {
			const found = await spaceData.getAgencyById(id)
			if (found) this.agency = found
		}
		this.loading = false
		// 机构名确定后拉型号库做「该机构的火箭」（有 Storage 缓存，通常零网络）
		this.loadRelated()
	},

	methods: {
		async loadRelated() {
			try {
				const d = await spaceData.load('launchers')
				this.allLaunchers = (d && d.list) || []
			} catch (e) {
				console.warn('[agencies] 拉取型号库失败', e)
			}
		},

		goRocket(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/rocket/rocket?id=' + id })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	padding: 0 24rpx 60rpx;
	background: #0a0e17;
	box-sizing: border-box;
}

.loading,
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 240rpx 40rpx;
}

.empty-icon {
	font-size: 72rpx;
	margin-bottom: 24rpx;
}

.hint-text {
	color: #6b7891;
	font-size: 28rpx;
}

.hero {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 60rpx 20rpx 40rpx;
}

.hero-logo {
	width: 180rpx;
	height: 180rpx;
	border-radius: 24rpx;
	background: rgba(255, 255, 255, 0.04);
	padding: 20rpx;
	box-sizing: border-box;
}

.hero-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.hero-icon {
	font-size: 64rpx;
	opacity: 0.35;
}

.name {
	margin-top: 26rpx;
	color: #ffffff;
	font-size: 38rpx;
	font-weight: 600;
	text-align: center;
	line-height: 1.4;
}

.sub {
	margin-top: 12rpx;
	color: #6b7891;
	font-size: 26rpx;
	text-align: center;
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
	margin-bottom: 20rpx;
}

.card-desc {
	display: block;
	color: #cbd5e0;
	font-size: 28rpx;
	line-height: 1.8;
}

.row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 14rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.row:first-of-type {
	border-top: none;
}

.label {
	flex-shrink: 0;
	width: 170rpx;
	color: #6b7891;
	font-size: 28rpx;
}

.value {
	flex: 1;
	text-align: right;
	color: #e2e8f0;
	font-size: 28rpx;
	line-height: 1.5;
	word-break: break-all;
}

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>

/* ---- 该机构的火箭 ---- */
.rk-list {
	display: flex;
	flex-wrap: wrap;
	gap: 14rpx;
}

.rk-chip {
	display: flex;
	align-items: center;
	max-width: 100%;
	padding: 12rpx 22rpx;
	background: rgba(56, 189, 248, 0.08);
	border: 1rpx solid rgba(56, 189, 248, 0.25);
	border-radius: 12rpx;
}

.rk-chip-hover {
	background: rgba(56, 189, 248, 0.18);
}

.rk-name {
	color: #7bb8e0;
	font-size: 25rpx;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rk-arrow {
	color: #4a5568;
	font-size: 26rpx;
	margin-left: 10rpx;
}
