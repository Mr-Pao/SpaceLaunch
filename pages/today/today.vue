<template>
	<view class="page">
		<star-field />

		<view class="nav-row" :style="{ paddingTop: statusBarH + 'px' }">
			<text class="nav-date">{{ today }}</text>
		</view>

		<!-- 审核态：与其它 tab 页一致，整页不放动态数据 -->
		<block v-if="!reviewMode">
			<!-- 1 每日一图。按「日序号」取模挑图，同一天反复进来看到的是同一张，
			     跨天才换 —— 用随机数的话每次进页都换，就没有「今天这张」的意思了 -->
			<view class="daily" v-if="daily" hover-class="daily-hover" @click="previewDaily">
				<image class="daily-img" :src="dailySrc" mode="aspectFill" @error="imgBroken = true"></image>
				<view class="daily-shade"></view>

				<view class="daily-top">
					<text class="daily-tag">每日一图</text>
				</view>

				<view class="daily-body">
					<text class="daily-name">{{ daily.name }}</text>
					<text class="daily-meta" v-if="dailyMeta">{{ dailyMeta }}</text>
					<text class="daily-credit" v-if="daily.credit">@{{ daily.credit }}</text>
				</view>
			</view>

			<!-- 2 此刻在天上 -->
			<view class="inspace" v-if="inSpace.length">
				<view class="sec-head">
					<text class="sec-title">此刻在天上</text>
					<text class="sec-sub">{{ inSpace.length }} 人</text>
				</view>
				<scroll-view class="inspace-scroll" scroll-x>
					<view class="inspace-row">
						<view
							class="acard"
							v-for="a in inSpace"
							:key="a.id"
							hover-class="acard-hover"
							@click="goAstronaut(a.id)"
						>
							<image v-if="a.img" class="acard-img" :src="a.img" mode="aspectFill" lazy-load></image>
							<view v-else class="acard-img acard-ph"><text>🧑‍🚀</text></view>
							<text class="acard-name">{{ a.name }}</text>
							<text class="acard-days">在轨 {{ a.days }} 天</text>
						</view>
					</view>
				</scroll-view>
			</view>

			<!-- 3 下次发射：直接用发射页那张卡（next-launch 组件），
			     两个页面看到的是同一个东西 —— 自己再画一张，改版时必然画歪 -->
			<view class="next-wrap" v-if="next">
				<view class="sec-head">
					<text class="sec-title">下次发射</text>
				</view>

				<next-launch :item="next" @select="goLaunch(next.id)" />

				<!-- 今日页只放一条，想看全部去发射页 -->
				<view class="more-row" hover-class="more-hover" @click="goFeed">
					<text class="more-text">更多发射</text>
					<text class="more-arrow">»</text>
				</view>
			</view>

			<!-- 4 往年今日 -->
			<view class="otd" v-if="otd.length">
				<view class="sec-head">
					<text class="sec-title">往年今日</text>
					<text class="sec-sub">{{ otd.length }} 次发射</text>

					<!-- 默认只露三条：这是「顺手看一眼」的内容，不是要坐这儿读的。
					     想多看再展开，页面才不至于一进来就要滑很久 -->
					<view
						class="sec-more"
						v-if="otd.length > OTD_FOLD"
						hover-class="sec-more-hover"
						@click="toggleOtdOpen"
					>
						<text class="sec-more-text">{{ otdOpen ? '收起' : '更多 ' + (otd.length - OTD_FOLD) + ' 条' }}</text>
						<text class="sec-more-arrow" :class="{ 'is-open': otdOpen }">›</text>
					</view>
				</view>

				<view
					class="otd-item"
					v-for="x in otdShown"
					:key="x.id || x.net"
					hover-class="otd-hover"
					@click="toggleOtd(x.id)"
				>
					<image v-if="x.img" class="otd-img" :src="x.img" mode="aspectFill" lazy-load></image>
					<view v-else class="otd-img otd-ph"><text>🚀</text></view>

					<view class="otd-body">
						<text class="otd-year">{{ x.yearsAgo }} 年前的今天</text>
						<text class="otd-name">{{ x.title }}</text>
						<text class="otd-meta" v-if="x.meta">{{ x.meta }}</text>
						<!-- 点开补一句现场信息。不做跳转：这些任务在「已发射」快照里早已滚出去，
						     跳详情页只会拿到「未找到」 -->
						<text class="otd-more" v-if="expanded === x.id">{{ x.more }}</text>
						<text class="otd-hint" v-else>展开详情 ›</text>
					</view>
				</view>
			</view>

			<!-- 四块都没数据（冷启动 + 全挂了）：给一句人话，别留空白页 -->
			<view class="empty" v-if="!daily && !inSpace.length && !next && !otd.length">
				<text class="empty-icon">🛰️</text>
				<text class="empty-text">{{ loading ? '正在拉取今日数据...' : '今天的数据还没准备好' }}</text>
				<view class="btn" v-if="!loading" @click="reload">重新加载</view>
			</view>
		</block>
	</view>
</template>

<script>
/**
 * 今日（启动页）
 *
 * 四块固定内容，按「看图 → 看人 → 看下次 → 看历史」的顺序排：
 *   每日一图      图库聚合按日确定性挑一张
 *   此刻在天上     宇航员库 in_space 筛选
 *   下次发射       upcoming 里第一条还没发射的 + 金色倒计时
 *   往年今日      CI 每天按「月-日」筛好的历史发射
 *
 * 四块各自独立加载，任何一块失败只影响自己 —— 首页不能因为
 * 某个数据集 404 就整页白掉。
 */
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
import { formatDateTime } from '@/utils/format.js'
import { fullImageOf } from '@/utils/media.js'
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
			today: '',
			gallery: [],
			astronauts: [],
			upcoming: [],
			onthisday: [],
			// 往年今日是否展开（默认折叠到 OTD_FOLD 条）
			otdOpen: false,
			// 模板要读这个常量，挂到 data 上（options API 的模板访问不到模块作用域）
			OTD_FOLD,
			// 往年今日展开了哪一条（存 id，点同一条收起）
			expanded: '',
			// 倒计时组件的 net 需要「未来」的那条，用时钟兜住页面长时间不动的场景
			nowTick: Date.now()
		}
	},

	computed: {
		// 每日一图：日序号取模。gallery 按 net 倒序，取模后分布是均匀的
		daily() {
			if (!this.gallery.length) return null
			const idx = this.daySeed() % this.gallery.length
			return this.gallery[idx]
		},

		// 优先 2000px 原图（卡片铺满整行，480px 会糊），加载失败回退缩略图
		dailySrc() {
			if (!this.daily) return ''
			const thumb = this.daily.thumb || ''
			if (this.imgBroken) return thumb
			return fullImageOf(thumb) || thumb
		},

		dailyMeta() {
			const d = this.daily
			if (!d) return ''
			const when = formatDateTime(d.net)
			return [d.cname, when].filter(Boolean).join(' · ')
		},

		inSpace() {
			return this.astronauts
				.filter((a) => a && a.inSpace)
				.sort((a, b) => (b.days || 0) - (a.days || 0))
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
				// 展开后那句：精确时间 + 发射场 + 结果
				const when = formatDateTime(x.net)
				const result = x.status === 'Success' ? '成功' : x.status === 'Failure' ? '失败' : ''
				const more = [when && when + ' 发射', x.site, result].filter(Boolean).join(' · ')
				return {
					// 统一成字符串：LL2 的 id 是 uuid，但个别旧分片是数字，
					// 展开态用 === 比较，类型不一致会点不开
					id: String(x.id || x.net || ''),
					net: x.net,
					img: x.img,
					title,
					meta,
					more: more || meta,
					yearsAgo: Math.max(1, thisYear - (x.y || thisYear))
				}
			})
		},

		// 实际渲染的往年今日：折叠态只给前三条
		otdShown() {
			return this.otdOpen ? this.otd : this.otd.slice(0, OTD_FOLD)
		}
	},

	onLoad() {
		this.today = todayText()

		getConfig().then((c) => {
			this.reviewMode = Boolean(c && c.review)
			if (!this.reviewMode) this.loadAll()
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
		this.loadAll(true).then(() => uni.stopPullDownRefresh())
	},

	methods: {
		daySeed() {
			return Math.floor((Date.now() + BJ_OFFSET) / 86400000)
		},

		/**
		 * 四块并行加载，各自 catch。
		 * 用 allSettled 的语义：一块失败不能让其他三块陪葬
		 */
		async loadAll(force) {
			this.loading = true

			const [g, a, u, o] = await Promise.all([
				spaceData.load('gallery', { force: !!force }).catch(() => null),
				spaceData.load('astronauts').catch(() => null),
				// 待发射列表本身有 15 分钟缓存，下拉时才强制刷
				spaceData.load('upcoming', { force: !!force }).catch(() => null),
				spaceData.load('onthisday', { force: !!force }).catch(() => null)
			])

			if (g) this.gallery = (g.list || []).filter((x) => x && x.thumb)
			if (a) this.astronauts = a.list || []
			if (u) this.upcoming = u.list || []
			if (o) this.onthisday = o.list || []

			this.loading = false
		},

		reload() {
			this.loadAll(true)
		},

		previewDaily() {
			if (!this.daily) return
			const full = fullImageOf(this.daily.thumb) || this.daily.thumb
			uni.previewImage({ urls: [full], current: full })
		},

		goAstronaut(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/astronaut/astronaut?id=' + id })
		},

		toggleOtd(id) {
			const key = String(id || '')
			this.expanded = this.expanded === key ? '' : key
		},

		toggleOtdOpen() {
			this.otdOpen = !this.otdOpen
		},

		// 发射页是 tab 页，只能用 switchTab（navigateTo 会直接失败）
		goFeed() {
			uni.switchTab({ url: '/pages/index/index' })
		},

		goLaunch(id) {
			if (!id) return
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + id })
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

.sec-title {
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	letter-spacing: 1rpx;
}

.sec-sub {
	margin-left: 12rpx;
	color: #6b7891;
	font-size: 22rpx;
}

/* 区块头右侧的折叠入口：margin-left:auto 靠右，
   不改 sec-head 的 justify-content（「此刻在天上」那两个元素不能分开） */
.sec-more {
	display: flex;
	align-items: center;
	margin-left: auto;
	padding: 4rpx 0 4rpx 16rpx;
}

.sec-more-hover {
	opacity: 0.6;
}

.sec-more-text {
	color: #38bdf8;
	font-size: 23rpx;
}

/* 固定成正方形小盒再居中：› 这个字形本身在字盒里偏下，
   直接旋转 90° 会连偏移一起转过去，看着歪 */
.sec-more-arrow {
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

/* 展开时同一个 chevron 转 90° 朝下，不用再画一个箭头 */
.sec-more-arrow.is-open {
	transform: rotate(90deg);
}

/* ---- 1 每日一图 ---- */
.daily {
	position: relative;
	height: 500rpx;
	margin-top: 16rpx;
	margin-bottom: 30rpx;
	border-radius: 24rpx;
	overflow: hidden;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.07);
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

/* ---- 2 此刻在天上 ---- */
.inspace {
	margin-bottom: 30rpx;
}

.inspace-scroll {
	width: 100%;
	white-space: nowrap;
}

.inspace-row {
	display: flex;
}

.acard {
	flex-shrink: 0;
	width: 168rpx;
	margin-right: 16rpx;
	padding: 14rpx 14rpx 18rpx;
	border-radius: 20rpx;
	background: #141a26;
	border: 1rpx solid rgba(255, 255, 255, 0.07);
	box-sizing: border-box;
}

.acard-hover {
	background: #1b2231;
}

.acard-img {
	width: 140rpx;
	height: 140rpx;
	border-radius: 16rpx;
	display: block;
	background: #1b2231;
}

.acard-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 40rpx;
}

.acard-name {
	display: -webkit-box;
	/* 外文长名（Aleksandr Gorbunov / Pyotr Dubrov）一行放不下，
	   截成「Pyotr Dub…」比折行更难看，所以给两行；高度固定保证卡片对齐 */
	height: 58rpx;
	margin-top: 12rpx;
	color: #ffffff;
	font-size: 22rpx;
	font-weight: 500;
	line-height: 29rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	white-space: normal;
}

.acard-days {
	display: block;
	margin-top: 4rpx;
	color: #38bdf8;
	font-size: 21rpx;
}

/* ---- 3 下次发射 ---- */
.next-wrap {
	margin-bottom: 30rpx;
}

/* 卡片下面那行出口：靠右，天蓝色，和卡内「查看详情 ›」是同一套视觉语言 */
.more-row {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	margin-top: 10rpx;
	padding: 8rpx 4rpx;
}

.more-hover {
	opacity: 0.6;
}

.more-text {
	color: #38bdf8;
	font-size: 23rpx;
}

/* 用 » （右双角引号）而不是连写两个 ›：
   两个 chevron 中间自带一段字距，收 letter-spacing 也收不干净，看着像散开 */
.more-arrow {
	margin-left: 6rpx;
	color: #38bdf8;
	font-size: 23rpx;
	line-height: 1;
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

/* 展开后的补充行与提示：淡蓝，和上两行灰字区分开，但都不抢「N 年前的今天」 */
.otd-more {
	display: block;
	margin-top: 8rpx;
	color: #7dd3fc;
	font-size: 21rpx;
	line-height: 1.4;
}

.otd-hint {
	display: block;
	margin-top: 6rpx;
	color: #4d5a6e;
	font-size: 20rpx;
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
