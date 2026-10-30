<template>
	<!-- 发射详情。从列表点进来直接是详情；从图库 / 每日一图点进来走「图片优先态」：
	     首图先占满整屏当看图器，底部「查看发射详情」按钮跳到这条发射的详情页。
	     内容拆成了 launch-photo（看图器）/ launch-hero（首图）/ launch-content（正文）/
	     launch-poster（分享海报）四个子组件，这里只留状态、加载与页面级能力 -->
	<!-- 图片优先态时整页锁死：看图器是 fixed 满屏，但页面本身仍能滚
	     （下面的详情内容比一屏高），一滑就把底下的详情顶出来，看着像「两层页面」 -->
	<view class="page" :class="{ 'page-lock': photoOn }">
		<!-- 看图器：只在图片优先态下挂载。横滑换图由 onPhotoSwitch 跟着换 curId -->
		<launch-photo
			v-if="photoOn"
			:photo-on="photoOn"
			:album="album"
			:cur="cur"
			:cur-item="curItem"
			:win-w="winW"
			:win-h="winH"
			@switch="onPhotoSwitch"
			@more="goMore"
		/>

		<view class="loading" v-if="loading">
			<text class="loading-text">加载中...</text>
		</view>

		<view class="empty" v-else-if="!detail">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">未找到该发射任务</text>
			<view class="btn" @click="goBack">返回</view>
		</view>

		<block v-else>
			<launch-hero
				:detail="detail"
				:media="media"
				:hero-idx="heroIdx"
				:status-bar-h="statusBarH"
				:review-mode="reviewMode"
				@hero-change="heroIdx = $event"
			/>

			<view class="body">
				<launch-content
					:detail="detail"
					:agency="agency"
					:craft="craft"
					:timeline="timeline"
					:news="news"
					:review-mode="reviewMode"
					:is-fav="isFav"
					:is-reminded="isReminded"
					:desc-expanded="descExpanded"
					:tl-open="tlOpen"
					@fav="toggleFav"
					@remind="addReminder"
					@share-tap="onShareTap"
					@poster="makePoster"
					@news-tap="openNews"
					@toggle-desc="descExpanded = !descExpanded"
					@set-tl-open="tlOpen = $event"
				/>

				<launch-poster ref="poster" :detail="detail" :review-mode="reviewMode" />

				<!-- 相关报道的详情就地弹，不跳去资讯页：
				     一条报道只值半屏内容，没必要为它另开一页。
				     curLaunchId 让「查看相关发射」在已经看着这一条时只关弹窗 -->
				<news-detail :article="newsDetail" :cur-launch-id="curId" @close="newsDetail = null" />

				<view class="footer-hint">
					<text>数据来源 The Space Devs · 中文翻译由同步任务生成</text>
				</view>
			</view>
		</block>
	</view>
</template>

<script>
import spaceData from '@/utils/data.js'
import { findById as findByIdInArchive } from '@/utils/history.js'
import { launchTitle, formatDateTime, seriesKey } from '@/utils/format.js'
import * as fav from '@/utils/favorites.js'
import { getConfig } from '@/utils/config.js'
import { getAlbum } from '@/utils/album.js'
import { collectMedia } from '@/utils/media.js'
import launchPhoto from './launch-photo.vue'
import launchHero from './launch-hero.vue'
import launchContent from './launch-content.vue'
import launchPoster from './launch-poster.vue'

export default {
	name: 'launch-detail',

	components: { launchPhoto, launchHero, launchContent, launchPoster },

	props: {
		// 发射 id。页面壳从 onLoad 传进来，图片弹层从图库记录传进来
		id: { type: String, default: '' },
		// 大致时间（net）：往历史归档里翻的时候用来直达分片，可为空
		net: { type: String, default: '' },
		// 图片优先态：进来时首图占满整屏当看图器，底部「查看发射详情」按钮
		// 跳到这条发射的详情页。从图库 / 每日一图 / 全量图库点进来时用这个模式
		photo: { type: Boolean, default: false }
	},

	watch: {
		// id 和 net 常常一起变，合成一个 key 只触发一次加载
		loadKey: {
			immediate: true,
			handler() {
				this.load()
			}
		},

		// 壳换了参数（页面实例被复用）时，当前任务与相册位置一起跟上
		id(v) {
			if (!v || v === this.curId) return
			this.curId = v
			this.curNet = this.net || ''
			const i = this.album.findIndex((x) => x && String(x.id) === String(v))
			this.cur = i >= 0 ? i : 0
			// 换了一条发射，首图区重排，角标也要回到第 1 张
			this.heroIdx = 0
			if (this.photo) uni.pageScrollTo({ scrollTop: 0, duration: 0 })
		}
	},

	data() {
		return {
			detail: null,
			agency: null,
			// 同系列媒体聚合（图片库 / 视频库入口的数字来自这里，和媒体页同一口径）
			media: null,
			// 首图轮播的当前页：圆点靠它判断高亮，换发射时归零
			heroIdx: 0,
			// 状态栏高度（组件不是页面，拿不到 navMixin，created 里自己取）
			statusBarH: 20,
			loading: true,
			isFav: false,
			// 是否已写进系统日历提醒（API 无查询能力，本地记一笔防重复添加）
			isReminded: false,
			// 任务描述折叠态：默认收起，点击「展开全文」才铺开
			descExpanded: false,
			// 发射时间线（T- 序列）原始节点，来自 timelines.json，可能为空
			timeline: [],
			// 本次任务的航天器（飞船本体），和 timeline 同一个来源，可能为 null
			craft: null,
			// 提到过这次发射的报道（来自资讯流），绝大多数任务没有 → 空数组
			news: [],
			// 正在看详情的那篇报道（null 即弹窗关闭）
			newsDetail: null,
			// 时间线是展开全部还是只给接下来几步
			tlOpen: false,
			// 审核模式：隐藏任务描述 / 天气顾虑 / 失败原因等长文，只留参数
			reviewMode: false,

			// ---- 图片优先态（photo）----
			// 当前正在看的这条（横滑会换，不再等于 prop 的 id）
			curId: '',
			curNet: '',
			// 在相册里的位置
			cur: 0,
			album: [],
			winW: 375,
			winH: 667,
		}
	},

	computed: {
		// ---- 图片优先态 ----
		// 真的是从图库/每日一图点进来、且拿得到相册记录时才启用。
		// 分享打开没有相册，自然退回普通详情页
		photoOn() {
			return this.photo && Boolean(this.curItem)
		},
		// 相册里当前这条：看图器的标题/说明和「是不是图片优先态」都靠它
		curItem() {
			return this.album[this.cur] || null
		},

		// 分享出去时用任务名当标题，比「太空发射任务」有信息量得多
		shareText() {
			return launchTitle(this.detail) || '太空发射任务'
		},
		shareImg() {
			return (this.detail && this.detail.image) || '/static/logo.png'
		},
		// 加载触发器：curId 与 curNet 常在同一个 tick 里一起变（横滑切图也是），
		// 分别 watch 会重复加载两遍，合成一个 key 只触发一次
		loadKey() {
			return (this.curId || '') + '|' + (this.curNet || '')
		}
	},

	created() {
		// 相册上下文：从图库 / 每日一图点进来时，调用方把那一组图放进来了，
		// 详情页靠它支持横滑换图。分享打开没有上下文，自然退回单条详情
		const a = getAlbum()
		this.album = a.list || []
		this.curId = this.id || ''
		this.curNet = this.net || ''
		this.cur = Number(a.at) || 0

		if (this.album.length) {
			// 相册里校准位置：id 对不上就是旧上下文，宁可退化成单张
			const i = this.album.findIndex((x) => x && String(x.id) === String(this.curId))
			if (i >= 0) {
				this.cur = i
				if (!this.curNet) this.curNet = this.album[i].net || ''
			} else {
				this.cur = -1
			}
		}

		try {
			const info = uni.getSystemInfoSync()
			this.winW = info.windowWidth || 375
			this.winH = info.windowHeight || 667
			// 轮播圆点要按状态栏高度定位（避开右上角微信胶囊），组件不是页面，
			// 拿不到 navMixin，这里自己取一次
			this.statusBarH = info.statusBarHeight || 20
		} catch (e) {
			// 取不到就用 375×667 / 首图 330px，绝大多数机型在这个值附近
		}
	},

	// 组件拿不到 onShareAppMessage / onPageScroll 这类页面级生命周期，
	// 所以分享与导航栏变色留在 pages/launch/launchInfo 的壳上
	mounted() {
		this.refreshReview()
	},

	beforeUnmount() {
		// 延迟聚合还没触发就卸载了（快速返回 / 切页）：把 timer 收掉，
		// 否则回调里虽然会被 _seq 挡住，但 timer 本身会一直挂着
		if (this._mediaTimer) {
			clearTimeout(this._mediaTimer)
			this._mediaTimer = null
		}
	},

	methods: {
		/**
		 * 看图器横滑换图：子组件只回传下标，curId / curNet 是加载的触发条件，
		 * 必须留在父组件里换（换错了会加载成别人的发射）
		 */
		onPhotoSwitch(target) {
			this.cur = target
			const it = this.album[target]
			if (!it) return
			this.curId = String(it.id)
			this.curNet = it.net || ''
		},

		// 底部按钮：跳到当前这张图所属发射的详情页（替代原来的上拉加载）
		goMore() {
			const id = this.curId
			if (!id) return
			const net = this.curNet || ''
			let url = '/pages/launch/launchInfo?id=' + id
			if (net) url += '&net=' + encodeURIComponent(net)
			uni.redirectTo({ url })
		},

		// 展示开关（App onLaunch 已预热，命中内存缓存，零开销）。
		// 页面壳在 onShow 里还会再调一次：navigateBack 回来时实例被复用、不会重新
		// mounted，开关要是切过，长文该跟着变
		refreshReview() {
			getConfig().then((c) => {
				this.reviewMode = Boolean(c && c.review)
			})
		},

		/**
		 * 加载详情。
		 *
		 * 抽成组件后 id 会在抽屉被反复打开时变化，用 _seq 挡住过期的异步结果：
		 * 用户在图上连滑几张再点详情，前一张的请求可能后到，会把内容盖成别人的。
		 */
		async load() {
			const id = this.curId
			const seq = (this._seq = (this._seq || 0) + 1)

			// 换任务了：上一次还没触发的延迟聚合直接撤掉
			if (this._mediaTimer) {
				clearTimeout(this._mediaTimer)
				this._mediaTimer = null
			}
			if (!id) {
				this.loading = false
				this.detail = null
				return
			}

			this.loading = true
			this.detail = null
			this.agency = null
			// 换任务进来时旧系列的图数先清掉，避免新图没算完时残留上一个型号的入口
			this.media = null
			this.timeline = []
			this.craft = null
			// 换任务进来时先把上一个任务的报道清掉，避免串台
			this.news = []
			this.newsDetail = null
			this.isFav = fav.has(id)
			this.isReminded = this._hasReminded(id)
			// 换一个任务进来时描述回到折叠态
			this.descExpanded = false

			// 同一条发射在跨过"当前时刻"后会从 upcoming 挪到 previous，
			// 用户刚看过列表就点进来时可能已经换边了，所以两边都查。
			// findLaunchById 内部先扫缓存，命中则零网络开销。
			// 带上 curNet：目标明显在过去时它会跳过 757KB 的远期待发快照。
			let d = await spaceData.findLaunchById(id, this.curNet)
			if (this._seq !== seq) return

			// 快照（previous 只存最新 100 条）里没有 → 去历史归档分片里找。
			// 统计页失败复盘、已发射页更早条目都属于这类，之前会直接白屏。
			// net 可让查找直接跳到目标分片（findById 内部有限深与缓存上限）
			if (!d) {
				d = await findByIdInArchive(id, this.curNet)
				if (this._seq !== seq) return
			}

			this.detail = d
			this.loading = false

			// 时间线不阻塞首屏：内容先画出来，抓到的时间线到了再补一块
			this.loadTimeline(id)

			// 提到过这次发射的报道：同样不阻塞首屏。news.json 有 40KB，
			// 而大多数发射根本没有报道，拉回来是空的就整块不显示。
			// 看图器态（photo）下正文被整屏盖住，用户看不到这块，别白拉
			if (!this.photoOn) this.loadNews(id, seq)

			// 首图上的「图片库」入口数字：聚合同系列媒体，和媒体页同一口径。
			// 这份聚合要同时拉 launchers / previous / upcoming / videos 四份数据
			// （合计 1.5MB），跟着首屏一起发会把图片和正文挤在后面。
			// 首图本身有 detail.image 可显示，所以压到首屏之后再做，观感无损。
			if (this._seq === seq) {
				this._mediaTimer = setTimeout(() => {
					this._mediaTimer = null
					// 双重校验：这一秒多里用户可能已经返回或滑到别的发射了
					if (this._seq === seq) this.loadMedia(seq)
				}, 1200)
			}

			const providerId = d && d.launch_service_provider && d.launch_service_provider.id
			if (providerId) {
				const a = await spaceData.getAgencyById(providerId)
				if (this._seq === seq) this.agency = a
			}
		},

		/**
		 * 读发射时间线 + 航天器
		 *
		 * LL2 的列表端点 timeline 恒为空、rocket.spacecraft_stage 干脆不存在，
		 * 两者都只有单条详情才有，配额又只够 CI 分批抓，所以大多数任务拿不到 ——
		 * 拿不到就整块不显示，不能编造也不能拿别的任务的数据顶上。
		 * 它们在同一个文件里（同一次请求抓回来的），一起读掉。
		 */
		async loadTimeline(id) {
			try {
				const d = await spaceData.load('timelines')
				const row = ((d && d.list) || []).find((x) => String(x.id) === String(id))
				this.timeline = (row && row.items) || []
				this.craft = (row && row.craft) || null
			} catch (e) {
				// COS 上还没生成 timelines.json，或网络失败：静默降级
				this.timeline = []
				this.craft = null
			}
		},

		/**
		 * 提到过这次发射的报道。
		 *
		 * 资讯的关联是单向的（文章 → launch id），这里靠 data.js 反查。
		 * 与时间线同理：不阻塞首屏，回来晚一步也没关系；
		 * 出错就当作没有报道，整块不显示 —— 详情页不能因为资讯挂了而缺内容。
		 */
		async loadNews(id, seq) {
			try {
				const list = await spaceData.newsForLaunch(id)
				if (this._seq !== seq) return
				this.news = list
			} catch (e) {
				this.news = []
			}
		},

		// 点报道 → 资讯页并直接展开那一条（news 页的 onLoad 支持 ?id=）
		openNews(a) {
			if (!a || a.id == null) return
			this.newsDetail = a
		},

		/** 分享路径里的 net 参数：知道大致时间才能在归档里直达目标分片 */
		_netQuery(noLeading) {
			const net = this.detail && this.detail.net
			if (!net) return ''
			return (noLeading ? '' : '&') + 'net=' + encodeURIComponent(net)
		},

		/** 海报绘制在 launch-poster 里（canvas 必须和绘制代码同实例），这里只转一下 */
		makePoster() {
			const p = this.$refs.poster
			if (p) p.makePoster()
		},

		/**
		 * 首图「图片库」入口的数字来源。
		 *
		 * 和媒体页同一个口径：拿发射的型号 id → 在 launchers 里找同系列构型 →
		 * 把该系列全部发射记录的图片/视频摊平聚合。算出来的是「这个型号整条线」
		 * 的图数（含本次发射那一张），和媒体页点进去看到的一致。
		 * 型号不在快照里时直接不显示入口，不做假数字。
		 */
		async loadMedia(seq) {
			const c = this.detail && this.detail.rocket && this.detail.rocket.configuration
			if (!c || !c.id) return
			try {
				const [launchers, prev, up, vd] = await Promise.all([
					spaceData.load('launchers').catch(() => null),
					spaceData.load('previous').catch(() => null),
					spaceData.load('upcoming').catch(() => null),
					spaceData.load('videos').catch(() => null)
				])
				// 用户在图上连滑几张再点详情，旧请求可能后到，盖成别的型号
				if (this._seq !== seq) return

				const list = (launchers && launchers.list) || []
				const config = list.find((x) => String(x.id) === String(c.id)) || null
				if (!config) return

				// 同系列构型一起算：Falcon 9 / Falcon Heavy 共用一批发射照片
				const key = seriesKey(config)
				const series = key ? list.filter((x) => seriesKey(x) === key) : [config]
				const ids = {}
				series.forEach((x) => {
					ids[String(x.id)] = 1
				})

				// 视频单独在 videos.json（列表端点不返回 vid_urls），按 id 合回记录
				const vmap = {}
				for (const row of (vd && vd.list) || []) {
					if (row && row.id && (row.vids || []).length) vmap[String(row.id)] = row.vids
				}

				const all = [...((prev && prev.list) || []), ...((up && up.list) || [])]
				const records = all
					.filter((x) => {
						const cc = x.rocket && x.rocket.configuration
						return cc && ids[String(cc.id)]
					})
					.map((x) => {
						const vids = vmap[String(x.id)]
						return vids ? Object.assign({}, x, { vid: vids }) : x
					})

				this.media = collectMedia(series, records)
			} catch (e) {
				// 任一数据集没生成 / 网络失败：静默降级，入口自然不显示
				console.warn('[launchInfo] 媒体聚合失败', e)
			}
		},

		// ==================== 系统日历提醒 ====================
		/**
		 * 点击「提醒」：往系统日历写一条事件，发射时刻提前提醒。
		 * 微信 addPhoneCalendar 只有「新增」、没有查询/删除，所以本地记一笔
		 * 已提醒的 id，避免重复添加；再点只提示已在日历中。
		 */
		async addReminder() {
			const d = this.detail
			if (!d || !d.net) return
			if (this.isReminded) {
				uni.showToast({ title: '已在系统日历中', icon: 'none' })
				return
			}
			// 能力检测：基础库 2.20.0+ 才有 addPhoneCalendar
			if (typeof uni === 'undefined' || typeof uni.addPhoneCalendar !== 'function') {
				uni.showToast({ title: '当前环境不支持日历提醒', icon: 'none' })
				return
			}
			const netMs = new Date(d.net).getTime()
			if (isNaN(netMs) || netMs <= Date.now()) {
				uni.showToast({ title: '发射已结束', icon: 'none' })
				return
			}
			const start = Math.floor(netMs / 1000)
			// 结束时间必须有长度，给 30 分钟兜底
			const end = start + 30 * 60
			const now = Math.floor(Date.now() / 1000)
			// 默认提前 1 小时提醒；不足 1 小时则到点提醒，避免 alarmTime 早于现在
			const lead = 60 * 60
			const alarmTime = start - lead > now ? start - lead : start
			const title = launchTitle(this.detail) || '太空发射任务'
			const desc = '发射时间：' + (formatDateTime(d.net) || '')
			const pad = (d.pad && d.pad.name) || ''
			const agency = (d.launch_service_provider && d.launch_service_provider.name) || ''
			const location = [pad, agency].filter(Boolean).join(' · ')
			uni.showLoading({ title: '添加中…', mask: true })
			try {
				await new Promise((resolve, reject) => {
					uni.addPhoneCalendar({
						title,
						description: desc,
						location,
						startTime: start,
						endTime: end,
						alarm: true,
						alarmTime,
						success: resolve,
						fail: reject
					})
				})
				this._markReminded(d.id)
				uni.hideLoading()
				uni.showToast({ title: '已添加到系统日历', icon: 'success' })
			} catch (e) {
				uni.hideLoading()
				const msg = (e && e.errMsg) || ''
				// 用户主动取消授权不算失败
				if (msg.indexOf('cancel') !== -1) return
				if (msg.indexOf('auth') !== -1 || msg.indexOf('deny') !== -1) {
					this._calAuthModal()
				} else {
					console.warn('[launchInfo] 日历提醒添加失败', e)
					uni.showToast({ title: '添加失败，请重试', icon: 'none' })
				}
			}
		},
		/** 本地记录某条发射已写进系统日历 */
		_markReminded(id) {
			this.isReminded = true
			try {
				const KEY = 'reminded_launches'
				const set = new Set(uni.getStorageSync(KEY) || [])
				set.add(String(id))
				uni.setStorageSync(KEY, Array.from(set))
			} catch (e) {}
		},
		/** 是否已写进系统日历（本地记录） */
		_hasReminded(id) {
			try {
				const set = new Set(uni.getStorageSync('reminded_launches') || [])
				return set.has(String(id))
			} catch (e) {
				return false
			}
		},
		/** 日历权限被拒时的引导弹窗 */
		_calAuthModal() {
			uni.showModal({
				title: '需要日历权限',
				content: '添加提醒需要系统日历权限，请在设置中开启',
				confirmText: '去设置',
				success: (r) => {
					if (r.confirm) uni.openSetting()
				}
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
			if (!this.id) return
			this.isFav = fav.toggle(this.id)
			uni.showToast({
				title: this.isFav ? '已收藏，列表里会置顶' : '已取消收藏',
				icon: 'none',
				duration: 1500
			})
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

/* 图片优先态：整页钉住、禁止滚动。
   stage 本身是 fixed，但只盖住一屏 —— 页面要是还能滚，滑动时详情内容
   会从底下顶上来，那层「看不见但能滚的页面」就这么来的。
   定位改 fixed 后 min-height 失效，靠 top/bottom 撑满；padding 也要清掉，
   否则底部会多出 60rpx 的滚动余量 */
.page-lock {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	min-height: 0;
	padding-bottom: 0;
	overflow: hidden;
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

.body {
	padding: 0 32rpx;
	margin-top: -40rpx;
	position: relative;
}

.footer-hint {
	margin-top: 40rpx;
	text-align: center;
	color: #3d4a5c;
	font-size: 22rpx;
}
</style>
