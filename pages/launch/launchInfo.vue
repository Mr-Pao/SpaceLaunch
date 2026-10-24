<template>
	<view class="page">
		<!-- 沉浸式页面没有原生导航栏，返回按钮由组件自己画 -->
		<nav-bar :solid="navSolid" :title="navSolid ? '发射任务详情' : ''" />

		<view class="loading" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!detail">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">未找到该发射任务</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<!-- 首图：固定高度裁切。原先是 mode=widthFix 让图片按原比例撑开，
			     遇到竖图会占满整屏，用户得滑很久才能看到信息 -->
			<!-- 首图：顶到屏幕最上方做沉浸式。只有一张图时用 image，
			     将来有多张会自动走 swiper 轮播 -->
			<view class="hero">
				<swiper
					v-if="heroImages.length > 1"
					class="hero-swiper"
					:indicator-dots="true"
					indicator-color="rgba(255,255,255,0.35)"
					indicator-active-color="#38bdf8"
					:autoplay="true"
					:interval="5000"
					circular
				>
					<swiper-item v-for="(img, i) in heroImages" :key="i">
						<image
							class="hero-img"
							:src="img"
							mode="aspectFill"
							@click="preview(img)"
						></image>
					</swiper-item>
				</swiper>

				<image
					v-else-if="heroImages.length === 1"
					class="hero-img"
					:src="heroImages[0]"
					mode="aspectFill"
					@click="preview(heroImages[0])"
				></image>

				<view v-else class="hero-img hero-placeholder"></view>

				<view class="hero-mask"></view>
			</view>

			<view class="body">
				<view class="head">
					<text class="name">{{ displayName }}</text>
					<view class="badge" :class="statusClass">
						{{ (detail.status && (detail.status.nameZh || detail.status.name)) || '未知' }}
					</view>
				</view>

				<!-- 倒计时：发射前最有用的一行 -->
				<view class="cd-row">
					<countdown :net="detail.net" size="lg" />
				</view>

				<view class="meta-line">
					<text class="time">{{ netText }}</text>
					<view class="meta-acts">
						<button class="share-btn" open-type="share" @tap="onShareTap">
							<text class="share-icon">⤴</text>
							<text class="share-text">分享</text>
						</button>
						<view class="fav" :class="{ on: isFav }" @click="toggleFav">
							<text class="fav-icon">{{ isFav ? '★' : '☆' }}</text>
							<text class="fav-text">{{ isFav ? '已收藏' : '收藏' }}</text>
						</view>
					</view>
				</view>

				<!-- 任务信息 -->
				<view class="card" v-if="hasMission">
					<view class="card-title">任务信息</view>
					<view class="row" v-if="missionName">
						<text class="label">任务名</text>
						<text class="value">{{ missionName }}</text>
					</view>
					<view class="row" v-if="missionType">
						<text class="label">类型</text>
						<text class="value">{{ missionType }}</text>
					</view>
					<view class="row" v-if="orbitText">
						<text class="label">目标轨道</text>
						<text class="value">{{ orbitText }}</text>
					</view>
					<!-- 任务描述动辄几百上千字，默认只给 4 行 + 展开/收起。
					     详情页的功能定位是「查参数」，长文折叠后才不像科普文章
					     （审核按内容型小程序判类目，个人主体会被拒） -->
					<view v-if="missionDesc && !reviewMode">
						<text class="card-desc" :class="{ collapsed: !descExpanded && descOverflow }">{{ missionDesc }}</text>
						<view class="desc-toggle" v-if="descOverflow" @click="descExpanded = !descExpanded">
							{{ descExpanded ? '收起' : '展开全文' }}
						</view>
					</view>
				</view>

				<!-- 任务信息图：竖版长图，点开可双指放大 -->
				<view class="card" v-if="detail.infographic">
					<view class="card-title">任务信息图</view>
					<image
						class="infographic"
						:src="detail.infographic"
						mode="widthFix"
						lazy-load
						@click="preview(detail.infographic)"
					></image>
				</view>

				<!-- 火箭：可点进型号页看该型号的全部发射记录 -->
				<view class="card card-link" v-if="rocketName" @click="goRocket">
					<view class="card-title">
						运载火箭
						<text class="arrow">›</text>
					</view>
					<view class="row">
						<text class="label">型号</text>
						<text class="value">{{ rocketName }}</text>
					</view>
					<view class="row" v-if="showConfig">
						<text class="label">配置</text>
						<text class="value">{{ detail.rocket.configuration.name }}</text>
					</view>
					<view class="row" v-if="rocketFamily">
						<text class="label">系列</text>
						<text class="value">{{ rocketFamily }}</text>
					</view>
				</view>

			<!-- 发射条件：概率和天气顾虑都是 LL2 的可选字段，没有就整块不显示。
			     审核模式下天气顾虑是长文，整块藏掉（概率保留） -->
			<view class="card" v-if="probabilityText || (weatherText && !reviewMode)">
				<view class="card-title">发射条件</view>
				<view class="row" v-if="probabilityText">
					<text class="label">预报概率</text>
					<text class="value">{{ probabilityText }}</text>
				</view>
				<text class="card-desc" v-if="weatherText && !reviewMode">{{ weatherText }}</text>
			</view>

			<!-- 失败原因：只有失败任务带这个字段，审核模式下是长文也藏掉 -->
			<view class="card" v-if="failText && !reviewMode">
				<view class="card-title">失败原因</view>
				<text class="card-desc">{{ failText }}</text>
			</view>

				<!-- 发射台：名称可点进工位详情（地图 + 累计发射数） -->
				<view class="card" v-if="detail.pad && detail.pad.name">
					<view class="card-title">发射台</view>
					<view class="row row-link" @click="goPad">
						<text class="label">名称</text>
						<view class="value-wrap">
							<text class="value value-link">{{ detail.pad.name }}</text>
							<text class="value-arrow">›</text>
						</view>
					</view>
					<view class="row" v-if="padLocation">
						<text class="label">位置</text>
						<text class="value">{{ padLocation }}</text>
					</view>
					<view class="row" v-if="padCoord">
						<text class="label">经纬度</text>
						<text class="value">{{ padCoord }}</text>
					</view>
					<view class="row" v-if="detail.pad_launch_attempt_count">
						<text class="label">该台累计</text>
						<text class="value">{{ detail.pad_launch_attempt_count }} 次发射</text>
					</view>
				</view>

				<!-- 发射窗口：只给 net 一个点会让用户以为窗口就是那一秒 -->
				<view class="card" v-if="windowEnd">
					<view class="card-title">发射窗口</view>
					<view class="row">
						<text class="label">开始</text>
						<text class="value">{{ windowStart }}</text>
					</view>
					<view class="row">
						<text class="label">结束</text>
						<text class="value">{{ windowEnd }}</text>
					</view>
					<view class="row" v-if="windowSpan">
						<text class="label">窗口长度</text>
						<text class="value">{{ windowSpan }}</text>
					</view>
				</view>

				<!-- 发射机构：可点进机构详情 -->
				<view class="card card-link" v-if="agency" @click="goAgency(agency.id)">
					<view class="card-title">
						发射机构
						<text class="arrow">›</text>
					</view>
					<view class="agency">
						<image v-if="agency.logo_url" class="agency-logo" :src="agency.logo_url" mode="aspectFit"></image>
						<text class="agency-name">{{ agency.name }}</text>
					</view>
					<view class="row" v-if="agency.country_code">
						<text class="label">国家/地区</text>
						<text class="value">{{ agency.country_code }}</text>
					</view>
					<view class="row" v-if="agency.founding_year">
						<text class="label">成立年份</text>
						<text class="value">{{ agency.founding_year }} 年</text>
					</view>
				</view>

				<!-- 发射统计：LL2 直接给了累计数，不用自己算 -->
				<view class="card" v-if="countCells.length">
					<view class="card-title">发射统计</view>
					<view class="stat-grid">
						<view class="stat-cell" v-for="c in countCells" :key="c.label">
							<text class="stat-num">{{ c.value }}</text>
							<text class="stat-label">{{ c.label }}</text>
						</view>
					</view>
				</view>

				<!-- 分享海报：canvas 离屏绘制任务卡片图，可保存到相册 / 发朋友圈 -->
				<view class="card" v-if="!reviewMode">
					<view class="card-title">分享</view>
					<view class="poster-btn" hover-class="poster-btn-hover" @click="makePoster">
						<text class="poster-btn-text">🖼 生成分享海报</text>
					</view>
				</view>

				<view class="footer-hint">
					<text>数据来源 The Space Devs · 中文翻译由同步任务生成</text>
				</view>

				<!-- 离屏画布：绘制 600x960 逻辑像素的竖版卡片，导出后保存到相册 -->
				<canvas type="2d" id="poster" class="poster-canvas"></canvas>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { findById as findByIdInArchive } from '@/utils/history.js'
import { formatDateTime, relativeTime, launchTitle, rocketName as rocketNameOf, zhValue } from '@/utils/format.js'
import * as fav from '@/utils/favorites.js'
import { getConfig } from '@/utils/config.js'

export default {
	data() {
		return {
			launchId: '',
			// 调用方带的大致时间（net），归档查找用来直接定位分片，可为空
			netHint: '',
			detail: null,
			agency: null,
			loading: true,
			isFav: false,
			navSolid: false,
			// 任务描述折叠态：默认收起，点击「展开全文」才铺开
			descExpanded: false,
			// 审核模式：隐藏任务描述 / 天气顾虑 / 失败原因等长文，只留参数
			reviewMode: false
		}
	},
	computed: {
		// 首图轮播数据。目前 LL2 一个任务只给一张图，
		// 留成数组是为了以后多图源接进来时直接生效
		heroImages() {
			const d = this.detail
			if (!d) return []
			return [d.image].filter(Boolean)
		},
		netText() {
			if (!this.detail) return ''
			const abs = formatDateTime(this.detail.net)
			if (!abs) return '时间待定'
			return abs + '（' + relativeTime(this.detail.net) + '）'
		},
		// 「长征四号乙 | 未知载荷」：型号和任务名都走中文，翻不出来才回退原串
		displayName() {
			return launchTitle(this.detail)
		},
		missionName() {
			const m = this.detail && this.detail.mission
			if (!m) return ''
			return m.nameZh || m.name || ''
		},
		missionType() {
			const m = this.detail && this.detail.mission
			return m ? zhValue(m.type) : ''
		},
		missionDesc() {
			const m = this.detail && this.detail.mission
			if (!m) return ''
			return m.descriptionZh || m.description || ''
		},
		// 短描述（4 行以内）直接显示，不出现「展开全文」按钮
		descOverflow() {
			return this.missionDesc.length > 120
		},
		hasMission() {
			const m = this.detail && this.detail.mission
			return Boolean(
				m &&
					(m.name || m.nameZh || m.descriptionZh || m.description || m.type || (m.orbit && m.orbit.name))
			)
		},
		// 轨道：优先缩写（LEO / GTO 这种业内通用写法），没有就用全称
		orbitText() {
			const o = this.detail && this.detail.mission && this.detail.mission.orbit
			if (!o) return ''
			return zhValue(o.abbrev) || zhValue(o.name) || ''
		},
		rocketName() {
			return rocketNameOf(this.detail && this.detail.rocket && this.detail.rocket.configuration)
		},
		// full_name 和 name 往往一模一样（"Long March 4B"），这时不重复摆一行
		showConfig() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.name) return false
			return c.name !== (c.full_name || c.name)
		},
		// 火箭所属系列 + 型号代号，比如「长征四号 · B」
		// families 从大到小返回（Long March、Long March 4），只取最后一个更具体
		rocketFamily() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c) return ''

			const fams = c.families || []
			const last = fams.length ? fams[fams.length - 1] : ''
			const variant = c.variant || ''

			if (last && variant) return last + ' · ' + variant
			return last || variant
		},
		windowStart() {
			const d = this.detail
			return d && d.window_start ? formatDateTime(d.window_start) : ''
		},
		windowEnd() {
			const d = this.detail
			return d && d.window_end ? formatDateTime(d.window_end) : ''
		},
		windowSpan() {
			const d = this.detail
			if (!d || !d.window_start || !d.window_end) return ''

			const ms = new Date(d.window_end).getTime() - new Date(d.window_start).getTime()
			if (!(ms > 0)) return ''

			const min = Math.round(ms / 60000)
			if (min < 60) return min + ' 分钟'

			const h = Math.floor(min / 60)
			const m = min % 60
			return m ? h + ' 小时 ' + m + ' 分钟' : h + ' 小时'
		},
		// LL2 直接给了累计次数，四格统计不用自己算
		countCells() {
			const d = this.detail
			if (!d) return []

			const cells = []
			const push = (value, label) => {
				if (typeof value === 'number' && value > 0) cells.push({ value, label })
			}
			push(d.orbital_launch_attempt_count, '全球累计')
			push(d.orbital_launch_attempt_count_year, '本年全球')
			push(d.agency_launch_attempt_count_year, '本年本机构')
			push(d.pad_launch_attempt_count_year, '本年本工位')
			return cells
		},
		probabilityText() {
			const p = this.detail && this.detail.probability
			return typeof p === 'number' ? p + '%' : ''
		},
		weatherText() {
			const d = this.detail
			if (!d) return ''
			return d.weather_concernsZh || d.weather_concerns || ''
		},
		failText() {
			const d = this.detail
			if (!d) return ''
			return d.failreasonZh || d.failreason || ''
		},
		padLocation() {
			const loc = this.detail && this.detail.pad && this.detail.pad.location
			return (loc && loc.name) || ''
		},
		padCoord() {
			const p = this.detail && this.detail.pad
			if (!p || p.latitude == null || p.longitude == null) return ''
			return p.latitude.toFixed(2) + ', ' + p.longitude.toFixed(2)
		},
		statusClass() {
			const s = this.detail && this.detail.status
			if (!s) return 'normal'
			const a = s.abbrev || ''
			if (a === 'Success') return 'success'
			if (a === 'Failure' || a === 'Partial') return 'failure'
			if (a === 'In Flight') return 'flying'
			return 'pending'
		},
		// 分享出去时用任务名当标题，比「太空发射任务」有信息量得多
		shareText() {
			return this.displayName || '太空发射任务'
		},
		shareImg() {
			return (this.detail && this.detail.image) || '/static/logo.png'
		}
	},

	// 详情页自己定义分享，路径里显式带上 id，不依赖全局 mixin 去猜参数。
	// net 一并带上：分享出去的老任务若已滑出快照，打开时可直接定位到归档分片
	onShareAppMessage() {
		return {
			title: this.shareText,
			path: '/pages/launch/launchInfo?id=' + this.launchId + this._netQuery(),
			imageUrl: this.shareImg
		}
	},
	onShareTimeline() {
		return {
			title: this.shareText,
			query: 'id=' + this.launchId + this._netQuery(true),
			imageUrl: this.shareImg
		}
	},

	// 滚过首图后导航栏切成实色，否则图片上的文字看不清
	onPageScroll(e) {
		const solid = e.scrollTop > 200
		if (solid !== this.navSolid) this.navSolid = solid
	},

	onShow() {
		// 页面实例可能被复用（navigateBack 回来而不是重新 onLoad），
		// 开关状态跟手刷新，避免切「正常」后长文仍处于隐藏态。
		// getConfig 有内存缓存，这里零开销。
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})
	},

	async onLoad(query) {
		const id = query && query.id
		this.launchId = id || ''
		// 大致时间提示：统计页失败复盘 / 分享路径会带上 net，
		// 归档查找用它直接跳到目标分片，省去逐片翻找（见 utils/history.js findById）
		this.netHint = (query && query.net) ? decodeURIComponent(query.net) : ''
		if (!id) {
			this.loading = false
			return
		}

		this.isFav = fav.has(id)
		// 换一个任务进来时描述回到折叠态
		this.descExpanded = false

		// 展示开关（App onLaunch 已预热，这里命中内存缓存，零开销）
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
		})

		// 同一条发射在跨过"当前时刻"后会从 upcoming 挪到 previous，
		// 用户刚看过列表就点进来时可能已经换边了，所以两边都查。
		// findLaunchById 内部先扫缓存，命中则零网络开销。
		let d = await spaceData.findLaunchById(id)

		// 快照（previous 只存最新 100 条）里没有 → 去历史归档分片里找。
		// 统计页失败复盘、已发射页更早条目都属于这类，之前会直接白屏。
		// netHint 可让查找直接跳到目标分片（findById 内部有限深与缓存上限）
		if (!d) {
			d = await findByIdInArchive(id, this.netHint)
		}

		this.detail = d
		this.loading = false

		const providerId = d && d.launch_service_provider && d.launch_service_provider.id
		if (providerId) {
			this.agency = await spaceData.getAgencyById(providerId)
		}
	},
	methods: {
		/** 分享路径里的 net 参数：知道大致时间才能在归档里直达目标分片 */
		_netQuery(noLeading) {
			const net = this.detail && this.detail.net
			if (!net) return ''
			return (noLeading ? '' : '&') + 'net=' + encodeURIComponent(net)
		},

		// ==================== 分享海报 ====================

		/** 入口：生成海报并保存到相册（canvas 2d 离屏绘制） */
		async makePoster() {
			const d = this.detail
			if (!d) return
			// #ifdef MP-WEIXIN
			try {
				uni.showLoading({ title: '生成中…', mask: true })
				const imgPath = await this._posterImage(d.image)
				const { canvas, ctx, W, H } = await this._posterCanvas()
				await this._drawPoster(canvas, ctx, W, H, imgPath)
				// 给绘制留一帧落盘的时间
				await new Promise((r) => setTimeout(r, 120))
				const res = await new Promise((resolve, reject) =>
					wx.canvasToTempFilePath({ canvas, success: resolve, fail: reject })
				)
				uni.hideLoading()
				this._shareOrSave(res.tempFilePath)
			} catch (e) {
				uni.hideLoading()
				const msg = (e && e.errMsg) || ''
				if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
					this._albumAuthModal()
				} else {
					console.warn('[launchInfo] 海报生成失败', e)
					uni.showToast({ title: '生成失败，请重试', icon: 'none' })
				}
			}
			// #endif
		},

		/** 任务图下载成本地路径；失败或没有图就返回 null（海报退化为纯背景） */
		_posterImage(url) {
			if (!url) return Promise.resolve(null)
			return new Promise((resolve) => {
				uni.downloadFile({
					url,
					success: (res) => resolve(res.statusCode === 200 ? res.tempFilePath : null),
					fail: () => resolve(null)
				})
			})
		},

		/** 拿 canvas 2d 节点，按 dpr 放大物理像素保证清晰度 */
		_posterCanvas() {
			return new Promise((resolve, reject) => {
				uni
					.createSelectorQuery()
					.in(this)
					.select('#poster')
					.fields({ node: true, size: true })
					.exec((res) => {
						const node = res && res[0] && res[0].node
						if (!node) return reject(new Error('canvas node not found'))
						const W = 600
						const H = 960
						const dpr = (uni.getSystemInfoSync().pixelRatio) || 2
						node.width = W * dpr
						node.height = H * dpr
						const ctx = node.getContext('2d')
						ctx.scale(dpr, dpr)
						resolve({ canvas: node, ctx, W, H })
					})
			})
		},

		/**
		 * 卡片内容（600x960 竖版）：
		 * 顶部任务图（cover 裁剪 + 底部渐隐）→ 标题（≤2 行）→ 状态/时间 →
		 * 火箭/机构/工位三行（长文本自动缩字号，尽量不截断）→ 分隔线 →
		 * 左下品牌文案 + 右下小程序码（static/qrcode.jpg，缺失则只画文字）。
		 */
		_drawPoster(canvas, ctx, W, H, imgPath) {
			const d = this.detail || {}
			return new Promise((resolve) => {
				const IMG_H = 320
				const PAD = 44

				// 背景
				const bg = ctx.createLinearGradient(0, 0, 0, H)
				bg.addColorStop(0, '#101a2e')
				bg.addColorStop(1, '#0a0e17')
				ctx.fillStyle = bg
				ctx.fillRect(0, 0, W, H)

				const paint = (qrImg) => {
					// 图底渐隐到背景色，图文衔接不生硬
					const fade = ctx.createLinearGradient(0, IMG_H - 90, 0, IMG_H)
					fade.addColorStop(0, 'rgba(10,14,23,0)')
					fade.addColorStop(1, '#0a0e17')
					ctx.fillStyle = fade
					ctx.fillRect(0, IMG_H - 90, W, 90)

					// ---- 标题：最多两行 ----
					let y = IMG_H + 76
					ctx.fillStyle = '#ffffff'
					ctx.font = 'bold 40px sans-serif'
					y = this._wrapText(ctx, this.displayName || '太空发射任务', PAD, W - PAD * 2, 54, 2, y)

					// ---- 状态（带圆点）+ 时间（独立一行，不再挤在一起）----
					const zh = (d.status && d.status.nameZh) || (d.status && d.status.abbrev) || ''
					y += 34
					if (zh) {
						ctx.fillStyle = '#38bdf8'
						ctx.beginPath()
						ctx.arc(PAD + 6, y - 9, 6, 0, Math.PI * 2)
						ctx.fill()
						ctx.font = 'bold 28px sans-serif'
						ctx.fillText(zh, PAD + 24, y)
					}
					y += 42
					ctx.fillStyle = '#8a97a8'
					ctx.font = '27px sans-serif'
					ctx.fillText(formatDateTime(d.net) || '', PAD, y)

					// ---- 火箭 / 机构 / 工位：固定锚点排布，长文本逐级缩字号 ----
					const rows = [
						['火箭', rocketNameOf(d) || (d.rocket && d.rocket.configuration && d.rocket.configuration.name) || ''],
						['机构', (d.launch_service_provider && d.launch_service_provider.name) || ''],
						['工位', (d.pad && d.pad.name ? d.pad.name + ' · ' : '') + ((d.pad && d.pad.location && d.pad.location.name) || '')]
					]
					const rowY = [640, 688, 736]
					const valX = PAD + 84
					for (let i = 0; i < rows.length; i++) {
						const label = rows[i][0]
						const value = rows[i][1]
						if (!value) continue
						ctx.font = '24px sans-serif'
						ctx.fillStyle = '#4a5568'
						ctx.fillText(label, PAD, rowY[i])
						// 值从 27px 起，放不下逐级降到 22px，仍放不下才截断
						const maxW = W - PAD - valX
						let size = 27
						ctx.font = size + 'px sans-serif'
						while (size > 22 && ctx.measureText(value).width > maxW) {
							size -= 1
							ctx.font = size + 'px sans-serif'
						}
						ctx.fillStyle = '#e2e8f0'
						ctx.fillText(this._ellipsis(ctx, value, maxW), valX, rowY[i])
					}

					// ---- 分隔线 ----
					ctx.strokeStyle = 'rgba(255,255,255,0.08)'
					ctx.beginPath()
					ctx.moveTo(PAD, 784)
					ctx.lineTo(W - PAD, 784)
					ctx.stroke()

					// ---- 右下：小程序码（白底圆角衬托）----
					if (qrImg) {
						const S = 132
						const qx = W - PAD - S
						const qy = H - PAD - S
						ctx.fillStyle = '#ffffff'
						this._roundRect(ctx, qx - 10, qy - 10, S + 20, S + 20, 14)
						ctx.fill()
						ctx.drawImage(qrImg, qx, qy, S, S)
					}

					// ---- 左下：品牌文案（右边界让开二维码）----
					const brandW = qrImg ? W - PAD - 152 - 40 - PAD : W - PAD * 2
					ctx.fillStyle = '#8a97a8'
					ctx.font = 'bold 32px sans-serif'
					ctx.fillText('太空发射任务', PAD, 830)
					ctx.fillStyle = '#4a5568'
					ctx.font = '24px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '看发射 · 查火箭 · 懂航天', brandW), PAD, 872)
					ctx.fillStyle = '#4a5568'
					ctx.font = '22px sans-serif'
					ctx.fillText(this._ellipsis(ctx, '扫码打开小程序', brandW), PAD, 908)
					resolve()
				}

				/**
				 * 小程序码来源：项目根目录「小程序码.jpg」（公众平台下载的固定码）。
				 * 无服务端调不了 getUnlimited（要 access_token），生成不了带 scene
				 * 的任务直达码，固定码只能指向首页——可接受。文件缺失时静默跳过。
				 */
				const loadQr = () => {
					const qr = canvas.createImage()
					qr.onload = () => paint(qr)
					qr.onerror = () => paint(null)
					qr.src = '/static/qrcode.jpg'
				}

				if (imgPath) {
					// cover 裁剪画顶部图
					const img = canvas.createImage()
					img.onload = () => {
						const scale = Math.max(W / img.width, IMG_H / img.height)
						const dw = img.width * scale
						const dh = img.height * scale
						ctx.drawImage(img, (W - dw) / 2, (IMG_H - dh) / 2, dw, dh)
						loadQr()
					}
					img.onerror = loadQr
					img.src = imgPath
				} else {
					loadQr()
				}
			})
		},

		/** 圆角矩形路径（海报白底衬托用） */
		_roundRect(ctx, x, y, w, h, r) {
			ctx.beginPath()
			ctx.moveTo(x + r, y)
			ctx.arcTo(x + w, y, x + w, y + h, r)
			ctx.arcTo(x + w, y + h, x, y + h, r)
			ctx.arcTo(x, y + h, x, y, r)
			ctx.arcTo(x, y, x + w, y, r)
			ctx.closePath()
		},

		/** 多行文本绘制，返回结束 y */
		_wrapText(ctx, text, x, maxWidth, lineHeight, maxLines, y) {
			const lines = []
			let line = ''
			for (const ch of String(text)) {
				if (ctx.measureText(line + ch).width > maxWidth) {
					lines.push(line)
					line = ch
					if (lines.length >= maxLines - 1) break
				} else {
					line += ch
				}
			}
			if (line) lines.push(line)
			for (const l of lines.slice(0, maxLines)) {
				ctx.fillText(l, x, y)
				y += lineHeight
			}
			return y
		},

		_ellipsis(ctx, text, maxWidth) {
			const t = String(text)
			if (ctx.measureText(t).width <= maxWidth) return t
			let s = t
			while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1)
			return s + '…'
		},

		/**
		 * 海报生成后的出口：优先拉起原生「图片分享菜单」——
		 * 里面有「发送给朋友」（把海报图直接发到聊天）和「保存图片」，
		 * 转发 / 存相册一步到位，正好补上未认证小程序发不了卡片的空。
		 * 基础库不支持 showShareImageMenu 时退回只存相册。
		 */
		_shareOrSave(filePath) {
			const ok = typeof wx !== 'undefined' && typeof wx.showShareImageMenu === 'function'
			if (ok) {
				wx.showShareImageMenu({
					path: filePath,
					fail: (e) => {
						const msg = (e && e.errMsg) || ''
						// 用户主动关菜单不算失败
						if (msg.indexOf('cancel') !== -1) return
						if (msg.indexOf('auth') !== -1 || msg.indexOf('denied') !== -1) {
							this._albumAuthModal()
						} else {
							this._saveToAlbum(filePath).catch(() => {})
						}
					}
				})
			} else {
				this._saveToAlbum(filePath).catch(() => this._albumAuthModal())
			}
		},

		/** 相册权限被拒时的引导弹窗 */
		_albumAuthModal() {
			uni.showModal({
				title: '需要相册权限',
				content: '保存海报需要相册权限，请在设置中开启',
				confirmText: '去设置',
				success: (r) => {
					if (r.confirm) uni.openSetting()
				}
			})
		},

		_saveToAlbum(filePath) {
			return new Promise((resolve, reject) => {
				uni.saveImageToPhotosAlbum({
					filePath,
					success: () => {
						uni.showToast({ title: '已保存到相册', icon: 'success' })
						resolve()
					},
					fail: reject
				})
			})
		},

		// 工位名 → pad 详情。pad 库是每天刷的全量快照，
		// 但新工位可能还没进库，跳过去查不到时页面有自己的空态兜底
		goPad() {
			const p = this.detail && this.detail.pad
			if (!p || !p.name) return
			uni.navigateTo({
				url: '/pages/pad/pad?id=' + (p.id || '') + '&name=' + encodeURIComponent(p.name)
			})
		},

		goAgency(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/agencies/agencies?id=' + id })
		},
		goRocket() {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.id) return
			const name = c.full_name || c.name || ''
			uni.navigateTo({
				url: '/pages/rocket/rocket?id=' + c.id + '&name=' + encodeURIComponent(name)
			})
		},
		/**
		 * 分享按钮 tap：转发面板由 open-type=share 接管，正常情况点它就弹面板。
		 * 微信没有「认证状态」的运行时 API，这里只能做能力检测兜底：
		 * 转发不可用的环境（基础库过老 / 被限制的场景）面板不弹、按钮像坏了，
		 * 此时 tap 仍会触发 —— 直接转去生成海报，保证按钮永远有响应。
		 */
		onShareTap() {
			const supported =
				typeof wx !== 'undefined' && wx.canIUse && wx.canIUse('button.open-type.share')
			if (!supported) {
				uni.showToast({ title: '当前环境不支持转发，试试海报', icon: 'none' })
				this.makePoster()
			}
		},

		toggleFav() {
			if (!this.launchId) return
			this.isFav = fav.toggle(this.launchId)
			uni.showToast({
				title: this.isFav ? '已收藏，列表里会置顶' : '已取消收藏',
				icon: 'none',
				duration: 1500
			})
		},
		// 点开图片能双指放大，长图信息不点开根本看不清
		preview(url) {
			if (!url) return
			uni.previewImage({ urls: [url], current: url })
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
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	background: #0a0e17;
	padding-bottom: 60rpx;
}

.loading,
.empty {
	padding: 240rpx 60rpx;
	text-align: center;
}

.loading-text,
.empty-text {
	display: block;
	color: #6b7891;
	font-size: 30rpx;
}

.empty-icon {
	display: block;
	font-size: 80rpx;
	margin-bottom: 30rpx;
}

.btn {
	display: inline-block;
	margin-top: 50rpx;
	padding: 20rpx 60rpx;
	background: rgba(56, 189, 248, 0.15);
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	color: #38bdf8;
	font-size: 30rpx;
	border-radius: 60rpx;
}

/* 首图：顶到屏幕最上方，状态栏压在图上，形成沉浸感 */
.hero {
	position: relative;
	width: 100%;
	height: 660rpx;
}

.hero-swiper {
	width: 100%;
	height: 100%;
}

.hero-img {
	width: 100%;
	height: 100%;
	display: block;
}

.hero-placeholder {
	background: linear-gradient(135deg, #16233a 0%, #0d1420 100%);
}

.hero-mask {
	position: absolute;
	left: 0;
	bottom: 0;
	width: 100%;
	height: 200rpx;
	background: linear-gradient(to bottom, rgba(10, 14, 23, 0) 0%, #0a0e17 100%);
}

.body {
	padding: 0 32rpx;
	margin-top: -40rpx;
	position: relative;
}

.head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 20rpx;
}

.name {
	flex: 1;
	color: #ffffff;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.4;
}

.badge {
	flex-shrink: 0;
	padding: 6rpx 18rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
	white-space: nowrap;
	margin-top: 8rpx;
}

.badge.pending {
	background: rgba(56, 189, 248, 0.15);
	color: #38bdf8;
}

.badge.success {
	background: rgba(52, 199, 89, 0.15);
	color: #34c759;
}

.badge.failure {
	background: rgba(255, 59, 48, 0.15);
	color: #ff3b30;
}

.badge.flying {
	background: rgba(245, 195, 59, 0.15);
	color: #f5c33b;
}

.badge.normal {
	background: rgba(255, 255, 255, 0.08);
	color: #a0aec0;
}

.meta-line {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 16rpx;
}

.cd-row {
	margin-top: 26rpx;
}

/* 四格统计 */
.stat-grid {
	display: flex;
	flex-wrap: wrap;
}

.stat-cell {
	width: 50%;
	padding: 18rpx 0;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.stat-num {
	color: #e2e8f0;
	font-size: 40rpx;
	font-weight: 600;
	line-height: 1.2;
}

.stat-label {
	margin-top: 6rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.time {
	flex: 1;
	color: #38bdf8;
	font-size: 28rpx;
	letter-spacing: 0.5rpx;
}

/* 收藏按钮：默认灰底描边，收藏后转成琥珀色 */
.fav {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	margin-left: 20rpx;
	padding: 8rpx 20rpx;
	border-radius: 40rpx;
	background: rgba(255, 255, 255, 0.06);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
}

.fav.on {
	background: rgba(245, 195, 59, 0.14);
	border-color: rgba(245, 195, 59, 0.35);
}

.fav-icon {
	margin-right: 8rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.fav-text {
	color: #6b7891;
	font-size: 24rpx;
}

.fav.on .fav-icon,
.fav.on .fav-text {
	color: #f5c33b;
}

/* 收藏 + 分享并排 */
.meta-acts {
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

/* 分享按钮：原生 button 重置成与收藏一致的胶囊 */
.share-btn {
	display: flex;
	align-items: center;
	margin: 0 0 0 20rpx;
	padding: 8rpx 20rpx;
	border-radius: 40rpx;
	background: rgba(255, 255, 255, 0.06);
	border: 1rpx solid rgba(255, 255, 255, 0.08);
	line-height: 1;
	font-size: 24rpx;
}

/* 小程序 button 自带的边框伪元素必须拿掉，否则重影 */
.share-btn::after {
	border: none;
}

.share-icon {
	margin-right: 8rpx;
	color: #6b7891;
	font-size: 26rpx;
}

.share-text {
	color: #6b7891;
	font-size: 24rpx;
}

/* 卡片 */
.card {
	margin-top: 28rpx;
	padding: 28rpx 30rpx;
	background: #141a26;
	border-radius: 20rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.05);
}

.card-link {
	position: relative;
}

.card-title {
	color: #38bdf8;
	font-size: 30rpx;
	font-weight: 600;
	margin-bottom: 20rpx;
}

.arrow {
	float: right;
	color: #4a5568;
	font-size: 34rpx;
	line-height: 1;
}

.card-desc {
	display: block;
	margin-top: 18rpx;
	color: #cbd5e0;
	font-size: 29rpx;
	line-height: 1.75;
}

/* 折叠态：只给 4 行，超出省略（小程序 text 支持 -webkit-line-clamp） */
.card-desc.collapsed {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 4;
	overflow: hidden;
}

.desc-toggle {
	margin-top: 12rpx;
	color: #38bdf8;
	font-size: 26rpx;
}

/* 任务信息图是竖版长图，用 widthFix 让它按原比例撑开，点开可放大 */
.infographic {
	display: block;
	width: 100%;
	border-radius: 12rpx;
	background: #0f1520;
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

.agency {
	display: flex;
	align-items: center;
	margin-bottom: 12rpx;
}

.agency-logo {
	width: 80rpx;
	height: 80rpx;
	margin-right: 20rpx;
	border-radius: 12rpx;
	background: rgba(255, 255, 255, 0.05);
}

.agency-name {
	color: #e2e8f0;
	font-size: 30rpx;
}

.poster-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 20rpx 0;
	background: rgba(56, 189, 248, 0.12);
	border: 1rpx solid rgba(56, 189, 248, 0.4);
	border-radius: 14rpx;
}

.poster-btn-hover {
	background: rgba(56, 189, 248, 0.24);
}

.poster-btn-text {
	color: #38bdf8;
	font-size: 28rpx;
}

/* 离屏画布：不参与布局也不可见，但 canvas 2d 照常绘制 */
.poster-canvas {
	position: fixed;
	left: -9999px;
	top: 0;
	width: 600px;
	height: 960px;
}

.row-link {
	cursor: pointer;
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

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
