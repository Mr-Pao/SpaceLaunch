<template>
	<view class="page">
		<star-field />

		<view class="nav-row" :style="{ paddingTop: statusBarH + 'px' }">
			<text class="nav-date">{{ today }}</text>
		</view>

		<!-- 审核态：与其它 tab 页一致，整页不放动态数据 -->
		<block v-if="!reviewMode">
			<!-- 1 每日一图。按「北京天序号」哈希抽图，同一天反复进来看到的是同一张，
			     跨天才换 —— 用真随机的话每次进页都换，就没有「今天这张」的意思了 -->
			<!-- 1 每日一览：NASA 每日天文（APOD）+ 每日地球（EPIC）+ 今日发射图 轮播 -->
			<swiper
				v-if="dailyCards.length"
				class="daily-swiper"
				:autoplay="true"
				:interval="5000"
				:circular="true"
				:duration="450"
				:indicator-dots="true"
				indicator-color="rgba(255,255,255,0.28)"
				indicator-active-color="#38bdf8"
			>
				<swiper-item v-for="(c, i) in dailyCards" :key="i">
					<view class="daily-card" @click="openCard(c)">
						<image
							v-if="!dailyErr[i]"
							class="daily-img"
							:src="c.src"
							mode="aspectFill"
							@error="onDailyErr(i)"
						></image>
						<view class="daily-shade"></view>
						<view class="daily-top">
							<text class="daily-tag">{{ c.tag }}</text>
						</view>
						<view class="daily-body">
							<text class="daily-name">{{ c.title }}</text>
							<text class="daily-meta" v-if="c.date">{{ c.date }}</text>
							<text class="daily-desc" v-if="c.desc">{{ c.desc }}</text>
							<text class="daily-credit" v-if="c.credit">{{ c.credit }}</text>
							<view class="daily-acts" @click.stop>
								<view class="daily-link" hover-class="daily-link-hover" @click.stop="viewDetail(c)">
									<text class="daily-link-text">查看详情</text>
									<text class="daily-link-arrow">›</text>
								</view>
								<view class="daily-link" hover-class="daily-link-hover" @click.stop="moreImgs(c)">
									<text class="daily-link-text">更多图片</text>
									<text class="daily-link-arrow">›</text>
								</view>
							</view>
						</view>
					</view>
				</swiper-item>
			</swiper>

			<!-- 3 下次发射：直接用发射页那张卡（next-launch 组件），
			     两个页面看到的是同一个东西 —— 自己再画一张，改版时必然画歪 -->
			<view class="next-wrap" v-if="next">
				<view class="sec-head">
					<text class="sec-title">下次发射</text>
				</view>

				<!-- 两个出口在卡片内部右下角（next-launch 的 foot 行），
				     不再另起一行挂在卡外面 -->
				<next-launch
					:item="next"
					:more="true"
					@select="goLaunch(next.id)"
					@more="goFeed"
				/>
			</view>

			<!-- 4 往年今日 -->
			<view class="otd" v-if="otd.length">
				<!-- 折叠入口放在标题行右侧，不再压在列表下面：
				     往年今日一天一次、多是「顺手扫一眼」，想展开的人
				     在看见标题那一刻就该够得着，不用先滚过三条才找到 -->
				<view class="sec-head">
					<text class="sec-title">往年今日</text>
					<view class="sec-acts">
						<text class="sec-sub">{{ otd.length }} 次发射</text>
						<view
							class="more-inline"
							v-if="otd.length > OTD_FOLD"
							hover-class="more-hover"
							@click="toggleOtdOpen"
						>
							<text class="more-text">{{ otdOpen ? '收起' : '更多 ' + (otd.length - OTD_FOLD) + ' 条' }}</text>
							<text class="more-arrow" :class="{ 'is-up': otdOpen }">›</text>
						</view>
					</view>
				</view>

				<!-- 点进去是发射详情页。归档里的历史任务不在「已发射」快照内，
				     但详情页会拿 net 直接定位到归档分片（见 launchInfo 的 netHint），
				     所以这里带 net 能省掉一片片翻找 -->
				<view
					class="otd-item"
					v-for="x in otdShown"
					:key="x.id || x.net"
					hover-class="otd-hover"
					@click="goLaunch(x.id, x.net)"
				>
					<image v-if="x.img" class="otd-img" :src="x.img" mode="aspectFill" lazy-load></image>
					<view v-else class="otd-img otd-ph"><text>🚀</text></view>

					<view class="otd-body">
						<text class="otd-year">{{ x.yearsAgo }} 年前的今天</text>
						<text class="otd-name">{{ x.title }}</text>
						<text class="otd-meta" v-if="x.meta">{{ x.meta }}</text>
					</view>
				</view>
			</view>

			<!-- 5 航天资讯。
			     资讯是全站唯一高频滚动、有时效性的内容（每 3 小时一轮），
			     以前挂在「我的 → 探索」网格末位，那儿是管理收藏和提醒的地方，
			     没人会去刷新闻。这里和「近期活动」对调：活动是要照做的日程，
			     更适合当资料放探索；资讯放首页底部负责「有更新」的提示 -->
			<news-section ref="news" :limit="3" />

			<!-- 五块都没数据（冷启动 + 全挂了）：给一句人话，别留空白页 -->
			<view class="empty" v-if="!daily && !next && !otd.length">
				<text class="empty-icon">🛰️</text>
				<text class="empty-text">{{ loading ? '正在拉取今日数据...' : '今天的数据还没准备好' }}</text>
				<view class="btn" v-if="!loading" @click="reload">重新加载</view>
			</view>
		</block>

		<!-- 点图直接进详情页的图片优先态，这里不再放大图弹层 -->
	</view>
</template>

<script>
/**
 * 今日（启动页）
 *
 * 五块固定内容，按「看图 → 看人 → 看下次 → 看历史 → 看外面怎么说」的顺序排：
 *   每日一图      图库聚合按日确定性挑一张
 *   此刻在天上     宇航员库 in_space 筛选
 *   下次发射       upcoming 里第一条还没发射的 + 金色倒计时
 *   往年今日      CI 每天按「月-日」筛好的历史发射
 *   航天资讯      SNAPI 聚合报道，每 3 小时同步一次
 *
 * 五块各自独立加载，任何一块失败只影响自己 —— 首页不能因为
 * 某个数据集 404 就整页白掉。
 */
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
// 导入改名：模板只能访问实例上的东西，想直接调就得在 methods 里挂一层
import { formatDateTime, rocketName } from '@/utils/format.js'
import { fullImageOf } from '@/utils/media.js'
import { pickDaily } from '@/utils/daily.js'
import { setAlbum } from '@/utils/album.js'
import { getConfig } from '@/utils/config.js'
import navMixin from '@/utils/nav-mixin.js'

// 北京时间的「日序号」：用它取模挑每日一图，跨天才变
const BJ_OFFSET = 8 * 60 * 60 * 1000
const WEEK_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

// 往年今日默认露几条（展开前的折叠线）
const OTD_FOLD = 3

/**
 * 导航栏那句日期。
 * 不用 format.js 的 longDate（它带年份，46rpx 下放不进导航行会折行），
 * 这里只留「10月25日 星期日」，年份对「今日」这个页面没有信息量。
 */
function todayText() {
	const d = new Date()
	return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + WEEK_ZH[d.getDay()]
}

export default {
	mixins: [navMixin],

	data() {
		return {
			reviewMode: false,
			loading: true,
			imgBroken: false,
			// 每日一图的原图是否已预载完成：false 时 dailySrc 先给缩略图顶上
			fullReady: false,
			today: '',
			gallery: [],
			upcoming: [],
			onthisday: [],
			// NASA 每日天文 / 每日地球（首页「每日一览」轮播数据源）
			apod: [],
			epic: [],
			// 轮播卡片内图片加载失败的索引，标记后回退底色
			dailyErr: {},
			// 往年今日是否展开（默认折叠到 OTD_FOLD 条）
			otdOpen: false,
			// 模板要读这个常量，挂到 data 上（options API 的模板访问不到模块作用域）
			OTD_FOLD,
			// 倒计时组件的 net 需要「未来」的那条，用时钟兜住页面长时间不动的场景
			nowTick: Date.now()
		}
	},

	computed: {
		// 每日一图：按「北京天序号」在 gallery 里哈希抽一张，同一天恒定。
		// 早先是用天序号直接对 length 取模 —— 列表是新→旧倒序的，那等于
		// 「一天往前翻一张」，相邻两天永远是同一次发射的相邻照片。
		daily() {
			return pickDaily(this.gallery, this.daySeed())
		},

		// 缩略图先上屏、原图到了再换（卡片铺满整行，480px 最终会糊，
		// 但那是「先看到图」之后的事，不该为清晰度付首屏的等待）
		dailySrc() {
			const t = (this.daily && this.daily.thumb) || ''
			if (!t) return ''

			// 首屏永远先给缩略图：它是 COS 上几十 KB 的小图，几乎和文字同一帧到；
			// 原图（{hash}_2000）动辄几百 KB —— 以前直接把原图当 src，
			// 表现就是「有时候这块要空一会儿才出图」。
			// 原图在后台预载，到了再把 src 换过去；两张都是 aspectFill、
			// 同一构图，替换的瞬间看不出跳。
			if (this.imgBroken || !this.fullReady) return t
			return fullImageOf(t) || t
		},

		/** LL2 的名字是「火箭型号 | 任务名」，卡片上只留任务名 ——
		    火箭型号下一行已经单独写了，重复两遍会把两行额度用光 */
		dailyTitle() {
			const d = this.daily
			if (!d) return ''
			const parts = (d.name || '').split('|')
			return (parts.length > 1 ? parts[1] : parts[0]).trim()
		},

		dailyMeta() {
			const d = this.daily
			if (!d) return ''
			const when = formatDateTime(d.net)
			return [rocketName({ name: d.cname }), when].filter(Boolean).join(' · ')
		},

		/**
		 * 首页「每日一览」轮播卡片：固定只出三张每日图，顺序固定
		 * sl（每日一图）→ epic（每日地球）→ apod（每日天文）。
		 * 每张只取数据源的第一条（epic/apod 若为空则跳过该卡），
		 * 三类出口（查看详情 / 更多图片）在模板里统一渲染。
		 */
		dailyCards() {
			const cards = []
			const d = this.daily
			if (d) {
				cards.push({
					type: 'sl',
					tag: '每日一图',
					date: this.dailyMeta,
					title: this.dailyTitle,
					desc: '',
					src: this.dailySrc,
					full: (d.thumb && fullImageOf(d.thumb)) || this.dailySrc,
					credit: d.credit ? '@' + d.credit : '',
					launchId: d.id,
					net: d.net
				})
			}
			const epic = this.epic || []
			if (epic.length) {
				const x = epic[0]
				cards.push({
					type: 'epic',
					tag: '每日地球',
					date: (x.date || '').slice(0, 10),
					title: '地球 · DSCOVR',
					desc: x.caption || '',
					src: x.thumb,
					full: x.full,
					credit: 'NASA EPIC'
				})
			}
			const apod = this.apod || []
			if (apod.length) {
				const x = apod[0]
				cards.push({
					type: 'apod',
					tag: '每日天文',
					date: x.date || '',
					title: x.title || '',
					desc: x.explanation || '',
					src: x.thumb,
					full: x.full,
					credit: x.credit || ''
				})
			}
			return cards
		},

		next() {
			const t = this.nowTick
			const list = this.upcoming.filter((x) => x && x.net && new Date(x.net).getTime() > t)
			if (!list.length) return null
			return list.slice().sort((a, b) => new Date(a.net) - new Date(b.net))[0]
		},

		// 往年今日：补上「N 年前」和标题，模板里就不用做逻辑。
		// 不做条数截断 —— CI 侧上限 40 条，折叠态只渲染 3 条，
		// 展开时才全出（图片都带 lazy-load，四十张不至于卡）
		otd() {
			const thisYear = new Date(this.nowTick + BJ_OFFSET).getUTCFullYear()
			return this.onthisday.map((x) => {
				const title = x.nameZh || x.name || '未命名任务'
				const meta = [x.rocket, x.agency].filter(Boolean).join(' · ')
				return {
					// 统一成字符串：LL2 的 id 是 uuid，但个别旧分片是数字
					id: String(x.id || x.net || ''),
					net: x.net,
					img: x.img,
					title,
					meta,
					yearsAgo: Math.max(1, thisYear - (x.y || thisYear))
				}
			})
		},

		// 实际渲染的往年今日：折叠态只给前三条
		otdShown() {
			return this.otdOpen ? this.otd : this.otd.slice(0, OTD_FOLD)
		}
	},

	/**
	 * 每日一图换了（换了天、或 gallery 首次到达）就重新预载原图。
	 *
	 * gallery 是异步到的，daily 一开始是 null、拿到数据后才变成具体那张，
	 * 所以必须 watch 而不是在 onLoad 里预载一次。
	 */
	watch: {
		daily(nv) {
			this.fullReady = false
			if (nv && nv.thumb) this.preloadDailyFull(nv.thumb)
		}
	},

	onLoad() {
		this.today = todayText()

		// 审核态：今日页是**启动页**，光把内容藏起来不够 —— 审核员打开小程序
		// 第一眼会停在一片空白上。这里和发射页用同一套：先 switchTab 去火箭大全，
		// 失败再 reLaunch 兜底（页面栈未就绪时 switchTab 会偶发失败）。
		// tabBar 在审核态是隐藏的，所以跳过去就回不来，不会又落回空页面。
		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (this.reviewMode) {
				uni.switchTab({
					url: '/pages/rockets/rockets',
					fail: () => {
						uni.reLaunch({ url: '/pages/rockets/rockets' })
					}
				})
				return
			}
			this.loadAll()
		})
	},

	onShow() {
		syncTabBar(0)
		// 跨天回来（放后台一晚上）要换日期和每日一图
		this.today = todayText()
		this.nowTick = Date.now()
		this.imgBroken = false
	},

	onPullDownRefresh() {
		if (this.reviewMode) {
			uni.stopPullDownRefresh()
			return
		}
		// 资讯是独立组件、自己管数据，下拉时一并让它重拉（会走 data.js 的 TTL 判断，
		// 没到期就是读缓存，不会每次都打 CDN）
		const news = this.$refs.news
		if (news && news.reload) news.reload()
		this.loadAll(true).then(() => uni.stopPullDownRefresh())
	},

	/**
	 * 滚到底自动续活动。
	 *
	 * 活动排在整页最后一块，所以「触底」基本就等于「活动看完了」，
	 * 直接让子组件再放一批出来（每次一批 = limit 条）。
	 * 往年今日展开后页面变长，也会自然多触发几次，直到 27 条全出。
	 */
	onReachBottom() {
		const news = this.$refs.news
		if (news) news.loadMore()
	},

	methods: {
		/**
		 * 后台把每日一图的原图拉下来。
		 *
		 * 用 getImageInfo 而不是再挂一个隐藏 image：它会把图落到本地缓存，
		 * 之后 dailySrc 切到同一个 URL 时直接命中缓存，不会二次下载。
		 * 失败就静默保持缩略图 —— 用户只会觉得「这张没那么清楚」，
		 * 而不是看到一个裂图或一直转圈。
		 */
		preloadDailyFull(thumb) {
			const full = fullImageOf(thumb)
			if (!full || full === thumb) {
				this.fullReady = true
				return
			}
			uni.getImageInfo({
				src: full,
				success: () => {
					this.fullReady = true
				},
				fail: () => {
					// 原图不存在或网差：一直用缩略图
				}
			})
		},

		daySeed() {
			return Math.floor((Date.now() + BJ_OFFSET) / 86400000)
		},

		/**
		 * 四块并行加载，各自 catch。
		 * 用 allSettled 的语义：一块失败不能让其他三块陪葬
		 */
		async loadAll(force) {
			this.loading = true

		const [g, u, o, ap, ep] = await Promise.all([
			spaceData.load('gallery', { force: !!force }).catch(() => null),
			// 待发射列表本身有 15 分钟缓存，下拉时才强制刷
			spaceData.load('upcoming', { force: !!force }).catch(() => null),
			spaceData.load('onthisday', { force: !!force }).catch(() => null),
			// 接 onUpdate：命中旧缓存时先返回缓存、后台再刷；不接就永远停在旧结果
			spaceData.load('apod', { onUpdate: (fresh) => this.applyApod(fresh) }).catch(() => null),
			spaceData.load('epic').catch(() => null)
		])

		if (g) this.gallery = (g.list || []).filter((x) => x && x.thumb)
		if (u) this.upcoming = u.list || []
		if (o) this.onthisday = o.list || []
		// 过滤 NASA 接口降级占位响应（title="NASA Science" / WP 主题资源目录 url），避免脏数据上首页卡片
		if (ap) this.applyApod(ap)
		if (ep) this.epic = ep.list || []

			this.loading = false
		},

		/** apod 数据落地：前台返回与后台 onUpdate 刷新都走这里，保证同一套过滤 */
		applyApod(d) {
			this.apod = ((d && d.list) || []).filter(
				(x) => x && x.full && x.title !== 'NASA Science' && !/\/wp-content\/themes\//.test(x.full || x.thumb || '')
			)
		},

		reload() {
			this.loadAll(true)
		},

		/**
		 * 看大图：进详情页的图片优先态。
		 * 每日一图只有一张，相册上下文就是单元素 —— 左右滑自然滑不动，
		 * 底部「查看发射详情」直接跳到这次发射的详情。
		 */
		openPhoto(item) {
			if (!item) return

			setAlbum([item], 0, 'today')
			uni.navigateTo({
				url:
					'/pages/launch/launchInfo?id=' + item.id + '&photo=1' +
					(item.net ? '&net=' + encodeURIComponent(item.net) : '')
			})
		},

		/** 首页「每日一览」轮播卡片点击：
		    SL 类型（今日发射图）进发射详情图片态（沿用 openPhoto）；
		    APOD/EPIC 类型用 uni.previewImage 全屏看原图 */
		openCard(c) {
			if (!c) return
			if (c.type === 'sl') {
				this.openPhoto({ id: c.launchId, net: c.net })
			} else {
				const url = c.full || c.src
				if (url) uni.previewImage({ urls: [url], current: url })
			}
		},

		/** 全屏看单图：取 full，没有再用 src 兜底 */
		previewFull(c) {
			if (!c) return
			const url = c.full || c.src
			if (url) uni.previewImage({ urls: [url], current: url })
		},

		/** 卡片右下「查看详情」：SL 进发射详情图态，NASA 两张全屏看原图 */
		viewDetail(c) {
			if (!c) return
			if (c.type === 'sl') {
				this.openPhoto({ id: c.launchId, net: c.net })
			} else {
				this.previewFull(c)
			}
		},

		/** 卡片右下「更多图片」：按卡片类型跳到聚合图库对应 tab */
		moreImgs(c) {
			if (!c) return
			if (c.type === 'sl') this.goGalleryAll('image')
			else if (c.type === 'epic') this.goGalleryAll('earth')
			else if (c.type === 'apod') this.goGalleryAll('astro')
		},

		/** 跳聚合图库：tab 取值 image|video|earth|astro|nasa（gallery-all.vue 读取） */
		goGalleryAll(tab) {
			uni.navigateTo({ url: '/pages/gallery-all/gallery-all?tab=' + tab })
		},

		/** 轮播图加载失败：标记该索引，模板回退到底色，避免裂图 */
		onDailyErr(i) {
			this.$set(this.dailyErr, i, true)
		},

		toggleOtdOpen() {
			this.otdOpen = !this.otdOpen
		},

		// 发射页是 tab 页，只能用 switchTab（navigateTo 会直接失败）
		goFeed() {
			uni.switchTab({ url: '/pages/index/index' })
		},

		/** 图库是 tab 页，只能 switchTab；navigateTo 会直接失败 */
		goGallery() {
			uni.switchTab({ url: '/pages/gallery/gallery' })
		},

		/**
		 * 进发射详情。net 是可选的加速提示：归档里的老任务不在
		 * 已发射快照内，详情页要靠它直接定位到历史分片，否则要一片片翻。
		 */
		goLaunch(id, net) {
			if (!id) return
			const q = net ? '&net=' + encodeURIComponent(net) : ''
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + id + q })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	min-height: 100vh;
	/* 底部给悬浮胶囊 tabBar 让位 */
	padding: 0 24rpx 200rpx;
	box-sizing: border-box;
}

.nav-date {
	color: #ffffff;
	font-size: 38rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
	/* 右侧让位给微信胶囊 */
	padding-right: 180rpx;
}

/* ---- 通用区块头 ---- */
.sec-head {
	display: flex;
	align-items: baseline;
	margin-bottom: 14rpx;
}

/* 五块标题统一 34rpx：观察下来 30rpx 偏小。
   「航天资讯」和「近期活动」这两个组件块内部也是 34rpx，
   页内标题和组件标题必须同档，否则上下滚过去肉眼能看出差一截 */
.sec-title {
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.sec-sub {
	margin-left: 12rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* 区块头右侧那一组（计数 + 折叠入口）。
   margin-left:auto 只在挂了这个类的块里生效，别的 sec-head
   还是「标题 + 紧跟的小字」，不会因为这里改动而集体右对齐 */
.sec-acts {
	display: flex;
	align-items: center;
	margin-left: auto;
}

.sec-acts .sec-sub {
	margin-left: 0;
}

/* 往年今日的折叠入口：原来在列表下方，现在跟标题同一行 */
.more-inline {
	display: flex;
	align-items: center;
	margin-left: 18rpx;
	padding: 6rpx 0;
}

/* ---- 1 每日一图 ---- */
.daily-swiper {
	height: 500rpx;
	margin-top: 16rpx;
	margin-bottom: 30rpx;
	border-radius: 24rpx;
	overflow: hidden;
}

.daily-card {
	position: relative;
	height: 500rpx;
	border-radius: 24rpx;
	overflow: hidden;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.07);
}

.daily-card:active {
	opacity: 0.92;
}

.daily-hover {
	opacity: 0.92;
}

.daily-img {
	width: 100%;
	height: 100%;
	display: block;
}

/* 底部压黑：图上叠字，不压一层的话浅色天空背景上完全读不出来 */
.daily-shade {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 60%;
	background: linear-gradient(to top, rgba(6, 9, 15, 0.92), rgba(6, 9, 15, 0));
}

.daily-top {
	position: absolute;
	left: 24rpx;
	top: 24rpx;
}

.daily-tag {
	padding: 6rpx 16rpx;
	border-radius: 20rpx;
	background: rgba(10, 14, 23, 0.62);
	border: 1rpx solid rgba(255, 255, 255, 0.22);
	color: #ffffff;
	font-size: 21rpx;
	letter-spacing: 2rpx;
	-webkit-backdrop-filter: blur(20rpx);
	backdrop-filter: blur(20rpx);
}

.daily-body {
	position: absolute;
	left: 26rpx;
	right: 26rpx;
	bottom: 26rpx;
}

.daily-name {
	display: -webkit-box;
	color: #ffffff;
	font-size: 34rpx;
	font-weight: 600;
	line-height: 1.32;
	/* 任务名可能很长，两行截断 */
	overflow: hidden;
	text-overflow: ellipsis;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.daily-meta {
	display: block;
	margin-top: 8rpx;
	color: rgba(255, 255, 255, 0.68);
	font-size: 23rpx;
}

.daily-credit {
	display: block;
	margin-top: 4rpx;
	color: rgba(255, 255, 255, 0.42);
	font-size: 20rpx;
}

/* 两个出口靠右，与署名同一列；中间留 34rpx，手指点「查看详情」不会误触「更多图片」 */
.daily-acts {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	margin-top: 12rpx;
}

.daily-link {
	display: flex;
	align-items: center;
	padding: 8rpx 0 8rpx 34rpx;
}

.daily-link-hover {
	opacity: 0.6;
}

/* 压在照片上，用亮天蓝 + 半透明底，避免浅色蓝天背景上读不出来 */
.daily-link-text {
	color: #7dd3fc;
	font-size: 23rpx;
	font-weight: 500;
	text-shadow: 0 1rpx 6rpx rgba(0, 0, 0, 0.6);
}

.daily-link-arrow {
	margin-left: 4rpx;
	color: #7dd3fc;
	font-size: 23rpx;
	line-height: 1;
	text-shadow: 0 1rpx 6rpx rgba(0, 0, 0, 0.6);
}

.daily-desc {
	display: -webkit-box;
	margin-top: 10rpx;
	color: rgba(255, 255, 255, 0.64);
	font-size: 21rpx;
	line-height: 1.42;
	max-height: 92rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
}

/* 底部给轮播指示点留白，避免圆点和文字叠在一起 */
.daily-body {
	bottom: 46rpx;
}

/* ---- 3 下次发射 ---- */
.next-wrap {
	margin-bottom: 30rpx;
}

/* 折叠入口用的 .more-hover / .more-text / .more-arrow 见「往年今日」那组，
   原来压在列表下面的 .more-row 已随入口上移删掉 */
.more-hover {
	opacity: 0.6;
}

.more-text {
	color: #38bdf8;
	font-size: 23rpx;
}

/* 固定成正方形小盒再居中：› 这个字形本身在字盒里偏下，
   直接旋转会连偏移一起转过去，看着歪 */
.more-arrow {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24rpx;
	height: 24rpx;
	margin-left: 4rpx;
	color: #38bdf8;
	font-size: 23rpx;
	line-height: 1;
	transition: transform 0.18s ease;
}

/* 展开态：同一个 chevron 转 -90° 朝上，不用再画一个箭头 */
.more-arrow.is-up {
	transform: rotate(-90deg);
}

/* ---- 4 往年今日 ---- */
.otd {
	margin-bottom: 20rpx;
}

.otd-item {
	display: flex;
	align-items: center;
	padding: 16rpx;
	margin-bottom: 14rpx;
	border-radius: 18rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.06);
}

.otd-hover {
	background: #1b2231;
}

.otd-img {
	flex-shrink: 0;
	width: 132rpx;
	height: 96rpx;
	border-radius: 12rpx;
	display: block;
	background: #1b2231;
}

.otd-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 36rpx;
}

.otd-body {
	flex: 1;
	min-width: 0;
	margin-left: 18rpx;
}

.otd-year {
	display: block;
	color: #f5c33b;
	font-size: 21rpx;
	letter-spacing: 1rpx;
}

.otd-name {
	display: block;
	margin-top: 4rpx;
	color: #ffffff;
	font-size: 26rpx;
	font-weight: 500;
	line-height: 1.34;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.otd-meta {
	display: block;
	margin-top: 4rpx;
	color: #6b7891;
	font-size: 21rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* ---- 空态 ---- */
.empty {
	padding: 160rpx 40rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
}

.empty-icon {
	font-size: 72rpx;
	margin-bottom: 20rpx;
}

.empty-text {
	color: #6b7891;
	font-size: 26rpx;
	text-align: center;
	line-height: 1.6;
}

.btn {
	margin-top: 28rpx;
	padding: 16rpx 48rpx;
	border-radius: 40rpx;
	background: #38bdf8;
	color: #0a0e17;
	font-size: 26rpx;
	font-weight: 600;
}
</style>
