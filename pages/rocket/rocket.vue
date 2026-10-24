<template>
	<view class="page">
		<!-- 沉浸式页面没有原生导航栏，返回按钮由组件自己画 -->
		<nav-bar :solid="navSolid" :title="navSolid ? '运载火箭' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!displayName">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">未找到该型号</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<!-- 头图顶到屏幕最上方，型号信息压在渐变遮罩上 -->
			<view class="hero">
				<image
					v-if="heroImages.length"
					class="hero-img"
					:src="heroImages[0]"
					mode="aspectFill"
					@click="preview(heroImages[0])"
				></image>
				<view v-else class="hero-img hero-placeholder">
					<text class="hero-placeholder-icon">🚀</text>
				</view>

				<view class="hero-mask"></view>

				<view class="hero-body">
					<text class="hero-name">{{ displayName }}</text>
					<text class="hero-sub" v-if="subName">{{ subName }}</text>

					<view class="hero-tags" v-if="tags.length">
						<text class="tag" v-for="t in tags" :key="t">{{ t }}</text>
					</view>
				</view>
			</view>

			<view class="body">
				<!-- 四个大数字 -->
				<view class="kpi" v-if="kpis.length">
					<view class="kpi-cell" v-for="k in kpis" :key="k.label">
						<view class="kpi-main">
							<text class="kpi-num">{{ k.value }}</text>
							<text class="kpi-unit">{{ k.unit }}</text>
						</view>
						<text class="kpi-label">{{ k.label }}</text>
					</view>
				</view>

				<!-- 核心参数 -->
				<view class="card" v-if="specs.length">
					<view class="card-title">核心参数</view>
					<view class="row" v-for="s in specs" :key="s.label">
						<text class="label">{{ s.label }}</text>
						<text class="value">{{ s.value }}</text>
					</view>
				</view>

				<!-- 战绩：LL2 直接给了累计数 -->
				<view class="card" v-if="record">
					<view class="card-title">发射战绩</view>
					<view class="row">
						<text class="label">累计发射</text>
						<text class="value">{{ record.total }} 次</text>
					</view>
					<view class="row" v-if="record.success !== null">
						<text class="label">成功 / 失败</text>
						<text class="value">{{ record.success }} / {{ record.fail }}</text>
					</view>
					<view class="row" v-if="record.rate">
						<text class="label">成功率</text>
						<text class="value c-blue">{{ record.rate }}</text>
					</view>
					<view class="row" v-if="record.pending">
						<text class="label">待发射</text>
						<text class="value">{{ record.pending }} 次</text>
					</view>
				</view>

				<!-- 简介 -->
				<view class="card" v-if="descText">
					<view class="card-title">简介</view>
					<text class="card-desc">{{ descText }}</text>
				</view>

				<!-- 外部资料：小程序打不开外链，只能复制。
				     审核态隐藏——引导到外部网站的链接容易被判违规 -->
				<view class="card" v-if="!reviewMode && config && (config.info_url || config.wiki_url)">
					<view class="card-title">外部资料</view>
					<view class="link" v-if="config.info_url" @click="copy(config.info_url, '官网')">
						<text class="link-name">官方网站</text>
						<text class="link-act">复制链接</text>
					</view>
					<view class="link" v-if="config.wiki_url" @click="copy(config.wiki_url, '维基百科')">
						<text class="link-name">维基百科</text>
						<text class="link-act">复制链接</text>
					</view>
				</view>

				<!-- 发射记录：审核态隐藏（列表观感易被判资讯） -->
				<block v-if="!reviewMode && records.length">
					<view class="section-title">
						<text>近期发射</text>
					</view>
					<view class="list">
						<launch-card
							v-for="item in records"
							:key="item.id"
							:item="item"
							@select="goDetail"
						/>
					</view>
				</block>

				<view class="footer-hint">
					<text v-if="reviewMode">数据每日自动同步</text>
					<text v-else-if="records.length">发射记录来自小程序缓存的最近 100 次</text>
					<text v-else>暂无该型号的发射记录</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { rocketName as rocketNameOf } from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'

export default {
	data() {
		return {
			rocketId: '',
			queryName: '',
			config: null,
			records: [],
			loading: true,
			navSolid: false,
			// 审核模式：隐藏外部资料与近期发射
			reviewMode: false
		}
	},

	computed: {
		heroImages() {
			const c = this.config
			if (!c) return []
			// 只镜像了现役型号的图，退役型号这里是空数组，走占位
			return [c.image].filter(Boolean)
		},
		displayName() {
			if (this.config) return rocketNameOf(this.config) || this.config.full_name || this.config.name
			return this.queryName || ''
		},
		subName() {
			// 中文名和英文名都显示，方便对照；一样就不重复
			if (!this.config) return ''
			const en = this.config.full_name || this.config.name || ''
			return en && en !== this.displayName ? en : ''
		},
		tags() {
			const c = this.config
			if (!c) return []

			const out = [c.active ? '现役' : '已退役']
			if (c.reusable) out.push('可复用')

			const fam = (c.families || [])[0]
			if (fam) out.push(fam)
			if (c.max_stage) out.push(c.max_stage + ' 级')
			return out
		},
		kpis() {
			const c = this.config
			if (!c) return []

			const out = []
			if (c.length) out.push({ label: '高度', value: fmt(c.length), unit: 'm' })
			if (c.diameter) out.push({ label: '直径', value: fmt(c.diameter), unit: 'm' })
			if (c.leo_capacity) out.push({ label: 'LEO 运力', value: mass(c.leo_capacity), unit: '' })
			if (c.max_stage) out.push({ label: '级数', value: String(c.max_stage), unit: '级' })
			return out
		},
		specs() {
			const c = this.config
			if (!c) return []

			const out = []
			const push = (label, value) => {
				if (value) out.push({ label, value })
			}

			push('起飞质量', c.launch_mass ? fmt(c.launch_mass) + ' 吨' : '')
			push('起飞推力', c.to_thrust ? fmt(c.to_thrust) + ' kN' : '')
			push('级数', c.min_stage && c.max_stage ? c.min_stage + ' ~ ' + c.max_stage + ' 级' : '')
			push('LEO 运力', c.leo_capacity ? mass(c.leo_capacity) : '')
			push('GTO 运力', c.gto_capacity ? mass(c.gto_capacity) : '')
			push('首飞', c.maiden_flight || '')
			push('状态', c.active ? '现役' : '已退役')
			push('制造方', c.manufacturer || '')
			push('研制成本', c.launch_cost ? cost(c.launch_cost) : '')
			return out
		},
		record() {
			const c = this.config
			if (!c) return null
			if (!c.total_launch_count && !this.records.length) return null

			const total = c.total_launch_count || this.records.length
			const success = typeof c.successful_launches === 'number' ? c.successful_launches : null
			const fail = typeof c.failed_launches === 'number' ? c.failed_launches : null

			let rate = ''
			if (success !== null && fail !== null && success + fail > 0) {
				rate = ((success / (success + fail)) * 100).toFixed(1).replace(/\.0$/, '') + '%'
			}

			return { total, success, fail, rate, pending: c.pending_launches || 0 }
		},
		descText() {
			const c = this.config
			if (!c) return ''
			return c.descriptionZh || c.description || ''
		}
	},

	// 滚过首图后导航栏切成实色
	onPageScroll(e) {
		const solid = e.scrollTop > 180
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		this.rocketId = (query && query.id) || ''
		this.queryName = (query && query.name) ? decodeURIComponent(query.name) : ''

		if (!this.rocketId) {
			this.loading = false
			return
		}

		// 展示开关：审核态下外部资料与近期发射整块隐藏
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})

		await Promise.all([this.loadConfig(), this.loadRecords()])
		this.loading = false
	},

	methods: {
		async loadConfig() {
			try {
				const d = await spaceData.load('launchers')
				const list = (d && d.list) || []
				const id = String(this.rocketId)
				this.config = list.find((x) => String(x.id) === id) || null
			} catch (e) {
				// 型号库还没生成 / 拉取失败时，页面退化成只有发射记录
				console.warn('[rocket] 型号库不可用', e)
			}
		},

		async loadRecords() {
			// 一个型号的发射会分散在 upcoming 和 previous 两边，两边都要扫
			const [prev, up] = await Promise.all([
				spaceData.load('previous').catch(() => null),
				spaceData.load('upcoming').catch(() => null)
			])

			const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]
			const id = String(this.rocketId)

			this.records = all
				.filter((x) => {
					const c = x.rocket && x.rocket.configuration
					return c && String(c.id) === id
				})
				// previous 是倒序、upcoming 是正序，合起来后统一按 net 倒序
				.sort((a, b) => new Date(b.net || 0) - new Date(a.net || 0))
				.slice(0, 30)
		},

		copy(url, label) {
			if (!url) return
			uni.setClipboardData({
				data: url,
				success: () => uni.showToast({ title: label + '链接已复制', icon: 'none' })
			})
		},

		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
		},

		goDetail(item) {
			if (!item || !item.id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + item.id })
		},

		goBack() {
			const pages = getCurrentPages()
			if (pages.length > 1) {
				uni.navigateBack()
			} else {
				uni.switchTab({ url: '/pages/index/index' })
			}
		}
	}
}

/** 4.5 / 70 —— 去掉多余的小数零 */
function fmt(n) {
	const v = Number(n)
	if (!isFinite(v)) return ''
	return (Math.round(v * 10) / 10).toString()
}

/** 运力：大于 1 吨用吨，小运力保留 kg 更直观 */
function mass(kg) {
	const v = Number(kg)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1000) return fmt(v / 1000) + ' 吨'
	return v + ' kg'
}

/** 研制成本：LL2 给的是美元整数 */
function cost(usd) {
	const v = Number(usd)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1e8) return fmt(v / 1e8) + ' 亿美元'
	if (v >= 1e4) return fmt(v / 1e4) + ' 万美元'
	return v + ' 美元'
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 40rpx;
}

/* 头图：顶到屏幕最上方，文字压在渐变遮罩上 */
.hero {
	position: relative;
	width: 100%;
	height: 580rpx;
}

.hero-img {
	width: 100%;
	height: 100%;
	display: block;
}

.hero-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(160deg, #1b2c47 0%, #0d1420 100%);
}

.hero-placeholder-icon {
	font-size: 160rpx;
	opacity: 0.18;
}

.hero-mask {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 380rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, rgba(10, 14, 23, 0.85) 55%, #0a0e17 100%);
}

.hero-body {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 0 32rpx 34rpx;
}

.hero-name {
	display: block;
	color: #ffffff;
	font-size: 46rpx;
	font-weight: 600;
	line-height: 1.3;
	text-shadow: 0 2rpx 16rpx rgba(0, 0, 0, 0.5);
}

.hero-sub {
	display: block;
	margin-top: 10rpx;
	color: #a8b6c8;
	font-size: 26rpx;
}

.hero-tags {
	display: flex;
	flex-wrap: wrap;
	margin-top: 18rpx;
}

.tag {
	margin: 0 14rpx 10rpx 0;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	background: rgba(56, 189, 248, 0.1);
	border: 1rpx solid rgba(56, 189, 248, 0.18);
	color: #7bb8e0;
	font-size: 22rpx;
}

.body {
	padding: 0 24rpx;
	margin-top: -24rpx;
}

/* 四个大数字 */
.kpi {
	display: flex;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	padding: 28rpx 0;
}

.kpi-cell {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.kpi-main {
	display: flex;
	align-items: baseline;
}

.kpi-num {
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.1;
}

.kpi-unit {
	margin-left: 4rpx;
	color: #38bdf8;
	font-size: 22rpx;
}

.kpi-label {
	margin-top: 10rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* 卡片 */
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
	margin-bottom: 14rpx;
}

.card-desc {
	display: block;
	color: #cbd5e0;
	font-size: 28rpx;
	line-height: 1.75;
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
	width: 180rpx;
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

.c-blue {
	color: #38bdf8;
}

/* 外部资料 */
.link {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 18rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.link:first-of-type {
	border-top: none;
}

.link-name {
	color: #e2e8f0;
	font-size: 28rpx;
}

.link-act {
	color: #38bdf8;
	font-size: 24rpx;
}

.section-title {
	margin: 36rpx 8rpx 16rpx;
	color: #8a97a8;
	font-size: 28rpx;
}

.footer-hint {
	margin-top: 30rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
