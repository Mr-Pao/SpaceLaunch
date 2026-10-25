<template>
	<view class="pv" v-if="visible">
		<!-- 图：aspectFit 完整显示，不裁边 —— 看图就要看全。
		     点图区任意位置关闭，和系统看图的习惯一致（信息条内部拦掉，不误触） -->
		<view class="pv-stage" @click="close">
			<image class="pv-img" :src="src" mode="aspectFit" @error="broken = true"></image>
		</view>

		<!-- 信息条：这张图拍的是哪次发射、谁拍的，以及两个出口 -->
		<view class="pv-info" @click.stop>
			<text class="pv-title">{{ title }}</text>
			<text class="pv-meta" v-if="meta">{{ meta }}</text>

			<view class="pv-acts">
				<view class="pv-btn" v-if="launchId" hover-class="pv-btn-hover" @click="goLaunch">
					<text class="pv-btn-text">查看这次发射</text>
					<text class="pv-btn-arrow">›</text>
				</view>
				<view class="pv-btn ghost" v-if="rocketId" hover-class="pv-btn-hover" @click="goRocket">
					<text class="pv-btn-text">看这枚火箭</text>
					<text class="pv-btn-arrow">›</text>
				</view>
			</view>
		</view>

		<!-- 关闭键放右上，与微信胶囊同一水平带，拇指够得到 -->
		<view class="pv-close" :style="{ top: closeTop }" hover-class="pv-close-hover" @click="close">✕</view>
	</view>
</template>

<script>
/**
 * 图片大图弹层（每日一图 / 图库共用）
 *
 * 为什么不用 uni.previewImage：系统看图只能左右滑，图上什么信息都没有 ——
 * 看完一张火箭特写，用户最想知道「这是哪次发射、什么火箭」，系统看图给不了。
 * 自己画一层，图下面挂名字和两个出口（这次发射 / 这枚火箭）。
 *
 * 自定义 tabBar 是独立渲染层，页面里的 fixed 遮罩盖不住它，
 * 所以打开时要主动隐藏、关闭时恢复（见 utils/tabbar.js）。
 */
import { formatDateTime, rocketName } from '@/utils/format.js'
import { fullImageOf } from '@/utils/media.js'
import { setTabBarHidden } from '@/utils/tabbar.js'

export default {
	name: 'photo-view',

	props: {
		visible: { type: Boolean, default: false },
		// gallery 行：{ id, name, net, thumb, credit, cname }
		item: { type: Object, default: null },
		// 型号库 id，父页反查好再传进来；空串则不显示「看这枚火箭」
		rocketId: { type: String, default: '' },
		// 状态栏高度（px），用来给关闭键定位
		statusBarH: { type: Number, default: 20 }
	},

	emits: ['close'],

	data() {
		return {
			// 原图 404 时退回缩略图，至少还能看到图
			broken: false
		}
	},

	computed: {
		src() {
			const it = this.item
			if (!it) return ''
			const thumb = it.thumb || ''
			if (this.broken) return thumb
			// COS 上同 hash 的 _2000 版本；还没补齐到的回退缩略图
			return fullImageOf(thumb) || thumb
		},

		/** LL2 的任务名是「火箭 | 任务」，逗号前那半截重复了下面的火箭行，只留任务名 */
		title() {
			const raw = (this.item && this.item.name) || ''
			const parts = raw.split('|')
			return parts.length > 1 ? parts[1].trim() : raw
		},

		meta() {
			const it = this.item
			if (!it) return ''
			const rocket = rocketName({ name: it.cname })
			const when = formatDateTime(it.net)
			const credit = it.credit ? '@' + it.credit : ''
			return [rocket, when, credit].filter(Boolean).join(' · ')
		},

		launchId() {
			return (this.item && this.item.id) || ''
		},

		closeTop() {
			return Math.max(12, this.statusBarH + 8) + 'px'
		}
	},

	watch: {
		visible(v) {
			// 每次打开都是新图，重置失败标记
			if (v) this.broken = false
			// 弹层盖不住自定义 tabBar，只能主动藏
			setTabBarHidden(v)
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

		goLaunch() {
			const id = this.launchId
			if (!id) return
			const net = (this.item && this.item.net) || ''
			// net 只作提示：详情页拿它跳过逐片翻找，直接定位到归档分片
			const q = net ? '&net=' + encodeURIComponent(net) : ''
			this.close()
			uni.navigateTo({ url: '/pages/launch/launchInfo?id=' + id + q })
		},

		goRocket() {
			if (!this.rocketId) return
			this.close()
			uni.navigateTo({ url: '/pages/rocket/rocket?id=' + this.rocketId })
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
}

.pv-stage {
	flex: 1;
	min-height: 0;
	padding: 90rpx 24rpx 20rpx;
	box-sizing: border-box;
}

.pv-img {
	width: 100%;
	height: 100%;
	display: block;
}

.pv-info {
	padding: 22rpx 32rpx 40rpx;
	/* 底部兜底值必须写在 env() 之前：Android 内核不认识 env 时整条 calc 作废 */
	padding-bottom: 40rpx;
	padding-bottom: calc(40rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.pv-title {
	display: -webkit-box;
	color: #ffffff;
	font-size: 32rpx;
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
	font-size: 23rpx;
	line-height: 1.4;
}

.pv-acts {
	display: flex;
	margin-top: 22rpx;
}

.pv-btn {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 76rpx;
	margin-right: 16rpx;
	border-radius: 38rpx;
	background: rgba(56, 189, 248, 0.16);
	border: 1rpx solid rgba(56, 189, 248, 0.42);
}

.pv-btn:last-child {
	margin-right: 0;
}

.pv-btn-hover {
	opacity: 0.72;
}

/* 次要出口：只有描边，不与「查看这次发射」抢 */
.pv-btn.ghost {
	background: transparent;
	border-color: rgba(255, 255, 255, 0.16);
}

.pv-btn-text {
	color: #38bdf8;
	font-size: 26rpx;
	font-weight: 500;
}

.pv-btn.ghost .pv-btn-text {
	color: #c9d4e6;
}

.pv-btn-arrow {
	margin-left: 6rpx;
	color: #38bdf8;
	font-size: 26rpx;
	line-height: 1;
}

.pv-btn.ghost .pv-btn-arrow {
	color: #c9d4e6;
}

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
}

.pv-close-hover {
	background: rgba(255, 255, 255, 0.22);
}
</style>
