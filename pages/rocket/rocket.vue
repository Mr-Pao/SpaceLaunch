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
			<!-- 头图顶到屏幕最上方，型号信息压在渐变遮罩上。
			     轮播源 = 该系列的构型图 + 最近几次发射的现场图 -->
			<view class="hero">
				<swiper
					v-if="heroSlides.length"
					class="hero-swiper"
					circular
					autoplay
					:interval="5200"
					:duration="600"
					@change="onSlide"
				>
					<swiper-item v-for="(s, i) in heroSlides" :key="i">
						<image class="hero-img" :src="s.thumb" mode="aspectFill" @click="previewHero(i)"></image>
					</swiper-item>
				</swiper>
				<view v-else class="hero-img hero-placeholder">
					<text class="hero-placeholder-icon">🚀</text>
				</view>

				<view class="hero-mask"></view>

				<!-- 轮播指示点：右上角，与制造方面包屑同高对称；
				     必须放在渐变遮罩之后渲染，否则会被压暗到看不见 -->
				<view class="hero-dots" v-if="heroSlides.length > 1" :style="{ top: statusBarH + 56 + 'px' }">
					<view
						class="hero-dot"
						v-for="(s, i) in heroSlides"
						:key="'d' + i"
						:class="{ on: i === slide }"
					></view>
				</view>

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

					<!-- 状态标签靠左、图片库入口靠右，共用一行：
					     入口放这里比放页面中部更早看到，也不再占一整张卡 -->
					<view class="hero-foot">
						<view class="hero-tags">
							<text class="tag" :class="config.active ? 'tag-on' : 'tag-off'">
								{{ config.active ? '现役' : '已退役' }}
							</text>
							<text class="tag" v-if="config.reusable">可复用</text>
							<text class="tag" v-if="config.max_stage">{{ config.max_stage }} 级</text>
						</view>

						<view
							class="hero-media"
							v-if="!reviewMode && mediaStats.images"
							hover-class="hero-media-hover"
							@click="goMedia('image')"
						>
							<view class="hm-icon">
								<view class="hm-dot"></view>
								<view class="hm-dot"></view>
								<view class="hm-dot"></view>
								<view class="hm-dot"></view>
							</view>
							<text class="hm-text">图片库</text>
							<text class="hm-count">{{ mediaStats.images }}</text>
						</view>
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

					<!-- 发射机构：从该系列全部发射记录聚合，单机构可点进机构页。
					     3.1.3 系列视角重构时把旧版的这一行弄丢了，用户找不到 -->
					<view
						class="agency-row"
						v-if="agencyNames"
						hover-class="agency-row-hover"
						@click="goAgency(agencyNames.split('、')[0])"
					>
						<text class="agency-label">发射机构</text>
						<text class="agency-name">{{ agencyNames }}</text>
						<view class="agency-arrow"></view>
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

				<!-- 芯级：这个型号真实飞过的第一级硬件，编号 + 战绩。
				     数据来自芯级库（CI 每天全量抓），按型号 id 聚合 -->
				<view class="section" v-if="cores.length">
					<view class="section-head">
						<text class="section-title">芯级</text>
						<text class="section-note">{{ cores.length }} 枚</text>
					</view>

					<view class="core-card">
						<view
							class="core-row"
							v-for="c in coresShown"
							:key="c.id"
							hover-class="core-hover"
							@click="toggleCore(c.id)"
						>
							<view class="core-body">
								<view class="core-top">
									<text class="core-serial">{{ c.serial || ('#' + c.id) }}</text>
									<text class="corebadge" :class="'corebadge-' + c.statusCls">{{ c.statusText }}</text>
								</view>

								<view class="core-meta">
									<text class="core-stat">已飞 {{ c.flights || 0 }} 次</text>
									<text class="core-stat" v-if="c.showLanding">回收成功 {{ c.landed }}/{{ c.landedTry }}</text>
									<text class="core-last" v-if="c.last">末飞 {{ (c.last || '').slice(0, 10) }}</text>
								</view>

								<text class="core-detail" v-if="openCore === c.id && (c.detailsZh || c.details)">
									{{ c.detailsZh || c.details }}
								</text>
							</view>
						</view>

						<view class="more-btn" v-if="cores.length > CORE_FOLD" @click="coresOpen = !coresOpen">
							<text class="more-text">{{ coresOpen ? '收起' : '展开全部 ' + cores.length + ' 枚' }}</text>
						</view>
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
	textUnits,
	coreStatus
} from '@/utils/format.js'
import { getConfig } from '@/utils/config.js'
import { collectMedia } from '@/utils/media.js'
import navMixin from '@/utils/nav-mixin.js'

// 同系列构型少于这个数就不当「系列」看：Falcon 家族里只有 Falcon 1 / Falcon Heavy
// 两种互不相干的火箭，标题写「猎鹰」反而不如直接写型号名
const SERIES_MIN = 3
// 发射列表默认露几条，其余收起来（参考页也是先给几条，想看再展开）
const FOLD = 3
// 芯级列表默认露几枚。Falcon 9 在册 20+ 枚，全铺会把页面拉得很长
const CORE_FOLD = 6

export default {
	mixins: [navMixin],

	data() {
		return {
			rocketId: '',
			queryName: '',
			all: [],
			config: null,
			records: [],
			// 芯级个体库（cores.json 全量），按 configId 过滤后展示
			coresAll: [],
			coresOpen: false,
			// 点开的芯级编号（展开看简介）
			openCore: null,
			loading: true,
			navSolid: false,
			// 审核模式：隐藏外部资料、发射场地与发射列表
			reviewMode: false,
			descOpen: false,
			// 发射列表默认折叠到 FOLD 条，点「展开全部」再看完整列表
			FOLD,
			CORE_FOLD,
			upcomingOpen: false,
			historyOpen: false,
			// hero 轮播当前页
			slide: 0
		}
	},

	computed: {
		heroImage() {
			const c = this.config
			if (!c) return ''
			// 目前只有现役型号镜像了图片，退役型号走占位
			return c.image || ''
		},

		/** 轮播源：collectMedia 已把构型图排最前、发射实拍按时间倒序，取前 5 张 */
		/**
		 * 首图轮播的图源：同系列聚合结果（型号图 + 该型号的发射实拍 + 工位图）。
		 *
		 * 上限 5 张，与发射详情页保持一致 —— 再多首屏就要同时拉好几张大图，
		 * 而首图区只是「扫一眼」，想看全的走图片库入口。
		 * 信息图故意留在列表里而不是过滤掉：这个页面可用的实拍本来就少，
		 * 少了它们有些型号会退化成只剩一张图，那才是真的「滑不动」。
		 */
		heroSlides() {
			return this.media.images
				.slice(0, 5)
				.map((x) => ({ thumb: x.thumb || x.url, full: x.full || x.url }))
		},

		/** 媒体聚合只算一次，mediaStats / heroSlides 共用 */
		media() {
			const configs = this.siblings.length ? this.siblings : this.config ? [this.config] : []
			return collectMedia(configs, this.records)
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

		/** 发射机构：该系列全部发射记录里出现过的机构，去重拼接。
		 *  注意 slimLaunch 里没有顶层 agency（那是统计裁剪 slimStatLaunch 的
		 *  字段），launches 快照带的是 launch_service_provider 对象 */
		agencyNames() {
			const set = new Set()
			for (const x of this.records) {
				const n = x && x.launch_service_provider && x.launch_service_provider.name
				if (n) set.add(n)
			}
			return [...set].join('、')
		},

		/**
		 * 该型号的芯级个体。LL2 的 launcher_config.id 与型号库 id 同源，
		 * 直接按 configId 匹配；排序现役优先、已飞次数降序。
		 * serial 里的数字抽出来比，避免 B10 排到 B1067 后面。
		 */
		cores() {
			if (!this.config) return []
			const id = String(this.config.id)
			const list = this.coresAll.filter((x) => x && String(x.configId) === id)
			return list
				.map((x) => {
					const st = coreStatus(x.status)
					return {
						...x,
						statusText: st.text,
						statusCls: st.cls,
						// expended（设计上不回收）不显示回收行，避免误导
						showLanding: x.landedTry > 0
					}
				})
				.sort((a, b) => {
					const ao = a.status === 'active' ? 0 : 1
					const bo = b.status === 'active' ? 0 : 1
					if (ao !== bo) return ao - bo
					if ((b.flights || 0) !== (a.flights || 0)) return (b.flights || 0) - (a.flights || 0)
					return String(a.serial).localeCompare(String(b.serial), 'en', { numeric: true })
				})
		},

		coresShown() {
			return this.coresOpen ? this.cores : this.cores.slice(0, CORE_FOLD)
		},

		/** 构型卡片：名称、首飞、六格参数、底行战绩 */
		variants() {			const list = this.siblings
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
		},

		/**
		 * 图片库 / 视频库的入口数字。
		 * 和媒体页用的是同一个 collectMedia，两边数字必须一致 ——
		 * 入口写 39 张、点进去只有 20 张是最容易让人怀疑数据出错的细节。
		 */
		mediaStats() {
			const m = this.media
			return {
				images: m.images.length,
				videos: m.videos.length,
				total: m.images.length + m.videos.length
			}
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
		this.loadCores()
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

		/**
		 * 芯级个体库。不 await：加载失败或数据集未生成都静默降级，
		 * 页面只是不显示「芯级」区块，不能因此卡住整页
		 */
		async loadCores() {
			try {
				const d = await spaceData.load('cores')
				this.coresAll = (d && d.list) || []
			} catch (e) {
				console.warn('[rocket] 芯级库不可用', e)
			}
		},

		/** 点一枚芯级展开/收起它的简介 */
		toggleCore(id) {
			this.openCore = this.openCore === id ? null : id
		},

		/** 切到同系列的另一个构型：原地替换，返回时回列表而不是逐个退栈 */
		switchTo(v) {
			if (!v || v.current) return
			uni.redirectTo({
				url: '/pages/rocket/rocket?id=' + v.id + '&name=' + encodeURIComponent(v.name)
			})
		},

		/** 进图片库 / 视频库。tab 只是初始选中项，那边还能自己切 */
		goMedia(tab) {
			if (!this.config) return
			uni.navigateTo({
				url: '/pages/media/media?id=' + this.config.id + '&tab=' + (tab || 'image')
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

		onSlide(e) {
			this.slide = (e && e.detail && e.detail.current) || 0
		},

		/** 轮播图全屏预览：优先原图（COS _2000），没补到的回退缩略图 */
		previewHero(i) {
			const s = this.heroSlides[i]
			if (!s) return
			const urls = this.heroSlides.map((x) => x.full)
			uni.previewImage({ urls, current: s.full })
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

/* 轮播撑满 hero；swiper 默认高度 150px，必须显式给满 */
.hero-swiper {
	width: 100%;
	height: 560rpx;
}

/* 指示点：细长条，当前项拉长变亮。top 由模板按状态栏动态给 */
.hero-dots {
	position: absolute;
	right: 32rpx;
	/* 纯指示，不接事件 —— 否则右上角那一小条会截走滑动 */
	pointer-events: none;
	display: flex;
	align-items: center;
	gap: 10rpx;
}

.hero-dot {
	width: 10rpx;
	height: 10rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.38);
	transition: all 0.3s ease;
}

.hero-dot.on {
	width: 26rpx;
	background: rgba(255, 255, 255, 0.95);
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

/* 底部压暗渐变：纯装饰，必须让事件穿透。
   它高 400rpx，而 .hero 只有 560rpx —— 相当于盖住首图下半部 71%，
   不加 pointer-events: none 的话在中间滑动会被它整块吃掉，
   表现就是「自动轮播在动，手动怎么滑都不动」 */
.hero-mask {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 400rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, rgba(10, 14, 23, 0.8) 50%, #0a0e17 100%);
	pointer-events: none;
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

/* 标题/标签/入口这一层也压在图下半部，同样不能让它在空白处截走滑动；
   里面真正要点的「图片库」入口单独放开事件 */
.hero-body {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 0 32rpx 34rpx;
	pointer-events: none;
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

/* 状态标签与图片库入口同一行：左边标签自动占满剩余宽度，按钮靠右不压缩 */
.hero-foot {
	display: flex;
	align-items: center;
	margin-top: 18rpx;
}

.hero-tags {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-wrap: wrap;
}

/* 图片库按钮：磨砂胶囊，和首页搜索钮同一套语言（半透明白 + 细亮边） */
.hero-media {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: 16rpx;
	padding: 7rpx 18rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.14);
	-webkit-backdrop-filter: blur(20rpx) saturate(150%);
	backdrop-filter: blur(20rpx) saturate(150%);
	border: 1rpx solid rgba(255, 255, 255, 0.22);
	box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.18);
	/* 父级 .hero-body 已放开事件拦截，这里把它单独收回来 —— 它是真要点的 */
	pointer-events: auto;
}

.hero-media-hover {
	background: rgba(255, 255, 255, 0.24);
}

/* 2×2 小方格当图标，纯 CSS，比图片省一次请求。
   容器宽 = 2×(点 + 右间距)，少 1rpx 都换不了行、会竖成一列 */
.hm-icon {
	display: flex;
	flex-wrap: wrap;
	width: 18rpx;
	height: 18rpx;
	margin-right: 10rpx;
}

.hm-dot {
	width: 6rpx;
	height: 6rpx;
	margin: 0 3rpx 3rpx 0;
	border-radius: 1.5rpx;
	background: rgba(255, 255, 255, 0.9);
}

.hm-text {
	color: #ffffff;
	font-size: 22rpx;
	line-height: 1.2;
}

.hm-count {
	margin-left: 8rpx;
	color: rgba(255, 255, 255, 0.6);
	font-size: 22rpx;
	line-height: 1.2;
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
	align-items: center;	justify-content: space-between;
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

/* ---- 发射机构行 ---- */
.agency-row {
	display: flex;
	align-items: center;
	margin-bottom: 18rpx;
	padding: 14rpx 18rpx;
	border-radius: 12rpx;
	background: rgba(255, 255, 255, 0.04);
}

.agency-row-hover {
	background: rgba(255, 255, 255, 0.08);
}

.agency-label {
	flex-shrink: 0;
	color: #6b7891;
	font-size: 23rpx;
}

.agency-name {
	flex: 1;
	margin: 0 10rpx;
	color: #cbd5e0;
	font-size: 25rpx;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.agency-arrow {
	flex-shrink: 0;
	width: 12rpx;
	height: 12rpx;
	border-top: 2rpx solid #6b7891;
	border-right: 2rpx solid #6b7891;
	transform: rotate(45deg);
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

/* ---- 芯级 ---- */
.core-card {
	padding: 6rpx 24rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
	border-radius: 20rpx;
}

.core-row {
	padding: 22rpx 0;
	border-top: 1rpx solid rgba(255, 255, 255, 0.04);
}

.core-row:first-child {
	border-top: none;
}

.core-hover {
	opacity: 0.7;
}

.core-top {
	display: flex;
	align-items: center;
}

.core-serial {
	color: #e2e8f0;
	font-size: 28rpx;
	font-weight: 600;
	font-family: 'DIN Alternate', 'Helvetica Neue', monospace;
}

.corebadge {
	flex-shrink: 0;
	margin-left: 14rpx;
	padding: 4rpx 14rpx;
	border-radius: 6rpx;
	font-size: 20rpx;
	background: rgba(255, 255, 255, 0.06);
	color: #6b7891;
}

/* 现役：亮蓝；坠毁/炸毁：暗红；退役/已消耗：默认灰 */
.corebadge-ok {
	background: rgba(56, 189, 248, 0.16);
	color: #38bdf8;
}

.corebadge-bad {
	background: rgba(248, 113, 113, 0.14);
	color: #f87171;
}

.core-meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	margin-top: 8rpx;
}

.core-stat {
	color: #94a3b8;
	font-size: 22rpx;
}

.core-stat + .core-stat {
	margin-left: 20rpx;
}

.core-last {
	margin-left: auto;
	color: #6b7891;
	font-size: 22rpx;
}

.core-detail {
	display: block;
	margin-top: 12rpx;
	padding: 14rpx 18rpx;
	background: rgba(255, 255, 255, 0.03);
	border-radius: 12rpx;
	color: #94a3b8;
	font-size: 22rpx;
	line-height: 1.6;
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
