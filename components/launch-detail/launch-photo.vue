<template>
	<!-- 看图器：钉在屏幕顶、恒占满整屏，左右滑换同组图。
	     底部「查看发射详情」按钮只 emit more，跳转由父组件做（它才持有 curId/curNet） -->
		<view
			class="stage"
			v-if="photoOn"
			:style="stageStyle"
			@touchstart="onTouchStart"
			@touchmove="onTouchMove"
			@touchend="onTouchEnd"
			@touchcancel="onTouchEnd"
		>
			<view
				class="stage-cell"
				v-for="i in cells"
				:key="i"
				:style="cellStyle(i)"
			>
				<!-- 两层同一张图：fit 完整显示、fill 满宽裁切，随进度交叉 -->
				<image
					class="stage-img"
					:src="srcOf(i)"
					mode="aspectFit"
					:style="{ opacity: 1 - fillOpacity }"
					@error="markBroken(i)"
				></image>
				<image
					class="stage-img stage-img-fill"
					:src="srcOf(i)"
					mode="aspectFill"
					:style="{ opacity: fillOpacity }"
					@error="markBroken(i)"
				></image>
			</view>

			<!-- 图上信息 + 底部「查看发射详情」：替代原来的上拉提示，点一下跳到本条发射详情 -->
			<view class="stage-bar" :style="{ opacity: barOpacity }">
				<view class="stage-bar-main">
					<text class="stage-title">{{ photoTitle }}</text>
					<text class="stage-meta" v-if="photoMeta">{{ photoMeta }}</text>
				</view>
				<view class="stage-foot">
					<text class="stage-count" v-if="album.length > 1">{{ cur + 1 }} / {{ album.length }}</text>
					<view class="more-btn" hover-class="more-btn-hover" @click.stop="$emit('more')">
						<text class="more-btn-text">查看发射详情</text>
						<text class="more-btn-arrow">›</text>
					</view>
				</view>
			</view>
		</view>
</template>

<script>
import { formatDateTime, rocketName as rocketNameOf } from '@/utils/format.js'
import { fullImageOf } from '@/utils/media.js'

// 判定「横滑还是纵向滚动」的最小位移，太小会把点击误判成滑动
const DIR_LOCK = 8

export default {
	name: 'launch-photo',

	/**
	 * 关于 cur：当前下标由父组件持有（它要跟着换 curId / curNet 触发重新加载），
	 * 这里只负责手势与渲染，滑到新的一张时 emit switch(下标) 回传。
	 */
	props: {
		photoOn: { type: Boolean, default: false },
		album: { type: Array, default: () => [] },
		cur: { type: Number, default: 0 },
		curItem: { type: Object, default: null },
		winW: { type: Number, default: 375 },
		winH: { type: Number, default: 667 }
	},

	emits: ['switch', 'more'],

	data() {
		return {
			// 原图 404 的下标：退回缩略图，至少还有图看
			broken: {},
			// 横向跟手位移
			dx: 0,
			dragging: false,
			dir: '',
			startX: 0,
			startY: 0,
			moved: false
		}
	},

	computed: {
		// 只渲染相邻三张：多了浪费，少了横滑会露白
		cells() {
			const n = this.album.length
			const out = []
			for (let i = this.cur - 1; i <= this.cur + 1; i++) {
				if (i >= 0 && i < n) out.push(i)
			}
			return out
		},
		// 图片优先态改「底部按钮跳详情」后，图片层恒占满整屏、不再随滚动收缩。
		// 高度用 top/bottom 撑，不写死 windowHeight —— 后者不含部分机型的安全区，
		// 算出来的像素比真实可视高度差一截，底部那条缝一滑就露出下层详情
		stageStyle() {
			return 'top:0;bottom:0'
		},
		// 看图器恒满屏、不随滚动收缩：完整显示层恒显示、裁切层恒隐藏
		fillOpacity() {
			return 0
		},
		// 图上信息常驻显示（恒满屏，无需随滚动退场）
		barOpacity() {
			return 1
		},
		photoTitle() {
			const raw = (this.curItem && this.curItem.name) || ''
			const parts = raw.split('|')
			return parts.length > 1 ? parts[1].trim() : raw
		},
		photoMeta() {
			const it = this.curItem
			if (!it) return ''
			const rocket = rocketNameOf({ name: it.cname })
			const when = formatDateTime(it.net)
			const credit = it.credit ? '@' + it.credit : ''
			return [rocket, when, credit].filter(Boolean).join(' · ')
		},
	},

	methods: {
		// 原图取 COS 上的 _2000 版本，还没补齐的退回缩略图
		srcOf(i) {
			const it = this.album[i]
			if (!it) return ''
			const thumb = it.thumb || ''
			if (this.broken[i]) return thumb
			return fullImageOf(thumb) || thumb
		},
		markBroken(i) {
			if (this.broken[i]) return
			this.broken = Object.assign({}, this.broken, { [i]: true })
		},
		cellStyle(i) {
			const x = (i - this.cur) * this.winW + this.dx
			const tr = this.dragging ? 'none' : 'transform .26s cubic-bezier(.2,.8,.3,1)'
			return `width:${this.winW}px;transform:translateX(${x}px);transition:${tr}`
		},
		onTouchStart(e) {
			// 看图态下才接横滑换图（看图器恒满屏、不随滚动收缩，无需判断收缩进度）
			if (!this.photoOn) return
			const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
			if (!t) return
			this.startX = t.clientX
			this.startY = t.clientY
			this.dx = 0
			this.dir = ''
			this.moved = false
			this.dragging = true
		},
		onTouchMove(e) {
			if (!this.dragging) return
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
			// 纵向交给页面滚动（页面滚动是原生的，这里不拦）
			if (this.dir !== 'h') return

			this.moved = true
			// 首尾越界给阻尼：手指还在动，图几乎不动，一眼就知道到头了
			let x = mx
			if ((this.cur <= 0 && mx > 0) || (this.cur >= this.album.length - 1 && mx < 0)) {
				x = mx * 0.28
			}
			this.dx = x
		},
		onTouchEnd() {
			if (!this.dragging) return
			const dx = this.dx
			const moved = this.moved

			this.dragging = false
		this.dir = ''

		this.dx = 0
			if (!moved) return

			const limit = this.winW * 0.2
			let target = this.cur
			if (dx <= -limit && this.cur < this.album.length - 1) target = this.cur + 1
			else if (dx >= limit && this.cur > 0) target = this.cur - 1
			if (target === this.cur) return

			// cur 在父组件里：dx 已经归零，emit 后父组件同步改 cur，
			// 两个值在同一帧渲染 —— 新图位移正好接住手指松开的位置
			this.$emit('switch', target)
		}
	}
}
</script>

<style lang="scss" scoped>
/* 图片层：钉在屏幕顶，恒占满整屏（不再随滚动收缩） */
.stage {
	position: fixed;
	left: 0;
	right: 0;
	top: 0;
	overflow: hidden;
	z-index: 20;
	/* 必须不透明：aspectFit 的上下黑边一旦透光，
	     会露出下面正在往上顶的详情内容 */
	background: #04060a;
}

.stage-cell {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	height: auto;
	will-change: transform;
}

.stage-img {
	width: 100%;
	height: 100%;
	display: block;
}

/* 满宽裁切那一层：叠在完整显示那一层上，随进度交叉 */
.stage-img-fill {
	position: absolute;
	left: 0;
	top: 0;
}

/* 图上信息：压在底部，标题在左、查看详情按钮在右 */
.stage-bar {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	padding: 40rpx 44rpx 56rpx;
	padding-bottom: calc(56rpx + env(safe-area-inset-bottom));
	background: linear-gradient(180deg, rgba(4, 6, 10, 0) 0%, rgba(4, 6, 10, 0.82) 100%);
}

.stage-bar-main {
	flex: 1;
	min-width: 0;
	padding-right: 20rpx;
}

.stage-title {
	display: block;
	color: #eef3fa;
	font-size: 32rpx;
	font-weight: 600;
	line-height: 1.35;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.stage-meta {
	display: block;
	margin-top: 8rpx;
	color: rgba(214, 226, 240, 0.72);
	font-size: 23rpx;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* 右侧：计数 + 查看发射详情按钮 */
.stage-foot {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	flex-shrink: 0;
	margin-left: 26rpx;
}

.stage-count {
	color: rgba(255, 255, 255, 0.62);
	font-size: 21rpx;
	margin-bottom: 12rpx;
}

.more-btn {
	display: flex;
	align-items: center;
	padding: 14rpx 30rpx;
	border-radius: 999rpx;
	background: rgba(56, 189, 248, 0.16);
	border: 1rpx solid rgba(56, 189, 248, 0.45);
}

.more-btn-hover {
	background: rgba(56, 189, 248, 0.32);
}

.more-btn-text {
	color: #7dd3fc;
	font-size: 25rpx;
	font-weight: 600;
}

.more-btn-arrow {
	margin-left: 8rpx;
	color: #7dd3fc;
	font-size: 30rpx;
	line-height: 1;
}
</style>
