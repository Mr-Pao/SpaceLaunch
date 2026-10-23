<template>
	<view class="cd" :class="'cd-' + size">
		<text class="cd-t" v-if="showLabel">T-</text>

		<view class="cd-group" v-if="!ended">
			<view class="cd-cell" v-for="u in units" :key="u.key">
				<text class="cd-num">{{ u.value }}</text>
				<text class="cd-unit">{{ u.label }}</text>
			</view>
		</view>

		<view class="cd-group" v-else>
			<text class="cd-over">{{ overText }}</text>
		</view>
	</view>
</template>

<script>
/**
 * 发射倒计时
 *
 * 计时器放在组件内部，只让这一个组件每秒重渲染 ——
 * 如果放页面里，每秒都会带着整个列表重新 diff，卡得厉害。
 *
 * onHide / onUnload 一定要清掉，否则页面切走后定时器还在跑。
 */
export default {
	name: 'countdown',

	props: {
		net: { type: String, default: '' },
		size: { type: String, default: 'lg' },
		showLabel: { type: Boolean, default: true }
	},

	data() {
		return {
			now: Date.now(),
			timer: null
		}
	},

	computed: {
		diff() {
			if (!this.net) return 0
			const t = new Date(this.net).getTime()
			if (isNaN(t)) return 0
			return Math.max(0, t - this.now)
		},
		ended() {
			return this.diff <= 0
		},
		overText() {
			// 时间已过就不再倒数了，措辞留余地：可能是推迟，也可能是已经发射
			return '时间已到'
		},
		units() {
			const s = Math.floor(this.diff / 1000)
			const pad = (n) => (n < 10 ? '0' + n : String(n))
			return [
				{ key: 'd', value: pad(Math.floor(s / 86400)), label: '天' },
				{ key: 'h', value: pad(Math.floor((s % 86400) / 3600)), label: '时' },
				{ key: 'm', value: pad(Math.floor((s % 3600) / 60)), label: '分' },
				{ key: 's', value: pad(s % 60), label: '秒' }
			]
		}
	},

	mounted() {
		this.start()
	},
	// 小程序页面里 onHide 不一定触发到子组件，用 Vue 的钩子 + 小程序钩子双保险
	beforeUnmount() {
		this.stop()
	},

	methods: {
		start() {
			this.stop()
			this.now = Date.now()
			if (this.ended) return

			this.timer = setInterval(() => {
				this.now = Date.now()
				// 归零后立刻停表，别让定时器一直空转
				if (this.ended) this.stop()
			}, 1000)
		},
		stop() {
			if (this.timer) {
				clearInterval(this.timer)
				this.timer = null
			}
		}
	}
}
</script>

<style lang="scss" scoped>
.cd {
	display: flex;
	align-items: flex-end;
}

.cd-t {
	color: #38bdf8;
	font-weight: 600;
	margin-right: 12rpx;
}

.cd-group {
	display: flex;
	align-items: flex-end;
}

.cd-cell {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.cd-num {
	color: #ffffff;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	letter-spacing: 1rpx;
}

.cd-unit {
	color: #6b7891;
}

/* 大号：首页卡片 */
.cd-lg .cd-t {
	font-size: 40rpx;
	line-height: 1.1;
}

.cd-lg .cd-cell {
	margin-right: 26rpx;
}

.cd-lg .cd-cell:last-child {
	margin-right: 0;
}

.cd-lg .cd-num {
	font-size: 64rpx;
	line-height: 1.1;
}

.cd-lg .cd-unit {
	margin-top: 4rpx;
	font-size: 22rpx;
}

/* 小号：详情页 */
.cd-sm .cd-t {
	font-size: 28rpx;
}

.cd-sm .cd-cell {
	margin-right: 18rpx;
}

.cd-sm .cd-cell:last-child {
	margin-right: 0;
}

.cd-sm .cd-num {
	font-size: 36rpx;
	line-height: 1.2;
}

.cd-sm .cd-unit {
	margin-top: 2rpx;
	font-size: 18rpx;
}

.cd-over {
	color: #38bdf8;
	font-weight: 600;
}

.cd-lg .cd-over {
	font-size: 44rpx;
}

.cd-sm .cd-over {
	font-size: 30rpx;
}
</style>
