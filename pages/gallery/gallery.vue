<template>
	<view class="page">
		<!-- 满屏漂流墙：不留导航条，图从屏幕最上沿开始，四面渐隐融进背景 -->
		<view class="stage" v-if="!loading && rowsA.length">
			<view class="bands">
				<view class="band band-w">
					<view class="track t1">
						<view class="cell wide" v-for="(img, i) in row1" :key="'a' + i" @click="preview(0, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-t">
					<view class="track t2">
						<view class="cell tall" v-for="(img, i) in row2" :key="'b' + i" @click="preview(1, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-w">
					<view class="track t3">
						<view class="cell wide" v-for="(img, i) in row3" :key="'c' + i" @click="preview(2, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-t">
					<view class="track t4">
						<view class="cell tall" v-for="(img, i) in row4" :key="'d' + i" @click="preview(3, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-w">
					<view class="track t5">
						<view class="cell wide" v-for="(img, i) in row5" :key="'e' + i" @click="preview(4, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-t">
					<view class="track t6">
						<view class="cell tall" v-for="(img, i) in row6" :key="'f' + i" @click="preview(5, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-w">
					<view class="track t7">
						<view class="cell wide" v-for="(img, i) in row7" :key="'g' + i" @click="preview(6, i)">
							<image class="cell-img" :src="img.thumb" mode="aspectFill" :style="{ animationDelay: (i % 12) * 45 + 'ms' }"></image>
							<view class="cell-veil"></view>
						</view>
					</view>
				</view>

				<view class="band band-t">
					<view class="track t8">
						<view class="cell tall" v-for="(img, i) in row8" :key="'h' + i" @click="preview(7, i)">
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
		<text class="wall-tip" v-if="!loading && rowsA.length">点任意一张看详情</text>

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
 * 交互只有一件事：看着它们慢慢飘，喜欢就点开。
 * 墙里的图来自四类：发射图片 + 今日地球 + 天文 + 星云，混在一起随机打散，
 * 所以每次进来看到的都不一样；底部 dock 只留一个「看全部」进分类浏览器。
 * 点开按类型分流：发射图回发射详情的图片优先态，其余三类直接进系统看图器。
 * 漂流墙里不塞视频卡：视频是另一种浏览节奏，混进来会打断「一扇窗」的沉浸感。
 *
 * 为什么每行只放 12 张再复制一份：
 *   无缝循环靠 track 复制内容 + translateX(-50%)。如果 800 张全塞进去，
 *   首屏要渲染 1600 个 image 节点，滑动直接卡死。12 × 8 行 = 96 张原图
 *   （渲染 192 个节点）已经能把屏幕铺满，看起来是「看不完的墙」。
 *
 * 为什么是 8 行：行数少了只能靠 flex 把每行拉高来填满整屏，单行一高图就裁得狠；
 *   8 行宽窄交替，每行高度接近原始设计值，铺满的同时露出更多画面。
 *
 * 为什么不要标题：这一页要的是「一扇窗」而不是「一个列表页」，
 * 顶部只留一行 HUD 标识（不占布局），墙面从状态栏下一直铺到底部 tabBar。
 */
import spaceData from '@/utils/data.js'
import { setAlbum } from '@/utils/album.js'
import { syncTabBar } from '@/utils/tabbar.js'
import navMixin from '@/utils/nav-mixin.js'

// 每行取多少张（复制后翻倍就是这个数 ×2 的节点数）
const PER_ROW = 12
// 行数：8 行（4 宽 4 窄）。
// 6 行时靠 flex 拉伸才铺满整屏，宽行被拉到约 309rpx（原设计 232rpx），
// 图裁得偏狠；8 行后每行回到接近原始高度，同样铺满但露出的画面更多。
const ROWS = 8

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
			raw: Array.from({ length: ROWS }, () => [])
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
		row7() {
			return this.raw[6].concat(this.raw[6])
		},
		row8() {
			return this.raw[7].concat(this.raw[7])
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
		const counts = { launch: 0, earth: 0, astro: 0, nasa: 0 }
		const sum = () => counts.launch + counts.earth + counts.astro + counts.nasa
		// 每日类数据集（apod/epic/nasaImages）会自己后台校验，拿到新数据就把总数改过来，
		// 否则会出现「按钮显示 647 张、线上其实已经 933 张」这种落差
		const onFresh = (key, d) => {
			counts[key] = (d && d.count) || ((d && d.list) || []).length
			this.total = sum()
		}

		// 兜底超时：单个数据集最多等这么久，超时就当它没有，先把墙铺出来。
		// 四个并发最坏会连着等满 8 秒的请求超时，页面就一直转「加载中」——
		// 少几类图下次进来就有，总比白屏干等好
		const within = (p, ms) => {
			return Promise.race([
				p,
				new Promise((resolve) => setTimeout(() => resolve(null), ms))
			])
		}

		const [g, ep, ap, ns] = await Promise.all([
			// 墙的主体是发射图，给多一点时间；其余三类是锦上添花
			within(spaceData.load('gallery').catch(() => null), 5000),
			within(spaceData.load('epic', { onUpdate: (d) => onFresh('earth', d) }).catch(() => null), 3500),
			within(spaceData.load('apod', { onUpdate: (d) => onFresh('astro', d) }).catch(() => null), 3500),
			within(spaceData.load('nasaImages', { onUpdate: (d) => onFresh('nasa', d) }).catch(() => null), 3500)
		])

		const pool = []
		// kind 决定点开去哪：launch（发射图）有 id/net，回发射详情的图片优先态；
		// photo（其余三类）进图片详情页，和「看全部」里点图完全一样
		const add = (arr, make) => {
			for (const x of arr || []) {
				const it = make(x)
				if (it && it.thumb) pool.push(it)
			}
		}

		add(g && g.list, (x) => {
			const thumb = x && (x.thumb || x.full)
			if (!thumb) return null
			return {
				thumb,
				full: x.full || thumb,
				title: x.name || '',
				kind: 'launch',
				tag: '',
				date: '',
				intro: '',
				credit: '',
				id: x.id || '',
				net: x.net || ''
			}
		})

		add(ep && ep.list, (x) => {
			const thumb = x && (x.thumb || x.full)
			if (!thumb) return null
			return {
				thumb,
				full: x.full || thumb,
				title: '地球 · DSCOVR',
				kind: 'photo',
				tag: '今日地球',
				date: (x.date || '').slice(0, 10),
				intro: x.captionZh || x.caption || '',
				credit: 'NASA EPIC',
				id: '',
				net: ''
			}
		})

		add(ap && ap.list, (x) => {
			const thumb = x && (x.thumb || x.full)
			if (!thumb) return null
			return {
				thumb,
				full: x.full || thumb,
				title: x.titleZh || x.title || '',
				kind: 'photo',
				tag: '每日天文',
				date: (x.date || '').slice(0, 10),
				intro: x.explanationZh || x.explanation || '',
				credit: x.credit || '',
				id: '',
				net: ''
			}
		})

		add(ns && ns.list, (x) => {
			const thumb = x && (x.thumb || x.full)
			if (!thumb) return null
			return {
				thumb,
				full: x.full || thumb,
				title: x.titleZh || x.title || '',
				kind: 'photo',
				tag: '星云',
				date: (x.date || '').slice(0, 10),
				intro: x.descZh || x.desc || '',
				credit: x.center || '',
				id: '',
				net: ''
			}
		})

		this.images = pool
		// 「看全部」显示的是四类合计：gallery 只加载了第一片，
		// 用它自己的 count 才是真实全量。这里先把基准数记进 counts，
		// 之后哪一类后台刷到新数据，onFresh 就只会改那一项再重算
		counts.launch = (g && g.count) || ((g && g.list) || []).length
		counts.earth = (ep && ep.count) || ((ep && ep.list) || []).length
		counts.astro = (ap && ap.count) || ((ap && ap.list) || []).length
		counts.nasa = (ns && ns.count) || ((ns && ns.list) || []).length
		this.total = sum()

		// 随机取满一屏的用量：每次进图库看到的墙都不一样
		const picked = shuffle(pool).slice(0, PER_ROW * ROWS)

		// 各行交错分配：i % ROWS，这样相近来源的图不会挤在同一行
		const buckets = Array.from({ length: ROWS }, () => [])
		picked.forEach((x, i) => {
			buckets[i % ROWS].push(x)
		})
		this.raw = buckets

		this.loading = false
	},

	// tab 页不能带参数；标题给图库总量，封面用墙上第一张缩略图
	onShareAppMessage() {
		const first = this.images[0] || {}
		return {
			title: this.galleryShareTitle(),
			path: '/pages/gallery/gallery',
			...(first.thumb ? { imageUrl: first.thumb } : {})
		}
	},

	onShareTimeline() {
		const first = this.images[0] || {}
		return {
			title: this.galleryShareTitle(),
			query: '',
			...(first.thumb ? { imageUrl: first.thumb } : {})
		}
	},

	methods: {
		galleryShareTitle() {
			const n = this.total || this.images.length
			return n ? '太空图库 · ' + n + ' 张发射与天文影像' : '太空图库'
		},

		goAll() {
			uni.navigateTo({ url: '/pages/gallery-all/gallery-all' })
		},

		/**
		 * 点开看详情。传进来的是「复制后」数组的下标，对行长度取模还原成真实位置。
		 *
		 * 两类都在同一个动作里：点图 → 进详情页，区别只是详情页不同。
		 *   - 发射图 → launchInfo 的图片优先态，底部可继续看这次发射；
		 *     相册只给同一行的其它发射图，避免滑到星云图却挂着发射的说明。
		 *   - 地球 / 天文 / 星云 → photo-detail（原图 + 标题 + 中文介绍），
		 *     和「看全部」里点图完全一致。介绍上千字，走 Storage 传，不塞 URL。
		 */
		preview(row, i) {
			const list = this.raw[row]
			if (!list.length) return

			const at = i % list.length
			const item = list[at]
			if (!item) return

			if (item.kind === 'launch' && item.id) {
				const shots = list.filter((x) => x.kind === 'launch' && x.id)
				const idx = shots.indexOf(item)
				setAlbum(shots, idx > 0 ? idx : 0, 'gallery')
				uni.navigateTo({
					url:
						'/pages/launch/launchInfo?id=' + item.id + '&photo=1' +
						(item.net ? '&net=' + encodeURIComponent(item.net) : '')
				})
				return
			}

			try {
				uni.setStorageSync('_photo_detail', {
					full: item.full || item.thumb,
					title: item.title || '',
					date: item.date || '',
					intro: item.intro || '',
					credit: item.credit || '',
					tag: item.tag || '图片详情'
				})
			} catch (e) {
				console.warn('[gallery] 详情数据暂存失败', e)
			}
			uni.navigateTo({ url: '/pages/photo-detail/photo-detail?from=gallery' })
		}
	}
}
</script>

<style lang="scss" scoped>
.page {
	position: relative;
	height: 100vh;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	overflow: hidden;
	/* 冷色光晕压在黑底上：画面之外还有一层空间，而不是纯黑边框 */
	background: radial-gradient(120% 50% at 50% 0%, rgba(56, 189, 248, 0.14) 0%, rgba(56, 189, 248, 0) 62%),
		radial-gradient(90% 45% at 0% 100%, rgba(88, 120, 255, 0.1) 0%, rgba(88, 120, 255, 0) 60%),
		#070b12;
}

/* 墙面铺满整个页面：从屏幕最上沿一直到最下沿（含悬浮胶囊 tabBar 后面），
   提示与按钮改为浮在墙上，所以这里不再给底部让位 */
.stage {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	overflow: hidden;
	display: flex;
	align-items: stretch;
	z-index: 0;
}

.bands {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
}

.band {
	overflow: hidden;
	margin-bottom: 8rpx;
	min-height: 0;
	/* 高度不再写死，按原来的 232:164 比例把整屏高度分给六条 */
	flex: 232 1 0%;
}

/* 窄行：与宽行的高度比沿用原始值，六条铺满后仍保持疏密节奏 */
.band-t {
	flex: 164 1 0%;
}

.band:last-child {
	margin-bottom: 0;
}

.track {
	display: inline-flex;
	/* max-content 不认的老内核靠 inline-flex 的 shrink-to-fit 兜底，
	   两种写法都能让 track 宽度 = 内容宽度，动画的 -50% 才有意义 */
	width: max-content;
	/* 撑满所属行的高度，格子才能跟着整屏伸缩 */
	height: 100%;
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

.t7 {
	animation: marqueeL 58s linear infinite;
}

.t8 {
	animation: marqueeR 46s linear infinite;
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
/* 高度交给 flex 行高决定（整屏高度变化时自动伸缩），只固定宽度 */
.wide {
	width: 336rpx;
	height: 100%;
}

.tall {
	width: 232rpx;
	height: 100%;
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
/* 墙铺满整屏后，注解与入口都浮在图上，不再占布局高度 */
/* 墙的注解：紧贴墙面的一条说明，轻呼吸，不抢画面 */
.wall-tip {
	position: absolute;
	left: 0;
	right: 0;
	/* 悬浮胶囊 tabBar 高 112rpx + 上下留白，再让出按钮自身高度与间距 */
	bottom: 240rpx;
	bottom: calc(240rpx + constant(safe-area-inset-bottom));
	bottom: calc(240rpx + env(safe-area-inset-bottom));
	text-align: center;
	z-index: 2;
	/* 浮层不接管点击，让下方墙照常可点 */
	pointer-events: none;
	color: rgba(200, 214, 232, 0.6);
	font-size: 21rpx;
	letter-spacing: 1rpx;
	text-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.85);
	animation: tipBreath 3.4s ease-in-out infinite;
}

/* 独立入口行 */
.dock {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 152rpx;
	bottom: calc(152rpx + constant(safe-area-inset-bottom));
	bottom: calc(152rpx + env(safe-area-inset-bottom));
	display: flex;
	justify-content: center;
	z-index: 2;
	/* 整行是全宽的浮层，只有按钮本身接点击，其余交给下面的墙 */
	pointer-events: none;
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
