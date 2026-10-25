<template>
	<view class="pv" v-if="visible">
		<!-- 图片区：横滑切换。
		     不用 swiper 是因为纵向的手势会被原生组件吞掉，
		     自绘 transform 才能同时拿到横纵两组位移。 -->
		<view
			class="pv-stage"
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
				<image
					class="pv-img"
					:src="srcOf(list[i], i)"
					mode="aspectFit"
					@error="markBroken(i)"
				></image>
			</view>

			<view class="pv-empty" v-if="!curItem">
				<text class="pv-empty-text">图片加载失败</text>
			</view>
		</view>

		<!-- 信息条：任务名 + 拍摄方 + 「上拉看详情」 -->
		<view class="pv-bar">
			<view class="pv-bar-main">
				<text class="pv-title">{{ title }}</text>
				<text class="pv-meta" v-if="meta">{{ meta }}</text>
			</view>
			<view class="pv-up" @click="openSheet">
				<text class="pv-up-arrow">︿</text>
				<text class="pv-up-text">上拉看详情</text>
			</view>
		</view>

		<!-- 页码：多张才显示，单张（每日一图）不打扰 -->
		<view class="pv-count" v-if="list.length > 1">
			<text class="pv-count-text">{{ cur + 1 }} / {{ list.length }}</text>
		</view>

		<!-- 详情抽屉：整屏升起，里面就是 pages/launch/launchInfo 用的那个组件本身，
		     不是另画一版摘要。手指往上推它就跟手上移，松手过阈值再补完剩下的行程 -->
		<view class="pv-sheet" :style="sheetStyle">
			<view
				class="pv-sheet-top"
				:style="{ paddingTop: statusBarH + 'px' }"
				@touchstart.stop="onSheetStart"
				@touchmove.stop.prevent="onSheetMove"
				@touchend.stop="onSheetEnd"
				@touchcancel.stop="onSheetEnd"
			>
				<view class="pv-sheet-back" @click="closeSheet">‹</view>
				<view class="pv-handle-bar"></view>
				<text class="pv-sheet-cap">发射任务</text>
			</view>

			<!-- scroll-view 必须拿到确定高度才滚得动：flex:1 + height:0 是万能写法 -->
			<scroll-view class="pv-sheet-body" scroll-y>
				<launch-detail v-if="sheetOn" :id="sheetId" :net="sheetNet" :sheet="true" />
			</scroll-view>
		</view>

		<!-- 关闭键放右上，与微信胶囊同一水平带，拇指够得到。
		     抽屉展开后它会盖在详情页首图上，所以抽屉一开就隐起来，
		     那一步的「退」交给抽屉顶部的 ‹ 和下拉手势 -->
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
 *   · 上拉   —— 把整条发射详情从底下升起来
 *
 * 上拉拉起的是 components/launch-detail 本身，和点列表进 pages/launch/launchInfo
 * 看到的是同一份内容，不是另画一版摘要 —— 所以滑到顶继续翻，就是那个页面。
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
// 手指推满多少屏高算「抽屉完全拉开」：留一点阻尼感，不用真拉一整屏
const SHEET_TRAVEL = 0.55
// 松手时超过这个进度就补完剩下的行程
const SHEET_COMMIT = 0.3

export default {
	name: 'photo-view',

	props: {
		visible: { type: Boolean, default: false },
		// 可横滑的整组图（gallery 行：{ id, name, net, thumb, credit, cname }）
		list: { type: Array, default: () => [] },
		// 从哪一张开始
		index: { type: Number, default: 0 },
		// 状态栏高度（px），用来给关闭键与抽屉顶条定位
		statusBarH: { type: Number, default: 20 }
	},

	emits: ['close'],

	data() {
		return {
			cur: 0,
			winW: 375,
			winH: 667,
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
			// 抽屉行程 0（收起）→ 1（全开）。跟手时直接写它
			sheetP: 0,
			// 跟手期间关掉过渡，否则每一帧都会被 CSS 追一次，手感和果冻一样
			sheetFollow: false,
			// 抽屉里的详情组件只在真正拉开过之后才挂载：
			// 否则每滑一张图都会触发一次详情加载
			sheetOn: false,
			// 抽屉顶条上的下拉手势
			sStartY: 0
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

		// 抽屉开没开：只要露出一截就算开，✕ 就该让位
		sheetOpen() {
			return this.sheetP > 0.02
		},

		sheetStyle() {
			const p = Math.max(0, Math.min(1, this.sheetP || 0))
			const y = (1 - p) * 100
			const tr = this.sheetFollow
				? 'none'
				: 'transform .3s cubic-bezier(.2,.8,.3,1)'
			return `transform:translateY(${y}%);transition:${tr}`
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
		} catch (e) {
			// 取不到就用 375×667，绝大多数机型在这个值附近
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

		// ---- 图片区手势 ----
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
				// 抽屉已经全开时再往上推没意义，也不再跟手
				if (!this.sheetOn) {
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
				if (!this.sheetOn && this.sheetP > SHEET_COMMIT) this.openSheet()
				else if (!this.sheetOn) this.sheetP = 0
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
			// 抽屉露出一截时点图区先收抽屉，符合「先退一层」的直觉
			if (this.sheetOpen) {
				this.closeSheet()
				return
			}
			this.close()
		},

		// ---- 详情抽屉 ----
		openSheet() {
			if (!this.curItem) return
			this.sheetOn = true
			this.sheetFollow = false
			this.sheetP = 1
		},

		closeSheet() {
			this.sheetFollow = false
			this.sheetP = 0
			// 等收起动画走完再卸载，否则内容会先消失、抽屉空着往上缩
			const at = this.sheetP
			setTimeout(() => {
				if (this.sheetP === at) this.sheetOn = false
			}, 320)
		},

		// 抽屉顶条：下拉收起。滚动交给下面的 scroll-view，
		// 手势只挂在这根条上，才不会和列表滚动抢
		onSheetStart(e) {
			const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
			if (!t) return
			this.sStartY = t.clientY
			this.sheetFollow = true
		},

		onSheetMove(e) {
			const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
			if (!t) return
			const dy = t.clientY - this.sStartY
			const travel = this.winH * 0.4
			this.sheetP = Math.max(0, Math.min(1, 1 - dy / travel))
		},

		onSheetEnd() {
			this.sheetFollow = false
			if (this.sheetP < 0.65) this.closeSheet()
			else this.sheetP = 1
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
	display: flex;
	flex-direction: column;
	/* 几乎全黑：看图时周围越暗越好，留一点透明度还能看出是浮层 */
	background: rgba(4, 6, 10, 0.97);
	overflow: hidden;
}

/* ---- 图片区：三个 cell 绝对定位叠在同一块区域 ---- */
.pv-stage {
	position: relative;
	flex: 1;
	min-height: 0;
	/* 顶部留给关闭键，左右不留白 —— 看图就该尽量大 */
	padding-top: 88rpx;
	box-sizing: border-box;
	overflow: hidden;
}

.pv-cell {
	position: absolute;
	top: 88rpx;
	bottom: 0;
	height: auto;
	will-change: transform;
}

.pv-img {
	width: 100%;
	height: 100%;
	display: block;
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

/* ---- 信息条 ---- */
.pv-bar {
	display: flex;
	align-items: flex-end;
	padding: 20rpx 32rpx 34rpx;
	/* 底部兜底值必须写在 env() 之前：Android 内核不认识 env 时整条 calc 作废 */
	padding-bottom: 34rpx;
	padding-bottom: calc(34rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(34rpx + env(safe-area-inset-bottom));
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
	color: #6b7891;
	font-size: 22rpx;
	line-height: 1.4;
}

/* 「上拉看详情」：不是按钮，只是把「还能往上」这件事说出来 */
.pv-up {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 4rpx 8rpx;
}

.pv-up-arrow {
	color: #38bdf8;
	font-size: 26rpx;
	line-height: 1;
	animation: upHint 1.8s ease-in-out infinite;
}

.pv-up-text {
	margin-top: 4rpx;
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

/* ---- 详情抽屉 ---- */
.pv-sheet {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	/* 和详情页同一个底色，抽屉升到底时看不出接缝 */
	background: #0a0e17;
	/* 位移与过渡都走 inline style（sheetStyle），跟手时要临时关掉过渡 */
	transform: translateY(100%);
	will-change: transform;
}

/* 顶条：‹ 收起 + 拖动条 + 「发射任务」。
   手势只挂这一条，下面 scroll-view 该滚就滚，互不打扰 */
.pv-sheet-top {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	flex-shrink: 0;
	height: 88rpx;
	padding-bottom: 10rpx;
	box-sizing: content-box;
	background: #0e1420;
	border-bottom: 1rpx solid #16203020;
}

.pv-handle-bar {
	width: 76rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background: #2b3a4f;
}

.pv-sheet-cap {
	margin-top: 8rpx;
	color: #55637a;
	font-size: 20rpx;
	line-height: 1.2;
}

.pv-sheet-back {
	position: absolute;
	left: 16rpx;
	bottom: 14rpx;
	width: 56rpx;
	height: 56rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	color: #c9d4e6;
	font-size: 40rpx;
	line-height: 1;
}

/* scroll-view 要拿到确定高度才滚得动：flex:1 + height:0 是万能写法 */
.pv-sheet-body {
	flex: 1;
	height: 0;
	min-height: 0;
	background: #0a0e17;
}

/* ---- 关闭键 ---- */
.pv-close {
	position: absolute;
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
	font-size: 28rpx;
	line-height: 1;
	z-index: 10;
}

.pv-close-hover {
	background: rgba(255, 255, 255, 0.22);
}
</style>
