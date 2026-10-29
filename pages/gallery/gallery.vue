<template>
	<view class="page">
		<!-- 满屏漂流墙：不留导航条，图从屏幕最上沿开始，四面渐隐融进背景 -->
		<view class="stage" v-if="!loading && rowsA.length">
			<view class="bands">
				<view class="band">
					<view class="track t1">
						<view class="cell wide" v-for="(img, i) in row1" :key="'a' + i" @click="preview(0, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t2">
						<view class="cell tall" v-for="(img, i) in row2" :key="'b' + i" @click="preview(1, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t3">
						<view class="cell wide" v-for="(img, i) in row3" :key="'c' + i" @click="preview(2, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t4">
						<view class="cell tall" v-for="(img, i) in row4" :key="'d' + i" @click="preview(3, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t5">
						<view class="cell wide" v-for="(img, i) in row5" :key="'e' + i" @click="preview(4, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band">
					<view class="track t6">
						<view class="cell tall" v-for="(img, i) in row6" :key="'f' + i" @click="preview(5, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>
			</view>

			<!-- 四面渐隐：左右让图淡入淡出，上下把墙压进背景，不给硬边 -->
			<view class="fade top"></view>
			<view class="fade bottom"></view>
			<view class="fade left"></view>
			<view class="fade right"></view>
		</view>

		<!-- HUD：不叫标题，只贴一行极轻的标识，不占任何布局高度 -->
		<view class="hud" :style="{ top: statusBarH + 12 + 'px' }">
			<view class="hud-row">
				<view class="hud-dot"></view>
				<text class="hud-kicker">SPACE GALLERY</text>
				<text class="hud-sep">/</text>
				<text class="hud-count">{{ total }} 张</text>
			</view>
			<view class="hud-line"></view>
		</view>

		<!-- 墙的注解：紧贴图片墙下方，只说明怎么用，不掺别的入口 -->
		<text class="wall-tip" v-if="!loading && rowsA.length">点任意一张看大图</text>

		<!-- 独立入口：和注解分开，各占一行 -->
		<view class="dock" v-if="!loading && rowsA.length">
			<view class="all-btn" hover-class="all-btn-hover" @click="goAll">
				<text class="all-text">看全部</text>
				<text class="all-num">{{ total }}</text>
				<text class="all-arrow">›</text>
			</view>
		</view>

		<view class="loading" v-if="loading">
			<text class="hint-text">加载中...</text>
		</view>

		<view class="empty-box" v-else-if="!images.length">
			<text class="empty-icon">🛰️</text>
			<text class="empty-text">还没有图片</text>
			<text class="empty-sub">历史图片正在由后台逐批补齐，过几个小时再来看看</text>
		</view>
	</view>
</template>

<script>
/**
 * 图库
 *
 * 交互只有一件事：看着它们慢慢飘，喜欢就点开看大图。
 * 墙里的图来自四类：发射图片 + 今日地球 + 天文 + 星云，混在一起随机打散，
 * 所以每次进来看到的都不一样；底部 dock 只留一个「看全部」进分类浏览器。
 * 漂流墙里不塞视频卡：视频是另一种浏览节奏，混进来会打断「一扇窗」的沉浸感。
 *
 * 为什么每行只放 12 张再复制一份：
 *   无缝循环靠 track 复制内容 + translateX(-50%)。如果 800 张全塞进去，
 *   首屏要渲染 1600 个 image 节点，滑动直接卡死。12 × 4 行 = 48 张原图
 *   （渲染 96 个节点）已经能把屏幕铺满，看起来是「看不完的墙」。
 *
 * 为什么是 4 行而不是 3 行：三行 132px 高的大图铺不满一屏，上下各留一大块空白，
 * 看着像「三个相框」而不是「墙」。4 行、行高交替，才真的密不透风。
 *
 * 为什么不要标题：这一页要的是「一扇窗」而不是「一个列表页」，
 * 顶部只留一行 HUD 标识（不占布局），墙面从状态栏下一直铺到底部 tabBar。
 */
import spaceData from '@/utils/data.js'
import { syncTabBar } from '@/utils/tabbar.js'
import navMixin from '@/utils/nav-mixin.js'

// 每行取多少张（复制后翻倍就是这个数 ×2 的节点数）
const PER_ROW = 12
// 行数：6 行（3 宽 3 窄）才真的铺满一屏。
// 之前 4 行只有约 400px，屏幕下半截空出一大块，提示被迫浮在空白里。
const ROWS = 6

/** Fisher-Yates 洗牌。图池近千张，每次进图库都重新打散，看到的墙不重样 */
function shuffle(arr) {
	const a = arr.slice()
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const t = a[i]
		a[i] = a[j]
		a[j] = t
	}
	return a
}

export default {
	mixins: [navMixin],

	data() {
		return {
			loading: true,
			images: [],
			// 四类图片合计张数（发射图 + 今日地球 + 天文 + 星云），底部「看全部」用它。
			// 和 images.length 不是一回事：images 是实际拉到的图池，不是全量
			total: 0,
			// 各行原始图（渲染时再拼一份副本）
			raw: [[], [], [], [], [], []]
		}
	},

	computed: {
		// concat 副本：x + x 后动画走 -50% 正好回到起点，看不出接缝
		row1() {
			return this.raw[0].concat(this.raw[0])
		},
		row2() {
			return this.raw[1].concat(this.raw[1])
		},
		row3() {
			return this.raw[2].concat(this.raw[2])
		},
		row4() {
			return this.raw[3].concat(this.raw[3])
		},
		row5() {
			return this.raw[4].concat(this.raw[4])
		},
		row6() {
			return this.raw[5].concat(this.raw[5])
		},
		// 模板里判断有没有内容，随便挑一行看
		rowsA() {
			return this.raw[0]
		}
	},

	onShow() {
		syncTabBar(2)
	},

	async onLoad() {
		// 四类图片混着飘才有「所有图片」的意思：发射图 + 今日地球 + 天文 + 星云。
		// 并行拉，任一类失败都不影响其它类出图
		const [g, ep, ap, ns] = await Promise.all([
			spaceData.load('gallery').catch(() => null),
			spaceData.load('epic').catch(() => null),
			spaceData.load('apod').catch(() => null),
			spaceData.load('nasaImages').catch(() => null)
		])

		const pool = []
		const push = (x, title) => {
			if (!x) return
			const thumb = x.thumb || x.full
			if (!thumb) return
			pool.push({
				thumb,
				full: x.full || thumb,
				title: title || x.titleZh || x.title || ''
			})
		}
		for (const x of (g && g.list) || []) push(x)
		for (const x of (ep && ep.list) || []) push(x, '地球 · DSCOVR')
		for (const x of (ap && ap.list) || []) push(x)
		for (const x of (ns && ns.list) || []) push(x)

		this.images = pool
		// 「看全部」显示的是四类合计：gallery 只加载了第一片，
		// 用它自己的 count 才是真实全量
		this.total =
			((g && g.count) || ((g && g.list) || []).length) +
			((ep && ep.count) || ((ep && ep.list) || []).length) +
			((ap && ap.count) || ((ap && ap.list) || []).length) +
			((ns && ns.count) || ((ns && ns.list) || []).length)

		// 随机取满一屏的用量：每次进图库看到的墙都不一样
		const picked = shuffle(pool).slice(0, PER_ROW * ROWS)

		// 各行交错分配：i % ROWS，这样相近来源的图不会挤在同一行
		const buckets = [[], [], [], [], [], []]
		picked.forEach((x, i) => {
			buckets[i % ROWS].push(x)
		})
		this.raw = buckets

		this.loading = false
	},

	methods: {
		goAll() {
			uni.navigateTo({ url: '/pages/gallery-all/gallery-all' })
		},

		/**
		 * 点开看大图。传进来的是「复制后」数组的下标，对行长度取模还原成真实位置。
		 *
		 * 墙里混了四类图片，点哪张都只做一件事：把整行当相册交出去，
		 * 左右滑继续看同一行。发射图原本能点进详情，但那要求每张卡记住自己的类型，
		 * 混排之后点不同图跳不同地方反而更困惑 —— 这一页的定位就是「看图」。
		 */
		preview(row, i) {
			const list = this.raw[row]
			if (!list.length) return

			const at = i % list.length
			const item = list[at]
			if (!item) return

			const urls = list.map((x) => x.full || x.thumb)
			uni.previewImage({ urls, current: item.full || item.thumb })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	position: relative;
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	/* 底部给悬浮胶囊 tabBar 让位 */
	padding-bottom: 200rpx;
	box-sizing: border-box;
	overflow: hidden;
	/* 冷色光晕压在黑底上：画面之外还有一层空间，而不是纯黑边框 */
	background: radial-gradient(120% 50% at 50% 0%, rgba(56, 189, 248, 0.14) 0%, rgba(56, 189, 248, 0) 62%),
		radial-gradient(90% 45% at 0% 100%, rgba(88, 120, 255, 0.1) 0%, rgba(88, 120, 255, 0) 60%),
		#070b12;
}

/* 墙面铺满剩余高度，不再上下居中留空 */
.stage {
	position: relative;
	flex: 1;
	overflow: hidden;
	display: flex;
	align-items: center;
}

.bands {
	width: 100%;
	padding: 0;
}

.band {
	overflow: hidden;
	margin-bottom: 8rpx;
}

.band:last-child {
	margin-bottom: 0;
}

.track {
	display: inline-flex;
	/* max-content 不认的老内核靠 inline-flex 的 shrink-to-fit 兜底，
	   两种写法都能让 track 宽度 = 内容宽度，动画的 -50% 才有意义 */
	width: max-content;
	will-change: transform;
}

/* 四行速度与方向都错开：同一速度会像一整块在平移，不像各自漂流 */
.t1 {
	animation: marqueeL 52s linear infinite;
}

.t2 {
	animation: marqueeR 44s linear infinite;
}

.t3 {
	animation: marqueeL 62s linear infinite;
}

.t4 {
	animation: marqueeR 48s linear infinite;
}

.t5 {
	animation: marqueeL 56s linear infinite;
}

.t6 {
	animation: marqueeR 40s linear infinite;
}

@keyframes marqueeL {
	from {
		transform: translateX(0);
	}
	to {
		transform: translateX(-50%);
	}
}

@keyframes marqueeR {
	from {
		transform: translateX(-50%);
	}
	to {
		transform: translateX(0);
	}
}

.cell {
	position: relative;
	flex-shrink: 0;
	margin-right: 8rpx;
	border-radius: 14rpx;
	overflow: hidden;
	background: #101722;
	/* 极细内描边：每格在深色墙上有一点轮廓，不至于糊成一团 */
	box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.05);
}

/* 行高与行宽的差异刻意拉大：四行节奏分明，才不会像四根等宽的带子 */
.wide {
	width: 336rpx;
	height: 232rpx;
}

.tall {
	width: 232rpx;
	height: 164rpx;
}

.cell-img {
	display: block;
	width: 100%;
	height: 100%;
	/* 逐张错峰淡入 + 轻微推近：开局不是「啪」地铺满，而是墙慢慢显影 */
	animation: cellIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes cellIn {
	from {
		opacity: 0;
		transform: scale(1.06);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

/* 每格底部压一点暗：墙面整体更沉，也压住亮图的刺眼感 */
.cell-veil {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 46%;
	background: linear-gradient(to top, rgba(4, 8, 14, 0.34) 0%, rgba(4, 8, 14, 0) 100%);
	pointer-events: none;
}

/* ---- 四面渐隐 ---- */
.fade {
	position: absolute;
	z-index: 5;
	pointer-events: none;
}

/* 顶部压得最重：状态栏的时间和电量要能看清 */
.fade.top {
	left: 0;
	right: 0;
	top: 0;
	height: 26%;
	background: linear-gradient(to bottom, rgba(7, 11, 18, 0.94) 0%, rgba(7, 11, 18, 0.5) 48%, rgba(7, 11, 18, 0) 100%);
}

.fade.bottom {
	left: 0;
	right: 0;
	bottom: 0;
	height: 34%;
	background: linear-gradient(to top, rgba(7, 11, 18, 0.98) 0%, rgba(7, 11, 18, 0.6) 42%, rgba(7, 11, 18, 0) 100%);
}

/* 左右各 90rpx 刚好盖住一格的三分之一，看得到「有图进来」但读不出细节 */
.fade.left {
	top: 0;
	bottom: 0;
	left: 0;
	width: 90rpx;
	background: linear-gradient(to right, rgba(7, 11, 18, 0.92) 0%, rgba(7, 11, 18, 0) 100%);
}

.fade.right {
	top: 0;
	bottom: 0;
	right: 0;
	width: 90rpx;
	background: linear-gradient(to left, rgba(7, 11, 18, 0.92) 0%, rgba(7, 11, 18, 0) 100%);
}

/* ---- HUD：不占布局的顶部标识 ---- */
.hud {
	position: fixed;
	left: 32rpx;
	z-index: 20;
	pointer-events: none;
}

.hud-row {
	display: flex;
	align-items: center;
}

.hud-dot {
	width: 10rpx;
	height: 10rpx;
	margin-right: 12rpx;
	border-radius: 50%;
	background: #38bdf8;
	box-shadow: 0 0 14rpx rgba(56, 189, 248, 0.9);
}

.hud-kicker {
	color: #e2eefb;
	font-size: 21rpx;
	font-weight: 600;
	letter-spacing: 4rpx;
}

.hud-sep {
	margin: 0 12rpx;
	color: #36435a;
	font-size: 18rpx;
}

.hud-count {
	color: #8fa3bd;
	font-size: 20rpx;
}

/* HUD 下的一道青色细光：给标识一个落点，不至于飘在图上 */
.hud-line {
	margin-top: 10rpx;
	width: 120rpx;
	height: 2rpx;
	background: linear-gradient(90deg, rgba(56, 189, 248, 0.9) 0%, rgba(56, 189, 248, 0) 100%);
}

/* ---- 底部悬浮入口 ---- */
/* 墙的注解：紧贴墙面的一条说明，轻呼吸，不抢画面 */
.wall-tip {
	flex-shrink: 0;
	padding: 22rpx 0 0;
	text-align: center;
	color: rgba(200, 214, 232, 0.6);
	font-size: 21rpx;
	letter-spacing: 1rpx;
	animation: tipBreath 3.4s ease-in-out infinite;
}

/* 独立入口行 */
.dock {
	flex-shrink: 0;
	display: flex;
	justify-content: center;
	padding: 22rpx 0 0;
}

@keyframes tipBreath {
	0%,
	100% {
		opacity: 0.5;
	}
	50% {
		opacity: 0.95;
	}
}

.all-btn {
	display: flex;
	align-items: center;
	padding: 16rpx 32rpx;
	border-radius: 999rpx;
	background: rgba(10, 16, 26, 0.55);
	border: 1rpx solid rgba(56, 189, 248, 0.34);
	-webkit-backdrop-filter: blur(24rpx) saturate(150%);
	backdrop-filter: blur(24rpx) saturate(150%);
	box-shadow: 0 14rpx 40rpx rgba(0, 0, 0, 0.5), 0 0 32rpx rgba(56, 189, 248, 0.14);
	pointer-events: auto;
}

.all-btn-hover {
	background: rgba(18, 30, 46, 0.7);
}

.all-text {
	color: #cfe6ff;
	font-size: 24rpx;
	letter-spacing: 1rpx;
}

.all-num {
	margin-left: 10rpx;
	color: #38bdf8;
	font-size: 25rpx;
	font-weight: 600;
}

.all-arrow {
	margin-left: 10rpx;
	color: #38bdf8;
	font-size: 30rpx;
	line-height: 1;
}

/* ---- 空态 / 加载 ---- */
.loading {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
}

/* .hint-text 原来来自 styles/list.scss，这一页不再引入那份公共样式
   （瀑布流整套都用不上了），单独补一条 */
.hint-text {
	color: #6b7891;
	font-size: 26rpx;
}

.empty-box {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 0 60rpx;
}

.empty-icon {
	font-size: 60rpx;
	margin-bottom: 16rpx;
}

.empty-text {
	color: #8b95a8;
	font-size: 26rpx;
}

.empty-sub {
	margin-top: 10rpx;
	color: #4d5a6e;
	font-size: 22rpx;
	text-align: center;
	line-height: 1.6;
}
</style>
