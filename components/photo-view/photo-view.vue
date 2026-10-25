<template>
	<view class="pv" v-if="visible">
		<!-- 图片区：横滑切换。
		     不用 swiper 是因为纵向的上拉手势会被原生组件吞掉，
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

		<!-- 信息条：任务名 + 拍摄方 + 「上拉看详情」。
		     原来这里是两个按钮（查看这次发射 / 看这枚火箭），
		     现在上拉就能看到整条任务详情，按钮就不必再占一块 -->
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

		<!-- 详情面板：上拉或点「上拉看详情」升起，点顶部横条收起 -->
		<view class="pv-sheet" :class="{ open: sheetOpen }" @touchmove.stop>
			<view class="pv-sheet-handle" @click="closeSheet">
				<view class="pv-handle-bar"></view>
			</view>

			<scroll-view class="pv-sheet-body" scroll-y>
				<view class="dt-head">
					<text class="dt-title">{{ dtTitle }}</text>
					<text class="dt-sub" v-if="dtSub">{{ dtSub }}</text>
				</view>

				<view class="dt-rows">
					<view class="dt-row" v-for="r in dtRows" :key="r.k">
						<text class="dt-k">{{ r.k }}</text>
						<text class="dt-v">{{ r.v }}</text>
					</view>
				</view>

				<text class="dt-desc" v-if="dtDesc">{{ dtDesc }}</text>

				<text class="dt-hint" v-if="sheetOpen && !detail && !dtFail">正在读取任务详情...</text>
				<text class="dt-hint" v-if="dtFail">这条发射太早，完整档案还没归档到这里</text>

				<view class="dt-more" v-if="curItem" hover-class="dt-more-hover" @click="goLaunch">
					<text class="dt-more-text">打开完整详情页</text>
					<text class="dt-more-arrow">›</text>
				</view>
			</scroll-view>
		</view>

		<!-- 关闭键放右上，与微信胶囊同一水平带，拇指够得到 -->
		<view class="pv-close" :style="{ top: closeTop }" hover-class="pv-close-hover" @click="close">✕</view>
	</view>
</template>

<script>
/**
 * 图片大图弹层（每日一图 / 图库 / 全量图库共用）
 *
 * 为什么不用 uni.previewImage：系统看图只能左右滑，图上什么信息都没有 ——
 * 看完一张火箭特写，用户最想知道「这是哪次发射、什么火箭」，系统看图给不了。
 *
 * 交互最终定成两条手势：
 *   · 左右滑 —— 在同一个列表里翻图，不必退出再点
 *   · 上拉   —— 升起任务详情面板
 * 原来那两个「查看这次发射 / 看这枚火箭」按钮去掉了：上拉出来的详情里
 * 已经有任务名、火箭、发射场、机构、轨道、载荷，跳完整页留了一行文字链。
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
import spaceData from '@/utils/data.js'
import { findById as findArchiveById } from '@/utils/history.js'

// 判定「是横滑还是上拉」的最小位移，太小会把点击误判成滑动
const DIR_LOCK = 8
// 上拉多少算触发详情面板
const UP_THRESHOLD = 56

export default {
	name: 'photo-view',

	props: {
		visible: { type: Boolean, default: false },
		// 可横滑的整组图（gallery 行：{ id, name, net, thumb, credit, cname }）
		list: { type: Array, default: () => [] },
		// 从哪一张开始
		index: { type: Number, default: 0 },
		// 状态栏高度（px），用来给关闭键定位
		statusBarH: { type: Number, default: 20 }
	},

	emits: ['close'],

	data() {
		return {
			cur: 0,
			winW: 375,
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
			sheetOpen: false,
			detail: null,
			dtFail: false
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

		// ---- 详情面板 ----
		dtTitle() {
			const d = this.detail
			const m = (d && d.mission) || {}
			return m.nameZh || m.name || this.title
		},

		dtSub() {
			const d = this.detail
			if (!d) return ''
			const st = (d.status && (d.status.nameZh || d.status.name)) || ''
			const when = formatDateTime(d.net)
			return [when, st].filter(Boolean).join(' · ')
		},

		dtDesc() {
			const d = this.detail
			const m = (d && d.mission) || {}
			return m.descriptionZh || m.description || ''
		},

		dtRows() {
			const d = this.detail
			const it = this.curItem || {}
			const rows = []

			// 还没读到完整档案时，先用图库记录里现成的字段顶上，面板不留空
			const net = (d && d.net) || it.net
			if (net) rows.push({ k: '发射时间', v: formatDateTime(net) })

			const rk =
				(d && d.rocket && d.rocket.configuration && d.rocket.configuration.name) ||
				it.cname
			if (rk) rows.push({ k: '运载火箭', v: rocketName({ name: rk }) })

			if (d) {
				const loc = d.pad && d.pad.location && d.pad.location.name
				const pad = d.pad && d.pad.name
				const site = [loc, pad].filter(Boolean).join(' · ')
				if (site) rows.push({ k: '发射场', v: site })

				const lsp = d.launch_service_provider && d.launch_service_provider.name
				if (lsp) rows.push({ k: '发射机构', v: lsp })

				const orbit = d.mission && d.mission.orbit && d.mission.orbit.name
				if (orbit) rows.push({ k: '目标轨道', v: orbit })

				const pay = (d.mission && (d.mission.nameZh || d.mission.name)) || ''
				if (pay) rows.push({ k: '载荷', v: pay })
			}

			const credit = (d && d.imageCredit) || it.credit
			if (credit) rows.push({ k: '图片来源', v: credit })

			return rows
		}
	},

	watch: {
		visible(v) {
			if (v) {
				this.cur = Math.max(0, Math.min(this.index, this.list.length - 1))
				this.dx = 0
				this.dragging = false
				this.dir = ''
				this.broken = {}
				this.sheetOpen = false
				this.detail = null
				this.dtFail = false
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
		} catch (e) {
			// 取不到就用 375，绝大多数机型在这个值附近
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

			if (this.dir === 'v') {
				// 纵向只记位移，松手时才判要不要升面板
				this.dy = my
				this.moved = true
				return
			}

			this.moved = true

			// 首尾越界给阻尼：手指还在动，但图几乎不动，一眼就知道到头了
			let x = mx
			if ((this.cur === 0 && mx > 0) || (this.cur >= this.list.length - 1 && mx < 0)) {
				x = mx * 0.28
			}
			this.dx = x
		},

		onTouchEnd() {
			const dx = this.dx
			const dy = this.dy
			const dir = this.dir
			const moved = this.moved

			this.dragging = false
			this.dir = ''
			if (moved) this.moveEndAt = Date.now()

			if (dir === 'v') {
				// 上拉开详情：只看纵向位移够不够，横滑的 dx 不参与
				if (moved && dy <= -UP_THRESHOLD && !this.sheetOpen) this.openSheet()
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
				this.detail = null
				this.dtFail = false
				if (this.sheetOpen) this.loadDetail()
			} else {
				this.dx = 0
			}
		},

		onStageTap() {
			// 拖动结束后系统可能补一个 click，滑完一张就把弹层关了 —— 挡掉
			if (this.moveEndAt && Date.now() - this.moveEndAt < 400) return
			// 面板开着时点图区先收面板，符合「先退一层」的直觉
			if (this.sheetOpen) {
				this.closeSheet()
				return
			}
			this.close()
		},

		// ---- 详情面板 ----
		openSheet() {
			if (!this.curItem) return
			this.sheetOpen = true
			if (!this.detail && !this.dtFail) this.loadDetail()
		},

		closeSheet() {
			this.sheetOpen = false
		},

		/**
		 * 补齐任务详情
		 *
		 * 图库记录里只有任务名 / 时间 / 型号名 / 署名，场地、机构、轨道、
		 * 载荷这些都在完整档案里。先查快照（最近 100 条，命中率最高），
		 * 再按 net 直接定位历史归档分片 —— 不传 net 会从最新一片逐片翻，
		 * 老任务可能白下十几片。
		 */
		async loadDetail() {
			const it = this.curItem
			if (!it || it.id == null) {
				this.dtFail = true
				return
			}

			const id = String(it.id)
			let d = null

			try {
				d = await spaceData.findLaunchById(id)
			} catch (e) {
				d = null
			}

			if (!d) {
				try {
					d = await findArchiveById(id, it.net)
				} catch (e) {
					d = null
				}
			}

			// 等待期间可能已经滑到别的图了，别把上一张的档案贴过来
			if (!this.curItem || String(this.curItem.id) !== id) return

			this.detail = d || null
			this.dtFail = !d
		},

		goLaunch() {
			const it = this.curItem
			if (!it || !it.id) return
			const net = it.net || ''
			// net 只作提示：详情页拿它跳过逐片翻找，直接定位到归档分片
			const q = net ? '&net=' + encodeURIComponent(net) : ''
			this.close()
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + it.id + q })
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

/* ---- 详情面板 ---- */
.pv-sheet {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	height: 74vh;
	display: flex;
	flex-direction: column;
	border-radius: 28rpx 28rpx 0 0;
	background: #0e1420;
	border-top: 1rpx solid #1d2a3c;
	transform: translateY(102%);
	transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1);
	z-index: 5;
}

.pv-sheet.open {
	transform: translateY(0);
}

.pv-sheet-handle {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 52rpx;
	flex-shrink: 0;
}

.pv-handle-bar {
	width: 76rpx;
	height: 8rpx;
	border-radius: 4rpx;
	background: #2b3a4f;
}

.pv-sheet-body {
	flex: 1;
	min-height: 0;
	padding: 0 36rpx;
	box-sizing: border-box;
	/* 底部兜底值见 .pv-bar 的说明 */
	padding-bottom: 40rpx;
	padding-bottom: calc(40rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.dt-head {
	padding-bottom: 22rpx;
	border-bottom: 1rpx solid #182233;
}

.dt-title {
	display: block;
	color: #ffffff;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 1.4;
}

.dt-sub {
	display: block;
	margin-top: 8rpx;
	color: #6b7891;
	font-size: 22rpx;
}

.dt-rows {
	padding: 18rpx 0 6rpx;
}

.dt-row {
	display: flex;
	align-items: flex-start;
	padding: 10rpx 0;
}

.dt-k {
	flex-shrink: 0;
	width: 140rpx;
	color: #55637a;
	font-size: 23rpx;
	line-height: 1.5;
}

.dt-v {
	flex: 1;
	color: #c9d4e6;
	font-size: 24rpx;
	line-height: 1.5;
}

.dt-desc {
	display: block;
	margin-top: 12rpx;
	padding-top: 20rpx;
	border-top: 1rpx solid #182233;
	color: #8b95a8;
	font-size: 23rpx;
	line-height: 1.7;
}

.dt-hint {
	display: block;
	margin-top: 16rpx;
	color: #4d5a6e;
	font-size: 21rpx;
	line-height: 1.6;
}

.dt-more {
	display: flex;
	align-items: center;
	justify-content: center;
	margin-top: 28rpx;
	padding: 18rpx 0;
}

.dt-more-hover {
	opacity: 0.6;
}

.dt-more-text {
	color: #38bdf8;
	font-size: 24rpx;
}

.dt-more-arrow {
	margin-left: 6rpx;
	color: #38bdf8;
	font-size: 26rpx;
	line-height: 1;
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
