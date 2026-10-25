<template>
	<view class="pv" v-if="visible">
		<!-- 图片区：高度从整屏一路收缩到详情页首图的高度（660rpx）。
		     收缩的同时 picture 也从「完整显示」交叉到「满宽裁切」，
		     所以手指往上推时，看到的就是这张图自己变成了详情页的首图 -->
		<view
			class="pv-stage"
			:style="stageStyle"
			@touchstart="onTouchStart"
			@touchmove="onTouchMove"
			@touchend="onTouchEnd"
			@touchcancel="onTouchEnd"
		>
			<view
				class="pv-cell"
				v-for="i in cells"
				:key="i"
				:style="cellStyle(i)"
				@click="onStageTap"
			>
				<!-- 两层同一张图：fit 完整显示、fill 满宽裁切，随进度交叉 -->
				<image
					class="pv-img"
					:src="srcOf(list[i], i)"
					mode="aspectFit"
					:style="{ opacity: 1 - fillOpacity }"
					@error="markBroken(i)"
				></image>
				<image
					class="pv-img pv-img-fill"
					:src="srcOf(list[i], i)"
					mode="aspectFill"
					:style="{ opacity: fillOpacity }"
					@error="markBroken(i)"
				></image>
			</view>

			<view class="pv-empty" v-if="!curItem">
				<text class="pv-empty-text">图片加载失败</text>
			</view>

			<!-- 信息条：浮在图底，上拉时先它一步淡出。原来那条「上拉看详情」
			     的提示并进来，不再单独占一行 -->
			<view class="pv-bar" :style="{ opacity: barOpacity }">
				<view class="pv-bar-main">
					<text class="pv-title">{{ title }}</text>
					<text class="pv-meta" v-if="meta">{{ meta }}</text>
				</view>
				<view class="pv-hint">
					<text class="pv-hint-arrow">︿</text>
					<text class="pv-hint-text">上拉</text>
				</view>
			</view>

			<!-- 页码：多张才显示，单张（每日一图）不打扰 -->
			<view class="pv-count" v-if="list.length > 1 && sheetP < 0.05">
				<text class="pv-count-text">{{ cur + 1 }} / {{ list.length }}</text>
			</view>
		</view>

		<!-- 详情抽屉：里面就是 pages/launch/launchInfo 用的那个组件本身。
		     位移量是 (1-p) × (屏高 - 首图高)：抽屉顶部永远比图片区底边高出一个
		     首图的高度，那段被图片区压着，两层的图不会打架。p=1 时落到底，
		     图片区撤掉，抽屉里的首图正好接住 -->
		<view class="pv-sheet" :style="sheetStyle">
			<scroll-view class="pv-sheet-body" scroll-y>
				<launch-detail
					v-if="sheetOn"
					:id="sheetId"
					:net="sheetNet"
					:sheet="true"
					:cover="coverSrc"
				/>
			</scroll-view>
		</view>

		<!-- 抽屉里的退一层：浮在首图左上，和微信胶囊同一水平带。
		     必须放在抽屉外面 —— 图片区（z-index 6）压着抽屉（5），
		     放里面会被刚好处在首图位置的那块盖住 -->
		<view
			class="pv-back"
			v-if="sheetP > 0.9"
			:style="{ top: closeTop }"
			hover-class="pv-back-hover"
			@click="closeSheet"
		>‹</view>

		<!-- 关闭键放右上，与微信胶囊同一水平带，拇指够得到。
		     抽屉拉开后它让位给 ‹，否则会盖在详情首图上 -->
		<view
			class="pv-close"
			v-if="!sheetOpen"
			:style="{ top: closeTop }"
			hover-class="pv-close-hover"
			@click="close"
		>✕</view>
	</view>
</template>

<script>
/**
 * 图片大图弹层（每日一图 / 图库 / 全量图库共用）
 *
 * 为什么不用 uni.previewImage：系统看图只能左右滑，图上什么信息都没有 ——
 * 看完一张火箭特写，用户最想知道「这是哪次发射、什么火箭」，系统看图给不了。
 *
 * 两条手势：
 *   · 左右滑 —— 在同一个列表里翻图，不必退出再点
 *   · 上拉   —— 图片自己收缩成详情页的首图，下面把整条详情顶上来
 *
 * 上拉不是「盖一个面板上来」，而是做了一次形变：
 *   图片区高度    整屏  →  660rpx（详情页首图高度）
 *   图片本身      aspectFit 完整显示  →  aspectFill 满宽裁切（两层交叉）
 *   信息条        淡出
 *   详情抽屉      从底下升起，里面是 components/launch-detail 本身
 * 松手后抽屉落到底，图片区与抽屉里的首图位置、裁切完全一致，直接接管，
 * 于是「看完图往上推」和「从列表点进详情页」最终是同一个页面。
 *
 * 为什么不直接上 swiper：swiper 是原生组件，纵向的 touch 事件拿不到，
 * 上拉手势会和横滑抢。自己用 touch + transform 才能区分横纵方向。
 *
 * 横滑实现要点：渲染 cur-1 / cur / cur+1 三个 cell，绝对定位叠在一起，
 * 位移 = (i - cur) * 屏宽 + dx。松手切换时 cur 与 dx **同一帧**更新，
 * 新的一张位移从 +W 变成 0，落的正是手指松开时的位置 —— 所以看不出接缝，
 * 也不会像「重排数组」那样导致图片重新加载闪一下。
 *
 * 自定义 tabBar 是独立渲染层，页面里的 fixed 遮罩盖不住它，
 * 所以打开时要主动隐藏、关闭时恢复（见 utils/tabbar.js）。
 */
import { formatDateTime, rocketName } from '@/utils/format.js'
import { fullImageOf } from '@/utils/media.js'
import { setTabBarHidden } from '@/utils/tabbar.js'

// 判定「是横滑还是上拉」的最小位移，太小会把点击误判成滑动
const DIR_LOCK = 8
// 手指推满多少屏高算「完全展开」：留一点阻尼，不用真拉一整屏
const SHEET_TRAVEL = 0.55
// 松手时超过这个进度就补完剩下的行程
const SHEET_COMMIT = 0.3
// 详情页首图高度，必须与 launch-detail 里的 .hero 一致（那边是 660rpx）
const HERO_RPX = 660

export default {
	name: 'photo-view',

	props: {
		visible: { type: Boolean, default: false },
		// 可横滑的整组图（gallery 行：{ id, name, net, thumb, credit, cname }）
		list: { type: Array, default: () => [] },
		// 从哪一张开始
		index: { type: Number, default: 0 },
		// 状态栏高度（px），用来给关闭键与 ‹ 定位
		statusBarH: { type: Number, default: 20 }
	},

	emits: ['close'],

	data() {
		return {
			cur: 0,
			winW: 375,
			winH: 667,
			// 详情页首图高度（px），created 里按屏宽换算
			heroH: 330,
			// 横向跟手位移
			dx: 0,
			dragging: false,
			dir: '',
			startX: 0,
			startY: 0,
			// 纵向位移单独记：横滑用 dx，上拉用 dy，两者互不干扰
			dy: 0,
			moved: false,
			// 上一次手指离开的时刻：滑完手抬起时系统可能仍补一个 click，
			// 用它挡掉，否则滑一张就把弹层关了
			moveEndAt: 0,
			// 原图 404 的下标集合：退回缩略图，至少还能看到图
			broken: {},
			// 形变进度 0（纯看图）→ 1（详情页）
			sheetP: 0,
			// 跟手期间关掉过渡，否则每一帧都被 CSS 追一次，手感像果冻
			sheetFollow: false,
			// 详情组件只在真正拉开过之后才挂载：否则每滑一张图都会触发一次详情加载
			sheetOn: false
		}
	},

	computed: {
		curItem() {
			return this.list[this.cur] || null
		},

		// 只渲染相邻三张：多了浪费，少了滑动时会露白
		cells() {
			const n = this.list.length
			const out = []
			for (let i = this.cur - 1; i <= this.cur + 1; i++) {
				if (i >= 0 && i < n) out.push(i)
			}
			return out
		},

		title() {
			const raw = (this.curItem && this.curItem.name) || ''
			const parts = raw.split('|')
			return parts.length > 1 ? parts[1].trim() : raw
		},

		meta() {
			const it = this.curItem
			if (!it) return ''
			const rocket = rocketName({ name: it.cname })
			const when = formatDateTime(it.net)
			const credit = it.credit ? '@' + it.credit : ''
			return [rocket, when, credit].filter(Boolean).join(' · ')
		},

		closeTop() {
			return Math.max(12, this.statusBarH + 8) + 'px'
		},

		sheetId() {
			return this.curItem && this.curItem.id != null ? String(this.curItem.id) : ''
		},

		sheetNet() {
			return (this.curItem && this.curItem.net) || ''
		},

		// 抽屉里详情还在加载时，先用同一张图顶住首图位（srcOf 会走 _2000 版本），
		// 这样「上拉到位、图片区撤掉」的那一帧不会闪出空白
		coverSrc() {
			if (!this.curItem) return ''
			return this.srcOf(this.curItem, this.cur)
		},

		p() {
			return Math.max(0, Math.min(1, this.sheetP || 0))
		},

		// 抽屉开没开：只要露出一截就算开，✕ 就该让位
		sheetOpen() {
			return this.p > 0.02
		},

		// aspectFill 那一层的透明度：p 到 0.65 时完全交给裁切版
		fillOpacity() {
			return Math.min(1, Math.max(0, (this.p - 0.08) / 0.57))
		},

		// 信息条比图片更早退场，不然会跟着图一起被挤扁
		barOpacity() {
			return Math.max(0, 1 - this.p * 2.4)
		},

		// 图片区：整屏 → 首图高
		stageStyle() {
			const h = this.winH - this.p * (this.winH - this.heroH)
			const tr = this.sheetFollow ? 'none' : 'height .3s cubic-bezier(.2,.8,.3,1)'
			// 落到底之后把图片区撤掉，让详情页自己的首图接管（滚动才跟手）。
			// 抽屉里加载态用的就是同一张图、同一位置，所以撤掉这一帧看不出来
			const op = this.p >= 1 ? 0 : 1
			// 撤掉后不能再接手势，否则手指从首图上划过时详情页滚不动
			const pe = op === 0 ? 'none' : 'auto'
			return `height:${h}px;opacity:${op};pointer-events:${pe};transition:${tr},opacity .01s linear`
		},

		// 抽屉：顶部始终比图片区底边高出一个首图高
		sheetStyle() {
			const y = (1 - this.p) * (this.winH - this.heroH)
			const tr = this.sheetFollow ? 'none' : 'transform .3s cubic-bezier(.2,.8,.3,1)'
			return `transform:translateY(${y}px);transition:${tr}`
		}
	},

	watch: {
		visible(v) {
			if (v) {
				this.cur = Math.max(0, Math.min(this.index, this.list.length - 1))
				this.dx = 0
				this.dy = 0
				this.dragging = false
				this.dir = ''
				this.broken = {}
				this.sheetP = 0
				this.sheetFollow = false
				this.sheetOn = false
			}
			// 弹层盖不住自定义 tabBar，只能主动藏
			setTabBarHidden(v)
		},

		// 父页面换了一批图（图库换行、全量页追加）时跟上
		index(v) {
			if (!this.visible) return
			this.cur = Math.max(0, Math.min(Number(v) || 0, this.list.length - 1))
		}
	},

	created() {
		try {
			const info = uni.getSystemInfoSync()
			this.winW = info.windowWidth || 375
			this.winH = info.windowHeight || 667
			this.heroH = uni.upx2px(HERO_RPX) || 330
		} catch (e) {
			// 取不到就用 375×667、首图 330px，绝大多数机型在这个值附近
		}
	},

	beforeUnmount() {
		// 组件随页面销毁时把 tabBar 还原，否则页面上就永远没有底部导航了
		if (this.visible) setTabBarHidden(false)
	},

	methods: {
		close() {
			this.$emit('close')
		},

		srcOf(item, i) {
			if (!item) return ''
			const thumb = item.thumb || ''
			if (this.broken[i]) return thumb
			// COS 上同 hash 的 _2000 版本；还没补齐到的回退缩略图
			return fullImageOf(thumb) || thumb
		},

		markBroken(i) {
			if (this.broken[i]) return
			this.broken = Object.assign({}, this.broken, { [i]: true })
		},

		cellStyle(i) {
			const x = (i - this.cur) * this.winW + this.dx
			const tr = this.dragging ? 'none' : 'transform .26s cubic-bezier(.2,.8,.3,1)'
			return `width:${this.winW}px;left:0;transform:translateX(${x}px);transition:${tr}`
		},

		// ---- 手势 ----
		onTouchStart(e) {
			const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
			if (!t) return
			this.startX = t.clientX
			this.startY = t.clientY
			this.dx = 0
			this.dy = 0
			this.dir = ''
			this.moved = false
			this.dragging = true
		},

		onTouchMove(e) {
			const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
			if (!t) return

			const mx = t.clientX - this.startX
			const my = t.clientY - this.startY

			// 先定方向，定了就不再改：横滑途中手指总会有点上下偏移，
			// 每帧重判会让图片上下抖
			if (!this.dir) {
				if (Math.abs(mx) > Math.abs(my) && Math.abs(mx) > DIR_LOCK) this.dir = 'h'
				else if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > DIR_LOCK) this.dir = 'v'
				else return
			}

			this.moved = true

			if (this.dir === 'v') {
				this.dy = my
				// 完全展开后不再跟手，图片区已经撤了
				if (this.p < 1) {
					const travel = this.winH * SHEET_TRAVEL
					this.sheetFollow = true
					this.sheetP = Math.max(0, Math.min(1, -my / travel))
				}
				return
			}

			// 首尾越界给阻尼：手指还在动，但图几乎不动，一眼就知道到头了
			let x = mx
			if ((this.cur === 0 && mx > 0) || (this.cur >= this.list.length - 1 && mx < 0)) {
				x = mx * 0.28
			}
			this.dx = x
		},

		onTouchEnd() {
			const dx = this.dx
			const dir = this.dir
			const moved = this.moved

			this.dragging = false
			this.dir = ''
			if (moved) this.moveEndAt = Date.now()

			if (dir === 'v') {
				this.sheetFollow = false
				// 推到 30% 就补完剩下的行程，回弹也是同一套过渡
				if (this.p > SHEET_COMMIT) this.openSheet()
				else this.sheetP = 0
				this.dx = 0
				this.dy = 0
				return
			}

			if (!moved) {
				this.dx = 0
				return
			}

			const limit = this.winW * 0.2
			let target = this.cur

			if (dx <= -limit && this.cur < this.list.length - 1) target = this.cur + 1
			else if (dx >= limit && this.cur > 0) target = this.cur - 1

			if (target !== this.cur) {
				// 关键：cur 与 dx 必须同一帧改完。
				// 新图位移从 (target-cur)*W + dx 变成 0，正好接住手指松开的位置
				this.cur = target
				this.dx = 0
			} else {
				this.dx = 0
			}
		},

		onStageTap() {
			// 拖动结束后系统可能补一个 click，滑完一张就把弹层关了 —— 挡掉
			if (this.moveEndAt && Date.now() - this.moveEndAt < 400) return
			// 已经形变到详情页时，点图区不该退出：那是详情页的首图
			if (this.p > 0.02) return
			this.close()
		},

		// ---- 抽屉 ----
		openSheet() {
			if (!this.curItem) return
			this.sheetOn = true
			this.sheetFollow = false
			this.sheetP = 1
		},

		closeSheet() {
			this.sheetFollow = false
			this.sheetP = 0
			// 等收起动画走完再卸载，否则内容会先消失、抽屉空着往下退
			setTimeout(() => {
				if (this.sheetP === 0) this.sheetOn = false
			}, 320)
		}
	}
}
</script>

<style lang="scss" scoped>
.pv {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 900;
	/* 几乎全黑：看图时周围越暗越好，留一点透明度还能看出是浮层 */
	background: rgba(4, 6, 10, 0.97);
	overflow: hidden;
}

/* ---- 图片区：高度由 sheetP 驱动，从整屏收到首图高 ---- */
.pv-stage {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	overflow: hidden;
	/* 压在抽屉之上（5）：抽屉顶部那一段首图由这一层顶替，
	     两层的裁切一致，所以看不出是两张图。
	     p=1 时本层撤掉（opacity 0），抽屉里的真首图接上 */
	z-index: 6;
	/* 必须不透明：aspectFit 的上下黑边一旦透光，
	     就会看见下面抽屉里那张 aspectFill 的图 */
	background: #04060a;
}

.pv-cell {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	height: auto;
	will-change: transform;
}

.pv-img {
	width: 100%;
	height: 100%;
	display: block;
}

/* 满宽裁切那一层：叠在完整显示那一层上，随进度交叉 */
.pv-img-fill {
	position: absolute;
	left: 0;
	top: 0;
}

.pv-empty {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.pv-empty-text {
	color: #6b7891;
	font-size: 26rpx;
}

/* ---- 信息条：浮在图底 ---- */
.pv-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: flex-end;
	padding: 60rpx 32rpx 34rpx;
	/* 底部兜底值必须写在 env() 之前：Android 内核不认识 env 时整条 calc 作废 */
	padding-bottom: 34rpx;
	padding-bottom: calc(34rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(34rpx + env(safe-area-inset-bottom));
	/* 图上压字，得有底色托一把，否则白图直接看不清 */
	background: linear-gradient(to bottom, rgba(4, 6, 10, 0) 0%, rgba(4, 6, 10, 0.82) 62%);
}

.pv-bar-main {
	flex: 1;
	min-width: 0;
	margin-right: 24rpx;
}

.pv-title {
	display: -webkit-box;
	color: #ffffff;
	font-size: 30rpx;
	font-weight: 600;
	line-height: 1.36;
	overflow: hidden;
	text-overflow: ellipsis;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.pv-meta {
	display: block;
	margin-top: 8rpx;
	color: #8a95a8;
	font-size: 22rpx;
	line-height: 1.4;
}

/* 「上拉」提示：不是按钮，只是把「还能往上」说出来 */
.pv-hint {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 4rpx 8rpx;
}

.pv-hint-arrow {
	color: #38bdf8;
	font-size: 26rpx;
	line-height: 1;
	animation: upHint 1.8s ease-in-out infinite;
}

.pv-hint-text {
	margin-top: 2rpx;
	color: #4f7f9c;
	font-size: 20rpx;
}

@keyframes upHint {
	0%,
	100% {
		transform: translateY(0);
		opacity: 0.6;
	}
	50% {
		transform: translateY(-6rpx);
		opacity: 1;
	}
}

/* ---- 页码 ---- */
.pv-count {
	position: absolute;
	left: 0;
	right: 0;
	top: 24rpx;
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.pv-count-text {
	padding: 6rpx 18rpx;
	border-radius: 999rpx;
	background: rgba(255, 255, 255, 0.1);
	color: #c9d4e6;
	font-size: 21rpx;
	line-height: 1.3;
}

/* ---- 详情抽屉：整屏，内容就是详情页本身 ---- */
.pv-sheet {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	/* 和详情页同一个底色，升到底时看不出接缝 */
	background: #0a0e17;
	transform: translateY(100%);
	will-change: transform;
}

/* scroll-view 要拿到确定高度才滚得动 */
.pv-sheet-body {
	flex: 1;
	height: 0;
	min-height: 0;
	background: #0a0e17;
}

/* ---- 关闭键 / 返回键 ---- */
.pv-close,
.pv-back {
	position: absolute;
	left: auto;
	right: 24rpx;
	width: 64rpx;
	height: 64rpx;
	border-radius: 32rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(255, 255, 255, 0.12);
	border: 1rpx solid rgba(255, 255, 255, 0.18);
	color: #ffffff;
	line-height: 1;
	z-index: 10;
}

.pv-close {
	font-size: 28rpx;
}

.pv-close-hover {
	background: rgba(255, 255, 255, 0.22);
}

/* 退一层：放左上，免得和右上胶囊撞 */
.pv-back {
	left: 24rpx;
	right: auto;
	font-size: 44rpx;
	padding-bottom: 6rpx;
	box-sizing: border-box;
}

.pv-back-hover {
	background: rgba(255, 255, 255, 0.22);
}
</style>
