<template>
	<view class="page">
		<!-- 沉浸式页面没有原生导航栏，返回按钮由组件自己画 -->
		<nav-bar :solid="navSolid" :title="navSolid ? '火箭详情' : ''" />

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!config">
			<text class="empty-icon">🛰️</text>
			<text class="hint-text">未找到该型号</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<!-- 头图顶到屏幕最上方，型号信息压在渐变遮罩上 -->
			<view class="hero">
				<image
					v-if="heroImage"
					class="hero-img"
					:src="heroImage"
					mode="aspectFill"
					@click="preview(heroImage)"
				></image>
				<view v-else class="hero-img hero-placeholder">
					<text class="hero-placeholder-icon">🚀</text>
				</view>

				<view class="hero-mask"></view>

				<!-- 制造方面包屑：压在图片左上角，点了去机构详情 -->
				<view
					class="crumb"
					v-if="config.manufacturer"
					:style="{ top: statusBarH + 56 + 'px' }"
					hover-class="crumb-hover"
					@click="goAgency(config.manufacturer)"
				>
					<text class="crumb-name">{{ maker }}</text>
					<view class="crumb-arrow"></view>
				</view>

				<view class="hero-body">
					<text class="hero-name">{{ seriesTitle }}</text>
					<text class="hero-sub" v-if="subName">{{ subName }}</text>

					<view class="hero-tags">
						<text class="tag" :class="config.active ? 'tag-on' : 'tag-off'">
							{{ config.active ? '现役' : '已退役' }}
						</text>
						<text class="tag" v-if="config.reusable">可复用</text>
						<text class="tag" v-if="config.max_stage">{{ config.max_stage }} 级</text>
					</view>
				</view>
			</view>

			<view class="body">
				<!-- 简介 -->
				<view class="card" v-if="descText">
					<view class="card-head">
						<text class="card-title">简介</text>
					</view>
					<text class="desc" :class="{ 'desc-fold': needFold && !descOpen }">{{ descText }}</text>
					<view class="desc-more" v-if="needFold" @click="descOpen = !descOpen">
						<text class="desc-more-text">{{ descOpen ? '收起' : '展开全部' }}</text>
						<view class="desc-more-arrow" :class="{ up: descOpen }"></view>
					</view>
				</view>

				<!-- 系列统计：同系列的构型加总，和参考页的「系列统计」一个口径 -->
				<view class="card" v-if="stats.length">
					<view class="card-head">
						<text class="card-title">{{ seriesTitle }} 系列统计</text>
						<text class="card-note" v-if="variants.length > 1">{{ variants.length }} 个构型</text>
					</view>

					<view class="stat-grid">
						<view class="stat-cell" v-for="s in stats" :key="s.label">
							<view class="stat-label-row">
								<view class="stat-dot" :class="'dot-' + s.tone"></view>
								<text class="stat-label">{{ s.label }}</text>
							</view>
							<text class="stat-num" :class="'num-' + s.tone">{{ s.value }}</text>
						</view>
					</view>
				</view>

				<!-- 不同构型：同一个系列下的各型号，点了原地切换 -->
				<view class="section" v-if="variants.length > 1">
					<view class="section-head">
						<text class="section-title">不同构型</text>
						<text class="section-note">{{ variants.length }} 型</text>
					</view>

					<view
						class="vcard"
						v-for="v in variants"
						:key="v.id"
						:class="{ 'vcard-cur': v.current }"
						hover-class="vcard-hover"
						@click="switchTo(v)"
					>
						<view class="vcard-top">
							<text class="vcard-name">{{ v.name }}</text>
							<text
								class="vbadge"
								:class="v.current ? 'vbadge-cur' : v.active ? 'vbadge-on' : 'vbadge-off'"
							>{{ v.current ? '当前' : v.active ? '现役' : '退役' }}</text>
						</view>

						<view class="vcard-main">
							<image v-if="v.image" class="vthumb" :src="v.image" mode="aspectFill" lazy-load></image>
							<view v-else class="vthumb vthumb-ph">
								<text class="vthumb-icon">🚀</text>
							</view>

							<view class="vbody">
								<text class="vmaiden" v-if="v.maiden">首飞 {{ v.maiden }}</text>

								<view class="vgrid" v-if="v.params.length">
									<view class="vgrid-cell" v-for="p in v.params" :key="p.label">
										<text class="vgrid-label">{{ p.label }}</text>
										<text class="vgrid-value">{{ p.value }}</text>
									</view>
								</view>

								<view class="vfoot" v-if="v.foot.length">
									<text class="vfoot-item" v-for="(f, i) in v.foot" :key="f">
										<text class="vfoot-dot" v-if="i">·</text>{{ f }}
									</text>
								</view>
							</view>
						</view>
					</view>
				</view>

				<!-- 单构型的系列没有「不同构型」可列，参数直接铺开 -->
				<view class="card" v-else-if="currentParams.length">
					<view class="card-head">
						<text class="card-title">技术参数</text>
					</view>
					<view class="param-row" v-for="p in currentParams" :key="p.label">
						<text class="param-label">{{ p.label }}</text>
						<text class="param-value">{{ p.value }}</text>
					</view>
				</view>

				<!-- 发射场地：从该系列的发射记录里聚合出来的 -->
				<block v-if="!reviewMode">
					<view class="section" v-if="pads.length">
						<view class="section-head">
							<text class="section-title">发射场地</text>
							<text class="section-note" v-if="padsPartial">基于近期记录</text>
						</view>

						<view class="pad-card">
							<view class="pad-row" v-for="p in pads" :key="p.name" hover-class="pad-hover" @click="goPad(p.name)">
								<view class="pad-body">
									<text class="pad-name">{{ p.name }}</text>
									<view class="pad-meta">
										<text class="pad-country" v-if="p.country">{{ p.country }}</text>
										<text class="pad-count">{{ p.count }} 次</text>
									</view>
								</view>
								<view class="pad-arrow"></view>
							</view>
						</view>
					</view>

					<!-- 即将发射 -->
					<view class="section" v-if="upcoming.length">
						<view class="section-head">
							<text class="section-title">即将发射</text>
							<text class="section-note">{{ upcoming.length }} 次</text>
						</view>
						<launch-card v-for="item in upcomingShown" :key="item.id" :item="item" @select="goDetail" />
						<view
							class="more-btn"
							v-if="upcoming.length > FOLD"
							@click="upcomingOpen = !upcomingOpen"
						>
							<text class="more-text">{{ upcomingOpen ? '收起' : '展开全部 ' + upcoming.length + ' 次' }}</text>
						</view>
					</view>

					<!-- 历史发射：快照只有最近的记录，标题如实写「近期」 -->
					<view class="section" v-if="history.length">
						<view class="section-head">
							<text class="section-title">历史发射</text>
							<text class="section-note">近期 {{ history.length }} 次</text>
						</view>
						<launch-card v-for="item in historyShown" :key="item.id" :item="item" @select="goDetail" />
						<view
							class="more-btn"
							v-if="history.length > FOLD"
							@click="historyOpen = !historyOpen"
						>
							<text class="more-text">{{ historyOpen ? '收起' : '展开全部 ' + history.length + ' 次' }}</text>
						</view>
					</view>

					<!-- 外部资料：小程序打不开外链，只能复制 -->
					<view class="card" v-if="config.info_url || config.wiki_url">
						<view class="card-head">
							<text class="card-title">外部资料</text>
						</view>
						<view class="link" v-if="config.info_url" @click="copy(config.info_url, '官网')">
							<text class="link-name">官方网站</text>
							<text class="link-act">复制链接</text>
						</view>
						<view class="link" v-if="config.wiki_url" @click="copy(config.wiki_url, '维基百科')">
							<text class="link-name">维基百科</text>
							<text class="link-act">复制链接</text>
						</view>
					</view>
				</block>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import {
	rocketName as rocketNameOf,
	seriesKey,
	seriesName,
	agencyLabel,
	countryOf,
	isStillUpcoming,
	textUnits
} from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'

// 同系列构型少于这个数就不当「系列」看：Falcon 家族里只有 Falcon 1 / Falcon Heavy
// 两种互不相干的火箭，标题写「猎鹰」反而不如直接写型号名
const SERIES_MIN = 3
// 发射列表默认露几条，其余收起来（参考页也是先给几条，想看再展开）
const FOLD = 3

export default {
	mixins: [navMixin],

	data() {
		return {
			rocketId: '',
			queryName: '',
			all: [],
			config: null,
			records: [],
			loading: true,
			navSolid: false,
			// 审核模式：隐藏外部资料、发射场地与发射列表
			reviewMode: false,
			descOpen: false,
			// 发射列表默认折叠到 FOLD 条，点「展开全部」再看完整列表
			FOLD,
			upcomingOpen: false,
			historyOpen: false
		}
	},

	computed: {
		heroImage() {
			const c = this.config
			if (!c) return ''
			// 目前只有现役型号镜像了图片，退役型号走占位
			return c.image || ''
		},

		maker() {
			return agencyLabel(this.config && this.config.manufacturer)
		},

		/** 同系列的其它构型；只有自己时返回空数组 */
		siblings() {
			const c = this.config
			if (!c) return []
			const key = seriesKey(c)
			if (!key) return []
			return this.all.filter((x) => seriesKey(x) === key)
		},

		/**
		 * 标题。构型够多（>= 3）才是「系列」，用系列名（猎鹰9号 / 长征二号）；
		 * 否则直接用型号名 —— 一个系列只有两型时，型号名信息量更大。
		 */
		seriesTitle() {
			const c = this.config
			if (!c) return ''
			if (this.siblings.length >= SERIES_MIN) {
				return seriesName(seriesKey(c)) || rocketNameOf(c) || c.name
			}
			return rocketNameOf(c) || c.name
		},

		subName() {
			const c = this.config
			if (!c) return ''
			const en = c.full_name || c.name || ''
			// 与标题完全一样（Falcon 1 / 未翻译型号）就不重复
			return en && en !== this.seriesTitle ? en : ''
		},

		stats() {
			const list = this.siblings.length ? this.siblings : this.config ? [this.config] : []
			if (!list.length) return []

			let ok = 0
			let fail = 0
			let pending = 0
			let total = 0
			for (const x of list) {
				ok += Number(x.successful_launches) || 0
				fail += Number(x.failed_launches) || 0
				pending += Number(x.pending_launches) || 0
				total += Number(x.total_launch_count) || 0
			}

			const flown = ok + fail
			const rate = flown > 0 ? ((ok / flown) * 100).toFixed(1).replace(/\.0$/, '') + '%' : '—'

			const out = [
				{ label: '总发射', value: fmtInt(total || flown), tone: 'plain' },
				{ label: '成功率', value: rate, tone: 'good' },
				{ label: '成功', value: fmtInt(ok), tone: 'good' },
				{ label: '失败', value: fmtInt(fail), tone: 'bad' },
				{ label: '待发射', value: fmtInt(pending), tone: 'warn' },
				{ label: '构型', value: fmtInt(list.length), tone: 'plain' }
			]
			// 全 0 的格子没意义（早期型号常常只有一两个数字）
			return out.filter((s) => s.value !== '0' && s.value !== '—')
		},

		/** 构型卡片：名称、首飞、六格参数、底行战绩 */
		variants() {
			const list = this.siblings
			if (!list.length) return []

			const curId = String(this.rocketId)
			const sorted = [...list].sort((a, b) => {
				// 现役优先，其次首飞时间新的在前，最后按发射次数
				if (a.active !== b.active) return a.active ? -1 : 1
				const ma = String(a.maiden_flight || '')
				const mb = String(b.maiden_flight || '')
				if (ma !== mb) return mb.localeCompare(ma)
				return (b.total_launch_count || 0) - (a.total_launch_count || 0)
			})

			return sorted.map((x) => {
				const ok = Number(x.successful_launches) || 0
				const fail = Number(x.failed_launches) || 0
				const rate = ok + fail > 0 ? ((ok / (ok + fail)) * 100).toFixed(1).replace(/\.0$/, '') + '%' : ''

				// 只留战绩：造价已经在上面 paramList 的格子里了，再写一遍等于重复
				const foot = []
				if (rate) foot.push('成功率 ' + rate)
				if (x.total_launch_count) foot.push(x.total_launch_count + ' 次发射')

				return {
					id: x.id,
					name: rocketNameOf(x) || x.name,
					active: Boolean(x.active),
					current: String(x.id) === curId,
					image: x.image || '',
					maiden: x.maiden_flight || '',
					params: paramList(x),
					foot
				}
			})
		},

		/** 单构型系列的参数长表 */
		currentParams() {
			const c = this.config
			if (!c || this.variants.length > 1) return []
			return paramList(c)
		},

		descText() {
			const c = this.config
			if (!c) return ''
			return c.descriptionZh || c.description || ''
		},

		/**
		 * 简介按 4 行折叠（样式里 line-clamp），所以判断「要不要给展开按钮」
		 * 不能数字符数：中文一个字约占英文两倍宽度，160 个中文字已经是 6 行。
		 * 这里统一换算成视觉宽度，200 大约等于 4 行 × 50 个单位。
		 */
		needFold() {
			return textUnits(this.descText) > 200
		},

		/** 该系列的各型 id，用来从发射快照里筛记录 */
		seriesIds() {
			const list = this.siblings.length ? this.siblings : this.config ? [this.config] : []
			const set = {}
			for (const x of list) set[String(x.id)] = 1
			return set
		},

		upcoming() {
			return this.records.filter((x) => isStillUpcoming(x)).sort(byNetAsc)
		},

		upcomingShown() {
			return this.upcomingOpen ? this.upcoming : this.upcoming.slice(0, FOLD)
		},

		history() {
			return this.records.filter((x) => !isStillUpcoming(x)).sort(byNetDesc)
		},

		historyShown() {
			return this.historyOpen ? this.history : this.history.slice(0, FOLD)
		},

		/**
		 * 发射场地：从发射记录里聚合。
		 * 快照只到最近 100 条历史，所以多场地的型号这里可能不全，
		 * 页面标题会标「基于近期记录」，不假装是全集。
		 */
		pads() {
			const map = {}
			const order = []
			for (const r of this.records) {
				const p = r.pad || {}
				const name = p.name
				if (!name) continue
				// LL2 里有一批工位名就叫 "Unknown Pad"，聚出来是纯噪音
				if (/unknown/i.test(name)) continue
				if (!map[name]) {
					map[name] = { name, country: countryOf(r), count: 0 }
					order.push(name)
				}
				map[name].count++
			}
			return order
				.map((n) => map[n])
				.sort((a, b) => b.count - a.count)
				.slice(0, 5)
		},

		padsPartial() {
			return this.records.length >= 100
		}
	},

	onShow() {
		// 页面可能被复用（从机构页返回），开关状态必须跟手刷新
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})
	},

	onPageScroll(e) {
		const solid = e.scrollTop > 180
		if (solid !== this.navSolid) this.navSolid = solid
	},

	async onLoad(query) {
		this.rocketId = (query && query.id) || ''
		this.queryName = query && query.name ? decodeURIComponent(query.name) : ''

		if (!this.rocketId) {
			this.loading = false
			return
		}

		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})

		await this.loadConfig()
		await this.loadRecords()
		this.loading = false
	},

	methods: {
		async loadConfig() {
			try {
				const d = await spaceData.load('launchers')
				const list = (d && d.list) || []
				this.all = list
				const id = String(this.rocketId)
				this.config = list.find((x) => String(x.id) === id) || null
			} catch (e) {
				// 型号库还没生成 / 拉取失败时，页面退化成只有发射记录
				console.warn('[rocket] 型号库不可用', e)
			}
		},

		/**
		 * 发射记录：按「系列内所有构型」筛，不再只看当前这一型。
		 * 一个系列的发射会分散在 upcoming 和 previous 两个快照里，两边都扫。
		 */
		async loadRecords() {
			if (!this.config) return

			const [prev, up] = await Promise.all([
				spaceData.load('previous').catch(() => null),
				spaceData.load('upcoming').catch(() => null)
			])

			const ids = this.seriesIds
			const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]

			this.records = all.filter((x) => {
				const c = x.rocket && x.rocket.configuration
				return c && ids[String(c.id)]
			})
		},

		/** 切到同系列的另一个构型：原地替换，返回时回列表而不是逐个退栈 */
		switchTo(v) {
			if (!v || v.current) return
			uni.redirectTo({
				url: '/pages/rocket/rocket?id=' + v.id + '&name=' + encodeURIComponent(v.name)
			})
		},

		/**
		 * 制造方 → 机构页。slimLauncher 的 manufacturer 只有名字没有 id，
		 * 拿名字去 agencies 数据集里对（全等 → 包含 → 缩写）。
		 */
		async goAgency(name) {
			if (!name) return
			try {
				const d = await spaceData.load('agencies')
				const list = (d && d.list) || []
				const found =
					list.find((a) => a.name === name) ||
					list.find((a) => a.name && (a.name.indexOf(name) !== -1 || name.indexOf(a.name) !== -1)) ||
					list.find((a) => a.abbrev && a.abbrev === name)
				if (found && found.id) {
					uni.navigateTo({ url: '/pages/agencies/agencies?id=' + found.id })
				} else {
					uni.showToast({ title: '机构库中暂无该制造方', icon: 'none' })
				}
			} catch (e) {
				console.warn('[rocket] 查找机构失败', e)
			}
		},

		/** 工位页支持 ?name= 兜底，快照里没留 pad.id 也能进 */
		goPad(name) {
			if (!name) return
			uni.navigateTo({ url: '/pages/pad/pad?name=' + encodeURIComponent(name) })
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

/** 千分位：发射次数到三位数以上不加分隔看着费劲 */
function fmtInt(n) {
	const v = Number(n)
	if (!isFinite(v) || v <= 0) return '0'
	return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 运力：大于 1 吨用吨，小运力保留 kg 更直观 */
function mass(kg) {
	const v = Number(kg)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1000) return fmt(v / 1000) + ' 吨'
	return v + ' kg'
}

/** 研制成本：LL2 给的是美元整数 */
function costText(usd) {
	const v = Number(usd)
	if (!isFinite(v) || v <= 0) return ''
	if (v >= 1e8) return fmt(v / 1e8) + ' 亿美元'
	if (v >= 1e4) return fmt(v / 1e4) + ' 万美元'
	return v + ' 美元'
}

/**
 * 构型卡的六格参数。缺值直接不出现 —— 留一个「—」占位反而更乱。
 * 顺序按「看火箭最先想知道的」排：推力、粗细、运力。
 * 首飞不在这里：卡片顶部已经单独写了一行，重复一遍是噪音。
 */
function paramList(c) {
	const out = []
	const push = (label, value) => {
		if (value) out.push({ label, value })
	}

	push('起飞推力', c.to_thrust ? fmtInt(c.to_thrust) + ' kN' : '')
	push('长度', c.length ? fmt(c.length) + ' m' : '')
	push('直径', c.diameter ? fmt(c.diameter) + ' m' : '')
	push('级数', c.max_stage ? c.max_stage + ' 级' : '')
	push('LEO 运力', mass(c.leo_capacity))
	push('GTO 运力', mass(c.gto_capacity))
	push('起飞质量', c.launch_mass ? fmt(c.launch_mass) + ' 吨' : '')
	push('造价', costText(c.launch_cost))

	return out
}

function byNetAsc(a, b) {
	return new Date(a.net || 0) - new Date(b.net || 0)
}

function byNetDesc(a, b) {
	return new Date(b.net || 0) - new Date(a.net || 0)
}
</script>

<style lang="scss" scoped>
@import '../../styles/list.scss';

.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 60rpx;
}

/* 头图：顶到屏幕最上方，文字压在渐变遮罩上 */
.hero {
	position: relative;
	width: 100%;
	height: 560rpx;
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
	height: 400rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, rgba(10, 14, 23, 0.8) 50%, #0a0e17 100%);
}

/* 制造方面包屑 */
.crumb {
	position: absolute;
	left: 24rpx;
	display: flex;
	align-items: center;
	padding: 8rpx 18rpx;
	background: rgba(8, 12, 20, 0.42);
	border-radius: 30rpx;
}

.crumb-hover {
	background: rgba(8, 12, 20, 0.66);
}

.crumb-name {
	color: #dbe6f5;
	font-size: 23rpx;
}

.crumb-arrow {
	width: 12rpx;
	height: 12rpx;
	margin-left: 10rpx;
	border-top: 2rpx solid #9fb0c6;
	border-right: 2rpx solid #9fb0c6;
	transform: rotate(45deg);
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
	font-size: 52rpx;
	font-weight: 600;
	line-height: 1.25;
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
	margin: 0 14rpx 8rpx 0;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	background: rgba(255, 255, 255, 0.08);
	color: #c3cedd;
	font-size: 22rpx;
}

.tag-on {
	background: rgba(52, 199, 89, 0.16);
	color: #4ade80;
}

.tag-off {
	background: rgba(255, 255, 255, 0.07);
	color: #8a97a8;
}

.body {
	padding: 0 24rpx;
	margin-top: -16rpx;
}

/* ---- 卡片 ---- */
.card {
	margin-top: 22rpx;
	padding: 26rpx 28rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16rpx;
}

.card-title {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
}

.card-note {
	color: #6b7891;
	font-size: 22rpx;
}

/* ---- 简介 ---- */
.desc {
	display: block;
	color: #cbd5e0;
	font-size: 27rpx;
	line-height: 1.78;
}

.desc-fold {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
}

.desc-more {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 16rpx;
	padding-top: 14rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.desc-more-text {
	color: #38bdf8;
	font-size: 24rpx;
}

.desc-more-arrow {
	width: 12rpx;
	height: 12rpx;
	margin-left: 10rpx;
	border-right: 2rpx solid #38bdf8;
	border-bottom: 2rpx solid #38bdf8;
	transform: rotate(45deg) translateY(-2rpx);
}

.desc-more-arrow.up {
	transform: rotate(-135deg) translateY(-2rpx);
}

/* ---- 统计六格 ---- */
.stat-grid {
	display: flex;
	flex-wrap: wrap;
}

.stat-cell {
	width: 50%;
	padding: 18rpx 0;
	box-sizing: border-box;
}

/* 奇数格占左侧，竖线画在它身上；偶数格让出内边距 */
.stat-cell:nth-child(odd) {
	padding-right: 24rpx;
	border-right: 1rpx solid rgba(255, 255, 255, 0.05);
}

.stat-cell:nth-child(even) {
	padding-left: 28rpx;
}

/* 从第三格开始加横线，第一行不画 */
.stat-cell:nth-child(n + 3) {
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.stat-label-row {
	display: flex;
	align-items: center;
}

.stat-dot {
	width: 12rpx;
	height: 12rpx;
	margin-right: 10rpx;
	border-radius: 50%;
	background: #4a5568;
}

.dot-good {
	background: #34c759;
}

.dot-bad {
	background: #f87171;
}

.dot-warn {
	background: #f5c33b;
}

.stat-label {
	color: #6b7891;
	font-size: 23rpx;
}

.stat-num {
	display: block;
	margin-top: 10rpx;
	color: #ffffff;
	font-size: 42rpx;
	font-weight: 600;
	line-height: 1.1;
}

.num-good {
	color: #4ade80;
}

.num-bad {
	color: #f87171;
}

.num-warn {
	color: #f5c33b;
}

/* ---- 不同构型 ---- */
.section {
	margin-top: 30rpx;
}

.section-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	padding: 0 6rpx 14rpx;
}

.section-title {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
}

.section-note {
	color: #6b7891;
	font-size: 22rpx;
}

.vcard {
	margin-bottom: 18rpx;
	padding: 22rpx 24rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.vcard-hover {
	background: #1a2231;
}

.vcard-cur {
	border-color: rgba(56, 189, 248, 0.4);
	background: rgba(56, 189, 248, 0.06);
}

.vcard-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16rpx;
}

.vcard-name {
	flex: 1;
	min-width: 0;
	color: #ffffff;
	font-size: 29rpx;
	font-weight: 600;
	line-height: 1.35;
}

.vbadge {
	flex-shrink: 0;
	margin-left: 14rpx;
	padding: 4rpx 14rpx;
	border-radius: 6rpx;
	font-size: 20rpx;
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
}

.vbadge-cur {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

.vbadge-on {
	background: rgba(52, 199, 89, 0.14);
	color: #34c759;
}

.vcard-main {
	display: flex;
	align-items: flex-start;
}

.vthumb {
	width: 128rpx;
	height: 176rpx;
	flex-shrink: 0;
	margin-right: 20rpx;
	border-radius: 12rpx;
	background: #0f1520;
}

.vthumb-ph {
	display: flex;
	align-items: center;
	justify-content: center;
}

.vthumb-icon {
	font-size: 46rpx;
	opacity: 0.35;
}

/* min-width:0 必须有：flex 子项默认按内容宽度算，
   否则长型号名会把整个右栏顶宽，参数网格被挤成一列 */
.vbody {
	flex: 1;
	min-width: 0;
}

.vmaiden {
	display: block;
	margin-bottom: 12rpx;
	color: #8a97a8;
	font-size: 22rpx;
}

.vgrid {
	display: flex;
	flex-wrap: wrap;
}

.vgrid-cell {
	width: 50%;
	padding: 7rpx 0;
	box-sizing: border-box;
}

.vgrid-cell:nth-child(odd) {
	padding-right: 12rpx;
}

.vgrid-label {
	display: block;
	color: #5d6b80;
	font-size: 20rpx;
}

.vgrid-value {
	display: block;
	margin-top: 3rpx;
	color: #dbe6f5;
	font-size: 24rpx;
	font-weight: 500;
}

.vfoot {
	display: flex;
	flex-wrap: wrap;
	margin-top: 12rpx;
	padding-top: 12rpx;
	border-top: 1rpx solid rgba(255, 255, 255, 0.05);
}

.vfoot-item {
	color: #7d8ba0;
	font-size: 21rpx;
}

.vfoot-dot {
	margin: 0 8rpx;
	color: #3d4a5c;
}

/* 单构型的长参数表 */
.param-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	padding: 12rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.param-row:first-child {
	border-top: none;
}

.param-label {
	flex-shrink: 0;
	color: #6b7891;
	font-size: 25rpx;
}

.param-value {
	flex: 1;
	text-align: right;
	color: #e2e8f0;
	font-size: 25rpx;
}

/* ---- 发射场地 ---- */
.pad-card {
	padding: 6rpx 24rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.pad-row {
	display: flex;
	align-items: center;
	padding: 22rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.pad-row:first-child {
	border-top: none;
}

.pad-hover {
	opacity: 0.7;
}

.pad-body {
	flex: 1;
	min-width: 0;
}

.pad-name {
	display: block;
	color: #e2e8f0;
	font-size: 26rpx;
	line-height: 1.4;
}

.pad-meta {
	display: flex;
	align-items: center;
	margin-top: 6rpx;
}

.pad-country {
	color: #6b7891;
	font-size: 22rpx;
}

.pad-count {
	margin-left: 14rpx;
	color: #38bdf8;
	font-size: 22rpx;
}

.pad-arrow {
	width: 14rpx;
	height: 14rpx;
	flex-shrink: 0;
	margin-left: 16rpx;
	border-top: 2rpx solid #3d4a5c;
	border-right: 2rpx solid #3d4a5c;
	transform: rotate(45deg);
}

/* ---- 底部 ---- */
.more-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 76rpx;
	margin-top: 4rpx;
	background: rgba(255, 255, 255, 0.04);
	border-radius: 38rpx;
}

.more-text {
	color: #8a97a8;
	font-size: 24rpx;
}

/* ---- 外部资料 ---- */
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
	font-size: 27rpx;
}

.link-act {
	color: #38bdf8;
	font-size: 24rpx;
}
</style>
