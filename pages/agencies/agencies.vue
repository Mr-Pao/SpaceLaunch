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

				<text class="name">{{ agencyLabel(agency.name) }}</text>
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
					<text class="value">{{ typeText }}</text>
				</view>
				<view class="row" v-if="agency.founding_year">
					<text class="label">成立年份</text>
					<text class="value">{{ agency.founding_year }} 年</text>
				</view>
				<view class="row" v-if="countryText">
					<text class="label">国家/地区</text>
					<text class="value">{{ countryText }}</text>
				</view>
				<view class="row" v-if="launchersText">
					<text class="label">现役火箭</text>
					<text class="value">{{ launchersText }}</text>
				</view>
			</view>

			<!-- 该机构的火箭：从型号库按制造方名字匹配，点了去火箭详情 -->
			<view class="card" v-if="relatedRockets.length">
				<view class="card-head">
					<text class="card-title">该机构的火箭</text>
					<text class="card-count">{{ relatedRockets.length }} 型</text>
				</view>

				<view class="rk-grid">
					<view
						class="rk-item"
						hover-class="rk-item-hover"
						v-for="r in visibleRockets"
						:key="r.id"
						@click="goRocket(r.id)"
					>
						<view class="rk-dot" :class="{ on: r.active }"></view>
						<view class="rk-body">
							<text class="rk-name">{{ r.title }}</text>
							<text class="rk-variant" v-if="r.variant">{{ r.variant }}</text>
						</view>
						<view class="rk-chevron"></view>
					</view>
				</view>

				<view class="rk-more" hover-class="rk-more-hover" v-if="relatedRockets.length > rkLimit" @click="toggleAll">
					<text>{{ showAll ? '收起' : '展开全部 ' + relatedRockets.length + ' 型' }}</text>
					<view class="rk-caret" :class="{ up: showAll }"></view>
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
import { rocketName, agencyLabel as agencyLabelOf } from '@/utils/format.js'

/**
 * 国家/地区中文名。
 *
 * 350 家机构里 69 个代码，直接显示 "US" "FR" 太生硬。
 * 表是本地常量，不占翻译额度，也不给后端加字段。
 * 港澳台一律带「中国」前缀，这是合规红线。
 */
const COUNTRY_ZH = {
	US: '美国', CN: '中国', RU: '俄罗斯', JP: '日本', IN: '印度', FR: '法国',
	DE: '德国', GB: '英国', KR: '韩国', IL: '以色列', NZ: '新西兰', AU: '澳大利亚',
	CA: '加拿大', IT: '意大利', ES: '西班牙', BR: '巴西', IR: '伊朗', KP: '朝鲜',
	UA: '乌克兰', NL: '荷兰', SE: '瑞典', NO: '挪威', SG: '新加坡', AR: '阿根廷',
	MX: '墨西哥', TR: '土耳其', AE: '阿联酋', SA: '沙特阿拉伯', KZ: '哈萨克斯坦',
	TW: '中国台湾', HK: '中国香港', MO: '中国澳门',
	UY: '乌拉圭', DZ: '阿尔及利亚', MY: '马来西亚', AT: '奥地利', AZ: '阿塞拜疆',
	BY: '白俄罗斯', BE: '比利时', VE: '委内瑞拉', BO: '玻利维亚', BG: '保加利亚',
	CO: '哥伦比亚', DK: '丹麦', HR: '克罗地亚', PT: '葡萄牙', TH: '泰国',
	HU: '匈牙利', GR: '希腊', LU: '卢森堡', LT: '立陶宛', CZ: '捷克',
	EG: '埃及', PE: '秘鲁', ID: '印度尼西亚', MN: '蒙古', TN: '突尼斯',
	NG: '尼日利亚', PK: '巴基斯坦', PL: '波兰', BM: '百慕大', MU: '毛里求斯',
	RO: '罗马尼亚', MA: '摩洛哥', CH: '瑞士', ZA: '南非', BD: '孟加拉国',
	LK: '斯里兰卡', TM: '土库曼斯坦', UZ: '乌兹别克斯坦', VN: '越南'
}

/** 机构类型（LL2 只有这 6 种取值） */
const TYPE_ZH = {
	Commercial: '商业航天',
	Government: '政府机构',
	Multinational: '多国合作',
	Private: '私营企业',
	Educational: '教育机构',
	Unknown: '未知'
}

export default {
	data() {
		return {
			agency: {},
			loading: true,
			// 型号库全量，relatedRockets 从这里过滤
			allLaunchers: [],
			// 「该机构的火箭」默认折叠到这里，多的点展开
			rkLimit: 8,
			showAll: false
		}
	},
	computed: {
		/**
		 * 该机构的火箭：slimLauncher 的 manufacturer 是名字不是 id，
		 * 用「全等 → 包含 → 缩写」三级匹配对上机构名。
		 *
		 * 排序：在役优先，同组内按首飞时间倒序（新的在前），
		 * 这样 SpaceX 页第一眼看到的是 Falcon 9 Block 5 而不是 2006 年的 Falcon 1。
		 */
		relatedRockets() {
			const a = this.agency
			if (!a || !a.name || !this.allLaunchers.length) return []

			const keys = [a.name]
			if (a.abbrev) keys.push(a.abbrev)

			const hit = this.allLaunchers.filter((x) => {
				const m = x.manufacturer
				if (!m) return false
				return keys.some((k) => m === k || m.indexOf(k) !== -1)
			})

			hit.sort((p, q) => {
				if (!!p.active !== !!q.active) return p.active ? -1 : 1
				return String(q.maiden_flight || '').localeCompare(String(p.maiden_flight || ''))
			})

			return hit.map((x) => {
				const zh = rocketName({ name: x.name })
				const translated = zh !== x.name
				const v = String(x.variant || '').trim()
				// LL2 里 variant 存在 "N/A" 这种占位值，直接显示会很突兀
				const junk = !v || /^(n\/a|none|null|unknown|-+)$/i.test(v)
				// 中文名已经含型号（长征二号丙 / 朱雀三号），旁边再挂英文型号很乱；
				// "Falcon 1" 的 variant 就是 "1"，也会重复
				const showVariant =
					!translated && !junk && v !== x.name && x.name.indexOf(v) === -1 && v.indexOf(x.name) === -1

				return {
					id: x.id,
					active: Boolean(x.active),
					title: zh,
					variant: showVariant ? v : ''
				}
			})
		},

		visibleRockets() {
			return this.showAll ? this.relatedRockets : this.relatedRockets.slice(0, this.rkLimit)
		},

		mainImage() {
			return this.agency.logo_url || this.agency.image_url || ''
		},
		desc() {
			return this.agency.descriptionZh || this.agency.description || ''
		},
		countryText() {
			const c = this.agency.country_code
			if (!c) return ''
			return COUNTRY_ZH[c] || c
		},
		typeText() {
			const t = this.agency.type
			if (!t) return ''
			return TYPE_ZH[t] || t
		},
		launchersText() {
			const raw = this.agency.launchers
			if (!raw) return ''
			return raw
				.split('|')
				.map((s) => s.trim())
				.filter(Boolean)
				.join(' · ')
		},
		subline() {
			const parts = []
			if (this.agency.abbrev) parts.push(this.agency.abbrev)
			if (this.countryText) parts.push(this.countryText)
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
		// 模板只能看见实例成员，模块作用域的函数必须转一层
		agencyLabel(name) {
			return agencyLabelOf(name)
		},

		toggleAll() {
			this.showAll = !this.showAll
		},

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

/* ---- 该机构的火箭 ----
   注意：这段原来被写在了 style 块的闭合标签外面，等于一堆死样式，
   所以之前的胶囊一直是裸文本堆叠（还有字符箭头渲染成方块的问题）。 */

.card-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.card-head .card-title {
	margin-bottom: 0;
}

.card-count {
	color: #4d5a6e;
	font-size: 24rpx;
}

/* 两列网格：1rpx 边框在小屏上会糊，这里用背景块 + 空隙分隔，
   比 12 个占满整行的胶囊紧凑得多 */
.rk-grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
}

.rk-item {
	display: flex;
	align-items: center;
	width: 48.5%;
	/* 有 variant 的撑到两行、没有的一行，不给最小高度会参差不齐 */
	min-height: 96rpx;
	box-sizing: border-box;
	margin-bottom: 14rpx;
	padding: 16rpx 18rpx;
	background: #0f1622;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 14rpx;
}

.rk-item-hover {
	background: #16202f;
	border-color: rgba(56, 189, 248, 0.3);
}

/* 在役 / 退役的状态点，比写「在役」两个字省地方 */
.rk-dot {
	flex-shrink: 0;
	width: 12rpx;
	height: 12rpx;
	margin-right: 14rpx;
	border-radius: 50%;
	background: #39465c;
}

.rk-dot.on {
	background: #38bdf8;
	box-shadow: 0 0 8rpx rgba(56, 189, 248, 0.7);
}

.rk-body {
	flex: 1;
	min-width: 0;
}

.rk-name {
	display: block;
	color: #dbe6f2;
	font-size: 26rpx;
	line-height: 1.35;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.rk-variant {
	display: block;
	margin-top: 2rpx;
	color: #5c6b82;
	font-size: 21rpx;
	line-height: 1.3;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* 箭头用 CSS 画：字符 "›" 在部分安卓机型上会渲染成方块 */
.rk-chevron {
	flex-shrink: 0;
	width: 12rpx;
	height: 12rpx;
	margin-left: 10rpx;
	border-top: 2rpx solid #3f4d63;
	border-right: 2rpx solid #3f4d63;
	transform: rotate(45deg);
}

.rk-more {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 6rpx;
	padding-top: 18rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
	color: #38bdf8;
	font-size: 25rpx;
}

.rk-more-hover {
	opacity: 0.6;
}

.rk-caret {
	width: 10rpx;
	height: 10rpx;
	margin-left: 10rpx;
	margin-top: -4rpx;
	border-right: 2rpx solid #38bdf8;
	border-bottom: 2rpx solid #38bdf8;
	transform: rotate(45deg);
}

.rk-caret.up {
	margin-top: 4rpx;
	transform: rotate(-135deg);
}
</style>
